const express = require('express');
const router = express.Router();
const { auth } = require('../middleware/auth');
const { validateContentAccess, checkUnitCompletion } = require('../middleware/contentValidationMiddleware');
const Video = require('../models/Video');
const bunnyStreamService = require('../services/bunnyStreamService');
const cacheService = require('../services/cacheService');
const videoController = require('../controllers/videoController');

// Get streaming URL for video - with content validation and Redis caching
router.get('/:videoId/signed-url', auth, validateContentAccess, async (req, res) => {
  try {
    const { videoId } = req.params;

    console.log(`🎬 Generating streaming URL for video: ${videoId}`);

    // Try to get video metadata from cache first
    const videoCacheKey = `video:meta:${videoId}`;
    let video = await cacheService.get(videoCacheKey);
    
    if (!video) {
      // Find the video from DB
      video = await Video.findById(videoId).lean();
      if (!video) {
        return res.status(404).json({ message: 'Video not found' });
      }
      // Cache video metadata for 10 minutes
      await cacheService.set(videoCacheKey, video, 600);
    }

    // Check if video is a Bunny Stream video
    if (video.bunnyVideoId) {
      // Check transcoding status
      if (video.transcodingStatus !== 'completed') {
        console.log(`⏳ Video ${videoId} is still transcoding: ${video.transcodingStatus}`);
        return res.json({
          signedUrl: null,
          hlsUrl: null,
          title: video.title,
          isReady: false,
          transcodingStatus: video.transcodingStatus,
          message: 'Video is still being processed. Please try again later.'
        });
      }
      
      // Get streaming info from Bunny
      const streamingInfo = await bunnyStreamService.getStreamingInfo(video.bunnyVideoId);
      
      console.log(`✅ Generated Bunny streaming URL for video: ${video.title}`);
      
      res.json({
        signedUrl: streamingInfo.hlsUrl, // For backward compatibility
        hlsUrl: streamingInfo.hlsUrl,
        title: video.title,
        duration: video.duration,
        expiresIn: 3600,
        type: 'hls',
        bunnyVideoId: video.bunnyVideoId,
        availableResolutions: streamingInfo.availableResolutions,
        defaultResolution: streamingInfo.defaultResolution,
        thumbnailUrl: streamingInfo.thumbnailUrl,
        isReady: streamingInfo.isReady,
        transcodingStatus: video.transcodingStatus,
        contentDisposition: 'inline'
      });
    } else {
      // Legacy video - return direct URL (for any videos that might still exist)
      console.log(`📹 Legacy video URL for: ${video.title}`);
      
      res.json({
        signedUrl: video.videoUrl,
        title: video.title,
        duration: video.duration,
        type: 'direct',
        isReady: true,
        contentDisposition: 'inline'
      });
    }

  } catch (error) {
    console.error('Error generating video streaming URL:', error);
    res.status(500).json({ message: 'Failed to generate video preview URL' });
  }
});

// Get video transcoding status
router.get('/:videoId/transcoding-status', auth, videoController.getTranscodingStatus);

// Get video streaming info for player
router.get('/:videoId/streaming-info', auth, validateContentAccess, videoController.getStreamingInfo);

module.exports = router;