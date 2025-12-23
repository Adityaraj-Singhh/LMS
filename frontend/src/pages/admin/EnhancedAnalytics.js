import React, { useState, useEffect } from 'react';
import { 
  Box, Typography, Paper, Grid, Card, CardContent, 
  TextField, Button, CircularProgress, Tabs, Tab, Table, 
  TableBody, TableCell, TableContainer, TableHead, TableRow,
  Autocomplete, IconButton, Tooltip, Select, MenuItem,
  FormControl, Chip, LinearProgress, Avatar
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
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import PlayCircleIcon from '@mui/icons-material/PlayCircle';
import QuizIcon from '@mui/icons-material/Quiz';
import AssessmentIcon from '@mui/icons-material/Assessment';
import StarIcon from '@mui/icons-material/Star';
import axios from 'axios';
import { formatTime } from '../../utils/timeUtils';

// Professional color palette
const COLORS = {
  primary: '#1976d2',
  success: '#4caf50',
  warning: '#ff9800',
  error: '#f44336',
  info: '#2196f3',
  purple: '#9c27b0',
  teal: '#009688',
  pink: '#e91e63',
  chartColors: ['#1976d2', '#4caf50', '#ff9800', '#e91e63', '#9c27b0', '#009688', '#795548', '#607d8b']
};

// Clean Stat Card Component
const StatCard = ({ title, value, subtitle, icon: Icon, color = COLORS.primary, trend }) => (
  <Card sx={{ 
    height: '100%',
    borderRadius: 2,
    boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
    border: '1px solid #e0e0e0',
    transition: 'transform 0.2s, box-shadow 0.2s',
    '&:hover': {
      transform: 'translateY(-2px)',
      boxShadow: '0 4px 16px rgba(0,0,0,0.12)'
    }
  }}>
    <CardContent sx={{ p: 2.5 }}>
      <Box display="flex" alignItems="flex-start" justifyContent="space-between">
        <Box flex={1}>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5, fontWeight: 500 }}>
            {title}
          </Typography>
          <Typography variant="h4" sx={{ fontWeight: 700, color: color, mb: 0.5 }}>
            {value}
          </Typography>
          {subtitle && (
            <Typography variant="caption" color="text.secondary">
              {subtitle}
            </Typography>
          )}
          {trend && (
            <Chip 
              size="small" 
              label={trend} 
              sx={{ 
                mt: 1, 
                backgroundColor: trend.includes('+') ? '#e8f5e9' : '#ffebee',
                color: trend.includes('+') ? '#2e7d32' : '#c62828',
                fontWeight: 600
              }} 
            />
          )}
        </Box>
        <Avatar sx={{ 
          backgroundColor: `${color}15`, 
          width: 48, 
          height: 48 
        }}>
          <Icon sx={{ color: color, fontSize: 24 }} />
        </Avatar>
      </Box>
    </CardContent>
  </Card>
);

// Section Header Component
const SectionHeader = ({ title, subtitle }) => (
  <Box sx={{ mb: 3 }}>
    <Typography variant="h6" sx={{ fontWeight: 600, color: '#1a1a2e' }}>
      {title}
    </Typography>
    {subtitle && (
      <Typography variant="body2" color="text.secondary">
        {subtitle}
      </Typography>
    )}
  </Box>
);

// TabPanel component
function TabPanel({ children, value, index }) {
  return (
    <div role="tabpanel" hidden={value !== index}>
      {value === index && <Box sx={{ py: 3 }}>{children}</Box>}
    </div>
  );
}

