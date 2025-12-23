const ContentIntegrityService = require('../services/contentIntegrityService');
const StudentProgress = require('../models/StudentProgress');
const Unit = require('../models/Unit');
const Video = require('../models/Video');
const ReadingMaterial = require('../models/ReadingMaterial');

class UnitValidationController {
  
  /**
   * Validate if student can access specific unit content
   * @param {String} studentId - Student ID
   * @param {String} courseId - Course ID  
   * @param {String} unitId - Unit ID to validate access for
   * @returns {Object} Validation result
   */
  static async validateUnitAccess(studentId, courseId, unitId) {
    try {
      // Get student progress
      const studentProgress = await StudentProgress.findOne({
        student: studentId,
        course: courseId
      }).populate('units.unitId');
      
      if (!studentProgress) {
        return {
          success: false,
          canAccess: false,
          reason: 'no_progress_record',
          message: 'No progress record found for this course'
        };
      }
      
      // Use content integrity service to validate progression
      const validation = await ContentIntegrityService.validateUnitProgression(studentProgress, unitId);
      
      return {
        success: true,
        ...validation
      };
      
    } catch (error) {
      console.error('Error validating unit access:', error);
      return {
        success: false,
        canAccess: false,
        reason: 'validation_error',
        message: 'Failed to validate unit access'
      };
    }
  }
  
  /**
   * Get units that need revalidation for a student
   * @param {String} studentId - Student ID
   * @param {String} courseId - Course ID
   * @returns {Object} Units needing review
   */
  static async getUnitsNeedingReview(studentId, courseId) {
    try {
      const studentProgress = await StudentProgress.findOne({
        student: studentId,
        course: courseId
      }).populate('units.unitId');
      
      if (!studentProgress) {
        return {
          success: false,
          unitsNeedingReview: [],
          message: 'No progress record found'
        };
      }
      
      const unitsNeedingReview = [];
      
      // Check each unit that needs review
      for (const unitProgress of studentProgress.units) {
        if (unitProgress.status === 'needs_review') {
          const comparison = await ContentIntegrityService.compareUnitContentWithProgress(
            studentProgress, 
            unitProgress.unitId._id
          );
          
          if (comparison.requiresRevalidation) {
            const newContentCompletion = await ContentIntegrityService.checkNewContentCompletion(
              studentProgress,
              unitProgress.unitId._id
            );
            
            // Get detailed content information
            const newVideos = await Video.find({
              _id: { $in: comparison.newContent.videos || [] }
            }).select('title duration order');
            
            const newDocuments = await ReadingMaterial.find({
              _id: { $in: comparison.newContent.documents || [] }
            }).select('title order');
            
            unitsNeedingReview.push({
              unitId: unitProgress.unitId._id,
              unitTitle: unitProgress.unitId.title,
              unitOrder: unitProgress.unitId.order,
              status: unitProgress.status,
              newContent: {
                videos: newVideos,
                documents: newDocuments,
                totalItems: comparison.totalNewItems
              },
              completion: newContentCompletion,
              requiresRevalidation: true
            });
          }
        }
      }
      
      return {
        success: true,
        unitsNeedingReview,
        totalUnits: unitsNeedingReview.length
      };
      
    } catch (error) {
      console.error('Error getting units needing review:', error);
      return {
        success: false,
        unitsNeedingReview: [],
        message: 'Failed to get review status'
      };
    }
  }
  
  /**
   * Mark unit as completed after new content is watched
   * @param {String} studentId - Student ID
   * @param {String} courseId - Course ID
   * @param {String} unitId - Unit ID to check completion for
   * @returns {Object} Completion result
   */
  static async checkAndCompleteUnitRevalidation(studentId, courseId, unitId) {
    try {
      const studentProgress = await StudentProgress.findOne({
        student: studentId,
        course: courseId
      });
      
      if (!studentProgress) {
        return {
          success: false,
          message: 'Progress record not found'
        };
      }
      
      // Check if new content requirements are met
      const result = await ContentIntegrityService.markUnitRevalidationComplete(studentProgress, unitId);
      
      return {
        success: true,
        ...result
      };
      
    } catch (error) {
      console.error('Error completing unit revalidation:', error);
      return {
        success: false,
        message: 'Failed to complete revalidation'
      };
    }
  }
  
