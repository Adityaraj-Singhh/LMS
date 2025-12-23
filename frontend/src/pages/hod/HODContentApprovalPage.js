import React from 'react';
import { Box, Typography, Paper } from '@mui/material';
import HODContentApproval from '../../components/hod/HODContentApproval';

const HODContentApprovalPage = () => {
  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
      <HODContentApproval />
    </Box>
  );
};

export default HODContentApprovalPage;