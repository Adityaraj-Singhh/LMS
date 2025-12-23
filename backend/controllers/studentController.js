const User = require('../models/User');
const Video = require('../models/Video');
const Course = require('../models/Course');
const Unit = require('../models/Unit');
const Section = require('../models/Section');
const QuizAttempt = require('../models/QuizAttempt');
const StudentProgress = require('../models/StudentProgress');
const mongoose = require('mongoose');
const { checkUnitDeadline, checkActivityDeadlineCompliance } = require('../utils/deadlineUtils');
const { normalizeObjectUrls, normalizeUserUrls, normalizeUrl } = require('../utils/urlHandler');
const bunnyStreamService = require('../services/bunnyStreamService');

// Helper function to get student's courses via sections
const getStudentCoursesViaSections = async (studentId) => {
  const sections = await Section.find({ students: studentId })
    .populate('courses', '_id title courseCode description')
    .populate('teacher', 'name email');
  
  const courseMap = new Map();
  sections.forEach(section => {
    section.courses.forEach(course => {
      if (!courseMap.has(course._id.toString())) {
        courseMap.set(course._id.toString(), course._id);
      }
    });
  });
  
  return Array.from(courseMap.values());
};

// Helper function to check if student has access to course via sections
const studentHasAccessToCourse = async (studentId, courseId) => {
  const section = await Section.findOne({ 
    students: studentId, 
    courses: courseId 
  });
  return !!section;
};

// Helper function to process video URLs - handles Bunny Stream and legacy URLs
const processVideoUrl = (video) => {
  // Handle both video object and plain URL string
  const videoObj = typeof video === 'object' ? video : null;
  const videoUrl = videoObj ? videoObj.videoUrl : video;
  
  console.log(`🔍 ProcessVideoUrl called`);
  
  // If it's a Bunny video object, return streaming info
  if (videoObj && videoObj.bunnyVideoId) {
    console.log(`🐰 ProcessVideoUrl: Bunny video detected: ${videoObj.bunnyVideoId}`);
    return {
      url: videoObj.hlsUrl || bunnyStreamService.getHlsUrl(videoObj.bunnyVideoId),
      type: 'hls',
      bunnyVideoId: videoObj.bunnyVideoId,
      availableResolutions: videoObj.availableResolutions || [360],
      defaultQuality: videoObj.defaultQuality || 360,
      isReady: videoObj.transcodingStatus === 'completed',
      transcodingStatus: videoObj.transcodingStatus,
      thumbnailUrl: videoObj.thumbnailUrl
    };
  }
  
  if (!videoUrl || (typeof videoUrl === 'string' && !videoUrl.trim())) {
    console.log(`❌ ProcessVideoUrl: Empty/null URL, returning null`);
    return null;
  }

  // Normalize the URL first
  const normalizedUrl = normalizeUrl(videoUrl, 'video');
  console.log(`📝 ProcessVideoUrl: Normalized URL:`, normalizedUrl);
  
  // Check if the URL is a placeholder/default image
  if (normalizedUrl && (
    normalizedUrl.includes('defaults/video.png') ||
    normalizedUrl.includes('video.png') ||
    normalizedUrl.endsWith('.png') ||
    normalizedUrl.endsWith('.jpg') ||
    normalizedUrl.endsWith('.jpeg') ||
    normalizedUrl.endsWith('.gif')
  )) {
    console.log(`🚫 ProcessVideoUrl: Rejecting placeholder/image URL: ${normalizedUrl}`);
    return null;
  }
  
  // Check if it's a Bunny CDN URL
  if (normalizedUrl && (normalizedUrl.includes('b-cdn.net') || normalizedUrl.includes('bunnycdn'))) {
    console.log(`🐰 ProcessVideoUrl: Bunny CDN URL detected`);
    return {
      url: normalizedUrl,
      type: normalizedUrl.includes('.m3u8') ? 'hls' : 'direct',
      isReady: true
    };
  }

  // For other URLs, return as direct playback
  if (normalizedUrl && normalizedUrl.startsWith('http')) {
    console.log(`✅ ProcessVideoUrl: Accepting URL: ${normalizedUrl}`);
    return {
      url: normalizedUrl,
      type: 'direct',
      isReady: true
    };
  }

  console.log(`❌ ProcessVideoUrl: No valid processing path`);
  return null;
};

// Process document URL (documents still use local storage)
const processDocumentUrl = (documentUrl) => {
  console.log(`🔍 ProcessDocumentUrl called with:`, documentUrl, typeof documentUrl);
  
  if (!documentUrl || !documentUrl.trim()) {
    console.log(`❌ ProcessDocumentUrl: Empty/null URL, returning null`);
    return null;
  }
  
  const normalizedUrl = normalizeUrl(documentUrl, 'document');
  console.log(`📝 ProcessDocumentUrl: Normalized URL:`, normalizedUrl);
  
  // For external URLs, return as-is
  if (normalizedUrl && (normalizedUrl.startsWith('http://') || normalizedUrl.startsWith('https://'))) {
    console.log(`✅ ProcessDocumentUrl: Accepting document URL: ${normalizedUrl}`);
    return normalizedUrl;
  } else {
    console.log(`❌ ProcessDocumentUrl: Rejecting invalid document URL: ${normalizedUrl}`);
    return null;
  }
};

// Get all courses assigned to student with progress info via sections
exports.getStudentCourses = async (req, res) => {
  console.log('🚀 [STUDENT CONTROLLER] getStudentCourses called!');
  console.log('🚀 [STUDENT CONTROLLER] Request URL:', req.originalUrl);
  console.log('🚀 [STUDENT CONTROLLER] Request method:', req.method);
  
  try {
    console.log('[Student Controller] Getting courses for student ID:', req.user._id);
    console.log('[Student Controller] Student email from token:', req.user.email);
    console.log('[Student Controller] Student role from token:', req.user.role);
    
    // Find sections where this student is assigned
    const sections = await Section.find({ students: req.user._id })
      .populate('courses', 'title courseCode description')
      .populate('teacher', 'name email')
      .populate('school', 'name')
      .populate('department', 'name');
    
    console.log(`[Student Controller] Found ${sections ? sections.length : 0} sections for student ${req.user._id}`);
    
    if (sections && sections.length > 0) {
      console.log('[Student Controller] Section details:');
      sections.forEach((section, index) => {
        console.log(`  Section ${index + 1}: ${section.name} (ID: ${section._id})`);
        console.log(`    Courses: ${section.courses ? section.courses.length : 0}`);
        console.log(`    Students: ${section.students ? section.students.length : 0}`);
        console.log(`    Teacher: ${section.teacher ? section.teacher.name : 'None'}`);
      });
    }
    
    if (!sections || sections.length === 0) {
      console.log('[Student Controller] No sections found for student:', req.user._id);
      
      // Let's also check if this student exists in the User collection
      const studentExists = await User.findById(req.user._id);
      console.log('[Student Controller] Student exists in database:', !!studentExists);
      if (studentExists) {
        console.log('[Student Controller] Student details:', {
          name: studentExists.name,
          email: studentExists.email,
          role: studentExists.role
        });
      }
      
      return res.json([]);
    }
    
    console.log(`Found ${sections.length} sections for student`);
    
    // Extract all unique courses from all sections
    const allCourses = [];
    const courseMap = new Map();
    
    sections.forEach(section => {
      section.courses.forEach(course => {
        if (!courseMap.has(course._id.toString())) {
          courseMap.set(course._id.toString(), {
            ...course.toObject(),
            section: {
              _id: section._id,
              name: section.name,
              school: section.school?.name,
              department: section.department?.name
            },
            teacher: section.teacher
          });
        }
      });
    });
    
    const student = await User.findById(req.user._id).select('watchHistory');
    const ReadingMaterial = require('../models/ReadingMaterial');
    const Unit = require('../models/Unit');
    
    // For each course, get videos and calculate progress
    const coursesWithProgress = await Promise.all(Array.from(courseMap.values()).map(async (course) => {
      // Get all videos for this course (direct videos + videos from units)
      const courseWithVideos = await Course.findById(course._id)
        .populate('videos', 'title duration')
        .populate({
          path: 'units',
          populate: [
            { path: 'videos', select: 'title duration' },
            { path: 'quizPool', select: 'title questionsPerAttempt passingScore' }
          ]
        });
      
      // Get all reading materials for this course
      const readingMaterials = await ReadingMaterial.find({ 
        course: course._id,
        isApproved: { $ne: false },
        approvalStatus: { $ne: 'pending' }
      });
      const totalReadingMaterials = readingMaterials.length;
      
      // Collect all videos (from course.videos and from units.videos)
      let allVideos = [];
      if (courseWithVideos) {
        // Add direct course videos
        if (courseWithVideos.videos && courseWithVideos.videos.length > 0) {
          allVideos.push(...courseWithVideos.videos);
        }
        // Add videos from units
        if (courseWithVideos.units && courseWithVideos.units.length > 0) {
          courseWithVideos.units.forEach(unit => {
            if (unit.videos && unit.videos.length > 0) {
              allVideos.push(...unit.videos);
            }
          });
        }
      }
      
      if (!courseWithVideos || allVideos.length === 0) {
        return {
          _id: course._id.toString(), // Ensure _id is always a string
          title: course.title || 'Untitled Course',
          courseCode: course.courseCode || 'N/A',
          description: course.description || '',
          section: course.section,
          sectionId: course.section?._id?.toString(), // Ensure sectionId is also a string
          teacher: course.teacher?.name || 'Not assigned',
          teacherName: course.teacher?.name || 'Not assigned', // Frontend expects this field
          totalVideos: 0,
          videoCount: 0, // Frontend expects this field
          videosCompleted: 0,
          totalReadingMaterials: totalReadingMaterials,
          readingMaterialsCompleted: 0,
          progress: 0,
          totalDuration: 0
        };
      }
      
      // Calculate progress using completion status from StudentProgress (not time-based)
      const totalVideos = allVideos.length;
      
      // Calculate total duration
      let totalDuration = 0;
      allVideos.forEach(video => {
        if (video.duration && video.duration > 0) {
          totalDuration += video.duration;
        }
      });
      
      let videosCompleted = 0;
      let videosStarted = 0;
      
      // Get student progress for more accurate completion tracking
      const studentProgress = await StudentProgress.findOne({ 
        student: student._id, 
        course: course._id 
      });
      
      allVideos.forEach(video => {
        const watchRecord = student.watchHistory.find(
          record => record.video && record.video.toString() === video._id.toString()
        );
        
        if (watchRecord && watchRecord.timeSpent > 0) {
          videosStarted++;
        }
        
        // Check completion status from StudentProgress (unit-based) - PERMANENT completion tracking
        let isCompleted = false;
        if (studentProgress && studentProgress.units) {
          for (const unit of studentProgress.units) {
            const videoWatch = unit.videosWatched.find(
              vw => vw.videoId && vw.videoId.toString() === video._id.toString()
            );
            if (videoWatch && videoWatch.completed === true) {
              isCompleted = true;
              break;
            }
          }
        }
        
        // Fallback: ONLY use time-based completion if video has NEVER been marked as completed before
        // This ensures that once a video is completed, it stays completed regardless of rewatches
        if (!isCompleted && watchRecord && video.duration && video.duration > 0) {
          const percentageWatched = (watchRecord.timeSpent / video.duration) * 100;
          if (percentageWatched >= 98) { // Use stricter 98% threshold for fallback
            isCompleted = true;
          }
        }
        
        if (isCompleted) {
          videosCompleted++;
        }
      });
      
      // Count completed reading materials
      const readingMaterialsCompleted = studentProgress?.completedReadingMaterials?.length || 0;
      
      // Count total quizzes (each unit can have 0 or 1 quiz)
      // Count based on StudentProgress quiz attempts, not Unit.quizPool
      let totalQuizzes = 0;
      let quizzesPassed = 0;
      
      console.log(`🔍 Checking quizzes for course "${course.title}" via StudentProgress:`, {
        hasStudentProgress: !!studentProgress,
        hasUnits: !!(studentProgress && studentProgress.units),
        unitsCount: studentProgress?.units?.length || 0
      });
      
      if (studentProgress && studentProgress.units && courseWithVideos && courseWithVideos.units) {
        // For each unit in the course, check if student has quiz attempts
        courseWithVideos.units.forEach((unit, idx) => {
          const unitProgress = studentProgress.units.find(
            u => u.unitId && u.unitId.toString() === unit._id.toString()
          );
          
          // A unit has a quiz if there are any quiz attempts recorded
          const hasQuiz = unitProgress && unitProgress.quizAttempts && unitProgress.quizAttempts.length > 0;
          
          console.log(`  Unit ${idx + 1} "${unit.title}":`, {
            hasQuiz,
            attemptsCount: unitProgress?.quizAttempts?.length || 0,
            unitId: unit._id.toString()
          });
          
          if (hasQuiz) {
            totalQuizzes++;
            
            // Sort by date to get latest attempt
            const sortedAttempts = [...unitProgress.quizAttempts].sort((a, b) => {
              const dateA = new Date(a.completedAt || a.submittedAt || 0);
              const dateB = new Date(b.completedAt || b.submittedAt || 0);
              return dateB - dateA; // Latest first
            });
            
            // Check if LATEST attempt passed
            if (sortedAttempts[0].passed === true) {
              quizzesPassed++;
            }
          }
        });
      }
      
      // Calculate progress including videos, reading materials, AND quizzes
      const totalContent = totalVideos + totalReadingMaterials + totalQuizzes;
      const completedContent = videosCompleted + readingMaterialsCompleted + quizzesPassed;
      
      const progress = totalContent > 0
        ? Math.round((completedContent / totalContent) * 100)
        : 0;
      
      console.log(`📊 Course "${course.title}" progress calculation:`, {
        totalVideos,
        videosCompleted,
        totalReadingMaterials,
        readingMaterialsCompleted,
        totalQuizzes,
        quizzesPassed,
        totalContent,
        completedContent,
        progress: `${progress}%`
      });
      
        return {
          _id: course._id.toString(), // Ensure _id is always a string
          title: course.title || 'Untitled Course',
          courseCode: course.courseCode || 'N/A',
          description: course.description || '',
          section: course.section,
          sectionId: course.section?._id?.toString(), // Ensure sectionId is also a string
          teacher: course.teacher?.name || 'Not assigned',
          teacherName: course.teacher?.name || 'Not assigned', // Frontend expects this field
          totalVideos,
          videoCount: totalVideos, // Frontend expects this field  
          videosStarted,
          videosCompleted,
          totalReadingMaterials,
          readingMaterialsCompleted,
          progress,
          totalDuration
        };
    }));
    
    // Normalize URLs in the response before sending
    const normalizedCoursesWithProgress = normalizeObjectUrls(coursesWithProgress);
    
    res.json(normalizedCoursesWithProgress);
  } catch (err) {
    console.error('Error getting student courses:', err);
    res.status(500).json({ message: err.message });
  }
};

