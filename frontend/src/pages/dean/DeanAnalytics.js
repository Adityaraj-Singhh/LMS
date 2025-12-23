import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import DeanDepartmentAnalytics from './DeanDepartmentAnalytics';
import DeanCourseAnalytics from './DeanCourseAnalytics';
import {
  Box,
  Grid,
  Card,
  CardContent,
  Typography,
  CircularProgress,
  Alert,
  Tabs,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  LinearProgress,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Paper,
  List,
  ListItem,
  ListItemText,
  Divider,
  useTheme,
  useMediaQuery
} from '@mui/material';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Pagination,
  Button
} from '@mui/material';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Area,
  AreaChart
} from 'recharts';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import SchoolIcon from '@mui/icons-material/School';
import PeopleIcon from '@mui/icons-material/People';
import ClassIcon from '@mui/icons-material/Class';
import PersonIcon from '@mui/icons-material/Person';
import VideoLibraryIcon from '@mui/icons-material/VideoLibrary';
import AssessmentIcon from '@mui/icons-material/Assessment';
import axios from 'axios';

const DeanAnalytics = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [data, setData] = useState(null);
  const [currentTab, setCurrentTab] = useState(0); // 0=Explore (Lazy), 1=Dept, 2=Course, 3=Student
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const isTablet = useMediaQuery(theme.breakpoints.down('md'));

  // Explore (Lazy) state
  const [deptLoading, setDeptLoading] = useState(false);
  const [departments, setDepartments] = useState([]);
  const [expandedDept, setExpandedDept] = useState(null);
  const [deptFilter, setDeptFilter] = useState('');
  const [courseFilter, setCourseFilter] = useState('');
  const [peopleFilter, setPeopleFilter] = useState('');
  const [coursesByDept, setCoursesByDept] = useState({}); // { [deptId]: Course[] }
  const [coursesLoading, setCoursesLoading] = useState({}); // { [deptId]: bool }
  const [relationsByCourse, setRelationsByCourse] = useState({}); // { [courseId]: { teachers, students, pagination } }
  const [relationsLoading, setRelationsLoading] = useState({}); // { [courseId]: bool }
  const [studentPages, setStudentPages] = useState({}); // { [courseId]: { page, totalPages, limit } }
  const [sectionsDialog, setSectionsDialog] = useState({ open: false, loading: false, course: null, data: null });
  const [studentDialog, setStudentDialog] = useState({ open: false, loading: false, data: null });
  const [studentSearch, setStudentSearch] = useState('');
  const [studentSearchResult, setStudentSearchResult] = useState(null);

  // Defer heavy analytics fetch: only when opening Department or Course tabs
  useEffect(() => {
    if (currentTab === 0) return; // Explore tab, don't fetch heavy data
    if (data) return; // Already loaded
    (async () => {
      try {
        setLoading(true);
        const token = localStorage.getItem('token');
        const res = await axios.get('/api/dean/analytics', {
          headers: { Authorization: `Bearer ${token}` }
        });
        setData(res.data);
        setError('');
      } catch (err) {
        console.error('Error loading dean analytics:', err);
        setError(err.response?.data?.message || 'Failed to load analytics');
      } finally {
        setLoading(false);
      }
    })();
  }, [currentTab, data]);

  // Student tab (school-wide sections)
  const [sectionsFilter, setSectionsFilter] = useState('');
  const [sectionsPage, setSectionsPage] = useState(1);
  const [sectionsTotalPages, setSectionsTotalPages] = useState(1);
  const [sectionsLoading, setSectionsLoading] = useState(false);
  const [sections, setSections] = useState([]);
  const [selectedSection, setSelectedSection] = useState(null);
  const [sectionAnalytics, setSectionAnalytics] = useState(null);
  const [sectionAnalyticsLoading, setSectionAnalyticsLoading] = useState(false);

  const loadSections = async (page = 1, q = '') => {
    try {
      setSectionsLoading(true);
      const token = localStorage.getItem('token');
      const res = await axios.get('/api/dean/sections', { params: { page, q, limit: 10 }, headers: { Authorization: `Bearer ${token}` } });
      setSections(res.data?.sections || []);
      const p = res.data?.pagination || { page: 1, totalPages: 1 };
      setSectionsPage(p.page || 1);
      setSectionsTotalPages(p.totalPages || 1);
    } catch (err) {
      console.error('Failed to load sections', err);
      setError(err.response?.data?.message || 'Failed to load sections');
    } finally {
      setSectionsLoading(false);
    }
  };

  useEffect(() => {
    if (currentTab !== 3) return;
    loadSections(1, sectionsFilter);
  }, [currentTab]);

  const loadSectionAnalytics = async (sectionId) => {
    try {
      setSectionAnalytics(null);
      setSectionAnalyticsLoading(true);
      const token = localStorage.getItem('token');
      const res = await axios.get(`/api/dean/section/${sectionId}/analytics`, { headers: { Authorization: `Bearer ${token}` } });
      setSectionAnalytics(res.data);
    } catch (err) {
      console.error('Failed to load section analytics', err);
      setError(err.response?.data?.message || 'Failed to load section analytics');
    } finally {
      setSectionAnalyticsLoading(false);
    }
  };

  // Load departments for Explore tab on first enter
  useEffect(() => {
    if (currentTab !== 0) return;
    if (departments.length > 0) return;
    (async () => {
      try {
        setDeptLoading(true);
        const token = localStorage.getItem('token');
        const res = await axios.get('/api/dean/departments', { headers: { Authorization: `Bearer ${token}` } });
        setDepartments(res.data?.departments || []);
      } catch (err) {
        console.error('Failed to load departments', err);
        setError(err.response?.data?.message || 'Failed to load departments');
      } finally {
        setDeptLoading(false);
      }
    })();
  }, [currentTab, departments.length]);

  const handleExpandDept = (deptId) => async (event, isExpanded) => {
    setExpandedDept(isExpanded ? deptId : null);
    if (isExpanded && !coursesByDept[deptId]) {
      try {
        setCoursesLoading(prev => ({ ...prev, [deptId]: true }));
        const token = localStorage.getItem('token');
        const res = await axios.get(`/api/dean/department/${deptId}/courses`, { headers: { Authorization: `Bearer ${token}` } });
        setCoursesByDept(prev => ({ ...prev, [deptId]: res.data?.courses || [] }));
      } catch (err) {
        console.error('Failed to load department courses', err);
        setError(err.response?.data?.message || 'Failed to load department courses');
      } finally {
        setCoursesLoading(prev => ({ ...prev, [deptId]: false }));
      }
    }
  };

  const loadCourseRelations = async (courseId, page = 1, limit = 25) => {
    try {
      setRelationsLoading(prev => ({ ...prev, [courseId]: true }));
      const token = localStorage.getItem('token');
      const res = await axios.get(`/api/dean/course/${courseId}/relations`, { params: { page, limit }, headers: { Authorization: `Bearer ${token}` } });
      setRelationsByCourse(prev => ({ ...prev, [courseId]: res.data }));
      const p = res.data?.pagination || { page: 1, totalPages: 1, limit };
      setStudentPages(prev => ({ ...prev, [courseId]: p }));
    } catch (err) {
      console.error('Failed to load course relations', err);
      setError(err.response?.data?.message || 'Failed to load course relations');
    } finally {
      setRelationsLoading(prev => ({ ...prev, [courseId]: false }));
    }
  };

  const loadCourseSections = async (courseId, page = 1, limit = 25) => {
    try {
      setSectionsDialog(prev => ({ ...prev, open: true, loading: true, course: prev.course || { _id: courseId } }));
      const token = localStorage.getItem('token');
      const res = await axios.get(`/api/dean/course/${courseId}/sections`, { params: { page, limit }, headers: { Authorization: `Bearer ${token}` } });
      setSectionsDialog({ open: true, loading: false, course: res.data.course, data: res.data });
    } catch (err) {
      console.error('Failed to load course sections', err);
      setError(err.response?.data?.message || 'Failed to load course sections');
      setSectionsDialog({ open: false, loading: false, course: null, data: null });
    }
  };

  const searchStudentByRegNo = async () => {
    try {
      setStudentSearchResult(null);
      if (!studentSearch.trim()) return;
      const token = localStorage.getItem('token');
      const res = await axios.get('/api/dean/student/search', { params: { regNo: studentSearch.trim() }, headers: { Authorization: `Bearer ${token}` } });
      setStudentSearchResult(res.data);
    } catch (err) {
      console.error('Failed to search student', err);
      setStudentSearchResult({ error: err.response?.data?.message || 'Student not found' });
    }
  };

  const openStudentDialog = async (studentId) => {
    try {
      setStudentDialog({ open: true, loading: true, data: null });
      const token = localStorage.getItem('token');
      const res = await axios.get(`/api/dean/student/${studentId}/details`, { headers: { Authorization: `Bearer ${token}` } });
      setStudentDialog({ open: true, loading: false, data: res.data });
    } catch (err) {
      console.error('Failed to load student details', err);
      setError(err.response?.data?.message || 'Failed to load student details');
      setStudentDialog({ open: false, loading: false, data: null });
    }
  };

  // Chart data preparation
  const departmentChartData = useMemo(() => {
    if (!data?.departmentAnalytics) return [];
    return data.departmentAnalytics.map(dept => ({
      name: dept.name,
      courses: dept.totalCourses,
      teachers: dept.totalTeachers,
      students: dept.totalStudents,
      sections: dept.totalSections,
      avgStudents: dept.avgStudentsPerCourse,
      noTeacher: dept.coursesWithoutTeachers,
      noStudents: dept.coursesWithoutStudents
    }));
  }, [data]);

  const courseUtilizationData = useMemo(() => {
    if (!data?.courseAnalytics) return [];
    return data.courseAnalytics.slice(0, 10).map(course => ({
      name: `${course.title} (${course.courseCode})`,
      students: course.studentCount,
      teachers: course.teacherCount,
      videos: course.videoCount,
      dept: course.departmentName
    }));
  }, [data]);

  const MetricCard = ({ title, value, subtitle, icon, color, progress }) => (
    <Card sx={{ 
      height: '100%', 
      position: 'relative', 
      overflow: 'visible',
      background: '#ffffff',
      border: '1px solid #6497b1',
      boxShadow: '0 6px 20px rgba(0, 91, 150, 0.2)',
      transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
      '&:hover': {
        transform: 'translateY(-4px)',
        boxShadow: '0 8px 25px rgba(0, 91, 150, 0.3)'
      }
    }}>
      <CardContent>
        <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
          <Box sx={{ 
            p: 1, 
            borderRadius: 2, 
            bgcolor: `${color}15`, 
            color: color,
            mr: 2,
            display: 'flex',
            alignItems: 'center'
          }}>
            {icon}
          </Box>
          <Box sx={{ flexGrow: 1 }}>
            <Typography variant="h6" color="textSecondary" gutterBottom sx={{ mb: 0 }}>
              {title}
            </Typography>
            <Typography variant="h4" sx={{ color: color, fontWeight: 'bold', mb: 0.5 }}>
              {value}
            </Typography>
            {subtitle && (
              <Typography variant="body2" color="textSecondary">
                {subtitle}
              </Typography>
            )}
          </Box>
        </Box>
        {progress !== undefined && (
          <LinearProgress 
            variant="determinate" 
            value={progress} 
            sx={{ 
              mt: 1, 
              height: 6, 
              borderRadius: 3,
              bgcolor: `${color}20`,
              '& .MuiLinearProgress-bar': { bgcolor: color }
            }} 
          />
        )}
      </CardContent>
    </Card>
  );

  const handleTabChange = (event, newValue) => {
    setCurrentTab(newValue);
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="error">{error}</Alert>
      </Box>
    );
  }

  // Note: For Explore tab we don't require `data`

  return (
    <Box sx={{ p: { xs: 1.5, sm: 2, md: 4 }, bgcolor: '#f5f7fa', minHeight: '100vh' }}>
      {/* Modern Header */}
      <Box sx={{ mb: { xs: 2, sm: 4 } }}>
        <Typography variant={isMobile ? "h5" : "h4"} sx={{ 
          fontWeight: 700, 
          display: 'flex', 
          alignItems: 'center', 
          gap: 1,
          color: '#1a237e',
          mb: 1,
          fontSize: { xs: '1.25rem', sm: '1.5rem', md: '2rem' }
        }}>
          <AssessmentIcon sx={{ fontSize: { xs: 28, sm: 40 } }} />
          Dean Analytics Dashboard
        </Typography>
        
        {data?.school?.name && (
          <Typography variant="body1" sx={{ 
            color: '#546e7a',
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
            fontWeight: 500,
            fontSize: { xs: '0.75rem', sm: '0.875rem' }
          }}>
            {data.school?.name} - {isMobile ? 'Analytics' : 'Comprehensive School Analytics'}
          </Typography>
        )}
      </Box>

      {/* Modern Key Metrics Overview */}
      {data && (
      <Grid container spacing={{ xs: 1.5, sm: 2, md: 3 }} sx={{ mb: { xs: 2, sm: 4 } }}>
        <Grid item xs={6} sm={6} md={2.4}>
          <Card sx={{ 
            height: '100%',
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            color: 'white',
            boxShadow: '0 4px 20px rgba(102, 126, 234, 0.4)',
            transition: 'transform 0.3s, box-shadow 0.3s',
            '&:hover': {
              transform: isMobile ? 'none' : 'translateY(-8px)',
              boxShadow: '0 8px 30px rgba(102, 126, 234, 0.5)'
            }
          }}>
            <CardContent sx={{ p: { xs: 1.5, sm: 2 } }}>
              <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', mb: { xs: 1, sm: 2 } }}>
                <Box sx={{ 
                  p: { xs: 0.75, sm: 1.5 }, 
                  borderRadius: 2, 
                  bgcolor: 'rgba(255,255,255,0.2)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  <SchoolIcon sx={{ fontSize: { xs: 20, sm: 32 } }} />
                </Box>
              </Box>
              <Typography variant="body2" sx={{ opacity: 0.9, mb: 0.5, fontSize: { xs: '0.65rem', sm: '0.875rem' } }}>
                Departments
              </Typography>
              <Typography variant={isMobile ? "h5" : "h3"} sx={{ fontWeight: 700, mb: 0.5 }}>
                {data.summary?.totalDepartments || 0}
              </Typography>
              {!isMobile && (
                <Typography variant="caption" sx={{ opacity: 0.8 }}>
                  Avg {data.summary?.avgCoursesPerDepartment || 0} courses each
                </Typography>
              )}
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={6} sm={6} md={2.4}>
          <Card sx={{ 
            height: '100%',
            background: 'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)',
            color: 'white',
            boxShadow: '0 4px 20px rgba(67, 233, 123, 0.4)',
            transition: 'transform 0.3s, box-shadow 0.3s',
            '&:hover': {
              transform: isMobile ? 'none' : 'translateY(-8px)',
              boxShadow: '0 8px 30px rgba(67, 233, 123, 0.5)'
            }
          }}>
            <CardContent sx={{ p: { xs: 1.5, sm: 2 } }}>
              <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', mb: { xs: 1, sm: 2 } }}>
                <Box sx={{ 
                  p: { xs: 0.75, sm: 1.5 }, 
                  borderRadius: 2, 
                  bgcolor: 'rgba(255,255,255,0.2)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  <PeopleIcon sx={{ fontSize: { xs: 20, sm: 32 } }} />
                </Box>
              </Box>
              <Typography variant="body2" sx={{ opacity: 0.9, mb: 0.5, fontSize: { xs: '0.65rem', sm: '0.875rem' } }}>
                {isMobile ? 'Students' : 'Total Students'}
              </Typography>
              <Typography variant={isMobile ? "h5" : "h3"} sx={{ fontWeight: 700, mb: 0.5 }}>
                {data.summary?.totalStudents || 0}
              </Typography>
              {!isMobile && (
                <Typography variant="caption" sx={{ opacity: 0.8 }}>
                  Avg {data.summary?.avgStudentsPerDepartment || 0} per dept
                </Typography>
              )}
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={6} sm={6} md={2.4}>
          <Card sx={{ 
            height: '100%',
            background: 'linear-gradient(135deg, #fa709a 0%, #fee140 100%)',
            color: 'white',
            boxShadow: '0 4px 20px rgba(250, 112, 154, 0.4)',
            transition: 'transform 0.3s, box-shadow 0.3s',
            '&:hover': {
              transform: isMobile ? 'none' : 'translateY(-8px)',
              boxShadow: '0 8px 30px rgba(250, 112, 154, 0.5)'
            }
          }}>
            <CardContent sx={{ p: { xs: 1.5, sm: 2 } }}>
              <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', mb: { xs: 1, sm: 2 } }}>
                <Box sx={{ 
                  p: { xs: 0.75, sm: 1.5 }, 
                  borderRadius: 2, 
                  bgcolor: 'rgba(255,255,255,0.2)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  <PersonIcon sx={{ fontSize: { xs: 20, sm: 32 } }} />
                </Box>
              </Box>
              <Typography variant="body2" sx={{ opacity: 0.9, mb: 0.5, fontSize: { xs: '0.65rem', sm: '0.875rem' } }}>
                {isMobile ? 'Faculty' : 'Faculty Members'}
              </Typography>
              <Typography variant={isMobile ? "h5" : "h3"} sx={{ fontWeight: 700, mb: 0.5 }}>
                {data.summary?.totalTeachers || 0}
              </Typography>
              {!isMobile && (
                <Typography variant="caption" sx={{ opacity: 0.8 }}>
                  Active teachers
                </Typography>
              )}
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={6} sm={6} md={2.4}>
          <Card sx={{ 
            height: '100%',
            background: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
            color: 'white',
            boxShadow: '0 4px 20px rgba(240, 147, 251, 0.4)',
            transition: 'transform 0.3s, box-shadow 0.3s',
            '&:hover': {
              transform: isMobile ? 'none' : 'translateY(-8px)',
              boxShadow: '0 8px 30px rgba(240, 147, 251, 0.5)'
            }
          }}>
            <CardContent sx={{ p: { xs: 1.5, sm: 2 } }}>
              <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', mb: { xs: 1, sm: 2 } }}>
                <Box sx={{ 
                  p: { xs: 0.75, sm: 1.5 }, 
                  borderRadius: 2, 
                  bgcolor: 'rgba(255,255,255,0.2)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  <ClassIcon sx={{ fontSize: { xs: 20, sm: 32 } }} />
                </Box>
              </Box>
              <Typography variant="body2" sx={{ opacity: 0.9, mb: 0.5, fontSize: { xs: '0.65rem', sm: '0.875rem' } }}>
                {isMobile ? 'Courses' : 'Active Courses'}
              </Typography>
              <Typography variant={isMobile ? "h5" : "h3"} sx={{ fontWeight: 700, mb: 0.5 }}>
                {data.summary?.totalCourses || 0}
              </Typography>
              {!isMobile && (
                <Typography variant="caption" sx={{ opacity: 0.8 }}>
                  Across all departments
                </Typography>
              )}
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={2.4}>
          <Card sx={{ 
            height: '100%',
            background: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
            color: 'white',
            boxShadow: '0 4px 20px rgba(79, 172, 254, 0.4)',
            transition: 'transform 0.3s, box-shadow 0.3s',
            '&:hover': {
              transform: isMobile ? 'none' : 'translateY(-8px)',
              boxShadow: '0 8px 30px rgba(79, 172, 254, 0.5)'
            }
          }}>
            <CardContent sx={{ p: { xs: 1.5, sm: 2 } }}>
              <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', mb: { xs: 1, sm: 2 } }}>
                <Box sx={{ 
                  p: { xs: 0.75, sm: 1.5 }, 
                  borderRadius: 2, 
                  bgcolor: 'rgba(255,255,255,0.2)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  <VideoLibraryIcon sx={{ fontSize: { xs: 20, sm: 32 } }} />
                </Box>
              </Box>
              <Typography variant="body2" sx={{ opacity: 0.9, mb: 0.5, fontSize: { xs: '0.65rem', sm: '0.875rem' } }}>
                {isMobile ? 'Videos' : 'Video Content'}
              </Typography>
              <Typography variant={isMobile ? "h5" : "h3"} sx={{ fontWeight: 700, mb: 0.5 }}>
                {data.summary?.totalVideos || 0}
              </Typography>
              {!isMobile && (
                <Typography variant="caption" sx={{ opacity: 0.8 }}>
                  Learning materials
                </Typography>
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>
      )}

      {/* Modern Tabs Section */}
      <Card sx={{
        background: '#ffffff',
        boxShadow: '0 4px 20px rgba(0, 0, 0, 0.08)',
        borderRadius: { xs: 2, sm: 3 },
        overflow: 'hidden'
      }}>
        <Box sx={{ 
          borderBottom: 1, 
          borderColor: 'divider',
          bgcolor: '#fafafa'
        }}>
          <Tabs 
            value={currentTab} 
            onChange={handleTabChange} 
            aria-label="analytics tabs"
            variant={isMobile ? "scrollable" : "standard"}
            scrollButtons={isMobile ? "auto" : false}
            allowScrollButtonsMobile
            sx={{
              '& .MuiTab-root': {
                fontWeight: 600,
                fontSize: { xs: '0.75rem', sm: '0.95rem' },
                textTransform: 'none',
                minHeight: { xs: 48, sm: 64 },
                px: { xs: 1.5, sm: 4 },
                minWidth: { xs: 'auto', sm: 160 }
              },
              '& .Mui-selected': {
                color: '#667eea'
              },
              '& .MuiTabs-indicator': {
                backgroundColor: '#667eea',
                height: 3
              }
            }}
          >
            <Tab label={isMobile ? "📊 Explore" : "📊 Explore (Lazy)"} />
            <Tab label={isMobile ? "🏢 Depts" : "🏢 Department Analytics"} />
            <Tab label={isMobile ? "📚 Courses" : "📚 Course Analytics"} />
          </Tabs>
        </Box>

        {/* Explore (Lazy) Tab */}
        {currentTab === 0 && (
          <CardContent sx={{ p: { xs: 1.5, sm: 2, md: 3 } }}>
            <Grid container spacing={{ xs: 1, sm: 2 }} sx={{ mb: 2 }}>
              <Grid item xs={6} sm={6} md={3}>
                <TextField fullWidth size="small" label={isMobile ? "Depts" : "Filter departments"} value={deptFilter} onChange={(e) => setDeptFilter(e.target.value)} />
              </Grid>
              <Grid item xs={6} sm={6} md={3}>
                <TextField fullWidth size="small" label={isMobile ? "Courses" : "Filter courses"} value={courseFilter} onChange={(e) => setCourseFilter(e.target.value)} />
              </Grid>
              <Grid item xs={6} sm={6} md={3}>
                <TextField fullWidth size="small" label={isMobile ? "People" : "Filter people"} value={peopleFilter} onChange={(e) => setPeopleFilter(e.target.value)} />
              </Grid>
              <Grid item xs={6} sm={6} md={3}>
                <Box sx={{ display: 'flex', gap: 1 }}>
                  <TextField fullWidth size="small" label={isMobile ? "Reg No" : "Search student by Reg No"} value={studentSearch} onChange={(e) => setStudentSearch(e.target.value)} />
                  <Button variant="contained" size={isMobile ? "small" : "medium"} onClick={searchStudentByRegNo} sx={{ minWidth: { xs: 60, sm: 80 } }}>
                    {isMobile ? "Go" : "Search"}
                  </Button>
                </Box>
                {studentSearchResult && (
                  <Box sx={{ mt: 1 }}>
                    {studentSearchResult.error ? (
                      <Alert severity="warning" sx={{ fontSize: { xs: '0.7rem', sm: '0.875rem' } }}>{studentSearchResult.error}</Alert>
                    ) : (
                      <Chip size={isMobile ? "small" : "medium"} label={`${studentSearchResult.name} (${studentSearchResult.regNo})`} onClick={() => openStudentDialog(studentSearchResult._id)} clickable />
                    )}
                  </Box>
                )}
              </Grid>
            </Grid>

            {deptLoading ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
                <CircularProgress />
              </Box>
            ) : (
              <Grid container spacing={2}>
                <Grid item xs={12}>
                  {(departments || [])
                    .filter(d => !deptFilter || d.name?.toLowerCase().includes(deptFilter.toLowerCase()) || (d.code||'').toLowerCase().includes(deptFilter.toLowerCase()))
                    .map(dept => (
                      <Accordion key={dept._id} expanded={expandedDept === dept._id} onChange={handleExpandDept(dept._id)} sx={{ mb: 1 }}>
                        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                          <Box sx={{ display: 'flex', alignItems: 'center', width: '100%', justifyContent: 'space-between' }}>
                            <Typography variant={isMobile ? "body1" : "h6"} sx={{ fontWeight: 600, fontSize: { xs: '0.9rem', sm: '1rem' } }}>
                              {dept.name} {!isMobile && `(${dept.code})`}
                            </Typography>
                          </Box>
                        </AccordionSummary>
                        <AccordionDetails sx={{ p: { xs: 1, sm: 2 } }}>
                          {coursesLoading[dept._id] ? (
                            <Box sx={{ display: 'flex', justifyContent: 'center', p: 2 }}>
                              <CircularProgress size={22} />
                            </Box>
                          ) : (
                            <List dense>
                              {(coursesByDept[dept._id] || [])
                                .filter(c => !courseFilter || c.title?.toLowerCase().includes(courseFilter.toLowerCase()) || (c.courseCode||'').toLowerCase().includes(courseFilter.toLowerCase()))
                                .map(course => {
                                  const rel = relationsByCourse[course._id];
                                  const relLoad = relationsLoading[course._id];
                                  const pageMeta = studentPages[course._id];
                                  return (
                                    <Box key={course._id} sx={{ mb: 2 }}>
                                      <ListItem
                                        sx={{ 
                                          flexDirection: { xs: 'column', sm: 'row' },
                                          alignItems: { xs: 'flex-start', sm: 'center' },
                                          gap: { xs: 1, sm: 0 }
                                        }}
                                        secondaryAction={
                                          !isMobile && (
                                            <Box sx={{ display: 'flex', gap: 1 }}>
                                              <Button size="small" variant="outlined" onClick={() => loadCourseRelations(course._id)}>
                                                {relLoad ? 'Loading...' : 'Teachers/Students'}
                                              </Button>
                                              <Button size="small" variant="outlined" onClick={() => loadCourseSections(course._id)}>Sections</Button>
                                            </Box>
                                          )
                                        }
                                      >
                                        <ListItemText 
                                          primary={`${course.title}${!isMobile && course.courseCode ? ` (${course.courseCode})` : ''}`}
                                          primaryTypographyProps={{ fontSize: { xs: '0.85rem', sm: '1rem' } }}
                                        />
                                        {isMobile && (
                                          <Box sx={{ display: 'flex', gap: 0.5, mt: 0.5 }}>
                                            <Button size="small" variant="outlined" onClick={() => loadCourseRelations(course._id)} sx={{ fontSize: '0.65rem', py: 0.5, px: 1 }}>
                                              {relLoad ? '...' : 'Teachers'}
                                            </Button>
                                            <Button size="small" variant="outlined" onClick={() => loadCourseSections(course._id)} sx={{ fontSize: '0.65rem', py: 0.5, px: 1 }}>Sections</Button>
                                          </Box>
                                        )}
                                      </ListItem>
                                      {rel && (
                                        <Box sx={{ pl: { xs: 1, sm: 2 }, pr: { xs: 1, sm: 2 }, pb: 1 }}>
                                          <Typography variant="subtitle2" sx={{ mt: 1, mb: 1, display: 'flex', alignItems: 'center', gap: 1, fontSize: { xs: '0.75rem', sm: '0.875rem' } }}>
                                            <PeopleIcon fontSize="small" /> Teachers
                                          </Typography>
                                          <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mb: 1 }}>
                                            {(rel.teachers || [])
                                              .filter(t => !peopleFilter || (t.name||'').toLowerCase().includes(peopleFilter.toLowerCase()) || (t.uid||'').toLowerCase().includes(peopleFilter.toLowerCase()) || (t.teacherId||'').toLowerCase().includes(peopleFilter.toLowerCase()) || (t.email||'').toLowerCase().includes(peopleFilter.toLowerCase()))
                                              .map(t => (
                                                <Chip key={t._id} size={isMobile ? "small" : "medium"} label={isMobile ? t.name : `${t.name} (${t.uid || t.teacherId || t.email})`} />
                                              ))}
                                            {(rel.teachers || []).length === 0 && (<Typography variant="body2" color="textSecondary" sx={{ fontSize: { xs: '0.75rem', sm: '0.875rem' } }}>No teachers</Typography>)}
                                          </Box>
                                          <Typography variant="subtitle2" sx={{ mt: 1, mb: 1, display: 'flex', alignItems: 'center', gap: 1, fontSize: { xs: '0.75rem', sm: '0.875rem' } }}>
                                            <PersonIcon fontSize="small" /> Students
                                          </Typography>
                                          <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                                            {(rel.students || [])
                                              .filter(s => !peopleFilter || (s.name||'').toLowerCase().includes(peopleFilter.toLowerCase()) || (s.regNo||'').toLowerCase().includes(peopleFilter.toLowerCase()) || (s.email||'').toLowerCase().includes(peopleFilter.toLowerCase()))
                                              .map(s => (
                                                <Chip key={s._id} size={isMobile ? "small" : "medium"} label={isMobile ? s.name : `${s.name} (${s.regNo || s.email})`} onClick={() => openStudentDialog(s._id)} clickable variant="outlined" />
                                              ))}
                                            {(rel.students || []).length === 0 && (<Typography variant="body2" color="textSecondary" sx={{ fontSize: { xs: '0.75rem', sm: '0.875rem' } }}>No students</Typography>)}
                                          </Box>
                                          {pageMeta && pageMeta.totalPages > 1 && (
                                            <Box sx={{ mt: 1, display: 'flex', justifyContent: 'flex-end' }}>
                                              <Pagination size="small" count={pageMeta.totalPages} page={pageMeta.page} onChange={(e, p) => loadCourseRelations(course._id, p, pageMeta.limit)} />
                                            </Box>
                                          )}
                                          <Divider sx={{ mt: 2 }} />
                                        </Box>
                                      )}
                                    </Box>
                                  );
                                })}
                              {(coursesByDept[dept._id] || []).length === 0 && (
                                <Typography variant="body2" color="textSecondary" sx={{ pl: 2 }}>No courses</Typography>
                              )}
                            </List>
                          )}
                        </AccordionDetails>
                      </Accordion>
                  ))}
                </Grid>
              </Grid>
            )}

            {/* Sections Dialog */}
            <Dialog 
              open={sectionsDialog.open} 
              onClose={() => setSectionsDialog({ open: false, loading: false, course: null, data: null })} 
              fullWidth 
              maxWidth="md"
              fullScreen={isMobile}
            >
              <DialogTitle sx={{ fontSize: { xs: '1rem', sm: '1.25rem' } }}>
                Sections for {sectionsDialog.course ? `${sectionsDialog.course.title}${!isMobile && sectionsDialog.course.courseCode ? ` (${sectionsDialog.course.courseCode})` : ''}` : ''}
              </DialogTitle>
              <DialogContent dividers>
                {sectionsDialog.loading ? (
                  <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
                    <CircularProgress />
                  </Box>
                ) : sectionsDialog.data ? (
                  <Box>
                    <List dense>
                      {(sectionsDialog.data.sections || []).map(s => (
                        <ListItem key={s._id} sx={{ flexDirection: { xs: 'column', sm: 'row' }, alignItems: { xs: 'flex-start', sm: 'center' } }}>
                          <ListItemText 
                            primary={s.name} 
                            secondary={isMobile 
                              ? `Teacher: ${s.teacher?.name || 'N/A'} | ${s.studentsCount} students`
                              : `Teacher: ${s.teacher ? `${s.teacher.name} (${s.teacher.uid || s.teacher.teacherId || s.teacher.email})` : 'N/A'} | Students: ${s.studentsCount}`
                            }
                            primaryTypographyProps={{ fontSize: { xs: '0.875rem', sm: '1rem' } }}
                            secondaryTypographyProps={{ fontSize: { xs: '0.75rem', sm: '0.875rem' } }}
                          />
                        </ListItem>
                      ))}
                    </List>
                    {sectionsDialog.data.pagination?.totalPages > 1 && (
                      <Box sx={{ mt: 1, display: 'flex', justifyContent: 'flex-end' }}>
                        <Pagination size="small" count={sectionsDialog.data.pagination.totalPages} page={sectionsDialog.data.pagination.page} onChange={(e, p) => loadCourseSections(sectionsDialog.course._id, p, sectionsDialog.data.pagination.limit)} />
                      </Box>
                    )}
                  </Box>
                ) : (
                  <Alert severity="warning">No sections found</Alert>
                )}
              </DialogContent>
              <DialogActions sx={{ flexWrap: 'wrap', gap: 1, p: { xs: 1, sm: 2 } }}>
                <Button
                  size={isMobile ? "small" : "medium"}
                  variant="outlined"
                  onClick={async () => {
                    if (!sectionsDialog.course) return;
                    const token = localStorage.getItem('token');
                    const url = `/api/dean/course/${sectionsDialog.course._id}/sections/export?mode=summary`;
                    await downloadCsv(url, token);
                  }}
                >
                  {isMobile ? "Summary CSV" : "Download Summary CSV"}
                </Button>
                <Button
                  size={isMobile ? "small" : "medium"}
                  variant="outlined"
                  onClick={async () => {
                    if (!sectionsDialog.course) return;
                    const token = localStorage.getItem('token');
                    const url = `/api/dean/course/${sectionsDialog.course._id}/sections/export?mode=students`;
                    await downloadCsv(url, token);
                  }}
                >
                  {isMobile ? "Students CSV" : "Download Students CSV"}
                </Button>
                <Button size={isMobile ? "small" : "medium"} onClick={() => setSectionsDialog({ open: false, loading: false, course: null, data: null })}>Close</Button>
              </DialogActions>
            </Dialog>

            {/* Student Details Dialog */}
            <Dialog 
              open={studentDialog.open} 
              onClose={() => setStudentDialog({ open: false, loading: false, data: null })} 
              fullWidth 
              maxWidth="md"
              fullScreen={isMobile}
            >
              <DialogTitle sx={{ fontSize: { xs: '1rem', sm: '1.25rem' } }}>Student Details</DialogTitle>
              <DialogContent dividers>
                {studentDialog.loading ? (
                  <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
                    <CircularProgress />
                  </Box>
                ) : studentDialog.data ? (
                  <Box>
                    <Typography variant={isMobile ? "subtitle1" : "h6"} sx={{ fontWeight: 600 }}>{studentDialog.data.student?.name}</Typography>
                    <Typography variant="body2" color="textSecondary" sx={{ fontSize: { xs: '0.75rem', sm: '0.875rem' } }}>Email: {studentDialog.data.student?.email}</Typography>
                    <Typography variant="body2" color="textSecondary" sx={{ fontSize: { xs: '0.75rem', sm: '0.875rem' } }}>Reg No: {studentDialog.data.student?.regNo}</Typography>
                    <Divider sx={{ my: 2 }} />
                    <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1, fontSize: { xs: '0.875rem', sm: '1rem' } }}>Courses</Typography>
                    <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                      {(studentDialog.data.courseAnalytics || []).map(c => (
                        <Chip key={c.courseId} size={isMobile ? "small" : "medium"} label={isMobile ? c.courseTitle : `${c.courseTitle} (${c.courseCode || ''})`} />
                      ))}
                      {(studentDialog.data.courseAnalytics || []).length === 0 && (<Typography variant="body2" color="textSecondary">No courses</Typography>)}
                    </Box>
                    <Typography variant="subtitle1" sx={{ fontWeight: 600, mt: 2, mb: 1, fontSize: { xs: '0.875rem', sm: '1rem' } }}>Sections</Typography>
                    <List dense>
                      {(() => {
                        // Extract unique sections from courseAnalytics
                        const sectionsMap = new Map();
                        (studentDialog.data.courseAnalytics || []).forEach(ca => {
                          (ca.sections || []).forEach(s => {
                            if (!sectionsMap.has(s.id?.toString() || s._id?.toString())) {
                              sectionsMap.set(s.id?.toString() || s._id?.toString(), s);
                            }
                          });
                        });
                        const sections = Array.from(sectionsMap.values());
                        return sections.length > 0 ? sections.map(s => (
                          <ListItem key={s.id || s._id}>
                            <ListItemText 
                              primary={s.name} 
                              primaryTypographyProps={{ fontSize: { xs: '0.875rem', sm: '1rem' } }}
                            />
                          </ListItem>
                        )) : <Typography variant="body2" color="textSecondary">No sections</Typography>;
                      })()}
                    </List>
                    <Typography variant="subtitle1" sx={{ fontWeight: 600, mt: 2, mb: 1, fontSize: { xs: '0.875rem', sm: '1rem' } }}>
                      {isMobile ? "Course Watch Time" : "Course-wise Performance (Total Watch Time)"}
                    </Typography>
                    <List dense>
                      {(studentDialog.data.courseAnalytics || []).map(cp => (
                        <ListItem key={cp.courseId}>
                          <ListItemText 
                            primary={isMobile ? cp.courseTitle : `${cp.courseTitle} (${cp.courseCode || ''})`} 
                            secondary={`Watch time: ${cp.watchTimeFormatted || '0s'} | Progress: ${Math.round(cp.overallProgress || 0)}% | Course Marks: ${Math.round(cp.courseMarks || 0)}%`}
                            primaryTypographyProps={{ fontSize: { xs: '0.875rem', sm: '1rem' } }}
                            secondaryTypographyProps={{ fontSize: { xs: '0.75rem', sm: '0.875rem' } }}
                          />
                        </ListItem>
                      ))}
                      {(studentDialog.data.courseAnalytics || []).length === 0 && (<Typography variant="body2" color="textSecondary">No performance data</Typography>)}
                    </List>
                  </Box>
                ) : (
                  <Alert severity="warning">No data</Alert>
                )}
              </DialogContent>
              <DialogActions>
                <Button onClick={() => setStudentDialog({ open: false, loading: false, data: null })}>Close</Button>
              </DialogActions>
            </Dialog>
          </CardContent>
        )}

        {/* Department Analytics Tab */}
        {currentTab === 1 && (
          <DeanDepartmentAnalytics />
        )}

        {/* Course Analytics Tab */}
        {currentTab === 2 && (
          <DeanCourseAnalytics />
        )}
      </Card>
    </Box>
  );
};

export default DeanAnalytics;

// Helper to download CSV with auth
async function downloadCsv(url, token) {
  try {
    const res = await axios.get(url, {
      headers: { Authorization: `Bearer ${token}` },
      responseType: 'blob'
    });
    const blob = new Blob([res.data], { type: 'text/csv' });
    const link = document.createElement('a');
    const href = window.URL.createObjectURL(blob);
    link.href = href;
    // Try to infer filename from Content-Disposition
    const cd = res.headers['content-disposition'];
    let filename = 'sections.csv';
    if (cd) {
      const m = /filename="?([^";]+)"?/i.exec(cd);
      if (m && m[1]) filename = m[1];
    }
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(href);
  } catch (e) {
    console.error('Failed to download CSV', e);
    alert('Failed to download CSV');
  }
}
