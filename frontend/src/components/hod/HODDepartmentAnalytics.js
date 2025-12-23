import React, { useState, useEffect } from 'react';
import {
  Paper,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  CircularProgress,
  Alert,
  Box,
  Card,
  CardContent,
  Grid,
  LinearProgress,
  Chip,
  IconButton,
  Tooltip,
  useTheme,
  useMediaQuery
} from '@mui/material';
import {
  School as SchoolIcon,
  MenuBook as CourseIcon,
  People as PeopleIcon,
  Assessment as AssessmentIcon,
  Visibility as ViewIcon
} from '@mui/icons-material';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';

const HODDepartmentAnalytics = () => {
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const navigate = useNavigate();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const isTablet = useMediaQuery(theme.breakpoints.down('md'));

  useEffect(() => {
    fetchDepartmentAnalytics();
  }, []);

  const fetchDepartmentAnalytics = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const token = localStorage.getItem('token');
      const response = await axios.get(
        '/api/hod-analytics/department-analytics',
        {
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      );

      console.log('Department Analytics Response:', response.data);
      setAnalytics(response.data);
    } catch (err) {
      console.error('Error fetching department analytics:', err);
      setError(err.response?.data?.message || 'Failed to fetch department analytics');
    } finally {
      setLoading(false);
    }
  };

  const getProgressColor = (color) => {
    switch (color) {
      case 'green':
        return '#4caf50';
      case 'yellow':
        return '#ff9800';
      case 'red':
        return '#f44336';
      default:
        return '#9e9e9e';
    }
  };

  const handleViewCourse = (courseId) => {
    // Navigate to course analytics with pre-selected course
    navigate('/hod/course-analytics', { state: { courseId } });
  };

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Alert severity="error" sx={{ m: 2 }}>
        {error}
      </Alert>
    );
  }

  if (!analytics) {
    return (
      <Alert severity="info" sx={{ m: 2 }}>
        No analytics data available
      </Alert>
    );
  }

  const { department, totalCourses, courses } = analytics;

  return (
    <Box sx={{ p: { xs: 1.5, sm: 2, md: 3 } }}>
      {/* Header Section */}
      <Box sx={{ mb: { xs: 2, sm: 4 } }}>
        <Typography variant={isMobile ? "h5" : "h4"} gutterBottom sx={{ fontSize: { xs: '1.25rem', sm: '1.5rem', md: '2rem' } }}>
          Department Analytics
        </Typography>
        <Typography variant="subtitle1" color="text.secondary" sx={{ fontSize: { xs: '0.8rem', sm: '1rem' } }}>
          {department.name} - {department.school?.name || 'N/A'}
        </Typography>
      </Box>

      {/* Summary Cards */}
      <Grid container spacing={{ xs: 1.5, sm: 2, md: 3 }} sx={{ mb: { xs: 2, sm: 4 } }}>
        <Grid item xs={6} sm={6} md={3}>
          <Card>
            <CardContent sx={{ p: { xs: 1.5, sm: 2 } }}>
              <Box display="flex" alignItems="center" justifyContent="space-between">
                <Box>
                  <Typography color="text.secondary" variant="body2" sx={{ fontSize: { xs: '0.7rem', sm: '0.875rem' } }}>
                    Total Courses
                  </Typography>
                  <Typography variant={isMobile ? "h5" : "h4"}>
                    {totalCourses}
                  </Typography>
                </Box>
                <CourseIcon sx={{ fontSize: { xs: 32, sm: 48 }, color: 'primary.main', opacity: 0.3 }} />
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={6} sm={6} md={3}>
          <Card>
            <CardContent sx={{ p: { xs: 1.5, sm: 2 } }}>
              <Box display="flex" alignItems="center" justifyContent="space-between">
                <Box>
                  <Typography color="text.secondary" variant="body2" sx={{ fontSize: { xs: '0.7rem', sm: '0.875rem' } }}>
                    Total Students
                  </Typography>
                  <Typography variant={isMobile ? "h5" : "h4"}>
                    {courses.reduce((sum, course) => sum + course.totalStudents, 0)}
                  </Typography>
                </Box>
                <PeopleIcon sx={{ fontSize: { xs: 32, sm: 48 }, color: 'success.main', opacity: 0.3 }} />
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={6} sm={6} md={3}>
          <Card>
            <CardContent sx={{ p: { xs: 1.5, sm: 2 } }}>
              <Box display="flex" alignItems="center" justifyContent="space-between">
                <Box>
                  <Typography color="text.secondary" variant="body2" sx={{ fontSize: { xs: '0.7rem', sm: '0.875rem' } }}>
                    Total Sections
                  </Typography>
                  <Typography variant={isMobile ? "h5" : "h4"}>
                    {courses.reduce((sum, course) => sum + course.sections, 0)}
                  </Typography>
                </Box>
                <SchoolIcon sx={{ fontSize: { xs: 32, sm: 48 }, color: 'info.main', opacity: 0.3 }} />
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={6} sm={6} md={3}>
          <Card>
            <CardContent sx={{ p: { xs: 1.5, sm: 2 } }}>
              <Box display="flex" alignItems="center" justifyContent="space-between">
                <Box>
                  <Typography color="text.secondary" variant="body2" sx={{ fontSize: { xs: '0.7rem', sm: '0.875rem' } }}>
                    Avg Progress
                  </Typography>
                  <Typography variant={isMobile ? "h5" : "h4"}>
                    {courses.length > 0 
                      ? (courses.reduce((sum, course) => sum + course.averageProgress, 0) / courses.length).toFixed(1)
                      : 0}%
                  </Typography>
                </Box>
                <AssessmentIcon sx={{ fontSize: { xs: 32, sm: 48 }, color: 'warning.main', opacity: 0.3 }} />
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Courses Table */}
      <Paper>
        <TableContainer sx={{ overflowX: 'auto' }}>
          <Table size={isMobile ? "small" : "medium"}>
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontSize: { xs: '0.7rem', sm: '0.875rem' }, fontWeight: 'bold' }}>Course Code</TableCell>
                {!isMobile && <TableCell><strong>Course Title</strong></TableCell>}
                <TableCell align="center" sx={{ fontSize: { xs: '0.7rem', sm: '0.875rem' }, fontWeight: 'bold' }}>Sections</TableCell>
                <TableCell align="center" sx={{ fontSize: { xs: '0.7rem', sm: '0.875rem' }, fontWeight: 'bold' }}>Students</TableCell>
                {!isMobile && !isTablet && <TableCell><strong>Teachers</strong></TableCell>}
                {!isMobile && <TableCell align="center"><strong>Videos</strong></TableCell>}
                {!isMobile && <TableCell align="center"><strong>Quizzes</strong></TableCell>}
                <TableCell sx={{ fontSize: { xs: '0.7rem', sm: '0.875rem' }, fontWeight: 'bold' }}>Progress</TableCell>
                <TableCell align="center" sx={{ fontSize: { xs: '0.7rem', sm: '0.875rem' }, fontWeight: 'bold' }}>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {courses.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={isMobile ? 5 : 9} align="center">
                    <Typography color="text.secondary">
                      No courses found in this department
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : (
                courses.map((course) => (
                  <TableRow key={course.courseId} hover>
                    <TableCell>
                      <Chip 
                        label={course.courseCode} 
                        size="small" 
                        variant="outlined"
                        sx={{ fontSize: { xs: '0.65rem', sm: '0.8rem' } }}
                      />
                    </TableCell>
                    {!isMobile && (
                      <TableCell>
                        <Typography variant="body2" fontWeight="500" sx={{ 
                          maxWidth: 200, 
                          overflow: 'hidden', 
                          textOverflow: 'ellipsis', 
                          whiteSpace: 'nowrap' 
                        }}>
                          {course.courseTitle}
                        </Typography>
                      </TableCell>
                    )}
                    <TableCell align="center">
                      <Chip 
                        label={course.sections} 
                        size="small" 
                        color="primary"
                        sx={{ fontSize: { xs: '0.65rem', sm: '0.8rem' } }}
                      />
                    </TableCell>
                    <TableCell align="center">
                      <Chip 
                        label={course.totalStudents} 
                        size="small" 
                        color="success"
                        sx={{ fontSize: { xs: '0.65rem', sm: '0.8rem' } }}
                      />
                    </TableCell>
                    {!isMobile && !isTablet && (
                      <TableCell>
                        <Box>
                          {course.teachers.length === 0 ? (
                            <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.75rem' }}>
                              No teachers
                            </Typography>
                          ) : (
                            course.teachers.slice(0, 2).map((teacher, index) => (
                              <Typography 
                                key={teacher.id} 
                                variant="body2"
                                sx={{ fontSize: '0.75rem' }}
                              >
                                {teacher.name}
                                {index < Math.min(course.teachers.length - 1, 1) && ', '}
                                {index === 1 && course.teachers.length > 2 && `+${course.teachers.length - 2}`}
                              </Typography>
                            ))
                          )}
                        </Box>
                      </TableCell>
                    )}
                    {!isMobile && (
                      <TableCell align="center" sx={{ fontSize: '0.8rem' }}>
                        {course.totalVideos || 0}
                      </TableCell>
                    )}
                    {!isMobile && (
                      <TableCell align="center" sx={{ fontSize: '0.8rem' }}>
                        {course.totalQuizzes || 0}
                      </TableCell>
                    )}
                    <TableCell>
                      <Box sx={{ minWidth: { xs: 80, sm: 200 } }}>
                        <Box display="flex" alignItems="center" justifyContent="space-between" mb={0.5}>
                          <Typography 
                            variant="body2" 
                            fontWeight="600"
                            sx={{ color: getProgressColor(course.progressColor), fontSize: { xs: '0.7rem', sm: '0.875rem' } }}
                          >
                            {course.averageProgress.toFixed(1)}%
                          </Typography>
                        </Box>
                        <LinearProgress 
                          variant="determinate" 
                          value={course.averageProgress} 
                          sx={{
                            height: { xs: 4, sm: 8 },
                            borderRadius: 4,
                            backgroundColor: '#e0e0e0',
                            '& .MuiLinearProgress-bar': {
                              backgroundColor: getProgressColor(course.progressColor),
                              borderRadius: 4,
                            }
                          }}
                        />
                      </Box>
                    </TableCell>
                    <TableCell align="center">
                      <Tooltip title="View detailed analytics">
                        <IconButton 
                          size="small" 
                          onClick={() => handleViewCourse(course.courseId)}
                          color="primary"
                        >
                          <ViewIcon fontSize={isMobile ? "small" : "medium"} />
                        </IconButton>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>
    </Box>
  );
};

export default HODDepartmentAnalytics;
