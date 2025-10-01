import { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Typography,
  Box,
} from '@mui/material';

interface EmailModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (email: string | null) => void;
  companyCount: number;
  isAddAll?: boolean;
}

const EmailModal = ({
  open,
  onClose,
  onConfirm,
  companyCount,
  isAddAll = false,
}: EmailModalProps) => {
  const [email, setEmail] = useState<string>('');
  const [skipEmail, setSkipEmail] = useState<boolean>(false);

  const estimatedTime = Math.ceil(companyCount * 0.1 / 60); // minutes

  const handleConfirm = () => {
    if (skipEmail) {
      onConfirm(null);
    } else {
      onConfirm(email || null);
    }
    onClose();
  };

  const handleSkip = () => {
    setSkipEmail(true);
    onConfirm(null);
    onClose();
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        {isAddAll ? 'Add All Companies' : 'Large Operation Detected'}
      </DialogTitle>
      <DialogContent>
        <Typography variant="body1" sx={{ mb: 2 }}>
          {isAddAll ? (
            <>
              You are about to add <strong>{companyCount.toLocaleString()}</strong> companies.
            </>
          ) : (
            <>
              You are about to add <strong>{companyCount.toLocaleString()}</strong> companies.
            </>
          )}
        </Typography>
        
        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
          This operation will take approximately <strong>{estimatedTime} minutes</strong> to complete.
        </Typography>

        <Typography variant="body1" sx={{ mb: 2 }}>
          Would you like to receive an email notification when the operation is complete?
        </Typography>

        <Box sx={{ mb: 2 }}>
          <TextField
            label="Email (optional)"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            fullWidth
            disabled={skipEmail}
            placeholder="your-email@example.com"
          />
        </Box>

        <Typography variant="body2" color="text.secondary">
          You can also continue without email notifications and check the progress in the UI.
        </Typography>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button onClick={handleSkip} variant="outlined">
          Continue without email
        </Button>
        <Button 
          onClick={handleConfirm} 
          variant="contained"
          disabled={!email && !skipEmail}
        >
          Start with email
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default EmailModal;
