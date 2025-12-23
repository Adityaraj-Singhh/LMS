import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  Grid,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Chip,
  CircularProgress,
  Alert,
  IconButton,
  Collapse,
  LinearProgress,
  Button
} from '@mui/material';
import {
  School as SchoolIcon,
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon,
  Person as PersonIcon,
  Assignment as AssignmentIcon,
  Schedule as ScheduleIcon,
  Download as DownloadIcon
} from '@mui/icons-material';
import axios from 'axios';

const SectionAnalytics = () => {
  const [sections, setSections] = useState([]);
  const [selectedSection, setSelectedSection] = useState(null);
  const [sectionDetails, setSectionDetails] = useState(null);
  const [loading, setLoading] = useState(true);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [error, setError] = useState('');
  const [expandedStudent, setExpandedStudent] = useState(null);

  useEffect(() => {
    fetchSections();
  }, []);

  const fetchSections = async () => {
    try {
      setLoading(true);
      setError('');
      
      const token = localStorage.getItem('token');
      const response = await axios.get(
        '/api/dean/sections',
        { headers: { Authorization: `Bearer ${token}` } }
      );

      console.log('Sections Response:', response.data);
      const sectionsData = response.data.sections || response.data || [];
      console.log('Sections Data:', sectionsData);
      setSections(Array.isArray(sectionsData) ? sectionsData : []);
    } catch (err) {
      console.error('Error fetching sections:', err);
      setError(err.response?.data?.message || 'Failed to fetch sections');
    } finally {
      setLoading(false);
    }
  };

  const fetchSectionDetails = async (sectionId) => {
    try {
      setDetailsLoading(true);
      setError('');
      
      const token = localStorage.getItem('token');
      const response = await axios.get(
        `/api/dean/section/${sectionId}/analytics`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      console.log('Section Details Response:', response.data);
      setSectionDetails(response.data);
      setSelectedSection(sectionId);
    } catch (err) {
      console.error('Error fetching section details:', err);
      setError(err.response?.data?.message || 'Failed to fetch section details');
    } finally {
      setDetailsLoading(false);
    }
  };

  const handleSectionClick = (sectionId) => {
    if (selectedSection === sectionId) {
      setSelectedSection(null);
      setSectionDetails(null);
    } else {
      fetchSectionDetails(sectionId);
    }
  };

  const handleExpandStudent = (studentId) => {
    setExpandedStudent(expandedStudent === studentId ? null : studentId);
  };

  const getProgressColor = (color) => {
    switch (color) {
      case 'green':
        return 'success';
      case 'yellow':
        return 'warning';
      case 'red':
        return 'error';
      default:
        return 'default';
    }
  };

  const getStatusLabel = (unitMark) => {
    if (!unitMark.attempted) {
      return { text: 'Not Attempted', color: 'default' };
    } else if (unitMark.percentage >= 75) {
      return { text: 'Excellent', color: 'success' };
    } else if (unitMark.percentage >= 50) {
      return { text: 'Good', color: 'warning' };
    } else if (unitMark.percentage >= 33) {
      return { text: 'Needs Improvement', color: 'warning' };
    } else {
      return { text: 'Failed', color: 'error' };
    }
  };

  const exportToCSV = () => {
    if (!sectionDetails) return;

    // Prepare CSV data
    const rows = [];
    
    // Add section header
    rows.push(['Section Analytics Report']);
    rows.push(['Section Name', sectionDetails.section?.name || sectionDetails.section?.sectionName || 'N/A']);
    rows.push(['Department', sectionDetails.department?.name || sectionDetails.department?.code || 'N/A']);
    rows.push(['Total Students', sectionDetails.students?.length || 0]);
    rows.push(['Total Courses', sectionDetails.courses?.length || 0]);
    rows.push([]);

    // Add courses info
    rows.push(['Courses in Section']);
    rows.push(['Course Code', 'Course Title']);
    if (sectionDetails.courses && Array.isArray(sectionDetails.courses)) {
      sectionDetails.courses.forEach(course => {
        rows.push([course.courseCode || course.code, course.title || course.courseTitle]);
      });
    }
    rows.push([]);

    // Add student performance data
    rows.push(['Student Performance Details']);
    
    if (sectionDetails.students && Array.isArray(sectionDetails.students)) {
      sectionDetails.students.forEach(student => {
      rows.push([]);
      rows.push(['Student Name', student.name || student.studentName]);
      rows.push(['Registration No', student.regNo || student.registrationNo]);
      rows.push(['Email', student.email]);
      rows.push([]);

      // Course-wise performance
      const courses = student.courses || student.coursePerformance || [];
      if (courses && Array.isArray(courses)) {
        courses.forEach(course => {
        rows.push(['Course', `${course.courseCode || course.code} - ${course.courseTitle || course.title}`]);
        rows.push(['Department', course.departmentName || 'N/A']);
        rows.push(['Total Watch Time', course.totalWatchTime ? `${Math.floor(course.totalWatchTime / 60)}m` : '0m']);
        rows.push(['Average Quiz', course.averageQuiz !== null ? `${course.averageQuiz.toFixed(1)}%` : 'N/A']);
        rows.push([]);

        // Unit-wise marks
        rows.push(['Unit Title', 'Videos Completed', 'Watch Time', 'Quiz %', 'Status']);
        const units = course.units || course.unitMarks || [];
        if (units && Array.isArray(units)) {
          units.forEach(unit => {
            const quizPct = unit.quizPercentage ?? unit.percentage ?? 0;
            const status = !quizPct && quizPct !== 0 
              ? 'Not Attempted'
              : quizPct >= 75 
              ? 'Excellent'
              : quizPct >= 50
              ? 'Good'
              : quizPct >= 33
              ? 'Needs Improvement'
              : 'Failed';
            
            rows.push([
              unit.unitTitle || unit.title,
              `${unit.videosCompleted || 0}/${unit.videosWatched || 0}`,
              unit.watchTime ? `${Math.floor(unit.watchTime / 60)}m ${unit.watchTime % 60}s` : '0s',
              quizPct ? quizPct.toFixed(2) : '0.00',
              status
            ]);
          });
        }
        rows.push([]);
      });
      }
    });
    }

    // Convert to CSV string
    const csvContent = rows.map(row => row.join(',')).join('\n');

    // Create and download file
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `${sectionDetails.section?.name || 'Section'}_Analytics_Report.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box p={3}>
      <Box mb={3}>
        <Typography variant="h4" gutterBottom>
          Section Analytics
        </Typography>
        <Typography variant="body1" color="text.secondary">
          View detailed performance analytics for each section
        </Typography>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError('')}>
          {error}
        </Alert>
      )}

      {/* Section List */}
      <Grid container spacing={3}>
        {Array.isArray(sections) && sections.map((section) => (
          <Grid item xs={12} md={6} lg={4} key={section._id || section.sectionId}>
            <Card
              sx={{
                cursor: 'pointer',
                transition: 'all 0.3s',
                border: selectedSection === (section._id || section.sectionId) ? '2px solid #1976d2' : '1px solid #e0e0e0',
                '&:hover': {
                  transform: 'translateY(-4px)',
                  boxShadow: 3
                }
              }}
              onClick={() => handleSectionClick(section._id || section.sectionId)}
            >
              <CardContent>
                <Box display="flex" alignments="center" mb={2}>
                  <SchoolIcon sx={{ fontSize: 40, color: 'primary.main', mr: 2 }} />
                  <Box>
                    <Typography variant="h6">{section.name || section.sectionName}</Typography>
                    <Typography variant="body2" color="text.secondary">
                      {section.department?.name || section.department?.code || section.department || 'N/A'}
                    </Typography>
                  </Box>
                </Box>
                
                <Box display="flex" justifyContent="space-between" mt={2}>
                  <Box>
                    <Typography variant="body2" color="text.secondary">Students</Typography>
                    <Typography variant="h6">{section.studentsCount || section.studentCount || 0}</Typography>
                  </Box>
                  <Box>
                    <Typography variant="body2" color="text.secondary">Courses</Typography>
                    <Typography variant="h6">{section.courses?.length || section.courseCount || 0}</Typography>
                  </Box>
                </Box>

                {section.courses && Array.isArray(section.courses) && section.courses.length > 0 && (
                  <Box mt={2}>
                    <Typography variant="caption" color="text.secondary">Courses:</Typography>
                    <Box mt={0.5}>
                      {section.courses.slice(0, 2).map((course, index) => (
                        <Chip
                          key={course.courseId || course._id || index}
                          label={course.courseCode || course.code || course.name || 'Course'}
                          size="small"
                          sx={{ mr: 0.5, mb: 0.5 }}
                        />
                      ))}
                      {section.courses && section.courses.length > 2 && (
                        <Chip
                          label={`+${section.courses.length - 2} more`}
                          size="small"
                          variant="outlined"
                        />
                      )}
                    </Box>
                  </Box>
                )}
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      {/* Section Details */}
      {detailsLoading && (
        <Box display="flex" justifyContent="center" mt={4}>
          <CircularProgress />
        </Box>
      )}

      {sectionDetails && !detailsLoading && (
        <Box mt={4}>
          <Card>
            <CardContent>
              <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
                <Typography variant="h5">
                  {sectionDetails.section?.name || sectionDetails.section?.sectionName || 'Section'} - Detailed Analytics
                </Typography>
                <Button
                  variant="contained"
                  startIcon={<DownloadIcon />}
                  onClick={exportToCSV}
                  color="primary"
                >
                  Export to CSV
                </Button>
              </Box>
              
              <Grid container spacing={2} sx={{ mb: 3 }}>
                <Grid item xs={12} md={3}>
                  <Card variant="outlined">
                    <CardContent>
                      <Typography color="text.secondary" variant="body2">Department</Typography>
                      <Typography variant="h6">{sectionDetails.department?.name || sectionDetails.department?.code || sectionDetails.section?.department || 'N/A'}</Typography>
                    </CardContent>
                  </Card>
                </Grid>
                <Grid item xs={12} md={3}>
                  <Card variant="outlined">
                    <CardContent>
                      <Typography color="text.secondary" variant="body2">Total Students</Typography>
                      <Typography variant="h6">{sectionDetails.students?.length || sectionDetails.section?.studentCount || 0}</Typography>
                    </CardContent>
                  </Card>
                </Grid>
                <Grid item xs={12} md={3}>
                  <Card variant="outlined">
                    <CardContent>
                      <Typography color="text.secondary" variant="body2">Total Courses</Typography>
                      <Typography variant="h6">{sectionDetails.courses?.length || sectionDetails.section?.courseCount || 0}</Typography>
                    </CardContent>
                  </Card>
                </Grid>
              </Grid>

              {/* Courses Info */}
              <Typography variant="h6" gutterBottom sx={{ mt: 3 }}>
                Courses in this Section
              </Typography>
              <Grid container spacing={1} sx={{ mb: 3 }}>
                {sectionDetails.courses && Array.isArray(sectionDetails.courses) && sectionDetails.courses.map((course, idx) => (
                  <Grid item xs={12} md={6} key={course._id || course.courseId || idx}>
                    <Card variant="outlined">
                      <CardContent>
                        <Typography variant="subtitle1">
                          {course.courseCode || course.code || 'N/A'} - {course.title || course.courseTitle || 'N/A'}
                        </Typography>
                      </CardContent>
                    </Card>
                  </Grid>
                ))}
              </Grid>

              {/* Student Performance Table */}
              <Typography variant="h6" gutterBottom sx={{ mt: 3 }}>
                Student Performance
              </Typography>
              
              <TableContainer component={Paper} variant="outlined">
                <Table>
                  <TableHead>
                    <TableRow sx={{ backgroundColor: '#f5f5f5' }}>
                      <TableCell><strong>Student</strong></TableCell>
                      <TableCell align="center"><strong>Reg No</strong></TableCell>
                      <TableCell align="center"><strong>Courses</strong></TableCell>
                      <TableCell align="center"><strong>Details</strong></TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {sectionDetails.students && Array.isArray(sectionDetails.students) && sectionDetails.students.map((student) => (
                      <React.Fragment key={student._id || student.studentId}>
                        <TableRow hover>
                          <TableCell>
                            <Box>
                              <Typography variant="body1">{student.name || student.studentName}</Typography>
                              <Typography variant="caption" color="text.secondary">
                                {student.email}
                              </Typography>
                            </Box>
                          </TableCell>
                          <TableCell align="center">
                            <Chip label={student.regNo || student.registrationNo || 'N/A'} size="small" variant="outlined" />
                          </TableCell>
                          <TableCell align="center">
                            {student.courses?.length || student.coursePerformance?.length || 0}
                          </TableCell>
                          <TableCell align="center">
                            <IconButton
                              size="small"
                              onClick={() => handleExpandStudent(student._id || student.studentId)}
                            >
                              {expandedStudent === (student._id || student.studentId) ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                            </IconButton>
                          </TableCell>
                        </TableRow>
                        
                        {/* Expanded Course Details */}
                        <TableRow>
                          <TableCell colSpan={4} sx={{ p: 0 }}>
                            <Collapse in={expandedStudent === (student._id || student.studentId)} timeout="auto" unmountOnExit>
                              <Box sx={{ p: 3, backgroundColor: '#fafafa' }}>
                                {(student.courses || student.coursePerformance || []).map((course, idx) => (
                                  <Card key={course.courseId || course._id || idx} sx={{ mb: 2 }}>
                                    <CardContent>
                                      <Typography variant="h6" gutterBottom>
                                        {course.courseCode || course.code || 'N/A'} - {course.courseTitle || course.title || 'N/A'}
                                      </Typography>
                                      
                                      <Typography variant="body2" color="text.secondary" gutterBottom>
                                        Department: {course.departmentName || 'N/A'}
                                      </Typography>

                                      {/* Course Stats */}
                                      <Grid container spacing={2} sx={{ mt: 1, mb: 2 }}>
                                        <Grid item xs={6} md={4}>
                                          <Typography variant="caption" color="text.secondary">Total Watch Time</Typography>
                                          <Box>
                                            <Chip
                                              icon={<ScheduleIcon />}
                                              label={course.totalWatchTime ? `${Math.floor(course.totalWatchTime / 60)}m ${course.totalWatchTime % 60}s` : '0s'}
                                              size="small"
                                              color={course.totalWatchTime >= 3600 ? 'success' : course.totalWatchTime >= 1800 ? 'warning' : 'default'}
                                              variant="outlined"
                                            />
                                          </Box>
                                        </Grid>
                                        <Grid item xs={6} md={4}>
                                          <Typography variant="caption" color="text.secondary">Average Quiz</Typography>
                                          <Box>
                                            <Chip
                                              label={course.averageQuiz !== null ? `${course.averageQuiz.toFixed(1)}%` : 'N/A'}
                                              size="small"
                                              color={course.averageQuiz >= 75 ? 'success' : course.averageQuiz >= 50 ? 'warning' : 'error'}
                                            />
                                          </Box>
                                        </Grid>
                                      </Grid>

                                      {/* Unit-wise Performance */}
                                      <Typography variant="subtitle2" gutterBottom sx={{ mt: 2 }}>
                                        Unit-wise Performance
                                      </Typography>
                                      
                                      <TableContainer component={Paper} variant="outlined">
                                        <Table size="small">
                                          <TableHead>
                                            <TableRow>
                                              <TableCell><strong>Unit</strong></TableCell>
                                              <TableCell align="center"><strong>Videos</strong></TableCell>
                                              <TableCell align="center"><strong>Watch Time</strong></TableCell>
                                              <TableCell align="center"><strong>Quiz %</strong></TableCell>
                                              <TableCell align="center"><strong>Status</strong></TableCell>
                                            </TableRow>
                                          </TableHead>
                                          <TableBody>
                                            {(course.units || course.unitMarks || []).map((unit, uIdx) => {
                                              const quizPct = unit.quizPercentage ?? unit.percentage ?? 0;
                                              const isPassed = unit.quizPassed ?? unit.passed ?? false;
                                              const status = !quizPct && quizPct !== 0 
                                                ? { text: 'Not Attempted', color: 'default' }
                                                : quizPct >= 75 
                                                ? { text: 'Excellent', color: 'success' }
                                                : quizPct >= 50
                                                ? { text: 'Good', color: 'warning' }
                                                : quizPct >= 33
                                                ? { text: 'Needs Improvement', color: 'warning' }
                                                : { text: 'Failed', color: 'error' };
                                              
                                              return (
                                                <TableRow key={unit.unitId || unit._id || uIdx}>
                                                  <TableCell>{unit.unitTitle || unit.title || 'N/A'}</TableCell>
                                                  <TableCell align="center">
                                                    {unit.videosCompleted || 0}/{unit.videosWatched || 0}
                                                  </TableCell>
                                                  <TableCell align="center">
                                                    {unit.watchTime ? `${Math.floor(unit.watchTime / 60)}m ${unit.watchTime % 60}s` : '0s'}
                                                  </TableCell>
                                                  <TableCell align="center">
                                                    <Box sx={{ minWidth: 80 }}>
                                                      <Box display="flex" alignItems="center" justifyContent="center">
                                                        <Typography variant="body2" sx={{ mr: 1 }}>
                                                          {quizPct ? quizPct.toFixed(1) : 0}%
                                                        </Typography>
                                                      </Box>
                                                      <LinearProgress
                                                        variant="determinate"
                                                        value={quizPct || 0}
                                                        color={quizPct >= 75 ? 'success' : quizPct >= 50 ? 'warning' : 'error'}
                                                        sx={{ mt: 0.5 }}
                                                      />
                                                    </Box>
                                                  </TableCell>
                                                  <TableCell align="center">
                                                    <Chip
                                                      label={status.text}
                                                      size="small"
                                                      color={status.color}
                                                    />
                                                  </TableCell>
                                                </TableRow>
                                              );
                                            })}
                                          </TableBody>
                                        </Table>
                                      </TableContainer>
                                    </CardContent>
                                  </Card>
                                ))}
                              </Box>
                            </Collapse>
                          </TableCell>
                        </TableRow>
                      </React.Fragment>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </CardContent>
          </Card>
        </Box>
      )}
    </Box>
  );
};

export default SectionAnalytics;
