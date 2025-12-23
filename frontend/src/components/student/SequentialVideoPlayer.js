import React, { useState, useEffect } from 'react';
import { 
  Box, 
  Typography, 
  Card, 
  CardContent,
  LinearProgress,
  Alert,
  Chip,
  IconButton,
  Tooltip
} from '@mui/material';
import { 
  PlayArrow, 
  Lock, 
  CheckCircle, 
  VideoLibrary,
  Schedule,
  Visibility
} from '@mui/icons-material';
import CustomVideoPlayer from './CustomVideoPlayer';

const SequentialVideoPlayer = ({ 
  video, 
  token, 
  isLocked, 
  onVideoComplete, 
  previousContent,
  unitIndex,
  contentIndex 
}) => {
  const [isVideoVisible, setIsVideoVisible] = useState(false);
  const [videoProgress, setVideoProgress] = useState(video.watchProgress || 0);
  const [isCompleted, setIsCompleted] = useState(video.isCompleted || false);

  // Check if video is locked based on previous content completion
  const checkLockStatus = () => {
    // If this is the first content (no previous content), it's never locked
    if (!previousContent) return false;
    
    console.log('🔒 Checking lock status for video:', {
      videoTitle: video.title,
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

  const handlePlayVideo = () => {
    if (actuallyLocked) {
      return;
    }
    setIsVideoVisible(true);
  };

  const handleVideoProgress = (progress) => {
    setVideoProgress(progress);
    
    // Mark as completed if watched more than 80%
    if (progress >= 80 && !isCompleted) {
      setIsCompleted(true);
      if (onVideoComplete) {
        onVideoComplete(video._id, unitIndex, contentIndex);
      }
    }
  };

  const handleVideoComplete = (videoId) => {
    console.log(`🎯 Video completion callback triggered for ${videoId}`);
    setIsCompleted(true);
    setVideoProgress(100);
    if (onVideoComplete) {
      onVideoComplete(video._id, unitIndex, contentIndex);
    }
  };

  const formatDuration = (seconds) => {
    if (!seconds || seconds === 0) return '0:00';
    
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    
    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
    }
    
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  const getPreviousContentMessage = () => {
    if (!previousContent) return '';
    
    if (previousContent.type === 'video') {
      return `Please complete the previous video: "${previousContent.title}"`;
    }
    
    if (previousContent.type === 'document') {
      return `Please read the previous document: "${previousContent.title}"`;
    }
    
    return 'Please complete the previous content to unlock this video';
  };

  const getProgressColor = () => {
    if (isCompleted) return 'success';
    if (videoProgress >= 50) return 'warning';
    return 'primary';
  };

  return (
    <Box sx={{ mb: 3 }}>
      {!isVideoVisible ? (
        <Card 
          sx={{ 
            opacity: actuallyLocked ? 0.6 : 1,
            border: isCompleted ? '2px solid #4caf50' : '1px solid #ddd',
            cursor: actuallyLocked ? 'not-allowed' : 'pointer',
            transition: 'all 0.3s ease',
            '&:hover': {
              transform: actuallyLocked ? 'none' : 'translateY(-2px)',
              boxShadow: actuallyLocked ? 'none' : '0 4px 20px rgba(0,0,0,0.1)'
            }
          }}
          onClick={actuallyLocked ? undefined : handlePlayVideo}
        >
          <CardContent>
            <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
              <Box sx={{ 
                width: 120, 
                height: 80, 
                bgcolor: '#f5f5f5', 
                borderRadius: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                mr: 2,
                position: 'relative',
                overflow: 'hidden'
              }}>
                {video.thumbnailUrl ? (
                  <img 
                    src={video.thumbnailUrl} 
                    alt={video.title}
                    style={{
                      width: '100%',
                      height: '100%',
                      objectFit: 'cover'
                    }}
                  />
                ) : (
                  <VideoLibrary color="action" sx={{ fontSize: '2rem' }} />
                )}
                
                <Box sx={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  bgcolor: 'rgba(0,0,0,0.3)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  {actuallyLocked ? (
                    <Lock color="primary" sx={{ fontSize: '2rem', color: 'white' }} />
                  ) : (
                    <PlayArrow sx={{ fontSize: '3rem', color: 'white' }} />
                  )}
                </Box>
              </Box>
              
              <Box sx={{ flex: 1 }}>
                <Typography variant="h6" sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                  {video.title}
                  
                  {actuallyLocked && (
                    <Lock color="action" fontSize="small" />
                  )}
                  
                  {isCompleted && (
                    <CheckCircle color="success" fontSize="small" />
                  )}
                </Typography>
                
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 1 }}>
                  <Typography variant="body2" color="text.secondary" sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <Schedule fontSize="small" />
                    {formatDuration(video.duration)}
                  </Typography>
                  
                  {videoProgress > 0 && (
                    <Typography variant="body2" color="text.secondary" sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                      <Visibility fontSize="small" />
                      {Math.round(videoProgress)}% watched
                    </Typography>
                  )}
                </Box>
                
                {video.description && (
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                    {video.description}
                  </Typography>
                )}
                
                <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                  {isCompleted && (
                    <Chip 
                      label="Completed" 
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
                  
                  {videoProgress > 0 && !isCompleted && (
                    <Chip 
                      label={`${Math.round(videoProgress)}% Complete`}
                      color={getProgressColor()}
                      size="small"
                    />
                  )}
                </Box>
              </Box>
            </Box>
            
            {videoProgress > 0 && (
              <Box sx={{ mb: 2 }}>
                <LinearProgress 
                  variant="determinate" 
                  value={videoProgress} 
                  color={getProgressColor()}
                  sx={{ height: 6, borderRadius: 3 }}
                />
              </Box>
            )}
            
            {actuallyLocked && (
              <Alert severity="info">
                <Typography variant="body2">
                  {getPreviousContentMessage()}
                </Typography>
              </Alert>
            )}
          </CardContent>
        </Card>
      ) : (
        <Box sx={{ mb: 2 }}>
          <Box sx={{ mb: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Typography variant="h6">{video.title}</Typography>
            
            <Box sx={{ display: 'flex', gap: 1 }}>
              {isCompleted && (
                <Chip 
                  label="Completed" 
                  color="success" 
                  size="small"
                  icon={<CheckCircle />}
                />
              )}
              
              <Chip 
                label={`${Math.round(videoProgress)}% Complete`}
                color={getProgressColor()}
                size="small"
              />
            </Box>
          </Box>
          
          <CustomVideoPlayer
            videoId={video._id}
            src={video.videoUrl}
            title={video.title}
            token={token}
            onProgressUpdate={handleVideoProgress}
            onVideoComplete={handleVideoComplete}
            initialProgress={videoProgress}
          />
          
          {videoProgress > 0 && (
            <Box sx={{ mt: 2 }}>
              <LinearProgress 
                variant="determinate" 
                value={videoProgress} 
                color={getProgressColor()}
                sx={{ height: 8, borderRadius: 4 }}
              />
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1, textAlign: 'center' }}>
                {Math.round(videoProgress)}% Complete
                {isCompleted && ' - Video Completed! 🎉'}
              </Typography>
            </Box>
          )}
        </Box>
      )}
    </Box>
  );
};

export default SequentialVideoPlayer;