import {
  Dialog,
  DialogTitle,
  DialogContent,
  LinearProgress,
  Typography,
  Box,
  Button,
} from '@mui/material';

interface ProgressModalProps {
  open: boolean;
  progress: number;
  current: number;
  total: number;
  status: string;
  onCancel?: () => void;
  added?: number;
  skippedDuplicates?: number;
}

const ProgressModal = ({
  open,
  progress,
  current,
  total,
  status,
  onCancel,
  added,
  skippedDuplicates,
}: ProgressModalProps) => {
  const formatNumber = (num: number) => num.toLocaleString();
  
  return (
    <Dialog open={open} maxWidth="sm" fullWidth>
      <DialogTitle>Adding Companies...</DialogTitle>
      <DialogContent>
        <Box sx={{ mb: 3 }}>
          <LinearProgress 
            variant="determinate" 
            value={progress} 
            sx={{ height: 8, borderRadius: 4 }}
          />
        </Box>
        
        <Typography variant="h6" sx={{ mb: 1 }}>
          {formatNumber(added ?? current)} of {formatNumber(total)} companies added
        </Typography>
        {status === 'completed' && typeof skippedDuplicates === 'number' && skippedDuplicates > 0 && (
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            Skipped as duplicates: {formatNumber(skippedDuplicates)}
          </Typography>
        )}
        
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Progress: {progress}%
        </Typography>

        {status === 'running' && (
          <Typography variant="body2" color="primary">
            This may take several minutes. You can close this dialog and check back later.
          </Typography>
        )}
        
        {status === 'completed' && (
          <Typography variant="body2" color="success.main" sx={{ mt: 2 }}>
            ✅ Operation completed successfully!
          </Typography>
        )}
      </DialogContent>
      <Box sx={{ p: 2, pt: 0 }}>
        <Button onClick={onCancel} variant="outlined" fullWidth>
          {status === 'completed' ? 'Close' : 'Close (operation continues in background)'}
        </Button>
      </Box>
    </Dialog>
  );
};

export default ProgressModal;