  /**
   * Get detailed information about what content is blocking progression
   * @param {String} studentId - Student ID
   * @param {String} courseId - Course ID
   * @returns {Object} Progression blocking details
   */
  static async getProgressionBlockingInfo(studentId, courseId) {
    try {
      const studentProgress = await StudentProgress.findOne({
        student: studentId,
        course: courseId
      }).populate('units.unitId');
      
      if (!studentProgress) {
        return {
          success: false,
          isBlocked: false,
          message: 'No progress record found'
        };
      }
      
      const blockingInfo = {
        isBlocked: false,
        blockedUnits: [],
        unitsNeedingReview: [],
        nextAvailableUnit: null,
        totalBlockedProgression: 0
      };
      
      // Find units needing review and their impact
      for (const unitProgress of studentProgress.units) {
        if (unitProgress.status === 'needs_review') {
          const comparison = await ContentIntegrityService.compareUnitContentWithProgress(
            studentProgress,
            unitProgress.unitId._id
          );
          
          if (comparison.requiresRevalidation) {
            blockingInfo.isBlocked = true;
            
            const completion = await ContentIntegrityService.checkNewContentCompletion(
              studentProgress,
              unitProgress.unitId._id
            );
            
            blockingInfo.unitsNeedingReview.push({
              unitId: unitProgress.unitId._id,
              unitTitle: unitProgress.unitId.title,
              unitOrder: unitProgress.unitId.order,
              newContentRequired: comparison.newContent,
              completion: completion
            });
            
            // Count how many subsequent units are blocked
            const subsequentUnits = studentProgress.units.filter(u => 
              u.unitId.order > unitProgress.unitId.order && 
              (u.status === 'in-progress' || u.status === 'completed')
            );
            
            blockingInfo.totalBlockedProgression += subsequentUnits.length;
          }
        }
      }
      
      // Find next available unit (if any)
      if (!blockingInfo.isBlocked) {
        const nextUnit = studentProgress.units.find(u => 
          u.status === 'locked' || u.status === 'in-progress'
        );
        
        if (nextUnit) {
          blockingInfo.nextAvailableUnit = {
            unitId: nextUnit.unitId._id,
            unitTitle: nextUnit.unitId.title,
            unitOrder: nextUnit.unitId.order,
            status: nextUnit.status
          };
        }
      }
      
      return {
        success: true,
        ...blockingInfo
      };
      
    } catch (error) {
      console.error('Error getting progression blocking info:', error);
      return {
        success: false,
        isBlocked: false,
        message: 'Failed to get blocking information'
      };
    }
  }
  
  /**
   * Validate content access for videos and reading materials
   * @param {String} studentId - Student ID
   * @param {String} courseId - Course ID
   * @param {String} contentId - Content ID (video or reading material)
   * @param {String} contentType - Type ('video' or 'reading')
   * @returns {Object} Access validation result
   */
  static async validateContentAccess(studentId, courseId, contentId, contentType) {
    try {
      // Get content to find its unit
      let content;
      let unitId;
      
      if (contentType === 'video') {
        content = await Video.findById(contentId);
        unitId = content?.unit;
      } else if (contentType === 'reading') {
        content = await ReadingMaterial.findById(contentId);
        unitId = content?.unit;
      } else {
        return {
          success: false,
          canAccess: false,
          reason: 'invalid_content_type',
          message: 'Invalid content type specified'
        };
      }
      
      if (!content || !unitId) {
        return {
          success: false,
          canAccess: false,
          reason: 'content_not_found',
          message: 'Content not found'
        };
      }
      
      // **FIX: Check if student has already accessed this content before**
      // If they have, allow re-access without strict unit validation
      const studentProgress = await StudentProgress.findOne({
        student: studentId,
        course: courseId
      });
      
      // If no progress record, check if this is the first unit (should be accessible)
      if (!studentProgress) {
        // Check if this content is in the first unit
        const contentUnit = await Unit.findById(unitId);
        if (contentUnit) {
          // Check if there are any units with lower order
          const previousUnitsCount = await Unit.countDocuments({
            course: courseId,
            order: { $lt: contentUnit.order }
          });
          
          if (previousUnitsCount === 0) {
            console.log(`✅ First unit access granted (no progress record yet): ${contentId}`);
            return {
              success: true,
              canAccess: true,
              reason: 'first_unit_access',
              contentInfo: {
                contentId,
                contentType,
                unitId,
                title: content.title
              }
            };
          }
        }
        
        // Not first unit and no progress - need to validate
        console.log(`⚠️ No progress record found for student ${studentId} in course ${courseId}`);
      }
      
      if (studentProgress) {
        // Check if reading material was already completed
        if (contentType === 'reading') {
          const completedReadingMaterials = studentProgress.completedReadingMaterials || [];
          const alreadyCompleted = completedReadingMaterials.some(
            id => id.toString() === contentId.toString()
          );
          if (alreadyCompleted) {
            console.log(`📖 Re-access granted for already completed reading material: ${contentId}`);
            return {
              success: true,
              canAccess: true,
              reason: 'already_completed',
              contentInfo: {
                contentId,
                contentType,
                unitId,
                title: content.title
              }
            };
          }
        }
        
        // Check if video was already watched
        if (contentType === 'video') {
          const unitProgress = studentProgress.units.find(
            u => u.unitId.toString() === unitId.toString()
          );
          if (unitProgress && unitProgress.videosWatched) {
            const alreadyWatched = unitProgress.videosWatched.some(
              v => v.videoId.toString() === contentId.toString() && v.completed
            );
            if (alreadyWatched) {
              console.log(`🎬 Re-access granted for already watched video: ${contentId}`);
              return {
                success: true,
                canAccess: true,
                reason: 'already_watched',
                contentInfo: {
                  contentId,
                  contentType,
                  unitId,
                  title: content.title
                }
              };
            }
          }
        }
        
        // **FIX: Check if the unit is already unlocked/in-progress for this student**
        // If the student has already started this unit, allow access to its content
        const unitProgress = studentProgress.units.find(
          u => u.unitId && u.unitId.toString() === unitId.toString()
        );
        
        if (unitProgress) {
          // Unit exists in progress - check if unlocked or in-progress or completed
          if (unitProgress.unlocked || unitProgress.status === 'in-progress' || 
              unitProgress.status === 'completed' || unitProgress.status === 'needs_review') {
            console.log(`✅ Access granted - unit ${unitId} is already unlocked/in-progress for student`);
            return {
              success: true,
              canAccess: true,
              reason: 'unit_already_unlocked',
              contentInfo: {
                contentId,
                contentType,
                unitId,
                title: content.title
              }
            };
          }
        }
      }
      
      // Validate unit access (for first-time access or locked units)
      console.log(`🔍 Validating unit access for content ${contentId} in unit ${unitId}`);
      const unitValidation = await this.validateUnitAccess(studentId, courseId, unitId);
      
      if (!unitValidation.canAccess) {
        console.log(`❌ Content access denied:`, {
          contentId,
          contentType,
          unitId,
          reason: unitValidation.reason,
          blockedBy: unitValidation.blockedBy,
          message: unitValidation.message
        });
        return {
          success: true,
          canAccess: false,
          reason: 'unit_blocked',
          blockedBy: unitValidation.blockedBy,
          message: unitValidation.message,
          contentInfo: {
            contentId,
            contentType,
            unitId,
            title: content.title
          }
        };
      }
      
      return {
        success: true,
        canAccess: true,
        reason: 'access_granted',
        contentInfo: {
          contentId,
          contentType,
          unitId,
          title: content.title
        }
      };
      
    } catch (error) {
      console.error('Error validating content access:', error);
      return {
        success: false,
        canAccess: false,
        reason: 'validation_error',
        message: 'Failed to validate content access'
      };
    }
  }
  
