import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Box,
  IconButton,
  Typography,
  CircularProgress,
  Button,
  useMediaQuery,
  useTheme
} from '@mui/material';
import {
  ChevronLeft,
  ChevronRight,
  Fullscreen,
  Close,
  ZoomIn,
  ZoomOut,
  CheckCircle
} from '@mui/icons-material';
import axiosConfig from '../../utils/axiosConfig';

// PDF.js v3.11.174 - stable version with working CDN
const PDFJS_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174';

const FlipbookViewer = ({
  documentUrl,
  documentId,
  documentTitle,
  onToggleFullscreen,
  onClose,
  onMarkAsRead,
  studentName: propStudentName = 'Student',
  registrationNumber: propRegistrationNumber = 'SGT-LMS',
  isRead: initialIsRead = false,
  courseId,
  unitId
}) => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const isTablet = useMediaQuery(theme.breakpoints.between('sm', 'md'));
  
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [loading, setLoading] = useState(true);
  const [documentSignedUrl, setDocumentSignedUrl] = useState(null);
  const [error, setError] = useState(null);
  const [isFlipping, setIsFlipping] = useState(false);
  const [flipDirection, setFlipDirection] = useState(null);
  const [flipProgress, setFlipProgress] = useState(0); // 0 to 100 for animation
  const [pdfDoc, setPdfDoc] = useState(null);
  const [scale, setScale] = useState(1.0);
  const [documentType, setDocumentType] = useState('pdf'); // 'pdf' or 'ppt'
  const [pageReady, setPageReady] = useState(false);
  const [isMarkedAsRead, setIsMarkedAsRead] = useState(initialIsRead);
  const [isMarkingAsRead, setIsMarkingAsRead] = useState(false);
  
  // User profile state for watermark - fetch from API like SecureDocumentViewer
  const [userProfile, setUserProfile] = useState({ 
    name: propStudentName, 
    registrationNumber: propRegistrationNumber 
  });
  
  const containerRef = useRef(null);
  const canvasRef = useRef(null);
  const pageContentRef = useRef(null);
  const pdfjsLibRef = useRef(null);
  const renderingRef = useRef(false);
  const flipAnimationRef = useRef(null);

  // Fetch user profile for watermark - SAME AS SecureDocumentViewer
  useEffect(() => {
    const fetchUserProfile = async () => {
      try {
        const token = localStorage.getItem('token');
        if (token) {
          const response = await axiosConfig.get('/api/auth/profile');
          const profile = response.data;
          console.log('📋 FlipbookViewer: API profile response:', profile);
          setUserProfile({
            name: profile.name || profile.firstName || 'Student User',
            registrationNumber: profile.regNo || profile.registrationNumber || profile.studentId || 'SGT-LMS'
          });
        }
      } catch (error) {
        console.log('⚠️ FlipbookViewer: Using fallback user profile', error.message);
        // Fallback to localStorage
        const fallbackUser = localStorage.getItem('userName') || 'Student User';
        const fallbackReg = localStorage.getItem('userRegNo') || 'SGT-LMS';
        setUserProfile({
          name: fallbackUser,
          registrationNumber: fallbackReg
        });
      }
    };

    fetchUserProfile();
  }, []);

  // Detect document type from URL
  const getDocumentType = useCallback((url) => {
    if (!url) return 'pdf';
    const lowerUrl = url.toLowerCase();
    
    // Check for PowerPoint files
    if (lowerUrl.includes('.ppt') || lowerUrl.includes('.pptx') || lowerUrl.includes('presentation')) {
      return 'ppt';
    }
    
    // Check for Word documents
    if (lowerUrl.includes('.doc') || lowerUrl.includes('.docx')) {
      return 'doc';
    }
    
    // Check for Excel files
    if (lowerUrl.includes('.xls') || lowerUrl.includes('.xlsx') || lowerUrl.includes('spreadsheet')) {
      return 'excel';
    }
    
    // Check for text files
    if (lowerUrl.includes('.txt')) {
      return 'txt';
    }
    
    // Check for PDF files
    if (lowerUrl.includes('.pdf')) {
      return 'pdf';
    }
    
    // Default to 'other' for unknown types - will use Google Docs viewer
    return 'other';
  }, []);

  // Load PDF.js library dynamically
  useEffect(() => {
    const loadPdfJs = async () => {
      if (window.pdfjsLib) {
        pdfjsLibRef.current = window.pdfjsLib;
        return;
      }

      try {
        const script = document.createElement('script');
        script.src = `${PDFJS_CDN}/pdf.min.js`;
        script.async = true;
        
        script.onload = () => {
          if (window.pdfjsLib) {
            window.pdfjsLib.GlobalWorkerOptions.workerSrc = `${PDFJS_CDN}/pdf.worker.min.js`;
            pdfjsLibRef.current = window.pdfjsLib;
            console.log('✅ PDF.js loaded successfully');
          }
        };
        
        script.onerror = () => {
          console.error('❌ Failed to load PDF.js');
        };
        
        document.head.appendChild(script);
      } catch (err) {
        console.error('❌ Error loading PDF.js:', err);
      }
    };

    loadPdfJs();
  }, []);

  // Fetch signed URL for the document
  useEffect(() => {
    const fetchSignedUrl = async () => {
      console.log('🔄 FlipbookViewer: Fetching secure document URL', { documentId, documentUrl });
      
      if (!documentId && !documentUrl) {
        setError('Document not available');
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError(null);
        
        if (documentId) {
          const response = await axiosConfig.get(`/api/reading-materials/${documentId}/signed-url`);
          
          if (response.data?.signedUrl) {
            console.log('✅ FlipbookViewer: Received secure document URL');
            
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
            
            // For secure proxy, detect type from original file info in response
            if (isSecureProxy && response.data.contentType) {
              const contentType = response.data.contentType.toLowerCase();
              if (contentType.includes('pdf')) {
                setDocumentType('pdf');
              } else if (contentType.includes('presentation') || contentType.includes('ppt')) {
                setDocumentType('ppt');
              } else if (contentType.includes('word') || contentType.includes('doc')) {
                setDocumentType('doc');
              } else if (contentType.includes('sheet') || contentType.includes('excel') || contentType.includes('xls')) {
                setDocumentType('excel');
              } else {
                setDocumentType('other');
              }
            } else {
              setDocumentType(getDocumentType(url));
            }
          } else {
            throw new Error('No signed URL received');
          }
        } else if (documentUrl) {
          setDocumentSignedUrl(documentUrl);
          setDocumentType(getDocumentType(documentUrl));
        }
      } catch (error) {
        console.error('❌ FlipbookViewer: Error fetching signed URL:', error);
        
        if (documentUrl) {
          setDocumentSignedUrl(documentUrl);
          setDocumentType(getDocumentType(documentUrl));
        } else {
          setError('Failed to load document. Please try again.');
          setLoading(false);
        }
      }
    };

    fetchSignedUrl();
  }, [documentId, documentUrl, getDocumentType]);

  // Load PDF when URL is ready
  useEffect(() => {
    const loadPdf = async () => {
      if (!documentSignedUrl) {
        return;
      }
      
      // For non-PDF document types, just set loading to false
      if (documentType !== 'pdf') {
        setLoading(false);
        setTotalPages(1);
        return;
      }

      // Wait for PDF.js to load
      const waitForPdfJs = () => {
        return new Promise((resolve) => {
          const check = () => {
            if (pdfjsLibRef.current || window.pdfjsLib) {
              pdfjsLibRef.current = pdfjsLibRef.current || window.pdfjsLib;
              resolve(true);
            } else {
              setTimeout(check, 100);
            }
          };
          check();
          setTimeout(() => resolve(false), 10000);
        });
      };

      const ready = await waitForPdfJs();
      if (!ready) {
        setError('PDF viewer failed to load');
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        console.log('📄 Loading PDF document...');
        
        const loadingTask = pdfjsLibRef.current.getDocument({
          url: documentSignedUrl,
          cMapUrl: `${PDFJS_CDN}/cmaps/`,
          cMapPacked: true,
        });
        
        const pdf = await loadingTask.promise;
        console.log(`✅ PDF loaded with ${pdf.numPages} pages`);
        
        setPdfDoc(pdf);
        setTotalPages(pdf.numPages);
        setLoading(false);
      } catch (err) {
        console.error('❌ Error loading PDF:', err);
        setError('Failed to load PDF document.');
        setLoading(false);
      }
    };

    loadPdf();
  }, [documentSignedUrl, documentType]);

  // Draw watermarks on canvas - matching fullscreen mode style
  const drawWatermarks = useCallback((ctx, width, height) => {
    ctx.save();
    
    // Multi-line watermark text (same as fullscreen mode)
    const lines = [userProfile.name, userProfile.registrationNumber, 'SGT LMS'];
    const lineHeight = 24;
    
    // Watermark settings matching fullscreen mode
    ctx.font = 'bold 16px Arial';
    ctx.fillStyle = 'rgba(100, 100, 100, 0.15)'; // More visible like fullscreen
    ctx.textAlign = 'center';
    
    // Grid spacing matching fullscreen mode
    const spacingX = 220;
    const spacingY = 180;
    
    // Rotate for diagonal watermark pattern
    ctx.rotate(-20 * Math.PI / 180);
    
    // Calculate extended bounds for rotated grid
    const diagonal = Math.sqrt(width * width + height * height);
    const startX = -diagonal / 2;
    const startY = -diagonal / 2;
    const endX = width + diagonal / 2;
    const endY = height + diagonal / 2;
    
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
  }, [userProfile.name, userProfile.registrationNumber]);

  // Render PDF page
  const renderPage = useCallback(async (pageNum) => {
    if (!pdfDoc || !canvasRef.current || renderingRef.current) {
      return;
    }

    renderingRef.current = true;
    setPageReady(false);

    try {
      const page = await pdfDoc.getPage(pageNum);
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      
      // Calculate scale to fit container
      const containerWidth = pageContentRef.current?.clientWidth || 800;
      const containerHeight = pageContentRef.current?.clientHeight || 600;
      
      const viewport = page.getViewport({ scale: 1 });
      const scaleX = (containerWidth - 40) / viewport.width;
      const scaleY = (containerHeight - 40) / viewport.height;
      const fitScale = Math.min(scaleX, scaleY, 2) * scale;
      
      const scaledViewport = page.getViewport({ scale: fitScale });
      
      canvas.width = scaledViewport.width;
      canvas.height = scaledViewport.height;

      // Clear canvas
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      await page.render({
        canvasContext: ctx,
        viewport: scaledViewport
      }).promise;
      
      // Draw watermarks
      drawWatermarks(ctx, canvas.width, canvas.height);
      
      setPageReady(true);
      console.log(`✅ Page ${pageNum} rendered`);
    } catch (err) {
      console.error('❌ Error rendering page:', err);
      setPageReady(true); // Still set ready to not block UI
    } finally {
      renderingRef.current = false;
    }
  }, [pdfDoc, scale, drawWatermarks]);

  // Render page when currentPage or pdfDoc changes
  useEffect(() => {
    if (pdfDoc && currentPage > 0 && documentType === 'pdf') {
      renderPage(currentPage);
    }
  }, [pdfDoc, currentPage, documentType, renderPage]);

  // Re-render when scale changes
  useEffect(() => {
    if (pdfDoc && currentPage > 0 && documentType === 'pdf') {
      renderPage(currentPage);
    }
  }, [scale]);

  // NOTE: Auto-mark as read removed - user must click "Mark as Read" button manually

  // Handle page navigation with realistic flip animation
  const goToPage = useCallback((direction) => {
    if (isFlipping || renderingRef.current) return;
    // Only allow page navigation for PDFs
    if (documentType !== 'pdf') return;
    
    const newPage = direction === 'next' ? currentPage + 1 : currentPage - 1;
    
    if (newPage < 1 || newPage > totalPages) return;

    setIsFlipping(true);
    setFlipDirection(direction);
    setFlipProgress(0);

    // Animate flip progress from 0 to 100
    let progress = 0;
    const duration = 1000; // ms - slower for more realistic feel
    const startTime = Date.now();
    
    const animate = () => {
      const elapsed = Date.now() - startTime;
      progress = Math.min((elapsed / duration) * 100, 100);
      
      // Easing function for natural feel
      const eased = 1 - Math.pow(1 - progress / 100, 3);
      setFlipProgress(eased * 100);
      
      if (progress < 100) {
        flipAnimationRef.current = requestAnimationFrame(animate);
      } else {
        setCurrentPage(newPage);
        setTimeout(() => {
          setIsFlipping(false);
          setFlipDirection(null);
          setFlipProgress(0);
        }, 50);
      }
    };
    
    flipAnimationRef.current = requestAnimationFrame(animate);
  }, [currentPage, totalPages, isFlipping, documentType]);

  // Cleanup animation on unmount
  useEffect(() => {
    return () => {
      if (flipAnimationRef.current) {
        cancelAnimationFrame(flipAnimationRef.current);
      }
    };
  }, []);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Only allow keyboard navigation for PDFs
      if (documentType !== 'pdf') return;
      
      if (e.key === 'ArrowRight' || e.key === ' ') {
        e.preventDefault();
        goToPage('next');
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        goToPage('prev');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [goToPage, documentType]);

  // Zoom controls
  const handleZoomIn = () => {
    if (scale < 2.5) setScale(prev => Math.min(prev + 0.25, 2.5));
  };
  
  const handleZoomOut = () => {
    if (scale > 0.5) setScale(prev => Math.max(prev - 0.25, 0.5));
  };

  // Get viewer URL for PPT (using Microsoft Office viewer)
  const getPptViewerUrl = useCallback(() => {
    if (!documentSignedUrl) return '';
    return `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(documentSignedUrl)}`;
  }, [documentSignedUrl]);

  // Get viewer URL for Word/Excel documents (using Google Docs viewer)
  const getGoogleDocsViewerUrl = useCallback(() => {
    if (!documentSignedUrl) return '';
    return `https://docs.google.com/viewer?url=${encodeURIComponent(documentSignedUrl)}&embedded=true#toolbar=0&navpanes=0&scrollbar=1&view=FitH`;
  }, [documentSignedUrl]);

  // Get the appropriate viewer URL based on document type
  const getViewerUrl = useCallback(() => {
    if (!documentSignedUrl) return '';
    
    // Use Office Online viewer for PPT, Google Docs for DOC/Excel - same as teacher preview
    // Pass the secure-view URL directly to the external viewer (they will download and display it)
    if (documentType === 'ppt') {
      return `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(documentSignedUrl)}`;
    } else if (documentType === 'doc' || documentType === 'excel') {
      return `https://docs.google.com/viewer?url=${encodeURIComponent(documentSignedUrl)}&embedded=true`;
    } else {
      // For other types, return the URL directly
      return documentSignedUrl;
    }
  }, [documentSignedUrl, documentType]);

  // Helper function to get document type label
  const getDocumentTypeLabel = () => {
    switch (documentType) {
      case 'ppt':
        return isMobile ? 'PPT' : 'Presentation';
      case 'doc':
        return isMobile ? 'DOC' : 'Word Document';
      case 'excel':
        return isMobile ? 'XLS' : 'Excel Spreadsheet';
      case 'txt':
        return isMobile ? 'TXT' : 'Text File';
      case 'other':
        return isMobile ? 'DOC' : 'Document';
      default:
        return 'PDF';
    }
  };

  // Helper function to get document type icon
  const getDocumentTypeIcon = () => {
    switch (documentType) {
      case 'ppt':
        return '📊';
      case 'doc':
        return '📝';
      case 'excel':
        return '📈';
      case 'txt':
        return '📋';
      default:
        return '📄';
    }
  };

  const canGoBack = currentPage > 1 && documentType === 'pdf';
  const canGoForward = currentPage < totalPages && documentType === 'pdf';
  
  // Check if document type uses iframe viewer
  const usesIframeViewer = documentType === 'ppt' || documentType === 'doc' || documentType === 'excel' || documentType === 'txt' || documentType === 'other';

  return (
    <Box
      ref={containerRef}
      sx={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        bgcolor: '#f5f5f5',
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        overflow: 'hidden',
        userSelect: 'none',
        borderRadius: 2
      }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {/* Top bar - Mobile Responsive */}
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          px: { xs: 1, sm: 2 },
          py: { xs: 0.5, sm: 0.75 },
          bgcolor: '#2c3e50',
          color: 'white',
          minHeight: { xs: 40, sm: 44, md: 48 },
          flexShrink: 0,
          boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
          flexWrap: { xs: 'wrap', sm: 'nowrap' },
          gap: { xs: 0.5, sm: 1, md: 1.5 }
        }}
      >
        <Typography 
          variant="body2" 
          sx={{ 
            fontWeight: 500, 
            display: 'flex', 
            alignItems: 'center', 
            gap: 0.5,
            fontSize: { xs: '0.75rem', sm: '0.8rem', md: '0.9rem' },
            maxWidth: { xs: '45%', sm: '50%', md: 'auto' },
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap'
          }}
        >
          📖 {documentTitle}
        </Typography>
        <Box sx={{ 
          display: 'flex', 
          alignItems: 'center', 
          gap: { xs: 0.5, sm: 1 },
          flexWrap: 'nowrap'
        }}>
          {documentType === 'pdf' && (
            <>
              {/* Show zoom controls on tablet and desktop */}
              <Box sx={{ display: { xs: 'none', sm: 'flex' }, alignItems: 'center', gap: { sm: 0.5, md: 1 } }}>
                <IconButton onClick={handleZoomOut} size="small" sx={{ color: 'white', p: { xs: 0.5, sm: 1 } }} disabled={scale <= 0.5}>
                  <ZoomOut fontSize="small" />
                </IconButton>
                <Typography variant="body2" sx={{ fontSize: '0.75rem', minWidth: 35, textAlign: 'center' }}>
                  {Math.round(scale * 100)}%
                </Typography>
                <IconButton onClick={handleZoomIn} size="small" sx={{ color: 'white', p: { xs: 0.5, sm: 1 } }} disabled={scale >= 2.5}>
                  <ZoomIn fontSize="small" />
                </IconButton>
              </Box>
              <Box sx={{ 
                bgcolor: 'rgba(255,255,255,0.2)', 
                px: { xs: 1, sm: 1.5 }, 
                py: 0.5, 
                borderRadius: 2, 
                ml: { xs: 0, sm: 1 } 
              }}>
                <Typography variant="body2" sx={{ fontSize: { xs: '0.7rem', sm: '0.85rem' } }}>
                  {isMobile ? `${currentPage}/${totalPages}` : `Page ${currentPage} / ${totalPages}`}
                </Typography>
              </Box>
            </>
          )}
          {documentType === 'ppt' && (
            <Box sx={{ 
              bgcolor: 'rgba(255,255,255,0.2)', 
              px: { xs: 1, sm: 1.5 }, 
              py: 0.5, 
              borderRadius: 2 
            }}>
              <Typography variant="body2" sx={{ fontSize: { xs: '0.7rem', sm: '0.85rem' } }}>
                📊 {isMobile ? 'PPT' : 'Presentation'}
              </Typography>
            </Box>
          )}
          {/* Document type badge for Word, Excel, and other documents */}
          {(documentType === 'doc' || documentType === 'excel' || documentType === 'other') && (
            <Box sx={{ 
              bgcolor: 'rgba(255,255,255,0.2)', 
              px: { xs: 1, sm: 1.5 }, 
              py: 0.5, 
              borderRadius: 2 
            }}>
              <Typography variant="body2" sx={{ fontSize: { xs: '0.7rem', sm: '0.85rem' } }}>
                {getDocumentTypeIcon()} {getDocumentTypeLabel()}
              </Typography>
            </Box>
          )}
          {onToggleFullscreen && (
            <IconButton 
              onClick={onToggleFullscreen} 
              size="small"
              sx={{ 
                color: 'white', 
                p: { xs: 0.5, sm: 1 },
                '&:hover': { bgcolor: 'rgba(255,255,255,0.1)' } 
              }}
            >
              <Fullscreen fontSize={isMobile ? "small" : "medium"} />
            </IconButton>
          )}
          {onClose && (
            <IconButton 
              onClick={onClose} 
              size="small"
              sx={{ 
                color: 'white', 
                p: { xs: 0.5, sm: 1 },
                '&:hover': { bgcolor: 'rgba(255,255,255,0.1)' } 
              }}
            >
              <Close fontSize={isMobile ? "small" : "medium"} />
            </IconButton>
          )}
        </Box>
      </Box>

      {/* Main content area */}
      <Box
        sx={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          position: 'relative',
          overflow: 'hidden',
          background: '#ffffff'
        }}
      >
        {loading ? (
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
            <CircularProgress sx={{ color: 'white' }} size={50} />
            <Typography color="white">Loading document...</Typography>
          </Box>
        ) : error ? (
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, p: 3 }}>
            <Typography color="error" variant="h6">⚠️ Error</Typography>
            <Typography color="white" textAlign="center">{error}</Typography>
          </Box>
        ) : (
          <>
            {/* Left Arrow - only for PDF - Mobile Responsive */}
            {documentType === 'pdf' && (
              <Box
                onClick={() => goToPage('prev')}
                sx={{
                  position: 'absolute',
                  left: { xs: 2, sm: 6, md: 12 },
                  top: '50%',
                  transform: 'translateY(-50%)',
                  cursor: canGoBack ? 'pointer' : 'default',
                  opacity: canGoBack ? 1 : 0.3,
                  zIndex: 10,
                  transition: 'all 0.3s ease',
                  '&:hover': canGoBack ? { transform: 'translateY(-50%) scale(1.1)' } : {},
                  // Make touch target larger on mobile/tablet
                  '&:active': { transform: 'translateY(-50%) scale(0.95)' }
                }}
              >
                <Box
                  sx={{
                    width: { xs: 32, sm: 40, md: 48 },
                    height: { xs: 56, sm: 70, md: 90 },
                    bgcolor: 'rgba(255,255,255,0.95)',
                    borderRadius: '6px 0 0 6px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxShadow: '-4px 0 20px rgba(0,0,0,0.4)',
                  }}
                >
                  <ChevronLeft sx={{ fontSize: { xs: 24, sm: 30, md: 40 }, color: canGoBack ? '#2c3e50' : '#bbb' }} />
                </Box>
              </Box>
            )}

            {/* Book/Document Container - Mobile/Tablet Responsive */}
            <Box
              sx={{
                perspective: { xs: '1500px', sm: '2000px', md: '2500px' },
                perspectiveOrigin: 'center center',
                width: documentType === 'pdf' 
                  ? { xs: 'calc(100% - 70px)', sm: 'calc(100% - 100px)', md: 'calc(100% - 140px)' }
                  : { xs: 'calc(100% - 16px)', sm: 'calc(100% - 30px)', md: 'calc(100% - 40px)' },
                height: { xs: 'calc(100% - 10px)', sm: 'calc(100% - 15px)', md: 'calc(100% - 20px)' },
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                mx: 'auto'
              }}
            >
              {/* Book wrapper for 3D effect */}
              <Box
                sx={{
                  position: 'relative',
                  width: '100%',
                  height: '100%',
                  maxWidth: { xs: '100%', sm: '700px', md: '900px', lg: '1100px' },
                  transformStyle: 'preserve-3d',
                }}
              >
                {/* Dynamic shadow that moves with page flip */}
                {isFlipping && (
                  <Box
                    sx={{
                      position: 'absolute',
                      top: '5%',
                      left: flipDirection === 'next' ? `${30 + flipProgress * 0.4}%` : `${70 - flipProgress * 0.4}%`,
                      width: `${20 + flipProgress * 0.3}%`,
                      height: '90%',
                      background: `linear-gradient(${flipDirection === 'next' ? '90deg' : '270deg'}, 
                        rgba(0,0,0,${0.3 - flipProgress * 0.002}) 0%, 
                        rgba(0,0,0,0) 100%)`,
                      borderRadius: '50%',
                      filter: 'blur(20px)',
                      zIndex: 5,
                      pointerEvents: 'none',
                      transition: 'none',
                    }}
                  />
                )}

                {/* Page with flip animation */}
                <Box
                  sx={{
                    position: 'relative',
                    transformStyle: 'preserve-3d',
                    transformOrigin: flipDirection === 'next' ? 'left center' : 'right center',
                    transform: isFlipping
                      ? flipDirection === 'next'
                        ? `rotateY(${-flipProgress * 1.8}deg) translateZ(${Math.sin(flipProgress * Math.PI / 100) * 30}px)`
                        : `rotateY(${flipProgress * 1.8}deg) translateZ(${Math.sin(flipProgress * Math.PI / 100) * 30}px)`
                      : 'rotateY(0deg)',
                    boxShadow: isFlipping 
                      ? `
                        ${flipDirection === 'next' ? '' : '-'}${10 + flipProgress * 0.3}px ${5 + flipProgress * 0.1}px ${30 + flipProgress * 0.5}px rgba(0,0,0,${0.3 + flipProgress * 0.003}),
                        ${flipDirection === 'next' ? '' : '-'}${5 + flipProgress * 0.2}px 0 ${15 + flipProgress * 0.2}px rgba(0,0,0,0.2),
                        inset ${flipDirection === 'next' ? '-' : ''}${flipProgress * 0.5}px 0 ${flipProgress * 0.8}px rgba(0,0,0,${flipProgress * 0.002})
                      `
                      : '0 15px 40px rgba(0,0,0,0.4), 0 5px 15px rgba(0,0,0,0.2)',
                    borderRadius: { xs: '0 4px 4px 0', sm: '0 8px 8px 0' },
                    overflow: 'hidden',
                    bgcolor: 'white',
                    width: '100%',
                    height: '100%',
                    display: 'flex',
                    backfaceVisibility: 'hidden',
                  }}
                >
                  {/* Book spine effect - Hide on mobile for cleaner look */}
                  <Box
                    sx={{
                      width: { xs: '8px', sm: '14px' },
                      minWidth: { xs: '8px', sm: '14px' },
                      height: '100%',
                      display: { xs: 'none', sm: 'block' },
                      background: 'linear-gradient(to right, #5D3A1A 0%, #6B3E26 15%, #8B4513 30%, #A0522D 50%, #8B4513 70%, #6B3E26 85%, #5D3A1A 100%)',
                      boxShadow: `
                        inset -4px 0 8px rgba(0,0,0,0.5),
                        inset 2px 0 4px rgba(255,255,255,0.1),
                        4px 0 8px rgba(0,0,0,0.3)
                      `,
                    }}
                  />

                  {/* Page content area */}
                  <Box
                    ref={pageContentRef}
                    sx={{
                      flex: 1,
                      height: '100%',
                      position: 'relative',
                      overflow: 'auto',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      bgcolor: '#fefefe',
                      // Enable touch scrolling on mobile
                      WebkitOverflowScrolling: 'touch',
                      // Page curl shadow effect during flip
                      '&::before': isFlipping ? {
                        content: '""',
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        background: flipDirection === 'next' 
                          ? `linear-gradient(to right, rgba(0,0,0,${flipProgress * 0.003}) 0%, transparent 30%)`
                          : `linear-gradient(to left, rgba(0,0,0,${flipProgress * 0.003}) 0%, transparent 30%)`,
                        pointerEvents: 'none',
                        zIndex: 10,
                      } : {},
                    }}
                  >
                  {/* PDF Canvas */}
                  {documentType === 'pdf' && (
                    <canvas
                      ref={canvasRef}
                      style={{
                        maxWidth: '100%',
                        maxHeight: '100%',
                        opacity: isFlipping ? 0.7 : 1,
                        transition: 'opacity 0.3s ease',
                      }}
                    />
                  )}

                  {/* Document iFrame for PPT, Word, Excel, and other documents */}
                  {usesIframeViewer && documentSignedUrl && (
                    <Box sx={{ width: '100%', height: '100%', position: 'relative' }}>
                      <iframe
                        src={getViewerUrl()}
                        style={{
                          width: '100%',
                          height: '100%',
                          border: 'none',
                        }}
                        title={documentTitle}
                        allowFullScreen
                        allow="fullscreen"
                        onLoad={() => {
                          console.log(`✅ ${documentType.toUpperCase()} document loaded in iframe`);
                        }}
                        onError={() => {
                          console.error(`❌ Failed to load ${documentType.toUpperCase()} document in iframe`);
                        }}
                      />
                      {/* Watermark overlay for all iframe documents */}
                      <Box
                        sx={{
                          position: 'absolute',
                          top: 0,
                          left: 0,
                          right: 0,
                          bottom: 0,
                          pointerEvents: 'none',
                          zIndex: 5,
                          overflow: 'hidden'
                        }}
                      >
                        {[...Array(10)].map((_, row) => (
                          [...Array(8)].map((_, col) => (
                            <Box
                              key={`${row}-${col}`}
                              sx={{
                                position: 'absolute',
                                left: `${col * 180 + 40}px`,
                                top: `${row * 140 + 30}px`,
                                transform: 'rotate(-20deg)',
                                userSelect: 'none',
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                gap: '2px'
                              }}
                            >
                              <Typography sx={{ fontSize: '14px', fontWeight: 'bold', color: 'rgba(100,100,100,0.15)', whiteSpace: 'nowrap' }}>
                                {userProfile.name}
                              </Typography>
                              <Typography sx={{ fontSize: '14px', fontWeight: 'bold', color: 'rgba(100,100,100,0.15)', whiteSpace: 'nowrap' }}>
                                {userProfile.registrationNumber}
                              </Typography>
                              <Typography sx={{ fontSize: '14px', fontWeight: 'bold', color: 'rgba(100,100,100,0.15)', whiteSpace: 'nowrap' }}>
                                SGT LMS
                              </Typography>
                            </Box>
                          ))
                        ))}
                      </Box>
                    </Box>
                  )}
                </Box>

                {/* Page edge effects - stacked pages behind */}
                <Box
                  sx={{
                    position: 'absolute',
                    right: -2,
                    top: 3,
                    width: '100%',
                    height: 'calc(100% - 6px)',
                    bgcolor: '#f8f8f8',
                    borderRadius: '0 8px 8px 0',
                    zIndex: -1,
                    boxShadow: 'inset 0 0 3px rgba(0,0,0,0.1)',
                  }}
                />
                <Box
                  sx={{
                    position: 'absolute',
                    right: -4,
                    top: 6,
                    width: '100%',
                    height: 'calc(100% - 12px)',
                    bgcolor: '#f0f0f0',
                    borderRadius: '0 8px 8px 0',
                    zIndex: -2,
                    boxShadow: 'inset 0 0 2px rgba(0,0,0,0.08)',
                  }}
                />
                <Box
                  sx={{
                    position: 'absolute',
                    right: -6,
                    top: 9,
                    width: '100%',
                    height: 'calc(100% - 18px)',
                    bgcolor: '#e8e8e8',
                    borderRadius: '0 8px 8px 0',
                    zIndex: -3,
                  }}
                />
                <Box
                  sx={{
                    position: 'absolute',
                    right: -8,
                    top: 12,
                    width: '100%',
                    height: 'calc(100% - 24px)',
                    bgcolor: '#e0e0e0',
                    borderRadius: '0 8px 8px 0',
                    zIndex: -4,
                  }}
                />
              </Box>
              </Box>
            </Box>

            {/* Right Arrow - only for PDF - Mobile Responsive */}
            {documentType === 'pdf' && (
              <Box
                onClick={() => goToPage('next')}
                sx={{
                  position: 'absolute',
                  right: { xs: 2, sm: 8 },
                  top: '50%',
                  transform: 'translateY(-50%)',
                  cursor: canGoForward ? 'pointer' : 'default',
                  opacity: canGoForward ? 1 : 0.3,
                  zIndex: 10,
                  transition: 'all 0.3s ease',
                  '&:hover': canGoForward ? { transform: 'translateY(-50%) scale(1.1)' } : {},
                  '&:active': { transform: 'translateY(-50%) scale(0.95)' }
                }}
              >
                <Box
                  sx={{
                    width: { xs: 32, sm: 40, md: 48 },
                    height: { xs: 56, sm: 70, md: 90 },
                    bgcolor: 'rgba(255,255,255,0.95)',
                    borderRadius: '0 6px 6px 0',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxShadow: '4px 0 20px rgba(0,0,0,0.4)',
                  }}
                >
                  <ChevronRight sx={{ fontSize: { xs: 24, sm: 30, md: 40 }, color: canGoForward ? '#2c3e50' : '#bbb' }} />
                </Box>
              </Box>
            )}
          </>
        )}
      </Box>

      {/* Bottom bar with Mark as Read button - Mobile/Tablet Responsive */}
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          px: { xs: 1, sm: 1.5, md: 2 },
          py: { xs: 0.75, sm: 0.75, md: 1 },
          bgcolor: '#2c3e50',
          minHeight: { xs: 44, sm: 48, md: 52 },
          flexShrink: 0,
          flexWrap: { xs: 'wrap', sm: 'nowrap' },
          gap: { xs: 0.5, sm: 1, md: 1.5 }
        }}
      >
        {/* Hide security text on mobile, show on tablet+ */}
        <Typography 
          variant="caption" 
          sx={{ 
            color: 'rgba(255,255,255,0.8)', 
            fontSize: { xs: '0.65rem', sm: '0.7rem', md: '0.75rem' },
            display: { xs: 'none', sm: 'block' },
            flex: { sm: 1 }
          }}
        >
          🛡️ Secure Viewing • {documentType === 'pdf' ? 'Use arrows to navigate' : getDocumentTypeLabel()}
        </Typography>
        
        {/* Mark as Read Button */}
        {!isMarkedAsRead ? (
          <Button
            variant="contained"
            color="success"
            size={(isMobile || isTablet) ? "small" : "medium"}
            startIcon={isMarkingAsRead ? <CircularProgress size={isMobile ? 12 : 16} color="inherit" /> : <CheckCircle fontSize={isMobile ? "small" : "medium"} />}
            disabled={isMarkingAsRead}
            onClick={async () => {
              setIsMarkingAsRead(true);
              try {
                // Call the API to mark as read
                const token = localStorage.getItem('token');
                if (documentId && token) {
                  const response = await axiosConfig.post(`/api/student/document/${documentId}/progress`, {
                    isRead: true,
                    readAt: new Date().toISOString(),
                    readingTime: 1,
                    courseId: courseId,
                    unitId: unitId
                  });
                  console.log('✅ Document marked as read:', response.data);
                }
                setIsMarkedAsRead(true);
                if (onMarkAsRead) {
                  await onMarkAsRead();
                }
              } catch (error) {
                console.error('❌ Error marking document as read:', error);
              } finally {
                setIsMarkingAsRead(false);
              }
            }}
            sx={{
              fontWeight: 600,
              px: { xs: 1.5, sm: 3 },
              py: { xs: 0.5, sm: 1 },
              borderRadius: 2,
              fontSize: { xs: '0.7rem', sm: '0.875rem' },
              minWidth: { xs: 'auto', sm: 'auto' },
              boxShadow: '0 2px 8px rgba(76, 175, 80, 0.4)',
              '&:hover': {
                boxShadow: '0 4px 12px rgba(76, 175, 80, 0.6)',
                transform: 'translateY(-1px)'
              },
              transition: 'all 0.2s ease',
              order: { xs: 0, sm: 0 },
              mx: { xs: 'auto', sm: 0 }
            }}
          >
            {isMarkingAsRead ? 'Marking...' : (isMobile ? 'Mark Read' : 'Mark as Read')}
          </Button>
        ) : (
          <Box sx={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: 0.5, 
            color: '#4CAF50',
            order: { xs: 0, sm: 0 },
            mx: { xs: 'auto', sm: 0 }
          }}>
            <CheckCircle fontSize={isMobile ? "small" : "medium"} />
            <Typography variant="body2" sx={{ fontWeight: 600, fontSize: { xs: '0.7rem', sm: '0.875rem' } }}>
              ✓ Completed
            </Typography>
          </Box>
        )}
        
        {/* User info - hide on mobile */}
        <Typography 
          variant="caption" 
          sx={{ 
            color: 'rgba(255,255,255,0.8)', 
            fontSize: { xs: '0.65rem', sm: '0.75rem' },
            display: { xs: 'none', sm: 'block' },
            textAlign: 'right',
            flex: { sm: 1 }
          }}
        >
          {userProfile.name} • {userProfile.registrationNumber}
        </Typography>
      </Box>
    </Box>
  );
};

export default FlipbookViewer;
