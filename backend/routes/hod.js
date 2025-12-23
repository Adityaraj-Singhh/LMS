const express = require('express');
const router = express.Router();
const { auth, authorizeRoles } = require('../middleware/auth');
const { cacheAnalytics } = require('../middleware/cacheMiddleware');
const hodController = require('../controllers/hodController');

// All routes protected by HOD role
router.use(auth, authorizeRoles('hod'));

// Get HOD dashboard overview (cached for 5 minutes)
router.get('/dashboard', cacheAnalytics('dashboard', 300), hodController.getHODDashboard);

// Get recent activity for HOD dashboard (not cached - needs to be real-time)
router.get('/activity/recent', hodController.getRecentActivity);

// Get pending teacher announcements for approval
router.get('/announcements/pending', hodController.getPendingAnnouncements);

// Approve or reject teacher announcement
router.put('/announcements/:announcementId/review', hodController.reviewAnnouncement);

// Get HOD's announcement history (created) and approval history (approved)
router.get('/announcements/history', hodController.getHODAnnouncementHistory);
router.get('/approvals/history', hodController.getHODApprovalHistory);

// Get department teachers (cached for 5 minutes)
router.get('/teachers', cacheAnalytics('teachers', 300), hodController.getDepartmentTeachers);

// Get department sections (cached for 5 minutes)
router.get('/sections', cacheAnalytics('sections', 300), hodController.getDepartmentSections);

// Get department courses (cached for 5 minutes)
router.get('/courses', cacheAnalytics('courses', 300), hodController.getDepartmentCourses);

// Get section-courses for HOD's department
router.get('/section-courses', hodController.getSectionCourses);

// Get available teachers for a course
router.get('/teachers/available/:courseId', hodController.getAvailableTeachersForCourse);

// HOD teacher-section-course management (section-based assignments only)
router.post('/assign-teacher-to-section-course', hodController.assignTeacherToSectionCourse);
router.post('/remove-teacher-from-section-course', hodController.removeTeacherFromSectionCourse);
router.post('/sections/assign-teacher-course', hodController.assignTeacherToSectionCourse);
router.post('/sections/remove-teacher-course', hodController.removeTeacherFromSectionCourse);
router.patch('/teachers/:teacherId/section', hodController.changeTeacherSection);

// Get available sections for teacher-course assignment (smart selection)
router.get('/teachers/:teacherId/courses/:courseId/available-sections', hodController.getAvailableSectionsForTeacherCourse);

// Request teacher assignment to section (requires dean approval)
router.post('/assign/teacher', hodController.requestTeacherAssignment);

// Request course assignment to section (requires dean approval)
router.post('/assign/course', hodController.requestCourseAssignment);

// Get HOD's assignment requests
router.get('/assignment-requests', hodController.getAssignmentRequests);

// Analytics endpoints with Redis caching
// Get comprehensive department analytics (cached for 3 minutes)
router.get('/analytics/department', cacheAnalytics('department', 180), hodController.getDepartmentAnalytics);

// Get course-wise analytics for department (cached for 3 minutes)
router.get('/analytics/courses', cacheAnalytics('courses-analytics', 180), hodController.getCourseAnalytics);
// Get relations (teachers, students with sections) for a specific course
router.get('/courses/:courseId/relations', cacheAnalytics('course-relations', 180), hodController.getCourseRelations);
// Get sections assigned to a course
router.get('/courses/:courseId/sections', cacheAnalytics('course-sections', 180), hodController.getCourseSections);

// Get student-wise analytics for department (cached for 2 minutes)
router.get('/analytics/students', cacheAnalytics('students', 120), hodController.getStudentAnalytics);

// Get section-wise analytics for department (cached for 3 minutes)
router.get('/analytics/sections', cacheAnalytics('sections-analytics', 180), hodController.getSectionAnalytics);

// Get detailed analytics for a specific section (cached for 2 minutes)
router.get('/sections/:sectionId/analytics', cacheAnalytics('section-detail', 120), hodController.getSpecificSectionAnalytics);

// Get detailed analytics for a specific student (cached for 2 minutes)
router.get('/analytics/student/:studentId', cacheAnalytics('student-detail', 120), hodController.getStudentDetailedAnalytics);

// Search students in HOD's department (no cache - search results)
router.get('/students/search', hodController.searchStudents);

// Get student analytics by regNo (cached for 2 minutes)
router.get('/analytics/student', cacheAnalytics('student-regno', 120), hodController.getStudentAnalyticsByRegNo);

// Course Coordinator (CC) management and reviews
router.post('/courses/cc/assign', hodController.assignCourseCoordinator);
router.post('/courses/cc/remove', hodController.removeCourseCoordinator);
router.get('/courses/:courseId/coordinators', hodController.getCourseCoordinators);
router.get('/reviews/flagged', hodController.getFlaggedReviews);
router.post('/reviews/:reviewId/resolve', hodController.hodResolveFlaggedReview);

// Approved questions listing and management
router.get('/questions/approved', hodController.getApprovedQuestions);
router.put('/questions/:quizId/:questionId', hodController.updateQuizQuestion);
router.delete('/questions/:quizId/:questionId', hodController.deleteQuizQuestion);
router.post('/questions', hodController.createQuizQuestion);

// Quiz Report - Student lookup by reg no, view all attempts with detailed Q&A
router.get('/quiz-report/attempts', hodController.getStudentQuizAttempts);
router.get('/quiz-report/export/:attemptId', hodController.exportStudentQuizAttemptCSV);

module.exports = router;