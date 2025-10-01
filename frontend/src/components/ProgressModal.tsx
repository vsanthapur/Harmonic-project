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
}

const ProgressModal = ({
  open,
  progress,
  current,
  total,
  status,
  onCancel,
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
          {formatNumber(current)} of {formatNumber(total)} companies added
        </Typography>
        
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Progress: {progress}%
        </Typography>

        {status === 'running' && (
          <Typography variant="body2" color="primary">
            This may take several minutes. You can close this dialog and check back later.
          </Typography>
        )}
      </DialogContent>
      {onCancel && (
        <Box sx={{ p: 2, pt: 0 }}>
          <Button onClick={onCancel} variant="outlined" fullWidth>
            Close (operation continues in background)
          </Button>
        </Box>
      )}
    </Dialog>
  );
};

export default ProgressModal;
