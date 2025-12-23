const User = require('../models/User');
const School = require('../models/School');
const Department = require('../models/Department');
const Course = require('../models/Course');
const Section = require('../models/Section');
const Video = require('../models/Video');
const Unit = require('../models/Unit');
const StudentProgress = require('../models/StudentProgress');
const QuizAttempt = require('../models/QuizAttempt');
const SectionCourseTeacher = require('../models/SectionCourseTeacher');
const Announcement = require('../models/Announcement');
const mongoose = require('mongoose');
const ReadingMaterial = require('../models/ReadingMaterial');
const AuditLog = require('../models/AuditLog');

// Audit logging helper for Dean actions
const logDeanAction = async (req, action, details = {}) => {
  try {
    const user = req.user;
    let description = '';
    let severity = 'info';
    
    switch (action) {
      case 'ASSIGN_HOD':
        description = `Dean ${user?.name} assigned ${details.hodName} as HOD for department "${details.departmentName}"`;
        severity = 'high';
        break;
      case 'REMOVE_HOD':
        description = `Dean ${user?.name} removed HOD from department "${details.departmentName}"`;
        severity = 'high';
        break;
      case 'ASSIGN_COURSE':
        description = `Dean ${user?.name} assigned course "${details.courseName}" to department "${details.departmentName}"`;
        severity = 'medium';
        break;
      case 'REMOVE_COURSE':
        description = `Dean ${user?.name} removed course "${details.courseName}" from department "${details.departmentName}"`;
        severity = 'medium';
        break;
      case 'CREATE_DEPARTMENT':
        description = `Dean ${user?.name} created department "${details.departmentName}"`;
        severity = 'high';
        break;
      case 'UPDATE_DEPARTMENT':
        description = `Dean ${user?.name} updated department "${details.departmentName}"`;
        severity = 'medium';
        break;
      default:
        description = `Dean action: ${action}`;
    }
    
    await AuditLog.create({
      action: `DEAN_${action}`,
      description,
      actionType: action.includes('REMOVE') ? 'delete' : (action.includes('ASSIGN') || action.includes('CREATE') ? 'create' : 'update'),
      performedBy: user?._id || user?.id,
      performedByRole: 'dean',
      performedByName: user?.name,
      performedByEmail: user?.email,
      targetResource: details.resource || 'Department',
      targetResourceId: details.resourceId,
      ipAddress: req.headers?.['x-forwarded-for']?.split(',')[0]?.trim() || req.ip || 'Unknown',
      userAgent: req.headers?.['user-agent'],
      requestMethod: req.method,
      requestUrl: req.originalUrl,
      status: 'success',
      severity,
      category: 'dean_management',
      details: {
        action,
        ...details
      },
      tags: ['dean', action.toLowerCase().replace(/_/g, '-')]
    });
    console.log(`📝 Audit: Dean ${action} logged`);
  } catch (error) {
    console.error('❌ Failed to log Dean action audit:', error.message);
  }
};

// Ensure requester is dean and get school
async function getDeanSchool(req) {
  // Support multi-role users
  const userRoles = req.user.roles || [req.user.role];
  if (!userRoles.includes('dean')) {
    const err = new Error('Access denied: Dean only');
    err.status = 403;
    throw err;
  }
  if (!req.user.school) {
    const err = new Error('Dean is not assigned to any school');
    err.status = 400;
    throw err;
  }
  const school = await School.findById(req.user.school).select('name code').lean();
  if (!school) {
    const err = new Error('School not found');
    err.status = 404;
    throw err;
  }
  return school;
}

// GET /api/dean/overview
exports.getOverview = async (req, res) => {
  try {
    const school = await getDeanSchool(req);

    const [departments, teachersCount, studentsCount, coursesCount, hodsCount] = await Promise.all([
      Department.countDocuments({ school: school._id, isActive: true }),
      User.countDocuments({ role: 'teacher', school: school._id, isActive: true }),
      User.countDocuments({ role: 'student', school: school._id, isActive: true }),
      Course.countDocuments({ school: school._id, isActive: true }),
      Department.countDocuments({ school: school._id, isActive: true, hod: { $ne: null } })
    ]);

    res.json({
      school,
      stats: {
        departments,
        teachers: teachersCount,
        students: studentsCount,
  courses: coursesCount,
  hods: hodsCount
      }
    });
  } catch (err) {
    res.status(err.status || 500).json({ message: err.message });
  }
};

// GET /api/dean/departments
exports.getDepartments = async (req, res) => {
  try {
    const school = await getDeanSchool(req);

    const departments = await Department.find({ school: school._id, isActive: true })
      .populate('hod', 'name email teacherId _id')
      .select('name code hod courses')
      .lean();

    // Compute quick counts per department
    const deptIds = departments.map(d => d._id);
    const [courseCounts, teacherCounts, studentCounts] = await Promise.all([
      Course.aggregate([
        { $match: { department: { $in: deptIds }, isActive: true } },
        { $group: { _id: '$department', count: { $sum: 1 } } }
      ]),
      User.aggregate([
        { $match: { role: 'teacher', isActive: true, department: { $in: deptIds } } },
        { $group: { _id: '$department', count: { $sum: 1 } } }
      ]),
      // Count students by department through sections
      Section.aggregate([
        { $match: { school: school._id } },
        { $lookup: { from: 'courses', localField: 'courses', foreignField: '_id', as: 'courseData' } },
        { $unwind: { path: '$courseData', preserveNullAndEmptyArrays: true } },
        { $unwind: { path: '$students', preserveNullAndEmptyArrays: true } },
        { $group: { _id: '$courseData.department', studentIds: { $addToSet: '$students' } } },
        { $project: { _id: 1, count: { $size: '$studentIds' } } }
      ])
    ]);

    const cMap = new Map(courseCounts.map(x => [x._id?.toString(), x.count]));
    const tMap = new Map(teacherCounts.map(x => [x._id?.toString(), x.count]));
    const sMap = new Map(studentCounts.map(x => [x._id?.toString(), x.count]));

    const result = departments.map(d => ({
      _id: d._id,
      name: d.name,
      code: d.code,
      hod: d.hod ? { _id: d.hod._id, name: d.hod.name, email: d.hod.email, uid: d.hod.teacherId } : null,
      counts: {
        courses: cMap.get(d._id.toString()) || 0,
        teachers: tMap.get(d._id.toString()) || 0,
        students: sMap.get(d._id.toString()) || 0
      }
    }));

    res.json({ school, departments: result });
  } catch (err) {
    res.status(err.status || 500).json({ message: err.message });
  }
};

