import axios from 'axios';

export interface ICompany {
    id: number;
    company_name: string;
    liked: boolean;
}

export interface ICollection {
    id: string;
    collection_name: string;
    companies: ICompany[];
    total: number;
}

export interface ICompanyBatchResponse {
    companies: ICompany[];
}

export interface IAddCompaniesRequest {
    company_ids: number[];
}

export interface IAddCompaniesBulkRequest {
    company_ids: number[];
    email?: string;
}

export interface IAddCompaniesResponse {
    message: string;
    companies_added: number;
}

export interface IAddCompaniesBulkResponse {
    job_id: string;
    status: string;
    message: string;
}

export interface IJobStatusResponse {
    job_id: string;
    status: string;
    progress: number;
    current: number;
    total: number;
    added?: number;
    skipped_duplicates?: number;
}

export interface IActiveJobItem {
    job_id: string;
    status: string;
    progress: number;
    current: number;
    total: number;
    from_collection_name?: string;
    to_collection_name?: string;
}

const BASE_URL = 'http://localhost:8000';

export async function getCompanies(offset?: number, limit?: number): Promise<ICompanyBatchResponse> {
    try {
        const response = await axios.get(`${BASE_URL}/companies`, {
            params: {
                offset,
                limit,
            },
        });
        return response.data;
    } catch (error) {
        console.error('Error fetching companies:', error);
        throw error;
    }
}

export async function getCollectionsById(id: string, offset?: number, limit?: number): Promise<ICollection> {
    try {
        const response = await axios.get(`${BASE_URL}/collections/${id}`, {
            params: {
                offset,
                limit,
            },
        });
        return response.data;
    } catch (error) {
        console.error('Error fetching companies:', error);
        throw error;
    }
}

export async function getCollectionsMetadata(): Promise<ICollection[]> {
    try {
        const response = await axios.get(`${BASE_URL}/collections`);
        return response.data;
    } catch (error) {
        console.error('Error fetching companies:', error);
        throw error;
    }
}

export async function addCompaniesToCollection(
    collectionId: string, 
    companyIds: number[]
): Promise<IAddCompaniesResponse> {
    try {
        const response = await axios.post(`${BASE_URL}/collections/${collectionId}/companies`, {
            company_ids: companyIds
        });
        return response.data;
    } catch (error) {
        console.error('Error adding companies:', error);
        throw error;
    }
}

export async function addCompaniesBulkToCollection(
    collectionId: string, 
    companyIds: number[], 
    email?: string
): Promise<IAddCompaniesBulkResponse> {
    try {
        const response = await axios.post(`${BASE_URL}/collections/${collectionId}/companies/bulk`, {
            company_ids: companyIds,
            email: email
        });
        return response.data;
    } catch (error) {
        console.error('Error adding companies in bulk:', error);
        throw error;
    }
}

export async function getJobStatus(jobId: string): Promise<IJobStatusResponse> {
    try {
        const response = await axios.get(`${BASE_URL}/collections/jobs/${jobId}/status`);
        return response.data;
    } catch (error) {
        console.error('Error fetching job status:', error);
        throw error;
    }
}

export async function getActiveJobs(): Promise<IActiveJobItem[]> {
    try {
        const response = await axios.get(`${BASE_URL}/collections/jobs/active`);
        return response.data;
    } catch (error) {
        console.error('Error fetching active jobs:', error);
        throw error;
    }
}