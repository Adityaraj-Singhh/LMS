const crypto = require('crypto');
const Unit = require('../models/Unit');
const Video = require('../models/Video');
const ReadingMaterial = require('../models/ReadingMaterial');
const StudentProgress = require('../models/StudentProgress');

class ContentIntegrityService {
  
  /**
   * Generate content hash for a unit (excludes quizzes, only videos and documents)
   * @param {String} unitId - Unit ID to generate hash for
   * @returns {Object} Hash information and content details
   */
  static async generateUnitContentHash(unitId) {
    try {
      // Get all videos and reading materials for this unit
      const videos = await Video.find({ unit: unitId }).sort({ order: 1 });
      const readingMaterials = await ReadingMaterial.find({ unit: unitId }).sort({ order: 1 });
      
      // Create content signature (exclude quiz content)
      const contentSignature = {
        videos: videos.map(v => ({
          id: v._id.toString(),
          title: v.title,
          order: v.order,
          duration: v.duration,
          uploadedAt: v.createdAt
        })),
        documents: readingMaterials.map(rm => ({
          id: rm._id.toString(),
          title: rm.title,
          order: rm.order,
          uploadedAt: rm.createdAt
        }))
      };
      
      // Generate hash from signature
      const contentString = JSON.stringify(contentSignature);
      const contentHash = crypto.createHash('sha256').update(contentString).digest('hex');
      
      return {
        contentHash,
        videoCount: videos.length,
        documentCount: readingMaterials.length,
        videoIds: videos.map(v => v._id),
        documentIds: readingMaterials.map(rm => rm._id),
        contentSignature
      };
      
    } catch (error) {
      console.error('Error generating unit content hash:', error);
      throw new Error('Failed to generate content hash');
    }
  }
  
  /**
   * Compare student's completion hash with current unit content
   * @param {Object} studentProgress - Student progress document
   * @param {String} unitId - Unit ID to check
   * @returns {Object} Comparison result with new content details
   */
  static async compareUnitContentWithProgress(studentProgress, unitId) {
    try {
      // Get current unit content hash
      const currentContent = await this.generateUnitContentHash(unitId);
      
      // Find student's completion data for this unit
      const unitProgress = studentProgress.units.find(u => u.unitId.toString() === unitId.toString());
      const completionValidation = studentProgress.unitCompletionValidation?.find(
        ucv => ucv.unitId.toString() === unitId.toString()
      );
      
      // If unit not completed or no validation record, return current requirements
      if (!unitProgress || unitProgress.status !== 'completed' || !completionValidation) {
        return {
          hasChanges: false,
          isCompleted: false,
          requiresRevalidation: false,
          currentContentHash: currentContent.contentHash,
          newContent: {
            videos: currentContent.videoIds,
            documents: currentContent.documentIds
          }
        };
      }
      
      // Compare hashes
      const hasChanges = completionValidation.contentHash !== currentContent.contentHash;
      
      if (!hasChanges) {
        return {
          hasChanges: false,
          isCompleted: true,
          requiresRevalidation: false,
          currentContentHash: currentContent.contentHash
        };
      }
      
      // Identify new content by comparing with completion signature
      const completionSignature = completionValidation.contentSignature || { videos: [], documents: [] };
      
      const newVideos = currentContent.contentSignature.videos.filter(video => 
        !completionSignature.videos.some(cv => cv.id === video.id)
      );
      
      const newDocuments = currentContent.contentSignature.documents.filter(doc => 
        !completionSignature.documents.some(cd => cd.id === doc.id)
      );
      
      return {
        hasChanges: true,
        isCompleted: true,
        requiresRevalidation: true,
        currentContentHash: currentContent.contentHash,
        previousContentHash: completionValidation.contentHash,
        newContent: {
          videos: newVideos.map(v => v.id),
          documents: newDocuments.map(d => d.id),
          videoDetails: newVideos,
          documentDetails: newDocuments
        },
        totalNewItems: newVideos.length + newDocuments.length
      };
      
    } catch (error) {
      console.error('Error comparing unit content with progress:', error);
      throw new Error('Failed to compare content');
    }
  }
  