export default function EnhancedAnalytics() {
  const [tabValue, setTabValue] = useState(0);
  const [loading, setLoading] = useState(false);
  const [overview, setOverview] = useState(null);
  const [enrollmentTrends, setEnrollmentTrends] = useState([]);
  const [topCourses, setTopCourses] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCourse, setSelectedCourse] = useState(null);
  const [courseAnalytics, setCourseAnalytics] = useState(null);
  const [studentAnalytics, setStudentAnalytics] = useState(null);
  const [courses, setCourses] = useState([]);
  const [periodFilter, setPeriodFilter] = useState('monthly');
  const token = localStorage.getItem('token');

  // Initial data load
  useEffect(() => {
    const fetchInitialData = async () => {
      setLoading(true);
      try {
        const [overviewRes, trendsRes, topCoursesRes, coursesRes] = await Promise.all([
          axios.get(`/api/admin/analytics/overview?_t=${Date.now()}`, { 
            headers: { Authorization: `Bearer ${token}` } 
          }),
          axios.get(`/api/admin/analytics/trends?period=${periodFilter}&_t=${Date.now()}`, { 
            headers: { Authorization: `Bearer ${token}` } 
          }),
          axios.get(`/api/admin/analytics/top-courses?_t=${Date.now()}`, { 
            headers: { Authorization: `Bearer ${token}` } 
          }),
          axios.get(`/api/admin/courses?_t=${Date.now()}`, { 
            headers: { Authorization: `Bearer ${token}` } 
          }),
        ]);
        
        setOverview(overviewRes.data);
        setEnrollmentTrends(trendsRes.data);
        setTopCourses(topCoursesRes.data);
        setCourses(coursesRes.data);
      } catch (error) {
        console.error('Error fetching analytics data:', error);
      } finally {
        setLoading(false);
      }
    };
    
    fetchInitialData();
  }, [token, periodFilter]);

  // Fetch course analytics
  const fetchCourseAnalytics = async (courseId) => {
    setLoading(true);
    try {
      const response = await axios.get(`/api/admin/analytics/course/${courseId}?_t=${Date.now()}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setCourseAnalytics(response.data);
    } catch (error) {
      console.error('Error fetching course analytics:', error);
      setCourseAnalytics(null);
    } finally {
      setLoading(false);
    }
  };

  // Search for student
  const handleStudentSearch = async () => {
    if (!searchQuery) return;
    
    setLoading(true);
    try {
      const response = await axios.get(`/api/admin/analytics/student?regNo=${searchQuery}&_t=${Date.now()}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      // Fetch detailed analytics
      const detailedRes = await axios.get(`/api/admin/analytics/student/${response.data._id}/detailed?_t=${Date.now()}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setStudentAnalytics(detailedRes.data);
    } catch (error) {
      console.error('Error searching for student:', error);
      setStudentAnalytics(null);
    } finally {
      setLoading(false);
    }
  };

  // Fetch student analytics by ID
  const fetchStudentAnalytics = async (studentId) => {
    setLoading(true);
    try {
      const response = await axios.get(`/api/admin/analytics/student/${studentId}/detailed?_t=${Date.now()}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setStudentAnalytics(response.data);
      setTabValue(2);
    } catch (error) {
      console.error('Error fetching student analytics:', error);
    } finally {
      setLoading(false);
    }
  };

  // Overview Section
  const renderOverviewSection = () => {
    if (!overview) return <Box display="flex" justifyContent="center" p={4}><CircularProgress /></Box>;
    
    return (
      <Box>
        {/* Key Metrics Row */}
        <Grid container spacing={3} sx={{ mb: 4 }}>
          <Grid item xs={12} sm={6} md={3}>
            <StatCard
              title="Total Students"
              value={overview.totalStudents?.toLocaleString() || 0}
              subtitle="Registered learners"
              icon={PeopleIcon}
              color={COLORS.primary}
            />
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <StatCard
              title="Total Teachers"
              value={overview.totalTeachers?.toLocaleString() || 0}
              subtitle="Active instructors"
              icon={SchoolIcon}
              color={COLORS.success}
            />
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <StatCard
              title="Total Courses"
              value={overview.totalCourses?.toLocaleString() || 0}
              subtitle="Available programs"
              icon={OndemandVideoIcon}
              color={COLORS.warning}
            />
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <StatCard
              title="Platform Videos"
              value={overview.totalVideos?.toLocaleString() || 0}
              subtitle="Learning content"
              icon={PlayCircleIcon}
              color={COLORS.purple}
            />
          </Grid>
        </Grid>

        {/* Activity & Quiz Metrics */}
        <Grid container spacing={3} sx={{ mb: 4 }}>
          <Grid item xs={12} sm={6} md={3}>
            <StatCard
              title="Active Students (7d)"
              value={overview.activeStudents?.toLocaleString() || 0}
              subtitle={`${overview.activeStudentsPercentage || 0}% engagement`}
              icon={TrendingUpIcon}
              color={COLORS.teal}
            />
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <StatCard
              title="Quiz Attempts"
              value={overview.totalQuizAttempts?.toLocaleString() || 0}
              subtitle={`${overview.studentsWithQuizzes || 0} students participated`}
              icon={AssessmentIcon}
              color={COLORS.info}
            />
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <StatCard
              title="Average Quiz Score"
              value={overview.averageQuizScore ? `${overview.averageQuizScore.toFixed(1)}%` : 'N/A'}
              subtitle={overview.averageQuizScore >= 70 ? "Good performance" : "Needs improvement"}
              icon={StarIcon}
              color={overview.averageQuizScore >= 70 ? COLORS.success : COLORS.warning}
            />
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <StatCard
              title="Quiz Participation"
              value={overview.studentsWithQuizzes && overview.totalStudents 
                ? `${((overview.studentsWithQuizzes / overview.totalStudents) * 100).toFixed(1)}%`
                : '0%'}
              subtitle="Students taking quizzes"
              icon={QuizIcon}
              color={COLORS.pink}
            />
          </Grid>
        </Grid>
        
        {/* Charts Section */}
        <Grid container spacing={3}>
          {/* Enrollment Trends */}
          <Grid item xs={12} md={8}>
            <Paper sx={{ p: 3, borderRadius: 2, height: '100%' }}>
              <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
                <Typography variant="h6" sx={{ fontWeight: 600 }}>
                  Student Enrollment Trends
                </Typography>
                <FormControl size="small" sx={{ minWidth: 120 }}>
                  <Select
                    value={periodFilter}
                    onChange={(e) => setPeriodFilter(e.target.value)}
                  >
                    <MenuItem value="daily">Daily</MenuItem>
                    <MenuItem value="weekly">Weekly</MenuItem>
                    <MenuItem value="monthly">Monthly</MenuItem>
                  </Select>
                </FormControl>
              </Box>
              <ResponsiveContainer width="100%" height={280}>
                <AreaChart data={enrollmentTrends} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorCount" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={COLORS.primary} stopOpacity={0.3}/>
                      <stop offset="95%" stopColor={COLORS.primary} stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <RechartsTooltip />
                  <Area type="monotone" dataKey="count" stroke={COLORS.primary} fillOpacity={1} fill="url(#colorCount)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </Paper>
          </Grid>
          
          {/* Top Courses */}
          <Grid item xs={12} md={4}>
            <Paper sx={{ p: 3, borderRadius: 2, height: '100%' }}>
              <Typography variant="h6" sx={{ fontWeight: 600, mb: 2 }}>
                Top Courses by Enrollment
              </Typography>
              {topCourses.length > 0 ? (
                <ResponsiveContainer width="100%" height={280}>
                  <PieChart>
                    <Pie
                      data={topCourses}
                      dataKey="studentsCount"
                      nameKey="title"
                      cx="50%"
                      cy="50%"
                      outerRadius={80}
                      innerRadius={40}
                    >
                      {topCourses.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS.chartColors[index % COLORS.chartColors.length]} />
                      ))}
                    </Pie>
                    <RechartsTooltip formatter={(value, name) => [`${value} students`, name]} />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <Box display="flex" alignItems="center" justifyContent="center" height={280}>
                  <Typography color="text.secondary">No course data available</Typography>
                </Box>
              )}
            </Paper>
          </Grid>
        </Grid>
      </Box>
    );
  };

  // Course Analytics Section
  const renderCourseAnalyticsSection = () => {
    return (
      <Box>
        <SectionHeader 
          title="Course Analytics" 
          subtitle="Select a course to view detailed analytics"
        />
        
        {/* Course Selection */}
        <Paper sx={{ p: 3, mb: 3, borderRadius: 2 }}>
          <Autocomplete
            options={courses || []}
            getOptionLabel={(option) => `${option.title} (${option.courseCode || 'No Code'})`}
            sx={{ maxWidth: 500 }}
            renderInput={(params) => (
              <TextField {...params} label="Select Course" placeholder="Search for a course..." />
            )}
            onChange={(event, newValue) => {
              setSelectedCourse(newValue);
              if (newValue) {
                fetchCourseAnalytics(newValue._id);
              } else {
                setCourseAnalytics(null);
              }
            }}
          />
        </Paper>
        
        {loading && (
          <Box display="flex" justifyContent="center" p={4}>
            <CircularProgress />
          </Box>
        )}
        
        {!loading && courseAnalytics && (
          <Box>
            {/* Course Header */}
            <Paper sx={{ p: 3, mb: 3, borderRadius: 2, backgroundColor: '#f8fafc' }}>
              <Typography variant="h5" sx={{ fontWeight: 600, mb: 1 }}>
                {courseAnalytics.course.title}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Course Code: {courseAnalytics.course.courseCode || 'N/A'}
              </Typography>
            </Paper>
            
            {/* Course Summary Cards */}
            <Grid container spacing={3} sx={{ mb: 4 }}>
              <Grid item xs={12} sm={6} md={3}>
                <StatCard
                  title="Total Students"
                  value={courseAnalytics.summary.totalStudents}
                  icon={PeopleIcon}
                  color={COLORS.primary}
                />
              </Grid>
              <Grid item xs={12} sm={6} md={3}>
                <StatCard
                  title="Total Videos"
                  value={courseAnalytics.summary.totalVideos}
                  icon={PlayCircleIcon}
                  color={COLORS.success}
                />
              </Grid>
              <Grid item xs={12} sm={6} md={3}>
                <StatCard
                  title="Coordinators"
                  value={courseAnalytics.summary.totalCoordinators || courseAnalytics.summary.totalTeachers}
                  icon={SchoolIcon}
                  color={COLORS.warning}
                />
              </Grid>
              <Grid item xs={12} sm={6} md={3}>
                <StatCard
                  title="Avg. Watch Time"
                  value={courseAnalytics.summary.avgWatchTimeFormatted}
                  icon={AccessTimeIcon}
                  color={COLORS.purple}
                />
              </Grid>
            </Grid>
            
            {/* Video Analytics Table */}
            <Paper sx={{ mb: 4, borderRadius: 2, overflow: 'hidden' }}>
              <Box sx={{ p: 2, backgroundColor: '#f8fafc', borderBottom: '1px solid #e0e0e0' }}>
                <Typography variant="h6" sx={{ fontWeight: 600 }}>
                  Video Watch Statistics
                </Typography>
              </Box>
              <TableContainer>
                <Table>
                  <TableHead>
                    <TableRow sx={{ backgroundColor: '#fafafa' }}>
                      <TableCell sx={{ fontWeight: 600 }}>Video Title</TableCell>
                      <TableCell align="center" sx={{ fontWeight: 600 }}>Students Watched</TableCell>
                      <TableCell align="center" sx={{ fontWeight: 600 }}>Total Watch Time</TableCell>
                      <TableCell align="center" sx={{ fontWeight: 600 }}>Avg. Watch Time</TableCell>
                      <TableCell align="center" sx={{ fontWeight: 600 }}>Watch %</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {courseAnalytics.videoAnalytics?.slice(0, 10).map((video) => (
                      <TableRow key={video._id} hover>
                        <TableCell>{video.title}</TableCell>
                        <TableCell align="center">{video.studentsWatched || video.correctedStudentsWatched || 0}</TableCell>
                        <TableCell align="center">{video.totalWatchTimeFormatted}</TableCell>
                        <TableCell align="center">{video.avgWatchTimeFormatted}</TableCell>
                        <TableCell align="center">
                          <Box display="flex" alignItems="center" justifyContent="center" gap={1}>
                            <LinearProgress 
                              variant="determinate" 
                              value={Math.min(video.watchPercentage || 0, 100)} 
                              sx={{ width: 60, height: 6, borderRadius: 3 }}
                            />
                            <Typography variant="body2">
                              {(video.watchPercentage || 0).toFixed(1)}%
                            </Typography>
                          </Box>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </Paper>
            
            {/* Student Watch Statistics */}
            <Paper sx={{ borderRadius: 2, overflow: 'hidden' }}>
              <Box sx={{ p: 2, backgroundColor: '#f8fafc', borderBottom: '1px solid #e0e0e0' }}>
                <Typography variant="h6" sx={{ fontWeight: 600 }}>
                  Student Watch Statistics
                </Typography>
              </Box>
              <TableContainer sx={{ maxHeight: 500 }}>
                <Table stickyHeader>
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{ fontWeight: 600, backgroundColor: '#fafafa' }}>Student Name</TableCell>
                      <TableCell sx={{ fontWeight: 600, backgroundColor: '#fafafa' }}>Registration No</TableCell>
                      <TableCell align="center" sx={{ fontWeight: 600, backgroundColor: '#fafafa' }}>Total Watch Time</TableCell>
                      <TableCell align="center" sx={{ fontWeight: 600, backgroundColor: '#fafafa' }}>Videos Watched</TableCell>
                      <TableCell align="center" sx={{ fontWeight: 600, backgroundColor: '#fafafa' }}>Days Active</TableCell>
                      <TableCell align="center" sx={{ fontWeight: 600, backgroundColor: '#fafafa' }}>Actions</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {courseAnalytics.studentAnalytics?.map((student) => (
                      <TableRow key={student._id} hover>
                        <TableCell>{student.name || 'Unknown'}</TableCell>
                        <TableCell>{student.regNo || 'N/A'}</TableCell>
                        <TableCell align="center">{student.totalWatchTimeFormatted || '0s'}</TableCell>
                        <TableCell align="center">{student.videosWatched || 0}</TableCell>
                        <TableCell align="center">{student.uniqueDaysActive || 0}</TableCell>
                        <TableCell align="center">
                          <Tooltip title="View Student Details">
                            <IconButton 
                              size="small" 
                              color="primary"
                              onClick={() => fetchStudentAnalytics(student._id)}
                            >
                              <VisibilityIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </Paper>
          </Box>
        )}
        
        {!loading && !courseAnalytics && !selectedCourse && (
          <Paper sx={{ p: 6, textAlign: 'center', borderRadius: 2 }}>
            <OndemandVideoIcon sx={{ fontSize: 64, color: '#ccc', mb: 2 }} />
            <Typography variant="h6" color="text.secondary">
              Select a course to view analytics
            </Typography>
          </Paper>
        )}
      </Box>
    );
  };

  // Student Analytics Section
  const renderStudentAnalyticsSection = () => {
    return (
      <Box>
        <SectionHeader 
          title="Student Analytics" 
          subtitle="Search for a student by registration number"
        />
        
        {/* Student Search */}
        <Paper sx={{ p: 3, mb: 3, borderRadius: 2 }}>
          <Box display="flex" gap={2} alignItems="center">
            <TextField
              label="Registration Number"
              variant="outlined"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleStudentSearch()}
              sx={{ width: 300 }}
              placeholder="e.g., S000001"
            />
            <Button 
              variant="contained" 
              onClick={handleStudentSearch}
              startIcon={<SearchIcon />}
              disabled={loading}
            >
              Search
            </Button>
          </Box>
        </Paper>
        
        {loading && (
          <Box display="flex" justifyContent="center" p={4}>
            <CircularProgress />
          </Box>
        )}
        
        {!loading && studentAnalytics && (
          <Box>
            {/* Student Header */}
            <Paper sx={{ p: 3, mb: 3, borderRadius: 2, backgroundColor: '#f8fafc' }}>
              <Box display="flex" alignItems="center" gap={2}>
                <Avatar sx={{ width: 56, height: 56, bgcolor: COLORS.primary }}>
                  {studentAnalytics.student.name?.charAt(0) || 'S'}
                </Avatar>
                <Box>
                  <Typography variant="h5" sx={{ fontWeight: 600 }}>
                    {studentAnalytics.student.name}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Registration No: {studentAnalytics.student.regNo} | Email: {studentAnalytics.student.email}
                  </Typography>
                </Box>
              </Box>
            </Paper>
            
            {/* Student Summary Cards */}
            <Grid container spacing={3} sx={{ mb: 4 }}>
              <Grid item xs={12} sm={6} md={3}>
                <StatCard
                  title="Total Watch Time"
                  value={studentAnalytics.summary.totalWatchTimeFormatted}
                  icon={AccessTimeIcon}
                  color={COLORS.primary}
                />
              </Grid>
              <Grid item xs={12} sm={6} md={3}>
                <StatCard
                  title="Courses Enrolled"
                  value={studentAnalytics.summary.totalCourses}
                  icon={SchoolIcon}
                  color={COLORS.success}
                />
              </Grid>
              <Grid item xs={12} sm={6} md={3}>
                <StatCard
                  title="Videos Watched"
                  value={studentAnalytics.summary.totalVideosWatched}
                  icon={PlayCircleIcon}
                  color={COLORS.warning}
                />
              </Grid>
              <Grid item xs={12} sm={6} md={3}>
                <StatCard
                  title="Avg Quiz Score"
                  value={studentAnalytics.statistics?.averageQuizPercentage 
                    ? `${studentAnalytics.statistics.averageQuizPercentage.toFixed(1)}%`
                    : 'N/A'
                  }
                  icon={StarIcon}
                  color={COLORS.purple}
                />
              </Grid>
            </Grid>

            {/* Engagement Metrics */}
            <Grid container spacing={3} sx={{ mb: 4 }}>
              <Grid item xs={12} sm={6} md={3}>
                <StatCard
                  title="Days Active"
                  value={studentAnalytics.engagementMetrics?.totalDaysActive || 0}
                  icon={TrendingUpIcon}
                  color={COLORS.teal}
                />
              </Grid>
              <Grid item xs={12} sm={6} md={3}>
                <StatCard
                  title="Longest Streak"
                  value={`${studentAnalytics.engagementMetrics?.longestStreak || 0} days`}
                  icon={StarIcon}
                  color={COLORS.pink}
                />
              </Grid>
              <Grid item xs={12} sm={6} md={3}>
                <StatCard
                  title="Quiz Attempts"
                  value={studentAnalytics.statistics?.totalQuizAttempts || 0}
                  icon={QuizIcon}
                  color={COLORS.info}
                />
              </Grid>
              <Grid item xs={12} sm={6} md={3}>
                <StatCard
                  title="Avg. Session Length"
                  value={studentAnalytics.engagementMetrics?.averageSessionLengthFormatted || '0s'}
                  icon={AccessTimeIcon}
                  color={COLORS.warning}
                />
              </Grid>
            </Grid>
            
            {/* Course Watch Time Chart */}
            <Paper sx={{ p: 3, mb: 4, borderRadius: 2 }}>
              <Typography variant="h6" sx={{ fontWeight: 600, mb: 2 }}>
                Course Watch Time Distribution
              </Typography>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart
                  data={studentAnalytics.courseAnalytics}
                  margin={{ top: 20, right: 30, left: 20, bottom: 70 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis 
                    dataKey="title" 
                    angle={-45} 
                    textAnchor="end" 
                    height={70}
                    tick={{ fontSize: 11 }}
                  />
                  <YAxis 
                    label={{ value: 'Watch Time (sec)', angle: -90, position: 'insideLeft', fontSize: 12 }} 
                  />
                  <RechartsTooltip 
                    formatter={(value, name, props) => [props.payload.totalWatchTimeFormatted, 'Watch Time']} 
                  />
                  <Bar dataKey="totalWatchTime" fill={COLORS.primary} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </Paper>
            
            {/* Activity Heatmap */}
            <Grid container spacing={3} sx={{ mb: 4 }}>
              <Grid item xs={12} md={6}>
                <Paper sx={{ p: 3, borderRadius: 2 }}>
                  <Typography variant="h6" sx={{ fontWeight: 600, mb: 2 }}>
                    Watch Time by Day
                  </Typography>
                  <ResponsiveContainer width="100%" height={250}>
                    <BarChart
                      data={Object.entries(studentAnalytics.activityHeatmap?.byDay || {}).map(([day, value]) => ({
                        day,
                        watchTime: value
                      }))}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis dataKey="day" tick={{ fontSize: 11 }} />
                      <YAxis />
                      <RechartsTooltip formatter={(value) => [formatTime(value), 'Watch Time']} />
                      <Bar dataKey="watchTime" fill={COLORS.success} radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </Paper>
              </Grid>
              
              <Grid item xs={12} md={6}>
                <Paper sx={{ p: 3, borderRadius: 2 }}>
                  <Typography variant="h6" sx={{ fontWeight: 600, mb: 2 }}>
                    Watch Time by Hour
                  </Typography>
                  <ResponsiveContainer width="100%" height={250}>
                    <AreaChart
                      data={Object.entries(studentAnalytics.activityHeatmap?.byHour || {}).map(([hour, value]) => ({
                        hour: `${hour}:00`,
                        watchTime: value
                      }))}
                    >
                      <defs>
                        <linearGradient id="colorHour" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor={COLORS.purple} stopOpacity={0.3}/>
                          <stop offset="95%" stopColor={COLORS.purple} stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis dataKey="hour" tick={{ fontSize: 11 }} />
                      <YAxis />
                      <RechartsTooltip formatter={(value) => [formatTime(value), 'Watch Time']} />
                      <Area type="monotone" dataKey="watchTime" stroke={COLORS.purple} fillOpacity={1} fill="url(#colorHour)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </Paper>
              </Grid>
            </Grid>
            
            {/* Course Engagement Table */}
            <Paper sx={{ borderRadius: 2, overflow: 'hidden' }}>
              <Box sx={{ p: 2, backgroundColor: '#f8fafc', borderBottom: '1px solid #e0e0e0' }}>
                <Typography variant="h6" sx={{ fontWeight: 600 }}>
                  Course Engagement Details
                </Typography>
              </Box>
              <TableContainer>
                <Table>
                  <TableHead>
                    <TableRow sx={{ backgroundColor: '#fafafa' }}>
                      <TableCell sx={{ fontWeight: 600 }}>Course Name</TableCell>
                      <TableCell align="center" sx={{ fontWeight: 600 }}>Watch Time</TableCell>
                      <TableCell align="center" sx={{ fontWeight: 600 }}>Videos</TableCell>
                      <TableCell align="center" sx={{ fontWeight: 600 }}>Progress</TableCell>
                      <TableCell align="center" sx={{ fontWeight: 600 }}>Quiz Score</TableCell>
                      <TableCell align="center" sx={{ fontWeight: 600 }}>Last Activity</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {studentAnalytics.courseAnalytics?.map((course) => (
                      <TableRow key={course._id} hover>
                        <TableCell sx={{ fontWeight: 500, color: COLORS.primary }}>
                          {course.title}
                        </TableCell>
                        <TableCell align="center">{course.totalWatchTimeFormatted}</TableCell>
                        <TableCell align="center">
                          {course.videosWatched} / {course.totalVideos}
                        </TableCell>
                        <TableCell align="center">
                          <Box display="flex" alignItems="center" justifyContent="center" gap={1}>
                            <LinearProgress 
                              variant="determinate" 
                              value={Math.min(course.completionPercentage || 0, 100)} 
                              sx={{ 
                                width: 60, 
                                height: 6, 
                                borderRadius: 3,
                                backgroundColor: '#e0e0e0',
                                '& .MuiLinearProgress-bar': {
                                  backgroundColor: course.completionPercentage >= 80 ? COLORS.success : 
                                                   course.completionPercentage >= 50 ? COLORS.warning : COLORS.error
                                }
                              }}
                            />
                            <Typography variant="body2" sx={{ minWidth: 45 }}>
                              {(course.completionPercentage || 0).toFixed(1)}%
                            </Typography>
                          </Box>
                        </TableCell>
                        <TableCell align="center">
                          {course.quizAnalytics?.averagePercentage > 0 ? (
                            <Chip 
                              size="small"
                              label={`${course.quizAnalytics.averagePercentage.toFixed(1)}%`}
                              sx={{ 
                                backgroundColor: course.quizAnalytics.averagePercentage >= 80 ? '#e8f5e9' : 
                                                 course.quizAnalytics.averagePercentage >= 60 ? '#fff3e0' : '#ffebee',
                                color: course.quizAnalytics.averagePercentage >= 80 ? '#2e7d32' : 
                                       course.quizAnalytics.averagePercentage >= 60 ? '#e65100' : '#c62828',
                                fontWeight: 600
                              }}
                            />
                          ) : (
                            <Typography variant="body2" color="text.secondary">-</Typography>
                          )}
                        </TableCell>
                        <TableCell align="center">
                          <Typography variant="body2" color="text.secondary">
                            {course.lastActivity 
                              ? new Date(course.lastActivity).toLocaleDateString() 
                              : 'Never'}
                          </Typography>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </Paper>
          </Box>
        )}
        
        {!loading && !studentAnalytics && (
          <Paper sx={{ p: 6, textAlign: 'center', borderRadius: 2 }}>
            <PersonIcon sx={{ fontSize: 64, color: '#ccc', mb: 2 }} />
            <Typography variant="h6" color="text.secondary">
              Search for a student by registration number
            </Typography>
          </Paper>
        )}
      </Box>
    );
  };

  return (
    <Box sx={{ p: 3 }}>
      {/* Header */}
      <Box sx={{ mb: 4 }}>
        <Typography
          variant="h4"
          component="h1"
          tabIndex={0}
          sx={{
            fontWeight: 700,
            color: '#1a1a2e',
            mb: 1,
            outline: 'none',
            '&:focus, &:focus-visible': {
              outline: '3px solid #0b6bcb',
              borderRadius: 4,
              outlineOffset: 6,
              boxShadow: '0 0 0 4px rgba(11,107,203,0.2)'
            }
          }}
        >
          Advanced Analytics Dashboard
        </Typography>
        <Typography variant="body1" color="text.secondary">
          Comprehensive insights into student performance and platform usage
        </Typography>
      </Box>
      
      {/* Tabs */}
      <Paper sx={{ mb: 3, borderRadius: 2 }}>
        <Tabs 
          value={tabValue} 
          onChange={(e, v) => setTabValue(v)}
          variant="fullWidth"
          sx={{
            '& .MuiTab-root': {
              py: 2,
              fontWeight: 600
            }
          }}
        >
          <Tab label="Overview" icon={<AssessmentIcon />} iconPosition="start" />
          <Tab label="Course Analytics" icon={<SchoolIcon />} iconPosition="start" />
          <Tab label="Student Analytics" icon={<PersonIcon />} iconPosition="start" />
        </Tabs>
      </Paper>
      
      {/* Tab Panels */}
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
