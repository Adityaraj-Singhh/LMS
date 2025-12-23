const Video = require('../models/Video');
const Course = require('../models/Course');
const User = require('../models/User');
const fs = require('fs');
const { exec } = require('child_process');
const path = require('path');
const util = require('util');
const mongoose = require('mongoose');
const execPromise = util.promisify(exec);
const { normalizeUrl, normalizeObjectUrls } = require('../utils/urlHandler');
const bunnyStreamService = require('../services/bunnyStreamService');

// Helper function to process video URLs - now handles Bunny Stream
const processVideoUrl = (video) => {
  // If it's a Bunny video, return the HLS URL
  if (video.bunnyVideoId && video.hlsUrl) {
    return {
      url: video.hlsUrl,
      type: 'hls',
      bunnyVideoId: video.bunnyVideoId,
      availableResolutions: video.availableResolutions || [360],
      defaultQuality: video.defaultQuality || 360,
      isReady: video.transcodingStatus === 'completed'
    };
  }
  
  // Legacy handling for non-Bunny videos
  const videoUrl = video.videoUrl || video;
  if (!videoUrl || (typeof videoUrl === 'string' && !videoUrl.trim())) {
    return null;
  }

  // For string URLs (legacy)
  if (typeof videoUrl === 'string') {
    // Normalize the URL first
    const normalizedUrl = normalizeUrl(videoUrl, 'video');
    
    // Check if the URL is a placeholder/default image
    if (normalizedUrl && (
      normalizedUrl.includes('defaults/video.png') ||
      normalizedUrl.includes('video.png') ||
      normalizedUrl.endsWith('.png') ||
      normalizedUrl.endsWith('.jpg') ||
      normalizedUrl.endsWith('.jpeg') ||
      normalizedUrl.endsWith('.gif')
    )) {
      console.log(`Rejecting placeholder/image URL: ${normalizedUrl}`);
      return null;
    }
    
    return {
      url: normalizedUrl,
      type: 'direct',
      isReady: true
    };
  }
  
  return null;
};

// Get video duration using ffprobe
const getVideoDuration = async (filePath) => {
  try {
    // Check if ffprobe is available
    const { stdout, stderr } = await execPromise(
      `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${filePath}"`
    );

    if (stderr) {
      // Only log actual errors, not just missing ffprobe
      if (!stderr.includes('is not recognized') && !stderr.includes('command not found')) {
        console.error('Error getting video duration:', stderr);
      }
      return null;
    }

    const duration = parseFloat(stdout.trim());
    return isNaN(duration) ? null : Math.round(duration);
  } catch (error) {
    // Don't log errors for missing ffprobe, just return null
    if (!error.message.includes('is not recognized') && !error.message.includes('command not found')) {
      console.error('Failed to get video duration:', error.message);
    }
    return null;
  }
};

