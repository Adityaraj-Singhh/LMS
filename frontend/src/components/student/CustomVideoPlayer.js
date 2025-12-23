import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {
  Box,
  Typography,
  Slider,
  IconButton,
  Paper,
  Grid,
  Tooltip,
  CircularProgress,
  Dialog,
  DialogContent,
  AppBar,
  Toolbar,
  Container,
  Alert,
  LinearProgress,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText
} from '@mui/material';
import {
  PlayArrow,
  Pause,
  VolumeUp,
  VolumeOff,
  Speed as SpeedIcon,
  Fullscreen,
  FullscreenExit,
  Close,
  Settings,
  Check,
  HighQuality
} from '@mui/icons-material';
import Hls from 'hls.js';
import { updateWatchHistory, getVideoResumePosition } from '../../api/studentVideoApi';
import { formatDuration } from '../../utils/videoUtils';
import VideoResumeDialog from './VideoResumeDialog';

// Production mode check - disable verbose logging
const IS_DEV = process.env.NODE_ENV === 'development';
const log = IS_DEV ? console.log.bind(console) : () => {};

const CustomVideoPlayer = ({ videoId, videoUrl, title, token, onTimeUpdate, onVideoComplete }) => {
  // Only log in development
  if (IS_DEV) {
    log('CustomVideoPlayer received videoUrl:', videoUrl);
  }
  
  const videoRef = useRef(null);
  const fullscreenVideoRef = useRef(null); // Separate ref for fullscreen video
  const videoContainerRef = useRef(null);
  const containerRef = useRef(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [error, setError] = useState(null);
  const [lastUpdateTime, setLastUpdateTime] = useState(Date.now());
  const [timeWatched, setTimeWatched] = useState(0);
  const [totalWatchTime, setTotalWatchTime] = useState(0);
  const [cumulativeWatchTime, setCumulativeWatchTime] = useState(0); // Total across all sessions including rewatches
  const [watchingSessions, setWatchingSessions] = useState([]);
  const [sessionStartTime, setSessionStartTime] = useState(null);
  const [previousPosition, setPreviousPosition] = useState(0);
  const [watchedSegments, setWatchedSegments] = useState(new Set()); // Track 5-second segments watched
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [controlsTimeout, setControlsTimeout] = useState(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [videoEnded, setVideoEnded] = useState(false);
  
  // Buffering and streaming optimization state
  const [isBuffering, setIsBuffering] = useState(false);
  const [bufferedPercent, setBufferedPercent] = useState(0);
  const [networkQuality, setNetworkQuality] = useState('good'); // 'good', 'medium', 'slow'
  const lastTimeUpdateRef = useRef(0); // Throttle timeUpdate
  const bufferCheckIntervalRef = useRef(null);
  
  // Resume functionality state
  const [showResumeDialog, setShowResumeDialog] = useState(false);
  const [resumePosition, setResumePosition] = useState(0);
  const [resumeData, setResumeData] = useState(null);
  const [videoInitialized, setVideoInitialized] = useState(false);

  // HLS.js state for Bunny Stream
  const hlsRef = useRef(null);
  const fullscreenHlsRef = useRef(null);
  const [availableQualities, setAvailableQualities] = useState([]);
  const [currentQuality, setCurrentQuality] = useState(-1); // -1 = auto, else level index
  const [qualityMenuAnchor, setQualityMenuAnchor] = useState(null);
  const [fullscreenQualityMenuAnchor, setFullscreenQualityMenuAnchor] = useState(null);
  const DEFAULT_QUALITY = 360; // Default quality in pixels (360p)
  const MAX_QUALITY = 720; // Maximum quality in pixels (720p)

  // Reset video initialization when videoId, videoUrl, or token changes
  useEffect(() => {
    setVideoInitialized(false);
    setShowResumeDialog(false);
    setResumeData(null);
    setResumePosition(0);
    setVideoEnded(false); // Reset video ended state for new videos
    setAvailableQualities([]); // Reset qualities for new video
    setCurrentQuality(-1); // Reset to auto
    log("🔄 Video or token changed - resetting all states");
  }, [videoId, videoUrl, token]);

  // Check if URL is HLS stream (.m3u8)
  const isHlsUrl = useMemo(() => {
    return videoUrl && (videoUrl.includes('.m3u8') || videoUrl.includes('/playlist.m3u8'));
  }, [videoUrl]);

  // Initialize HLS.js for Bunny Stream
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !videoUrl) return;

    // Check if this is an HLS stream
    if (isHlsUrl) {
      if (Hls.isSupported()) {
        log("🎬 Initializing HLS.js for Bunny Stream");
        
        // Destroy previous instance if exists
        if (hlsRef.current) {
          hlsRef.current.destroy();
        }

        const hls = new Hls({
          startLevel: -1, // Auto quality initially
          capLevelToPlayerSize: true,
          maxBufferLength: 30,
          maxMaxBufferLength: 60,
          enableWorker: true,
          lowLatencyMode: false,
        });

        hls.loadSource(videoUrl);
        hls.attachMedia(video);

        hls.on(Hls.Events.MANIFEST_PARSED, (event, data) => {
          log(`📊 HLS manifest parsed: ${data.levels.length} quality levels available`);
          
          // Filter and map quality levels (max 720p)
          const qualities = data.levels
            .map((level, index) => ({
              index,
              height: level.height,
              width: level.width,
              bitrate: level.bitrate,
              label: `${level.height}p`
            }))
            .filter(q => q.height <= MAX_QUALITY)
            .sort((a, b) => a.height - b.height);
          
          setAvailableQualities(qualities);
          
          // Set default quality to 360p if available
          const defaultLevel = qualities.find(q => q.height === DEFAULT_QUALITY);
          if (defaultLevel) {
            hls.currentLevel = defaultLevel.index;
            setCurrentQuality(defaultLevel.index);
            log(`📺 Set default quality to ${DEFAULT_QUALITY}p`);
          } else if (qualities.length > 0) {
            // Fallback to lowest available quality
            hls.currentLevel = qualities[0].index;
            setCurrentQuality(qualities[0].index);
            log(`📺 Set fallback quality to ${qualities[0].height}p`);
          }
          
          setLoading(false);
        });

        hls.on(Hls.Events.LEVEL_SWITCHED, (event, data) => {
          const level = hls.levels[data.level];
          if (level) {
            log(`📺 Quality switched to: ${level.height}p`);
          }
        });

        hls.on(Hls.Events.ERROR, (event, data) => {
          console.error('HLS Error:', data);
          if (data.fatal) {
            switch (data.type) {
              case Hls.ErrorTypes.NETWORK_ERROR:
                console.error('HLS network error - attempting recovery');
                hls.startLoad();
                break;
              case Hls.ErrorTypes.MEDIA_ERROR:
                console.error('HLS media error - attempting recovery');
                hls.recoverMediaError();
                break;
              default:
                console.error('HLS fatal error - destroying');
                setError('Video playback error. Please try again.');
                hls.destroy();
                break;
            }
          }
        });

        hlsRef.current = hls;

        return () => {
          if (hlsRef.current) {
            hlsRef.current.destroy();
            hlsRef.current = null;
          }
        };
      } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        // Safari native HLS support
        log("🍎 Using Safari native HLS");
        video.src = videoUrl;
      }
    } else {
      // Regular video URL (MP4, etc.)
      log("📹 Using regular video source");
      video.src = videoUrl;
    }
  }, [videoUrl, isHlsUrl]);

  // Handle quality change
  const handleQualityChange = (levelIndex) => {
    log(`📺 Changing quality to level ${levelIndex}`);
    setCurrentQuality(levelIndex);
    
    if (hlsRef.current) {
      hlsRef.current.currentLevel = levelIndex;
    }
    
    setQualityMenuAnchor(null);
    setFullscreenQualityMenuAnchor(null);
  };

  // Get current quality label
  const getCurrentQualityLabel = () => {
    if (currentQuality === -1) return 'Auto';
    const quality = availableQualities.find(q => q.index === currentQuality);
    return quality ? quality.label : 'Auto';
  };

  // Automatically check for resume position when video is ready (after metadata loads)
  useEffect(() => {
    // Only check once per video, when video is ready but not initialized yet
    if (videoId && token && !videoInitialized && !showResumeDialog && duration > 0) {
      log("🔍 Auto-checking resume position on video load...");
      
      const autoCheckResume = async () => {
        try {
          const hasResumePosition = await checkResumePosition();
          if (hasResumePosition) {
            log("📍 Found resume position on load - showing dialog");
          } else {
            log("▶️ No resume position found on load");
          }
        } catch (error) {
          console.error("Error in auto resume check:", error);
        }
      };
      
      // Small delay to ensure video is fully ready
      const timer = setTimeout(autoCheckResume, 500);
      return () => clearTimeout(timer);
    }
  }, [videoId, token, duration, videoInitialized, showResumeDialog]);

  // Detect network quality for adaptive behavior
  useEffect(() => {
    const detectNetworkQuality = () => {
      const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
      if (connection) {
        const { effectiveType, downlink } = connection;
        if (effectiveType === '4g' && downlink > 5) {
          setNetworkQuality('good');
        } else if (effectiveType === '3g' || (effectiveType === '4g' && downlink <= 5)) {
          setNetworkQuality('medium');
        } else {
          setNetworkQuality('slow');
        }
        log(`📶 Network: ${effectiveType}, Downlink: ${downlink}Mbps, Quality: ${networkQuality}`);
      }
    };
    
    detectNetworkQuality();
    const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    if (connection) {
      connection.addEventListener('change', detectNetworkQuality);
      return () => connection.removeEventListener('change', detectNetworkQuality);
    }
  }, []);

  // Update buffered progress periodically
  useEffect(() => {
    const updateBufferProgress = () => {
      const video = videoRef.current;
      if (video && video.buffered.length > 0 && video.duration > 0) {
        const bufferedEnd = video.buffered.end(video.buffered.length - 1);
        const percent = (bufferedEnd / video.duration) * 100;
        setBufferedPercent(percent);
      }
    };
    
    bufferCheckIntervalRef.current = setInterval(updateBufferProgress, 1000);
    return () => {
      if (bufferCheckIntervalRef.current) {
        clearInterval(bufferCheckIntervalRef.current);
      }
    };
  }, [videoUrl]);

  // Simplified URL accessibility check (removed verbose logging)
  useEffect(() => {
    if (videoUrl && videoUrl.trim() !== '' && IS_DEV) {
      fetch(videoUrl, { method: 'HEAD', mode: 'cors' })
        .then(res => log('✅ Video URL accessible:', res.status))
        .catch(() => log('⚠️ Video URL HEAD check failed (normal for S3)'));
    }
  }, [videoUrl]);

  // Speed options
  const speedOptions = [0.5, 0.75, 1, 1.25, 1.5, 2];

  // Check for resume position when play is clicked
  const checkResumePosition = async () => {
    if (!videoId || !token) {
      console.log("🔍 Cannot check resume position - missing videoId or token");
      log("🔍 Cannot check resume position - missing videoId or token");
      return false;
    }
    
    try {
      console.log(`🔍 Checking resume position for video ${videoId}`);
      log(`🔍 Checking resume position for video ${videoId} (rewatch support enabled)`);
      const resumeInfo = await getVideoResumePosition(videoId, token);
      console.log(`🔍 Resume API response:`, resumeInfo);
      log(`🔍 Resume API response:`, resumeInfo);
      
      if (resumeInfo.hasResumePosition) {
        const progressPercent = (resumeInfo.currentPosition / resumeInfo.videoDuration) * 100;
        console.log(`📍 Found resume position: ${resumeInfo.currentPosition}s (${progressPercent.toFixed(1)}% of video)`);
        log(`📍 Found resume position: ${resumeInfo.currentPosition}s (${progressPercent.toFixed(1)}% of video)`);
        setResumeData(resumeInfo);
        setResumePosition(resumeInfo.currentPosition);
        setShowResumeDialog(true);
        return true; // Has resume position, show dialog
      } else {
        console.log(`📍 No meaningful resume position found (position: ${resumeInfo.currentPosition}s, threshold not met)`);
        log(`📍 No meaningful resume position found (position: ${resumeInfo.currentPosition}s, threshold not met)`);
        return false; // No resume position, play normally
      }
    } catch (error) {
      console.error('Error checking resume position:', error);
      console.error('Error details:', error.response?.data || error.message);
      return false; // Error, play normally
    }
  };

  // Helper function to get the currently active video element
  // Now always returns videoRef since we use native fullscreen on same video
  const getActiveVideoRef = () => {
    return videoRef;
  };

  // Initialize the video
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    // Function to handle canplay event
    const handleCanPlay = () => setLoading(false);
    
    // Function to directly handle duration changes
    const handleDurationChange = () => {
      const newDuration = video.duration;
      if (!isNaN(newDuration) && newDuration > 0) {
        log(`Duration changed to: ${newDuration}s`);
        setDuration(newDuration);
      }
    };
    
    // Handle visibility change to prevent flickering when switching tabs
    const handleVisibilityChange = () => {
      if (document.hidden) {
        // Tab is now hidden
        log("Tab hidden, preserving video state");
        // Save playing state but don't change it
        if (video.paused === false) {
          video.dataset.wasPlaying = "true";
        }
      } else {
        // Tab is now visible again
        log("Tab visible again, restoring video state");
        // Only handle restoration if the video was playing before
        if (video.dataset.wasPlaying === "true") {
          // Clear the flag
          video.dataset.wasPlaying = "";
          
          // Only try to play if the component still thinks it's playing
          if (isPlaying) {
            log("Attempting to resume playback after tab switch");
            const playPromise = video.play();
            if (playPromise !== undefined) {
              playPromise.catch(error => {
                console.error("Error resuming video after tab switch:", error);
              });
            }
          }
        }
      }
    };
    
    // Set initial volume and playback rate
    video.volume = volume;
    video.playbackRate = playbackRate;
    video.muted = isMuted;

    // Event listeners
    video.addEventListener('loadedmetadata', handleLoadedMetadata);
    video.addEventListener('durationchange', handleDurationChange); 
    video.addEventListener('timeupdate', handleTimeUpdate);
    video.addEventListener('ended', handleVideoEnded);
    video.addEventListener('canplay', handleCanPlay);
    video.addEventListener('error', handleVideoError);
    video.addEventListener('play', handlePlay);
    video.addEventListener('pause', handlePause);
    video.addEventListener('seeked', handleSeeked); // Prevent seeking
    
    // Add visibility change listener to handle tab switching
    document.addEventListener('visibilitychange', handleVisibilityChange);
    // Add keyboard event listener to prevent seeking shortcuts
    document.addEventListener('keydown', handleKeyDown);

    // Force loading of metadata if already loaded
    if (video.readyState >= 1) {
      handleLoadedMetadata();
    }
    
    // Force duration update if already available
    if (video.duration > 0 && !isNaN(video.duration)) {
      handleDurationChange();
    }
    
    // Force loading indicator off if already can play
    if (video.readyState >= 3) {
      setLoading(false);
    }

    return () => {
      // Clean up event listeners
      video.removeEventListener('loadedmetadata', handleLoadedMetadata);
      video.removeEventListener('durationchange', handleDurationChange);
      video.removeEventListener('timeupdate', handleTimeUpdate);
      video.removeEventListener('ended', handleVideoEnded);
      video.removeEventListener('canplay', handleCanPlay);
      video.removeEventListener('error', handleVideoError);
      video.removeEventListener('play', handlePlay);
      video.removeEventListener('pause', handlePause);
      video.removeEventListener('seeked', handleSeeked); // Remove seeking prevention
      
      // Remove visibility change listener
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      // Remove keyboard event listener
      document.removeEventListener('keydown', handleKeyDown);
      
      // Update watch time when component unmounts
      updateWatchTime(true);
    };
    // We're intentionally excluding some dependencies like volume, playbackRate, isMuted,
    // isPlaying, duration, and currentTime because we don't want to reinitialize the
    // video player every time these values change
    // eslint-disable-next-line
  }, [videoUrl]);

  // Update watch time at reasonable intervals - only when meaningful progress is made
  useEffect(() => {
    const intervalId = setInterval(() => {
      const video = getActiveVideoRef().current;
      // Only save if we have meaningful watch time accumulated AND video is playing
      if (isPlaying && video && video.currentTime > 0.5 && totalWatchTime > 2) {
        log(`⏰ Periodic save: Position ${video.currentTime.toFixed(2)}s, Total time: ${totalWatchTime.toFixed(2)}s`);
        updateWatchTime(false);
      }
    }, 15000); // Every 15 seconds to prevent excessive API calls

    return () => clearInterval(intervalId);
    // eslint-disable-next-line
  }, [isPlaying, totalWatchTime]);

  // Add a special effect for handling component unmount (page navigation/refresh)
  useEffect(() => {
    return () => {
      // Component is unmounting (page refresh, navigation, etc.)
      const video = getActiveVideoRef().current;
      if (video && video.currentTime > 0 && token && videoId) {
        log("🔄 Component unmounting - emergency position save");
        log(`🔄 Saving position on unmount: ${video.currentTime.toFixed(2)}s, Total watch time: ${totalWatchTime.toFixed(2)}s`);
        
        // Final synchronous save to ensure data is not lost
        try {
          const finalData = {
            timeSpent: Math.max(0.1, totalWatchTime || 0),
            sessionTime: totalWatchTime,
            segmentTime: cumulativeWatchTime,
            currentTime: video.currentTime,
            duration: video.duration || duration,
            playbackRate: playbackRate || 1,
            isCompleted: false,
            timestamp: new Date().toISOString(),
            isFinal: true,
            sessionCount: watchingSessions.length,
            segmentsWatched: watchedSegments.size,
            totalSegments: video.duration > 0 ? Math.ceil(video.duration / 5) : 0,
            completionPercentage: video.duration > 0 ? Math.min(100, (cumulativeWatchTime / video.duration) * 100) : 0,
            speedAdjustedTime: totalWatchTime,
            realTimeSpent: watchingSessions.reduce((sum, session) => sum + (session.realTime || 0), 0)
          };
          
          // Use synchronous XHR for guaranteed delivery on unmount
          const xhr = new XMLHttpRequest();
          const url = `/api/student/video/${videoId}/watch`;
          
          xhr.open('POST', url, false); // Synchronous
          xhr.setRequestHeader('Content-Type', 'application/json');
          xhr.setRequestHeader('Authorization', `Bearer ${token}`);
          xhr.send(JSON.stringify(finalData));
          
          log(`🔄 Unmount save ${xhr.status === 200 ? 'successful' : 'failed'}: ${xhr.status}`);
        } catch (error) {
          console.error("Error in unmount save:", error);
        }
      }
    };
  }, [videoId, totalWatchTime, cumulativeWatchTime, watchedSegments.size, token, duration, playbackRate, watchingSessions]);

  const handleLoadedMetadata = () => {
    if (!videoRef.current) return;

    // Get duration directly from the video element
    const videoDuration = videoRef.current.duration;
    log(`Video metadata loaded. Raw duration: ${videoDuration}s`);
    
    // ALWAYS use the actual video file duration if it's valid, regardless of what's in the database
    if (!isNaN(videoDuration) && videoDuration > 0) {
      log(`Setting valid duration from video file: ${videoDuration}s`);
      setDuration(videoDuration);
      
      // Also store the duration as a data attribute on the video element
      // so we can retrieve it if needed later
      videoRef.current.dataset.duration = videoDuration;
      
      // ALWAYS notify parent component of the correct duration (fixes sidebar duration display)
      if (onTimeUpdate) {
        onTimeUpdate(0, videoDuration);
      }
    } else {
      console.warn("Got invalid duration from metadata event, will retry...");
      
      // Try to get duration using a different approach - try to read it after a delay
      setTimeout(() => {
        if (videoRef.current) {
          const retryDuration = videoRef.current.duration;
          log(`Retry getting duration: ${retryDuration}s`);
          
          if (!isNaN(retryDuration) && retryDuration > 0) {
            log(`Setting duration from retry: ${retryDuration}s`);
            setDuration(retryDuration);
            videoRef.current.dataset.duration = retryDuration;
            
            // Notify parent component
            if (onTimeUpdate) {
              onTimeUpdate(0, retryDuration);
            }
          } else {
            // If still can't get duration, try a more aggressive approach
            // Start playing for a moment to force duration to be calculated
            console.warn("Still can't get duration, trying to play briefly to force metadata load");
            const originalMuted = videoRef.current.muted;
            videoRef.current.muted = true; // Mute to avoid unexpected sound
            
            const playPromise = videoRef.current.play();
            if (playPromise !== undefined) {
              playPromise.then(() => {
                // Successfully started playing
                setTimeout(() => {
                  // Get duration after playing briefly
                  const forcedDuration = videoRef.current.duration;
                  log(`Got duration after forcing play: ${forcedDuration}s`);
                  
                  // Pause the video again
                  videoRef.current.pause();
                  videoRef.current.muted = originalMuted;
                  
                  if (!isNaN(forcedDuration) && forcedDuration > 0) {
                    setDuration(forcedDuration);
                    videoRef.current.dataset.duration = forcedDuration;
                    
                    // Notify parent component
                    if (onTimeUpdate) {
                      onTimeUpdate(0, forcedDuration);
                    }
                  } else {
                    // Last resort - log warning but don't set arbitrary duration
                    console.error("Could not determine video duration from file. This may cause display issues.");
                    // Only use fallback if absolutely necessary and log it clearly
                    setDuration(60); // 1 minute fallback instead of 100 seconds
                  }
                }, 500);
              }).catch(error => {
                console.error("Error in forced play attempt:", error);
                videoRef.current.muted = originalMuted;
                // Use minimal fallback duration
                setDuration(60);
              });
            }
          }
        }
      }, 1000);
    }
    
    // Turn off loading indicator if appropriate
    if (videoRef.current.readyState >= 3) {
      setLoading(false);
    }
    
    // Set playback properties
    if (videoRef.current) {
      videoRef.current.volume = volume;
      videoRef.current.playbackRate = playbackRate;
      videoRef.current.muted = isMuted;
    }
  };

  // Throttled time update for better performance - runs ~4 times per second instead of 15-30
  const handleTimeUpdate = useCallback(() => {
    const video = getActiveVideoRef().current;
    if (!video) return;
    
    const now = Date.now();
    // Throttle to max 4 updates per second (250ms) for smoother performance
    if (now - lastTimeUpdateRef.current < 250) {
      return;
    }
    lastTimeUpdateRef.current = now;
    
    // Update current position
    const newCurrentTime = video.currentTime;
    setCurrentTime(newCurrentTime);
    
    // CRITICAL: Always prioritize actual video file duration over stored duration
    const videoDuration = video.duration;
    if (!isNaN(videoDuration) && videoDuration > 0) {
      // If we don't have a duration set, or if there's a significant difference, update it
      if ((duration === 0 || isNaN(duration)) || Math.abs(duration - videoDuration) > 1) {
        log(`🔄 Correcting duration: ${duration}s → ${videoDuration}s (from video file)`);
        setDuration(videoDuration);
        video.dataset.duration = videoDuration;
        
        // ALWAYS notify parent component of the correct duration (this fixes sidebar display)
        if (onTimeUpdate) {
          onTimeUpdate(newCurrentTime, videoDuration);
        }
      } else {
        // Even if duration matches, ensure parent component has the correct value
        if (onTimeUpdate && videoDuration !== duration) {
          onTimeUpdate(newCurrentTime, videoDuration);
        }
      }
    }
    
    // Track continuous playback during active session
    if (isPlaying && sessionStartTime) {
      const timeSinceLastUpdate = (now - lastUpdateTime) / 1000;
      
      // Only update if reasonable time has passed (between 0.1 and 2 seconds)
      if (timeSinceLastUpdate >= 0.1 && timeSinceLastUpdate <= 2) {
        // Track the current 5-second segment
        if (videoDuration > 0) {
          const currentSegment = Math.floor(newCurrentTime / 5);
          setWatchedSegments(prev => {
            const newSegments = new Set(prev);
            newSegments.add(currentSegment);
            
            // Update cumulative time based on unique segments
            const totalSegmentsWatched = newSegments.size;
            const segmentBasedTime = totalSegmentsWatched * 5;
            setCumulativeWatchTime(Math.min(segmentBasedTime, videoDuration));
            
            return newSegments;
          });
        }
        
        setLastUpdateTime(now);
      }
    }
    
    // Call the onTimeUpdate callback if provided
    if (onTimeUpdate) {
      onTimeUpdate(newCurrentTime, videoDuration > 0 ? videoDuration : duration);
    }
  }, [duration, isPlaying, sessionStartTime, lastUpdateTime, onTimeUpdate]);

  const handleVideoEnded = () => {
    // Mark the video as completed when it ends
    setIsPlaying(false);
    setVideoEnded(true);
    log("🎬 Video ended naturally - will be marked as complete");
    
    // End the current watching session if active
    if (sessionStartTime) {
      const sessionEnd = Date.now();
      const sessionRealTime = (sessionEnd - sessionStartTime) / 1000;
      const video = getActiveVideoRef().current;
      const currentPos = video ? video.currentTime : duration;
      
      if (sessionRealTime >= 0.5) {
        // Calculate actual video time for this final session, accounting for playback speed
        const videoTimeWatched = Math.abs(currentPos - previousPosition);
        const adjustedVideoTime = sessionRealTime * playbackRate;
        const actualWatchTime = Math.min(adjustedVideoTime, videoTimeWatched + (playbackRate * 1));
        
        // Complete the segment tracking
        if (video && video.duration > 0) {
          const startSegment = Math.floor(previousPosition / 5);
          const endSegment = Math.floor(currentPos / 5);
          const totalSegments = Math.ceil(video.duration / 5);
          
          const newSegments = new Set(watchedSegments);
          for (let i = startSegment; i <= Math.min(endSegment, totalSegments - 1); i++) {
            newSegments.add(i);
          }
          
          setWatchedSegments(newSegments);
          setCumulativeWatchTime(Math.min(newSegments.size * 5, video.duration));
        }
        
        setWatchingSessions(prev => [...prev, {
          start: sessionStartTime,
          end: sessionEnd,
          realTime: sessionRealTime,
          playbackRate: playbackRate,
          adjustedTime: actualWatchTime,
          videoPosition: currentPos,
          startPosition: previousPosition,
          isEndingSession: true
        }]);
        
        setTotalWatchTime(prev => prev + actualWatchTime);
        log(`🏁 Final session: Real time ${sessionRealTime.toFixed(2)}s at ${playbackRate}x = ${actualWatchTime.toFixed(2)}s video time, Cumulative: ${cumulativeWatchTime.toFixed(2)}s`);
      }
      
      setSessionStartTime(null);
    }
    
    // Set a flag to indicate this video has ended
    if (videoRef.current) {
      videoRef.current.dataset.ended = "true";
    }
    
    // Force update with completion status
    if (cumulativeWatchTime > 0 || totalWatchTime > 0) {
      updateWatchTime(true);
    }
    
    // Notify parent after delay
    setTimeout(() => {
      if (videoRef.current && onVideoComplete && videoRef.current.dataset.notified !== "true") {
        log(`🎯 Video completed - notifying parent`);
        videoRef.current.dataset.notified = "true";
        onVideoComplete(videoId);
      }
    }, 500);
    
    log(`🎬 Video ended - Total: ${totalWatchTime.toFixed(2)}s, Cumulative: ${cumulativeWatchTime.toFixed(2)}s`);
  };

  const handleVideoError = (e) => {
    console.error('Video error:', e);
    console.error('Video error details:', {
      error: e,
      videoUrl: videoUrl,
      videoElement: e.target,
      networkState: e.target?.networkState,
      readyState: e.target?.readyState,
      videoError: e.target?.error,
      videoErrorCode: e.target?.error?.code,
      videoErrorMessage: e.target?.error?.message,
      currentSrc: e.target?.currentSrc,
      src: e.target?.src
    });

    // More detailed error reporting based on error code
    let errorMessage = 'Error loading video. Please try again later.';
    if (e.target?.error?.code) {
      switch (e.target.error.code) {
        case 1: // MEDIA_ERR_ABORTED
          errorMessage = 'Video playback was aborted by the user.';
          break;
        case 2: // MEDIA_ERR_NETWORK
          errorMessage = 'Network error occurred while loading the video.';
          console.error('Network error - checking URL accessibility:', videoUrl);
          break;
        case 3: // MEDIA_ERR_DECODE
          errorMessage = 'Error occurred while decoding the video.';
          break;
        case 4: // MEDIA_ERR_SRC_NOT_SUPPORTED
          errorMessage = 'Video format not supported or source not found.';
          console.error('Source not supported - URL:', videoUrl);
          break;
        default:
          errorMessage = `Unknown video error (code: ${e.target.error.code}).`;
      }
    }
    
    setError(errorMessage);
    setLoading(false);
  };

  // Track when video starts playing
  const handlePlay = () => {
    log("Video play event triggered");
    setIsPlaying(true);
    
    // Start a new watching session
    const sessionStart = Date.now();
    setSessionStartTime(sessionStart);
    setLastUpdateTime(sessionStart);
    
    // Record the starting position for this session
    const video = getActiveVideoRef().current;
    if (video) {
      setPreviousPosition(video.currentTime);
      video.dataset.wasPlaying = "true";
      log(`🎥 Video started playing at ${video.currentTime.toFixed(2)}/${video.duration.toFixed(2)} - Session started`);
    }
  };

  // Track when video is paused
  const handlePause = () => {
    log("Video pause event triggered");
    setIsPlaying(false);
    
    // End the current watching session
    if (sessionStartTime) {
      const sessionEnd = Date.now();
      const sessionRealTime = (sessionEnd - sessionStartTime) / 1000; // Real time spent
      
      // Only count sessions longer than 0.5 seconds to avoid accidental clicks
      if (sessionRealTime >= 0.5) {
        const video = getActiveVideoRef().current;
        const currentPos = video ? video.currentTime : previousPosition;
        
        // Calculate actual video time watched during this session
        const videoTimeWatched = Math.abs(currentPos - previousPosition);
        
        // Account for playback speed: if watching at 2x speed, real time should be multiplied by speed
        const adjustedVideoTime = sessionRealTime * playbackRate;
        
        // Use the minimum of calculated video time and position difference to prevent abuse
        const actualWatchTime = Math.min(adjustedVideoTime, videoTimeWatched + (playbackRate * 1)); // Allow speed-adjusted buffer
        
        // Add watched segments to our tracking (in 5-second chunks)
        if (video && video.duration > 0) {
          const startSegment = Math.floor(previousPosition / 5);
          const endSegment = Math.floor(currentPos / 5);
          const newSegments = new Set(watchedSegments);
          
          for (let i = startSegment; i <= endSegment; i++) {
            newSegments.add(i);
          }
          setWatchedSegments(newSegments);
          
          // Calculate cumulative time based on unique segments watched
          const totalSegmentsWatched = newSegments.size;
          const segmentBasedTime = totalSegmentsWatched * 5; // Each segment = 5 seconds
          setCumulativeWatchTime(Math.min(segmentBasedTime, video.duration));
        }
        
        const sessionRecord = {
          start: sessionStartTime,
          end: sessionEnd,
          realTime: sessionRealTime,
          playbackRate: playbackRate,
          adjustedTime: actualWatchTime,
          videoPosition: currentPos,
          startPosition: previousPosition,
          segmentsAdded: Math.abs(Math.floor(currentPos / 5) - Math.floor(previousPosition / 5)) + 1
        };
        
        setWatchingSessions(prev => [...prev, sessionRecord]);
        setTotalWatchTime(prev => prev + actualWatchTime);
        
        log(`⏸️ Session ended:`);
        log(`   Real Time: ${sessionRealTime.toFixed(2)}s at ${playbackRate}x speed`);
        log(`   Adjusted Time: ${actualWatchTime.toFixed(2)}s`);
        log(`   Position: ${previousPosition.toFixed(2)}s → ${currentPos.toFixed(2)}s`);
        log(`   Total Time: ${(totalWatchTime + actualWatchTime).toFixed(2)}s`);
        log(`   Cumulative: ${cumulativeWatchTime.toFixed(2)}s`);
      }
      
      setSessionStartTime(null);
    }
    
    // Clear the playing state flag
    const video = getActiveVideoRef().current;
    if (video) {
      video.dataset.wasPlaying = "";
    }
    
    // CRITICAL: Save current position immediately when paused for resume functionality
    log("💾 Immediate save on pause for page refresh protection");
    updateWatchTime(false);
  };

  const updateWatchTime = async (isFinal = false) => {
    try {
      // Check if we have both token and videoId before proceeding
      if (!token) {
        console.warn('Cannot update watch history: Token is missing');
        return;
      }
      
      if (!videoId) {
        console.warn('Cannot update watch history: Video ID is missing');
        return;
      }
      
      log(`💾 updateWatchTime called (isFinal: ${isFinal}) - ensuring position is saved for refresh scenarios`);
      log(`💾 Current watch data: Time=${totalWatchTime.toFixed(2)}s, Segments=${cumulativeWatchTime.toFixed(2)}s, Sessions=${watchingSessions.length}`);
      
      // Calculate different time metrics accounting for playback speed
      let sessionBasedTime = totalWatchTime;
      let segmentBasedTime = cumulativeWatchTime;
      
      // If currently playing, add the current session time adjusted for playback speed
      if (isPlaying && sessionStartTime) {
        const currentSessionRealTime = (Date.now() - sessionStartTime) / 1000;
        // Adjust for playback speed: if watching at 2x, 30 seconds real time = 60 seconds of video content
        const currentSessionVideoTime = currentSessionRealTime * playbackRate;
        sessionBasedTime += currentSessionVideoTime;
      }
      
      // Use the more accurate metric (segment-based for rewatches, session-based for linear viewing)
      // For session-based time, reduce slightly to account for pauses but don't reduce segment-based time
      const timeToReport = Math.max(segmentBasedTime, sessionBasedTime * 0.9);
      
      // Only report if we have actual time to report or if this is a final update
      if (timeToReport > 0.1 || isFinal) {
        // Ensure timeSpent is a valid number
        const sanitizedTimeToReport = Math.max(0.1, timeToReport || 0);
        
        // Calculate completion status with stricter criteria
        const completionThreshold = 0.98; // 98% completion threshold (stricter)
        
        // Get current position from the actual video element, not the state - ALWAYS use video element
        const video = getActiveVideoRef().current;
        const currentPos = video && !isNaN(video.currentTime) ? video.currentTime : (currentTime || 0);
        const totalDuration = video && video.duration && !isNaN(video.duration) ? video.duration : (duration || 100);
        
        log(`💾 Saving video position: ${currentPos.toFixed(2)}s / ${totalDuration.toFixed(2)}s (isFinal: ${isFinal})`);
        log(`💾 Video element state: currentTime=${video?.currentTime}, duration=${video?.duration}, paused=${video?.paused}`);
        
        // Stricter completion logic - require BOTH position AND time thresholds to be met
        const isPositionCompleted = totalDuration > 0 && (currentPos / totalDuration) >= completionThreshold;
        const isTimeCompleted = totalDuration > 0 && timeToReport >= (totalDuration * completionThreshold);
        const isSegmentCompleted = totalDuration > 0 && (segmentBasedTime / totalDuration) >= completionThreshold;
        
        // For short videos (< 30 seconds), require even stricter criteria
        const isShortVideo = totalDuration < 30;
        let isCompleted = false;
        
        if (isFinal && videoEnded) {
          // Only mark complete if video actually ended
          isCompleted = true;
          log("✅ Video marked complete: Video ended naturally");
        } else if (isShortVideo) {
          // For short videos, require 99% AND both position and time criteria
          const strictThreshold = 0.99;
          const strictPositionComplete = (currentPos / totalDuration) >= strictThreshold;
          const strictTimeComplete = timeToReport >= (totalDuration * strictThreshold);
          isCompleted = strictPositionComplete && strictTimeComplete;
          log(`📏 Short video (${totalDuration}s): Position ${strictPositionComplete}, Time ${strictTimeComplete} = Complete: ${isCompleted}`);
        } else {
          // For longer videos, require position AND (time OR segments) thresholds
          isCompleted = isPositionCompleted && (isTimeCompleted || isSegmentCompleted);
          log(`📏 Long video: Position ${isPositionCompleted}, Time ${isTimeCompleted}, Segments ${isSegmentCompleted} = Complete: ${isCompleted}`);
        }
        
        // Prepare detailed analytics data
        const analyticsData = {
          timeSpent: sanitizedTimeToReport,
          sessionTime: sessionBasedTime,
          segmentTime: segmentBasedTime,
          currentTime: currentPos,
          duration: totalDuration,
          playbackRate: playbackRate || 1,
          isCompleted: isCompleted,
          timestamp: new Date().toISOString(),
          isFinal: isFinal,
          sessionCount: watchingSessions.length + (sessionStartTime ? 1 : 0),
          segmentsWatched: watchedSegments.size,
          totalSegments: totalDuration > 0 ? Math.ceil(totalDuration / 5) : 0,
          completionPercentage: totalDuration > 0 ? Math.min(100, (segmentBasedTime / totalDuration) * 100) : 0,
          averageSessionLength: watchingSessions.length > 0 
            ? watchingSessions.reduce((sum, session) => sum + (session.adjustedTime || session.duration || 0), 0) / watchingSessions.length 
            : 0,
          speedAdjustedTime: sessionBasedTime, // Total time accounting for playback speed
          realTimeSpent: watchingSessions.reduce((sum, session) => sum + (session.realTime || session.duration || 0), 0) // Actual real time spent
        };
        
        log(`📊 Sending enhanced analytics:`);
        log(`   📽️ Reported Time: ${sanitizedTimeToReport.toFixed(2)}s (${Math.floor(sanitizedTimeToReport/60)}m ${Math.floor(sanitizedTimeToReport%60)}s)`);
        log(`   🎬 Session Time: ${sessionBasedTime.toFixed(2)}s (speed-adjusted)`);
        log(`   ⚡ Real Time: ${analyticsData.realTimeSpent.toFixed(2)}s at avg ${playbackRate}x speed`);
        log(`   🧩 Segment Time: ${segmentBasedTime.toFixed(2)}s`);
        log(`   📍 Position: ${currentPos.toFixed(2)}/${totalDuration.toFixed(2)}s`);
        log(`   🔢 Segments: ${watchedSegments.size}/${analyticsData.totalSegments}`);
        log(`   📈 Completion: ${analyticsData.completionPercentage.toFixed(1)}%`);
        log(`   ✅ Completed: ${isCompleted}`);
        
        // Send to backend
        const response = await updateWatchHistory(videoId, analyticsData, token);
        log("✅ Watch history updated successfully:", response);

        // Reset tracking if successful and not a final update
        if (!isFinal) {
          setTotalWatchTime(0);
          setWatchingSessions([]);
          // Keep cumulative time and segments for continued tracking
        }
        
        // If this is a final update and the video is completed, notify parent
        if (isFinal && isCompleted && onVideoComplete) {
          log(`🎯 Final completion notification for video ${videoId}`);
          onVideoComplete(videoId);
        }
      } else {
        log('⏭️ Skipping update - insufficient watch time accumulated');
      }
    } catch (err) {
      console.error('❌ Error updating watch history:', err);
      
      // If it's a 403 error (video locked), log it but don't fail loudly
      if (err.response?.status === 403) {
        console.warn('⚠️ Video is locked - watch history not saved. Debug info:', err.response?.data?.debug);
        console.warn('This might indicate the video was not properly unlocked after completing the previous content.');
      } else {
        console.error('Full error details:', {
          status: err.response?.status,
          data: err.response?.data,
          message: err.message
        });
      }
    }
  };

  const togglePlay = async () => {
    const video = getActiveVideoRef().current;
    if (!video) return;
    
    // Check if video element is still in the document
    if (!document.contains(video)) {
      log("⚠️ Video element not in document, skipping togglePlay");
      return;
    }

    log("Toggle play called, current state:", isPlaying ? "playing" : "paused");
    log("Current videoInitialized state:", videoInitialized);
    log("Current showResumeDialog state:", showResumeDialog);
    
    try {
      if (isPlaying) {
        // Pause the video
        video.pause();
        // This will trigger handlePause event handler
      } else {
        // Check for resume position on first play attempt only (when not initialized and dialog not showing)
        if (!videoInitialized && !showResumeDialog) {
          log("🎬 First play attempt, checking for resume position...");
          log("🔍 VideoId:", videoId, "Token exists:", !!token);
          
          const hasResumePosition = await checkResumePosition();
          
          if (hasResumePosition) {
            log("📍 Resume dialog will be shown, waiting for user choice");
            return; // Wait for user to choose resume or start over
          } else {
            log("▶️ No resume position, playing normally");
            setVideoInitialized(true);
          }
        }

        // Try to play and handle any errors
        const playPromise = video.play();
        if (playPromise !== undefined) {
          playPromise.catch(error => {
            // Only log meaningful errors (not AbortError when transitioning)
            if (error.name !== 'AbortError') {
              console.error("Error in togglePlay:", error);
            }
            // Reset state if play fails
            setIsPlaying(false);
          });
        }
        // handlePlay event handler will be triggered on success
      }
    } catch (error) {
      console.error("Exception in togglePlay:", error);
      // Ensure state is consistent in case of errors
      setIsPlaying(video.paused === false);
    }
  };

  const toggleMute = () => {
    // Apply to both video elements
    const newMutedState = !isMuted;
    if (videoRef.current) {
      videoRef.current.muted = newMutedState;
    }
    if (fullscreenVideoRef.current) {
      fullscreenVideoRef.current.muted = newMutedState;
    }
    setIsMuted(newMutedState);
  };

  const handleVolumeChange = (event, newValue) => {
    // Apply to both video elements
    if (videoRef.current) {
      videoRef.current.volume = newValue;
    }
    if (fullscreenVideoRef.current) {
      fullscreenVideoRef.current.volume = newValue;
    }
    setVolume(newValue);
    setIsMuted(newValue === 0);
  };

  const handleSpeedChange = (speed) => {
    // Apply to both video elements
    if (videoRef.current) {
      videoRef.current.playbackRate = speed;
    }
    if (fullscreenVideoRef.current) {
      fullscreenVideoRef.current.playbackRate = speed;
    }
    setPlaybackRate(speed);
  };

  // Prevent seeking - videos are undraggable for students
  const handleProgressChange = (event, newValue) => {
    // Disable seeking to prevent students from jumping ahead
    // Progress bar is now display-only
    return;
  };

  // Prevent seeking by handling the seeked event
  const handleSeeked = (e) => {
    if (videoRef.current && currentTime > 0) {
      // If user tries to seek forward beyond current position, reset to last valid position
      // Allow seeking backward (rewinding) but not forward
      if (videoRef.current.currentTime > currentTime + 1) { // +1 second tolerance
        log(`🚫 Seeking prevented: ${videoRef.current.currentTime.toFixed(2)}s → ${currentTime.toFixed(2)}s`);
        videoRef.current.currentTime = currentTime;
      }
    }
  };

  // Prevent keyboard seeking (arrow keys, etc.)
  const handleKeyDown = (e) => {
    // Prevent arrow key seeking and other video shortcuts
    if (e.target === videoRef.current || videoRef.current?.contains(e.target)) {
      const keyCode = e.keyCode || e.which;
      // Block arrow keys (37-40), space (32), enter (13), home (36), end (35), page up/down (33, 34)
      if ([32, 33, 34, 35, 36, 37, 38, 39, 40].includes(keyCode)) {
        e.preventDefault();
        log(`🚫 Keyboard shortcut blocked: ${e.key}`);
        return false;
      }
    }
  };

  // Toggle fullscreen mode - uses native browser fullscreen API
  const toggleFullScreen = async () => {
    const container = videoContainerRef.current;
    const video = videoRef.current;
    
    if (!container || !video) {
      log("❌ Cannot toggle fullscreen - refs not available");
      return;
    }
    
    try {
      if (!document.fullscreenElement && !document.webkitFullscreenElement) {
        // Entering fullscreen - use native browser fullscreen on container
        log(`🎬 Entering native fullscreen at position: ${video.currentTime}s`);
        
        if (container.requestFullscreen) {
          await container.requestFullscreen();
        } else if (container.webkitRequestFullscreen) {
          await container.webkitRequestFullscreen();
        } else if (container.msRequestFullscreen) {
          await container.msRequestFullscreen();
        } else if (video.webkitEnterFullscreen) {
          // iOS Safari fallback - fullscreen on video element directly
          await video.webkitEnterFullscreen();
        }
        
        setIsFullScreen(true);
        log("✅ Entered native fullscreen");
        
      } else {
        // Exiting fullscreen
        log(`🔄 Exiting native fullscreen from position: ${video.currentTime}s`);
        
        if (document.exitFullscreen) {
          await document.exitFullscreen();
        } else if (document.webkitExitFullscreen) {
          await document.webkitExitFullscreen();
        } else if (document.msExitFullscreen) {
          await document.msExitFullscreen();
        }
        
        setIsFullScreen(false);
        log("✅ Exited native fullscreen");
      }
    } catch (error) {
      console.error("Fullscreen error:", error);
      log("❌ Fullscreen error:", error.message);
    }
  };
  
  // Listen for fullscreen changes (user pressing Escape, etc.)
  useEffect(() => {
    const handleFullscreenChange = () => {
      const isCurrentlyFullscreen = !!(document.fullscreenElement || document.webkitFullscreenElement);
      setIsFullScreen(isCurrentlyFullscreen);
      // Keep dialog state in sync (not used anymore but kept for compatibility)
      setIsDialogOpen(isCurrentlyFullscreen);
      log(`📺 Fullscreen state changed: ${isCurrentlyFullscreen}`);
    };
    
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
    };
  }, []);

  // Check if we have a valid duration - ALWAYS prioritize actual video file duration
  const getDisplayDuration = () => {
    // Use the most reliable source for duration - prioritize actual video file
    const video = getActiveVideoRef().current;
    if (video && video.duration && !isNaN(video.duration) && video.duration > 0) {
      // If the video element has a duration, always use it (this is the real file duration)
      return video.duration;
    } else if (video && video.dataset.duration) {
      // Check if we stored a valid duration from previous metadata load
      const storedDuration = parseFloat(video.dataset.duration);
      if (!isNaN(storedDuration) && storedDuration > 0) {
        return storedDuration;
      }
    } else if (duration && !isNaN(duration) && duration > 0) {
      // Use component state duration as last resort
      return duration;
    }
    // Minimal fallback if nothing else works
    console.warn("No valid duration found, using minimal fallback");
    return 60; // 1 minute fallback instead of 2 minutes
  };

  // Get a valid current time value
  const getDisplayCurrentTime = () => {
    const video = getActiveVideoRef().current;
    if (video && !isNaN(video.currentTime)) {
      return video.currentTime;
    } else if (!isNaN(currentTime)) {
      return currentTime;
    }
    return 0;
  };
  
  // Show controls when mouse moves over video
  const handleMouseMove = () => {
    setShowControls(true);
    
    // Clear any existing timeout
    if (controlsTimeout) {
      clearTimeout(controlsTimeout);
    }
    
    // Set timeout to hide controls after 3 seconds of inactivity
    const timeout = setTimeout(() => {
      if (isPlaying) {
        setShowControls(false);
      }
    }, 3000);
    
    setControlsTimeout(timeout);
  };

  // Clear timeout when component unmounts
  useEffect(() => {
    return () => {
      if (controlsTimeout) {
        clearTimeout(controlsTimeout);
      }
    };
  }, [controlsTimeout]);
  
  // Add an effect to handle page visibility changes and beforeunload
  useEffect(() => {
    // Function to handle page visibility changes
    const handlePageVisibility = () => {
      if (document.visibilityState === 'hidden') {
        // Page is now hidden - save current position immediately
        log("💾 Page hidden - saving video position urgently");
        // Force immediate save with current video position
        const video = getActiveVideoRef().current;
        if (video && video.currentTime > 0) {
          log(`💾 Saving position on page hide: ${video.currentTime.toFixed(2)}s`);
          updateWatchTime(false);
        }
        // If currently playing, remember this state
        if (isPlaying) {
          // We don't pause here because that would trigger unwanted state changes
          // The video element visibility handler will handle this
        }
      } else if (document.visibilityState === 'visible') {
        // Page is now visible
        log("👁️ Page visible again - restoring player state");
        // Refresh the player state - force a re-render
        if (videoRef.current) {
          // Update duration if needed
          if (videoRef.current.duration > 0 && videoRef.current.duration !== duration) {
            setDuration(videoRef.current.duration);
          }
          
          // Make sure play/pause state is synchronized
          setIsPlaying(videoRef.current.paused === false);
        }
      }
    };
    
    // Function to handle beforeunload (when user closes browser/tab or refreshes)
    const handleBeforeUnload = (e) => {
      log("🚪 Page unloading/refreshing - saving final video position");
      const video = getActiveVideoRef().current;
      if (video && video.currentTime > 0) {
        log(`🚪 Final position save on unload/refresh: ${video.currentTime.toFixed(2)}s`);
        
        // For page refresh scenarios, use synchronous XHR for reliable save
        try {
          // Calculate current watch data for immediate save
          const currentWatchData = {
            timeSpent: Math.max(0.1, totalWatchTime || 0),
            sessionTime: totalWatchTime,
            segmentTime: cumulativeWatchTime,
            currentTime: video.currentTime,
            duration: video.duration || duration,
            playbackRate: playbackRate || 1,
            isCompleted: false,
            timestamp: new Date().toISOString(),
            isFinal: true,
            sessionCount: watchingSessions.length,
            segmentsWatched: watchedSegments.size,
            totalSegments: video.duration > 0 ? Math.ceil(video.duration / 5) : 0,
            completionPercentage: video.duration > 0 ? Math.min(100, (cumulativeWatchTime / video.duration) * 100) : 0,
            speedAdjustedTime: totalWatchTime,
            realTimeSpent: watchingSessions.reduce((sum, session) => sum + (session.realTime || 0), 0)
          };
          
          log("💾 Refresh save data:", currentWatchData);
          
          // Try async API call first
          updateWatchTime(true);
          
          // Backup: Use synchronous XHR for page refresh reliability
          if (token && videoId && video.currentTime > 0) {
            const xhr = new XMLHttpRequest();
            const url = `/api/student/video/${videoId}/watch`;
            
            xhr.open('POST', url, false); // false = synchronous
            xhr.setRequestHeader('Content-Type', 'application/json');
            xhr.setRequestHeader('Authorization', `Bearer ${token}`);
            
            try {
              xhr.send(JSON.stringify(currentWatchData));
              log(`� Synchronous save ${xhr.status === 200 ? 'successful' : 'failed'} on page refresh`);
            } catch (xhrError) {
              console.error("Synchronous XHR failed:", xhrError);
            }
          }
        } catch (error) {
          console.error("Error saving on unload:", error);
        }
      }
    };

    // Function to handle pagehide (more reliable than beforeunload)
    const handlePageHide = (e) => {
      log("🔒 Page hide event - emergency position save");
      const video = getActiveVideoRef().current;
      if (video && video.currentTime > 0) {
        log(`🔒 Emergency save on page hide: ${video.currentTime.toFixed(2)}s`);
        updateWatchTime(true);
      }
    };

    // Add event listeners with priority order
    document.addEventListener('visibilitychange', handlePageVisibility);
    window.addEventListener('beforeunload', handleBeforeUnload);
    window.addEventListener('pagehide', handlePageHide); // More reliable for mobile/modern browsers
    
    // Cleanup
    return () => {
      document.removeEventListener('visibilitychange', handlePageVisibility);
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('pagehide', handlePageHide);
    };
  }, [isPlaying, duration, updateWatchTime]);

  // Handle resume dialog choices
  const handleResumeFromPosition = async () => {
    setShowResumeDialog(false);
    setVideoInitialized(true);
    
    if (videoRef.current && resumePosition > 0) {
      videoRef.current.currentTime = resumePosition;
      setCurrentTime(resumePosition);
      log(`📍 Resumed video at ${resumePosition}s`);
      
      // Start playing from resume position
      try {
        const playPromise = videoRef.current.play();
        if (playPromise !== undefined) {
          await playPromise;
          log(`▶️ Video playing from resume position`);
        }
      } catch (error) {
        console.error("Error playing video from resume position:", error);
      }
    }
  };

  const handleStartFromBeginning = async () => {
    setShowResumeDialog(false);
    setVideoInitialized(true);
    
    if (videoRef.current) {
      videoRef.current.currentTime = 0;
      setCurrentTime(0);
      log(`📍 Starting video from beginning`);
      
      // Start playing from beginning
      try {
        const playPromise = videoRef.current.play();
        if (playPromise !== undefined) {
          await playPromise;
          log(`▶️ Video playing from beginning`);
        }
      } catch (error) {
        console.error("Error playing video from beginning:", error);
      }
    }
  };

  const handleResumeDialogClose = () => {
    // Default to starting from beginning if user closes dialog
    handleStartFromBeginning();
  };

  // Handle case when video URL is not available
  if (!videoUrl || videoUrl.trim() === '') {
    return (
      <Paper 
        elevation={2} 
        sx={{ 
          borderRadius: { xs: 0, sm: 2 }, 
          overflow: 'hidden',
          width: '100%',
          maxWidth: '100%',
          minHeight: '300px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#f5f5f5'
        }}
      >
        <Box sx={{ textAlign: 'center', p: 4 }}>
          <Typography variant="h6" color="text.secondary" gutterBottom>
            Video Not Available
          </Typography>
          <Typography variant="body2" color="text.secondary">
            The video content is currently unavailable. Please contact your instructor.
          </Typography>
        </Box>
      </Paper>
    );
  }

  return (
    <>
      {/* Regular Player */}
      <Paper 
        elevation={2} 
        sx={{ 
          borderRadius: { xs: 0, sm: 2 }, 
          overflow: 'hidden',
          width: '100%',
          maxWidth: '100%',
          // Fullscreen styles
          '&:fullscreen': {
            width: '100vw',
            height: '100vh',
            borderRadius: 0,
            backgroundColor: '#000',
          },
          '&:-webkit-full-screen': {
            width: '100vw',
            height: '100vh',
            borderRadius: 0,
            backgroundColor: '#000',
          }
        }}
        ref={videoContainerRef}
      >
        {/* Video Player */}
        <Box 
          sx={{ 
            position: 'relative', 
            width: '100%', 
            backgroundColor: '#000',
            overflow: 'hidden',
            // Add CSS to prevent shivering effect
            willChange: 'transform',
            // Apply hardware acceleration to prevent visual glitches
            transform: 'translateZ(0)',
            // Ensure proper aspect ratio on mobile
            aspectRatio: { xs: '16/9', sm: 'auto' }
          }}
          onMouseMove={handleMouseMove}
          onTouchStart={() => setShowControls(true)}
        >
          {/* Loading/Buffering Overlay - unified for both states */}
          {(loading || isBuffering) && (
            <Box
              sx={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                alignItems: 'center',
                zIndex: 10,
                backgroundColor: 'rgba(0,0,0,0.5)',
                gap: 1
              }}
            >
              <CircularProgress color="primary" size={loading ? 40 : 32} />
              {isBuffering && !loading && (
                <Typography variant="caption" sx={{ color: 'white', opacity: 0.8 }}>
                  Buffering... {bufferedPercent.toFixed(0)}%
                </Typography>
              )}
              {networkQuality === 'slow' && (
                <Typography variant="caption" sx={{ color: '#ffab40', fontSize: '0.7rem' }}>
                  Slow connection detected
                </Typography>
              )}
            </Box>
          )}
          
          {/* Buffer progress bar - shows how much is pre-loaded */}
          {!loading && bufferedPercent > 0 && bufferedPercent < 100 && (
            <LinearProgress 
              variant="determinate" 
              value={bufferedPercent}
              sx={{
                position: 'absolute',
                bottom: showControls ? 70 : 4,
                left: 0,
                right: 0,
                height: 3,
                opacity: 0.5,
                backgroundColor: 'rgba(255,255,255,0.1)',
                '& .MuiLinearProgress-bar': {
                  backgroundColor: 'rgba(255,255,255,0.3)'
                },
                transition: 'bottom 0.3s ease'
              }}
            />
          )}

          <video
            ref={videoRef}
            key="main-video-player"
            // src is set by HLS.js for m3u8 streams, or directly for regular videos
            src={isHlsUrl ? undefined : videoUrl}
            style={{ 
              width: '100%',
              height: isFullScreen ? '100%' : 'auto',
              display: 'block', 
              maxHeight: isFullScreen ? '100vh' : (window.innerWidth < 600 ? '250px' : '500px'),
              objectFit: 'contain',
              // Prevent shivering with hardware acceleration
              transform: 'translateZ(0)',
              willChange: 'transform',
              // Ensure smoother rendering
              imageRendering: 'optimizeQuality',
              // Smooth video rendering
              backfaceVisibility: 'hidden',
              WebkitBackfaceVisibility: 'hidden',
              // Ensure video is visible
              backgroundColor: '#000'
            }}
            playsInline
            // Adaptive preload based on network quality
            preload={networkQuality === 'slow' ? 'metadata' : 'auto'}
            autoPlay={false}
            muted={isMuted}
            poster="" // Empty poster to prevent flickering when switching tabs
            controlsList="nodownload noremoteplayback nofullscreen"
            // Crossorigin for better caching with CDN/S3
            crossOrigin="anonymous"
            onContextMenu={e => e.preventDefault()} // Disable right-click menu
            // Buffering event handlers
            onWaiting={() => { setIsBuffering(true); log("⏳ Video buffering..."); }}
            onCanPlay={() => { setIsBuffering(false); setLoading(false); }}
            onCanPlayThrough={() => { setIsBuffering(false); log("✅ Can play through"); }}
            onStalled={() => log("⚠️ Video stalled")}
            onSuspend={() => log("📥 Video download suspended")}
            onProgress={() => {
              // Update buffer on progress
              const video = videoRef.current;
              if (video && video.buffered.length > 0 && video.duration > 0) {
                const bufferedEnd = video.buffered.end(video.buffered.length - 1);
                setBufferedPercent((bufferedEnd / video.duration) * 100);
              }
            }}
            onLoadedMetadata={handleLoadedMetadata}
            onLoadedData={() => {
              if (videoRef.current && videoRef.current.duration > 0) {
                setDuration(videoRef.current.duration);
                log(`Video loaded data, duration: ${videoRef.current.duration}s`);
              }
            }}
            onClick={togglePlay}
            onPlay={() => setIsPlaying(true)}
            onPause={() => setIsPlaying(false)}
            onTimeUpdate={handleTimeUpdate}
            onEnded={handleVideoEnded}
          />

          {error && (
            <Box
              sx={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                backgroundColor: 'rgba(0,0,0,0.7)',
                color: 'white',
                p: 2
              }}
            >
              <Typography variant="h6">{error}</Typography>
            </Box>
          )}

          {/* Overlay Controls - Only show when showControls is true */}
          {showControls && (
            <Box
              sx={{
                position: 'absolute',
                bottom: 0,
                left: 0,
                right: 0,
                p: { xs: 1, sm: 1.5 },
                backgroundColor: 'rgba(0,0,0,0.7)',
                transition: 'opacity 0.3s',
                opacity: showControls ? 1 : 0,
                pointerEvents: showControls ? 'auto' : 'none',
              }}
            >
              {/* Progress bar - disabled to prevent seeking */}
              <Slider
                value={getDisplayCurrentTime()}
                max={getDisplayDuration()}
                onChange={handleProgressChange}
                disabled={true}
                aria-label="video progress (view only)"
                sx={{ 
                  color: 'primary.main',
                  height: { xs: 6, sm: 8 },
                  '& .MuiSlider-thumb': {
                    width: { xs: 12, sm: 16 },
                    height: { xs: 12, sm: 16 },
                    transition: '0.3s cubic-bezier(.47,1.64,.41,.8)',
                    '&::before': {
                      boxShadow: '0 2px 12px 0 rgba(0,0,0,0.4)',
                    },
                    '&:hover, &.Mui-focusVisible': {
                      boxShadow: 'none', // Remove hover effects
                    },
                  },
                  '& .MuiSlider-rail': {
                    opacity: 0.3, // Reduced opacity to show it's disabled
                  },
                  '& .MuiSlider-track': {
                    opacity: 0.8, // Keep track visible
                  },
                  pointerEvents: 'none', // Completely disable interaction
                }}
              />

              <Box sx={{ 
                display: 'flex', 
                justifyContent: 'space-between', 
                alignItems: 'center', 
                mt: { xs: 0.5, sm: 1 },
                flexWrap: 'nowrap',
                gap: { xs: 0.5, sm: 1 }
              }}>
                {/* Left controls: Play/Pause and time */}
                <Box sx={{ display: 'flex', alignItems: 'center', minWidth: 0, flex: '0 0 auto' }}>
                  <IconButton 
                    onClick={togglePlay} 
                    size="small"
                    sx={{ 
                      color: 'white',
                      p: { xs: 0.3, sm: 0.5 },
                      minWidth: { xs: '28px', sm: '36px' }
                    }}
                  >
                    {isPlaying ? <Pause fontSize="small" /> : <PlayArrow fontSize="small" />}
                  </IconButton>
                  <Typography 
                    variant="body2" 
                    sx={{ 
                      ml: { xs: 0.25, sm: 0.5 }, 
                      color: 'white',
                      fontSize: { xs: '0.65rem', sm: '0.75rem', md: '0.875rem' },
                      whiteSpace: 'nowrap'
                    }}
                  >
                    {formatDuration(getDisplayCurrentTime())} / {formatDuration(getDisplayDuration())}
                  </Typography>
                </Box>

                {/* Right controls: Volume, Speed, and Fullscreen */}
                <Box sx={{ 
                  display: 'flex', 
                  alignItems: 'center',
                  gap: { xs: 0.25, sm: 0.5, md: 1 },
                  flexWrap: 'nowrap',
                  justifyContent: 'flex-end',
                  minWidth: 0,
                  flex: '1 1 auto',
                  overflow: 'hidden'
                }}>
                  {/* Volume control - Hidden on mobile, shown on tablet and up */}
                  <Box sx={{ 
                    display: { xs: 'none', sm: 'flex' }, 
                    alignItems: 'center', 
                    width: { sm: 100, md: 120 }
                  }}>
                    <IconButton onClick={toggleMute} size="small" sx={{ color: 'white', p: 0.5 }}>
                      {isMuted ? <VolumeOff fontSize="small" /> : <VolumeUp fontSize="small" />}
                    </IconButton>
                    <Slider
                      min={0}
                      max={1}
                      step={0.1}
                      value={isMuted ? 0 : volume}
                      onChange={handleVolumeChange}
                      aria-label="Volume"
                      sx={{ ml: 1, color: 'primary.main' }}
                      size="small"
                    />
                  </Box>

                  {/* Mobile-only mute button */}
                  <IconButton 
                    onClick={toggleMute} 
                    size="small" 
                    sx={{ 
                      display: { xs: 'inline-flex', sm: 'none' },
                      color: 'white',
                      p: 0.5
                    }}
                  >
                    {isMuted ? <VolumeOff fontSize="small" /> : <VolumeUp fontSize="small" />}
                  </IconButton>

                  {/* Playback speed control - Desktop: All buttons, Mobile: Dropdown style */}
                  {/* Desktop version with all speed buttons */}
                  <Tooltip title="Playback Speed">
                    <Box sx={{ 
                      display: { xs: 'none', md: 'flex' }, 
                      alignItems: 'center'
                    }}>
                      <IconButton size="small" sx={{ color: 'white', p: 0.5 }}>
                        <SpeedIcon fontSize="small" />
                      </IconButton>
                      <Box component="span" sx={{ ml: 0.5, display: 'flex', gap: 0.2 }}>
                        {speedOptions.map((speed) => (
                          <Tooltip key={speed} title={`${speed}x`}>
                            <IconButton
                              size="small"
                              onClick={() => handleSpeedChange(speed)}
                              sx={{
                                backgroundColor: playbackRate === speed ? 'primary.main' : 'rgba(255,255,255,0.1)',
                                color: 'white',
                                '&:hover': {
                                  backgroundColor: playbackRate === speed ? 'primary.dark' : 'rgba(255,255,255,0.2)'
                                },
                                width: 28,
                                height: 22,
                                fontSize: '0.65rem',
                                p: 0.5,
                                minWidth: 'auto'
                              }}
                            >
                              {speed}x
                            </IconButton>
                          </Tooltip>
                        ))}
                      </Box>
                    </Box>
                  </Tooltip>

                  {/* Mobile version - Tap to cycle through speeds */}
                  <Tooltip title="Tap to change speed">
                    <IconButton
                      size="small"
                      onClick={() => {
                        const currentIndex = speedOptions.indexOf(playbackRate);
                        const nextIndex = (currentIndex + 1) % speedOptions.length;
                        handleSpeedChange(speedOptions[nextIndex]);
                      }}
                      sx={{
                        display: { xs: 'inline-flex', md: 'none' },
                        backgroundColor: 'rgba(255,255,255,0.2)',
                        color: 'white',
                        fontSize: '0.7rem',
                        minWidth: { xs: '36px', sm: '42px' },
                        height: { xs: '24px', sm: '28px' },
                        px: { xs: 0.5, sm: 1 },
                        '&:hover': {
                          backgroundColor: 'rgba(255,255,255,0.3)'
                        }
                      }}
                    >
                      <SpeedIcon sx={{ fontSize: '0.9rem', mr: 0.3 }} />
                      {playbackRate}x
                    </IconButton>
                  </Tooltip>

                  {/* Quality Selector - Only show if HLS stream with multiple qualities */}
                  {isHlsUrl && availableQualities.length > 0 && (
                    <>
                      <Tooltip title="Video Quality">
                        <IconButton
                          size="small"
                          onClick={(e) => setQualityMenuAnchor(e.currentTarget)}
                          sx={{
                            backgroundColor: 'rgba(255,255,255,0.2)',
                            color: 'white',
                            fontSize: '0.7rem',
                            minWidth: { xs: '36px', sm: '50px' },
                            height: { xs: '24px', sm: '28px' },
                            px: { xs: 0.5, sm: 1 },
                            '&:hover': {
                              backgroundColor: 'rgba(255,255,255,0.3)'
                            }
                          }}
                        >
                          <HighQuality sx={{ fontSize: { xs: '0.9rem', sm: '1rem' }, mr: 0.3 }} />
                          <Typography sx={{ fontSize: { xs: '0.6rem', sm: '0.7rem' }, display: { xs: 'none', sm: 'inline' } }}>
                            {getCurrentQualityLabel()}
                          </Typography>
                        </IconButton>
                      </Tooltip>
                      <Menu
                        anchorEl={qualityMenuAnchor}
                        open={Boolean(qualityMenuAnchor)}
                        onClose={() => setQualityMenuAnchor(null)}
                        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
                        transformOrigin={{ vertical: 'bottom', horizontal: 'center' }}
                        sx={{
                          '& .MuiPaper-root': {
                            backgroundColor: 'rgba(0,0,0,0.9)',
                            color: 'white',
                            minWidth: 120
                          }
                        }}
                      >
                        {availableQualities.map((quality) => (
                          <MenuItem
                            key={quality.index}
                            onClick={() => handleQualityChange(quality.index)}
                            selected={currentQuality === quality.index}
                            sx={{
                              fontSize: '0.875rem',
                              '&.Mui-selected': {
                                backgroundColor: 'rgba(255,255,255,0.1)'
                              },
                              '&:hover': {
                                backgroundColor: 'rgba(255,255,255,0.2)'
                              }
                            }}
                          >
                            <ListItemIcon sx={{ minWidth: 28 }}>
                              {currentQuality === quality.index && <Check sx={{ color: 'primary.main', fontSize: '1rem' }} />}
                            </ListItemIcon>
                            <ListItemText 
                              primary={quality.label} 
                              secondary={quality.height === DEFAULT_QUALITY ? 'Default' : null}
                              primaryTypographyProps={{ sx: { color: 'white', fontSize: '0.875rem' } }}
                              secondaryTypographyProps={{ sx: { color: 'grey.500', fontSize: '0.7rem' } }}
                            />
                          </MenuItem>
                        ))}
                      </Menu>
                    </>
                  )}

                  {/* Fullscreen toggle */}
                  <IconButton 
                    onClick={toggleFullScreen} 
                    size="small"
                    sx={{ 
                      color: 'white',
                      p: { xs: 0.5, sm: 1 }
                    }}
                  >
                    {isFullScreen ? <FullscreenExit fontSize="small" /> : <Fullscreen fontSize="small" />}
                  </IconButton>
                </Box>
              </Box>
            </Box>
          )}
        </Box>

        {/* Title and description (only show in regular view) */}
        {!isFullScreen && (
          <>
            <Box sx={{ p: { xs: 1, sm: 1.5 }, backgroundColor: '#f5f5f5' }}>
              <Typography 
                variant="subtitle1" 
                gutterBottom
                sx={{ fontSize: { xs: '0.9rem', sm: '1rem' } }}
              >
                {title}
              </Typography>
            </Box>
            
            {/* Notice about video restrictions */}
            <Alert 
              severity="info" 
              sx={{ 
                m: { xs: 1, sm: 1.5 }, 
                mt: 0,
                '& .MuiAlert-message': {
                  fontSize: { xs: '0.75rem', sm: '0.875rem' }
                }
              }}
            >
              <Typography 
                variant="body2"
                sx={{ fontSize: { xs: '0.75rem', sm: '0.875rem' } }}
              >
                📹 Video seeking is disabled to ensure complete learning. You can rewind but cannot skip ahead.
              </Typography>
            </Alert>
          </>
        )}
      </Paper>

      {/* Video Resume Dialog */}
      <VideoResumeDialog
        open={showResumeDialog}
        onClose={handleResumeDialogClose}
        onResumeFromPosition={handleResumeFromPosition}
        onStartFromBeginning={handleStartFromBeginning}
        currentPosition={resumePosition}
        videoDuration={resumeData?.videoDuration || duration}
        videoTitle={title}
        lastWatched={resumeData?.lastWatched}
      />
    </>
  );
};

export default CustomVideoPlayer;
