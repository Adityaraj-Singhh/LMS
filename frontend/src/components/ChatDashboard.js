import React, { useState, useEffect } from 'react';
import {
  Box,
  Grid,
  Card,
  CardContent,
  CardActionArea,
  Typography,
  CircularProgress,
  Alert,
  TextField,
  InputAdornment,
  Chip,
  Avatar,
  Divider,
  Badge,
  useMediaQuery,
  useTheme
} from '@mui/material';
import {
  Chat as ChatIcon,
  Search as SearchIcon,
  School as SchoolIcon,
  Class as ClassIcon,
  Business as BusinessIcon,
  AccountBalance as AccountBalanceIcon
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';

const ChatDashboard = () => {
  const [chatRooms, setChatRooms] = useState([]);
  const [filteredRooms, setFilteredRooms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [unreadCounts, setUnreadCounts] = useState({});
  const [totalUnread, setTotalUnread] = useState(0);
  const navigate = useNavigate();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const isTablet = useMediaQuery(theme.breakpoints.down('md'));

  useEffect(() => {
    loadChatRooms();
    loadUnreadCounts();
    
    // Refresh unread counts every 30 seconds
    const interval = setInterval(() => {
      loadUnreadCounts();
    }, 30000);
    
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (searchTerm.trim() === '') {
      setFilteredRooms(chatRooms);
    } else {
      const term = searchTerm.toLowerCase();
      const filtered = chatRooms.filter(room =>
        (room.courseName || '').toLowerCase().includes(term) ||
        (room.courseCode || '').toLowerCase().includes(term) ||
        (room.sectionName || '').toLowerCase().includes(term) ||
        (room.departmentName || '').toLowerCase().includes(term) ||
        (room.schoolName || '').toLowerCase().includes(term)
      );
      setFilteredRooms(filtered);
    }
  }, [searchTerm, chatRooms]);

  const loadChatRooms = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get('/api/group-chat/rooms', {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      setChatRooms(response.data.chatRooms || []);
      setFilteredRooms(response.data.chatRooms || []);
    } catch (error) {
      console.error('Error loading chat rooms:', error);
      setError('Failed to load chat rooms. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const loadUnreadCounts = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get('/api/group-chat/unread-counts', {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      setUnreadCounts(response.data.unreadCounts || {});
      setTotalUnread(response.data.totalUnread || 0);
    } catch (error) {
      console.error('Error loading unread counts:', error);
      // Don't show error to user, just fail silently
    }
  };

  const handleJoinChat = (courseId, sectionId) => {
    navigate(`/group-chat/${courseId}/${sectionId}`);
  };

  // Group rooms by school and department
  const groupedRooms = filteredRooms.reduce((acc, room) => {
    const schoolKey = room.schoolName || 'Unknown School';
    const deptKey = room.departmentName || 'Unknown Department';

    if (!acc[schoolKey]) acc[schoolKey] = {};
    if (!acc[schoolKey][deptKey]) acc[schoolKey][deptKey] = [];

    acc[schoolKey][deptKey].push(room);
    return acc;
  }, {});

  if (loading) {
    return (
      <Box sx={{ 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center', 
        minHeight: '400px' 
      }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ p: { xs: 1.5, sm: 2, md: 3 } }}>
      {/* Header */}
      <Box sx={{ mb: { xs: 2, sm: 4 } }}>
        <Box sx={{ 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'space-between', 
          mb: 1,
          flexWrap: 'wrap',
          gap: 1
        }}>
          <Typography variant={isMobile ? "h5" : "h4"} sx={{ 
            fontWeight: 700,
            color: '#005b96',
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            fontSize: { xs: '1.25rem', sm: '1.5rem', md: '2rem' }
          }}>
            <ChatIcon sx={{ fontSize: { xs: 28, sm: 36, md: 40 } }} />
            Group Chats
            {totalUnread > 0 && (
              <Badge 
                badgeContent={totalUnread} 
                color="error"
                sx={{
                  '& .MuiBadge-badge': {
                    fontSize: { xs: '0.75rem', sm: '1rem' },
                    height: { xs: '22px', sm: '28px' },
                    minWidth: { xs: '22px', sm: '28px' },
                    borderRadius: { xs: '11px', sm: '14px' },
                    fontWeight: 700
                  }
                }}
              >
                <Box sx={{ width: { xs: 12, sm: 20 } }} />
              </Badge>
            )}
          </Typography>
        </Box>
        <Typography variant="body1" sx={{ 
          color: '#666', 
          mb: { xs: 2, sm: 3 },
          fontSize: { xs: '0.85rem', sm: '1rem' },
          display: 'flex',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 1
        }}>
          {isMobile ? 'Join course group chats' : 'Join course-section group chats to collaborate with your classmates and instructors'}
          {totalUnread > 0 && (
            <Chip 
              label={`${totalUnread} unread`}
              color="error"
              size="small"
              sx={{ 
                fontWeight: 600,
                fontSize: { xs: '0.7rem', sm: '0.8rem' },
                height: { xs: 22, sm: 28 }
              }}
            />
          )}
        </Typography>

        {/* Search Bar */}
        <TextField
          fullWidth
          variant="outlined"
          size={isMobile ? "small" : "medium"}
          placeholder={isMobile ? "Search chats..." : "Search by course, section, department, or school..."}
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon sx={{ color: '#005b96', fontSize: { xs: 20, sm: 24 } }} />
              </InputAdornment>
            ),
          }}
          sx={{
            maxWidth: { xs: '100%', sm: 600 },
            '& .MuiOutlinedInput-root': {
              fontSize: { xs: '0.9rem', sm: '1rem' },
              '&:hover fieldset': {
                borderColor: '#005b96',
              },
              '&.Mui-focused fieldset': {
                borderColor: '#005b96',
              },
            },
          }}
        />
      </Box>

      {/* Error Display */}
      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}

      {/* No Results */}
      {filteredRooms.length === 0 && !error && (
        <Alert severity="info">
          {searchTerm ? 'No chat rooms match your search.' : 'No chat rooms available.'}
        </Alert>
      )}

      {/* Chat Rooms Grid */}
      {Object.entries(groupedRooms).map(([schoolName, departments]) => (
        <Box key={schoolName} sx={{ mb: { xs: 2, sm: 4 } }}>
          {/* School Header */}
          <Box sx={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: 1, 
            mb: { xs: 1.5, sm: 2 },
            pb: 1,
            borderBottom: '2px solid #005b96'
          }}>
            <AccountBalanceIcon sx={{ color: '#005b96', fontSize: { xs: 22, sm: 28 } }} />
            <Typography variant={isMobile ? "h6" : "h5"} sx={{ 
              fontWeight: 600, 
              color: '#005b96',
              fontSize: { xs: '1rem', sm: '1.25rem' }
            }}>
              {schoolName}
            </Typography>
          </Box>

          {Object.entries(departments).map(([departmentName, rooms]) => (
            <Box key={`${schoolName}-${departmentName}`} sx={{ mb: { xs: 2, sm: 3 }, ml: { xs: 0, sm: 2 } }}>
              {/* Department Header */}
              <Box sx={{ 
                display: 'flex', 
                alignItems: 'center', 
                gap: 1, 
                mb: { xs: 1, sm: 2 },
                flexWrap: 'wrap'
              }}>
                <BusinessIcon sx={{ color: '#03396c', fontSize: { xs: 20, sm: 24 } }} />
                <Typography variant="h6" sx={{ 
                  fontWeight: 500, 
                  color: '#03396c',
                  fontSize: { xs: '0.9rem', sm: '1.1rem' }
                }}>
                  {departmentName}
                </Typography>
                <Chip 
                  label={`${rooms.length} chat${rooms.length !== 1 ? 's' : ''}`} 
                  size="small" 
                  sx={{ 
                    bgcolor: '#e3f2fd', 
                    color: '#005b96',
                    fontWeight: 600,
                    fontSize: { xs: '0.65rem', sm: '0.75rem' },
                    height: { xs: 20, sm: 24 }
                  }} 
                />
              </Box>

              {/* Chat Room Cards */}
              <Grid container spacing={{ xs: 1.5, sm: 2 }} sx={{ ml: { xs: 0, sm: 2 } }}>
                {rooms.map((room) => {
                  const unreadKey = `${room.courseId}_${room.sectionId}`;
                  const unreadCount = unreadCounts[unreadKey] || 0;
                  
                  return (
                    <Grid item xs={12} sm={6} md={4} lg={3} key={`${room.courseId}-${room.sectionId}`}>
                      <Badge
                        badgeContent={unreadCount}
                        color="error"
                        sx={{
                          width: '100%',
                          '& .MuiBadge-badge': {
                            top: { xs: 8, sm: 12 },
                            right: { xs: 8, sm: 12 },
                            fontSize: { xs: '0.75rem', sm: '0.85rem' },
                            height: { xs: '20px', sm: '24px' },
                            minWidth: { xs: '20px', sm: '24px' },
                            borderRadius: { xs: '10px', sm: '12px' },
                            fontWeight: 700,
                            border: '2px solid white'
                          }
                        }}
                      >
                        <Card 
                          sx={{ 
                            width: '100%',
                            height: '100%',
                            transition: 'all 0.3s ease',
                            border: '1px solid #e0e0e0',
                            position: 'relative',
                            '&:hover': {
                              transform: isMobile ? 'none' : 'translateY(-4px)',
                              boxShadow: '0 8px 16px rgba(0, 91, 150, 0.2)',
                              borderColor: '#005b96',
                            },
                            '&:active': {
                              transform: 'scale(0.98)',
                            }
                          }}
                        >
                          <CardActionArea 
                            onClick={() => handleJoinChat(room.courseId, room.sectionId)}
                            sx={{ height: '100%' }}
                          >
                            <CardContent sx={{ p: { xs: 1.5, sm: 2 } }}>
                              {/* Course Icon and Code */}
                              <Box sx={{ 
                                display: 'flex', 
                                alignItems: 'center', 
                                gap: 1, 
                                mb: { xs: 1, sm: 1.5 }
                              }}>
                                <Avatar sx={{ 
                                  bgcolor: '#005b96', 
                                  width: { xs: 32, sm: 40 }, 
                                  height: { xs: 32, sm: 40 }
                                }}>
                                  <ClassIcon sx={{ fontSize: { xs: 18, sm: 24 } }} />
                                </Avatar>
                                <Box sx={{ flex: 1, minWidth: 0 }}>
                                  <Typography 
                                    variant="subtitle2" 
                                    sx={{ 
                                      fontWeight: 700,
                                      color: '#005b96',
                                      fontSize: { xs: '0.85rem', sm: '0.95rem' },
                                      whiteSpace: 'nowrap',
                                      overflow: 'hidden',
                                      textOverflow: 'ellipsis'
                                    }}
                                  >
                                    {room.courseCode}
                                  </Typography>
                                </Box>
                                {room.isCoordinator && (
                                  <Chip 
                                    label="CC" 
                                    size="small" 
                                    sx={{ 
                                      bgcolor: '#4caf50', 
                                      color: 'white',
                                      fontSize: { xs: '0.6rem', sm: '0.7rem' },
                                      height: { xs: 18, sm: 20 }
                                    }} 
                                  />
                                )}
                              </Box>

                              <Divider sx={{ mb: { xs: 1, sm: 1.5 } }} />

                              {/* Course Name */}
                              <Typography 
                                variant="body2" 
                                sx={{ 
                                  fontWeight: 600,
                                  color: '#333',
                                  mb: 1,
                                  minHeight: { xs: 36, sm: 40 },
                                  fontSize: { xs: '0.8rem', sm: '0.875rem' },
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  display: '-webkit-box',
                                  WebkitLineClamp: 2,
                                  WebkitBoxOrient: 'vertical',
                                }}
                              >
                                {room.courseName}
                              </Typography>

                              {/* Section Info */}
                              <Box sx={{ 
                                display: 'flex', 
                                alignItems: 'center', 
                                gap: 0.5,
                                mb: 1
                              }}>
                                <SchoolIcon sx={{ fontSize: { xs: 14, sm: 16 }, color: '#666' }} />
                                <Typography variant="caption" sx={{ 
                                  color: '#666',
                                  fontSize: { xs: '0.7rem', sm: '0.75rem' }
                                }}>
                                  {room.sectionName}
                                </Typography>
                              </Box>

                              {/* Semester/Year Info */}
                              {(room.semester || room.year) && (
                                <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                                  {room.semester && (
                                    <Chip 
                                      label={`Sem ${room.semester}`} 
                                      size="small" 
                                      sx={{ 
                                        height: { xs: 18, sm: 22 },
                                        fontSize: { xs: '0.6rem', sm: '0.7rem' },
                                        bgcolor: '#f5f5f5' 
                                      }} 
                                    />
                                  )}
                                  {room.year && (
                                    <Chip 
                                      label={room.year} 
                                      size="small" 
                                      sx={{ 
                                        height: { xs: 18, sm: 22 },
                                        fontSize: { xs: '0.6rem', sm: '0.7rem' },
                                        bgcolor: '#f5f5f5' 
                                      }} 
                                    />
                                  )}
                                </Box>
                              )}
                            </CardContent>
                          </CardActionArea>
                        </Card>
                      </Badge>
                    </Grid>
                  );
                })}
              </Grid>
            </Box>
          ))}
        </Box>
      ))}
    </Box>
  );
};

export default ChatDashboard;
