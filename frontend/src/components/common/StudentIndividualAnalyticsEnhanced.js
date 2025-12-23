import React, { useState } from 'react';
import {
  Box,
  Typography,
  Paper,
  TextField,
  Button,
  Card,
  CardContent,
  Grid,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Avatar,
  Chip,
  LinearProgress,
  IconButton,
  Collapse,
  CircularProgress,
  Alert,
  Autocomplete,
  Divider
} from '@mui/material';
import {
  Search as SearchIcon,
  Person as PersonIcon,
  School as SchoolIcon,
  TrendingUp as TrendingUpIcon,
  Timer as TimerIcon,
  MenuBook as CourseIcon,
  ExpandMore,
  ExpandLess,
  Email as EmailIcon,
  Badge as BadgeIcon,
  Assessment as AssessmentIcon,
  Quiz as QuizIcon
} from '@mui/icons-material';
import axios from 'axios';

const StudentIndividualAnalyticsEnhanced = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [studentData, setStudentData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState('');
  const [expandedCourses, setExpandedCourses] = useState(new Set());

  // Search for students
  const handleSearch = async (searchValue) => {
    if (!searchValue || searchValue.length < 2) {
      setSearchResults([]);
      return;
    }

    try {
      setSearching(true);
      const token = localStorage.getItem('token');
      const response = await axios.get(
        '/api/admin/users',
        {
          params: { 
            role: 'student', 
            search: searchValue,
            limit: 10 
          },
          headers: { Authorization: `Bearer ${token}` }
        }
      );

      const students = response.data.users || [];
      const transformedResults = students.map(student => ({
        _id: student._id,
        name: student.name,
        regNo: student.regNo,
        email: student.email,
        department: student.department?.name || 'N/A',
        label: `${student.name} (${student.regNo})`,
        value: student.regNo
      }));

      setSearchResults(transformedResults);
    } catch (err) {
      console.error('Error searching students:', err);
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  };

  // Fetch enhanced student analytics
  const fetchStudentAnalytics = async (search) => {
    if (!search) return;

    try {
      setLoading(true);
      setError('');
      setStudentData(null);

      const token = localStorage.getItem('token');
      
      // First search for the student to get their ID
      const searchResponse = await axios.get(
        '/api/admin/analytics/student',
        {
          params: { regNo: search },
          headers: { Authorization: `Bearer ${token}` }
        }
      );

      if (searchResponse.data._id) {
        // Get enhanced analytics with quiz data
        const analyticsResponse = await axios.get(
          `/api/admin/analytics/student/${searchResponse.data._id}/detailed`,
          {
            headers: { Authorization: `Bearer ${token}` }
          }
        );

        console.log('Enhanced Analytics Response:', analyticsResponse.data);
        setStudentData(analyticsResponse.data);
      } else {
        setError('Student not found');
      }
    } catch (err) {
      console.error('Error fetching student analytics:', err);
      setError(err.response?.data?.message || 'Failed to fetch student analytics');
    } finally {
      setLoading(false);
    }
  };

  const toggleCourse = (courseId) => {
    const newExpanded = new Set(expandedCourses);
    if (newExpanded.has(courseId)) {
      newExpanded.delete(courseId);
    } else {
      newExpanded.add(courseId);
    }
    setExpandedCourses(newExpanded);
  };

  const getProgressColor = (progress) => {
    const progressNum = parseFloat(progress);
    if (progressNum >= 75) return '#4caf50'; // Green
    if (progressNum >= 50) return '#ff9800'; // Yellow
    return '#f44336'; // Red
  };

  const formatTime = (seconds) => {
    if (!seconds || seconds < 1) return '0s';
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    
    if (hours > 0) return `${hours}h ${minutes}m ${secs}s`;
    if (minutes > 0) return `${minutes}m ${secs}s`;
    return `${secs}s`;
  };

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" gutterBottom fontWeight="600">
        Enhanced Student Analytics
      </Typography>
      <Typography variant="body1" color="text.secondary" mb={3}>
        Search and view detailed analytics including quiz performance and watch time data
      </Typography>

      {/* Search Section */}
      <Paper sx={{ p: 2, mb: 3 }}>
        <Grid container spacing={2} alignItems="center">
          <Grid item xs={12} md={8}>
            <Autocomplete
              freeSolo
              options={searchResults}
              getOptionLabel={(option) => typeof option === 'string' ? option : option.label}
              onInputChange={(event, newInputValue) => {
                setSearchQuery(newInputValue);
                handleSearch(newInputValue);
              }}
              onChange={(event, newValue) => {
                if (newValue && typeof newValue === 'object') {
                  setSearchQuery(newValue.value);
                  setSelectedStudent(newValue);
                }
              }}
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="Search Student (Name or Registration Number)"
                  variant="outlined"
                  fullWidth
                  InputProps={{
                    ...params.InputProps,
                    endAdornment: (
                      <>
                        {searching ? <CircularProgress size={20} /> : null}
                        {params.InputProps.endAdornment}
                      </>
                    ),
                  }}
                />
              )}
              renderOption={(props, option) => (
                <li {...props}>
                  <Box display="flex" alignItems="center" gap={2}>
                    <Avatar sx={{ width: 32, height: 32 }}>
                      {option.name.charAt(0)}
                    </Avatar>
                    <Box>
                      <Typography variant="body2" fontWeight="600">
                        {option.name}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {option.regNo} • {option.email} • {option.department}
                      </Typography>
                    </Box>
                  </Box>
                </li>
              )}
            />
          </Grid>
          <Grid item xs={12} md={4}>
            <Button
              variant="contained"
              fullWidth
              startIcon={<SearchIcon />}
              onClick={() => fetchStudentAnalytics(searchQuery)}
              disabled={!searchQuery || searchQuery.length < 2}
              sx={{ height: 56 }}
            >
              Search Student
            </Button>
          </Grid>
        </Grid>
      </Paper>

      {/* Error Message */}
      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}

      {/* Loading */}
      {loading && (
        <Box display="flex" justifyContent="center" p={4}>
          <CircularProgress />
        </Box>
      )}

      {/* Student Profile and Analytics */}
      {!loading && studentData && (
        <>
          {/* Student Profile Card */}
          <Card sx={{ mb: 3 }}>
            <CardContent>
              <Grid container spacing={3}>
                <Grid item xs={12} md={3} display="flex" justifyContent="center" alignItems="center">
                  <Avatar
                    src={studentData.student.profilePicture}
                    sx={{ width: 120, height: 120, fontSize: '3rem' }}
                  >
                    {studentData.student.name.charAt(0)}
                  </Avatar>
                </Grid>
                <Grid item xs={12} md={9}>
                  <Typography variant="h5" gutterBottom fontWeight="600">
                    {studentData.student.name}
                  </Typography>
                  <Grid container spacing={2}>
                    <Grid item xs={12} sm={6}>
                      <Box display="flex" alignItems="center" gap={1} mb={1}>
                        <BadgeIcon color="primary" fontSize="small" />
                        <Typography variant="body2" color="text.secondary">
                          Reg No: <strong>{studentData.student.regNo}</strong>
                        </Typography>
                      </Box>
                      <Box display="flex" alignItems="center" gap={1} mb={1}>
                        <EmailIcon color="primary" fontSize="small" />
                        <Typography variant="body2" color="text.secondary">
                          Email: <strong>{studentData.student.email}</strong>
                        </Typography>
                      </Box>
                    </Grid>
                    <Grid item xs={12} sm={6}>
                      <Box display="flex" alignItems="center" gap={1} mb={1}>
                        <SchoolIcon color="primary" fontSize="small" />
                        <Typography variant="body2" color="text.secondary">
                          School: <strong>{studentData.student.school?.name || 'N/A'}</strong>
                        </Typography>
                      </Box>
                      <Box display="flex" alignItems="center" gap={1} mb={1}>
                        <PersonIcon color="primary" fontSize="small" />
                        <Typography variant="body2" color="text.secondary">
                          Department: <strong>{studentData.student.department?.name || 'N/A'}</strong>
                        </Typography>
                      </Box>
                    </Grid>
                  </Grid>
                </Grid>
              </Grid>
            </CardContent>
          </Card>

          {/* Enhanced Statistics Cards */}
          <Grid container spacing={3} sx={{ mb: 3 }}>
            <Grid item xs={12} sm={6} md={3}>
              <Card>
                <CardContent>
                  <Box display="flex" alignItems="center" justifyContent="space-between">
                    <Box>
                      <Typography color="text.secondary" variant="body2">
                        Total Courses
                      </Typography>
                      <Typography variant="h4">
                        {studentData.statistics?.totalCourses || 0}
                      </Typography>
                    </Box>
                    <CourseIcon sx={{ fontSize: 48, color: 'primary.main', opacity: 0.3 }} />
                  </Box>
                </CardContent>
              </Card>
            </Grid>

            <Grid item xs={12} sm={6} md={3}>
              <Card>
                <CardContent>
                  <Box display="flex" alignItems="center" justifyContent="space-between">
                    <Box>
                      <Typography color="text.secondary" variant="body2">
                        Total Watch Time
                      </Typography>
                      <Typography variant="h4">
                        {studentData.statistics?.totalWatchTimeFormatted || '0s'}
                      </Typography>
                    </Box>
                    <TimerIcon sx={{ fontSize: 48, color: 'warning.main', opacity: 0.3 }} />
                  </Box>
                </CardContent>
              </Card>
            </Grid>

            <Grid item xs={12} sm={6} md={3}>
              <Card>
                <CardContent>
                  <Box display="flex" alignItems="center" justifyContent="space-between">
                    <Box>
                      <Typography color="text.secondary" variant="body2">
                        Quiz Attempts
                      </Typography>
                      <Typography variant="h4">
                        {studentData.statistics?.totalQuizAttempts || 0}
                      </Typography>
                    </Box>
                    <QuizIcon sx={{ fontSize: 48, color: 'info.main', opacity: 0.3 }} />
                  </Box>
                </CardContent>
              </Card>
            </Grid>

            <Grid item xs={12} sm={6} md={3}>
              <Card>
                <CardContent>
                  <Box display="flex" alignItems="center" justifyContent="space-between">
                    <Box>
                      <Typography color="text.secondary" variant="body2">
                        Avg Quiz Score
                      </Typography>
                      <Typography variant="h4">
                        {studentData.statistics?.averageQuizPercentage ? 
                          `${studentData.statistics.averageQuizPercentage.toFixed(1)}%` : 'N/A'}
                      </Typography>
                    </Box>
                    <AssessmentIcon sx={{ fontSize: 48, color: 'success.main', opacity: 0.3 }} />
                  </Box>
                </CardContent>
              </Card>
            </Grid>
          </Grid>

          {/* Enhanced Course-wise Analytics Table */}
          <Paper>
            <Box p={2}>
              <Typography variant="h6" gutterBottom>
                Enhanced Course-wise Performance
              </Typography>
            </Box>
            <Divider />
            <TableContainer>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell />
                    <TableCell><strong>Course</strong></TableCell>
                    <TableCell align="center"><strong>Videos</strong></TableCell>
                    <TableCell align="center"><strong>Watch Time</strong></TableCell>
                    <TableCell align="center"><strong>Quiz Attempts</strong></TableCell>
                    <TableCell align="center"><strong>Quiz Score</strong></TableCell>
                    <TableCell><strong>Progress</strong></TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {!studentData.courseAnalytics || studentData.courseAnalytics.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} align="center">
                        <Typography color="text.secondary">
                          No courses enrolled yet
                        </Typography>
                      </TableCell>
                    </TableRow>
                  ) : (
                    studentData.courseAnalytics.map((course, index) => (
                      <React.Fragment key={course.courseId || index}>
                        <TableRow hover>
                          <TableCell>
                            <IconButton
                              size="small"
                              onClick={() => toggleCourse(course.courseId || index)}
                            >
                              {expandedCourses.has(course.courseId || index) ? <ExpandLess /> : <ExpandMore />}
                            </IconButton>
                          </TableCell>
                          <TableCell>
                            <Box>
                              <Typography variant="body2" fontWeight="600">
                                {course.courseTitle || course.courseName || 'Unknown Course'}
                              </Typography>
                              {course.courseCode && (
                                <Chip label={course.courseCode} size="small" variant="outlined" sx={{ mt: 0.5 }} />
                              )}
                            </Box>
                          </TableCell>
                          <TableCell align="center">
                            {course.videosWatched || 0}/{course.totalVideos || 0}
                          </TableCell>
                          <TableCell align="center">
                            {course.watchTimeFormatted || formatTime(course.watchTime) || '0s'}
                          </TableCell>
                          <TableCell align="center">
                            {course.quizData?.totalAttempts || 0}
                          </TableCell>
                          <TableCell align="center">
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
                          <TableCell>
                            <Box sx={{ minWidth: 150 }}>
                              <Box display="flex" alignItems="center" justifyContent="space-between" mb={0.5}>
                                <Typography 
                                  variant="body2" 
                                  fontWeight="600"
                                  sx={{ color: getProgressColor(course.overallProgress || 0) }}
                                >
                                  {course.overallProgress || 0}%
                                </Typography>
                              </Box>
                              <LinearProgress 
                                variant="determinate" 
                                value={parseFloat(course.overallProgress || 0)} 
                                sx={{
                                  height: 6,
                                  borderRadius: 3,
                                  backgroundColor: '#e0e0e0',
                                  '& .MuiLinearProgress-bar': {
                                    backgroundColor: getProgressColor(course.overallProgress || 0),
                                    borderRadius: 3,
                                  }
                                }}
                              />
                            </Box>
                          </TableCell>
                        </TableRow>

                        {/* Expanded Row - Enhanced Quiz Details */}
                        <TableRow>
                          <TableCell colSpan={7} sx={{ py: 0 }}>
                            <Collapse in={expandedCourses.has(course.courseId || index)} timeout="auto" unmountOnExit>
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
                                  <Alert severity="info" sx={{ mt: 1 }}>
                                    No quiz attempts found for this course
                                  </Alert>
                                )}
                              </Box>
                            </Collapse>
                          </TableCell>
                        </TableRow>
                      </React.Fragment>
                    ))
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </Paper>
        </>
      )}
    </Box>
  );
};

export default StudentIndividualAnalyticsEnhanced;