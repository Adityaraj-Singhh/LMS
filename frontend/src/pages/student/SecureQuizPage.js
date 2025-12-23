import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import {
  Box,
  Typography,
  Paper,
  Button,
  Radio,
  RadioGroup,
  FormControlLabel,
  FormControl,
  LinearProgress,
  Alert,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  IconButton,
  Grid,
  Card,
  CardContent,
  CircularProgress,
  Drawer,
  SwipeableDrawer,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  ListItemIcon,
  Toolbar,
  AppBar,
  Tooltip,
  Divider,
  Badge,
  Fab,
  useMediaQuery,
  useTheme
} from '@mui/material';
import {
  FullscreenExit,
  Fullscreen,
  Warning,
  CheckCircle,
  RadioButtonUnchecked,
  BookmarkBorder,
  Bookmark,
  AccessTime,
  Quiz as QuizIcon,
  NavigateNext,
  NavigateBefore,
  Send,
  Flag,
  Security,
  VisibilityOff,
  Block,
  Menu as MenuIcon,
  Close as CloseIcon
} from '@mui/icons-material';
import axios from 'axios';
import SecurityWarningDialog from '../../components/student/SecurityWarningDialog';
import { startSecurityMonitoring, startBypassResistantTabDetection, startContinuousExtensionDetection } from '../../utils/securityUtils';

// Responsive drawer widths
const DRAWER_WIDTH_DESKTOP = 300;
const DRAWER_WIDTH_TABLET = 280;
const DRAWER_WIDTH_MOBILE = '85vw';

const MAX_TAB_SWITCHES = 3;
const MAX_FULLSCREEN_EXITS = 3;
const TAB_SWITCH_TIMEOUT = 15000; // 15 seconds

