const UnitValidationController = require('../controllers/unitValidationController');

/**
 * Middleware to validate student access to content based on unit progression
 */
const validateContentAccess = async (req, res, next) => {
  try {
    // Only apply to student role
    if (req.user.role !== 'student') {
      return next(); // Allow non-students to proceed
    }

    // Extract content information from request
    const { videoId, materialId, contentId } = req.params;
    const { courseId } = req.params || req.query;
    
    // Determine content type and ID
    let actualContentId;
    let contentType;
    
    if (videoId) {
      actualContentId = videoId;
      contentType = 'video';
    } else if (materialId) {
      actualContentId = materialId;
      contentType = 'reading';
    } else if (contentId) {
      actualContentId = contentId;
      contentType = req.query.type || 'video'; // Default to video if not specified
    } else {
      return res.status(400).json({
        success: false,
        message: 'Content ID not provided'
      });
    }

    // If courseId not in params, try to get it from the content
    let targetCourseId = courseId;
    if (!targetCourseId) {
      try {
        if (contentType === 'video') {
          const Video = require('../models/Video');
          const video = await Video.findById(actualContentId);
          targetCourseId = video?.course;
        } else if (contentType === 'reading') {
          const ReadingMaterial = require('../models/ReadingMaterial');
          const material = await ReadingMaterial.findById(actualContentId);
          console.log(`📖 Found reading material: ${material?._id}, course: ${material?.course}`);
          targetCourseId = material?.course;
          
          if (!material) {
            console.error(`❌ Reading material not found: ${actualContentId}`);
            return res.status(404).json({
              success: false,
              message: 'Reading material not found'
            });
          }
        }
      } catch (error) {
        console.error('Error finding content course:', error);
        return res.status(500).json({
          success: false,
          message: `Error finding content: ${error.message}`
        });
      }
    }

    if (!targetCourseId) {
      console.error(`❌ No course found for content: ${actualContentId} (type: ${contentType})`);
      return res.status(400).json({
        success: false,
        message: 'Course not found for this content'
      });
    }

    // Validate content access
    const validation = await UnitValidationController.validateContentAccess(
      req.user._id,
      targetCourseId,
      actualContentId,
      contentType
    );

    if (!validation.success) {
      return res.status(500).json({
        success: false,
        message: validation.message || 'Content validation failed'
      });
    }

    if (!validation.canAccess) {
      return res.status(403).json({
        success: false,
        canAccess: false,
        reason: validation.reason,
        message: validation.message,
        blockedBy: validation.blockedBy,
        contentInfo: validation.contentInfo,
        requiresAction: 'complete_previous_content'
      });
    }

    // Store validation info in request for use by controllers
    req.contentValidation = validation;
    
    next();
  } catch (error) {
    console.error('Content access validation middleware error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to validate content access'
    });
  }
};

/**
 * Middleware to validate unit access for unit-specific routes
 */
const validateUnitAccess = async (req, res, next) => {
  try {
    // Only apply to student role
    if (req.user.role !== 'student') {
      return next(); // Allow non-students to proceed
    }

    const { unitId, courseId } = req.params;

    if (!unitId || !courseId) {
      return res.status(400).json({
        success: false,
        message: 'Unit ID and Course ID are required'
      });
    }

    // Validate unit access
    const validation = await UnitValidationController.validateUnitAccess(
      req.user._id,
      courseId,
      unitId
    );

    if (!validation.success) {
      return res.status(500).json({
        success: false,
        message: validation.message || 'Unit validation failed'
      });
    }

    if (!validation.canAccess) {
      return res.status(403).json({
        success: false,
        canAccess: false,
        reason: validation.reason,
        message: validation.message,
        blockedBy: validation.blockedBy,
        requiresAction: 'complete_previous_content'
      });
    }

    // Store validation info in request
    req.unitValidation = validation;
    
    next();
  } catch (error) {
    console.error('Unit access validation middleware error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to validate unit access'
    });
  }
};

/**
 * Middleware to check and update unit completion after content interaction
 */
const checkUnitCompletion = async (req, res, next) => {
  try {
    // Only apply to student role and successful requests
    if (req.user.role !== 'student') {
      return next();
    }

    // This middleware runs after the main controller
    // We'll check if unit revalidation can be completed
    if (req.contentValidation && req.contentValidation.contentInfo) {
      const { unitId } = req.contentValidation.contentInfo;
      const courseId = req.params.courseId || req.query.courseId;

      if (unitId && courseId) {
        try {
          const completion = await UnitValidationController.checkAndCompleteUnitRevalidation(
            req.user._id,
            courseId,
            unitId
          );

          if (completion.success && completion.reason === 'unit_revalidated') {
            console.log(`✅ Unit ${unitId} revalidated for student ${req.user._id}`);
          }
        } catch (error) {
          console.error('Error checking unit completion:', error);
          // Don't fail the request, just log the error
        }
      }
    }

    next();
  } catch (error) {
    console.error('Unit completion check middleware error:', error);
    next(); // Continue without failing
  }
};

module.exports = {
  validateContentAccess,
  validateUnitAccess,
  checkUnitCompletion
};