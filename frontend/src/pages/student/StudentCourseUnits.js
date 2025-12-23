import React, { useState, useEffect } from 'react';
import { 
  Container, 
  Typography, 
  Grid, 
  Card, 
  CardContent, 
  Button, 
  CircularProgress, 
  Box,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Divider,
  Breadcrumbs,
  Link,
  Paper,
  Chip,
  Alert,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  LinearProgress,
  Drawer,
  IconButton,
  AppBar,
  Toolbar,
  Fab,
  useMediaQuery,
  useTheme,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Tooltip
} from '@mui/material';
import { useParams, Link as RouterLink, useNavigate } from 'react-router-dom';
import { getCourseUnits, updateWatchHistory, getSecureVideoUrl } from '../../api/studentVideoApi';
import axiosConfig from '../../utils/axiosConfig';
import { formatDuration, formatVideoUrl } from '../../utils/videoUtils';
import UnitContentViewer from '../../components/student/UnitContentViewer';
import CustomVideoPlayer from '../../components/student/CustomVideoPlayer';
import SecureDocumentViewer from '../../components/student/SecureDocumentViewer';
import FlipbookViewer from '../../components/student/FlipbookViewer';
import StudentProgressValidation from '../../components/student/StudentProgressValidation';
import { getProgressionStatus, getUnitsNeedingReview } from '../../api/unitValidationApi';

// Icons
import PlayCircleOutlineIcon from '@mui/icons-material/PlayCircleOutline';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import LockIcon from '@mui/icons-material/Lock';
import MenuBookIcon from '@mui/icons-material/MenuBook';
import SchoolIcon from '@mui/icons-material/School';
import QuizIcon from '@mui/icons-material/Quiz';
import MenuIcon from '@mui/icons-material/Menu';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import FolderIcon from '@mui/icons-material/Folder';
import DescriptionIcon from '@mui/icons-material/Description';
import CloseIcon from '@mui/icons-material/Close';
import FullscreenIcon from '@mui/icons-material/Fullscreen';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import AssignmentIcon from '@mui/icons-material/Assignment';

// Responsive drawer widths
const drawerWidth = 280;
const tabletDrawerWidth = 260;
const mobileDrawerWidth = 240;
const collapsedSidebarWidth = 72;

