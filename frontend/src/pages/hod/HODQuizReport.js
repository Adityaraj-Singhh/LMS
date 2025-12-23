import React, { useState } from 'react';
import {
  Box,
  Card,
  CardContent,
  CardHeader,
  Typography,
  TextField,
  Button,
  CircularProgress,
  Alert,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Chip,
  Grid,
  Divider,
  IconButton,
  Tooltip,
  InputAdornment,
  Collapse
} from '@mui/material';
import {
  Search as SearchIcon,
  ExpandMore as ExpandMoreIcon,
  CheckCircle as CheckCircleIcon,
  Cancel as CancelIcon,
  Download as DownloadIcon,
  Quiz as QuizIcon,
  Person as PersonIcon,
  School as SchoolIcon,
  AccessTime as AccessTimeIcon,
  Help as HelpIcon,
  ExpandLess as ExpandLessIcon
} from '@mui/icons-material';
import { format } from 'date-fns';
import axios from 'axios';

const HODQuizReport = () => {
  const [regNo, setRegNo] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [studentData, setStudentData] = useState(null);
  const [expandedCourses, setExpandedCourses] = useState({});
  const [expandedUnits, setExpandedUnits] = useState({});
  const [expandedAttempts, setExpandedAttempts] = useState({});
  const [exporting, setExporting] = useState({});

  const token = localStorage.getItem('token');

  const handleSearch = async () => {
    if (!regNo.trim()) {
      setError('Please enter a registration number');
      return;
    }

    setLoading(true);
    setError('');
    setStudentData(null);
    setExpandedCourses({});
    setExpandedUnits({});
    setExpandedAttempts({});

    try {
      const response = await axios.get(`/api/hod/quiz-report/attempts?regNo=${encodeURIComponent(regNo.trim())}`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (response.data.success) {
        setStudentData(response.data);
        // Auto-expand first course if only one
        if (response.data.courses?.length === 1) {
          setExpandedCourses({ [response.data.courses[0].courseId]: true });
        }
      } else {
        setError(response.data.message || 'Failed to fetch student data');
      }
    } catch (err) {
      console.error('Error fetching quiz report:', err);
      setError(err.response?.data?.message || 'Error fetching student quiz data');
    } finally {
      setLoading(false);
    }
  };

  const handleExportCSV = async (attemptId, studentRegNo, courseCode) => {
    setExporting(prev => ({ ...prev, [attemptId]: true }));
    
    try {
      const response = await axios.get(`/api/hod/quiz-report/export/${attemptId}`, {
        headers: { Authorization: `Bearer ${token}` },
        responseType: 'blob'
      });

      // Create download link
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `Quiz_Report_${studentRegNo}_${courseCode}_${new Date().toISOString().split('T')[0]}.csv`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Error exporting CSV:', err);
      setError('Failed to export CSV');
    } finally {
      setExporting(prev => ({ ...prev, [attemptId]: false }));
    }
  };

  const toggleCourse = (courseId) => {
    setExpandedCourses(prev => ({ ...prev, [courseId]: !prev[courseId] }));
  };

  const toggleUnit = (unitId) => {
    setExpandedUnits(prev => ({ ...prev, [unitId]: !prev[unitId] }));
  };

  const toggleAttempt = (attemptId) => {
    setExpandedAttempts(prev => ({ ...prev, [attemptId]: !prev[attemptId] }));
  };

  const formatTime = (seconds) => {
    if (!seconds) return '0 min';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return mins > 0 ? `${mins} min ${secs} sec` : `${secs} sec`;
  };

  const getOptionLetter = (index) => {
    return ['A', 'B', 'C', 'D', 'E', 'F'][index] || `${index + 1}`;
  };

  return (
    <Box sx={{ p: 3 }}>
      <Card elevation={3}>
        <CardHeader
          avatar={<QuizIcon color="primary" sx={{ fontSize: 32 }} />}
          title={
            <Typography variant="h5" fontWeight="bold">
              Student Quiz Report
            </Typography>
          }
          subheader="Search student by registration number to view their quiz attempts with detailed question-by-question analysis"
        />
        <Divider />
        <CardContent>
          {/* Search Section */}
          <Box sx={{ mb: 4 }}>
            <Grid container spacing={2} alignItems="center">
              <Grid item xs={12} md={6}>
                <TextField
                  fullWidth
                  label="Student Registration Number"
                  placeholder="Enter registration number (e.g., 2021001234)"
                  value={regNo}
                  onChange={(e) => setRegNo(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
                  InputProps={{
                    startAdornment: (
                      <InputAdornment position="start">
                        <PersonIcon color="action" />
                      </InputAdornment>
                    )
                  }}
                />
              </Grid>
              <Grid item xs={12} md={2}>
                <Button
                  fullWidth
                  variant="contained"
                  color="primary"
                  onClick={handleSearch}
                  disabled={loading || !regNo.trim()}
                  startIcon={loading ? <CircularProgress size={20} color="inherit" /> : <SearchIcon />}
                  sx={{ height: 56 }}
                >
                  {loading ? 'Searching...' : 'Search'}
                </Button>
              </Grid>
            </Grid>
          </Box>

          {/* Error Alert */}
          {error && (
            <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError('')}>
              {error}
            </Alert>
          )}

          {/* Student Info Card */}
          {studentData?.student && (
            <Card variant="outlined" sx={{ mb: 3, bgcolor: 'primary.50' }}>
              <CardContent>
                <Grid container spacing={2} alignItems="center">
                  <Grid item>
                    <SchoolIcon sx={{ fontSize: 48, color: 'primary.main' }} />
                  </Grid>
                  <Grid item xs>
                    <Typography variant="h6" fontWeight="bold">
                      {studentData.student.name}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Reg No: {studentData.student.regNo} | Email: {studentData.student.email}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {studentData.student.school && `School: ${studentData.student.school}`}
                      {studentData.student.department && ` | Department: ${studentData.student.department}`}
                    </Typography>
                  </Grid>
                  <Grid item>
                    <Chip 
                      label={`${studentData.totalCourses} Course(s)`} 
                      color="primary" 
                      sx={{ mr: 1 }}
                    />
                    <Chip 
                      label={`${studentData.totalAttempts} Total Attempt(s)`} 
                      color="secondary" 
                    />
                  </Grid>
                </Grid>
              </CardContent>
            </Card>
          )}

          {/* Courses Accordion */}
          {studentData?.courses?.map((course) => (
            <Accordion 
              key={course.courseId}
              expanded={expandedCourses[course.courseId] || false}
              onChange={() => toggleCourse(course.courseId)}
              sx={{ mb: 2 }}
            >
              <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <Box sx={{ display: 'flex', alignItems: 'center', width: '100%', justifyContent: 'space-between', pr: 2 }}>
                  <Box>
                    <Typography variant="subtitle1" fontWeight="bold">
                      {course.courseTitle}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Code: {course.courseCode}
                    </Typography>
                  </Box>
                  <Chip 
                    label={`${course.totalAttempts} Attempt(s)`}
                    size="small"
                    color={course.totalAttempts > 0 ? 'success' : 'default'}
                  />
                </Box>
              </AccordionSummary>
              <AccordionDetails>
                {course.units?.length === 0 ? (
                  <Alert severity="info">No quiz attempts found for this course</Alert>
                ) : (
                  course.units?.map((unit) => (
                    <Card key={unit.unitId} variant="outlined" sx={{ mb: 2 }}>
                      <Box
                        sx={{
                          p: 2,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          cursor: 'pointer',
                          bgcolor: expandedUnits[unit.unitId] ? 'grey.100' : 'transparent',
                          '&:hover': { bgcolor: 'grey.50' }
                        }}
                        onClick={() => toggleUnit(unit.unitId)}
                      >
                        <Box>
                          <Typography variant="subtitle2" fontWeight="bold">
                            Unit {unit.unitOrder}: {unit.unitTitle}
                          </Typography>
                          <Typography variant="body2" color="text.secondary">
                            {unit.totalAttempts} attempt(s)
                          </Typography>
                        </Box>
                        <IconButton size="small">
                          {expandedUnits[unit.unitId] ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                        </IconButton>
                      </Box>

                      <Collapse in={expandedUnits[unit.unitId]}>
                        <Divider />
                        <Box sx={{ p: 2 }}>
                          {unit.attempts?.map((attempt, attemptIndex) => (
                            <Card 
                              key={attempt.attemptId} 
                              variant="outlined" 
                              sx={{ 
                                mb: 2,
                                border: attempt.passed ? '2px solid #4caf50' : '2px solid #f44336'
                              }}
                            >
                              {/* Attempt Header */}
                              <Box
                                sx={{
                                  p: 2,
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'space-between',
                                  cursor: 'pointer',
                                  bgcolor: attempt.passed ? 'success.50' : 'error.50',
                                  '&:hover': { opacity: 0.9 }
                                }}
                                onClick={() => toggleAttempt(attempt.attemptId)}
                              >
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                                  {attempt.passed ? (
                                    <CheckCircleIcon color="success" sx={{ fontSize: 32 }} />
                                  ) : (
                                    <CancelIcon color="error" sx={{ fontSize: 32 }} />
                                  )}
                                  <Box>
                                    <Typography variant="subtitle1" fontWeight="bold">
                                      Attempt #{attempt.attemptNumber}
                                    </Typography>
                                    <Typography variant="body2" color="text.secondary">
                                      {attempt.completedAt && format(new Date(attempt.completedAt), 'PPpp')}
                                    </Typography>
                                  </Box>
                                </Box>

                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                                  <Box sx={{ textAlign: 'right' }}>
                                    <Typography variant="h6" fontWeight="bold" color={attempt.passed ? 'success.main' : 'error.main'}>
                                      {attempt.percentage}%
                                    </Typography>
                                    <Typography variant="body2" color="text.secondary">
                                      {attempt.score}/{attempt.maxScore} points
                                    </Typography>
                                  </Box>

                                  <Chip 
                                    label={attempt.passed ? 'PASSED' : 'FAILED'}
                                    color={attempt.passed ? 'success' : 'error'}
                                    size="small"
                                  />

                                  <Tooltip title="Export to CSV">
                                    <IconButton
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleExportCSV(attempt.attemptId, studentData.student.regNo, course.courseCode);
                                      }}
                                      disabled={exporting[attempt.attemptId]}
                                      color="primary"
                                    >
                                      {exporting[attempt.attemptId] ? (
                                        <CircularProgress size={20} />
                                      ) : (
                                        <DownloadIcon />
                                      )}
                                    </IconButton>
                                  </Tooltip>

                                  <IconButton size="small">
                                    {expandedAttempts[attempt.attemptId] ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                                  </IconButton>
                                </Box>
                              </Box>

                              {/* Attempt Stats */}
                              <Box sx={{ px: 2, py: 1, bgcolor: 'grey.50' }}>
                                <Grid container spacing={2}>
                                  <Grid item xs={6} sm={3}>
                                    <Typography variant="body2" color="text.secondary">
                                      <AccessTimeIcon sx={{ fontSize: 14, mr: 0.5, verticalAlign: 'middle' }} />
                                      Time: {formatTime(attempt.timeSpent)}
                                    </Typography>
                                  </Grid>
                                  <Grid item xs={6} sm={3}>
                                    <Typography variant="body2" color="success.main">
                                      <CheckCircleIcon sx={{ fontSize: 14, mr: 0.5, verticalAlign: 'middle' }} />
                                      Correct: {attempt.correctAnswers}
                                    </Typography>
                                  </Grid>
                                  <Grid item xs={6} sm={3}>
                                    <Typography variant="body2" color="error.main">
                                      <CancelIcon sx={{ fontSize: 14, mr: 0.5, verticalAlign: 'middle' }} />
                                      Wrong: {attempt.wrongAnswers}
                                    </Typography>
                                  </Grid>
                                  <Grid item xs={6} sm={3}>
                                    <Typography variant="body2" color="text.secondary">
                                      <HelpIcon sx={{ fontSize: 14, mr: 0.5, verticalAlign: 'middle' }} />
                                      Unanswered: {attempt.unanswered}
                                    </Typography>
                                  </Grid>
                                </Grid>
                                {attempt.autoSubmitted && (
                                  <Alert severity="warning" sx={{ mt: 1, py: 0 }}>
                                    Auto-submitted (time limit or security violation)
                                  </Alert>
                                )}
                              </Box>

                              {/* Question Details - Collapsible */}
                              <Collapse in={expandedAttempts[attempt.attemptId]}>
                                <Divider />
                                <TableContainer>
                                  <Table size="small">
                                    <TableHead>
                                      <TableRow sx={{ bgcolor: 'grey.200' }}>
                                        <TableCell width={50}><strong>Q#</strong></TableCell>
                                        <TableCell><strong>Question</strong></TableCell>
                                        <TableCell width={200}><strong>Student Answer</strong></TableCell>
                                        <TableCell width={200}><strong>Correct Answer</strong></TableCell>
                                        <TableCell width={80} align="center"><strong>Status</strong></TableCell>
                                        <TableCell width={80} align="center"><strong>Points</strong></TableCell>
                                      </TableRow>
                                    </TableHead>
                                    <TableBody>
                                      {attempt.questions?.map((question) => (
                                        <TableRow 
                                          key={question.questionId}
                                          sx={{
                                            bgcolor: question.isCorrect 
                                              ? 'rgba(76, 175, 80, 0.08)' 
                                              : question.studentSelectedOption === null
                                                ? 'rgba(255, 193, 7, 0.08)'
                                                : 'rgba(244, 67, 54, 0.08)'
                                          }}
                                        >
                                          <TableCell>
                                            <Typography variant="body2" fontWeight="bold">
                                              {question.questionNumber}
                                            </Typography>
                                          </TableCell>
                                          <TableCell>
                                            <Typography variant="body2" sx={{ mb: 1 }}>
                                              {question.questionText}
                                            </Typography>
                                            <Box sx={{ pl: 1 }}>
                                              {question.options?.map((option, optIndex) => (
                                                <Typography 
                                                  key={optIndex} 
                                                  variant="caption" 
                                                  display="block"
                                                  sx={{
                                                    color: optIndex === question.correctOption 
                                                      ? 'success.main' 
                                                      : optIndex === question.studentSelectedOption && !question.isCorrect
                                                        ? 'error.main'
                                                        : 'text.secondary',
                                                    fontWeight: optIndex === question.correctOption || optIndex === question.studentSelectedOption 
                                                      ? 'bold' 
                                                      : 'normal'
                                                  }}
                                                >
                                                  {getOptionLetter(optIndex)}. {option}
                                                  {optIndex === question.correctOption && ' ✓'}
                                                  {optIndex === question.studentSelectedOption && !question.isCorrect && ' ✗'}
                                                </Typography>
                                              ))}
                                            </Box>
                                          </TableCell>
                                          <TableCell>
                                            <Typography 
                                              variant="body2"
                                              sx={{
                                                color: question.studentSelectedOption === null 
                                                  ? 'text.disabled' 
                                                  : question.isCorrect 
                                                    ? 'success.main' 
                                                    : 'error.main',
                                                fontWeight: 'bold'
                                              }}
                                            >
                                              {question.studentSelectedOption !== null 
                                                ? `${getOptionLetter(question.studentSelectedOption)}: ${question.studentSelectedText}`
                                                : 'Not Answered'}
                                            </Typography>
                                          </TableCell>
                                          <TableCell>
                                            <Typography variant="body2" sx={{ color: 'success.main', fontWeight: 'bold' }}>
                                              {getOptionLetter(question.correctOption)}: {question.correctOptionText}
                                            </Typography>
                                          </TableCell>
                                          <TableCell align="center">
                                            {question.isCorrect ? (
                                              <Chip label="Correct" color="success" size="small" icon={<CheckCircleIcon />} />
                                            ) : question.studentSelectedOption === null ? (
                                              <Chip label="Skipped" color="warning" size="small" icon={<HelpIcon />} />
                                            ) : (
                                              <Chip label="Wrong" color="error" size="small" icon={<CancelIcon />} />
                                            )}
                                          </TableCell>
                                          <TableCell align="center">
                                            <Typography variant="body2">
                                              {question.pointsEarned}/{question.maxPoints}
                                            </Typography>
                                          </TableCell>
                                        </TableRow>
                                      ))}
                                    </TableBody>
                                  </Table>
                                </TableContainer>
                              </Collapse>
                            </Card>
                          ))}
                        </Box>
                      </Collapse>
                    </Card>
                  ))
                )}
              </AccordionDetails>
            </Accordion>
          ))}

          {/* No Data State */}
          {!loading && !studentData && !error && (
            <Box sx={{ textAlign: 'center', py: 6, color: 'text.secondary' }}>
              <QuizIcon sx={{ fontSize: 64, opacity: 0.3, mb: 2 }} />
              <Typography variant="h6">
                Enter a student registration number to view their quiz attempts
              </Typography>
              <Typography variant="body2">
                You can view attempts for students enrolled in your department's courses
              </Typography>
            </Box>
          )}
        </CardContent>
      </Card>
    </Box>
  );
};

export default HODQuizReport;
