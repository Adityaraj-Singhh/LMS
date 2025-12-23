#!/bin/bash

# Create enhanced analytics with quiz data
cat > /tmp/enhanced_analytics_update.js << 'EOF'
import React, { useState, useEffect } from 'react';
import {
  Box, Typography, Paper, Grid, Card, CardContent, Divider,
  TextField, Button, CircularProgress, Tabs, Tab, Table,
  TableBody, TableCell, TableContainer, TableHead, TableRow,
  Autocomplete, IconButton, Tooltip, Select, MenuItem, InputLabel,
  FormControl, List, ListItem, ListItemText, ListItemIcon,
  Chip, Collapse, ExpandMore, ExpandLess
} from '@mui/material';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip,
  ResponsiveContainer, PieChart, Pie, Cell, BarChart, Bar, Legend,
  AreaChart, Area
} from 'recharts';
import SearchIcon from '@mui/icons-material/Search';
import VisibilityIcon from '@mui/icons-material/Visibility';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import SchoolIcon from '@mui/icons-material/School';
import OndemandVideoIcon from '@mui/icons-material/OndemandVideo';
import PeopleIcon from '@mui/icons-material/People';
import PersonIcon from '@mui/icons-material/Person';
import CalendarTodayIcon from '@mui/icons-material/CalendarToday';
import BarChartIcon from '@mui/icons-material/BarChart';
import QuizIcon from '@mui/icons-material/Quiz';
import AssessmentIcon from '@mui/icons-material/Assessment';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { formatTime } from '../../utils/timeUtils';

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#A020F0', '#4CAF50', '#E91E63', '#9C27B0'];

// TabPanel component for tab content
function TabPanel(props) {
  const { children, value, index, ...other } = props;
  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`analytics-tabpanel-${index}`}
      aria-labelledby={`analytics-tab-${index}`}
      {...other}
    >
      {value === index && (
        <Box sx={{ p: 3 }}>
          {children}
        </Box>
      )}
    </div>
  );
}