// GET /api/dean/analytics
exports.getAnalytics = async (req, res) => {
  try {
    const school = await getDeanSchool(req);

    // Get quiz analytics summary for this school
    const schoolCourses = await Course.find({ school: school._id, isActive: { $ne: false } }).distinct('_id');
    
    const quizAnalytics = await QuizAttempt.aggregate([
      { $match: { course: { $in: schoolCourses }, isComplete: true } },
      {
        $group: {
          _id: null,
          totalAttempts: { $sum: 1 },
          totalPassed: { $sum: { $cond: [{ $eq: ['$passed', true] }, 1, 0] } },
          averageScore: { $avg: '$percentage' },
          highestScore: { $max: '$percentage' },
          lowestScore: { $min: '$percentage' }
        }
      }
    ]);

    const quizSummary = quizAnalytics[0] || {
      totalAttempts: 0,
      totalPassed: 0,
      averageScore: 0,
      highestScore: 0,
      lowestScore: 0
    };

    // Department-wise detailed analytics
    const departmentAnalytics = await Department.aggregate([
      { $match: { school: school._id, isActive: true } },
      {
        $lookup: {
          from: 'courses',
          let: { deptId: '$_id' },
          pipeline: [
            { $match: { $expr: { $and: [{ $eq: ['$department', '$$deptId'] }, { $ne: ['$isActive', false] }] } } },
            {
              $lookup: {
                from: 'users',
                let: { courseId: '$_id' },
                pipeline: [
                  {
                    $match: {
                      $expr: {
                        $and: [
                          { $eq: ['$role', 'teacher'] },
                          { $in: ['$$courseId', { $ifNull: ['$coursesAssigned', []] }] },
                          { $ne: ['$isActive', false] }
                        ]
                      }
                    }
                  }
                ],
                as: 'teachers'
              }
            },
            // Lookup students through sections
            {
              $lookup: {
                from: 'sections',
                let: { courseId: '$_id' },
                pipeline: [
                  {
                    $match: {
                      $expr: {
                        $and: [
                          { $in: ['$$courseId', { $ifNull: ['$courses', []] }] }
                        ]
                      }
                    }
                  },
                  { $unwind: { path: '$students', preserveNullAndEmptyArrays: true } },
                  { $group: { _id: null, studentIds: { $addToSet: '$students' } } }
                ],
                as: 'studentData'
              }
            },
            {
              $addFields: {
                students: {
                  $cond: {
                    if: { $gt: [{ $size: '$studentData' }, 0] },
                    then: { $arrayElemAt: ['$studentData.studentIds', 0] },
                    else: []
                  }
                }
              }
            },
            {
              $lookup: {
                from: 'videos',
                localField: '_id',
                foreignField: 'course',
                as: 'videos'
              }
            },
            // Lookup teachers through SectionCourseTeacher model
            {
              $lookup: {
                from: 'sectioncourseteachers',
                let: { courseId: '$_id' },
                pipeline: [
                  {
                    $match: {
                      $expr: { $eq: ['$course', '$$courseId'] }
                    }
                  },
                  {
                    $lookup: {
                      from: 'users',
                      localField: 'teacher',
                      foreignField: '_id',
                      as: 'teacherData'
                    }
                  },
                  { $unwind: { path: '$teacherData', preserveNullAndEmptyArrays: true } },
                  {
                    $project: {
                      _id: '$teacherData._id',
                      name: '$teacherData.name',
                      email: '$teacherData.email'
                    }
                  }
                ],
                as: 'teachers'
              }
            },
            {
              $project: {
                title: 1,
                courseCode: 1,
                teacherCount: { $size: '$teachers' },
                studentCount: { $size: '$students' },
                videoCount: { $size: '$videos' },
                teachers: { $slice: ['$teachers', 3] },
                enrolledStudents: { $size: '$students' }
              }
            }
          ],
          as: 'courses'
        }
      },
      {
        $lookup: {
          from: 'users',
          let: { deptId: '$_id' },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ['$department', '$$deptId'] },
                    { $eq: ['$role', 'teacher'] },
                    { $ne: ['$isActive', false] }
                  ]
                }
              }
            },
            { $project: { name: 1, email: 1, teacherId: 1, coursesAssigned: 1 } }
          ],
          as: 'teachers'
        }
      },
      // Lookup students through sections for this department
      {
        $lookup: {
          from: 'sections',
          let: { deptId: '$_id' },
          pipeline: [
            { $match: { $expr: { $eq: ['$department', '$$deptId'] } } },
            { $unwind: { path: '$students', preserveNullAndEmptyArrays: true } },
            {
              $lookup: {
                from: 'users',
                localField: 'students',
                foreignField: '_id',
                as: 'studentData'
              }
            },
            { $unwind: { path: '$studentData', preserveNullAndEmptyArrays: true } },
            {
              $group: {
                _id: '$studentData._id',
                name: { $first: '$studentData.name' },
                email: { $first: '$studentData.email' },
                regNo: { $first: '$studentData.regNo' }
              }
            },
            { $match: { _id: { $ne: null } } }
          ],
          as: 'students'
        }
      },
      {
        $lookup: {
          from: 'sections',
          let: { deptId: '$_id' },
          pipeline: [
            { $match: { $expr: { $eq: ['$department', '$$deptId'] } } },
            {
              $project: {
                name: 1,
                studentCount: { $size: { $ifNull: ['$students', []] } },
                teacher: 1,
                students: 1
              }
            }
          ],
          as: 'sections'
        }
      },
      {
        $addFields: {
          totalCourses: { $size: '$courses' },
          totalTeachers: { $size: '$teachers' },
          totalStudents: { $size: '$students' },
          totalSections: { $size: '$sections' },
          avgStudentsPerCourse: {
            $cond: {
              if: { $gt: [{ $size: '$courses' }, 0] },
              then: { $divide: [{ $sum: '$courses.studentCount' }, { $size: '$courses' }] },
              else: 0
            }
          },
          coursesWithoutTeachers: {
            $size: { $filter: { input: '$courses', as: 'course', cond: { $eq: ['$$course.teacherCount', 0] } } }
          },
          coursesWithoutStudents: {
            $size: { $filter: { input: '$courses', as: 'course', cond: { $eq: ['$$course.studentCount', 0] } } }
          }
        }
      },
      {
        $project: {
          name: 1,
          code: 1,
          hod: 1,
          totalCourses: 1,
          totalTeachers: 1,
          totalStudents: 1,
          totalSections: 1,
          avgStudentsPerCourse: { $round: ['$avgStudentsPerCourse', 1] },
          coursesWithoutTeachers: 1,
          coursesWithoutStudents: 1,
          courses: { $slice: ['$courses', 10] }, // Top 10 courses
          teachers: { $slice: ['$teachers', 10] }, // Top 10 teachers
          students: { $slice: ['$students', 10] }, // Top 10 students
          sections: 1
        }
      },
      { $sort: { name: 1 } }
    ]);

    // Course-wise analytics across the school
    const courseAnalytics = await Course.aggregate([
      { $match: { school: school._id, isActive: { $ne: false } } },
      {
        $lookup: {
          from: 'departments',
          localField: 'department',
          foreignField: '_id',
          as: 'department'
        }
      },
      { $unwind: '$department' },
      {
        $lookup: {
          from: 'users',
          let: { courseId: '$_id' },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ['$role', 'teacher'] },
                    { $isArray: '$coursesAssigned' },
                    { $in: ['$$courseId', '$coursesAssigned'] },
                    { $ne: ['$isActive', false] }
                  ]
                }
              }
            }
          ],
          as: 'teachers'
        }
      },
      {
        $lookup: {
          from: 'users',
          let: { courseId: '$_id' },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ['$role', 'student'] },
                    { $isArray: '$coursesAssigned' },
                    { $in: ['$$courseId', '$coursesAssigned'] },
                    { $ne: ['$isActive', false] }
                  ]
                }
              }
            }
          ],
          as: 'students'
        }
      },
      {
        $lookup: {
          from: 'videos',
          localField: '_id',
          foreignField: 'course',
          as: 'videos'
        }
      },
      {
        $project: {
          title: 1,
          courseCode: 1,
          departmentName: '$department.name',
          teacherCount: { $size: '$teachers' },
          studentCount: { $size: '$students' },
          videoCount: { $size: '$videos' },
          utilization: {
            $cond: {
              if: { $gt: [{ $size: '$students' }, 0] },
              then: { $multiply: [{ $divide: [{ $size: '$students' }, 100] }, 100] },
              else: 0
            }
          }
        }
      },
      { $sort: { studentCount: -1 } },
      { $limit: 20 }
    ]);

    // Student performance analytics
    const studentAnalytics = await User.aggregate([
      { $match: { role: 'student', school: school._id, isActive: { $ne: false } } },
      {
        $lookup: {
          from: 'courses',
          localField: 'coursesAssigned',
          foreignField: '_id',
          as: 'courses'
        }
      },
      {
        $lookup: {
          from: 'departments',
          localField: 'courses.department',
          foreignField: '_id',
          as: 'departments'
        }
      },
      {
        $lookup: {
          from: 'studentprogresses',
          localField: '_id',
          foreignField: 'student',
          as: 'progress'
        }
      },
      {
        $project: {
          name: 1,
          email: 1,
          regNo: 1,
          courseCount: { $size: '$courses' },
          departmentCount: { $size: { $setUnion: ['$courses.department', []] } },
          totalWatchTime: { $sum: '$progress.totalWatchTime' },
          avgProgress: { $avg: '$progress.progressPercentage' }
        }
      },
      { $sort: { totalWatchTime: -1 } },
      { $limit: 20 }
    ]);

    // School summary
    const [totalDepartments, totalCourses, totalTeachers, totalStudents] = await Promise.all([
      Department.countDocuments({ school: school._id, isActive: true }),
      Course.countDocuments({ school: school._id, isActive: { $ne: false } }),
      User.countDocuments({ role: 'teacher', school: school._id, isActive: { $ne: false } }),
      User.countDocuments({ role: 'student', school: school._id, isActive: { $ne: false } })
    ]);

    // Videos don't store school directly; count videos for courses in this school
    const courseIdsInSchool = await Course.find({ school: school._id, isActive: { $ne: false } }).distinct('_id');
    const totalVideos = await Video.countDocuments({ course: { $in: courseIdsInSchool } });

    res.json({
      school,
      summary: {
        totalDepartments,
        totalCourses,
        totalTeachers,
        totalStudents,
        totalVideos,
        avgStudentsPerDepartment: totalDepartments > 0 ? Math.round(totalStudents / totalDepartments) : 0,
        avgCoursesPerDepartment: totalDepartments > 0 ? Math.round(totalCourses / totalDepartments) : 0
      },
      departmentAnalytics,
      courseAnalytics,
      studentAnalytics
    });
  } catch (err) {
    console.error('Dean analytics error:', err);
    res.status(err.status || 500).json({ message: err.message });
  }
};

// ============ School Management Endpoints ============

// GET /api/dean/school-management/options
// Returns all departments in the dean's school and available HOD candidates
exports.getSchoolManagementOptions = async (req, res) => {
  try {
    const school = await getDeanSchool(req);

    const [departments, hodCandidates] = await Promise.all([
      Department.find({ school: school._id, isActive: true })
        .populate('hod', 'name email teacherId _id department')
        .select('name code hod'),
      User.find({ role: 'hod', school: school._id, isActive: true })
        .select('name email teacherId department')
        .populate('department', 'name code')
    ]);

    res.json({ school, departments, hodCandidates });
  } catch (err) {
    res.status(err.status || 500).json({ message: err.message });
  }
};