// Get course content (videos and documents) based on approved arrangement or fallback to videos
exports.getCourseVideos = async (req, res) => {
  try {
    const { courseId } = req.params;
    console.log('Student getCourseContent called for course:', courseId, 'by user:', req.user._id);
    
    // Check if student has access to this course via sections
    const hasAccess = await studentHasAccessToCourse(req.user._id, courseId);
    if (!hasAccess) {
      console.log('Student does not have access to course:', courseId);
      return res.status(403).json({ message: 'You do not have access to this course' });
    }

    // Check if there's an approved content arrangement for this course
    const ContentArrangement = require('../models/ContentArrangement');
    const ReadingMaterial = require('../models/ReadingMaterial');
    
    const approvedArrangement = await ContentArrangement.findOne({
      course: courseId,
      status: 'approved'
    }).sort({ version: -1 });

    console.log('Approved arrangement found:', !!approvedArrangement);

    // Get student data with watch history
    const student = await User.findById(req.user._id).select('watchHistory');
    if (!student) {
      console.log('Student not found:', req.user._id);
      return res.status(404).json({ message: 'Student not found' });
    }

    const course = await Course.findById(courseId)
      .populate('units');

    if (!course) {
      console.log('Course not found:', courseId);
      return res.status(404).json({ message: 'Course not found' });
    }

    console.log('Student has section-based access to course:', courseId);

    if (approvedArrangement && course.isLaunched) {
      // Use approved content arrangement structure
      console.log('Using approved content arrangement with', approvedArrangement.items.length, 'items');
      
      // Group content by units and populate full details
      const units = [];
      const unitMap = new Map();
      
      // Process each content item
      for (const item of approvedArrangement.items) {
        if (!unitMap.has(item.unitId.toString())) {
          // Find the unit details
          const unitDetails = course.units.find(u => u._id.toString() === item.unitId.toString());
          if (unitDetails) {
            unitMap.set(item.unitId.toString(), {
              _id: unitDetails._id,
              title: unitDetails.title,
              order: unitDetails.order,
              videos: [],
              documents: []
            });
          }
        }
        
        // Populate content details based on type (only approved content for students)
        let contentDetails = null;
        if (item.type === 'video') {
          contentDetails = await Video.findOne({
            _id: item.contentId,
            $or: [
              { isApproved: true },
              { isApproved: { $exists: false } },
              { approvalStatus: 'approved' },
              { approvalStatus: { $exists: false } }
            ]
          }).populate('unit', 'title order');
        } else if (item.type === 'document') {
          contentDetails = await ReadingMaterial.findOne({
            _id: item.contentId,
            $or: [
              { isApproved: true },
              { isApproved: { $exists: false } },
              { approvalStatus: 'approved' },
              { approvalStatus: { $exists: false } }
            ]
          }).populate('unit', 'title order');
        }
        
        // Skip if content not found (either doesn't exist or not approved)
        if (!contentDetails) {
          console.log(`⏭️ Skipping unapproved content: ${item.type} - ${item.title}`);
          continue;
        }
        
        if (unitMap.has(item.unitId.toString())) {
          const unitData = unitMap.get(item.unitId.toString());
          
          if (item.type === 'video') {
            unitData.videos.push({
              ...contentDetails.toObject(),
              arrangedOrder: item.order,
              arrangedTitle: item.title,
              videoUrl: processVideoUrl(contentDetails.videoUrl)
            });
          } else {
            // Process document URL for S3 signed URLs
            const documentDetails = {
              ...contentDetails.toObject(),
              arrangedOrder: item.order,
              arrangedTitle: item.title,
              type: 'document'
            };
            
            // Process document URL if it exists
            if (contentDetails.fileUrl) {
              documentDetails.documentUrl = processDocumentUrl(contentDetails.fileUrl);
              documentDetails.url = documentDetails.documentUrl; // For backward compatibility
            }
            
            unitData.documents.push(documentDetails);
          }
        }
      }
      
      // Convert map to array and sort
      const unitsArray = Array.from(unitMap.values()).sort((a, b) => (a.order || 0) - (b.order || 0));
      
      // Sort content within each unit by arranged order
      unitsArray.forEach(unit => {
        unit.videos.sort((a, b) => (a.arrangedOrder || 0) - (b.arrangedOrder || 0));
        unit.documents.sort((a, b) => (a.arrangedOrder || 0) - (b.arrangedOrder || 0));
      });
      
      // Get student progress for this course
      const progress = await StudentProgress.findOne({ student: req.user._id, course: courseId });
      let unlockedVideoIds = progress ? progress.unlockedVideos.map(id => id.toString()) : [];
      
      console.log('Student progress found:', !!progress);
      console.log('Unlocked videos:', unlockedVideoIds.length);
      
      // Handle initial progress for arranged content
      if (!progress && unitsArray.length > 0) {
        const firstUnit = unitsArray[0];
        let firstVideoId = null;
        
        if (firstUnit.videos.length > 0) {
          firstVideoId = firstUnit.videos[0]._id.toString();
        }
        
        const initialUnlockedVideos = firstVideoId ? [firstVideoId] : [];
        
        await StudentProgress.create({
          student: req.user._id,
          course: courseId,
          unlockedVideos: initialUnlockedVideos,
          units: [],
          overallProgress: 0,
          lastActivity: new Date()
        });
        
        unlockedVideoIds = initialUnlockedVideos;
        console.log('Created initial progress with first arranged video unlocked:', firstVideoId);
      } else if (progress && unitsArray.length > 0) {
        // IMPORTANT: If progress exists but uses old arrangement, reinitialize first video
        // This ensures students can access content after arrangement changes
        const firstUnit = unitsArray[0];
        
        if (firstUnit.videos.length > 0) {
          const firstVideoId = firstUnit.videos[0]._id.toString();
          
          // Check if first arranged video is unlocked
          if (!unlockedVideoIds.includes(firstVideoId)) {
            console.log(`🔄 First arranged video not unlocked, adding it: ${firstVideoId}`);
            progress.unlockedVideos.push(firstVideoId);
            await progress.save();
            unlockedVideoIds.push(firstVideoId);
          }
        }
      }
      
      // Add unlock status to content
      unitsArray.forEach(unit => {
        unit.videos.forEach(video => {
          video.isUnlocked = unlockedVideoIds.includes(video._id.toString());
          const watchHistory = student.watchHistory.find(wh => 
            wh.video && wh.video.toString() === video._id.toString()
          );
          
          // Calculate watched percentage based on time spent vs video duration
          if (watchHistory && video.duration && video.duration > 0) {
            video.watchedPercentage = Math.min((watchHistory.timeSpent / video.duration) * 100, 100);
          } else {
            video.watchedPercentage = 0;
          }
          
          video.isCompleted = watchHistory ? watchHistory.isCompleted : false;
        });
        
        // Documents are always unlocked (no viewing progression)
        unit.documents.forEach(doc => {
          doc.isUnlocked = true;
        });
      });
      
      return res.json({
        course: course,
        units: unitsArray,
        hasArrangedContent: true,
        message: 'Course content loaded from approved arrangement'
      });
    }
    
    // Fallback to original video-only logic if no approved arrangement
    console.log('No approved arrangement, falling back to video-only content');
    
    
    // Get student progress for this course
    const progress = await StudentProgress.findOne({ student: req.user._id, course: courseId });
    let unlockedVideoIds = progress ? progress.unlockedVideos.map(id => id.toString()) : [];
    
    console.log('Student progress found:', !!progress);
    console.log('Unlocked videos:', unlockedVideoIds.length);
    console.log('Unlocked video IDs:', unlockedVideoIds);

    // If no progress exists, create initial progress with only first video unlocked
    if (!progress) {
      console.log('No progress found, creating initial progress for course');
      
      // Get first video from first unit to unlock it
      const firstUnit = await Unit.findOne({ course: courseId })
        .sort('order')
        .populate('videos');
      
      let firstVideoId = null;
      if (firstUnit && firstUnit.videos && firstUnit.videos.length > 0) {
        // Sort videos by sequence and get the first one
        const sortedVideos = firstUnit.videos.sort((a, b) => (a.sequence || 0) - (b.sequence || 0));
        firstVideoId = sortedVideos[0]._id.toString();
      } else {
        // Fallback: get first video from course (non-unit based)
        const firstVideo = await Video.findOne({ course: courseId }).sort('createdAt');
        if (firstVideo) {
          firstVideoId = firstVideo._id.toString();
        }
      }
      
      // Create new progress record with only first video unlocked
      const initialUnlockedVideos = firstVideoId ? [firstVideoId] : [];
      
      const initialUnits = [];
      if (firstUnit) {
        initialUnits.push({
          unitId: firstUnit._id,
          status: 'in-progress',
          unlocked: true,
          unlockedAt: new Date(),
          videosWatched: [],
          quizAttempts: [],
          unitQuizCompleted: false,
          unitQuizPassed: false,
          allVideosWatched: false
        });
      }
      
      await StudentProgress.create({
        student: req.user._id,
        course: courseId,
        unlockedVideos: initialUnlockedVideos,
        units: initialUnits,
        overallProgress: 0,
        lastActivity: new Date()
      });
      
      unlockedVideoIds = initialUnlockedVideos;
      console.log('Created initial progress with first video unlocked:', firstVideoId);
    } else if (unlockedVideoIds.length === 0) {
      // If progress exists but no videos unlocked, unlock first video
      const firstUnit = await Unit.findOne({ course: courseId })
        .sort('order')
        .populate('videos');
      
      let firstVideoId = null;
      if (firstUnit && firstUnit.videos && firstUnit.videos.length > 0) {
        const sortedVideos = firstUnit.videos.sort((a, b) => (a.sequence || 0) - (b.sequence || 0));
        firstVideoId = sortedVideos[0]._id.toString();
        
        // Also ensure first unit is marked as unlocked
        const firstUnitIndex = progress.units.findIndex(
          u => u.unitId.toString() === firstUnit._id.toString()
        );
        
        if (firstUnitIndex === -1) {
          progress.units.push({
            unitId: firstUnit._id,
            status: 'in-progress',
            unlocked: true,
            unlockedAt: new Date(),
            videosWatched: [],
            quizAttempts: [],
            unitQuizCompleted: false,
            unitQuizPassed: false,
            allVideosWatched: false
          });
        } else {
          progress.units[firstUnitIndex].unlocked = true;
          progress.units[firstUnitIndex].status = 'in-progress';
        }
      }
      
      if (firstVideoId) {
        progress.unlockedVideos = [firstVideoId];
        await progress.save();
        unlockedVideoIds = [firstVideoId];
        console.log('Unlocked first video for existing progress:', firstVideoId);
      }
    }

    // Check for newly added videos that should be unlocked
    // This handles the case where admin uploads new videos to existing courses
    if (progress) {
      let hasNewVideos = false;
      
      // Get all videos in the course
      const allCourseVideos = await Video.find({ course: courseId }).sort('sequence');
      
      // For each unlocked unit, ensure all videos in sequence are unlocked
      for (const video of allCourseVideos) {
        if (video.unit) {
          // Check if this video's unit is unlocked
          const unitProgress = progress.units?.find(
            u => u.unitId.toString() === video.unit.toString()
          );
          
          if (unitProgress && unitProgress.unlocked) {
            // Get all videos in this unit sorted by sequence
            const unitVideos = allCourseVideos
              .filter(v => v.unit && v.unit.toString() === video.unit.toString())
              .sort((a, b) => (a.sequence || 0) - (b.sequence || 0));
            
            // Find which videos should be unlocked based on completion
            let shouldUnlockIndex = 0; // At least first video should be unlocked
            
            // Check completion of videos to determine how many should be unlocked
            for (let i = 0; i < unitVideos.length; i++) {
              const videoInUnit = unitVideos[i];
              const watchRecord = student.watchHistory.find(
                record => record.video && record.video.toString() === videoInUnit._id.toString()
              );
              
              const isCompleted = watchRecord && (
                (videoInUnit.duration && videoInUnit.duration > 0 && watchRecord.timeSpent >= videoInUnit.duration * 0.9) ||
                ((!videoInUnit.duration || videoInUnit.duration < 1) && watchRecord.timeSpent >= 5)
              );
              
              if (isCompleted && i < unitVideos.length - 1) {
                shouldUnlockIndex = i + 1; // Unlock next video
              }
            }
            
            // Unlock videos up to the determined index
            for (let i = 0; i <= shouldUnlockIndex && i < unitVideos.length; i++) {
              const videoToUnlock = unitVideos[i];
              if (!unlockedVideoIds.includes(videoToUnlock._id.toString())) {
                progress.unlockedVideos.push(videoToUnlock._id);
                unlockedVideoIds.push(videoToUnlock._id.toString());
                hasNewVideos = true;
                console.log('Auto-unlocked new video in unit:', videoToUnlock.title);
              }
            }
          }
        } else {
          // For videos not in units, check if they should be unlocked based on sequence
          const nonUnitVideos = allCourseVideos
            .filter(v => !v.unit)
            .sort((a, b) => (a.sequence || 0) - (b.sequence || 0));
          
          // At least the first non-unit video should be unlocked
          if (nonUnitVideos.length > 0 && !unlockedVideoIds.includes(nonUnitVideos[0]._id.toString())) {
            progress.unlockedVideos.push(nonUnitVideos[0]._id);
            unlockedVideoIds.push(nonUnitVideos[0]._id.toString());
            hasNewVideos = true;
            console.log('Auto-unlocked first non-unit video:', nonUnitVideos[0].title);
          }
        }
      }
      
      // Save progress if we unlocked new videos
      if (hasNewVideos) {
        await progress.save();
        console.log('Updated progress with newly unlocked videos');
      }
    }

    // SAFETY CHECK: Ensure at least first video in each unlocked unit is available
    if (progress) {
      let needsSafetyUpdate = false;
      const unitsForSafety = await Unit.find({ course: courseId })
        .sort('order')
        .populate('videos');
      
      for (const unit of unitsForSafety) {
        const unitProgress = progress.units?.find(u => u.unitId?.toString() === unit._id.toString());
        
        // Special case: Always ensure first unit has at least one unlocked video
        const isFirstUnit = unit.order === 0 || unit.order === undefined || unit.order === null;
        
        // If unit is unlocked OR it's the first unit, ensure first video is unlocked
        if ((unitProgress && unitProgress.unlocked) || isFirstUnit) {
          if (unit.videos && unit.videos.length > 0) {
            const firstVideo = unit.videos.sort((a, b) => (a.sequence || 0) - (b.sequence || 0))[0];
            if (!unlockedVideoIds.includes(firstVideo._id.toString())) {
              console.log(`SAFETY: Unlocking first video in unit ${unit.title}: ${firstVideo.title} ${isFirstUnit ? '(First Unit)' : '(Unlocked Unit)'}`);
              progress.unlockedVideos.push(firstVideo._id);
              unlockedVideoIds.push(firstVideo._id.toString());
              needsSafetyUpdate = true;
              
              // Ensure the unit is marked as unlocked in progress if it's the first unit
              if (isFirstUnit && !unitProgress) {
                progress.units.push({
                  unitId: unit._id,
                  status: 'in-progress',
                  unlocked: true,
                  unlockedAt: new Date(),
                  videosWatched: [],
                  quizAttempts: [],
                  unitQuizCompleted: false,
                  unitQuizPassed: false,
                  allVideosWatched: false
                });
              } else if (isFirstUnit && unitProgress && !unitProgress.unlocked) {
                unitProgress.unlocked = true;
                unitProgress.status = 'in-progress';
              }
            }
          }
        }
      }
      
      if (needsSafetyUpdate) {
        await progress.save();
        console.log('Applied safety unlock for unit videos');
      }
    }

    // Return unit-based organization if course has units
    if (course.hasUnits && course.units && course.units.length > 0) {
      // Get units with videos and progress info
      // Only fetch approved videos for students
      const units = await Unit.find({ course: courseId })
        .sort('order')
        .populate({
          path: 'videos',
          match: { 
            $or: [
              { isApproved: true },
              { isApproved: { $exists: false } }, // Handle legacy videos without isApproved field
              { approvalStatus: 'approved' },
              { approvalStatus: { $exists: false } } // Handle legacy videos
            ]
          },
          select: 'title description videoUrl teacher duration sequence unit isApproved',
          populate: {
            path: 'teacher',
            select: 'name'
          },
          options: { sort: { sequence: 1 } }
        })
        .populate({
          path: 'readingMaterials',
          match: { 
            $or: [
              { isApproved: true },
              { isApproved: { $exists: false } }
            ]
          },
          select: 'title description isApproved'
        })
        .populate({
          path: 'quizPool',
          select: 'title'
        });
      
      console.log('📋 Fetched units with approved content for student');

      // Process units with video watch history
      const unitsWithProgress = await Promise.all(units.map(async unit => {
        // Check if unit is unlocked for this student
        const unitProgress = progress?.units?.find(
          u => u.unitId.toString() === unit._id.toString()
        );
        
        // Check unit deadline
        const deadlineInfo = await checkUnitDeadline(unit._id);
        const isDeadlinePassed = deadlineInfo.hasDeadline && deadlineInfo.isExpired;
        
        // Unit is accessible if:
        // 1. It's unlocked in progress AND
        // 2. Either no deadline OR deadline hasn't passed OR not strict deadline
        const baseUnlocked = unitProgress ? unitProgress.unlocked : 
          // First unit is always unlocked by default
          unit.order === 0;
          
        const isUnitAccessible = baseUnlocked && (!isDeadlinePassed || !deadlineInfo.strictDeadline);
        
        console.log(`Processing unit: ${unit.title} (${unit._id})`);
        console.log(`  Base unlocked: ${baseUnlocked}`);
        console.log(`  Deadline info:`, deadlineInfo);
        console.log(`  Is accessible: ${isUnitAccessible}`);
        console.log(`  Unit videos count: ${unit.videos ? unit.videos.length : 0}`);
        console.log(`  Videos before filter:`, unit.videos ? unit.videos.map(v => ({ id: v._id.toString(), title: v.title })) : []);
        
        const videosWithWatchInfo = unit.videos
          .filter(video => {
            const isVideoUnlocked = unlockedVideoIds.includes(video._id.toString());
            console.log(`    Video "${video.title}" (${video._id}): unlocked = ${isVideoUnlocked}`);
            return isVideoUnlocked;
          })
          .map(video => {
            const watchRecord = student.watchHistory.find(
              record => record.video && record.video.toString() === video._id.toString()
            );
            const timeSpent = watchRecord ? watchRecord.timeSpent : 0;
            const lastWatched = watchRecord ? watchRecord.lastWatched : null;
            const watched = (video.duration && video.duration > 0 && timeSpent >= video.duration * 0.9) ||
                    ((!video.duration || video.duration < 1) && timeSpent >= 5);
            return {
              _id: video._id,
              title: video.title || 'Untitled Video',
              description: video.description || '',
              videoUrl: processVideoUrl(video.videoUrl),
              duration: video.duration || 0,
              teacher: video.teacher,
              sequence: video.sequence,
              timeSpent,
              lastWatched,
              watched
            };
          });
        
        console.log(`  Videos after filter: ${videosWithWatchInfo.length}`);
        if (videosWithWatchInfo.length > 0) {
          console.log(`  Filtered videos:`, videosWithWatchInfo.map(v => ({ id: v._id, title: v.title })));
        }
        
        // Derive latest quiz attempt if available
        let latestQuizAttempt = null;
        if (unitProgress && Array.isArray(unitProgress.quizAttempts) && unitProgress.quizAttempts.length > 0) {
          latestQuizAttempt = [...unitProgress.quizAttempts]
            .sort((a, b) => new Date(b.completedAt || 0) - new Date(a.completedAt || 0))[0];
        }
        
        // Calculate reading materials progress
        const totalReadingMaterials = unit.readingMaterials ? unit.readingMaterials.length : 0;
        const completedReadingMaterialIds = (progress?.completedReadingMaterials || []).map(id => id.toString());
        const unitReadingMaterialIds = (unit.readingMaterials || []).map(rm => rm._id.toString());
        const readingMaterialsCompleted = unitReadingMaterialIds.filter(id => 
          completedReadingMaterialIds.includes(id)
        ).length;
        
        // Check if unit has quiz
        const hasQuiz = !!(unit.quizPool || (unit.quizzes && unit.quizzes.length > 0));
        const totalQuizzes = hasQuiz ? 1 : 0;
        
        // CRITICAL FIX: Check latest quiz attempt to determine if quiz is actually passed
        // Don't rely solely on unitProgress.unitQuizPassed as it may be stale
        let quizzesPassed = 0;
        if (hasQuiz && unitProgress && Array.isArray(unitProgress.quizAttempts) && unitProgress.quizAttempts.length > 0) {
          // Get the most recent quiz attempt
          const latestAttempt = [...unitProgress.quizAttempts]
            .sort((a, b) => new Date(b.completedAt || 0) - new Date(a.completedAt || 0))[0];
          
          // Quiz is passed only if the latest attempt has passed flag as true
          quizzesPassed = (latestAttempt && latestAttempt.passed) ? 1 : 0;
          
          console.log(`Quiz pass check for unit ${unit.title}:`, {
            hasQuiz,
            latestAttemptPassed: latestAttempt?.passed,
            latestAttemptPercentage: latestAttempt?.percentage,
            quizzesPassed,
            unitQuizPassedField: unitProgress.unitQuizPassed
          });
        } else if (hasQuiz) {
          quizzesPassed = 0; // No attempts or no quiz attempts array
        }

        return {
          _id: unit._id,
          title: unit.title || 'Untitled Unit',
          description: unit.description || '',
          order: unit.order || 0,
          unlocked: isUnitAccessible,
          deadlineInfo: deadlineInfo.hasDeadline ? {
            hasDeadline: true,
            deadline: deadlineInfo.deadline,
            isExpired: deadlineInfo.isExpired,
            daysLeft: deadlineInfo.daysLeft,
            strictDeadline: deadlineInfo.strictDeadline,
            deadlineDescription: deadlineInfo.deadlineDescription
          } : { hasDeadline: false },
          progress: unitProgress ? {
            status: unitProgress.status,
            videosCompleted: unitProgress.videosWatched.filter(v => v.completed).length,
            totalVideos: unit.videos.length,
            readingMaterialsCompleted,
            totalReadingMaterials,
            quizzesPassed,
            totalQuizzes,
            unitQuizCompleted: !!unitProgress.unitQuizCompleted,
            unitQuizPassed: !!unitProgress.unitQuizPassed,
            latestQuizAttempt: latestQuizAttempt ? {
              percentage: latestQuizAttempt.percentage || latestQuizAttempt.score || 0,
              passed: !!latestQuizAttempt.passed,
              completedAt: latestQuizAttempt.completedAt || null
            } : null
          } : {
            status: isUnitAccessible ? 'in-progress' : 'locked',
            videosCompleted: 0,
            totalVideos: unit.videos.length,
            readingMaterialsCompleted: 0,
            totalReadingMaterials,
            quizzesPassed: 0,
            totalQuizzes,
            unitQuizCompleted: false,
            unitQuizPassed: false,
            latestQuizAttempt: null
          },
          videos: isUnitAccessible ? videosWithWatchInfo : []
        };
      }));

      return res.json({
        course: {
          _id: course._id,
          title: course.title,
          courseCode: course.courseCode,
          description: course.description,
          hasUnits: true
        },
        units: unitsWithProgress
      });
    } else {
      // Fall back to non-unit behavior for courses without units
      // Fetch all approved videos for this course (students only see approved content)
      const videos = await Video.find({ 
        course: courseId,
        $or: [
          { isApproved: true },
          { isApproved: { $exists: false } }, // Handle legacy videos
          { approvalStatus: 'approved' },
          { approvalStatus: { $exists: false } } // Handle legacy videos
        ]
      })
        .populate('teacher', 'name')
        .sort('createdAt');
      
      console.log('📋 Fetched approved videos for non-unit course');

      // Add watch history info only for unlocked videos
      const videosWithWatchInfo = videos
        .filter(video => unlockedVideoIds.includes(video._id.toString()))
        .map(video => {
          const watchRecord = student.watchHistory.find(
            record => record.video && record.video.toString() === video._id.toString()
          );
          const timeSpent = watchRecord ? watchRecord.timeSpent : 0;
          const lastWatched = watchRecord ? watchRecord.lastWatched : null;
          const watched = (video.duration && video.duration > 0 && timeSpent >= video.duration * 0.9) ||
                  ((!video.duration || video.duration < 1) && timeSpent >= 5);
          return {
            _id: video._id,
            title: video.title,
            description: video.description,
            videoUrl: processVideoUrl(video.videoUrl),
            duration: video.duration || 0,
            teacher: video.teacher,
            timeSpent,
            lastWatched,
            watched
          };
        });

      return res.json({
        course: {
          _id: course._id,
          title: course.title,
          courseCode: course.courseCode,
          description: course.description,
          hasUnits: false
        },
        videos: videosWithWatchInfo
      });
    }
  } catch (err) {
    console.error('Error getting course videos:', err);
    res.status(500).json({ message: err.message });
  }
};

