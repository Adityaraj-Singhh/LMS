import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Box,
  Typography,
  IconButton,
  CircularProgress,
  Alert,
  Paper,
  Button,
  useMediaQuery,
  useTheme
} from '@mui/material';
import {
  Close as CloseIcon,
  Fullscreen,
  FullscreenExit
} from '@mui/icons-material';
import axiosConfig from '../../utils/axiosConfig';
import { markDocumentAsRead } from '../../api/studentVideoApi';

const SecureDocumentViewer = ({ 
  material,
  open = true,
  documentUrl,
  documentTitle,
  currentDocument,
  onClose, 
  onProgress,
  onMarkAsRead,
  isVisible = true,
  courseId,
  unitId,
  isRead: initialIsRead = false,
  isFullscreenMode = false,
  isInlineMode = false,
  onToggleFullscreen
}) => {
    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
    const isTablet = useMediaQuery(theme.breakpoints.between('sm', 'md'));
    
    // Use the passed props with fallbacks to material prop
    const documentData = material || currentDocument || {};
    const docUrl = documentUrl || documentData.documentUrl;
    const docTitle = documentTitle || documentData.title || 'Secure Document';
    const docId = documentData._id;    console.log('🚀 SecureDocumentViewer component initialized - v2.0');
  console.log('🔍 SecureDocumentViewer props:', { 
    material, 
    currentDocument, 
    documentUrl, 
    documentTitle, 
    open,
    docId,
    docUrl,
    docTitle,
    isInlineMode,
    isFullscreenMode
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [documentSignedUrl, setDocumentSignedUrl] = useState(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [userProfile, setUserProfile] = useState({ name: 'Student User', registrationNumber: 'SGT-LMS' });
  const [securityActive, setSecurityActive] = useState(true);
  const [readingProgress, setReadingProgress] = useState(0);
  const [isDocumentRead, setIsDocumentRead] = useState(initialIsRead);
  const [readingStartTime, setReadingStartTime] = useState(null);
  
  const containerRef = useRef(null);
  const iframeRef = useRef(null);
  const watermarkRef = useRef(null);
  const securityListenersRef = useRef([]);
  const devToolsIntervalRef = useRef(null);
  const progressIntervalRef = useRef(null);

  // Enhanced security measures
  useEffect(() => {
    const initSecurityProtections = () => {
      const listeners = [];

      // Comprehensive keyboard blocking
      const keyHandler = (e) => {
        const blockedKeys = [
          'PrintScreen', 'F12', 'F11', 'Insert', 'Delete',
          { ctrl: true, key: 'p' },      // Print
          { ctrl: true, key: 's' },      // Save
          { ctrl: true, key: 'a' },      // Select all
          { ctrl: true, key: 'c' },      // Copy
          { ctrl: true, key: 'v' },      // Paste
          { ctrl: true, key: 'x' },      // Cut
          { ctrl: true, key: 'z' },      // Undo
          { ctrl: true, key: 'y' },      // Redo
          { ctrl: true, shift: true, key: 'I' }, // DevTools
          { ctrl: true, shift: true, key: 'J' }, // DevTools
          { ctrl: true, shift: true, key: 'K' }, // DevTools
          { ctrl: true, shift: true, key: 'C' }, // DevTools
          { alt: true, key: 'Tab' },     // Alt+Tab
          { key: 'F5' },                 // Refresh
          { ctrl: true, key: 'r' },      // Refresh
          { ctrl: true, key: 'u' },      // View Source
        ];

        for (const blocked of blockedKeys) {
          if (typeof blocked === 'string') {
            if (e.key === blocked) {
              e.preventDefault();
              e.stopPropagation();
              return false;
            }
          } else {
            const ctrlMatch = blocked.ctrl ? e.ctrlKey : !e.ctrlKey || !blocked.ctrl;
            const shiftMatch = blocked.shift ? e.shiftKey : !e.shiftKey || !blocked.shift;
            const altMatch = blocked.alt ? e.altKey : !e.altKey || !blocked.alt;
            
            if (ctrlMatch && shiftMatch && altMatch && e.key === blocked.key) {
              e.preventDefault();
              e.stopPropagation();
              return false;
            }
          }
        }
      };

      // Prevent context menu, drag, selection
      const preventHandler = (e) => {
        e.preventDefault();
        e.stopPropagation();
        return false;
      };

      // Mobile gesture restrictions
      const touchHandler = (e) => {
        if (e.touches.length > 1) {
          e.preventDefault();
          return false;
        }
      };

      // Window focus/blur detection for security
      const focusHandler = () => setSecurityActive(true);
      const blurHandler = () => {
        console.warn('🚨 Potential screenshot attempt detected - page became hidden');
        setSecurityActive(false);
      };

      // DevTools detection (enhanced)
      const devToolsDetection = () => {
        const threshold = 160;
        const widthThreshold = 160;
        
        if ((window.outerHeight - window.innerHeight > threshold) || 
            (window.outerWidth - window.innerWidth > widthThreshold)) {
          console.warn('🔒 Developer tools detected - hiding content');
          setSecurityActive(false);
        } else {
          setSecurityActive(true);
        }
      };

      // Add all event listeners
      const events = [
        [document, 'keydown', keyHandler, true],
        [document, 'contextmenu', preventHandler, true],
        [document, 'dragstart', preventHandler, true],
        [document, 'selectstart', preventHandler, true],
        [document, 'copy', preventHandler, true],
        [document, 'cut', preventHandler, true],
        [document, 'paste', preventHandler, true],
        [document, 'touchstart', touchHandler, { passive: false }],
        [document, 'touchmove', touchHandler, { passive: false }],
        [window, 'focus', focusHandler],
        [window, 'blur', blurHandler]
      ];

      events.forEach(([target, event, handler, options]) => {
        target.addEventListener(event, handler, options);
        listeners.push(() => target.removeEventListener(event, handler, options));
      });

      // DevTools interval detection
      devToolsIntervalRef.current = setInterval(devToolsDetection, 2000);
      listeners.push(() => clearInterval(devToolsIntervalRef.current));

      // Print detection using CSS
      const printCSS = document.createElement('style');
      printCSS.textContent = '@media print { body * { display: none !important; } }';
      document.head.appendChild(printCSS);
      listeners.push(() => document.head.removeChild(printCSS));

      securityListenersRef.current = listeners;
    };

    initSecurityProtections();

    return () => {
      if (securityListenersRef.current) {
        securityListenersRef.current.forEach(cleanup => {
          try {
            cleanup();
          } catch (err) {
            console.error('Security cleanup error:', err);
          }
        });
      }
    };
  }, []);

  // Fetch user profile for watermark
  useEffect(() => {
    const fetchUserProfile = async () => {
      try {
        const token = localStorage.getItem('token');
        if (token) {
          const response = await axiosConfig.get('/api/auth/profile');
          const profile = response.data;
          setUserProfile({
            name: profile.name || profile.firstName || 'Student User',
            registrationNumber: profile.regNo || profile.registrationNumber || profile.studentId || 'SGT-LMS',
            email: profile.email || 'student@sgt.edu'
          });
        }
      } catch (error) {
        console.log('Using fallback user profile');
        const fallbackUser = localStorage.getItem('userName') || 'Student User';
        const fallbackReg = localStorage.getItem('userRegNo') || 'SGT-LMS';
        setUserProfile({
          name: fallbackUser,
          registrationNumber: fallbackReg,
          email: 'student@sgt.edu'
        });
      }
    };

    fetchUserProfile();
  }, []);

  // Watermark drawing function - matching fullscreen style
  const drawWatermark = useCallback(() => {
    if (!watermarkRef.current || !userProfile.name) return;

    const canvas = watermarkRef.current;
    const ctx = canvas.getContext('2d');
    
    // Set canvas size to container
    const rect = containerRef.current?.getBoundingClientRect();
    if (rect) {
      canvas.width = rect.width;
      canvas.height = rect.height;
    }

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Multi-line watermark text
    const lines = [userProfile.name, userProfile.registrationNumber, 'SGT LMS'];
    const lineHeight = 24;
    
    // Enhanced watermark settings - more visible like fullscreen mode
    ctx.save();
    ctx.font = 'bold 16px Arial';
    ctx.fillStyle = 'rgba(100, 100, 100, 0.15)'; // More visible
    ctx.textAlign = 'center';

    // Grid spacing
    const spacingX = 220;
    const spacingY = 180;

    // Rotate for diagonal watermark
    ctx.rotate(-20 * Math.PI / 180);

    // Calculate extended bounds for rotated grid
    const diagonal = Math.sqrt(canvas.width * canvas.width + canvas.height * canvas.height);
    const startX = -diagonal / 2;
    const startY = -diagonal / 2;
    const endX = canvas.width + diagonal / 2;
    const endY = canvas.height + diagonal / 2;

    // Draw watermark grid pattern
    for (let x = startX; x < endX; x += spacingX) {
      for (let y = startY; y < endY; y += spacingY) {
        ctx.save();
        ctx.translate(x, y);
        
        // Draw each line of the watermark
        lines.forEach((line, index) => {
          ctx.fillText(line, 0, index * lineHeight);
        });
        
        ctx.restore();
      }
    }

    ctx.restore();
  }, [userProfile]);

  // Update watermark when component resizes or user profile changes
  useEffect(() => {
    if (userProfile.name && watermarkRef.current) {
      drawWatermark();
    }
  }, [userProfile, drawWatermark]);

  // Redraw watermark on window resize
  useEffect(() => {
    const handleResize = () => {
      if (userProfile.name) {
        setTimeout(drawWatermark, 100);
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [drawWatermark, userProfile]);

  // Security status update effect
  useEffect(() => {
    if (!securityActive) {
      console.warn('🚨 SECURITY ALERT: Content protection activated');
    } else {
      console.log('🔒 Security monitoring active');
    }
  }, [securityActive]);

  // Reading session tracking (progress tracking only - NO auto-complete)
  // Document will only be marked as read when user clicks "Mark as Read" button
  useEffect(() => {
    if (documentSignedUrl && open && !readingStartTime) {
      setReadingStartTime(new Date());
      console.log('📖 Reading session started - user must click "Mark as Read" to complete');
    }

    return () => {
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
      }
    };
  }, [documentSignedUrl, open, readingStartTime]);

  // Manual mark as read function with backend integration
  const handleMarkAsRead = async () => {
    if (isDocumentRead) return;
    
    console.log('🔄 Starting mark as read process for document:', docId);
    
    try {
      setIsDocumentRead(true);
      setReadingProgress(100);
      
      // Get token from localStorage
      const token = localStorage.getItem('token');
      if (!token) {
        console.error('❌ No authentication token found');
        return;
      }
      
      // Call backend API to mark document as read
      if (docId) {
        const readingTime = readingStartTime ? Math.floor((new Date() - readingStartTime) / 1000) : 30;
        
        await markDocumentAsRead(docId, courseId, unitId, token);
        console.log(`✅ Document ${docId} marked as read in backend`);
        
        // Also call the legacy callback if provided
        if (onMarkAsRead) {
          onMarkAsRead();
        }
        
        // Update progress callback
        if (onProgress) {
          onProgress(docId, true);
        }
      } else {
        console.warn('⚠️ No document ID available for backend update');
        
        // Still call callbacks for UI consistency
        if (onMarkAsRead) {
          onMarkAsRead();
        }
        if (onProgress) {
          onProgress(docId || 'unknown', true);
        }
      }
      
      console.log('📚 Document successfully marked as read');
    } catch (error) {
      console.error('❌ Error marking document as read:', error);
      
      // Reset state on error
      setIsDocumentRead(false);
      setReadingProgress(Math.min(readingProgress, 99));
      
      // Still try to call callbacks even if backend fails
      if (onMarkAsRead) {
        onMarkAsRead();
      }
      if (onProgress) {
        onProgress(docId || 'error', true);
      }
    }
  };

  // Fetch signed URL for the document
  useEffect(() => {
    console.log('🔄 SecureDocumentViewer useEffect triggered - v2.0');
    console.log('🔍 useEffect dependencies:', { docId, docUrl, open, isInlineMode });
    
    const fetchSignedUrl = async () => {
      console.log('🔍 fetchSignedUrl called with:', { docId, docUrl, open });
      
      if (!open) {
        console.log('⏸️ Document viewer not open, skipping fetch');
        return;
      }
      
      if (!docId && !docUrl) {
        console.error('❌ No document ID or URL provided');
        setError('Document ID not provided');
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError(null);
        
        // If we have a direct URL, use it immediately
        if (docUrl && !docId) {
          console.log('🔄 Using direct document URL:', docUrl);
          setDocumentSignedUrl(docUrl);
          setLoading(false);
          if (onProgress) {
            setTimeout(() => {
              onProgress(docId || 'direct-url', true);
            }, 1000);
          }
          return;
        }
        
        // Try to get signed URL from API
        if (docId) {
          console.log(`🔗 Fetching secure document URL for: ${docId}`);
          const response = await axiosConfig.get(`/api/reading-materials/${docId}/signed-url`);
          
          if (response.data?.signedUrl) {
            console.log('✅ Received secure document URL');
            
            // Check if it's a secure proxy URL (starts with /api/)
            let url = response.data.signedUrl;
            const isSecureProxy = response.data.isSecureProxy || url.startsWith('/api/');
            
            // For secure proxy, we need to construct the full URL with base
            if (isSecureProxy) {
              // Only prepend origin if URL doesn't already start with http
              if (!url.startsWith('http://') && !url.startsWith('https://')) {
                const baseUrl = window.location.origin;
                url = `${baseUrl}${url}`;
              }
              console.log('🔒 Using secure proxy URL:', url);
            }
            
            setDocumentSignedUrl(url);
            
            // Mark progress when document is loaded
            if (onProgress) {
              setTimeout(() => {
                onProgress(docId, true);
              }, 3000); // Give some time for the document to load
            }
          } else {
            throw new Error('No signed URL received');
          }
        }
      } catch (error) {
        console.error('❌ Error fetching signed URL:', error);
        
        // Fallback: try to use the direct document URL if available
        if (docUrl) {
          console.log('🔄 Falling back to direct document URL');
          setDocumentSignedUrl(docUrl);
          if (onProgress) {
            setTimeout(() => {
              onProgress(docId || 'fallback-url', true);
            }, 1000);
          }
        } else {
          setError('Failed to load document. Please try again.');
        }
      } finally {
        setLoading(false);
      }
    };

    if (open && (docId || docUrl)) {
      fetchSignedUrl();
    }
  }, [docId, docUrl, onProgress, open]);

  // Security measures
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Disable common key combinations
      if (
        (e.ctrlKey && (e.key === 's' || e.key === 'p' || e.key === 'u')) ||
        e.key === 'F12' ||
        (e.ctrlKey && e.shiftKey && e.key === 'I') ||
        (e.ctrlKey && e.shiftKey && e.key === 'J') ||
        (e.ctrlKey && e.key === 'u')
      ) {
        e.preventDefault();
        e.stopPropagation();
        return false;
      }
    };

    const handleContextMenu = (e) => {
      e.preventDefault();
      return false;
    };

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('contextmenu', handleContextMenu);
    
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('contextmenu', handleContextMenu);
    };
  }, []);

  // Create watermark
  useEffect(() => {
    if (!watermarkRef.current) return;

    const canvas = watermarkRef.current;
    const ctx = canvas.getContext('2d');
    
    // Set canvas size
    canvas.width = 300;
    canvas.height = 100;
    
    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Set watermark text
    const watermarkText = `${userProfile.name} - ${userProfile.email}`;
    
    // Configure text style
    ctx.font = '14px Arial';
    ctx.fillStyle = 'rgba(0, 0, 0, 0.1)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    
    // Rotate text
    ctx.save();
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate(-Math.PI / 6); // -30 degrees
    ctx.fillText(watermarkText, 0, 0);
    ctx.restore();
  }, [userProfile]);

  // Fullscreen handlers
  const toggleFullscreen = () => {
    if (onToggleFullscreen) {
      // Use parent component's fullscreen toggle for inline mode
      onToggleFullscreen();
    } else {
      // Legacy fullscreen handling for modal mode
      if (!isFullscreen) {
        if (containerRef.current?.requestFullscreen) {
          containerRef.current.requestFullscreen();
        }
      } else {
        if (document.exitFullscreen) {
          document.exitFullscreen();
        }
      }
    }
  };

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  // Format document URL for Google Docs viewer
  const formatDocumentUrl = (url) => {
    if (!url) return '';
    
    // If it's already a Google Docs or Office viewer URL, return as is
    if (url.includes('docs.google.com/viewer') || url.includes('view.officeapps.live.com')) {
      return url;
    }
    
    // Detect file type from URL
    const urlLower = url.toLowerCase();
    const isPpt = urlLower.includes('.ppt') || urlLower.includes('powerpoint') || urlLower.includes('presentation');
    const isDoc = urlLower.includes('.doc') || urlLower.includes('word');
    const isExcel = urlLower.includes('.xls') || urlLower.includes('excel') || urlLower.includes('sheet');
    const isPdf = urlLower.includes('.pdf');
    
    // For secure proxy URLs, pass them directly to external viewers (same as teacher preview)
    if (url.includes('/api/reading-materials/secure-view/') || 
        url.includes('/api/reading-materials/secure-stream/')) {
      // Use Office Online for PPT
      if (isPpt) {
        return `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(url)}`;
      }
      // Use Google Docs for DOC/Excel
      else if (isDoc || isExcel) {
        return `https://docs.google.com/viewer?url=${encodeURIComponent(url)}&embedded=true`;
      }
      // For PDF, return direct URL (will be displayed in iframe directly)
      else if (isPdf) {
        return url;
      }
      // Default: use Google Docs viewer
      return `https://docs.google.com/viewer?url=${encodeURIComponent(url)}&embedded=true`;
    }
    
    // For other URLs, use Google Docs viewer as default
    return `https://docs.google.com/viewer?url=${encodeURIComponent(url)}&embedded=true#toolbar=0&navpanes=0&scrollbar=1&view=FitH`;
  };

  if (!isVisible || !open) {
    console.log('🚫 SecureDocumentViewer not rendering:', { isVisible, open });
    return null;
  }

  console.log('✅ SecureDocumentViewer rendering with loading:', loading);

  if (loading) {
    return (
      <Box
        sx={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          bgcolor: 'white',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999
        }}
      >
        <CircularProgress size={60} sx={{ mb: 2 }} />
        <Typography variant="h6" color="primary">
          Loading Secure Document...
        </Typography>
        <Typography variant="body2" color="textSecondary" sx={{ mt: 1 }}>
          Preparing document with security protections
        </Typography>
      </Box>
    );
  }

  if (error) {
    return (
      <Box
        sx={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          bgcolor: 'white',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          p: 3
        }}
      >
        <Alert severity="error" sx={{ mb: 2, maxWidth: 400 }}>
          {error}
        </Alert>
        <IconButton 
          onClick={onClose}
          sx={{ 
            position: 'absolute', 
            top: 16, 
            right: 16,
            bgcolor: 'background.paper',
            boxShadow: 1
          }}
        >
          <CloseIcon />
        </IconButton>
      </Box>
    );
  }

  return (
    <Box
      ref={containerRef}
      sx={{
        position: isInlineMode ? 'relative' : 'fixed',
        top: isInlineMode ? 'auto' : 0,
        left: isInlineMode ? 'auto' : 0,
        right: isInlineMode ? 'auto' : 0,
        bottom: isInlineMode ? 'auto' : 0,
        width: isInlineMode ? '100%' : 'auto',
        height: isInlineMode ? '100%' : 'auto',
        bgcolor: 'white',
        zIndex: isInlineMode ? 1 : 9999,
        display: 'flex',
        flexDirection: 'column'
      }}
    >
      {/* Header - only show in fullscreen/modal mode - Mobile/Tablet Responsive */}
      {!isInlineMode && (
        <Paper
          elevation={1}
          sx={{
            p: { xs: 0.75, sm: 1, md: 1.5 },
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            borderRadius: 0,
            minHeight: { xs: 44, sm: 48, md: 56 }
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', flex: 1, minWidth: 0 }}>
            <Typography 
              variant="h6" 
              noWrap 
              sx={{ 
                ml: { xs: 0.5, sm: 1, md: 1.5 },
                fontSize: { xs: '0.875rem', sm: '1rem', md: '1.25rem' },
                maxWidth: { xs: '200px', sm: '350px', md: 'none' },
                overflow: 'hidden',
                textOverflow: 'ellipsis'
              }}
            >
              {docTitle}
            </Typography>
          </Box>
          
          <Box sx={{ display: 'flex', alignItems: 'center', gap: { xs: 0.5, sm: 0.75, md: 1 } }}>
            <IconButton onClick={toggleFullscreen} size={(isMobile || isTablet) ? "small" : "medium"}>
              {isFullscreen ? <FullscreenExit fontSize={(isMobile || isTablet) ? "small" : "medium"} /> : <Fullscreen fontSize={(isMobile || isTablet) ? "small" : "medium"} />}
            </IconButton>
            <IconButton onClick={onClose} size={(isMobile || isTablet) ? "small" : "medium"}>
              <CloseIcon fontSize={(isMobile || isTablet) ? "small" : "medium"} />
            </IconButton>
          </Box>
        </Paper>
      )}

      {/* Document content container */}
      <Box
        sx={{
          flex: 1,
          position: 'relative',
          overflow: 'hidden',
          bgcolor: '#f5f5f5',
          // Enable smooth scrolling on mobile
          WebkitOverflowScrolling: 'touch'
        }}
      >
        {/* Security overlay - blurs content when DevTools detected */}
        {!securityActive && (
          <Box
            sx={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: 'rgba(255, 255, 255, 0.95)',
              backdropFilter: 'blur(20px)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 1000,
              flexDirection: 'column',
              p: { xs: 2, sm: 3, md: 4 }
            }}
          >
            <Typography variant={isMobile ? "h5" : isTablet ? "h5" : "h4"} color="error" gutterBottom>
              🔒 Content Protected
            </Typography>
            <Typography variant="body1" color="textSecondary" textAlign="center">
              This document is protected and cannot be accessed with developer tools open.
              <br />
              Please close developer tools and refresh the page to continue viewing.
            </Typography>
          </Box>
        )}

        {/* Enhanced Watermark Canvas */}
        <canvas
          ref={watermarkRef}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            pointerEvents: 'none',
            zIndex: 999,
            userSelect: 'none'
          }}
        />

        {documentSignedUrl && (
          <>
            {console.log('🎯 Rendering iframe with signed URL:', documentSignedUrl)}
            {/* Document iframe */}
            <iframe
              ref={iframeRef}
              src={formatDocumentUrl(documentSignedUrl)}
              style={{
                width: '100%',
                height: '100%',
                border: 'none',
                display: 'block',
                userSelect: 'none'
              }}
              title={docTitle}
              sandbox="allow-same-origin allow-scripts allow-forms allow-popups"
              onContextMenu={(e) => e.preventDefault()}
              onLoad={() => {
                console.log('📄 Document loaded successfully');
                // Redraw watermark after iframe loads
                setTimeout(drawWatermark, 500);
                // NOTE: Auto-mark as read removed - user must click "Mark as Read" button manually
              }}
              onError={() => {
                console.error('❌ Failed to load document');
                setError('Failed to display document. Please try refreshing.');
              }}
            />
          </>
        )}

        {!documentSignedUrl && !loading && (
          <Box sx={{ 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center', 
            height: '100%', 
            flexDirection: 'column' 
          }}>
            {console.log('❌ No signed URL available, showing error')}
            <Typography variant="h6" color="error">
              Document not available
            </Typography>
            <Typography variant="body2" color="textSecondary">
              {error || 'Failed to load document content'}
            </Typography>
          </Box>
        )}

        {loading && (
          <Box sx={{ 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center', 
            height: '100%', 
            flexDirection: 'column' 
          }}>
            {console.log('⏳ Document loading...')}
            <CircularProgress size={isMobile ? 40 : 50} />
            <Typography variant="body2" sx={{ mt: 2, fontSize: { xs: '0.75rem', sm: '0.875rem' } }}>
              Loading document...
            </Typography>
          </Box>
        )}
      </Box>
      
      {/* Security notice - Mobile Responsive */}
      {!isInlineMode && (
        <Alert 
          severity="info" 
          icon={false}
          sx={{ 
            borderRadius: 0,
            '& .MuiAlert-message': { fontSize: { xs: '0.65rem', sm: '0.8rem' } },
            bgcolor: isDocumentRead ? 'success.50' : 'info.50',
            py: { xs: 0.5, sm: 1 }
          }}
        >
          {isDocumentRead 
            ? (isMobile 
                ? `📚 READ • ${Math.round((new Date() - readingStartTime) / 1000)}s` 
                : `📚 DOCUMENT READ • Reading time: ${Math.round((new Date() - readingStartTime) / 1000)}s • Protected content with light watermarking`)
            : (isMobile 
                ? `🛡️ SECURE VIEW • ${Math.round(readingProgress)}%`
                : `🛡️ SECURE VIEWING • Light watermarking active • DevTools detection • Progress: ${Math.round(readingProgress)}%`)
          }
        </Alert>
      )}
    </Box>
  );
};

export default SecureDocumentViewer;