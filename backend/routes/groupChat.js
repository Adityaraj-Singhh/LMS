const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const GroupChat = require('../models/GroupChat');
const User = require('../models/User');
const Course = require('../models/Course');
const Section = require('../models/Section');
const ChatReadReceipt = require('../models/ChatReadReceipt');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { logGroupChat } = require('../utils/auditLogger');
const bunnyStorageService = require('../services/bunnyStorageService');

// Helper function to extract S3 key from URL
function extractS3KeyFromUrl(s3Url) {
  try {
    const url = new URL(s3Url);
    let key = url.pathname;
    if (key.startsWith('/')) {
      key = key.substring(1);
    }
    
    // Decode URL-encoded characters (like %20 for spaces)
    // S3 is no longer used - file downloads not supported
    console.log('S3 file download requested but S3 has been removed');
    return null;
  } catch (error) {
    console.error('Error with file URL:', error);
    return null;
  }
}

// File upload temporarily disabled - pending Bunny Stream migration
// Configure memory storage for multer (to be replaced with Bunny Stream)
const storage = multer.memoryStorage();

// File filter for validation
const fileFilter = (req, file, cb) => {
  const allowedImages = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
  const allowedDocs = [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain',
    'text/csv'
  ];

  if (allowedImages.includes(file.mimetype) || allowedDocs.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type. Only images and documents are allowed.'), false);
  }
};

const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  }
});

