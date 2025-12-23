/**
 * Skeleton Loaders for Analytics Pages
 * Provides visual feedback during data loading
 * Shows progressive loading: skeleton → content
 */

import React from 'react';
import { 
  Box, 
  Card, 
  CardContent, 
  Skeleton, 
  Grid, 
  Container,
  Paper,
  useTheme,
  useMediaQuery
} from '@mui/material';

// Stats Card Skeleton
export const StatsCardSkeleton = ({ count = 4 }) => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  
  return (
    <Grid container spacing={isMobile ? 1.5 : 3}>
      {Array.from({ length: count }).map((_, index) => (
        <Grid item xs={6} sm={6} md={3} key={index}>
          <Card sx={{ height: '100%' }}>
            <CardContent sx={{ p: isMobile ? 1.5 : 2 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Box sx={{ flex: 1 }}>
                  <Skeleton variant="text" width="60%" height={isMobile ? 16 : 20} />
                  <Skeleton variant="text" width="40%" height={isMobile ? 32 : 48} sx={{ mt: 1 }} />
                </Box>
                <Skeleton variant="circular" width={isMobile ? 32 : 48} height={isMobile ? 32 : 48} />
              </Box>
            </CardContent>
          </Card>
        </Grid>
      ))}
    </Grid>
  );
};

// Chart Skeleton
export const ChartSkeleton = ({ height = 300, type = 'bar' }) => (
  <Card sx={{ height: height + 80 }}>
    <CardContent>
      <Skeleton variant="text" width="30%" height={28} sx={{ mb: 2 }} />
      <Box sx={{ height, display: 'flex', alignItems: 'flex-end', justifyContent: 'space-around', gap: 1 }}>
        {type === 'bar' && Array.from({ length: 7 }).map((_, i) => (
          <Skeleton 
            key={i} 
            variant="rectangular" 
            width="10%" 
            height={`${30 + Math.random() * 60}%`} 
            animation="wave" 
          />
        ))}
        {type === 'line' && (
          <Skeleton variant="rectangular" width="100%" height="70%" animation="wave" sx={{ borderRadius: 1 }} />
        )}
        {type === 'pie' && (
          <Box sx={{ display: 'flex', justifyContent: 'center', width: '100%' }}>
            <Skeleton variant="circular" width={height * 0.6} height={height * 0.6} animation="wave" />
          </Box>
        )}
      </Box>
    </CardContent>
  </Card>
);

// Table Skeleton
export const TableSkeleton = ({ rows = 5, columns = 5 }) => (
  <Card>
    <CardContent>
      <Skeleton variant="text" width="25%" height={28} sx={{ mb: 2 }} />
      <Box sx={{ overflowX: 'auto' }}>
        {/* Header */}
        <Box sx={{ display: 'flex', gap: 2, mb: 1, pb: 1, borderBottom: '1px solid', borderColor: 'divider' }}>
          {Array.from({ length: columns }).map((_, i) => (
            <Skeleton key={i} variant="text" width={`${100 / columns}%`} height={24} />
          ))}
        </Box>
        {/* Rows */}
        {Array.from({ length: rows }).map((_, rowIndex) => (
          <Box key={rowIndex} sx={{ display: 'flex', gap: 2, py: 1.5, borderBottom: '1px solid', borderColor: 'divider' }}>
            {Array.from({ length: columns }).map((_, colIndex) => (
              <Skeleton 
                key={colIndex} 
                variant="text" 
                width={`${100 / columns}%`} 
                height={20} 
                animation="wave"
              />
            ))}
          </Box>
        ))}
      </Box>
    </CardContent>
  </Card>
);

// Dashboard Header Skeleton
export const HeaderSkeleton = () => (
  <Box sx={{ mb: 4 }}>
    <Skeleton variant="text" width="40%" height={40} />
    <Skeleton variant="text" width="60%" height={24} sx={{ mt: 1 }} />
  </Box>
);

// Full Analytics Dashboard Skeleton
export const AnalyticsDashboardSkeleton = () => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  
  return (
    <Container maxWidth="xl" sx={{ py: isMobile ? 2 : 4, px: isMobile ? 1 : 3 }}>
      <HeaderSkeleton />
      
      {/* Stats Cards */}
      <Box sx={{ mb: 4 }}>
        <StatsCardSkeleton count={4} />
      </Box>
      
      {/* Charts */}
      <Grid container spacing={3} sx={{ mb: 4 }}>
        <Grid item xs={12} md={8}>
          <ChartSkeleton height={isMobile ? 200 : 300} type="line" />
        </Grid>
        <Grid item xs={12} md={4}>
          <ChartSkeleton height={isMobile ? 200 : 300} type="pie" />
        </Grid>
      </Grid>
      
      {/* Table */}
      <TableSkeleton rows={5} columns={isMobile ? 3 : 6} />
    </Container>
  );
};

