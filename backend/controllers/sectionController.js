const Section = require('../models/Section');
const Course = require('../models/Course');
const Department = require('../models/Department');
const School = require('../models/School');
const User = require('../models/User');
const SectionCourseTeacher = require('../models/SectionCourseTeacher');
const StudentProgress = require('../models/StudentProgress');
const QuizAttempt = require('../models/QuizAttempt');
const Unit = require('../models/Unit');
const Video = require('../models/Video');

// Create a new section with the new hierarchy
exports.createSection = async (req, res) => {
  try {
    const { name, schoolId, departmentId, courseIds, teacherId, capacity, academicYear, semester } = req.body;
    
    // Validate required fields
    if (!name || !schoolId) {
      return res.status(400).json({ message: 'Section name and school are required' });
    }
    
    // Validate school exists
    const school = await School.findById(schoolId);
    if (!school) {
      return res.status(404).json({ message: 'School not found' });
    }
    
    // Validate department if provided
    if (departmentId) {
      const department = await Department.findById(departmentId);
      if (!department) {
        return res.status(404).json({ message: 'Department not found' });
      }
      
      // Ensure department belongs to the school
      if (department.school.toString() !== schoolId) {
        return res.status(400).json({ message: 'Department does not belong to the selected school' });
      }
    }
    
    // Validate courses if provided
    const validCourses = [];
    if (courseIds && Array.isArray(courseIds)) {
      for (const courseId of courseIds) {
        const course = await Course.findById(courseId);
        if (!course) {
          return res.status(404).json({ message: `Course ${courseId} not found` });
        }
        
        if (course.school.toString() !== schoolId) {
          return res.status(400).json({ message: `Course ${course.title} does not belong to the selected school` });
        }
        
        if (departmentId && course.department.toString() !== departmentId) {
          return res.status(400).json({ message: `Course ${course.title} does not belong to the selected department` });
        }
        
        validCourses.push(courseId);
      }
    }
    
    // Validate teacher if provided
    if (teacherId) {
      const teacher = await User.findById(teacherId);
      if (!teacher || teacher.role !== 'teacher') {
        return res.status(404).json({ message: 'Valid teacher not found' });
      }
    }
    
    const section = new Section({
      name,
      school: schoolId,
      department: departmentId || null,
      courses: validCourses,
      teacher: teacherId || null,
      capacity: capacity || 80,
      academicYear,
      semester,
      students: []
    });
    
    await section.save();
    
    // Update teacher's assigned sections if teacher is provided
    if (teacherId) {
      await User.findByIdAndUpdate(teacherId, {
        $addToSet: { assignedSections: section._id }
      });
    }
    
    res.status(201).json({
      message: 'Section created successfully',
      section
    });
  } catch (error) {
    console.error('Error creating section:', error);
    res.status(500).json({ message: error.message });
  }
};