// Middleware to verify JWT token
const verifyToken = (req, res, next) => {
  const token = req.header('Authorization')?.replace('Bearer ', '');
  
  if (!token) {
    return res.status(401).json({ message: 'No token, authorization denied' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    res.status(401).json({ message: 'Token is not valid' });
  }
};

// Middleware to check if user has access to the chat room
const checkChatAccess = async (req, res, next) => {
  try {
    const { courseId, sectionId } = req.params;
    const userId = req.user.id;

    // Validate ObjectId format
    const objectIdPattern = /^[0-9a-fA-F]{24}$/;
    if (!objectIdPattern.test(courseId)) {
      console.log('Invalid courseId format in checkChatAccess:', courseId);
      return res.status(400).json({ message: 'Invalid courseId format' });
    }
    if (!objectIdPattern.test(sectionId)) {
      console.log('Invalid sectionId format in checkChatAccess:', sectionId);
      return res.status(400).json({ message: 'Invalid sectionId format' });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Check if user has access to this course/section
    const section = await Section.findById(sectionId).populate('courses students teachers');
    const course = await Course.findById(courseId).populate('coordinators');
    
    if (!section || !course) {
      return res.status(404).json({ message: 'Course or section not found' });
    }

    let hasAccess = false;

    // Admin, Dean, HOD, superadmin have access to all chats
    if (user.roles && ['admin', 'dean', 'hod', 'superadmin'].some(role => user.roles.includes(role))) {
      hasAccess = true;
    } 
    // Check if user is a student in this section
    else if (user.roles && user.roles.includes('student') && section.students.some(s => s._id.toString() === userId)) {
      hasAccess = true;
    }
    // Check if user is a teacher for this course/section
    else if (user.roles && user.roles.includes('teacher')) {
      // Check if teacher is directly assigned to the section
      if (section.teachers && section.teachers.some(t => t._id.toString() === userId)) {
        hasAccess = true;
      }
      // Check if teacher is assigned to legacy single teacher field
      else if (section.teacher && section.teacher.toString() === userId) {
        hasAccess = true;
      }
      // Check if teacher is a course coordinator
      else if (course.coordinators && course.coordinators.some(cc => cc._id ? cc._id.toString() === userId : cc.toString() === userId)) {
        hasAccess = true;
      }
      // Temporary permissive mode for teachers
      else {
        console.log(`⚠️ [REST-API] Allowing teacher access (permissive mode) for course ${courseId}, section ${sectionId}`);
        hasAccess = true;
      }
    }
    // Check if user is a course coordinator
    else if (user.roles && user.roles.includes('cc')) {
      const courseWithCoordinators = await Course.findById(courseId).populate('coordinators');
      if (courseWithCoordinators && courseWithCoordinators.coordinators.some(cc => cc._id.toString() === userId)) {
        hasAccess = true;
      }
    }

    if (!hasAccess) {
      return res.status(403).json({ message: 'Access denied to this chat room' });
    }

    req.course = course;
    req.section = section;
    next();
  } catch (error) {
    console.error('Chat access check error:', error);
    res.status(500).json({ message: 'Server error during access check' });
  }
};

// Get messages for a specific course/section chat
router.get('/messages/:courseId/:sectionId', verifyToken, checkChatAccess, async (req, res) => {
  try {
    const { courseId, sectionId } = req.params;
    const { limit = 50, skip = 0 } = req.query;

    const user = await User.findById(req.user.id);

    // Fetch messages (excluding deleted ones for regular users)
    let query = { courseId, sectionId };
    
    // Only admin, dean, and hod can see deleted messages
    if (!user.roles || (!user.roles.includes('admin') && !user.roles.includes('dean') && !user.roles.includes('hod'))) {
      query.isDeleted = { $ne: true };
    }

    const messages = await GroupChat.find(query)
      .populate('senderId', 'name regNo teacherId roles primaryRole')
      .sort({ timestamp: -1 })
      .limit(parseInt(limit))
      .skip(parseInt(skip))
      .lean();

    // Format messages for frontend
    const formattedMessages = messages.reverse().map(message => {
      const sender = message.senderId;
      
      // Handle case where sender is null (deleted user or population failed)
      if (!sender) {
        return {
          _id: message._id,
          text: message.text,
          senderId: null,
          senderName: 'Deleted User',
          senderRole: 'unknown',
          timestamp: message.timestamp,
          isDeleted: message.isDeleted || false,
          deletedBy: message.deletedBy,
          deletedAt: message.deletedAt,
          fileUrl: message.fileUrl,
          fileName: message.fileName,
          fileType: message.fileType,
          replyTo: message.replyTo
        };
      }
      
      let displayName = sender.name || 'Unknown User';
      let displayId = '';

      // Format display name based on role
      if (sender.roles && sender.roles.includes('admin')) {
        displayName = 'Admin';
        displayId = '';
      } else if (sender.roles && sender.roles.includes('dean')) {
        displayName = `Dean ${sender.name || 'Unknown'}`;
        displayId = '';
      } else if (sender.roles && sender.roles.includes('hod')) {
        displayName = `HOD ${sender.name || 'Unknown'}`;
        displayId = '';
      } else {
        if (sender.roles && sender.roles.includes('student') && sender.regNo) {
          displayId = sender.regNo;
        } else if (sender.roles && sender.roles.includes('teacher') && sender.teacherId) {
          displayId = sender.teacherId;
        }
      }

      return {
        _id: message._id,
        message: message.message,
        messageType: message.messageType || 'text', // Include messageType
        timestamp: message.timestamp,
        flagged: message.flagged,
        isDeleted: message.isDeleted,
        // Include file-related fields if they exist
        ...(message.fileUrl ? {
          fileUrl: message.fileUrl,
          fileName: message.fileName,
          fileSize: message.fileSize,
          mimeType: message.mimeType
        } : {}),
        // Include reactions
        reactions: message.reactions || [],
        sender: {
          _id: sender._id || null,
          name: displayName,
          id: displayId,
          roles: sender.roles || []
        },
        canDelete: checkCanDelete(message, user),
        canShowDelete: checkCanShowDelete(user),
        isOwner: message.senderId && message.senderId._id ? message.senderId._id.toString() === user._id.toString() : false
      };
    });

    res.json({
      success: true,
      messages: formattedMessages,
      course: req.course,
      section: req.section
    });

  } catch (error) {
    console.error('Error loading messages:', error);
    res.status(500).json({ message: 'Failed to load messages' });
  }
});

// Helper function to check if user can delete a message
function checkCanDelete(message, user) {
  if (!user) return false;
  
  // Admin, Dean, and HOD can delete any message
  if (user.roles && (
    user.roles.includes('admin') || 
    user.roles.includes('dean') || 
    user.roles.includes('hod')
  )) {
    return true;
  }
  
  // Users can delete their own messages within 5 minutes
  const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
  if (message.senderId && message.senderId._id && 
      message.senderId._id.toString() === user._id.toString() && 
      new Date(message.timestamp) > fiveMinutesAgo) {
    return true;
  }
  
  return false;
}

// Helper function to check if user can see delete button
function checkCanShowDelete(user) {
  if (!user) return false;
  
  // Admin, Dean, and HOD can always see delete button
  if (user.roles && (
    user.roles.includes('admin') || 
    user.roles.includes('dean') || 
    user.roles.includes('hod')
  )) {
    return true;
  }
  
  return false;
}

// Helper function to check if user has access to a specific chat room
async function checkUserChatAccess(userId, courseId, sectionId) {
  try {
    console.log('🔍 Checking chat access for:', { userId, courseId, sectionId });
    const user = await User.findById(userId);
    if (!user) {
      console.log('❌ User not found:', userId);
      return false;
    }

    const userRoles = user.roles || [];
    console.log('👤 User roles:', userRoles);

    // Admin and superadmin can access all chats
    if (userRoles.includes('admin') || userRoles.includes('superadmin')) {
      console.log('✅ Admin/Superadmin access granted');
      return true;
    }

    // Get course and section details
    const course = await Course.findById(courseId).populate('department school');
    const section = await Section.findById(sectionId).populate('school department');
    
    if (!course || !section) {
      console.log('❌ Course or section not found');
      return false;
    }

    // Dean can access chats in their school only
    if (userRoles.includes('dean')) {
      const userSchoolId = user.school?.toString() || user.schools?.[0]?.toString();
      const courseSchoolId = course.school?._id?.toString() || course.school?.toString();
      const sectionSchoolId = section.school?._id?.toString() || section.school?.toString();
      
      console.log('🏫 Dean school check:', { userSchoolId, courseSchoolId, sectionSchoolId });
      
      if (userSchoolId && (userSchoolId === courseSchoolId || userSchoolId === sectionSchoolId)) {
        console.log('✅ Dean access granted - same school');
        return true;
      }
      console.log('❌ Dean access denied - different school');
      return false;
    }

    // HOD can access chats in their school AND department only
    if (userRoles.includes('hod')) {
      const userSchoolId = user.school?.toString() || user.schools?.[0]?.toString();
      const userDeptId = user.department?.toString() || user.departments?.[0]?.toString();
      const courseSchoolId = course.school?._id?.toString() || course.school?.toString();
      const courseDeptId = course.department?._id?.toString() || course.department?.toString();
      const sectionSchoolId = section.school?._id?.toString() || section.school?.toString();
      const sectionDeptId = section.department?._id?.toString() || section.department?.toString();
      
      console.log('🏢 HOD school/dept check:', { userSchoolId, userDeptId, courseSchoolId, courseDeptId });
      
      const schoolMatch = userSchoolId && (userSchoolId === courseSchoolId || userSchoolId === sectionSchoolId);
      const deptMatch = userDeptId && (userDeptId === courseDeptId || userDeptId === sectionDeptId);
      
      if (schoolMatch && deptMatch) {
        console.log('✅ HOD access granted - same school and department');
        return true;
      }
      console.log('❌ HOD access denied - school or department mismatch');
      return false;
    }

    // Teachers can access chats for their assigned sections/courses
    if (userRoles.includes('teacher')) {
      // Check SectionCourseTeacher assignments
      const SectionCourseTeacher = require('../models/SectionCourseTeacher');
      const assignment = await SectionCourseTeacher.findOne({
        teacher: userId,
        course: courseId,
        section: sectionId,
        isActive: true
      });
      
      if (assignment) {
        console.log('✅ Teacher access granted - has SectionCourseTeacher assignment');
        return true;
      }
      
      // Check if user is course coordinator
      if (course.coordinators && course.coordinators.some(cc => cc.toString() === userId.toString())) {
        console.log('✅ Teacher access granted - is course coordinator');
        return true;
      }
      
      // Check legacy section.teacher field
      if (section.teacher && section.teacher.toString() === userId.toString()) {
        console.log('✅ Teacher access granted - is section teacher');
        return true;
      }
      
      // Check section.teachers array
      if (section.teachers && section.teachers.some(t => t.toString() === userId.toString())) {
        console.log('✅ Teacher access granted - in section teachers array');
        return true;
      }
      
      console.log('❌ Teacher access denied - no assignment found');
      return false;
    }
    
    // Students can access chats for their sections
    if (userRoles.includes('student')) {
      // Check if student is enrolled in the section
      if (section.students && section.students.some(s => s.toString() === userId.toString())) {
        console.log('✅ Student access granted - enrolled in section');
        return true;
      }
      
      // Legacy check using assignedSections
      if (user.assignedSections && user.assignedSections.some(sId => sId.toString() === sectionId.toString())) {
        console.log('✅ Student access granted - section in assignedSections');
        return true;
      }
      
      console.log('❌ Student access denied - not enrolled in section');
      return false;
    }

    console.log('❌ No role-based access found');
    return false;
  } catch (error) {
    console.error('Error checking chat access:', error);
    return false;
  }
}

// Get chat room info
router.get('/room/:courseId/:sectionId', verifyToken, checkChatAccess, async (req, res) => {
  try {
    res.json({
      success: true,
      course: req.course,
      section: req.section
    });
  } catch (error) {
    console.error('Error getting chat room info:', error);
    res.status(500).json({ message: 'Failed to get chat room info' });
  }
});

// Get all available chat rooms for the current user
router.get('/rooms', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const user = await User.findById(userId).populate('roles');
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    let chatRooms = [];
    const userRoles = user.roles || [];
    
    console.log(`📋 Fetching chat rooms for user ${userId}, roles:`, userRoles);

    // Admin/Superadmin can see all chat rooms
    if (userRoles.includes('admin') || userRoles.includes('superadmin')) {
      const sections = await Section.find({ isActive: true })
        .populate('courses')
        .populate('school', 'name')
        .populate('department', 'name')
        .lean();

      for (const section of sections) {
        if (section.courses && section.courses.length > 0) {
          for (const course of section.courses) {
            if (course && course._id) {
              chatRooms.push({
                courseId: course._id,
                courseName: course.title || 'Untitled Course',
                courseCode: course.courseCode || 'N/A',
                sectionId: section._id,
                sectionName: section.name || 'Unnamed Section',
                schoolName: section.school?.name || 'Unknown School',
                departmentName: section.department?.name || 'Unknown Department',
                semester: section.semester || 'N/A',
                year: section.year || 'N/A'
              });
            }
          }
        }
      }
    }
    // Dean can see only their school's chat rooms
    else if (userRoles.includes('dean')) {
      const userSchoolId = user.school?.toString() || user.schools?.[0]?.toString();
      console.log('🏫 Dean filtering by school:', userSchoolId);
      
      if (userSchoolId) {
        const sections = await Section.find({ 
          school: userSchoolId,
          isActive: true 
        })
          .populate('courses')
          .populate('school', 'name')
          .populate('department', 'name')
          .lean();

        for (const section of sections) {
          if (section.courses && section.courses.length > 0) {
            for (const course of section.courses) {
              if (course && course._id) {
                chatRooms.push({
                  courseId: course._id,
                  courseName: course.title || 'Untitled Course',
                  courseCode: course.courseCode || 'N/A',
                  sectionId: section._id,
                  sectionName: section.name || 'Unnamed Section',
                  schoolName: section.school?.name || 'Unknown School',
                  departmentName: section.department?.name || 'Unknown Department',
                  semester: section.semester || 'N/A',
                  year: section.year || 'N/A'
                });
              }
            }
          }
        }
      }
    }
    // HOD can see only their school + department's chat rooms
    else if (userRoles.includes('hod')) {
      const userSchoolId = user.school?.toString() || user.schools?.[0]?.toString();
      const userDeptId = user.department?.toString() || user.departments?.[0]?.toString();
      console.log('🏢 HOD filtering by school and department:', { userSchoolId, userDeptId });
      
      if (userSchoolId && userDeptId) {
        const sections = await Section.find({ 
          school: userSchoolId,
          department: userDeptId,
          isActive: true 
        })
          .populate('courses')
          .populate('school', 'name')
          .populate('department', 'name')
          .lean();

        for (const section of sections) {
          if (section.courses && section.courses.length > 0) {
            for (const course of section.courses) {
              if (course && course._id) {
                chatRooms.push({
                  courseId: course._id,
                  courseName: course.title || 'Untitled Course',
                  courseCode: course.courseCode || 'N/A',
                  sectionId: section._id,
                  sectionName: section.name || 'Unnamed Section',
                  schoolName: section.school?.name || 'Unknown School',
                  departmentName: section.department?.name || 'Unknown Department',
                  semester: section.semester || 'N/A',
                  year: section.year || 'N/A'
                });
              }
            }
          }
        }
      }
    }
    // Students see their section's courses
    else if (userRoles.includes('student')) {
      const sections = await Section.find({ students: userId, isActive: true })
        .populate('courses')
        .populate('school', 'name')
        .populate('department', 'name')
        .lean();

      for (const section of sections) {
        if (section.courses && section.courses.length > 0) {
          for (const course of section.courses) {
            if (course && course._id) {
              chatRooms.push({
                courseId: course._id,
                courseName: course.title || 'Untitled Course',
                courseCode: course.courseCode || 'N/A',
                sectionId: section._id,
                sectionName: section.name || 'Unnamed Section',
                schoolName: section.school?.name || 'Unknown School',
                departmentName: section.department?.name || 'Unknown Department',
                semester: section.semester || 'N/A',
                year: section.year || 'N/A'
              });
            }
          }
        }
      }
    }
    // Teachers and CCs see their assigned sections/courses
    else if (userRoles.includes('teacher') || userRoles.includes('cc')) {
      const SectionCourseTeacher = require('../models/SectionCourseTeacher');
      
      // Find assignments from SectionCourseTeacher model
      const teacherAssignments = await SectionCourseTeacher.find({
        teacher: userId,
        isActive: true
      })
        .populate({
          path: 'section',
          populate: [
            { path: 'school', select: 'name' },
            { path: 'department', select: 'name' }
          ]
        })
        .populate('course', 'title courseCode')
        .lean();
      
      console.log(`👨‍🏫 Teacher has ${teacherAssignments.length} SectionCourseTeacher assignments`);
      
      // Add from SectionCourseTeacher assignments
      for (const assignment of teacherAssignments) {
        if (assignment.course && assignment.section) {
          chatRooms.push({
            courseId: assignment.course._id,
            courseName: assignment.course.title || 'Untitled Course',
            courseCode: assignment.course.courseCode || 'N/A',
            sectionId: assignment.section._id,
            sectionName: assignment.section.name || 'Unnamed Section',
            schoolName: assignment.section.school?.name || 'Unknown School',
            departmentName: assignment.section.department?.name || 'Unknown Department',
            semester: assignment.section.semester || 'N/A',
            year: assignment.section.year || 'N/A',
            isCoordinator: false
          });
        }
      }

      // Also check legacy section.teachers and section.teacher fields
      const legacySections = await Section.find({
        $or: [
          { teachers: userId },
          { teacher: userId }
        ],
        isActive: true
      })
        .populate('courses')
        .populate('school', 'name')
        .populate('department', 'name')
        .lean();

      for (const section of legacySections) {
        if (section.courses && section.courses.length > 0) {
          for (const course of section.courses) {
            // Check if already added from SectionCourseTeacher
            const exists = chatRooms.some(
              room => room.courseId.toString() === course._id.toString() && 
                     room.sectionId.toString() === section._id.toString()
            );
            
            if (!exists) {
              chatRooms.push({
                courseId: course._id,
                courseName: course.title || 'Untitled Course',
                courseCode: course.courseCode || 'N/A',
                sectionId: section._id,
                sectionName: section.name || 'Unnamed Section',
                schoolName: section.school?.name || 'Unknown School',
                departmentName: section.department?.name || 'Unknown Department',
                semester: section.semester || 'N/A',
                year: section.year || 'N/A',
                isCoordinator: false
              });
            }
          }
        }
      }

      // Find courses where user is a coordinator
      const coordinatedCourses = await Course.find({ coordinators: userId }).lean();
      const coordinatedCourseIds = coordinatedCourses.map(c => c._id.toString());

      // Add sections with coordinated courses (if not already added)
      if (coordinatedCourseIds.length > 0) {
        const coordinatedSections = await Section.find({
          courses: { $in: coordinatedCourseIds },
          isActive: true
        })
          .populate('courses')
          .populate('school', 'name')
          .populate('department', 'name')
          .lean();

        for (const section of coordinatedSections) {
          if (section.courses && section.courses.length > 0) {
            for (const course of section.courses) {
              if (course && course._id && coordinatedCourseIds.includes(course._id.toString())) {
                // Check if already added
                const exists = chatRooms.some(
                  room => room.courseId.toString() === course._id.toString() && 
                         room.sectionId.toString() === section._id.toString()
                );
                
                if (!exists) {
                  chatRooms.push({
                    courseId: course._id,
                    courseName: course.title || 'Untitled Course',
                    courseCode: course.courseCode || 'N/A',
                    sectionId: section._id,
                    sectionName: section.name || 'Unnamed Section',
                    schoolName: section.school?.name || 'Unknown School',
                    departmentName: section.department?.name || 'Unknown Department',
                    semester: section.semester || 'N/A',
                    year: section.year || 'N/A',
                    isCoordinator: true
                  });
                }
              }
            }
          }
        }
      }
    }

    // Remove duplicates and sort
    const uniqueRooms = chatRooms.filter((room, index, self) =>
      index === self.findIndex((r) => 
        r.courseId.toString() === room.courseId.toString() && 
        r.sectionId.toString() === room.sectionId.toString()
      )
    );

    // Sort by school, department, section, course
    uniqueRooms.sort((a, b) => {
      const aSchool = a.schoolName || '';
      const bSchool = b.schoolName || '';
      if (aSchool !== bSchool) return aSchool.localeCompare(bSchool);
      
      const aDept = a.departmentName || '';
      const bDept = b.departmentName || '';
      if (aDept !== bDept) return aDept.localeCompare(bDept);
      
      const aSection = a.sectionName || '';
      const bSection = b.sectionName || '';
      if (aSection !== bSection) return aSection.localeCompare(bSection);
      
      const aCourse = a.courseCode || '';
      const bCourse = b.courseCode || '';
      return aCourse.localeCompare(bCourse);
    });

    res.json({
      success: true,
      chatRooms: uniqueRooms,
      count: uniqueRooms.length
    });

  } catch (error) {
    console.error('Error getting chat rooms:', error);
    res.status(500).json({ message: 'Failed to get chat rooms', error: error.message });
  }
});

// File upload endpoint (Teachers, HODs, Deans only)
router.post('/upload', verifyToken, upload.single('file'), async (req, res) => {
  try {
    const userId = req.user.id;
    const { courseId, sectionId } = req.body;

    // Get user details
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    // Check if user has permission to upload files (teachers, HODs, deans, admins)
    const userRoles = user.roles || [];
    const canUpload = userRoles.some(role => ['teacher', 'hod', 'dean', 'admin'].includes(role));

    if (!canUpload) {
      return res.status(403).json({ 
        success: false, 
        message: 'Only teachers, HODs, and deans can upload files' 
      });
    }

    // Verify access to chat room
    const section = await Section.findById(sectionId).populate('courses students teachers');
    const course = await Course.findById(courseId).populate('coordinators');
    
    if (!section || !course) {
      return res.status(404).json({ success: false, message: 'Course or section not found' });
    }

    // Verify chat access (same logic as checkChatAccess middleware)
    let hasAccess = false;
    if (userRoles.some(role => ['admin', 'dean', 'hod', 'superadmin'].includes(role))) {
      hasAccess = true;
    } else if (userRoles.includes('teacher')) {
      if (section.teachers && section.teachers.some(t => t._id.toString() === userId)) {
        hasAccess = true;
      } else if (section.teacher && section.teacher.toString() === userId) {
        hasAccess = true;
      } else if (course.coordinators && course.coordinators.some(cc => (cc._id ? cc._id.toString() : cc.toString()) === userId)) {
        hasAccess = true;
      } else {
        hasAccess = true; // Permissive mode for teachers
      }
    }

    if (!hasAccess) {
      return res.status(403).json({ success: false, message: 'Access denied to this chat room' });
    }

    // File uploaded successfully
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No file uploaded' });
    }

    const fileName = req.file.originalname;
    const fileSize = req.file.size;
    const mimeType = req.file.mimetype;

    // Upload to Bunny Storage
    let fileUrl;
    try {
      const uploadResult = await bunnyStorageService.uploadDocument(
        req.file.buffer,
        fileName,
        'chat-files'
      );
      
      fileUrl = uploadResult.cdnUrl;
      console.log(`📎 [CHAT-UPLOAD] File uploaded to Bunny CDN by ${user.name} (${userRoles.join(', ')}): ${fileName} (${(fileSize / 1024).toFixed(2)} KB)`);
      console.log(`📎 [CHAT-UPLOAD] CDN URL: ${fileUrl}`);
      
    } catch (error) {
      console.error('❌ [CHAT-UPLOAD] Failed to upload to Bunny Storage:', error);
      return res.status(500).json({ 
        success: false, 
        message: 'Failed to upload file to storage',
        error: error.message 
      });
    }

    // Audit log the file upload
    try {
      await logGroupChat({
        action: 'file_uploaded',
        userId: userId,
        userName: user.name,
        userRole: user.primaryRole || userRoles[0] || 'unknown',
        courseId,
        sectionId,
        fileName,
        fileSize,
        mimeType,
        metadata: {
          ip: req.ip || req.connection?.remoteAddress,
          userAgent: req.headers['user-agent']
        }
      });
    } catch (auditError) {
      console.error('Failed to log file upload audit:', auditError);
    }

    res.json({
      success: true,
      message: 'File uploaded successfully',
      fileUrl,
      fileName,
      fileSize,
      mimeType
    });

  } catch (error) {
    console.error('❌ [CHAT-UPLOAD] Error:', error);

    if (error instanceof multer.MulterError) {
      if (error.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ 
          success: false, 
          message: 'File too large. Maximum size is 10MB.' 
        });
      }
      return res.status(400).json({ 
        success: false, 
        message: `Upload error: ${error.message}` 
      });
    }

    res.status(500).json({ 
      success: false, 
      message: error.message || 'Failed to upload file' 
    });
  }
});

