import uuid
from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from pydantic import BaseModel, EmailStr
from sqlalchemy import func
from sqlalchemy.orm import Session

from backend.db import database
from backend.routes.companies import (
    CompanyBatchOutput,
    fetch_companies_with_liked,
)
from backend.services.email_service import email_service

router = APIRouter(
    prefix="/collections",
    tags=["collections"],
)


class CompanyCollectionMetadata(BaseModel):
    id: uuid.UUID
    collection_name: str


class CompanyCollectionOutput(CompanyBatchOutput, CompanyCollectionMetadata):
    pass


class AddCompaniesRequest(BaseModel):
    company_ids: List[int]


class AddCompaniesBulkRequest(BaseModel):
    company_ids: List[int]
    email: Optional[EmailStr] = None


class JobStatusResponse(BaseModel):
    job_id: uuid.UUID
    status: str
    progress: int
    current: int
    total: int


class AddCompaniesResponse(BaseModel):
    message: str
    companies_added: int


class AddCompaniesBulkResponse(BaseModel):
    job_id: uuid.UUID
    status: str
    message: str


@router.get("", response_model=list[CompanyCollectionMetadata])
def get_all_collection_metadata(
    db: Session = Depends(database.get_db),
):
    collections = db.query(database.CompanyCollection).all()

    return [
        CompanyCollectionMetadata(
            id=collection.id,
            collection_name=collection.collection_name,
        )
        for collection in collections
    ]


@router.get("/{collection_id}", response_model=CompanyCollectionOutput)
def get_company_collection_by_id(
    collection_id: uuid.UUID,
    offset: int = Query(
        0, description="The number of items to skip from the beginning"
    ),
    limit: int = Query(10, description="The number of items to fetch"),
    db: Session = Depends(database.get_db),
):
    query = (
        db.query(database.CompanyCollectionAssociation, database.Company)
        .join(database.Company)
        .filter(database.CompanyCollectionAssociation.collection_id == collection_id)
    )

    total_count = query.with_entities(func.count()).scalar()

    results = query.offset(offset).limit(limit).all()
    companies = fetch_companies_with_liked(db, [company.id for _, company in results])

    return CompanyCollectionOutput(
        id=collection_id,
        collection_name=db.query(database.CompanyCollection)
        .get(collection_id)
        .collection_name,
        companies=companies,
        total=total_count,
    )


@router.post("/{collection_id}/companies", response_model=AddCompaniesResponse)
def add_companies_to_collection(
    collection_id: uuid.UUID,
    request: AddCompaniesRequest,
    db: Session = Depends(database.get_db),
):
    """Add individual companies to a collection (immediate processing)"""
    # Verify collection exists
    collection = db.query(database.CompanyCollection).get(collection_id)
    if not collection:
        raise HTTPException(status_code=404, detail="Collection not found")
    
    companies_added = 0
    errors = []
    
    for company_id in request.company_ids:
        try:
            # Check if company exists
            company = db.query(database.Company).get(company_id)
            if not company:
                errors.append(f"Company {company_id} not found")
                continue
            
            # Check if association already exists
            existing = db.query(database.CompanyCollectionAssociation).filter(
                database.CompanyCollectionAssociation.company_id == company_id,
                database.CompanyCollectionAssociation.collection_id == collection_id
            ).first()
            
            if existing:
                continue  # Skip if already exists
            
            # Create association (this will trigger the 100ms throttle)
            association = database.CompanyCollectionAssociation(
                company_id=company_id,
                collection_id=collection_id
            )
            db.add(association)
            db.commit()
            companies_added += 1
            
        except Exception as e:
            errors.append(f"Failed to add company {company_id}: {str(e)}")
    
    return AddCompaniesResponse(
        message=f"Added {companies_added} companies. Errors: {len(errors)}",
        companies_added=companies_added
    )


@router.post("/{collection_id}/companies/bulk", response_model=AddCompaniesBulkResponse)
def add_companies_bulk_to_collection(
    collection_id: uuid.UUID,
    request: AddCompaniesBulkRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(database.get_db),
):
    """Add companies to a collection in bulk (background processing)"""
    # Verify collection exists
    collection = db.query(database.CompanyCollection).get(collection_id)
    if not collection:
        raise HTTPException(status_code=404, detail="Collection not found")
    
    # Create job
    job_id = uuid.uuid4()
    job = database.Job(
        id=job_id,
        status="running",
        progress=0,
        total=len(request.company_ids),
        current=0,
        email=request.email
    )
    db.add(job)
    db.commit()
    
    # Start background task
    background_tasks.add_task(
        process_bulk_operation,
        job_id, request.company_ids, collection_id, request.email
    )
    
    return AddCompaniesBulkResponse(
        job_id=job_id,
        status="running",
        message="Bulk operation started"
    )


@router.get("/jobs/{job_id}/status", response_model=JobStatusResponse)
def get_job_status(
    job_id: uuid.UUID,
    db: Session = Depends(database.get_db),
):
    """Get the status of a background job"""
    job = db.query(database.Job).get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    
    return JobStatusResponse(
        job_id=job.id,
        status=job.status,
        progress=job.progress,
        current=job.current,
        total=job.total
    )


def process_bulk_operation(job_id: uuid.UUID, company_ids: List[int], collection_id: uuid.UUID, email: Optional[str] = None):
    """Background task to process bulk company addition with throttle respect"""
    db = database.SessionLocal()
    
    try:
        total = len(company_ids)
        companies_added = 0
        
        for i, company_id in enumerate(company_ids):
            # Check if company exists
            company = db.query(database.Company).get(company_id)
            if not company:
                continue
            
            # Check if association already exists
            existing = db.query(database.CompanyCollectionAssociation).filter(
                database.CompanyCollectionAssociation.company_id == company_id,
                database.CompanyCollectionAssociation.collection_id == collection_id
            ).first()
            
            if existing:
                continue  # Skip if already exists
            
            # Create association (this will trigger the 100ms throttle automatically)
            association = database.CompanyCollectionAssociation(
                company_id=company_id,
                collection_id=collection_id
            )
            db.add(association)
            db.commit()
            companies_added += 1
            
            # Update progress every 100 companies or at the end
            if (i + 1) % 100 == 0 or (i + 1) == total:
                progress = int(((i + 1) / total) * 100)
                
                job = db.query(database.Job).get(job_id)
                job.current = i + 1
                job.progress = progress
                db.commit()
        
        # Mark job as completed
        job = db.query(database.Job).get(job_id)
        job.status = "completed"
        job.progress = 100
        db.commit()
        
        # Send email notification if provided
        if email:
            # Get collection name for email
            collection = db.query(database.CompanyCollection).get(collection_id)
            collection_name = collection.collection_name if collection else None
            
            email_service.send_completion_email(
                to_email=email,
                job_id=str(job_id),
                collection_id=str(collection_id),
                companies_added=companies_added,
                collection_name=collection_name
            )
            
    except Exception as e:
        # Mark job as failed
        job = db.query(database.Job).get(job_id)
        job.status = "failed"
        db.commit()
        raise
    finally:
        db.close()
