const Course = require('../models/Course');
const Section = require('../models/Section');
const User = require('../models/User');
const Video = require('../models/Video');
const Unit = require('../models/Unit');
const Quiz = require('../models/Quiz');
const QuizAttempt = require('../models/QuizAttempt');
const Department = require('../models/Department');
const ReadingMaterial = require('../models/ReadingMaterial');
const StudentProgress = require('../models/StudentProgress');

// Get department overview analytics
exports.getDepartmentAnalytics = async (req, res) => {
  try {
    const hodId = req.user.id;
    
    console.log('[HOD Analytics] Fetching department analytics for HOD:', hodId);

    // Get HOD's department
    const hod = await User.findById(hodId).populate('department');
    if (!hod || !hod.department) {
      return res.status(404).json({ message: 'HOD department not found' });
    }

    const departmentId = hod.department._id;
    console.log('[HOD Analytics] Department:', hod.department.name);

    // Get all courses in the department
    const courses = await Course.find({ department: departmentId })
      .populate('school', 'name')
      .populate('department', 'name');

    console.log('[HOD Analytics] Found', courses.length, 'courses in department');

    // Get all sections for these courses
    const courseIds = courses.map(c => c._id);
    const sections = await Section.find({ 
      courses: { $in: courseIds } 
    })
    .populate('students', '_id')
    .populate('teachers', 'name email');

    // Process each course
    const courseAnalytics = [];

    for (const course of courses) {
      // Get sections for this course
      const courseSections = sections.filter(s => 
        s.courses.some(c => c.toString() === course._id.toString())
      );

      // Get all unique students across sections
      const studentSet = new Set();
      const teacherSet = new Set();
      
      courseSections.forEach(section => {
        section.students.forEach(student => {
          studentSet.add(student._id.toString());
        });
        section.teachers.forEach(teacher => {
          teacherSet.add(JSON.stringify({
            id: teacher._id.toString(),
            name: teacher.name,
            email: teacher.email
          }));
        });
      });

      const uniqueStudents = Array.from(studentSet);
      const uniqueTeachers = Array.from(teacherSet).map(t => JSON.parse(t));

      // Get videos for this course
      const units = await Unit.find({ course: course._id }).populate('videos');
      const directVideos = await Video.find({ course: course._id, unit: null });
      
      let allVideos = [...directVideos];
      units.forEach(unit => {
        if (unit.videos && unit.videos.length > 0) {
          allVideos = allVideos.concat(unit.videos);
        }
      });

      // Get reading materials for this course
      const readingMaterials = await ReadingMaterial.find({ 
        course: course._id,
        isApproved: { $ne: false },
        approvalStatus: { $ne: 'pending' }
      });
      const totalReadingMaterials = readingMaterials.length;

      // Get quizzes for this course
      const quizzes = await Quiz.find({ 
        course: course._id,
        unit: { $exists: true }
      });

      // Calculate overall progress for this course
      let totalProgress = 0;
      let studentCount = 0;

      for (const studentId of uniqueStudents) {
        const student = await User.findById(studentId).select('watchHistory');
        
        if (!student) continue;

        // Calculate video progress
        let videosWatched = 0;
        if (student.watchHistory && student.watchHistory.length > 0) {
          student.watchHistory.forEach(watch => {
            const videoId = watch.video?.toString();
            const matchesVideo = videoId && allVideos.some(v => v._id.toString() === videoId);
            if (matchesVideo && watch.timeSpent > 0) {
              videosWatched++;
            }
          });
        }

        const videoProgress = allVideos.length > 0 
          ? (videosWatched / allVideos.length) * 100 
          : 0;

        // Get student progress for reading materials
        const studentProgress = await StudentProgress.findOne({
          student: studentId,
          course: course._id
        });
        const readingMaterialsCompleted = studentProgress?.completedReadingMaterials?.length || 0;
        
        const docProgress = totalReadingMaterials > 0 
          ? (readingMaterialsCompleted / totalReadingMaterials) * 100 
          : 0;

        // Calculate quiz progress
        const quizAttempts = await QuizAttempt.find({
          student: studentId,
          quiz: { $in: quizzes.map(q => q._id) },
          passed: true
        });

        const quizProgress = quizzes.length > 0 
          ? (quizAttempts.length / quizzes.length) * 100 
          : 0;

        // Overall progress: combine videos + docs for content, then weight with quizzes
        const totalContent = allVideos.length + totalReadingMaterials;
        const completedContent = videosWatched + readingMaterialsCompleted;
        const contentProgress = totalContent > 0 ? (completedContent / totalContent) * 100 : 0;
        
        // Weighted average: 60% content (videos + docs), 40% quizzes
        const overallProgress = (contentProgress * 0.6) + (quizProgress * 0.4);
        
        totalProgress += overallProgress;
        studentCount++;
      }

      const averageProgress = studentCount > 0 
        ? (totalProgress / studentCount).toFixed(2) 
        : 0;

      courseAnalytics.push({
        courseId: course._id,
        courseTitle: course.title,
        courseCode: course.courseCode,
        sections: courseSections.length,
        totalStudents: uniqueStudents.length,
        teachers: uniqueTeachers,
        totalVideos: allVideos.length,
        totalReadingMaterials: totalReadingMaterials,
        totalQuizzes: quizzes.length,
        averageProgress: parseFloat(averageProgress),
        progressColor: averageProgress > 75 ? 'green' : averageProgress >= 50 ? 'yellow' : 'red'
      });
    }

    // Sort by course title
    courseAnalytics.sort((a, b) => a.courseTitle.localeCompare(b.courseTitle));

    res.json({
      department: {
        id: hod.department._id,
        name: hod.department.name,
        school: hod.department.school
      },
      totalCourses: courses.length,
      courses: courseAnalytics
    });

  } catch (error) {
    console.error('[HOD Analytics] Error:', error);
    res.status(500).json({ message: error.message });
  }
};