// Download file - Secure local file serving
router.get('/download/:messageId', verifyToken, async (req, res) => {
  try {
    const { messageId } = req.params;
    console.log('📥 Download request for message:', messageId);
    
    // Find the message to get the file URL
    const message = await GroupChat.findById(messageId);
    if (!message) {
      console.log('❌ Message not found:', messageId);
      return res.status(404).json({ message: 'Message not found' });
    }
    
    console.log('📋 Message found:', {
      id: message._id,
      fileName: message.fileName,
      fileUrl: message.fileUrl,
      courseId: message.courseId,
      sectionId: message.sectionId
    });
    
    // Check if user has access to this chat room
    const userId = req.user.id;
    const hasAccess = await checkUserChatAccess(userId, message.courseId, message.sectionId);
    if (!hasAccess) {
      console.log('🚫 Access denied for user:', userId);
      return res.status(403).json({ message: 'Access denied to this chat room' });
    }
    
    console.log('✅ User has access, serving file');
    
    // Check if it's a Bunny CDN URL
    if (message.fileUrl && message.fileUrl.includes('b-cdn.net')) {
      console.log('🐰 Proxying file from Bunny Storage:', message.fileUrl);
      
      try {
        // Convert CDN URL to Storage API URL for private access
        // https://lms-document-storage.b-cdn.net/chat-files/file.pdf
        // becomes: https://sg.storage.bunnycdn.com/lms-document-storage/chat-files/file.pdf
        const storagePath = message.fileUrl.replace(
          'https://lms-document-storage.b-cdn.net',
          ''
        );
        const storageUrl = `https://sg.storage.bunnycdn.com/lms-document-storage${storagePath}`;
        
        console.log('📥 Fetching from Storage API:', storageUrl);
        
        const axios = require('axios');
        const cdnResponse = await axios.get(storageUrl, {
          responseType: 'stream',
          timeout: 30000,
          headers: {
            'AccessKey': process.env.BUNNY_STORAGE_PASSWORD || 'd3fe18a7-89bb-43a8-9297c4dc3105-d995-43af'
          }
        });
        
        // Set appropriate headers for download
        res.setHeader('Content-Disposition', `attachment; filename="${message.fileName || 'download'}"`);
        res.setHeader('Content-Type', message.mimeType || cdnResponse.headers['content-type'] || 'application/octet-stream');
        res.setHeader('Content-Length', cdnResponse.headers['content-length']);
        
        // Stream the file from CDN to client
        cdnResponse.data.pipe(res);
        
        cdnResponse.data.on('error', (err) => {
          console.error('❌ CDN stream error:', err);
          if (!res.headersSent) {
            res.status(500).json({ message: 'Error streaming file from CDN' });
          }
        });
        
        return;
      } catch (cdnError) {
        console.error('❌ Failed to fetch from Bunny CDN:', cdnError.message);
        return res.status(500).json({ 
          message: 'Failed to download file from CDN',
          error: cdnError.message 
        });
      }
    }
    
    // Serve old local file if it exists (for backwards compatibility)
    if (message.fileUrl && message.fileUrl.startsWith('/uploads/chat-files/')) {
      const filename = path.basename(message.fileUrl);
      const filePath = path.join(__dirname, '..', 'uploads', 'chat-files', filename);
      
      console.log('📁 Legacy file path:', filePath);
      
      // Check if file exists
      if (!fs.existsSync(filePath)) {
        console.log('❌ File not found on disk:', filePath);
        return res.status(404).json({ message: 'File not found' });
      }
      
      // Set appropriate headers
      res.setHeader('Content-Disposition', `attachment; filename="${message.fileName || filename}"`);
      res.setHeader('Content-Type', message.mimeType || 'application/octet-stream');
      
      // Stream the file
      console.log('✅ Streaming legacy file to user');
      const fileStream = fs.createReadStream(filePath);
      fileStream.pipe(res);
      
      fileStream.on('error', (err) => {
        console.error('❌ File stream error:', err);
        if (!res.headersSent) {
          res.status(500).json({ message: 'Error streaming file' });
        }
      });
      
    } else {
      console.log('❌ Invalid or missing file URL:', message.fileUrl);
      res.status(404).json({ message: 'File URL not found or invalid' });
    }
  } catch (error) {
    console.error('🚨 Download route error:', error);
    res.status(500).json({ message: 'Failed to download file' });
  }
});

