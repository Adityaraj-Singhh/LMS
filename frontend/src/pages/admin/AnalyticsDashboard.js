
import React, { useEffect, useState } from 'react';
import { 
  Box, 
  Typography, 
  Paper, 
  CircularProgress, 
  Grid, 
  Card, 
  CardContent, 
  Divider, 
  IconButton, 
  Tooltip as MuiTooltip,
  CardHeader,
  Avatar,
  Switch,
  FormControlLabel,
  FormGroup,
  useTheme,
  useMediaQuery
} from '@mui/material';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';
import axios from 'axios';
import PeopleIcon from '@mui/icons-material/People';
import PersonAddIcon from '@mui/icons-material/PersonAdd';
import MenuBookIcon from '@mui/icons-material/MenuBook';
import ArrowForwardIosIcon from '@mui/icons-material/ArrowForwardIos';
import ShowChartIcon from '@mui/icons-material/ShowChart';
import PieChartIcon from '@mui/icons-material/PieChart';
import TimelineIcon from '@mui/icons-material/Timeline';
import { MdVideoLibrary } from 'react-icons/md';
import { useNavigate } from 'react-router-dom';
import { parseJwt } from '../../utils/jwt';

// Enhanced color palette
const COLORS = ['#4361ee', '#f72585', '#7209b7', '#3a0ca3', '#4cc9f0', '#ff9e00', '#38b000'];

