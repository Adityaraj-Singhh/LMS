import React, { useEffect, useState } from 'react';
import { Grid, Typography, Card, CardContent, CardHeader, CircularProgress, Alert, Box, Avatar, Divider, List, ListItem, ListItemIcon, ListItemText, Chip } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { parseJwt } from '../../utils/jwt';
import PeopleIcon from '@mui/icons-material/People';
import SchoolIcon from '@mui/icons-material/School';
import ClassIcon from '@mui/icons-material/Class';
import VideoLibraryIcon from '@mui/icons-material/VideoLibrary';
import QuizIcon from '@mui/icons-material/Quiz';
import LaunchIcon from '@mui/icons-material/Launch';
import AssessmentIcon from '@mui/icons-material/Assessment';
import ChatIcon from '@mui/icons-material/Chat';
import NotificationsActiveIcon from '@mui/icons-material/NotificationsActive';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import AnnouncementIcon from '@mui/icons-material/Announcement';

const StatCard = ({ title, count, description, icon, gradient, textColor = '#333' }) => (
  <Card 
    sx={{ 
      height: { xs: '140px', md: '160px' },
      minHeight: '140px',
      background: gradient,
      color: textColor,
      border: '1px solid #6497b1',
      borderRadius: 2,
      boxShadow: '0 4px 12px rgba(0, 91, 150, 0.15)',
      transition: 'all 0.3s ease',
      position: 'relative',
      overflow: 'hidden',
      '&:hover': {
        transform: 'translateY(-5px)',
        boxShadow: '0 8px 16px rgba(0, 91, 150, 0.25)',
      }
    }}
  >
    <CardContent sx={{ 
      p: { xs: 2, md: 2.5 }, 
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'space-between',
      position: 'relative'
    }}>
      <Box sx={{ 
        position: 'absolute',
        top: { xs: 12, md: 16 },
        right: { xs: 12, md: 16 },
        opacity: 0.8
      }}>
        <Avatar sx={{ 
          bgcolor: 'rgba(255, 255, 255, 0.9)', 
          width: { xs: 40, md: 44 },
          height: { xs: 40, md: 44 },
          boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
          border: '1px solid rgba(255, 255, 255, 0.8)'
        }}>
          {icon}
        </Avatar>
      </Box>
      <Box sx={{ 
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        pr: { xs: 6, md: 7 }
      }}>
        <Typography variant="h3" component="div" sx={{ 
          fontWeight: 700,
          fontSize: { xs: '1.8rem', md: '2.2rem' },
          lineHeight: 1,
          mb: 1
        }}>
          {count}
        </Typography>
        <Typography variant="h6" component="div" sx={{ 
          fontWeight: 600,
          fontSize: { xs: '0.9rem', md: '1rem' },
          lineHeight: 1.2,
          mb: 0.5
        }}>
          {title}
        </Typography>
        <Typography variant="body2" sx={{ 
          opacity: 0.7,
          fontWeight: 500,
          fontSize: { xs: '0.75rem', md: '0.8rem' },
          lineHeight: 1.3
        }}>
          {description}
        </Typography>
      </Box>
    </CardContent>
  </Card>
);

