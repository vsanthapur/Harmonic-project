import "./App.css";

import CssBaseline from "@mui/material/CssBaseline";
import { createTheme, ThemeProvider } from "@mui/material/styles";
import { useEffect, useState } from "react";
import { Button, Box, Alert } from "@mui/material";
import CompanyTable from "./components/CompanyTable";
import { getActiveJobs, getCollectionsMetadata, IActiveJobItem } from "./utils/jam-api";
import useApi from "./utils/useApi";

const darkTheme = createTheme({
  palette: {
    mode: "dark",
  },
});

function App() {
  const [selectedCollectionId, setSelectedCollectionId] = useState<string>();
  const [activeJobs, setActiveJobs] = useState<IActiveJobItem[]>([]);
  const [showResetWarning, setShowResetWarning] = useState(false);
  const { data: collectionResponse } = useApi(() => getCollectionsMetadata());

  useEffect(() => {
    setSelectedCollectionId(collectionResponse?.[0]?.id);
  }, [collectionResponse]);
  // Poll active jobs
  useEffect(() => {
    let timer: any;
    const poll = async () => {
      try {
        const jobs = await getActiveJobs();
        // Keep stable order by job_id
        const sorted = [...jobs].sort((a, b) => a.job_id.localeCompare(b.job_id));
        setActiveJobs(sorted);
      } catch (e) {
        // ignore transient errors
      }
      timer = setTimeout(poll, 10000);
    };
    poll();
    return () => timer && clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (selectedCollectionId) {
      window.history.pushState({}, "", `?collection=${selectedCollectionId}`);
    }
  }, [selectedCollectionId]);

  const handleResetDatabase = async () => {
    try {
      const response = await fetch('http://localhost:8000/collections/reset-db', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      
      if (response.ok) {
        alert('Database reset successfully! Refreshing page...');
        window.location.reload();
      } else {
        alert('Failed to reset database');
      }
    } catch (error) {
      console.error('Error resetting database:', error);
      alert('Error resetting database');
    }
  };

  return (
    <ThemeProvider theme={darkTheme}>
      <CssBaseline />
      <div className="mx-8">
        <div className="font-bold text-xl border-b p-2 mb-4 text-left flex justify-between items-center">
          <span>Harmonic Jam</span>
          <Button 
            variant="outlined" 
            color="warning" 
            size="small"
            onClick={() => setShowResetWarning(true)}
          >
            Reset DB (Testing)
          </Button>
        </div>
        
        {showResetWarning && (
          <Alert 
            severity="warning" 
            sx={{ mb: 2 }}
            action={
              <Box sx={{ display: 'flex', gap: 1 }}>
                <Button size="small" onClick={() => setShowResetWarning(false)}>
                  Cancel
                </Button>
                <Button 
                  size="small" 
                  color="error" 
                  variant="contained"
                  onClick={() => {
                    setShowResetWarning(false);
                    handleResetDatabase();
                  }}
                >
                  Reset Database
                </Button>
              </Box>
            }
          >
            This will reset the database to its original state. All changes will be lost!
          </Alert>
        )}
        <div className="flex">
          <div className="w-1/5">
            <p className=" font-bold border-b mb-2 pb-2 text-left">
              Collections
            </p>
            <div className="flex flex-col gap-2 text-left">
              {collectionResponse?.map((collection) => {
                return (
                  <div
                    key={collection.id}
                    className={`py-1 pl-4 hover:cursor-pointer hover:bg-orange-300 ${
                      selectedCollectionId === collection.id &&
                      "bg-orange-500 font-bold"
                    }`}
                    onClick={() => {
                      setSelectedCollectionId(collection.id);
                    }}
                  >
                    {collection.collection_name}
                  </div>
                );
              })}
            </div>
            <p className=" font-bold border-b mt-6 mb-2 pb-2 text-left">
              Running Jobs
            </p>
            <div className="flex flex-col gap-2 text-left">
              {activeJobs.length === 0 && (
                <div className="py-1 pl-4 text-gray-400">No active jobs</div>
              )}
              {activeJobs.map((job) => {
                // try to resolve names from localStorage map
                let fromName: string | undefined = job.from_collection_name;
                let toName: string | undefined = job.to_collection_name;
                try {
                  const map = JSON.parse(localStorage.getItem('jamJobNames') || '{}');
                  if (map && map[job.job_id]) {
                    fromName = map[job.job_id].fromName || fromName;
                    toName = map[job.job_id].toName || toName;
                  }
                } catch {}
                return (
                  <div key={job.job_id} className="py-1 pl-4 pr-2 flex items-center justify-between bg-gray-800 rounded">
                    <div className="min-w-0">
                      <div className="text-sm truncate" title={`${fromName || 'From'} → ${toName || 'To'}`}>
                        {(fromName || 'From')} <span className="text-gray-400">→</span> {(toName || 'To')}
                      </div>
                      <div className="text-xs text-gray-400">{job.current.toLocaleString()} / {job.total.toLocaleString()} ({job.progress}%)</div>
                    </div>
                    <Button size="small" variant="outlined" onClick={() => {
                      // broadcast event to open progress modal with initial job data
                      window.dispatchEvent(new CustomEvent('open-job', { detail: { job: { ...job, from_collection_name: fromName, to_collection_name: toName } } }));
                    }}>View</Button>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="w-4/5 ml-4">
            {selectedCollectionId && (
              <CompanyTable selectedCollectionId={selectedCollectionId} />
            )}
          </div>
        </div>
      </div>
    </ThemeProvider>
  );
}

export default App;
