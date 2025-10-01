import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
  Box,
} from '@mui/material';

interface SuccessModalProps {
  open: boolean;
  onClose: () => void;
  companiesAdded: number;
  fromCollection: string;
  toCollection: string;
}

const SuccessModal = ({
  open,
  onClose,
  companiesAdded,
  fromCollection,
  toCollection,
}: SuccessModalProps) => {
  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <span style={{ color: '#4caf50', fontSize: '24px' }}>✓</span>
          Operation Successful!
        </Box>
      </DialogTitle>
      <DialogContent>
        <Typography variant="body1" sx={{ mb: 2 }}>
          Successfully added <strong>{companiesAdded.toLocaleString()}</strong> companies from{' '}
          <strong>{fromCollection}</strong> to <strong>{toCollection}</strong>.
        </Typography>
        
        <Typography variant="body2" color="text.secondary">
          The companies have been added to the target collection and are now available there.
        </Typography>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} variant="contained">
          Great!
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default SuccessModal;