const TeacherDashboardHome = () => {
  const navigate = useNavigate();
  const token = localStorage.getItem('token');
  const currentUser = parseJwt(token);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notifications, setNotifications] = useState([]);
  const [notificationsLoading, setNotificationsLoading] = useState(true);
  const [expandedNotification, setExpandedNotification] = useState(null);
  const [dashboardData, setDashboardData] = useState({
    courseCount: 0,
    studentCount: 0,
    videoCount: 0,
    sectionCount: 0,
    quizCount: 0
  });

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

  useEffect(() => {
    const fetchDashboardData = async () => {
      try {
        // Add cache-busting timestamp to ensure fresh data
        const timestamp = Date.now();
        const cacheHeaders = {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0'
        };
        
        // Fetch overview data
        const overviewResponse = await axios.get(`/api/teacher/analytics/overview?_t=${timestamp}`, {
          headers: { Authorization: `Bearer ${token}`, ...cacheHeaders }
        });
        
        setDashboardData(overviewResponse.data);
        setLoading(false);
      } catch (err) {
        console.error('Error fetching dashboard data:', err);
        setError('Failed to load dashboard data. Please try again later.');
        // Use some default data in case of error
        setDashboardData({
          courseCount: 0,
          studentCount: 0,
          videoCount: 0,
          sectionCount: 0,
          quizCount: 0
        });
        setLoading(false);
      }
    };

    if (token) {
      fetchDashboardData();
      fetchNotifications();
    }
  }, [token]);

  return (
    <Box sx={{ p: { xs: 1.5, sm: 2, md: 3 } }}>
      <Typography 
        variant="h4" 
        gutterBottom
        sx={{ 
          fontWeight: 700,
          background: 'linear-gradient(135deg, #011f4b 0%, #005b96 100%)',
          backgroundClip: 'text',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          mb: 1,
          fontSize: { xs: '1.5rem', sm: '1.75rem', md: '2.125rem' }
        }}
      >
        Teaching Overview
      </Typography>
      <Typography 
        variant="subtitle1" 
        gutterBottom 
        sx={{ 
          color: 'text.secondary',
          fontWeight: 500,
          mb: { xs: 3, md: 4 },
          fontSize: { xs: '0.9rem', sm: '1rem' }
        }}
      >
        Welcome back, {currentUser?.name || 'Teacher'}! Here's your teaching summary.
      </Typography>

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}>
          <CircularProgress />
        </Box>
      ) : error ? (
        <Alert severity="error" sx={{ mb: 3 }}>{error}</Alert>
      ) : (
        <Grid container spacing={{ xs: 2, sm: 2.5, md: 3 }}>
          <Grid item xs={12} sm={6} md={6} lg={2.4}>
            <StatCard
              title="Courses"
              count={dashboardData.courseCount}
              description="assigned courses"
              icon={<ClassIcon sx={{ color: '#4361ee', fontSize: 28 }} />}
              gradient="linear-gradient(135deg, #e3f2fd 0%, #bbdefb 100%)"
              textColor="#1565c0"
            />
          </Grid>
          
          <Grid item xs={12} md={6} lg={2.4}>
            <StatCard
              title="Students"
              count={dashboardData.studentCount}
              description="across all courses"
              icon={<SchoolIcon sx={{ color: '#2e7d32', fontSize: 28 }} />}
              gradient="linear-gradient(135deg, #e8f5e9 0%, #c8e6c9 100%)"
              textColor="#2e7d32"
            />
          </Grid>
          
          <Grid item xs={12} md={6} lg={2.4}>
            <StatCard
              title="Sections"
              count={dashboardData.sectionCount || 0}
              description="teaching sections"
              icon={<PeopleIcon sx={{ color: '#f57c00', fontSize: 28 }} />}
              gradient="linear-gradient(135deg, #fff3e0 0%, #ffe0b2 100%)"
              textColor="#f57c00"
            />
          </Grid>
          
          <Grid item xs={12} md={6} lg={2.4}>
            <StatCard
              title="Videos"
              count={dashboardData.videoCount}
              description="uploaded videos"
              icon={<VideoLibraryIcon sx={{ color: '#7b1fa2', fontSize: 28 }} />}
              gradient="linear-gradient(135deg, #f3e5f5 0%, #e1bee7 100%)"
              textColor="#7b1fa2"
            />
          </Grid>

          <Grid item xs={12} md={6} lg={2.4}>
            <StatCard
              title="Quizzes"
              count={dashboardData.quizCount || 0}
              description="created quizzes"
              icon={<QuizIcon sx={{ color: '#d32f2f', fontSize: 28 }} />}
              gradient="linear-gradient(135deg, #ffebee 0%, #ffcdd2 100%)"
              textColor="#d32f2f"
            />
          </Grid>
        </Grid>
      )}

      {/* Quick Actions Section - 3 Cards in Row */}
      {!loading && !error && (
        <Grid container spacing={3} sx={{ mt: 1 }}>
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

          {/* Teaching Overview Card */}
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
                    Teaching Overview
                  </Typography>
                }
                subheader={
                  <Typography variant="body2" sx={{ color: '#64748b' }}>
                    Your teaching summary
                  </Typography>
                }
                action={
                  <MoreVertIcon sx={{ color: '#94a3b8' }} />
                }
              />
              <CardContent>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #f1f5f9', pb: 1 }}>
                    <Typography variant="body2" color="text.secondary">Courses</Typography>
                    <Typography variant="h6" sx={{ fontWeight: 600, color: '#005b96' }}>{dashboardData.courseCount}</Typography>
                  </Box>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #f1f5f9', pb: 1 }}>
                    <Typography variant="body2" color="text.secondary">Students</Typography>
                    <Typography variant="h6" sx={{ fontWeight: 600, color: '#005b96' }}>{dashboardData.studentCount}</Typography>
                  </Box>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #f1f5f9', pb: 1 }}>
                    <Typography variant="body2" color="text.secondary">Videos</Typography>
                    <Typography variant="h6" sx={{ fontWeight: 600, color: '#005b96' }}>{dashboardData.videoCount}</Typography>
                  </Box>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Typography variant="body2" color="text.secondary">Quizzes</Typography>
                    <Typography variant="h6" sx={{ fontWeight: 600, color: '#005b96' }}>{dashboardData.quizCount || 0}</Typography>
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
                  <ListItem button onClick={() => navigate('/teacher/courses')} sx={{ py: 1, '&:hover': { bgcolor: 'rgba(0, 91, 150, 0.05)' } }}>
                    <ListItemIcon><ClassIcon sx={{ color: '#005b96', fontSize: 20 }} /></ListItemIcon>
                    <ListItemText 
                      primary={<Typography variant="body2" sx={{ fontWeight: 500 }}>My Courses</Typography>}
                      secondary={<Typography variant="caption" sx={{ color: '#64748b' }}>View and manage your courses</Typography>}
                    />
                  </ListItem>
                  <ListItem button onClick={() => navigate('/teacher/analytics')} sx={{ py: 1, '&:hover': { bgcolor: 'rgba(0, 91, 150, 0.05)' } }}>
                    <ListItemIcon><AssessmentIcon sx={{ color: '#005b96', fontSize: 20 }} /></ListItemIcon>
                    <ListItemText 
                      primary={<Typography variant="body2" sx={{ fontWeight: 500 }}>Analytics</Typography>}
                      secondary={<Typography variant="caption" sx={{ color: '#64748b' }}>View student performance</Typography>}
                    />
                  </ListItem>
                  <ListItem button onClick={() => navigate('/teacher/chats')} sx={{ py: 1, '&:hover': { bgcolor: 'rgba(0, 91, 150, 0.05)' } }}>
                    <ListItemIcon><ChatIcon sx={{ color: '#005b96', fontSize: 20 }} /></ListItemIcon>
                    <ListItemText 
                      primary={<Typography variant="body2" sx={{ fontWeight: 500 }}>Group Chats</Typography>}
                      secondary={<Typography variant="caption" sx={{ color: '#64748b' }}>Communicate with students</Typography>}
                    />
                  </ListItem>
                </List>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      )}
    </Box>
  );
};

export default TeacherDashboardHome;