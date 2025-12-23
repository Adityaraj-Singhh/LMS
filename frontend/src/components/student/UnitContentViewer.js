import React, { useState, useEffect } from 'react';
import { 
  Box, 
  Typography, 
  Card, 
  CardContent,
  Alert,
  LinearProgress,
  Chip,
  Collapse,
  IconButton,
  Divider
} from '@mui/material';
import { 
  ExpandMore, 
  ExpandLess,
  CheckCircle, 
  Lock, 
  PlayCircleOutline,
  Description,
  Schedule,
  TrendingUp
} from '@mui/icons-material';
import SequentialVideoPlayer from './SequentialVideoPlayer';
import DocumentViewer from './DocumentViewer';

const UnitContentViewer = ({ 
  unit, 
  courseId,
  token, 
  onProgressUpdate,
  onContentComplete 
}) => {
  console.log('🔄 UnitContentViewer mounted with:', { unitTitle: unit?.title, courseId });
  
  const [isExpanded, setIsExpanded] = useState(false);
  const [contentProgress, setContentProgress] = useState({});
  const [unlockedContent, setUnlockedContent] = useState(new Set());
  const [mixedContent, setMixedContent] = useState([]);

  // Early return if unit is not provided
  if (!unit) {
    return (
      <Alert severity="error">
        No unit data provided
      </Alert>
    );
  }

  useEffect(() => {
    // Create mixed content array from videos and readingMaterials
    createMixedContentArray();
  }, [unit]);

  useEffect(() => {
    // Initialize progress tracking after mixed content is created
    if (mixedContent.length > 0) {
      initializeContentProgress();
    }
  }, [mixedContent]);

  const createMixedContentArray = () => {
    const contentArray = [];
    
    // Add videos
    if (unit.videos && unit.videos.length > 0) {
      unit.videos.forEach((video, index) => {
        contentArray.push({
          ...video,
          type: 'video',
          videoUrl: video.videoUrl || video.url || video.signedUrl, // Ensure videoUrl is present
          originalIndex: index,
          contentType: 'video'
        });
      });
    }
    
    // Add reading materials
    if (unit.readingMaterials && unit.readingMaterials.length > 0) {
      unit.readingMaterials.forEach((material, index) => {
        contentArray.push({
          ...material,
          type: 'document',
          contentType: 'document',
          documentUrl: material.documentUrl || material.url || material.fileUrl,
          originalIndex: index
        });
      });
    }
    
    // Sort by arranged order (for content arrangement), then fallback to original order
    contentArray.sort((a, b) => {
      const orderA = a.arrangedOrder || a.order || a.sequence || 0;
      const orderB = b.arrangedOrder || b.order || b.sequence || 0;
      return orderA - orderB;
    });
    
    console.log('🔄 Created mixed content array:', contentArray);
    setMixedContent(contentArray);
  };

  useEffect(() => {
    // Initialize progress tracking and unlock first content
    initializeContentProgress();
  }, [unit]);

  const initializeContentProgress = () => {
    const progress = {};
    const unlocked = new Set();
    
    if (mixedContent && mixedContent.length > 0) {
      // Always unlock the first content item
      unlocked.add(0);
      
      mixedContent.forEach((content, index) => {
        // For videos, check both isCompleted and watched status
        let isContentCompleted = false;
        if (content.videoUrl) {
          // For videos, check if watchProgress >= 80% OR isCompleted is true
          isContentCompleted = content.isCompleted || content.watched || (content.watchProgress >= 80);
        } else {
          // For documents, check if isRead is true OR isCompleted is true
          isContentCompleted = content.isRead || content.isCompleted;
        }
        
        progress[index] = {
          isCompleted: isContentCompleted,
          progress: content.watchProgress || content.readProgress || 0,
          type: content.videoUrl ? 'video' : 'document'
        };
        
        // Only unlock next content if current content is actually completed
        // AND we're not dealing with the first content (which is always unlocked)
        if (isContentCompleted && index < mixedContent.length - 1) {
          unlocked.add(index + 1);
        }
      });
      
      // For debugging - log the initialization
      console.log('🔧 Content Progress Initialized:', {
        unitTitle: unit?.title,
        progress,
        unlockedContent: Array.from(unlocked),
        totalContent: mixedContent.length
      });
    }
    
    setContentProgress(progress);
    setUnlockedContent(unlocked);
  };

  const handleContentComplete = (contentId, unitIndex, contentIndex) => {
    console.log(`🎯 Content completion triggered:`, { contentId, unitIndex, contentIndex });
    
    // Update local progress
    setContentProgress(prev => {
      const newProgress = {
        ...prev,
        [contentIndex]: {
          ...prev[contentIndex],
          isCompleted: true,
          progress: 100
        }
      };
      
      console.log('📊 Updated content progress:', newProgress);
      return newProgress;
    });
    
    // Unlock next content only if this content is actually completed
    if (contentIndex < mixedContent.length - 1) {
      setUnlockedContent(prev => {
        const newUnlocked = new Set([...prev, contentIndex + 1]);
        console.log('🔓 Unlocked content:', Array.from(newUnlocked));
        return newUnlocked;
      });
    }
    
    // Notify parent component
    if (onContentComplete) {
      onContentComplete(contentId, unitIndex, contentIndex);
    }
    
    // Update overall progress
    if (onProgressUpdate && unit?._id) {
      onProgressUpdate(unit._id, calculateUnitProgress());
    }
    
    console.log(`✅ Content completed: ${contentIndex} in unit ${unit?.title || 'Unknown'}`);
  };

  const calculateUnitProgress = () => {
    if (!mixedContent || mixedContent.length === 0) return 0;
    
    const completedCount = Object.values(contentProgress).filter(p => p.isCompleted).length;
    return Math.round((completedCount / mixedContent.length) * 100);
  };

  const getUnitStats = () => {
    if (!mixedContent) return { videos: 0, documents: 0, completed: 0, total: 0 };
    
    const stats = mixedContent.reduce((acc, content) => {
      if (content.videoUrl) {
        acc.videos++;
      } else {
        acc.documents++;
      }
      
      if (content.isCompleted || content.isRead) {
        acc.completed++;
      }
      
      acc.total++;
      return acc;
    }, { videos: 0, documents: 0, completed: 0, total: 0 });
    
    return stats;
  };

  const formatEstimatedTime = (content) => {
    if (content.videoUrl && content.duration) {
      // For videos, use actual duration
      const minutes = Math.ceil(content.duration / 60);
      return `${minutes} min video`;
    } else if (content.estimatedReadTime) {
      // For documents, use estimated read time
      return `${content.estimatedReadTime} min read`;
    } else {
      // Default estimate for documents
      return '5-10 min read';
    }
  };

  const getPreviousContent = (currentIndex) => {
    if (currentIndex === 0) return null;
    
    const prevContent = mixedContent[currentIndex - 1];
    const prevProgress = contentProgress[currentIndex - 1];
    
    return {
      ...prevContent,
      ...prevProgress,
      type: prevContent.type || (prevContent.videoUrl ? 'video' : 'document')
    };
  };

  const isContentLocked = (index) => {
    return !unlockedContent.has(index);
  };

  const unitStats = getUnitStats();
  const unitProgress = calculateUnitProgress();
  const isUnitCompleted = unitProgress === 100;

  return (
    <Box sx={{ 
      p: 4, 
      textAlign: 'center',
      minHeight: '400px',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
      alignItems: 'center'
    }}>
      <Box sx={{ 
        maxWidth: 600,
        mx: 'auto'
      }}>
        <Typography variant="h4" sx={{ 
          mb: 3, 
          fontWeight: 600,
          color: 'primary.main',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 1
        }}>
          📖 {unit?.title || 'Unit Content'}
          {isUnitCompleted && (
            <CheckCircle color="success" fontSize="large" />
          )}
        </Typography>
        
        {unit?.description && (
          <Typography variant="h6" color="text.secondary" sx={{ mb: 4, lineHeight: 1.6 }}>
            {unit.description}
          </Typography>
        )}
        
        <Box sx={{ mb: 4 }}>
          <LinearProgress 
            variant="determinate" 
            value={unitProgress} 
            color={isUnitCompleted ? 'success' : 'primary'}
            sx={{ 
              height: 12, 
              borderRadius: 6,
              backgroundColor: 'grey.200',
              boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.1)',
              '& .MuiLinearProgress-bar': {
                borderRadius: 6
              }
            }}
          />
          <Typography variant="h6" color="text.primary" sx={{ mt: 2, fontWeight: 600 }}>
            Progress: {unitProgress}%
          </Typography>
        </Box>
        
        <Box sx={{ display: 'flex', gap: 3, justifyContent: 'center', flexWrap: 'wrap', mb: 4 }}>
          <Chip 
            icon={<PlayCircleOutline />}
            label={`${unitStats.videos} Videos`}
            size="medium"
            variant="filled"
            color="primary"
            sx={{ fontSize: '1rem', py: 2, px: 1 }}
          />
          <Chip 
            icon={<Description />}
            label={`${unitStats.documents} Documents`}
            size="medium"
            variant="filled"
            color="secondary"
            sx={{ fontSize: '1rem', py: 2, px: 1 }}
          />
          <Chip 
            icon={<TrendingUp />}
            label={`${unitStats.completed}/${unitStats.total} Complete`}
            size="medium"
            color={isUnitCompleted ? 'success' : 'primary'}
            variant="filled"
            sx={{ fontSize: '1rem', py: 2, px: 1 }}
          />
        </Box>
        
        <Typography variant="body1" color="text.secondary" sx={{ fontStyle: 'italic' }}>
          {isUnitCompleted ? 
            "🎉 Congratulations! You have completed all content in this unit. You can now take the unit quiz." :
            "Select content from the sidebar to begin your learning journey. Complete all materials to unlock the unit quiz."
          }
        </Typography>
      </Box>
    </Box>
  );
};

export default UnitContentViewer;