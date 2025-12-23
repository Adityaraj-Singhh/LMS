const Course = require('../models/Course');
const Section = require('../models/Section');
const User = require('../models/User');
const Video = require('../models/Video');
const Unit = require('../models/Unit');
const Quiz = require('../models/Quiz');
const QuizAttempt = require('../models/QuizAttempt');
const ReadingMaterial = require('../models/ReadingMaterial');
const StudentProgress = require('../models/StudentProgress');

// Get course-wise student analytics
exports.getCourseAnalytics = async (req, res) => {
  try {
    const { courseId, sectionId } = req.query;
    const teacherId = req.user.id || req.user._id;

    // Validate inputs
    if (!courseId) {
      return res.status(400).json({ message: 'Course ID is required' });
    }

    // Get course details
    const course = await Course.findById(courseId)
      .populate('school', 'name')
      .populate('department', 'name');

    if (!course) {
      return res.status(404).json({ message: 'Course not found' });
    }

    // Get sections where teacher is assigned to this course via SectionCourseTeacher
    const SectionCourseTeacher = require('../models/SectionCourseTeacher');
    const teacherAssignments = await SectionCourseTeacher.find({
      teacher: teacherId,
      course: courseId,
      isActive: true
    }).distinct('section');

    console.log(`[CourseAnalytics] Teacher ${teacherId} has ${teacherAssignments.length} sections for course ${courseId}`);

    // Build sections query - only include teacher's assigned sections
    let sectionsQuery = { 
      _id: { $in: teacherAssignments },
      courses: courseId 
    };
    
    // If sectionId provided, further filter by it (but still within teacher's sections)
    if (sectionId) {
      sectionsQuery._id = { $in: teacherAssignments.filter(s => s.toString() === sectionId) };
    }

    const sections = await Section.find(sectionsQuery)
      .populate('students', 'name regNo uid email')
      .populate('teachers', 'name');

    if (!sections || sections.length === 0) {
      return res.status(404).json({ message: 'No sections found for this course' });
    }

    // Get all units and videos for this course
    const units = await Unit.find({ course: courseId }).populate('videos');
    const directVideos = await Video.find({ course: courseId, unit: null });

    // Collect all videos (from units + direct)
    let allVideos = [...directVideos];
    units.forEach(unit => {
      if (unit.videos && unit.videos.length > 0) {
        allVideos = allVideos.concat(unit.videos);
      }
    });

    const totalVideos = allVideos.length;
    const totalVideoDuration = allVideos.reduce((sum, video) => sum + (video.duration || 0), 0);

    // Get all reading materials for this course (approved only)
    const readingMaterials = await ReadingMaterial.find({ 
      course: courseId,
      isApproved: { $ne: false },
      approvalStatus: { $ne: 'pending' }
    });
    const totalReadingMaterials = readingMaterials.length;

    // Get all quizzes for this course (unit quizzes)
    const quizzes = await Quiz.find({ 
      course: courseId,
      unit: { $exists: true }
    }).populate('unit', 'title');

    // Group quizzes by unit
    const quizzesByUnit = {};
    quizzes.forEach(quiz => {
      const unitId = quiz.unit?._id?.toString();
      if (unitId) {
        if (!quizzesByUnit[unitId]) {
          quizzesByUnit[unitId] = {
            unitName: quiz.unit.title,
            quizzes: []
          };
        }
        quizzesByUnit[unitId].quizzes.push(quiz);
      }
    });

    // Process each section's students
    const analyticsData = [];

    for (const section of sections) {
      if (!section.students || section.students.length === 0) continue;

      for (const student of section.students) {
        // Get full student data with watch history
        const studentId = student._id || student;
        const studentUser = await User.findById(studentId).select('name regNo uid email watchHistory');
        
        if (!studentUser) {
          console.log(`[Analytics] Student not found: ${studentId}`);
          continue; // Skip if student not found
        }
        
        // Debug: Check what fields the student actually has
        console.log(`[Analytics] Student Data:`, {
          id: studentUser._id,
          name: studentUser.name,
          regNo: studentUser.regNo,
          uid: studentUser.uid,
          email: studentUser.email,
          watchHistoryLength: studentUser.watchHistory?.length || 0
        });
        
        let totalWatchTime = 0;
        let videosWatched = 0;

        console.log(`[Analytics] Processing Student: ${studentUser.name}`);
        console.log(`[Analytics] - Total Videos in Course: ${allVideos.length}`);
        console.log(`[Analytics] - Watch History Entries: ${studentUser.watchHistory?.length || 0}`);

        if (studentUser.watchHistory && studentUser.watchHistory.length > 0) {
          studentUser.watchHistory.forEach((watch, index) => {
            const videoId = watch.video?.toString();
            const matchesVideo = videoId && allVideos.some(v => v._id.toString() === videoId);
            
            console.log(`[Analytics]   Entry ${index + 1}:`, {
              videoId: videoId,
              matchesVideo: matchesVideo,
              timeSpent: watch.timeSpent || 0
            });
            
            if (matchesVideo) {
              const timeSpent = watch.timeSpent || 0;
              totalWatchTime += timeSpent;
              
              console.log(`[Analytics]   ✓ Video matched: ${videoId}, Time: ${timeSpent}s`);
              
              if (timeSpent > 0) {
                videosWatched++;
              }
            }
          });
        }

        console.log(`[Analytics] ${studentUser.name} - Total Watch Time: ${totalWatchTime}s (${Math.floor(totalWatchTime / 60)} min)`);

        // Get student progress for reading materials
        const studentProgress = await StudentProgress.findOne({
          student: studentId,
          course: courseId
        });
        const readingMaterialsCompleted = studentProgress?.completedReadingMaterials?.length || 0;

        // Calculate progress percentage including reading materials
        const totalContent = totalVideos + totalReadingMaterials;
        const completedContent = videosWatched + readingMaterialsCompleted;
        const progressPercentage = totalContent > 0 
          ? ((completedContent / totalContent) * 100).toFixed(2) 
          : 0;

        // Get all quiz attempts for this student in this course
        // Include both regular quiz attempts and quiz pool attempts
        const quizAttempts = await QuizAttempt.find({
          student: studentId,
          course: courseId
        }).populate('quiz', 'unit totalMarks').populate('unit', 'title');

        // Process unit-wise quiz marks - get BEST score per unit from PASSED quizzes only
        const unitWiseMarks = {};
        const unitBestScores = {}; // Track best passed score per unit

        units.forEach(unit => {
          const unitId = unit._id.toString();
          unitWiseMarks[unitId] = {
            unitName: unit.title,
            quizzes: [],
            averageMarks: 0,
            totalMarks: 0,
            quizzesTaken: 0,
            bestPassedScore: 0,
            hasPassed: false
          };
        });

        let totalQuizzesTaken = 0;

        quizAttempts.forEach(attempt => {
          // Get unit ID from quiz reference or directly from attempt (for quiz pools)
          const unitId = attempt.quiz?.unit?.toString() || attempt.unit?._id?.toString() || attempt.unit?.toString();
          
          if (unitId && unitWiseMarks[unitId]) {
            const marks = attempt.score || 0;
            const totalMarks = attempt.maxScore || attempt.quiz?.totalMarks || 100;
            // Use the stored percentage directly
            const percentage = parseFloat(attempt.percentage || 0);

            unitWiseMarks[unitId].quizzes.push({
              marks: marks,
              totalMarks: totalMarks,
              percentage: percentage.toFixed(2),
              passed: attempt.passed,
              attemptedAt: attempt.createdAt
            });

            unitWiseMarks[unitId].quizzesTaken++;
            totalQuizzesTaken++;

            // Track best passed score per unit (same logic as certificate)
            if (attempt.passed && percentage > unitWiseMarks[unitId].bestPassedScore) {
              unitWiseMarks[unitId].bestPassedScore = percentage;
              unitWiseMarks[unitId].hasPassed = true;
            }
          }
        });

        // Calculate unit averages and course marks using same logic as certificate
        // Course marks = sum of best passed scores per unit / number of units with passed quizzes
        let totalPassedMarks = 0;
        let passedUnitsCount = 0;

        Object.keys(unitWiseMarks).forEach(unitId => {
          const unitData = unitWiseMarks[unitId];
          // Show average of all attempts for display
          if (unitData.quizzesTaken > 0) {
            const allPercentages = unitData.quizzes.reduce((sum, q) => sum + parseFloat(q.percentage), 0);
            unitData.averageMarks = (allPercentages / unitData.quizzesTaken).toFixed(2);
          }
          // Add best passed score to total for certificate-style calculation
          if (unitData.hasPassed) {
            totalPassedMarks += unitData.bestPassedScore;
            passedUnitsCount++;
          }
        });

        // Calculate overall course marks using certificate logic:
        // Average of best passed quiz percentages per unit
        const courseMarks = passedUnitsCount > 0 
          ? (totalPassedMarks / passedUnitsCount).toFixed(2) 
          : 0;

        // Determine progress color
        let progressColor = 'red';
        if (progressPercentage > 75) {
          progressColor = 'green';
        } else if (progressPercentage >= 50) {
          progressColor = 'yellow';
        }

        analyticsData.push({
          studentId: studentUser._id,
          studentName: studentUser.name,
          registrationNo: studentUser.regNo || studentUser.uid || `STU-${studentUser._id.toString().slice(-8)}`,
          email: studentUser.email,
          sectionId: section._id,
          sectionName: section.name,
          watchTime: totalWatchTime, // in seconds
          watchTimeFormatted: formatDuration(totalWatchTime),
          videosWatched: videosWatched,
          totalVideos: totalVideos,
          readingMaterialsCompleted: readingMaterialsCompleted,
          totalReadingMaterials: totalReadingMaterials,
          progress: parseFloat(progressPercentage),
          progressColor: progressColor,
          unitWiseMarks: unitWiseMarks,
          courseMarks: parseFloat(courseMarks),
          totalQuizzesTaken: totalQuizzesTaken,
          totalQuizzes: quizzes.length,
          totalUnits: units.length,
          passedUnitsCount: passedUnitsCount
        });
      }
    }

    // Sort by student name
    analyticsData.sort((a, b) => a.studentName.localeCompare(b.studentName));

    res.json({
      course: {
        id: course._id,
        title: course.title,
        code: course.courseCode,
        school: course.school?.name,
        department: course.department?.name
      },
      sections: sections.map(s => ({
        id: s._id,
        name: s.name,
        studentCount: s.students?.length || 0
      })),
      units: units.map(u => ({
        id: u._id,
        title: u.title
      })),
      totalStudents: analyticsData.length,
      analytics: analyticsData
    });

  } catch (error) {
    console.error('Get course analytics error:', error);
    res.status(500).json({ message: error.message });
  }
};