// PUT /api/dean/department/:deptId/hod  { hodId }
// Assign/update department HOD from hods within the same school
exports.setDepartmentHod = async (req, res) => {
  try {
    const school = await getDeanSchool(req);
    const { deptId } = req.params;
    const { hodId } = req.body;

  const dept = await Department.findOne({ _id: deptId, school: school._id });
    if (!dept) return res.status(404).json({ message: 'Department not found in your school' });

    // If hodId is falsy, unassign HOD
    if (!hodId) {
      // If department had an HOD, clear their department reference too
      if (dept.hod) {
        await User.findByIdAndUpdate(dept.hod, { $unset: { department: 1 } });
      }
      dept.hod = null;
      await dept.save();
      
      // Audit log the HOD removal
      await logDeanAction(req, 'REMOVE_HOD', {
        departmentName: dept.name,
        departmentId: dept._id,
        resource: 'Department',
        resourceId: dept._id
      });
      
      const populated = await Department.findById(dept._id).populate('hod', 'name email teacherId _id');
      return res.json({ message: 'HOD unassigned successfully', department: {
        _id: populated._id, name: populated.name, code: populated.code,
        hod: populated.hod ? { _id: populated.hod._id, name: populated.hod.name, email: populated.hod.email, uid: populated.hod.teacherId } : null
      }});
    }

    const hodUser = await User.findOne({ _id: hodId, school: school._id, isActive: true, $or: [{ role: 'hod' }, { roles: 'hod' }] });
    if (!hodUser) return res.status(400).json({ message: 'HOD candidate not found in your school' });

    // If this department already has a different HOD, remove their department reference
    if (dept.hod && dept.hod.toString() !== hodId) {
      await User.findByIdAndUpdate(dept.hod, { $unset: { department: 1 } });
      console.log(`Auto-deassigned previous HOD from department "${dept.name}"`);
    }

    // If the HOD is currently assigned to another department, remove them from there
    if (hodUser.department && hodUser.department.toString() !== deptId) {
      await Department.findByIdAndUpdate(hodUser.department, { $unset: { hod: 1 } });
      console.log(`Auto-removed HOD "${hodUser.name}" from their previous department`);
    }

    // Assign HOD to the new department
    dept.hod = hodUser._id;
    await dept.save();
    
    // Update HOD's department reference
    await User.findByIdAndUpdate(hodUser._id, { department: dept._id });
    
    // Audit log the HOD assignment
    await logDeanAction(req, 'ASSIGN_HOD', {
      hodName: hodUser.name,
      hodId: hodUser._id,
      departmentName: dept.name,
      departmentId: dept._id,
      resource: 'Department',
      resourceId: dept._id
    });

    const populated = await Department.findById(dept._id).populate('hod', 'name email teacherId _id');
    res.json({ message: 'HOD updated successfully', department: {
      _id: populated._id, name: populated.name, code: populated.code,
      hod: populated.hod ? { _id: populated.hod._id, name: populated.hod.name, email: populated.hod.email, uid: populated.hod.teacherId } : null
    }});
  } catch (err) {
    res.status(err.status || 500).json({ message: err.message });
  }
};

// GET /api/dean/department/:deptId/courses
exports.getDepartmentCourses = async (req, res) => {
  try {
    const school = await getDeanSchool(req);
    const { deptId } = req.params;

    const dept = await Department.findOne({ _id: deptId, school: school._id });
    if (!dept) return res.status(404).json({ message: 'Department not found in your school' });

    const courses = await Course.find({ department: dept._id, school: school._id, isActive: true })
      .select('title courseCode description');

    res.json({ department: { _id: dept._id, name: dept.name, code: dept.code }, courses });
  } catch (err) {
    res.status(err.status || 500).json({ message: err.message });
  }
};

// GET /api/dean/course/:courseId/relations
// Returns teachers and students related to a course (via sections)
exports.getCourseRelations = async (req, res) => {
  try {
    const school = await getDeanSchool(req);
    const { courseId } = req.params;
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.max(parseInt(req.query.limit, 10) || 25, 1);

  const course = await Course.findOne({ _id: courseId, school: school._id }).lean();
    if (!course) return res.status(404).json({ message: 'Course not found in your school' });

    // Get sections that include this course
    const sections = await Section.find({ school: school._id, courses: course._id, isActive: true })
      .populate('teacher', 'name email teacherId department')
      .populate('students', 'name email regNo department')
      .lean();

    // Teachers teaching this course via sections
    const teacherMap = new Map();
    sections.forEach(s => {
      if (s.teacher) {
        teacherMap.set(s.teacher._id.toString(), {
          _id: s.teacher._id,
          name: s.teacher.name,
          email: s.teacher.email,
          teacherId: s.teacher.teacherId
        });
      }
    });

    // Also check SectionCourseTeacher assignments
    const sctAssignments = await SectionCourseTeacher.find({ 
      course: course._id 
    }).populate('teacher', 'name email teacherId').lean();

    sctAssignments.forEach(a => {
      if (a.teacher) {
        teacherMap.set(a.teacher._id.toString(), {
          _id: a.teacher._id,
          name: a.teacher.name,
          email: a.teacher.email,
          teacherId: a.teacher.teacherId,
          uid: a.teacher.teacherId
        });
      }
    });

    // Also check teachers who have this course in their coursesAssigned field
    const courseTeachers = await User.find({
      role: 'teacher',
      school: school._id,
      coursesAssigned: course._id,
      isActive: { $ne: false }
    }).select('name email teacherId');

    courseTeachers.forEach(teacher => {
      teacherMap.set(teacher._id.toString(), {
        _id: teacher._id,
        name: teacher.name,
        email: teacher.email,
        teacherId: teacher.teacherId,
        uid: teacher.teacherId
      });
    });

    // Students enrolled via sections
    const studentMap = new Map();
    sections.forEach(s => {
      (s.students || []).forEach(st => {
        if (st && st._id) {
          studentMap.set(st._id.toString(), {
            _id: st._id,
            name: st.name,
            email: st.email,
            regNo: st.regNo
          });
        }
      });
    });

    const teachersArr = Array.from(teacherMap.values());
    const studentsArr = Array.from(studentMap.values());
    const totalStudents = studentsArr.length;
    const totalPages = Math.max(Math.ceil(totalStudents / limit), 1);
    const start = (page - 1) * limit;
    const pagedStudents = studentsArr.slice(start, start + limit);

    res.json({
      course: { _id: course._id, title: course.title, courseCode: course.courseCode },
      teachers: teachersArr,
      students: pagedStudents,
      pagination: {
        page,
        limit,
        total: totalStudents,
        totalPages
      }
    });
  } catch (err) {
    res.status(err.status || 500).json({ message: err.message });
  }
};

// GET /api/dean/teacher/:teacherId/details
exports.getTeacherDetails = async (req, res) => {
  try {
    const school = await getDeanSchool(req);
    const { teacherId } = req.params;

    const teacher = await User.findOne({ _id: teacherId, role: 'teacher', school: school._id, isActive: true })
      .select('name email teacherId department')
      .populate('department', 'name code')
      .lean();
    if (!teacher) return res.status(404).json({ message: 'Teacher not found in your school' });

    const sections = await Section.find({ teacher: teacher._id, school: school._id })
      .populate('courses', 'title courseCode')
      .select('name courses')
      .lean();

    // Derive unique courses across sections
    const courseMap = new Map();
    sections.forEach(sec => sec.courses?.forEach(c => c && courseMap.set(c._id.toString(), c)));

    res.json({
      teacher: {
        _id: teacher._id,
        name: teacher.name,
        email: teacher.email,
        teacherId: teacher.teacherId,
        department: teacher.department ? { _id: teacher.department._id, name: teacher.department.name, code: teacher.department.code } : null
      },
      courses: Array.from(courseMap.values()),
      sections: sections.map(s => ({ _id: s._id, name: s.name, courses: s.courses }))
    });
  } catch (err) {
    res.status(err.status || 500).json({ message: err.message });
  }
};