  /**
   * Get admin dashboard data for content change impact analysis
   * @param {String} courseId - Course ID
   * @param {String} unitId - Unit ID that had content changes (optional)
   * @returns {Object} Impact analysis data
   */
  static async getContentChangeImpactAnalysis(courseId, unitId = null) {
    try {
      const query = { course: courseId };
      
      // Get all students in course
      const allStudents = await StudentProgress.find(query).populate('student', 'name email');
      
      const analysis = {
        totalStudents: allStudents.length,
        studentsAffected: 0,
        unitsWithIssues: [],
        progressionBlocked: 0,
        detailedImpact: []
      };
      
      const unitsToCheck = unitId ? [unitId] : [];
      
      // If no specific unit, check all units with validation issues
      if (!unitId) {
        for (const studentProgress of allStudents) {
          for (const unitProgress of studentProgress.units) {
            if (unitProgress.status === 'needs_review' && !unitsToCheck.includes(unitProgress.unitId.toString())) {
              unitsToCheck.push(unitProgress.unitId.toString());
            }
          }
        }
      }
      
      // Analyze impact for each unit
      for (const checkUnitId of unitsToCheck) {
        const unitImpact = {
          unitId: checkUnitId,
          studentsNeedingReview: 0,
          studentsBlocked: 0,
          averageNewContentItems: 0,
          studentsDetails: []
        };
        
        for (const studentProgress of allStudents) {
          const comparison = await ContentIntegrityService.compareUnitContentWithProgress(
            studentProgress,
            checkUnitId
          );
          
          if (comparison.requiresRevalidation) {
            unitImpact.studentsNeedingReview++;
            analysis.studentsAffected++;
            
            const completion = await ContentIntegrityService.checkNewContentCompletion(
              studentProgress,
              checkUnitId
            );
            
            const validation = await ContentIntegrityService.validateUnitProgression(
              studentProgress,
              checkUnitId
            );
            
            const isBlocked = !validation.canAccess;
            if (isBlocked) {
              unitImpact.studentsBlocked++;
              analysis.progressionBlocked++;
            }
            
            unitImpact.studentsDetails.push({
              studentId: studentProgress.student._id,
              studentName: studentProgress.student.name,
              studentEmail: studentProgress.student.email,
              newContentRequired: comparison.totalNewItems,
              completion: completion,
              isBlocked: isBlocked
            });
            
            unitImpact.averageNewContentItems += comparison.totalNewItems || 0;
          }
        }
        
        if (unitImpact.studentsNeedingReview > 0) {
          unitImpact.averageNewContentItems = unitImpact.averageNewContentItems / unitImpact.studentsNeedingReview;
          analysis.unitsWithIssues.push(checkUnitId);
          analysis.detailedImpact.push(unitImpact);
        }
      }
      
      return {
        success: true,
        ...analysis
      };
      
    } catch (error) {
      console.error('Error getting content change impact analysis:', error);
      return {
        success: false,
        message: 'Failed to analyze content change impact'
      };
    }
  }
}

module.exports = UnitValidationController;