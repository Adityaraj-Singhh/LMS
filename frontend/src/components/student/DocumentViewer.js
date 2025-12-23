import React, { useState, useEffect, useRef } from 'react';
import { 
  Box, 
  Typography, 
  Button, 
  Card, 
  CardContent,
  LinearProgress,
  Alert,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  IconButton
} from '@mui/material';
import { 
  CheckCircle, 
  Lock, 
  Description, 
  Close,
  Visibility,
  VisibilityOff,
  Security
} from '@mui/icons-material';
import { updateDocumentProgress, markDocumentAsRead } from '../../api/studentVideoApi';
import { getUserProfile } from '../../api/authApi';

// Security utilities
const preventScreenshot = () => {
  // Disable right-click context menu
  document.addEventListener('contextmenu', (e) => e.preventDefault());
  
  // Disable keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    // Disable F12, Ctrl+Shift+I, Ctrl+Shift+J, Ctrl+U, Ctrl+S, Ctrl+P, Print Screen
    if (
      e.key === 'F12' ||
      e.key === 'PrintScreen' ||
      (e.ctrlKey && e.shiftKey && (e.key === 'I' || e.key === 'J' || e.key === 'C')) ||
      (e.ctrlKey && (e.key === 'u' || e.key === 'U' || e.key === 's' || e.key === 'S' || e.key === 'p' || e.key === 'P'))
    ) {
      e.preventDefault();
      return false;
    }
  });
  
  // Detect screenshot attempts
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      console.warn('🚨 Potential screenshot attempt detected - page became hidden');
      // Log this event for security monitoring
      fetch('/api/security/log-attempt', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({
          type: 'screenshot_attempt',
          timestamp: new Date().toISOString(),
          userAgent: navigator.userAgent
        })
      }).catch(console.error);
    }
  });
  
  // Mobile screenshot detection
  document.addEventListener('blur', () => {
    console.warn('🚨 Mobile screenshot attempt detected - page lost focus');
    fetch('/api/security/log-attempt', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('token')}`
      },
      body: JSON.stringify({
        type: 'mobile_screenshot_attempt',
        timestamp: new Date().toISOString(),
        userAgent: navigator.userAgent
      })
    }).catch(console.error);
  });
  
  // Disable text selection and drag
  document.body.style.userSelect = 'none';
  document.body.style.webkitUserSelect = 'none';
  document.body.style.mozUserSelect = 'none';
  document.body.style.msUserSelect = 'none';
  document.body.style.webkitTouchCallout = 'none';
  
  // Additional mobile protections
  document.body.style.webkitUserDrag = 'none';
  document.body.style.webkitUserModify = 'none';
  
  // Prevent long press on mobile
  document.addEventListener('touchstart', (e) => {
    if (e.touches.length > 1) {
      e.preventDefault();
    }
  });
  
  // Prevent pinch zoom
  document.addEventListener('touchmove', (e) => {
    if (e.touches.length > 1) {
      e.preventDefault();
    }
  }, { passive: false });
};

const createWatermark = (studentInfo) => {
  const watermark = document.createElement('div');
  watermark.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    pointer-events: none;
    z-index: 999999;
    opacity: 0.15;
    font-size: 22px;
    font-weight: bold;
    color: #ff0000;
    transform: rotate(-45deg);
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: Arial, sans-serif;
  `;
  
  // Ensure we have valid student info with fallbacks
  const studentName = studentInfo?.name || 'STUDENT';
  const regNo = studentInfo?.regNo || 
               studentInfo?.registrationNumber || 
               studentInfo?.studentId || 
               studentInfo?.id || 
               `REG${Date.now().toString().slice(-6)}`;
  
  const timestamp = new Date().toLocaleDateString('en-IN', {
    year: 'numeric',
    month: 'short', 
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
  
  watermark.innerHTML = `
    <div style="text-align: center; line-height: 1.8; text-shadow: 1px 1px 2px rgba(0,0,0,0.3);">
      <div>${studentName.toUpperCase()}</div>
      <div>REG: ${regNo}</div>
      <div>${timestamp}</div>
    </div>
  `;
  document.body.appendChild(watermark);
  return watermark;
};

const DocumentViewer = ({ 
  document, 
  courseId,
  unitId,
  token, 
  isLocked, 
  onMarkAsRead, 
  previousContent,
  unitIndex,
  contentIndex 
}) => {
  const [isRead, setIsRead] = useState(document.isRead || false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [showContent, setShowContent] = useState(!isLocked);
  const [userInfo, setUserInfo] = useState(null);
  const [securityEnabled, setSecurityEnabled] = useState(false);
  const watermarkRef = useRef(null);

  // Fetch user information for watermark
  useEffect(() => {
    const fetchUserInfo = async () => {
      try {
        const userProfile = await getUserProfile(token);
        console.log('📋 User Profile Data:', userProfile); // Debug log
        
        setUserInfo({
          name: userProfile.name || userProfile.firstName || 'STUDENT',
          regNo: userProfile.regNo || 
                 userProfile.registrationNumber || 
                 userProfile.studentId || 
                 userProfile.rollNumber ||
                 userProfile._id || 
                 `REG${Date.now().toString().slice(-6)}`,
          email: userProfile.email || ''
        });
      } catch (error) {
        console.error('Failed to fetch user info:', error);
        // Enhanced fallback with multiple sources
        const fallbackUser = {
          name: localStorage.getItem('userName') || 
                localStorage.getItem('name') || 
                sessionStorage.getItem('userName') || 
                'STUDENT',
          regNo: localStorage.getItem('userRegNo') || 
                 localStorage.getItem('registrationNumber') ||
                 localStorage.getItem('studentId') ||
                 localStorage.getItem('userId') || 
                 sessionStorage.getItem('regNo') ||
                 `REG${Date.now().toString().slice(-6)}`,
          email: localStorage.getItem('userEmail') || 
                 localStorage.getItem('email') || ''
        };
        console.log('📋 Using Fallback User Info:', fallbackUser); // Debug log
        setUserInfo(fallbackUser);
      }
    };

    if (token) {
      fetchUserInfo();
    }
  }, [token]);

  // Initialize security measures
  useEffect(() => {
    if (showContent && userInfo) {
      preventScreenshot();
      watermarkRef.current = createWatermark(userInfo);
      setSecurityEnabled(true);

      // Cleanup on unmount
      return () => {
        if (watermarkRef.current) {
          document.body.removeChild(watermarkRef.current);
        }
        // Re-enable text selection
        document.body.style.userSelect = '';
        document.body.style.webkitUserSelect = '';
        document.body.style.mozUserSelect = '';
        document.body.style.msUserSelect = '';
      };
    }
  }, [showContent, userInfo]);

  // Check if document is locked based on previous content completion
  const checkLockStatus = () => {
    // If this is the first content (no previous content), it's never locked
    if (!previousContent) return false;
    
    console.log('🔒 Checking lock status for document:', {
      documentTitle: document.title,
      previousContent: {
        title: previousContent.title,
        type: previousContent.type,
        isCompleted: previousContent.isCompleted,
        watched: previousContent.watched,
        isRead: previousContent.isRead
      }
    });
    
    // If previous content is a video, check if it's completed (80%+ watched OR explicitly completed)
    if (previousContent.type === 'video') {
      const videoCompleted = previousContent.isCompleted || previousContent.watched || (previousContent.progress >= 80);
      console.log('🎥 Previous video completion check:', { videoCompleted });
      return !videoCompleted;
    }
    
    // If previous content is a document, check if it's read
    if (previousContent.type === 'document') {
      const documentRead = previousContent.isRead || previousContent.isCompleted;
      console.log('📖 Previous document read check:', { documentRead });
      return !documentRead;
    }
    
    // Default to locked if we can't determine the previous content type
    console.log('❓ Unknown previous content type, defaulting to locked');
    return true;
  };

  const actuallyLocked = isLocked || checkLockStatus();

  const handleViewDocument = () => {
    if (actuallyLocked) {
      return;
    }
    setIsDialogOpen(true);
  };

  const handleMarkAsRead = async () => {
    if (isLoading) return;
    
    console.log('🔄 Starting mark as read process for document:', document.title);
    
    setIsLoading(true);
    try {
      // Use the new markDocumentAsRead API that updates both progress systems
      await markDocumentAsRead(document._id, courseId, unitId || unitIndex, token);
      
      setIsRead(true);
      
      // Notify parent component
      if (onMarkAsRead) {
        onMarkAsRead(document._id, unitIndex, contentIndex);
      }
      
      console.log(`✅ Document marked as read successfully: ${document.title}`);
    } catch (error) {
      console.error('❌ Error marking document as read:', error);
      // You could add a user notification here
    } finally {
      setIsLoading(false);
    }
  };

  const handleCloseDialog = () => {
    setIsDialogOpen(false);
  };

  const getFileExtension = (url) => {
    if (!url) return 'pdf';
    const extension = url.split('.').pop()?.toLowerCase();
    return ['pdf', 'doc', 'docx'].includes(extension) ? extension : 'pdf';
  };

  const getDocumentIcon = () => {
    const extension = getFileExtension(document.documentUrl);
    switch (extension) {
      case 'doc':
      case 'docx':
        return '📄';
      case 'pdf':
      default:
        return '📕';
    }
  };

  const formatDocumentUrl = (url) => {
    if (!url) return '';
    
    // If it's already a Google Docs viewer URL, return as is
    if (url.includes('docs.google.com/viewer')) {
      return url;
    }
    
    // For PDF files, use Google Docs viewer to prevent download
    const extension = getFileExtension(url);
    if (extension === 'pdf') {
      return `https://docs.google.com/viewer?url=${encodeURIComponent(url)}&embedded=true`;
    }
    
    // For other document types, return the direct URL
    return url;
  };

  const getPreviousContentMessage = () => {
    if (!previousContent) return '';
    
    if (previousContent.type === 'video') {
      return `Please complete the previous video: "${previousContent.title}"`;
    }
    
    if (previousContent.type === 'document') {
      return `Please read the previous document: "${previousContent.title}"`;
    }
    
    return 'Please complete the previous content to unlock this document';
  };

  return (
    <>
      <Card 
        sx={{ 
          mb: 3,
          opacity: actuallyLocked ? 0.6 : 1,
          border: isRead ? '2px solid #4caf50' : '1px solid #ddd',
          cursor: actuallyLocked ? 'not-allowed' : 'pointer',
          transition: 'all 0.3s ease',
          '&:hover': {
            transform: actuallyLocked ? 'none' : 'translateY(-2px)',
            boxShadow: actuallyLocked ? 'none' : '0 4px 20px rgba(0,0,0,0.1)'
          }
        }}
        onClick={actuallyLocked ? undefined : handleViewDocument}
      >
        <CardContent>
          <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
            <Box sx={{ fontSize: '2rem', mr: 2 }}>
              {getDocumentIcon()}
            </Box>
            
            <Box sx={{ flex: 1 }}>
              <Typography variant="h6" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                {document.title}
                
                {actuallyLocked && (
                  <Lock color="action" fontSize="small" />
                )}
                
                {isRead && (
                  <CheckCircle color="success" fontSize="small" />
                )}
              </Typography>
              
              <Typography variant="body2" color="text.secondary">
                {getFileExtension(document.documentUrl).toUpperCase()} Document
              </Typography>
            </Box>
            
            <Box>
              {isRead && (
                <Chip 
                  label="Read" 
                  color="success" 
                  size="small"
                  icon={<CheckCircle />}
                />
              )}
              
              {actuallyLocked && (
                <Chip 
                  label="Locked" 
                  color="default" 
                  size="small"
                  icon={<Lock />}
                />
              )}
            </Box>
          </Box>
          
          {document.description && (
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              {document.description}
            </Typography>
          )}
          
          {actuallyLocked && (
            <Alert severity="info" sx={{ mt: 2 }}>
              <Typography variant="body2">
                {getPreviousContentMessage()}
              </Typography>
            </Alert>
          )}
          
          {!actuallyLocked && (
            <Box sx={{ display: 'flex', gap: 2, mt: 2 }}>
              <Button
                variant="contained"
                startIcon={showContent ? <Visibility /> : <VisibilityOff />}
                onClick={handleViewDocument}
                disabled={actuallyLocked}
              >
                View Document
              </Button>
              
              {!isRead && (
                <Button
                  variant="outlined"
                  color="success"
                  startIcon={<CheckCircle />}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleMarkAsRead();
                  }}
                  disabled={isLoading || actuallyLocked}
                >
                  {isLoading ? 'Marking as Read...' : 'Mark as Read'}
                </Button>
              )}
            </Box>
          )}
        </CardContent>
      </Card>

      {/* Document Viewer Dialog */}
      <Dialog
        open={isDialogOpen}
        onClose={handleCloseDialog}
        maxWidth={false}
        fullScreen={true}
        PaperProps={{
          sx: { 
            height: '100vh',
            width: '100vw',
            margin: 0,
            maxHeight: 'none',
            backgroundColor: '#000'
          }
        }}
      >
        <DialogTitle sx={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center',
          backgroundColor: '#1a1a1a',
          color: 'white',
          padding: '16px 24px',
          borderBottom: '2px solid #e74c3c'
        }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Description />
            <Typography variant="h6">{document.title}</Typography>
          </Box>
          
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            {!isRead && (
              <Button
                variant="contained"
                color="success"
                startIcon={<CheckCircle />}
                onClick={handleMarkAsRead}
                disabled={isLoading}
                size="small"
              >
                {isLoading ? 'Marking...' : 'Mark as Read'}
              </Button>
            )}
            
            <IconButton 
              onClick={handleCloseDialog}
              sx={{ 
                color: 'white',
                backgroundColor: '#e74c3c',
                '&:hover': { backgroundColor: '#c0392b' },
                marginLeft: 2
              }}
            >
              <Close />
            </IconButton>
          </Box>
        </DialogTitle>
        
        <DialogContent sx={{ 
          p: 0, 
          height: 'calc(100vh - 80px)', 
          position: 'relative',
          backgroundColor: '#000'
        }}>
          {document.documentUrl ? (
            <Box sx={{ 
              position: 'relative',
              width: '100%', 
              height: '100%',
              overflow: 'hidden',
              backgroundColor: '#f5f5f5'
            }}>
              {/* Security Notice */}
              <Alert 
                severity="warning" 
                icon={<Security />}
                sx={{ 
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  zIndex: 1000,
                  backgroundColor: 'rgba(231, 76, 60, 0.95)',
                  color: 'white',
                  borderRadius: 0,
                  '& .MuiAlert-icon': { color: 'white' },
                  '& .MuiAlert-message': { 
                    fontSize: '16px', 
                    fontWeight: 'bold',
                    width: '100%'
                  }
                }}
              >
                🔒 PROTECTED CONTENT - Screenshots, downloads, and printing are disabled
              </Alert>

              {/* Secured PDF Viewer */}
              <iframe
                src={`${formatDocumentUrl(document.documentUrl)}#toolbar=0&navpanes=0&scrollbar=1&view=FitH&zoom=100`}
                style={{
                  width: '100%',
                  height: 'calc(100vh - 130px)',
                  border: 'none',
                  marginTop: '50px', // Space for security notice
                  userSelect: 'none',
                  webkitUserSelect: 'none',
                  backgroundColor: '#fff'
                }}
                title={document.title}
                sandbox="allow-same-origin allow-scripts"
                onContextMenu={(e) => e.preventDefault()}
                onLoad={(e) => {
                  // Additional security measures for iframe
                  try {
                    const iframeDoc = e.target.contentDocument;
                    if (iframeDoc) {
                      // Disable right-click in iframe
                      iframeDoc.addEventListener('contextmenu', (e) => e.preventDefault());
                      
                      // Disable keyboard shortcuts in iframe
                      iframeDoc.addEventListener('keydown', (e) => {
                        if (
                          e.key === 'F12' ||
                          e.key === 'PrintScreen' ||
                          (e.ctrlKey && e.shiftKey && (e.key === 'I' || e.key === 'J')) ||
                          (e.ctrlKey && (e.key === 'u' || e.key === 'U' || e.key === 's' || e.key === 'S' || e.key === 'p' || e.key === 'P'))
                        ) {
                          e.preventDefault();
                          return false;
                        }
                      });
                    }
                  } catch (error) {
                    // Cross-origin restrictions may prevent access
                    console.log('Cross-origin iframe security applied');
                  }
                }}
              />

              {/* Overlay watermark */}
              {userInfo && (
                <Box sx={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: '100%',
                  pointerEvents: 'none',
                  backgroundImage: `url("data:image/svg+xml,${encodeURIComponent(`
                    <svg xmlns='http://www.w3.org/2000/svg' width='350' height='250' viewBox='0 0 350 250'>
                      <defs>
                        <pattern id='watermark' x='0' y='0' width='350' height='250' patternUnits='userSpaceOnUse'>
                          <text x='175' y='100' font-family='Arial, sans-serif' font-size='16' font-weight='bold' 
                                fill='rgba(255,0,0,0.2)' text-anchor='middle' transform='rotate(-45 175 100)'>
                            ${(userInfo.name || 'STUDENT').toUpperCase()}
                          </text>
                          <text x='175' y='125' font-family='Arial, sans-serif' font-size='14' font-weight='bold' 
                                fill='rgba(255,0,0,0.2)' text-anchor='middle' transform='rotate(-45 175 125)'>
                            REG: ${userInfo.regNo || 'UNKNOWN'}
                          </text>
                          <text x='175' y='150' font-family='Arial, sans-serif' font-size='12' font-weight='normal' 
                                fill='rgba(255,0,0,0.15)' text-anchor='middle' transform='rotate(-45 175 150)'>
                            ${new Date().toLocaleDateString('en-IN')}
                          </text>
                        </pattern>
                      </defs>
                      <rect width='100%' height='100%' fill='url(#watermark)'/>
                    </svg>
                  `)}")`,
                  backgroundRepeat: 'repeat',
                  zIndex: 998
                }}>
                </Box>
              )}
            </Box>
          ) : (
            <Box sx={{ p: 3, textAlign: 'center' }}>
              <Alert severity="error">
                Document URL not available
              </Alert>
            </Box>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};

export default DocumentViewer;