// Update watch history for a video
exports.updateWatchHistory = async (req, res) => {
  console.log('🎬 updateWatchHistory called:', {
    videoId: req.params.videoId,
    userId: req.user?._id,
    userRole: req.user?.role,
    bodyKeys: Object.keys(req.body || {}),
    body: req.body
  });
  
  try {
    const { videoId } = req.params;
    const { 
      timeSpent, 
      sessionTime, 
      segmentTime, 
      currentTime, 
      duration, 
      isCompleted, 
      sessionCount, 
      segmentsWatched, 
      totalSegments,
      completionPercentage,
      averageSessionLength,
      playbackRate,
      speedAdjustedTime,
      realTimeSpent
    } = req.body;
    
    // Validate input - accept either timeSpent or segmentTime (allow 0 as valid value)
    const primaryTimeValue = segmentTime !== undefined ? segmentTime : 
                            (speedAdjustedTime !== undefined ? speedAdjustedTime : timeSpent);
    
    if (primaryTimeValue === undefined || primaryTimeValue === null || isNaN(primaryTimeValue)) {
      console.error('❌ Invalid time value:', { segmentTime, speedAdjustedTime, timeSpent, primaryTimeValue });
      return res.status(400).json({ 
        message: 'Valid timeSpent, segmentTime, or speedAdjustedTime is required',
        received: { segmentTime, speedAdjustedTime, timeSpent }
      });
    }
    
    // Find video to get course info and unit info if available
    const video = await Video.findById(videoId);
    if (!video) {
      return res.status(404).json({ message: 'Video not found' });
    }
    
    // Validate user exists
    if (!req.user || !req.user._id) {
      return res.status(401).json({ message: 'User authentication required' });
    }
    
    // Check if student is assigned to this course
    const student = await User.findById(req.user._id);
    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }
    
    // Check if student has access to this course via sections
    const hasAccess = await studentHasAccessToCourse(req.user._id, video.course.toString());
    if (!hasAccess) {
      return res.status(403).json({ message: 'You are not assigned to this course' });
    }
    
    // Check if video is unlocked for this student
    const progress = await StudentProgress.findOne({ 
      student: req.user._id, 
      course: video.course 
    });
    
    if (!progress) {
      return res.status(403).json({ message: 'Course progress not found' });
    }
    
    // Initialize unlockedVideos if it doesn't exist
    if (!progress.unlockedVideos) {
      progress.unlockedVideos = [];
    }
    
    // Allow watch history updates even for locked videos if a watch record already exists
    // This enables resume functionality when logging in from different devices
    const existingWatchRecord = student.watchHistory?.find(
      record => record.video && record.video.toString() === videoId
    );
    
    // Convert unlockedVideos to string array for comparison
    const unlockedVideoIds = progress.unlockedVideos.map(id => id.toString());
    const isVideoUnlocked = unlockedVideoIds.includes(videoId);
    
    console.log(`🔐 Lock check for video ${videoId}:`);
    console.log(`   Is Unlocked: ${isVideoUnlocked}`);
    console.log(`   Has Watch History: ${!!existingWatchRecord}`);
    console.log(`   Unlocked Videos: ${unlockedVideoIds.join(', ')}`);
    
    if (!isVideoUnlocked && !existingWatchRecord) {
      // Only block if video is locked AND no watch history exists yet
      console.log(`🔒 Video ${videoId} is locked and has no watch history - blocking access`);
      return res.status(403).json({ 
        message: 'This video is not unlocked for you yet',
        debug: {
          videoId,
          isUnlocked: false,
          hasHistory: false,
          unlockedVideos: unlockedVideoIds
        }
      });
    }
    
    // If video is locked but watch history exists, allow position updates (for resume functionality)
    const isLockedButHasHistory = !isVideoUnlocked && existingWatchRecord;
    if (isLockedButHasHistory) {
      console.log(`🔓 Video ${videoId} is locked but has watch history - allowing position update for resume`);
    }
    
    // Initialize watchHistory if it doesn't exist
    if (!student.watchHistory) {
      student.watchHistory = [];
    }
    
    // Find existing watch record for this video
    const existingRecord = student.watchHistory.find(
      record => record.video && record.video.toString() === videoId
    );
    
    let actualTimeSpent;
    const videoDuration = video.duration || duration || 600; // Use video duration, or provided duration, or default
    const maxAllowedTime = Math.max(videoDuration * 1.2, 600); // Allow 20% buffer for seeking/rewatching
    const currentPlaybackRate = playbackRate || 1;

    console.log(`📊 Processing watch update:`);
    console.log(`   Video Duration: ${videoDuration}s`);
    console.log(`   Playback Rate: ${currentPlaybackRate}x`);
    console.log(`   Real Time Spent: ${realTimeSpent || 'N/A'}s`);
    console.log(`   Speed Adjusted Time: ${speedAdjustedTime || 'N/A'}s`);
    console.log(`   Primary Time Value: ${primaryTimeValue}s`);

    if (existingRecord) {
      // For existing records, use the more accurate tracking method
      // Prefer speedAdjustedTime or segmentTime for better accuracy with speed changes
      let newTimeSpent;
      
      if (speedAdjustedTime !== undefined && speedAdjustedTime > 0) {
        // Speed-adjusted time is the most accurate for variable playback speeds
        newTimeSpent = Math.min(speedAdjustedTime, videoDuration);
        console.log(`Using speed-adjusted time: ${newTimeSpent}s`);
      } else if (sessionTime !== undefined && sessionTime > 0) {
        // Session-based tracking, accumulate carefully for rewatches
        // If playback rate info available, account for it
        const effectiveSessionTime = currentPlaybackRate > 1 ? sessionTime : sessionTime * 0.9;
        const previousTime = existingRecord.timeSpent;
        newTimeSpent = Math.min(previousTime + effectiveSessionTime, maxAllowedTime);
        console.log(`Using session time (rewatch-friendly): ${newTimeSpent}s (was: ${previousTime}s, added: ${effectiveSessionTime.toFixed(2)}s)`);
      } else if (segmentTime !== undefined && segmentTime > 0) {
        // Segment-based tracking for first-time viewing
        newTimeSpent = Math.max(existingRecord.timeSpent, Math.min(segmentTime, videoDuration));
        console.log(`Using segment time: ${newTimeSpent}s`);
      } else {
        // Fallback to basic timeSpent logic
        newTimeSpent = Math.max(existingRecord.timeSpent, Math.min(timeSpent, maxAllowedTime));
        console.log(`Using fallback timeSpent: ${newTimeSpent}s`);
      }
      
      // Only update if the new time is reasonable
      if (newTimeSpent >= existingRecord.timeSpent * 0.9) { // Allow small decreases due to better accuracy
        existingRecord.timeSpent = newTimeSpent;
        console.log(`✅ Updated existing record: ${existingRecord.timeSpent.toFixed(2)}s`);
      } else {
        console.log(`⚠️ Rejected update: ${newTimeSpent.toFixed(2)}s < ${(existingRecord.timeSpent * 0.9).toFixed(2)}s (90% of existing)`);
      }
      
      // Update position and enhanced metadata
      if (currentTime !== undefined) {
        existingRecord.currentPosition = currentTime;
        console.log(`✅ Updated currentPosition to ${currentTime}s for video ${videoId}`);
      } else {
        console.log(`⚠️ No currentTime provided in update for video ${videoId}`);
      }
      
      // Update playback rate if provided
      if (currentPlaybackRate !== undefined) {
        existingRecord.playbackRate = currentPlaybackRate;
      }
      
      // Store enhanced analytics metadata (only basic fields supported by schema)
      existingRecord.lastWatched = new Date();
      actualTimeSpent = existingRecord.timeSpent;
      
      console.log(`📊 Updated watch record for ${videoId}:`);
      console.log(`   Time: ${actualTimeSpent.toFixed(2)}s (${Math.floor(actualTimeSpent/60)}m ${Math.floor(actualTimeSpent%60)}s)`);
      console.log(`   Position: ${existingRecord.currentPosition || 0}s`);
    } else {
      // Add new record with enhanced validation and speed consideration
      let validatedTimeSpent;
      
      if (speedAdjustedTime !== undefined && speedAdjustedTime > 0) {
        validatedTimeSpent = Math.min(Math.max(speedAdjustedTime, 0), maxAllowedTime);
        console.log(`New record with speed-adjusted time: ${validatedTimeSpent}s`);
      } else {
        validatedTimeSpent = Math.min(Math.max(primaryTimeValue, 0), maxAllowedTime);
        console.log(`New record with primary time: ${validatedTimeSpent}s`);
      }
      
      const newRecord = {
        video: videoId,
        timeSpent: validatedTimeSpent,
        currentPosition: currentTime || 0,
        lastWatched: new Date(),
        playbackRate: currentPlaybackRate || 1
      };
      
      // Note: Enhanced analytics metadata not stored in User schema
      // Only basic watchHistory fields are supported
      
      student.watchHistory.push(newRecord);
      actualTimeSpent = validatedTimeSpent;
      
      console.log(`📊 Created new watch record for ${videoId}:`);
      console.log(`   Time: ${actualTimeSpent.toFixed(2)}s (${Math.floor(actualTimeSpent/60)}m ${Math.floor(actualTimeSpent%60)}s)`);
      console.log(`   Position: ${currentTime || 0}s`);
      
      if (validatedTimeSpent !== timeSpent && timeSpent) {
        console.warn(`Adjusted new record timeSpent from ${timeSpent} to ${validatedTimeSpent} for video ${videoId} (duration: ${videoDuration})`);
      }
    }
    
    // If video has no duration stored OR frontend provided duration differs significantly, update the video
    if (duration && duration > 0) {
      const shouldUpdateDuration = (!video.duration || video.duration === 0) || 
        (video.duration > 0 && Math.abs(video.duration - duration) > 2); // More than 2 second difference
        
      if (shouldUpdateDuration) {
        console.log(`📝 Updating video ${videoId} duration from ${video.duration} to ${duration}s (frontend provided correct duration)`);
        video.duration = Math.round(duration);
        await video.save();
      }
    }
    
    // Use the most accurate duration available
    const actualDuration = video.duration || duration || videoDuration;
    
    // Check if video is completed BEFORE saving to update the watch history record
    // CRITICAL: Use balanced thresholds - trust frontend completion flag, or use 85% AND logic as fallback
    const timeBasedCompletion = actualTimeSpent >= actualDuration * 0.85; // 85% of time spent
    const positionBasedCompletion = currentTime && currentTime >= actualDuration * 0.85; // 85% of video position reached
    const explicitCompletion = isCompleted === true;
    
    console.log(`🔍 Completion Check Details for ${videoId}:`);
    console.log(`   Explicit completion flag from frontend: ${explicitCompletion}`);
    console.log(`   Time: ${actualTimeSpent.toFixed(2)}s / ${actualDuration.toFixed(2)}s = ${(actualTimeSpent/actualDuration*100).toFixed(1)}% (needs 85%: ${timeBasedCompletion})`);
    console.log(`   Position: ${(currentTime || 0).toFixed(2)}s / ${actualDuration.toFixed(2)}s = ${((currentTime || 0)/actualDuration*100).toFixed(1)}% (needs 85%: ${positionBasedCompletion})`);
    
    // Video is completed if:
    // 1) Frontend explicitly says completed (HIGHEST PRIORITY - trust frontend's stricter logic) OR
    // 2) BOTH time (85%) AND position (85%) thresholds are met (prevents accidental completion)
    // Using 85% threshold to balance between preventing premature unlock and allowing natural completion
    const videoIsCompleted = explicitCompletion || (timeBasedCompletion && positionBasedCompletion);
    
    // Update the isCompleted field in the watch history record
    const watchRecord = student.watchHistory.find(
      record => record.video && record.video.toString() === videoId
    );
    if (watchRecord) {
      watchRecord.isCompleted = videoIsCompleted;
      // Also update the watched percentage
      if (actualDuration && actualDuration > 0) {
        watchRecord.watchedPercentage = Math.min((actualTimeSpent / actualDuration) * 100, 100);
      }
    }
    
    await student.save();
    
    // Update StudentProgress
    if (progress) {
      console.log(`📊 Completion check for ${videoId}:`);
      console.log(`   Time: ${actualTimeSpent.toFixed(2)}s / ${videoDuration.toFixed(2)}s (${(actualTimeSpent/videoDuration*100).toFixed(1)}%)`);
      console.log(`   Position: ${(currentTime || 0).toFixed(2)}s (${(((currentTime || 0)/videoDuration)*100).toFixed(1)}%)`);
      console.log(`   Playback Rate: ${currentPlaybackRate}x`);
      console.log(`   Real Time: ${realTimeSpent ? realTimeSpent.toFixed(2) + 's' : 'N/A'}`);
      console.log(`   Time Complete (85%): ${timeBasedCompletion}, Position Complete (85%): ${positionBasedCompletion}, Explicit: ${explicitCompletion}`);
      console.log(`   ✅ FINAL DECISION - Video Completed: ${videoIsCompleted} (${explicitCompletion ? 'explicit flag' : timeBasedCompletion && positionBasedCompletion ? 'time AND position' : 'NOT COMPLETE'})`);
      
      if (videoIsCompleted) {
        console.log(`🎉 Video ${videoId} IS COMPLETE - Will unlock next content`);
      } else {
        console.log(`⏳ Video ${videoId} NOT complete yet - No unlock will occur`);
      }
      
      // Check deadline compliance if video is part of a unit
      let deadlineCompliance = { shouldCount: true, completedAfterDeadline: false };
      if (video.unit && videoIsCompleted) {
        try {
          deadlineCompliance = await checkActivityDeadlineCompliance(video.unit, new Date());
          console.log(`📅 Deadline check for unit ${video.unit}:`, deadlineCompliance);
        } catch (deadlineError) {
          console.error('Error checking deadline compliance:', deadlineError);
          // Default to allowing the activity if there's an error
        }
      }
      
      // Add to completed videos if not already there and it's completed
      if (videoIsCompleted && !progress.completedVideos?.includes(videoId)) {
        // Ensure completedVideos array exists
        if (!progress.completedVideos) {
          progress.completedVideos = [];
        }
        
        // Only add to completed videos if deadline compliance allows it or it's not strict
        if (deadlineCompliance.shouldCount) {
          progress.completedVideos.push(videoId);
          console.log(`✅ Video ${videoId} marked as completed (watched at ${currentPlaybackRate}x speed)`);
        } else {
          console.log(`⚠️ Video ${videoId} completed after deadline - not counted due to strict deadline policy`);
        }
        
        // When a video is completed, unlock the next video in sequence
        try {
          console.log(`🔓 Attempting to unlock next video after completing ${videoId}...`);
          await unlockNextVideoInSequence(progress, video);
          console.log(`🔓 unlockNextVideoInSequence completed. Current unlocked videos: ${progress.unlockedVideos.length}`);
        } catch (unlockError) {
          console.error('❌ Error unlocking next video:', unlockError);
          // Don't fail the entire request, just log the error
        }
        
        // Also try arrangement-based unlock for mixed content order
        try {
          console.log(`📋 Attempting arrangement-based unlock after completing ${videoId}...`);
          await unlockNextContentInArrangement(progress, videoId, 'video', video.course.toString(), video.unit ? video.unit.toString() : null);
          console.log(`📋 unlockNextContentInArrangement completed. Current unlocked videos: ${progress.unlockedVideos.length}`);
        } catch (unlockError) {
          console.error('❌ Error unlocking next content in arrangement:', unlockError);
        }
      }
      
      // If video is part of a unit, update unit progress as well
      if (video.unit) {
        try {
          // Initialize units array if it doesn't exist
          if (!progress.units) {
            progress.units = [];
          }
          
          // Find the unit in the student's progress
          const unitIndex = progress.units.findIndex(
            u => u.unitId && u.unitId.toString() === video.unit.toString()
          );
          
          if (unitIndex !== -1) {
            // Initialize videosWatched array if it doesn't exist
            if (!progress.units[unitIndex].videosWatched) {
              progress.units[unitIndex].videosWatched = [];
            }
            
            // Unit found, check if this video is already tracked
            const videoWatchIndex = progress.units[unitIndex].videosWatched.findIndex(
              v => v.videoId && v.videoId.toString() === videoId
            );
            
            if (videoWatchIndex !== -1) {
              // Update existing record
              progress.units[unitIndex].videosWatched[videoWatchIndex].timeSpent = 
                Math.max(progress.units[unitIndex].videosWatched[videoWatchIndex].timeSpent || 0, timeSpent || 0);
              progress.units[unitIndex].videosWatched[videoWatchIndex].lastWatched = new Date();
              
              // CRITICAL FIX: Once completed, NEVER set back to false (preserve completion status)
              const wasAlreadyCompleted = progress.units[unitIndex].videosWatched[videoWatchIndex].completed === true;
              if (wasAlreadyCompleted) {
                // Keep it completed - don't let rewatches or partial views change completion status
                progress.units[unitIndex].videosWatched[videoWatchIndex].completed = true; // Ensure it stays true
                console.log(`🔒 Video ${videoId} already completed - preserving completion status (rewatch won't affect progress)`);
              } else if (videoIsCompleted) {
                // First time completing - set to completed
                progress.units[unitIndex].videosWatched[videoWatchIndex].completed = true;
                console.log(`✅ Video ${videoId} marked as completed for the first time`);
              }
              // If not completed and was not previously completed, leave as false (default)
              
              // Update deadline tracking if video is completed
              if (isCompleted && deadlineCompliance) {
                progress.units[unitIndex].videosWatched[videoWatchIndex].watchedAfterDeadline = deadlineCompliance.completedAfterDeadline;
              }
              
              const finalCompletionStatus = progress.units[unitIndex].videosWatched[videoWatchIndex].completed;
              console.log(`[updateWatchHistory] Updated unit video: ${videoId}, completed: ${finalCompletionStatus}, deadline compliant: ${!deadlineCompliance.completedAfterDeadline}`);
            } else {
              // Add new record
              const newVideoWatch = {
                videoId,
                timeSpent: timeSpent || 0,
                lastWatched: new Date(),
                completed: videoIsCompleted
              };
              
              // Add deadline tracking if video is completed
              if (videoIsCompleted && deadlineCompliance) {
                newVideoWatch.watchedAfterDeadline = deadlineCompliance.completedAfterDeadline;
              }
              
              progress.units[unitIndex].videosWatched.push(newVideoWatch);
              console.log(`[updateWatchHistory] Added unit video: ${videoId}, completed: ${videoIsCompleted}, deadline compliant: ${!deadlineCompliance.completedAfterDeadline}`);
            }
            
            // Check if all videos in this unit are completed to update unit status
            try {
              const Unit = require('../models/Unit');
              const unit = await Unit.findById(video.unit);
              
              if (unit && unit.videos && Array.isArray(unit.videos)) {
                const unitVideosCompleted = progress.units[unitIndex].videosWatched.filter(v => v.completed).length;
                const totalUnitVideos = unit.videos.length;
                
                // Update the videosCompleted counter to match
                progress.units[unitIndex].videosCompleted = unitVideosCompleted;
                
                console.log(`[updateWatchHistory] Unit ${unit.title}: ${unitVideosCompleted}/${totalUnitVideos} videos completed`);
                
                // If all videos in unit are completed, mark unit videos as completed
                if (unitVideosCompleted === totalUnitVideos && totalUnitVideos > 0) {
                  progress.units[unitIndex].allVideosWatched = true;
                  
                  console.log(`[updateWatchHistory] All videos completed in unit ${unit.title}. Quiz is now available.`);
                  
                  // Note: We don't automatically unlock the next unit here.
                  // The next unit should only be unlocked after passing the unit quiz.
                  // If there's no quiz requirement, it will be handled by the quiz system.
                }
              }
            } catch (unitError) {
              console.error('Error updating unit progress:', unitError);
              // Don't fail the entire request, just log the error
            }
          } else {
            // Unit not found in progress, add it
            if (videoIsCompleted) {
              progress.units.push({
                unitId: video.unit,
                status: 'in-progress',
                unlocked: true,
                unlockedAt: new Date(),
                videosWatched: [{
                  videoId,
                  timeSpent: timeSpent || 0,
                  lastWatched: new Date(),
                  completed: videoIsCompleted
                }],
                quizAttempts: [],
                unitQuizCompleted: false,
                unitQuizPassed: false,
                allVideosWatched: false,
                videosCompleted: 1
              });
              console.log(`[updateWatchHistory] Added new unit progress for unit: ${video.unit}, video: ${videoId}, completed: ${videoIsCompleted}`);
            }
          }
        } catch (unitError) {
          console.error('Error in unit progress section:', unitError);
          // Don't fail the entire request, just log the error
        }
      }
      
      // Update last activity timestamp
      progress.lastActivity = new Date();
      
      // Calculate overall course progress (including reading materials)
      try {
        const Course = require('../models/Course');
        const ReadingMaterial = require('../models/ReadingMaterial');
        const ContentArrangement = require('../models/ContentArrangement');
        const course = await Course.findById(video.course).populate('videos');
        
        if (course) {
          let totalVideos = 0;
          let totalReadingMaterials = 0;
          
          // **PERMANENT FIX: Use ContentArrangement if course is launched, otherwise use course.videos**
          if (course.isLaunched) {
            const approvedArrangement = await ContentArrangement.findOne({
              course: video.course,
              status: 'approved'
            }).sort({ version: -1 });
            
            if (approvedArrangement && approvedArrangement.items) {
              // Count videos and documents from the arrangement
              totalVideos = approvedArrangement.items.filter(item => item.type === 'video').length;
              totalReadingMaterials = approvedArrangement.items.filter(item => item.type === 'document').length;
              console.log(`📋 Using ContentArrangement for progress calculation: ${totalVideos} videos, ${totalReadingMaterials} docs`);
            } else {
              // Fallback to course model
              totalVideos = course.videos ? course.videos.length : 0;
              totalReadingMaterials = await ReadingMaterial.countDocuments({ 
                course: video.course,
                isApproved: { $ne: false },
                approvalStatus: { $ne: 'pending' }
              });
            }
          } else {
            // Course not launched, use course model
            totalVideos = course.videos ? course.videos.length : 0;
            totalReadingMaterials = await ReadingMaterial.countDocuments({ 
              course: video.course,
              isApproved: { $ne: false },
              approvalStatus: { $ne: 'pending' }
            });
          }
          
          const completedVideos = progress.completedVideos ? progress.completedVideos.length : 0;
          const completedReadingMaterials = progress.completedReadingMaterials ? progress.completedReadingMaterials.length : 0;
          
          // Calculate combined progress
          const totalContent = totalVideos + totalReadingMaterials;
          const completedContent = completedVideos + completedReadingMaterials;
          
          // **CRITICAL FIX: Cap at 100% to prevent validation errors**
          // This can happen if student completed content that was later removed from arrangement
          let calculatedProgress = totalContent > 0
            ? Math.round((completedContent / totalContent) * 100)
            : 0;
          
          progress.overallProgress = Math.min(calculatedProgress, 100);
          
          console.log(`📊 [Progress Calculation] Course: ${course.title}, Videos: ${completedVideos}/${totalVideos}, Docs: ${completedReadingMaterials}/${totalReadingMaterials}, Calculated: ${calculatedProgress}%, Capped: ${progress.overallProgress}%`);
          
          if (calculatedProgress > 100) {
            console.warn(`⚠️ Progress exceeded 100% (${calculatedProgress}%) - student completed ${completedContent} items but course only has ${totalContent} items. This may indicate content was removed from arrangement.`);
          }
        } else {
          console.warn(`⚠️ [Progress Calculation] Course not found: ${video.course}`);
        }
      } catch (courseError) {
        console.error('Error calculating course progress:', courseError);
        // Don't fail the entire request, just log the error
      }
      
      await progress.save();
    }
    
    // Debug: print unit progress after update
    if (video.unit && progress) {
      const unitIndex = progress.units.findIndex(u => u.unitId && u.unitId.toString() === video.unit.toString());
      if (unitIndex !== -1) {
        console.log('[updateWatchHistory] Unit progress after update:', JSON.stringify(progress.units[unitIndex], null, 2));
      }
    }
    res.json({ 
      message: 'Watch history updated',
      timeSpent: actualTimeSpent || timeSpent,
      lastWatched: new Date()
    });
  } catch (err) {
    console.error('Error updating watch history:', err);
    console.error('Stack trace:', err.stack);
    console.error('Request body:', req.body);
    console.error('Video ID:', req.params.videoId);
    console.error('User ID:', req.user?._id);
    
    // Return a more specific error message based on the error type
    if (err.name === 'ValidationError') {
      return res.status(400).json({ 
        message: 'Validation error: ' + err.message,
        details: err.errors 
      });
    } else if (err.name === 'CastError') {
      return res.status(400).json({ 
        message: 'Invalid ID format: ' + err.message 
      });
    } else if (err.code === 11000) {
      return res.status(409).json({ 
        message: 'Duplicate entry error: ' + err.message 
      });
    } else {
      return res.status(500).json({ 
        message: 'Internal server error while updating watch history',
        error: process.env.NODE_ENV === 'development' ? err.message : 'Internal server error'
      });
    }
  }
};