export default function EnhancedAnalytics() {
  // State variables
  const [overview, setOverview] = useState(null);
  const [courses, setCourses] = useState([]);
  const [courseAnalytics, setCourseAnalytics] = useState(null);
  const [studentAnalytics, setStudentAnalytics] = useState(null);
  const [studentSearchResult, setStudentSearchResult] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCourse, setSelectedCourse] = useState('');
  const [loading, setLoading] = useState(false);
  const [tabValue, setTabValue] = useState(0);
  const [expandedQuizRows, setExpandedQuizRows] = useState(new Set());
  const navigate = useNavigate();
  const token = localStorage.getItem('token');

  // Fetch initial data
  useEffect(() => {
    fetchOverview();
    fetchCourses();
  }, []);

  const fetchOverview = async () => {
    try {
      const response = await axios.get('/api/admin/analytics/overview', {
        headers: { Authorization: `Bearer ${token}` }
      });
      setOverview(response.data);
    } catch (error) {
      console.error('Error fetching overview:', error);
    }
  };

  const fetchCourses = async () => {
    try {
      const response = await axios.get('/api/admin/courses', {
        headers: { Authorization: `Bearer ${token}` }
      });
      setCourses(response.data);
    } catch (error) {
      console.error('Error fetching courses:', error);
    }
  };

  const handleStudentSearch = async () => {
    if (!searchQuery.trim()) return;

    try {
      setLoading(true);
      const response = await axios.get('/api/admin/analytics/student', {
        params: { regNo: searchQuery },
        headers: { Authorization: `Bearer ${token}` }
      });
      
      setStudentSearchResult(response.data);
      await fetchStudentAnalytics(response.data._id);
    } catch (error) {
      console.error('Error searching for student:', error);
      setStudentSearchResult(null);
    } finally {
      setLoading(false);
    }
  };

  const fetchStudentAnalytics = async (studentId) => {
    setLoading(true);
    try {
      const response = await axios.get(`/api/admin/analytics/student/${studentId}/detailed`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setStudentAnalytics(response.data);
    } catch (error) {
      console.error('Error fetching student analytics:', error);
      setStudentAnalytics(null);
    } finally {
      setLoading(false);
    }
  };

  const toggleQuizDetails = (courseId) => {
    const newExpanded = new Set(expandedQuizRows);
    if (newExpanded.has(courseId)) {
      newExpanded.delete(courseId);
    } else {
      newExpanded.add(courseId);
    }
    setExpandedQuizRows(newExpanded);
  };

  const getProgressColor = (percentage) => {
    if (percentage >= 80) return '#4caf50'; // Green
    if (percentage >= 60) return '#ff9800'; // Orange
    return '#f44336'; // Red
  };

  // Dashboard Overview Section
  const renderOverviewSection = () => {
    if (!overview) return <CircularProgress />;

    return (
      <Grid container spacing={3}>
        {/* Metrics Cards */}
        <Grid item xs={12} md={3}>
          <Card sx={{ backgroundColor: '#e3f2fd' }}>
            <CardContent>
              <Box display="flex" alignItems="center" mb={1}>
                <PeopleIcon sx={{ fontSize: 40, color: '#1976d2', mr: 2 }} />
                <Box>
                  <Typography variant="h4" fontWeight="bold">{overview.studentsCount}</Typography>
                  <Typography variant="body2" color="textSecondary">Total Students</Typography>
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={3}>
          <Card sx={{ backgroundColor: '#f3e5f5' }}>
            <CardContent>
              <Box display="flex" alignItems="center" mb={1}>
                <SchoolIcon sx={{ fontSize: 40, color: '#7b1fa2', mr: 2 }} />
                <Box>
                  <Typography variant="h4" fontWeight="bold">{overview.coursesCount}</Typography>
                  <Typography variant="body2" color="textSecondary">Active Courses</Typography>
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={3}>
          <Card sx={{ backgroundColor: '#e8f5e8' }}>
            <CardContent>
              <Box display="flex" alignItems="center" mb={1}>
                <OndemandVideoIcon sx={{ fontSize: 40, color: '#388e3c', mr: 2 }} />
                <Box>
                  <Typography variant="h4" fontWeight="bold">{overview.videosCount}</Typography>
                  <Typography variant="body2" color="textSecondary">Total Videos</Typography>
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={3}>
          <Card sx={{ backgroundColor: '#fff3e0' }}>
            <CardContent>
              <Box display="flex" alignItems="center" mb={1}>
                <AccessTimeIcon sx={{ fontSize: 40, color: '#f57c00', mr: 2 }} />
                <Box>
                  <Typography variant="h4" fontWeight="bold">{overview.totalWatchTime}</Typography>
                  <Typography variant="body2" color="textSecondary">Total Watch Time</Typography>
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    );
  };

  // Course Analytics Section
  const renderCourseAnalyticsSection = () => {
    return (
      <Box>
        <Typography variant="h6" gutterBottom>Course Analytics</Typography>
        <FormControl sx={{ minWidth: 300, mb: 3 }}>
          <InputLabel>Select Course</InputLabel>
          <Select
            value={selectedCourse}
            onChange={(e) => setSelectedCourse(e.target.value)}
            label="Select Course"
          >
            {courses.map((course) => (
              <MenuItem key={course._id} value={course._id}>
                {course.title}
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        {courseAnalytics && (
          <Grid container spacing={3}>
            <Grid item xs={12}>
              <Typography variant="h6" gutterBottom>
                Course Analytics for "{courseAnalytics.title}"
              </Typography>
            </Grid>
          </Grid>
        )}
      </Box>
    );
  };

  // Enhanced Student Analytics Section with Quiz Data
  const renderStudentAnalyticsSection = () => {
    return (
      <Box>
        <Typography variant="h6" gutterBottom>Enhanced Student Analytics</Typography>

        {/* Student Search */}
        <Box mb={4} display="flex" gap={2}>
          <TextField
            label="Search by Registration Number"
            variant="outlined"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            sx={{ width: 300 }}
          />
          <Button
            variant="contained"
            onClick={handleStudentSearch}
            startIcon={<SearchIcon />}
          >
            Search
          </Button>
        </Box>

        {loading && <CircularProgress />}

        {!loading && studentAnalytics && (
          <Box>
            <Typography variant="h5" gutterBottom>
              {studentAnalytics.student.name} ({studentAnalytics.student.regNo})
            </Typography>

            {/* Enhanced Student Summary Cards with Quiz Data */}
            <Grid container spacing={2} mb={4}>
              <Grid item xs={12} sm={6} md={3}>
                <Card>
                  <CardContent>
                    <Typography color="textSecondary" gutterBottom>Total Watch Time</Typography>
                    <Typography variant="h5">{studentAnalytics.statistics?.totalWatchTimeFormatted || '0s'}</Typography>
                  </CardContent>
                </Card>
              </Grid>
              <Grid item xs={12} sm={6} md={3}>
                <Card>
                  <CardContent>
                    <Typography color="textSecondary" gutterBottom>Courses Enrolled</Typography>
                    <Typography variant="h5">{studentAnalytics.statistics?.totalCourses || 0}</Typography>
                  </CardContent>
                </Card>
              </Grid>
              <Grid item xs={12} sm={6} md={3}>
                <Card>
                  <CardContent>
                    <Typography color="textSecondary" gutterBottom>Videos Watched</Typography>
                    <Typography variant="h5">{studentAnalytics.statistics?.totalVideosWatched || 0}</Typography>
                  </CardContent>
                </Card>
              </Grid>
              <Grid item xs={12} sm={6} md={3}>
                <Card>
                  <CardContent>
                    <Typography color="textSecondary" gutterBottom>Quiz Attempts</Typography>
                    <Typography variant="h5">{studentAnalytics.statistics?.totalQuizAttempts || 0}</Typography>
                  </CardContent>
                </Card>
              </Grid>
              <Grid item xs={12} sm={6} md={3}>
                <Card>
                  <CardContent>
                    <Typography color="textSecondary" gutterBottom>Avg Quiz Score</Typography>
                    <Typography variant="h5">
                      {studentAnalytics.statistics?.averageQuizPercentage 
                        ? `${studentAnalytics.statistics.averageQuizPercentage.toFixed(1)}%`
                        : 'N/A'
                      }
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>
              <Grid item xs={12} sm={6} md={3}>
                <Card>
                  <CardContent>
                    <Typography color="textSecondary" gutterBottom>Avg. Time Per Video</Typography>
                    <Typography variant="h5">{studentAnalytics.statistics?.averageWatchTimeFormatted || '0s'}</Typography>
                  </CardContent>
                </Card>
              </Grid>
            </Grid>

            {/* Course Details with Quiz Information */}
            <Typography variant="h6" gutterBottom mt={4}>Enhanced Course Performance</Typography>
            <TableContainer component={Paper} sx={{ mb: 4 }}>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell></TableCell>
                    <TableCell>Course</TableCell>
                    <TableCell align="right">Watch Time</TableCell>
                    <TableCell align="right">Videos Watched</TableCell>
                    <TableCell align="right">Quiz Attempts</TableCell>
                    <TableCell align="right">Quiz Score</TableCell>
                    <TableCell align="right">Last Activity</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {studentAnalytics.courseAnalytics?.map((course) => (
                    <React.Fragment key={course.courseId || course._id}>
                      <TableRow>
                        <TableCell>
                          {course.quizData?.quizAttempts?.length > 0 && (
                            <IconButton
                              size="small"
                              onClick={() => toggleQuizDetails(course.courseId || course._id)}
                            >
                              {expandedQuizRows.has(course.courseId || course._id) ? <ExpandLess /> : <ExpandMore />}
                            </IconButton>
                          )}
                        </TableCell>
                        <TableCell component="th" scope="row">
                          <Box>
                            <Typography variant="body2" fontWeight="600">
                              {course.courseTitle || course.courseName || course.title || 'Unknown Course'}
                            </Typography>
                            {course.courseCode && (
                              <Chip label={course.courseCode} size="small" variant="outlined" sx={{ mt: 0.5 }} />
                            )}
                          </Box>
                        </TableCell>
                        <TableCell align="right">
                          {course.watchTimeFormatted || formatTime(course.watchTime) || '0s'}
                        </TableCell>
                        <TableCell align="right">
                          {course.videosWatched || 0}/{course.totalVideos || 0}
                        </TableCell>
                        <TableCell align="right">
                          {course.quizData?.totalAttempts || 0}
                        </TableCell>
                        <TableCell align="right">
                          {course.quizData?.averagePercentage ? (
                            <Chip
                              label={`${course.quizData.averagePercentage.toFixed(1)}%`}
                              size="small"
                              sx={{
                                backgroundColor: getProgressColor(course.quizData.averagePercentage),
                                color: 'white',
                                fontWeight: 'bold'
                              }}
                            />
                          ) : (
                            <Chip label="N/A" size="small" variant="outlined" />
                          )}
                        </TableCell>
                        <TableCell align="right">
                          {course.lastActivity
                            ? new Date(course.lastActivity).toLocaleDateString()
                            : 'Never'}
                        </TableCell>
                      </TableRow>

                      {/* Expanded Quiz Details */}
                      <TableRow>
                        <TableCell colSpan={7} sx={{ py: 0 }}>
                          <Collapse 
                            in={expandedQuizRows.has(course.courseId || course._id)} 
                            timeout="auto" 
                            unmountOnExit
                          >
                            <Box sx={{ margin: 2 }}>
                              <Typography variant="subtitle2" gutterBottom fontWeight="600">
                                Quiz Performance Details
                              </Typography>
                              {course.quizData?.quizAttempts?.length > 0 ? (
                                <Table size="small">
                                  <TableHead>
                                    <TableRow>
                                      <TableCell><strong>Quiz Title</strong></TableCell>
                                      <TableCell align="center"><strong>Score</strong></TableCell>
                                      <TableCell align="center"><strong>Percentage</strong></TableCell>
                                      <TableCell align="center"><strong>Date Attempted</strong></TableCell>
                                    </TableRow>
                                  </TableHead>
                                  <TableBody>
                                    {course.quizData.quizAttempts.map((quiz, quizIndex) => (
                                      <TableRow key={quizIndex}>
                                        <TableCell>{quiz.quizTitle || 'Unknown Quiz'}</TableCell>
                                        <TableCell align="center">
                                          {quiz.score}/{quiz.totalQuestions}
                                        </TableCell>
                                        <TableCell align="center">
                                          <Chip
                                            label={`${quiz.percentage?.toFixed(1) || 0}%`}
                                            size="small"
                                            sx={{
                                              backgroundColor: getProgressColor(quiz.percentage || 0),
                                              color: 'white'
                                            }}
                                          />
                                        </TableCell>
                                        <TableCell align="center">
                                          {quiz.completedAt ? new Date(quiz.completedAt).toLocaleDateString() : 'N/A'}
                                        </TableCell>
                                      </TableRow>
                                    ))}
                                  </TableBody>
                                </Table>
                              ) : (
                                <Typography color="textSecondary" sx={{ p: 2 }}>
                                  No quiz attempts found for this course
                                </Typography>
                              )}
                            </Box>
                          </Collapse>
                        </TableCell>
                      </TableRow>
                    </React.Fragment>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>

            {/* Existing charts and other analytics remain the same */}
            <Typography variant="h6" gutterBottom>Course Watch Time</Typography>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart
                data={studentAnalytics.courseAnalytics}
                margin={{ top: 20, right: 30, left: 20, bottom: 70 }}
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  dataKey="courseTitle"
                  angle={-45}
                  textAnchor="end"
                  height={70}
                />
                <YAxis label={{ value: 'Watch Time (seconds)', angle: -90, position: 'insideLeft' }} />
                <RechartsTooltip
                  formatter={(value, name, props) => [
                    formatTime(value),
                    'Watch Time'
                  ]}
                />
                <Bar dataKey="watchTime" fill="#8884d8" />
              </BarChart>
            </ResponsiveContainer>

            {/* Activity charts remain the same */}
            {studentAnalytics.activityHeatmap && (
              <Grid container spacing={3} mt={2}>
                <Grid item xs={12} md={6}>
                  <Paper sx={{ p: 2 }}>
                    <Typography variant="h6" gutterBottom>Watch Time by Day</Typography>
                    <ResponsiveContainer width="100%" height={250}>
                      <BarChart
                        data={Object.entries(studentAnalytics.activityHeatmap.byDay).map(([day, value]) => ({
                          day,
                          watchTime: value
                        }))}
                        margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="day" />
                        <YAxis />
                        <RechartsTooltip formatter={(value) => [formatTime(value), 'Watch Time']} />
                        <Bar dataKey="watchTime" fill="#82ca9d" />
                      </BarChart>
                    </ResponsiveContainer>
                  </Paper>
                </Grid>

                <Grid item xs={12} md={6}>
                  <Paper sx={{ p: 2 }}>
                    <Typography variant="h6" gutterBottom>Watch Time by Hour</Typography>
                    <ResponsiveContainer width="100%" height={250}>
                      <AreaChart
                        data={Object.entries(studentAnalytics.activityHeatmap.byHour).map(([hour, value]) => ({
                          hour,
                          watchTime: value
                        }))}
                        margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="hour" />
                        <YAxis />
                        <RechartsTooltip formatter={(value) => [formatTime(value), 'Watch Time']} />
                        <Area type="monotone" dataKey="watchTime" stroke="#8884d8" fill="#8884d8" />
                      </AreaChart>
                    </ResponsiveContainer>
                  </Paper>
                </Grid>
              </Grid>
            )}
          </Box>
        )}
      </Box>
    );
  };

  return (
    <Box sx={{ width: '100%', p: 3 }}>
      <Typography variant="h4" gutterBottom>
        Enhanced Analytics Dashboard
      </Typography>

      <Paper sx={{ width: '100%', mb: 2 }}>
        <Tabs
          value={tabValue}
          onChange={(event, newValue) => setTabValue(newValue)}
          indicatorColor="primary"
          textColor="primary"
          variant="fullWidth"
        >
          <Tab label="Overview" icon={<BarChartIcon />} iconPosition="start" />
          <Tab label="Course Analytics" icon={<SchoolIcon />} iconPosition="start" />
          <Tab label="Enhanced Student Analytics" icon={<PersonIcon />} iconPosition="start" />
        </Tabs>
      </Paper>

      <TabPanel value={tabValue} index={0}>
        {renderOverviewSection()}
      </TabPanel>

      <TabPanel value={tabValue} index={1}>
        {renderCourseAnalyticsSection()}
      </TabPanel>

      <TabPanel value={tabValue} index={2}>
        {renderStudentAnalyticsSection()}
      </TabPanel>
    </Box>
  );
}
EOF