const mongoose = require('mongoose');
const Video = require('../models/Video');
const bunnyStreamService = require('../services/bunnyStreamService');

/**
 * Background job to update video durations from Bunny Stream
 * This fixes videos that have incorrect or missing duration metadata
 */
async function updateVideosDuration() {
  try {
    console.log('🔄 Starting video duration update job...');

    // Find videos with missing or suspicious durations
    const videosToUpdate = await Video.find({
      $or: [
        { duration: { $exists: false } },
        { duration: 0 },
        { duration: { $lt: 10 } }, // Videos shorter than 10 seconds are suspicious
        { bunnyVideoId: { $exists: true }, transcodingStatus: 'completed', duration: { $lt: 30 } } // Completed videos that are too short
      ],
      bunnyVideoId: { $exists: true, $ne: null }
    }).limit(50); // Process in batches

    console.log(`📊 Found ${videosToUpdate.length} videos needing duration updates`);

    let updated = 0;
    let errors = 0;

    for (const video of videosToUpdate) {
      try {
        console.log(`🔍 Checking video: ${video.title} (ID: ${video._id})`);
        
        // Get current details from Bunny Stream
        const videoDetails = await bunnyStreamService.getVideoDetails(video.bunnyVideoId);
        
        if (videoDetails.duration && videoDetails.duration > 0) {
          const oldDuration = video.duration || 0;
          video.duration = Math.round(videoDetails.duration);
          video.transcodingStatus = videoDetails.transcodingStatus;
          
          // Update available resolutions if needed
          if (videoDetails.availableResolutions && videoDetails.availableResolutions.length > 0) {
            video.availableResolutions = videoDetails.availableResolutions;
          }
          
          await video.save();
          updated++;
          
          console.log(`✅ Updated ${video.title}: duration ${oldDuration}s → ${video.duration}s`);
        } else {
          console.log(`⚠️ ${video.title}: No valid duration from Bunny Stream (${videoDetails.duration})`);
        }
        
        // Small delay to avoid overwhelming the API
        await new Promise(resolve => setTimeout(resolve, 100));
        
      } catch (error) {
        errors++;
        console.error(`❌ Error updating video ${video.title}:`, error.message);
      }
    }

    console.log(`🎯 Duration update job completed: ${updated} updated, ${errors} errors`);
    
    return {
      success: true,
      processed: videosToUpdate.length,
      updated,
      errors
    };
    
  } catch (error) {
    console.error('❌ Video duration update job failed:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Update durations for videos in a specific course (useful after arrangement changes)
 */
async function updateCourseVideosDuration(courseId) {
  try {
    console.log(`🔄 Updating video durations for course: ${courseId}`);

    const videos = await Video.find({
      course: courseId,
      bunnyVideoId: { $exists: true, $ne: null }
    });

    console.log(`📊 Found ${videos.length} videos in course`);

    let updated = 0;

    for (const video of videos) {
      try {
        const videoDetails = await bunnyStreamService.getVideoDetails(video.bunnyVideoId);
        
        if (videoDetails.duration && videoDetails.duration > 0) {
          const shouldUpdate = !video.duration || 
                              video.duration === 0 || 
                              Math.abs(video.duration - videoDetails.duration) > 5; // More than 5 second difference
          
          if (shouldUpdate) {
            const oldDuration = video.duration || 0;
            video.duration = Math.round(videoDetails.duration);
            video.transcodingStatus = videoDetails.transcodingStatus;
            await video.save();
            updated++;
            
            console.log(`✅ Updated ${video.title}: duration ${oldDuration}s → ${video.duration}s`);
          }
        }
        
        await new Promise(resolve => setTimeout(resolve, 50));
        
      } catch (error) {
        console.error(`❌ Error updating video ${video.title}:`, error.message);
      }
    }

    console.log(`🎯 Course duration update completed: ${updated} videos updated`);
    
    return {
      success: true,
      courseId,
      total: videos.length,
      updated
    };
    
  } catch (error) {
    console.error('❌ Course duration update failed:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

module.exports = {
  updateVideosDuration,
  updateCourseVideosDuration
};