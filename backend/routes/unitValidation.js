const express = require('express');
const router = express.Router();
const { auth } = require('../middleware/auth');
const UnitValidationController = require('../controllers/unitValidationController');

// Get units that need revalidation for a student
router.get('/course/:courseId/units-needing-review', auth, async (req, res) => {
  try {
    const result = await UnitValidationController.getUnitsNeedingReview(
      req.user._id,
      req.params.courseId
    );
    res.json(result);
  } catch (error) {
    console.error('Error getting units needing review:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get units needing review'
    });
  }
});

// Get progression blocking information for a student
router.get('/course/:courseId/progression-status', auth, async (req, res) => {    
  try {
    const result = await UnitValidationController.getProgressionBlockingInfo(       
      req.user._id,
      req.params.courseId
    );
    res.json(result);
  } catch (error) {
    console.error('Error getting progression status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get progression status'
    });
  }
});

// Validate access to specific unit
router.get('/course/:courseId/unit/:unitId/validate-access', auth, async (req, res) => {    
  try {
    const result = await UnitValidationController.validateUnitAccess(
      req.user._id,
      req.params.courseId,
      req.params.unitId
    );
    res.json(result);
  } catch (error) {
    console.error('Error validating unit access:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to validate unit access'
    });
  }
});

// Check if unit revalidation is complete
router.post('/course/:courseId/unit/:unitId/check-completion', auth, async (req, res) => {
  try {
    const result = await UnitValidationController.checkAndCompleteUnitRevalidation(
      req.user._id,
      req.params.courseId,
      req.params.unitId
    );
    res.json(result);
  } catch (error) {
    console.error('Error checking unit completion:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to check unit completion'
    });
  }
});

// Admin route: Get content change impact analysis
router.get('/course/:courseId/impact-analysis', auth, async (req, res) => {
  try {
    // Check if user is admin
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Admin access required'
      });
    }

    const { unitId } = req.query;
    const result = await UnitValidationController.getContentChangeImpactAnalysis(
      req.params.courseId,
      unitId
    );
    res.json(result);
  } catch (error) {
    console.error('Error getting impact analysis:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get impact analysis'
    });
  }
});

module.exports = router;