const StudentCourseUnits = () => {
  const { courseId } = useParams();
  const navigate = useNavigate();
  const token = localStorage.getItem('token');
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const isTablet = useMediaQuery(theme.breakpoints.between('sm', 'md'));
  const isSmallScreen = useMediaQuery(theme.breakpoints.down('md'));
  
  const [course, setCourse] = useState(null);
  const [units, setUnits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [quizLocks, setQuizLocks] = useState({}); // Track quiz locks by unit ID
  
  // Quiz-related states from old system
  const [unitQuizStatus, setUnitQuizStatus] = useState({});
  const [quizResults, setQuizResults] = useState({});
  const [quizResultsLoading, setQuizResultsLoading] = useState(false);
  const [quizResultsError, setQuizResultsError] = useState(null);
  
  // Progression blocking states for new content validation
  const [progressionStatus, setProgressionStatus] = useState(null);
  const [unitsNeedingReview, setUnitsNeedingReview] = useState([]);
  const [blockingDialogOpen, setBlockingDialogOpen] = useState(false);
  const [blockingInfo, setBlockingInfo] = useState(null);
  
  // Sidebar state
  const [sidebarOpen, setSidebarOpen] = useState(!isMobile);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [selectedUnit, setSelectedUnit] = useState(null);
  const [selectedContent, setSelectedContent] = useState(null);
  const [expandedUnits, setExpandedUnits] = useState({}); // Track which units are expanded in sidebar
  
  // Video and Document player state
  const [currentVideo, setCurrentVideo] = useState(null);
  const [currentDocument, setCurrentDocument] = useState(null);
  const [videoOpen, setVideoOpen] = useState(false);
  const [documentOpen, setDocumentOpen] = useState(false);
  const [documentFullscreen, setDocumentFullscreen] = useState(false);
  const [isUpdatingVideoState, setIsUpdatingVideoState] = useState(false);

  // Get appropriate drawer width based on screen size
  const getDrawerWidth = () => {
    if (isMobile) return mobileDrawerWidth;
    if (isTablet) return tabletDrawerWidth;
    return drawerWidth;
  };
  
  const currentDrawerWidth = getDrawerWidth();

  // Derived layout values ensure the course area adapts smoothly with the global sidebar
  const effectiveSidebarWidth = (!isSmallScreen && sidebarOpen) ? (sidebarCollapsed ? collapsedSidebarWidth : currentDrawerWidth) : 0;
  const showFloatingToggle = !isSmallScreen && !sidebarOpen;

  useEffect(() => {
    setSidebarOpen(!isSmallScreen);
    setSidebarCollapsed(false);
  }, [isSmallScreen]);

  // Check if content is locked based on sequential access
  const isContentLocked = (unit, contentIndex, mixedContent) => {
    // First unit's first content is always unlocked
    const currentUnitIndex = units.findIndex(u => u._id === unit._id);
    if (currentUnitIndex === 0 && contentIndex === 0) {
      return false;
    }
    
    // Check if previous unit quiz is passed (for units after first)
    if (currentUnitIndex > 0) {
      const previousUnit = units[currentUnitIndex - 1];
      // Convert unit ID to string for proper lookup
      const previousUnitId = String(previousUnit._id);
      const previousQuizResult = quizResults[previousUnitId];
      console.log('🔒 Lock check for unit:', unit.title, '| Previous unit:', previousUnit.title, '| Previous unit ID:', previousUnitId, '| Quiz result:', previousQuizResult);
      if (!previousQuizResult || !previousQuizResult.passed) {
        return true; // Lock entire unit if previous quiz not passed
      }
    }
    
    // Within unit: check if previous content is completed
    if (contentIndex > 0) {
      const previousContent = mixedContent[contentIndex - 1];
      let isCompleted = false;
      
      if (previousContent.contentType === 'video') {
        // For videos, require 80% watch progress OR explicit completion flag
        isCompleted = (previousContent.watchProgress && previousContent.watchProgress >= 80) || 
                     previousContent.isCompleted;
      } else if (previousContent.contentType === 'document') {
        // For documents, check all possible completion flags
        isCompleted = previousContent.isRead || 
                     previousContent.isCompleted || 
                     previousContent.completed;
      } else if (previousContent.contentType === 'quiz') {
        // Convert unit ID to string for proper lookup
        const unitId = String(unit._id);
        isCompleted = quizResults[unitId] && quizResults[unitId].passed;
      }
      
      return !isCompleted;
    }
    
    return false;
  };

  // Calculate watch time for videos
  const calculateWatchTime = (duration, currentTime) => {
    if (!duration || duration <= 0) return 0;
    const percentage = Math.min((currentTime / duration) * 100, 100);
    return Math.round(percentage);
  };

  // Check quiz availability for a unit
  const checkQuizAvailability = async (unitId) => {
    try {
      const response = await axiosConfig.get(`/api/student/unit/${unitId}/quiz/availability`);
      return response.data;
    } catch (error) {
      console.error('Error checking quiz availability:', error);
      return { available: false, locked: true, reason: 'Error checking availability' };
    }
  };

  // Generate and take unit quiz
  const generateUnitQuiz = async (unitId) => {
    try {
      console.log('Generating quiz for unit:', unitId);
      
      // First check if quiz is available
      const token = localStorage.getItem('token');
      const availabilityResponse = await axiosConfig.get(`/api/student/unit/${unitId}/quiz/availability`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (!availabilityResponse.data.available) {
        // Show detailed information about why quiz is not available
        console.error('Quiz not available. Details:', availabilityResponse.data);
        alert(`Quiz is not available.\n\nReason: ${availabilityResponse.data.message || 'Unknown'}\n\nDetails:\n- Total Videos: ${availabilityResponse.data.totalVideos || 'N/A'}\n- Watched Videos: ${availabilityResponse.data.watchedVideos || 'N/A'}\n- All Videos Watched: ${availabilityResponse.data.allVideosWatched || 'false'}\n\nCheck console for more details.`);
        return;
      }
      
      // Generate the quiz
      const response = await axiosConfig.post(`/api/student/unit/${unitId}/quiz/generate`, {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (response.data.success) {
        // Navigate to secure quiz page with attempt ID
        const quizUrl = `/student/secure-quiz/${response.data.quizSessionId}`;
        console.log('Navigating to quiz:', quizUrl);
        navigate(quizUrl);
      } else {
        alert('Failed to generate quiz: ' + response.data.message);
      }
    } catch (error) {
      console.error('Error generating quiz:', error);
      alert('Error generating quiz: ' + (error.response?.data?.message || error.message));
    }
  };

  // Get student quiz results
  const getStudentQuizResults = async (courseId, token) => {
    try {
      setQuizResultsLoading(true);
      setQuizResultsError(null);
      
      const response = await axiosConfig.get(`/api/student/quiz-results/${courseId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      console.log('📊 Raw API response:', response.data);
      
      // Handle both old format (success/results) and new format (summary/attempts)
      const attemptsArray = response.data.results || response.data.attempts || [];
      
      console.log('📊 Attempts array:', attemptsArray.length, 'attempts');
      
      if (attemptsArray.length > 0 || response.data.success || response.data.summary) {
        const results = {};
        attemptsArray.forEach(result => {
          // Debug: log the full result structure
          console.log('📊 Full result object:', JSON.stringify(result, null, 2));
          
          // Handle both formats: unitId (old) and unit._id (new)
          // CRITICAL FIX: Properly extract unit ID from various possible formats
          let unitId = null;
          
          // Try direct unitId first (old format)
          if (result.unitId) {
            unitId = typeof result.unitId === 'string' ? result.unitId : String(result.unitId);
          }
          // Try unit object (new format from backend)
          else if (result.unit) {
            if (typeof result.unit === 'string') {
              unitId = result.unit;
            } else if (result.unit._id) {
              // The _id could be a string or an object
              if (typeof result.unit._id === 'string') {
                unitId = result.unit._id;
              } else if (result.unit._id.$oid) {
                // MongoDB extended JSON format
                unitId = result.unit._id.$oid;
              } else {
                // Last resort - try to extract string representation
                unitId = result.unit._id.toString ? result.unit._id.toString() : String(result.unit._id);
              }
            }
          }
          
          const submittedAt = result.submittedAt || result.completedAt;
          
          console.log('📊 Extracted unitId:', unitId, '| passed:', result.passed, '| percentage:', result.percentage);
          
          if (unitId) {
            // Prioritize PASSED attempts, then most recent
            const existingResult = results[unitId];
            const shouldReplace = !existingResult || 
              (result.passed && !existingResult.passed) || // Passed beats not passed
              (!existingResult.passed && !result.passed && new Date(submittedAt) > new Date(existingResult.submittedAt || existingResult.completedAt)); // Most recent if both failed
            
            if (shouldReplace) {
              results[unitId] = {
                ...result,
                unitId: unitId,
                submittedAt: submittedAt
              };
              console.log('📊 Storing result for unit:', unitId, 'passed:', result.passed);
            }
          }
        });
        console.log('📊 Final quiz results:', results);
        console.log('📊 Quiz result keys:', Object.keys(results));
        setQuizResults(results);
        return results;
      } else {
        console.log('📊 No quiz results found');
        setQuizResults({});
        return {};
      }
    } catch (error) {
      console.error('Error fetching quiz results:', error);
      setQuizResultsError('Error loading quiz results');
      return {};
    } finally {
      setQuizResultsLoading(false);
    }
  };

  // Create mixed content array for a unit
  const createMixedContentArray = (unit) => {
    console.log('📋 Creating mixed content for unit:', unit.title);
    console.log('Unit data:', { 
      videos: unit.videos?.length || 0, 
      readingMaterials: unit.readingMaterials?.length || 0, 
      quizPool: unit.quizPool 
    });
    
    const mixedContent = [];
    
    // Add videos
    if (unit.videos && unit.videos.length > 0) {
      console.log('📺 Adding videos:', unit.videos.length);
      unit.videos.forEach((video, index) => {
        mixedContent.push({
          ...video,
          contentType: 'video',
          originalIndex: index,
          videoUrl: video.videoUrl || video.url, // Ensure videoUrl is set
          title: video.title || `Video ${index + 1}`,
          duration: video.duration || 0,
          order: video.order || (index * 10) // Default order for videos
        });
      });
    }
    
    // Add reading materials
    if (unit.readingMaterials && unit.readingMaterials.length > 0) {
      console.log('📚 Adding reading materials:', unit.readingMaterials.length);
      unit.readingMaterials.forEach((material, index) => {
        mixedContent.push({
          ...material,
          contentType: 'document',
          originalIndex: index,
          documentUrl: material.documentUrl || material.url || material.fileUrl, // Multiple possible URL fields
          title: material.title || `Document ${index + 1}`,
          order: material.order || ((unit.videos?.length || 0) * 10 + index * 10) // Order after videos
        });
      });
    }
    
    // Add quiz if unit has one
    if (unit.quizPool || unit.hasQuiz) {
      console.log('🧠 Adding quiz for unit');
      const quizResult = quizResults[unit._id];
      const quizAvailability = unitQuizStatus[unit._id] || {};
      
      mixedContent.push({
        _id: `quiz-${unit._id}`,
        contentType: 'quiz',
        title: 'Unit Quiz',
        unitId: unit._id,
        isCompleted: quizResult && quizResult.passed,
        isPassed: quizResult && quizResult.passed,
        isFailed: quizResult && !quizResult.passed,
        attempts: quizResult ? 1 : 0,
        score: quizResult ? quizResult.percentage : 0,
        order: 999 // Quiz always comes last
      });
    }
    
    console.log('📊 Total mixed content items:', mixedContent.length);
    
    // Sort by arranged order (for content arrangement), then fallback to original order
    const sortedContent = mixedContent.sort((a, b) => {
      const orderA = a.arrangedOrder || a.order || 0;
      const orderB = b.arrangedOrder || b.order || 0;
      return orderA - orderB;
    });
    
    // Add lock status to each content item
    return sortedContent.map((content, index) => ({
      ...content,
      isLocked: isContentLocked(unit, index, sortedContent),
      contentIndex: index,
      watchPercentage: content.contentType === 'video' ? 
        calculateWatchTime(content.duration, content.currentTime || 0) : 0
    }));
  };

  const handleContentSelect = async (unit, content, contentIndex) => {
    console.log('📋 Selecting content:', { unit: unit.title, content: content.title, contentIndex });
    
    // Check if progression is blocked due to new content in previous units
    const currentUnitIndex = units.findIndex(u => u._id === unit._id);
    if (progressionStatus && progressionStatus.isBlocked && currentUnitIndex > 0) {
      // Check if any previous unit has new content that needs review
      const blockedByUnits = unitsNeedingReview.filter(reviewUnit => {
        const reviewUnitIndex = units.findIndex(u => u._id === reviewUnit.unitId);
        return reviewUnitIndex < currentUnitIndex;
      });
      
      if (blockedByUnits.length > 0) {
        const blockingUnit = blockedByUnits[0];
        const newContentItems = [
          ...(blockingUnit.newContent?.videos || []).map(v => ({ type: 'video', title: v.title })),
          ...(blockingUnit.newContent?.documents || []).map(d => ({ type: 'document', title: d.title }))
        ];
        
        setBlockingInfo({
          blockedUnitTitle: unit.title,
          blockingUnitTitle: blockingUnit.unitTitle,
          blockingUnitOrder: blockingUnit.unitOrder,
          newContentCount: newContentItems.length,
          newContentItems: newContentItems.slice(0, 5), // Show first 5 items
          completion: blockingUnit.completion
        });
        setBlockingDialogOpen(true);
        return;
      }
    }
    
    // Check if content is locked (sequential access within unit)
    if (content.isLocked) {
      if (currentUnitIndex > 0) {
        const previousUnit = units[currentUnitIndex - 1];
        alert(`This content is locked. Please complete the quiz for "${previousUnit.title}" first.`);
      } else {
        alert('This content is locked. Please complete the previous content first.');
      }
      return;
    }
    
    setSelectedContent({ ...content, unitId: unit._id, contentIndex });
    setSelectedUnit(unit); // Track which unit's content is being viewed
    
    // Save last viewed content to localStorage for resumption
    const lastViewedKey = `lms_lastViewed_${courseId}`;
    localStorage.setItem(lastViewedKey, JSON.stringify({
      unitId: unit._id,
      contentIndex: contentIndex,
      contentType: content.contentType,
      timestamp: Date.now()
    }));
    
    if (content.contentType === 'video') {
      // Get signed URL for video
      try {
        console.log('🔗 Fetching signed URL for video:', content._id);
        const response = await axiosConfig.get(`/api/videos/${content._id}/signed-url`);
        
        if (response.data.signedUrl) {
          console.log('✅ Received signed URL for video');
          setCurrentVideo({
            ...content,
            unitId: unit._id,
            videoUrl: response.data.signedUrl
          });
        } else {
          console.warn('⚠️ No signed URL received, using original URL');
          setCurrentVideo({
            ...content,
            unitId: unit._id,
            videoUrl: formatVideoUrl(content.videoUrl || content.url)
          });
        }
      } catch (error) {
        // Handle 403 response for blocked content (both unit_blocked and previous_unit_incomplete)
        if (error.response?.status === 403 && 
            (error.response?.data?.reason === 'unit_blocked' || 
             error.response?.data?.reason === 'previous_unit_incomplete' ||
             error.response?.data?.reason === 'previous_unit_needs_review')) {
          const blockData = error.response.data;
          const incompleteDetails = blockData.incompleteDetails || {};
          
          // Build missing items list from incompleteDetails
          const missingItems = [];
          if (incompleteDetails.totalVideos > 0 && !incompleteDetails.allVideosComplete) {
            missingItems.push({ 
              type: 'videos', 
              count: incompleteDetails.totalVideos - (incompleteDetails.videosWatched || 0),
              total: incompleteDetails.totalVideos
            });
          }
          if (incompleteDetails.totalDocuments > 0 && !incompleteDetails.allDocsComplete) {
            missingItems.push({ 
              type: 'documents', 
              count: incompleteDetails.totalDocuments - (incompleteDetails.docsRead || 0),
              total: incompleteDetails.totalDocuments
            });
          }
          if (incompleteDetails.hasQuiz && !incompleteDetails.quizPassed) {
            missingItems.push({ type: 'quiz', count: 1, total: 1 });
          }
          
          setBlockingInfo({
            blockedUnitTitle: unit.title,
            blockingUnitTitle: blockData.blockedByTitle || blockData.blockedBy?.unitTitle || incompleteDetails.unitTitle,
            blockingUnitOrder: blockData.blockedByOrder || blockData.blockedBy?.unitOrder || incompleteDetails.unitOrder,
            blockingUnitId: blockData.blockedBy || incompleteDetails.unitId,
            newContentCount: missingItems.reduce((sum, item) => sum + item.count, 0),
            missingItems: missingItems,
            incompleteDetails: incompleteDetails,
            message: blockData.message,
            reason: blockData.reason
          });
          setBlockingDialogOpen(true);
          return;
        }
        console.error('❌ Error fetching signed URL, using original URL:', error);
        setCurrentVideo({
          ...content,
          unitId: unit._id,
          videoUrl: formatVideoUrl(content.videoUrl || content.url)
        });
      }
      
      setCurrentDocument(null);
      setVideoOpen(true);
      setDocumentOpen(false);
    } else if (content.contentType === 'document') {
      // Enhanced secure document handling with proper ID management
      try {
        console.log('🔒 Initializing secure document viewer for:', content._id);
        console.log('📄 Content details:', { 
          title: content.title, 
          materialId: content._id,
          contentType: content.contentType,
          originalUrl: content.documentUrl || content.url || content.fileUrl 
        });
        
        // Ensure we have a valid material ID
        if (!content._id || !content._id.match(/^[a-fA-F0-9]{24}$/)) {
          throw new Error(`Invalid material ID: ${content._id}`);
        }
        
        // For secure document viewer, we pass the complete content object with proper IDs
        const documentForViewer = {
          ...content,
          unitId: unit._id,
          materialId: content._id, // Ensure materialId is set
          _id: content._id, // Ensure _id is preserved
          documentUrl: content.documentUrl || content.url || content.fileUrl, // Keep original URL as fallback
          title: content.title
        };
        
        console.log('🔒 Secure document viewer initialized with material ID:', content._id);
        console.log('🔒 Document object for viewer:', documentForViewer);
        
        // Set states in correct order - open inline by default
        setCurrentVideo(null);
        setVideoOpen(false);
        setCurrentDocument(documentForViewer);
        setDocumentOpen(true);
        setDocumentFullscreen(false); // Start in inline mode
        
        console.log('📄 Document states set - documentOpen: true, currentDocument:', documentForViewer);
      } catch (error) {
        console.error('❌ Error initializing secure document viewer:', error);
        alert(`Failed to load secure document: ${error.message}`);
        return;
      }
    } else if (content.contentType === 'quiz') {
      // Handle quiz selection
      generateUnitQuiz(unit._id);
      return;
    }
    
    if (isMobile) {
      setSidebarOpen(false);
    }
  };

  // Handle video play
  const handlePlayVideo = async (video) => {
    console.log('🎬 Opening video player for:', video.title);
    
    try {
      // Fetch secure video URL from backend
      const secureData = await getSecureVideoUrl(video._id, token);
      const videoWithSecureUrl = {
        ...video,
        videoUrl: secureData.secureUrl, // Replace S3 URL with proxy URL
        secureUrlExpiry: secureData.expiresIn
      };
      
      setCurrentVideo(videoWithSecureUrl);
      setCurrentDocument(null);
      setVideoOpen(true);
      
      // Record initial video watch event
    } catch (error) {
      console.error('❌ Error fetching secure video URL:', error);
      alert('Failed to load video. Please try again.');
      return;
    }
    
    try {
      if (!token) {
        console.warn('Cannot update watch history: Token is missing');
        return;
      }
      
      updateWatchHistory(video._id, {
        timeSpent: 0.1, // Use 0.1 instead of 0 to pass backend validation
        duration: video.duration
      }, token).catch(err => {
        console.error('Error recording initial video watch:', err);
      });
    } catch (error) {
      console.error('Error in handlePlayVideo:', error);
    }
  };

  // Handle document view
  const handleViewDocument = (document) => {
    console.log('📄 Opening document viewer for:', document.title);
    setCurrentDocument(document);
    setCurrentVideo(null);
    setDocumentOpen(true);
  };

  // Close video player
  const handleCloseVideo = () => {
    setVideoOpen(false);
    setCurrentVideo(null);
  };

  // Close document viewer
  const handleCloseDocument = () => {
    setDocumentOpen(false);
    setCurrentDocument(null);
    setDocumentFullscreen(false);
  };

  // Toggle document fullscreen
  const handleToggleDocumentFullscreen = () => {
    setDocumentFullscreen(prev => !prev);
  };

  // Save progress to localStorage and navigate to next content
  const saveProgressAndNavigateToNext = async (completedContentId, unitId, contentType) => {
    console.log('🚀 saveProgressAndNavigateToNext called:', { completedContentId, unitId, contentType });
    
    try {
      // Wait a bit for the backend to fully commit the changes
      // This prevents race conditions where refresh happens before DB commit
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      // Find the current unit and its content
      const currentUnit = units.find(u => u._id === unitId);
      if (!currentUnit) {
        console.error('Unit not found:', unitId);
        window.location.reload();
        return;
      }

      // Create mixed content array to find next content
      const mixedContent = createMixedContentArray(currentUnit);
      const currentContentIndex = mixedContent.findIndex(c => c._id === completedContentId);
      
      console.log('📍 Current content index:', currentContentIndex, 'Total items:', mixedContent.length);
      
      // Check if there's next content in the same unit
      if (currentContentIndex >= 0 && currentContentIndex < mixedContent.length - 1) {
        const nextContent = mixedContent[currentContentIndex + 1];
        
        // Skip quiz content type - don't auto-navigate to quiz
        if (nextContent.contentType !== 'quiz') {
          console.log('➡️ Navigating to next content:', nextContent.title);
          
          // Save next content to localStorage for auto-navigation after refresh
          const nextContentKey = `lms_nextContent_${courseId}`;
          localStorage.setItem(nextContentKey, JSON.stringify({
            unitId: unitId,
            contentId: nextContent._id,
            contentIndex: currentContentIndex + 1,
            contentType: nextContent.contentType,
            timestamp: Date.now()
          }));
          
          // Refresh the page to ensure fresh data from server
          window.location.reload();
          return;
        }
      }
      
      // Check if we need to move to next unit
      const currentUnitIndex = units.findIndex(u => u._id === unitId);
      if (currentUnitIndex >= 0 && currentUnitIndex < units.length - 1) {
        // Check if all content in current unit is completed (except quiz)
        const allContentCompleted = mixedContent
          .filter(c => c.contentType !== 'quiz')
          .every(c => c.isCompleted || c.watched || c.isRead || c._id === completedContentId);
        
        if (allContentCompleted) {
          console.log('✅ All content in unit completed. Showing quiz or next unit option.');
        }
      }
      
      // Just refresh the page to show updated state
      console.log('🔄 Refreshing page to show updated progress');
      window.location.reload();
      
    } catch (error) {
      console.error('Error in saveProgressAndNavigateToNext:', error);
      window.location.reload();
    }
  };

  // Auto-navigate to saved next content on page load
  useEffect(() => {
    if (!loading && units.length > 0) {
      const nextContentKey = `lms_nextContent_${courseId}`;
      const savedNextContent = localStorage.getItem(nextContentKey);
      
      if (savedNextContent) {
        try {
          const nextContentData = JSON.parse(savedNextContent);
          
          // Check if the saved data is recent (within 30 seconds)
          if (Date.now() - nextContentData.timestamp < 30000) {
            console.log('🔄 Auto-navigating to saved next content:', nextContentData);
            
            // Clear the saved data
            localStorage.removeItem(nextContentKey);
            
            // Find the unit and content
            const targetUnit = units.find(u => u._id === nextContentData.unitId);
            if (targetUnit) {
              const mixedContent = createMixedContentArray(targetUnit);
              const targetContent = mixedContent.find(c => c._id === nextContentData.contentId);
              
              if (targetContent && !targetContent.isLocked) {
                // Expand the unit
                setExpandedUnits(prev => ({ ...prev, [targetUnit._id]: true }));
                
                // Navigate to the content after a short delay
                setTimeout(() => {
                  handleContentSelect(targetUnit, targetContent, nextContentData.contentIndex);
                }, 500);
              }
            }
          } else {
            // Clear old data
            localStorage.removeItem(nextContentKey);
          }
        } catch (error) {
          console.error('Error parsing saved next content:', error);
          localStorage.removeItem(nextContentKey);
        }
      }
    }
  }, [loading, units, courseId]);

  // Toggle unit expansion in sidebar (just expand/collapse, don't load content)
  const handleUnitToggle = (unit) => {
    console.log('📂 Toggling unit:', unit.title);
    setExpandedUnits(prev => ({
      ...prev,
      [unit._id]: !prev[unit._id]
    }));
  };

  // Handle unit selection (legacy - keep for backwards compatibility)
  const handleUnitSelect = (unit) => {
    console.log('📂 Selecting unit:', unit.title);
    // Just expand the unit, don't auto-load content
    setExpandedUnits(prev => ({
      ...prev,
      [unit._id]: true
    }));
  };

  // Fetch quiz locks for all units
  const fetchQuizLocks = async (units) => {
    const locks = {};
    for (const unit of units) {
      if (unit.quizPool) {
        const availability = await checkQuizAvailability(unit._id);
        locks[unit._id] = availability;
      }
    }
    setQuizLocks(locks);
  };
  
  useEffect(() => {
    const fetchCourseAndUnits = async () => {
      try {
        setLoading(true);
        
        // Fetch units for this course
        const unitsResponse = await getCourseUnits(courseId, token);
        
        // Set course data if available from the response
        if (unitsResponse && unitsResponse.length > 0) {
          // Fetch course information from the first unit's course reference
          const firstUnit = unitsResponse[0];
          setCourse({
            _id: firstUnit.course._id,
            title: firstUnit.course.title,
            courseCode: firstUnit.course.courseCode,
            description: firstUnit.course.description
          });
        }
        
        setUnits(unitsResponse);
        
        // Fetch quiz locks for units with quizzes
        await fetchQuizLocks(unitsResponse);
        
        // Fetch quiz results and status
        const quizResults = await getStudentQuizResults(courseId, token);
        
        // Fetch quiz status for each unit
        const quizStatusPromises = unitsResponse.map(async (unit) => {
          try {
            const availability = await checkQuizAvailability(unit._id);
            return {
              unitId: unit._id,
              status: availability
            };
          } catch (error) {
            console.error(`Error fetching quiz status for unit ${unit._id}:`, error);
            return {
              unitId: unit._id,
              status: { available: false, isLocked: true, reason: 'Error loading status' }
            };
          }
        });
        
        const quizStatuses = await Promise.all(quizStatusPromises);
        const statusMap = {};
        quizStatuses.forEach(({ unitId, status }) => {
          statusMap[unitId] = status;
        });
        setUnitQuizStatus(statusMap);
        
        // Fetch progression validation status (new content blocking)
        try {
          const progressStatus = await getProgressionStatus(courseId, token);
          setProgressionStatus(progressStatus);
          
          if (progressStatus && progressStatus.isBlocked) {
            const reviewUnits = await getUnitsNeedingReview(courseId, token);
            setUnitsNeedingReview(reviewUnits.unitsNeedingReview || []);
          }
        } catch (validationError) {
          console.warn('Could not fetch progression validation status:', validationError);
          // Non-critical error, don't block the page load
        }
        
        // Check for last viewed content in localStorage and restore it
        const lastViewedKey = `lms_lastViewed_${courseId}`;
        const lastViewed = localStorage.getItem(lastViewedKey);
        
        if (lastViewed) {
          try {
            const { unitId, contentIndex } = JSON.parse(lastViewed);
            const lastUnit = unitsResponse.find(u => u._id === unitId);
            if (lastUnit) {
              console.log('📖 Resuming last viewed content:', lastUnit.title, 'content index:', contentIndex);
              setExpandedUnits({ [unitId]: true }); // Expand the last viewed unit
              // Don't auto-load content, just expand the unit so user can see where they were
            }
          } catch (e) {
            console.warn('Could not parse last viewed content:', e);
          }
        }
        // Don't auto-select any unit or content - let user choose
        
        setLoading(false);
      } catch (err) {
        console.error('Error fetching course units:', err);
        setError('Failed to load course units. Please try again.');
        setLoading(false);
      }
    };
    
    if (token && courseId) {
      fetchCourseAndUnits();
    }
  }, [token, courseId]);
  
  const handleWatchVideo = (unitId, videoId) => {
    navigate(`/student/course/${courseId}/unit/${unitId}/video/${videoId}`);
  };
  
  const handleContentComplete = (contentId, unitIndex, contentIndex) => {
    console.log(`🎯 Content completed in unit ${unitIndex}, content ${contentIndex}: ${contentId}`);
    // Optionally refresh units data or update state
  };
  
  const handleProgressUpdate = (unitId, progress) => {
    console.log(`📈 Unit progress updated for ${unitId}: ${progress}%`);
    // Update unit progress in state if needed
  };
  
  // Calculate unit progress percentage based on all content types
  const calculateUnitProgress = (unit) => {
    if (!unit.progress) return 0;
    
    const { 
      videosCompleted = 0, 
      totalVideos = 0,
      readingMaterialsCompleted = 0,
      totalReadingMaterials = 0,
      quizzesPassed = 0,
      totalQuizzes = 0
    } = unit.progress;
    
    // Debug logging
    console.log(`📊 Unit "${unit.title}" completion calculation:`, {
      videosCompleted,
      totalVideos,
      readingMaterialsCompleted,
      totalReadingMaterials,
      quizzesPassed,
      totalQuizzes,
      unitQuizPassed: unit.progress.unitQuizPassed
    });
    
    // Total content items
    const totalItems = totalVideos + totalReadingMaterials + totalQuizzes;
    if (totalItems === 0) return 0;
    
    // Total completed items
    const completedItems = videosCompleted + readingMaterialsCompleted + quizzesPassed;
    
    const percentage = Math.round((completedItems / totalItems) * 100);
    console.log(`   ➡️ Result: ${completedItems}/${totalItems} = ${percentage}%`);
    
    return percentage;
  };
  
  // Sidebar component
  const renderSidebar = () => (
    <Box sx={{ height: '100%', overflow: 'auto' }}>
      <Box sx={{ p: 2, borderBottom: '1px solid #e0e0e0' }}>
        <Typography variant="h6" gutterBottom sx={{ fontWeight: 600, mb: 1, fontSize: { xs: '0.9rem', sm: '1rem' } }}>
          {course?.title || 'Course Content'}
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 0, fontSize: { xs: '0.75rem', sm: '0.875rem' } }}>
          {course?.courseCode}
        </Typography>
      </Box>
      
      <List dense sx={{ py: 0 }}>
        {units.map((unit, unitIndex) => {
          const mixedContent = createMixedContentArray(unit);
          const progress = calculateUnitProgress(unit);
          
          return (
            <Box key={unit._id}>
              <ListItem 
                button 
                onClick={() => handleUnitToggle(unit)}
                selected={selectedUnit?._id === unit._id}
                sx={{ 
                  backgroundColor: expandedUnits[unit._id] ? 'action.selected' : 'transparent',
                  '&:hover': { backgroundColor: 'action.hover' },
                  // Better touch targets on mobile
                  py: { xs: 1.5, sm: 1 },
                  minHeight: { xs: 48, sm: 40 }
                }}
              >
                <ListItemIcon sx={{ minWidth: { xs: 36, sm: 40 } }}>
                  <FolderIcon color={expandedUnits[unit._id] ? 'primary' : 'action'} fontSize="small" />
                </ListItemIcon>
                <ListItemText 
                  primary={unit.title}
                  secondary={`${mixedContent.length} items`}
                  primaryTypographyProps={{ fontSize: { xs: '0.85rem', sm: '0.9rem' } }}
                  secondaryTypographyProps={{ fontSize: { xs: '0.7rem', sm: '0.75rem' } }}
                />
                {progress > 0 && (
                  <Chip 
                    size="small" 
                    label={`${progress}%`} 
                    color={progress === 100 ? 'success' : 'primary'}
                    variant="outlined"
                    sx={{ mr: 1, fontSize: { xs: '0.65rem', sm: '0.7rem' }, height: { xs: 20, sm: 24 } }}
                  />
                )}
                {/* Expand/Collapse Arrow */}
                {expandedUnits[unit._id] ? (
                  <ExpandLessIcon color="action" fontSize="small" />
                ) : (
                  <ExpandMoreIcon color="action" fontSize="small" />
                )}
              </ListItem>
              
              {/* Show content items when unit is expanded - Mobile touch friendly */}
              {expandedUnits[unit._id] && mixedContent.length > 0 && (
                <List component="div" disablePadding>
                  {mixedContent.map((content, contentIndex) => (
                    <ListItem
                      key={`${content._id}-${contentIndex}`}
                      button
                      onClick={() => handleContentSelect(unit, content, contentIndex)}
                      selected={selectedContent?.contentIndex === contentIndex}
                      disabled={content.isLocked}
                      sx={{ 
                        pl: { xs: 3, sm: 4 },
                        py: { xs: 1.2, sm: 0.75 },
                        minHeight: { xs: 44, sm: 36 },
                        backgroundColor: selectedContent?.contentIndex === contentIndex ? 'action.selected' : 'transparent',
                        opacity: content.isLocked ? 0.6 : 1
                      }}
                    >
                      <ListItemIcon sx={{ minWidth: { xs: 32, sm: 40 } }}>
                        {content.isLocked ? (
                          <LockIcon color="disabled" fontSize="small" />
                        ) : content.contentType === 'video' ? (
                          <PlayCircleOutlineIcon 
                            color={selectedContent?.contentIndex === contentIndex ? 'primary' : 'action'} 
                            fontSize="small"
                          />
                        ) : content.contentType === 'document' ? (
                          <DescriptionIcon 
                            color={selectedContent?.contentIndex === contentIndex ? 'primary' : 'action'} 
                            fontSize="small"
                          />
                        ) : content.contentType === 'quiz' ? (
                          <QuizIcon 
                            color={content.isPassed ? 'success' : content.isFailed ? 'error' : selectedContent?.contentIndex === contentIndex ? 'primary' : 'action'} 
                            fontSize="small"
                          />
                        ) : (
                          <DescriptionIcon 
                            color={selectedContent?.contentIndex === contentIndex ? 'primary' : 'action'} 
                            fontSize="small"
                          />
                        )}
                      </ListItemIcon>
                      <ListItemText 
                        primary={content.title}
                        secondary={
                          content.isLocked ? 'Locked' :
                          content.contentType === 'video' 
                            ? `${content.duration ? formatDuration(content.duration) : 'Video'}${content.watchPercentage ? ` (${Math.round(content.watchPercentage)}%)` : (content.isCompleted ? ' ✓' : '')}` 
                            : content.contentType === 'document' ?
                            'Document' :
                            content.contentType === 'quiz' ?
                            (content.isPassed ? `Passed (${Math.round(content.score)}%)` : 
                             content.isFailed ? `Failed (${Math.round(content.score)}%)` : 
                             'Quiz') :
                            'Content'
                        }
                        primaryTypographyProps={{ 
                          fontSize: { xs: '0.8rem', sm: '0.875rem' },
                          noWrap: true,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis'
                        }}
                        secondaryTypographyProps={{ fontSize: { xs: '0.65rem', sm: '0.75rem' } }}
                      />
                      {/* Show green checkmark only if content is truly completed (80% for videos, isRead for documents, passed for quiz) */}
                      {(() => {
                        if (content.isLocked) return false;
                        if (content.contentType === 'video') {
                          // Video is completed only if watchProgress >= 80% or explicitly marked as completed
                          return (content.watchProgress && content.watchProgress >= 80) || content.isCompleted;
                        } else if (content.contentType === 'document') {
                          return content.isRead || content.isCompleted;
                        } else if (content.contentType === 'quiz') {
                          return content.isPassed;
                        }
                        return false;
                      })() && (
                        <CheckCircleIcon color="success" sx={{ ml: 0.5 }} fontSize="small" />
                      )}
                    </ListItem>
                  ))}
                </List>
              )}
              
              {/* Quiz section when unit is expanded - Mobile Responsive */}
              {expandedUnits[unit._id] && (
                <Box sx={{ p: { xs: 1, sm: 1.5 }, bgcolor: '#f8f9fa', borderRadius: 1, mx: 1, mb: 1, border: '1px solid #e9ecef' }}>
                  {(() => {
                    // Calculate if all videos are watched
                    const hasCompletedVideos = mixedContent.filter(content => 
                      content.contentType === 'video' && (content.watched || content.isCompleted)
                    ).length;
                    const totalVideos = unit.videos?.length || 0;
                    const allVideosWatched = totalVideos > 0 ? hasCompletedVideos === totalVideos : true;
                    
                    // Calculate if all documents are read
                    const hasCompletedDocuments = mixedContent.filter(content => 
                      content.contentType === 'document' && (content.isRead || content.isCompleted || content.completed)
                    ).length;
                    const totalDocuments = unit.readingMaterials?.length || 0;
                    const allDocumentsRead = totalDocuments > 0 ? hasCompletedDocuments === totalDocuments : true;
                    
                    // All content must be completed (videos AND documents)
                    const allContentCompleted = allVideosWatched && allDocumentsRead;
                    
                    // Get quiz status for this unit
                    const avail = unitQuizStatus[unit._id] || {};
                    const attemptsTaken = typeof avail.attemptsTaken === 'number' ? avail.attemptsTaken : undefined;
                    const remainingAttempts = typeof avail.remainingAttempts === 'number' ? avail.remainingAttempts : undefined;
                    const attemptLimit = typeof avail.attemptLimit === 'number' ? avail.attemptLimit : 3;
                    const isLocked = !!avail.isLocked;
                    const lockInfo = avail.lockInfo;
                    
                    // Get quiz results
                    const quizResult = quizResults[unit._id];
                    const quizPassedFlag = quizResult?.passed;
                    const quizCompletedFlag = quizResult && !quizResult.passed;
                    const attemptToShow = quizResult;
                    
                    return (
                      <Box>
                        {/* Header */}
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                          <QuizIcon color={allContentCompleted ? "primary" : "disabled"} fontSize="small" />
                          <Typography variant="subtitle2" fontWeight="600" sx={{ flexGrow: 1 }}>
                            Unit Quiz
                          </Typography>
                          {/* Status indicators in a more compact layout */}
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexWrap: 'wrap' }}>
                            {attemptToShow ? (
                              <Chip
                                label={`${Math.round(attemptToShow.percentage)}%`}
                                color={attemptToShow.passed ? 'success' : 'error'}
                                size="small"
                                sx={{ fontSize: '0.7rem', height: 20 }}
                              />
                            ) : quizResultsLoading ? (
                              <Typography variant="caption" color="text.secondary">Loading…</Typography>
                            ) : quizResultsError ? (
                              <Typography variant="caption" color="error">Results unavailable</Typography>
                            ) : (
                              <Typography variant="caption" color="text.secondary">
                                No attempt yet
                              </Typography>
                            )}
                          </Box>
                        </Box>

                        {/* Attempts counter as separate line when available */}
                        {typeof attemptsTaken === 'number' && (
                          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                            <Typography variant="caption" color="text.secondary">
                              Attempts: {attemptsTaken}/{attemptLimit}
                            </Typography>
                            {attemptsTaken >= attemptLimit && (
                              <Chip 
                                label="No attempts left" 
                                color="error" 
                                size="small" 
                                variant="outlined"
                                sx={{ fontSize: '0.65rem', height: 18 }}
                              />
                            )}
                          </Box>
                        )}
                        
                        {/* Quiz rules - show defaults if quizPool not available */}
                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', lineHeight: 1.3, mb: 1 }}>
                          • {unit.quizPool?.questionsPerAttempt || 10} questions 
                          • {unit.quizPool?.passingScore || 70}% to pass 
                          {unit.quizPool?.timeLimit && ` • ${unit.quizPool.timeLimit} min`}
                          • Unlocks next unit
                        </Typography>
                        
                        {/* Status-based content */}
                        {!allVideosWatched ? (
                          <Alert severity="info" sx={{ py: 0.5, fontSize: '0.8rem' }}>
                            Complete all videos to unlock ({hasCompletedVideos}/{totalVideos})
                          </Alert>
                        ) : !allDocumentsRead ? (
                          <Alert severity="info" sx={{ py: 0.5, fontSize: '0.8rem' }}>
                            Complete all documents to unlock ({hasCompletedDocuments}/{totalDocuments})
                          </Alert>
                        ) : quizPassedFlag ? (
                          <Alert severity="success" sx={{ py: 0.5, fontSize: '0.8rem' }}>
                            Passed! Next unit unlocked
                          </Alert>
                        ) : isLocked ? (
                          <Alert severity="warning" sx={{ py: 0.5, fontSize: '0.8rem', mb: 1 }}>
                            Quiz locked. Contact administrator.
                          </Alert>
                        ) : quizCompletedFlag ? (
                          <Alert severity="error" sx={{ py: 0.5, fontSize: '0.8rem', mb: 1 }}>
                            Failed. Review content and try again.
                          </Alert>
                        ) : null}
                        
                        {/* Take quiz button */}
                        {allContentCompleted && !quizPassedFlag && !isLocked && (typeof remainingAttempts !== 'number' || remainingAttempts > 0) && (
                          <Button
                            variant="contained"
                            startIcon={<QuizIcon fontSize="small" />}
                            onClick={() => generateUnitQuiz(unit._id)}
                            color="primary"
                            size="small"
                            fullWidth
                            sx={{ mt: 1, fontSize: '0.8rem', py: 0.5 }}
                          >
                            {typeof remainingAttempts === 'number' ? `Take Quiz (${remainingAttempts} left)` : 'Take Unit Quiz'}
                          </Button>
                        )}
                      </Box>
                    );
                  })()}
                </Box>
              )}
              
              <Divider />
            </Box>
          );
        })}
      </List>
    </Box>
  );

  return (
    <Box
      sx={{
        position: 'relative',
        display: 'flex',
        width: '100%',
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #f4f6fb 0%, #eef2ff 100%)'
      }}
    >
      {/* Note: Removed the course-specific AppBar as it conflicts with main site header.
          Using FAB (Floating Action Button) at bottom-left for mobile/tablet navigation instead */}

      {/* Course Sidebar - Enhanced Mobile/Tablet Drawer */}
      {isSmallScreen ? (
        <Drawer
          variant="temporary"
          open={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          ModalProps={{ keepMounted: true }}
          sx={{
            zIndex: 1400, // Higher than the site header
            '& .MuiDrawer-paper': {
              width: { xs: '85vw', sm: '70vw' },
              maxWidth: { xs: '320px', sm: '360px' },
              boxSizing: 'border-box',
              top: 0,
              height: '100%',
              overflowX: 'hidden',
              borderRight: '1px solid rgba(15, 23, 42, 0.08)',
            },
          }}
        >
          <Box sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            p: { xs: 1.5, sm: 2 },
            borderBottom: '1px solid #e0e0e0',
            minHeight: { xs: 56, sm: 64 },
            backgroundColor: 'primary.main',
            color: 'white'
          }}>
            <Typography variant="h6" sx={{ fontWeight: 'bold', fontSize: { xs: '1rem', sm: '1.1rem' } }}>
              Course Content
            </Typography>
            <IconButton onClick={() => setSidebarOpen(false)} size="small" sx={{ color: 'white' }}>
              <CloseIcon />
            </IconButton>
          </Box>
          {renderSidebar()}
        </Drawer>
      ) : (
        sidebarOpen && (
          <Box
            component="aside"
            sx={{
              width: `${effectiveSidebarWidth}px`,
              minWidth: `${effectiveSidebarWidth}px`,
              transition: 'width 0.3s ease',
              borderRight: '1px solid rgba(15, 23, 42, 0.08)',
              backgroundColor: '#ffffff',
              boxShadow: sidebarCollapsed ? 'inset -1px 0 0 rgba(15, 23, 42, 0.08)' : '0 12px 30px rgba(15, 23, 42, 0.08)',
              display: 'flex',
              flexDirection: 'column',
              minHeight: '100vh',
              maxHeight: '100vh',
              position: 'sticky',
              top: 0,
              zIndex: 100,
              overflow: 'hidden'
            }}
          >
            <Box sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: sidebarCollapsed ? 'center' : 'space-between',
              p: 1.5,
              minHeight: 56,
              borderBottom: '1px solid #e0e0e0',
              gap: 1
            }}>
              {!sidebarCollapsed && (
                <Typography variant="h6" sx={{ fontWeight: 'bold', color: '#1976d2', fontSize: '1rem' }}>
                  Course Content
                </Typography>
              )}
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <Tooltip title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}>
                  <IconButton
                    size="small"
                    onClick={() => setSidebarCollapsed(prev => !prev)}
                    sx={{
                      backgroundColor: 'rgba(25, 118, 210, 0.08)',
                      color: 'primary.main',
                      border: '1px solid',
                      borderColor: 'primary.main',
                      '&:hover': {
                        backgroundColor: 'primary.main',
                        color: 'white',
                      }
                    }}
                  >
                    {sidebarCollapsed ? <ChevronRightIcon fontSize="small" /> : <ChevronLeftIcon fontSize="small" />}
                  </IconButton>
                </Tooltip>
                <Tooltip title="Hide course sidebar">
                  <IconButton size="small" onClick={() => setSidebarOpen(false)}>
                    <CloseIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              </Box>
            </Box>
            <Box sx={{ flexGrow: 1, overflow: 'auto' }}>
              {sidebarCollapsed ? (
                <Box sx={{ p: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1, mt: 1 }}>
                  {units.map(unit => (
                    <Tooltip key={unit._id} title={unit.title} placement="right">
                      <IconButton
                        onClick={() => {
                          setSelectedUnit(unit);
                          setSidebarCollapsed(false);
                        }}
                        sx={{
                          width: 48,
                          height: 48,
                          color: selectedUnit?._id === unit._id ? 'primary.main' : 'text.secondary',
                          borderRadius: 1,
                          border: selectedUnit?._id === unit._id ? '1px solid' : 'none',
                          borderColor: 'primary.main',
                          backgroundColor: selectedUnit?._id === unit._id ? 'rgba(25, 118, 210, 0.08)' : 'transparent',
                          '&:hover': {
                            backgroundColor: 'rgba(25, 118, 210, 0.1)'
                          }
                        }}
                      >
                        <SchoolIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  ))}
                </Box>
              ) : (
                renderSidebar()
              )}
            </Box>
          </Box>
        )
      )}

      {/* Floating Sidebar Toggle Button - Desktop */}
      {showFloatingToggle && !isSmallScreen && (
        <IconButton
          onClick={() => {
            setSidebarOpen(true);
            setSidebarCollapsed(false);
          }}
          sx={{
            position: 'absolute',
            left: `${effectiveSidebarWidth + 16}px`,
            top: 24,
            backgroundColor: 'rgba(25, 118, 210, 0.95)',
            color: 'white',
            borderRadius: '50%',
            boxShadow: '0 8px 24px rgba(15, 23, 42, 0.12)',
            transition: 'all 0.2s ease-in-out',
            '&:hover': {
              backgroundColor: 'primary.dark',
              transform: 'translateY(-1px) scale(1.05)',
            },
            width: 48,
            height: 48,
            zIndex: 1200,
          }}
        >
          <MenuIcon fontSize="small" />
        </IconButton>
      )}

      {/* Mobile/Tablet Floating Action Button for Course Sidebar - ALWAYS visible on mobile/tablet */}
      {isSmallScreen && !sidebarOpen && (
        <Fab
          color="primary"
          aria-label="Open course content menu"
          onClick={() => setSidebarOpen(true)}
          size="large"
          sx={{
            position: 'fixed',
            bottom: { xs: 24, sm: 32 },
            left: { xs: 16, sm: 24 },
            zIndex: 99999, // Very high z-index to always be on top
            width: { xs: 60, sm: 68 },
            height: { xs: 60, sm: 68 },
            minWidth: { xs: 60, sm: 68 },
            minHeight: { xs: 60, sm: 68 },
            boxShadow: '0 8px 32px rgba(25, 118, 210, 0.6), 0 4px 12px rgba(0,0,0,0.3)',
            backgroundColor: '#1976d2',
            border: '3px solid white',
            '&:hover': {
              transform: 'scale(1.1)',
              boxShadow: '0 10px 36px rgba(25, 118, 210, 0.7), 0 6px 16px rgba(0,0,0,0.4)',
              backgroundColor: '#1565c0',
            },
            '&:active': {
              transform: 'scale(0.95)',
            },
            transition: 'all 0.2s ease-in-out',
            // Ensure visibility
            opacity: 1,
            visibility: 'visible',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <MenuIcon sx={{ fontSize: { xs: 30, sm: 34 }, color: 'white' }} />
        </Fab>
      )}

      {/* Main Content - Enhanced Mobile/Tablet Responsive */}
      <Box
        component="main"
        sx={{
          flexGrow: 1,
          minWidth: 0,
          // Reduce padding on mobile/tablet when document is open
          pl: documentOpen && !documentFullscreen 
            ? { xs: 0, sm: 0.5, md: 1 } 
            : { xs: 0.5, sm: 1, md: 2, lg: 3 },
          pr: documentOpen && !documentFullscreen 
            ? { xs: 0, sm: 0.5, md: 1 } 
            : { xs: 0.5, sm: 1, md: 2, lg: 3 },
          py: documentOpen && !documentFullscreen 
            ? { xs: 0.5, sm: 0.75, md: 1 } 
            : { xs: 1, sm: 1.5, md: 2, lg: 4 },
          // No marginTop needed since we removed the course AppBar
          marginTop: 0,
          transition: theme.transitions.create(['padding'], {
            easing: theme.transitions.easing.sharp,
            duration: theme.transitions.duration.enteringScreen,
          }),
          minHeight: '100vh',
          backgroundColor: 'transparent'
        }}
      >
        {/* Content Container */}
        <Box sx={{ 
          width: '100%', 
          minHeight: '100%',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden'
        }}>
          {/* Breadcrumbs - hide when document is open or on small screens */}
          {!documentOpen && (
            <Breadcrumbs 
              aria-label="breadcrumb" 
              sx={{ 
                mb: 0.5, 
                p: { xs: 1, sm: 2 },
                display: { xs: 'none', sm: 'flex' },
                fontSize: { xs: '0.7rem', sm: '0.8rem' },
                backgroundColor: '#f8f9fa'
              }}
            >
              <Link component={RouterLink} to="/student" color="inherit">
                Dashboard
              </Link>
              <Link component={RouterLink} to="/student/courses" color="inherit">
                My Courses
              </Link>
              <Typography color="text.primary">
                {course?.title || 'Course Content'}
              </Typography>
            </Breadcrumbs>
          )}
          
          {/* Student Progress Validation Banner - shows when there's new content in completed units */}
          {!loading && !documentOpen && !videoOpen && (
            <Box sx={{ px: 2, mb: 2 }}>
              <StudentProgressValidation 
                courseId={courseId}
                courseName={course?.title}
                onProgressUpdate={async () => {
                  // Refresh progression status when progress is updated
                  try {
                    const progressStatus = await getProgressionStatus(courseId, token);
                    setProgressionStatus(progressStatus);
                    
                    if (progressStatus && progressStatus.isBlocked) {
                      const reviewUnits = await getUnitsNeedingReview(courseId, token);
                      setUnitsNeedingReview(reviewUnits.unitsNeedingReview || []);
                    } else {
                      setUnitsNeedingReview([]);
                    }
                  } catch (err) {
                    console.warn('Error refreshing progression status:', err);
                  }
                }}
              />
            </Box>
          )}

        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', my: 4 }}>
            <CircularProgress />
          </Box>
        ) : error ? (
          <Alert severity="error" sx={{ mb: 3 }}>
            {error}
          </Alert>
        ) : videoOpen && currentVideo ? (
          /* Video Player View */
          <Box sx={{ backgroundColor: 'white', minHeight: '100vh' }}>
            <Box sx={{ position: 'relative', backgroundColor: '#000' }}>
              <CustomVideoPlayer 
                videoId={currentVideo._id}
                videoUrl={(() => {
                  const finalUrl = currentVideo.videoUrl && currentVideo.videoUrl.trim() && currentVideo.videoUrl.startsWith('http') 
                    ? currentVideo.videoUrl 
                    : formatVideoUrl(currentVideo.videoUrl);
                    
                  return finalUrl;
                })()}
                title={currentVideo.title}
                token={token}
                onTimeUpdate={(currentTime, duration) => {
                  if (duration > 0 && Math.abs(currentVideo.duration - duration) > 1) {
                    setCurrentVideo(prev => ({ ...prev, duration: duration }));
                  }
                }}
                onVideoComplete={(videoId, duration, currentTime, timeSpent) => {
                  if (isUpdatingVideoState) return;
                  setIsUpdatingVideoState(true);
                  setCurrentVideo(prev => ({ ...prev, watched: true }));
                  
                  // Calculate watch percentage
                  const watchPercentage = calculateWatchTime(duration || currentVideo.duration || 0, currentTime || duration || 0);
                  
                  // Update the units state to mark video as completed
                  setUnits(prevUnits => prevUnits.map(unit => ({
                    ...unit,
                    videos: unit.videos.map(video => 
                      video._id === videoId 
                        ? { 
                            ...video, 
                            watched: true, 
                            isCompleted: true,
                            completedAt: new Date().toISOString(),
                            currentTime: currentTime || duration || video.duration || 0,
                            watchTime: timeSpent || duration || video.duration || 0,
                            watchPercentage: watchPercentage
                          } 
                        : video
                    )
                  })));
                  
                  const payload = {
                    timeSpent: timeSpent || duration || currentVideo.duration || 0,
                    currentTime: currentTime || duration || currentVideo.duration || 0,
                    duration: currentVideo.duration || duration || 0,
                    completed: true,
                    isCompleted: true,
                    watchPercentage: watchPercentage
                  };
                  
                  updateWatchHistory(videoId, payload, token)
                    .then(async () => {
                      console.log('✅ Video completion recorded successfully');
                      
                      // Refresh quiz status after video completion
                      if (currentVideo.unitId) {
                        try {
                          const availability = await checkQuizAvailability(currentVideo.unitId);
                          setUnitQuizStatus(prev => ({
                            ...prev,
                            [currentVideo.unitId]: availability
                          }));
                        } catch (error) {
                          console.error('Error refreshing quiz status:', error);
                        }
                      }
                      
                      // Navigate to next content and refresh page
                      console.log('🎬 Video completed, navigating to next content...');
                      saveProgressAndNavigateToNext(videoId, currentVideo.unitId, 'video');
                    })
                    .catch(err => {
                      console.error('❌ Error recording video completion:', err);
                      // Still try to navigate even if there was an error saving
                      saveProgressAndNavigateToNext(videoId, currentVideo.unitId, 'video');
                    })
                    .finally(() => {
                      setIsUpdatingVideoState(false);
                    });
                }}
                onTimeUpdateCallback={(videoId, currentTime, duration, timeSpent) => {
                  const payload = {
                    currentTime: currentTime,
                    timeSpent: timeSpent,
                    duration: duration || currentVideo.duration
                  };
                  updateWatchHistory(videoId, payload, token).catch(err => {
                    console.error('Error updating watch progress:', err);
                  });
                }}
                onClose={handleCloseVideo}
              />
            </Box>
          </Box>
        ) : (
          <>
            {console.log('📄 MAIN RENDER LOGIC - States:', { 
              videoOpen, 
              currentVideo: !!currentVideo,
              documentOpen, 
              currentDocument: !!currentDocument,
              documentFullscreen,
              currentDocumentId: currentDocument?._id,
              currentDocumentTitle: currentDocument?.title
            })}
            {documentOpen && currentDocument && documentFullscreen ? (
              /* Secure Document Viewer - Fullscreen Modal */
              <>
                {console.log('📄 Rendering SecureDocumentViewer in FULLSCREEN mode')}
                <SecureDocumentViewer
                  open={documentOpen && documentFullscreen}
                  onClose={handleCloseDocument}
                  documentUrl={currentDocument.documentUrl}
                  documentTitle={currentDocument.title}
                  currentDocument={currentDocument}
                  isFullscreenMode={true}
                  onToggleFullscreen={handleToggleDocumentFullscreen}
                  isRead={currentDocument.isRead || currentDocument.isCompleted || false}
                  courseId={courseId}
                  unitId={currentDocument.unitId}
                  onMarkAsRead={async () => {
                    console.log('📖 Document marked as read:', currentDocument._id);
                    // Update the document state
                    setUnits(prevUnits => prevUnits.map(unit => ({
                      ...unit,
                      readingMaterials: unit.readingMaterials.map(doc => 
                        doc._id === currentDocument._id 
                          ? { ...doc, isRead: true, isCompleted: true, completedAt: new Date().toISOString() } 
                          : doc
                      )
                    })));
                    
                    // Refresh quiz status after document completion
                    if (currentDocument.unitId) {
                      try {
                        const availability = await checkQuizAvailability(currentDocument.unitId);
                        setUnitQuizStatus(prev => ({
                          ...prev,
                          [currentDocument.unitId]: availability
                        }));
                      } catch (error) {
                        console.error('Error refreshing quiz status after document completion:', error);
                      }
                    }
                    
                    // Navigate to next content and refresh page
                    console.log('📖 Document completed, navigating to next content...');
                    saveProgressAndNavigateToNext(currentDocument._id, currentDocument.unitId, 'document');
                  }}
                />
              </>
            ) : documentOpen && currentDocument && !documentFullscreen ? (
              /* Inline Document Viewer - Mobile/Tablet Responsive */
              <Paper 
                elevation={0}
                sx={{
                  backgroundColor: 'white',
                  borderRadius: { xs: 0, sm: 1, md: 2 },
                  overflow: 'hidden',
                  boxShadow: { xs: 'none', sm: '0 1px 4px rgba(0,0,0,0.08)', md: '0 2px 8px rgba(0,0,0,0.1)' },
                  // Full height on mobile/tablet, slightly less on desktop
                  minHeight: { 
                    xs: 'calc(100vh - 72px)', 
                    sm: 'calc(100vh - 80px)',
                    md: 'calc(100vh - 100px)' 
                  },
                  width: '100%',
                  maxWidth: 'none',
                  mx: 0,
                  mt: 0,
                  mb: { xs: 0, sm: 1, md: 2 },
                  display: 'flex',
                  flexDirection: 'column'
                }}
              >
                  {/* Document Content - Flipbook Style Reader - Mobile/Tablet Responsive */}
                <Box sx={{ 
                  flex: 1, 
                  position: 'relative', 
                  minHeight: { 
                    xs: 'calc(100vh - 72px)', 
                    sm: 'calc(100vh - 80px)',
                    md: 'calc(100vh - 100px)' 
                  },
                  height: { 
                    xs: 'calc(100vh - 72px)', 
                    sm: 'calc(100vh - 80px)',
                    md: 'calc(100vh - 100px)' 
                  },
                  display: 'flex',
                  flexDirection: 'column'
                }}>
                  <FlipbookViewer
                    documentId={currentDocument._id}
                    documentUrl={currentDocument.documentUrl}
                    documentTitle={currentDocument.title}
                    onClose={handleCloseDocument}
                    onToggleFullscreen={handleToggleDocumentFullscreen}
                    studentName={localStorage.getItem('userName') || 'Student'}
                    registrationNumber={localStorage.getItem('registrationNumber') || 'SGT-LMS'}
                    isRead={currentDocument.isRead || currentDocument.isCompleted || false}
                    courseId={courseId}
                    unitId={currentDocument.unitId}
                    onMarkAsRead={async () => {
                      console.log('📖 Document marked as read:', currentDocument._id);
                      // Update the document state
                      setUnits(prevUnits => prevUnits.map(unit => ({
                        ...unit,
                        readingMaterials: unit.readingMaterials.map(doc => 
                          doc._id === currentDocument._id 
                            ? { ...doc, isRead: true, isCompleted: true, completedAt: new Date().toISOString() } 
                            : doc
                        )
                      })));
                      
                      // Refresh quiz status after document completion
                      if (currentDocument.unitId) {
                        try {
                          const availability = await checkQuizAvailability(currentDocument.unitId);
                          setUnitQuizStatus(prev => ({
                            ...prev,
                            [currentDocument.unitId]: availability
                          }));
                        } catch (error) {
                          console.error('Error refreshing quiz status after document completion:', error);
                        }
                      }
                      
                      // Navigate to next content and refresh page
                      console.log('📖 Document completed, navigating to next content...');
                      saveProgressAndNavigateToNext(currentDocument._id, currentDocument.unitId, 'document');
                    }}
                  />
                </Box>
              </Paper>
        ) : !selectedUnit ? (
          <Paper 
            elevation={0}
            sx={{
              p: { xs: 2, sm: 3, md: 4 },
              textAlign: 'center',
              backgroundColor: 'white',
              borderRadius: { xs: 1, sm: 1.5, md: 2 },
              minHeight: { xs: '300px', sm: '350px', md: '400px' },
              width: '100%',
              maxWidth: '1100px',
              mx: 'auto',
              mt: { xs: 1, sm: 2, md: 4 },
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              alignItems: 'center',
              boxShadow: { xs: '0 1px 4px rgba(0,0,0,0.08)', sm: '0 2px 6px rgba(0,0,0,0.1)', md: '0 2px 8px rgba(0,0,0,0.1)' }
            }}
          >
            <SchoolIcon sx={{ fontSize: { xs: 48, sm: 56, md: 64 }, color: 'primary.main', mb: { xs: 1, sm: 1.5, md: 2 } }} />
            <Typography variant="h5" gutterBottom color="primary" sx={{ fontSize: { xs: '1.2rem', sm: '1.4rem', md: '1.5rem' } }}>
              Welcome to {course?.title}
            </Typography>
            <Typography variant="body1" color="text.secondary" sx={{ mb: { xs: 2, sm: 2.5, md: 3 }, maxWidth: '600px', fontSize: { xs: '0.9rem', sm: '0.95rem', md: '1rem' }, px: { xs: 1, sm: 2 } }}>
              Select a unit from the sidebar to begin your learning journey. 
              Each unit contains videos, documents, and quizzes designed to help you master the course material.
            </Typography>
            {!isSmallScreen && (
              <Typography variant="body2" color="text.secondary">
                💡 Tip: Units are unlocked sequentially as you complete the previous content
              </Typography>
            )}
          </Paper>
        ) : (
          <Paper 
            elevation={0}
            sx={{
              backgroundColor: 'white',
              borderRadius: { xs: 1, sm: 1.5, md: 2 },
              overflow: 'hidden',
              boxShadow: { xs: '0 1px 4px rgba(0,0,0,0.08)', sm: '0 2px 6px rgba(0,0,0,0.1)', md: '0 2px 8px rgba(0,0,0,0.1)' },
              minHeight: { xs: '400px', sm: '450px', md: '500px' },
              width: '100%',
              maxWidth: '1200px',
              mx: 'auto',
              mt: { xs: 1, sm: 2, md: 4 }
            }}
          >
            <UnitContentViewer
              unit={selectedUnit}
              courseId={courseId}
              token={token}
              onProgressUpdate={handleProgressUpdate}
              onContentComplete={handleContentComplete}
            />
          </Paper>
        )}
          </>
        )}
        </Box>
      </Box>
      
      {/* New Content Blocking Dialog */}
      <Dialog
        open={blockingDialogOpen}
        onClose={() => setBlockingDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle sx={{ 
          backgroundColor: blockingInfo?.reason === 'previous_unit_incomplete' ? 'error.light' : 'warning.light', 
          color: blockingInfo?.reason === 'previous_unit_incomplete' ? 'error.contrastText' : 'warning.contrastText',
          display: 'flex',
          alignItems: 'center',
          gap: 1
        }}>
          <LockIcon />
          {blockingInfo?.reason === 'previous_unit_incomplete' 
            ? 'Content Locked - Complete Previous Unit' 
            : 'Content Locked - New Content Available'}
        </DialogTitle>
        <DialogContent sx={{ pt: 3 }}>
          {blockingInfo && (
            <Box>
              <Alert severity={blockingInfo.reason === 'previous_unit_incomplete' ? 'error' : 'warning'} sx={{ mb: 2 }}>
                You cannot access content in <strong>"{blockingInfo.blockedUnitTitle}"</strong> because 
                <strong> Unit {blockingInfo.blockingUnitOrder}: {blockingInfo.blockingUnitTitle}</strong> 
                {blockingInfo.reason === 'previous_unit_incomplete' 
                  ? ' must be completed first.' 
                  : ' has new content that you must complete first.'}
              </Alert>
              
              {/* Show missing items for strict sequential completion */}
              {blockingInfo.missingItems && blockingInfo.missingItems.length > 0 && (
                <Box sx={{ mt: 2 }}>
                  <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                    Items remaining in Unit {blockingInfo.blockingUnitOrder}:
                  </Typography>
                  <List dense>
                    {blockingInfo.missingItems.map((item, index) => (
                      <ListItem key={index}>
                        <ListItemIcon sx={{ minWidth: 36 }}>
                          {item.type === 'videos' ? <PlayCircleOutlineIcon color="primary" /> : 
                           item.type === 'documents' ? <DescriptionIcon color="secondary" /> :
                           <AssignmentIcon color="error" />}
                        </ListItemIcon>
                        <ListItemText 
                          primary={item.type === 'quiz' 
                            ? 'Pass the Unit Quiz' 
                            : `${item.count} ${item.type} remaining`}
                          secondary={item.type !== 'quiz' 
                            ? `${item.total - item.count} of ${item.total} completed` 
                            : 'Quiz must be passed to unlock next unit'}
                        />
                      </ListItem>
                    ))}
                  </List>
                </Box>
              )}
              
              {/* Show progress if available */}
              {blockingInfo.incompleteDetails && (
                <Box sx={{ mt: 2 }}>
                  <Typography variant="body2" color="text.secondary" gutterBottom>
                    Unit Progress:
                  </Typography>
                  <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                    {blockingInfo.incompleteDetails.totalVideos > 0 && (
                      <Chip 
                        icon={<PlayCircleOutlineIcon />}
                        label={`Videos: ${blockingInfo.incompleteDetails.videosWatched || 0}/${blockingInfo.incompleteDetails.totalVideos}`}
                        color={blockingInfo.incompleteDetails.allVideosComplete ? 'success' : 'default'}
                        size="small"
                      />
                    )}
                    {blockingInfo.incompleteDetails.totalDocuments > 0 && (
                      <Chip 
                        icon={<DescriptionIcon />}
                        label={`Documents: ${blockingInfo.incompleteDetails.docsRead || 0}/${blockingInfo.incompleteDetails.totalDocuments}`}
                        color={blockingInfo.incompleteDetails.allDocsComplete ? 'success' : 'default'}
                        size="small"
                      />
                    )}
                    {blockingInfo.incompleteDetails.hasQuiz && (
                      <Chip 
                        icon={<AssignmentIcon />}
                        label={blockingInfo.incompleteDetails.quizPassed ? 'Quiz: Passed' : 'Quiz: Not Passed'}
                        color={blockingInfo.incompleteDetails.quizPassed ? 'success' : 'error'}
                        size="small"
                      />
                    )}
                  </Box>
                </Box>
              )}
              
              {/* Legacy support for newContentItems */}
              {blockingInfo.newContentItems && blockingInfo.newContentItems.length > 0 && (
                <Box sx={{ mt: 2 }}>
                  <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                    New content to complete:
                  </Typography>
                  <List dense>
                    {blockingInfo.newContentItems.map((item, index) => (
                      <ListItem key={index}>
                        <ListItemIcon sx={{ minWidth: 36 }}>
                          {item.type === 'video' ? <PlayCircleOutlineIcon color="primary" /> : <DescriptionIcon color="secondary" />}
                        </ListItemIcon>
                        <ListItemText primary={item.title} secondary={item.type === 'video' ? 'Video' : 'Document'} />
                      </ListItem>
                    ))}
                    {blockingInfo.newContentCount > 5 && (
                      <ListItem>
                        <ListItemText 
                          primary={`... and ${blockingInfo.newContentCount - 5} more item(s)`} 
                          sx={{ color: 'text.secondary', fontStyle: 'italic' }}
                        />
                      </ListItem>
                    )}
                  </List>
                </Box>
              )}
              
              {blockingInfo.completion && (
                <Box sx={{ mt: 2 }}>
                  <Typography variant="body2" color="text.secondary" gutterBottom>
                    Your Progress: {blockingInfo.completion.completedItems || 0} / {blockingInfo.completion.totalNewItems || blockingInfo.newContentCount} completed
                  </Typography>
                  <LinearProgress 
                    variant="determinate" 
                    value={blockingInfo.completion.completionPercentage || 0} 
                    sx={{ height: 8, borderRadius: 1 }}
                  />
                </Box>
              )}
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setBlockingDialogOpen(false)}>
            Close
          </Button>
          <Button 
            variant="contained" 
            color="primary"
            onClick={() => {
              setBlockingDialogOpen(false);
              // Find and select the blocking unit
              if (blockingInfo) {
                const blockingUnit = units.find(u => 
                  u._id === blockingInfo.blockingUnitId || 
                  u.order === blockingInfo.blockingUnitOrder ||
                  unitsNeedingReview.some(r => r.unitId === u._id && r.unitOrder === blockingInfo.blockingUnitOrder)
                );
                if (blockingUnit) {
                  setSelectedUnit(blockingUnit);
                  // Expand the blocking unit in sidebar
                  setExpandedUnits(prev => ({ ...prev, [blockingUnit._id]: true }));
                }
              }
            }}
          >
            Go to Unit {blockingInfo?.blockingUnitOrder}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default StudentCourseUnits;