// Get watch history for a student across all courses
exports.getStudentWatchHistory = async (req, res) => {
  try {
    const student = await User.findById(req.user._id)
      .populate('watchHistory.video', 'title course');
    
    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }
    
    // Get student's courses via sections
    const studentCourseIds = await getStudentCoursesViaSections(req.user._id);
    const courses = await Course.find({ _id: { $in: studentCourseIds } })
      .select('title courseCode');
    
    // Group watch history by course with video deduplication
    const watchHistoryByCourse = {};
    
    for (const record of student.watchHistory) {
      if (!record.video) continue;
      
      const courseId = record.video.course ? record.video.course.toString() : 'unknown';
      const videoId = record.video._id.toString();
      
      if (!watchHistoryByCourse[courseId]) {
        const course = courses.find(c => c._id.toString() === courseId);
        watchHistoryByCourse[courseId] = {
          courseId,
          courseTitle: course ? course.title : 'Unknown Course',
          courseCode: course ? course.courseCode : 'N/A',
          totalTimeSpent: 0,
          videos: [],
          videoMap: new Map() // Track unique videos
        };
      }
      
      // Update or add video - keep latest watch data
      if (!watchHistoryByCourse[courseId].videoMap.has(videoId)) {
        watchHistoryByCourse[courseId].videoMap.set(videoId, {
          videoId: record.video._id,
          videoTitle: record.video.title,
          timeSpent: record.timeSpent,
          lastWatched: record.lastWatched
        });
      } else {
        // Update if this record is more recent
        const existing = watchHistoryByCourse[courseId].videoMap.get(videoId);
        if (new Date(record.lastWatched) > new Date(existing.lastWatched)) {
          watchHistoryByCourse[courseId].videoMap.set(videoId, {
            videoId: record.video._id,
            videoTitle: record.video.title,
            timeSpent: record.timeSpent,
            lastWatched: record.lastWatched
          });
        }
      }
    }
    
    // Convert to array format with deduplicated videos
    const sortedWatchHistory = Object.values(watchHistoryByCourse).map(course => {
      // Convert videoMap to array and filter out videos with no watch time
      const uniqueVideos = Array.from(course.videoMap.values())
        .filter(v => v.timeSpent > 0);
      
      // Calculate total time spent
      const totalTimeSpent = uniqueVideos.reduce((sum, v) => sum + v.timeSpent, 0);
      
      return {
        courseId: course.courseId,
        courseTitle: course.courseTitle,
        courseCode: course.courseCode,
        totalTimeSpent,
        videos: uniqueVideos
      };
    }).sort((a, b) => b.totalTimeSpent - a.totalTimeSpent);
    
    res.json(sortedWatchHistory);
  } catch (err) {
    console.error('Error getting student watch history:', err);
    res.status(500).json({ message: err.message });
  }
};