// Course Analytics Skeleton
export const CourseAnalyticsSkeleton = () => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  
  return (
    <Container maxWidth="xl" sx={{ py: isMobile ? 2 : 4, px: isMobile ? 1 : 3 }}>
      <HeaderSkeleton />
      
      {/* Selectors */}
      <Card sx={{ mb: 4 }}>
        <CardContent>
          <Grid container spacing={2}>
            <Grid item xs={12} sm={4}>
              <Skeleton variant="rectangular" height={56} sx={{ borderRadius: 1 }} />
            </Grid>
            <Grid item xs={12} sm={4}>
              <Skeleton variant="rectangular" height={56} sx={{ borderRadius: 1 }} />
            </Grid>
            <Grid item xs={12} sm={4}>
              <Skeleton variant="rectangular" height={56} sx={{ borderRadius: 1 }} />
            </Grid>
          </Grid>
        </CardContent>
      </Card>
      
      {/* Stats Cards */}
      <Box sx={{ mb: 4 }}>
        <StatsCardSkeleton count={4} />
      </Box>
      
      {/* Table */}
      <TableSkeleton rows={8} columns={isMobile ? 3 : 7} />
    </Container>
  );
};

// Student List Skeleton
export const StudentListSkeleton = ({ count = 6 }) => (
  <Grid container spacing={2}>
    {Array.from({ length: count }).map((_, index) => (
      <Grid item xs={12} sm={6} md={4} key={index}>
        <Paper sx={{ p: 2, display: 'flex', alignItems: 'center', gap: 2 }}>
          <Skeleton variant="circular" width={50} height={50} />
          <Box sx={{ flex: 1 }}>
            <Skeleton variant="text" width="70%" height={24} />
            <Skeleton variant="text" width="50%" height={16} />
            <Skeleton variant="rectangular" width="40%" height={24} sx={{ mt: 0.5, borderRadius: 2 }} />
          </Box>
        </Paper>
      </Grid>
    ))}
  </Grid>
);

// Progress Card Skeleton
export const ProgressCardSkeleton = () => (
  <Card>
    <CardContent>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
        <Skeleton variant="circular" width={40} height={40} />
        <Box sx={{ flex: 1 }}>
          <Skeleton variant="text" width="60%" height={24} />
          <Skeleton variant="text" width="40%" height={16} />
        </Box>
      </Box>
      <Skeleton variant="rectangular" width="100%" height={8} sx={{ borderRadius: 4 }} />
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 1 }}>
        <Skeleton variant="text" width="20%" height={16} />
        <Skeleton variant="text" width="15%" height={16} />
      </Box>
    </CardContent>
  </Card>
);

export default {
  StatsCardSkeleton,
  ChartSkeleton,
  TableSkeleton,
  HeaderSkeleton,
  AnalyticsDashboardSkeleton,
  CourseAnalyticsSkeleton,
  StudentListSkeleton,
  ProgressCardSkeleton,
};