const AnalyticsDashboard = ({ summaryOnly = false }) => {
  const [overview, setOverview] = useState(null);
  const [trends, setTrends] = useState([]);
  const [heatmap, setHeatmap] = useState([]);
  const [loading, setLoading] = useState(true);
  const [visibleMetrics, setVisibleMetrics] = useState(() => {
    // Default: all metrics visible, persisted in localStorage
    const saved = localStorage.getItem('dashboardMetrics');
    return saved ? JSON.parse(saved) : {
      totalStudents: true,
      activeStudents: true,
      totalCourses: true,
      totalVideos: true,
      totalQuizAttempts: true,
      averageQuizScore: true,
    };
  });

  const navigate = useNavigate();
  const token = localStorage.getItem('token');
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const isTablet = useMediaQuery(theme.breakpoints.down('md'));
  
  // Handle metric toggle
  const handleMetricToggle = (key) => {
    setVisibleMetrics(prev => {
      const next = { ...prev, [key]: !prev[key] };
      localStorage.setItem('dashboardMetrics', JSON.stringify(next));
      return next;
    });
  };

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const [o, t, h] = await Promise.all([
          axios.get('/api/admin/analytics/overview', { headers: { Authorization: `Bearer ${token}` } }),
          axios.get('/api/admin/analytics/trends', { headers: { Authorization: `Bearer ${token}` } }),
          axios.get('/api/admin/analytics/heatmap', { headers: { Authorization: `Bearer ${token}` } }),
        ]);
        setOverview(o.data);
        setTrends(t.data);
        setHeatmap(h.data);
      } catch (error) {
        console.error('Error fetching analytics data:', error);
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  if (loading || !overview) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
        <CircularProgress color="primary" size={60} thickness={4} />
      </Box>
    );
  }

  // Prepare trend data for recharts with enhanced styling - with null checks
  const trendData = Array.isArray(trends) ? trends.map(t => {
    // Add null checks to handle potential undefined values
    if (!t || !t._id) {
      return { name: 'Unknown', Enrollments: 0 };
    }
    return {
      name: t._id.year && t._id.period ? `${t._id.year}/${t._id.period}` : 'Unknown',
      Enrollments: t.count || 0,
    };
  }) : [];

  // Prepare heatmap data for recharts (flattened for demo) - with null checks
  const heatmapData = Array.isArray(heatmap) ? heatmap.map(h => {
    // Add null checks to handle potential undefined values
    if (!h || !h._id) {
      return { day: 'Unknown', hour: 0, count: 0 };
    }
    return {
      day: h._id.day || 'Unknown',
      hour: h._id.hour || 0,
      count: h.count || 0,
    };
  }) : [];

  // Generate heat colors based on count
  const getHeatColor = (count) => {
    if (!Array.isArray(heatmapData) || heatmapData.length === 0) {
      return `rgba(247, 37, 133, 0.2)`;
    }
    const maxCount = Math.max(...heatmapData.map(d => d.count || 0));
    if (maxCount === 0) {
      return `rgba(247, 37, 133, 0.2)`;
    }
    const intensity = Math.min(Math.floor((count / maxCount) * 255), 255);
    return `rgba(247, 37, 133, ${0.2 + (count / maxCount) * 0.8})`;
  };

  const summarySection = (
    <>
      {!summaryOnly && (
        <Typography 
          variant="h4" 
          gutterBottom 
          color="primary" 
          sx={{ 
            mb: { xs: 2, md: 3 }, 
            fontWeight: 600,
            fontSize: { xs: '1.5rem', sm: '1.75rem', md: '2.125rem' },
            display: 'flex',
            alignItems: 'center',
          }}
        >
          <TimelineIcon sx={{ mr: 1, fontSize: { xs: 28, md: 36 } }} />
          Analytics Dashboard
        </Typography>
      )}

      {/* Custom dashboard metric toggles - Redesigned */}
      <Card 
        elevation={2} 
        sx={{ 
          mb: { xs: 1.5, md: 3 }, 
          p: { xs: 1, md: 2 }, 
          borderRadius: 2,
          background: '#ffffff',
          border: '1px solid #6497b1',
          boxShadow: '0 6px 20px rgba(0, 91, 150, 0.2)'
        }}
      >
        <CardHeader
          title={isMobile ? "Customize" : "Dashboard Customization"}
          titleTypographyProps={{ 
            variant: 'h6', 
            fontWeight: 500,
            fontSize: { xs: '0.9rem', md: '1.25rem' }
          }}
          subheader={isMobile ? "Toggle metrics" : "Toggle metrics visibility to customize your dashboard view"}
          subheaderTypographyProps={{
            fontSize: { xs: '0.7rem', md: '0.875rem' }
          }}
          sx={{ pb: 1, px: { xs: 1, md: 2 } }}
        />
        <Divider sx={{ mb: { xs: 1, md: 2 } }} />
        <FormGroup row sx={{ px: { xs: 0.5, md: 2 }, gap: { xs: 0.5, sm: 1, md: 3 }, flexWrap: 'wrap' }}>
          <FormControlLabel
            control={
              <Switch 
                checked={visibleMetrics.totalStudents} 
                onChange={() => handleMetricToggle('totalStudents')}
                color="primary"
                size={isMobile ? "small" : "medium"}
              />
            }
            label={<Typography sx={{ fontSize: { xs: '0.7rem', sm: '0.875rem' } }}>{isMobile ? "Students" : "Total Students"}</Typography>}
          />
          <FormControlLabel
            control={
              <Switch 
                checked={visibleMetrics.activeStudents} 
                onChange={() => handleMetricToggle('activeStudents')}
                color="success"
                size={isMobile ? "small" : "medium"}
              />
            }
            label={<Typography sx={{ fontSize: { xs: '0.7rem', sm: '0.875rem' } }}>{isMobile ? "Active" : "Active Students"}</Typography>}
          />
          <FormControlLabel
            control={
              <Switch 
                checked={visibleMetrics.totalCourses} 
                onChange={() => handleMetricToggle('totalCourses')}
                color="warning"
                size={isMobile ? "small" : "medium"}
              />
            }
            label={<Typography sx={{ fontSize: { xs: '0.7rem', sm: '0.875rem' } }}>{isMobile ? "Courses" : "Total Courses"}</Typography>}
          />
          <FormControlLabel
            control={
              <Switch 
                checked={visibleMetrics.totalVideos} 
                onChange={() => handleMetricToggle('totalVideos')}
                color="secondary"
                size={isMobile ? "small" : "medium"}
              />
            }
            label={<Typography sx={{ fontSize: { xs: '0.7rem', sm: '0.875rem' } }}>{isMobile ? "Videos" : "Total Videos"}</Typography>}
          />
          <FormControlLabel
            control={
              <Switch 
                checked={visibleMetrics.totalQuizAttempts} 
                onChange={() => handleMetricToggle('totalQuizAttempts')}
                color="error"
                size={isMobile ? "small" : "medium"}
              />
            }
            label={<Typography sx={{ fontSize: { xs: '0.7rem', sm: '0.875rem' } }}>{isMobile ? "Quizzes" : "Quiz Attempts"}</Typography>}
          />
          <FormControlLabel
            control={
              <Switch 
                checked={visibleMetrics.averageQuizScore} 
                onChange={() => handleMetricToggle('averageQuizScore')}
                color="success"
                size={isMobile ? "small" : "medium"}
              />
            }
            label={<Typography sx={{ fontSize: { xs: '0.7rem', sm: '0.875rem' } }}>{isMobile ? "Avg Score" : "Avg Quiz Score"}</Typography>}
          />
        </FormGroup>
      </Card>
      
      {/* Stats Cards - Enhanced with shadows and transitions */}
      <Grid container spacing={{ xs: 1.5, sm: 2, md: 3 }}>
        {visibleMetrics.totalStudents && (
          <Grid item xs={6} sm={6} md={3}>
            <Card 
              elevation={2} 
              sx={{ 
                height: '100%',
                borderRadius: 2,
                background: 'linear-gradient(135deg, #e3f2fd 0%, #bbdefb 100%)',
                transition: 'all 0.3s ease',
                '&:hover': {
                  transform: isMobile ? 'none' : 'translateY(-5px)',
                  boxShadow: '0 8px 16px rgba(67, 97, 238, 0.2)',
                }
              }}
            >
              <CardContent sx={{ 
                display: 'flex', 
                flexDirection: 'column', 
                alignItems: 'flex-start', 
                gap: 0.5,
                p: { xs: 1.5, md: 3 }
              }}>
                <Box sx={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  mb: { xs: 1, md: 2 },
                  width: '100%',
                  justifyContent: 'space-between'
                }}>
                  <Box sx={{ display: 'flex', alignItems: 'center' }}>
                    <Avatar sx={{ 
                      bgcolor: '#4361ee', 
                      mr: { xs: 1, md: 2 },
                      width: { xs: 28, md: 40 },
                      height: { xs: 28, md: 40 }
                    }}>
                      <PeopleIcon sx={{ fontSize: { xs: 16, md: 24 } }} />
                    </Avatar>
                    <Typography variant="h6" fontWeight={500} sx={{ 
                      fontSize: { xs: '0.75rem', sm: '0.9rem', md: '1.25rem' }
                    }}>
                      Students
                    </Typography>
                  </Box>
                  {!isMobile && (
                    <MuiTooltip title="View all students">
                      <IconButton 
                        color="primary" 
                        onClick={() => navigate('/admin/students')} 
                        size="small"
                        sx={{ 
                          bgcolor: 'rgba(255,255,255,0.6)',
                          '&:hover': { bgcolor: 'rgba(255,255,255,0.9)' }
                        }}
                      >
                        <ArrowForwardIosIcon fontSize="small" />
                      </IconButton>
                    </MuiTooltip>
                  )}
                </Box>
                <Typography 
                  variant="h3" 
                  sx={{ 
                    fontWeight: 700,
                    fontSize: { xs: '1.5rem', sm: '2rem', md: '3rem' },
                    color: '#1565c0',
                    textShadow: '1px 1px 2px rgba(0,0,0,0.1)'
                  }}
                >
                  {overview?.totalStudents || 0}
                </Typography>
                {!isMobile && (
                  <Typography variant="body2" color="text.secondary" fontWeight={500}>
                    Total registered students
                  </Typography>
                )}
              </CardContent>
            </Card>
          </Grid>
        )}
        
        {visibleMetrics.activeStudents && (
          <Grid item xs={6} sm={6} md={3}>
            <Card 
              elevation={2} 
              sx={{ 
                height: '100%',
                borderRadius: 2,
                background: 'linear-gradient(135deg, #e8f5e9 0%, #c8e6c9 100%)',
                transition: 'all 0.3s ease',
                '&:hover': {
                  transform: isMobile ? 'none' : 'translateY(-5px)',
                  boxShadow: '0 8px 16px rgba(56, 176, 0, 0.2)',
                }
              }}
            >
              <CardContent sx={{ 
                display: 'flex', 
                flexDirection: 'column', 
                alignItems: 'flex-start', 
                gap: 0.5,
                p: { xs: 1.5, md: 3 }
              }}>
                <Box sx={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  mb: { xs: 1, md: 2 },
                  width: '100%',
                  justifyContent: 'space-between'
                }}>
                  <Box sx={{ display: 'flex', alignItems: 'center' }}>
                    <Avatar sx={{ bgcolor: '#38b000', mr: { xs: 1, md: 2 }, width: { xs: 28, md: 40 }, height: { xs: 28, md: 40 } }}>
                      <PersonAddIcon sx={{ fontSize: { xs: 16, md: 24 } }} />
                    </Avatar>
                    <Typography variant="h6" fontWeight={500} sx={{ fontSize: { xs: '0.75rem', sm: '0.9rem', md: '1.25rem' } }}>Active</Typography>
                  </Box>
                  {!isMobile && (
                    <MuiTooltip title="View active students">
                      <IconButton 
                        color="success" 
                        onClick={() => navigate('/admin/students')} 
                        size="small"
                        sx={{ 
                          bgcolor: 'rgba(255,255,255,0.6)',
                          '&:hover': { bgcolor: 'rgba(255,255,255,0.9)' }
                        }}
                      >
                        <ArrowForwardIosIcon fontSize="small" />
                      </IconButton>
                    </MuiTooltip>
                  )}
                </Box>
                <Typography 
                  variant="h3" 
                  sx={{ 
                    fontWeight: 700,
                    fontSize: { xs: '1.5rem', sm: '2rem', md: '3rem' },
                    color: '#2e7d32',
                    textShadow: '1px 1px 2px rgba(0,0,0,0.1)'
                  }}
                >
                  {overview?.activeStudents || 0}
                </Typography>
                {!isMobile && (
                  <Typography variant="body2" color="text.secondary" fontWeight={500}>
                    Active students (last 10 min)
                  </Typography>
                )}
              </CardContent>
            </Card>
          </Grid>
        )}
        
        {visibleMetrics.totalCourses && (
          <Grid item xs={6} sm={6} md={3}>
            <Card 
              elevation={2} 
              sx={{ 
                height: '100%',
                borderRadius: 2,
                background: 'linear-gradient(135deg, #fff3e0 0%, #ffe0b2 100%)',
                transition: 'all 0.3s ease',
                '&:hover': {
                  transform: isMobile ? 'none' : 'translateY(-5px)',
                  boxShadow: '0 8px 16px rgba(255, 158, 0, 0.2)',
                }
              }}
            >
              <CardContent sx={{ 
                display: 'flex', 
                flexDirection: 'column', 
                alignItems: 'flex-start', 
                gap: 0.5,
                p: { xs: 1.5, md: 3 }
              }}>
                <Box sx={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  mb: { xs: 1, md: 2 },
                  width: '100%',
                  justifyContent: 'space-between'
                }}>
                  <Box sx={{ display: 'flex', alignItems: 'center' }}>
                    <Avatar sx={{ bgcolor: '#ff9e00', mr: { xs: 1, md: 2 }, width: { xs: 28, md: 40 }, height: { xs: 28, md: 40 } }}>
                      <MenuBookIcon sx={{ fontSize: { xs: 16, md: 24 } }} />
                    </Avatar>
                    <Typography variant="h6" fontWeight={500} sx={{ fontSize: { xs: '0.75rem', sm: '0.9rem', md: '1.25rem' } }}>Courses</Typography>
                  </Box>
                  {!isMobile && (
                    <MuiTooltip title="View all courses">
                      <IconButton 
                        color="warning" 
                        onClick={() => navigate('/admin/courses')} 
                        size="small"
                        sx={{ 
                          bgcolor: 'rgba(255,255,255,0.6)',
                          '&:hover': { bgcolor: 'rgba(255,255,255,0.9)' }
                        }}
                      >
                        <ArrowForwardIosIcon fontSize="small" />
                      </IconButton>
                    </MuiTooltip>
                  )}
                </Box>
                <Typography 
                  variant="h3" 
                  sx={{ 
                    fontWeight: 700,
                    fontSize: { xs: '1.5rem', sm: '2rem', md: '3rem' },
                    color: '#ed6c02',
                    textShadow: '1px 1px 2px rgba(0,0,0,0.1)'
                  }}
                >
                  {overview?.totalCourses || 0}
                </Typography>
                {!isMobile && (
                  <Typography variant="body2" color="text.secondary" fontWeight={500}>
                    Total available courses
                  </Typography>
                )}
              </CardContent>
            </Card>
          </Grid>
        )}
        
        {visibleMetrics.totalVideos && (
          <Grid item xs={6} sm={6} md={3}>
            <Card 
              elevation={2} 
              sx={{ 
                height: '100%',
                borderRadius: 2,
                background: 'linear-gradient(135deg, #f3e5f5 0%, #e1bee7 100%)',
                transition: 'all 0.3s ease',
                '&:hover': {
                  transform: isMobile ? 'none' : 'translateY(-5px)',
                  boxShadow: '0 8px 16px rgba(114, 9, 183, 0.2)',
                }
              }}
            >
              <CardContent sx={{ 
                display: 'flex', 
                flexDirection: 'column', 
                alignItems: 'flex-start', 
                gap: 0.5,
                p: { xs: 1.5, md: 3 }
              }}>
                <Box sx={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  mb: { xs: 1, md: 2 },
                  width: '100%',
                  justifyContent: 'space-between'
                }}>
                  <Box sx={{ display: 'flex', alignItems: 'center' }}>
                    <Avatar sx={{ bgcolor: '#7209b7', mr: { xs: 1, md: 2 }, width: { xs: 28, md: 40 }, height: { xs: 28, md: 40 } }}>
                      <MdVideoLibrary style={{ fontSize: isMobile ? 16 : 24 }} />
                    </Avatar>
                    <Typography variant="h6" fontWeight={500} sx={{ fontSize: { xs: '0.75rem', sm: '0.9rem', md: '1.25rem' } }}>Videos</Typography>
                  </Box>
                </Box>
                <Typography 
                  variant="h3" 
                  sx={{ 
                    fontWeight: 700,
                    fontSize: { xs: '1.5rem', sm: '2rem', md: '3rem' },
                    color: '#9c27b0',
                    textShadow: '1px 1px 2px rgba(0,0,0,0.1)'
                  }}
                >
                  {overview?.totalVideos || 0}
                </Typography>
                {!isMobile && (
                  <Typography variant="body2" color="text.secondary" fontWeight={500}>
                    Total uploaded videos
                  </Typography>
                )}
              </CardContent>
            </Card>
          </Grid>
        )}

        {/* Quiz Attempts Card */}
        {visibleMetrics.totalQuizAttempts && (
          <Grid item xs={6} sm={6} md={3}>
            <Card 
              elevation={2} 
              sx={{ 
                height: '100%',
                borderRadius: 2,
                background: 'linear-gradient(135deg, #fce4ec 0%, #f8bbd9 100%)',
                transition: 'all 0.3s ease',
                '&:hover': {
                  transform: isMobile ? 'none' : 'translateY(-5px)',
                  boxShadow: '0 8px 16px rgba(244, 67, 54, 0.2)',
                }
              }}
            >
              <CardContent sx={{ 
                display: 'flex', 
                flexDirection: 'column', 
                alignItems: 'flex-start', 
                gap: 0.5,
                p: { xs: 1.5, md: 3 }
              }}>
                <Box sx={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  mb: { xs: 1, md: 2 },
                  width: '100%',
                  justifyContent: 'space-between'
                }}>
                  <Box sx={{ display: 'flex', alignItems: 'center' }}>
                    <Avatar sx={{ bgcolor: '#d32f2f', mr: { xs: 1, md: 2 }, width: { xs: 28, md: 40 }, height: { xs: 28, md: 40 } }}>
                      <ShowChartIcon sx={{ fontSize: { xs: 16, md: 24 } }} />
                    </Avatar>
                    <Typography variant="h6" fontWeight={500} sx={{ fontSize: { xs: '0.75rem', sm: '0.9rem', md: '1.25rem' } }}>{isMobile ? "Quizzes" : "Quiz Attempts"}</Typography>
                  </Box>
                </Box>
                <Typography 
                  variant="h3" 
                  sx={{ 
                    fontWeight: 700,
                    fontSize: { xs: '1.5rem', sm: '2rem', md: '3rem' },
                    color: '#d32f2f',
                    textShadow: '1px 1px 2px rgba(0,0,0,0.1)'
                  }}
                >
                  {overview?.totalQuizAttempts || 0}
                </Typography>
                {!isMobile && (
                  <>
                    <Typography variant="body2" color="text.secondary" fontWeight={500}>
                      Total quiz attempts
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {overview?.studentsWithQuizzes || 0} students participated
                    </Typography>
                  </>
                )}
              </CardContent>
            </Card>
          </Grid>
        )}

        {/* Average Quiz Score Card */}
        {visibleMetrics.averageQuizScore && (
          <Grid item xs={6} sm={6} md={3}>
            <Card 
              elevation={2} 
              sx={{ 
                height: '100%',
                borderRadius: 2,
                background: 'linear-gradient(135deg, #e8f5e9 0%, #c8e6c9 100%)',
                transition: 'all 0.3s ease',
                '&:hover': {
                  transform: isMobile ? 'none' : 'translateY(-5px)',
                  boxShadow: '0 8px 16px rgba(76, 175, 80, 0.2)',
                }
              }}
            >
              <CardContent sx={{ 
                display: 'flex', 
                flexDirection: 'column', 
                alignItems: 'flex-start', 
                gap: 0.5,
                p: { xs: 1.5, md: 3 }
              }}>
                <Box sx={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  mb: { xs: 1, md: 2 },
                  width: '100%',
                  justifyContent: 'space-between'
                }}>
                  <Box sx={{ display: 'flex', alignItems: 'center' }}>
                    <Avatar sx={{ bgcolor: '#4caf50', mr: { xs: 1, md: 2 }, width: { xs: 28, md: 40 }, height: { xs: 28, md: 40 } }}>
                      <PieChartIcon sx={{ fontSize: { xs: 16, md: 24 } }} />
                    </Avatar>
                    <Typography variant="h6" fontWeight={500} sx={{ fontSize: { xs: '0.75rem', sm: '0.9rem', md: '1.25rem' } }}>{isMobile ? "Avg Score" : "Avg Quiz Score"}</Typography>
                  </Box>
                </Box>
                <Typography 
                  variant="h3" 
                  sx={{ 
                    fontWeight: 700,
                    fontSize: { xs: '1.5rem', sm: '2rem', md: '3rem' },
                    color: '#4caf50',
                    textShadow: '1px 1px 2px rgba(0,0,0,0.1)'
                  }}
                >
                  {overview?.averageQuizScore ? `${overview.averageQuizScore.toFixed(1)}%` : '0%'}
                </Typography>
                {!isMobile && (
                  <Typography variant="body2" color="text.secondary" fontWeight={500}>
                    Average quiz performance
                  </Typography>
                )}
              </CardContent>
            </Card>
          </Grid>
        )}
      </Grid>
    </>
  );

  if (summaryOnly) {
    return (
      <Box sx={{ px: { xs: 1, sm: 1.5, md: 2 }, py: { xs: 1.5, md: 2 }, bgcolor: 'transparent' }}>
        {summarySection}
      </Box>
    );
  }

  return (
    <Box sx={{ px: { xs: 1, sm: 1.5, md: 2 }, py: { xs: 1.5, md: 2 }, bgcolor: 'transparent' }}>
      {summarySection}
      
      <Divider sx={{ my: { xs: 2, md: 4 } }} />
      
      {/* Enhanced Charts Section */}
      <Grid container spacing={{ xs: 1.5, sm: 2, md: 3 }}>
        <Grid item xs={12} md={8}>
          <Card 
            elevation={3} 
            sx={{ 
              borderRadius: 2,
              overflow: 'hidden',
              transition: 'all 0.3s ease',
              border: '1px solid #6497b1',
              boxShadow: '0 6px 20px rgba(0, 91, 150, 0.2)',
              '&:hover': {
                boxShadow: '0 8px 25px rgba(0, 91, 150, 0.3)',
              }
            }}
          >
            <CardHeader
              avatar={
                <Avatar sx={{ bgcolor: theme.palette.primary.main, width: { xs: 32, md: 40 }, height: { xs: 32, md: 40 } }}>
                  <ShowChartIcon sx={{ fontSize: { xs: 18, md: 24 } }} />
                </Avatar>
              }
              title={isMobile ? "Enrollment Trend" : "Student Enrollment Trend"}
              titleTypographyProps={{ variant: 'h6', fontWeight: 500, fontSize: { xs: '0.9rem', md: '1.25rem' } }}
              sx={{ bgcolor: 'rgba(244, 247, 252, 0.7)', py: { xs: 1.5, md: 2 } }}
            />
            <Divider />
            <CardContent sx={{ p: { xs: 1, sm: 2, md: 3 } }}>
              <ResponsiveContainer width="100%" height={isMobile ? 220 : 320}>
                <LineChart 
                  data={trendData} 
                  margin={{ top: 10, right: isMobile ? 10 : 30, left: isMobile ? 0 : 20, bottom: 10 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.1)" />
                  <XAxis 
                    dataKey="name" 
                    tick={{ fill: '#666', fontSize: isMobile ? 10 : 12 }}
                    axisLine={{ stroke: '#ccc' }}
                  />
                  <YAxis 
                    tick={{ fill: '#666', fontSize: isMobile ? 10 : 12 }}
                    axisLine={{ stroke: '#ccc' }}
                    width={isMobile ? 30 : 40}
                  />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'rgba(255, 255, 255, 0.9)',
                      borderRadius: 8,
                      boxShadow: '0 4px 20px rgba(0, 0, 0, 0.15)',
                      border: 'none',
                      padding: isMobile ? 8 : 12,
                      fontSize: isMobile ? 12 : 14
                    }}
                    itemStyle={{ color: '#333' }}
                    labelStyle={{ color: '#666', fontWeight: 600, marginBottom: 5 }}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="Enrollments" 
                    stroke="#4361ee" 
                    strokeWidth={isMobile ? 2 : 3}
                    dot={{ 
                      fill: '#fff', 
                      stroke: '#4361ee', 
                      strokeWidth: 2, 
                      r: isMobile ? 3 : 5 
                    }}
                    activeDot={{ 
                      fill: '#4361ee', 
                      stroke: '#fff', 
                      strokeWidth: 2, 
                      r: isMobile ? 5 : 7 
                    }}
                    animationDuration={1500}
                  />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </Grid>
        
        <Grid item xs={12} md={4}>
          <Card 
            elevation={3} 
            sx={{ 
              height: '100%',
              borderRadius: 2,
              overflow: 'hidden',
              transition: 'all 0.3s ease',
              border: '1px solid #6497b1',
              boxShadow: '0 6px 20px rgba(0, 91, 150, 0.2)',
              '&:hover': {
                boxShadow: '0 8px 25px rgba(0, 91, 150, 0.3)',
              }
            }}
          >
            <CardHeader
              avatar={
                <Avatar sx={{ bgcolor: theme.palette.secondary.main, width: { xs: 32, md: 40 }, height: { xs: 32, md: 40 } }}>
                  <PieChartIcon sx={{ fontSize: { xs: 18, md: 24 } }} />
                </Avatar>
              }
              title="Top Courses"
              titleTypographyProps={{ variant: 'h6', fontWeight: 500, fontSize: { xs: '0.9rem', md: '1.25rem' } }}
              sx={{ bgcolor: 'rgba(244, 247, 252, 0.7)', py: { xs: 1.5, md: 2 } }}
            />
            <Divider />
            <CardContent sx={{ p: { xs: 1, md: 2 }, display: 'flex', justifyContent: 'center' }}>
              <Box sx={{ width: '100%', height: isMobile ? 250 : 300 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={Array.isArray(overview?.topCourses) ? overview.topCourses : []}
                      dataKey="enrollments"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      outerRadius={isMobile ? 70 : 100}
                      innerRadius={isMobile ? 30 : 40}
                      paddingAngle={4}
                      fill="#8884d8"
                      label={isMobile ? false : ({ name, percent }) => `${name || 'Unknown'}: ${(percent * 100).toFixed(0)}%`}
                      labelLine={!isMobile}
                      animationDuration={1500}
                      animationBegin={200}
                    >
                      {Array.isArray(overview?.topCourses) && overview.topCourses.map((entry, idx) => (
                        <Cell key={`cell-${idx}`} fill={COLORS[idx % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip 
                      formatter={(value, name, props) => [`${value} students`, props.payload.name]}
                      contentStyle={{ 
                        backgroundColor: 'rgba(255, 255, 255, 0.9)',
                        borderRadius: 8,
                        boxShadow: '0 4px 20px rgba(0, 0, 0, 0.15)',
                        border: 'none',
                        padding: isMobile ? 8 : 12,
                        fontSize: isMobile ? 12 : 14
                      }}
                    />
                    <Legend wrapperStyle={{ fontSize: isMobile ? 10 : 12 }} />
                  </PieChart>
                </ResponsiveContainer>
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
}

export default AnalyticsDashboard;