// Get video resume position for a student
exports.getVideoResumePosition = async (req, res) => {
  try {
    const { videoId } = req.params;
    const studentId = req.user._id;

    console.log(`📹 Getting resume position for video ${videoId} and student ${studentId}`);

    // Find the student
    const student = await User.findById(studentId);
    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }

    // Find the video in watch history
    const watchRecord = student.watchHistory.find(
      record => record.video && record.video.toString() === videoId
    );

    if (!watchRecord) {
      console.log(`📹 No watch history found for video ${videoId}`);
      return res.json({
        hasResumePosition: false,
        currentPosition: 0,
        timeSpent: 0,
        lastWatched: null
      });
    }

    const currentPosition = watchRecord.currentPosition || 0;
    const timeSpent = watchRecord.timeSpent || 0;
    const lastWatched = watchRecord.lastWatched;

    console.log(`📹 Resume data for video ${videoId}:`);
    console.log(`   Raw watchRecord:`, JSON.stringify(watchRecord, null, 2));
    console.log(`   Position: ${currentPosition}s`);
    console.log(`   Time Spent: ${timeSpent}s`);
    console.log(`   Last Watched: ${lastWatched}`);

    // Only consider it resumable if there's meaningful progress (more than 5 seconds or 10% and not near the end)
    const Video = require('../models/Video');
    const video = await Video.findById(videoId);
    const videoDuration = video ? video.duration : 100;
    
    const minTimeThreshold = Math.min(5, videoDuration * 0.1); // 5 seconds or 10% of video, whichever is smaller
    console.log(`   Min threshold: ${minTimeThreshold}s, Video duration: ${videoDuration}s`);
    
    // For rewatching: Show resume dialog if there's any meaningful watch history
    // This includes completed videos that user might want to rewatch from a specific point
    const hasResumePosition = currentPosition > minTimeThreshold;
    console.log(`   Has resume position: ${hasResumePosition} (${currentPosition}s > ${minTimeThreshold}s = ${currentPosition > minTimeThreshold})`);

    res.json({
      hasResumePosition,
      currentPosition,
      timeSpent,
      lastWatched,
      videoDuration: videoDuration
    });

  } catch (err) {
    console.error('Error getting video resume position:', err);
    res.status(500).json({ message: err.message });
  }
};

