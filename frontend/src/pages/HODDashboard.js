import React, { useState, useEffect } from 'react';
import { Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { 
  Box, 
  Typography,
  Avatar,
  List,
  ListItem,
  ListItemText,
  Grid,
  Card,
  CardContent,
  CardHeader,
  Divider,
  IconButton,
  Menu,
  MenuItem
} from '@mui/material';
import axios from 'axios';
import DashboardIcon from '@mui/icons-material/Dashboard';
import NotificationsActiveIcon from '@mui/icons-material/NotificationsActive';

import MoreVertIcon from '@mui/icons-material/MoreVert';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import LogoutIcon from '@mui/icons-material/Logout';
import PersonIcon from '@mui/icons-material/Person';
import SwitchAccountIcon from '@mui/icons-material/SwitchAccount';
import MenuIcon from '@mui/icons-material/Menu';
import { parseJwt } from '../utils/jwt';
import { useUserRole } from '../contexts/UserRoleContext';
import Sidebar from '../components/Sidebar';
import NotificationBell from '../components/admin/NotificationBell';
import DashboardRoleGuard from '../components/DashboardRoleGuard';
import sgtLogoWhite from '../assets/new-header-logo.png';

// Import HOD Dashboard components
import HODDashboardHome from './hod/HODDashboardHome';
import HODTeachers from './hod/HODTeachers';
import HODCourses from './hod/HODCourses';
import HODSections from './hod/HODSections';
import HODAnalytics from './hod/HODAnalytics';
import HODAnnouncements from './hod/HODAnnouncements';
import HODAnnouncementHistory from './hod/HODAnnouncementHistory';

import HODAnnouncementApproval from '../components/hod/HODAnnouncementApproval';
import HODQuizManagement from './hod/HODQuizManagement';
import HODCCManagement from './hod/HODCCManagement';
import HODVideoUnlockApproval from './hod/HODVideoUnlockApproval';
import HODQuizUnlockDashboard from '../components/hod/HODQuizUnlockDashboard';
import HODProfile from '../components/HODProfile';
import ChatDashboard from '../components/ChatDashboard';
import HODContentApprovalPage from './hod/HODContentApprovalPage';
import HODCertificates from './hod/HODCertificates';
import HODDepartmentAnalytics from '../components/hod/HODDepartmentAnalytics';
import HODCourseAnalytics from '../components/hod/HODCourseAnalytics';
import StudentIndividualAnalytics from '../components/common/StudentIndividualAnalytics';
import HODQuizReport from './hod/HODQuizReport';
// import HODLiveClasses from './hod/HODLiveClasses'; // Moved to LEGACY_BACKUP
// Live class components moved to independent video-call-module
// import SgtLmsLiveClass from '../components/liveclass/CodeTantraLiveClass';

const HODDashboard = () => {
  const navigate = useNavigate();
  const token = localStorage.getItem('token');
  const currentUser = parseJwt(token);
  const { hasRole, user: contextUser, switchRole, availableRoles, activeRole } = useUserRole();
  const location = useLocation();
  
  // Use context user if available, fallback to parsed JWT
  const user = contextUser || currentUser;
  
  // Check if we're on a live class route
  const isOnLiveClass = location.pathname.includes('/live-class');

  // Sidebar collapsed state
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    const saved = localStorage.getItem('sidebarCollapsed');
    return saved === 'true';
  });

  // Profile menu state
  const [profileAnchorEl, setProfileAnchorEl] = useState(null);

  // Mobile menu state
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Notifications section state
  const [notifications, setNotifications] = useState([]);
  const [notificationsLoading, setNotificationsLoading] = useState(true);
  




  // HOD stats state
  const [hodStats, setHodStats] = useState({
    department: null,
    teachers: 0,
    courses: 0,
    sections: 0,
    students: 0
  });
  const [statsLoading, setStatsLoading] = useState(true);

  // Check if we're on a sub-page
  const isOnMainDashboard = location.pathname === '/hod/dashboard';

  // Listen for sidebar toggle events
  useEffect(() => {
    const handleSidebarToggle = (event) => {
      setSidebarCollapsed(event.detail.collapsed);
    };
    
    window.addEventListener('sidebarToggle', handleSidebarToggle);
    
    return () => {
      window.removeEventListener('sidebarToggle', handleSidebarToggle);
    };
  }, []);

  useEffect(() => {
    if (!token) return;
    
    // Fetch notifications
    (async () => {
      try {
        setNotificationsLoading(true);
        const res = await axios.get('/api/notifications', { headers: { Authorization: `Bearer ${token}` } });
        setNotifications(res.data.notifications || res.data || []);
      } catch (error) {
        console.error('Error fetching notifications:', error);
      } finally {
        setNotificationsLoading(false);
      }
    })();
    

    



    // Fetch HOD statistics
    (async () => {
      try {
        setStatsLoading(true);
        
        // Use current user data instead of admin endpoint
        const userData = currentUser;
        
        const departmentId = userData.department?._id || userData.department;
        
        // Use the HOD dashboard endpoint which provides all stats
        const dashboardRes = await axios.get(`/api/hod/dashboard`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        
        setHodStats(dashboardRes.data);
      } catch (error) {
        console.error('Error fetching HOD stats:', error);
      } finally {
        setStatsLoading(false);
      }
    })();
  }, [token, currentUser._id]);

  // Helper function to render loading or empty state
  const renderLoadingOrEmpty = (loading, items, emptyMessage) => {
    if (loading) {
      return (
        <ListItem>
          <ListItemText primary="Loading..." />
        </ListItem>
      );
    }
    
    if (items.length === 0) {
      return (
        <ListItem>
          <ListItemText primary={emptyMessage} />
        </ListItem>
      );
    }
    
    return null;
  };

  // Event handlers for profile menu
  const handleProfileClick = (event) => {
    setProfileAnchorEl(event.currentTarget);
  };

  const handleProfileMenuClose = () => {
    setProfileAnchorEl(null);
  };

  const handleProfileDialogOpen = () => {
    handleProfileMenuClose();
    navigate('/hod/profile');
  };

  const handleSwitchRole = (targetRole) => {
    console.log('🔄 Attempting to switch to role:', targetRole);
    
    // Try using the context switchRole first
    if (switchRole && typeof switchRole === 'function') {
      const result = switchRole(targetRole);
      if (result) {
        return; // Successfully switched using context
      }
    }
    
    // Fallback: Manual role switching
    console.log('🔄 Using manual role switching fallback');
    localStorage.setItem('activeRole', targetRole);
    
    // Get the correct dashboard route for the target role
    const routes = {
      admin: '/admin/dashboard',
      dean: '/dean/dashboard',
      hod: '/hod/dashboard',
      teacher: '/teacher/dashboard',
      student: '/student/dashboard'
    };
    
    const targetRoute = routes[targetRole] || '/dashboard';
    console.log('🎯 Navigating to:', targetRoute);
    
    // Force navigation
    window.location.href = targetRoute;
    
    handleProfileMenuClose();
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    window.location.href = '/login';
  };

  // Allow only hod users to access the HOD dashboard
  const hasHODRole = currentUser && (
    currentUser.role === 'hod' || 
    (currentUser.roles && currentUser.roles.includes('hod')) ||
    currentUser.primaryRole === 'hod' ||
    hasRole('hod')
  );
  
  if (!hasHODRole) {
    return <Navigate to="/login" />;
  }

  // Auto-redirect to dashboard if at the root hod path
  if (location.pathname === '/hod') {
    return <Navigate to="/hod/dashboard" replace />;
  }

  return (
    <DashboardRoleGuard requiredRole="hod">
      <Box sx={{ display: 'flex', minHeight: '100vh' }}>
        {/* Professional Header - Full Width Fixed - Hidden on live class */}
        {!isOnLiveClass && (
          <Box 
            sx={{ 
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              height: '64px',
              background: 'linear-gradient(135deg, #005b96 0%, #03396c 100%)',
              borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            px: 3,
            boxShadow: '0 2px 8px rgba(0, 91, 150, 0.15)',
            zIndex: 1300
          }}
        >
          {/* Left side - Menu icon (mobile only) + SGT Logo */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            {/* Mobile Menu Icon */}
            <IconButton
              onClick={() => setMobileMenuOpen(true)}
              sx={{
                display: { xs: 'flex', md: 'none' },
                color: 'white',
                '&:hover': {
                  backgroundColor: 'rgba(255, 255, 255, 0.1)'
                }
              }}
            >
              <MenuIcon />
            </IconButton>
            <img 
              src={sgtLogoWhite} 
              alt="Header Logo" 
              style={{ 
                height: '50px',
                filter: 'brightness(1)',
                objectFit: 'contain'
              }} 
            />
          </Box>

          {/* Right side - Actions */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            {/* Notification Bell with light color for dark header */}
            <Box 
              sx={{ 
                '& .MuiIconButton-root': {
                  color: 'white',
                  '&:hover': {
                    backgroundColor: 'rgba(255, 255, 255, 0.1)'
                  }
                },
                '& .MuiSvgIcon-root': {
                  color: 'white'
                }
              }}
            >
              <NotificationBell token={token} />
            </Box>

            {/* Profile Menu */}
            <IconButton
              onClick={handleProfileClick}
              sx={{
                ml: 2,
                p: 1,
                border: '1px solid rgba(255, 255, 255, 0.2)',
                '&:hover': {
                  backgroundColor: 'rgba(255, 255, 255, 0.1)',
                  borderColor: 'rgba(255, 255, 255, 0.3)'
                }
              }}
            >
              <Avatar 
                sx={{ 
                  width: 32, 
                  height: 32, 
                  bgcolor: 'rgba(255, 255, 255, 0.9)',
                  color: '#005b96',
                  fontSize: '0.9rem',
                  fontWeight: 600
                }}
              >
                {user?.name?.charAt(0)?.toUpperCase() || 'H'}
              </Avatar>
            </IconButton>

            {/* Profile Dropdown Menu */}
            <Menu
              anchorEl={profileAnchorEl}
              open={Boolean(profileAnchorEl)}
              onClose={handleProfileMenuClose}
              PaperProps={{
                sx: {
                  mt: 1,
                  minWidth: 220,
                  boxShadow: '0 8px 32px rgba(0, 91, 150, 0.15)',
                  border: '1px solid rgba(0, 91, 150, 0.1)'
                }
              }}
            >
              <MenuItem 
                onClick={handleProfileDialogOpen}
                sx={{ 
                  py: 1.5,
                  '&:hover': { 
                    backgroundColor: 'rgba(0, 91, 150, 0.08)' 
                  } 
                }}
              >
                <PersonIcon sx={{ mr: 2, color: '#005b96' }} />
                <Typography variant="body2" sx={{ fontWeight: 500 }}>
                  My Profile
                </Typography>
              </MenuItem>
              
              <Divider sx={{ my: 1 }} />
              
              {/* Dynamic Role switching options - show all user roles except current */}
              {(() => {
                console.log('Debug HODDashboard - availableRoles:', availableRoles, 'activeRole:', activeRole);
                
                // Get all possible user roles from different sources
                const userRoles = [];
                
                // From context (preferred)
                if (availableRoles && availableRoles.length > 0) {
                  userRoles.push(...availableRoles);
                }
                
                // From JWT roles array (fallback)
                if (currentUser?.roles && Array.isArray(currentUser.roles)) {
                  userRoles.push(...currentUser.roles);
                }
                
                // From JWT single role (fallback)
                if (currentUser?.role) {
                  userRoles.push(currentUser.role);
                }
                
                // From JWT primaryRole (fallback)
                if (currentUser?.primaryRole) {
                  userRoles.push(currentUser.primaryRole);
                }
                
                // Remove duplicates and current role
                const currentRole = activeRole || currentUser?.role || 'hod';
                const availableRoleOptions = [...new Set(userRoles)].filter(role => role !== currentRole);
                
                console.log('🔍 HOD Role Detection:', {
                  userRoles,
                  currentRole,
                  availableRoleOptions,
                  contextAvailable: availableRoles?.length > 0
                });
                
                // Role labels and icons
                const roleLabels = {
                  admin: 'Administrator',
                  dean: 'Dean',
                  hod: 'HOD',
                  teacher: 'Teacher',
                  student: 'Student'
                };
                
                const roleIcons = {
                  admin: '👑',
                  dean: '🏛️',
                  hod: '🏢',
                  teacher: '👨‍🏫',
                  student: '🎓'
                };
                
                // Return the menu items
                return availableRoleOptions.map((role) => (
                  <MenuItem 
                    key={role}
                    onClick={() => handleSwitchRole(role)}
                    sx={{ 
                      py: 1.5,
                      '&:hover': { 
                        backgroundColor: 'rgba(0, 91, 150, 0.08)' 
                      } 
                    }}
                  >
                    <SwitchAccountIcon sx={{ mr: 2, color: '#005b96' }} />
                    <Typography variant="body2" sx={{ fontWeight: 500 }}>
                      Switch to {roleLabels[role] || role} {roleIcons[role] || ''}
                    </Typography>
                  </MenuItem>
                ));
              })()}
              
              {/* Show divider if there are roles to switch to */}
              {(() => {
                const userRoles = [
                  ...(availableRoles || []),
                  ...(currentUser?.roles || []),
                  currentUser?.role,
                  currentUser?.primaryRole
                ].filter(Boolean);
                const currentRole = activeRole || currentUser?.role || 'hod';
                const hasMultipleRoles = [...new Set(userRoles)].filter(role => role !== currentRole).length > 0;
                return hasMultipleRoles ? <Divider sx={{ my: 1 }} /> : null;
              })()}
              
              <MenuItem 
                onClick={handleLogout}
                sx={{ 
                  py: 1.5,
                  '&:hover': { 
                    backgroundColor: 'rgba(211, 47, 47, 0.08)' 
                  } 
                }}
              >
                <LogoutIcon sx={{ mr: 2, color: '#d32f2f' }} />
                <Typography variant="body2" sx={{ fontWeight: 500, color: '#d32f2f' }}>
                  Logout
                </Typography>
              </MenuItem>
            </Menu>
          </Box>
        </Box>
        )}

        {/* Sidebar with top margin for fixed header - Hidden on live class */}
        {!isOnLiveClass && (
          <Box sx={{ 
            mt: '64px', 
            width: { xs: 0, md: sidebarCollapsed ? '80px' : '280px' },
            flexShrink: 0,
            transition: 'width 0.3s',
            display: { xs: 'none', md: 'block' }
          }}>
            <Sidebar 
              currentUser={currentUser}
              mobileOpen={mobileMenuOpen}
              handleDrawerToggle={() => setMobileMenuOpen(false)}
            />
          </Box>
        )}
        
        {/* Main Content Area with margin for sidebar and header */}
        <Box sx={{ 
          flexGrow: 1, 
          mt: isOnLiveClass ? 0 : '64px', 
          ml: 0,
          width: isOnLiveClass ? '100vw' : { 
            xs: '100%',
            md: `calc(100% - ${sidebarCollapsed ? 80 : 280}px)`
          },
          transition: 'width 0.3s',
          position: isOnLiveClass ? 'fixed' : 'relative',
          top: isOnLiveClass ? 0 : 'auto',
          left: isOnLiveClass ? 0 : 'auto',
          height: isOnLiveClass ? '100vh' : 'auto',
          zIndex: isOnLiveClass ? 1400 : 'auto'
        }}>
          <Box 
            component="main" 
            sx={{ 
              minHeight: isOnLiveClass ? '100vh' : 'calc(100vh - 64px)',
              // Lighter blue gradient background to match reference image
              background: isOnLiveClass ? '#000' : 'linear-gradient(135deg, #f8fafc 0%, #e2e8f0 30%, #cbd5e1 70%, #94a3b8 100%)',
            }}
          >
            <Box sx={{ 
              flex: 1, 
              p: isOnLiveClass ? 0 : { xs: 2, md: 3 },
              backgroundColor: 'transparent',
              height: isOnLiveClass ? '100vh' : 'auto'
            }}>
            
            {/* Routes */}
            <Routes>
              <Route path="/dashboard" element={<HODDashboardHome />} />
              <Route path="/profile" element={<HODProfile />} />
              <Route path="/chats" element={<ChatDashboard />} />
              <Route path="/teachers" element={<HODTeachers />} />
              <Route path="/courses" element={<HODCourses />} />
              <Route path="/sections" element={<HODSections />} />
              <Route path="/analytics" element={<HODAnalytics />} />
              <Route path="/department-analytics" element={<HODDepartmentAnalytics />} />
              <Route path="/course-analytics" element={<HODCourseAnalytics />} />
              <Route path="/student-analytics" element={<StudentIndividualAnalytics />} />
              <Route path="/quiz-report" element={<HODQuizReport />} />
              <Route path="/announcements" element={<HODAnnouncements user={currentUser} />} />
              <Route path="/announcements/history" element={<HODAnnouncementHistory token={token} />} />
              <Route path="/announcement-approvals" element={<HODAnnouncementApproval token={token} />} />
              <Route path="/quiz-management" element={<HODQuizManagement />} />
              <Route path="/cc-management" element={<HODCCManagement />} />
              <Route path="/certificates" element={<HODCertificates />} />
              <Route path="/video-unlock-requests" element={<HODVideoUnlockApproval token={token} user={currentUser} />} />
              <Route path="/quiz-unlock-requests" element={<HODQuizUnlockDashboard />} />
              <Route path="/content-approval" element={<HODContentApprovalPage token={token} user={currentUser} />} />
              {/* Live class routes moved to independent video-call-module */}
              {/* <Route path="/live-classes" element={<SgtLmsLiveClass token={token} user={currentUser} />} /> */}
              <Route path="*" element={<Navigate to="/hod/dashboard" replace />} />
            </Routes>
            </Box>
          </Box>
        </Box>
      </Box>
    </DashboardRoleGuard>
  );
};

export default HODDashboard;
