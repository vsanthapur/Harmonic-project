import uuid
import time
from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from pydantic import BaseModel, EmailStr
from sqlalchemy import func, text
from sqlalchemy.orm import Session

from backend.db import database
from backend.routes.companies import (
    CompanyBatchOutput,
    fetch_companies_with_liked,
)

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
    source_collection_id: Optional[uuid.UUID] = None
    limit_n: Optional[int] = None


class JobStatusResponse(BaseModel):
    job_id: uuid.UUID
    status: str
    progress: int
    current: int
    total: int
    added: Optional[int] = None
    skipped_duplicates: Optional[int] = None


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
    
    # Determine total quickly without fetching all IDs on client
    if request.company_ids:
        total_count = len(request.company_ids)
    elif request.source_collection_id:
        # count companies in the source collection
        total_q = (
            db.query(database.CompanyCollectionAssociation)
            .filter(database.CompanyCollectionAssociation.collection_id == request.source_collection_id)
        )
        total_in_src = total_q.count()
        total_count = min(total_in_src, request.limit_n) if request.limit_n else total_in_src
    else:
        total_count = 0

    # Create job
    job_id = uuid.uuid4()
    job = database.Job(
        id=job_id,
        status="running",
        progress=0,
        total=total_count,
        current=0,
        email=request.email
    )
    db.add(job)
    db.commit()
    
    # Log job start
    try:
        print(f"Job {job_id} started: total={len(request.company_ids)} to collection {collection_id}", flush=True)
    except Exception:
        pass

    # Start background task
    background_tasks.add_task(
        process_bulk_operation,
        job_id,
        request.company_ids,
        collection_id,
        request.email,
        request.source_collection_id,
        request.limit_n,
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
    
    # Derive added and skipped for UI without schema changes
    added = job.current or 0
    total = job.total or 0
    skipped = max(total - added, 0)
    return JobStatusResponse(
        job_id=job.id,
        status=job.status,
        progress=job.progress,
        current=job.current,
        total=job.total,
        added=added,
        skipped_duplicates=skipped
    )


class ActiveJobItem(BaseModel):
    job_id: uuid.UUID
    status: str
    progress: int
    current: int
    total: int


@router.get("/jobs/active", response_model=list[ActiveJobItem])
def list_active_jobs(db: Session = Depends(database.get_db)):
    jobs = (
        db.query(database.Job)
        .filter(database.Job.status.in_(["running"]))
        .order_by(database.Job.id)
    )
    items: list[ActiveJobItem] = []
    for job in jobs:
        items.append(
            ActiveJobItem(
                job_id=job.id,
                status=job.status,
                progress=job.progress,
                current=job.current,
                total=job.total,
            )
        )
    return items


def process_bulk_operation(job_id: uuid.UUID, company_ids: List[int], collection_id: uuid.UUID, email: Optional[str] = None, source_collection_id: Optional[uuid.UUID] = None, limit_n: Optional[int] = None):
    """Background task to process bulk company addition with throttle respect"""
    db = database.SessionLocal()
    
    try:
        # If client didn't send IDs, build them server-side for faster init
        if not company_ids and source_collection_id:
            query = (
                db.query(database.CompanyCollectionAssociation.company_id)
                .filter(database.CompanyCollectionAssociation.collection_id == source_collection_id)
            )
            if limit_n:
                query = query.limit(limit_n)
            company_ids = [row[0] for row in query.all()]

        total = len(company_ids)
        # Log entry
        try:
            print(f"Job {job_id}: processing started (total={total})", flush=True)
        except Exception:
            pass
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
            
            # Add explicit 100ms sleep to ensure throttle compliance
            time.sleep(0.1)
            
            # Log progress every 100 companies (and once at first add)
            if companies_added == 1 or companies_added % 100 == 0:
                try:
                    print(f"Job {job_id}: Added {companies_added} companies so far...", flush=True)
                except Exception:
                    pass

            # Update progress every 10 companies
            if (i + 1) % 10 == 0 or (i + 1) == total:
                progress = int((companies_added / total) * 100) if total > 0 else 100
                job = db.query(database.Job).get(job_id)
                job.current = companies_added
                job.progress = progress
                db.commit()
        
        # Mark job as completed
        job = db.query(database.Job).get(job_id)
        job.status = "completed"
        job.progress = 100
        db.commit()
        try:
            print(f"Job {job_id} completed successfully: total_added={companies_added}", flush=True)
        except Exception:
            pass
        
        # Mock email notification
        if email:
            collection = db.query(database.CompanyCollection).get(collection_id)
            collection_name = collection.collection_name if collection else str(collection_id)
            print(
                f"[EmailMock] To: {email} | Job: {job_id} | Collection: {collection_name} | Added: {companies_added}",
                flush=True,
            )
            
    except Exception as e:
        # Mark job as failed
        job = db.query(database.Job).get(job_id)
        job.status = "failed"
        db.commit()
        raise
    finally:
        db.close()


@router.post("/reset-db")
def reset_database():
    """Reset database to original state (for testing)"""
    try:
        db = database.SessionLocal()
        
        # Clear associations and jobs
        db.execute(text("TRUNCATE TABLE company_collection_associations CASCADE;"))
        db.execute(text("TRUNCATE TABLE jobs CASCADE;"))
        
        # Delete the "Linked Company List" that shouldn't exist
        db.execute(text("DELETE FROM company_collections WHERE collection_name = 'Linked Company List';"))
        db.commit()
        
        # Get the collections
        my_list = db.query(database.CompanyCollection).filter(
            database.CompanyCollection.collection_name == "My List"
        ).first()
        
        companies_to_ignore_list = db.query(database.CompanyCollection).filter(
            database.CompanyCollection.collection_name == "Companies to Ignore List"
        ).first()
        
        # Create "Liked Companies List" if it doesn't exist
        liked_companies_list = db.query(database.CompanyCollection).filter(
            database.CompanyCollection.collection_name == "Liked Companies List"
        ).first()
        
        if not liked_companies_list:
            liked_companies_list = database.CompanyCollection(collection_name="Liked Companies List")
            db.add(liked_companies_list)
            db.commit()
        
        # Get companies to add to collections
        all_companies = db.query(database.Company).all()
        
        # Restore original associations according to main.py
        # My List: All 10,000 companies
        for i in range(len(all_companies)):
            association = database.CompanyCollectionAssociation(
                company_id=all_companies[i].id, collection_id=my_list.id
            )
            db.add(association)
        
        # Liked Companies List: 10 companies
        for i in range(min(10, len(all_companies))):
            association = database.CompanyCollectionAssociation(
                company_id=all_companies[i].id, collection_id=liked_companies_list.id
            )
            db.add(association)
        
        # Companies to Ignore List: 50 companies
        for i in range(min(50, len(all_companies))):
            association = database.CompanyCollectionAssociation(
                company_id=all_companies[i].id, collection_id=companies_to_ignore_list.id
            )
            db.add(association)
        
        db.commit()
        db.close()
        
        return {"message": "Database reset successfully - restored to original state"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to reset database: {str(e)}")
