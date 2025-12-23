const express = require('express');
const router = express.Router();
const { auth, authorizeRoles } = require('../middleware/auth');
const { cacheAnalytics } = require('../middleware/cacheMiddleware');
const hodAnalyticsController = require('../controllers/hodAnalyticsController');

// HOD Analytics Routes - with Redis caching for performance

// Get department overview analytics (cached for 5 minutes)
router.get('/department-analytics', 
  auth, 
  authorizeRoles('hod'), 
  cacheAnalytics('department', 300),
  hodAnalyticsController.getDepartmentAnalytics
);

// Get course-wise detailed analytics (cached for 3 minutes)
router.get('/course-analytics', 
  auth, 
  authorizeRoles('hod'), 
  cacheAnalytics('course', 180),
  hodAnalyticsController.getHODCourseAnalytics
);

module.exports = router;
