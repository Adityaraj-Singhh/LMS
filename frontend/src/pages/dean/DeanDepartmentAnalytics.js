import React, { useState, useEffect } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Grid,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  CircularProgress,
  Alert,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  LinearProgress,
  Divider,
  Avatar,
  Button,
  Stack,
  alpha,
  Container,
  Fade,
  useTheme,
  useMediaQuery
} from '@mui/material';
import {
  School as SchoolIcon,
  Person as PersonIcon,
  People as PeopleIcon,
  Class as ClassIcon,
  TrendingUp as TrendingUpIcon,
  Assessment as AssessmentIcon,
  Download as DownloadIcon,
  EmojiEvents as TrophyIcon
} from '@mui/icons-material';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer
} from 'recharts';
import axios from 'axios';

const COLORS = ['#1976d2', '#388e3c', '#f57c00', '#7b1fa2', '#0288d1', '#689f38'];

const DeanDepartmentAnalytics = () => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const isTablet = useMediaQuery(theme.breakpoints.down('md'));
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [departments, setDepartments] = useState([]);
  const [selectedDepartment, setSelectedDepartment] = useState('');
  const [departmentData, setDepartmentData] = useState(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);

  useEffect(() => {
    fetchDepartments();
  }, []);

  useEffect(() => {
    if (selectedDepartment) {
      fetchDepartmentAnalytics(selectedDepartment);
    }
  }, [selectedDepartment]);

  const fetchDepartments = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      const response = await axios.get(
        '/api/dean/departments',
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setDepartments(response.data.departments || []);
      setLoading(false);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to fetch departments');
      setLoading(false);
    }
  };

  const fetchDepartmentAnalytics = async (deptId) => {
    try {
      setAnalyticsLoading(true);
      const token = localStorage.getItem('token');
      const response = await axios.get(
        `/api/dean/department-analytics/${deptId}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setDepartmentData(response.data);
      setAnalyticsLoading(false);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to fetch analytics');
      setAnalyticsLoading(false);
    }
  };

  const exportToCSV = () => {
    if (!departmentData) return;

    const csvData = [];
    csvData.push(['Department Analytics Report']);
    csvData.push([]);
    csvData.push(['Department', departmentData.department?.name]);
    csvData.push(['Code', departmentData.department?.code]);
    csvData.push(['HOD', departmentData.hod?.name || 'Not Assigned']);
    csvData.push([]);
    csvData.push(['Statistics']);
    csvData.push(['Total Teachers', departmentData.statistics?.totalTeachers]);
    csvData.push(['Total Courses', departmentData.statistics?.totalCourses]);
    csvData.push(['Total Sections', departmentData.statistics?.totalSections]);
    csvData.push(['Total Students', departmentData.statistics?.totalStudents]);

    const csv = csvData.map(row => row.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `department_analytics_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  };

  const getPerformanceColor = (performance) => {
    switch (performance) {
      case 'Excellent': return '#2e7d32';
      case 'Good': return '#1976d2';
      case 'Average': return '#ed6c02';
      case 'Poor': return '#d32f2f';
      default: return '#757575';
    }
  };

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
        <CircularProgress size={60} />
      </Box>
    );
  }

  return (
    <Container maxWidth="xl" sx={{ py: { xs: 2, sm: 4 }, px: { xs: 1, sm: 2, md: 3 } }}>
      {/* Header Section */}
      <Box sx={{ mb: { xs: 2, sm: 4 } }}>
        <Typography variant={isMobile ? "h5" : "h4"} sx={{ fontWeight: 700, mb: 1, color: '#1a237e', fontSize: { xs: '1.25rem', sm: '1.5rem', md: '2rem' } }}>
          📊 Department Analytics
        </Typography>
        <Typography variant="body1" color="text.secondary" sx={{ fontSize: { xs: '0.75rem', sm: '0.875rem' } }}>
          {isMobile ? 'Department insights' : 'Comprehensive department performance and insights'}
        </Typography>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 3, fontSize: { xs: '0.75rem', sm: '0.875rem' } }} onClose={() => setError('')}>
          {error}
        </Alert>
      )}

      {/* Department Selector */}
      <Card sx={{ mb: { xs: 2, sm: 4 }, boxShadow: 3 }}>
        <CardContent sx={{ p: { xs: 1.5, sm: 2, md: 3 } }}>
          <Grid container spacing={{ xs: 1.5, sm: 3 }} alignItems="center">
            <Grid item xs={12} md={8}>
              <FormControl fullWidth size={isMobile ? "small" : "medium"}>
                <InputLabel>Select Department</InputLabel>
                <Select
                  value={selectedDepartment}
                  onChange={(e) => setSelectedDepartment(e.target.value)}
                  label="Select Department"
                >
                  {departments.map((dept) => (
                    <MenuItem key={dept._id} value={dept._id}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: { xs: 1, sm: 2 } }}>
                        <SchoolIcon color="primary" sx={{ fontSize: { xs: 18, sm: 24 } }} />
                        <Box>
                          <Typography variant="body1" fontWeight={600} sx={{ fontSize: { xs: '0.85rem', sm: '1rem' } }}>
                            {dept.name}
                          </Typography>
                          {!isMobile && (
                            <Typography variant="caption" color="text.secondary">
                              {dept.code}
                            </Typography>
                          )}
                        </Box>
                      </Box>
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} md={4}>
              <Button
                fullWidth
                variant="contained"
                size={isMobile ? "small" : "medium"}
                startIcon={<DownloadIcon />}
                onClick={exportToCSV}
                disabled={!departmentData}
                sx={{ height: { xs: 40, sm: 56 }, fontSize: { xs: '0.75rem', sm: '0.875rem' } }}
              >
                {isMobile ? "Export" : "Export Report"}
              </Button>
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      {analyticsLoading && (
        <Box display="flex" justifyContent="center" py={8}>
          <CircularProgress size={60} />
        </Box>
      )}

      {departmentData && !analyticsLoading && (
        <Fade in={true} timeout={800}>
          <Box>
            {/* Department Info Card */}
            <Card sx={{ mb: { xs: 2, sm: 4 }, background: 'linear-gradient(135deg, #1976d2 0%, #1565c0 100%)', color: 'white', boxShadow: 4 }}>
              <CardContent sx={{ p: { xs: 2, sm: 4 } }}>
                <Grid container spacing={{ xs: 2, sm: 3 }}>
                  <Grid item xs={12} md={8}>
                    <Stack spacing={1}>
                      <Typography variant={isMobile ? "h6" : "h5"} fontWeight={700}>
                        {departmentData.department?.name}
                      </Typography>
                      <Typography variant={isMobile ? "body1" : "h6"} sx={{ opacity: 0.9 }}>
                        {departmentData.department?.code}
                      </Typography>
                      {!isMobile && (
                        <Typography variant="body2" sx={{ opacity: 0.8 }}>
                          {departmentData.department?.schoolName}
                        </Typography>
                      )}
                    </Stack>
                  </Grid>
                  <Grid item xs={12} md={4}>
                    <Paper sx={{ p: { xs: 1.5, sm: 2 }, bgcolor: alpha('#fff', 0.2), color: 'white' }}>
                      <Typography variant="subtitle2" sx={{ opacity: 0.9, mb: 0.5, fontSize: { xs: '0.7rem', sm: '0.875rem' } }}>
                        {isMobile ? 'HOD' : 'Head of Department'}
                      </Typography>
                      <Typography variant={isMobile ? "body1" : "h6"} fontWeight={600}>
                        {departmentData.hod?.name || 'Not Assigned'}
                      </Typography>
                      {!isMobile && (
                        <Typography variant="body2" sx={{ opacity: 0.8 }}>
                          {departmentData.hod?.email || 'N/A'}
                        </Typography>
                      )}
                    </Paper>
                  </Grid>
                </Grid>
              </CardContent>
            </Card>

            {/* Statistics Cards */}
            <Grid container spacing={{ xs: 1.5, sm: 3 }} sx={{ mb: { xs: 2, sm: 4 } }}>
              <Grid item xs={6} sm={6} md={3}>
                <Card sx={{ 
                  background: '#1976d2',
                  color: 'white',
                  boxShadow: 2,
                  transition: 'transform 0.2s, box-shadow 0.2s',
                  '&:hover': { transform: isMobile ? 'none' : 'translateY(-4px)', boxShadow: 4 }
                }}>
                  <CardContent sx={{ p: { xs: 1.5, sm: 2 } }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <Box>
                        <Typography variant="body2" sx={{ opacity: 0.9, fontSize: { xs: '0.65rem', sm: '0.875rem' } }}>Teachers</Typography>
                        <Typography variant={isMobile ? "h5" : "h3"} fontWeight={700} sx={{ mt: 0.5 }}>
                          {departmentData.statistics?.totalTeachers || 0}
                        </Typography>
                      </Box>
                      <PersonIcon sx={{ fontSize: { xs: 32, sm: 60 }, opacity: 0.3 }} />
                    </Box>
                  </CardContent>
                </Card>
              </Grid>

              <Grid item xs={6} sm={6} md={3}>
                <Card sx={{ 
                  background: '#388e3c',
                  color: 'white',
                  boxShadow: 2,
                  transition: 'transform 0.2s, box-shadow 0.2s',
                  '&:hover': { transform: isMobile ? 'none' : 'translateY(-4px)', boxShadow: 4 }
                }}>
                  <CardContent sx={{ p: { xs: 1.5, sm: 2 } }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <Box>
                        <Typography variant="body2" sx={{ opacity: 0.9, fontSize: { xs: '0.65rem', sm: '0.875rem' } }}>Courses</Typography>
                        <Typography variant={isMobile ? "h5" : "h3"} fontWeight={700} sx={{ mt: 0.5 }}>
                          {departmentData.statistics?.totalCourses || 0}
                        </Typography>
                      </Box>
                      <ClassIcon sx={{ fontSize: { xs: 32, sm: 60 }, opacity: 0.3 }} />
                    </Box>
                  </CardContent>
                </Card>
              </Grid>

              <Grid item xs={6} sm={6} md={3}>
                <Card sx={{ 
                  background: '#f57c00',
                  color: 'white',
                  boxShadow: 2,
                  transition: 'transform 0.2s, box-shadow 0.2s',
                  '&:hover': { transform: isMobile ? 'none' : 'translateY(-4px)', boxShadow: 4 }
                }}>
                  <CardContent sx={{ p: { xs: 1.5, sm: 2 } }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <Box>
                        <Typography variant="body2" sx={{ opacity: 0.9, fontSize: { xs: '0.65rem', sm: '0.875rem' } }}>Sections</Typography>
                        <Typography variant={isMobile ? "h5" : "h3"} fontWeight={700} sx={{ mt: 0.5 }}>
                          {departmentData.statistics?.totalSections || 0}
                        </Typography>
                      </Box>
                      <SchoolIcon sx={{ fontSize: { xs: 32, sm: 60 }, opacity: 0.3 }} />
                    </Box>
                  </CardContent>
                </Card>
              </Grid>

              <Grid item xs={6} sm={6} md={3}>
                <Card sx={{ 
                  background: '#7b1fa2',
                  color: 'white',
                  boxShadow: 2,
                  transition: 'transform 0.2s, box-shadow 0.2s',
                  '&:hover': { transform: isMobile ? 'none' : 'translateY(-4px)', boxShadow: 4 }
                }}>
                  <CardContent sx={{ p: { xs: 1.5, sm: 2 } }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <Box>
                        <Typography variant="body2" sx={{ opacity: 0.9, fontSize: { xs: '0.65rem', sm: '0.875rem' } }}>Students</Typography>
                        <Typography variant={isMobile ? "h5" : "h3"} fontWeight={700} sx={{ mt: 0.5 }}>
                          {departmentData.statistics?.totalStudents || 0}
                        </Typography>
                      </Box>
                      <PeopleIcon sx={{ fontSize: { xs: 32, sm: 60 }, opacity: 0.3 }} />
                    </Box>
                  </CardContent>
                </Card>
              </Grid>
            </Grid>

            {/* Teachers List */}
            {departmentData.teachers && departmentData.teachers.length > 0 && (
              <Card sx={{ mb: { xs: 2, sm: 4 }, boxShadow: 3 }}>
                <CardContent sx={{ p: { xs: 1.5, sm: 2, md: 3 } }}>
                  <Typography variant={isMobile ? "body1" : "h6"} fontWeight={700} sx={{ mb: { xs: 2, sm: 3 }, display: 'flex', alignItems: 'center', gap: 1, fontSize: { xs: '0.9rem', sm: '1.25rem' } }}>
                    <PersonIcon color="primary" sx={{ fontSize: { xs: 18, sm: 24 } }} />
                    Faculty ({departmentData.teachers.length})
                  </Typography>
                  <TableContainer sx={{ maxHeight: { xs: 300, sm: 'none' } }}>
                    <Table size={isMobile ? "small" : "medium"}>
                      <TableHead>
                        <TableRow sx={{ bgcolor: alpha('#667eea', 0.1) }}>
                          <TableCell sx={{ fontSize: { xs: '0.7rem', sm: '0.875rem' } }}><strong>Teacher</strong></TableCell>
                          {!isMobile && <TableCell><strong>Email</strong></TableCell>}
                          <TableCell align="center" sx={{ fontSize: { xs: '0.7rem', sm: '0.875rem' } }}><strong>Sections</strong></TableCell>
                          {!isMobile && <TableCell><strong>Courses Teaching</strong></TableCell>}
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {departmentData.teachers.map((teacher, idx) => (
                          <TableRow key={teacher._id} hover sx={{ '&:nth-of-type(odd)': { bgcolor: alpha('#667eea', 0.02) } }}>
                            <TableCell>
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: { xs: 1, sm: 2 } }}>
                                <Avatar sx={{ bgcolor: COLORS[idx % COLORS.length], width: { xs: 28, sm: 40 }, height: { xs: 28, sm: 40 }, fontSize: { xs: '0.75rem', sm: '1rem' } }}>
                                  {teacher.name?.charAt(0)}
                                </Avatar>
                                <Typography fontWeight={600} sx={{ fontSize: { xs: '0.75rem', sm: '1rem' } }}>{teacher.name}</Typography>
                              </Box>
                            </TableCell>
                            {!isMobile && <TableCell sx={{ fontSize: '0.875rem' }}>{teacher.email}</TableCell>}
                            <TableCell align="center">
                              <Chip label={teacher.sectionsCount} color="primary" size="small" sx={{ fontSize: { xs: '0.65rem', sm: '0.75rem' } }} />
                            </TableCell>
                            {!isMobile && (
                              <TableCell>
                                <Stack direction="row" spacing={0.5} flexWrap="wrap">
                                  {teacher.courses?.slice(0, 3).map((course, i) => (
                                    <Chip
                                      key={i}
                                      label={course.courseCode || course}
                                      size="small"
                                      variant="outlined"
                                      sx={{ mb: 0.5, fontSize: '0.7rem' }}
                                    />
                                  ))}
                                  {teacher.courses?.length > 3 && (
                                    <Chip label={`+${teacher.courses.length - 3}`} size="small" variant="outlined" sx={{ mb: 0.5, fontSize: '0.7rem' }} />
                                  )}
                                  {(!teacher.courses || teacher.courses.length === 0) && (
                                    <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.75rem' }}>No courses</Typography>
                                  )}
                                </Stack>
                              </TableCell>
                            )}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                </CardContent>
              </Card>
            )}

            {/* Course Performance */}
            {departmentData.courses && departmentData.courses.length > 0 && (
              <Card sx={{ mb: { xs: 2, sm: 4 }, boxShadow: 3 }}>
                <CardContent sx={{ p: { xs: 1.5, sm: 2, md: 3 } }}>
                  <Typography variant={isMobile ? "body1" : "h6"} fontWeight={700} sx={{ mb: { xs: 2, sm: 3 }, display: 'flex', alignItems: 'center', gap: 1, fontSize: { xs: '0.9rem', sm: '1.25rem' } }}>
                    <ClassIcon color="primary" sx={{ fontSize: { xs: 18, sm: 24 } }} />
                    Course Performance
                  </Typography>
                  <TableContainer sx={{ maxHeight: { xs: 300, sm: 'none' } }}>
                    <Table size={isMobile ? "small" : "medium"}>
                      <TableHead>
                        <TableRow sx={{ bgcolor: alpha('#f093fb', 0.1) }}>
                          <TableCell sx={{ fontSize: { xs: '0.7rem', sm: '0.875rem' } }}><strong>Course</strong></TableCell>
                          {!isMobile && <TableCell align="center"><strong>Sections</strong></TableCell>}
                          <TableCell align="center" sx={{ fontSize: { xs: '0.7rem', sm: '0.875rem' } }}><strong>{isMobile ? 'Std' : 'Students'}</strong></TableCell>
                          <TableCell sx={{ fontSize: { xs: '0.7rem', sm: '0.875rem' } }}><strong>{isMobile ? 'Prog' : 'Video Progress'}</strong></TableCell>
                          {!isMobile && <TableCell><strong>Quiz Performance</strong></TableCell>}
                          <TableCell align="center" sx={{ fontSize: { xs: '0.7rem', sm: '0.875rem' } }}><strong>{isMobile ? 'Avg' : 'Overall'}</strong></TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {departmentData.courses.map((course) => (
                          <TableRow key={course.courseId} hover sx={{ '&:nth-of-type(odd)': { bgcolor: alpha('#f093fb', 0.02) } }}>
                            <TableCell>
                              <Typography fontWeight={600} sx={{ fontSize: { xs: '0.75rem', sm: '1rem' } }}>{course.courseCode}</Typography>
                              {!isMobile && (
                                <Typography variant="caption" color="text.secondary">
                                  {course.courseTitle}
                                </Typography>
                              )}
                            </TableCell>
                            {!isMobile && (
                              <TableCell align="center">
                                <Chip label={course.sectionsCount} size="small" color="info" />
                              </TableCell>
                            )}
                            <TableCell align="center">
                              <Chip label={course.totalStudents} size="small" sx={{ fontSize: { xs: '0.65rem', sm: '0.75rem' } }} />
                            </TableCell>
                            <TableCell>
                              <Box>
                                <LinearProgress 
                                  variant="determinate" 
                                  value={course.overallProgress || 0} 
                                  sx={{ height: { xs: 4, sm: 8 }, borderRadius: 4, mb: 0.5 }}
                                />
                                <Typography variant="caption" sx={{ fontSize: { xs: '0.6rem', sm: '0.75rem' } }}>
                                  {Math.round(course.overallProgress || 0)}%
                                </Typography>
                              </Box>
                            </TableCell>
                            {!isMobile && (
                              <TableCell>
                                <Box>
                                  <LinearProgress 
                                    variant="determinate" 
                                    value={course.overallQuizMarks || 0} 
                                    color="secondary"
                                    sx={{ height: 8, borderRadius: 4, mb: 0.5 }}
                                  />
                                  <Typography variant="caption">
                                    {Math.round(course.overallQuizMarks || 0)}%
                                  </Typography>
                                </Box>
                              </TableCell>
                            )}
                            <TableCell align="center">
                              <Chip 
                                label={`${Math.round(((course.overallProgress || 0) + (course.overallQuizMarks || 0)) / 2)}%`}
                                color={((course.overallProgress || 0) + (course.overallQuizMarks || 0)) / 2 >= 75 ? 'success' : 
                                       ((course.overallProgress || 0) + (course.overallQuizMarks || 0)) / 2 >= 60 ? 'primary' : 'warning'}
                                size="small"
                                sx={{ fontSize: { xs: '0.65rem', sm: '0.75rem' } }}
                              />
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                </CardContent>
              </Card>
            )}

            {/* Section Performance Comparison */}
            {departmentData.sectionPerformance && departmentData.sectionPerformance.length > 0 && (
              <Grid container spacing={{ xs: 2, sm: 3 }} sx={{ mb: { xs: 2, sm: 4 } }}>
                <Grid item xs={12} lg={8}>
                  <Card sx={{ boxShadow: 3 }}>
                    <CardContent sx={{ p: { xs: 1.5, sm: 2, md: 3 } }}>
                      <Typography variant={isMobile ? "body1" : "h6"} fontWeight={700} sx={{ mb: { xs: 2, sm: 3 }, fontSize: { xs: '0.9rem', sm: '1.25rem' } }}>
                        Section Performance
                      </Typography>
                      <ResponsiveContainer width="100%" height={isMobile ? 250 : 400}>
                        <BarChart data={departmentData.sectionPerformance.slice(0, isMobile ? 5 : 10)}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                          <XAxis dataKey="sectionName" angle={-15} textAnchor="end" height={isMobile ? 50 : 80} tick={{ fontSize: isMobile ? 10 : 12 }} />
                          <YAxis domain={[0, 100]} tick={{ fontSize: isMobile ? 10 : 12 }} />
                          <Tooltip />
                          {!isMobile && <Legend />}
                          <Bar dataKey="avgProgress" fill="#1976d2" name="Avg Progress %" radius={[8, 8, 0, 0]} />
                          <Bar dataKey="avgMarks" fill="#388e3c" name="Avg Marks %" radius={[8, 8, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>
                </Grid>

                <Grid item xs={12} lg={4}>
                  <Stack spacing={{ xs: 2, sm: 3 }}>
                    {/* Best Sections */}
                    <Card sx={{ boxShadow: 3, borderTop: '4px solid #2e7d32' }}>
                      <CardContent sx={{ p: { xs: 1.5, sm: 2 } }}>
                        <Typography variant={isMobile ? "body1" : "h6"} fontWeight={700} sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 1, fontSize: { xs: '0.9rem', sm: '1.25rem' } }}>
                          <TrophyIcon sx={{ color: '#ffd700', fontSize: { xs: 18, sm: 24 } }} />
                          Top Performers
                        </Typography>
                        {departmentData.bestSections?.slice(0, 3).map((section, idx) => (
                          <Box key={idx} sx={{ mb: 1.5, p: { xs: 1, sm: 2 }, bgcolor: alpha('#2e7d32', 0.1), borderRadius: 2 }}>
                            <Typography variant="body2" fontWeight={600} color="success.main" sx={{ fontSize: { xs: '0.75rem', sm: '0.875rem' } }}>
                              {section.sectionName}
                            </Typography>
                            <Typography variant="caption" color="text.secondary" sx={{ fontSize: { xs: '0.65rem', sm: '0.75rem' } }}>
                              {Math.round(section.avgProgress)}% | {Math.round(section.avgMarks)}%
                            </Typography>
                          </Box>
                        ))}
                      </CardContent>
                    </Card>

                    {/* Worst Sections */}
                    <Card sx={{ boxShadow: 3, borderTop: '4px solid #ed6c02' }}>
                      <CardContent sx={{ p: { xs: 1.5, sm: 2 } }}>
                        <Typography variant={isMobile ? "body1" : "h6"} fontWeight={700} sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 1, fontSize: { xs: '0.9rem', sm: '1.25rem' } }}>
                          <TrendingUpIcon sx={{ color: '#ed6c02', fontSize: { xs: 18, sm: 24 } }} />
                          Needs Attention
                        </Typography>
                        {departmentData.worstSections?.slice(0, 3).map((section, idx) => (
                          <Box key={idx} sx={{ mb: 1.5, p: { xs: 1, sm: 2 }, bgcolor: alpha('#ed6c02', 0.1), borderRadius: 2 }}>
                            <Typography variant="body2" fontWeight={600} color="warning.main" sx={{ fontSize: { xs: '0.75rem', sm: '0.875rem' } }}>
                              {section.sectionName}
                            </Typography>
                            <Typography variant="caption" color="text.secondary" sx={{ fontSize: { xs: '0.65rem', sm: '0.75rem' } }}>
                              {Math.round(section.avgProgress)}% | {Math.round(section.avgMarks)}%
                            </Typography>
                          </Box>
                        ))}
                      </CardContent>
                    </Card>
                  </Stack>
                </Grid>
              </Grid>
            )}

            {/* Detailed Section Performance */}
            {departmentData.sectionPerformance && departmentData.sectionPerformance.length > 0 && (
              <Card sx={{ boxShadow: 3 }}>
                <CardContent sx={{ p: { xs: 1.5, sm: 2, md: 3 } }}>
                  <Typography variant={isMobile ? "body1" : "h6"} fontWeight={700} sx={{ mb: { xs: 2, sm: 3 }, display: 'flex', alignItems: 'center', gap: 1, fontSize: { xs: '0.9rem', sm: '1.25rem' } }}>
                    <AssessmentIcon color="primary" sx={{ fontSize: { xs: 18, sm: 24 } }} />
                    Section Details
                  </Typography>
                  <TableContainer sx={{ maxHeight: { xs: 300, sm: 'none' } }}>
                    <Table size={isMobile ? "small" : "medium"}>
                      <TableHead>
                        <TableRow sx={{ bgcolor: alpha('#667eea', 0.1) }}>
                          <TableCell sx={{ fontSize: { xs: '0.7rem', sm: '0.875rem' } }}><strong>Section</strong></TableCell>
                          {!isMobile && <TableCell><strong>Course</strong></TableCell>}
                          <TableCell align="center" sx={{ fontSize: { xs: '0.7rem', sm: '0.875rem' } }}><strong>{isMobile ? 'Std' : 'Students'}</strong></TableCell>
                          <TableCell align="center" sx={{ fontSize: { xs: '0.7rem', sm: '0.875rem' } }}><strong>{isMobile ? 'Prog' : 'Avg Progress'}</strong></TableCell>
                          {!isMobile && <TableCell align="center"><strong>Avg Marks</strong></TableCell>}
                          <TableCell align="center" sx={{ fontSize: { xs: '0.7rem', sm: '0.875rem' } }}><strong>{isMobile ? 'Perf' : 'Performance'}</strong></TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {departmentData.sectionPerformance.map((section, idx) => (
                          <TableRow key={idx} hover sx={{ '&:nth-of-type(odd)': { bgcolor: alpha('#667eea', 0.02) } }}>
                            <TableCell>
                              <Typography fontWeight={600} sx={{ fontSize: { xs: '0.75rem', sm: '1rem' } }}>{section.sectionName}</Typography>
                            </TableCell>
                            {!isMobile && (
                              <TableCell>
                                <Typography variant="body2">{section.courseName}</Typography>
                              </TableCell>
                            )}
                            <TableCell align="center">
                              <Chip label={section.studentCount} size="small" sx={{ fontSize: { xs: '0.65rem', sm: '0.75rem' } }} />
                            </TableCell>
                            <TableCell align="center">
                              <Chip 
                                label={`${Math.round(section.avgProgress)}%`}
                                size="small"
                                sx={{ minWidth: { xs: 40, sm: 60 }, fontSize: { xs: '0.65rem', sm: '0.75rem' } }}
                              />
                            </TableCell>
                            {!isMobile && (
                              <TableCell align="center">
                                <Chip 
                                  label={`${Math.round(section.avgMarks)}%`}
                                  size="small"
                                  sx={{ minWidth: 60 }}
                                />
                              </TableCell>
                            )}
                            <TableCell align="center">
                              <Chip 
                                label={isMobile ? section.performance?.charAt(0) : section.performance}
                                size="small"
                                sx={{ 
                                  bgcolor: getPerformanceColor(section.performance),
                                  color: 'white',
                                  fontWeight: 600,
                                  fontSize: { xs: '0.65rem', sm: '0.75rem' }
                                }}
                              />
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                </CardContent>
              </Card>
            )}
          </Box>
        </Fade>
      )}

      {!selectedDepartment && !loading && (
        <Card sx={{ textAlign: 'center', py: { xs: 4, sm: 8 }, boxShadow: 3 }}>
          <CardContent>
            <SchoolIcon sx={{ fontSize: { xs: 50, sm: 80 }, color: '#667eea', mb: 2 }} />
            <Typography variant={isMobile ? "h6" : "h5"} fontWeight={600} gutterBottom>
              Select a Department
            </Typography>
            <Typography variant="body1" color="text.secondary" sx={{ fontSize: { xs: '0.75rem', sm: '1rem' } }}>
              {isMobile ? 'Choose a department above' : 'Choose a department from the dropdown above to view detailed analytics'}
            </Typography>
          </CardContent>
        </Card>
      )}
    </Container>
  );
};

export default DeanDepartmentAnalytics;
