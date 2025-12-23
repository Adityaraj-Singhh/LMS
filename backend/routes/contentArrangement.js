const express = require('express');
const router = express.Router();
const contentArrangementController = require('../controllers/contentArrangementController');
const { auth, authorizeRoles } = require('../middleware/auth');

// CC routes - Course Coordinator content arrangement (also accessible by HOD for approval)
router.get('/course/:courseId', 
  auth, 
  authorizeRoles('teacher', 'admin', 'hod'), 
  contentArrangementController.getContentArrangement
);

router.put('/:arrangementId', 
  auth, 
  authorizeRoles('teacher', 'admin'), 
  contentArrangementController.updateContentArrangement
);

router.post('/:arrangementId/submit', 
  auth, 
  authorizeRoles('teacher', 'admin'), 
  contentArrangementController.submitArrangement
);

router.get('/:courseId/history', 
  auth, 
  authorizeRoles('teacher', 'admin', 'hod'), 
  contentArrangementController.getArrangementHistory
);

// HOD routes - Approval management
router.get('/pending', 
  auth, 
  authorizeRoles('hod', 'admin'), 
  contentArrangementController.getPendingArrangements
);

router.get('/approved', 
  auth, 
  authorizeRoles('hod', 'admin'), 
  contentArrangementController.getApprovedArrangements
);

router.post('/:arrangementId/review', 
  auth, 
  authorizeRoles('hod', 'admin'), 
  contentArrangementController.reviewArrangement
);

// Course launch route
router.post('/course/:courseId/launch', 
  auth, 
  authorizeRoles('hod', 'admin'), 
  contentArrangementController.launchCourse
);

// Mark course content as updated (triggers re-arrangement workflow)
router.post('/course/:courseId/mark-updated', 
  auth, 
  authorizeRoles('teacher', 'admin'), 
  contentArrangementController.markCourseContentUpdated
);

module.exports = router;