// Get secure video URL - returns Bunny Stream HLS URL
exports.getSecureVideoUrl = async (req, res) => {
  try {
    const { videoId } = req.params;
    const studentId = req.user._id;

    const Video = require('../models/Video');
    const video = await Video.findById(videoId).populate('unit');
    
    if (!video) {
      return res.status(404).json({ message: 'Video not found' });
    }

    // Verify student has access to this video's course
    const student = await User.findById(studentId).populate('courses');
    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }

    // Get course from unit
    const Unit = require('../models/Unit');
    const unit = await Unit.findById(video.unit).populate('course');
    
    if (!unit || !unit.course) {
      return res.status(404).json({ message: 'Video course not found' });
    }

    // Check if student is enrolled in this course
    const isEnrolled = student.courses.some(
      course => course._id.toString() === unit.course._id.toString()
    );

    if (!isEnrolled) {
      return res.status(403).json({ message: 'You are not enrolled in this course' });
    }

    console.log(`🔒 Generating secure video URL for: ${video.title} (Video: ${videoId})`);

    // If it's a Bunny Stream video
    if (video.bunnyVideoId) {
      // Check transcoding status
      if (video.transcodingStatus !== 'completed') {
        return res.json({
          secureUrl: null,
          isReady: false,
          transcodingStatus: video.transcodingStatus,
          message: 'Video is still being processed. Please try again later.',
          expiresIn: 0
        });
      }
      
      // Get streaming info from Bunny
      const streamingInfo = await bunnyStreamService.getStreamingInfo(video.bunnyVideoId);
      
      return res.json({
        secureUrl: streamingInfo.hlsUrl,
        hlsUrl: streamingInfo.hlsUrl,
        type: 'hls',
        bunnyVideoId: video.bunnyVideoId,
        availableResolutions: streamingInfo.availableResolutions,
        defaultResolution: streamingInfo.defaultResolution,
        thumbnailUrl: streamingInfo.thumbnailUrl,
        isReady: streamingInfo.isReady,
        duration: video.duration,
        title: video.title,
        expiresIn: 3600
      });
    }
    
    // Legacy video - return direct URL
    res.json({
      secureUrl: video.videoUrl,
      type: 'direct',
      isReady: true,
      duration: video.duration,
      title: video.title,
      expiresIn: 3600
    });

  } catch (err) {
    console.error('Error generating secure video URL:', err);
    res.status(500).json({ message: err.message });
  }
};

// Stream video - for Bunny Stream, redirect to CDN URL
exports.streamSecureVideo = async (req, res) => {
  try {
    const { token } = req.params;

    // For Bunny Stream, we don't need token-based streaming
    // The HLS URLs are already secured by Bunny's infrastructure
    // This endpoint is kept for backward compatibility
    
    // Check if it's a Bunny video ID (UUID format)
    if (bunnyStreamService.isBunnyVideoId(token)) {
      const hlsUrl = bunnyStreamService.getHlsUrl(token);
      console.log(`🐰 Redirecting to Bunny HLS: ${hlsUrl}`);
      return res.redirect(hlsUrl);
    }

    // Validate legacy token
    if (!global.videoTokenStore) {
      global.videoTokenStore = new Map();
    }

    const tokenData = global.videoTokenStore.get(token);
    if (!tokenData) {
      console.error('❌ Invalid or expired video token');
      return res.status(403).json({ message: 'Invalid or expired video access token' });
    }

    // Check if token has expired
    if (Date.now() > tokenData.expiresAt) {
      global.videoTokenStore.delete(token);
      console.error('❌ Video token expired');
      return res.status(403).json({ message: 'Video access token has expired' });
    }

    console.log(`🔒 Legacy video stream request: ${tokenData.title}`);
    
    // For legacy videos, redirect to the stored URL
    if (tokenData.videoUrl) {
      return res.redirect(tokenData.videoUrl);
    }
    
    res.status(404).json({ message: 'Video not found' });

  } catch (error) {
    console.error('❌ Error streaming video:', error);
    res.status(500).json({ message: 'Failed to stream video', error: error.message });
  }
};

// Get detailed progress for a specific course
exports.getCourseProgress = async (req, res) => {
  try {
    const { courseId } = req.params;
    const ReadingMaterial = require('../models/ReadingMaterial');
    const Unit = require('../models/Unit');
    
    // Find course
    const course = await Course.findById(courseId);
    
    if (!course) {
      return res.status(404).json({ message: 'Course not found' });
    }
    
    // Get all units for this course with videos
    const units = await Unit.find({ course: courseId })
      .populate({
        path: 'videos',
        select: 'title duration isApproved approvalStatus',
        match: { 
          isApproved: { $ne: false },
          approvalStatus: { $ne: 'pending' }
        }
      });
    
    // Collect all videos from units
    const allVideos = [];
    units.forEach(unit => {
      if (unit.videos && unit.videos.length > 0) {
        unit.videos.forEach(video => {
          if (video) {
            allVideos.push({
              ...video.toObject(),
              unitId: unit._id,
              unitTitle: unit.title
            });
          }
        });
      }
    });
    
    console.log(`📊 getCourseProgress: Found ${allVideos.length} videos in ${units.length} units for course ${courseId}`);
    
    // Get student with watch history
    const student = await User.findById(req.user._id)
      .select('watchHistory');
    
    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }
    
    // Get student progress for reading materials
    const studentProgress = await StudentProgress.findOne({
      student: req.user._id,
      course: courseId
    });
    
    // Get all reading materials for this course
    const readingMaterials = await ReadingMaterial.find({ 
      course: courseId,
      isApproved: { $ne: false },
      approvalStatus: { $ne: 'pending' }
    }).select('title unit');
    
    // Calculate progress for each video
    const videoProgress = allVideos.map(video => {
      const watchRecord = student.watchHistory.find(
        record => record.video && record.video.toString() === video._id.toString()
      );
      
      const timeSpent = watchRecord ? watchRecord.timeSpent : 0;
      const lastWatched = watchRecord ? watchRecord.lastWatched : null;
      const isCompleted = watchRecord ? watchRecord.isCompleted : false;
      const storedPercentage = watchRecord ? watchRecord.watchedPercentage : 0;
      
      // Calculate percentage - use stored percentage if available, otherwise calculate
      let percentageCompleted = 0;
      if (storedPercentage && storedPercentage > 0) {
        // Use the stored percentage from watch history (most accurate)
        percentageCompleted = Math.min(100, Math.round(storedPercentage));
      } else if (video.duration && video.duration > 0) {
        // Calculate from video duration
        percentageCompleted = Math.min(100, Math.round((timeSpent / video.duration) * 100));
      } else if (isCompleted) {
        // If explicitly marked as completed but no duration info, show 100%
        percentageCompleted = 100;
      } else if (timeSpent > 0) {
        // If video was watched but no duration stored, estimate based on typical video
        // This is a fallback - assume typical 5-10 min video
        percentageCompleted = Math.min(100, Math.round((timeSpent / 300) * 100)); // Assume 5 min default
      }
      
      return {
        videoId: video._id,
        title: video.title,
        duration: video.duration || 0,
        unitId: video.unitId,
        unitTitle: video.unitTitle,
        timeSpent,
        lastWatched,
        percentageCompleted,
        isCompleted
      };
    });
    
    // Calculate reading material progress
    const completedReadingMaterialIds = studentProgress?.completedReadingMaterials?.map(id => id.toString()) || [];
    const readingMaterialProgress = readingMaterials.map(doc => ({
      documentId: doc._id,
      title: doc.title,
      unitId: doc.unit,
      isCompleted: completedReadingMaterialIds.includes(doc._id.toString())
    }));
    
    // Calculate overall course progress
    const totalVideos = allVideos.length;
    const videosStarted = videoProgress.filter(v => v.timeSpent > 0).length;
    // Video is completed if explicitly marked complete OR 90%+ progress
    const videosCompleted = videoProgress.filter(v => v.isCompleted || v.percentageCompleted >= 90).length;
    
    const totalReadingMaterials = readingMaterials.length;
    const readingMaterialsCompleted = readingMaterialProgress.filter(d => d.isCompleted).length;
    
    // Combined progress calculation
    const totalContent = totalVideos + totalReadingMaterials;
    const completedContent = videosCompleted + readingMaterialsCompleted;
    
    const overallPercentage = totalContent > 0
      ? Math.round((completedContent / totalContent) * 100)
      : 0;
    
    res.json({
      courseId: course._id,
      courseTitle: course.title,
      courseCode: course.courseCode,
      totalVideos,
      videosStarted,
      videosCompleted,
      totalReadingMaterials,
      readingMaterialsCompleted,
      overallPercentage,
      videoProgress,
      readingMaterialProgress
    });
  } catch (err) {
    console.error('Error getting course progress:', err);
    res.status(500).json({ message: err.message });
  }
};

// Get student's quiz pool attempts for a course
exports.getStudentQuizPoolAttempts = async (req, res) => {
  try {
    const { courseId } = req.params;
    
    // Check if course exists
    const course = await Course.findById(courseId);
    if (!course) {
      return res.status(404).json({ message: 'Course not found' });
    }
    
    // Check if student has access to this course via sections
    const hasAccess = await studentHasAccessToCourse(req.user._id, courseId);
    if (!hasAccess) {
      return res.status(403).json({ message: 'You are not assigned to this course' });
    }
    
    // Get all quiz pool attempts for this student in this course
    const attempts = await QuizAttempt.find({
      student: req.user._id,
      course: courseId,
      quizPool: { $exists: true }
    })
    .populate('quizPool', 'title description questionsPerAttempt passingScore')
    .populate('unit', 'title sequence')
    .populate('video', 'title')
    .sort({ completedAt: -1 });
    
    // Format the response
    const formattedAttempts = attempts.map(attempt => ({
      _id: attempt._id,
      quizPool: {
        _id: attempt.quizPool._id,
        title: attempt.quizPool.title,
        description: attempt.quizPool.description,
        questionsPerAttempt: attempt.quizPool.questionsPerAttempt,
        passingScore: attempt.quizPool.passingScore
      },
      unit: attempt.unit ? {
        _id: attempt.unit._id,
        title: attempt.unit.title,
        sequence: attempt.unit.sequence
      } : null,
      video: attempt.video ? {
        _id: attempt.video._id,
        title: attempt.video.title
      } : null,
      score: attempt.score,
      maxScore: attempt.maxScore,
      percentage: attempt.percentage,
      passed: attempt.passed,
      timeSpent: attempt.timeSpent,
      completedAt: attempt.completedAt,
      questionCount: attempt.questions.length
    }));
    
    res.json(formattedAttempts);
  } catch (err) {
    console.error('Error getting student quiz pool attempts:', err);
    res.status(500).json({ message: err.message });
  }
};

