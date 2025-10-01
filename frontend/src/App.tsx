import "./App.css";

import CssBaseline from "@mui/material/CssBaseline";
import { createTheme, ThemeProvider } from "@mui/material/styles";
import { useEffect, useState } from "react";
import { Button, Box, Alert } from "@mui/material";
import CompanyTable from "./components/CompanyTable";
import { getCollectionsMetadata } from "./utils/jam-api";
import useApi from "./utils/useApi";

const darkTheme = createTheme({
  palette: {
    mode: "dark",
  },
});

function App() {
  const [selectedCollectionId, setSelectedCollectionId] = useState<string>();
  const [showResetWarning, setShowResetWarning] = useState(false);
  const { data: collectionResponse } = useApi(() => getCollectionsMetadata());

  useEffect(() => {
    setSelectedCollectionId(collectionResponse?.[0]?.id);
  }, [collectionResponse]);

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
