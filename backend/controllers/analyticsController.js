const User = require('../models/User');
const Video = require('../models/Video');
const Course = require('../models/Course');
const mongoose = require('mongoose');
const { Parser } = require('json2csv');
const { setCache, getCache } = require('../utils/cache');

// Per-student activity heatmap
exports.studentHeatmap = async (req, res) => {
  try {
    const { studentId } = req.params;
    const student = await User.findById(studentId);
    if (!student) return res.status(404).json({ message: 'Student not found' });
    // Assume student.watchHistory: [{ video, watchedAt }]
    const pipeline = [
      { $match: { _id: student._id } },
      { $unwind: '$watchHistory' },
      { $project: {
        hour: { $hour: '$watchHistory.watchedAt' },
        day: { $dayOfWeek: '$watchHistory.watchedAt' },
      } },
      { $group: {
        _id: { hour: '$hour', day: '$day' },
        count: { $sum: 1 },
      } },
      { $sort: { '_id.day': 1, '_id.hour': 1 } },
    ];
    const data = await User.aggregate(pipeline);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Teacher performance metrics
exports.teacherPerformance = async (req, res) => {
  try {
    const { teacherId } = req.params;
    // Number of videos
    const videoCount = await Video.countDocuments({ teacher: teacherId });
    // Number of students completed (assume Course.studentsCompleted)
    const courses = await Course.find({ teacher: teacherId });
    let studentsCompleted = 0;
    for (const c of courses) {
      studentsCompleted += Array.isArray(c.studentsCompleted) ? c.studentsCompleted.length : 0;
    }
    // Average feedback rating (assume Course.feedback: [{ rating }])
    let feedbacks = [];
    for (const c of courses) {
      if (Array.isArray(c.feedback)) feedbacks = feedbacks.concat(c.feedback.map(f => f.rating));
    }
    const avgRating = feedbacks.length ? (feedbacks.reduce((a, b) => a + b, 0) / feedbacks.length).toFixed(2) : null;
    res.json({ videoCount, studentsCompleted, avgRating });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Export analytics as CSV (students or teachers)
exports.exportAnalyticsCSV = async (req, res) => {
  try {
    const { type } = req.query; // 'students' or 'teachers'
    let data = [];
    if (type === 'students') {
      data = await User.find({ role: 'student' }).lean();
    } else if (type === 'teachers') {
      data = await User.find({ role: 'teacher' }).lean();
    }
    const parser = new Parser();
    const csv = parser.parse(data);
    res.header('Content-Type', 'text/csv');
    res.attachment(`${type}-analytics.csv`);
    return res.send(csv);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
// Overview: total counts, active users, top courses (with in-memory cache)
exports.getOverview = async (req, res) => {
  try {
    // Try cache first (cache for 30 seconds)
    const cached = getCache('dashboard_overview');
    if (cached) return res.json(cached);
    
    const [totalStudents, totalTeachers, totalCourses, totalVideos] = await Promise.all([
      User.countDocuments({ role: 'student' }),
      User.countDocuments({ role: 'teacher' }),
      Course.countDocuments(),
      Video.countDocuments(),
    ]);
    
    // Active students in last 7 days (more realistic than 10 minutes)
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const activeStudents = await User.countDocuments({ 
      role: 'student', 
      $or: [
        { lastActive: { $gte: sevenDaysAgo } },
        { 'watchHistory.lastWatched': { $gte: sevenDaysAgo } }
      ]
    });
    
    // Quiz analytics - Read from StudentProgress for accurate quizPool data
    const StudentProgress = require('../models/StudentProgress');
    const studentProgresses = await StudentProgress.find({}).lean();
    
    let totalQuizAttempts = 0;
    let totalQuizScore = 0;
    let validAttempts = 0;
    const studentsWithQuizzes = new Set();
    
    // Process quiz attempts from StudentProgress.units[].quizAttempts
    for (const progress of studentProgresses) {
      if (!progress.units || !Array.isArray(progress.units)) continue;
      
      for (const unit of progress.units) {
        if (!unit.quizAttempts || !Array.isArray(unit.quizAttempts)) continue;
        
        for (const attempt of unit.quizAttempts) {
          totalQuizAttempts++;
          
          // Calculate percentage - prefer stored percentage, fallback to calculation
          let percentage = 0;
          if (attempt.percentage !== undefined && attempt.percentage > 0) {
            percentage = attempt.percentage;
          } else if (attempt.score !== undefined && attempt.maxScore !== undefined && attempt.maxScore > 0) {
            percentage = (attempt.score / attempt.maxScore) * 100;
          }
          
          if (percentage > 0) {
            totalQuizScore += percentage;
            validAttempts++;
            studentsWithQuizzes.add(progress.student.toString());
          }
        }
      }
    }
    
    const averageQuizScore = validAttempts > 0 ? totalQuizScore / validAttempts : 0;
    
    // Top 5 courses by students enrolled (through sections)
    const Section = require('../models/Section');
    const topCoursesData = await Section.aggregate([
      {
        $unwind: '$courses'
      },
      {
        $group: {
          _id: '$courses',
          studentCount: { 
            $sum: { 
              $size: { 
                $ifNull: ['$students', []] 
              } 
            } 
          }
        }
      },
      {
        $lookup: {
          from: 'courses',
          localField: '_id',
          foreignField: '_id',
          as: 'courseInfo'
        }
      },
      {
        $unwind: '$courseInfo'
      },
      {
        $project: {
          _id: 1,
          name: '$courseInfo.title',
          enrollments: '$studentCount'
        }
      },
      { $sort: { enrollments: -1 } },
      { $limit: 5 }
    ]);
    
    const topCourses = topCoursesData;
    
    // Calculate active students percentage
    const activeStudentsPercentage = totalStudents > 0 ? (activeStudents / totalStudents) * 100 : 0;
    
    const overview = {
      totalStudents,
      totalTeachers,
      totalCourses,
      totalVideos,
      activeStudents,
      activeStudentsPercentage: Math.round(activeStudentsPercentage * 10) / 10,
      topCourses,
      totalQuizAttempts,
      averageQuizScore: Math.round(averageQuizScore * 100) / 100,
      studentsWithQuizzes: studentsWithQuizzes.size
    };
    
    setCache('dashboard_overview', overview, 30 * 1000); // 30 seconds
    res.json(overview);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Enrollment trend per week/month
exports.getEnrollmentTrends = async (req, res) => {
  try {
    const { range = 'month' } = req.query; // 'week' or 'month'
    const groupFormat = range === 'week' ? { $isoWeek: '$createdAt' } : { $month: '$createdAt' };
    const pipeline = [
      { $match: { role: 'student' } },
      { $group: {
        _id: {
          year: { $year: '$createdAt' },
          period: groupFormat,
        },
        count: { $sum: 1 },
      } },
      { $sort: { '_id.year': 1, '_id.period': 1 } },
    ];
    const data = await User.aggregate(pipeline);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Heatmap: student activity by hour/day
exports.getActivityHeatmap = async (req, res) => {
  try {
    // Assume User.lastActive is updated on every action
    const pipeline = [
      { $match: { role: 'student', lastActive: { $exists: true } } },
      { $project: {
        hour: { $hour: '$lastActive' },
        day: { $dayOfWeek: '$lastActive' },
      } },
      { $group: {
        _id: { hour: '$hour', day: '$day' },
        count: { $sum: 1 },
      } },
      { $sort: { '_id.day': 1, '_id.hour': 1 } },
    ];
    
    const data = await User.aggregate(pipeline);
    
    // Convert day numbers to day names for readability
    const dayMap = {
      1: 'Sunday',
      2: 'Monday',
      3: 'Tuesday',
      4: 'Wednesday',
      5: 'Thursday',
      6: 'Friday',
      7: 'Saturday'
    };
    
    const formattedData = data.map(item => ({
      _id: {
        hour: item._id.hour,
        day: dayMap[item._id.day] || `Day ${item._id.day}`
      },
      count: item.count
    }));
    
    res.json(formattedData);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Get detailed analytics overview (for other parts of admin dashboard)
exports.getDetailedOverview = async (req, res) => {
  try {
    const studentsCount = await User.countDocuments({ role: 'student' });
    const teachersCount = await User.countDocuments({ role: 'teacher' });
    const coursesCount = await Course.countDocuments();
    const videosCount = await Video.countDocuments();
    
    // Get active students in the last 7 days
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    
    const activeStudents = await User.countDocuments({
      role: 'student',
      'watchHistory.lastWatched': { $gte: sevenDaysAgo }
    });

    // Get quiz analytics
    const QuizAttempt = require('../models/QuizAttempt');
    const totalQuizAttempts = await QuizAttempt.countDocuments();
    const quizAttempts = await QuizAttempt.find().select('score maxScore percentage');
    
    let totalQuizScore = 0;
    let validAttempts = 0;
    
    quizAttempts.forEach(attempt => {
      if (attempt.score !== undefined && attempt.maxScore !== undefined && attempt.maxScore > 0) {
        totalQuizScore += (attempt.score / attempt.maxScore) * 100;
        validAttempts++;
      }
    });
    
    const averageQuizScore = validAttempts > 0 ? totalQuizScore / validAttempts : 0;
    
    // Get students with quiz data
    const studentsWithQuizzes = await QuizAttempt.distinct('student');
    
    res.json({
      studentsCount,
      teachersCount,
      coursesCount,
      videosCount,
      activeStudents,
      activeStudentsPercentage: studentsCount > 0 ? (activeStudents / studentsCount) * 100 : 0,
      totalQuizAttempts,
      averageQuizScore: Math.round(averageQuizScore * 100) / 100,
      studentsWithQuizzes: studentsWithQuizzes.length
    });
  } catch (err) {
    console.error('Error getting detailed overview:', err);
    res.status(500).json({ message: err.message });
  }
};

// Get detailed enrollment trend over time (different format)
exports.getDetailedEnrollmentTrends = async (req, res) => {
  try {
    const { period = 'monthly' } = req.query;
    const result = await User.aggregate([
      { $match: { role: 'student' } },
      {
        $group: {
          _id: {
            year: { $year: '$createdAt' },
            month: period === 'monthly' ? { $month: '$createdAt' } : null,
            week: period === 'weekly' ? { $week: '$createdAt' } : null,
            day: period === 'daily' ? { $dayOfMonth: '$createdAt' } : null
          },
          count: { $sum: 1 }
        }
      },
      { $sort: { '_id.year': 1, '_id.month': 1, '_id.week': 1, '_id.day': 1 } }
    ]);

    // Format the result
    const trends = result.map(item => {
      let label;
      if (period === 'monthly') {
        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        label = `${monthNames[item._id.month - 1]} ${item._id.year}`;
      } else if (period === 'weekly') {
        label = `Week ${item._id.week}, ${item._id.year}`;
      } else {
        label = `${item._id.day}/${item._id.month}/${item._id.year}`;
      }
      
      return { 
        label, 
        count: item.count 
      };
    });
    
    res.json(trends);
  } catch (err) {
    console.error('Error getting detailed enrollment trends:', err);
    res.status(500).json({ message: err.message });
  }
};

// Get top courses by enrollment
exports.getTopCourses = async (req, res) => {
  try {
    const Section = require('../models/Section');
    const courses = await Section.aggregate([
      {
        $unwind: '$courses'
      },
      {
        $group: {
          _id: '$courses',
          studentCount: { 
            $sum: { 
              $size: { 
                $ifNull: ['$students', []] 
              } 
            } 
          }
        }
      },
      {
        $lookup: {
          from: 'courses',
          localField: '_id',
          foreignField: '_id',
          as: 'courseInfo'
        }
      },
      {
        $unwind: '$courseInfo'
      },
      {
        $project: {
          _id: 1,
          title: '$courseInfo.title',
          name: '$courseInfo.title', // Use title as name for compatibility with dashboard component
          courseCode: '$courseInfo.courseCode',
          description: '$courseInfo.description',
          studentsCount: '$studentCount',
          enrollments: '$studentCount' // Use studentCount instead of $students
        }
      },
      { $sort: { studentsCount: -1 } },
      { $limit: 5 }
    ]);
    
    res.json(courses);
  } catch (err) {
    console.error('Error getting top courses:', err);
    res.status(500).json({ message: err.message });
  }
};

// Get detailed activity heatmap data
exports.getDetailedActivityHeatmap = async (req, res) => {
  try {
    const { days = 30 } = req.query;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(days));
    
    const result = await User.aggregate([
      { 
        $match: { 
          role: 'student',
          'watchHistory.lastWatched': { $gte: startDate }
        }
      },
      { $unwind: '$watchHistory' },
      { 
        $match: { 
          'watchHistory.lastWatched': { $gte: startDate }
        }
      },
      {
        $group: {
          _id: {
            year: { $year: '$watchHistory.lastWatched' },
            month: { $month: '$watchHistory.lastWatched' },
            day: { $dayOfMonth: '$watchHistory.lastWatched' },
            hour: { $hour: '$watchHistory.lastWatched' }
          },
          count: { $sum: 1 },
          totalTimeSpent: { $sum: '$watchHistory.timeSpent' }
        }
      },
      { $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1, '_id.hour': 1 } }
    ]);
    
    // Format the result
    const heatmap = result.map(item => {
      const date = new Date(
        item._id.year, 
        item._id.month - 1, 
        item._id.day, 
        item._id.hour
      );
      
      return {
        date: date.toISOString(),
        day: date.getDay(),
        hour: date.getHours(),
        value: item.count,
        timeSpent: item.totalTimeSpent
      };
    });
    
    res.json(heatmap);
  } catch (err) {
    console.error('Error getting detailed activity heatmap:', err);
    res.status(500).json({ message: err.message });
  }
};

// Enhanced course analytics with student count, total watch time and more details
exports.getCourseAnalytics = async (req, res) => {
  try {
    const { courseId } = req.params;
    
    // Find the course with populated coordinators (not teachers)
    const course = await Course.findById(courseId)
      .populate('coordinators', 'name teacherId email')
      .populate('videos');
    
    if (!course) {
      return res.status(404).json({ message: 'Course not found' });
    }
    
    // Get all students assigned to this course through sections
    const Section = require('../models/Section');
    const sections = await Section.find({ 
      courses: courseId 
    }).populate({
      path: 'students',
      select: 'name regNo uid email watchHistory',
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
    
    // Get quiz attempts for this course
    const QuizAttempt = require('../models/QuizAttempt');
    const quizAttempts = await QuizAttempt.find({ course: courseId })
      .populate('student', 'name regNo')
      .populate('quiz', 'title')
      .populate('quizPool', 'name');
    
    // Calculate total watch time per student for this course
    const studentAnalytics = [];
    
    // Get all video IDs for this course
    const courseVideoIds = course.videos.map(video => video._id);
    const courseVideoIdSet = new Set(courseVideoIds.map(id => id.toString()));
    
    // Watch time validation
    const watchTimeValidation = {};
    for (const video of course.videos) {
      watchTimeValidation[video._id.toString()] = {
        fromWatchHistory: 0,
        fromVideoRecords: 0,
        studentCounts: { watchHistory: 0, videoRecords: 0 }
      };
    }
    
    for (const student of students) {
      // Calculate watch time from User.watchHistory (matching getStudentDetailedAnalytics)
      let totalWatchTime = 0;
      const videoCompletions = {};
      const uniqueDays = new Set();
      
      if (student.watchHistory && student.watchHistory.length > 0) {
        for (const item of student.watchHistory) {
          // Check if this video belongs to this course
          const videoId = item.video?._id?.toString();
          const videoCourseId = item.video?.course?.toString();
          
          // Match by either: video is in course.videos OR video.course matches courseId
          if (videoCourseId === courseId || (videoId && courseVideoIdSet.has(videoId))) {
            const timeSpent = item.timeSpent || 0;
            totalWatchTime += timeSpent;
            
            // Track video completions (use the latest/highest time for each video)
            if (videoId) {
              if (!videoCompletions[videoId] || videoCompletions[videoId] < timeSpent) {
                videoCompletions[videoId] = timeSpent;
              }
              
              // Track validation
              if (watchTimeValidation[videoId]) {
                watchTimeValidation[videoId].fromWatchHistory += timeSpent;
                watchTimeValidation[videoId].studentCounts.watchHistory++;
              }
            }
            
            // Track unique days
            if (item.lastWatched) {
              uniqueDays.add(new Date(item.lastWatched).toISOString().split('T')[0]);
            }
          }
        }
      }
      
      // Count all unique videos watched for this course (including removed videos)
      const videosWatchedCount = Object.keys(videoCompletions).length;
      
      // Cross-validate with video records
      let totalWatchTimeFromRecords = 0;
      for (const video of course.videos) {
        if (video.watchRecords) {
          const videoRecord = video.watchRecords.find(
            record => record.student && record.student.toString() === student._id.toString()
          );
          
          if (videoRecord) {
            totalWatchTimeFromRecords += videoRecord.timeSpent || 0;
            const videoIdStr = video._id.toString();
            if (watchTimeValidation[videoIdStr]) {
              watchTimeValidation[videoIdStr].fromVideoRecords += videoRecord.timeSpent || 0;
              watchTimeValidation[videoIdStr].studentCounts.videoRecords++;
            }
          }
        }
      }
      
      // Get quiz data for this student in this course
      const studentQuizAttempts = quizAttempts.filter(
        attempt => attempt.student._id.toString() === student._id.toString()
      );
      
      // Calculate quiz analytics - average based on passed quizzes only
      const passedQuizzes = studentQuizAttempts.filter(attempt => attempt.passed);
      const passedPercentageSum = passedQuizzes.reduce((sum, attempt) => {
        const percentage = attempt.maxScore > 0 ? (attempt.score / attempt.maxScore) * 100 : 0;
        return sum + percentage;
      }, 0);
      
      const quizAnalytics = {
        totalAttempts: studentQuizAttempts.length,
        totalScore: studentQuizAttempts.reduce((sum, attempt) => sum + (attempt.score || 0), 0),
        totalMaxScore: studentQuizAttempts.reduce((sum, attempt) => sum + (attempt.maxScore || 0), 0),
        averagePercentage: passedQuizzes.length > 0 
          ? passedPercentageSum / passedQuizzes.length
          : 0,
        passedQuizzes: passedQuizzes.length,
        quizzes: studentQuizAttempts.map(attempt => ({
          quizTitle: attempt.quiz?.title || attempt.quizPool?.name || 'Unknown Quiz',
          score: attempt.score,
          maxScore: attempt.maxScore,
          totalQuestions: attempt.totalQuestions || attempt.maxScore,
          percentage: attempt.maxScore > 0 ? (attempt.score / attempt.maxScore) * 100 : 0,
          passed: attempt.passed,
          completedAt: attempt.completedAt
        }))
      };
      
      // Use watchHistory as primary, video records as fallback
      const correctedWatchTime = Math.max(totalWatchTime, totalWatchTimeFromRecords);
      
      studentAnalytics.push({
        _id: student._id,
        name: student.name,
        regNo: student.regNo,
        email: student.email,
        totalWatchTimeFromHistory: totalWatchTime,
        totalWatchTimeFromRecords: totalWatchTimeFromRecords,
        watchTimeDiscrepancy: Math.abs(totalWatchTime - totalWatchTimeFromRecords),
        // Use the higher value as the corrected watch time
        correctedWatchTime: correctedWatchTime,
        totalWatchTimeFormatted: formatTime(correctedWatchTime),
        videoCompletions,
        uniqueDaysActive: uniqueDays.size,
        videosWatched: videosWatchedCount,
        quizAnalytics
      });
    }
    
    // Calculate average watch time per student (using corrected values)
    const avgWatchTime = students.length > 0 
      ? studentAnalytics.reduce((sum, student) => sum + student.correctedWatchTime, 0) / students.length 
      : 0;
    
    // Calculate watch time per video with validation using User.watchHistory
    const videoAnalytics = [];
    
    for (const video of course.videos) {
      let totalWatchTimeFromHistory = 0;
      let totalWatchTimeFromRecords = 0;
      let studentsWatchedHistory = 0;
      let studentsWatchedRecords = 0;
      
      // From User.watchHistory
      for (const student of students) {
        if (student.watchHistory) {
          const watchRecord = student.watchHistory.find(
            item => item.video && item.video._id && item.video._id.toString() === video._id.toString()
          );
          if (watchRecord && watchRecord.timeSpent > 0) {
            totalWatchTimeFromHistory += watchRecord.timeSpent;
            studentsWatchedHistory++;
          }
        }
      }
      
      // From video records
      if (video.watchRecords) {
        for (const record of video.watchRecords) {
          if (record.timeSpent > 0) {
            totalWatchTimeFromRecords += record.timeSpent;
            studentsWatchedRecords++;
          }
        }
      }
      
      // Use the higher value as corrected total
      const correctedTotalWatchTime = Math.max(totalWatchTimeFromHistory, totalWatchTimeFromRecords);
      const correctedStudentsWatched = Math.max(studentsWatchedHistory, studentsWatchedRecords);
      
      videoAnalytics.push({
        _id: video._id,
        title: video.title,
        totalWatchTimeFromHistory,
        totalWatchTimeFromRecords,
        watchTimeDiscrepancy: Math.abs(totalWatchTimeFromHistory - totalWatchTimeFromRecords),
        correctedTotalWatchTime,
        totalWatchTimeFormatted: formatTime(correctedTotalWatchTime),
        studentsWatchedHistory,
        studentsWatchedRecords,
        correctedStudentsWatched,
        avgWatchTimePerStudent: correctedStudentsWatched > 0 ? correctedTotalWatchTime / correctedStudentsWatched : 0,
        avgWatchTimeFormatted: correctedStudentsWatched > 0 ? formatTime(correctedTotalWatchTime / correctedStudentsWatched) : '0s',
        watchPercentage: students.length > 0 ? (correctedStudentsWatched / students.length) * 100 : 0
      });
    }
    
    // Calculate coordinator activity and contribution
    const coordinatorAnalytics = course.coordinators.map(coordinator => {
      // Count videos uploaded by this coordinator
      const coordinatorVideos = course.videos.filter(
        video => video.teacher && video.teacher.toString() === coordinator._id.toString()
      );
      
      return {
        _id: coordinator._id,
        name: coordinator.name,
        teacherId: coordinator.teacherId,
        email: coordinator.email,
        videosUploaded: coordinatorVideos.length,
        contributionPercentage: course.videos.length > 0 
          ? (coordinatorVideos.length / course.videos.length) * 100 
          : 0
      };
    });
    
    // Calculate course-level quiz analytics
    const courseQuizAnalytics = {
      totalQuizAttempts: quizAttempts.length,
      uniqueStudentsAttempted: [...new Set(quizAttempts.map(attempt => attempt.student._id.toString()))].length,
      averageScore: quizAttempts.length > 0 
        ? quizAttempts.reduce((sum, attempt) => sum + (attempt.score || 0), 0) / quizAttempts.length
        : 0,
      averagePercentage: quizAttempts.length > 0 
        ? quizAttempts.reduce((sum, attempt) => {
            const percentage = attempt.maxScore > 0 ? (attempt.score / attempt.maxScore) * 100 : 0;
            return sum + percentage;
          }, 0) / quizAttempts.length
        : 0,
      passRate: quizAttempts.length > 0 
        ? (quizAttempts.filter(attempt => attempt.passed).length / quizAttempts.length) * 100
        : 0,
      quizBreakdown: [...new Set(quizAttempts.map(attempt => 
        attempt.quiz?.title || attempt.quizPool?.name || 'Unknown Quiz'
      ))].map(quizTitle => {
        const quizAttemptsByTitle = quizAttempts.filter(attempt => 
          (attempt.quiz?.title || attempt.quizPool?.name || 'Unknown Quiz') === quizTitle
        );
        
        return {
          title: quizTitle,
          attempts: quizAttemptsByTitle.length,
          averageScore: quizAttemptsByTitle.reduce((sum, attempt) => sum + (attempt.score || 0), 0) / quizAttemptsByTitle.length,
          passRate: (quizAttemptsByTitle.filter(attempt => attempt.passed).length / quizAttemptsByTitle.length) * 100
        };
      })
    };
    
    // Return comprehensive analytics with watch time validation
    res.json({
      course: {
        _id: course._id,
        title: course.title,
        courseCode: course.courseCode,
        description: course.description
      },
      summary: {
        totalStudents: students.length,
        totalVideos: course.videos.length,
        totalCoordinators: course.coordinators.length,
        avgWatchTime,
        avgWatchTimeFormatted: formatTime(avgWatchTime)
      },
      watchTimeValidation,
      studentAnalytics: studentAnalytics.sort((a, b) => b.correctedWatchTime - a.correctedWatchTime),
      videoAnalytics: videoAnalytics.sort((a, b) => b.correctedTotalWatchTime - a.correctedTotalWatchTime),
      coordinatorAnalytics,
      quizAnalytics: courseQuizAnalytics
    });
  } catch (err) {
    console.error('Error getting course analytics:', err);
    res.status(500).json({ message: err.message });
  }
};

// Get student analytics across all courses
exports.getStudentDetailedAnalytics = async (req, res) => {
  try {
    const { studentId } = req.params;
    
    // Find student with basic info
    const student = await User.findById(studentId)
      .populate('watchHistory.video');
    
    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }
    
    // Get courses through sections
    const Section = require('../models/Section');
    const sections = await Section.find({ 
      students: studentId 
    }).populate('courses', 'title courseCode videos');
    
    // Collect all courses from sections
    const courseMap = new Map();
    sections.forEach(section => {
      if (section.courses) {
        section.courses.forEach(course => {
          courseMap.set(course._id.toString(), course);
        });
      }
    });
    
    const studentCourses = Array.from(courseMap.values());
    
    // Get quiz attempts for this student
    const QuizAttempt = require('../models/QuizAttempt');
    const quizAttempts = await QuizAttempt.find({ student: studentId })
      .populate('quiz', 'title course')
      .populate('quizPool', 'name course')
      .populate('course', 'title courseCode');
    
    // Group watch history and quiz data by course
    const courseWatchHistory = {};
    const courseQuizData = {};
    const videoDetails = {};
    let totalWatchTime = 0;
    let totalQuizScore = 0;
    let totalQuizAttempts = 0;
    
    // Process watch history
    for (const item of student.watchHistory) {
      if (!item.video || !item.video._id) continue;
      
      totalWatchTime += item.timeSpent || 0;
      
      // Store video details for reference
      videoDetails[item.video._id] = {
        title: item.video.title || 'Unknown Video',
        courseId: item.video.course || null
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
        lastWatched: item.lastWatched,
        playbackRate: item.playbackRate || 1
      };
      
      // Update last activity
      if (item.lastWatched && (!courseWatchHistory[courseId].lastActivity || 
          item.lastWatched > courseWatchHistory[courseId].lastActivity)) {
        courseWatchHistory[courseId].lastActivity = item.lastWatched;
      }
    }
    
    // Process quiz data
    for (const attempt of quizAttempts) {
      if (!attempt || !attempt.course) continue;
      
      const courseId = attempt.course._id ? attempt.course._id.toString() : attempt.course.toString();
      totalQuizScore += attempt.score || 0;
      totalQuizAttempts++;
      
      if (!courseQuizData[courseId]) {
        courseQuizData[courseId] = {
          totalScore: 0,
          totalMaxScore: 0,
          totalAttempts: 0,
          passedAttempts: 0,
          passedPercentageSum: 0,
          quizzes: [],
          averageScore: 0,
          averagePercentage: 0
        };
      }
      
      courseQuizData[courseId].totalScore += attempt.score || 0;
      courseQuizData[courseId].totalMaxScore += attempt.maxScore || 0;
      courseQuizData[courseId].totalAttempts++;
      
      const quizTitle = attempt.quiz?.title || attempt.quizPool?.name || 'Unknown Quiz';
      const calculatedPercentage = attempt.maxScore > 0 ? (attempt.score / attempt.maxScore) * 100 : 0;
      
      // Track passed quizzes for average calculation
      if (attempt.passed) {
        courseQuizData[courseId].passedAttempts++;
        courseQuizData[courseId].passedPercentageSum += calculatedPercentage;
      }
      
      courseQuizData[courseId].quizzes.push({
        _id: attempt._id,
        quizTitle,
        score: attempt.score || 0,
        maxScore: attempt.maxScore || 0,
        totalQuestions: attempt.totalQuestions || attempt.maxScore,
        percentage: calculatedPercentage,
        passed: attempt.passed || false,
        timeSpent: attempt.timeSpent || 0,
        completedAt: attempt.completedAt || attempt.createdAt || new Date(),
        securityViolations: attempt.securityViolations || 0
      });
      
      // Calculate averages - use passed quizzes only for percentage
      courseQuizData[courseId].averageScore = courseQuizData[courseId].totalScore / courseQuizData[courseId].totalAttempts;
      courseQuizData[courseId].averagePercentage = courseQuizData[courseId].passedAttempts > 0 
        ? courseQuizData[courseId].passedPercentageSum / courseQuizData[courseId].passedAttempts
        : 0;
    }
    
    // Build detailed course analytics
    const courseAnalytics = [];
    
    for (const course of studentCourses) {
      const courseId = course._id.toString();
      const watchData = courseWatchHistory[courseId] || { totalTime: 0, videos: {}, lastActivity: null };
      const quizData = courseQuizData[courseId] || { totalScore: 0, totalMaxScore: 0, totalAttempts: 0, quizzes: [], averageScore: 0, averagePercentage: 0 };
      
      // Calculate watch metrics for this course
      const videosWatched = Object.keys(watchData.videos).length;
      
      // Get course videos to calculate completion percentage
      let totalVideos = 0;
      let actualVideosWatched = 0;
      try {
        // Use the already populated course videos from sections query
        // If not available, fetch them separately
        let courseVideos = course.videos || [];
        
        // If videos not populated or empty, try fetching course separately
        if (!courseVideos || courseVideos.length === 0) {
          console.log(`Fetching videos separately for course ${courseId}`);
          const courseWithVideos = await Course.findById(courseId).populate('videos');
          courseVideos = courseWithVideos?.videos || [];
        }
        
        // If still no videos found in course but user has watch history for this course,
        // use the watch history as the source of truth for total videos
        if (courseVideos.length === 0 && Object.keys(watchData.videos).length > 0) {
          console.log(`No course videos found, but user has watch history for ${Object.keys(watchData.videos).length} videos. Using watch history as fallback.`);
          totalVideos = Object.keys(watchData.videos).length;
          
          // All videos in watch history are considered valid for this course
          const MINIMUM_WATCH_TIME = 30; // 30 seconds minimum to consider "watched"
          actualVideosWatched = Object.entries(watchData.videos).filter(([videoId, video]) => 
            video.timeSpent >= MINIMUM_WATCH_TIME
          ).length;
        } else {
          totalVideos = courseVideos.length;
          
          // Get actual video IDs that exist in the course
          const courseVideoIds = new Set(
            courseVideos.map(v => v._id ? v._id.toString() : v.toString())
          );
          
          // Count only videos that:
          // 1. Actually exist in the course (not removed videos)
          // 2. Have been watched for at least 30 seconds
          const MINIMUM_WATCH_TIME = 30; // 30 seconds minimum to consider "watched"
          actualVideosWatched = Object.entries(watchData.videos).filter(([videoId, video]) => 
            courseVideoIds.has(videoId) && video.timeSpent >= MINIMUM_WATCH_TIME
          ).length;
          
          // Ensure we don't exceed total videos (sanity check)
          actualVideosWatched = Math.min(actualVideosWatched, totalVideos);
        }
        
        console.log(`Course ${course.title}: Total Videos = ${totalVideos}`);
        console.log(`Course ${course.title}: Videos watched (>30s) = ${actualVideosWatched}`);
      } catch (err) {
        console.error('Error fetching course videos:', err);
        totalVideos = 0;
        actualVideosWatched = 0;
      }
      
      // Time-based analytics
      const watchTimesByDay = {};
      const watchTimesByHour = {};
      
      // Process watch times by day and hour
      Object.values(watchData.videos).forEach(videoData => {
        if (videoData.lastWatched) {
          const day = videoData.lastWatched.toLocaleDateString('en-US', { weekday: 'long' });
          const hour = videoData.lastWatched.getHours();
          
          watchTimesByDay[day] = (watchTimesByDay[day] || 0) + videoData.timeSpent;
          watchTimesByHour[hour] = (watchTimesByHour[hour] || 0) + videoData.timeSpent;
        }
      });
      
      // Calculate completion percentage
      let completionPercentage = 0;
      if (totalVideos > 0) {
        completionPercentage = (actualVideosWatched / totalVideos) * 100;
      }
      
      console.log(`Course ${course.title}: Completion = ${completionPercentage.toFixed(1)}% (${actualVideosWatched}/${totalVideos})`);
      
      courseAnalytics.push({
        _id: course._id,
        title: course.title || 'Unknown Course',
        courseCode: course.courseCode || 'N/A',
        totalWatchTime: watchData.totalTime,
        totalWatchTimeFormatted: formatTime(watchData.totalTime),
        videosWatched: actualVideosWatched,
        totalVideos: totalVideos,
        completionPercentage,
        lastActivity: watchData.lastActivity,
        
        // Quiz analytics
        quizAnalytics: {
          totalScore: quizData.totalScore,
          totalMaxScore: quizData.totalMaxScore,
          totalAttempts: quizData.totalAttempts,
          averageScore: quizData.averageScore || 0,
          averagePercentage: quizData.averagePercentage || 0,
          quizzes: quizData.quizzes.sort((a, b) => new Date(b.completedAt || 0) - new Date(a.completedAt || 0))
        },
        
        videoDetails: Object.entries(watchData.videos).map(([videoId, data]) => ({
          videoId,
          title: videoDetails[videoId]?.title || 'Unknown Video',
          timeSpent: data.timeSpent,
          timeSpentFormatted: formatTime(data.timeSpent),
          lastWatched: data.lastWatched,
          playbackRate: data.playbackRate || 1
        })),
        watchTimesByDay,
        watchTimesByHour
      });
    }
    
    // Calculate activity heatmap data
    const activityHeatmap = generateActivityHeatmap(student.watchHistory);
    
    // Calculate engagement metrics
    const engagementMetrics = calculateEngagementMetrics(student.watchHistory);
    
    // Calculate overall progress percentage
    const overallProgress = courseAnalytics.length > 0 
      ? courseAnalytics.reduce((sum, course) => sum + course.completionPercentage, 0) / courseAnalytics.length
      : 0;
    
    // Calculate average quiz percentage - only from passed quizzes
    const passedQuizAttempts = quizAttempts.filter(attempt => attempt.passed);
    const averageQuizPercentage = passedQuizAttempts.length > 0 
      ? passedQuizAttempts.reduce((sum, attempt) => {
          const percentage = attempt.maxScore > 0 ? (attempt.score / attempt.maxScore) * 100 : 0;
          return sum + percentage;
        }, 0) / passedQuizAttempts.length
      : 0;

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
        totalCourses: studentCourses.length,
        totalVideosWatched: Object.keys(videoDetails).length,
        averageWatchTimePerVideo: Object.keys(videoDetails).length > 0 
          ? totalWatchTime / Object.keys(videoDetails).length 
          : 0,
        averageWatchTimeFormatted: Object.keys(videoDetails).length > 0 
          ? formatTime(totalWatchTime / Object.keys(videoDetails).length) 
          : '0s',
        
        // Quiz summary
        totalQuizAttempts,
        totalQuizScore,
        averageQuizScore: totalQuizAttempts > 0 ? totalQuizScore / totalQuizAttempts : 0,
        averageQuizPercentage
      },
      // Add statistics field for frontend compatibility
      statistics: {
        totalCourses: studentCourses.length,
        averageProgress: Math.round(overallProgress),
        averageMarks: Math.round(averageQuizPercentage),
        totalWatchTimeFormatted: formatTime(totalWatchTime),
        totalQuizAttempts,
        averageQuizScore: totalQuizAttempts > 0 ? Math.round(totalQuizScore / totalQuizAttempts) : 0,
        averageQuizPercentage: Math.round(averageQuizPercentage)
      },
      courseAnalytics: courseAnalytics.sort((a, b) => b.totalWatchTime - a.totalWatchTime),
      activityHeatmap,
      engagementMetrics
    });
  } catch (err) {
    console.error('Error getting student analytics:', err);
    res.status(500).json({ message: err.message });
  }
};

// Search student by registration number
exports.searchStudent = async (req, res) => {
  try {
    const { regNo } = req.query;
    
    if (!regNo) {
      return res.status(400).json({ message: 'Registration number is required' });
    }
    
    const student = await User.findOne({ 
      regNo, 
      role: 'student' 
    });
    
    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }
    
    // Return student ID to redirect to detailed analytics
    res.json({ 
      _id: student._id,
      name: student.name,
      regNo: student.regNo,
      email: student.email
    });
  } catch (err) {
    console.error('Error searching student:', err);
    res.status(500).json({ message: err.message });
  }
};

// Teacher activity and performance analytics
exports.getTeacherAnalytics = async (req, res) => {
  try {
    const { teacherId } = req.params;
    
    // Find teacher with basic info
    const teacher = await User.findById(teacherId);
    
    if (!teacher) {
      return res.status(404).json({ message: 'Teacher not found' });
    }
    
    // Get courses through sections where teacher is assigned
    const Section = require('../models/Section');
    const sections = await Section.find({ 
      teachers: teacherId 
    }).populate('courses', 'title courseCode videos');
    
    // Collect all unique courses from sections
    const courseMap = new Map();
    sections.forEach(section => {
      if (section.courses) {
        section.courses.forEach(course => {
          courseMap.set(course._id.toString(), course);
        });
      }
    });
    
    const teacherCourses = Array.from(courseMap.values());
    
    // Get all videos by this teacher
    const videos = await Video.find({ teacher: teacherId });
    
    // Calculate course-specific analytics
    const courseAnalytics = [];
    
    for (const course of teacherCourses) {
      // Videos uploaded to this course by this teacher
      const courseVideos = videos.filter(
        video => video.course && video.course.toString() === course._id.toString()
      );
      
      // Get all students for this course through sections
      const courseSections = await Section.find({ 
        courses: course._id 
      }).populate('students', 'watchHistory');
      
      // Collect unique students
      const studentMap = new Map();
      courseSections.forEach(section => {
        if (section.students) {
          section.students.forEach(student => {
            studentMap.set(student._id.toString(), student);
          });
        }
      });
      
      const students = Array.from(studentMap.values());
      
      // Calculate total watch time across all students for this teacher's videos
      let totalWatchTime = 0;
      let studentsEngaged = 0;
      
      for (const student of students) {
        let hasWatchedTeacherVideo = false;
        
        for (const watchRecord of student.watchHistory) {
          const videoMatch = courseVideos.find(v => 
            v._id.toString() === (watchRecord.video ? watchRecord.video.toString() : '')
          );
          
          if (videoMatch && watchRecord.timeSpent > 0) {
            totalWatchTime += watchRecord.timeSpent;
            hasWatchedTeacherVideo = true;
          }
        }
        
        if (hasWatchedTeacherVideo) {
          studentsEngaged++;
        }
      }
      
      courseAnalytics.push({
        _id: course._id,
        title: course.title,
        courseCode: course.courseCode,
        videosUploaded: courseVideos.length,
        totalStudents: students.length,
        studentsEngaged,
        engagementRate: students.length > 0 ? (studentsEngaged / students.length) * 100 : 0,
        totalWatchTime,
        totalWatchTimeFormatted: formatTime(totalWatchTime),
        avgWatchTimePerStudent: studentsEngaged > 0 ? totalWatchTime / studentsEngaged : 0,
        avgWatchTimeFormatted: studentsEngaged > 0 ? formatTime(totalWatchTime / studentsEngaged) : '0s'
      });
    }
    
    // Return comprehensive teacher analytics
    res.json({
      teacher: {
        _id: teacher._id,
        name: teacher.name,
        teacherId: teacher.teacherId,
        email: teacher.email
      },
      summary: {
        totalCourses: teacherCourses.length,
        totalVideos: videos.length,
        totalStudentsReached: courseAnalytics.reduce((sum, course) => sum + course.totalStudents, 0),
        totalStudentsEngaged: courseAnalytics.reduce((sum, course) => sum + course.studentsEngaged, 0),
        totalWatchTime: courseAnalytics.reduce((sum, course) => sum + course.totalWatchTime, 0),
        totalWatchTimeFormatted: formatTime(
          courseAnalytics.reduce((sum, course) => sum + course.totalWatchTime, 0)
        )
      },
      courseAnalytics: courseAnalytics.sort((a, b) => b.totalWatchTime - a.totalWatchTime)
    });
  } catch (err) {
    console.error('Error getting teacher analytics:', err);
    res.status(500).json({ message: err.message });
  }
};

// Get student's per-video analytics (just for backward compatibility)
exports.studentAnalytics = async (req, res) => {
  try {
    const { studentId } = req.params;
    const student = await User.findById(studentId).populate('watchHistory.video');
    if (!student) return res.status(404).json({ message: 'Student not found' });
    res.json(student.watchHistory);
  } catch (err) {
    res.status(400).json({ message: err.message });
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

// Helper function to generate activity heatmap
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

// Helper function to calculate engagement metrics
function calculateEngagementMetrics(watchHistory) {
  // Sort watch history by lastWatched
  const sortedHistory = [...watchHistory]
    .filter(item => item.lastWatched)
    .sort((a, b) => new Date(a.lastWatched) - new Date(b.lastWatched));
  
  if (sortedHistory.length === 0) {
    return {
      firstActivity: null,
      lastActivity: null,
      totalDaysActive: 0,
      averageSessionLength: 0,
      averageSessionLengthFormatted: '0s',
      longestStreak: 0,
      currentStreak: 0
    };
  }
  
  // Calculate first and last activity dates
  const firstActivity = new Date(sortedHistory[0].lastWatched);
  const lastActivity = new Date(sortedHistory[sortedHistory.length - 1].lastWatched);
  
  // Calculate unique active days
  const uniqueDays = new Set(
    sortedHistory.map(item => 
      new Date(item.lastWatched).toISOString().split('T')[0]
    )
  );
  
  // Calculate streaks
  let currentStreak = 0;
  let longestStreak = 0;
  let currentDate = new Date();
  
  // Convert uniqueDays to array and sort
  const activeDays = Array.from(uniqueDays).sort();
  
  // Calculate current streak (consecutive days including today)
  const today = new Date().toISOString().split('T')[0];
  
  for (let i = activeDays.length - 1; i >= 0; i--) {
    const dayDiff = Math.floor(
      (currentDate - new Date(activeDays[i])) / (1000 * 60 * 60 * 24)
    );
    
    if (dayDiff <= 1) {
      currentStreak++;
      currentDate = new Date(activeDays[i]);
    } else {
      break;
    }
  }
  
  // Reset if today is not included
  if (activeDays.length > 0 && activeDays[activeDays.length - 1] !== today) {
    currentStreak = 0;
  }
  
  // Calculate longest streak
  let tempStreak = 1;
  for (let i = 1; i < activeDays.length; i++) {
    const dayDiff = Math.floor(
      (new Date(activeDays[i]) - new Date(activeDays[i - 1])) / (1000 * 60 * 60 * 24)
    );
    
    if (dayDiff === 1) {
      tempStreak++;
    } else {
      longestStreak = Math.max(longestStreak, tempStreak);
      tempStreak = 1;
    }
  }
  
  longestStreak = Math.max(longestStreak, tempStreak);
  
  // Calculate average session length (group activities within 30min as one session)
  const sessions = [];
  let currentSession = {
    start: new Date(sortedHistory[0].lastWatched),
    end: new Date(sortedHistory[0].lastWatched),
    timeSpent: sortedHistory[0].timeSpent || 0
  };
  
  for (let i = 1; i < sortedHistory.length; i++) {
    const currentTime = new Date(sortedHistory[i].lastWatched);
    const timeDiff = (currentTime - currentSession.end) / (1000 * 60); // in minutes
    
    if (timeDiff <= 30) {
      // Continue current session
      currentSession.end = currentTime;
      currentSession.timeSpent += sortedHistory[i].timeSpent || 0;
    } else {
      // End current session and start a new one
      sessions.push(currentSession);
      currentSession = {
        start: currentTime,
        end: currentTime,
        timeSpent: sortedHistory[i].timeSpent || 0
      };
    }
  }
  
  // Add the last session
  sessions.push(currentSession);
  
  // Calculate average session length
  const totalSessionTime = sessions.reduce((sum, session) => sum + session.timeSpent, 0);
  const averageSessionLength = sessions.length > 0 ? totalSessionTime / sessions.length : 0;
  
  return {
    firstActivity,
    lastActivity,
    totalDaysActive: uniqueDays.size,
    averageSessionLength,
    averageSessionLengthFormatted: formatTime(averageSessionLength),
    longestStreak,
    currentStreak,
    totalSessions: sessions.length
  };
}

// Sync watch time data between User.watchHistory and Video.watchRecords
exports.syncWatchTimeData = async (req, res) => {
  try {
    console.log('🔄 Starting watch time synchronization...');
    
    let totalStudentsProcessed = 0;
    let totalDiscrepanciesFound = 0;
    let totalRecordsFixed = 0;
    
    // Get all students with watch history
    const students = await User.find({ 
      role: 'student',
      'watchHistory.0': { $exists: true }
    }).populate('watchHistory.video');
    
    console.log(`📊 Found ${students.length} students with watch history`);
    
    const syncResults = [];
    
    for (const student of students) {
      totalStudentsProcessed++;
      let studentDiscrepancies = 0;
      let studentRecordsFixed = 0;
      
      for (const historyItem of student.watchHistory) {
        if (!historyItem.video) continue;
        
        // Find the corresponding video
        const video = await Video.findById(historyItem.video._id);
        if (!video) continue;
        
        // Find existing record in video.watchRecords
        const existingRecord = video.watchRecords.find(
          record => record.student && record.student.toString() === student._id.toString()
        );
        
        if (existingRecord) {
          // Check for discrepancy
          const historyTime = historyItem.timeSpent || 0;
          const recordTime = existingRecord.timeSpent || 0;
          
          if (Math.abs(historyTime - recordTime) > 1) { // Allow 1 second tolerance
            studentDiscrepancies++;
            totalDiscrepanciesFound++;
            
            // Use the higher value as the correct one
            const correctedTime = Math.max(historyTime, recordTime);
            
            // Update both records
            existingRecord.timeSpent = correctedTime;
            existingRecord.lastWatched = historyItem.lastWatched || existingRecord.lastWatched;
            
            // Update user history
            historyItem.timeSpent = correctedTime;
            
            studentRecordsFixed++;
            totalRecordsFixed++;
          }
        } else {
          // Create missing record in video.watchRecords
          video.watchRecords.push({
            student: student._id,
            timeSpent: historyItem.timeSpent || 0,
            lastWatched: historyItem.lastWatched,
            completed: false // You might want to calculate this based on duration
          });
          
          studentRecordsFixed++;
          totalRecordsFixed++;
        }
        
        // Save the video with updated records
        await video.save();
      }
      
      // Save the student with updated history
      await student.save();
      
      if (studentDiscrepancies > 0 || studentRecordsFixed > 0) {
        syncResults.push({
          studentId: student._id,
          studentName: student.name,
          discrepanciesFound: studentDiscrepancies,
          recordsFixed: studentRecordsFixed
        });
      }
    }
    
    // Also check for records in videos that don't exist in user history
    console.log('🔍 Checking for orphaned video records...');
    
    const videos = await Video.find({
      'watchRecords.0': { $exists: true }
    });
    
    let orphanedRecordsFound = 0;
    
    for (const video of videos) {
      for (const record of video.watchRecords) {
        if (!record.student) continue;
        
        const student = await User.findById(record.student);
        if (!student) {
          // Remove orphaned record
          video.watchRecords = video.watchRecords.filter(
            r => r.student && r.student.toString() !== record.student.toString()
          );
          orphanedRecordsFound++;
          continue;
        }
        
        // Check if this record exists in user's history
        const historyItem = student.watchHistory.find(
          item => item.video && item.video.toString() === video._id.toString()
        );
        
        if (!historyItem) {
          // Add missing history item
          student.watchHistory.push({
            video: video._id,
            timeSpent: record.timeSpent || 0,
            lastWatched: record.lastWatched,
            currentPosition: 0,
            playbackRate: 1
          });
          
          await student.save();
          totalRecordsFixed++;
        }
      }
      
      await video.save();
    }
    
    console.log('✅ Watch time synchronization completed');
    
    res.json({
      success: true,
      summary: {
        totalStudentsProcessed,
        totalDiscrepanciesFound,
        totalRecordsFixed,
        orphanedRecordsFound
      },
      syncResults: syncResults.slice(0, 10) // Return first 10 for brevity
    });
    
  } catch (err) {
    console.error('❌ Error during watch time sync:', err);
    res.status(500).json({ 
      success: false,
      message: err.message 
    });
  }
};

// Get watch time validation report
exports.getWatchTimeValidationReport = async (req, res) => {
  try {
    const { courseId } = req.query;
    
    let query = {};
    if (courseId) {
      query['watchHistory.video'] = { $exists: true };
    }
    
    const students = await User.find({
      role: 'student',
      'watchHistory.0': { $exists: true }
    }).populate('watchHistory.video');
    
    const validationResults = [];
    
    for (const student of students) {
      for (const historyItem of student.watchHistory) {
        if (!historyItem.video) continue;
        
        // Skip if filtering by course and this video isn't in that course
        if (courseId && historyItem.video.course?.toString() !== courseId) continue;
        
        const video = await Video.findById(historyItem.video._id);
        if (!video) continue;
        
        const existingRecord = video.watchRecords.find(
          record => record.student && record.student.toString() === student._id.toString()
        );
        
        const historyTime = historyItem.timeSpent || 0;
        const recordTime = existingRecord ? (existingRecord.timeSpent || 0) : 0;
        const discrepancy = Math.abs(historyTime - recordTime);
        
        if (discrepancy > 1 || !existingRecord) { // Report discrepancies > 1 second or missing records
          validationResults.push({
            studentId: student._id,
            studentName: student.name,
            videoId: video._id,
            videoTitle: video.title,
            courseId: video.course,
            timeFromHistory: historyTime,
            timeFromRecord: recordTime,
            discrepancy,
            hasMissingRecord: !existingRecord
          });
        }
      }
    }
    
    res.json({
      totalDiscrepancies: validationResults.length,
      validationResults: validationResults.sort((a, b) => b.discrepancy - a.discrepancy)
    });
    
  } catch (err) {
    console.error('Error generating validation report:', err);
    res.status(500).json({ message: err.message });
  }
};


// Per-video analytics (which students watched + duration + completion %), with filters
exports.videoAnalytics = async (req, res) => {
  try {
    const { videoId } = req.params;
    const { courseId, teacherId, date } = req.query;
    let query = { _id: videoId };
    if (courseId) query.course = courseId;
    if (teacherId) query.teacher = teacherId;
    // Optionally filter by upload date if needed
    const video = await Video.findOne(query).populate('watchRecords.student');
    if (!video) return res.status(404).json({ message: 'Video not found' });
    const duration = video.duration || 1; // Assume duration is stored, else 1 to avoid div by 0
    const records = video.watchRecords.map(r => ({
      student: r.student,
      watchtime: r.timeSpent,
      completion: Math.min(100, Math.round((r.timeSpent / duration) * 100))
    }));
    res.json({
      video: { title: video.title, _id: video._id },
      records
    });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};