// Get teacher's courses for analytics
exports.getTeacherCourses = async (req, res) => {
  try {
    const teacherId = req.user.id;
    console.log('[getTeacherCourses] Fetching courses for teacher:', teacherId);

    // Get sections where teacher is assigned
    const sections = await Section.find({
      $or: [
        { teacher: teacherId },
        { teachers: teacherId }
      ]
    }).populate('courses', 'title courseCode');

    console.log('[getTeacherCourses] Found sections:', sections.length);

    // Extract unique courses
    const coursesMap = new Map();
    sections.forEach(section => {
      console.log('[getTeacherCourses] Section:', section._id, 'has', section.courses?.length || 0, 'courses');
      if (section.courses && section.courses.length > 0) {
        section.courses.forEach(course => {
          if (!coursesMap.has(course._id.toString())) {
            coursesMap.set(course._id.toString(), {
              id: course._id,
              title: course.title,
              code: course.courseCode,
              sectionsCount: 1
            });
          } else {
            const existing = coursesMap.get(course._id.toString());
            existing.sectionsCount++;
          }
        });
      }
    });

    const courses = Array.from(coursesMap.values());
    console.log('[getTeacherCourses] Returning', courses.length, 'unique courses');

    res.json({ courses });

  } catch (error) {
    console.error('[getTeacherCourses] Error:', error);
    res.status(500).json({ message: error.message });
  }
};

// Helper function to format duration
function formatDuration(seconds) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  
  if (hours > 0) {
    return `${hours}h ${minutes}m ${secs}s`;
  } else if (minutes > 0) {
    return `${minutes}m ${secs}s`;
  } else {
    return `${secs}s`;
  }
}

// Export student analytics data as CSV
exports.exportAnalytics = async (req, res) => {
  try {
    const { courseId, sectionId } = req.query;
    
    // Get analytics data (reuse the same logic)
    const analyticsResponse = await exports.getCourseAnalytics(req, res);
    
    // This would generate CSV - for now just return JSON
    // You can implement CSV generation using a library like 'json2csv'
    
  } catch (error) {
    console.error('Export analytics error:', error);
    res.status(500).json({ message: error.message });
  }
};

module.exports = exports;