  /**
   * Invalidate student progress for units with new content
   * @param {String} courseId - Course ID
   * @param {String} unitId - Unit ID that had content added
   * @returns {Object} Results of invalidation process
   */
  static async invalidateProgressForNewContent(courseId, unitId) {
    try {
      // Get all students enrolled in this course
      const studentsProgress = await StudentProgress.find({ course: courseId });
      
      if (studentsProgress.length === 0) {
        return {
          studentsAffected: 0,
          unitsInvalidated: 0,
          progressionsBlocked: 0
        };
      }
      
      // Get current unit content hash
      const currentContent = await this.generateUnitContentHash(unitId);
      let studentsAffected = 0;
      let progressionsBlocked = 0;
      
      // Process each student's progress
      for (const studentProgress of studentsProgress) {
        const comparison = await this.compareUnitContentWithProgress(studentProgress, unitId);
        
        if (comparison.requiresRevalidation) {
          studentsAffected++;
          
          // Update unit status to needs_review
          const unitProgress = studentProgress.units.find(u => u.unitId.toString() === unitId.toString());
          if (unitProgress) {
            unitProgress.status = 'needs_review';
          }
          
          // Update or create completion validation record
          let validationRecord = studentProgress.unitCompletionValidation?.find(
            ucv => ucv.unitId.toString() === unitId.toString()
          );
          
          if (!validationRecord) {
            if (!studentProgress.unitCompletionValidation) {
              studentProgress.unitCompletionValidation = [];
            }
            validationRecord = {
              unitId: unitId,
              completedAtArrangementVersion: studentProgress.arrangementVersion,
              contentHash: currentContent.contentHash,
              isValidForCurrentArrangement: false,
              lastValidatedAt: new Date(),
              newContentAdded: [],
              requiresRevalidation: true
            };
            studentProgress.unitCompletionValidation.push(validationRecord);
          } else {
            validationRecord.isValidForCurrentArrangement = false;
            validationRecord.requiresRevalidation = true;
            validationRecord.lastValidatedAt = new Date();
          }
          
          // Add new content requirements
          comparison.newContent.videos.forEach(videoId => {
            validationRecord.newContentAdded.push({
              contentId: videoId,
              contentType: 'video',
              addedAt: new Date()
            });
          });
          
          comparison.newContent.documents.forEach(docId => {
            validationRecord.newContentAdded.push({
              contentId: docId,
              contentType: 'reading',
              addedAt: new Date()
            });
          });
          
          // Check if this blocks progression to other units
          const unitOrder = await this.getUnitOrder(unitId);
          const hasSubsequentUnits = studentProgress.units.some(u => {
            return u.status === 'in-progress' || u.status === 'completed';
          });
          
          if (hasSubsequentUnits) {
            progressionsBlocked++;
          }
          
          await studentProgress.save();
        }
      }
      
      return {
        studentsAffected,
        unitsInvalidated: studentsAffected,
        progressionsBlocked,
        unitContentHash: currentContent.contentHash,
        newContentCount: currentContent.videoCount + currentContent.documentCount
      };
      
    } catch (error) {
      console.error('Error invalidating progress for new content:', error);
      throw new Error('Failed to invalidate student progress');
    }
  }
  
