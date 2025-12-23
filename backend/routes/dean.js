const express = require('express');
const router = express.Router();
const { auth, authorizeRoles } = require('../middleware/auth');
const { cacheAnalytics } = require('../middleware/cacheMiddleware');
const deanController = require('../controllers/deanController');

// Protect all routes for dean role
router.use(auth, authorizeRoles('dean'));

// Dashboard routes with caching
router.get('/overview', cacheAnalytics('overview', 300), deanController.getOverview);
router.get('/departments', cacheAnalytics('departments', 600), deanController.getDepartments);
router.get('/analytics', cacheAnalytics('analytics', 300), deanController.getAnalytics);

// Get recent activity for Dean dashboard
router.get('/activity/recent', deanController.getRecentActivity);

// Dean profile and school information
router.get('/profile', deanController.getProfile);
router.get('/teachers', cacheAnalytics('teachers', 300), deanController.getTeachers);
router.get('/courses', cacheAnalytics('courses', 300), deanController.getCourses);

// School management routes
router.get('/school-management/options', deanController.getSchoolManagementOptions);
router.put('/department/:deptId/hod', deanController.setDepartmentHod);
router.get('/department/:deptId/courses', deanController.getDepartmentCourses);
router.get('/course/:courseId/relations', deanController.getCourseRelations);
router.get('/course/:courseId/sections', deanController.getCourseSections);
router.get('/course/:courseId/sections/export', deanController.exportCourseSectionsCsv);
router.get('/section/:sectionId/analytics/export', deanController.exportSectionAnalyticsCsv);
router.get('/teacher/:teacherId/details', deanController.getTeacherDetails);
router.get('/student/:studentId/details', (req, res, next) => {
  console.log('🎯 ROUTE HIT: /dean/student/:studentId/details with ID:', req.params.studentId);
  next();
}, deanController.getStudentDetails);
router.get('/student/search', deanController.getStudentByRegNo);
router.get('/students/search', deanController.searchStudents);
// Section analytics (detailed) for dean
router.get('/section/:sectionId/analytics', deanController.getSectionAnalyticsDetailed);
router.get('/sections', deanController.getSections);

// Get dean's assigned sections and teaching assignments
// router.get('/assignments', deanController.getDeanAssignments); // TODO: Implement getDeanAssignments

// Announcement management routes
router.get('/announcement/options', deanController.getAnnouncementOptions);
router.post('/announcement', deanController.createDeanAnnouncement);
router.get('/announcements/history', deanController.getDeanAnnouncementHistory);

module.exports = router;
