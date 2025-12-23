const User = require('../models/User');
const Course = require('../models/Course');
const Video = require('../models/Video');
const Unit = require('../models/Unit');
const Section = require('../models/Section');
const mongoose = require('mongoose');
const { normalizeUrl, normalizeObjectUrls } = require('../utils/urlHandler');
const bunnyStreamService = require('../services/bunnyStreamService');

// Helper function to process video URLs with Bunny Stream
const processVideoUrl = (videoUrl) => {
  if (!videoUrl || !videoUrl.trim()) {
    return null;
  }

  // Check if it's a Bunny Stream URL (CDN URL or HLS)
  if (videoUrl.includes('b-cdn.net') || videoUrl.includes('bunnycdn.com')) {
    return videoUrl; // Return Bunny Stream URL directly
  }

  // For backward compatibility with external video URLs
  if (videoUrl.startsWith('http')) {
    return videoUrl;
  }

  return null;
};

// Get all courses assigned to the teacher
exports.getTeacherCourses = async (req, res) => {
  try {
    const teacherId = req.user._id;
    console.log('🔍 Getting courses for teacher:', teacherId);

    // Get teacher's course assignments using the new SectionCourseTeacher model
    const SectionCourseTeacher = require('../models/SectionCourseTeacher');
    const teacherAssignments = await SectionCourseTeacher.find({ 
      teacher: teacherId,
      isActive: true 
    })
      .populate({
        path: 'course',
        select: 'courseCode name title description department school coordinators',
        populate: [
          { path: 'department', select: 'name code' },
          { path: 'school', select: 'name code' },
          { path: 'coordinators', select: 'name email teacherId' }
        ]
      })
      .populate('section', 'name code students')
      .populate('assignedBy', 'name email');
      
    console.log(`📚 Found ${teacherAssignments.length} course assignments for teacher`);
    
    if (teacherAssignments.length === 0) {
      console.log('⚠️ Teacher has no course assignments');
      return res.json([]);
    }
    
    // Extract unique courses and calculate statistics
    const coursesMap = new Map();
    let totalStudents = 0;
    
    for (const assignment of teacherAssignments) {
      if (assignment.course && assignment.section) {
        const courseId = assignment.course._id.toString();
        const sectionId = assignment.section._id.toString();
        
        // Count students in this section
        const User = require('../models/User');
        const sectionStudents = await User.countDocuments({
          role: 'student',
          assignedSections: assignment.section._id
        });
        
        if (!coursesMap.has(courseId)) {
          coursesMap.set(courseId, {
            _id: assignment.course._id,
            courseCode: assignment.course.courseCode,
            name: assignment.course.name,
            title: assignment.course.title || assignment.course.name,
            description: assignment.course.description,
            department: assignment.course.department,
            school: assignment.course.school,
            coordinators: assignment.course.coordinators || [],
            studentsCount: 0,
            sectionsCount: 0,
            sections: [],
            assignments: []
          });
        }
        
        const courseData = coursesMap.get(courseId);
        courseData.studentsCount += sectionStudents;
        
        // Add section info if not already added
        if (!courseData.sections.find(s => s._id.toString() === sectionId)) {
          courseData.sectionsCount += 1;
          courseData.sections.push({
            _id: assignment.section._id,
            name: assignment.section.name,
            code: assignment.section.code,
            studentsCount: sectionStudents
          });
        }
        
        // Add assignment info
        courseData.assignments.push({
          _id: assignment._id,
          section: assignment.section,
          assignedAt: assignment.assignedAt,
          assignedBy: assignment.assignedBy
        });
        
        totalStudents += sectionStudents;
      }
    }
    
    const courses = Array.from(coursesMap.values());
    
    console.log(`✅ Returning ${courses.length} unique courses for teacher`);
    console.log(`📊 Total students across all courses: ${totalStudents}`);
    
    res.json(courses);
    
  } catch (error) {
    console.error('❌ Error getting teacher courses:', error);
    res.status(500).json({ 
      message: 'Failed to get teacher courses',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

// Get teacher profile with additional information

// Get teacher profile with complete information
exports.getTeacherProfile = async (req, res) => {
  try {
    console.log('Getting profile for teacher:', req.user._id);
    
    // Get teacher with department and school information
    const teacher = await User.findById(req.user._id)
      .populate({
        path: 'department',
        populate: [
          { path: 'hod', select: 'name email uid teacherId' },
          { path: 'school', populate: { path: 'dean', select: 'name email uid' } }
        ]
      })
      .select('name email uid teacherId canAnnounce department createdAt');
    
    if (!teacher) {
      return res.status(404).json({ message: 'Teacher not found' });
    }

    // Get teacher's sections using the new SectionCourseTeacher model
    const SectionCourseTeacher = require('../models/SectionCourseTeacher');
    const teacherAssignments = await SectionCourseTeacher.find({ 
      teacher: req.user._id,
      isActive: true 
    })
    .populate({
      path: 'section',
      select: 'name department students courses'
    })
    .populate('course', 'title courseCode description');

    console.log(`📚 Found ${teacherAssignments.length} course assignments for profile`);

    // Group assignments by section to get unique sections
    const sectionsMap = new Map();
    const allCourses = new Set();
    
    for (const assignment of teacherAssignments) {
      if (assignment.section && assignment.course) {
        const sectionId = assignment.section._id.toString();
        allCourses.add(assignment.course._id.toString());
        
        if (!sectionsMap.has(sectionId)) {
          // Get section details with safe population
          let sectionData;
          try {
            sectionData = await Section.findById(assignment.section._id)
              .populate('department', 'name')
              .populate('students', 'name email regNo')
              .populate('courses', 'title courseCode description');
          } catch (populateError) {
            console.log(`⚠️ Error populating section ${assignment.section.name}:`, populateError.message);
            sectionData = assignment.section;
          }
          
          sectionsMap.set(sectionId, {
            _id: assignment.section._id,
            name: assignment.section.name,
            department: sectionData?.department || null,
            students: sectionData?.students || [],
            allCourses: sectionData?.courses || [],
            teacherCourses: []
          });
        }
        
        // Add this course to the teacher's courses in this section
        sectionsMap.get(sectionId).teacherCourses.push(assignment.course);
      }
    }
    
    const sections = Array.from(sectionsMap.values());
    console.log(`✅ Processed ${sections.length} unique sections for teacher profile`);

    // Get courses where this teacher is a coordinator (CC) - for display only, not statistics
    const coordinatedCoursesRaw = await Course.find({ coordinators: req.user._id })
      .select('title courseCode description department school')
      .populate('department', 'name code')
      .populate('school', 'name code')
      .lean();

    // Calculate statistics from new SectionCourseTeacher assignments
    const totalSections = sections.length;
    const totalStudents = sections.reduce((total, section) => total + (section.students?.length || 0), 0);
    const totalCourses = allCourses.size;

    // Format profile data
    const profileData = {
      personalInfo: {
        name: teacher.name,
        email: teacher.email,
        uid: teacher.uid,
        teacherId: teacher.teacherId, // Legacy field - DEPRECATED
        canAnnounce: true, // Enable announcements for all teachers
        joinDate: teacher.createdAt
      },
      department: {
        name: teacher.department?.name || 'Not Assigned',
        _id: teacher.department?._id || null
      },
      hod: teacher.department?.hod ? {
        name: teacher.department.hod.name,
        email: teacher.department.hod.email,
        uid: teacher.department.hod.uid,
        teacherId: teacher.department.hod.teacherId // Legacy field - DEPRECATED
      } : null,
      dean: teacher.department?.school?.dean ? {
        name: teacher.department.school.dean.name,
        email: teacher.department.school.dean.email,
        uid: teacher.department.school.dean.uid
      } : null,
      school: {
        name: teacher.department?.school?.name || 'Not Assigned',
        _id: teacher.department?.school?._id || null
      },
      assignedSections: sections.map(section => ({
        _id: section._id,
        name: section.name,
        department: section.department?.name || 'Unknown',
        studentCount: section.students?.length || 0,
        courseCount: section.teacherCourses?.length || 0,
        courses: section.teacherCourses?.map(course => ({
          _id: course._id,
          title: course.title,
          courseCode: course.courseCode
        })) || []
      })),
      // CC courses shown for display/information only - not affecting statistics
      coordinatedCourses: coordinatedCoursesRaw.map(course => ({
        _id: course._id,
        title: course.title,
        courseCode: course.courseCode,
        description: course.description,
        department: course.department,
        school: course.school
      })),
      statistics: {
        totalSections: totalSections,
        totalStudents: totalStudents,
        totalCourses: totalCourses,
        directStudents: totalStudents, // All students are direct (no CC student counting)
        coordinatedStudents: 0, // Always 0 - CC role doesn't add to statistics
        coordinatedCoursesCount: coordinatedCoursesRaw.length // For display only
      }
    };
    
    console.log(`Profile stats for ${teacher.name}:`, {
      sections: totalSections,
      students: totalStudents,
      courses: totalCourses.size,
      ccCourses: coordinatedCoursesRaw.length
    });
    
    res.json(profileData);
  } catch (err) {
    console.error('Error getting teacher profile:', err);
    res.status(500).json({ message: err.message });
  }
};

// Get teacher sections with course and student information
exports.getTeacherSections = async (req, res) => {
  try {
    console.log('Getting sections for teacher:', req.user._id);
    
    // Get teacher's section assignments using new SectionCourseTeacher model
    const SectionCourseTeacher = require('../models/SectionCourseTeacher');
    const assignments = await SectionCourseTeacher.find({ 
      teacher: req.user._id, 
      isActive: true 
    })
    .populate({
      path: 'section',
      populate: [
        { path: 'students', select: 'name email regNo' },
        { path: 'department', select: 'name' }
      ]
    })
    .populate('course', 'title courseCode description');

    console.log('Found assignments:', assignments.length);
    
    // Group assignments by section to avoid duplicates
    const sectionMap = new Map();
    
    assignments.forEach(assignment => {
      if (!assignment.section) return;
      
      const sectionId = assignment.section._id.toString();
      
      if (!sectionMap.has(sectionId)) {
        sectionMap.set(sectionId, {
          _id: assignment.section._id,
          name: assignment.section.name,
          department: assignment.section.department?.name || 'Unknown',
          studentCount: assignment.section.students?.length || 0,
          students: assignment.section.students?.map(student => ({
            _id: student._id,
            name: student.name,
            email: student.email,
            regNo: student.regNo
          })) || [],
          courses: []
        });
      }
      
      // Add course to this section if it's not already there
      if (assignment.course) {
        const section = sectionMap.get(sectionId);
        const courseExists = section.courses.some(c => c._id.toString() === assignment.course._id.toString());
        
        if (!courseExists) {
          section.courses.push({
            _id: assignment.course._id,
            title: assignment.course.title,
            courseCode: assignment.course.courseCode,
            description: assignment.course.description
          });
        }
      }
    });
    
    // Convert map to array and sort by section name
    const formattedSections = Array.from(sectionMap.values()).sort((a, b) => a.name.localeCompare(b.name));
    
    console.log('Formatted sections:', formattedSections.length);
    console.log('Section details:', formattedSections.map(s => ({ name: s.name, courses: s.courses.length, students: s.studentCount })));
    
    res.json(formattedSections);
  } catch (err) {
    console.error('Error getting teacher sections:', err);
    res.status(500).json({ message: err.message });
  }
};

// Get details of a specific course
exports.getCourseDetails = async (req, res) => {
  try {
    const { courseId } = req.params;
    
    console.log(`[getCourseDetails] Starting - courseId: ${courseId}, teacher: ${req.user._id}`);
    
    // Validate courseId
    if (!courseId || !mongoose.Types.ObjectId.isValid(courseId)) {
      console.log('[getCourseDetails] Invalid course ID');
      return res.status(400).json({ message: 'Invalid course ID' });
    }

    // For admin users, just find the course without teacher restriction
    if (req.user.role === 'admin') {
      console.log('[getCourseDetails] Admin user detected');
      const course = await Course.findById(courseId)
        .populate('students')
        .populate('videos')
        .select('-__v');
      
      if (!course) {
        console.log('[getCourseDetails] Course not found for admin');
        return res.status(404).json({ message: 'Course not found' });
      }
      
      console.log('[getCourseDetails] Returning course for admin');
      return res.json(course);
    }
    
    console.log('[getCourseDetails] Teacher user - checking course assignments and coordination');
    
    // Use new SectionCourseTeacher model to find teacher's assignments for this course
    const SectionCourseTeacher = require('../models/SectionCourseTeacher');
    const assignments = await SectionCourseTeacher.find({ 
      teacher: req.user._id, 
      course: courseId,
      isActive: true 
    }).populate('section', '_id name');
    
    // Also check if teacher is a coordinator for this course
    const isCoordinator = await Course.exists({ _id: courseId, coordinators: req.user._id });
    
    console.log(`[getCourseDetails] Found ${assignments.length} course assignments for teacher, isCoordinator: ${isCoordinator}`);
    
    if (assignments.length === 0 && !isCoordinator) {
      console.log('[getCourseDetails] No course assignments found for teacher and not a coordinator');
      return res.status(404).json({ message: 'Course not found or not authorized' });
    }
    
    console.log('[getCourseDetails] Getting course details');
    // Get the course details
    const course = await Course.findById(courseId)
      .populate('videos')
      .select('-__v');
    
    if (!course) {
      console.log('[getCourseDetails] Course not found in database');
      return res.status(404).json({ message: 'Course not found' });
    }
    
    console.log(`[getCourseDetails] Course found: ${course.title}`);
    
    // Get students from sections where this teacher teaches this course OR all sections if coordinator
    const studentsInSections = [];
    let sectionsToProcess = [];
    
    if (isCoordinator) {
      // If teacher is coordinator, get all sections that contain this course
      sectionsToProcess = await Section.find({ courses: courseId });
      console.log(`[getCourseDetails] Teacher is coordinator, processing ${sectionsToProcess.length} total sections`);
    } else {
      // Get sections from teacher's assignments
      sectionsToProcess = assignments.map(assignment => assignment.section).filter(Boolean);
      console.log(`[getCourseDetails] Processing ${sectionsToProcess.length} assigned sections`);
    }
    
    for (const section of sectionsToProcess) {
      console.log(`[getCourseDetails] Processing section: ${section._id || section.id}`);
      const sectionWithStudents = await Section.findById(section._id || section.id)
        .populate('students', 'name email regNo');
      if (sectionWithStudents && sectionWithStudents.students) {
        console.log(`[getCourseDetails] Found ${sectionWithStudents.students.length} students in section ${sectionWithStudents.name}`);
        studentsInSections.push(...sectionWithStudents.students);
      }
    }
    
    // Remove duplicates
    const uniqueStudents = studentsInSections.filter((student, index, self) => 
      index === self.findIndex(s => s._id.toString() === student._id.toString())
    );
    
    console.log(`[getCourseDetails] Total unique students: ${uniqueStudents.length}`);
    
    // Add students to course object for compatibility
    const courseWithStudents = {
      ...course.toObject(),
      students: uniqueStudents,
      sections: sectionsToProcess
    };
    
    console.log('[getCourseDetails] Returning course with students');
    res.json(courseWithStudents);
  } catch (err) {
    console.error('[getCourseDetails] Error getting course details:', err);
    console.error('[getCourseDetails] Stack trace:', err.stack);
    res.status(500).json({ message: 'Error fetching course details', error: err.message });
  }
};;

// Get students enrolled in a specific course
exports.getCourseStudents = async (req, res) => {
  try {
    const { courseId } = req.params;
    
    // For admin users, get all students in sections that have this course
    if (req.user.role === 'admin') {
      const sections = await Section.find({ courses: courseId })
        .populate('students', 'name email regNo')
        .populate('school', 'name code')
        .populate('department', 'name code');
      
      // Extract unique students from all sections
      const studentsMap = new Map();
      sections.forEach(section => {
        section.students?.forEach(student => {
          if (student && student._id) {
            studentsMap.set(student._id.toString(), {
              ...student.toObject(),
              section: {
                _id: section._id,
                name: section.name,
                school: section.school,
                department: section.department
              }
            });
          }
        });
      });
      
      return res.json(Array.from(studentsMap.values()));
    }
    
    // For teachers, use new SectionCourseTeacher model to find assignments
    const SectionCourseTeacher = require('../models/SectionCourseTeacher');
    const assignments = await SectionCourseTeacher.find({ 
      teacher: req.user._id, 
      course: courseId,
      isActive: true 
    }).populate('section', '_id name school department');
    
    // Also check if teacher is a coordinator for this course
    const isCoordinator = await Course.exists({ _id: courseId, coordinators: req.user._id });
    
    let sectionsToQuery = [];
    
    if (isCoordinator) {
      // If teacher is a coordinator, get all sections for this course
      sectionsToQuery = await Section.find({ courses: courseId })
        .populate('students', 'name email regNo')
        .populate('school', 'name code')
        .populate('department', 'name code');
    } else if (assignments.length > 0) {
      // Get sections from teacher's assignments and populate students
      const sectionIds = assignments.map(assignment => assignment.section._id);
      sectionsToQuery = await Section.find({ _id: { $in: sectionIds } })
        .populate('students', 'name email regNo')
        .populate('school', 'name code')
        .populate('department', 'name code');
    }
    
    if (!sectionsToQuery || sectionsToQuery.length === 0) {
      console.log(`No sections found for teacher ${req.user._id} and course ${courseId}`);
      return res.json([]); // Return empty array instead of 403 error
    }
    
    // Extract unique students from teacher's sections or all sections if coordinator
    const studentsMap = new Map();
    sectionsToQuery.forEach(section => {
      section.students?.forEach(student => {
        if (student && student._id) {
          studentsMap.set(student._id.toString(), {
            ...student.toObject(),
            section: {
              _id: section._id,
              name: section.name,
              school: section.school,
              department: section.department
            }
          });
        }
      });
    });

    const studentsArray = Array.from(studentsMap.values());
    
    // Get student progress data for this course
    try {
      const StudentProgress = require('../models/StudentProgress');
      const QuizAttempt = require('../models/QuizAttempt');
      
      const studentIds = studentsArray.map(student => student._id);
      
      // Get course data to calculate total units
      const courseData = await Course.findById(courseId).select('units');
      const totalUnitsInCourse = courseData?.units?.length || 0;
      
      // Get progress data
      const progressData = await StudentProgress.find({
        student: { $in: studentIds },
        course: courseId
      }).select('student overallProgress units lastActivity');
      
      // Get quiz attempts
      const quizAttempts = await QuizAttempt.find({
        student: { $in: studentIds },
        course: courseId,
        completedAt: { $ne: null }
      }).select('student score percentage passed completedAt');
      
      // Create progress maps for easy lookup
      const progressMap = new Map();
      const quizMap = new Map();
      
      progressData.forEach(progress => {
        progressMap.set(progress.student.toString(), progress);
      });
      
      quizAttempts.forEach(attempt => {
        const studentId = attempt.student.toString();
        if (!quizMap.has(studentId)) {
          quizMap.set(studentId, []);
        }
        quizMap.get(studentId).push(attempt);
      });
      
      // Enhance students with progress data
      const studentsWithProgress = studentsArray.map(student => {
        const progress = progressMap.get(student._id.toString());
        const quizzes = quizMap.get(student._id.toString()) || [];
        
        // Calculate completed units from progress data
        const completedUnits = progress?.units?.filter(u => u.status === 'completed').length || 0;
        
        // Calculate quiz statistics
        const totalQuizzes = quizzes.length;
        const passedQuizzes = quizzes.filter(q => q.passed).length;
        const averageScore = totalQuizzes > 0 
          ? quizzes.reduce((sum, q) => sum + (q.percentage || 0), 0) / totalQuizzes 
          : 0;
        
        return {
          ...student,
          progress: {
            overallProgress: progress?.overallProgress || 0,
            completedUnits: completedUnits,
            totalUnits: totalUnitsInCourse,
            lastActivity: progress?.lastActivity,
            quizStats: {
              totalAttempts: totalQuizzes,
              passed: passedQuizzes,
              averageScore: Math.round(averageScore),
              recentScore: quizzes.length > 0 ? quizzes[quizzes.length - 1].percentage : null
            }
          }
        };
      });
      
      console.log(`Found ${studentsWithProgress.length} students with progress data for course ${courseId} and teacher ${req.user._id}`);
      res.json(studentsWithProgress);
      
    } catch (progressError) {
      console.error('Error fetching student progress:', progressError);
      // If progress fetch fails, return students without progress data
      console.log(`Found ${studentsArray.length} students for course ${courseId} and teacher ${req.user._id}`);
      res.json(studentsArray);
    }
  } catch (err) {
    console.error('Error getting course students:', err);
    res.status(500).json({ message: 'Error fetching students' });
  }
};

// Get videos for a specific course
exports.getCourseVideos = async (req, res) => {
  try {
    const { courseId } = req.params;
    
    // For admin users, skip teacher verification
    if (req.user.role === 'admin') {
      // Find all videos for this course
      const videos = await Video.find({ course: courseId })
        .populate('teacher', 'name')
        .select('title description videoUrl duration teacher createdAt');
      
      // Process video URLs to include signed URLs for S3 videos
      const processedVideos = videos.map(video => ({
        _id: video._id,
        title: video.title,
        description: video.description,
        videoUrl: processVideoUrl(video.videoUrl),
        duration: video.duration,
        teacher: video.teacher,
        createdAt: video.createdAt,
        hasValidVideo: !!processVideoUrl(video.videoUrl)
      }));
      
      console.log(`📹 Admin - Processed ${processedVideos.length} videos for course ${courseId}`);
      return res.json(processedVideos);
    }
    
    // For teachers, verify they are assigned to a section that contains this course OR are a coordinator
    const teacherHasCourse = await Section.exists({ $or: [{ teacher: req.user._id }, { teachers: req.user._id }], courses: courseId });
    const isCoordinator = await Course.exists({ _id: courseId, coordinators: req.user._id });
    
    if (!teacherHasCourse && !isCoordinator) {
      return res.status(403).json({ message: 'Not authorized to access this course' });
    }
    
    // Find all videos for this course
    const videos = await Video.find({ course: courseId })
      .populate('teacher', 'name')
      .select('title description videoUrl duration teacher createdAt');
    
    // Process video URLs to include signed URLs for S3 videos
    const processedVideos = videos.map(video => ({
      _id: video._id,
      title: video.title,
      description: video.description,
      videoUrl: processVideoUrl(video.videoUrl),
      duration: video.duration,
      teacher: video.teacher,
      createdAt: video.createdAt,
      hasValidVideo: !!processVideoUrl(video.videoUrl)
    }));
    
    console.log(`📹 Processed ${processedVideos.length} videos for course ${courseId}`);
    console.log('Video processing results:', processedVideos.map(v => ({
      title: v.title,
      hasValidVideo: v.hasValidVideo,
      originalUrl: videos.find(original => original._id.toString() === v._id.toString())?.videoUrl
    })));
    
    res.json(processedVideos);
  } catch (err) {
    console.error('Error getting course videos:', err);
    res.status(500).json({ message: 'Error fetching videos' });
  }
};

// Upload a video for a course - Using Bunny Stream
exports.uploadCourseVideo = async (req, res) => {
  try {
    const { courseId } = req.params;
    const { title, description, unitId } = req.body;
    
    // Verify teacher is assigned to a section that contains this course OR is a coordinator
    const teacherHasCourse = await Section.exists({ $or: [{ teacher: req.user._id }, { teachers: req.user._id }], courses: courseId });
    const isCoordinator = await Course.exists({ _id: courseId, coordinators: req.user._id });
    
    if (!teacherHasCourse && !isCoordinator) {
      return res.status(403).json({ message: 'Not authorized to upload to this course' });
    }
    const course = await Course.findById(courseId);
    if (!course) {
      return res.status(404).json({ message: 'Course not found' });
    }
    
    if (!req.file) {
      return res.status(400).json({ message: 'No video file uploaded' });
    }
    
    // Check if units exist for this course
    const unitCount = await Unit.countDocuments({ course: courseId });
    
    if (unitCount > 0 && (!unitId || !mongoose.Types.ObjectId.isValid(unitId))) {
      return res.status(400).json({ message: 'Unit selection is required for this course' });
    }
    
    console.log('🐰 Teacher Video Upload - Using Bunny Stream');
    console.log('  File:', req.file.originalname);
    console.log('  Size:', req.file.size, 'bytes');
    
    // Step 1: Create video entry in Bunny Stream
    let bunnyVideo;
    try {
      bunnyVideo = await bunnyStreamService.createVideo(title || req.file.originalname);
      console.log('✅ Created Bunny video entry:', bunnyVideo.videoId);
    } catch (bunnyError) {
      console.error('❌ Failed to create Bunny video:', bunnyError);
      return res.status(500).json({ message: 'Failed to initialize video upload' });
    }
    
    // Step 2: Upload the video file to Bunny Stream
    try {
      await bunnyStreamService.uploadVideoBuffer(bunnyVideo.videoId, req.file.buffer);
      console.log('✅ Uploaded video to Bunny Stream:', bunnyVideo.videoId);
    } catch (uploadError) {
      console.error('❌ Failed to upload video to Bunny:', uploadError);
      try { await bunnyStreamService.deleteVideo(bunnyVideo.videoId); } catch (e) {}
      return res.status(500).json({ message: 'Failed to upload video' });
    }
    
    // Step 3: Get initial video details
    let videoDetails;
    try {
      videoDetails = await bunnyStreamService.getVideoDetails(bunnyVideo.videoId);
    } catch (e) {
      videoDetails = {
        transcodingStatus: 'processing',
        availableResolutions: [360],
        hlsUrl: bunnyStreamService.getHlsUrl(bunnyVideo.videoId),
        thumbnailUrl: bunnyStreamService.getThumbnailUrl(bunnyVideo.videoId)
      };
    }
    
    // Get duration from frontend if provided
    const duration = req.body.duration ? parseInt(req.body.duration, 10) : (videoDetails.duration || 0);
    
    // Create video entry in database with Bunny Stream info
    const video = new Video({
      title: title || req.file.originalname,
      description,
      course: courseId,
      teacher: req.user._id,
      videoUrl: videoDetails.hlsUrl || 'processing', // Fallback for required field
      duration: duration,
      // Bunny Stream fields
      bunnyVideoId: bunnyVideo.videoId,
      bunnyLibraryId: bunnyStreamService.libraryId,
      transcodingStatus: videoDetails.transcodingStatus || 'processing',
      availableResolutions: videoDetails.availableResolutions || [360],
      hlsUrl: videoDetails.hlsUrl,
      thumbnailUrl: videoDetails.thumbnailUrl,
      defaultQuality: 360
    });
    
    // If unitId is provided, associate the video with that unit
    if (unitId && mongoose.Types.ObjectId.isValid(unitId)) {
      const unit = await Unit.findOne({ _id: unitId, course: courseId });
      if (unit) {
        video.unit = unitId;
        unit.videos.push(video._id);
        await unit.save();
      }
    }
    
    await video.save();
    
    console.log('✅ Video document created:', video._id);
    console.log('   Bunny Video ID:', video.bunnyVideoId);
    console.log('   Transcoding Status:', video.transcodingStatus);
    
    // Add video to course
    course.videos.push(video._id);
    await course.save();
    
    res.status(201).json({ 
      message: 'Video uploaded successfully', 
      video,
      bunnyVideoId: video.bunnyVideoId,
      transcodingStatus: video.transcodingStatus,
      note: 'Video is being processed. It will be available for streaming once transcoding is complete.'
    });
  } catch (err) {
    console.error('Error uploading video:', err);
    res.status(500).json({ message: 'Error uploading video' });
  }
};

  // Teacher: Create announcement for specific sections (requires HOD approval)
  const Announcement = require('../models/Announcement');
  exports.createSectionAnnouncement = async (req, res) => {
    try {
      // Remove canAnnounce permission check - all teachers can create announcements
      
      const { title, message, targetSections } = req.body;
      
      if (!title || !message || !targetSections || !Array.isArray(targetSections) || targetSections.length === 0) {
        return res.status(400).json({ message: 'Title, message, and target sections are required.' });
      }
      
      // Verify teacher is assigned to all specified sections using SectionCourseTeacher model
      const SectionCourseTeacher = require('../models/SectionCourseTeacher');
      const teacherAssignments = await SectionCourseTeacher.find({ 
        teacher: req.user._id,
        section: { $in: targetSections },
        isActive: true
      }).populate('section', 'name');
      
      // Get unique sections from assignments
      const authorizedSections = [...new Set(teacherAssignments.map(assignment => assignment.section._id.toString()))];
      
      if (authorizedSections.length !== targetSections.length) {
        return res.status(403).json({ message: 'Not authorized for some of the selected sections.' });
      }
      
      // Get the teacher's department and HOD for approval
      const User = require('../models/User');
      const teacher = await User.findById(req.user._id).populate({
        path: 'department',
        select: 'name hod school',
        populate: [
          {
            path: 'hod',
            select: 'name email _id'
          },
          {
            path: 'school',
            select: 'name dean',
            populate: {
              path: 'dean',
              select: 'name email _id'
            }
          }
        ]
      });
      
      console.log('Teacher Department:', teacher.department);
      console.log('Department HOD:', teacher.department?.hod);
      console.log('School Dean:', teacher.department?.school?.dean);
      console.log('Current user ID:', req.user._id);
      
      if (!teacher.department) {
        return res.status(400).json({ message: 'Teacher is not assigned to any department.' });
      }
      
      if (!teacher.department.hod) {
        return res.status(400).json({ message: 'No HOD assigned to teacher\'s department.' });
      }
      
      // Check if the current user is the HOD of their own department
      const isUserHOD = teacher.department.hod._id.toString() === req.user._id.toString();
      
      // Check if the current user is the Dean of their school
      const isUserDean = teacher.department.school?.dean?._id.toString() === req.user._id.toString();
      
      // Auto-approve if user is either HOD or Dean
      const canAutoApprove = isUserHOD || isUserDean;
      
      const announcement = new Announcement({
        sender: req.user._id,
        role: 'teacher',
        title,
        message,
        targetAudience: {
          targetSections: targetSections,
          targetRoles: ['student']
        },
        requiresApproval: !canAutoApprove, // If user is HOD or Dean, no approval needed
        approvalStatus: canAutoApprove ? 'approved' : 'pending',
        hodReviewRequired: !canAutoApprove,
        ...(canAutoApprove && {
          approvedBy: req.user._id,
          approvedAt: new Date(),
          approvalComments: isUserHOD 
            ? 'Auto-approved (sender is HOD)' 
            : 'Auto-approved (sender is Dean)'
        })
      });
      
      await announcement.save();
      
      // Send notification to HOD for approval (only if user is not HOD or Dean)
      if (!canAutoApprove) {
        const NotificationController = require('./notificationController');
        await NotificationController.createNotification({
          type: 'announcement_approval',
          recipient: teacher.department.hod._id,
          message: `New announcement from ${req.user.name} requires your approval: "${title}"`,
          data: { 
            announcementId: announcement._id, 
            senderName: req.user.name,
            sectionsCount: targetSections.length 
          }
        });
      }
      
      res.json({ 
        message: canAutoApprove 
          ? `Announcement created and auto-approved successfully (${isUserHOD ? 'as HOD' : 'as Dean'}).`
          : 'Announcement submitted for HOD approval successfully.',
        announcementId: announcement._id,
        status: canAutoApprove ? 'approved' : 'pending_approval'
      });
    } catch (err) {
      console.error('Error creating section announcement:', err);
      res.status(500).json({ message: err.message });
    }
  };

// Get teacher announcement permission status
exports.getAnnouncementPermission = async (req, res) => {
  try {
    const { teacherId } = req.params;
    
    // Verify the requesting user is the same teacher or has admin privileges
    if (req.user._id.toString() !== teacherId && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Access denied' });
    }
    
    const teacher = await User.findById(teacherId).select('canAnnounce');
    if (!teacher) {
      return res.status(404).json({ message: 'Teacher not found' });
    }
    
    // Always allow announcements for teachers
    res.json({ canAnnounce: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Request video removal
exports.requestVideoRemoval = async (req, res) => {
  try {
    const { videoId } = req.params;
    
    // Find the video and verify teacher has access
    const video = await Video.findById(videoId).populate('course');
    
    if (!video) {
      return res.status(404).json({ message: 'Video not found' });
    }
    // Authorize by sections: teacher must teach a section that includes this course
  const teacherHasCourse = await Section.exists({ $or: [{ teacher: req.user._id }, { teachers: req.user._id }], courses: video.course._id || video.course });
    if (!teacherHasCourse) {
      return res.status(403).json({ message: 'Not authorized to remove this video' });
    }
    
    // In a real application, this would create a removal request that an admin would approve
    // For now, we'll simulate success
    res.json({ message: 'Video removal request submitted successfully' });
  } catch (err) {
    console.error('Error requesting video removal:', err);
    res.status(500).json({ message: 'Error processing removal request' });
  }
};

// Get all video removal requests
exports.getVideoRemovalRequests = async (req, res) => {
  try {
    // This would fetch actual removal requests in a real implementation
    // For now, return an empty array
    res.json([]);
  } catch (err) {
    console.error('Error getting video removal requests:', err);
    res.status(500).json({ message: 'Error fetching removal requests' });
  }
};





// Get analytics overview
exports.getTeacherAnalyticsOverview = async (req, res) => {
  try {
    const teacherId = req.user._id;
    
    // Get teacher's course assignments using new SectionCourseTeacher model
    const SectionCourseTeacher = require('../models/SectionCourseTeacher');
    const assignments = await SectionCourseTeacher.find({ 
      teacher: teacherId, 
      isActive: true 
    })
    .populate({
      path: 'section',
      populate: {
        path: 'students',
        select: '_id name email regNo'
      }
    })
    .populate('course', '_id title');

    const courseIdSet = new Set();
    const studentIdSet = new Set();
    const sectionIdSet = new Set();

    // Only count students from sections where teacher is directly assigned to teach
    assignments.forEach(assignment => {
      if (assignment.course) {
        courseIdSet.add(assignment.course._id.toString());
      }
      if (assignment.section) {
        sectionIdSet.add(assignment.section._id.toString());
        const studentCount = assignment.section.students?.length || 0;
        console.log(`Section ${assignment.section._id} for course ${assignment.course?.title}: ${studentCount} students`);
        // Add students from sections where teacher teaches
        assignment.section.students?.forEach(st => {
          if (st) {
            studentIdSet.add(st._id.toString());
            console.log(`  Added student: ${st._id}`);
          }
        });
      }
    });

    // Also include courses where this teacher is a coordinator (CC)
    const coordinatorCourses = await Course.find({ coordinators: teacherId }).select('_id');
    coordinatorCourses.forEach(course => {
      courseIdSet.add(course._id.toString());
    });

    // For coordinator courses, DON'T add students to count
    // (Coordinator role is for course management, not direct teaching)
    if (coordinatorCourses.length > 0) {
      const coordinatorCourseIds = coordinatorCourses.map(c => c._id);
      console.log('Coordinator course IDs:', coordinatorCourseIds);
      console.log('Note: Coordinator courses do not add to student count');
    }

    const courseIds = Array.from(courseIdSet);
    
    // Get actual students who are enrolled/active in teacher's courses
    // Count students who have StudentProgress or QuizAttempts in teacher's courses
    const StudentProgress = require('../models/StudentProgress');
    const QuizAttempt = require('../models/QuizAttempt');
    
    const studentsWithProgress = await StudentProgress.distinct('student', {
      course: { $in: courseIds }
    });
    
    const studentsWithQuizAttempts = await QuizAttempt.distinct('student', {
      course: { $in: courseIds }
    });
    
    // Combine both sets to get all active students
    const activeStudentSet = new Set();
    studentsWithProgress.forEach(id => activeStudentSet.add(id.toString()));
    studentsWithQuizAttempts.forEach(id => activeStudentSet.add(id.toString()));
    
    console.log('Students with progress:', studentsWithProgress.length);
    console.log('Students with quiz attempts:', studentsWithQuizAttempts.length);
    console.log('Total active students in teacher courses:', activeStudentSet.size);
    
    const videos = await Video.find({ course: { $in: courseIds } });
    
    // Get quiz count for teacher's courses
    const Quiz = require('../models/Quiz');
    const quizzes = await Quiz.find({ course: { $in: courseIds } });
    
    // Mock average watch time (would be calculated from actual data in a real implementation)
    const averageWatchTime = 25; // minutes
    
    console.log('Analytics Overview - Teacher:', teacherId);
    console.log('Total assignments found:', assignments.length);
    console.log('Total sections:', sectionIdSet.size);
    console.log('Total courses:', courseIds.length);
    console.log('Total students in sections:', studentIdSet.size);
    console.log('Active students in courses:', activeStudentSet.size);
    console.log('Total videos:', videos.length);
    console.log('Total quizzes:', quizzes.length);
    
    // Use studentIdSet (all students in teacher's sections) instead of activeStudentSet
    res.json({
      totalStudents: studentIdSet.size,
      totalCourses: courseIds.length,
      totalVideos: videos.length,
      averageWatchTime,
      courseCount: courseIds.length,
      studentCount: studentIdSet.size,
      videoCount: videos.length,
      sectionCount: sectionIdSet.size,
      quizCount: quizzes.length,
      averageWatchTime
    });
  } catch (err) {
    console.error('Error getting analytics overview:', err);
    res.status(500).json({ message: 'Error fetching analytics' });
  }
};

// Get enrollment trends
exports.getTeacherEnrollmentTrends = async (req, res) => {
  try {
    const teacherId = req.user._id;
    
    // Get students from teacher's sections
  const sections = await Section.find({ $or: [{ teacher: teacherId }, { teachers: teacherId }] }).populate('students', 'createdAt _id');
    const studentMap = new Map();
    sections.forEach(s => s.students?.forEach(st => st && studentMap.set(st._id.toString(), st)));
    const allStudents = Array.from(studentMap.values());
    
    // Group students by month
    const monthlyEnrollments = {};
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    
    // Initialize the last 6 months with zero counts
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const month = new Date(now);
      month.setMonth(now.getMonth() - i);
      const monthKey = `${month.getFullYear()}-${month.getMonth()}`;
      monthlyEnrollments[monthKey] = 0;
    }
    
    // Count enrollments by month
    allStudents.forEach(student => {
      if (student.createdAt) {
        const date = new Date(student.createdAt);
        const monthKey = `${date.getFullYear()}-${date.getMonth()}`;
        
        if (monthlyEnrollments[monthKey] !== undefined) {
          monthlyEnrollments[monthKey]++;
        }
      }
    });
    
    // Extract data for chart
    const months = [];
    const enrollments = [];
    const watchTime = []; // We'll calculate this from watch history
    
    // Get last 6 months in order
    const last6Months = Object.keys(monthlyEnrollments).sort();
    
    for (const monthKey of last6Months) {
      const [year, month] = monthKey.split('-');
      months.push(monthNames[parseInt(month)]);
      enrollments.push(monthlyEnrollments[monthKey]);
      
      // Generate randomized but realistic watch time data
      // In a real app, this would be calculated from actual watch history
      const averageWatchTimePerStudent = 15; // 15 minutes per student on average
      const variability = 0.3; // +/- 30% random variation
      const randomFactor = 1 + (Math.random() * variability * 2 - variability);
      const totalStudents = monthlyEnrollments[monthKey];
      
      // Calculate watch time in hours with some randomness for realistic variation
      const calculatedWatchTime = Math.round((totalStudents * averageWatchTimePerStudent * randomFactor) / 60);
      watchTime.push(calculatedWatchTime);
    }
    
    res.json({
      months,
      enrollments,
      watchTime
    });
  } catch (err) {
    console.error('Error getting enrollment trends:', err);
    res.status(500).json({ message: 'Error fetching enrollment trends' });
  }
};

// Get analytics for a specific course (section-based)
exports.getTeacherCourseAnalytics = async (req, res) => {
  try {
    const { courseId } = req.params;
    
    // Verify teacher is assigned to a section that contains this course
  const teacherSections = await Section.find({ $or: [{ teacher: req.user._id }, { teachers: req.user._id }], courses: courseId });
    
    if (teacherSections.length === 0) {
      return res.status(403).json({ message: 'Not authorized to access this course' });
    }
    
    // Get the course details
    const course = await Course.findById(courseId)
      .populate('videos');
    
    if (!course) {
      return res.status(403).json({ message: 'Not authorized to access this course' });
    }
    
    // Get all students for this teacher and course via sections
    const sectionsWithStudents = await Section.find({ $or: [{ teacher: req.user._id }, { teachers: req.user._id }], courses: courseId })
      .populate('students', '_id');
    const studentIdSet = new Set();
    sectionsWithStudents.forEach(s => s.students?.forEach(st => st && studentIdSet.add(st._id.toString())));
    const students = await User.find({ 
      _id: { $in: Array.from(studentIdSet) },
      role: 'student'
    }).select('name regNo email watchHistory');
    
    // Calculate total watch time per student for this course
    const studentAnalytics = [];
    
    // Get all video IDs for this course
    const courseVideoIds = course.videos.map(video => video._id);
    
    for (const student of students) {
      // Filter watch history for videos in this course
      const courseWatchHistory = student.watchHistory.filter(
        item => item.video && courseVideoIds.some(id => id.toString() === item.video.toString())
      );
      
      // Calculate total watch time for this course
      const totalWatchTime = courseWatchHistory.reduce(
        (total, item) => total + (item.timeSpent || 0), 0
      );
      
      // Calculate video completion metrics
      const videoCompletions = {};
      courseWatchHistory.forEach(item => {
        if (item.video) {
          videoCompletions[item.video.toString()] = item.timeSpent || 0;
        }
      });
      
      // Calculate activity metrics - days active, average session length
      const uniqueDays = new Set();
      courseWatchHistory.forEach(item => {
        if (item.lastWatched) {
          uniqueDays.add(item.lastWatched.toISOString().split('T')[0]);
        }
      });
      
      studentAnalytics.push({
        _id: student._id,
        name: student.name,
        regNo: student.regNo,
        email: student.email,
        totalWatchTime,
        totalWatchTimeFormatted: formatTime(totalWatchTime),
        videoCompletions,
        videosWatched: Object.keys(videoCompletions).length,
        uniqueDaysActive: uniqueDays.size
      });
    }
    
    // Sort students by watch time (descending)
    studentAnalytics.sort((a, b) => b.totalWatchTime - a.totalWatchTime);
    
    // Calculate video analytics
    const videoAnalytics = [];
    
    for (const video of course.videos) {
      // Count students who watched this video
      const studentsWatched = students.filter(student => 
        student.watchHistory.some(item => 
          item.video && item.video.toString() === video._id.toString() && item.timeSpent > 0
        )
      ).length;
      
      // Calculate total watch time for this video
      const totalWatchTime = students.reduce((total, student) => {
        const watchItem = student.watchHistory.find(item => 
          item.video && item.video.toString() === video._id.toString()
        );
        return total + (watchItem ? (watchItem.timeSpent || 0) : 0);
      }, 0);
      
      // Calculate average watch time
      const avgWatchTime = studentsWatched > 0 ? totalWatchTime / studentsWatched : 0;
      
      // Calculate watch percentage (what percentage of students watched this video)
      const watchPercentage = students.length > 0 ? (studentsWatched / students.length) * 100 : 0;
      
      // Calculate completion rate
      const completionRate = calculateCompletionRate(video, students);
      
      videoAnalytics.push({
        _id: video._id,
        title: video.title,
        studentsWatched,
        totalWatchTime,
        totalWatchTimeFormatted: formatTime(totalWatchTime),
        avgWatchTime,
        avgWatchTimeFormatted: formatTime(avgWatchTime),
        watchPercentage,
        completionRate
      });
    }
    
    // Sort videos by total watch time (descending)
    videoAnalytics.sort((a, b) => b.totalWatchTime - a.totalWatchTime);
    
    // Calculate summary metrics
    const totalStudents = students.length;
    const totalVideos = course.videos.length;
  // In section-based model, total teachers for this course isn't tracked here; set to 1 for this teacher's view
  const totalTeachers = 1;
    
    // Calculate average watch time across all students and videos
    const totalWatchTimeAllStudents = studentAnalytics.reduce((total, student) => total + student.totalWatchTime, 0);
    const avgWatchTime = totalStudents > 0 ? totalWatchTimeAllStudents / totalStudents : 0;
    
    // Calculate how many students were active in the last 7 days
    const now = new Date();
    const sevenDaysAgo = new Date(now);
    sevenDaysAgo.setDate(now.getDate() - 7);
    
    const activeStudentsCount = students.filter(student => 
      student.watchHistory.some(item => 
        item.lastWatched && item.lastWatched >= sevenDaysAgo && 
        courseVideoIds.some(id => id.toString() === (item.video ? item.video.toString() : ''))
      )
    ).length;
    
    const response = {
      course: {
        _id: course._id,
        title: course.title,
        courseCode: course.courseCode,
        description: course.description
      },
      summary: {
        totalStudents,
        totalVideos,
        totalTeachers,
        avgWatchTime,
        avgWatchTimeFormatted: formatTime(avgWatchTime),
        activeStudents: activeStudentsCount
      },
      videoAnalytics,
      studentAnalytics
    };
    
    res.json(response);
  } catch (err) {
    console.error('Error getting course analytics:', err);
    console.error('Error details:', err.stack);
    res.status(500).json({ message: 'Error fetching course analytics' });
  }
};

// Find a student by registration number
exports.getStudentByRegNo = async (req, res) => {
  try {
    console.log('🔍 TEACHER getStudentByRegNo called with regNo:', req.query.regNo);
    const teacherId = req.user.id;
    const { regNo } = req.query;
    
    if (!regNo) {
      return res.status(400).json({ message: 'Registration number is required' });
    }

    // Find student
    const student = await User.findOne({ 
      role: 'student',
      regNo: regNo.trim(),
      isActive: { $ne: false }
    })
    .populate('department', 'name')
    .populate('school', 'name');
    
    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }

    // Verify teacher has access to this student through sections
    const Section = require('../models/Section');
    const SectionCourseTeacher = require('../models/SectionCourseTeacher');
    const StudentProgress = require('../models/StudentProgress');
    const QuizAttempt = require('../models/QuizAttempt');
    const Course = require('../models/Course');

    // Get sections where teacher is assigned and student is enrolled
    const teacherSections = await SectionCourseTeacher.find({
      teacher: teacherId
    }).distinct('section');

    const commonSections = await Section.find({
      _id: { $in: teacherSections },
      students: student._id
    }).populate('courses', 'title courseCode');

    if (commonSections.length === 0) {
      return res.status(403).json({ message: 'You do not have access to this student' });
    }

    // Get courses where teacher teaches this student
    const teacherCourses = [];
    const teacherCourseIds = [];
    
    for (const section of commonSections) {
      if (section.courses && section.courses.length > 0) {
        for (const course of section.courses) {
          // Check if teacher teaches this course in this section
          const teacherAssignment = await SectionCourseTeacher.findOne({
            section: section._id,
            course: course._id,
            teacher: teacherId
          });

          if (teacherAssignment && !teacherCourseIds.includes(course._id.toString())) {
            teacherCourses.push(course);
            teacherCourseIds.push(course._id.toString());
          }
        }
      }
    }

    // Get reading materials for teacher's courses
    const ReadingMaterial = require('../models/ReadingMaterial');
    
    // Get student progress, quiz attempts, and reading materials for teacher's courses
    const [progresses, quizAttempts, readingMaterials] = await Promise.all([
      StudentProgress.find({
        student: student._id,
        course: { $in: teacherCourseIds }
      }).lean(),
      QuizAttempt.find({
        student: student._id,
        course: { $in: teacherCourseIds },
        isComplete: true
      }).populate('unit', 'title order').lean(),
      ReadingMaterial.find({
        course: { $in: teacherCourseIds },
        isApproved: { $ne: false },
        approvalStatus: { $ne: 'pending' }
      }).select('_id course').lean()
    ]);

    // Build course-wise analytics (same as HOD)
    const courseAnalytics = await Promise.all(teacherCourses.map(async (course) => {
      const courseProgress = progresses.find(p => p.course.toString() === course._id.toString());
      const courseQuizzes = quizAttempts.filter(qa => qa.course && qa.course.toString() === course._id.toString());
      
      // Get reading materials for this course
      const courseReadingMats = readingMaterials.filter(rm => rm.course.toString() === course._id.toString());
      const totalReadingMaterials = courseReadingMats.length;
      const completedReadingMaterials = courseProgress?.completedReadingMaterials?.length || 0;

      let totalWatchTime = 0;
      let videosWatched = 0;
      let totalVideos = 0;
      const unitMarks = [];

      if (courseProgress && Array.isArray(courseProgress.units)) {
        courseProgress.units.forEach(unit => {
          if (Array.isArray(unit.videosWatched)) {
            totalVideos += unit.videosWatched.length;
            videosWatched += unit.videosWatched.filter(v => v.completed).length;
            totalWatchTime += Math.round(unit.videosWatched.reduce((sum, v) => sum + (v.timeSpent || 0), 0) * 100) / 100;
          }
        });
      }

      // Fetch course with units
      const courseWithUnits = await Course.findById(course._id).populate('units', 'title order').lean();
      
      // Build unit marks from quiz attempts - use best passed score per unit (same as certificate)
      if (courseWithUnits && courseWithUnits.units && courseWithUnits.units.length > 0) {
        courseWithUnits.units.forEach(unit => {
          const unitQuizzes = courseQuizzes.filter(qa => 
            qa.unit && qa.unit._id && qa.unit._id.toString() === unit._id.toString()
          );

          if (unitQuizzes.length > 0) {
            // Get best score from passed quizzes only (same as certificate logic)
            const passedQuizzes = unitQuizzes.filter(q => q.passed);
            const bestPassedScore = passedQuizzes.length > 0 
              ? Math.max(...passedQuizzes.map(q => q.percentage || 0))
              : 0;
            const bestScore = Math.max(...unitQuizzes.map(q => q.percentage || 0));
            const hasPassed = passedQuizzes.length > 0;
            
            unitMarks.push({
              unitId: unit._id,
              unitTitle: unit.title || 'Unknown Unit',
              percentage: Math.round(bestPassedScore * 100) / 100, // Use best passed score
              quizMarks: Math.round(bestScore * 100) / 100, // Display best overall score
              attemptsCount: unitQuizzes.length,
              attempts: unitQuizzes.length,
              attempted: true,
              passed: hasPassed,
              status: hasPassed ? 'Excellent' : (bestScore >= 40 ? 'Passed' : 'Failed')
            });
          } else {
            unitMarks.push({
              unitId: unit._id,
              unitTitle: unit.title || 'Unknown Unit',
              percentage: 0,
              quizMarks: 0,
              attemptsCount: 0,
              attempts: 0,
              attempted: false,
              passed: false,
              status: 'Not Attempted'
            });
          }
        });
      }

      // Calculate course marks using SAME LOGIC as certificate:
      // Average of best passed quiz percentages per unit
      const passedUnits = unitMarks.filter(u => u.passed);
      const avgQuizScore = passedUnits.length > 0
        ? passedUnits.reduce((sum, u) => sum + u.percentage, 0) / passedUnits.length
        : 0;

      totalWatchTime = Math.round(totalWatchTime * 100) / 100;
      const minutes = Math.floor(totalWatchTime / 60);
      const seconds = Math.round(totalWatchTime % 60);
      const watchTimeFormatted = minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;

      // Calculate progress including reading materials
      const totalContent = totalVideos + totalReadingMaterials;
      const completedContent = videosWatched + completedReadingMaterials;
      const calculatedProgress = totalContent > 0 ? (completedContent / totalContent) * 100 : 0;

      return {
        courseId: course._id,
        courseCode: course.courseCode,
        courseTitle: course.title,
        videosWatched,
        totalVideos,
        totalReadingMaterials,
        readingMaterialsCompleted: completedReadingMaterials,
        watchTimeSeconds: totalWatchTime,
        watchTimeFormatted,
        overallProgress: Math.round(calculatedProgress * 100) / 100,
        courseMarks: Math.round(avgQuizScore * 100) / 100,
        unitMarks,
        sections: commonSections.filter(s => s.courses.some(c => c._id.toString() === course._id.toString()))
          .map(s => ({ _id: s._id, name: s.name }))
      };
    }));

    const totalWatchTimeSeconds = courseAnalytics.reduce((sum, c) => sum + c.watchTimeSeconds, 0);
    const totalMinutes = Math.floor(totalWatchTimeSeconds / 60);
    const totalSeconds = Math.round(totalWatchTimeSeconds % 60);
    const totalWatchTimeFormatted = totalMinutes > 0 ? `${totalMinutes}m ${totalSeconds}s` : `${totalSeconds}s`;

    console.log('✅ TEACHER Response:', {
      totalCourses: teacherCourses.length,
      averageProgress: courseAnalytics.length > 0 ? Math.round((courseAnalytics.reduce((sum, c) => sum + c.overallProgress, 0) / courseAnalytics.length) * 100) / 100 : 0,
      averageMarks: courseAnalytics.length > 0 ? Math.round((courseAnalytics.reduce((sum, c) => sum + c.courseMarks, 0) / courseAnalytics.length) * 100) / 100 : 0
    });

    res.json({
      student,
      courses: courseAnalytics,
      statistics: {
        totalCourses: teacherCourses.length,
        totalWatchTimeFormatted,
        averageProgress: courseAnalytics.length > 0 
          ? Math.round((courseAnalytics.reduce((sum, c) => sum + c.overallProgress, 0) / courseAnalytics.length) * 100) / 100
          : 0,
        averageMarks: courseAnalytics.length > 0
          ? Math.round((courseAnalytics.reduce((sum, c) => sum + c.courseMarks, 0) / courseAnalytics.length) * 100) / 100
          : 0
      }
    });

  } catch (err) {
    console.error('Error finding student analytics:', err);
    res.status(500).json({ message: 'Error searching for student' });
  }
};

// Get detailed analytics for a specific student (section-based auth)
exports.getStudentDetailedAnalytics = async (req, res) => {
  try {
    const { studentId } = req.params;
    
    // Find student with watch history
    const student = await User.findById(studentId)
      .populate('watchHistory.video');
    
    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }
    
    // Authorize: student must be in at least one section taught by this teacher
  const teacherSection = await Section.exists({ $or: [{ teacher: req.user._id }, { teachers: req.user._id }], students: studentId });
    if (!teacherSection) {
      return res.status(403).json({ message: 'Not authorized to view this student\'s analytics' });
    }
    // Collect courses taught by this teacher via sections
  const sections = await Section.find({ $or: [{ teacher: req.user._id }, { teachers: req.user._id }] }).populate('courses', '_id title');
    const teacherCourseIds = new Set();
    sections.forEach(s => s.courses?.forEach(c => c && teacherCourseIds.add(c._id.toString())));
    
    // Get reading materials and student progress for these courses
    const ReadingMaterial = require('../models/ReadingMaterial');
    const StudentProgress = require('../models/StudentProgress');
    const [readingMaterials, studentProgresses] = await Promise.all([
      ReadingMaterial.find({
        course: { $in: Array.from(teacherCourseIds) },
        isApproved: { $ne: false },
        approvalStatus: { $ne: 'pending' }
      }).select('_id course').lean(),
      StudentProgress.find({
        student: studentId,
        course: { $in: Array.from(teacherCourseIds) }
      }).lean()
    ]);
    
    // Group watch history by course
    const courseWatchHistory = {};
    const videoDetails = {};
    let totalWatchTime = 0;
    
    // Process each watch history item
    for (const item of student.watchHistory) {
      if (!item.video) continue;
      
      totalWatchTime += item.timeSpent || 0;
      
      // Store video details for reference
      videoDetails[item.video._id] = {
        title: item.video.title,
        courseId: item.video.course
      };
      
      // Group by course
      const courseId = item.video.course ? item.video.course.toString() : 'unknown';
      
      if (!courseWatchHistory[courseId]) {
        courseWatchHistory[courseId] = {
          totalTime: 0,
          videos: {},
          lastActivity: null
        };
      }
      
      courseWatchHistory[courseId].totalTime += item.timeSpent || 0;
      courseWatchHistory[courseId].videos[item.video._id] = {
        timeSpent: item.timeSpent || 0,
        lastWatched: item.lastWatched
      };
      
      // Update last activity
      if (item.lastWatched && (!courseWatchHistory[courseId].lastActivity || 
          item.lastWatched > courseWatchHistory[courseId].lastActivity)) {
        courseWatchHistory[courseId].lastActivity = item.lastWatched;
      }
    }
    
    // Build detailed course analytics
    const courseAnalytics = [];
    
    // Build analytics for each teacher's course (based on student's watch history)
    for (const courseIdStr of teacherCourseIds) {
      const course = await Course.findById(courseIdStr).populate('videos');
      if (!course) continue;
      
      const courseId = course._id.toString();
      const watchData = courseWatchHistory[courseId] || { totalTime: 0, videos: {}, lastActivity: null };
      
      // Calculate watch metrics for this course
      const videosWatched = Object.keys(watchData.videos).length;
      
      // Get reading materials for this course
      const courseReadingMats = readingMaterials.filter(rm => rm.course.toString() === courseId);
      const totalReadingMaterials = courseReadingMats.length;
      const courseProgress = studentProgresses.find(sp => sp.course.toString() === courseId);
      const completedReadingMaterials = courseProgress?.completedReadingMaterials?.length || 0;
      
      // Get course videos to calculate completion percentage
  const courseWithVideos = course;
      const totalVideos = courseWithVideos?.videos?.length || 0;
      
      // Calculate completion including reading materials
      const totalContent = totalVideos + totalReadingMaterials;
      const completedContent = videosWatched + completedReadingMaterials;
      
      courseAnalytics.push({
        _id: course._id,
        title: course.title,
        courseCode: course.courseCode,
        totalWatchTime: watchData.totalTime,
        totalWatchTimeFormatted: formatTime(watchData.totalTime),
        videosWatched,
        totalVideos,
        totalReadingMaterials,
        readingMaterialsCompleted: completedReadingMaterials,
        completionPercentage: totalContent > 0 ? (completedContent / totalContent) * 100 : 0,
        lastActivity: watchData.lastActivity,
        videoDetails: Object.entries(watchData.videos).map(([videoId, data]) => ({
          videoId,
          title: videoDetails[videoId]?.title || 'Unknown Video',
          timeSpent: data.timeSpent,
          timeSpentFormatted: formatTime(data.timeSpent),
          lastWatched: data.lastWatched
        }))
      });
    }
    
    // Calculate activity heatmap data
    const activityHeatmap = generateActivityHeatmap(student.watchHistory);
    
    // Return comprehensive student analytics
    res.json({
      student: {
        _id: student._id,
        name: student.name,
        regNo: student.regNo,
        email: student.email
      },
      summary: {
        totalWatchTime,
        totalWatchTimeFormatted: formatTime(totalWatchTime),
        totalCourses: courseAnalytics.length,
        totalVideosWatched: Object.keys(videoDetails).length,
        averageWatchTimePerVideo: Object.keys(videoDetails).length > 0 
          ? totalWatchTime / Object.keys(videoDetails).length 
          : 0,
        averageWatchTimeFormatted: Object.keys(videoDetails).length > 0 
          ? formatTime(totalWatchTime / Object.keys(videoDetails).length) 
          : '0s'
      },
      courseAnalytics: courseAnalytics.sort((a, b) => b.totalWatchTime - a.totalWatchTime),
      activityHeatmap
    });
  } catch (err) {
    console.error('Error getting student analytics:', err);
    res.status(500).json({ message: 'Error fetching student analytics' });
  }
};

// Helper function to format time in human-readable format
function formatTime(seconds) {
  if (seconds === undefined || seconds === null) return '0s';
  
  // Convert to number if it's a string
  const secondsNum = typeof seconds === 'string' ? parseFloat(seconds) : seconds;
  
  // Handle very small values (less than 1 second)
  if (secondsNum < 1 && secondsNum > 0) {
    // Display one decimal place for values less than 1 second
    return `${secondsNum.toFixed(1)}s`;
  }
  
  // Handle zero case
  if (secondsNum === 0) return '0s';
  
  const hours = Math.floor(secondsNum / 3600);
  const minutes = Math.floor((secondsNum % 3600) / 60);
  const remainingSeconds = Math.floor(secondsNum % 60);
  
  let result = '';
  if (hours > 0) result += `${hours}h `;
  if (minutes > 0) result += `${minutes}m `;
  if (remainingSeconds > 0 || result === '') result += `${remainingSeconds}s`;
  
  return result.trim();
}

// Helper function to calculate video completion rate
function calculateCompletionRate(video, students) {
  // If no video duration available, we can't calculate
  if (!video.duration) return 0;
  
  // Get total watch time across all students
  let watchTimeSum = 0;
  let studentsWatched = 0;
  
  students.forEach(student => {
    const watchItem = student.watchHistory.find(item => 
      item.video && item.video.toString() === video._id.toString()
    );
    
    if (watchItem && watchItem.timeSpent) {
      watchTimeSum += watchItem.timeSpent;
      studentsWatched++;
    }
  });
  
  // Calculate average watch time as percentage of video duration
  if (studentsWatched === 0) return 0;
  
  const avgWatchTime = watchTimeSum / studentsWatched;
  const completionRate = Math.min(100, (avgWatchTime / (video.duration * 60)) * 100);
  
  return Math.round(completionRate);
}

// Helper function to generate activity heatmap data
function generateActivityHeatmap(watchHistory) {
  const heatmap = {
    byDay: {},
    byHour: {},
    byDayHour: {}
  };
  
  // Initialize days
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  days.forEach(day => {
    heatmap.byDay[day] = 0;
  });
  
  // Initialize hours
  for (let i = 0; i < 24; i++) {
    heatmap.byHour[i] = 0;
  }
  
  // Initialize day-hour combinations
  days.forEach(day => {
    heatmap.byDayHour[day] = {};
    for (let i = 0; i < 24; i++) {
      heatmap.byDayHour[day][i] = 0;
    }
  });
  
  // Process watch history
  watchHistory.forEach(item => {
    if (item.lastWatched && item.timeSpent) {
      const date = new Date(item.lastWatched);
      const day = days[date.getDay()];
      const hour = date.getHours();
      
      heatmap.byDay[day] += item.timeSpent;
      heatmap.byHour[hour] += item.timeSpent;
      heatmap.byDayHour[day][hour] += item.timeSpent;
    }
  });
  
  return heatmap;
}

// Get teacher's announcement history with approval status
exports.getAnnouncementHistory = async (req, res) => {
  try {
    const { page = 1, limit = 10, status, dateFrom, dateTo } = req.query;
    const pageNum = Math.max(parseInt(page), 1);
    const limitNum = Math.max(parseInt(limit), 1);
    const skip = (pageNum - 1) * limitNum;

    // Build filter
    const filter = { 
      sender: req.user._id,
      role: 'teacher'
    };

    if (status && ['pending', 'approved', 'rejected'].includes(status)) {
      filter.approvalStatus = status;
    }

    if (dateFrom || dateTo) {
      filter.createdAt = {};
      if (dateFrom) filter.createdAt.$gte = new Date(dateFrom);
      if (dateTo) filter.createdAt.$lte = new Date(dateTo + 'T23:59:59.999Z');
    }

    // Get all announcements created by this teacher
    const announcements = await Announcement.find(filter)
      .populate('approvedBy', 'name email role')
      .populate('targetAudience.specificUsers', 'name email role regNo teacherId')
      .populate('targetAudience.targetSections', 'name')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum)
      .lean();

    const total = await Announcement.countDocuments(filter);

    // Format the response
    const history = announcements.map(announcement => {
      // Count participants by role
      const participants = announcement.targetAudience?.specificUsers || [];
      const participantStats = participants.reduce((acc, user) => {
        if (!user) return acc;
        const userRole = user.role;
        acc[userRole] = (acc[userRole] || 0) + 1;
        acc.total = (acc.total || 0) + 1;
        return acc;
      }, {});

      // Format participant details
      const participantDetails = participants.map(user => {
        if (!user) return null;
        return {
          _id: user._id,
          name: user.name,
          email: user.email,
          role: user.role,
          uid: user.regNo || user.teacherId || user._id
        };
      }).filter(Boolean);

      return {
        _id: announcement._id,
        title: announcement.title,
        message: announcement.message,
        createdAt: announcement.createdAt,
        updatedAt: announcement.updatedAt,
        targetSections: announcement.targetAudience?.targetSections?.map(section => section.name) || [],
        targetRoles: announcement.targetAudience?.targetRoles || [],
        participantStats,
        participantDetails,
        approvalStatus: announcement.approvalStatus,
        requiresApproval: announcement.requiresApproval,
        submittedAt: announcement.createdAt,
        approvedBy: announcement.approvedBy ? {
          _id: announcement.approvedBy._id,
          name: announcement.approvedBy.name,
          email: announcement.approvedBy.email,
          role: announcement.approvedBy.role
        } : null,
        approvalNote: announcement.approvalNote,
        approvalComments: announcement.approvalComments,
        isVisible: announcement.approvalStatus === 'approved' && announcement.isActive
      };
    });

    res.json({
      announcements: history,
      pagination: {
        currentPage: pageNum,
        totalPages: Math.ceil(total / limitNum),
        totalItems: total,
        itemsPerPage: limitNum,
        hasNextPage: pageNum < Math.ceil(total / limitNum),
        hasPreviousPage: pageNum > 1
      },
      summary: {
        totalCount: total,
        pendingCount: await Announcement.countDocuments({ sender: req.user._id, role: 'teacher', approvalStatus: 'pending' }),
        approvedCount: await Announcement.countDocuments({ sender: req.user._id, role: 'teacher', approvalStatus: 'approved' }),
        rejectedCount: await Announcement.countDocuments({ sender: req.user._id, role: 'teacher', approvalStatus: 'rejected' })
      }
    });
  } catch (error) {
    console.error('Error fetching teacher announcement history:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// Get recent activity for Teacher dashboard
exports.getRecentActivity = async (req, res) => {
  try {
    console.log('📋 Teacher recent activity requested by:', req.user?.name || 'Unknown');
    const teacherId = req.user.id;
    
    // Get teacher's assigned courses using the correct model
    const SectionCourseTeacher = require('../models/SectionCourseTeacher');
    const Course = require('../models/Course');
    const StudentProgress = require('../models/StudentProgress'); 
    const QuizAttempt = require('../models/QuizAttempt');
    
    const assignments = await SectionCourseTeacher.find({ 
      teacher: teacherId,
      isActive: true 
    }).populate('course');
    
    console.log(`📚 Found ${assignments.length} course assignments for teacher`);
    const courseIds = assignments.map(a => a.course._id);
    
    if (courseIds.length === 0) {
      console.log('⚠️ Teacher has no course assignments');
      return res.json({
        success: true,
        activities: []
      });
    }
    
    console.log('🔍 Searching for recent activity in courses:', courseIds.map(id => id.toString()));
    
    // Get recent student progress in teacher's courses
    const recentProgress = await StudentProgress.find({
      course: { $in: courseIds },
      lastActivity: { $exists: true, $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
    })
    .populate('student', 'name email regNo')
    .populate('course', 'title courseCode')
    .sort({ lastActivity: -1 })
    .limit(10);
    
    console.log(`📊 Found ${recentProgress.length} recent progress records`);
    
    // Get recent announcements (teacher-relevant)
    const Announcement = require('../models/Announcement');
    const recentAnnouncements = await Announcement.find({
      $or: [
        { 'targetAudience.isGlobal': true },
        { 'targetAudience.targetCourses': { $in: courseIds } },
        { 'targetAudience.allUsers': true },
        { recipients: { $in: ['teacher'] } },
        { sender: req.user._id } // Teacher's own announcements
      ]
    })
      .populate('sender', 'name email role')
      .sort({ createdAt: -1 })
      .limit(5);
    
    // Get recent quiz attempts in teacher's courses
    const recentQuizAttempts = await QuizAttempt.find({
      course: { $in: courseIds },
      completedAt: { $exists: true, $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
    })
    .populate('student', 'name email regNo')
    .populate('course', 'title courseCode')
    .sort({ completedAt: -1 })
    .limit(10);
    
    console.log(`🎯 Found ${recentQuizAttempts.length} recent quiz attempts`);
    
    // Format activities
    const activities = [];
    
    // Add a test activity if no real data exists
    if (recentProgress.length === 0 && recentQuizAttempts.length === 0) {
      activities.push({
        _id: 'test-activity',
        action: 'System test: No recent student activity found',
        timestamp: new Date(),
        type: 'system',
        details: {
          message: 'This is a test entry to verify the activity feed is working',
          courses: courseIds.length
        }
      });
    }
    
    // Add announcements to activities
    recentAnnouncements.forEach(announcement => {
      if (announcement.sender) {
        activities.push({
          type: 'announcement',
          timestamp: announcement.createdAt,
          actor: announcement.sender.name,
          actorRole: announcement.sender.role,
          details: `${announcement.sender.role === 'admin' ? 'Admin' : announcement.sender.role.toUpperCase()} announcement: ${announcement.title}`,
          metadata: {
            title: announcement.title,
            message: announcement.message.substring(0, 100) + (announcement.message.length > 100 ? '...' : ''),
            recipients: announcement.recipients || []
          }
        });
      }
    });
    
    recentProgress.forEach(progress => {
      activities.push({
        _id: progress._id,
        action: `${progress.student?.name || 'Student'} made progress in ${progress.course?.title || 'Course'}`,
        timestamp: progress.lastActivity,
        type: 'progress',
        details: {
          student: progress.student,
          course: progress.course,
          progress: Math.round((progress.overallProgress || 0) * 100)
        }
      });
    });
    
    recentQuizAttempts.forEach(attempt => {
      activities.push({
        _id: attempt._id,
        action: `${attempt.student?.name || 'Student'} completed quiz in ${attempt.course?.title || 'Course'}`,
        timestamp: attempt.completedAt,
        type: 'quiz',
        details: {
          student: attempt.student,
          course: attempt.course,
          score: attempt.percentage || 0,
          passed: attempt.passed
        }
      });
    });
    
    // Sort by timestamp and limit
    activities.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    
    const finalActivities = activities.slice(0, 10);
    console.log(`✅ Returning ${finalActivities.length} activities for teacher dashboard`);
    
    res.json({
      success: true,
      activities: finalActivities,
      timestamp: new Date()
    });
    
  } catch (error) {
    console.error('Error fetching Teacher recent activity:', error);
    res.status(500).json({ 
      success: false,
      message: 'Error fetching recent activity' 
    });
  }
};