// Upload video
exports.uploadVideo = async (req, res) => {
  try {
    const { title, description, courseId, unitId } = req.body;
    if (!title || !courseId || !req.file) {
      return res.status(400).json({ message: 'Title, course ID, and video file are required' });
    }
    
    // Find the course to validate it exists
    const course = await Course.findById(courseId);
    if (!course) {
      return res.status(404).json({ message: 'Course not found' });
    }
    
    // Check if course has units and unitId is required
    const Unit = require('../models/Unit');
    const unitCount = await Unit.countDocuments({ course: courseId });
    
    if (unitCount > 0 && (!unitId || !mongoose.Types.ObjectId.isValid(unitId))) {
      return res.status(400).json({ message: 'Unit selection is required for this course' });
    }
    
    // Get the first teacher from the course if available
    let teacherId = null;
    if (course.teachers && course.teachers.length > 0) {
      teacherId = course.teachers[0];
    }
    
    console.log('🐰 Bunny Stream Video Upload:');
    console.log('  File:', req.file.originalname);
    console.log('  Size:', req.file.size, 'bytes');
    
    // Step 1: Create video entry in Bunny Stream
    let bunnyVideo;
    try {
      bunnyVideo = await bunnyStreamService.createVideo(title);
      console.log('✅ Created Bunny video entry:', bunnyVideo.videoId);
    } catch (bunnyError) {
      console.error('❌ Failed to create Bunny video:', bunnyError);
      return res.status(500).json({ message: 'Failed to initialize video upload to streaming service' });
    }
    
    // Step 2: Upload the video file to Bunny Stream
    try {
      await bunnyStreamService.uploadVideoBuffer(bunnyVideo.videoId, req.file.buffer);
      console.log('✅ Uploaded video to Bunny Stream:', bunnyVideo.videoId);
    } catch (uploadError) {
      console.error('❌ Failed to upload video to Bunny:', uploadError);
      // Try to cleanup the created video entry
      try {
        await bunnyStreamService.deleteVideo(bunnyVideo.videoId);
      } catch (e) {}
      return res.status(500).json({ message: 'Failed to upload video to streaming service' });
    }
    
    // Step 3: Get initial video details (transcoding will start automatically)
    let videoDetails;
    try {
      videoDetails = await bunnyStreamService.getVideoDetails(bunnyVideo.videoId);
      console.log('📊 Video details:', videoDetails);
    } catch (e) {
      console.warn('Could not fetch initial video details, using defaults');
      videoDetails = {
        transcodingStatus: 'processing',
        availableResolutions: [360],
        hlsUrl: bunnyStreamService.getHlsUrl(bunnyVideo.videoId),
        thumbnailUrl: bunnyStreamService.getThumbnailUrl(bunnyVideo.videoId)
      };
    }
    
    // Get duration from frontend if provided
    let duration = null;
    if (req.body.duration) {
      duration = parseInt(req.body.duration, 10);
      console.log('Using duration from frontend:', duration, 'seconds');
    }
    
    // Create video document with Bunny Stream info
    const videoData = { 
      title, 
      description, 
      course: courseId, 
      teacher: teacherId, 
      videoUrl: videoDetails.hlsUrl, // Store HLS URL as primary URL
      duration: videoDetails.duration || duration,
      // Bunny Stream specific fields
      bunnyVideoId: bunnyVideo.videoId,
      bunnyLibraryId: bunnyStreamService.libraryId,
      transcodingStatus: videoDetails.transcodingStatus || 'processing',
      availableResolutions: videoDetails.availableResolutions || [360],
      hlsUrl: videoDetails.hlsUrl,
      thumbnailUrl: videoDetails.thumbnailUrl,
      defaultQuality: 360 // Default to 360p
    };
    
    // If unitId is provided, associate the video with that unit
    if (unitId && mongoose.Types.ObjectId.isValid(unitId)) {
      // Check if the unit exists and belongs to this course
      const Unit = require('../models/Unit');
      const unit = await Unit.findOne({ _id: unitId, course: courseId });
      
      if (unit) {
        videoData.unit = unitId;
        videoData.sequence = unit.videos ? unit.videos.length + 1 : 1;
      }
    }
    
    const video = new Video(videoData);
    await video.save();
    
    console.log('✅ Video document created:', video._id);
    console.log('   Bunny Video ID:', video.bunnyVideoId);
    console.log('   Transcoding Status:', video.transcodingStatus);
    
    // Add video to course
    await Course.findByIdAndUpdate(courseId, { $push: { videos: video._id } });
    
    // If video is associated with a unit, add it to that unit as well
    let unit = null;
    if (video.unit) {
      const Unit = require('../models/Unit');
      unit = await Unit.findByIdAndUpdate(video.unit, 
        { $push: { videos: video._id } },
        { new: true }
      );
      
      // If this is the first video, also set the hasUnits flag on the course
      await Course.findByIdAndUpdate(courseId, { $set: { hasUnits: true } });
    }

    // Unlock this video for all students assigned to this course
    const User = require('../models/User');
    const StudentProgress = require('../models/StudentProgress');
    
    // Find all students assigned to this course
    const students = await User.find({
      coursesAssigned: courseId,
      role: 'student'
    }).select('_id');
    
    // Unlock the video for each student and update unit progress
    for (const student of students) {
      try {
        // Create or update progress record for this student
        let progress = await StudentProgress.findOne({ 
          student: student._id, 
          course: courseId 
        });
        
        if (!progress) {
          // Initialize new progress record
          progress = new StudentProgress({
            student: student._id,
            course: courseId,
            unlockedVideos: [video._id],
            units: []
          });
        } else {
          // Add video to unlocked videos if not already there
          if (!progress.unlockedVideos.includes(video._id)) {
            progress.unlockedVideos.push(video._id);
          }
        }
        
        // If video is part of a unit, update unit progress
        if (video.unit && unit) {
          // Check if unit exists in progress
          const unitIndex = progress.units.findIndex(
            u => u.unitId && u.unitId.toString() === video.unit.toString()
          );
          
          if (unitIndex === -1) {
            // If this is the first unit (order 0), mark it as unlocked
            const isFirstUnit = unit.order === 0;
            
            // Add unit to progress
            progress.units.push({
              unitId: video.unit,
              status: isFirstUnit ? 'in-progress' : 'locked',
              unlocked: isFirstUnit,
              unlockedAt: isFirstUnit ? new Date() : null,
              videosWatched: []
            });
          }
        }
        
        await progress.save();
        console.log(`Updated progress for student ${student._id} for course ${courseId}`);
      } catch (err) {
        console.error(`Error updating progress for student ${student._id}:`, err);
        // Continue with next student even if there's an error
      }
    }

    // Trigger content integrity validation if this is for a launched course
    if (video.unit) {
      try {
        const course = await Course.findById(courseId);
        if (course && course.isLaunched) {
          console.log('🔒 New video added to launched course, triggering content validation');
          
          // Import and trigger content integrity service
          const ContentIntegrityService = require('../services/contentIntegrityService');
          const impactAnalysis = await ContentIntegrityService.invalidateProgressForNewContent(courseId, video.unit);
          
          console.log('📊 Video upload impact on student progress:', impactAnalysis);
          
          // Mark course as having new content
          await Course.findByIdAndUpdate(courseId, {
            hasNewContent: true,
            lastContentUpdate: new Date(),
            currentArrangementStatus: 'pending_relaunch'
          });
        }
      } catch (validationError) {
        console.error('Error triggering content validation:', validationError);
        // Continue with upload success but log the validation error
      }
    }
    
    // Normalize URLs before sending response
    const normalizedVideo = normalizeObjectUrls(video.toObject());
    
    res.status(201).json(normalizedVideo);
  } catch (err) {
    console.error('Error uploading video:', err);
    res.status(400).json({ message: err.message });
  }
};