// Helper function to unlock next unit after completion
async function unlockNextUnitAfterCompletion(progress, courseId, currentUnitOrder) {
  try {
    const Unit = require('../models/Unit');
    
    // Find next unit by order
    const nextUnit = await Unit.findOne({
      course: courseId,
      order: currentUnitOrder + 1
    });
    
    if (nextUnit) {
      // Check if next unit is already in progress record
      const nextUnitIndex = progress.units.findIndex(
        u => u.unitId && u.unitId.toString() === nextUnit._id.toString()
      );
      
      if (nextUnitIndex !== -1) {
        // Update existing unit record
        progress.units[nextUnitIndex].unlocked = true;
        progress.units[nextUnitIndex].status = 'in-progress';
        progress.units[nextUnitIndex].unlockedAt = new Date();
      } else {
        // Add new unit record
        progress.units.push({
          unitId: nextUnit._id,
          status: 'in-progress',
          unlocked: true,
          unlockedAt: new Date(),
          videosWatched: [],
          quizAttempts: [],
          unitQuizCompleted: false,
          unitQuizPassed: false,
          allVideosWatched: false
        });
      }
      
      // Unlock only the first video in the next unit
      if (nextUnit.videos && nextUnit.videos.length > 0) {
        const firstVideoId = nextUnit.videos[0];
        if (!progress.unlockedVideos.includes(firstVideoId)) {
          progress.unlockedVideos.push(firstVideoId);
        }
      }
    }
  } catch (err) {
    console.error('Error unlocking next unit:', err);
  }
}

// Helper function to unlock next video in sequence within the same unit
async function unlockNextVideoInSequence(progress, currentVideo) {
  try {
    console.log(`🔍 unlockNextVideoInSequence called for video ${currentVideo._id}, unit: ${currentVideo.unit || 'none'}`);
    
    if (!currentVideo.unit) {
      // For non-unit based videos, unlock next video by creation date
      const Video = require('../models/Video');
      const allVideos = await Video.find({ course: currentVideo.course })
        .sort('createdAt');
      
      console.log(`📝 Found ${allVideos.length} total videos in course (no unit)`);
      
      const currentIndex = allVideos.findIndex(v => v._id.toString() === currentVideo._id.toString());
      if (currentIndex !== -1 && currentIndex < allVideos.length - 1) {
        const nextVideo = allVideos[currentIndex + 1];
        if (!progress.unlockedVideos.includes(nextVideo._id.toString())) {
          progress.unlockedVideos.push(nextVideo._id.toString());
          console.log(`🔓 Unlocked next video in course: ${nextVideo.title} (${nextVideo._id})`);
        } else {
          console.log(`ℹ️ Next video already unlocked: ${nextVideo.title}`);
        }
      } else {
        console.log(`ℹ️ No next video to unlock (current index: ${currentIndex}, total: ${allVideos.length})`);
      }
      return;
    }
    
    // For unit-based videos, unlock next video in the same unit
    const Unit = require('../models/Unit');
    const unit = await Unit.findById(currentVideo.unit)
      .populate('videos');
    
    if (unit && unit.videos) {
      console.log(`📝 Found unit "${unit.title}" with ${unit.videos.length} videos`);
      
      // Sort videos by sequence
      const sortedVideos = unit.videos.sort((a, b) => (a.sequence || 0) - (b.sequence || 0));
      
      // Find current video index
      const currentIndex = sortedVideos.findIndex(v => v._id.toString() === currentVideo._id.toString());
      
      console.log(`📍 Current video at index ${currentIndex} of ${sortedVideos.length}`);
      
      if (currentIndex !== -1 && currentIndex < sortedVideos.length - 1) {
        // Unlock next video in the unit
        const nextVideo = sortedVideos[currentIndex + 1];
        if (!progress.unlockedVideos.includes(nextVideo._id.toString())) {
          progress.unlockedVideos.push(nextVideo._id.toString());
          console.log(`🔓 Unlocked next video in unit: ${nextVideo.title} (${nextVideo._id})`);
        } else {
          console.log(`ℹ️ Next video already unlocked: ${nextVideo.title}`);
        }
      } else if (currentIndex === sortedVideos.length - 1) {
        // This was the last video in the unit
        console.log(`✅ Completed last video in unit "${unit.title}". All unit videos are now unlocked. Quiz should be available.`);
      } else {
        console.log(`⚠️ Could not find current video in unit's video list`);
      }
    } else {
      console.log(`⚠️ Unit not found or has no videos: ${currentVideo.unit}`);
    }
  } catch (err) {
    console.error('❌ Error in unlockNextVideoInSequence:', err);
  }
}

// Helper function to unlock next content (video or document) based on arrangement
async function unlockNextContentInArrangement(progress, contentId, contentType, courseId, unitId) {
  try {
    const ContentArrangement = require('../models/ContentArrangement');
    
    // Find approved arrangement for this course
    const arrangement = await ContentArrangement.findOne({
      course: courseId,
      status: 'approved'
    }).sort({ version: -1 }); // Get latest approved version
    
    if (!arrangement || !arrangement.items || arrangement.items.length === 0) {
      console.log('📋 No approved arrangement found, using fallback unlock logic');
      return false;
    }
    
    console.log(`📋 Found arrangement with ${arrangement.items.length} items`);
    
    // Find current content in arrangement
    const currentIndex = arrangement.items.findIndex(
      item => item.contentId.toString() === contentId.toString() && item.type === contentType
    );
    
    if (currentIndex === -1) {
      console.log(`⚠️ Content ${contentId} (${contentType}) not found in arrangement`);
      return false;
    }
    
    console.log(`📍 Current content at index ${currentIndex} in arrangement`);
    
    // Check if there's a next item
    if (currentIndex < arrangement.items.length - 1) {
      const nextItem = arrangement.items[currentIndex + 1];
      console.log(`➡️ Next content in arrangement:`, nextItem);
      
      if (nextItem.type === 'video') {
        // Unlock the next video
        if (!progress.unlockedVideos.includes(nextItem.contentId.toString())) {
          progress.unlockedVideos.push(nextItem.contentId.toString());
          console.log(`🔓 Unlocked next video: ${nextItem.title}`);
        } else {
          console.log(`ℹ️ Video ${nextItem.title} already unlocked`);
        }
      } else if (nextItem.type === 'document') {
        // Documents don't need explicit unlock in current system,
        // but log for tracking
        console.log(`📄 Next content is document: ${nextItem.title} (no explicit unlock needed)`);
      }
      
      return true;
    } else {
      console.log('✅ Completed last item in arrangement');
      return true;
    }
  } catch (err) {
    console.error('Error unlocking next content in arrangement:', err);
    return false;
  }
}

// Get all quiz results for a student (both individual quizzes and quiz pools)
exports.getStudentQuizResults = async (req, res) => {
  try {
    const { courseId } = req.params;
    const studentId = req.user._id;
    
    // Build query filter
    // Include attempts that are submitted OR completed (backward compatibility for older records)
    const filter = { 
      student: studentId,
      $or: [
        { isSubmitted: true },
        { isComplete: true },
        { completedAt: { $ne: null } }
      ]
    };
    
    // If courseId is provided, filter by course and check access
    if (courseId) {
      // Check if course exists
      const course = await Course.findById(courseId);
      if (!course) {
        return res.status(404).json({ message: 'Course not found' });
      }
      
      // Check if student has access to this course via sections
      const hasAccess = await studentHasAccessToCourse(studentId, courseId);
      if (!hasAccess) {
        return res.status(403).json({ message: 'You are not assigned to this course' });
      }
      
      filter.course = courseId;
    } else {
      // If no courseId provided, only get results from courses the student has access to
      const sections = await Section.find({ students: studentId }).select('courses');
      const accessibleCourses = sections.flatMap(section => section.courses);
      if (accessibleCourses.length === 0) {
        return res.json({ summary: { totalAttempts: 0, passedAttempts: 0, failedAttempts: 0, passRate: 0, averageScore: 0 }, attempts: [] });
      }
      filter.course = { $in: accessibleCourses };
    }
    
    // Get all quiz attempts for this student
    const attempts = await QuizAttempt.find(filter)
      .populate('quiz', 'title description timeLimit passingScore')
      .populate('quizPool', 'title description questionsPerAttempt timeLimit passingScore')
      .populate('course', 'title courseCode')
      .populate('unit', 'title sequence')
      .populate('video', 'title')
      .sort({ completedAt: -1 });
    
    // Format the response with comprehensive null checks
    const formattedAttempts = attempts.map(attempt => {
      // Ensure attempt exists and has basic properties
      if (!attempt) {
        return null;
      }

      return {
        _id: attempt._id.toString(),
        type: attempt.quiz ? 'individual' : 'pool',
        quiz: attempt.quiz ? {
          _id: attempt.quiz._id.toString(),
          title: attempt.quiz.title || 'Untitled Quiz',
          description: attempt.quiz.description || '',
          timeLimit: attempt.quiz.timeLimit || 30,
          passingScore: attempt.quiz.passingScore || 70
        } : null,
        quizPool: attempt.quizPool ? {
          _id: attempt.quizPool._id.toString(),
          title: attempt.quizPool.title || 'Untitled Quiz Pool',
          description: attempt.quizPool.description || '',
          questionsPerAttempt: attempt.quizPool.questionsPerAttempt || 10,
          timeLimit: attempt.quizPool.timeLimit || 30,
          passingScore: attempt.quizPool.passingScore || 70
        } : null,
        course: attempt.course ? {
          _id: attempt.course._id.toString(),
          title: attempt.course.title || 'Untitled Course',
          courseCode: attempt.course.courseCode || 'N/A'
        } : null,
        unit: attempt.unit ? {
          _id: attempt.unit._id.toString(),
          title: attempt.unit.title || 'Untitled Unit',
          sequence: attempt.unit.sequence || 0
        } : null,
        video: attempt.video ? {
          _id: attempt.video._id.toString(),
          title: attempt.video.title || 'Untitled Video'
        } : null,
        score: attempt.score || 0,
        maxScore: attempt.maxScore || 0,
        percentage: attempt.percentage || 0,
        passed: attempt.passed || false,
        timeSpent: attempt.timeSpent || 0,
        startedAt: attempt.startedAt || null,
        completedAt: attempt.completedAt || attempt.startedAt || null,
        securityViolations: attempt.securityViolations || 0
      };
    }).filter(attempt => attempt !== null); // Remove any null attempts
    
    // Calculate summary statistics with additional null checks
    const totalAttempts = formattedAttempts.length;
    const passedAttempts = formattedAttempts.filter(a => a && a.passed).length;
    const averageScore = totalAttempts > 0 
      ? formattedAttempts.reduce((sum, a) => sum + (a ? (a.percentage || 0) : 0), 0) / totalAttempts 
      : 0;
    
    const response = {
      summary: {
        totalAttempts,
        passedAttempts,
        failedAttempts: totalAttempts - passedAttempts,
        passRate: totalAttempts > 0 ? (passedAttempts / totalAttempts) * 100 : 0,
        averageScore: Math.round(averageScore * 100) / 100
      },
      attempts: formattedAttempts
    };

    // Normalize URLs in the response
    const normalizedResponse = normalizeObjectUrls(response);
    
    res.json(normalizedResponse);
  } catch (error) {
    console.error('Error getting student quiz results:', error);
    res.status(500).json({ message: error.message });
  }
};

// Get deadline warnings for a student
exports.getDeadlineWarnings = async (req, res) => {
  try {
    const { courseId } = req.params;
    
    if (!courseId) {
      return res.status(400).json({ message: 'Course ID is required' });
    }
    
    // Check if student has access to this course
    const hasAccess = await studentHasAccessToCourse(req.user._id, courseId);
    if (!hasAccess) {
      return res.status(403).json({ message: 'You are not assigned to this course' });
    }
    
    const { getUnitsWithApproachingDeadlines } = require('../utils/deadlineUtils');
    
    const warnings = await getUnitsWithApproachingDeadlines(req.user._id, courseId);
    
    res.json({
      warnings,
      count: warnings.length
    });
  } catch (error) {
    console.error('Error getting deadline warnings:', error);
    res.status(500).json({ message: error.message });
  }
};

