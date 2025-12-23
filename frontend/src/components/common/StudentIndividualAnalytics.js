import React, { useState, useEffect } from 'react';
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
  Assessment as AssessmentIcon
} from '@mui/icons-material';
import axios from 'axios';
import { useParams } from 'react-router-dom';

const StudentIndividualAnalytics = () => {
  const { studentId } = useParams();
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [studentData, setStudentData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState('');
  const [expandedCourses, setExpandedCourses] = useState(new Set());
  const [userRole, setUserRole] = useState('');

  // Get user role from token or localStorage
  useEffect(() => {
    const token = localStorage.getItem('token');
    const role = localStorage.getItem('activeRole') || localStorage.getItem('userRole') || 'student';
    console.log('StudentIndividualAnalytics - Detected role:', role);
    setUserRole(role);
  }, []);

  // Automatically fetch student data if studentId is provided in URL
  useEffect(() => {
    if (studentId && userRole) {
      console.log('Auto-fetching student data for ID:', studentId);
      fetchStudentById(studentId);
    }
  }, [studentId, userRole]);

  // Fetch student by ID (when coming from direct link)
  const fetchStudentById = async (id) => {
    try {
      setLoading(true);
      setError('');
      const token = localStorage.getItem('token');
      
      let student = null;
      
      // Use role-specific endpoint to get user by ID
      if (userRole === 'admin') {
        const response = await axios.get(`/api/admin/users`, {
          headers: { Authorization: `Bearer ${token}` },
          params: { userId: id }
        });
        
        if (response.data.users && response.data.users.length > 0) {
          student = response.data.users.find(u => u._id === id);
        } else if (response.data._id) {
          student = response.data;
        }
      } else if (userRole === 'teacher') {
        // For teachers, we need to get the student from their courses
        // First get all teacher's courses and their students
        const coursesResponse = await axios.get('/api/teacher/courses', {
          headers: { Authorization: `Bearer ${token}` }
        });
        
        // Find the student in any of the teacher's courses
        for (const course of coursesResponse.data) {
          try {
            const studentsResponse = await axios.get(`/api/teacher/course/${course._id}/students`, {
              headers: { Authorization: `Bearer ${token}` }
            });
            
            const foundStudent = studentsResponse.data.find(s => s._id === id);
            if (foundStudent) {
              student = foundStudent;
              break;
            }
          } catch (courseError) {
            console.warn(`Could not fetch students for course ${course._id}:`, courseError);
            continue;
          }
        }
      } else if (userRole === 'dean' || userRole === 'hod') {
        // For dean/hod, search in their respective endpoints
        const endpoint = userRole === 'dean' ? '/api/dean/students/search' : '/api/hod/students/search';
        try {
          const response = await axios.get(endpoint, {
            headers: { Authorization: `Bearer ${token}` },
            params: { q: id, limit: 1 }
          });
          
          if (response.data && response.data.length > 0) {
            student = response.data.find(s => s._id === id);
          }
        } catch (searchError) {
          console.warn('Search by ID failed, trying alternative approach:', searchError);
        }
      }
      
      if (student) {
        setSelectedStudent(student);
        // Fetch detailed analytics using the student's registration number
        await fetchStudentAnalytics(student.regNo || student._id);
      } else {
        setError('Student not found or you do not have permission to view this student');
      }
    } catch (error) {
      console.error('Error fetching student by ID:', error);
      setError('Failed to fetch student details. You may not have permission to view this student.');
    } finally {
      setLoading(false);
    }
  };

  // Search for students based on user role
  const handleSearch = async (searchValue) => {
    if (!searchValue || searchValue.length < 2) {
      setSearchResults([]);
      return;
    }

    try {
      setSearching(true);
      const token = localStorage.getItem('token');
      
      let endpoint = '';
      let params = { q: searchValue, limit: 10 };
      
      // Role-specific search endpoints
      switch (userRole) {
        case 'admin':
          endpoint = '/api/admin/users';
          params = { regNo: searchValue };
          break;
        case 'dean':
          endpoint = '/api/dean/students/search';
          break;
        case 'hod':
          endpoint = '/api/hod/students/search';
          break;
        case 'teacher':
          // Teacher: search through all students in teacher's courses
          try {
            // First get teacher's courses
            const coursesRes = await axios.get('/api/teacher/courses', {
              headers: { Authorization: `Bearer ${token}` }
            });
            
            const allStudents = [];
            
            // Get students from each course
            for (const course of coursesRes.data) {
              try {
                const studentsRes = await axios.get(`/api/teacher/course/${course._id}/students`, {
                  headers: { Authorization: `Bearer ${token}` }
                });
                
                // Add course info to each student for context
                const studentsWithCourse = studentsRes.data.map(student => ({
                  ...student,
                  courseContext: {
                    _id: course._id,
                    title: course.title,
                    courseCode: course.courseCode
                  }
                }));
                
                allStudents.push(...studentsWithCourse);
              } catch (courseError) {
                console.warn(`Could not fetch students for course ${course._id}:`, courseError);
              }
            }
            
            // Remove duplicates and filter by search value
            const uniqueStudents = [];
            const seenIds = new Set();
            
            allStudents.forEach(student => {
              if (!seenIds.has(student._id)) {
                seenIds.add(student._id);
                uniqueStudents.push(student);
              }
            });
            
            // Filter students based on search value
            const filteredStudents = uniqueStudents.filter(student => {
              const searchLower = searchValue.toLowerCase();
              return (
                (student.name && student.name.toLowerCase().includes(searchLower)) ||
                (student.email && student.email.toLowerCase().includes(searchLower)) ||
                (student.regNo && student.regNo.toLowerCase().includes(searchLower))
              );
            });
            
            setSearchResults(filteredStudents.slice(0, 10));
          } catch (error) {
            console.error('Error searching teacher students:', error);
            setSearchResults([]);
          }
          setSearching(false);
          return;
        default:
          setSearchResults([]);
          setSearching(false);
          return;
      }

      const response = await axios.get(endpoint, {
        params,
        headers: { Authorization: `Bearer ${token}` }
      });

      // Handle different response formats
      let students = [];
      if (userRole === 'admin' && response.data) {
        students = [{
          _id: response.data._id,
          name: response.data.name,
          regNo: response.data.regNo,
          email: response.data.email,
          department: response.data.department?.name || 'N/A'
        }];
      } else if (response.data.students) {
        students = response.data.students.map(student => ({
          _id: student._id,
          name: student.name,
          regNo: student.regNo,
          email: student.email,
          department: student.department?.name || student.department || 'N/A'
        }));
      }

      setSearchResults(students);
    } catch (err) {
      console.error('Error searching students:', err);
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  };

  // Fetch student analytics based on user role
  const fetchStudentAnalytics = async (searchValue) => {
    if (!searchValue) return;

    try {
      setLoading(true);
      setError('');
      setStudentData(null);

      const token = localStorage.getItem('token');
      let response;

      // Role-based analytics endpoints
      switch (userRole) {
        case 'admin':
          // First search for student by regNo
          const searchResponse = await axios.get(
            '/api/admin/analytics/student',
            {
              params: { regNo: searchValue },
              headers: { Authorization: `Bearer ${token}` }
            }
          );
          
          if (searchResponse.data) {
            // Then get detailed analytics using the student ID
            const analyticsResponse = await axios.get(
              `/api/admin/analytics/student/${searchResponse.data._id}/detailed`,
              {
                headers: { Authorization: `Bearer ${token}` }
              }
            );
            
            console.log('Enhanced Student Analytics Response:', analyticsResponse.data);
            setStudentData(analyticsResponse.data);
          }
          break;

        case 'dean':
          // Dean: Get student by regNo first, then fetch details
          try {
            console.log('Dean: Searching for student with regNo:', searchValue);
            const deanSearchResponse = await axios.get('/api/dean/student/search', {
              params: { regNo: searchValue },
              headers: { Authorization: `Bearer ${token}` }
            });
            
            console.log('Dean: Search response:', deanSearchResponse.data);
            
            if (deanSearchResponse.data) {
              const studentId = deanSearchResponse.data._id;
              
              if (!studentId) {
                console.error('Dean: Student ID not found in response:', deanSearchResponse.data);
                setError('Student ID not found in response. Please try again.');
                break;
              }
              
              console.log('Dean: Fetching analytics for student ID:', studentId);
              
              const deanAnalyticsResponse = await axios.get(`/api/dean/student/${studentId}/details`, {
                headers: { Authorization: `Bearer ${token}` }
              });
              
              console.log('Dean: Analytics Response:', deanAnalyticsResponse.data);
              
              // Dean endpoint returns data in the same format as HOD - no transformation needed!
              setStudentData({
                student: deanAnalyticsResponse.data.student,
                statistics: deanAnalyticsResponse.data.statistics,
                courses: deanAnalyticsResponse.data.courseAnalytics || deanAnalyticsResponse.data.courses || []
              });
            } else {
              setError('No student data returned from search');
            }
          } catch (deanErr) {
            console.error('Dean analytics error:', deanErr);
            if (deanErr.response?.status === 404) {
              setError('Student not found in your school');
            } else {
              setError(deanErr.response?.data?.message || 'Failed to fetch student details');
            }
          }
          break;

        case 'hod':
          // HOD: Use HOD-specific analytics endpoint
          response = await axios.get(`/api/hod/analytics/student`, {
            params: { regNo: searchValue },
            headers: { Authorization: `Bearer ${token}` }
          });
          
          if (response.data) {
            console.log('HOD Analytics Response:', response.data);
            setStudentData(transformHodData(response.data));
          }
          break;

        case 'teacher':
          // Teacher: Search for student by regNo - now returns comprehensive data
          try {
            console.log('Teacher: Searching for student with regNo:', searchValue);
            const teacherSearchResponse = await axios.get('/api/teacher/analytics/student', {
              params: { regNo: searchValue },
              headers: { Authorization: `Bearer ${token}` }
            });
            
            console.log('Teacher: Search response:', teacherSearchResponse.data);
            
            if (teacherSearchResponse.data && teacherSearchResponse.data.student) {
              // Teacher endpoint now returns data in the same format as HOD - no transformation needed!
              setStudentData({
                student: teacherSearchResponse.data.student,
                statistics: teacherSearchResponse.data.statistics,
                courses: teacherSearchResponse.data.courses || []
              });
            } else {
              setError('Student not found or you do not have access');
            }
          } catch (teacherErr) {
            console.error('Teacher analytics error:', teacherErr);
            if (teacherErr.response?.status === 404) {
              setError('Student not found in your courses');
            } else if (teacherErr.response?.status === 403) {
              setError('You do not have access to view this student');
            } else {
              setError(teacherErr.response?.data?.message || 'Failed to fetch student details');
            }
          }
          break;

        default:
          setError('Invalid user role');
          break;
      }
    } catch (err) {
      console.error('Error fetching student analytics:', err);
      setError(err.response?.data?.message || 'Failed to fetch student analytics');
    } finally {
      setLoading(false);
    }
  };

  // Transform dean data to match component structure
  const transformDeanData = (deanData) => {
    // build courseAnalytics items
    const courseAnalytics = (Array.isArray(deanData.courseAnalytics) ? deanData.courseAnalytics : []).map(c => ({
      courseId: c.courseId || c._id,
      courseCode: c.courseCode || 'N/A',
      courseTitle: c.courseTitle || 'N/A',
      sections: c.sections || [],
      videosWatched: c.videosWatched || 0,
      totalVideos: c.totalVideos || 0,
      watchTimeFormatted: c.watchTimeFormatted || '0s',
      overallProgress: c.overallProgress || 0,
      courseMarks: c.courseMarks || 0,
      // quizAnalytics may not be present for dean endpoints; keep null to show N/A
      quizAnalytics: c.quizAnalytics || c.quizData || null,
      unitMarks: c.unitMarks || []
    }));

    return {
      student: deanData.student,
      statistics: {
        totalCourses: courseAnalytics.length,
        averageProgress: Math.round(deanData.statistics?.averageProgress || 0),
        averageMarks: Math.round(deanData.statistics?.averageMarks || 0),
        totalWatchTimeFormatted: deanData.statistics?.totalWatchTimeFormatted || '0s',
        totalQuizAttempts: deanData.statistics?.totalQuizAttempts || 0,
        averageQuizScore: Math.round(deanData.statistics?.averageQuizScore || 0),
        averageQuizPercentage: Math.round(deanData.statistics?.averageQuizPercentage || 0)
      },
      courses: courseAnalytics
    };
  };

  // Transform HOD data to match component structure
  const transformHodData = (hodData) => {
    const courses = (hodData.courses || []).map(c => ({
      courseId: c.courseId || c._id,
      courseCode: c.courseCode || 'N/A',
      courseTitle: c.courseTitle || c.title || 'N/A',
      sections: c.sections || [],
      videosWatched: c.videosWatched || 0,
      totalVideos: c.totalVideos || 0,
      watchTimeFormatted: c.watchTimeFormatted || '0s',
      overallProgress: c.overallProgress || 0,
      courseMarks: c.courseMarks || 0,
      unitMarks: c.unitMarks || []
    }));

    return {
      student: hodData.student,
      statistics: hodData.statistics || {
        totalCourses: courses.length,
        averageProgress: 0,
        averageMarks: 0,
        totalWatchTimeFormatted: '0s'
      },
      courses
    };
  };

  // Transform teacher data to match component structure
  const transformTeacherData = (teacherData) => {
    const courses = (teacherData.courses || []).map(c => ({
      courseId: c.courseId || c._id,
      courseCode: c.courseCode || 'N/A',
      courseTitle: c.courseTitle || c.title || 'N/A',
      sections: c.sections || [],
      videosWatched: c.videosWatched || 0,
      totalVideos: c.totalVideos || 0,
      watchTimeFormatted: c.watchTimeFormatted || '0s',
      overallProgress: c.overallProgress || 0,
      courseMarks: c.courseMarks || 0,
      unitMarks: c.unitMarks || []
    }));

    return {
      student: teacherData.student,
      statistics: teacherData.statistics || {
        totalCourses: courses.length,
        averageProgress: 0,
        averageMarks: 0,
        totalWatchTimeFormatted: '0s'
      },
      courses
    };
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

  const handleStudentSelect = (student) => {
    if (student) {
      setSelectedStudent(student);
      fetchStudentAnalytics(student.regNo || student.email);
    }
  };

  // Extract regNo from search query if it's in the format "name (regNo) - email"
  const extractRegNoFromQuery = (query) => {
    if (!query) return '';
    
    // Check if query is in format "name (regNo) - email"
    const match = query.match(/\(([^)]+)\)/);
    if (match) {
      return match[1].trim(); // Return the regNo inside parentheses
    }
    
    // Otherwise, return the query as-is (could be direct regNo or email)
    return query.trim();
  };

  return (
    <Box sx={{ p: 3 }}>
      {/* Header */}
      <Box sx={{ mb: 4 }}>
        <Typography variant="h4" gutterBottom>
          Student Individual Analytics
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Search and view comprehensive analytics for any student in your school
        </Typography>
      </Box>

      {/* Search Section */}
      <Paper sx={{ p: 3, mb: 3 }}>
        <Grid container spacing={2} alignItems="center">
          <Grid item xs={12} md={8}>
            <Autocomplete
              freeSolo
              options={searchResults}
              getOptionLabel={(option) => 
                typeof option === 'string' ? option : `${option.name} (${option.regNo}) - ${option.email}`
              }
              onInputChange={(event, value) => {
                setSearchQuery(value);
                handleSearch(value);
              }}
              onChange={(event, value) => {
                if (value && typeof value !== 'string') {
                  handleStudentSelect(value);
                }
              }}
              loading={searching}
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="Search by Name, Registration No, or Email"
                  placeholder="Enter at least 2 characters..."
                  variant="outlined"
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
                    <Avatar src={option.profilePicture} sx={{ width: 32, height: 32 }}>
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
              onClick={() => fetchStudentAnalytics(extractRegNoFromQuery(searchQuery))}
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

          {/* Statistics Cards */}
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
                        Avg Progress
                      </Typography>
                      <Typography variant="h4">
                        {studentData.statistics?.averageProgress || 0}%
                      </Typography>
                    </Box>
                    <TrendingUpIcon sx={{ fontSize: 48, color: 'success.main', opacity: 0.3 }} />
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
                        Avg Marks
                      </Typography>
                      <Typography variant="h4">
                        {studentData.statistics?.averageMarks || 0}%
                      </Typography>
                    </Box>
                    <AssessmentIcon sx={{ fontSize: 48, color: 'info.main', opacity: 0.3 }} />
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
                        Watch Time
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
          </Grid>

          {/* Course-wise Analytics Table */}
          <Paper>
            <Box p={2}>
              <Typography variant="h6" gutterBottom>
                Course-wise Performance
              </Typography>
            </Box>
            <Divider />
            <TableContainer>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell />
                    <TableCell><strong>Course Code</strong></TableCell>
                    <TableCell><strong>Course Title</strong></TableCell>
                    <TableCell><strong>Section</strong></TableCell>
                    <TableCell align="center"><strong>Videos</strong></TableCell>
                    <TableCell align="center"><strong>Watch Time</strong></TableCell>
                    <TableCell><strong>Progress</strong></TableCell>
                    <TableCell><strong>Marks</strong></TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {!studentData.courses || studentData.courses.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} align="center">
                        <Typography color="text.secondary">
                          No courses enrolled yet
                        </Typography>
                      </TableCell>
                    </TableRow>
                  ) : (
                    studentData.courses.map((course) => (
                      <React.Fragment key={course.courseId}>
                        <TableRow hover>
                          <TableCell>
                            <IconButton
                              size="small"
                              onClick={() => toggleCourse(course.courseId)}
                            >
                              {expandedCourses.has(course.courseId) ? <ExpandLess /> : <ExpandMore />}
                            </IconButton>
                          </TableCell>
                          <TableCell>
                            <Chip label={course.courseCode || 'N/A'} size="small" variant="outlined" />
                          </TableCell>
                          <TableCell>{course.courseTitle || 'N/A'}</TableCell>
                          <TableCell>
                            {course.sections && course.sections.length > 0 ? (
                              course.sections.map((section, idx) => (
                                <Chip 
                                  key={section.id}
                                  label={section.name} 
                                  size="small" 
                                  color="primary"
                                  sx={{ mr: 0.5, mb: 0.5 }}
                                />
                              ))
                            ) : (
                              <Chip label="N/A" size="small" variant="outlined" />
                            )}
                          </TableCell>
                          <TableCell align="center">
                            {course.videosWatched || 0}/{course.totalVideos || 0}
                          </TableCell>
                          <TableCell align="center">
                            {course.watchTimeFormatted || '0s'}
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
                          <TableCell>
                            <Chip
                              label={`${course.courseMarks || 0}%`}
                              size="small"
                              sx={{
                                backgroundColor: getProgressColor(course.courseMarks || 0),
                                color: 'white',
                                fontWeight: 'bold'
                              }}
                            />
                          </TableCell>
                        </TableRow>

                        {/* Expanded Row - Unit-wise Details */}
                        <TableRow>
                          <TableCell colSpan={8} sx={{ py: 0 }}>
                            <Collapse in={expandedCourses.has(course.courseId)} timeout="auto" unmountOnExit>
                              <Box sx={{ margin: 2 }}>
                                <Typography variant="subtitle2" gutterBottom fontWeight="600">
                                  Unit-wise Performance
                                </Typography>
                                <Table size="small">
                                  <TableHead>
                                    <TableRow>
                                      <TableCell><strong>Unit Title</strong></TableCell>
                                      <TableCell align="center"><strong>Quiz Marks</strong></TableCell>
                                      <TableCell align="center"><strong>Status</strong></TableCell>
                                      <TableCell align="center"><strong>Attempts</strong></TableCell>
                                    </TableRow>
                                  </TableHead>
                                  <TableBody>
                                    {(course.unitMarks && course.unitMarks.length > 0) ? (
                                      course.unitMarks.map((unit) => (
                                        <TableRow key={unit.unitId}>
                                          <TableCell>{unit.unitTitle}</TableCell>
                                          <TableCell align="center">
                                            {typeof unit.percentage === 'number' ? unit.percentage.toFixed(1) : '0.0'}%
                                          </TableCell>
                                          <TableCell align="center">
                                            <Chip
                                              label={
                                                unit.attempted
                                                  ? unit.percentage >= 75 ? 'Excellent' :
                                                    unit.percentage >= 50 ? 'Good' :
                                                    'Needs Improvement'
                                                  : 'Not Attempted'
                                              }
                                              size="small"
                                              sx={{
                                                backgroundColor: unit.attempted 
                                                  ? getProgressColor(unit.percentage) 
                                                  : '#9e9e9e',
                                                color: 'white'
                                              }}
                                            />
                                          </TableCell>
                                          <TableCell align="center">
                                            {unit.attemptsCount || 0}
                                          </TableCell>
                                        </TableRow>
                                      ))
                                    ) : (
                                      <TableRow>
                                        <TableCell colSpan={4} align="center">
                                          <Typography variant="body2" color="text.secondary">
                                            No unit data available
                                          </Typography>
                                        </TableCell>
                                      </TableRow>
                                    )}
                                  </TableBody>
                                </Table>
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

      {/* No Data Message */}
      {!loading && !studentData && !error && (
        <Paper sx={{ p: 4, textAlign: 'center' }}>
          <SearchIcon sx={{ fontSize: 64, color: 'text.secondary', mb: 2 }} />
          <Typography variant="h6" color="text.secondary" gutterBottom>
            Search for a Student
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Enter a student's name, registration number, or email to view their analytics
          </Typography>
        </Paper>
      )}
    </Box>
  );
};

export default StudentIndividualAnalytics;