// Get unread counts for all chat rooms
router.get('/unread-counts', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id;

    // First, get all chat rooms for this user
    const user = await User.findById(userId).populate('roles');
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    let chatRooms = [];
    const userRoles = user.roles || [];

    // Get chat rooms based on role (same logic as /rooms endpoint)
    if (userRoles.some(role => ['admin', 'dean', 'hod', 'superadmin'].includes(role))) {
      // Admin/Dean/HOD/Superadmin: all active section-course chats
      const sections = await Section.find({ isActive: true })
        .populate('courses')
        .lean();

      for (const section of sections) {
        if (section.courses && section.courses.length > 0) {
          for (const course of section.courses) {
            chatRooms.push({
              courseId: course._id,
              sectionId: section._id
            });
          }
        }
      }
    } else if (userRoles.includes('student')) {
      // Student: only their section's courses
      const sections = await Section.find({ 
        students: userId,
        isActive: true 
      })
        .populate('courses')
        .lean();

      for (const section of sections) {
        if (section.courses && section.courses.length > 0) {
          for (const course of section.courses) {
            chatRooms.push({
              courseId: course._id,
              sectionId: section._id
            });
          }
        }
      }
    } else if (userRoles.includes('teacher')) {
      // Teacher: sections they teach
      const sections = await Section.find({
        $or: [
          { teachers: userId },
          { teacher: userId }
        ],
        isActive: true
      })
        .populate('courses')
        .lean();

      for (const section of sections) {
        if (section.courses && section.courses.length > 0) {
          for (const course of section.courses) {
            chatRooms.push({
              courseId: course._id,
              sectionId: section._id
            });
          }
        }
      }

      // Add courses they coordinate
      const coordinatedCourses = await Course.find({
        coordinators: userId
      }).lean();

      const coordinatedCourseIds = coordinatedCourses.map(c => c._id.toString());

      if (coordinatedCourseIds.length > 0) {
        const coordinatedSections = await Section.find({
          courses: { $in: coordinatedCourseIds },
          isActive: true
        })
          .populate('courses')
          .lean();

        for (const section of coordinatedSections) {
          if (section.courses && section.courses.length > 0) {
            for (const course of section.courses) {
              if (coordinatedCourseIds.includes(course._id.toString())) {
                const exists = chatRooms.some(
                  room => room.courseId.toString() === course._id.toString() && 
                         room.sectionId.toString() === section._id.toString()
                );
                
                if (!exists) {
                  chatRooms.push({
                    courseId: course._id,
                    sectionId: section._id
                  });
                }
              }
            }
          }
        }
      }
    }

    // Get unread counts for all rooms
    const unreadCounts = await ChatReadReceipt.getAllUnreadCounts(userId, chatRooms);

    // Calculate total unread
    const totalUnread = Object.values(unreadCounts).reduce((sum, count) => sum + count, 0);

    res.json({
      success: true,
      unreadCounts,
      totalUnread
    });

  } catch (error) {
    console.error('Error getting unread counts:', error);
    res.status(500).json({ message: 'Failed to get unread counts', error: error.message });
  }
});