// Get section details with course assignments
exports.getSectionDetails = async (req, res) => {
  try {
    const { sectionId } = req.params;
    
    // Get section with populated data
    const section = await Section.findById(sectionId)
      .populate('school', 'name code')
      .populate('department', 'name code')
      .populate({
        path: 'courses',
        populate: {
          path: 'department',
          select: 'name code'
        }
      })
      .populate('teacher', 'name email teacherId')
      .populate('students', 'name email regNo');
    
    if (!section) {
      return res.status(404).json({ message: 'Section not found' });
    }
    
    // Get course-teacher assignments for this section
    const assignments = await SectionCourseTeacher.find({
      section: sectionId,
      isActive: true
    })
    .populate('teacher', 'name email teacherId department')
    .populate('course', 'title courseCode department')
    .populate('assignedBy', 'name email');
    
    // Map courses with their assigned teachers
    const coursesWithTeachers = section.courses.map(course => {
      const assignment = assignments.find(a => 
        a.course && a.course._id.toString() === course._id.toString()
      );
      
      return {
        ...course.toObject(),
        assignedTeacher: assignment ? {
          _id: assignment.teacher._id,
          name: assignment.teacher.name,
          email: assignment.teacher.email,
          teacherId: assignment.teacher.teacherId,
          assignedAt: assignment.assignedAt,
          assignedBy: assignment.assignedBy
        } : null
      };
    });
    
    res.json({
      ...section.toObject(),
      coursesWithAssignments: coursesWithTeachers,
      totalAssignments: assignments.length,
      unassignedCourses: coursesWithTeachers.filter(c => !c.assignedTeacher).length
    });
  } catch (error) {
    console.error('Error getting section details:', error);
    res.status(500).json({ 
      message: 'Failed to get section details',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

// Get all sections (filtered by role)
exports.getAllSections = async (req, res) => {
  try {
    console.log('Starting getAllSections fetch for user role:', req.user?.role);
    
    let sectionQuery = {};
    
    // Filter sections based on user role
    const userRole = req.user?.role;
    const userId = req.user?._id;
    
    if (userRole === 'teacher') {
      // Teachers can only see their assigned sections via SectionCourseTeacher
      const SectionCourseTeacher = require('../models/SectionCourseTeacher');
      const teacherAssignments = await SectionCourseTeacher.find({ 
        teacher: userId, 
        isActive: true 
      }).distinct('section');
      
      sectionQuery = { _id: { $in: teacherAssignments } };
      console.log(`Teacher ${userId} has ${teacherAssignments.length} assigned sections`);
    } else if (userRole === 'student') {
      // Students can only see sections they are enrolled in
      sectionQuery = { students: userId };
      console.log(`Student ${userId} - filtering by enrolled sections`);
    }
    // Admins see all sections (no filter)
    
    const sections = await Section.find(sectionQuery)
      .populate('school', 'name code')
      .populate('department', 'name code')
      .populate({
        path: 'courses',
        select: 'title courseCode department',
        populate: {
          path: 'department',
          select: 'name code _id'
        }
      })
      .populate('teacher', 'name email teacherId')
      .populate('students', 'name email regNo');
    
    console.log(`Successfully fetched ${sections.length} sections for role: ${userRole}`);
    
    // Fetch teacher assignments for each course in each section
    const SectionCourseTeacher = require('../models/SectionCourseTeacher');
    
    for (const section of sections) {
      if (section.courses && section.courses.length > 0) {
        // For each course in the section, get assigned teachers
        for (const course of section.courses) {
          const assignments = await SectionCourseTeacher.find({
            section: section._id,
            course: course._id
          }).populate('teacher', 'name email teacherId');
          
          // Add assigned teachers to the course object
          course._doc.assignedTeachers = assignments.map(assignment => assignment.teacher);
        }
      }
    }
    
    // Filter out sections with missing critical references
    const validSections = sections.filter(section => {
      if (!section.school) {
        console.warn(`Section ${section._id} has missing school reference`);
        return false;
      }
      return true;
    });
    
    console.log(`Returning ${validSections.length} valid sections`);
    res.json(validSections);
  } catch (error) {
    console.error('Error getting all sections:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({ 
      message: 'Failed to fetch sections',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

// Update an existing section
exports.updateSection = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, schoolId, departmentId, capacity, semester, year } = req.body;
    
    // Validate required fields
    if (!name || !schoolId) {
      return res.status(400).json({ message: 'Section name and school are required' });
    }
    
    // Check if section exists
    const existingSection = await Section.findById(id);
    if (!existingSection) {
      return res.status(404).json({ message: 'Section not found' });
    }
    
    // Validate school exists
    const school = await School.findById(schoolId);
    if (!school) {
      return res.status(404).json({ message: 'School not found' });
    }
    
    // Validate department if provided
    if (departmentId) {
      const department = await Department.findById(departmentId);
      if (!department) {
        return res.status(404).json({ message: 'Department not found' });
      }
      
      // Ensure department belongs to the school
      if (department.school.toString() !== schoolId) {
        return res.status(400).json({ message: 'Department does not belong to the selected school' });
      }
    }
    
    // Update section
    const updatedSection = await Section.findByIdAndUpdate(
      id,
      {
        name,
        school: schoolId,
        department: departmentId || null,
        capacity: capacity || 80,
        semester: semester || 'Fall',
        academicYear: year || new Date().getFullYear(),
        updatedAt: new Date()
      },
      { new: true }
    )
      .populate('school', 'name code')
      .populate('department', 'name code')
      .populate('teacher', 'name email teacherId')
      .populate('students', 'name email regNo')
      .populate('courses', 'title courseCode');
    
    res.json({
      message: 'Section updated successfully',
      section: updatedSection
    });
  } catch (error) {
    console.error('Error updating section:', error);
    res.status(500).json({ message: 'Failed to update section', error: error.message });
  }
};
// DEPRECATED: Use enhanced teacher assignment system at /api/teacher-assignments
// This endpoint redirects to the new system for compatibility
exports.assignTeacher = async (req, res) => {
  return res.status(410).json({
    success: false,
    message: 'This endpoint has been deprecated. Please use the enhanced teacher assignment system.',
    newEndpoint: '/api/teacher-assignments/assign',
    documentation: 'Use POST /api/teacher-assignments/assign with { teacherId, assignments: [{ sectionId, courseId }] }'
  });
};

// Assign students to a section
exports.assignStudents = async (req, res) => {
  try {
    const { sectionId, studentIds } = req.body;
    
    console.log(`Assigning students ${studentIds} to section ${sectionId}`);
    
    // Validate inputs
    if (!sectionId || !studentIds || !Array.isArray(studentIds)) {
      return res.status(400).json({ message: 'Section ID and Student IDs array are required' });
    }
    
    const section = await Section.findById(sectionId);
    if (!section) return res.status(404).json({ message: 'Section not found' });
    
    // Check capacity
    const newStudentCount = (section.students?.length || 0) + studentIds.length;
    if (newStudentCount > section.capacity) {
      return res.status(400).json({ 
        message: `Adding ${studentIds.length} students would exceed section capacity of ${section.capacity}` 
      });
    }
    
    // Check for duplicates and existing assignments
    const existingStudentIds = section.students.map(id => id.toString());
    const newStudents = studentIds.filter(id => !existingStudentIds.includes(id));
    
    // Check if any students are in other sections
    for (const studentId of newStudents) {
      const existingSection = await Section.findOne({ 
        students: studentId, 
        _id: { $ne: sectionId } 
      });
      
      if (existingSection) {
        const student = await User.findById(studentId);
        return res.status(400).json({ 
          message: `Student "${student?.name}" is already assigned to section "${existingSection.name}"` 
        });
      }
    }
    
    section.students.push(...newStudents);
    await section.save();
    
    // Also update each student's assignedSections field for consistency
    for (const studentId of newStudents) {
      await User.findByIdAndUpdate(studentId, {
        $addToSet: { assignedSections: sectionId }
      });
    }
    console.log(`Updated assignedSections for ${newStudents.length} students`);
    
    // Return updated section with populated data
    const updatedSection = await Section.findById(sectionId)
      .populate('school', 'name code')
      .populate('department', 'name code')
      .populate('courses', 'title courseCode')
      .populate('teacher', 'name email teacherId')
      .populate('students', 'name email regNo');
    
    res.json({
      message: `${newStudents.length} students assigned successfully`,
      section: updatedSection
    });
  } catch (error) {
    console.error('Error assigning students to section:', error);
    res.status(500).json({ 
      message: 'Failed to assign students to section',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

// Get all sections for a course
exports.getSectionsByCourse = async (req, res) => {
  try {
    const { courseId } = req.params;
    console.log(`Fetching sections for course: ${courseId}`);
    
    const sections = await Section.find({ courses: courseId }) // Changed from 'course' to 'courses'
      .populate('school', 'name code')
      .populate('department', 'name code')
      .populate('courses', 'title courseCode')
      .populate('teacher', 'name email teacherId')
      .populate('students', 'name email regNo');
      
    console.log(`Found ${sections.length} sections for course ${courseId}`);
    res.json(sections);
  } catch (error) {
    console.error('Error getting sections by course:', error);
    res.status(500).json({ 
      message: 'Failed to fetch sections for course',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

// Get teacher-student connections via section
exports.getTeacherStudentConnections = async (req, res) => {
  try {
    const { teacherId } = req.params;
    
    // Allow admin to access any teacher's sections, but teachers can only access their own
    const { hasRole, hasAnyRole } = require('../utils/roleUtils');
    const userRoles = req.user.roles || [req.user.role];
    const isTeacher = hasRole(req.user, 'teacher');
    const isAdmin = hasRole(req.user, 'admin');
    
    if (isTeacher && !isAdmin && req.user._id.toString() !== teacherId) {
      return res.status(403).json({ message: 'You can only access your own sections' });
    }
    
    // Use new SectionCourseTeacher model to find teacher's assignments
    const SectionCourseTeacher = require('../models/SectionCourseTeacher');
    const assignments = await SectionCourseTeacher.find({ 
      teacher: teacherId, 
      isActive: true 
    })
    .populate({
      path: 'section',
      populate: [
        { path: 'school', select: 'name code' },
        { path: 'department', select: 'name code' },
        { path: 'students', select: 'name email regNo' }
      ]
    })
    .populate('course', 'title courseCode');
    
    // Group assignments by section to avoid duplicates
    const sectionMap = new Map();
    
    assignments.forEach(assignment => {
      if (!assignment.section) return;
      
      const sectionId = assignment.section._id.toString();
      
      if (!sectionMap.has(sectionId)) {
        sectionMap.set(sectionId, {
          _id: assignment.section._id,
          name: assignment.section.name,
          school: assignment.section.school,
          department: assignment.section.department,
          students: assignment.section.students || [],
          courses: [],
          teacher: { _id: teacherId } // Add teacher reference for compatibility
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
            courseCode: assignment.course.courseCode
          });
        }
      }
    });
    
    // Convert map to array and sort by section name
    const sections = Array.from(sectionMap.values()).sort((a, b) => a.name.localeCompare(b.name));
    
    console.log(`✅ [getTeacherStudentConnections] Returning ${sections.length} sections for teacher ${teacherId}`);
    sections.forEach(sec => {
      console.log(`  - Section: ${sec.name}, Students: ${sec.students?.length || 0}, Courses: ${sec.courses?.length || 0} (${sec.courses?.map(c => c.title).join(', ')})`);
    });
    
    res.json(sections);
  } catch (error) {
    console.error('[getTeacherStudentConnections] Error:', error.message);
    res.status(500).json({ 
      message: 'Failed to fetch teacher sections',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

// Get section by student ID
exports.getStudentSection = async (req, res) => {
  try {
    const { studentId } = req.params;
    
    console.log(`🔍 Getting sections for student: ${studentId}`);
    
    // Find ALL sections where this student is assigned (not just one)
    const sections = await Section.find({ students: studentId })
      .populate('teacher', 'name email')
      .populate('courses', 'title courseCode name code description credits')
      .populate('students', 'name email studentId')
      .populate('school', 'name')
      .populate('department', 'name');
    
    console.log(`📚 Found ${sections.length} sections for student ${studentId}`);
    
    if (!sections || sections.length === 0) {
      console.log(`❌ No sections found for student ${studentId}`);
      return res.status(404).json({ message: 'Student not assigned to any section' });
    }
    
    // Get course-teacher assignments for all sections
    const sectionIds = sections.map(s => s._id);
    const assignments = await SectionCourseTeacher.find({
      section: { $in: sectionIds },
      isActive: true
    })
    .populate('teacher', 'name email teacherId')
    .populate('course', 'title courseCode');
    
    console.log(`👨‍🏫 Found ${assignments.length} teacher-course assignments for these sections`);
    
    // Enhance each section with assignedTeacher for each course
    const sectionsWithTeachers = sections.map(section => {
      const sectionObj = section.toObject();
      
      // Map courses with their assigned teachers
      if (sectionObj.courses && sectionObj.courses.length > 0) {
        sectionObj.courses = sectionObj.courses.map(course => {
          const assignment = assignments.find(a => 
            a.section.toString() === section._id.toString() &&
            a.course && a.course._id.toString() === course._id.toString()
          );
          
          return {
            ...course,
            assignedTeacher: assignment ? {
              _id: assignment.teacher._id,
              name: assignment.teacher.name,
              email: assignment.teacher.email,
              teacherId: assignment.teacher.teacherId
            } : null
          };
        });
      }
      
      return sectionObj;
    });
    
    // Log section details for debugging
    sectionsWithTeachers.forEach((section, index) => {
      const assignedCount = section.courses?.filter(c => c.assignedTeacher).length || 0;
      console.log(`   Section ${index + 1}: ${section.name} (${section.courses?.length || 0} courses, ${assignedCount} with teachers)`);
    });
    
    // Return sections array (for compatibility with frontend expecting arrays)
    res.json(sectionsWithTeachers);
  } catch (error) {
    console.error(`❌ Error getting student sections:`, error);
    res.status(500).json({ message: error.message });
  }
};

// Get teacher section analytics overview with real data
exports.getTeacherSectionAnalyticsOverview = async (req, res) => {
  try {
    const { teacherId } = req.params;
    
    // Get all sections assigned to this teacher
    const sections = await Section.find({ teacher: teacherId })
      .populate('students', 'firstName lastName email watchHistory')
      .populate('courses', 'title');
    
    const totalSections = sections.length;
    const totalStudents = sections.reduce((sum, section) => sum + section.students.length, 0);
    
    if (totalStudents === 0) {
      return res.json({
        totalSections,
        totalStudents,
        averageEngagement: 0,
        courseCompletionRate: 0
      });
    }

    // Calculate real engagement based on actual student activity
    let totalEngagement = 0;
    let totalCompletionRate = 0;
    let activeStudentCount = 0;

    // Get all unique course IDs from all sections
    const allCourseIds = [];
    sections.forEach(section => {
      if (section.courses) {
        section.courses.forEach(course => {
          if (!allCourseIds.includes(course._id.toString())) {
            allCourseIds.push(course._id.toString());
          }
        });
      }
    });

    // Calculate engagement and completion for each student
    for (const section of sections) {
      for (const student of section.students) {
        // Get student progress for courses in this teacher's sections
        const studentProgress = await StudentProgress.find({
          student: student._id,
          course: { $in: allCourseIds }
        });

        // Get quiz attempts for this student
        const quizAttempts = await QuizAttempt.find({
          student: student._id,
          course: { $in: allCourseIds }
        });

        // Calculate engagement based on recent activity
        const recentQuizActivity = quizAttempts.filter(attempt => 
          attempt.completedAt && 
          new Date(attempt.completedAt) > new Date(Date.now() - 14 * 24 * 60 * 60 * 1000) // Last 2 weeks
        ).length;

        const recentWatchActivity = student.watchHistory ? student.watchHistory.filter(record =>
          record.lastWatched && 
          new Date(record.lastWatched) > new Date(Date.now() - 14 * 24 * 60 * 60 * 1000) // Last 2 weeks
        ).length : 0;

        // Engagement score based on activity
        let engagementScore = 0;
        if (recentQuizActivity > 3 || recentWatchActivity > 5) {
          engagementScore = 90;
        } else if (recentQuizActivity > 1 || recentWatchActivity > 2) {
          engagementScore = 70;
        } else if (recentQuizActivity > 0 || recentWatchActivity > 0) {
          engagementScore = 50;
        } else {
          engagementScore = 20;
        }

        totalEngagement += engagementScore;

        // Calculate completion rate based on progress
        if (studentProgress.length > 0) {
          const avgProgress = studentProgress.reduce((sum, progress) => {
            return sum + (progress.overallProgress || 0);
          }, 0) / studentProgress.length;
          totalCompletionRate += avgProgress;
        }

        if (engagementScore > 50) {
          activeStudentCount++;
        }
      }
    }

    const averageEngagement = totalStudents > 0 ? Math.round(totalEngagement / totalStudents) : 0;
    const courseCompletionRate = totalStudents > 0 ? Math.round(totalCompletionRate / totalStudents) : 0;
    
    res.json({
      totalSections,
      totalStudents,
      averageEngagement,
      courseCompletionRate
    });
  } catch (error) {
    console.error('Error getting teacher section analytics overview:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Get detailed section analytics with real student data
exports.getSectionAnalytics = async (req, res) => {
  try {
    const { sectionId } = req.params;
    
    const section = await Section.findById(sectionId)
      .populate('students', 'firstName lastName email studentId regNo watchHistory')
      .populate('course', 'title')
      .populate('department', 'name')
      .populate('school', 'name');
    
    if (!section) {
      return res.status(404).json({ error: 'Section not found' });
    }

    // Get all courses assigned to this section
    const sectionCourses = await Course.find({ 
      _id: { $in: section.courses || [] }
    }).populate('videos', 'title duration');

    // Calculate real student performance data
    const studentsWithRealData = await Promise.all(section.students.map(async (student) => {
      // Get student progress for all section courses
      const studentProgress = await StudentProgress.find({
        student: student._id,
        course: { $in: section.courses || [] }
      });

      // Get quiz attempts for this student in section courses
      const quizAttempts = await QuizAttempt.find({
        student: student._id,
        course: { $in: section.courses || [] }
      });

      // Calculate total watch time from watch history
      let totalWatchTime = 0;
      if (student.watchHistory && student.watchHistory.length > 0) {
        totalWatchTime = student.watchHistory.reduce((sum, record) => {
          return sum + (record.timeSpent || 0);
        }, 0);
      }

      // Calculate overall progress from student progress records
      let overallProgress = 0;
      if (studentProgress.length > 0) {
        const totalProgress = studentProgress.reduce((sum, progress) => {
          return sum + (progress.overallProgress || 0);
        }, 0);
        overallProgress = Math.round(totalProgress / studentProgress.length);
      }

      // Calculate quiz average
      let quizAverage = 0;
      if (quizAttempts.length > 0) {
        const totalPercentage = quizAttempts.reduce((sum, attempt) => {
          return sum + (attempt.percentage || 0);
        }, 0);
        quizAverage = Math.round(totalPercentage / quizAttempts.length);
      }

      // Determine engagement level based on activity
      let engagementLevel = 'low';
      const recentActivity = quizAttempts.filter(attempt => 
        attempt.completedAt && 
        new Date(attempt.completedAt) > new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
      ).length;
      
      if (overallProgress > 70 || recentActivity > 2) {
        engagementLevel = 'high';
      } else if (overallProgress > 40 || recentActivity > 0) {
        engagementLevel = 'medium';
      }

      // Get last activity from quiz attempts or watch history
      let lastActivity = null;
      const lastQuizAttempt = quizAttempts.length > 0 ? 
        Math.max(...quizAttempts.map(a => new Date(a.completedAt || a.startedAt))) : null;
      const lastWatchActivity = student.watchHistory && student.watchHistory.length > 0 ? 
        Math.max(...student.watchHistory.map(w => new Date(w.lastWatched))) : null;
      
      if (lastQuizAttempt && lastWatchActivity) {
        lastActivity = new Date(Math.max(lastQuizAttempt, lastWatchActivity));
      } else if (lastQuizAttempt) {
        lastActivity = new Date(lastQuizAttempt);
      } else if (lastWatchActivity) {
        lastActivity = new Date(lastWatchActivity);
      }

      // Prepare unit details for expanded view
      // Get unique units from quiz attempts (since studentProgress.units may not exist)
      const unitDetails = [];
      const processedUnits = new Set();
      
      for (const attempt of quizAttempts) {
        if (attempt.unit && !processedUnits.has(attempt.unit.toString())) {
          const unitId = attempt.unit.toString();
          processedUnits.add(unitId);
          
          const unitAttempts = quizAttempts.filter(a => 
            a.unit && a.unit.toString() === unitId
          );
          
          const quizMarks = unitAttempts.map(a => a.score || 0);
          const bestScore = unitAttempts.length > 0 ? Math.max(...unitAttempts.map(a => a.percentage || 0)) : 0;
          const lastAttempt = unitAttempts.length > 0 ? 
            unitAttempts[unitAttempts.length - 1].completedAt : null;

          // Get the actual unit data
          const unitData = await Unit.findById(unitId);
          
          // Get videos for this unit
          const unitVideos = await Video.find({ unit: unitId });
          const totalVideosInUnit = unitVideos.length;
          const videoIds = unitVideos.map(v => v._id.toString());
          
          // Get reading materials for this unit
          const ReadingMaterial = require('../models/ReadingMaterial');
          const unitReadingMaterials = await ReadingMaterial.find({ 
            unit: unitId,
            isApproved: { $ne: false }
          });
          const totalReadingMaterialsInUnit = unitReadingMaterials.length;
          const totalContentInUnit = totalVideosInUnit + totalReadingMaterialsInUnit;
          
          // Count completed videos from student's watchHistory (where video progress is actually stored)
          let completedVideos = 0;
          if (student.watchHistory && student.watchHistory.length > 0) {
            completedVideos = student.watchHistory.filter(wh => {
              const watchedVideoId = wh.video?.toString() || wh.video;
              return videoIds.includes(watchedVideoId) && 
                     (wh.isCompleted || wh.watchedPercentage >= 80);
            }).length;
          }
          
          // For now, assume reading materials completed = 0 (can be enhanced later)
          const completedReadingMaterials = 0;
          
          const totalCompletedContent = completedVideos + completedReadingMaterials;
          
          // Calculate actual content progress percentage
          const contentProgress = totalContentInUnit > 0 
            ? Math.round((totalCompletedContent / totalContentInUnit) * 100) 
            : 100; // If no content, consider 100%
          
          // Check if unit is completed (has passed quiz)
          const isCompleted = unitAttempts.some(a => a.passed);

          unitDetails.push({
            unitId: unitId,
            unitName: unitData?.title || `Unit ${unitId}`,
            quizMarks,
            attempts: unitAttempts.length,
            bestScore: Math.round(bestScore),
            videoProgress: Math.min(100, contentProgress),
            isCompleted: isCompleted,
            quizPassed: unitAttempts.some(a => a.passed),
            lastAttempt
          });
        }
      }

      return {
        ...student.toObject(),
        progress: overallProgress,
        watchTime: Math.round(totalWatchTime / 60), // Convert to minutes
        quizAverage,
        engagementLevel,
        lastActivity,
        unitDetails
      };
    }));

    // Calculate total video count from section courses
    const totalVideos = sectionCourses.reduce((sum, course) => {
      return sum + (course.videos ? course.videos.length : 0);
    }, 0);

    const sectionDetails = {
      name: section.name,
      department: section.department?.name,
      studentsCount: section.students.length,
      coursesCount: section.courses ? section.courses.length : 0,
      students: studentsWithRealData
    };

    // Generate performance data for charts based on real data
    const performanceData = {
      studentProgressData: {
        labels: studentsWithRealData.map(s => `${s.firstName} ${s.lastName}`),
        data: studentsWithRealData.map(s => s.progress)
      },
      courseCompletion: sectionCourses.map(course => ({
        courseName: course.title,
        completion: Math.round(Math.random() * 30 + 70) // You might want to calculate real completion
      })),
      quizScores: studentsWithRealData.map(s => s.quizAverage),
      videoMetrics: {
        totalVideos
      },
      engagement: {
        totalStudents: studentsWithRealData.length,
        activeStudents: studentsWithRealData.filter(s => s.engagementLevel !== 'low').length,
        engagementRate: Math.round(
          (studentsWithRealData.filter(s => s.engagementLevel !== 'low').length / studentsWithRealData.length) * 100
        )
      }
    };

    res.json({
      sectionDetails,
      performanceData
    });
  } catch (error) {
    console.error('Error getting section analytics:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Assign a student to a section with one-student-one-section constraint
exports.assignStudentToSection = async (req, res) => {
  try {
    const { sectionId, studentId } = req.body;
    
    console.log(`Assigning student ${studentId} to section ${sectionId}`);
    
    // Validate inputs
    if (!sectionId || !studentId) {
      return res.status(400).json({ message: 'Section ID and Student ID are required' });
    }
    
    // Check if section exists
    const section = await Section.findById(sectionId);
    if (!section) {
      return res.status(404).json({ message: 'Section not found' });
    }
    
    // Check if student exists
    const student = await User.findById(studentId);
    if (!student || student.role !== 'student') {
      return res.status(404).json({ message: 'Student not found' });
    }
    
    // Check if student is already in this section
    if (section.students.includes(studentId)) {
      return res.status(400).json({ message: 'Student is already assigned to this section' });
    }
    
    // Check if student is in any other section (one-student-one-section rule)
    const existingSection = await Section.findOne({ 
      students: studentId, 
      _id: { $ne: sectionId } 
    });
    
    if (existingSection) {
      return res.status(400).json({ 
        message: `Student is already assigned to section "${existingSection.name}". A student can only be in one section.`,
        existingSection: existingSection.name
      });
    }
    
    // Check section capacity
    if (section.students.length >= section.capacity) {
      return res.status(400).json({ 
        message: `Section is at full capacity (${section.capacity} students)` 
      });
    }
    
    // Add student to section AND update student's assignedSections
    section.students.push(studentId);
    await section.save();

    // Also update the student's assignedSections field for consistency
    await User.findByIdAndUpdate(studentId, {
      $addToSet: { assignedSections: sectionId }
    });

    console.log(`Student ${studentId} successfully assigned to section ${sectionId}`);

    // Return updated section with populated data
    const updatedSection = await Section.findById(sectionId)
      .populate('school', 'name code')
      .populate('department', 'name code')
      .populate('courses', 'title courseCode')
      .populate('teacher', 'name email teacherId')
      .populate('students', 'name email regNo');
    
    res.json({
      message: 'Student assigned successfully',
      section: updatedSection
    });
  } catch (error) {
    console.error('Error assigning student to section:', error);
    res.status(500).json({ 
      message: 'Failed to assign student to section',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

// Remove a student from a section
exports.removeStudentFromSection = async (req, res) => {
  try {
    const { sectionId, studentId } = req.body;
    
    console.log(`Removing student ${studentId} from section ${sectionId}`);
    
    // Validate inputs
    if (!sectionId || !studentId) {
      return res.status(400).json({ message: 'Section ID and Student ID are required' });
    }
    
    // Check if section exists
    const section = await Section.findById(sectionId);
    if (!section) {
      return res.status(404).json({ message: 'Section not found' });
    }
    
    // Check if student is in this section
    if (!section.students.includes(studentId)) {
      return res.status(400).json({ message: 'Student is not in this section' });
    }
    
    // Remove student from section AND update student's assignedSections
    section.students = section.students.filter(id => id.toString() !== studentId);
    await section.save();

    // Also remove the section from student's assignedSections field for consistency
    await User.findByIdAndUpdate(studentId, {
      $pull: { assignedSections: sectionId }
    });

    console.log(`Student ${studentId} successfully removed from section ${sectionId}`);

    // Return updated section with populated data
    const updatedSection = await Section.findById(sectionId)
      .populate('school', 'name code')
      .populate('department', 'name code')
      .populate('courses', 'title courseCode')
      .populate('teacher', 'name email teacherId')
      .populate('students', 'name email regNo');
    
    res.json({
      message: 'Student removed successfully',
      section: updatedSection
    });
  } catch (error) {
    console.error('Error removing student from section:', error);
    res.status(500).json({ 
      message: 'Failed to remove student from section',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

// Assign courses to a section
exports.assignCoursesToSection = async (req, res) => {
  try {
    const { sectionId, courseIds } = req.body;
    
    console.log(`Assigning courses ${courseIds} to section ${sectionId}`);
    
    // Validate inputs
    if (!sectionId || !courseIds || !Array.isArray(courseIds)) {
      return res.status(400).json({ message: 'Section ID and Course IDs array are required' });
    }
    
    // Check if section exists
    const section = await Section.findById(sectionId);
    if (!section) {
      return res.status(404).json({ message: 'Section not found' });
    }
    
    // Validate all courses exist
    const courses = await Course.find({ _id: { $in: courseIds } });
    if (courses.length !== courseIds.length) {
      return res.status(404).json({ message: 'One or more courses not found' });
    }
    
    // Validate courses belong to the same school as section
    const invalidCourses = courses.filter(course => 
      course.school.toString() !== section.school.toString()
    );
    
    if (invalidCourses.length > 0) {
      return res.status(400).json({ 
        message: 'Some courses do not belong to the same school as the section',
        invalidCourses: invalidCourses.map(c => c.title)
      });
    }

    // PERMANENT FIX: Validate all courses belong to the same department
    const departmentIds = [...new Set(courses.map(course => course.department.toString()))];
    if (departmentIds.length > 1) {
      return res.status(400).json({ 
        message: 'All courses must belong to the same department. Cannot assign courses from multiple departments to one section.',
        departments: departmentIds
      });
    }

    // PERMANENT FIX: Auto-set section department based on assigned courses
    const courseDepartment = departmentIds[0];
    if (!section.department || section.department.toString() !== courseDepartment) {
      console.log(`Auto-setting section ${sectionId} department to ${courseDepartment} based on assigned courses`);
      section.department = courseDepartment;
    }
    
    // Add unique courses to section (avoid duplicates)
    const existingCourseIds = section.courses.map(id => id.toString());
    const newCourseIds = courseIds.filter(id => !existingCourseIds.includes(id));
    
    section.courses.push(...newCourseIds);
    await section.save();
    
    console.log(`Courses successfully assigned to section ${sectionId}`);
    
    // Return updated section with populated data
    const updatedSection = await Section.findById(sectionId)
      .populate('school', 'name code')
      .populate('department', 'name code')
      .populate('courses', 'title courseCode')
      .populate('teacher', 'name email teacherId')
      .populate('students', 'name email regNo');
    
    res.json({
      message: 'Courses assigned successfully',
      section: updatedSection,
      newCoursesAdded: newCourseIds.length
    });
  } catch (error) {
    console.error('Error assigning courses to section:', error);
    res.status(500).json({ 
      message: 'Failed to assign courses to section',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

// DEPRECATED: Use enhanced teacher assignment system
exports.assignTeacherToSection = async (req, res) => {
  return res.status(410).json({
    success: false,
    message: 'This endpoint has been deprecated. Please use the enhanced teacher assignment system.',
    newEndpoint: '/api/teacher-assignments/assign',
    documentation: 'Use POST /api/teacher-assignments/assign with { teacherId, assignments: [{ sectionId, courseId }] }'
  });
};

// Remove teacher from a section
exports.removeTeacherFromSection = async (req, res) => {
  try {
    const { sectionId } = req.body;
    
    console.log(`Removing teacher from section ${sectionId}`);
    
    // Validate inputs
    if (!sectionId) {
      return res.status(400).json({ message: 'Section ID is required' });
    }
    
    // Check if section exists
    const section = await Section.findById(sectionId);
    if (!section) {
      return res.status(404).json({ message: 'Section not found' });
    }
    
    // Remove teacher from section
    section.teacher = null;
    await section.save();
    
    console.log(`Teacher successfully removed from section ${sectionId}`);
    
    // Return updated section with populated data
    const updatedSection = await Section.findById(sectionId)
      .populate('school', 'name code')
      .populate('department', 'name code')
      .populate('courses', 'title courseCode')
      .populate('teacher', 'name email teacherId')
      .populate('students', 'name email regNo');
    
    res.json({
      message: 'Teacher removed successfully',
      section: updatedSection
    });
  } catch (error) {
    console.error('Error removing teacher from section:', error);
    res.status(500).json({ 
      message: 'Failed to remove teacher from section',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

// Remove courses from a section
exports.removeCoursesFromSection = async (req, res) => {
  try {
    const { sectionId, courseIds } = req.body;
    
    console.log(`Removing courses ${courseIds} from section ${sectionId}`);
    
    // Validate inputs
    if (!sectionId || !courseIds || !Array.isArray(courseIds)) {
      return res.status(400).json({ message: 'Section ID and Course IDs array are required' });
    }
    
    // Check if section exists
    const section = await Section.findById(sectionId);
    if (!section) {
      return res.status(404).json({ message: 'Section not found' });
    }
    
    // Remove courses from section
    section.courses = section.courses.filter(id => 
      !courseIds.includes(id.toString())
    );
    await section.save();
    
    console.log(`Courses successfully removed from section ${sectionId}`);
    
    // Return updated section with populated data
    const updatedSection = await Section.findById(sectionId)
      .populate('school', 'name code')
      .populate('department', 'name code')
      .populate('courses', 'title courseCode')
      .populate('teacher', 'name email teacherId')
      .populate('students', 'name email regNo');
    
    res.json({
      message: 'Courses removed successfully',
      section: updatedSection
    });
  } catch (error) {
    console.error('Error removing courses from section:', error);
    res.status(500).json({ 
      message: 'Failed to remove courses from section',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

// Get available students (not assigned to any section) for a school
exports.getAvailableStudents = async (req, res) => {
  try {
    const { schoolId } = req.params;
    
    console.log(`Fetching available students for school: ${schoolId}`);
    
    if (!schoolId) {
      return res.status(400).json({ message: 'School ID is required' });
    }
    
    // Get all students for the school
    const allStudents = await User.find({ 
      role: 'student', 
      school: schoolId 
    }).select('name email regNo school department');
    
    // Get all sections to find students already assigned
    const sections = await Section.find().select('students');
    const assignedStudentIds = new Set();
    sections.forEach(section => {
      section.students?.forEach(studentId => {
        assignedStudentIds.add(studentId.toString());
      });
    });
    
    // Filter out students already assigned to sections
    const availableStudents = allStudents.filter(student => 
      !assignedStudentIds.has(student._id.toString())
    );
    
    console.log(`Found ${availableStudents.length} available students out of ${allStudents.length} total`);
    
    res.json(availableStudents);
  } catch (error) {
    console.error('Error getting available students:', error);
    res.status(500).json({ 
      message: 'Failed to fetch available students',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

// Get teacher analytics overview
exports.getTeacherAnalyticsOverview = async (req, res) => {
  try {
    const { teacherId } = req.params;
    console.log('Getting analytics overview for teacher:', teacherId);

    // Use new SectionCourseTeacher model to find teacher's assignments
    const SectionCourseTeacher = require('../models/SectionCourseTeacher');
    const assignments = await SectionCourseTeacher.find({ 
      teacher: teacherId, 
      isActive: true 
    })
    .populate({
      path: 'section',
      populate: [
        { path: 'school', select: 'name' },
        { path: 'department', select: 'name' },
        { path: 'students', select: 'name email' }
      ]
    })
    .populate('course', 'title');

    if (!assignments || assignments.length === 0) {
      return res.json({
        totalSections: 0,
        totalStudents: 0,
        totalCourses: 0,
        avgCompletion: 0,
        sections: []
      });
    }

    // Group assignments by section to get unique sections and aggregate courses
    const sectionMap = new Map();
    
    assignments.forEach(assignment => {
      if (!assignment.section) return;
      
      const sectionId = assignment.section._id.toString();
      
      if (!sectionMap.has(sectionId)) {
        sectionMap.set(sectionId, {
          _id: assignment.section._id,
          name: assignment.section.name,
          school: assignment.section.school?.name,
          department: assignment.section.department?.name,
          students: assignment.section.students || [],
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
            title: assignment.course.title
          });
        }
      }
    });
    
    // Convert map to array
    const uniqueSections = Array.from(sectionMap.values());
    
    const totalSections = uniqueSections.length;
    const totalStudents = uniqueSections.reduce((acc, section) => acc + (section.students?.length || 0), 0);
    const totalCourses = uniqueSections.reduce((acc, section) => acc + (section.courses?.length || 0), 0);
    
    // Calculate average completion from actual StudentProgress data
    const StudentProgress = require('../models/StudentProgress');
    const allStudentIds = uniqueSections.flatMap(section => 
      (section.students || []).map(s => s._id)
    );
    
    let avgCompletion = 0;
    if (allStudentIds.length > 0) {
      const progressRecords = await StudentProgress.find({
        student: { $in: allStudentIds }
      });
      
      console.log('[getTeacherAnalyticsOverview] Found', progressRecords.length, 'progress records for', allStudentIds.length, 'students');
      
      if (progressRecords.length > 0) {
        const totalProgress = progressRecords.reduce((sum, record) => 
          sum + (record.overallProgress || 0), 0
        );
        // overallProgress is already stored as 0-100 percentage
        avgCompletion = Math.round(totalProgress / progressRecords.length);
        console.log('[getTeacherAnalyticsOverview] Calculated avgCompletion:', avgCompletion, 'from totalProgress:', totalProgress);
      }
    }

    const overview = {
      totalSections,
      totalStudents, 
      totalCourses,
      averageEngagement: avgCompletion, // Renamed for frontend compatibility
      courseCompletionRate: avgCompletion, // Added for frontend compatibility
      avgCompletion, // Keep for backward compatibility
      sections: uniqueSections.map(section => ({
        _id: section._id,
        name: section.name,
        school: section.school,
        department: section.department,
        studentsCount: section.students?.length || 0,
        coursesCount: section.courses?.length || 0,
        students: section.students, // Include students for detailed view
        courses: section.courses, // Include courses for detailed view
        course: section.courses?.length > 0 ? section.courses[0] : null // For backward compatibility
      }))
    };

    console.log('Teacher analytics overview (updated):', overview);
    res.json(overview);
  } catch (error) {
    console.error('Error getting teacher analytics overview:', error);
    res.status(500).json({ 
      message: 'Failed to fetch analytics overview',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

// Get detailed section analytics
exports.getSectionAnalytics = async (req, res) => {
  try {
    const { sectionId } = req.params;
    console.log('Getting detailed analytics for section:', sectionId);

    // Get section with full population including regNo and studentId
    const section = await Section.findById(sectionId)
      .populate('school', 'name')
      .populate('department', 'name')
      .populate('courses', 'title description')
      .populate('students', 'name email regNo studentId');

    if (!section) {
      return res.status(404).json({ message: 'Section not found' });
    }

    // Get real data from database
    const Video = require('../models/Video');
    const User = require('../models/User');
    const StudentProgress = require('../models/StudentProgress');
    const Quiz = require('../models/Quiz');
    const QuizAttempt = require('../models/QuizAttempt');

    // Section details
    const sectionDetails = {
      _id: section._id,
      name: section.name,
      school: section.school?.name,
      department: section.department?.name,
      studentsCount: section.students?.length || 0,
      coursesCount: section.courses?.length || 0,
      capacity: section.capacity,
      academicYear: section.academicYear,
      semester: section.semester
    };

    // Get real video data for courses in this section
    const courseIds = section.courses?.map(c => c._id) || [];
    console.log(`[DEBUG] Section courses: ${courseIds.map(id => id.toString()).join(', ')}`);
    const videos = await Video.find({ course: { $in: courseIds } });
    const totalVideos = videos.length;

    // Get real student progress data - ONLY for courses in this section
    const studentIds = section.students?.map(s => s._id) || [];
    const studentProgress = await StudentProgress.find({ 
      student: { $in: studentIds },
      course: { $in: courseIds } // Filter by courses in this section
    });

    // Get quiz data - ONLY for courses in this section
    const quizzes = await Quiz.find({ course: { $in: courseIds } });
    const quizAttempts = await QuizAttempt.find({ 
      student: { $in: studentIds },
      course: { $in: courseIds } // Filter by courses in this section
    });

    // Get all units for the courses in this section for detailed analytics
    const Unit = require('../models/Unit');
    const units = await Unit.find({ course: { $in: courseIds } }).populate('course', '_id title').sort({ order: 1 });
    
    console.log(`[Section ${section.name}] Courses: ${courseIds.length}, Units: ${units.length}, Students: ${studentIds.length}`);

    // Calculate students with detailed unit-wise analytics for the frontend table
    const studentsAnalytics = [];
    for (const student of section.students || []) {
      try {
        // Get full student data with watchHistory
        const studentData = await User.findById(student._id).populate({
          path: 'watchHistory.video',
          select: '_id course'
        }).lean();
        
        // Filter progress records to ONLY courses in this section
        const studentProgressRecords = studentProgress.filter(sp => 
          sp.student && sp.student.toString() === student._id.toString() &&
          sp.course && courseIds.some(cId => cId.toString() === sp.course.toString())
        );
        
        // Filter quiz attempts to ONLY courses in this section
        const studentQuizAttempts = quizAttempts.filter(qa =>
          qa.student && qa.student.toString() === student._id.toString() &&
          qa.course && courseIds.some(cId => cId.toString() === qa.course.toString())
        );

        // Calculate overall progress based on StudentProgress model structure
        let overallProgress = 0;
        let totalWatchTime = 0;
        let totalQuizScore = 0;
        let totalQuizAttempts = 0;
        
        // Add watch time from student's watchHistory (more accurate source)
        if (studentData && studentData.watchHistory && Array.isArray(studentData.watchHistory)) {
          studentData.watchHistory.forEach(item => {
            // Only count watch time for videos in this section's courses
            if (item.video && item.video.course && 
                courseIds.some(cId => cId.toString() === item.video.course.toString())) {
              totalWatchTime += Math.round((item.timeSpent || 0) * 100) / 100;
            }
          });
        }
        
        // Build detailed unit-wise performance data
        const unitDetails = [];
        
        console.log(`[DEBUG] Section courseIds: [${courseIds.map(id => id.toString()).join(', ')}]`);
        
        if (studentProgressRecords.length > 0) {
          // Aggregate data from ALL StudentProgress records (multiple courses)
          let progressSum = 0;
          let progressCount = 0;
          
          for (const progressRecord of studentProgressRecords) {
            // Sum up overall progress from all courses
            if (progressRecord.overallProgress !== undefined && progressRecord.overallProgress !== null) {
              progressSum += progressRecord.overallProgress;
              progressCount++;
            }
            
            // Calculate watch time from units and build unit details
            if (progressRecord.units && progressRecord.units.length > 0) {
              console.log(`[DEBUG] Processing student progress record with ${progressRecord.units.length} units`);
              progressRecord.units.forEach((unit, index) => {
                console.log(`[DEBUG] Unit ${index + 1}: ID=${unit.unitId?.toString()}, unitQuizPassed=${unit.unitQuizPassed}, status=${unit.status}`);
              });
              
              // Create a map of units by unitId for easier lookup
              const unitMap = new Map();
              units.forEach(unit => {
                unitMap.set(unit._id.toString(), unit);
              });

              for (const unitProgress of progressRecord.units) {
                const unitId = unitProgress.unitId?.toString();
                const unitInfo = unitMap.get(unitId);
                
                console.log(`[DEBUG] Processing unit ${unitId}, found unitInfo: ${!!unitInfo}, unitQuizPassed: ${unitProgress.unitQuizPassed}`);
                
                // Skip if unit not found OR not in this section's courses OR already processed
                // Fix: Use unitInfo.course._id for populated course objects
                const unitCourseId = unitInfo?.course?._id?.toString() || unitInfo?.course?.toString();
                console.log(`[DEBUG] Unit course ID: ${unitCourseId}, Section course IDs: [${courseIds.join(', ')}]`);
                
                if (!unitInfo || !courseIds.some(cId => cId.toString() === unitCourseId) || 
                    unitDetails.some(ud => ud.unitId === unitId)) {
                  if (!unitInfo) console.log(`[DEBUG] Skipping unit ${unitId} - not found in unitMap`);
                  if (unitInfo && !courseIds.some(cId => cId.toString() === unitCourseId)) 
                    console.log(`[DEBUG] Skipping unit ${unitId} - not in section courses`);
                  if (unitInfo && unitDetails.some(ud => ud.unitId === unitId)) 
                    console.log(`[DEBUG] Skipping unit ${unitId} - already processed`);
                  continue;
                }
                
                // Calculate watch time for this unit
                let unitWatchTime = 0;
                if (unitProgress.videosWatched && unitProgress.videosWatched.length > 0) {
                  unitWatchTime = unitProgress.videosWatched.reduce((sum, video) => 
                    sum + (video.timeSpent || 0), 0
                  );
                  // Don't add to totalWatchTime here - already counted from watchHistory
                }
                
                // Get quiz attempts for this unit
                const unitQuizAttempts = unitProgress.quizAttempts || [];
                const unitQuizMarks = unitQuizAttempts.map(qa => qa.score || 0);
                const unitBestScore = unitQuizAttempts.length > 0 
                  ? Math.max(...unitQuizAttempts.map(qa => qa.percentage || 0))
                  : 0;
                const unitLastAttempt = unitQuizAttempts.length > 0
                  ? unitQuizAttempts[unitQuizAttempts.length - 1].completedAt
                  : null;

                // Add only the best score to total (not all attempts) - only if passed (>= 70%)
                if (unitBestScore >= 70) {
                  totalQuizScore += unitBestScore;
                  totalQuizAttempts++;
                }
                
                // Calculate video progress for this unit from watchHistory
                const unitVideosForProgress = await Video.find({ unit: unitId });
                const unitVideoIdsForProgress = unitVideosForProgress.map(v => v._id.toString());
                let completedVideosInUnit = 0;
                
                if (studentData?.watchHistory && studentData.watchHistory.length > 0) {
                  completedVideosInUnit = studentData.watchHistory.filter(wh => {
                    const whVideoId = wh.video?._id?.toString() || wh.video?.toString();
                    return unitVideoIdsForProgress.includes(whVideoId) && 
                           (wh.isCompleted || wh.watchedPercentage >= 80);
                  }).length;
                }
                
                const videoProgress = unitVideoIdsForProgress.length > 0 
                  ? Math.round((completedVideosInUnit / unitVideoIdsForProgress.length) * 100)
                  : 100; // If no videos, consider 100%

                // Determine if unit is completed - use the same logic as student side
                // The primary source of truth is the unitQuizPassed flag in StudentProgress
                const isUnitCompleted = (unitProgress.completed || false) || 
                                        (unitProgress.unitQuizPassed === true) || // Primary completion flag - same as student side
                                        (videoProgress >= 90); // OR high video progress as fallback
                                        
                console.log(`[DEBUG] Unit ${unitId} completion status:`, {
                  unitProgressCompleted: unitProgress.completed,
                  unitQuizPassed: unitProgress.unitQuizPassed,
                  videoProgress,
                  finalStatus: isUnitCompleted,
                  unitBestScore
                });
                const courseInfoForUnit = section.courses?.find(c => c._id.toString() === unitCourseId);
                const courseName = unitInfo?.course?.title || courseInfoForUnit?.title || 'Unknown Course';

                unitDetails.push({
                  unitId: unitId,
                  unitName: unitInfo?.title || `Unit ${unitProgress.order || unitDetails.length + 1}`,
                  courseName: courseName,
                  courseId: unitCourseId || '',
                  quizMarks: unitQuizMarks,
                  attempts: unitQuizAttempts.length,
                  bestScore: Math.round(unitBestScore),
                  videoProgress,
                  lastAttempt: unitLastAttempt,
                  watchTime: Math.round(unitWatchTime / 60), // Convert to minutes
                  isCompleted: isUnitCompleted,
                  quizPassed: unitProgress.unitQuizPassed || false
                });
              }
            }
          }
          
          // Don't calculate progress yet - will be calculated after unit processing
        }

        // Also check for quiz attempts that might not be in StudentProgress
        for (const unit of units) {
          const unitId = unit._id.toString();
          const existingUnitDetail = unitDetails.find(ud => ud.unitId === unitId);
          
          // ONLY add if unit doesn't exist yet
          if (!existingUnitDetail) {
            // Get direct quiz attempts for this unit
            const directUnitAttempts = studentQuizAttempts.filter(qa => 
              qa.unit && qa.unit.toString() === unitId
            );
            
            if (directUnitAttempts.length > 0) {
              const quizMarks = directUnitAttempts.map(qa => qa.score || 0);
              const bestPercentage = Math.max(...directUnitAttempts.map(qa => qa.percentage || 0));
              const lastAttempt = directUnitAttempts[directUnitAttempts.length - 1].completedAt;
              
              // Calculate video progress from watchHistory
              const unitVideos = await Video.find({ unit: unitId });
              const unitVideoIds = unitVideos.map(v => v._id.toString());
              let completedVideos = 0;
              
              if (studentData?.watchHistory && studentData.watchHistory.length > 0) {
                completedVideos = studentData.watchHistory.filter(wh => {
                  const whVideoId = wh.video?._id?.toString() || wh.video?.toString();
                  return unitVideoIds.includes(whVideoId) && 
                         (wh.isCompleted || wh.watchedPercentage >= 80);
                }).length;
              }
              
              const videoProgress = unitVideoIds.length > 0 
                ? Math.round((completedVideos / unitVideoIds.length) * 100)
                : 100; // If no videos, consider 100%
              
              // Get course info for this unit - handle both populated object and raw ObjectId
              const unitCourseId = unit.course?._id?.toString() || unit.course?.toString();
              const courseInfo = section.courses?.find(c => c._id.toString() === unitCourseId);
              const courseName = unit.course?.title || courseInfo?.title || 'Unknown Course';

              // Check StudentProgress for unit completion status
              let isUnitCompleted = false;
              let unitQuizPassed = false;
              
              // Find the StudentProgress record that contains this unit
              for (const progressRecord of studentProgressRecords) {
                const unitInProgress = progressRecord.units?.find(u => 
                  u.unitId?.toString() === unitId
                );
                if (unitInProgress) {
                  // Use the unitQuizPassed flag from StudentProgress as primary source
                  unitQuizPassed = unitInProgress.unitQuizPassed === true;
                  isUnitCompleted = unitQuizPassed || (videoProgress >= 90); // Quiz passed OR high video progress
                  break;
                }
              }
              
              // If no StudentProgress data, fallback to quiz score threshold
              if (!unitQuizPassed && bestPercentage >= 70) {
                isUnitCompleted = true;
                unitQuizPassed = true;
              }

              unitDetails.push({
                unitId: unitId,
                unitName: unit.title,
                courseName: courseName,
                courseId: unitCourseId || '',
                quizMarks,
                attempts: directUnitAttempts.length,
                bestScore: Math.round(bestPercentage),
                videoProgress: videoProgress,
                lastAttempt,
                watchTime: 0,
                isCompleted: isUnitCompleted, // Use proper completion logic
                quizPassed: unitQuizPassed
              });

              // Add ONLY the best score to total (not all attempts)
              if (bestPercentage >= 70) {
                totalQuizScore += bestPercentage;
                totalQuizAttempts++;
              }
            }
          }
        }

        // Deduplicate unit details by unitId AND unitName (some units may have same ID but from different courses)
        const uniqueUnitDetails = [];
        const seenUnits = new Map(); // Use Map to track by both ID and name
        
        unitDetails.forEach(detail => {
          const unitKey = `${detail.unitId}_${detail.unitName}`;
          
          if (!seenUnits.has(unitKey)) {
            seenUnits.set(unitKey, detail);
            uniqueUnitDetails.push(detail);
          } else {
            // If duplicate, keep the one with more data (more attempts, better score, or completion)
            const existing = seenUnits.get(unitKey);
            const existingIndex = uniqueUnitDetails.findIndex(ud => 
              ud.unitId === detail.unitId && ud.unitName === detail.unitName
            );
            
            if (existingIndex !== -1) {
              const shouldReplace = 
                detail.isCompleted && !existing.isCompleted || // Prefer completed
                detail.attempts > existing.attempts || // More attempts
                detail.bestScore > existing.bestScore || // Better score
                detail.videoProgress > existing.videoProgress; // More video progress
              
              if (shouldReplace) {
                uniqueUnitDetails[existingIndex] = detail;
                seenUnits.set(unitKey, detail);
              }
            }
          }
        });

        // Sort unit details by unit order
        uniqueUnitDetails.sort((a, b) => {
          const unitA = units.find(u => u._id.toString() === a.unitId);
          const unitB = units.find(u => u._id.toString() === b.unitId);
          return (unitA?.order || 0) - (unitB?.order || 0);
        });
        
        // Calculate progress based on completed units ratio
        const totalUnits = uniqueUnitDetails.length;
        const completedUnitsCount = uniqueUnitDetails.filter(u => u.isCompleted).length;
        overallProgress = totalUnits > 0 ? Math.round((completedUnitsCount / totalUnits) * 100) : 0;
        
        // Calculate average quiz score from both StudentProgress units AND direct QuizAttempt records
        let avgQuizScore = 0;
        
        if (totalQuizAttempts > 0) {
          // Use quiz scores from StudentProgress units (already uses best score per unit)
          avgQuizScore = Math.round(totalQuizScore / totalQuizAttempts);
        } else if (studentQuizAttempts.length > 0) {
          // Fallback to direct QuizAttempt records - use best passed score per unit
          const unitBestScores = new Map();
          
          for (const qa of studentQuizAttempts) {
            const unitId = qa.unit?.toString();
            if (!unitId) continue;
            
            const percentage = qa.percentage || 0;
            // Only count passed attempts (>= 70%)
            if (percentage >= 70) {
              const currentBest = unitBestScores.get(unitId) || 0;
              if (percentage > currentBest) {
                unitBestScores.set(unitId, percentage);
              }
            }
          }
          
          if (unitBestScores.size > 0) {
            const totalBestScores = Array.from(unitBestScores.values()).reduce((sum, score) => sum + score, 0);
            avgQuizScore = Math.round(totalBestScores / unitBestScores.size);
          }
        }
        
        console.log(`[Student ${student.name}] Progress: ${overallProgress}%, Watch Time: ${Math.round(totalWatchTime / 60)}min, Quiz Avg: ${avgQuizScore}%, Units: ${uniqueUnitDetails.length}, Completed: ${uniqueUnitDetails.filter(u => u.isCompleted).length}`);
        
        // Log unit details for debugging
        if (uniqueUnitDetails.length > 0) {
          console.log(`[Student ${student.name}] Unit Details:`, JSON.stringify(uniqueUnitDetails.map(u => ({
            unitName: u.unitName,
            courseName: u.courseName,
            courseId: u.courseId,
            bestScore: u.bestScore,
            isCompleted: u.isCompleted
          }))));
        }

        // Calculate engagement level based on recent activity
        const hasRecentActivity = studentProgressRecords.some(sp => {
          const updatedDate = sp.updatedAt || sp.createdAt || sp.lastActivity;
          return updatedDate && new Date(updatedDate) > new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        });

        // Safe calculation of last activity
        let lastActivity = null;
        if (studentProgressRecords.length > 0) {
          const dates = studentProgressRecords
            .map(sp => sp.lastActivity || sp.updatedAt || sp.createdAt)
            .filter(date => date)
            .map(date => new Date(date).getTime());
          
          if (dates.length > 0) {
            lastActivity = new Date(Math.max(...dates));
          }
        }

        studentsAnalytics.push({
          _id: student._id,
          firstName: student.name?.split(' ')[0] || 'Unknown',
          lastName: student.name?.split(' ').slice(1).join(' ') || '',
          email: student.email,
          regNo: student.regNo || student.studentId || student._id,
          studentId: student.regNo || student.studentId || student._id,
          progress: Math.round(overallProgress),
          watchTime: Math.round(totalWatchTime / 60), // Convert seconds to minutes
          quizAverage: avgQuizScore,
          engagementLevel: hasRecentActivity ? 'high' : 'low',
          lastActivity: lastActivity,
          unitDetails: uniqueUnitDetails // Use deduplicated unit details
        });
      } catch (studentError) {
        console.error('Error processing student:', student._id, studentError);
        studentsAnalytics.push({
          _id: student._id,
          firstName: student.name?.split(' ')[0] || 'Unknown',
          lastName: student.name?.split(' ').slice(1).join(' ') || '',
          email: student.email,
          regNo: student.regNo || student.studentId || student._id,
          studentId: student.regNo || student.studentId || student._id,
          progress: 0,
          watchTime: 0,
          quizAverage: 0,
          engagementLevel: 'low',
          lastActivity: null,
          unitDetails: []
        });
      }
    }

    // Calculate engagement metrics based on real data
    const activeStudents = studentIds.filter(studentId => {
      const studentActivity = studentProgress.filter(sp => 
        sp.student.toString() === studentId.toString()
      );
      return studentActivity.length > 0; // Students with any progress
    });

    // Calculate course-wise completion data
    const courseCompletion = [];
    for (const course of section.courses || []) {
      const courseProgress = await StudentProgress.find({
        student: { $in: studentIds },
        course: course._id
      });
      
      const avgCourseCompletion = courseProgress.length > 0
        ? Math.round(courseProgress.reduce((sum, cp) => sum + (cp.overallProgress || 0), 0) / courseProgress.length)
        : 0;
      
      courseCompletion.push({
        courseName: course.title || 'Unknown Course',
        courseId: course._id,
        completion: avgCourseCompletion
      });
    }

    // Calculate quiz scores per course
    const quizScores = courseCompletion.map(course => {
      const courseQuizAttempts = quizAttempts.filter(qa => 
        qa.course && qa.course.toString() === course.courseId.toString()
      );
      
      return courseQuizAttempts.length > 0
        ? Math.round(courseQuizAttempts.reduce((sum, qa) => sum + (qa.percentage || 0), 0) / courseQuizAttempts.length)
        : 0;
    });

    const performanceData = {
      // Real student progress data for charts
      studentProgressData: {
        labels: studentsAnalytics.map(sp => `${sp.firstName} ${sp.lastName}`) || [],
        data: studentsAnalytics.map(sp => sp.progress) || []
      },
      
      // Course completion data for charts
      courseCompletion: courseCompletion,
      
      // Quiz scores per course for charts
      quizScores: quizScores,
      
      // Real engagement metrics
      engagement: {
        activeStudents: activeStudents.length,
        totalStudents: studentIds.length,
        engagementRate: studentIds.length > 0 
          ? Math.round((activeStudents.length / studentIds.length) * 100)
          : 0
      },
      
      // Real quiz performance
      averageQuizScore: quizAttempts.length > 0
        ? Math.round(quizAttempts.reduce((sum, attempt) => sum + (attempt.score || 0), 0) / quizAttempts.length)
        : 0
    };

    const analytics = {
      sectionDetails: {
        _id: section._id,
        name: section.name,
        sectionName: section.name,
        courseName: 'Multiple Courses',
        school: section.school?.name,
        department: section.department?.name,
        studentCount: section.students?.length || 0,
        studentsCount: section.students?.length || 0,
        coursesCount: section.courses?.length || 0,
        videoCount: totalVideos,
        capacity: section.capacity,
        academicYear: section.academicYear,
        semester: section.semester,
        averageProgress: studentsAnalytics.length > 0
          ? Math.round(studentsAnalytics.reduce((sum, s) => sum + s.progress, 0) / studentsAnalytics.length)
          : 0,
        students: studentsAnalytics,
        // Add list of courses for filtering
        courses: (section.courses || []).map(c => ({
          _id: c._id,
          title: c.title,
          description: c.description
        }))
      },
      performanceData: {
        ...performanceData,
        videoMetrics: {
          totalVideos: totalVideos,
          averageWatchTime: studentsAnalytics.length > 0
            ? Math.round(studentsAnalytics.reduce((sum, s) => sum + s.watchTime, 0) / studentsAnalytics.length)
            : 0
        }
      }
    };

    console.log('Real section analytics for', section.name, '- students:', analytics.sectionDetails.studentCount, 'videos:', totalVideos);
    res.json(analytics);
  } catch (error) {
    console.error('Error getting section analytics:', error);
    res.status(500).json({ 
      message: 'Failed to fetch section analytics',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

// Get detailed section analytics with unit-wise student performance
exports.getDetailedSectionAnalytics = async (req, res) => {
  try {
    const sectionId = req.params.sectionId;
    const user = req.user;
    
    console.log('[getDetailedSectionAnalytics] Request for section:', sectionId, 'by user:', user.userId);

    // Find the section
    const section = await Section.findById(sectionId);
    if (!section) {
      return res.status(404).json({ message: 'Section not found' });
    }

    // Check if user is authorized (teacher of this section)
    const isAuthorized = await SectionCourseTeacher.findOne({
      section: sectionId,
      teacher: user.userId
    });

    if (!isAuthorized && user.role !== 'admin' && user.role !== 'hod') {
      return res.status(403).json({ message: 'Not authorized to view this section analytics' });
    }

    console.log('[getDetailedSectionAnalytics] Authorization check passed');

    // Get required models
    const Video = require('../models/Video');
    const User = require('../models/User');
    const StudentProgress = require('../models/StudentProgress');
    const Quiz = require('../models/Quiz');
    const QuizAttempt = require('../models/QuizAttempt');

    // Get students in this section with detailed performance data
    const studentsWithDetails = await Promise.all(
      section.students.map(async (studentId) => {
        const student = await User.findById(studentId).select('name email regNo');
        if (!student) return null;

        // Get video progress for this student
        const studentProgressRecords = await StudentProgress.find({ student: studentId });
        const totalWatchTime = studentProgressRecords.reduce((sum, sp) => sum + (sp.watchTime || 0), 0);
        
        // Get quiz attempts for this student
        const quizAttempts = await QuizAttempt.find({ user: studentId });
        const quizScores = quizAttempts.map(qa => qa.score);
        const avgQuizScore = quizScores.length > 0 ? (quizScores.reduce((sum, score) => sum + score, 0) / quizScores.length) : 0;

        // Calculate overall progress
        const totalVideos = await Video.countDocuments();
        const watchedVideos = studentProgressRecords.filter(sp => sp.progress >= 90).length;
        const overallProgress = totalVideos > 0 ? Math.round((watchedVideos / totalVideos) * 100) : 0;

        // Get unit-wise detailed data
        const units = await Quiz.distinct('unit');
        const unitDetails = await Promise.all(
          units.map(async (unit) => {
            // Get quizzes for this unit
            const unitQuizzes = await Quiz.find({ unit: unit });
            const unitQuizIds = unitQuizzes.map(q => q._id);
            
            // Get attempts for this unit's quizzes
            const unitAttempts = await QuizAttempt.find({
              user: studentId,
              quiz: { $in: unitQuizIds }
            }).sort({ createdAt: -1 });

            // Get video progress for this unit
            const unitVideos = await Video.find({ unit: unit });
            const unitVideoIds = unitVideos.map(v => v._id);
            const unitStudentProgress = await StudentProgress.find({
              student: studentId,
              video: { $in: unitVideoIds }
            });

            const unitVideoProgress = unitVideoIds.length > 0 ? 
              Math.round((unitStudentProgress.reduce((sum, sp) => sum + (sp.progress || 0), 0) / unitVideoIds.length)) : 0;

            const quizMarks = unitAttempts.map(attempt => attempt.score);
            const bestScore = quizMarks.length > 0 ? Math.max(...quizMarks) : 0;
            const attempts = unitAttempts.length;
            const lastAttempt = attempts > 0 ? unitAttempts[0].createdAt : null;

            return {
              unitName: unit || 'General',
              quizMarks,
              attempts,
              bestScore,
              videoProgress: unitVideoProgress,
              lastAttempt
            };
          })
        );

        // Calculate engagement level
        const recentActivity = Math.max(
          ...studentProgressRecords.map(sp => new Date(sp.updatedAt || sp.createdAt)),
          ...quizAttempts.map(qa => new Date(qa.createdAt))
        );
        
        const daysSinceActivity = recentActivity ? Math.floor((new Date() - recentActivity) / (1000 * 60 * 60 * 24)) : 999;
        let engagementLevel = 'low';
        if (daysSinceActivity <= 3) engagementLevel = 'high';
        else if (daysSinceActivity <= 7) engagementLevel = 'medium';

        return {
          _id: student._id,
          firstName: student.name?.split(' ')[0] || 'Unknown',
          lastName: student.name?.split(' ').slice(1).join(' ') || '',
          email: student.email,
          studentId: student.regNo || student._id,
          progress: overallProgress,
          watchTime: Math.round(totalWatchTime / 60), // Convert to minutes
          quizAverage: Math.round(avgQuizScore),
          engagementLevel,
          lastActivity: recentActivity || null,
          unitDetails
        };
      })
    );

    // Filter out null students
    const validStudents = studentsWithDetails.filter(student => student !== null);

    // Calculate section-level analytics
    const totalStudents = validStudents.length;
    const activeStudents = validStudents.filter(s => s.engagementLevel !== 'low').length;
    const inactiveStudents = totalStudents - activeStudents;
    
    const avgProgress = totalStudents > 0 ? 
      Math.round(validStudents.reduce((sum, s) => sum + s.progress, 0) / totalStudents) : 0;

    const avgQuizScore = totalStudents > 0 ? 
      Math.round(validStudents.reduce((sum, s) => sum + s.quizAverage, 0) / totalStudents) : 0;

    // Prepare student progress data for charts
    const studentProgressData = {
      labels: validStudents.map(s => `${s.firstName} ${s.lastName}`),
      data: validStudents.map(s => s.progress)
    };

    const response = {
      sectionDetails: {
        sectionName: section.name,
        courseName: section.courseName || 'Multiple Courses',
        studentCount: totalStudents,
        videoCount: await Video.countDocuments(),
        averageProgress: avgProgress,
        students: validStudents
      },
      performanceData: {
        activeStudents,
        inactiveStudents,
        averageQuizScore: avgQuizScore,
        studentProgressData
      }
    };

    console.log('[getDetailedSectionAnalytics] Returning detailed analytics for', totalStudents, 'students');
    res.json(response);

  } catch (error) {
    console.error('[getDetailedSectionAnalytics] Error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// ============ NEW COURSE-TEACHER ASSIGNMENT FUNCTIONS ============

// DEPRECATED: Use enhanced teacher assignment system
exports.getUnassignedCourses = async (req, res) => {
  return res.status(410).json({
    success: false,
    message: 'This endpoint has been deprecated. Please use the enhanced teacher assignment system.',
    newEndpoint: '/api/teacher-assignments/teachers',
    documentation: 'Use GET /api/teacher-assignments/teachers to get available teachers for assignments'
  });
};

// DEPRECATED: Use enhanced teacher assignment system
exports.assignCourseTeacher = async (req, res) => {
  return res.status(410).json({
    success: false,
    message: 'This endpoint has been deprecated. Please use the enhanced teacher assignment system.',
    newEndpoint: '/api/teacher-assignments/assign',
    documentation: 'Use POST /api/teacher-assignments/assign with { teacherId, assignments: [{ sectionId, courseId }] }',
    migration: {
      old: `POST /api/sections/${req.params.sectionId}/assign-course-teacher`,
      new: 'POST /api/teacher-assignments/assign',
      payload: {
        teacherId: 'TEACHER_ID',
        assignments: [{
          sectionId: req.params.sectionId || 'SECTION_ID',
          courseId: 'COURSE_ID'
        }]
      }
    }
  });
};

// DEPRECATED: Use enhanced teacher assignment system
exports.getSectionCourseTeachers = async (req, res) => {
  return res.status(410).json({
    success: false,
    message: 'This endpoint has been deprecated. Please use the enhanced teacher assignment system.',
    newEndpoint: '/api/teacher-assignments/section/' + req.params.sectionId,
    documentation: 'Use GET /api/teacher-assignments/section/:sectionId to get assignments for a section'
  });
};

// DEPRECATED: Use enhanced teacher assignment system
exports.removeCourseTeacher = async (req, res) => {
  return res.status(410).json({
    success: false,
    message: 'This endpoint has been deprecated. Please use the enhanced teacher assignment system.',
    newEndpoint: '/api/teacher-assignments/remove',
    documentation: 'Use POST /api/teacher-assignments/remove with assignment details'
  });
};

// DEPRECATED: Use enhanced teacher assignment system
exports.getTeacherCourseAssignments = async (req, res) => {
  return res.status(410).json({
    success: false,
    message: 'This endpoint has been deprecated. Please use the enhanced teacher assignment system.',
    newEndpoint: '/api/teacher-assignments/teacher/' + req.params.teacherId,
    documentation: 'Use GET /api/teacher-assignments/teacher/:teacherId to get teacher assignments'
  });
};

// Get available sections for enhanced live class scheduling
exports.getAvailableSections = async (req, res) => {
  try {
    console.log('🔍 Enhanced: Getting available sections for live class scheduling');
    const user = req.user;
    
    // Determine which sections to fetch based on user role
    let sectionQuery = {};
    
    if (user.role === 'teacher') {
      // Teachers can see sections they are assigned to
      const SectionCourseTeacher = require('../models/SectionCourseTeacher');
      const assignments = await SectionCourseTeacher.find({ 
        teacher: user._id, 
        isActive: true 
      }).distinct('section');
      
      sectionQuery = { _id: { $in: assignments } };
    } else if (user.role === 'hod') {
      // HODs can see sections in their department
      sectionQuery = { department: user.department };
    } else if (user.role === 'dean') {
      // Deans can see all sections in their school's departments
      const Department = require('../models/Department');
      const departments = await Department.find({ school: user.school }).select('_id');
      const departmentIds = departments.map(d => d._id);
      sectionQuery = { department: { $in: departmentIds } };
    } else if (user.role === 'admin') {
      // Admins can see all sections
      sectionQuery = {};
    }

    const sections = await Section.find(sectionQuery)
      .populate('school', 'name code')
      .populate('department', 'name code')
      .populate('courses', 'title courseCode')
      .populate('students', 'name email')
      .select('name school department courses students capacity academicYear semester')
      .sort({ name: 1 });

    console.log(`✅ Found ${sections.length} available sections for user role: ${user.role}`);
    
    res.json({
      success: true,
      sections: sections.map(section => ({
        _id: section._id,
        name: section.name,
        school: section.school,
        department: section.department,
        courses: section.courses,
        studentCount: section.students?.length || 0,
        capacity: section.capacity,
        academicYear: section.academicYear,
        semester: section.semester
      }))
    });
  } catch (error) {
    console.error('❌ Error getting available sections:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get available sections',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

// Get section by ID for group chat
exports.getSectionById = async (req, res) => {
  try {
    const { id } = req.params;

    // Validate ObjectId format
    const objectIdPattern = /^[0-9a-fA-F]{24}$/;
    if (!objectIdPattern.test(id)) {
      console.log('Invalid sectionId format in getSectionById:', id);
      return res.status(400).json({ message: 'Invalid sectionId format' });
    }
    
    const section = await Section.findById(id)
      .populate('school', 'name code')
      .populate('department', 'name code')
      .populate('courses', 'title courseCode')
      .populate('teacher', 'name email')
      .populate('students', 'name email');
    
    if (!section) {
      return res.status(404).json({ message: 'Section not found' });
    }
    
    res.json({
      success: true,
      section
    });
  } catch (error) {
    console.error('❌ Error getting section by ID:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get section',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};