  /**
   * Validate if student can access next unit content
   * STRICT SEQUENTIAL CHECKING: ALL previous units must have ALL content + quiz completed
   * @param {Object} studentProgress - Student progress document
   * @param {String} currentUnitId - Unit student wants to access
   * @returns {Object} Validation result
   */
  static async validateUnitProgression(studentProgress, currentUnitId) {
    try {
      // Get unit and course info
      const currentUnit = await Unit.findById(currentUnitId);
      if (!currentUnit) {
        return {
          canAccess: false,
          reason: 'unit_not_found',
          message: 'Unit not found'
        };
      }
      
      const currentUnitOrder = currentUnit.order;
      const courseId = currentUnit.course;
      
      // Get all previous units (lower order number)
      const previousUnits = await Unit.find({
        course: courseId,
        order: { $lt: currentUnitOrder }
      }).sort({ order: 1 });
      
      if (previousUnits.length === 0) {
        return {
          canAccess: true,
          reason: 'first_unit'
        };
      }
      
      const completedReadingMaterials = studentProgress.completedReadingMaterials || [];
      const completedReadingMaterialIds = completedReadingMaterials.map(id => id.toString());
      
      // Check each previous unit for COMPLETE completion (videos + docs + quiz)
      for (const unit of previousUnits) {
        const unitProgress = studentProgress.units.find(u => u.unitId.toString() === unit._id.toString());
        
        // Get actual content counts for this unit
        const unitVideos = await Video.find({ unit: unit._id, isApproved: { $ne: false } });
        const unitDocs = await ReadingMaterial.find({ unit: unit._id, isApproved: { $ne: false } });
        
        const totalVideos = unitVideos.length;
        const totalDocuments = unitDocs.length;
        const unitVideoIds = unitVideos.map(v => v._id.toString());
        const unitDocumentIds = unitDocs.map(d => d._id.toString());
        
        // Check videos completion
        let videosWatched = 0;
        if (unitProgress && unitProgress.videosWatched) {
          videosWatched = unitProgress.videosWatched.filter(v => 
            v.completed && unitVideoIds.includes(v.videoId.toString())
          ).length;
        }
        const allVideosComplete = totalVideos === 0 || videosWatched >= totalVideos;
        
        // Check documents completion
        const docsRead = unitDocumentIds.filter(docId => 
          completedReadingMaterialIds.includes(docId)
        ).length;
        const allDocsComplete = totalDocuments === 0 || docsRead >= totalDocuments;
        
        // Check quiz completion (if unit has a quiz pool)
        let quizPassed = true; // Default to true if no quiz
        
        // Check if there's a quiz pool for this course+unit
        const QuizPool = require('../models/QuizPool');
        const quizPool = await QuizPool.findOne({ course: courseId, unit: unit._id });
        const hasQuiz = quizPool && quizPool.questions && quizPool.questions.length > 0;
        
        if (hasQuiz) {
          quizPassed = unitProgress?.unitQuizPassed || false;
        }
        
        // If any component is incomplete, block access
        if (!allVideosComplete || !allDocsComplete || !quizPassed) {
          const missingItems = [];
          if (!allVideosComplete) missingItems.push(`${totalVideos - videosWatched} video(s)`);
          if (!allDocsComplete) missingItems.push(`${totalDocuments - docsRead} document(s)`);
          if (hasQuiz && !quizPassed) missingItems.push('quiz');
          
          return {
            canAccess: false,
            blockedBy: unit._id,
            blockedByTitle: unit.title,
            blockedByOrder: unit.order,
            reason: 'previous_unit_incomplete',
            message: `Complete Unit ${unit.order} (${unit.title}) before accessing Unit ${currentUnitOrder}. Missing: ${missingItems.join(', ')}.`,
            incompleteDetails: {
              unitId: unit._id,
              unitTitle: unit.title,
              unitOrder: unit.order,
              totalVideos,
              videosWatched,
              allVideosComplete,
              totalDocuments,
              docsRead,
              allDocsComplete,
              hasQuiz,
              quizPassed
            }
          };
        }
        
        // Also check for 'needs_review' status (new content added after completion)
        if (unitProgress?.status === 'needs_review') {
          const comparison = await this.compareUnitContentWithProgress(studentProgress, unit._id);
          
          if (comparison.requiresRevalidation) {
            return {
              canAccess: false,
              blockedBy: unit._id,
              blockedByTitle: unit.title,
              blockedByOrder: unit.order,
              reason: 'previous_unit_needs_review',
              newContentRequired: comparison.newContent,
              message: `Unit ${unit.order} (${unit.title}) has new content that must be completed before accessing Unit ${currentUnitOrder}.`
            };
          }
        }
      }
      
      return {
        canAccess: true,
        reason: 'all_prerequisites_met'
      };
      
    } catch (error) {
      console.error('Error validating unit progression:', error);
      return {
        canAccess: false,
        reason: 'validation_error',
        message: 'Unable to validate unit progression'
      };
    }
  }
  