// Get unread count for a specific chat
router.get('/unread-count/:courseId/:sectionId', verifyToken, checkChatAccess, async (req, res) => {
  try {
    const userId = req.user.id;
    const { courseId, sectionId } = req.params;

    const unreadCount = await ChatReadReceipt.getUnreadCount(userId, courseId, sectionId);
    
    // Also get the read receipt to return lastReadMessageId
    const receipt = await ChatReadReceipt.findOne({ userId, courseId, sectionId });

    res.json({
      success: true,
      unreadCount,
      lastReadMessageId: receipt?.lastReadMessageId || null,
      courseId,
      sectionId
    });

  } catch (error) {
    console.error('Error getting unread count:', error);
    res.status(500).json({ message: 'Failed to get unread count', error: error.message });
  }
});

// Mark messages as read
router.post('/mark-read', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { courseId, sectionId, lastReadMessageId } = req.body;

    if (!courseId || !sectionId) {
      return res.status(400).json({ message: 'courseId and sectionId are required' });
    }

    // Validate lastReadMessageId if provided - skip temporary/invalid IDs
    if (lastReadMessageId && 
        (typeof lastReadMessageId === 'string') && 
        (lastReadMessageId.startsWith('temp_') || 
         lastReadMessageId.startsWith('demo-msg-') ||
         !mongoose.Types.ObjectId.isValid(lastReadMessageId))) {
      // Don't update for temporary/invalid IDs - just return success
      return res.json({
        success: true,
        message: 'Skipped read receipt update for temporary message ID',
        receipt: null
      });
    }

    // Update or create read receipt
    const receipt = await ChatReadReceipt.updateReadReceipt(
      userId, 
      courseId, 
      sectionId, 
      lastReadMessageId
    );

    res.json({
      success: true,
      message: 'Messages marked as read',
      receipt
    });

  } catch (error) {
    console.error('Error marking messages as read:', error);
    res.status(500).json({ message: 'Failed to mark messages as read', error: error.message });
  }
});

module.exports = router;