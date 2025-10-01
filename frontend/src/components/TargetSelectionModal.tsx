import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Typography,
} from '@mui/material';

interface TargetSelectionModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (targetCollectionId: string) => void;
  collections: Array<{ id: string; collection_name: string }>;
  selectedCount: number;
  currentCollectionName: string;
}

const TargetSelectionModal = ({
  open,
  onClose,
  onConfirm,
  collections,
  selectedCount,
  currentCollectionName,
}: TargetSelectionModalProps) => {
  const [targetCollectionId, setTargetCollectionId] = useState<string>('');

  // Reset selection every time the modal is (re)opened
  useEffect(() => {
    if (open) {
      setTargetCollectionId('');
    }
  }, [open]);

  const handleConfirm = () => {
    if (targetCollectionId) {
      onConfirm(targetCollectionId);
      onClose();
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Add Companies to Collection</DialogTitle>
      <DialogContent>
        <Typography variant="body1" sx={{ mb: 2 }}>
          You are about to add <strong>{selectedCount}</strong> companies from{' '}
          <strong>{currentCollectionName}</strong> to another collection.
        </Typography>
        
        <FormControl fullWidth sx={{ mt: 2 }}>
          <InputLabel>Target Collection</InputLabel>
          <Select
            value={targetCollectionId}
            onChange={(e) => setTargetCollectionId(e.target.value)}
            label="Target Collection"
          >
            {collections.map((collection) => (
              <MenuItem key={collection.id} value={collection.id}>
                {collection.collection_name}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button 
          onClick={handleConfirm} 
          variant="contained"
          disabled={!targetCollectionId}
        >
          Add Companies
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default TargetSelectionModal;
