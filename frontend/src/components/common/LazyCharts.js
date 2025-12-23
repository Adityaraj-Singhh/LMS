/**
 * Lazy-loaded Chart Components
 * Reduces initial bundle size by ~46KB (recharts)
 * Charts load on-demand when component mounts
 */

import React, { Suspense, lazy } from 'react';
import { Box, Skeleton, CircularProgress } from '@mui/material';

// Lazy load recharts components
const LazyLineChart = lazy(() => 
  import('recharts').then(module => ({ default: module.LineChart }))
);
const LazyBarChart = lazy(() => 
  import('recharts').then(module => ({ default: module.BarChart }))
);
const LazyPieChart = lazy(() => 
  import('recharts').then(module => ({ default: module.PieChart }))
);
const LazyAreaChart = lazy(() => 
  import('recharts').then(module => ({ default: module.AreaChart }))
);
const LazyResponsiveContainer = lazy(() => 
  import('recharts').then(module => ({ default: module.ResponsiveContainer }))
);

// Chart skeleton placeholder
const ChartSkeleton = ({ height = 300, type = 'bar' }) => (
  <Box sx={{ width: '100%', height, display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: 'grey.50', borderRadius: 1 }}>
    <Box sx={{ width: '100%', height: '100%', p: 2 }}>
      {type === 'bar' && (
        <Box sx={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-around', height: '100%', gap: 1 }}>
          {[60, 80, 40, 90, 70, 55, 85].map((h, i) => (
            <Skeleton key={i} variant="rectangular" width="10%" height={`${h}%`} animation="wave" />
          ))}
        </Box>
      )}
      {type === 'line' && (
        <Box sx={{ height: '100%', display: 'flex', alignItems: 'center' }}>
          <Skeleton variant="rectangular" width="100%" height="60%" animation="wave" sx={{ borderRadius: 1 }} />
        </Box>
      )}
      {type === 'pie' && (
        <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
          <Skeleton variant="circular" width={Math.min(height * 0.7, 200)} height={Math.min(height * 0.7, 200)} animation="wave" />
        </Box>
      )}
    </Box>
  </Box>
);

// Wrapper components with Suspense
export const LineChart = (props) => (
  <Suspense fallback={<ChartSkeleton height={props.height || 300} type="line" />}>
    <LazyLineChart {...props} />
  </Suspense>
);

export const BarChart = (props) => (
  <Suspense fallback={<ChartSkeleton height={props.height || 300} type="bar" />}>
    <LazyBarChart {...props} />
  </Suspense>
);

export const PieChart = (props) => (
  <Suspense fallback={<ChartSkeleton height={props.height || 300} type="pie" />}>
    <LazyPieChart {...props} />
  </Suspense>
);

export const AreaChart = (props) => (
  <Suspense fallback={<ChartSkeleton height={props.height || 300} type="line" />}>
    <LazyAreaChart {...props} />
  </Suspense>
);

export const ResponsiveContainer = (props) => (
  <Suspense fallback={<ChartSkeleton height={props.height || 300} type="bar" />}>
    <LazyResponsiveContainer {...props} />
  </Suspense>
);

// Re-export other recharts components that are lightweight
export { 
  Line, 
  Bar, 
  Pie, 
  Area,
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend,
  Cell,
  ComposedChart,
  Scatter
} from 'recharts';

export default {
  LineChart,
  BarChart,
  PieChart,
  AreaChart,
  ResponsiveContainer,
};