// Mark deadline warning as seen
exports.markDeadlineWarningSeen = async (req, res) => {
  try {
    const { courseId, unitId } = req.params;
    
    if (!courseId || !unitId) {
      return res.status(400).json({ message: 'Course ID and Unit ID are required' });
    }
    
    // Check if student has access to this course
    const hasAccess = await studentHasAccessToCourse(req.user._id, courseId);
    if (!hasAccess) {
      return res.status(403).json({ message: 'You are not assigned to this course' });
    }
    
    const { markDeadlineWarningShown } = require('../utils/deadlineUtils');
    
    await markDeadlineWarningShown(req.user._id, courseId, unitId);
    
    res.json({ message: 'Deadline warning marked as seen' });
  } catch (error) {
    console.error('Error marking deadline warning as seen:', error);
    res.status(500).json({ message: error.message });
  }
};

// Get all deadline warnings across all courses for the student
exports.getAllDeadlineWarnings = async (req, res) => {
  try {
    const studentId = req.user._id;
    console.log('🔍 Getting all deadline warnings for student:', studentId);

    // Get all student's courses
    const studentProgress = await StudentProgress.find({ student: studentId })
      .populate('course', 'title courseCode');

    if (studentProgress.length === 0) {
      return res.json({ deadlineWarnings: [] });
    }

    const { checkUnitDeadline } = require('../utils/deadlineUtils');
    const allWarnings = [];

    // Check deadlines for each course
    for (const progress of studentProgress) {
      const courseId = progress.course._id;
      const courseName = progress.course.title;
      const courseCode = progress.course.courseCode;

      console.log(`🔍 Checking course: ${courseName} (${courseCode})`);

      // Get all units for this course with deadlines
      const Unit = require('../models/Unit');
      const unitsWithDeadlines = await Unit.find({ 
        course: courseId, 
        hasDeadline: true,
        deadline: { $ne: null }
      }).select('title deadline deadlineDescription strictDeadline warningDays');

      console.log(`📝 Found ${unitsWithDeadlines.length} units with deadlines in course ${courseName}`);

      // Check each unit for warnings
      for (const unit of unitsWithDeadlines) {
        console.log(`⏰ Checking unit: ${unit.title}`);
        const deadlineCheck = await checkUnitDeadline(unit._id);
        
        console.log(`Deadline check result:`, deadlineCheck);
        
        if (deadlineCheck.showWarning || deadlineCheck.isExpired) {
          allWarnings.push({
            course: {
              _id: courseId,
              title: courseName,
              courseCode: courseCode
            },
            unit: {
              _id: unit._id,
              title: unit.title,
              deadline: unit.deadline,
              deadlineDescription: unit.deadlineDescription,
              strictDeadline: unit.strictDeadline,
              warningDays: unit.warningDays
            },
            warning: {
              isExpired: deadlineCheck.isExpired,
              daysRemaining: deadlineCheck.daysLeft,
              shouldShowWarning: deadlineCheck.showWarning,
              warningMessage: deadlineCheck.isExpired ? 'Deadline has expired!' : `${deadlineCheck.daysLeft} days remaining`,
              warningShown: false // This would need to be tracked separately
            }
          });
          console.log(`✅ Added warning for unit: ${unit.title}`);
        } else {
          console.log(`❌ No warning needed for unit: ${unit.title} (${deadlineCheck.daysLeft} days left, warning threshold: ${unit.warningDays})`);
        }
      }
    }

    // Sort warnings by urgency (expired first, then by days remaining)
    allWarnings.sort((a, b) => {
      if (a.warning.isExpired && !b.warning.isExpired) return -1;
      if (!a.warning.isExpired && b.warning.isExpired) return 1;
      return a.warning.daysRemaining - b.warning.daysRemaining;
    });

    console.log(`✅ Found ${allWarnings.length} deadline warnings for student`);

    res.json({ 
      deadlineWarnings: allWarnings,
      summary: {
        total: allWarnings.length,
        expired: allWarnings.filter(w => w.warning.isExpired).length,
        upcoming: allWarnings.filter(w => !w.warning.isExpired).length
      }
    });
  } catch (error) {
    console.error('Error getting all deadline warnings:', error);
    res.status(500).json({ message: error.message });
  }
};

// ==================== DOCUMENT PROGRESS FUNCTIONS ====================

// Update document reading progress
exports.updateDocumentProgress = async (req, res) => {
  try {
    const { documentId } = req.params;
    const studentId = req.user.id;
    const { isRead, readAt, readingTime } = req.body;

    console.log(`📖 Updating document progress for document ${documentId}, student ${studentId}`);
    
    // First, get the ReadingMaterial to find its unit and course
    const ReadingMaterial = require('../models/ReadingMaterial');
    const readingMaterial = await ReadingMaterial.findById(documentId).populate('unit');
    
    if (!readingMaterial) {
      return res.status(404).json({ message: 'Reading material not found' });
    }

    if (!readingMaterial.unit || !readingMaterial.unit.course) {
      return res.status(400).json({ message: 'Reading material is not properly associated with a course' });
    }

    const courseId = readingMaterial.unit.course;
    
    // Find the student's progress record for this course
    let progress = await StudentProgress.findOne({
      student: studentId,
      course: courseId
    });

    if (!progress) {
      return res.status(404).json({ message: 'Student progress record not found for this course' });
    }

    // Check if document is already in completedReadingMaterials
    const isAlreadyCompleted = progress.completedReadingMaterials.includes(documentId);
    
    if (isRead && !isAlreadyCompleted) {
      // Mark as read - add to completedReadingMaterials
      progress.completedReadingMaterials.push(documentId);
      
      // Unlock next content in arrangement
      try {
        const unitId = readingMaterial.unit._id.toString();
        await unlockNextContentInArrangement(progress, documentId, 'document', courseId.toString(), unitId);
        console.log(`🔓 Attempted to unlock next content after document read`);
      } catch (unlockError) {
        console.error('Error unlocking next content after document read:', unlockError);
      }
    } else if (!isRead && isAlreadyCompleted) {
      // Mark as unread - remove from completedReadingMaterials
      progress.completedReadingMaterials = progress.completedReadingMaterials.filter(
        id => id.toString() !== documentId.toString()
      );
    }

    await progress.save();
    
    console.log(`✅ Document progress updated successfully for document ${documentId}`);
    
    res.json({
      message: 'Document progress updated successfully',
      isRead: progress.completedReadingMaterials.includes(documentId),
      completedReadingMaterials: progress.completedReadingMaterials.length
    });
  } catch (error) {
    console.error('Error updating document progress:', error);
    res.status(500).json({ message: error.message });
  }
};

// Get document reading progress for a student
exports.getDocumentProgress = async (req, res) => {
  try {
    const { documentId } = req.params;
    const studentId = req.user.id;

    // First, get the ReadingMaterial to find its course
    const ReadingMaterial = require('../models/ReadingMaterial');
    const readingMaterial = await ReadingMaterial.findById(documentId).populate('unit');
    
    if (!readingMaterial) {
      return res.status(404).json({ message: 'Reading material not found' });
    }

    const courseId = readingMaterial.unit.course;

    // Find the student's progress record for this course
    const progress = await StudentProgress.findOne({
      student: studentId,
      course: courseId
    });

    if (!progress) {
      return res.json({
        isRead: false,
        progress: 0,
        completedReadingMaterials: 0
      });
    }

    const isRead = progress.completedReadingMaterials.includes(documentId);

    res.json({
      isRead: isRead,
      completedReadingMaterials: progress.completedReadingMaterials.length
    });
  } catch (error) {
    console.error('Error getting document progress:', error);
    res.status(500).json({ message: error.message });
  }
};

// Get all documents for a course with reading progress
exports.getCourseDocuments = async (req, res) => {
  try {
    const { courseId } = req.params;
    const studentId = req.user.id;

    // Check if student has access to this course
    const hasAccess = await studentHasAccessToCourse(studentId, courseId);
    if (!hasAccess) {
      return res.status(403).json({ message: 'Access denied to this course' });
    }

    // Get all units for this course with documents
    const units = await Unit.find({ course: courseId })
      .sort({ order: 1 })
      .populate('course', 'title courseCode');

    // Collect all documents from units (assuming documents are stored in unit content)
    const documentsWithProgress = [];
    
    for (const unit of units) {
      if (unit.content) {
        for (const content of unit.content) {
          if (content.type === 'document' || content.documentUrl) {
            // Get progress for this document
            const progress = await StudentProgress.findOne({
              student: studentId,
              contentId: content._id,
              contentType: 'document'
            });

            documentsWithProgress.push({
              _id: content._id,
              title: content.title,
              description: content.description,
              documentUrl: content.documentUrl,
              unit: {
                _id: unit._id,
                title: unit.title
              },
              course: unit.course,
              isRead: progress ? progress.isCompleted : false,
              readProgress: progress ? progress.progress : 0,
              timeSpent: progress ? progress.timeSpent : 0,
              lastAccessed: progress ? progress.lastAccessed : null,
              completedAt: progress ? progress.completedAt : null
            });
          }
        }
      }
    }

    console.log(`📚 Found ${documentsWithProgress.length} documents for course ${courseId}`);
    
    res.json(documentsWithProgress);
  } catch (error) {
    console.error('Error getting course documents:', error);
    res.status(500).json({ message: error.message });
  }
};

// Mark document as read
exports.markDocumentAsRead = async (req, res) => {
  try {
    const { documentId } = req.params;
    const studentId = req.user.id;
    const { readAt, courseId, unitId } = req.body;

    console.log(`📖 Marking document as read:`, { documentId, studentId, courseId, unitId });

    // Method 1: Create/update separate document progress record (existing system)
    let documentProgress = await StudentProgress.findOne({
      student: studentId,
      contentId: documentId,
      contentType: 'document'
    });

    if (!documentProgress) {
      documentProgress = new StudentProgress({
        student: studentId,
        contentId: documentId,
        contentType: 'document',
        isCompleted: false,
        progress: 0
      });
    }

    documentProgress.isCompleted = true;
    documentProgress.progress = 100;
    documentProgress.completedAt = readAt ? new Date(readAt) : new Date();
    documentProgress.lastAccessed = new Date();

    await documentProgress.save();

    // Method 2: ALSO update the main StudentProgress record (for getStudentUnits compatibility)
    if (courseId) {
      let mainProgress = await StudentProgress.findOne({
        student: studentId,
        course: courseId
      });

      if (mainProgress) {
        // Check if this reading material is already marked as completed
        const existingCompletion = mainProgress.readingMaterialsCompleted.find(
          rm => rm.materialId && rm.materialId.toString() === documentId
        );

        if (!existingCompletion) {
          // Add to completedReadingMaterials array
          mainProgress.readingMaterialsCompleted.push({
            materialId: documentId,
            completed: true,
            readAt: readAt ? new Date(readAt) : new Date()
          });

          // Also add to the simple array for backward compatibility
          if (!mainProgress.completedReadingMaterials.includes(documentId)) {
            mainProgress.completedReadingMaterials.push(documentId);
          }

          // Unlock next content in arrangement
          try {
            await unlockNextContentInArrangement(mainProgress, documentId, 'document', courseId, unitId);
          } catch (unlockError) {
            console.error('Error unlocking next content after document read:', unlockError);
          }

          await mainProgress.save();
          console.log(`✅ Updated main StudentProgress record for course ${courseId}`);
        } else {
          console.log(`ℹ️ Document ${documentId} already marked as completed in main progress`);
        }
      } else {
        console.log(`⚠️ Main StudentProgress record not found for course ${courseId}`);
      }
    } else {
      console.log(`⚠️ courseId not provided, skipping main StudentProgress update`);
    }

    console.log(`✅ Document ${documentId} marked as read for student ${studentId}`);

    res.json({
      message: 'Document marked as read successfully',
      isRead: true,
      completedAt: documentProgress.completedAt
    });
  } catch (error) {
    console.error('Error marking document as read:', error);
    res.status(500).json({ message: error.message });
  }
};

// Get student's document reading history across all courses
exports.getDocumentHistory = async (req, res) => {
  try {
    const studentId = req.user.id;

    // Get all document progress records for this student
    const documentProgress = await StudentProgress.find({
      student: studentId,
      contentType: 'document',
      isCompleted: true
    }).sort({ completedAt: -1 });

    // Get course access for the student
    const courseIds = await getStudentCoursesViaSections(studentId);

    // Build the history with course and unit information
    const history = [];
    
    for (const progress of documentProgress) {
      try {
        // Find the unit containing this document
        const unit = await Unit.findOne({
          'content._id': progress.contentId,
          course: { $in: courseIds }
        }).populate('course', 'title courseCode');

        if (unit) {
          const content = unit.content.find(c => c._id.toString() === progress.contentId.toString());
          
          if (content) {
            history.push({
              _id: progress._id,
              document: {
                _id: content._id,
                title: content.title,
                description: content.description,
                documentUrl: content.documentUrl
              },
              unit: {
                _id: unit._id,
                title: unit.title
              },
              course: unit.course,
              isRead: progress.isCompleted,
              progress: progress.progress,
              timeSpent: progress.timeSpent,
              readAt: progress.completedAt,
              lastAccessed: progress.lastAccessed
            });
          }
        }
      } catch (unitError) {
        console.error(`Error processing document progress ${progress._id}:`, unitError);
      }
    }

    console.log(`📚 Retrieved document history: ${history.length} documents read`);

    res.json({
      history,
      summary: {
        totalDocumentsRead: history.length,
        totalTimeSpent: history.reduce((sum, item) => sum + (item.timeSpent || 0), 0),
        recentReads: history.slice(0, 5)
      }
    });
  } catch (error) {
    console.error('Error getting document history:', error);
    res.status(500).json({ message: error.message });
  }
};
