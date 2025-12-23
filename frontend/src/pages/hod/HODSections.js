import React, { useEffect, useState } from 'react';
import { 
  Box, 
  Grid, 
  Card, 
  CardContent, 
  Typography, 
  Alert, 
  CircularProgress, 
  TextField, 
  MenuItem, 
  Button, 
  Paper, 
  Table, 
  TableHead, 
  TableBody, 
  TableRow, 
  TableCell, 
  Chip, 
  Divider,
  List,
  ListItem,
  ListItemText,
  Avatar,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  FormControl,
  InputLabel,
  Select,
  IconButton,
  Tooltip
} from '@mui/material';
import { 
  TrendingUp as TrendingUpIcon,
  Group as GroupIcon,
  School as SchoolIcon,
  Book as BookIcon,
  Assignment as AssignmentIcon,
  PersonAdd as PersonAddIcon,
  PersonRemove as PersonRemoveIcon,
  Edit as EditIcon
} from '@mui/icons-material';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { assignTeacherToSectionCourse, removeTeacherFromSectionCourse } from '../../api/teacherAssignmentApi';

const HODSections = () => {
  const navigate = useNavigate();
  const [sections, setSections] = useState([]);
  const [selectedSection, setSelectedSection] = useState('');
  const [courses, setCourses] = useState([]);
  const [selectedCourse, setSelectedCourse] = useState('');
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [analytics, setAnalytics] = useState(null);
  
  // Teacher assignment states
  const [teacherDialog, setTeacherDialog] = useState({ open: false, course: null, section: null, currentTeacher: null });
  const [availableTeachers, setAvailableTeachers] = useState([]);
  const [selectedTeacher, setSelectedTeacher] = useState('');
  const [assignLoading, setAssignLoading] = useState(false);

  const token = localStorage.getItem('token');

  // Load sections managed by HOD
  useEffect(() => {
    loadSections();
    
    // Set up auto-refresh every 30 seconds
    const refreshInterval = setInterval(() => {
      loadSections();
      if (selectedSection) {
        loadAnalytics();
      }
    }, 30000);

    return () => clearInterval(refreshInterval);
  }, [selectedSection]);

  const loadSections = async () => {
    try {
      setLoading(true);
      const res = await axios.get('/api/hod/sections', { 
        headers: { Authorization: `Bearer ${token}` } 
      });
      setSections(res.data?.sections || []);
      setError('');
    } catch (e) {
      setError(e.response?.data?.message || 'Failed to load sections');
    } finally {
      setLoading(false);
    }
  };

  // Load courses for HOD's department
  useEffect(() => {
    loadCourses();
  }, []);

  const loadCourses = async () => {
    try {
      const res = await axios.get('/api/hod/courses', { 
        headers: { Authorization: `Bearer ${token}` } 
      });
      setCourses(res.data?.courses || []);
    } catch (e) {
      console.error('Failed to load courses:', e);
    }
  };

  // Load analytics for selected section and course
  const loadAnalytics = async () => {
    if (!selectedSection) {
      setError('Please select a section');
      return;
    }

    try {
      setLoading(true);
      setError('');

      let url = `/api/hod/sections/${selectedSection}/analytics`;
      if (selectedCourse) {
        url += `?courseId=${selectedCourse}`;
      }

      const res = await axios.get(url, { 
        headers: { Authorization: `Bearer ${token}` } 
      });
      // Extract statistics from response and merge with other data for easier access
      const responseData = res.data;
      
      console.log('%c📊 SECTION ANALYTICS - FULL RESPONSE', 'background: #2196F3; color: white; font-size: 16px; padding: 8px; font-weight: bold;');
      console.log('Response Data:', responseData);
      console.log('Course Breakdown Array:', responseData.courseBreakdown);
      console.log('Student Performance Array:', responseData.studentPerformance);
      
      if (responseData.courseBreakdown && responseData.courseBreakdown.length > 0) {
        console.log('%c🎓 FIRST COURSE DETAILS', 'background: #4CAF50; color: white; font-size: 14px; padding: 6px;');
        const firstCourse = responseData.courseBreakdown[0];
        console.log('Full Course Object:', firstCourse);
        console.log('Course nested?:', firstCourse.course);
        console.log('Title:', firstCourse.course?.title || firstCourse.title);
        console.log('Code:', firstCourse.course?.courseCode || firstCourse.courseCode);
        console.log('Teacher:', firstCourse.teacher);
      }
      
      if (responseData.studentPerformance && responseData.studentPerformance.length > 0) {
        console.log('%c👥 FIRST STUDENT DETAILS', 'background: #FF9800; color: white; font-size: 14px; padding: 6px;');
        const firstStudent = responseData.studentPerformance[0];
        console.log('Full Student Object:', firstStudent);
        console.log('Student nested?:', firstStudent.student);
        console.log('Name:', firstStudent.student?.name || firstStudent.name);
      }
      
      const analytics = {
        ...responseData.statistics,
        section: responseData.section,
        courseBreakdown: responseData.courseBreakdown || [],
        studentPerformance: responseData.studentPerformance || [],
        lastUpdated: responseData.lastUpdated
      };
      
      console.log('%c✅ FINAL ANALYTICS STATE', 'background: #9C27B0; color: white; font-size: 16px; padding: 8px; font-weight: bold;');
      console.log('Analytics Object:', analytics);
      console.log('Course Count:', analytics.courseBreakdown?.length);
      console.log('Student Count:', analytics.studentPerformance?.length);
      
      setAnalytics(analytics);
    } catch (e) {
      setError(e.response?.data?.message || 'Failed to load analytics');
    } finally {
      setLoading(false);
    }
  };

  // Teacher Assignment Functions
  const handleOpenTeacherDialog = async (course, sectionId, currentTeacher = null) => {
    try {
      setAssignLoading(true);
      const response = await axios.get(`/api/hod/teachers/available/${course._id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      setAvailableTeachers(response.data.teachers || []);
      setTeacherDialog({
        open: true,
        course,
        section: sectionId,
        currentTeacher
      });
      setSelectedTeacher(currentTeacher?._id || '');
    } catch (error) {
      setError('Failed to load available teachers');
    } finally {
      setAssignLoading(false);
    }
  };

  const handleAssignTeacher = async () => {
    if (!selectedTeacher || !teacherDialog.course || !teacherDialog.section) return;
    
    try {
      setAssignLoading(true);
      await assignTeacherToSectionCourse(teacherDialog.section, teacherDialog.course._id, selectedTeacher);
      
      // Refresh sections data
      await loadSections();
      if (selectedSection) {
        await loadAnalytics();
      }
      
      setTeacherDialog({ open: false, course: null, section: null, currentTeacher: null });
      setSelectedTeacher('');
      setError('');
    } catch (error) {
      setError(error.response?.data?.message || 'Failed to assign teacher');
    } finally {
      setAssignLoading(false);
    }
  };

  const handleRemoveTeacher = async (sectionId, courseId, teacherId) => {
    if (!window.confirm('Are you sure you want to remove this teacher from the course?')) return;
    
    try {
      setAssignLoading(true);
      await removeTeacherFromSectionCourse(sectionId, courseId, teacherId);
      
      // Refresh sections data
      await loadSections();
      if (selectedSection) {
        await loadAnalytics();
      }
      
      setError('');
    } catch (error) {
      setError(error.response?.data?.message || 'Failed to remove teacher');
    } finally {
      setAssignLoading(false);
    }
  };

  const StatCard = ({ title, value, icon, color, description }) => (
    <Card sx={{ 
      height: '100%', 
      background: `linear-gradient(135deg, ${color}15 0%, ${color}25 100%)`,
      border: `1px solid ${color}30`
    }}>
      <CardContent>
        <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
          <Box sx={{ 
            p: 1.5, 
            borderRadius: 2, 
            bgcolor: `${color}20`,
            color: color,
            mr: 2
          }}>
            {icon}
          </Box>
          <Box>
            <Typography variant="h4" sx={{ fontWeight: 'bold', color: color }}>
              {value}
            </Typography>
            <Typography variant="body2" color="textSecondary">
              {title}
            </Typography>
          </Box>
        </Box>
        {description && (
          <Typography variant="body2" color="textSecondary">
            {description}
          </Typography>
        )}
      </CardContent>
    </Card>
  );

  return (
    <Box sx={{ p: 3 }}>
      {/* Header */}
      <Typography variant="h4" sx={{ fontWeight: 'bold', mb: 3 }}>
        Section Analytics
      </Typography>

      {/* Filters */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="h6" sx={{ mb: 2 }}>
            Select Section and Course for Analytics
          </Typography>
          
          <Grid container spacing={2} alignItems="center">
            <Grid item xs={12} md={4}>
              <TextField
                select
                fullWidth
                label="Select Section"
                value={selectedSection}
                onChange={(e) => {
                  setSelectedSection(e.target.value);
                  setAnalytics(null);
                }}
                size="small"
              >
                <MenuItem value="">
                  <em>All Sections</em>
                </MenuItem>
                {sections.map((section) => (
                  <MenuItem key={section._id} value={section._id}>
                    {section.name} ({section.code})
                  </MenuItem>
                ))}
              </TextField>
            </Grid>
            
            <Grid item xs={12} md={4}>
              <TextField
                select
                fullWidth
                label="Filter by Course (Optional)"
                value={selectedCourse}
                onChange={(e) => {
                  setSelectedCourse(e.target.value);
                  setAnalytics(null);
                }}
                size="small"
              >
                <MenuItem value="">
                  <em>All Courses</em>
                </MenuItem>
                {courses.map((course) => (
                  <MenuItem key={course._id} value={course._id}>
                    {course.title} ({course.courseCode})
                  </MenuItem>
                ))}
              </TextField>
            </Grid>
            
            <Grid item xs={12} md={3}>
              <Button
                variant="contained"
                onClick={loadAnalytics}
                disabled={!selectedSection || loading}
                fullWidth
              >
                {loading ? <CircularProgress size={24} /> : 'Load Analytics'}
              </Button>
            </Grid>
            
            <Grid item xs={12} md={1}>
              <Button
                variant="outlined"
                onClick={() => {
                  loadSections();
                  loadCourses();
                  if (selectedSection) loadAnalytics();
                }}
                disabled={loading}
                fullWidth
              >
                🔄
              </Button>
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      {/* Error */}
      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}

      {/* Sections Overview */}
      {sections.length > 0 && (
        <Grid container spacing={3} sx={{ mb: 4 }}>
          {sections.map((section) => (
            <Grid item xs={12} md={6} lg={4} key={section._id}>
              <Card sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
                <CardContent sx={{ flexGrow: 1 }}>
                  {/* Section Header */}
                  <Box sx={{ mb: 2 }}>
                    <Typography variant="h6" sx={{ fontWeight: 'bold', mb: 1 }}>
                      {section.name}
                    </Typography>
                    <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                      <Chip label={section.code} size="small" color="primary" variant="outlined" />
                      <Chip 
                        icon={<GroupIcon />} 
                        label={`${section.students?.length || section.studentCount || 0} Students`} 
                        size="small" 
                        color="info"
                        variant="outlined"
                      />
                    </Box>
                  </Box>

                  <Divider sx={{ my: 2 }} />

                  {/* Courses Section */}
                  <Typography variant="subtitle2" sx={{ mb: 2, fontWeight: 'bold', display: 'flex', alignItems: 'center' }}>
                    <BookIcon sx={{ mr: 1, fontSize: 20 }} />
                    Courses ({section.courses?.length || 0})
                  </Typography>

                  {section.courses && section.courses.length > 0 ? (
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                      {section.courses.map((course) => (
                        <Paper 
                          key={course._id} 
                          variant="outlined" 
                          sx={{ 
                            p: 2,
                            '&:hover': {
                              boxShadow: 2,
                              borderColor: 'primary.main'
                            },
                            transition: 'all 0.3s'
                          }}
                        >
                          {/* Course Info */}
                          <Box sx={{ mb: 1.5 }}>
                            <Typography variant="subtitle2" sx={{ fontWeight: 'bold', mb: 0.5 }}>
                              {course.courseCode}
                            </Typography>
                            <Typography variant="body2" color="text.secondary">
                              {course.title}
                            </Typography>
                          </Box>
                          
                          <Divider sx={{ my: 1 }} />

                          {/* Teacher Section */}
                          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flex: 1 }}>
                              {course.teacher ? (
                                <>
                                  <Avatar sx={{ width: 28, height: 28, fontSize: '0.85rem', bgcolor: 'success.main' }}>
                                    {course.teacher.name?.charAt(0)?.toUpperCase()}
                                  </Avatar>
                                  <Box sx={{ flex: 1 }}>
                                    <Typography variant="body2" sx={{ fontWeight: 500 }}>
                                      {course.teacher.name}
                                    </Typography>
                                    <Chip label="Assigned" color="success" size="small" sx={{ height: 18, fontSize: '0.7rem' }} />
                                  </Box>
                                </>
                              ) : (
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flex: 1 }}>
                                  <Avatar sx={{ width: 28, height: 28, bgcolor: 'warning.main' }}>
                                    <PersonAddIcon sx={{ fontSize: 16 }} />
                                  </Avatar>
                                  <Chip label="No Teacher" color="warning" size="small" />
                                </Box>
                              )}
                            </Box>
                            
                            {/* Action Buttons */}
                            <Box sx={{ display: 'flex', gap: 0.5 }}>
                              <Tooltip title={course.teacher ? "Change Teacher" : "Assign Teacher"}>
                                <IconButton
                                  size="small"
                                  color="primary"
                                  onClick={() => handleOpenTeacherDialog(course, section._id, course.teacher)}
                                  disabled={assignLoading}
                                  sx={{ 
                                    bgcolor: 'primary.light',
                                    color: 'white',
                                    '&:hover': { bgcolor: 'primary.main' }
                                  }}
                                >
                                  {course.teacher ? <EditIcon fontSize="small" /> : <PersonAddIcon fontSize="small" />}
                                </IconButton>
                              </Tooltip>
                              
                              {course.teacher && (
                                <Tooltip title="Remove Teacher">
                                  <IconButton
                                    size="small"
                                    color="error"
                                    onClick={() => handleRemoveTeacher(section._id, course._id, course.teacher._id)}
                                    disabled={assignLoading}
                                    sx={{ 
                                      bgcolor: 'error.light',
                                      color: 'white',
                                      '&:hover': { bgcolor: 'error.main' }
                                    }}
                                  >
                                    <PersonRemoveIcon fontSize="small" />
                                  </IconButton>
                                </Tooltip>
                              )}
                            </Box>
                          </Box>
                        </Paper>
                      ))}
                    </Box>
                  ) : (
                    <Alert severity="info" sx={{ mt: 1 }}>
                      No courses assigned to this section
                    </Alert>
                  )}
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>
      )}

      {/* Analytics Results */}
      {analytics && (
        <>
          {/* Overview Stats */}
          <Grid container spacing={3} sx={{ mb: 4 }}>
            <Grid item xs={12} sm={6} md={3}>
              <StatCard
                title="Total Students"
                value={analytics.totalStudents || 0}
                icon={<GroupIcon />}
                color="#1976d2"
                description="Students in section"
              />
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <StatCard
                title="Active Courses"
                value={analytics.totalCourses || 0}
                icon={<BookIcon />}
                color="#ed6c02"
                description="Courses running"
              />
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <StatCard
                title="Assignments"
                value={analytics.totalAssignments || 0}
                icon={<AssignmentIcon />}
                color="#2e7d32"
                description="Total assignments"
              />
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <StatCard
                title="Average Progress"
                value={`${analytics.averageProgress || 0}%`}
                icon={<TrendingUpIcon />}
                color="#9c27b0"
                description="Student progress"
              />
            </Grid>
          </Grid>

          {/* Section Details */}
          <Grid container spacing={3}>
            {/* Course-wise Breakdown */}
            <Grid item xs={12}>
              <Card>
                <CardContent>
                  <Typography variant="h6" sx={{ mb: 3, display: 'flex', alignItems: 'center' }}>
                    <BookIcon sx={{ mr: 1 }} />
                    Course-wise Breakdown
                  </Typography>
                  
                  {analytics.courseBreakdown && analytics.courseBreakdown.length > 0 ? (
                    <Grid container spacing={2}>
                      {analytics.courseBreakdown.map((courseData, index) => {
                        // Extract course info - handle both nested and direct structure
                        const course = courseData.course || courseData;
                        const courseTitle = course?.title || course?.name || 'Unnamed Course';
                        const courseCode = course?.courseCode || course?.code || 'N/A';
                        const teacher = courseData.teacher;
                        
                        console.log(`Course ${index}:`, { courseData, course, courseTitle, courseCode, teacher });
                        
                        return (
                          <Grid item xs={12} sm={6} md={4} key={index}>
                            <Paper 
                              elevation={2} 
                              sx={{ 
                                p: 2,
                                height: '100%',
                                display: 'flex',
                                flexDirection: 'column',
                                transition: 'all 0.3s',
                                '&:hover': {
                                  boxShadow: 6,
                                  transform: 'translateY(-4px)'
                                }
                              }}
                            >
                              {/* Course Header */}
                              <Box sx={{ mb: 2 }}>
                                <Typography variant="h6" sx={{ fontWeight: 'bold', mb: 0.5, fontSize: '1.2rem', color: '#000' }}>
                                  {courseTitle}
                                </Typography>
                                <Chip 
                                  label={courseCode} 
                                  size="small" 
                                  color="primary" 
                                  variant="outlined"
                                  sx={{ mb: 1 }}
                                />
                              </Box>

                              <Divider sx={{ mb: 2 }} />

                              {/* Course Stats */}
                              <Box sx={{ mb: 2, flexGrow: 1 }}>
                                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                                  <Typography variant="body2" color="text.secondary">
                                    Enrolled Students:
                                  </Typography>
                                  <Chip 
                                    label={courseData.enrolledStudents || 0} 
                                    size="small" 
                                    color="info"
                                    icon={<GroupIcon />}
                                  />
                                </Box>
                                
                                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                                  <Typography variant="body2" color="text.secondary">
                                    Avg Progress:
                                  </Typography>
                                  <Chip 
                                    label={`${Math.round(courseData.averageProgress || 0)}%`}
                                    size="small" 
                                    color={
                                      (courseData.averageProgress || 0) >= 70 ? 'success' :
                                      (courseData.averageProgress || 0) >= 40 ? 'warning' : 'error'
                                    }
                                  />
                                </Box>

                                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                                  <Typography variant="body2" color="text.secondary">
                                    Active Students:
                                  </Typography>
                                  <Typography variant="body2" sx={{ fontWeight: 'bold' }}>
                                    {courseData.activeStudents || 0}
                                  </Typography>
                                </Box>
                              </Box>

                              <Divider sx={{ mb: 2 }} />

                              {/* Teacher Info */}
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                {teacher ? (
                                  <>
                                    <Avatar sx={{ width: 32, height: 32, bgcolor: 'success.main', fontSize: '0.9rem' }}>
                                      {teacher.name?.charAt(0)?.toUpperCase()}
                                    </Avatar>
                                    <Box sx={{ flexGrow: 1 }}>
                                      <Typography variant="body2" sx={{ fontWeight: 600 }}>
                                        {teacher.name}
                                      </Typography>
                                      <Typography variant="caption" color="text.secondary">
                                        Instructor
                                      </Typography>
                                    </Box>
                                  </>
                                ) : (
                                  <>
                                    <Avatar sx={{ width: 32, height: 32, bgcolor: 'warning.main' }}>
                                      <PersonAddIcon sx={{ fontSize: 18 }} />
                                    </Avatar>
                                    <Typography variant="body2" color="warning.main" sx={{ fontWeight: 500 }}>
                                      No Teacher Assigned
                                    </Typography>
                                  </>
                                )}
                              </Box>
                            </Paper>
                          </Grid>
                        );
                      })}
                    </Grid>
                  ) : (
                    <Alert severity="info">
                      No course data available for this section
                    </Alert>
                  )}
                </CardContent>
              </Card>
            </Grid>

            {/* Student Performance */}
            <Grid item xs={12}>
              <Card>
                <CardContent>
                  <Typography variant="h6" sx={{ mb: 3, display: 'flex', alignItems: 'center' }}>
                    <GroupIcon sx={{ mr: 1 }} />
                    Student Performance
                  </Typography>
                  
                  {analytics.studentPerformance && analytics.studentPerformance.length > 0 ? (
                    <Box sx={{ overflowX: 'auto' }}>
                      <Table>
                        <TableHead>
                          <TableRow>
                            <TableCell>Student</TableCell>
                            <TableCell>Reg No</TableCell>
                            <TableCell align="center">Enrolled Courses</TableCell>
                            <TableCell align="center">Avg Progress</TableCell>
                            <TableCell align="center">Avg Quiz Score</TableCell>
                            <TableCell align="center">Quiz Pass Rate</TableCell>
                            <TableCell align="center">Status</TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {analytics.studentPerformance.map((studentData, index) => (
                            <TableRow key={index} hover>
                              <TableCell>
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                  <Avatar sx={{ width: 32, height: 32, bgcolor: 'primary.main', fontSize: '0.9rem' }}>
                                    {studentData.student?.name?.charAt(0)?.toUpperCase() || 'S'}
                                  </Avatar>
                                  <Typography variant="body2">
                                    {studentData.student?.name || 'Unknown'}
                                  </Typography>
                                </Box>
                              </TableCell>
                              <TableCell>
                                {studentData.student?.regNo || studentData.student?.rollNumber || 'N/A'}
                              </TableCell>
                              <TableCell align="center">
                                <Chip 
                                  label={studentData.enrolledCourses || 0}
                                  size="small"
                                  color="default"
                                />
                              </TableCell>
                              <TableCell align="center">
                                <Chip 
                                  label={`${Math.round(studentData.averageProgress || 0)}%`}
                                  size="small"
                                  color={
                                    (studentData.averageProgress || 0) >= 70 ? 'success' :
                                    (studentData.averageProgress || 0) >= 40 ? 'warning' : 'error'
                                  }
                                />
                              </TableCell>
                              <TableCell align="center">
                                <Chip 
                                  label={`${Math.round(studentData.averageQuizScore || 0)}%`}
                                  size="small"
                                  color={
                                    (studentData.averageQuizScore || 0) >= 70 ? 'success' :
                                    (studentData.averageQuizScore || 0) >= 40 ? 'warning' : 'error'
                                  }
                                />
                              </TableCell>
                              <TableCell align="center">
                                <Typography variant="body2">
                                  {Math.round(studentData.quizPassRate || 0)}%
                                </Typography>
                              </TableCell>
                              <TableCell align="center">
                                <Chip 
                                  label={studentData.isActive ? 'Active' : 'Inactive'}
                                  size="small"
                                  color={studentData.isActive ? 'success' : 'default'}
                                />
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </Box>
                  ) : (
                    <Alert severity="info">
                      No student data available for this section
                    </Alert>
                  )}
                </CardContent>
              </Card>
            </Grid>
          </Grid>
        </>
      )}

      {/* No Selection State */}
      {!analytics && !loading && (
        <Card>
          <CardContent sx={{ textAlign: 'center', py: 6 }}>
            <SchoolIcon sx={{ fontSize: 64, color: 'text.secondary', mb: 2 }} />
            <Typography variant="h6" color="textSecondary" gutterBottom>
              Select a section to view analytics
            </Typography>
            <Typography variant="body2" color="textSecondary">
              Choose a section from the dropdown above to see detailed student and course analytics
            </Typography>
          </CardContent>
        </Card>
      )}

      {/* Teacher Assignment Dialog */}
      <Dialog open={teacherDialog.open} onClose={() => setTeacherDialog({ open: false, course: null, section: null, currentTeacher: null })} maxWidth="sm" fullWidth>
        <DialogTitle>
          {teacherDialog.currentTeacher ? 'Change Teacher Assignment' : 'Assign Teacher to Course'}
        </DialogTitle>
        <DialogContent>
          {teacherDialog.course && (
            <Box sx={{ mb: 2 }}>
              <Typography variant="subtitle2" gutterBottom>
                Course: {teacherDialog.course.courseCode} - {teacherDialog.course.title}
              </Typography>
              {teacherDialog.currentTeacher && (
                <Typography variant="body2" color="text.secondary" gutterBottom>
                  Current Teacher: {teacherDialog.currentTeacher.name}
                </Typography>
              )}
            </Box>
          )}
          
          <FormControl fullWidth sx={{ mt: 2 }}>
            <InputLabel>Select Teacher</InputLabel>
            <Select
              value={selectedTeacher}
              onChange={(e) => setSelectedTeacher(e.target.value)}
              label="Select Teacher"
              disabled={assignLoading}
            >
              <MenuItem value="">
                <em>Select a teacher</em>
              </MenuItem>
              {availableTeachers.map((teacher) => (
                <MenuItem key={teacher._id} value={teacher._id}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Avatar sx={{ width: 24, height: 24, fontSize: '0.8rem' }}>
                      {teacher.name?.charAt(0)?.toUpperCase()}
                    </Avatar>
                    <Box>
                      <Typography variant="body2">{teacher.name}</Typography>
                      <Typography variant="caption" color="text.secondary">
                        {teacher.email}
                      </Typography>
                    </Box>
                  </Box>
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </DialogContent>
        <DialogActions>
          <Button 
            onClick={() => setTeacherDialog({ open: false, course: null, section: null, currentTeacher: null })}
            disabled={assignLoading}
          >
            Cancel
          </Button>
          <Button 
            onClick={handleAssignTeacher}
            variant="contained"
            disabled={!selectedTeacher || assignLoading}
            startIcon={assignLoading ? <CircularProgress size={16} /> : null}
          >
            {teacherDialog.currentTeacher ? 'Change Teacher' : 'Assign Teacher'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default HODSections;