// Remove video
exports.removeVideo = async (req, res) => {
  try {
    const video = await Video.findById(req.params.id);
    if (!video) return res.status(404).json({ message: 'Video not found' });
    
    // Delete from Bunny Stream if it's a Bunny video
    if (video.bunnyVideoId) {
      try {
        await bunnyStreamService.deleteVideo(video.bunnyVideoId);
        console.log('✅ Deleted video from Bunny Stream:', video.bunnyVideoId);
      } catch (bunnyError) {
        console.error('⚠️ Could not delete from Bunny Stream:', bunnyError.message);
        // Continue with database deletion even if Bunny deletion fails
      }
    }
    
    // Remove from course
    await Course.findByIdAndUpdate(video.course, { $pull: { videos: video._id } });
    
    // Remove from unit if applicable
    if (video.unit) {
      const Unit = require('../models/Unit');
      await Unit.findByIdAndUpdate(video.unit, { $pull: { videos: video._id } });
    }
    
    await Video.findByIdAndDelete(req.params.id);
    res.json({ message: 'Video removed successfully' });
  } catch (err) {
    console.error('Error removing video:', err);
    res.status(400).json({ message: err.message });
  }
};

// Warn video (flag for review)
exports.warnVideo = async (req, res) => {
  try {
    await Video.findByIdAndUpdate(req.params.id, { $set: { warned: true } });
    res.json({ message: 'Video flagged for review' });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

// Get video analytics
exports.getVideoAnalytics = async (req, res) => {
  try {
    const videoId = req.params.id;
    
    // Find video
    const video = await Video.findById(videoId)
      .populate('course', 'title courseCode')
      .populate('teacher', 'name email');
    
    if (!video) {
      return res.status(404).json({ message: 'Video not found' });
    }
    
    // Find all students who are assigned to the course containing this video through sections
    const Section = require('../models/Section');
    const sections = await Section.find({ 
      courses: video.course._id 
    }).populate({
      path: 'students',
      select: '_id name email regNo watchHistory',
      populate: {
        path: 'watchHistory.video',
        select: 'title course'
      }
    });
    
    // Collect all unique students from all sections
    const studentMap = new Map();
    sections.forEach(section => {
      if (section.students) {
        section.students.forEach(student => {
          studentMap.set(student._id.toString(), student);
        });
      }
    });
    
    const students = Array.from(studentMap.values());
    
    console.log(`Video Analytics: Found ${students.length} students for video ${video.title}`);
    
    // Calculate analytics
    let totalViews = 0;
    let totalWatchTime = 0;
    let completedViews = 0;
    const studentData = [];
    
    for (const student of students) {
      // Look for watch history for this specific video
      const watchRecord = student.watchHistory.find(item => 
        item.video && (
          item.video._id?.toString() === videoId.toString() ||
          item.video.toString() === videoId.toString()
        )
      );
      
      if (watchRecord && watchRecord.timeSpent > 0) {
        totalViews++;
        totalWatchTime += watchRecord.timeSpent;
        
        console.log(`Student ${student.name} watched video for ${watchRecord.timeSpent} seconds`);
        
        // Count as completed if watched more than 90% of the video
        if (video.duration && watchRecord.timeSpent >= video.duration * 0.9) {
          completedViews++;
        }
        
        // Calculate progress percentage
        const progress = video.duration 
          ? Math.min(100, Math.round((watchRecord.timeSpent / video.duration) * 100)) 
          : Math.min(100, Math.round((watchRecord.timeSpent / 180) * 100)); // Assume 3 min if no duration
        
        studentData.push({
          studentId: student._id,
          name: student.name,
          regNo: student.regNo,
          email: student.email,
          watchTime: watchRecord.timeSpent,
          currentPosition: watchRecord.currentPosition || 0,
          progress,
          lastWatched: watchRecord.lastWatched || null,
          sessions: 1 // Default to 1 session, will be updated below if needed
        });
      }
    }
    
    console.log(`Video Analytics: Total views = ${totalViews}, Total watch time = ${totalWatchTime}, Completed views = ${completedViews}`);
    
    // Simplified session tracking - just count unique watch records as sessions
    for (const student of studentData) {
      // For now, each watch record counts as 1 session
      // This can be enhanced later with more sophisticated session tracking
      student.sessionCount = student.watchTime > 0 ? 1 : 0;
      student.averageSessionLength = student.watchTime;
      student.totalEvents = 1;
    }
    
    // Calculate averages and rates
    const averageWatchTime = totalViews > 0 ? totalWatchTime / totalViews : 0;
    const completionRate = totalViews > 0 
      ? Math.round((completedViews / totalViews) * 100)  // Based on actual viewers, not all students
      : 0;
    
    // Helper function to format time
    const formatTime = (seconds) => {
      if (!seconds || seconds === 0) return '0:00';
      const hours = Math.floor(seconds / 3600);
      const minutes = Math.floor((seconds % 3600) / 60);
      const secs = Math.floor(seconds % 60);
      
      if (hours > 0) {
        return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
      } else {
        return `${minutes}:${secs.toString().padStart(2, '0')}`;
      }
    };
    
    const response = {
      videoId: video._id,
      videoTitle: video.title,
      videoUrl: processVideoUrl(video.videoUrl),
      thumbnail: video.thumbnail,
      courseTitle: video.course ? video.course.title : null,
      courseCode: video.course ? video.course.courseCode : null,
      teacherName: video.teacher ? video.teacher.name : null,
      duration: video.duration,
      totalViews,
      averageWatchTime,
      averageWatchTimeFormatted: formatTime(averageWatchTime),
      completionRate,
      totalWatchTime: totalWatchTime,
      totalWatchTimeFormatted: formatTime(totalWatchTime),
      studentCount: students.length,
      activeViewers: totalViews, // Students who actually watched the video
      engagementScore: students.length > 0 ? Math.round((totalViews / students.length) * 100) : 0,
      studentData: studentData.sort((a, b) => b.watchTime - a.watchTime) // Sort by watch time
    };
    
    console.log('Video Analytics Response:', {
      videoTitle: video.title,
      totalViews: response.totalViews,
      totalWatchTime: response.totalWatchTime,
      completionRate: response.completionRate,
      studentDataCount: response.studentData.length
    });
    
    // Update video analytics data
    video.analytics = {
      totalViews,
      totalWatchTime,
      completionRate,
      lastUpdated: new Date()
    };
    
    await video.save();
    
    res.json(response);
  } catch (err) {
    console.error('Error getting video analytics:', err);
    res.status(500).json({ message: err.message });
  }
};

// Get video transcoding status (for Bunny Stream videos)
exports.getTranscodingStatus = async (req, res) => {
  try {
    const video = await Video.findById(req.params.id);
    if (!video) {
      return res.status(404).json({ message: 'Video not found' });
    }
    
    // If not a Bunny video, return as ready
    if (!video.bunnyVideoId) {
      return res.json({
        videoId: video._id,
        status: 'completed',
        isReady: true,
        availableResolutions: [],
        message: 'Legacy video - ready for playback'
      });
    }
    
    // Fetch latest status from Bunny Stream
    try {
      const details = await bunnyStreamService.getVideoDetails(video.bunnyVideoId);
      
      // Update video document if status changed
      if (details.transcodingStatus !== video.transcodingStatus) {
        video.transcodingStatus = details.transcodingStatus;
        video.availableResolutions = details.availableResolutions;
        video.duration = details.duration || video.duration;
        if (details.thumbnailUrl) {
          video.thumbnailUrl = details.thumbnailUrl;
        }
        await video.save();
        console.log(`📊 Updated video ${video._id} transcoding status: ${details.transcodingStatus}`);
      }
      
      res.json({
        videoId: video._id,
        bunnyVideoId: video.bunnyVideoId,
        status: details.transcodingStatus,
        isReady: details.isReady,
        availableResolutions: details.availableResolutions,
        duration: details.duration,
        thumbnailUrl: details.thumbnailUrl,
        hlsUrl: details.hlsUrl
      });
    } catch (bunnyError) {
      console.error('Error fetching Bunny video status:', bunnyError);
      // Return stored status if Bunny API fails
      res.json({
        videoId: video._id,
        bunnyVideoId: video.bunnyVideoId,
        status: video.transcodingStatus,
        isReady: video.transcodingStatus === 'completed',
        availableResolutions: video.availableResolutions,
        duration: video.duration,
        thumbnailUrl: video.thumbnailUrl,
        hlsUrl: video.hlsUrl,
        error: 'Could not fetch latest status from streaming service'
      });
    }
  } catch (err) {
    console.error('Error getting transcoding status:', err);
    res.status(500).json({ message: err.message });
  }
};

// Get video streaming info for player
exports.getStreamingInfo = async (req, res) => {
  try {
    const video = await Video.findById(req.params.id);
    if (!video) {
      return res.status(404).json({ message: 'Video not found' });
    }
    
    // If it's a Bunny video, get streaming info
    if (video.bunnyVideoId) {
      const streamingInfo = await bunnyStreamService.getStreamingInfo(video.bunnyVideoId);
      
      // Update video if transcoding completed
      if (streamingInfo.transcodingStatus === 'completed' && video.transcodingStatus !== 'completed') {
        video.transcodingStatus = 'completed';
        video.availableResolutions = streamingInfo.availableResolutions;
        await video.save();
      }
      
      return res.json({
        videoId: video._id,
        title: video.title,
        duration: video.duration,
        ...streamingInfo,
        type: 'hls'
      });
    }
    
    // Legacy video - return direct URL
    res.json({
      videoId: video._id,
      title: video.title,
      duration: video.duration,
      url: video.videoUrl,
      type: 'direct',
      isReady: true
    });
  } catch (err) {
    console.error('Error getting streaming info:', err);
    res.status(500).json({ message: err.message });
  }
};