  /**
   * Check if student has completed new content requirements for a unit
   * @param {Object} studentProgress - Student progress document
   * @param {String} unitId - Unit ID to check
   * @returns {Object} Completion status of new requirements
   */
  static async checkNewContentCompletion(studentProgress, unitId) {
    try {
      const validationRecord = studentProgress.unitCompletionValidation?.find(
        ucv => ucv.unitId.toString() === unitId.toString()
      );
      
      if (!validationRecord || !validationRecord.requiresRevalidation) {
        return {
          hasNewRequirements: false,
          isComplete: true
        };
      }
      
      const unitProgress = studentProgress.units.find(u => u.unitId.toString() === unitId.toString());
      
      // Check each new content item
      let completedItems = 0;
      const totalNewItems = validationRecord.newContentAdded.length;
      const incompleteItems = [];
      
      for (const newContent of validationRecord.newContentAdded) {
        if (newContent.contentType === 'video') {
          // Check if video is watched
          const videoWatched = unitProgress?.videosWatched?.find(
            vw => vw.videoId.toString() === newContent.contentId.toString()
          );
          
          if (videoWatched && videoWatched.completed) {
            completedItems++;
          } else {
            incompleteItems.push({
              id: newContent.contentId,
              type: 'video',
              addedAt: newContent.addedAt
            });
          }
        } else if (newContent.contentType === 'reading') {
          // Check if reading material is completed
          const readingCompleted = unitProgress?.readingMaterialsCompleted?.find(
            rm => rm.materialId.toString() === newContent.contentId.toString()
          );
          
          if (readingCompleted && readingCompleted.completed) {
            completedItems++;
          } else {
            incompleteItems.push({
              id: newContent.contentId,
              type: 'reading',
              addedAt: newContent.addedAt
            });
          }
        }
      }
      
      const isComplete = completedItems === totalNewItems;
      
      return {
        hasNewRequirements: true,
        isComplete,
        totalNewItems,
        completedItems,
        incompleteItems,
        completionPercentage: totalNewItems > 0 ? (completedItems / totalNewItems) * 100 : 100
      };
      
    } catch (error) {
      console.error('Error checking new content completion:', error);
      throw new Error('Failed to check content completion');
    }
  }
  
  /**
   * Mark unit as completed after new content requirements are met
   * @param {Object} studentProgress - Student progress document
   * @param {String} unitId - Unit ID to mark as complete
   * @returns {Boolean} Success status
   */
  static async markUnitRevalidationComplete(studentProgress, unitId) {
    try {
      const completion = await this.checkNewContentCompletion(studentProgress, unitId);
      
      if (!completion.isComplete) {
        return {
          success: false,
          reason: 'requirements_not_met',
          remaining: completion.incompleteItems
        };
      }
      
      // Update unit status back to completed
      const unitProgress = studentProgress.units.find(u => u.unitId.toString() === unitId.toString());
      if (unitProgress) {
        unitProgress.status = 'completed';
      }
      
      // Update validation record
      const validationRecord = studentProgress.unitCompletionValidation?.find(
        ucv => ucv.unitId.toString() === unitId.toString()
      );
      
      if (validationRecord) {
        validationRecord.isValidForCurrentArrangement = true;
        validationRecord.requiresRevalidation = false;
        validationRecord.lastValidatedAt = new Date();
        
        // Update content hash to current version
        const currentContent = await this.generateUnitContentHash(unitId);
        validationRecord.contentHash = currentContent.contentHash;
        validationRecord.contentSignature = currentContent.contentSignature;
      }
      
      await studentProgress.save();
      
      return {
        success: true,
        reason: 'unit_revalidated',
        message: 'Unit marked as completed after new content completion'
      };
      
    } catch (error) {
      console.error('Error marking unit revalidation complete:', error);
      throw new Error('Failed to complete revalidation');
    }
  }
  
  /**
   * Helper function to get unit order
   * @param {String} unitId - Unit ID
   * @returns {Number} Unit order number
   */
  static async getUnitOrder(unitId) {
    try {
      const unit = await Unit.findById(unitId);
      return unit ? unit.order : 0;
    } catch (error) {
      console.error('Error getting unit order:', error);
      return 0;
    }
  }
}

module.exports = ContentIntegrityService;