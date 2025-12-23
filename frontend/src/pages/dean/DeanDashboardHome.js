import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
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
  Avatar,
  Divider,
  List,
  ListItem,
  ListItemIcon,
  ListItemText
} from '@mui/material';
import {
  School as SchoolIcon,
  Group as GroupIcon,
  Book as BookIcon,
  TrendingUp as TrendingUpIcon,
  Launch as LaunchIcon,
  Assessment as AssessmentIcon,
  Announcement as AnnouncementIcon,
  Business as BusinessIcon,
  NotificationsActive as NotificationsActiveIcon,
  MoreVert as MoreVertIcon
} from '@mui/icons-material';
import axios from 'axios';
import { parseJwt } from '../../utils/jwt';

const DeanDashboardHome = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [notifications, setNotifications] = useState([]);
  const [notificationsLoading, setNotificationsLoading] = useState(true);
  const [expandedNotification, setExpandedNotification] = useState(null);
  const [stats, setStats] = useState({
    school: null,
    departments: 0,
    teachers: 0,
    courses: 0,
    students: 0
  });
  
  const token = localStorage.getItem('token');
  const currentUser = parseJwt(token);

  useEffect(() => {
    fetchDashboardData();
    fetchNotifications();
  }, []);

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      
      // Use the /api/dean/overview endpoint which returns all stats in one call
      const overviewRes = await axios.get(`/api/dean/overview`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      console.log('Dean overview response:', overviewRes.data);
      
      const { school, stats: apiStats } = overviewRes.data;
      
      setStats({
        school: school,
        departments: apiStats?.departments || 0,
        teachers: apiStats?.teachers || 0,
        courses: apiStats?.courses || 0,
        students: apiStats?.students || 0,
        hods: apiStats?.hods || 0
      });
      
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
      // Try to show error details
      if (error.response) {
        console.error('Error response:', error.response.data);
      }
    } finally {
      setLoading(false);
    }
  };

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
        background: 'transparent',
        display: 'flex',
        alignItems: 'center'
      }}>
        <Box display="flex" alignItems="center" width="100%">
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
          Welcome back, Dean {currentUser.firstName} {currentUser.lastName}
        </Typography>
        {stats.school && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
            <Typography variant="h6" color="textSecondary" sx={{ 
              fontSize: { xs: '1rem', sm: '1.1rem', md: '1.25rem' }
            }}>
              {stats.school.name}
            </Typography>
            <Chip 
              label={stats.school.code} 
              size="small" 
              color="primary" 
              variant="outlined" 
            />
          </Box>
        )}
      </Box>

      {/* Stats Cards */}
      <Grid container spacing={{ xs: 2, sm: 2.5, md: 3 }} sx={{ mb: { xs: 3, md: 4 } }}>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="Departments"
            value={stats.departments}
            icon={<SchoolIcon />}
            gradientColors={['#bbdefb', '#e3f2fd']}
            iconBgColor="25, 118, 210"
          />
        </Grid>
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
            gradientColors={['#e1bee7', '#f3e5f5']}
            iconBgColor="156, 39, 176"
          />
        </Grid>
      </Grid>

      {/* Notifications, School Overview & Quick Actions - 3 Cards Row */}
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
              ) : notifications.length === 0 ? (
                <Typography variant="body2" color="text.secondary">No notifications</Typography>
              ) : (
                <Box>
                  {notifications.slice(0, 5).map((notification, index) => {
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
                          borderBottom: index < 4 ? '1px solid #e2e8f0' : 'none'
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

        {/* School Overview Card */}
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
                  School Overview
                </Typography>
              }
              subheader={
                <Typography variant="body2" sx={{ color: '#64748b' }}>
                  {stats.school?.name || 'Your School'}
                </Typography>
              }
              action={
                <MoreVertIcon sx={{ color: '#94a3b8' }} />
              }
            />
            <CardContent>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #f1f5f9', pb: 1 }}>
                  <Typography variant="body2" color="text.secondary">Departments</Typography>
                  <Typography variant="h6" sx={{ fontWeight: 600, color: '#005b96' }}>{stats.departments}</Typography>
                </Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #f1f5f9', pb: 1 }}>
                  <Typography variant="body2" color="text.secondary">Teachers</Typography>
                  <Typography variant="h6" sx={{ fontWeight: 600, color: '#005b96' }}>{stats.teachers}</Typography>
                </Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #f1f5f9', pb: 1 }}>
                  <Typography variant="body2" color="text.secondary">Courses</Typography>
                  <Typography variant="h6" sx={{ fontWeight: 600, color: '#005b96' }}>{stats.courses}</Typography>
                </Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Typography variant="body2" color="text.secondary">School Code</Typography>
                  <Typography variant="body1" sx={{ fontWeight: 500 }}>{stats.school?.code || 'N/A'}</Typography>
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
                <ListItem button onClick={() => navigate('/dean/departments')} sx={{ py: 1, '&:hover': { bgcolor: 'rgba(0, 91, 150, 0.05)' } }}>
                  <ListItemIcon><BusinessIcon sx={{ color: '#005b96', fontSize: 20 }} /></ListItemIcon>
                  <ListItemText 
                    primary={<Typography variant="body2" sx={{ fontWeight: 500 }}>View Departments</Typography>}
                    secondary={<Typography variant="caption" sx={{ color: '#64748b' }}>Browse all departments</Typography>}
                  />
                </ListItem>
                <ListItem button onClick={() => navigate('/dean/courses')} sx={{ py: 1, '&:hover': { bgcolor: 'rgba(0, 91, 150, 0.05)' } }}>
                  <ListItemIcon><BookIcon sx={{ color: '#005b96', fontSize: 20 }} /></ListItemIcon>
                  <ListItemText 
                    primary={<Typography variant="body2" sx={{ fontWeight: 500 }}>Course Management</Typography>}
                    secondary={<Typography variant="caption" sx={{ color: '#64748b' }}>Browse school courses</Typography>}
                  />
                </ListItem>
                <ListItem button onClick={() => navigate('/dean/announcements')} sx={{ py: 1, '&:hover': { bgcolor: 'rgba(0, 91, 150, 0.05)' } }}>
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
    </Box>
  );
};

export default DeanDashboardHome;
