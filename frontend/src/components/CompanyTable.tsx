import { DataGrid } from "@mui/x-data-grid";
import { useEffect, useState } from "react";
import { Button, Box, Typography } from "@mui/material";
import { 
  getCollectionsById, 
  ICompany, 
  getCollectionsMetadata,
  addCompaniesToCollection,
  addCompaniesBulkToCollection,
  getJobStatus,
  IJobStatusResponse
} from "../utils/jam-api";
import TargetSelectionModal from "./TargetSelectionModal";
import EmailModal from "./EmailModal";
import ProgressModal from "./ProgressModal";
import SuccessModal from "./SuccessModal";

const CompanyTable = (props: { selectedCollectionId: string }) => {
  const [response, setResponse] = useState<ICompany[]>([]);
  const [total, setTotal] = useState<number>();
  const [offset, setOffset] = useState<number>(0);
  const [pageSize, setPageSize] = useState(25);
  
  // Selection state
  const [selectedRows, setSelectedRows] = useState<number[]>([]);
  const [isSelectAll, setIsSelectAll] = useState(false);
  const [targetCollectionId, setTargetCollectionId] = useState<string>('');
  
  // Modal state
  const [showTargetModal, setShowTargetModal] = useState(false);
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [showProgressModal, setShowProgressModal] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  
  // Collections for target selection
  const [collections, setCollections] = useState<Array<{ id: string; collection_name: string }>>([]);
  
  // Job tracking
  const [activeJob, setActiveJob] = useState<IJobStatusResponse | null>(null);
  const [jobPollingInterval, setJobPollingInterval] = useState<number | null>(null);
  
  // Success modal data
  const [successData, setSuccessData] = useState<{
    companiesAdded: number;
    fromCollection: string;
    toCollection: string;
  } | null>(null);

  useEffect(() => {
    getCollectionsById(props.selectedCollectionId, offset, pageSize).then(
      (newResponse) => {
        setResponse(newResponse.companies);
        setTotal(newResponse.total);
      }
    );
  }, [props.selectedCollectionId, offset, pageSize]);

  useEffect(() => {
    setOffset(0);
  }, [props.selectedCollectionId]);

  // Load collections for target selection
  useEffect(() => {
    getCollectionsMetadata().then(setCollections);
  }, []);

  // Smart polling for job status
  useEffect(() => {
    if (activeJob && activeJob.status === 'running') {
      const getPollingInterval = (totalCompanies: number) => {
        const estimatedTime = totalCompanies * 0.1; // 100ms per company
        
        if (estimatedTime < 60) {
          return 2000; // 2 seconds for short operations
        } else if (estimatedTime < 600) {
          return 5000; // 5 seconds for medium operations
        } else {
          return 10000; // 10 seconds for long operations
        }
      };

      const pollJobStatus = async () => {
        try {
          const status = await getJobStatus(activeJob.job_id);
          setActiveJob(status);
          
          if (status.status === 'completed') {
            setActiveJob(status);
            if (jobPollingInterval) {
              clearInterval(jobPollingInterval);
              setJobPollingInterval(null);
            }
            // Refresh the data
            getCollectionsById(props.selectedCollectionId, offset, pageSize).then(
              (newResponse) => {
                setResponse(newResponse.companies);
                setTotal(newResponse.total);
              }
            );
          }
        } catch (error) {
          console.error('Error polling job status:', error);
        }
      };

      const interval = getPollingInterval(activeJob.total);
      const intervalId = setInterval(pollJobStatus, interval);
      setJobPollingInterval(intervalId);

      return () => {
        if (intervalId) {
          clearInterval(intervalId);
        }
      };
    }
  }, [activeJob, props.selectedCollectionId, offset, pageSize]);

  // Handler functions
  const handleAddSelected = () => {
    if (selectedRows.length > 1000) {
      setShowEmailModal(true);
    } else {
      setShowTargetModal(true);
    }
  };

  const handleAddAll = () => {
    setIsSelectAll(true);
    setShowTargetModal(true);
  };

  const handleTargetConfirm = async (targetCollectionId: string) => {
    try {
      let companyIds: number[];
      
      if (isSelectAll) {
        // For "Add All", we need to get ALL company IDs from the collection
        // We'll fetch them in batches to get all companies
        const allCompanyIds: number[] = [];
        let offset = 0;
        const batchSize = 1000;
        
        while (true) {
          const batchResponse = await getCollectionsById(props.selectedCollectionId, offset, batchSize);
          const batchIds = batchResponse.companies.map(c => c.id);
          allCompanyIds.push(...batchIds);
          
          if (batchIds.length < batchSize) {
            break; // No more companies
          }
          offset += batchSize;
        }
        
        companyIds = allCompanyIds;
      } else {
        companyIds = selectedRows;
      }
      
      // Check if this is a large operation that needs email modal
      if (companyIds.length > 1000) {
        // Store the target collection and show email modal
        setTargetCollectionId(targetCollectionId);
        setShowTargetModal(false);
        setShowEmailModal(true);
        return;
      }
      
      // Small operation - do it immediately
      const result = await addCompaniesToCollection(targetCollectionId, companyIds);
      console.log('Companies added:', result);
      
      // Show success modal
      const fromCollection = collections.find(c => c.id === props.selectedCollectionId)?.collection_name || 'Current Collection';
      const toCollection = collections.find(c => c.id === targetCollectionId)?.collection_name || 'Target Collection';
      
      setSuccessData({
        companiesAdded: result.companies_added,
        fromCollection,
        toCollection
      });
      setShowSuccessModal(true);
      
      setSelectedRows([]);
      setIsSelectAll(false);
      setShowTargetModal(false);
    } catch (error) {
      console.error('Error adding companies:', error);
    }
  };

  const handleEmailConfirm = async (email: string | null) => {
    try {
      let companyIds: number[];
      
      if (isSelectAll) {
        // For "Add All", we need to get ALL company IDs from the collection
        const allCompanyIds: number[] = [];
        let offset = 0;
        const batchSize = 1000;
        
        while (true) {
          const batchResponse = await getCollectionsById(props.selectedCollectionId, offset, batchSize);
          const batchIds = batchResponse.companies.map(c => c.id);
          allCompanyIds.push(...batchIds);
          
          if (batchIds.length < batchSize) {
            break; // No more companies
          }
          offset += batchSize;
        }
        
        companyIds = allCompanyIds;
      } else {
        companyIds = selectedRows;
      }
      const result = await addCompaniesBulkToCollection(
        targetCollectionId, 
        companyIds, 
        email || undefined
      );
      
      console.log('Setting active job:', result);
      setActiveJob({
        job_id: result.job_id,
        status: result.status,
        progress: 0,
        current: 0,
        total: companyIds.length
      });
      
      setShowEmailModal(false);
      setShowProgressModal(true);
      console.log('Progress modal should be showing now');
      setSelectedRows([]);
      setIsSelectAll(false);
      setTargetCollectionId('');
    } catch (error) {
      console.error('Error starting bulk operation:', error);
    }
  };

  return (
    <div>
      {/* Action Buttons */}
      <Box sx={{ p: 2, display: 'flex', gap: 2, alignItems: 'center' }}>
        <Button 
          variant="outlined"
          onClick={handleAddSelected}
          disabled={selectedRows.length === 0}
        >
          Add Selected ({selectedRows.length})
        </Button>
        
        <Button 
          variant="contained"
          onClick={handleAddAll}
        >
          Add All ({total?.toLocaleString() || 0})
        </Button>
        
        {activeJob && (
          <Button 
            variant="outlined"
            color="primary"
            onClick={() => {
              console.log('Opening progress modal, activeJob:', activeJob);
              setShowProgressModal(true);
            }}
          >
            View Progress ({activeJob.progress}%)
          </Button>
        )}
        
        {selectedRows.length > 0 && (
          <Typography variant="body2" color="text.secondary">
            {selectedRows.length} companies selected
          </Typography>
        )}
      </Box>

      {/* Data Grid */}
      <div style={{ height: 600, width: "100%" }}>
        <DataGrid
          rows={response}
          rowHeight={30}
          columns={[
            { field: "liked", headerName: "Liked", width: 90 },
            { field: "id", headerName: "ID", width: 90 },
            { field: "company_name", headerName: "Company Name", width: 200 },
          ]}
          initialState={{
            pagination: {
              paginationModel: { page: 0, pageSize: 25 },
            },
          }}
          rowCount={total}
          pagination
          checkboxSelection
          paginationMode="server"
          onRowSelectionModelChange={(newSelection) => {
            setSelectedRows(newSelection as number[]);
          }}
          onPaginationModelChange={(newMeta) => {
            setPageSize(newMeta.pageSize);
            setOffset(newMeta.page * newMeta.pageSize);
          }}
        />
      </div>

      {/* Modals */}
      <TargetSelectionModal
        open={showTargetModal}
        onClose={() => setShowTargetModal(false)}
        onConfirm={handleTargetConfirm}
        collections={collections.filter(c => c.id !== props.selectedCollectionId)}
        selectedCount={isSelectAll ? (total || 0) : selectedRows.length}
        currentCollectionName={collections.find(c => c.id === props.selectedCollectionId)?.collection_name || 'Current Collection'}
      />

      <EmailModal
        open={showEmailModal}
        onClose={() => setShowEmailModal(false)}
        onConfirm={handleEmailConfirm}
        companyCount={isSelectAll ? (total || 0) : selectedRows.length}
        isAddAll={isSelectAll}
      />

      <ProgressModal
        open={showProgressModal}
        progress={activeJob?.progress || 0}
        current={activeJob?.current || 0}
        total={activeJob?.total || 0}
        status={activeJob?.status || 'running'}
        onCancel={() => {
          setShowProgressModal(false);
          if (activeJob?.status === 'completed') {
            setActiveJob(null);
          }
        }}
      />

      {successData && (
        <SuccessModal
          open={showSuccessModal}
          onClose={() => {
            setShowSuccessModal(false);
            setSuccessData(null);
          }}
          companiesAdded={successData.companiesAdded}
          fromCollection={successData.fromCollection}
          toCollection={successData.toCollection}
        />
      )}
    </div>
  );
};

export default CompanyTable;