// GET /api/dean/student/:studentId/details
exports.getStudentDetails = async (req, res) => {
  try {
    console.log('🎯 Dean getStudentDetails called for studentId:', req.params.studentId);
    const school = await getDeanSchool(req);
    const { studentId } = req.params;

    // Verify student belongs to dean's school first
    const studentCheck = await User.findOne({ 
      _id: studentId, 
      role: 'student', 
      school: school._id, 
      isActive: true 
    });
    
    if (!studentCheck) return res.status(404).json({ message: 'Student not found in your school' });

    // Use the same analytics controller logic as admin but restrict to dean's school
    const analyticsController = require('./analyticsController');
    
    // Temporarily set req.user to bypass admin check and call the detailed analytics
    const originalParams = req.params;
    
    // Call the admin detailed analytics function directly
    try {
      const student = await User.findById(studentId).populate('watchHistory.video');
      
      if (!student) {
        return res.status(404).json({ message: 'Student not found' });
      }
      
      console.log(`🎬 Dean request: Processing student ${student.name} with ${student.watchHistory?.length || 0} watch history entries`);
      
      // Get courses through sections
      const sections = await Section.find({ 
        students: studentId,
        school: school._id  // Ensure sections are from dean's school
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
      console.log(`📚 Found ${studentCourses.length} courses for student in dean's school`);
      
      // Get quiz attempts for this student
      const QuizAttempt = require('../models/QuizAttempt');
      const quizAttempts = await QuizAttempt.find({ student: studentId })
        .populate('quiz', 'title course')
        .populate('quizPool', 'name course')
        .populate('course', 'title courseCode')
        .populate('unit', 'title order');
      
      console.log(`🎯 Found ${quizAttempts.length} quiz attempts for student`);
      
      // Get StudentProgress to get accurate video counts per course
      const StudentProgress = require('../models/StudentProgress');
      const courseIds = studentCourses.map(c => c._id);
      const [studentProgresses, readingMaterials] = await Promise.all([
        StudentProgress.find({
          student: studentId,
          course: { $in: courseIds }
        }).lean(),
        ReadingMaterial.find({
          course: { $in: courseIds },
          isApproved: { $ne: false },
          approvalStatus: { $ne: 'pending' }
        }).select('_id course').lean()
      ]);
      
      console.log(`📊 Found ${studentProgresses.length} progress records for student`);
      
      // Use the exact same logic as admin analytics
      const courseWatchHistory = {};
      const courseQuizData = {};
      const videoDetails = {};
      let totalWatchTime = 0;
      let totalQuizScore = 0;
      let totalQuizAttempts = 0;
      
      // Process watch history
      for (const item of student.watchHistory) {
        if (!item.video || !item.video._id) continue;
        
        // Round to 2 decimal places to avoid floating point precision issues
        totalWatchTime += Math.round((item.timeSpent || 0) * 100) / 100;
        
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
      
      console.log(`⏰ Total watch time calculated: ${totalWatchTime}s`);
      console.log(`📊 Course watch history:`, Object.keys(courseWatchHistory).length, 'courses');
      
      // Process quiz data (same as admin)
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
        
        // Calculate averages
        courseQuizData[courseId].averageScore = courseQuizData[courseId].totalScore / courseQuizData[courseId].totalAttempts;
        courseQuizData[courseId].averagePercentage = courseQuizData[courseId].totalMaxScore > 0 
          ? (courseQuizData[courseId].totalScore / courseQuizData[courseId].totalMaxScore) * 100
          : 0;
      }
      
      // Helper function to format time
      const formatTime = (seconds) => {
        if (!seconds || seconds < 0) return '0s';
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
      };
      
      // Build detailed course analytics (same structure as admin)
      const courseAnalytics = [];
      
      for (const course of studentCourses) {
        const courseId = course._id.toString();
        const watchData = courseWatchHistory[courseId] || { totalTime: 0, videos: {}, lastActivity: null };
        const quizData = courseQuizData[courseId] || { totalScore: 0, totalMaxScore: 0, totalAttempts: 0, quizzes: [], averageScore: 0, averagePercentage: 0 };
        
        // Calculate watch metrics for this course
        const videosWatched = Object.keys(watchData.videos).length;
        
        // Get reading materials for this course
        const courseReadingMats = readingMaterials.filter(rm => rm.course.toString() === courseId);
        const totalReadingMaterials = courseReadingMats.length;
        
        // Get course videos from StudentProgress (like HOD does) for accurate counts
        let totalVideos = 0;
        let actualVideosWatched = 0;
        
        // First try to get video counts from StudentProgress
        const courseProgress = studentProgresses.find(p => p.course.toString() === courseId);
        const completedReadingMaterials = courseProgress?.completedReadingMaterials?.length || 0;
        
        if (courseProgress && Array.isArray(courseProgress.units)) {
          courseProgress.units.forEach(unit => {
            if (Array.isArray(unit.videosWatched)) {
              totalVideos += unit.videosWatched.length;
              actualVideosWatched += unit.videosWatched.filter(v => v.completed).length;
            }
          });
        }
        
        // If no progress data, try to count from course/unit videos
        if (totalVideos === 0) {
          try {
            const courseWithVideos = await Course.findById(courseId)
              .populate('videos')
              .populate({
                path: 'units',
                populate: {
                  path: 'videos'
                }
              });
            
            // Count videos from course.videos array
            totalVideos = courseWithVideos?.videos?.length || 0;
            
            // Also count videos from units
            if (courseWithVideos?.units && courseWithVideos.units.length > 0) {
              courseWithVideos.units.forEach(unit => {
                if (unit.videos && Array.isArray(unit.videos)) {
                  totalVideos += unit.videos.length;
                }
              });
            }
            
            // Count only videos that have been actually watched (minimum 30 seconds)
            const MINIMUM_WATCH_TIME = 30;
            actualVideosWatched = Object.values(watchData.videos).filter(video => 
              video.timeSpent >= MINIMUM_WATCH_TIME
            ).length;
          } catch (err) {
            console.error('Error fetching course videos:', err);
          }
        }
        
        // Build unit-wise performance data - fetch course units first
        const unitMarks = [];
        let totalUnitQuizMarks = 0;
        let unitsWithQuizzes = 0;
        
        // Fetch course with units to get all unit information
        const courseWithUnits = await Course.findById(courseId).populate('units', 'title order').lean();
        
        // Get quiz data from StudentProgress (primary source for quizPool attempts)
        const progressQuizData = {};
        if (courseProgress && courseProgress.units) {
          courseProgress.units.forEach(unitProgress => {
            const unitId = unitProgress.unitId?.toString();
            if (unitId && unitProgress.quizAttempts && unitProgress.quizAttempts.length > 0) {
              // Find the best attempt
              let bestPercentage = 0;
              let passed = false;
              let attemptsCount = unitProgress.quizAttempts.length;
              
              unitProgress.quizAttempts.forEach(attempt => {
                const percentage = attempt.percentage || attempt.score || 0;
                if (percentage > bestPercentage) {
                  bestPercentage = percentage;
                }
                if (attempt.passed) {
                  passed = true;
                }
              });
              
              progressQuizData[unitId] = {
                bestPercentage,
                passed,
                attemptsCount,
                attempted: true
              };
            }
          });
        }
        
        // Also check QuizAttempt collection as fallback
        const courseQuizAttempts = quizAttempts.filter(qa => 
          qa.course && qa.course._id && qa.course._id.toString() === courseId
        );
        
        // Build unit marks - use course units as the source of truth
        if (courseWithUnits && courseWithUnits.units && courseWithUnits.units.length > 0) {
          courseWithUnits.units.forEach(unit => {
            const unitId = unit._id.toString();
            
            // First check StudentProgress data (quizPool attempts)
            if (progressQuizData[unitId]) {
              const data = progressQuizData[unitId];
              unitMarks.push({
                unitId: unit._id,
                unitTitle: unit.title || 'Unknown Unit',
                percentage: Math.round(data.bestPercentage * 100) / 100,
                quizMarks: Math.round(data.bestPercentage * 100) / 100,
                attemptsCount: data.attemptsCount,
                attempts: data.attemptsCount,
                attempted: true,
                status: data.passed ? 'Excellent' : (data.bestPercentage >= 40 ? 'Passed' : 'Failed')
              });
              totalUnitQuizMarks += data.bestPercentage;
              unitsWithQuizzes++;
            } else {
              // Fallback to QuizAttempt collection
              const unitQuizzes = courseQuizAttempts.filter(qa => 
                qa.unit && qa.unit._id && qa.unit._id.toString() === unitId
              );

              if (unitQuizzes.length > 0) {
                const bestScore = Math.max(...unitQuizzes.map(a => (a.score / a.maxScore) * 100 || 0));
                unitMarks.push({
                  unitId: unit._id,
                  unitTitle: unit.title || 'Unknown Unit',
                  percentage: Math.round(bestScore * 100) / 100,
                  quizMarks: Math.round(bestScore * 100) / 100,
                  attemptsCount: unitQuizzes.length,
                  attempts: unitQuizzes.length,
                  attempted: true,
                  status: bestScore >= 70 ? 'Excellent' : (bestScore >= 40 ? 'Passed' : 'Failed')
                });
                totalUnitQuizMarks += bestScore;
                unitsWithQuizzes++;
              } else {
                // Include units without quiz attempts
                unitMarks.push({
                  unitId: unit._id,
                  unitTitle: unit.title || 'Unknown Unit',
                  percentage: 0,
                  quizMarks: 0,
                  attemptsCount: 0,
                  attempts: 0,
                  attempted: false,
                  status: 'Not Attempted'
                });
              }
            }
          });
        }
        
        // Calculate course marks from unit quiz data (not from QuizAttempt collection)
        const calculatedCourseMarks = unitsWithQuizzes > 0 
          ? Math.round((totalUnitQuizMarks / unitsWithQuizzes) * 100) / 100
          : 0;
        
        // Calculate progress including reading materials
        const totalContent = totalVideos + totalReadingMaterials;
        const completedContent = actualVideosWatched + completedReadingMaterials;
        const calculatedProgress = totalContent > 0 ? (completedContent / totalContent) * 100 : 0;
        
        courseAnalytics.push({
          courseId: course._id,
          courseCode: course.courseCode || 'N/A',
          courseTitle: course.title || 'Unknown Course',
          sections: sections.filter(s => s.courses.some(c => c._id.toString() === courseId)).map(s => ({ id: s._id, name: s.name })),
          videosWatched: actualVideosWatched,
          totalVideos,
          totalReadingMaterials,
          readingMaterialsCompleted: completedReadingMaterials,
          watchTimeFormatted: formatTime(watchData.totalTime),
          overallProgress: Math.round(calculatedProgress * 100) / 100,
          courseMarks: calculatedCourseMarks,
          quizAnalytics: {
            totalScore: quizData.totalScore,
            totalMaxScore: quizData.totalMaxScore,
            totalAttempts: quizData.totalAttempts,
            averageScore: quizData.averageScore || 0,
            averagePercentage: calculatedCourseMarks,
            quizzes: quizData.quizzes.sort((a, b) => new Date(b.completedAt || 0) - new Date(a.completedAt || 0))
          },
          unitMarks
        });
      }

      // Calculate overall statistics
      const statistics = {
        totalCourses: studentCourses.length,
        averageProgress: courseAnalytics.length > 0 
          ? Math.round((courseAnalytics.reduce((sum, c) => sum + (c.overallProgress || 0), 0) / courseAnalytics.length) * 100) / 100
          : 0,
        averageMarks: courseAnalytics.length > 0
          ? Math.round((courseAnalytics.reduce((sum, c) => sum + (c.courseMarks || 0), 0) / courseAnalytics.length) * 100) / 100
          : 0,
        totalWatchTimeFormatted: formatTime(totalWatchTime),
        totalQuizAttempts,
        averageQuizScore: totalQuizAttempts > 0 ? totalQuizScore / totalQuizAttempts : 0,
        averageQuizPercentage: totalQuizAttempts > 0 && quizAttempts.length > 0 
          ? quizAttempts.reduce((sum, a) => sum + ((a.score || 0) / (a.maxScore || 1) * 100), 0) / quizAttempts.length 
          : 0
      };

      console.log(`📈 Final statistics:`, {
        totalCourses: statistics.totalCourses,
        averageProgress: statistics.averageProgress,
        totalWatchTime: statistics.totalWatchTimeFormatted,
        totalQuizAttempts: statistics.totalQuizAttempts
      });

      res.json({
        student: { 
          _id: student._id, 
          name: student.name, 
          email: student.email, 
          regNo: student.regNo,
          school: school,
          department: student.department
        },
        statistics,
        courseAnalytics
      });
      
    } catch (innerErr) {
      console.error('Error in dean student analytics:', innerErr);
      return res.status(500).json({ message: 'Error processing student analytics' });
    }
    
  } catch (err) {
    console.error('Dean getStudentDetails outer error:', err);
    res.status(err.status || 500).json({ message: err.message });
  }
};

// GET /api/dean/student/search?regNo=...
exports.getStudentByRegNo = async (req, res) => {
  try {
    const school = await getDeanSchool(req);
    const { regNo } = req.query;

    if (!regNo || typeof regNo !== 'string' || !regNo.trim()) {
      return res.status(400).json({ message: 'Registration number (regNo) is required' });
    }

    const student = await User.findOne({
      role: 'student',
      school: school._id,
      isActive: { $ne: false },
      regNo: regNo.trim()
    }).select('_id name email regNo').lean();

    if (!student) {
      return res.status(404).json({ message: 'Student not found in your school' });
    }

    res.json(student);
  } catch (err) {
    res.status(err.status || 500).json({ message: err.message });
  }
};

// GET /api/dean/students/search?q=...&limit=...
exports.searchStudents = async (req, res) => {
  try {
    const school = await getDeanSchool(req);
    const { q, limit = 10 } = req.query;

    if (!q || typeof q !== 'string' || q.trim().length < 2) {
      return res.status(400).json({ message: 'Search query (q) must be at least 2 characters' });
    }

    const searchTerm = q.trim();
    const searchLimit = Math.min(parseInt(limit) || 10, 50); // Cap at 50 results

    // Build fuzzy search query for name, email, and regNo
    const searchQuery = {
      role: 'student',
      school: school._id,
      isActive: { $ne: false },
      $or: [
        { name: { $regex: searchTerm, $options: 'i' } },
        { email: { $regex: searchTerm, $options: 'i' } },
        { regNo: { $regex: searchTerm, $options: 'i' } }
      ]
    };

    const students = await User.find(searchQuery)
      .select('_id name email regNo department')
      .populate('department', 'name')
      .limit(searchLimit)
      .lean();

    // Transform the results to match the expected frontend format
    const transformedResults = students.map(student => ({
      _id: student._id,
      name: student.name,
      regNo: student.regNo,
      email: student.email,
      department: student.department?.name || 'N/A',
      label: `${student.name} (${student.regNo})`,
      value: student.regNo
    }));

    res.json({ students: transformedResults, total: transformedResults.length });
  } catch (err) {
    console.error('Error searching students for dean:', err);
    res.status(err.status || 500).json({ message: err.message });
  }
};

// GET /api/dean/course/:courseId/sections
// Returns section-wise report for a course within dean's school
exports.getCourseSections = async (req, res) => {
  try {
    const school = await getDeanSchool(req);
    const { courseId } = req.params;
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.max(parseInt(req.query.limit, 10) || 25, 1);

  const course = await Course.findOne({ _id: courseId, school: school._id }).lean();
    if (!course) return res.status(404).json({ message: 'Course not found in your school' });

    const query = { school: school._id, courses: course._id, isActive: { $ne: false } };
    const total = await Section.countDocuments(query);
    const sections = await Section.find(query)
      .populate('teacher', 'name email teacherId department')
      .populate('students', '_id')
      .select('name teacher students')
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();

    const result = sections.map(s => ({
      _id: s._id,
      name: s.name,
      teacher: s.teacher ? {
        _id: s.teacher._id,
        name: s.teacher.name,
        email: s.teacher.email,
        teacherId: s.teacher.teacherId
      } : null,
      studentsCount: Array.isArray(s.students) ? s.students.length : 0
    }));

    res.json({
      course: { _id: course._id, title: course.title, courseCode: course.courseCode },
      pagination: { page, limit, total, totalPages: Math.max(Math.ceil(total / limit), 1) },
      sections: result
    });
  } catch (err) {
    res.status(err.status || 500).json({ message: err.message });
  }
};

// GET /api/dean/course/:courseId/sections/export?mode=summary|students
// Exports section-wise report CSV for a course. Default mode=summary
exports.exportCourseSectionsCsv = async (req, res) => {
  try {
    const school = await getDeanSchool(req);
    const { courseId } = req.params;
    const mode = (req.query.mode || 'summary').toString();

    const course = await Course.findOne({ _id: courseId, school: school._id });
    if (!course) return res.status(404).json({ message: 'Course not found in your school' });

    const sections = await Section.find({ school: school._id, courses: course._id, isActive: { $ne: false } })
      .populate('teacher', 'name email teacherId')
      .populate('students', 'name email regNo')
      .select('name teacher students')
      .lean();

    let csv = '';
    if (mode === 'students') {
      csv += 'Course Title,Course Code,Section Name,Teacher Name,Teacher ID,Student Name,Student Reg No,Student Email\n';
      sections.forEach(sec => {
        const t = sec.teacher || {};
        if (Array.isArray(sec.students) && sec.students.length > 0) {
          sec.students.forEach(st => {
            csv += [
              escapeCsv(course.title),
              escapeCsv(course.courseCode || ''),
              escapeCsv(sec.name),
              escapeCsv(t.name || ''),
              escapeCsv(t.teacherId || ''),
              escapeCsv(st.name || ''),
              escapeCsv(st.regNo || ''),
              escapeCsv(st.email || '')
            ].join(',') + '\n';
          });
        } else {
          // No students, still include a row to show empty
          csv += [
            escapeCsv(course.title),
            escapeCsv(course.courseCode || ''),
            escapeCsv(sec.name),
            escapeCsv(t.name || ''),
            escapeCsv(t.teacherId || ''),
            '', '', ''
          ].join(',') + '\n';
        }
      });
    } else {
      // summary
      csv += 'Course Title,Course Code,Section Name,Teacher Name,Teacher ID,Teacher Email,Students Count\n';
      sections.forEach(sec => {
        const t = sec.teacher || {};
        csv += [
          escapeCsv(course.title),
          escapeCsv(course.courseCode || ''),
          escapeCsv(sec.name),
          escapeCsv(t.name || ''),
          escapeCsv(t.teacherId || ''),
          escapeCsv(t.email || ''),
          (Array.isArray(sec.students) ? sec.students.length : 0)
        ].join(',') + '\n';
      });
    }

    const filename = `course_${(course.courseCode || course._id).toString()}_sections_${mode}.csv`;
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.status(200).send(csv);
  } catch (err) {
    res.status(err.status || 500).json({ message: err.message });
  }
};

// Helper: escape CSV fields (minimal)
function escapeCsv(value) {
  const s = String(value ?? '');
  if (/[",\n]/.test(s)) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

// GET /api/dean/section/:sectionId/analytics
// Returns detailed analytics for a section: per-student courses in section, unit-wise watch time and quiz scores, with department names
exports.getSectionAnalyticsDetailed = async (req, res) => {
  try {
    const school = await getDeanSchool(req);
    const { sectionId } = req.params;

    // Load section with relations
    const section = await Section.findOne({ _id: sectionId, school: school._id, isActive: { $ne: false } })
      .populate('courses', 'title courseCode department')
      .populate('department', 'name code')
      .populate('students', '_id name email regNo')
      .lean();
    if (!section) return res.status(404).json({ message: 'Section not found in your school' });

    const courseIds = (section.courses || []).map(c => c._id);
    const dept = section.department ? { _id: section.department._id, name: section.department.name, code: section.department.code } : null;

    // Fetch units for each course
  const units = await Unit.find({ course: { $in: courseIds } }).select('_id title course order').lean();
    const unitsByCourse = units.reduce((acc, u) => {
      const cid = u.course.toString();
      if (!acc[cid]) acc[cid] = [];
      acc[cid].push({ _id: u._id, title: u.title, order: u.order });
      return acc;
    }, {});

    // Progress docs for students in this section for the section's courses
    const studentIds = (section.students || []).map(s => s._id);
  const progresses = await StudentProgress.find({ student: { $in: studentIds }, course: { $in: courseIds } }).lean();

    // Build quick lookup by student->course
    const progByStudentCourse = new Map(); // key: `${studentId}:${courseId}` => progressDoc
    for (const p of progresses) {
      progByStudentCourse.set(`${p.student.toString()}:${p.course.toString()}`, p);
    }

    // Optionally fetch latest quiz attempts per student-course-unit (fallback source)
    const quizAttempts = await QuizAttempt.find({
      student: { $in: studentIds },
      course: { $in: courseIds },
      isComplete: true
    }).select('student course unit percentage passed completedAt').lean();

    const quizByStuCourseUnit = new Map(); // key `${sid}:${cid}:${uid}` -> latest attempt
    for (const qa of quizAttempts) {
      const key = `${qa.student.toString()}:${qa.course?.toString()}:${qa.unit?.toString()}`;
      const existing = quizByStuCourseUnit.get(key);
      if (!existing || (qa.completedAt && (!existing.completedAt || qa.completedAt > existing.completedAt))) {
        quizByStuCourseUnit.set(key, qa);
      }
    }

    // Compose students array with per-course and per-unit metrics
    const students = (section.students || []).map(st => {
      const studentCourses = (section.courses || []).map(c => {
        const key = `${st._id.toString()}:${c._id.toString()}`;
        const p = progByStudentCourse.get(key);
        // Unit metrics
        const unitList = (unitsByCourse[c._id.toString()] || []).sort((a,b) => a.order - b.order).map(u => {
          // from StudentProgress units array
          let watchedSeconds = 0;
          let completedVideos = 0;
          let totalVideos = 0;
          let quizPct = null;
          let quizPassed = null;
          let attemptsCount = 0;
          let blocked = null;
          if (p && Array.isArray(p.units)) {
            const up = p.units.find(x => x.unitId && x.unitId.toString() === u._id.toString());
            if (up) {
              totalVideos = Array.isArray(up.videosWatched) ? up.videosWatched.length : 0;
              watchedSeconds = (up.videosWatched || []).reduce((sum, vw) => sum + (vw.timeSpent || 0), 0);
              completedVideos = (up.videosWatched || []).filter(vw => vw.completed).length;
              attemptsCount = Array.isArray(up.quizAttempts) ? up.quizAttempts.length : 0;
              if (up.securityLock && typeof up.securityLock.locked === 'boolean') {
                blocked = up.securityLock.locked;
              }
              // Prefer StudentProgress embedded quizAttempts as source of truth
              if (Array.isArray(up.quizAttempts) && up.quizAttempts.length > 0) {
                const completedAttempts = up.quizAttempts.filter(a => !!a.completedAt);
                if (completedAttempts.length > 0) {
                  const sorted = completedAttempts.sort((a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime());
                  const latest = sorted[0];
                  if (latest && typeof latest.percentage === 'number') quizPct = latest.percentage;
                  if (typeof latest?.passed === 'boolean') quizPassed = latest.passed;
                }
              }
            }
          }
          // Fallback to QuizAttempt collection if SP has no attempt info
          if (quizPct === null || quizPassed === null) {
            const qa = quizByStuCourseUnit.get(`${st._id.toString()}:${c._id.toString()}:${u._id.toString()}`);
            if (qa) {
              if (quizPct === null && typeof qa.percentage === 'number') quizPct = qa.percentage;
              if (quizPassed === null && typeof qa.passed === 'boolean') quizPassed = qa.passed;
            }
          }
          return {
            unitId: u._id,
            unitTitle: u.title,
            videosCompleted: completedVideos,
            videosWatched: totalVideos,
            watchTime: watchedSeconds,
            quizPercentage: quizPct,
            quizPassed: quizPassed,
            attemptsCount,
            blocked
          };
        });

        const totalWatch = unitList.reduce((s, x) => s + (x.watchTime || 0), 0);
        const avgQuiz = (() => {
          const vals = unitList.map(x => x.quizPercentage).filter(v => typeof v === 'number');
          return vals.length ? (vals.reduce((a,b)=>a+b,0) / vals.length) : null;
        })();

        return {
          courseId: c._id,
          courseTitle: c.title,
          courseCode: c.courseCode,
          departmentName: dept?.name || null,
          totalWatchTime: totalWatch,
          averageQuiz: avgQuiz,
          units: unitList
        };
      });

      return {
        _id: st._id,
        name: st.name,
        email: st.email,
        regNo: st.regNo,
        courses: studentCourses
      };
    });

    res.json({
      section: { _id: section._id, name: section.name },
      department: dept,
      courses: (section.courses || []).map(c => ({ _id: c._id, title: c.title, courseCode: c.courseCode })),
      students
    });
  } catch (err) {
    console.error('Dean section analytics error:', err);
    res.status(err.status || 500).json({ message: err.message });
  }
};

// GET /api/dean/sections?departmentId=&q=&page=&limit=
// Lists sections across the dean's school (not course-bound) with optional filters
exports.getSections = async (req, res) => {
  try {
    const school = await getDeanSchool(req);
    const { departmentId, q } = req.query;
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.max(parseInt(req.query.limit, 10) || 25, 1);

    const filter = { school: school._id, isActive: { $ne: false } };
    if (departmentId) filter.department = departmentId;
    if (q && typeof q === 'string') filter.name = { $regex: q.trim(), $options: 'i' };

    const total = await Section.countDocuments(filter);
    const sections = await Section.find(filter)
      .populate('teacher', 'name email teacherId')
      .populate('courses', 'title courseCode')
      .populate('department', 'name code')
      .populate('students', '_id')
      .select('name teacher courses department students')
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();

    const data = sections.map(s => ({
      _id: s._id,
      name: s.name,
      department: s.department ? { _id: s.department._id, name: s.department.name, code: s.department.code } : null,
      teacher: s.teacher ? { _id: s.teacher._id, name: s.teacher.name, email: s.teacher.email, teacherId: s.teacher.teacherId } : null,
      studentsCount: Array.isArray(s.students) ? s.students.length : 0,
      courses: (s.courses || []).map(c => ({ _id: c._id, title: c.title, courseCode: c.courseCode }))
    }));

    res.json({
      pagination: { page, limit, total, totalPages: Math.max(Math.ceil(total / limit), 1) },
      sections: data
    });
  } catch (err) {
    res.status(err.status || 500).json({ message: err.message });
  }
};

// GET /api/dean/section/:sectionId/analytics/export
// Exports detailed section analytics (student/course/unit) as CSV
exports.exportSectionAnalyticsCsv = async (req, res) => {
  try {
    const school = await getDeanSchool(req);
    const { sectionId } = req.params;

    const section = await Section.findOne({ _id: sectionId, school: school._id, isActive: { $ne: false } })
      .populate('courses', 'title courseCode department')
      .populate('department', 'name code')
      .populate('students', '_id name email regNo')
      .lean();
    if (!section) return res.status(404).json({ message: 'Section not found in your school' });

    const courseIds = (section.courses || []).map(c => c._id);
    const deptName = section.department ? section.department.name : '';

    // Units per course
  const units = await Unit.find({ course: { $in: courseIds } }).select('_id title course order').lean();
    const unitsByCourse = units.reduce((acc, u) => {
      const cid = u.course.toString();
      if (!acc[cid]) acc[cid] = [];
      acc[cid].push({ _id: u._id, title: u.title, order: u.order });
      return acc;
    }, {});
    for (const cid of Object.keys(unitsByCourse)) {
      unitsByCourse[cid].sort((a,b)=>a.order-b.order);
    }

    const studentIds = (section.students || []).map(s => s._id);
    const progresses = await StudentProgress.find({ student: { $in: studentIds }, course: { $in: courseIds } }).lean();
    const progByStudentCourse = new Map();
    for (const p of progresses) {
      progByStudentCourse.set(`${p.student.toString()}:${p.course.toString()}`, p);
    }

    const quizAttempts = await QuizAttempt.find({
      student: { $in: studentIds },
      course: { $in: courseIds },
      isComplete: true
    }).select('student course unit percentage passed completedAt').lean();

    const quizByStuCourseUnit = new Map();
    for (const qa of quizAttempts) {
      const key = `${qa.student.toString()}:${qa.course?.toString()}:${qa.unit?.toString()}`;
      const existing = quizByStuCourseUnit.get(key);
      if (!existing || (qa.completedAt && (!existing.completedAt || qa.completedAt > existing.completedAt))) {
        quizByStuCourseUnit.set(key, qa);
      }
    }

    let csv = 'Section,Department,Student Name,Reg No,Email,Course Title,Course Code,Unit,Watch Time (min),Videos Completed,Videos Watched,Quiz %,Passed,Attempts,Blocked\n';

    for (const st of (section.students || [])) {
      for (const c of (section.courses || [])) {
        const key = `${st._id.toString()}:${c._id.toString()}`;
        const p = progByStudentCourse.get(key);
        const unitList = (unitsByCourse[c._id.toString()] || []);
        for (const u of unitList) {
          let watchedSeconds = 0;
          let completedVideos = 0;
          let totalVideos = 0;
          let quizPct = null;
          let quizPassed = null;
          let attemptsCount = 0;
          let blocked = null;

          if (p && Array.isArray(p.units)) {
            const up = p.units.find(x => x.unitId && x.unitId.toString() === u._id.toString());
            if (up) {
              totalVideos = Array.isArray(up.videosWatched) ? up.videosWatched.length : 0;
              watchedSeconds = (up.videosWatched || []).reduce((sum, vw) => sum + (vw.timeSpent || 0), 0);
              completedVideos = (up.videosWatched || []).filter(vw => vw.completed).length;
              attemptsCount = Array.isArray(up.quizAttempts) ? up.quizAttempts.length : 0;
              if (up.securityLock && typeof up.securityLock.locked === 'boolean') {
                blocked = up.securityLock.locked;
              }
              if (Array.isArray(up.quizAttempts) && up.quizAttempts.length > 0) {
                const completedAttempts = up.quizAttempts.filter(a => !!a.completedAt);
                if (completedAttempts.length > 0) {
                  const sorted = completedAttempts.sort((a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime());
                  const latest = sorted[0];
                  if (latest && typeof latest.percentage === 'number') quizPct = latest.percentage;
                  if (typeof latest?.passed === 'boolean') quizPassed = latest.passed;
                }
              }
            }
          }
          if (quizPct === null || quizPassed === null) {
            const qa = quizByStuCourseUnit.get(`${st._id.toString()}:${c._id.toString()}:${u._id.toString()}`);
            if (qa) {
              if (quizPct === null && typeof qa.percentage === 'number') quizPct = qa.percentage;
              if (quizPassed === null && typeof qa.passed === 'boolean') quizPassed = qa.passed;
            }
          }

          const row = [
            escapeCsv(section.name),
            escapeCsv(deptName),
            escapeCsv(st.name || ''),
            escapeCsv(st.regNo || ''),
            escapeCsv(st.email || ''),
            escapeCsv(c.title || ''),
            escapeCsv(c.courseCode || ''),
            escapeCsv(u.title || ''),
            Math.round((watchedSeconds || 0) / 60),
            completedVideos,
            totalVideos,
            quizPct === null ? '' : Math.round(quizPct),
            quizPassed === null ? '' : (quizPassed ? 'Yes' : 'No'),
            attemptsCount,
            blocked === null ? '' : (blocked ? 'Yes' : 'No')
          ].join(',');
          csv += row + '\n';
        }
      }
    }

    const filename = `section_${section._id.toString()}_analytics.csv`;
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.status(200).send(csv);
  } catch (err) {
    console.error('Dean section analytics export error:', err);
    res.status(err.status || 500).json({ message: err.message });
  }
};

// GET /api/dean/announcement/options
exports.getAnnouncementOptions = async (req, res) => {
  try {
    const dean = await User.findById(req.user._id).populate({
      path: 'school',
      select: 'name _id',
      populate: {
        path: 'departments',
        select: 'name _id hod',
        populate: {
          path: 'hod',
          select: 'name email _id'
        }
      }
    });

    if (!dean.school) {
      return res.status(400).json({ message: 'Dean is not assigned to any school.' });
    }

    // Get all schools for "other schools" option
    const allSchools = await School.find({ _id: { $ne: dean.school._id } })
      .select('name _id')
      .lean();

    // Get dean's school departments with HODs
    const mySchoolDepartments = dean.school.departments.map(dept => ({
      _id: dept._id,
      name: dept.name,
      hod: dept.hod ? {
        _id: dept.hod._id,
        name: dept.hod.name,
        email: dept.hod.email
      } : null
    }));

    // Get ALL teachers in dean's school (not grouped by department)
    const allTeachers = await User.find({
      $or: [
        { roles: { $in: ['teacher'] } },
        { role: 'teacher' }
      ],
      school: dean.school._id,
      isActive: true
    }).select('name email teacherId _id department').populate('department', 'name').lean();

    // Remove duplicates based on _id
    const uniqueTeachers = allTeachers.filter((teacher, index, self) => 
      index === self.findIndex(t => t._id.toString() === teacher._id.toString())
    );

    // Get ALL HODs in dean's school
    const allHODs = dean.school.departments
      .filter(dept => dept.hod)
      .map(dept => ({
        _id: dept.hod._id,
        name: dept.hod.name,
        email: dept.hod.email,
        department: {
          _id: dept._id,
          name: dept.name
        }
      }));

    // Get ALL sections in dean's school (sections are connected to school, not department)
    const allSections = await Section.find({
      school: dean.school._id,
      isActive: true
    }).select('name _id students').populate('students', 'name email regNo').lean();

    const sectionsData = allSections.map(section => ({
      _id: section._id,
      name: section.name,
      studentCount: section.students?.length || 0,
      students: section.students || []
    }));

    res.json({
      mySchool: {
        _id: dean.school._id,
        name: dean.school.name,
        departments: mySchoolDepartments,
        teachers: uniqueTeachers,
        hods: allHODs,
        sections: sectionsData
      },
      otherSchools: allSchools
    });
  } catch (err) {
    console.error('Error getting dean announcement options:', err);
    res.status(500).json({ message: err.message });
  }
};

// POST /api/dean/announcement
exports.createDeanAnnouncement = async (req, res) => {
  try {
    const { title, message, schoolScope, targetRoles, targetSchools, teachers, hods, sections, priority } = req.body;

    if (!title || !message || !schoolScope || !targetRoles || !Array.isArray(targetRoles) || targetRoles.length === 0) {
      return res.status(400).json({ 
        message: 'Title, message, school scope, and target roles are required.' 
      });
    }

    const dean = await User.findById(req.user._id).populate('school', 'name _id');

    if (!dean.school) {
      return res.status(400).json({ message: 'Dean is not assigned to any school.' });
    }

    const Announcement = require('../models/Announcement');
    let recipients = [];
    let targetAudience = {
      targetRoles: targetRoles,
      schoolScope: schoolScope
    };

    // Handle school scope
    if (schoolScope === 'mySchool') {
      // Process each target role for dean's school - NO department dependency
      
      if (targetRoles.includes('hod')) {
        if (hods && hods.length > 0) {
          // Use specifically selected HODs
          recipients.push(...hods);
        } else {
          // Get ALL HODs in dean's school
          const allDepartments = await Department.find({
            school: dean.school._id,
            hod: { $ne: null }
          }).populate('hod', '_id').lean();
          
          recipients.push(...allDepartments.map(dept => dept.hod._id));
        }
      }

      if (targetRoles.includes('teacher')) {
        if (teachers && teachers.length > 0) {
          // Use specifically selected teachers
          console.log('📋 Specifically selected teachers:', teachers);
          recipients.push(...teachers);
        } else {
          // Get ALL teachers in dean's school
          const allTeachers = await User.find({
            $or: [
              { roles: { $in: ['teacher'] } },
              { role: 'teacher' }
            ],
            school: dean.school._id,
            isActive: true
          }).select('_id').lean();
          
          console.log('📋 Found ALL teachers in school:', allTeachers.length);
          recipients.push(...allTeachers.map(teacher => teacher._id));
        }
      }

      if (targetRoles.includes('student')) {
        if (sections && sections.length > 0) {
          // Get students from specifically selected sections
          const selectedSections = await Section.find({
            _id: { $in: sections },
            school: dean.school._id
          }).populate('students', '_id').lean();
          
          selectedSections.forEach(section => {
            if (section.students) {
              recipients.push(...section.students.map(student => student._id));
            }
          });
        } else {
          // Get ALL students in dean's school (from all sections)
          const allSections = await Section.find({
            school: dean.school._id,
            isActive: true
          }).populate('students', '_id').lean();
          
          allSections.forEach(section => {
            if (section.students) {
              recipients.push(...section.students.map(student => student._id));
            }
          });
        }
      }

      // Create announcement for own school
      console.log('🎯 Creating announcement with recipients:', recipients.length);
      console.log('📤 Unique recipients:', [...new Set(recipients.map(id => id.toString()))].length);
      
      const announcement = new Announcement({
        sender: req.user._id,
        role: 'dean',
        title,
        message,
        targetAudience: {
          ...targetAudience,
          specificUsers: [...new Set(recipients.map(id => id.toString()))]
        },
        requiresApproval: false,
        approvalStatus: 'approved',
        hodReviewRequired: false,
        approvedBy: req.user._id,
        approvedAt: new Date(),
        approvalComments: 'Auto-approved (sender is Dean)'
      });

      await announcement.save();
      
      console.log('✅ Announcement saved with targetAudience:', JSON.stringify(announcement.targetAudience, null, 2));

      // Send notifications to all recipients
      console.log('🔔 Sending notifications to recipients...');
      const NotificationController = require('./notificationController');
      
      if (NotificationController && NotificationController.createNotification) {
        // Filter out the sender from recipients
        const recipientsToNotify = recipients.filter(rid => rid.toString() !== req.user._id.toString());
        
        console.log(`📤 Sending notifications to ${recipientsToNotify.length} recipients`);
        
        // Send notifications asynchronously (fire-and-forget)
        (async () => {
          try {
            for (const recipientId of recipientsToNotify) {
              await NotificationController.createNotification({
                type: 'announcement',
                recipient: recipientId,
                message: `New announcement from Dean: ${title}`,
                data: { 
                  announcementId: announcement._id,
                  priority: priority || 'medium',
                  senderRole: 'dean',
                  senderName: dean.name
                },
                announcement: announcement._id
              });
            }
            console.log('✅ Dean announcement notifications sent successfully');
          } catch (notifyErr) {
            console.error('❌ Error sending dean announcement notifications:', notifyErr);
          }
        })();
      } else {
        console.error('❌ NotificationController not available');
      }

      res.json({ 
        message: 'Dean announcement created successfully.',
        announcementId: announcement._id,
        recipientsCount: recipients.length,
        status: 'approved'
      });

    } else if (schoolScope === 'otherSchools') {
      // Inter-school announcements - send to target school deans for approval
      
      if (!targetSchools || !Array.isArray(targetSchools) || targetSchools.length === 0) {
        return res.status(400).json({ message: 'Target schools must be selected for inter-school announcements.' });
      }

      // Get target school deans
      const targetSchoolData = await School.find({
        _id: { $in: targetSchools }
      }).populate('dean', '_id name email').lean();

      if (targetSchoolData.length === 0) {
        return res.status(400).json({ message: 'No valid target schools found.' });
      }

      // Create approval request announcements for each target school dean
      const approvalRequests = [];
      
      for (const school of targetSchoolData) {
        if (school.dean) {
          const approvalRequest = new Announcement({
            sender: req.user._id,
            role: 'dean',
            title: `[INTER-SCHOOL REQUEST] ${title}`,
            message: `${message}\n\n--- \nThis is an inter-school announcement request from ${dean.school.name}. Please review and approve to distribute to your school.`,
            targetAudience: {
              ...targetAudience,
              targetSchool: school._id,
              originalTargetRoles: targetRoles,
              specificUsers: [school.dean._id]
            },
            requiresApproval: true,
            approvalStatus: 'pending',
            hodReviewRequired: false,
            interSchoolRequest: true,
            sourceSchool: dean.school._id,
            targetSchool: school._id
          });

          await approvalRequest.save();
          approvalRequests.push(approvalRequest);

          // Send notification to target dean
          const NotificationController = require('./notificationController');
          if (NotificationController && NotificationController.createNotification) {
            await NotificationController.createNotification({
              type: 'inter_school_announcement_request',
              recipient: school.dean._id,
              message: `Inter-school announcement request from ${dean.school.name}: "${title}"`,
              data: { 
                announcementId: approvalRequest._id,
                sourceSchool: dean.school.name,
                senderName: dean.name
              }
            });
          }
        }
      }

      res.json({ 
        message: `Inter-school announcement requests sent to ${approvalRequests.length} school dean(s) for approval.`,
        approvalRequestIds: approvalRequests.map(req => req._id),
        targetSchools: targetSchoolData.length,
        status: 'pending_approval'
      });
    }

  } catch (err) {
    console.error('Error creating dean announcement:', err);
    res.status(500).json({ message: err.message });
  }
};

// GET /api/dean/announcements/history
exports.getDeanAnnouncementHistory = async (req, res) => {
  try {
    const { page = 1, limit = 10, status, dateFrom, dateTo } = req.query;
    const pageNum = Math.max(parseInt(page), 1);
    const limitNum = Math.max(parseInt(limit), 1);
    const skip = (pageNum - 1) * limitNum;

    // Build filter
    const filter = { 
      sender: req.user._id,
      role: 'dean'
    };

    if (status && ['pending', 'approved', 'rejected'].includes(status)) {
      filter.approvalStatus = status;
    }

    if (dateFrom || dateTo) {
      filter.createdAt = {};
      if (dateFrom) filter.createdAt.$gte = new Date(dateFrom);
      if (dateTo) filter.createdAt.$lte = new Date(dateTo + 'T23:59:59.999Z');
    }

    // Get announcements with populated data
    const announcements = await Announcement.find(filter)
      .populate('targetAudience.specificUsers', 'name email role regNo teacherId')
      .populate('approvedBy', 'name email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum)
      .lean();

    const total = await Announcement.countDocuments(filter);

    // Format response data
    const formattedAnnouncements = announcements.map(announcement => {
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
        approvalStatus: announcement.approvalStatus,
        requiresApproval: announcement.requiresApproval,
        interSchoolRequest: announcement.interSchoolRequest || false,
        sourceSchool: announcement.sourceSchool ? {
          _id: announcement.sourceSchool._id,
          name: announcement.sourceSchool.name
        } : null,
        targetSchool: announcement.targetSchool ? {
          _id: announcement.targetSchool._id,
          name: announcement.targetSchool.name
        } : null,
        schoolScope: announcement.targetAudience?.schoolScope || 'mySchool',
        targetRoles: announcement.targetAudience?.targetRoles || [],
        participantStats,
        participantDetails,
        approvedBy: announcement.approvedBy ? {
          _id: announcement.approvedBy._id,
          name: announcement.approvedBy.name,
          email: announcement.approvedBy.email
        } : null,
        approvalNote: announcement.approvalNote,
        approvalComments: announcement.approvalComments
      };
    });

    res.json({
      announcements: formattedAnnouncements,
      pagination: {
        currentPage: pageNum,
        totalPages: Math.ceil(total / limitNum),
        totalItems: total,
        itemsPerPage: limitNum,
        hasNextPage: pageNum < Math.ceil(total / limitNum),
        hasPreviousPage: pageNum > 1
      }
    });

  } catch (err) {
    console.error('Error fetching dean announcement history:', err);
    res.status(500).json({ message: err.message });
  }
};

// GET /api/dean/teachers - Get all teachers in Dean's school
exports.getTeachers = async (req, res) => {
  try {
    const school = await getDeanSchool(req);
    
    console.log(`🏫 Dean fetching teachers for school: ${school.name} (${school._id})`);
    
    // Get all teachers in Dean's school with their department information
    const teachers = await User.find({
      school: school._id,
      $or: [
        { role: 'teacher' },
        { roles: { $in: ['teacher'] } }
      ],
      isActive: { $ne: false }
    })
    .populate('department', 'name code')
    .select('firstName lastName name email phone teacherId isActive department')
    .sort({ firstName: 1, lastName: 1 })
    .lean();
    
    console.log(`👨‍🏫 Found ${teachers.length} teachers in school`);
    
    // Format the response to match the expected frontend structure
    const formattedTeachers = teachers.map(teacher => ({
      _id: teacher._id,
      firstName: teacher.firstName || teacher.name?.split(' ')[0] || '',
      lastName: teacher.lastName || teacher.name?.split(' ')?.slice(1)?.join(' ') || '',
      name: teacher.name || `${teacher.firstName || ''} ${teacher.lastName || ''}`.trim(),
      email: teacher.email,
      phone: teacher.phone,
      teacherId: teacher.teacherId,
      isActive: teacher.isActive !== false,
      department: teacher.department || (teacher.assignedDepartments && teacher.assignedDepartments.length > 0 ? teacher.assignedDepartments[0] : null),
      allDepartments: teacher.assignedDepartments || (teacher.department ? [teacher.department] : [])
    }));
    
    res.json({
      success: true,
      teachers: formattedTeachers,
      count: formattedTeachers.length,
      school: {
        id: school._id,
        name: school.name,
        code: school.code
      }
    });
    
  } catch (err) {
    console.error('Error fetching teachers for dean:', err);
    res.status(err.status || 500).json({ 
      success: false,
      message: err.message || 'Error fetching teachers',
      error: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });
  }
};

// GET /api/dean/courses - Get all courses in Dean's school
exports.getCourses = async (req, res) => {
  try {
    const school = await getDeanSchool(req);
    
    console.log(`🏫 Dean fetching courses for school: ${school.name} (${school._id})`);
    
    // Get all departments in Dean's school
    const departments = await Department.find({ school: school._id }).select('_id');
    const departmentIds = departments.map(d => d._id);
    
    // Get all courses in these departments
    const courses = await Course.find({
      department: { $in: departmentIds },
      isActive: { $ne: false }
    })
    .populate('department', 'name code')
    .select('title courseCode credits description department')
    .sort({ courseCode: 1 })
    .lean();
    
    console.log(`📚 Found ${courses.length} courses in school`);
    
    res.json({
      success: true,
      courses: courses,
      count: courses.length,
      school: {
        id: school._id,
        name: school.name,
        code: school.code
      }
    });
    
  } catch (err) {
    console.error('Error fetching courses for dean:', err);
    res.status(err.status || 500).json({ 
      success: false,
      message: err.message || 'Error fetching courses',
      error: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });
  }
};

// GET /api/dean/profile - Get Dean's own profile information  
exports.getProfile = async (req, res) => {
  try {
    const dean = await User.findById(req.user.id)
      .populate('school', 'name code')
      .select('firstName lastName name email phone teacherId isActive school')
      .lean();
      
    if (!dean) {
      return res.status(404).json({
        success: false,
        message: 'Dean profile not found'
      });
    }
    
    const formattedProfile = {
      _id: dean._id,
      firstName: dean.firstName || dean.name?.split(' ')[0] || '',
      lastName: dean.lastName || dean.name?.split(' ')?.slice(1)?.join(' ') || '',
      name: dean.name || `${dean.firstName || ''} ${dean.lastName || ''}`.trim(),
      email: dean.email,
      phone: dean.phone,
      teacherId: dean.teacherId,
      isActive: dean.isActive !== false,
      school: dean.school
    };
    
    res.json({
      success: true,
      profile: formattedProfile
    });

  } catch (err) {
    console.error('Error fetching dean profile:', err);
    res.status(500).json({
      success: false,
      message: 'Error fetching profile',
      error: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });
  }
};

// GET /api/dean/students/search - Search students with fuzzy matching
exports.searchStudents = async (req, res) => {
  try {
    const school = await getDeanSchool(req);
    const { q, limit = 10 } = req.query;

    if (!q || typeof q !== 'string' || q.trim().length < 2) {
      return res.status(400).json({ message: 'Search query (q) must be at least 2 characters' });
    }

    const searchTerm = q.trim();
    const searchLimit = Math.min(parseInt(limit) || 10, 50); // Cap at 50 results

    // Build fuzzy search query for name, email, and regNo
    const searchQuery = {
      role: 'student',
      school: school._id,
      isActive: { $ne: false },
      $or: [
        { name: { $regex: searchTerm, $options: 'i' } },
        { email: { $regex: searchTerm, $options: 'i' } },
        { regNo: { $regex: searchTerm, $options: 'i' } }
      ]
    };

    const students = await User.find(searchQuery)
      .select('_id name email regNo department')
      .populate('department', 'name')
      .limit(searchLimit)
      .lean();

    // Transform the results to match the expected frontend format
    const transformedResults = students.map(student => ({
      _id: student._id,
      name: student.name,
      regNo: student.regNo,
      email: student.email,
      department: student.department?.name || 'N/A',
      label: `${student.name} (${student.regNo})`,
      value: student.regNo
    }));

    res.json({ students: transformedResults, total: transformedResults.length });
  } catch (err) {
    console.error('Error searching students for dean:', err);
    res.status(err.status || 500).json({ message: err.message });
  }
};

// Get recent activity for Dean dashboard
exports.getRecentActivity = async (req, res) => {
  try {
    const school = await getDeanSchool(req);
    const schoolId = school._id;
    
    // Get all departments in the school
    const Department = require('../models/Department');
    const departments = await Department.find({ school: schoolId }).distinct('_id');
    
    // Get all courses in school departments
    const Course = require('../models/Course');
    const courses = await Course.find({ department: { $in: departments } }).distinct('_id');
    
    // Get recent student progress in school courses
    const StudentProgress = require('../models/StudentProgress');
    const recentProgress = await StudentProgress.find({
      course: { $in: courses },
      lastActivity: { $exists: true, $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
    })
    .populate('student', 'name email regNo')
    .populate('course', 'title courseCode')
    .sort({ lastActivity: -1 })
    .limit(15);
    
    // Get recent announcements (school-wide)
    const Announcement = require('../models/Announcement');
    const recentAnnouncements = await Announcement.find({
      $or: [
        { 'targetAudience.isGlobal': true },
        { 'targetAudience.targetSchools': { $in: [req.user.school] } },
        { 'targetAudience.allUsers': true },
        { recipients: { $in: ['dean', 'student', 'teacher', 'hod'] } }
      ]
    })
      .populate('sender', 'name email role')
      .sort({ createdAt: -1 })
      .limit(5);
    
    // Get recent quiz attempts in school courses
    const QuizAttempt = require('../models/QuizAttempt');
    const recentQuizAttempts = await QuizAttempt.find({
      course: { $in: courses },
      completedAt: { $exists: true, $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
    })
    .populate('student', 'name email regNo')
    .populate('course', 'title courseCode')
    .sort({ completedAt: -1 })
    .limit(15);
    
    // Format activities
    const activities = [];
    
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
    
    res.json({
      success: true,
      activities: activities.slice(0, 15)
    });
    
  } catch (error) {
    console.error('Error fetching Dean recent activity:', error);
    res.status(500).json({ 
      success: false,
      message: 'Error fetching recent activity' 
    });
  }
};