const SecureQuizPage = ({ user, token }) => {
  const { attemptId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const intervalRef = useRef(null);
  const tabSwitchTimeoutRef = useRef(null);
  const isTabSwitchAllowedRef = useRef(false);
  
  // Responsive hooks
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm')); // < 600px
  const isTablet = useMediaQuery(theme.breakpoints.between('sm', 'md')); // 600-900px
  const isSmallScreen = useMediaQuery(theme.breakpoints.down('md')); // < 900px (mobile + tablet)
  const isLandscape = useMediaQuery('(orientation: landscape)');
  
  // Get responsive drawer width
  const getDrawerWidth = () => {
    if (isMobile) return DRAWER_WIDTH_MOBILE;
    if (isTablet) return DRAWER_WIDTH_TABLET;
    return DRAWER_WIDTH_DESKTOP;
  };

  // Authentication & Quiz State
  const [localToken] = useState(token || localStorage.getItem('token'));
  const [quiz, setQuiz] = useState(null);
  const [courseId, setCourseId] = useState(null);
  const [answers, setAnswers] = useState({});
  const [markedForReview, setMarkedForReview] = useState(new Set());
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [timeLeft, setTimeLeft] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [result, setResult] = useState(null);

  // Security State
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [tabSwitchCount, setTabSwitchCount] = useState(0);
  const [fsExitCount, setFsExitCount] = useState(0);
  const [showWarningDialog, setShowWarningDialog] = useState(false);
  const [warningMessage, setWarningMessage] = useState('');
  const [isTabSwitchBlocked, setIsTabSwitchBlocked] = useState(false);
  const [securityViolations, setSecurityViolations] = useState([]);
  const [isQuizLocked, setIsQuizLocked] = useState(false);
  
  // Penalty time state - 60 seconds wait time when returning from violation
  const [penaltyTimeRemaining, setPenaltyTimeRemaining] = useState(0);
  const [isPenaltyActive, setIsPenaltyActive] = useState(false);
  const [totalPenaltyTimeUsed, setTotalPenaltyTimeUsed] = useState(0);
  const PENALTY_DURATION = 60; // 60 seconds penalty for each violation
  
  // **FIX: Track the violation count that has been penalized**
  // This prevents the same violation from triggering multiple penalties
  const lastPenalizedViolationRef = useRef(0);
  
  // Extension Security State
  const [showSecurityDialog, setShowSecurityDialog] = useState(false);
  const [securityReport, setSecurityReport] = useState(null);
  const [securityMonitor, setSecurityMonitor] = useState(null);
  const [bypassResistantDetection, setBypassResistantDetection] = useState(null);
  const [continuousExtensionDetection, setContinuousExtensionDetection] = useState(null);
  const [extensionDetectedDuringQuiz, setExtensionDetectedDuringQuiz] = useState(false);
  const [extensionWarningMessage, setExtensionWarningMessage] = useState('');

  // UI State - drawer closed by default on mobile/tablet
  const [drawerOpen, setDrawerOpen] = useState(!isSmallScreen);
  const [showSubmitDialog, setShowSubmitDialog] = useState(false);

  // Update drawer state when screen size changes
  useEffect(() => {
    setDrawerOpen(!isSmallScreen);
  }, [isSmallScreen]);

  // Ref to track if auto-submit has been triggered
  const autoSubmitTriggeredRef = useRef(false);
  
  // Ref to track fullscreen transition - ignore blur events during fullscreen changes
  const fullscreenTransitionRef = useRef(false);
  
  // Ref to track when we last attempted fullscreen - ignore blur events for 2s after
  const lastFullscreenAttemptRef = useRef(0);
  const FULLSCREEN_ATTEMPT_GRACE_PERIOD = 2000; // 2 seconds after any fullscreen attempt
  
  // **FIX: Track if we've ever successfully entered fullscreen in this session**
  // Once true, we only re-enter if user explicitly clicks button or genuinely exited
  const hasEnteredFullscreenRef = useRef(false);
  
  // **FIX: Track if programmatic fullscreen is allowed (only true initially)**
  // After first attempt fails without user gesture, disable auto-attempts
  const canAttemptAutoFullscreenRef = useRef(true);
  
  // Ref to track when quiz started - for startup grace period
  const quizStartTimeRef = useRef(null);
  const QUIZ_STARTUP_GRACE_PERIOD = 8000; // 8 seconds grace period after quiz loads (increased from 5)
  
  // **FIX: Track last tab switch time to deduplicate multiple detection methods**
  // All detection methods (visibility, blur, bypass) can fire for the same event
  // We should only count once per actual tab switch event
  const lastTabSwitchTimeRef = useRef(0);
  const TAB_SWITCH_DEBOUNCE_MS = 2000; // 2 seconds - ignore duplicate detections
  
  // Forward declaration refs for functions with circular dependencies
  const handleSubmitQuizRef = useRef(null);
  const autoSubmitQuizRef = useRef(null);
  const enterFullscreenRef = useRef(null);
  const incrementTabSwitchCountRef = useRef(null);

  // Enter fullscreen mode - defined first as other functions depend on it
  // **FIX: Added forceAttempt parameter - only true when user clicks button**
  const enterFullscreen = useCallback((forceAttempt = false) => {
    // Check if we're already in fullscreen
    const isCurrentlyFullscreen = !!(
      document.fullscreenElement ||
      document.webkitFullscreenElement ||
      document.mozFullScreenElement ||
      document.msFullscreenElement
    );
    
    // **FIX: Skip if already in fullscreen**
    if (isCurrentlyFullscreen) {
      console.log('Already in fullscreen mode, skipping request');
      return;
    }
    
    // **FIX: Skip programmatic attempts if auto-fullscreen is disabled (failed before)**
    // Unless forceAttempt is true (user clicked button)
    if (!forceAttempt && !canAttemptAutoFullscreenRef.current) {
      console.log('⏭️ Skipping auto fullscreen attempt (previous attempt failed without user gesture)');
      return;
    }
    
    console.log('Attempting to enter fullscreen mode', forceAttempt ? '(user-initiated)' : '(auto)');
    
    // **FIX: Set transition flag and record attempt time BEFORE attempting fullscreen**
    fullscreenTransitionRef.current = true;
    lastFullscreenAttemptRef.current = Date.now();
    
    const element = document.documentElement;
    try {
      const fullscreenPromise = element.requestFullscreen?.() || 
                                element.webkitRequestFullscreen?.() || 
                                element.mozRequestFullScreen?.() || 
                                element.msRequestFullscreen?.();
      
      if (fullscreenPromise && fullscreenPromise.then) {
        fullscreenPromise
          .then(() => {
            console.log('Fullscreen entered successfully');
            hasEnteredFullscreenRef.current = true;
            // Clear transition flag after success with delay
            setTimeout(() => {
              fullscreenTransitionRef.current = false;
              console.log('🔓 Fullscreen transition flag cleared after successful entry');
            }, 1000);
          })
          .catch((error) => {
            console.log('Fullscreen request failed (may need user gesture):', error.message);
            // **FIX: Disable auto-fullscreen attempts after first failure**
            if (!forceAttempt) {
              canAttemptAutoFullscreenRef.current = false;
              console.log('🚫 Auto fullscreen disabled - requires user gesture');
            }
            // Clear transition flag on failure with delay
            setTimeout(() => {
              fullscreenTransitionRef.current = false;
              console.log('🔓 Fullscreen transition flag cleared after failed entry');
            }, 1500);
          });
      } else {
        console.log('Fullscreen request completed (no promise)');
        setTimeout(() => {
          fullscreenTransitionRef.current = false;
        }, 1000);
      }
    } catch (error) {
      console.error('Error entering fullscreen:', error);
      // **FIX: Disable auto-fullscreen on error too**
      if (!forceAttempt) {
        canAttemptAutoFullscreenRef.current = false;
      }
      setTimeout(() => {
        fullscreenTransitionRef.current = false;
      }, 1500);
    }
  }, []);

  // Exit fullscreen mode
  const exitFullscreen = useCallback(() => {
    if (document.exitFullscreen) {
      document.exitFullscreen();
    } else if (document.webkitExitFullscreen) {
      document.webkitExitFullscreen();
    } else if (document.mozCancelFullScreen) {
      document.mozCancelFullScreen();
    } else if (document.msExitFullscreen) {
      document.msExitFullscreen();
    }
  }, []);

  // Update enterFullscreen ref
  useEffect(() => {
    enterFullscreenRef.current = enterFullscreen;
  }, [enterFullscreen]);

  // Check if quiz should be locked due to failure
  const checkAndHandleQuizLock = async (submissionResult) => {
    try {
      if (!submissionResult || submissionResult.passed === undefined) {
        console.log('No submission result or passing status available');
        return;
      }

      const passingScore = quiz.passingScore || 60; // Default passing score if not set
      const studentScore = submissionResult.percentage || 0;

      console.log(`Checking quiz lock: Score=${studentScore}%, Passing=${passingScore}%, Passed=${submissionResult.passed}`);

      if (!submissionResult.passed && studentScore < passingScore) {
        console.log('Student failed quiz, checking lock status...');
        
        const token = localStorage.getItem('token');
        const lockResponse = await axios.post('/api/quiz-unlock/check-and-lock', {
          studentId: JSON.parse(localStorage.getItem('user')).id,
          quizId: quiz._id,
          courseId: quiz.course,
          score: studentScore,
          passingScore: passingScore
        }, {
          headers: { Authorization: `Bearer ${token}` }
        });

        if (lockResponse.data.success && lockResponse.data.locked) {
          console.log('Quiz has been locked due to failing score');
          
          // Update local state
          setIsQuizLocked(true);
          
          // Show lock notification
          setError(null);
          setResult(prev => ({
            ...prev,
            isLocked: true,
            lockInfo: lockResponse.data.data,
            lockMessage: `Quiz locked due to failing score (${studentScore}% < ${passingScore}%). ${
              lockResponse.data.data.unlockAuthorizationLevel === 'TEACHER' 
                ? 'Your teacher can unlock this quiz.' 
                : 'Dean authorization required for unlock.'
            }`
          }));

          // Redirect to dashboard after showing result
          setTimeout(() => {
            navigate('/student/dashboard', { 
              state: { 
                quizLocked: true,
                lockMessage: lockResponse.data.data.unlockAuthorizationLevel === 'TEACHER'
                  ? 'Quiz locked due to failing score. Contact your teacher for unlock.'
                  : 'Quiz locked due to failing score. Teacher unlock limit exceeded - Dean authorization required.'
              }
            });
          }, 5000);
        }
      }
    } catch (error) {
      console.error('Error checking quiz lock status:', error);
      // Don't block the UI for lock check errors
    }
  };

  // Auto-submit quiz when security violations exceed limit
  const autoSubmitQuiz = useCallback(async () => {
    console.log('autoSubmitQuiz called - submitted:', submitted, 'submitting:', submitting, 'isQuizLocked:', isQuizLocked);
    if (submitted || submitting || autoSubmitTriggeredRef.current) return;
    
    autoSubmitTriggeredRef.current = true;
    setIsQuizLocked(true);
    setWarningMessage('Quiz auto-submitted due to security violations');
    setShowWarningDialog(true);
    
    // Use ref to call handleSubmitQuiz
    if (handleSubmitQuizRef.current) {
      await handleSubmitQuizRef.current(true); // Force submit with security flag
    }
  }, [submitted, submitting, isQuizLocked]);
  
  // Update autoSubmitQuiz ref
  useEffect(() => {
    autoSubmitQuizRef.current = autoSubmitQuiz;
  }, [autoSubmitQuiz]);
  
  // Penalty countdown timer effect
  useEffect(() => {
    let penaltyInterval;
    
    if (isPenaltyActive && penaltyTimeRemaining > 0) {
      penaltyInterval = setInterval(() => {
        setPenaltyTimeRemaining(prev => {
          if (prev <= 1) {
            // Penalty time completed
            setIsPenaltyActive(false);
            setIsTabSwitchBlocked(false);
            setShowWarningDialog(false);
            console.log('✅ Penalty time completed, student can continue');
            return 0;
          }
          return prev - 1;
        });
        
        // Also deduct from main quiz time
        setTimeLeft(prev => prev > 0 ? prev - 1 : 0);
      }, 1000);
    }
    
    return () => {
      if (penaltyInterval) clearInterval(penaltyInterval);
    };
  }, [isPenaltyActive, penaltyTimeRemaining]);
  
  // Debug tab switch count changes - moved after autoSubmitQuiz definition
  useEffect(() => {
    console.log('🔢 TAB SWITCH COUNT CHANGED TO:', tabSwitchCount);
    
    // Auto-submit if count exceeds limit
    if (tabSwitchCount >= MAX_TAB_SWITCHES && !submitted && !submitting && !autoSubmitTriggeredRef.current) {
      console.log('🚫 TAB SWITCH LIMIT EXCEEDED ON STATE CHANGE! Auto-submitting...');
      setIsQuizLocked(true);
      setSubmitting(true);
      if (autoSubmitQuizRef.current) {
        autoSubmitQuizRef.current();
      }
    }
  }, [tabSwitchCount, submitted, submitting]);
  
  useEffect(() => {
    console.log('🔢 FS EXIT COUNT CHANGED TO:', fsExitCount);
    
    // Auto-submit if count exceeds limit  
    if (fsExitCount >= MAX_FULLSCREEN_EXITS && !submitted && !submitting && !autoSubmitTriggeredRef.current) {
      console.log('🚫 FS EXIT LIMIT EXCEEDED ON STATE CHANGE! Auto-submitting...');
      setIsQuizLocked(true);
      setSubmitting(true);
      if (autoSubmitQuizRef.current) {
        autoSubmitQuizRef.current();
      }
    }
  }, [fsExitCount, submitted, submitting]);

  // Centralized function to handle tab switch counting
  const incrementTabSwitchCount = useCallback((method, detection = null) => {
    // **FIX: Debounce multiple detection methods firing for the same event**
    // Visibility change, window blur, and bypass detection can all fire for ONE tab switch
    const now = Date.now();
    const timeSinceLastSwitch = now - lastTabSwitchTimeRef.current;
    
    if (timeSinceLastSwitch < TAB_SWITCH_DEBOUNCE_MS) {
      console.log(`⏭️ Ignoring duplicate tab switch detection (${method}) - only ${timeSinceLastSwitch}ms since last switch`);
      return; // Ignore this detection - it's a duplicate
    }
    
    // Record this as a new tab switch
    lastTabSwitchTimeRef.current = now;
    console.log(`✅ Recording new tab switch via ${method}`);
    
    setTabSwitchCount(prevCount => {
      const newCount = prevCount + 1;
      console.log(`🔢 Tab switch #${newCount} detected via ${method} (was ${prevCount})`);
      
      const violation = {
        type: 'TAB_SWITCH',
        timestamp: new Date(),
        count: newCount,
        method: method,
        detection: detection,
        message: `Tab switch detected (#${newCount}) via ${method}`
      };

      setSecurityViolations(prev => {
        console.log('🚨 Adding violation to list, total will be:', prev.length + 1);
        return [...prev, violation];
      });

      if (newCount >= MAX_TAB_SWITCHES) {
        // Auto-submit after max violations
        console.log('🚫 MAXIMUM TAB SWITCHES REACHED! Auto-submitting quiz NOW!');
        console.log(`🔢 Tab count: ${newCount}/${MAX_TAB_SWITCHES} - EXCEEDED LIMIT`);
        
        // Force immediate submission - don't wait for timeout
        setIsQuizLocked(true);
        setSubmitting(true); // Prevent further actions
        setWarningMessage('QUIZ AUTO-SUBMITTED: Too many tab switches detected!');
        setShowWarningDialog(true);
        
        // Immediate auto-submit - no delay, use ref
        console.log('⚡ Calling autoSubmitQuiz IMMEDIATELY...');
        if (autoSubmitQuizRef.current) {
          autoSubmitQuizRef.current();
        }
        return newCount; // Exit early to prevent further processing
      } else {
        // Show warning and start timeout
        console.log(`⚠️ Warning for tab switch ${newCount}/${MAX_TAB_SWITCHES}`);
        setWarningMessage(
          `Warning: Tab switching detected! (${newCount}/${MAX_TAB_SWITCHES})\n` +
          `You have ${15} seconds to return to the quiz or it will be auto-submitted.`
        );
        setShowWarningDialog(true);
        setIsTabSwitchBlocked(true);

        // Start 15-second timeout
        console.log(`⏰ Starting ${TAB_SWITCH_TIMEOUT/1000} second countdown for return to quiz`);
        tabSwitchTimeoutRef.current = setTimeout(() => {
          if (document.hidden && autoSubmitQuizRef.current) {
            console.log('⏰ Timeout expired! User did not return to tab, auto-submitting quiz');
            autoSubmitQuizRef.current();
          }
        }, TAB_SWITCH_TIMEOUT);
      }

      return newCount;
    });
  }, []);
  
  // Update incrementTabSwitchCount ref
  useEffect(() => {
    incrementTabSwitchCountRef.current = incrementTabSwitchCount;
  }, [incrementTabSwitchCount]);

  // Handle tab switch detection with improved detection and logging
  const handleVisibilityChange = useCallback(() => {
    console.log('🔍 Visibility change detected:', document.hidden ? 'Hidden' : 'Visible');
    
    if (!quiz || submitted || submitting) {
      console.log('⚠️ Ignoring visibility change: Quiz not loaded, already submitted, or submitting');
      return;
    }

    if (document.hidden && incrementTabSwitchCountRef.current) {
      // Tab switch detected
      console.log('📱 Tab switch detected! Incrementing count...');
      incrementTabSwitchCountRef.current('standard-visibility-api');
    } else if (!document.hidden) {
      // User returned to the quiz - clear the auto-submit timeout
      console.log('✅ User returned to quiz tab - clearing timeout');
      if (tabSwitchTimeoutRef.current) {
        clearTimeout(tabSwitchTimeoutRef.current);
        tabSwitchTimeoutRef.current = null;
      }
      
      // **FIX: Only start penalty if this is a NEW violation that hasn't been penalized yet**
      // Check if current tabSwitchCount > lastPenalizedViolation
      if (tabSwitchCount > lastPenalizedViolationRef.current && !isPenaltyActive) {
        console.log(`⏱️ Starting ${PENALTY_DURATION}s penalty timer for NEW violation #${tabSwitchCount} (last penalized: #${lastPenalizedViolationRef.current})`);
        lastPenalizedViolationRef.current = tabSwitchCount; // Mark this violation as penalized
        setPenaltyTimeRemaining(PENALTY_DURATION);
        setIsPenaltyActive(true);
        setTotalPenaltyTimeUsed(prev => prev + PENALTY_DURATION);
        setWarningMessage(
          `⚠️ PENALTY TIME: You switched away from the quiz!\n\n` +
          `You must wait before continuing. This time is deducted from your exam time.\n\n` +
          `Remaining penalty: ${PENALTY_DURATION} seconds`
        );
        setShowWarningDialog(true);
        setIsTabSwitchBlocked(true);
      } else if (!isPenaltyActive) {
        // No NEW violation or penalty already active - unblock
        console.log(`✅ No new violations to penalize (current: ${tabSwitchCount}, last penalized: ${lastPenalizedViolationRef.current})`);
        setIsTabSwitchBlocked(false);
        setShowWarningDialog(false);
      }
    }
  }, [quiz, submitted, submitting, tabSwitchCount, isPenaltyActive]);

  // Handle bypass-resistant tab detection
  // **DISABLED: This was causing too many false positive detections**
  // The standard visibility API and window blur handlers are sufficient
  const handleBypassResistantTabSwitch = useCallback((detection) => {
    // **COMPLETELY DISABLED** - this detection method caused repeated false positives
    // that would trigger multiple violations for a single tab switch
    console.log('🛡️ Bypass-resistant detection DISABLED - ignoring:', detection.method);
    // Do nothing - we rely only on visibility API and window blur now
    return;
  }, []);

  // Handle fullscreen change with improved detection and logging
  const handleFullscreenChange = useCallback(() => {
    const isCurrentlyFullscreen = !!(
      document.fullscreenElement ||
      document.webkitFullscreenElement ||
      document.mozFullScreenElement ||
      document.msFullscreenElement
    );
    
    console.log('Fullscreen state changed:', isCurrentlyFullscreen ? 'FULLSCREEN' : 'NOT FULLSCREEN');
    setIsFullscreen(isCurrentlyFullscreen);
    
    // When entering fullscreen, start continuous extension detection
    if (isCurrentlyFullscreen && quiz && !submitted && !isQuizLocked) {
      console.log('🔍 Fullscreen entered - starting continuous extension detection');
      
      // **FIX: Clear fullscreen transition flag - we're back in fullscreen**
      fullscreenTransitionRef.current = false;
      
      // Cleanup any existing detection
      if (continuousExtensionDetection && typeof continuousExtensionDetection === 'function') {
        continuousExtensionDetection();
      }
      
      // Start new continuous extension detection
      const extensionDetectionCleanup = startContinuousExtensionDetection((detectionResult) => {
        console.log('🚨 Extension detected during quiz:', detectionResult);
        
        if (detectionResult.isBlocking) {
          // Critical extension detected - block quiz
          setExtensionDetectedDuringQuiz(true);
          setExtensionWarningMessage(detectionResult.message);
          setIsTabSwitchBlocked(true);
          
          // Add security violation
          const violation = {
            type: 'EXTENSION_DETECTED_DURING_QUIZ',
            timestamp: new Date(),
            message: detectionResult.message,
            details: detectionResult.detections
          };
          setSecurityViolations(prev => [...prev, violation]);
          
          // Show blocking warning
          setWarningMessage('⚠️ EXTENSION DETECTED: ' + detectionResult.message);
          setShowWarningDialog(true);
        } else {
          // Non-critical but suspicious
          console.log('⚠️ Non-critical extension behavior detected');
          const violation = {
            type: 'SUSPICIOUS_EXTENSION_BEHAVIOR',
            timestamp: new Date(),
            message: detectionResult.message,
            details: detectionResult.detections
          };
          setSecurityViolations(prev => [...prev, violation]);
        }
      }, 5000); // Check every 5 seconds
      
      setContinuousExtensionDetection(() => extensionDetectionCleanup);
    }
    
    if (!isCurrentlyFullscreen && quiz && !submitted && !isQuizLocked) {
      // Fullscreen exit detected
      console.log('Fullscreen exit detected - security violation');
      
      // **FIX: Set transition flag to prevent blur events from counting as tab switches**
      fullscreenTransitionRef.current = true;
      
      const violation = {
        type: 'FULLSCREEN_EXIT',
        timestamp: new Date(),
        message: 'Fullscreen mode exited'
      };
      
      setSecurityViolations(prev => [...prev, violation]);
      setFsExitCount(prev => {
        const next = prev + 1;
        console.log(`🔢 Fullscreen exit count: ${next}/${MAX_FULLSCREEN_EXITS}`);
        if (next >= MAX_FULLSCREEN_EXITS) {
          console.log('🚫 MAXIMUM FULLSCREEN EXITS REACHED! Auto-submitting quiz NOW!');
          console.log(`🔢 FS Exit count: ${next}/${MAX_FULLSCREEN_EXITS} - EXCEEDED LIMIT`);
          
          setIsQuizLocked(true);
          setSubmitting(true); // Prevent further actions
          setWarningMessage('QUIZ AUTO-SUBMITTED: Too many fullscreen exits detected!');
          setShowWarningDialog(true);
          
          // Immediate auto-submit - no delay, use ref
          console.log('⚡ Calling autoSubmitQuiz IMMEDIATELY for FS exits...');
          if (autoSubmitQuizRef.current) {
            autoSubmitQuizRef.current();
          }
          return next; // Exit early
        } else {
          setWarningMessage(`Warning: You exited fullscreen! (${next}/${MAX_FULLSCREEN_EXITS})`);
          setShowWarningDialog(true);
        }
        return next;
      });
      
      // Force fullscreen again after a short delay, use ref
      console.log('Attempting to re-enter fullscreen after delay');
      setTimeout(() => {
        if (enterFullscreenRef.current) {
          enterFullscreenRef.current();
        }
        // **FIX: Clear transition flag after attempting re-entry (regardless of success)**
        // Give a short grace period, then clear the flag
        setTimeout(() => {
          fullscreenTransitionRef.current = false;
          console.log('🔓 Fullscreen transition flag cleared');
        }, 500);
      }, 1000);
      
      // If user doesn't re-enter fullscreen after multiple attempts, consider it a violation
      setTimeout(() => {
        const stillNotFullscreen = !(
          document.fullscreenElement ||
          document.webkitFullscreenElement ||
          document.mozFullScreenElement ||
          document.msFullscreenElement
        );
        
        // **FIX: Ensure transition flag is cleared at this point**
        fullscreenTransitionRef.current = false;
        
        if (stillNotFullscreen) {
          console.log('User persistently avoiding fullscreen - adding serious violation');
          const seriousViolation = {
            type: 'FULLSCREEN_AVOIDANCE',
            timestamp: new Date(),
            message: 'Persistent avoidance of fullscreen mode'
          };
          
          setSecurityViolations(prev => [...prev, seriousViolation]);
        }
      }, 10000);
    }
  }, [quiz, submitted, isQuizLocked, continuousExtensionDetection]);

  // Prevent context menu and key shortcuts
  useEffect(() => {
    // Function to prevent context menu
    const preventContextMenu = (e) => {
      console.log('Context menu prevented');
      e.preventDefault();
      
      const violation = {
        type: 'CONTEXT_MENU',
        timestamp: new Date(),
        message: 'Attempted to use context menu'
      };
      
      setSecurityViolations(prev => [...prev, violation]);
      
      setWarningMessage('Right-click menu is disabled during the quiz.');
      setShowWarningDialog(true);
      
      setTimeout(() => setShowWarningDialog(false), 3000);
    };
    
    // Function to prevent key shortcuts
    const preventKeyShortcuts = (e) => {
      // Prevent common shortcuts that could be used for cheating
      if (
        e.key === 'F12' ||
        (e.ctrlKey && e.shiftKey && e.key === 'I') ||
        (e.ctrlKey && e.shiftKey && e.key === 'J') ||
        (e.ctrlKey && e.key === 'u') ||
        (e.ctrlKey && e.key === 'U') ||
        (e.ctrlKey && e.key === 's') ||
        (e.ctrlKey && e.key === 'S') ||
        (e.ctrlKey && e.key === 'a') ||
        (e.ctrlKey && e.key === 'A') ||
        (e.ctrlKey && e.key === 'c') ||
        (e.ctrlKey && e.key === 'C') ||
        (e.ctrlKey && e.key === 'v') ||
        (e.ctrlKey && e.key === 'V') ||
        (e.ctrlKey && e.key === 'r') ||
        (e.ctrlKey && e.key === 'R') ||
        (e.ctrlKey && e.key === 'p') ||
        (e.ctrlKey && e.key === 'P') ||
        (e.ctrlKey && e.altKey) ||
        (e.altKey && e.key === 'Tab') ||
        e.key === 'F5' ||
        e.key === 'PrintScreen'
      ) {
        console.log(`Keyboard shortcut prevented: ${e.ctrlKey ? 'Ctrl+' : ''}${e.shiftKey ? 'Shift+' : ''}${e.altKey ? 'Alt+' : ''}${e.key}`);
        e.preventDefault();
        e.stopPropagation();
        
        const violation = {
          type: 'KEYBOARD_SHORTCUT',
          timestamp: new Date(),
          key: e.key,
          message: `Attempted to use shortcut: ${e.ctrlKey ? 'Ctrl+' : ''}${e.shiftKey ? 'Shift+' : ''}${e.altKey ? 'Alt+' : ''}${e.key}`
        };
        
        setSecurityViolations(prev => [...prev, violation]);
        
        setWarningMessage('Keyboard shortcuts are disabled during the quiz.');
        setShowWarningDialog(true);
        
        setTimeout(() => setShowWarningDialog(false), 3000);
        
        return false;
      }
    };
    
    // **FIX: Use a pending blur mechanism - only count if blur persists for 500ms**
    let pendingBlurTimeout = null;
    let blurDetectedAt = null;
    
    // Function to detect window blur (user switches to another window)
    const handleWindowBlur = () => {
      console.log('🔍 Window blur detected (user switched to another window)');
      
      if (!quiz || submitted || submitting) {
        console.log('⚠️ Ignoring window blur: Quiz not loaded, already submitted, or submitting');
        return;
      }
      
      // **FIX: Check startup grace period - ignore events during first 8 seconds**
      if (quizStartTimeRef.current) {
        const timeSinceStart = Date.now() - quizStartTimeRef.current;
        if (timeSinceStart < QUIZ_STARTUP_GRACE_PERIOD) {
          console.log(`⏳ Ignoring window blur during startup grace period (${timeSinceStart}ms < ${QUIZ_STARTUP_GRACE_PERIOD}ms)`);
          return;
        }
      }
      
      // **FIX: Check if we recently attempted fullscreen - ignore blur for 2s after**
      if (lastFullscreenAttemptRef.current) {
        const timeSinceAttempt = Date.now() - lastFullscreenAttemptRef.current;
        if (timeSinceAttempt < FULLSCREEN_ATTEMPT_GRACE_PERIOD) {
          console.log(`⏳ Ignoring window blur after fullscreen attempt (${timeSinceAttempt}ms < ${FULLSCREEN_ATTEMPT_GRACE_PERIOD}ms)`);
          return;
        }
      }
      
      // **FIX: Ignore blur events during fullscreen transitions**
      if (fullscreenTransitionRef.current) {
        console.log('⚠️ Ignoring window blur: Fullscreen transition in progress');
        return;
      }
      
      // Also check if we're currently trying to enter fullscreen
      const isCurrentlyFullscreen = !!(
        document.fullscreenElement ||
        document.webkitFullscreenElement ||
        document.mozFullScreenElement ||
        document.msFullscreenElement
      );
      
      // If not in fullscreen, don't count blur events - user needs to click the button
      if (!isCurrentlyFullscreen) {
        console.log('⚠️ Ignoring window blur: Not in fullscreen mode (waiting for user to click button)');
        return;
      }
      
      // **FIX: Don't immediately count blur - wait 500ms and verify it persists**
      // Many false positives are momentary blurs that immediately refocus
      blurDetectedAt = Date.now();
      
      // Clear any existing pending timeout
      if (pendingBlurTimeout) {
        clearTimeout(pendingBlurTimeout);
      }
      
      console.log('⏳ Blur detected - waiting 500ms to confirm...');
      pendingBlurTimeout = setTimeout(() => {
        // After 500ms, check if we're STILL blurred (document hidden or no focus)
        const stillBlurred = document.hidden || !document.hasFocus();
        
        if (stillBlurred) {
          console.log('📱 Tab switch CONFIRMED (blur persisted 500ms)! Incrementing count...');
          if (incrementTabSwitchCountRef.current) {
            incrementTabSwitchCountRef.current('window-blur-detection');
          }
        } else {
          console.log('✅ Blur was momentary (focus returned) - NOT counting as tab switch');
        }
        
        pendingBlurTimeout = null;
        blurDetectedAt = null;
      }, 500);
    };
    
    // Function to detect window focus (user returns to quiz window)
    const handleWindowFocus = () => {
      console.log('✅ Window focus detected (user returned to quiz window)');
      
      // **FIX: Clear any pending blur detection - focus returned before timeout**
      if (pendingBlurTimeout) {
        clearTimeout(pendingBlurTimeout);
        pendingBlurTimeout = null;
        blurDetectedAt = null;
        console.log('⏹️ Cleared pending blur (focus returned within 500ms)');
      }
      
      if (!quiz || submitted || submitting) {
        return;
      }
      
      // User returned to quiz - clear the auto-submit timeout
      console.log('👀 User returned to quiz after switching away');
      if (tabSwitchTimeoutRef.current) {
        clearTimeout(tabSwitchTimeoutRef.current);
        tabSwitchTimeoutRef.current = null;
      }
      
      // **FIX: Only start penalty if this is a NEW violation that hasn't been penalized yet**
      // The visibility handler also does this, so we only do it here if visibility didn't catch it
      if (tabSwitchCount > lastPenalizedViolationRef.current && !isPenaltyActive) {
        console.log(`⏱️ Starting ${PENALTY_DURATION}s penalty timer for NEW violation #${tabSwitchCount} (last penalized: #${lastPenalizedViolationRef.current})`);
        lastPenalizedViolationRef.current = tabSwitchCount; // Mark as penalized
        setPenaltyTimeRemaining(PENALTY_DURATION);
        setIsPenaltyActive(true);
        setTotalPenaltyTimeUsed(prev => prev + PENALTY_DURATION);
        setWarningMessage(
          `⚠️ PENALTY TIME: You switched away from the quiz!\n\n` +
          `You must wait before continuing. This time is deducted from your exam time.\n\n` +
          `Remaining penalty: ${PENALTY_DURATION} seconds`
        );
        setShowWarningDialog(true);
        setIsTabSwitchBlocked(true);
      } else if (!isPenaltyActive) {
        // No NEW violation or penalty already active - unblock
        setIsTabSwitchBlocked(false);
        setShowWarningDialog(false);
      }
    };
    
    // Force fullscreen check at intervals - but be careful not to trigger false positives
    const fullscreenCheckInterval = setInterval(() => {
      // **FIX: Don't attempt re-entry if we're already transitioning**
      if (fullscreenTransitionRef.current) {
        console.log('⏳ Skipping fullscreen check: transition in progress');
        return;
      }
      
      const isCurrentlyFullscreen = !!(
        document.fullscreenElement ||
        document.webkitFullscreenElement ||
        document.mozFullScreenElement ||
        document.msFullscreenElement
      );
      
      // **FIX: Only log every 30 seconds to reduce noise, and don't auto-attempt**
      // We'll rely on the "Enter Fullscreen" button for user-gesture-required fullscreen
      if (!isCurrentlyFullscreen && quiz && !submitted && !isQuizLocked) {
        console.log('Fullscreen check: Not in fullscreen - user should click Enter Fullscreen button');
        // Don't automatically try to enter - this fails without user gesture
        // and causes blur/focus events that get detected as tab switches
      }
    }, 10000); // Check every 10 seconds instead of 5

    if (quiz && !submitted) {
      console.log('Setting up security event listeners');
      document.addEventListener('contextmenu', preventContextMenu, { capture: true });
      document.addEventListener('keydown', preventKeyShortcuts, { capture: true });
      document.addEventListener('visibilitychange', handleVisibilityChange);
      document.addEventListener('fullscreenchange', handleFullscreenChange);
      document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
      document.addEventListener('mozfullscreenchange', handleFullscreenChange);
      document.addEventListener('MSFullscreenChange', handleFullscreenChange);
      window.addEventListener('blur', handleWindowBlur);
      window.addEventListener('focus', handleWindowFocus);
      
      // Start bypass-resistant tab detection
      console.log('🛡️ Starting bypass-resistant tab detection...');
      const bypassDetectionCleanup = startBypassResistantTabDetection(handleBypassResistantTabSwitch);
      setBypassResistantDetection(bypassDetectionCleanup);
      
      // Force initial fullscreen
      setTimeout(() => {
        if (enterFullscreenRef.current) {
          enterFullscreenRef.current();
        }
      }, 500);
    }

    return () => {
      console.log('Cleaning up security event listeners');
      document.removeEventListener('contextmenu', preventContextMenu, { capture: true });
      document.removeEventListener('keydown', preventKeyShortcuts, { capture: true });
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
      document.removeEventListener('mozfullscreenchange', handleFullscreenChange);
      document.removeEventListener('MSFullscreenChange', handleFullscreenChange);
      window.removeEventListener('blur', handleWindowBlur);
      window.removeEventListener('focus', handleWindowFocus);
      clearInterval(fullscreenCheckInterval);
      
      // Cleanup bypass-resistant detection
      if (bypassResistantDetection && typeof bypassResistantDetection === 'function') {
        console.log('🧹 Cleaning up bypass-resistant tab detection');
        bypassResistantDetection();
      }
    };
  }, [quiz, submitted, handleVisibilityChange, handleFullscreenChange, isQuizLocked, handleBypassResistantTabSwitch, submitting]);

  // Load quiz data - but show security dialog first
  useEffect(() => {
    // First show security dialog before loading quiz
    if (!showSecurityDialog && !securityReport) {
      setShowSecurityDialog(true);
      return;
    }
    
    // Only load quiz after security check is completed
    if (!securityReport) return;
    
    const fetchQuizAttempt = async () => {
      try {
        setLoading(true);
        
        if (!attemptId || !localToken) {
          setError('Missing quiz attempt ID or authentication token');
          setLoading(false);
          return;
        }

        const response = await axios.get(`/api/student/quiz/attempt/${attemptId}`, {
          headers: { Authorization: `Bearer ${localToken}` }
        });

        const processedQuizData = {
          ...response.data,
          questions: response.data.questions?.map(question => ({
            ...question,
            options: typeof question.options === 'string' 
              ? question.options.split(' ').filter(opt => opt.trim() !== '')
              : Array.isArray(question.options) ? question.options : []
          })) || []
        };
        
        setQuiz(processedQuizData);
        
        // **FIX: Set quiz start time for grace period**
        quizStartTimeRef.current = Date.now();
        console.log('⏱️ Quiz start time set for grace period');
        
        // Store courseId for navigation
        if (response.data.courseId) {
          setCourseId(response.data.courseId);
        }
        
        if (response.data.timeLimit) {
          setTimeLeft(response.data.timeLimit * 60);
        }
        
        setLoading(false);
        
        // Enter fullscreen mode when quiz loads - using multiple approaches for broader browser support
        console.log('Setting up fullscreen entry');
        setTimeout(() => {
          console.log('Attempting immediate fullscreen entry');
          if (enterFullscreenRef.current) {
            enterFullscreenRef.current();
          }
          
          // Add a button for user-initiated fullscreen (browsers often require user interaction)
          const fullscreenButton = document.createElement('button');
          fullscreenButton.innerText = 'Enter Fullscreen Mode';
          fullscreenButton.style.position = 'fixed';
          fullscreenButton.style.top = '50%';
          fullscreenButton.style.left = '50%';
          fullscreenButton.style.transform = 'translate(-50%, -50%)';
          fullscreenButton.style.zIndex = '9999';
          fullscreenButton.style.padding = '20px';
          fullscreenButton.style.fontSize = '24px';
          fullscreenButton.style.backgroundColor = '#1976d2';
          fullscreenButton.style.color = 'white';
          fullscreenButton.style.border = 'none';
          fullscreenButton.style.borderRadius = '5px';
          fullscreenButton.style.cursor = 'pointer';
          fullscreenButton.onclick = () => {
            if (enterFullscreenRef.current) {
              enterFullscreenRef.current(true); // **FIX: Pass true for user-initiated fullscreen**
            }
            document.body.removeChild(fullscreenButton);
          };
          
          document.body.appendChild(fullscreenButton);
          
          // Auto-remove button after 5 seconds
          setTimeout(() => {
            if (document.body.contains(fullscreenButton)) {
              document.body.removeChild(fullscreenButton);
            }
          }, 5000);
        }, 1000);
      } catch (err) {
        console.error('Error loading quiz:', err);
        setError('Failed to load quiz. Please try again.');
        setLoading(false);
      }
    };

    fetchQuizAttempt();
  }, [attemptId, localToken, showSecurityDialog, securityReport]);

  // Security dialog handlers
  const handleSecurityProceed = (report) => {
    setSecurityReport(report);
    setShowSecurityDialog(false);
    
    // Start security monitoring during quiz
    if (report) {
      const cleanup = startSecurityMonitoring((violation) => {
        console.log('Security violation detected during quiz:', violation);
        setSecurityViolations(prev => [...prev, violation]);
      });
      setSecurityMonitor(cleanup);
    }
  };

  const handleSecurityCancel = () => {
    setShowSecurityDialog(false);
    navigate(-1); // Go back to previous page
  };

  // Cleanup security monitoring on unmount
  useEffect(() => {
    return () => {
      if (securityMonitor && typeof securityMonitor === 'function') {
        securityMonitor();
      }
      if (bypassResistantDetection && typeof bypassResistantDetection === 'function') {
        bypassResistantDetection();
      }
      if (continuousExtensionDetection && typeof continuousExtensionDetection === 'function') {
        continuousExtensionDetection();
      }
    };
  }, [securityMonitor, bypassResistantDetection, continuousExtensionDetection]);

  // Timer countdown
  useEffect(() => {
    if (timeLeft > 0 && !submitted && !isQuizLocked) {
      intervalRef.current = setTimeout(() => {
        setTimeLeft(timeLeft - 1);
      }, 1000);
    } else if (timeLeft === 0 && !submitted && !isQuizLocked) {
      if (autoSubmitQuizRef.current) {
        autoSubmitQuizRef.current();
      }
    }

    return () => {
      if (intervalRef.current) {
        clearTimeout(intervalRef.current);
      }
    };
  }, [timeLeft, submitted, isQuizLocked]);

  const handleAnswerChange = (questionId, selectedOption) => {
    if (isTabSwitchBlocked || isQuizLocked) return;
    
    setAnswers(prev => ({
      ...prev,
      [questionId]: parseInt(selectedOption)
    }));
  };

  const handleMarkForReview = (questionId) => {
    if (isTabSwitchBlocked || isQuizLocked) return;
    
    setMarkedForReview(prev => {
      const newSet = new Set(prev);
      if (newSet.has(questionId)) {
        newSet.delete(questionId);
      } else {
        newSet.add(questionId);
      }
      return newSet;
    });
  };

  const handleQuestionNavigation = (index) => {
    if (isTabSwitchBlocked || isQuizLocked) return;
    setCurrentQuestion(index);
  };

  const handleSubmitQuiz = async (isAutoSubmit = false) => {
    console.log('handleSubmitQuiz called with isAutoSubmit:', isAutoSubmit);
    if (submitting || (isQuizLocked && !isAutoSubmit)) {
      console.log('Submit blocked - submitting:', submitting, 'isQuizLocked:', isQuizLocked, 'isAutoSubmit:', isAutoSubmit);
      return;
    }
    
    try {
      setSubmitting(true);
      console.log('Starting quiz submission...');
      
      const formattedAnswers = Object.entries(answers).map(([questionId, selectedOption]) => ({
        questionId,
        selectedOption
      }));

      const submissionData = {
        answers: formattedAnswers,
        securityViolations,
        tabSwitchCount,
        isAutoSubmit,
        timeSpent: quiz.timeLimit ? (quiz.timeLimit * 60 - timeLeft) : 0
      };

      console.log('Submitting quiz with data:', submissionData);

      const response = await axios.post(`/api/student/quiz-attempt/${attemptId}/submit`, submissionData, {
        headers: { Authorization: `Bearer ${localToken}` }
      });

      console.log('Quiz submitted successfully:', response.data);
      setResult(response.data);
      setSubmitted(true);
      setSubmitting(false);
      
      // Check if quiz should be locked due to failure
      await checkAndHandleQuizLock(response.data);
      
      // Exit fullscreen after submission
      setTimeout(exitFullscreen, 1000);
    } catch (err) {
      console.error('Error submitting quiz:', err);
      
      if (isAutoSubmit) {
        // For auto-submit, force completion even if backend fails
        console.log('Auto-submit failed, forcing quiz completion locally');
        setResult({
          score: 0,
          maxScore: quiz.questions?.length || 10,
          percentage: 0,
          passed: false,
          message: 'Quiz auto-submitted due to security violations. Score could not be calculated due to server error.'
        });
        setSubmitted(true);
        setSubmitting(false);
        setTimeout(exitFullscreen, 1000);
      } else {
        setError('Failed to submit quiz. Please try again.');
        setSubmitting(false);
      }
    }
  };
  
  // Set the ref so autoSubmitQuiz can call handleSubmitQuiz
  useEffect(() => {
    handleSubmitQuizRef.current = handleSubmitQuiz;
  }, [handleSubmitQuiz]);

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getQuestionStatus = (questionId, index) => {
    if (answers.hasOwnProperty(questionId)) {
      return markedForReview.has(questionId) ? 'reviewed' : 'answered';
    }
    return markedForReview.has(questionId) ? 'marked' : 'unanswered';
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'answered': return 'success';
      case 'reviewed': return 'warning';
      case 'marked': return 'info';
      default: return 'default';
    }
  };

  const getStatusCounts = () => {
    const answered = Object.keys(answers).length;
    const marked = markedForReview.size;
    const total = quiz?.questions?.length || 0;
    const unanswered = total - answered;
    
    return { answered, marked, unanswered, total };
  };

  // Forced fullscreen effect - must be before any conditional returns
  useEffect(() => {
    if (quiz && !submitted && !isQuizLocked) {
      console.log('Forced fullscreen effect running');
      const fullscreenButton = document.createElement('button');
      fullscreenButton.id = 'forced-fullscreen-button';
      fullscreenButton.innerText = 'ENTER FULLSCREEN MODE TO CONTINUE';
      fullscreenButton.style.position = 'fixed';
      fullscreenButton.style.top = '50%';
      fullscreenButton.style.left = '50%';
      fullscreenButton.style.transform = 'translate(-50%, -50%)';
      fullscreenButton.style.zIndex = '9999';
      fullscreenButton.style.padding = '20px';
      fullscreenButton.style.fontSize = '24px';
      fullscreenButton.style.backgroundColor = '#f44336';
      fullscreenButton.style.color = 'white';
      fullscreenButton.style.border = 'none';
      fullscreenButton.style.borderRadius = '5px';
      fullscreenButton.style.cursor = 'pointer';
      
      fullscreenButton.onclick = () => {
        if (enterFullscreenRef.current) {
          enterFullscreenRef.current(true); // **FIX: Pass true for user-initiated fullscreen**
        }
        
        if (document.body.contains(fullscreenButton)) {
          document.body.removeChild(fullscreenButton);
        }
      };
      
      // Only add the button if it doesn't exist and we're not in fullscreen
      if (!document.getElementById('forced-fullscreen-button') && !isFullscreen) {
        document.body.appendChild(fullscreenButton);
        
        // Auto-remove after 5 seconds
        setTimeout(() => {
          if (document.body.contains(fullscreenButton)) {
            document.body.removeChild(fullscreenButton);
          }
        }, 5000);
      }
    }
    
    return () => {
      const fullscreenButton = document.getElementById('forced-fullscreen-button');
      if (fullscreenButton) {
        fullscreenButton.remove();
      }
    };
  }, [quiz, submitted, isQuizLocked, isFullscreen]);

  // Show security dialog first before loading quiz
  if (showSecurityDialog) {
    return (
      <Box sx={{ display: 'flex', minHeight: '100vh', bgcolor: 'background.default' }}>
        <SecurityWarningDialog
          open={showSecurityDialog}
          onProceed={handleSecurityProceed}
          onCancel={handleSecurityCancel}
        />
      </Box>
    );
  }

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>
        <CircularProgress />
        <Typography sx={{ ml: 2 }}>Loading secure quiz...</Typography>
      </Box>
    );
  }

  if (error) {
    return (
      <Box sx={{ p: 4, textAlign: 'center' }}>
        <Alert severity="error">{error}</Alert>
        <Button variant="contained" onClick={() => navigate(-1)} sx={{ mt: 2 }}>
          Go Back
        </Button>
      </Box>
    );
  }

  if (submitted && result) {
    return (
      <Box sx={{ p: 4, textAlign: 'center', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Paper sx={{ p: 4, maxWidth: 600 }}>
          <Box sx={{ mb: 3 }}>
            {result.passed ? (
              <CheckCircle color="success" sx={{ fontSize: 80 }} />
            ) : (
              <Block color="error" sx={{ fontSize: 80 }} />
            )}
          </Box>
          
          <Typography variant="h4" gutterBottom>
            Quiz {result.passed ? 'Completed!' : 'Submitted'}
          </Typography>
          
          <Grid container spacing={2} sx={{ mt: 2, mb: 3 }}>
            <Grid item xs={12} sm={4}>
              <Card>
                <CardContent>
                  <Typography variant="h6">Score</Typography>
                  <Typography variant="h4" color="primary">
                    {result.score}/{result.maxScore}
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
            <Grid item xs={12} sm={4}>
              <Card>
                <CardContent>
                  <Typography variant="h6">Percentage</Typography>
                  <Typography variant="h4" color={result.passed ? 'success.main' : 'error.main'}>
                    {result.percentage}%
                  </Typography>
                  {result.securityPenalty > 0 && (
                    <Typography variant="caption" color="warning.main" sx={{ display: 'block', mt: 1 }}>
                      Original: {((result.score / result.maxScore) * 100).toFixed(1)}% 
                      <br />
                      Penalty: -{result.securityPenalty}%
                    </Typography>
                  )}
                </CardContent>
              </Card>
            </Grid>
            <Grid item xs={12} sm={4}>
              <Card>
                <CardContent>
                  <Typography variant="h6">Status</Typography>
                  <Chip 
                    label={result.passed ? 'PASSED' : 'FAILED'} 
                    color={result.passed ? 'success' : 'error'}
                    size="large"
                  />
                </CardContent>
              </Card>
            </Grid>
          </Grid>

          {(securityViolations.length > 0 || result.violationsDetected > 0) && (
            <Alert severity="warning" sx={{ mb: 3 }}>
              <Typography variant="body2">
                Security violations detected: {result.violationsDetected || securityViolations.length}
                {result.securityPenalty > 0 && (
                  <>
                    <br />
                    Score penalty applied: -{result.securityPenalty}%
                  </>
                )}
              </Typography>
            </Alert>
          )}

          <Button 
            variant="contained" 
            onClick={() => navigate(courseId ? `/student/course/${courseId}/units` : '/student/courses')}
            size="large"
          >
            Continue
          </Button>
        </Paper>
      </Box>
    );
  }

  if (!quiz) {
    return (
      <Box sx={{ p: 4, textAlign: 'center' }}>
        <Alert severity="error">Quiz data not found.</Alert>
      </Box>
    );
  }

  const currentQ = quiz.questions[currentQuestion];
  const statusCounts = getStatusCounts();
  
  return (
    <Box sx={{ display: 'flex', minHeight: '100vh', bgcolor: 'background.default' }}>
      {/* Force auto-submit check */}
      {(tabSwitchCount >= MAX_TAB_SWITCHES || fsExitCount >= MAX_FULLSCREEN_EXITS) && !submitted && (
        <Box sx={{ 
          position: 'fixed', 
          top: 0, 
          left: 0, 
          right: 0, 
          bottom: 0, 
          bgcolor: 'rgba(0,0,0,0.9)', 
          zIndex: 9999,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}>
          <Paper sx={{ p: 4, textAlign: 'center', maxWidth: 500 }}>
            <Typography variant="h5" color="error" gutterBottom>
              Quiz Auto-Submitted
            </Typography>
            <Typography variant="body1" sx={{ mb: 2 }}>
              {tabSwitchCount >= MAX_TAB_SWITCHES 
                ? `Too many tab switches detected (${tabSwitchCount}/${MAX_TAB_SWITCHES})`
                : `Too many fullscreen exits detected (${fsExitCount}/${MAX_FULLSCREEN_EXITS})`
              }
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
              Your quiz has been automatically submitted due to security violations.
            </Typography>
            <CircularProgress />
            <Typography variant="body2" sx={{ mt: 1 }}>
              Processing submission...
            </Typography>
          </Paper>
        </Box>
      )}
      
      {/* Security Warning Dialog */}
      <Dialog open={showWarningDialog} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Warning color={extensionDetectedDuringQuiz ? "error" : isPenaltyActive ? "error" : "warning"} />
          {extensionDetectedDuringQuiz ? "Extension Detected!" : isPenaltyActive ? "⏱️ PENALTY TIME" : "Security Alert"}
        </DialogTitle>
        <DialogContent>
          {/* Penalty Timer Display */}
          {isPenaltyActive && penaltyTimeRemaining > 0 && (
            <Box sx={{ 
              textAlign: 'center', 
              mb: 3,
              p: 3, 
              bgcolor: 'error.main', 
              borderRadius: 2,
              color: 'white'
            }}>
              <Typography variant="h2" sx={{ fontWeight: 'bold', mb: 1 }}>
                {Math.floor(penaltyTimeRemaining / 60)}:{(penaltyTimeRemaining % 60).toString().padStart(2, '0')}
              </Typography>
              <Typography variant="h6">
                Wait time remaining
              </Typography>
              <Typography variant="body2" sx={{ mt: 1, opacity: 0.9 }}>
                This time is being deducted from your exam time
              </Typography>
            </Box>
          )}
          
          <Typography sx={{ whiteSpace: 'pre-line' }}>{warningMessage}</Typography>
          
          {extensionDetectedDuringQuiz && extensionWarningMessage && (
            <Box sx={{ mt: 2, p: 2, bgcolor: 'error.light', borderRadius: 1 }}>
              <Typography variant="body2" color="error.dark" fontWeight="bold" gutterBottom>
                ⚠️ Browser Extension Detected During Quiz
              </Typography>
              <Typography variant="body2" color="error.dark">
                {extensionWarningMessage}
              </Typography>
              <Typography variant="body2" color="error.dark" sx={{ mt: 1 }}>
                Please disable all browser extensions and restart your browser before retaking this quiz.
              </Typography>
            </Box>
          )}
          
          {tabSwitchCount > 0 && (
            <Box sx={{ mt: 2 }}>
              <Typography variant="body2" color="error">
                Tab switches: {tabSwitchCount}/{MAX_TAB_SWITCHES}
              </Typography>
              {totalPenaltyTimeUsed > 0 && (
                <Typography variant="body2" color="error">
                  Total penalty time used: {Math.floor(totalPenaltyTimeUsed / 60)}m {totalPenaltyTimeUsed % 60}s
                </Typography>
              )}
              {tabSwitchCount >= MAX_TAB_SWITCHES && (
                <Typography variant="body2" color="error" sx={{ fontWeight: 'bold', mt: 1 }}>
                  Maximum violations reached. Quiz will be auto-submitted.
                </Typography>
              )}
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          {/* Only show OK button if penalty is not active */}
          {!isPenaltyActive && (
            <Button onClick={() => setShowWarningDialog(false)}>OK</Button>
          )}
        </DialogActions>
      </Dialog>

      {/* Submit Confirmation Dialog */}
      <Dialog open={showSubmitDialog} maxWidth="sm" fullWidth>
        <DialogTitle>Confirm Submission</DialogTitle>
        <DialogContent>
          <Typography gutterBottom>
            Are you sure you want to submit your quiz?
          </Typography>
          <Box sx={{ mt: 2 }}>
            <Typography variant="body2">
              Answered: {statusCounts.answered} / {statusCounts.total}
            </Typography>
            <Typography variant="body2">
              Marked for review: {statusCounts.marked}
            </Typography>
            <Typography variant="body2">
              Unanswered: {statusCounts.unanswered}
            </Typography>
          </Box>
          {statusCounts.unanswered > 0 && (
            <Alert severity="warning" sx={{ mt: 2 }}>
              You have {statusCounts.unanswered} unanswered questions.
            </Alert>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowSubmitDialog(false)}>Cancel</Button>
          <Button variant="contained" onClick={() => {
            setShowSubmitDialog(false);
            handleSubmitQuiz();
          }}>
            Submit Quiz
          </Button>
        </DialogActions>
      </Dialog>

      {/* Sidebar Navigation - Mobile/Tablet Responsive */}
      {isSmallScreen ? (
        // SwipeableDrawer for mobile and tablet
        <SwipeableDrawer
          anchor="left"
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          onOpen={() => setDrawerOpen(true)}
          disableSwipeToOpen={false}
          swipeAreaWidth={20}
          ModalProps={{ keepMounted: true }}
          sx={{
            zIndex: 1400,
            '& .MuiDrawer-paper': {
              width: getDrawerWidth(),
              maxWidth: 360,
              boxSizing: 'border-box',
            },
          }}
        >
          {/* Question Navigation Header */}
          <Box sx={{ 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'space-between',
            p: { xs: 1.5, sm: 2 },
            borderBottom: '1px solid',
            borderColor: 'divider',
            bgcolor: 'primary.main',
            color: 'white',
            minHeight: { xs: 56, sm: 64 }
          }}>
            <Typography variant="h6" sx={{ fontWeight: 'bold', fontSize: { xs: '1rem', sm: '1.1rem' } }}>
              Questions
            </Typography>
            <IconButton 
              onClick={() => setDrawerOpen(false)} 
              size="small"
              sx={{ color: 'white' }}
            >
              <CloseIcon />
            </IconButton>
          </Box>
          
          {/* Status Summary - Compact for mobile */}
          <Box sx={{ p: { xs: 1.5, sm: 2 } }}>
            <Grid container spacing={1}>
              <Grid item xs={4}>
                <Box textAlign="center">
                  <Typography variant="h6" color="success.main" sx={{ fontSize: { xs: '1.1rem', sm: '1.25rem' } }}>
                    {statusCounts.answered}
                  </Typography>
                  <Typography variant="caption" sx={{ fontSize: { xs: '0.65rem', sm: '0.75rem' } }}>
                    Answered
                  </Typography>
                </Box>
              </Grid>
              <Grid item xs={4}>
                <Box textAlign="center">
                  <Typography variant="h6" color="warning.main" sx={{ fontSize: { xs: '1.1rem', sm: '1.25rem' } }}>
                    {statusCounts.marked}
                  </Typography>
                  <Typography variant="caption" sx={{ fontSize: { xs: '0.65rem', sm: '0.75rem' } }}>
                    Marked
                  </Typography>
                </Box>
              </Grid>
              <Grid item xs={4}>
                <Box textAlign="center">
                  <Typography variant="h6" color="text.secondary" sx={{ fontSize: { xs: '1.1rem', sm: '1.25rem' } }}>
                    {statusCounts.unanswered}
                  </Typography>
                  <Typography variant="caption" sx={{ fontSize: { xs: '0.65rem', sm: '0.75rem' } }}>
                    Unanswered
                  </Typography>
                </Box>
              </Grid>
            </Grid>
          </Box>
          <Divider />

          {/* Question List - Touch-friendly */}
          <List sx={{ flexGrow: 1, overflow: 'auto', py: 0 }}>
            {quiz.questions.map((question, index) => {
              const status = getQuestionStatus(question.questionId, index);
              const isActive = index === currentQuestion;
              
              return (
                <ListItem key={question.questionId} disablePadding>
                  <ListItemButton
                    selected={isActive}
                    onClick={() => {
                      handleQuestionNavigation(index);
                      if (isSmallScreen) setDrawerOpen(false);
                    }}
                    disabled={isTabSwitchBlocked || isQuizLocked}
                    sx={{
                      py: { xs: 1.5, sm: 1.25 },
                      minHeight: { xs: 56, sm: 52 }
                    }}
                  >
                    <ListItemIcon sx={{ minWidth: { xs: 44, sm: 48 } }}>
                      <Chip
                        label={index + 1}
                        color={getStatusColor(status)}
                        size="small"
                        variant={isActive ? "filled" : "outlined"}
                        sx={{ 
                          minWidth: { xs: 32, sm: 36 },
                          height: { xs: 32, sm: 36 },
                          fontSize: { xs: '0.85rem', sm: '0.9rem' }
                        }}
                      />
                    </ListItemIcon>
                    <ListItemText 
                      primary={`Q ${index + 1}`}
                      secondary={status.charAt(0).toUpperCase() + status.slice(1)}
                      primaryTypographyProps={{ 
                        fontSize: { xs: '0.95rem', sm: '1rem' },
                        fontWeight: isActive ? 600 : 400
                      }}
                      secondaryTypographyProps={{ 
                        fontSize: { xs: '0.7rem', sm: '0.75rem' } 
                      }}
                    />
                    {markedForReview.has(question.questionId) && (
                      <Flag color="warning" fontSize="small" />
                    )}
                  </ListItemButton>
                </ListItem>
              );
            })}
          </List>
        </SwipeableDrawer>
      ) : (
        // Desktop Drawer
        <Drawer
          variant="persistent"
          anchor="left"
          open={drawerOpen}
          sx={{
            width: getDrawerWidth(),
            flexShrink: 0,
            '& .MuiDrawer-paper': {
              width: getDrawerWidth(),
              boxSizing: 'border-box',
            },
          }}
        >
          <Toolbar>
            <Typography variant="h6">Questions</Typography>
          </Toolbar>
          <Divider />
          
          {/* Status Summary */}
          <Box sx={{ p: 2 }}>
            <Grid container spacing={1}>
              <Grid item xs={4}>
                <Box textAlign="center">
                  <Typography variant="h6" color="success.main">
                    {statusCounts.answered}
                  </Typography>
                  <Typography variant="caption">Answered</Typography>
                </Box>
              </Grid>
              <Grid item xs={4}>
                <Box textAlign="center">
                  <Typography variant="h6" color="warning.main">
                    {statusCounts.marked}
                  </Typography>
                  <Typography variant="caption">Marked</Typography>
                </Box>
              </Grid>
              <Grid item xs={4}>
                <Box textAlign="center">
                  <Typography variant="h6" color="text.secondary">
                    {statusCounts.unanswered}
                  </Typography>
                  <Typography variant="caption">Unanswered</Typography>
                </Box>
              </Grid>
            </Grid>
          </Box>
          <Divider />

          {/* Question List */}
          <List sx={{ flexGrow: 1, overflow: 'auto' }}>
            {quiz.questions.map((question, index) => {
              const status = getQuestionStatus(question.questionId, index);
              const isActive = index === currentQuestion;
              
              return (
                <ListItem key={question.questionId} disablePadding>
                  <ListItemButton
                    selected={isActive}
                    onClick={() => handleQuestionNavigation(index)}
                    disabled={isTabSwitchBlocked || isQuizLocked}
                  >
                    <ListItemIcon>
                      <Chip
                        label={index + 1}
                        color={getStatusColor(status)}
                        size="small"
                        variant={isActive ? "filled" : "outlined"}
                      />
                    </ListItemIcon>
                    <ListItemText 
                      primary={`Question ${index + 1}`}
                      secondary={status.charAt(0).toUpperCase() + status.slice(1)}
                    />
                    {markedForReview.has(question.questionId) && (
                      <Flag color="warning" fontSize="small" />
                    )}
                  </ListItemButton>
                </ListItem>
              );
            })}
          </List>
        </Drawer>
      )}

      {/* Mobile FAB to open question navigation */}
      {isSmallScreen && !drawerOpen && (
        <Fab
          color="secondary"
          aria-label="Open questions menu"
          onClick={() => setDrawerOpen(true)}
          size={isMobile ? "medium" : "large"}
          sx={{
            position: 'fixed',
            bottom: { xs: 90, sm: 100 },
            left: { xs: 16, sm: 20 },
            zIndex: 1300,
            boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
            width: { xs: 48, sm: 56 },
            height: { xs: 48, sm: 56 },
            '&:hover': {
              transform: 'scale(1.05)',
            }
          }}
        >
          <MenuIcon sx={{ fontSize: { xs: 22, sm: 26 } }} />
        </Fab>
      )}

      {/* Main Content - Mobile/Tablet Responsive */}
      <Box
        component="main"
        sx={{
          flexGrow: 1,
          width: { 
            xs: '100%', 
            md: drawerOpen ? `calc(100% - ${getDrawerWidth()}px)` : '100%' 
          },
          minHeight: '100vh',
          ml: { md: drawerOpen ? 0 : `-${getDrawerWidth()}px` },
          transition: theme.transitions.create(['margin', 'width'], {
            easing: theme.transitions.easing.sharp,
            duration: theme.transitions.duration.leavingScreen,
          }),
        }}
      >
        {/* Top Bar - Mobile Responsive */}
        <AppBar position="static" color="default" elevation={1}>
          <Toolbar sx={{ 
            flexWrap: { xs: 'wrap', sm: 'nowrap' },
            gap: { xs: 0.5, sm: 1 },
            py: { xs: 0.5, sm: 0 },
            minHeight: { xs: 'auto', sm: 64 },
            px: { xs: 1, sm: 2 }
          }}>
            {/* Mobile menu button */}
            {isSmallScreen && (
              <IconButton 
                onClick={() => setDrawerOpen(true)}
                size="small"
                sx={{ mr: { xs: 0.5, sm: 1 } }}
              >
                <MenuIcon fontSize={isMobile ? "small" : "medium"} />
              </IconButton>
            )}
            
            <QuizIcon sx={{ mr: { xs: 0.5, sm: 1 }, fontSize: { xs: 20, sm: 24 }, display: { xs: 'none', sm: 'block' } }} />
            <Box sx={{ 
              flexGrow: 1,
              minWidth: 0,
              overflow: 'hidden'
            }}>
              <Typography 
                variant="h6" 
                sx={{ 
                  fontSize: { xs: '0.85rem', sm: '1rem', md: '1.25rem' },
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis'
                }}
              >
                {quiz.unitTitle}
              </Typography>
              <Typography 
                variant="subtitle2" 
                color="text.secondary"
                sx={{ 
                  fontSize: { xs: '0.65rem', sm: '0.75rem' },
                  display: { xs: 'none', sm: 'block' }
                }}
              >
                {quiz.courseTitle}
              </Typography>
            </Box>
            
            {/* Security Indicators - Compact on mobile */}
            <Box sx={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: { xs: 0.5, sm: 1 },
              order: { xs: 3, sm: 0 },
              width: { xs: '100%', sm: 'auto' },
              justifyContent: { xs: 'center', sm: 'flex-end' },
              mt: { xs: 0.5, sm: 0 },
              py: { xs: 0.5, sm: 0 },
              borderTop: { xs: '1px solid', sm: 'none' },
              borderColor: 'divider'
            }}>
              <Tooltip title={`Tab switches: ${tabSwitchCount}/${MAX_TAB_SWITCHES}`}>
                <Badge badgeContent={tabSwitchCount} color="error">
                  <Security 
                    color={tabSwitchCount > 0 ? 'error' : 'action'} 
                    sx={{ fontSize: { xs: 18, sm: 22 } }}
                  />
                </Badge>
              </Tooltip>
              
              <Tooltip title={isFullscreen ? 'Fullscreen active' : 'Not in fullscreen'}>
                <VisibilityOff 
                  color={isFullscreen ? 'success' : 'error'} 
                  sx={{ fontSize: { xs: 18, sm: 22 } }}
                />
              </Tooltip>
              
              {/* Timer - Always visible */}
              {timeLeft !== null && (
                <Box sx={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: 0.5,
                  bgcolor: timeLeft < 300 ? 'error.light' : 'action.hover',
                  px: { xs: 1, sm: 1.5 },
                  py: 0.5,
                  borderRadius: 1,
                  ml: { xs: 0.5, sm: 1 }
                }}>
                  <AccessTime 
                    color={timeLeft < 300 ? 'error' : 'primary'} 
                    sx={{ fontSize: { xs: 16, sm: 20 } }}
                  />
                  <Typography 
                    variant="h6" 
                    color={timeLeft < 300 ? 'error.main' : 'text.primary'}
                    sx={{ 
                      fontSize: { xs: '0.9rem', sm: '1rem', md: '1.1rem' },
                      fontWeight: 'bold'
                    }}
                  >
                    {formatTime(timeLeft)}
                  </Typography>
                </Box>
              )}
            </Box>

            {/* Fullscreen button - desktop and tablet */}
            {!isMobile && (
              <IconButton 
                onClick={isFullscreen ? exitFullscreen : () => enterFullscreen(true)} 
                size="small" 
                sx={{ ml: 1 }}
              >
                {isFullscreen ? <FullscreenExit /> : <Fullscreen />}
              </IconButton>
            )}
          </Toolbar>
          
          <LinearProgress 
            variant="determinate" 
            value={(currentQuestion + 1) / quiz.questions.length * 100} 
            sx={{ height: { xs: 3, sm: 4 } }}
          />
        </AppBar>

        {/* Question Content - Mobile/Tablet Responsive */}
        <Box sx={{ 
          p: { xs: 1.5, sm: 2, md: 3 },
          pb: { xs: 12, sm: 3 } // Extra bottom padding on mobile for fixed navigation
        }}>
          <Paper sx={{ 
            p: { xs: 2, sm: 2.5, md: 3 }, 
            mb: { xs: 2, sm: 3 }
          }}>
            <Box sx={{ 
              display: 'flex', 
              flexDirection: { xs: 'column', sm: 'row' },
              justifyContent: 'space-between', 
              alignItems: { xs: 'flex-start', sm: 'center' }, 
              mb: 2,
              gap: 1
            }}>
              <Typography 
                variant="h5"
                sx={{ fontSize: { xs: '1.1rem', sm: '1.25rem', md: '1.5rem' } }}
              >
                Question {currentQuestion + 1} of {quiz.questions.length}
              </Typography>
              <Button
                variant="outlined"
                size={isMobile ? "small" : "medium"}
                startIcon={markedForReview.has(currentQ.questionId) ? <Bookmark /> : <BookmarkBorder />}
                onClick={() => handleMarkForReview(currentQ.questionId)}
                disabled={isTabSwitchBlocked || isQuizLocked}
                color={markedForReview.has(currentQ.questionId) ? 'warning' : 'inherit'}
                sx={{ 
                  fontSize: { xs: '0.75rem', sm: '0.875rem' },
                  alignSelf: { xs: 'flex-end', sm: 'auto' }
                }}
              >
                {markedForReview.has(currentQ.questionId) ? 'Unmark' : (isMobile ? 'Mark' : 'Mark for Review')}
              </Button>
            </Box>
            
            <Typography 
              variant="body1" 
              sx={{ 
                mb: { xs: 2, sm: 3 }, 
                fontSize: { xs: '0.95rem', sm: '1rem', md: '1.1rem' }, 
                lineHeight: 1.6 
              }}
            >
              {currentQ.questionText}
            </Typography>

            <FormControl component="fieldset" fullWidth disabled={isTabSwitchBlocked || isQuizLocked}>
              <RadioGroup
                value={answers[currentQ.questionId]?.toString() || ''}
                onChange={(e) => handleAnswerChange(currentQ.questionId, e.target.value)}
              >
                {currentQ.options.map((option, index) => (
                  <Paper
                    key={index}
                    variant="outlined"
                    sx={{
                      mb: 1,
                      p: { xs: 0.25, sm: 0.5 },
                      border: answers[currentQ.questionId] === index ? '2px solid' : '1px solid',
                      borderColor: answers[currentQ.questionId] === index ? 'primary.main' : 'divider',
                      '&:hover': {
                        backgroundColor: 'action.hover'
                      },
                      // Better touch target
                      minHeight: { xs: 52, sm: 'auto' }
                    }}
                  >
                    <FormControlLabel
                      value={index.toString()}
                      control={<Radio size={isMobile ? "small" : "medium"} />}
                      label={
                        <Typography sx={{ 
                          py: { xs: 0.5, sm: 1 }, 
                          fontSize: { xs: '0.9rem', sm: '1rem' } 
                        }}>
                          {String.fromCharCode(65 + index)}. {option}
                        </Typography>
                      }
                      sx={{ 
                        width: '100%', 
                        margin: 0, 
                        padding: { xs: 0.5, sm: 1 } 
                      }}
                    />
                  </Paper>
                ))}
              </RadioGroup>
            </FormControl>
          </Paper>

          {/* Navigation Buttons - Fixed at bottom on mobile */}
          <Box sx={{ 
            display: 'flex', 
            flexDirection: { xs: 'column', sm: 'row' },
            justifyContent: 'space-between', 
            alignItems: { xs: 'stretch', sm: 'center' },
            gap: { xs: 1, sm: 2 },
            position: { xs: 'fixed', sm: 'static' },
            bottom: { xs: 0, sm: 'auto' },
            left: { xs: 0, sm: 'auto' },
            right: { xs: 0, sm: 'auto' },
            p: { xs: 1.5, sm: 0 },
            bgcolor: { xs: 'background.paper', sm: 'transparent' },
            boxShadow: { xs: '0 -2px 10px rgba(0,0,0,0.1)', sm: 'none' },
            zIndex: { xs: 1200, sm: 'auto' }
          }}>
            {/* Progress info - hide on mobile when fixed */}
            <Box sx={{ 
              textAlign: 'center',
              order: { xs: -1, sm: 0 },
              display: { xs: 'none', sm: 'block' }
            }}>
              <Typography variant="body2" color="text.secondary">
                Progress: {statusCounts.answered} / {statusCounts.total} answered
              </Typography>
              {statusCounts.marked > 0 && (
                <Typography variant="body2" color="warning.main">
                  {statusCounts.marked} marked for review
                </Typography>
              )}
            </Box>
            
            {/* Navigation buttons row */}
            <Box sx={{
              display: 'flex',
              gap: { xs: 1, sm: 2 },
              width: { xs: '100%', sm: 'auto' },
              justifyContent: { xs: 'space-between', sm: 'flex-start' }
            }}>
              <Button
                variant="outlined"
                startIcon={<NavigateBefore />}
                onClick={() => setCurrentQuestion(Math.max(0, currentQuestion - 1))}
                disabled={currentQuestion === 0 || isTabSwitchBlocked || isQuizLocked}
                size={isMobile ? "medium" : "large"}
                sx={{ 
                  flex: { xs: 1, sm: 'none' },
                  fontSize: { xs: '0.8rem', sm: '0.875rem' }
                }}
              >
                {isMobile ? 'Prev' : 'Previous'}
              </Button>

              {currentQuestion === quiz.questions.length - 1 ? (
                <Button
                  variant="contained"
                  color="success"
                  startIcon={<Send />}
                  onClick={() => setShowSubmitDialog(true)}
                  disabled={isTabSwitchBlocked || isQuizLocked || submitting}
                  size={isMobile ? "medium" : "large"}
                  sx={{ 
                    flex: { xs: 1, sm: 'none' },
                    fontSize: { xs: '0.8rem', sm: '0.875rem' }
                  }}
                >
                  {submitting ? 'Submitting...' : 'Submit'}
                </Button>
              ) : (
                <Button
                  variant="contained"
                  endIcon={<NavigateNext />}
                  onClick={() => setCurrentQuestion(Math.min(quiz.questions.length - 1, currentQuestion + 1))}
                  disabled={isTabSwitchBlocked || isQuizLocked}
                  size={isMobile ? "medium" : "large"}
                  sx={{ 
                    flex: { xs: 1, sm: 'none' },
                    fontSize: { xs: '0.8rem', sm: '0.875rem' }
                  }}
                >
                  Next
                </Button>
              )}
            </Box>
          </Box>

          {/* Warning Messages - adjust for fixed nav on mobile */}
          {isTabSwitchBlocked && (
            <Alert severity="error" sx={{ mt: 2, mb: { xs: 10, sm: 2 } }}>
              Quiz is temporarily locked due to tab switching. Please wait or the quiz will be auto-submitted.
            </Alert>
          )}
          
          {!isFullscreen && !isSmallScreen && (
            <Alert severity="warning" sx={{ mt: 2 }}>
              Please stay in fullscreen mode during the quiz.
              <Button 
                size="small" 
                onClick={() => enterFullscreen(true)}
                sx={{ ml: 2 }}
              >
                Enter Fullscreen
              </Button>
            </Alert>
          )}
        </Box>
      </Box>
    </Box>
  );
};

export default SecureQuizPage;
