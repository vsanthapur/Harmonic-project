import { DataGrid } from "@mui/x-data-grid";
import { useEffect, useState } from "react";
import { Button, Box, Typography, TextField } from "@mui/material";
import { 
  getCollectionsById, 
  ICompany, 
  getCollectionsMetadata,
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
  const [isSelectN, setIsSelectN] = useState(false);
  const [selectNCount, setSelectNCount] = useState<number | ''>(100);
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
    totalRequested?: number;
    duplicates?: number;
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
          return 1000; // 1 second for short operations
        } else if (estimatedTime < 600) {
          return 2000; // 2 seconds for medium operations
        } else {
          return 3000; // 3 seconds for long operations
        }
      };

      const pollJobStatus = async () => {
        try {
          const status = await getJobStatus(activeJob.job_id);
          setActiveJob(status as any);
          
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
            // Always close progress and show success modal immediately on completion
            const fromCollection = collections.find(c => c.id === props.selectedCollectionId)?.collection_name || 'Current Collection';
            const toCollection = collections.find(c => c.id === (targetCollectionId || ''))?.collection_name || 'Target Collection';
            setShowProgressModal(false);
            setSuccessData({
              companiesAdded: status.added ?? status.current,
              fromCollection,
              toCollection,
              totalRequested: status.total,
              duplicates: (status.skipped_duplicates ?? Math.max((status.total || 0) - (status.added || status.current || 0), 0))
            });
            setShowSuccessModal(true);
            setActiveJob(null);
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
    setShowTargetModal(true);
  };

  const handleAddAll = () => {
    setIsSelectAll(true);
    setIsSelectN(false);
    setShowTargetModal(true);
  };

  const handleAddN = () => {
    setIsSelectN(true);
    setIsSelectAll(false);
    setShowTargetModal(true);
  };

  const handleTargetConfirm = async (targetCollectionId: string) => {
    try {
      // Persist target for final success summary
      setTargetCollectionId(targetCollectionId);
      // Compute count without fetching IDs to avoid UI delays
      const count = isSelectAll
        ? (total || 0)
        : isSelectN
          ? (typeof selectNCount === 'number' ? selectNCount : 0)
          : selectedRows.length;

      // Estimate duration at 100ms per company
      const estimatedSeconds = count * 0.1;
      if (estimatedSeconds > 60) {
        setTargetCollectionId(targetCollectionId);
        setShowTargetModal(false);
        setShowEmailModal(true);
        return;
      }

      // Show progress UI immediately with known total, then prepare IDs and start job
      setShowTargetModal(false);
      setActiveJob({
        job_id: '__pending__',
        status: 'running',
        progress: 0,
        current: 0,
        total: count,
      } as any);
      setShowProgressModal(true);

      let companyIds: number[] = [];
      if (isSelectAll) {
        const allCompanyIds: number[] = [];
        let offset = 0;
        const batchSize = 1000;
        while (true) {
          const batchResponse = await getCollectionsById(props.selectedCollectionId, offset, batchSize);
          const batchIds = batchResponse.companies.map(c => c.id);
          allCompanyIds.push(...batchIds);
          if (batchIds.length < batchSize) break;
          offset += batchSize;
        }
        companyIds = allCompanyIds;
      } else if (isSelectN) {
        const n = typeof selectNCount === 'number' ? selectNCount : 0;
        const nResponse = await getCollectionsById(props.selectedCollectionId, 0, n);
        companyIds = nResponse.companies.map(c => c.id);
      } else {
        companyIds = selectedRows;
      }

      const result = await addCompaniesBulkToCollection(targetCollectionId, companyIds, undefined);
      setActiveJob({ job_id: result.job_id, status: result.status, progress: 0, current: 0, total: companyIds.length });
      setSelectedRows([]);
      setIsSelectAll(false);
      setIsSelectN(false);
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
      } else if (isSelectN) {
        // For "Add N", we need to get the first N company IDs from the collection
        const n = typeof selectNCount === 'number' ? selectNCount : 0;
        const nResponse = await getCollectionsById(props.selectedCollectionId, 0, n);
        companyIds = nResponse.companies.map(c => c.id);
      } else {
        companyIds = selectedRows;
      }
      // Show progress immediately with known total
      setShowEmailModal(false);
      setActiveJob({
        job_id: '__pending__',
        status: 'running',
        progress: 0,
        current: 0,
        total: companyIds.length,
      } as any);
      setShowProgressModal(true);

      const result = await addCompaniesBulkToCollection(targetCollectionId, companyIds, email || undefined);
      
      console.log('Setting active job:', result);
      setActiveJob({
        job_id: result.job_id,
        status: result.status,
        progress: 0,
        current: 0,
        total: companyIds.length
      });
      
      // job started, progress modal already visible
      setSelectedRows([]);
      setIsSelectAll(false);
      setIsSelectN(false);
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
        
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <TextField
            size="small"
            type="number"
            value={selectNCount}
            onChange={(e) => {
              const value = e.target.value;
              if (value === '') {
                setSelectNCount('');
                return;
              }
              const parsed = parseInt(value, 10);
              if (!isNaN(parsed)) {
                setSelectNCount(parsed);
              }
            }}
            inputProps={{ min: 1, max: total || 10000 }}
            sx={{ width: 80 }}
          />
          <Button 
            variant="outlined"
            onClick={handleAddN}
            disabled={!(typeof selectNCount === 'number') || selectNCount <= 0}
          >
            Add N ({typeof selectNCount === 'number' ? selectNCount : 0})
          </Button>
        </Box>
        
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
        selectedCount={isSelectAll ? (total || 0) : isSelectN ? (typeof selectNCount === 'number' ? selectNCount : 0) : selectedRows.length}
        currentCollectionName={collections.find(c => c.id === props.selectedCollectionId)?.collection_name || 'Current Collection'}
      />

      <EmailModal
        open={showEmailModal}
        onClose={() => setShowEmailModal(false)}
        onConfirm={handleEmailConfirm}
        companyCount={isSelectAll ? (total || 0) : isSelectN ? (typeof selectNCount === 'number' ? selectNCount : 0) : selectedRows.length}
        isAddAll={isSelectAll || isSelectN}
      />

      <ProgressModal
        open={showProgressModal}
        progress={activeJob?.progress || 0}
        current={activeJob?.current || 0}
        total={activeJob?.total || 0}
        added={(activeJob as any)?.added}
        skippedDuplicates={(activeJob as any)?.skipped_duplicates}
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
          duplicates={successData.duplicates}
        />
      )}
    </div>
  );
};

export default CompanyTable;