// Get course-wise detailed analytics (similar to teacher but for all sections)
exports.getHODCourseAnalytics = async (req, res) => {
  try {
    const { courseId, sectionId } = req.query;
    const hodId = req.user.id;

    console.log('[HOD Course Analytics] Course:', courseId, 'Section:', sectionId);

    // Validate inputs
    if (!courseId) {
      return res.status(400).json({ message: 'Course ID is required' });
    }

    // Get HOD's department
    const hod = await User.findById(hodId).populate('department');
    if (!hod || !hod.department) {
      return res.status(404).json({ message: 'HOD department not found' });
    }

    // Get course and verify it belongs to HOD's department
    const course = await Course.findById(courseId)
      .populate('school', 'name')
      .populate('department', 'name');

    console.log('📚 Course Details:', {
      id: course?._id,
      code: course?.courseCode,
      title: course?.title,
      department: course?.department?.name
    });

    if (!course) {
      return res.status(404).json({ message: 'Course not found' });
    }

    if (course.department._id.toString() !== hod.department._id.toString()) {
      return res.status(403).json({ 
        message: 'You do not have permission to view analytics for this course' 
      });
    }

    // Get ALL sections for this course (HOD can see all sections)
    let sectionsQuery = { courses: courseId };
    
    // If sectionId provided, filter by it
    if (sectionId) {
      sectionsQuery._id = sectionId;
    }

    console.log('[HOD Course Analytics] Looking for sections with query:', sectionsQuery);

    const sections = await Section.find(sectionsQuery)
      .populate('students', 'name regNo uid email')
      .populate('teachers', 'name');

    console.log('[HOD Course Analytics] Found sections:', sections.length);
    
    if (sections.length > 0) {
      sections.forEach((section, idx) => {
        console.log(`[HOD Course Analytics] Section ${idx + 1}:`, {
          id: section._id,
          name: section.name,
          studentsCount: section.students?.length || 0,
          coursesCount: section.courses?.length || 0
        });
      });
    }

    if (!sections || sections.length === 0) {
      // Try to find all sections in the department and return with warning
      const allDeptSections = await Section.find({ department: hod.department })
        .populate('students', 'name regNo uid email')
        .populate('courses', 'courseCode courseTitle');
      
      console.log('[HOD Course Analytics] No sections found with course. All dept sections:', allDeptSections.length);
      
      return res.status(200).json({ 
        course: {
          courseId: course._id,
          courseTitle: course.title,
          courseCode: course.courseCode
        },
        units: [],
        students: [],
        message: 'This course is not assigned to any sections yet. Please assign this course to sections first.'
      });
    }

    console.log('[HOD Course Analytics] Found', sections.length, 'sections');

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

    // Get all reading materials for this course
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

    // Process each section's students
    const analyticsData = [];

    for (const section of sections) {
      if (!section.students || section.students.length === 0) continue;

      for (const student of section.students) {
        const studentId = student._id || student;
        const studentUser = await User.findById(studentId).select('name regNo uid email watchHistory');
        
        if (!studentUser) {
          console.log(`[HOD Analytics] Student not found: ${studentId}`);
          continue;
        }
        
        let totalWatchTime = 0;
        let videosWatched = 0;

        if (studentUser.watchHistory && studentUser.watchHistory.length > 0) {
          studentUser.watchHistory.forEach(watch => {
            const videoId = watch.video?.toString();
            const matchesVideo = videoId && allVideos.some(v => v._id.toString() === videoId);
            
            if (matchesVideo) {
              const timeSpent = watch.timeSpent || 0;
              totalWatchTime += timeSpent;
              
              if (timeSpent > 0) {
                videosWatched++;
              }
            }
          });
        }

        // Get student progress for reading materials AND quiz attempts
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

        // Process unit-wise quiz marks from StudentProgress (includes quizPool attempts)
        const unitWiseMarks = {};
        let totalQuizMarks = 0;
        let totalQuizzesTaken = 0;
        let totalQuizzesPassed = 0;

        units.forEach(unit => {
          const unitId = unit._id.toString();
          unitWiseMarks[unitId] = {
            unitName: unit.title,
            quizzes: [],
            bestPercentage: 0,
            passed: false,
            attempted: false
          };
        });

        // Get quiz results from StudentProgress.units[].quizAttempts (correct source)
        if (studentProgress && studentProgress.units) {
          studentProgress.units.forEach(unitProgress => {
            const unitId = unitProgress.unitId?.toString();
            if (unitId && unitWiseMarks[unitId] && unitProgress.quizAttempts && unitProgress.quizAttempts.length > 0) {
              unitWiseMarks[unitId].attempted = true;
              
              // Find the best attempt for this unit
              let bestAttempt = null;
              unitProgress.quizAttempts.forEach(attempt => {
                const percentage = attempt.percentage || attempt.score || 0;
                if (!bestAttempt || percentage > bestAttempt.percentage) {
                  bestAttempt = {
                    percentage: percentage,
                    passed: attempt.passed || false,
                    completedAt: attempt.completedAt
                  };
                }
                // Track if any attempt passed
                if (attempt.passed) {
                  unitWiseMarks[unitId].passed = true;
                }
              });
              
              if (bestAttempt) {
                unitWiseMarks[unitId].bestPercentage = bestAttempt.percentage;
                unitWiseMarks[unitId].quizzes.push(bestAttempt);
                totalQuizMarks += bestAttempt.percentage;
                totalQuizzesTaken++;
                if (unitWiseMarks[unitId].passed) {
                  totalQuizzesPassed++;
                }
              }
            }
          });
        }

        // Also check QuizAttempt collection as fallback for older quizzes
        const quizAttempts = await QuizAttempt.find({
          student: studentId,
          quiz: { $in: quizzes.map(q => q._id) }
        }).populate('quiz', 'unit totalMarks');

        quizAttempts.forEach(attempt => {
          const unitId = attempt.quiz?.unit?.toString();
          if (unitId && unitWiseMarks[unitId] && !unitWiseMarks[unitId].attempted) {
            const percentage = attempt.percentage || 0;
            unitWiseMarks[unitId].attempted = true;
            unitWiseMarks[unitId].bestPercentage = Math.max(unitWiseMarks[unitId].bestPercentage, percentage);
            if (attempt.passed) {
              unitWiseMarks[unitId].passed = true;
            }
            
            // Only count if not already counted from StudentProgress
            if (unitWiseMarks[unitId].quizzes.length === 0) {
              unitWiseMarks[unitId].quizzes.push({
                percentage: percentage,
                passed: attempt.passed,
                completedAt: attempt.createdAt
              });
              totalQuizMarks += percentage;
              totalQuizzesTaken++;
              if (attempt.passed) {
                totalQuizzesPassed++;
              }
            }
          }
        });

        // Calculate unit averages and convert to array format
        const unitMarksArray = units.map(unit => {
          const unitId = unit._id.toString();
          const unitData = unitWiseMarks[unitId];
          
          return {
            unitId: unit._id,
            unitTitle: unit.title,
            percentage: unitData.bestPercentage,
            passed: unitData.passed,
            attempted: unitData.attempted,
            quizzes: unitData.quizzes
          };
        });

        // Calculate overall course marks (average of best attempts)
        const courseMarks = totalQuizzesTaken > 0 
          ? (totalQuizMarks / totalQuizzesTaken).toFixed(2) 
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
          watchTime: totalWatchTime,
          watchTimeMinutes: totalWatchTime / 60,  // Convert seconds to minutes
          watchTimeFormatted: formatDuration(totalWatchTime),
          videosWatched: videosWatched,
          totalVideos: totalVideos,
          readingMaterialsCompleted: readingMaterialsCompleted,
          totalReadingMaterials: totalReadingMaterials,
          progress: parseFloat(progressPercentage),
          progressColor: progressColor,
          unitMarks: unitMarksArray,  // Use the array format
          courseMarks: parseFloat(courseMarks),
          totalQuizzesTaken: totalQuizzesTaken,
          totalQuizzes: quizzes.length
        });
      }
    }

    // Sort by student name
    analyticsData.sort((a, b) => a.studentName.localeCompare(b.studentName));

    console.log(`[HOD Course Analytics] Returning ${analyticsData.length} student analytics`);
    
    // Log sample student data for debugging
    if (analyticsData.length > 0) {
      console.log('[HOD Course Analytics] Sample student data:', JSON.stringify(analyticsData[0], null, 2));
    }

    res.json({
      course: {
        courseId: course._id,
        courseTitle: course.title,
        courseCode: course.courseCode,
        school: course.school?.name,
        department: course.department?.name
      },
      sections: sections.map(s => ({
        id: s._id,
        name: s.name,
        studentCount: s.students?.length || 0
      })),
      units: units.map(u => ({
        _id: u._id,
        unitTitle: u.title
      })),
      totalStudents: analyticsData.length,
      students: analyticsData  // Changed from 'analytics' to 'students'
    });

  } catch (error) {
    console.error('[HOD Course Analytics] Error:', error);
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

module.exports = exports;
