import React, { useState, useEffect } from 'react';
import {
  Box,
  Grid,
  Card,
  CardContent,
  CardHeader,
  Typography,
  CircularProgress,
  Chip,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Autocomplete,
  TextField,
  Snackbar,
  Alert as MuiAlert,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Avatar,
  Divider,
  List,
  ListItem,
  ListItemIcon,
  ListItemText
} from '@mui/material';
import {
  Group as GroupIcon,
  Book as BookIcon,
  Assignment as AssignmentIcon,
  TrendingUp as TrendingUpIcon,
  Launch as LaunchIcon,
  Assessment as AssessmentIcon,
  Announcement as AnnouncementIcon,
  School as SchoolIcon,
  Quiz as QuizIcon,
  NotificationsActive as NotificationsActiveIcon,
  MoreVert as MoreVertIcon
} from '@mui/icons-material';
import axios from 'axios';
import { parseJwt } from '../../utils/jwt';
import { useUserRole } from '../../contexts/UserRoleContext';
import { useNavigate } from 'react-router-dom';

const HODDashboardHome = () => {
  const { activeRole, getRoleInfo } = useUserRole();
  const [loading, setLoading] = useState(true);
  const [notifications, setNotifications] = useState([]);
  const [notificationsLoading, setNotificationsLoading] = useState(true);
  const [expandedNotification, setExpandedNotification] = useState(null);
  const [stats, setStats] = useState({
    departments: [],
    school: null,
    teachers: 0,
    courses: 0,
    students: 0,
    sections: 0,
    pendingApprovals: 0
  });
  const [selectedDepartment, setSelectedDepartment] = useState('all');
  const [courseCoordinators, setCourseCoordinators] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [selectedCourse, setSelectedCourse] = useState(null);
  const [selectedTeacher, setSelectedTeacher] = useState(null);
  const [busy, setBusy] = useState(false);
  const [snack, setSnack] = useState({ open: false, severity: 'success', message: '' });
  
  const token = localStorage.getItem('token');
  const currentUser = parseJwt(token);
  const navigate = useNavigate();

  useEffect(() => {
    fetchDashboardData();
    fetchTeachers();
    fetchNotifications();
  }, []);

  const fetchNotifications = async () => {
    try {
      setNotificationsLoading(true);
      const res = await axios.get('/api/notifications', { 
        headers: { Authorization: `Bearer ${token}` } 
      });
      setNotifications(res.data.notifications || []);
    } catch (error) {
      console.error('Error fetching notifications:', error);
      setNotifications([]);
    } finally {
      setNotificationsLoading(false);
    }
  };

  const fetchTeachers = async () => {
    try {
      const res = await axios.get('/api/hod/teachers', {
        headers: { Authorization: `Bearer ${token}` }
      });
      setTeachers(res.data || []);
    } catch (e) {
      setTeachers([]);
    }
  };
  const openAssignDialog = (course) => {
    setSelectedCourse(course);
    setSelectedTeacher(null);
    setAssignDialogOpen(true);
  };

  const handleAssignCC = async () => {
    if (!selectedCourse || !selectedTeacher) return;
    setBusy(true);
    try {
      await axios.post('/api/hod/courses/cc/assign', {
        courseId: selectedCourse._id,
        userId: selectedTeacher._id
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setSnack({ open: true, severity: 'success', message: 'Coordinator assigned/updated successfully' });
      setAssignDialogOpen(false);
      await fetchDashboardData();
    } catch (e) {
      setSnack({ open: true, severity: 'error', message: e.response?.data?.message || 'Failed to assign coordinator' });
    } finally {
      setBusy(false);
    }
  };

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      
      console.log('� Making HOD dashboard API call directly...');
      
      // Fetch HOD dashboard data directly
      const dashboardRes = await axios.get('/api/hod/dashboard', {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      console.log('✅ HOD Dashboard API Response:', dashboardRes.data);
      console.log('📊 Statistics received:', dashboardRes.data.statistics);
      
      // Extract department information from the response
      const department = dashboardRes.data.department;
      const userDepartments = department ? [department] : [];
      
      setStats({
        departments: userDepartments,
        school: department?.school,
        teachers: dashboardRes.data.statistics.teachers,
        courses: dashboardRes.data.statistics.courses,
        students: dashboardRes.data.statistics.students,
        sections: dashboardRes.data.statistics.sections,
        pendingApprovals: dashboardRes.data.statistics.pendingApprovals
      });
      setCourseCoordinators(dashboardRes.data.courseCoordinators || []);
    } catch (error) {
      console.error('❌ Error fetching dashboard data:', error);
      console.error('❌ Error details:', {
        message: error.message,
        response: error.response?.data,
        status: error.response?.status
      });
    } finally {
      setLoading(false);
    }
  };

  const StatCard = ({ title, value, icon, gradientColors, iconBgColor }) => (
    <Card sx={{ 
      borderRadius: '16px', 
      boxShadow: `0 8px 16px rgba(${iconBgColor}, 0.12)`,
      transition: 'transform 0.3s ease, box-shadow 0.3s ease',
      overflow: 'hidden',
      background: `linear-gradient(135deg, ${gradientColors[0]} 0%, ${gradientColors[1]} 100%)`,
      minHeight: { xs: '120px', md: '140px' },
      '&:hover': {
        transform: 'translateY(-5px)',
        boxShadow: `0 12px 20px rgba(${iconBgColor}, 0.2)`
      }
    }}>
      <CardContent sx={{ 
        p: { xs: 2, md: 2.5 },
        height: '100%',
        background: 'transparent'
      }}>
        <Box display="flex" alignItems="center">
          <Box 
            sx={{ 
              bgcolor: `rgba(${iconBgColor}, 0.8)`, 
              borderRadius: '12px', 
              p: { xs: 1.2, md: 1.5 },
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: `0 4px 8px rgba(${iconBgColor}, 0.25)`,
              mr: 2
            }}
          >
            {React.cloneElement(icon, { sx: { fontSize: { xs: 28, md: 36 }, color: 'white' } })}
          </Box>
          <Box>
            <Typography variant="h4" fontWeight="bold" sx={{ 
              color: `rgb(${iconBgColor})`,
              fontSize: { xs: '1.75rem', md: '2.125rem' }
            }}>
              {value}
            </Typography>
            <Typography variant="body1" sx={{ 
              color: 'rgba(0, 0, 0, 0.6)', 
              fontWeight: 500,
              fontSize: { xs: '0.9rem', md: '1rem' }
            }}>
              {title}
            </Typography>
          </Box>
        </Box>
      </CardContent>
    </Card>
  );

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ p: { xs: 1.5, sm: 2, md: 3 } }}>
      {/* Welcome Section */}
      <Box sx={{ mb: { xs: 3, md: 4 } }}>
        <Typography variant="h4" sx={{ 
          fontWeight: 'bold', 
          mb: 1,
          fontSize: { xs: '1.5rem', sm: '1.75rem', md: '2.125rem' }
        }}>
          Welcome back, {getRoleInfo(activeRole || 'hod').name} {currentUser.name}
        </Typography>
        
        {/* Multiple Departments Display */}
        {stats.departments && stats.departments.length > 0 && (
          <Box sx={{ mb: 2 }}>
            <Typography variant="h6" color="textSecondary" sx={{ 
              mb: 1,
              fontSize: { xs: '1rem', sm: '1.1rem', md: '1.25rem' }
            }}>
              Managing Department{stats.departments.length > 1 ? 's' : ''}:
            </Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
              {stats.departments.map((dept, index) => (
                <Box key={dept._id} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Typography variant="body1" color="primary" sx={{ fontWeight: 500 }}>
                    {dept.name}
                  </Typography>
                  <Chip 
                    label={dept.code} 
                    size="small" 
                    color="primary" 
                    variant="outlined" 
                  />
                  {index < stats.departments.length - 1 && (
                    <Typography variant="body2" color="textSecondary">•</Typography>
                  )}
                </Box>
              ))}
            </Box>
            {stats.school && (
              <Typography variant="body2" color="textSecondary" sx={{ mt: 1 }}>
                School: {stats.school.name}
              </Typography>
            )}
          </Box>
        )}

        {/* Department Selector for Multi-Department HODs */}
        {stats.departments && stats.departments.length > 1 && (
          <Card sx={{ mb: 3, bgcolor: '#f8f9fa' }}>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <Typography variant="h6">Department View</Typography>
                <FormControl size="small" sx={{ minWidth: 200 }}>
                  <InputLabel>Select Department</InputLabel>
                  <Select
                    value={selectedDepartment}
                    onChange={(e) => setSelectedDepartment(e.target.value)}
                    label="Select Department"
                  >
                    <MenuItem value="all">All Departments</MenuItem>
                    {stats.departments.map((dept) => (
                      <MenuItem key={dept._id} value={dept._id}>
                        {dept.name}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Box>
              <Typography variant="body2" color="textSecondary" sx={{ mt: 1 }}>
                {selectedDepartment === 'all' 
                  ? 'Showing aggregated data from all your departments' 
                  : `Showing data for ${stats.departments.find(d => d._id === selectedDepartment)?.name}`}
              </Typography>
            </CardContent>
          </Card>
        )}
      </Box>

      {/* Stats Cards */}
      <Grid container spacing={{ xs: 2, sm: 2.5, md: 3 }} sx={{ mb: { xs: 3, md: 4 } }}>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="Teachers"
            value={stats.teachers}
            icon={<GroupIcon />}
            gradientColors={['#c8e6c9', '#e8f5e9']}
            iconBgColor="56, 142, 60"
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="Courses"
            value={stats.courses}
            icon={<BookIcon />}
            gradientColors={['#ffe082', '#fff8e1']}
            iconBgColor="237, 108, 2"
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="Students"
            value={stats.students}
            icon={<GroupIcon />}
            gradientColors={['#bbdefb', '#e3f2fd']}
            iconBgColor="25, 118, 210"
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="Sections"
            value={stats.sections}
            icon={<AssignmentIcon />}
            gradientColors={['#e1bee7', '#f3e5f5']}
            iconBgColor="156, 39, 176"
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="Pending Approvals"
            value={stats.pendingApprovals}
            icon={<TrendingUpIcon />}
            gradientColors={['#ffcdd2', '#ffebee']}
            iconBgColor="211, 47, 47"
          />
        </Grid>
      </Grid>

      {/* Notifications, Department Overview & Quick Actions - 3 Cards Row */}
      <Grid container spacing={3}>
        {/* Notifications Card */}
        <Grid item xs={12} md={4}>
          <Card sx={{ 
            height: '300px',
            background: 'linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)',
            border: '1px solid #6497b1',
            boxShadow: '0 4px 20px rgba(100, 151, 177, 0.15)',
            '&:hover': {
              boxShadow: '0 8px 30px rgba(100, 151, 177, 0.25)',
              transform: 'translateY(-2px)'
            },
            transition: 'all 0.3s ease'
          }}>
            <CardHeader
              avatar={
                <Avatar sx={{ bgcolor: '#005b96' }}>
                  <NotificationsActiveIcon />
                </Avatar>
              }
              title={
                <Typography variant="h6" sx={{ fontWeight: 600, color: '#1e293b' }}>
                  Notifications
                </Typography>
              }
              subheader={
                <Typography variant="body2" sx={{ color: '#64748b' }}>
                  Latest updates and alerts
                </Typography>
              }
              action={
                <MoreVertIcon sx={{ color: '#94a3b8' }} />
              }
            />
            <CardContent sx={{ 
              maxHeight: '200px', 
              overflowY: 'auto',
              '&::-webkit-scrollbar': { width: '6px' },
              '&::-webkit-scrollbar-track': { background: '#f1f5f9' },
              '&::-webkit-scrollbar-thumb': { background: '#94a3b8', borderRadius: '3px' }
            }}>
              {notificationsLoading ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
                  <CircularProgress size={24} />
                </Box>
              ) : notifications.length === 0 && stats.pendingApprovals === 0 ? (
                <Typography variant="body2" color="text.secondary">No notifications</Typography>
              ) : (
                <Box>
                  {stats.pendingApprovals > 0 && (
                    <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, py: 1, borderBottom: '1px solid #e2e8f0' }}>
                      <AnnouncementIcon fontSize="small" color="warning" sx={{ mt: 0.25, flexShrink: 0 }} />
                      <Box sx={{ flex: 1 }}>
                        <Typography variant="body2" sx={{ fontWeight: 600, color: '#1e293b' }}>
                          {stats.pendingApprovals} announcement(s) pending approval
                        </Typography>
                        <Typography variant="caption" sx={{ color: '#64748b' }}>
                          {new Date().toLocaleDateString()}
                        </Typography>
                      </Box>
                      <Chip label="Pending" size="small" color="warning" sx={{ height: 20, fontSize: '0.65rem', flexShrink: 0 }} />
                    </Box>
                  )}
                  {notifications.slice(0, 4).map((notification, index) => {
                    const notificationId = notification._id || `notif-${index}`;
                    const isExpanded = expandedNotification === notificationId;
                    const message = notification.message || notification.title;
                    
                    return (
                      <Box 
                        key={notificationId} 
                        sx={{ 
                          display: 'flex', 
                          flexDirection: 'column',
                          py: 1, 
                          borderBottom: index < 3 ? '1px solid #e2e8f0' : 'none'
                        }}
                      >
                        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
                          <AnnouncementIcon fontSize="small" color={notification.read ? 'disabled' : 'primary'} sx={{ mt: 0.25, flexShrink: 0 }} />
                          <Box sx={{ flex: 1, minWidth: 0 }}>
                            {isExpanded ? (
                              <Box
                                onClick={() => setExpandedNotification(null)}
                                sx={{ 
                                  fontWeight: notification.read ? 400 : 600,
                                  color: '#1e293b',
                                  lineHeight: 1.5,
                                  cursor: 'pointer',
                                  fontSize: '0.875rem',
                                  whiteSpace: 'pre-wrap',
                                  wordBreak: 'break-word',
                                  backgroundColor: '#f0f9ff',
                                  padding: '8px',
                                  borderRadius: '4px',
                                  border: '1px solid #005b96'
                                }}
                              >
                                {message}
                                <Typography variant="caption" sx={{ display: 'block', color: '#005b96', mt: 1 }}>
                                  (Click to collapse)
                                </Typography>
                              </Box>
                            ) : (
                              <Box
                                onClick={() => setExpandedNotification(notificationId)}
                                sx={{ 
                                  fontWeight: notification.read ? 400 : 600,
                                  color: '#1e293b',
                                  lineHeight: 1.5,
                                  cursor: 'pointer',
                                  fontSize: '0.875rem',
                                  whiteSpace: 'nowrap',
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  '&:hover': { color: '#005b96' }
                                }}
                              >
                                {message}
                              </Box>
                            )}
                            <Typography variant="caption" sx={{ color: '#64748b' }}>
                              {new Date(notification.createdAt).toLocaleString()}
                            </Typography>
                          </Box>
                          {!notification.read && (
                            <Chip label="New" size="small" color="primary" sx={{ height: 20, fontSize: '0.65rem', flexShrink: 0 }} />
                          )}
                        </Box>
                      </Box>
                    );
                  })}
                </Box>
              )}
            </CardContent>
          </Card>
        </Grid>

        {/* Department Overview Card */}
        <Grid item xs={12} md={4}>
          <Card sx={{ 
            height: '300px',
            background: 'linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)',
            border: '1px solid #6497b1',
            boxShadow: '0 4px 20px rgba(100, 151, 177, 0.15)',
            '&:hover': {
              boxShadow: '0 8px 30px rgba(100, 151, 177, 0.25)',
              transform: 'translateY(-2px)'
            },
            transition: 'all 0.3s ease'
          }}>
            <CardHeader
              avatar={
                <Avatar sx={{ bgcolor: '#005b96' }}>
                  <TrendingUpIcon />
                </Avatar>
              }
              title={
                <Typography variant="h6" sx={{ fontWeight: 600, color: '#1e293b' }}>
                  Department Overview
                </Typography>
              }
              subheader={
                <Typography variant="body2" sx={{ color: '#64748b' }}>
                  {stats.departments && stats.departments.length > 0 ? stats.departments[0].name : 'Electronics'}
                </Typography>
              }
              action={
                <MoreVertIcon sx={{ color: '#94a3b8' }} />
              }
            />
            <CardContent>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #f1f5f9', pb: 1 }}>
                  <Typography variant="body2" color="text.secondary">Teachers</Typography>
                  <Typography variant="h6" sx={{ fontWeight: 600, color: '#005b96' }}>{stats.teachers}</Typography>
                </Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #f1f5f9', pb: 1 }}>
                  <Typography variant="body2" color="text.secondary">Courses</Typography>
                  <Typography variant="h6" sx={{ fontWeight: 600, color: '#005b96' }}>{stats.courses}</Typography>
                </Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #f1f5f9', pb: 1 }}>
                  <Typography variant="body2" color="text.secondary">Sections</Typography>
                  <Typography variant="h6" sx={{ fontWeight: 600, color: '#005b96' }}>{stats.sections}</Typography>
                </Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Typography variant="body2" color="text.secondary">Department Code</Typography>
                  <Typography variant="body1" sx={{ fontWeight: 500 }}>{stats.departments && stats.departments.length > 0 ? stats.departments[0].code : 'ECE'}</Typography>
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        {/* Quick Actions Card */}
        <Grid item xs={12} md={4}>
          <Card sx={{ 
            height: '300px',
            background: 'linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)',
            border: '1px solid #6497b1',
            boxShadow: '0 4px 20px rgba(100, 151, 177, 0.15)',
            '&:hover': {
              boxShadow: '0 8px 30px rgba(100, 151, 177, 0.25)',
              transform: 'translateY(-2px)'
            },
            transition: 'all 0.3s ease'
          }}>
            <CardHeader
              avatar={
                <Avatar sx={{ 
                  bgcolor: '#005b96',
                  background: 'linear-gradient(135deg, #005b96 0%, #03396c 100%)'
                }}>
                  <LaunchIcon />
                </Avatar>
              }
              title={
                <Typography variant="h6" sx={{ fontWeight: 600, color: '#1e293b' }}>
                  Quick Actions
                </Typography>
              }
              subheader={
                <Typography variant="body2" sx={{ color: '#64748b' }}>
                  Jump to most used features
                </Typography>
              }
              action={
                <MoreVertIcon sx={{ color: '#94a3b8' }} />
              }
            />
            <CardContent sx={{ p: 0 }}>
              <List dense sx={{ py: 0 }}>
                <ListItem button onClick={() => navigate('/hod/teachers')} sx={{ py: 1, '&:hover': { bgcolor: 'rgba(0, 91, 150, 0.05)' } }}>
                  <ListItemIcon><GroupIcon sx={{ color: '#005b96', fontSize: 20 }} /></ListItemIcon>
                  <ListItemText 
                    primary={<Typography variant="body2" sx={{ fontWeight: 500 }}>Student Management</Typography>}
                    secondary={<Typography variant="caption" sx={{ color: '#64748b' }}>Add or manage students</Typography>}
                  />
                </ListItem>
                <ListItem button onClick={() => navigate('/hod/courses')} sx={{ py: 1, '&:hover': { bgcolor: 'rgba(0, 91, 150, 0.05)' } }}>
                  <ListItemIcon><BookIcon sx={{ color: '#005b96', fontSize: 20 }} /></ListItemIcon>
                  <ListItemText 
                    primary={<Typography variant="body2" sx={{ fontWeight: 500 }}>Course Management</Typography>}
                    secondary={<Typography variant="caption" sx={{ color: '#64748b' }}>Create and manage courses</Typography>}
                  />
                </ListItem>
                <ListItem button onClick={() => navigate('/hod/announcements')} sx={{ py: 1, '&:hover': { bgcolor: 'rgba(0, 91, 150, 0.05)' } }}>
                  <ListItemIcon><AnnouncementIcon sx={{ color: '#005b96', fontSize: 20 }} /></ListItemIcon>
                  <ListItemText 
                    primary={<Typography variant="body2" sx={{ fontWeight: 500 }}>Announcements</Typography>}
                    secondary={<Typography variant="caption" sx={{ color: '#64748b' }}>Create announcements</Typography>}
                  />
                </ListItem>
              </List>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Course Coordinators Table */}
      <Box sx={{ mt: { xs: 3, md: 5 } }}>
        <Card>
          <CardContent sx={{ p: { xs: 2, md: 3 } }}>
            <Typography variant="h6" sx={{ 
              mb: 2,
              fontSize: { xs: '1.1rem', md: '1.25rem' }
            }}>
              Course Coordinators
            </Typography>
            {courseCoordinators.length === 0 ? (
              <Typography color="textSecondary">No course coordinators assigned yet.</Typography>
            ) : (
              <Box sx={{ 
                overflowX: 'auto',
                WebkitOverflowScrolling: 'touch',
                '&::-webkit-scrollbar': {
                  height: '8px'
                },
                '&::-webkit-scrollbar-thumb': {
                  backgroundColor: 'rgba(0,0,0,0.2)',
                  borderRadius: '4px'
                }
              }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '600px' }}>
                  <thead>
                    <tr style={{ background: '#f5f5f5' }}>
                      <th style={{ padding: 8, border: '1px solid #eee', textAlign: 'left' }}>Course</th>
                      <th style={{ padding: 8, border: '1px solid #eee', textAlign: 'left' }}>Course Code</th>
                      <th style={{ padding: 8, border: '1px solid #eee', textAlign: 'left' }}>Coordinator Name</th>
                      <th style={{ padding: 8, border: '1px solid #eee', textAlign: 'left' }}>Email</th>
                      <th style={{ padding: 8, border: '1px solid #eee', textAlign: 'left' }}>UID</th>
                      <th style={{ padding: 8, border: '1px solid #eee', textAlign: 'left' }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {courseCoordinators.map(course => {
                      const hasCC = course.coordinators && course.coordinators.length > 0;
                      return hasCC ? (
                        course.coordinators.map((cc, idx) => (
                          <tr key={course._id + '-' + cc._id}>
                            <td style={{ padding: 8, border: '1px solid #eee' }}>{course.title}</td>
                            <td style={{ padding: 8, border: '1px solid #eee' }}>{course.courseCode}</td>
                            <td style={{ padding: 8, border: '1px solid #eee' }}>{cc.name}</td>
                            <td style={{ padding: 8, border: '1px solid #eee' }}>{cc.email}</td>
                            <td style={{ padding: 8, border: '1px solid #eee' }}>{cc.uid || cc.teacherId}</td>
                            <td style={{ padding: 8, border: '1px solid #eee' }}>
                              <Button size="small" variant="outlined" onClick={() => openAssignDialog(course)}>
                                Update
                              </Button>
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr key={course._id + '-none'}>
                          <td style={{ padding: 8, border: '1px solid #eee' }}>{course.title}</td>
                          <td style={{ padding: 8, border: '1px solid #eee' }}>{course.courseCode}</td>
                          <td style={{ padding: 8, border: '1px solid #eee' }} colSpan={3}><em>No coordinator assigned</em></td>
                          <td style={{ padding: 8, border: '1px solid #eee' }}>
                            <Button size="small" variant="contained" onClick={() => openAssignDialog(course)}>
                              Assign
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </Box>
            )}
          </CardContent>
        </Card>
      </Box>

      {/* Assign/Update Coordinator Dialog */}
      <Dialog open={assignDialogOpen} onClose={() => !busy && setAssignDialogOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Assign/Update Course Coordinator</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ mb: 2 }}>
            {selectedCourse ? `Course: ${selectedCourse.title} (${selectedCourse.courseCode})` : ''}
          </Typography>
          <Typography variant="body2" color="warning.main" sx={{ mb: 2 }}>
            ⚠️ Assigning a new CC will replace any existing coordinator for this course.
          </Typography>
          <Autocomplete
            options={teachers}
            getOptionLabel={(opt) => `${opt.name || ''} (${opt.uid || opt.teacherId || opt.email || ''})`}
            onChange={(_, val) => setSelectedTeacher(val)}
            renderInput={(params) => <TextField {...params} label="Select Teacher" placeholder="Search teachers" />}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAssignDialogOpen(false)} disabled={busy}>Cancel</Button>
          <Button onClick={handleAssignCC} disabled={!selectedTeacher || busy} variant="contained">Assign</Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={snack.open} autoHideDuration={3000} onClose={() => setSnack(s => ({ ...s, open: false }))}>
        <MuiAlert onClose={() => setSnack(s => ({ ...s, open: false }))} severity={snack.severity} elevation={6} variant="filled">
          {snack.message}
        </MuiAlert>
      </Snackbar>
  </Box>
  );
};

export default HODDashboardHome;
