const Quiz = require('../models/Quiz');
const QuizPool = require('../models/QuizPool');
const QuizAttempt = require('../models/QuizAttempt');
const StudentProgress = require('../models/StudentProgress');
const Unit = require('../models/Unit');
const Course = require('../models/Course');
const User = require('../models/User');
const QuizSecurityAudit = require('../models/QuizSecurityAudit');
const QuizConfiguration = require('../models/QuizConfiguration');
const Video = require('../models/Video');
const ReadingMaterial = require('../models/ReadingMaterial');

// Helper function to determine violation severity
function getSeverityLevel(violationType, tabSwitchCount = 0) {
  switch (violationType) {
    case 'TAB_SWITCH':
      return tabSwitchCount > 5 ? 'HIGH' : tabSwitchCount > 3 ? 'MEDIUM' : 'LOW';
    case 'FULLSCREEN_EXIT':
      return 'MEDIUM';
    case 'KEYBOARD_SHORTCUT':
      return 'MEDIUM';
    case 'DEVELOPER_TOOLS':
      return 'HIGH';
    case 'COPY_PASTE_ATTEMPT':
      return 'HIGH';
    case 'CONTEXT_MENU':
      return 'LOW';
    case 'RIGHT_CLICK':
      return 'LOW';
    case 'TIME_MANIPULATION':
      return 'CRITICAL';
    default:
      return 'MEDIUM';
  }
}

/**
 * Helper function to check if all previous units are complete
 * A unit is complete when:
 * - All videos are watched
 * - All documents are read
 * - Quiz is passed (if the unit has a quiz)
 * 
 * @param {ObjectId} studentId - Student's ID
 * @param {ObjectId} courseId - Course's ID
 * @param {Number} currentUnitOrder - The order of the current unit
 * @param {Object} progress - Student's progress record
 * @returns {Object} { allPreviousComplete, incompleteUnits }
 */
async function checkPreviousUnitsComplete(studentId, courseId, currentUnitOrder, progress) {
  try {
    // Get all units before the current one (lower order number)
    const previousUnits = await Unit.find({
      course: courseId,
      order: { $lt: currentUnitOrder }
    }).sort({ order: 1 });

    if (previousUnits.length === 0) {
      return { allPreviousComplete: true, incompleteUnits: [] };
    }

    const incompleteUnits = [];
    const completedReadingMaterials = progress.completedReadingMaterials || [];
    const completedReadingMaterialIds = completedReadingMaterials.map(id => id.toString());

    for (const unit of previousUnits) {
      const unitProgress = progress.units.find(u => u.unitId.toString() === unit._id.toString());
      
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
      
      // Check quiz completion (if unit has a quiz)
      const hasQuiz = unit.quizPool || (unit.quizzes && unit.quizzes.length > 0);
      let quizPassed = true; // Default to true if no quiz
      
      if (hasQuiz) {
        quizPassed = unitProgress?.unitQuizPassed || false;
      }
      
      const isUnitComplete = allVideosComplete && allDocsComplete && quizPassed;
      
      if (!isUnitComplete) {
        incompleteUnits.push({
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
        });
      }
    }

    return {
      allPreviousComplete: incompleteUnits.length === 0,
      incompleteUnits
    };
  } catch (error) {
    console.error('Error checking previous units completion:', error);
    return { allPreviousComplete: true, incompleteUnits: [], error: error.message };
  }
}

// Check if unit quiz is available for student
exports.checkUnitQuizAvailability = async (req, res) => {
  try {
    const { unitId } = req.params;
    const studentId = req.user._id;

    // Get unit and course info
    const unit = await Unit.findById(unitId).populate('course').populate('quizPool');
    if (!unit) {
      return res.status(404).json({ message: 'Unit not found' });
    }

    // Check unit deadline
    const { checkUnitDeadline } = require('../utils/deadlineUtils');
    const deadlineInfo = await checkUnitDeadline(unitId);
    if (deadlineInfo.hasDeadline && deadlineInfo.isExpired && deadlineInfo.strictDeadline) {
      return res.status(403).json({ 
        message: 'This unit quiz is no longer accessible. The unit deadline has passed.',
        deadlineInfo: {
          deadline: deadlineInfo.deadline,
          daysLeft: deadlineInfo.daysLeft,
          deadlineDescription: deadlineInfo.deadlineDescription
        }
      });
    }

    // Check student progress for this unit
    const progress = await StudentProgress.findOne({ 
      student: studentId, 
      course: unit.course._id 
    });

    if (!progress) {
      return res.status(403).json({ message: 'Not enrolled in this course' });
    }

    const unitProgress = progress.units.find(u => u.unitId.toString() === unitId);
    if (!unitProgress) {
      return res.status(403).json({ message: 'Unit not accessible' });
    }

    // **FIX: Check for approved arrangement to get the actual video count for this unit**
    // This handles the case where CC moved videos between units
    const ContentArrangement = require('../models/ContentArrangement');
    let totalVideos = unit.videos.length; // Default to unit.videos
    let unitVideoIds = unit.videos.map(v => v._id ? v._id.toString() : v.toString());
    
    // Check if course has an approved arrangement (and is launched)
    if (unit.course.isLaunched) {
      const approvedArrangement = await ContentArrangement.findOne({
        course: unit.course._id,
        status: 'approved'
      }).sort({ version: -1 });
      
      if (approvedArrangement) {
        // Get videos that are actually in this unit according to the arrangement
        const arrangementVideos = approvedArrangement.items.filter(
          item => item.type === 'video' && item.unitId.toString() === unitId
        );
        totalVideos = arrangementVideos.length;
        unitVideoIds = arrangementVideos.map(item => item.contentId.toString());
        
        console.log('Using approved arrangement for video count:', {
          unitId,
          arrangementVersion: approvedArrangement.version,
          videosInArrangement: totalVideos,
          videosInUnitModel: unit.videos.length
        });
      }
    }

    // Check if all videos in unit are watched - use multiple methods for reliability
    let allVideosWatched = false;
    
    if (totalVideos === 0) {
      allVideosWatched = true; // No videos to watch
    } else {
      // Method 1: Check via videosWatched array (filter by videos actually in unit)
      const watchedViaArray = unitProgress.videosWatched.filter(v => 
        v.completed && unitVideoIds.includes(v.videoId.toString())
      ).length;
      
      // Method 2: Check videosCompleted counter (less reliable if videos moved)
      const watchedViaCounter = unitProgress.videosCompleted || 0;
      
      // Method 3: Check individual video progress entries (filter by videos in unit)
      const videoProgressEntries = progress.videoProgress || [];
      const watchedViaEntries = unitVideoIds.filter(videoId => {
        const videoProgress = videoProgressEntries.find(vp => vp.videoId.toString() === videoId);
        return videoProgress && videoProgress.completed;
      }).length;
      
      // Method 4: Check global completedVideos array for this unit's videos
      const completedVideosGlobal = progress.completedVideos || [];
      const watchedViaGlobal = unitVideoIds.filter(videoId => 
        completedVideosGlobal.includes(videoId)
      ).length;
      
      // **PERMANENT FIX: Method 5 - Check actual Video documents directly from watchHistory**
      // This is the MOST reliable method as it checks the student's actual watch history
      const Student = require('../models/User');
      const studentDoc = await Student.findById(studentId);
      let watchedViaWatchHistory = 0;
      
      if (studentDoc && studentDoc.watchHistory) {
        watchedViaWatchHistory = unitVideoIds.filter(videoId => {
          const watchRecord = studentDoc.watchHistory.find(
            wh => wh.video && wh.video.toString() === videoId
          );
          return watchRecord && watchRecord.isCompleted === true;
        }).length;
      }
      
      // Use the highest count as the most reliable indicator
      const maxWatchedCount = Math.max(
        watchedViaArray, 
        watchedViaCounter, 
        watchedViaEntries, 
        watchedViaGlobal,
        watchedViaWatchHistory
      );
      allVideosWatched = maxWatchedCount >= totalVideos;
      
      console.log('Quiz availability check:', {
        unitId,
        totalVideos,
        unitVideoIds,
        watchedViaArray,
        watchedViaCounter, 
        watchedViaEntries,
        watchedViaGlobal,
        watchedViaWatchHistory,
        maxWatchedCount,
        allVideosWatched,
        allMethodsResults: {
          array: watchedViaArray,
          counter: watchedViaCounter,
          entries: watchedViaEntries,
          global: watchedViaGlobal,
          watchHistory: watchedViaWatchHistory
        }
      });
    }

    // **NEW: Check if all reading materials (documents) are completed**
    let allDocumentsRead = true;
    let totalDocuments = 0;
    let completedDocuments = 0;
    
    // Get reading materials for this unit from the arrangement or unit model
    const ReadingMaterial = require('../models/ReadingMaterial');
    let unitDocumentIds = [];
    
    // Check if course has an approved arrangement for documents too
    if (unit.course.isLaunched) {
      const ContentArrangement = require('../models/ContentArrangement');
      const approvedArrangement = await ContentArrangement.findOne({
        course: unit.course._id,
        status: 'approved'
      }).sort({ version: -1 });
      
      if (approvedArrangement) {
        // Get documents that are actually in this unit according to the arrangement
        const arrangementDocs = approvedArrangement.items.filter(
          item => item.type === 'document' && item.unitId.toString() === unitId
        );
        totalDocuments = arrangementDocs.length;
        unitDocumentIds = arrangementDocs.map(item => item.contentId.toString());
      } else {
        // Fall back to unit's reading materials
        totalDocuments = unit.readingMaterials?.length || 0;
        unitDocumentIds = (unit.readingMaterials || []).map(rm => rm._id ? rm._id.toString() : rm.toString());
      }
    } else {
      // Not launched, use unit's reading materials
      totalDocuments = unit.readingMaterials?.length || 0;
      unitDocumentIds = (unit.readingMaterials || []).map(rm => rm._id ? rm._id.toString() : rm.toString());
    }
    
    if (totalDocuments > 0) {
      // Check how many documents are completed from progress
      // Documents are tracked in progress.completedReadingMaterials (course-level array)
      // NOT in unitProgress.readingMaterialsCompleted (which may not exist)
      const completedReadingMaterials = progress.completedReadingMaterials || [];
      const completedReadingMaterialIds = completedReadingMaterials.map(id => id.toString());
      
      completedDocuments = unitDocumentIds.filter(docId => 
        completedReadingMaterialIds.includes(docId)
      ).length;
      
      allDocumentsRead = completedDocuments >= totalDocuments;
      
      console.log('Document completion check:', {
        unitId,
        totalDocuments,
        completedDocuments,
        unitDocumentIds,
        completedReadingMaterialIds,
        allDocumentsRead
      });
    }

    // Combined content completion check
    const allContentCompleted = allVideosWatched && allDocumentsRead;

    // Check if quiz already completed and passed
    const quizCompleted = unitProgress.unitQuizCompleted;
    const quizPassed = unitProgress.unitQuizPassed;

    // Check if there's a quiz pool for this unit
    const hasQuiz = unit.quizPool || unit.quizzes.length > 0;
    
    // **CRITICAL: Check if quiz pool has CC-approved questions**
    let hasApprovedQuestions = false;
    let approvedQuestionCount = 0;
    
    if (hasQuiz) {
      const QuizPool = require('../models/QuizPool');
      const QuestionReview = require('../models/QuestionReview');
      const courseId = unit.course._id;
      
      const quizPool = await QuizPool.findOne({ 
        course: courseId, 
        unit: unitId, 
        isActive: true 
      });
      
      if (quizPool) {
        const approvedReviews = await QuestionReview.find({
          status: 'approved',
          course: courseId,
          unit: unitId,
          quiz: { $in: quizPool.quizzes }
        }).select('questionId');
        
        approvedQuestionCount = approvedReviews.length;
        hasApprovedQuestions = approvedQuestionCount > 0;
        
        console.log(`Unit ${unitId} has ${approvedQuestionCount} CC-approved questions`);
      }
    }

    // Count completed attempts (treat completedAt or isComplete as completion)
    const attemptsTaken = await QuizAttempt.countDocuments({
      student: studentId,
      unit: unitId,
      $or: [
        { completedAt: { $ne: null } },
        { isComplete: true }
      ]
    });

  // Fetch quiz configuration to get maxAttempts
  let configuredMaxAttempts = 3; // Default if no config found
  try {
    const student = await User.findById(studentId).select('assignedSections');
    const courseId = unit.course._id;
    
    // Find quiz configuration for any of the student's assigned sections for this course/unit
    if (student.assignedSections && student.assignedSections.length > 0) {
      const customConfig = await QuizConfiguration.findOne({
        course: courseId,
        section: { $in: student.assignedSections },
        unit: unitId,
        isActive: true
      });
      
      if (customConfig && customConfig.maxAttempts) {
        configuredMaxAttempts = customConfig.maxAttempts;
        console.log(`Using configured maxAttempts: ${configuredMaxAttempts} for section: ${customConfig.section}`);
      } else {
        console.log(`No quiz configuration found for student sections, using default: ${configuredMaxAttempts}`);
      }
    }
  } catch (configError) {
    console.error('Error fetching max attempts from config:', configError);
  }

  const baseAttemptLimit = configuredMaxAttempts; // Use configured value instead of hardcoded 1
  const extraAttempts = unitProgress.extraAttempts || 0;
  let attemptLimit = baseAttemptLimit + extraAttempts;
  
  // **STEP 1: First check QuizLock to get teacher unlock attempts**
  // This MUST happen before security lock check so we use the correct attempt limit
  let quizLocked = false;
  let quizLockInfo = null;
  let teacherUnlockAttempts = 0; // Additional attempts granted by teacher unlocks
  let existingLock = null; // Store for later use
  
  try {
    const QuizLock = require('../models/QuizLock');
    const quizId = unit.quizPool?._id || (unit.quizzes && unit.quizzes[0]?._id);
    
    // **FIX: Search for QuizLock by quiz ID OR by any quiz attempt for this unit**
    // This handles cases where quiz ID changed after lock was created
    if (quizId) {
      existingLock = await QuizLock.findOne({ 
        studentId, 
        quizId
      });
    }
    
    // If not found by current quiz ID, check for locks by student's quiz attempts in this unit
    if (!existingLock) {
      const QuizAttempt = require('../models/QuizAttempt');
      const unitAttempts = await QuizAttempt.find({ 
        student: studentId, 
        unit: unitId 
      }).select('quiz quizPool').lean();
      
      if (unitAttempts.length > 0) {
        const attemptQuizIds = unitAttempts
          .map(a => a.quiz || a.quizPool)
          .filter(Boolean);
        
        if (attemptQuizIds.length > 0) {
          existingLock = await QuizLock.findOne({ 
            studentId, 
            quizId: { $in: attemptQuizIds }
          });
          
          if (existingLock) {
            console.log(`📎 Found QuizLock via unit attempts - Lock quizId: ${existingLock.quizId}, Current unit quizId: ${quizId}`);
          }
        }
      }
    }
    
    if (existingLock) {
      // Grant additional attempts for ALL types of unlocks (teacher, HOD, dean, admin)
      // This must be calculated BEFORE checking if locked
      teacherUnlockAttempts = (existingLock.teacherUnlockCount || 0) + 
                             (existingLock.hodUnlockCount || 0) + 
                             (existingLock.deanUnlockCount || 0) + 
                             (existingLock.adminUnlockCount || 0);
      
      // Update attemptLimit with unlock attempts for all subsequent checks
      attemptLimit += teacherUnlockAttempts;
      console.log(`🔓 Teacher unlocks found: ${teacherUnlockAttempts}, adjusted limit: ${attemptLimit}`);
      
      // **UNIFIED: Only consider locked if student has exhausted ALL attempts**
      // Works for both BELOW_PASSING_SCORE and SECURITY_VIOLATION reasons
      if (existingLock.isLocked && attemptsTaken >= attemptLimit) {
        quizLocked = true;
        quizLockInfo = {
          reason: existingLock.failureReason === 'SECURITY_VIOLATION' 
            ? (existingLock.securityViolationDetails?.reason || 'Security violations detected')
            : existingLock.failureReason,
          lockTimestamp: existingLock.lockTimestamp,
          unlockAuthorizationLevel: existingLock.unlockAuthorizationLevel,
          teacherUnlockCount: existingLock.teacherUnlockCount,
          remainingTeacherUnlocks: existingLock.remainingTeacherUnlocks,
          requiresDeanUnlock: existingLock.requiresDeanUnlock,
          isSecurityViolation: existingLock.failureReason === 'SECURITY_VIOLATION'
        };
        console.log(`🔒 Quiz locked for student - all ${attemptLimit} attempts exhausted (reason: ${existingLock.failureReason})`);
      } else if (existingLock.isLocked) {
        // Lock record exists but student has attempts remaining due to unlocks
        console.log(`ℹ️ Quiz lock record exists but student has ${attemptLimit - attemptsTaken} attempts remaining`);
      }
    }
  } catch (lockError) {
    console.error('Error checking quiz lock:', lockError);
    // Continue without failing the availability check
  }
  
  // **STEP 2: Now check security lock using the ADJUSTED attempt limit**
  // Security lock should only block if attempts are exhausted (including unlocks)
  let securityLocked = false;
  let securityLockInfo = null;
  
  if (unitProgress.securityLock && unitProgress.securityLock.locked) {
    // Security lock record exists, but only truly lock if attempts are exhausted
    // OR if there have been multiple security violations (e.g., 3 or more auto-submits)
    const violationCount = unitProgress.securityLock.violationCount || 0;
    const multipleViolations = violationCount >= 3;
    
    if (attemptsTaken >= attemptLimit || multipleViolations) {
      securityLocked = true;
      securityLockInfo = {
        reason: unitProgress.securityLock.reason || 'Security violations detected',
        lockedAt: unitProgress.securityLock.lockedAt,
        violationCount: violationCount
      };
      console.log(`🔒 Security lock active - violations: ${violationCount}, attempts: ${attemptsTaken}/${attemptLimit}`);
    } else {
      // Security violation happened but student has remaining attempts
      console.log(`ℹ️ Security violation recorded but student has ${attemptLimit - attemptsTaken} attempts remaining`);
    }
  }
  
  const remainingAttempts = quizPassed ? 0 : Math.max(0, attemptLimit - attemptsTaken);
  
  // Combine security lock (legacy) and quiz lock - prefer QuizLock as it supports unlocking
  const isLocked = securityLocked || quizLocked;
  
  // attemptLimit already includes teacher unlock attempts from the QuizLock check above
  const adjustedAttemptLimit = attemptLimit;
  const adjustedRemainingAttempts = quizPassed ? 0 : Math.max(0, attemptLimit - attemptsTaken);
  
  // **NEW: Check if all previous units are complete before allowing quiz**
  const previousUnitsCheck = await checkPreviousUnitsComplete(
    studentId, 
    unit.course._id, 
    unit.order, 
    progress
  );
  
  const allPreviousUnitsComplete = previousUnitsCheck.allPreviousComplete;
  
  if (!allPreviousUnitsComplete) {
    console.log('Previous units incomplete:', previousUnitsCheck.incompleteUnits);
  }
  
  // Use allContentCompleted (videos AND documents) AND allPreviousUnitsComplete AND hasApprovedQuestions
  const available = hasQuiz && hasApprovedQuestions && allContentCompleted && allPreviousUnitsComplete && !quizPassed && !isLocked && attemptsTaken < adjustedAttemptLimit;

    res.json({
      available,
      unitId,
      unitTitle: unit.title,
      courseTitle: unit.course.title,
      allVideosWatched,
      allDocumentsRead,
      allContentCompleted,
      allPreviousUnitsComplete,
      incompleteUnits: previousUnitsCheck.incompleteUnits,
      quizAvailable: available,
      quizCompleted,
      quizPassed,
      hasApprovedQuestions,
      approvedQuestionCount,
      canTakeQuiz: hasQuiz && hasApprovedQuestions && allContentCompleted && allPreviousUnitsComplete && !quizPassed && !isLocked && attemptsTaken < adjustedAttemptLimit,
      isLocked,
      lockInfo: isLocked ? (securityLockInfo || quizLockInfo || {
        reason: 'Quiz locked',
        lockedAt: new Date(),
        violationCount: 0
      }) : null,
      attemptsTaken,
      remainingAttempts: adjustedRemainingAttempts,
      attemptLimit: adjustedAttemptLimit,
      teacherUnlocks: teacherUnlockAttempts, // For debugging - includes all unlock types
      teacherUnlockCount: existingLock?.teacherUnlockCount || 0,
      hodUnlockCount: existingLock?.hodUnlockCount || 0,
      deanUnlockCount: existingLock?.deanUnlockCount || 0,
      adminUnlockCount: existingLock?.adminUnlockCount || 0,
      totalVideos,
      watchedVideos: Math.max(
        unitProgress.videosWatched.filter(v => v.completed).length,
        unitProgress.videosCompleted || 0
      ),
      totalDocuments,
      completedDocuments,
      message: available ? 'Quiz is available' : 
        !hasQuiz ? 'No quiz configured for this unit' :
        !hasApprovedQuestions ? 'Waiting for Course Coordinator to approve quiz questions' :
        !allPreviousUnitsComplete ? 'Complete all previous units (content + quizzes) before taking this quiz' :
        !allVideosWatched ? 'Complete all videos before taking the quiz' : 
        !allDocumentsRead ? 'Complete all documents before taking the quiz' :
        'Quiz not available'
    });
  } catch (err) {
    console.error('Error checking unit quiz availability:', err);
    res.status(500).json({ message: err.message });
  }
};

// Generate random quiz for unit
exports.generateUnitQuiz = async (req, res) => {
  try {
    const { unitId } = req.params;
    const studentId = req.user._id;

    // Get unit with quiz pool
    const unit = await Unit.findById(unitId).populate('course').populate('quizPool');
    if (!unit) {
      return res.status(404).json({ message: 'Unit not found' });
    }

    // Check unit deadline
    const { checkUnitDeadline } = require('../utils/deadlineUtils');
    const deadlineInfo = await checkUnitDeadline(unitId);
    if (deadlineInfo.hasDeadline && deadlineInfo.isExpired && deadlineInfo.strictDeadline) {
      return res.status(403).json({ 
        message: 'This unit quiz is no longer accessible. The unit deadline has passed.',
        deadlineInfo: {
          deadline: deadlineInfo.deadline,
          daysLeft: deadlineInfo.daysLeft,
          deadlineDescription: deadlineInfo.deadlineDescription
        }
      });
    }

    console.log('Unit structure:', {
      id: unit._id,
      title: unit.title,
      hasQuizPool: !!unit.quizPool,
      quizPoolId: unit.quizPool?._id,
      hasQuizzes: !!unit.quizzes,
      quizzesLength: unit.quizzes?.length || 0,
      videosLength: unit.videos?.length || 0
    });

    // Check if student can take quiz
    const progress = await StudentProgress.findOne({ 
      student: studentId, 
      course: unit.course._id 
    });

    const unitProgress = progress.units.find(u => u.unitId.toString() === unitId);
    if (!unitProgress) {
      return res.status(403).json({ message: 'Unit not accessible' });
    }

    // **FIX: Check for approved arrangement to get the actual video count for this unit**
    const ContentArrangement = require('../models/ContentArrangement');
    let totalVideos = unit.videos.length;
    let unitVideoIds = unit.videos.map(v => v._id ? v._id.toString() : v.toString());
    
    if (unit.course.isLaunched) {
      const approvedArrangement = await ContentArrangement.findOne({
        course: unit.course._id,
        status: 'approved'
      }).sort({ version: -1 });
      
      if (approvedArrangement) {
        const arrangementVideos = approvedArrangement.items.filter(
          item => item.type === 'video' && item.unitId.toString() === unitId
        );
        totalVideos = arrangementVideos.length;
        unitVideoIds = arrangementVideos.map(item => item.contentId.toString());
        
        console.log('Using approved arrangement for video count in generateQuiz:', {
          unitId,
          videosInArrangement: totalVideos
        });
      }
    }

    // Check if all videos are watched - use multiple methods for reliability
    let allVideosWatched = false;
    
    if (totalVideos === 0) {
      allVideosWatched = true; // No videos to watch
    } else {
      // Method 1: Check via videosWatched array (filter by videos in unit)
      const watchedViaArray = unitProgress.videosWatched.filter(v => 
        v.completed && unitVideoIds.includes(v.videoId.toString())
      ).length;
      
      // Method 2: Check videosCompleted counter
      const watchedViaCounter = unitProgress.videosCompleted || 0;
      
      // Method 3: Check individual video progress entries
      const videoProgressEntries = progress.videoProgress || [];
      const watchedViaEntries = unitVideoIds.filter(videoId => {
        const videoProgress = videoProgressEntries.find(vp => vp.videoId.toString() === videoId);
        return videoProgress && videoProgress.completed;
      }).length;
      
      // Use the highest count as the most reliable indicator
      const maxWatchedCount = Math.max(watchedViaArray, watchedViaCounter, watchedViaEntries);
      allVideosWatched = maxWatchedCount >= totalVideos;
      
      console.log('Quiz generation check:', {
        unitId,
        totalVideos,
        unitVideoIds,
        watchedViaArray,
        watchedViaCounter, 
        watchedViaEntries,
        maxWatchedCount,
        allVideosWatched
      });
    }

    if (!allVideosWatched) {
      return res.status(403).json({ message: 'Complete all videos before taking the quiz' });
    }

    // **NEW: Check if all documents are read**
    let allDocumentsRead = true;
    const completedReadingMaterials = progress.completedReadingMaterials || [];
    const completedReadingMaterialIds = completedReadingMaterials.map(id => id.toString());
    
    // Get documents for this unit
    const unitDocs = await ReadingMaterial.find({ unit: unitId, isApproved: { $ne: false } });
    const totalDocuments = unitDocs.length;
    const unitDocumentIds = unitDocs.map(d => d._id.toString());
    
    if (totalDocuments > 0) {
      const docsRead = unitDocumentIds.filter(docId => 
        completedReadingMaterialIds.includes(docId)
      ).length;
      allDocumentsRead = docsRead >= totalDocuments;
    }
    
    if (!allDocumentsRead) {
      return res.status(403).json({ message: 'Complete all documents before taking the quiz' });
    }

    // **NEW: Check if all previous units are complete (videos + docs + quiz)**
    const previousUnitsCheck = await checkPreviousUnitsComplete(
      studentId, 
      unit.course._id, 
      unit.order, 
      progress
    );
    
    if (!previousUnitsCheck.allPreviousComplete) {
      const incompleteUnit = previousUnitsCheck.incompleteUnits[0];
      return res.status(403).json({ 
        message: `Complete all content in previous units first. Unit "${incompleteUnit.unitTitle}" is incomplete.`,
        incompleteUnits: previousUnitsCheck.incompleteUnits,
        requiresPreviousUnits: true
      });
    }

    // **FIXED: Check quiz lock ONLY if student has exhausted all attempts**
    // First, get attempt counts and limits, then check if locked
    // This is needed because the lock check below needs to know the attempt limit

    // Check if already passed
    if (unitProgress.unitQuizPassed) {
      return res.status(403).json({ message: 'Quiz already passed for this unit' });
    }

    // Enforce attempt limit using configured maxAttempts
    const attemptsTaken = await QuizAttempt.countDocuments({
      student: studentId,
      unit: unitId,
      $or: [
        { completedAt: { $ne: null } },
        { isComplete: true }
      ]
    });
    
    // Fetch quiz configuration to get maxAttempts
    let configuredMaxAttempts = 3; // Default if no config found
    try {
      const student = await User.findById(studentId).select('assignedSections');
      const courseId = unit.course._id;
      
      // Find quiz configuration for any of the student's assigned sections
      if (student.assignedSections && student.assignedSections.length > 0) {
        const customConfig = await QuizConfiguration.findOne({
          course: courseId,
          section: { $in: student.assignedSections },
          unit: unitId,
          isActive: true
        });
        
        if (customConfig && customConfig.maxAttempts) {
          configuredMaxAttempts = customConfig.maxAttempts;
          console.log(`Using configured maxAttempts: ${configuredMaxAttempts}`);
        }
      }
    } catch (configError) {
      console.error('Error fetching max attempts from config:', configError);
    }

    const baseAttemptLimit = configuredMaxAttempts; // Use configured value
    const extraAttempts = unitProgress.extraAttempts || 0;
    let attemptLimit = baseAttemptLimit + extraAttempts;
    
    // **FIXED: Check teacher unlock attempts AND quiz lock status**
    try {
      const QuizLock = require('../models/QuizLock');
      const quizId = unit.quizPool?._id || (unit.quizzes && unit.quizzes[0]?._id);
      
      let existingLock = null;
      
      // First try to find by current quiz ID
      if (quizId) {
        existingLock = await QuizLock.findOne({ 
          studentId, 
          quizId
        });
      }
      
      // **FIX: If not found, check for locks by student's quiz attempts in this unit**
      // This handles cases where quiz ID changed after lock was created
      if (!existingLock) {
        const QuizAttempt = require('../models/QuizAttempt');
        const unitAttempts = await QuizAttempt.find({ 
          student: studentId, 
          unit: unitId 
        }).select('quiz quizPool').lean();
        
        if (unitAttempts.length > 0) {
          const attemptQuizIds = unitAttempts
            .map(a => a.quiz || a.quizPool)
            .filter(Boolean);
          
          if (attemptQuizIds.length > 0) {
            existingLock = await QuizLock.findOne({ 
              studentId, 
              quizId: { $in: attemptQuizIds }
            });
            
            if (existingLock) {
              console.log(`📎 Found QuizLock via unit attempts - Lock quizId: ${existingLock.quizId}, Current unit quizId: ${quizId}`);
            }
          }
        }
      }
      
      if (existingLock) {
          // Grant additional attempts for ALL types of unlocks (1 attempt per unlock)
          const totalUnlocks = (existingLock.teacherUnlockCount || 0) + 
                               (existingLock.hodUnlockCount || 0) + 
                               (existingLock.deanUnlockCount || 0) + 
                               (existingLock.adminUnlockCount || 0);
          
          if (totalUnlocks > 0) {
            attemptLimit += totalUnlocks;
            console.log(`🔓 Total unlocks (${totalUnlocks}) granted additional attempts. New limit: ${attemptLimit}`);
            console.log(`  - Teacher: ${existingLock.teacherUnlockCount || 0}`);
            console.log(`  - HOD: ${existingLock.hodUnlockCount || 0}`);
            console.log(`  - Dean: ${existingLock.deanUnlockCount || 0}`);
            console.log(`  - Admin: ${existingLock.adminUnlockCount || 0}`);
          }
          
          // **FIX: Only block if locked AND all attempts exhausted**
          if (existingLock.isLocked && attemptsTaken >= attemptLimit) {
            console.log(`🔒 Quiz access blocked - student ${studentId} has locked quiz ${quizId} and exhausted ${attemptLimit} attempts`);
            return res.status(403).json({ 
              message: 'Quiz is locked. All attempts exhausted. Contact your teacher for unlock.',
              isLocked: true,
              attemptsTaken,
              attemptLimit,
              lockInfo: {
                reason: existingLock.failureReason,
                lockTimestamp: existingLock.lockTimestamp,
                unlockAuthorizationLevel: existingLock.unlockAuthorizationLevel,
                teacherUnlockCount: existingLock.teacherUnlockCount,
                remainingTeacherUnlocks: existingLock.remainingTeacherUnlocks,
                requiresDeanUnlock: existingLock.requiresDeanUnlock
              }
            });
          } else if (existingLock.isLocked) {
            // Lock exists but student has attempts remaining
            console.log(`ℹ️ Quiz lock record exists but student has ${attemptLimit - attemptsTaken} attempts remaining`);
          }
        }
    } catch (lockError) {
      console.error('Error checking teacher unlocks for attempt limit:', lockError);
    }
    
    if (attemptsTaken >= attemptLimit) {
      return res.status(403).json({ 
        message: `Attempt limit reached (${attemptLimit}). Please contact your instructor.`,
        attemptsTaken,
        attemptLimit,
        remainingAttempts: 0
      });
    }
    
    // **FIXED: Check security lock - only block if attempts exhausted OR multiple violations**
    if (unitProgress.securityLock && unitProgress.securityLock.locked) {
      const violationCount = unitProgress.securityLock.violationCount || 0;
      const multipleViolations = violationCount >= 3;
      
      // Only block if attempts exhausted OR multiple violations
      if (attemptsTaken >= attemptLimit || multipleViolations) {
        console.log(`🔒 Security lock blocking quiz generation - violations: ${violationCount}, attempts: ${attemptsTaken}/${attemptLimit}`);
        return res.status(403).json({ 
          message: multipleViolations 
            ? 'Quiz locked due to repeated security violations. Contact your teacher.'
            : 'Quiz locked. All attempts exhausted after security violations. Contact your teacher.',
          isLocked: true,
          attemptsTaken,
          attemptLimit,
          lockInfo: {
            reason: unitProgress.securityLock.reason,
            lockedAt: unitProgress.securityLock.lockedAt,
            violationCount: violationCount
          }
        });
      } else {
        // Security violation happened but student has remaining attempts
        console.log(`ℹ️ Security violation recorded (count: ${violationCount}) but student has ${attemptLimit - attemptsTaken} attempts remaining`);
      }
    }

    let selectedQuestions = [];
    let quizSource = null;
    
    // **NEW: Fetch quiz configuration for this unit/section**
    let quizConfig = {
      timeLimit: 30,
      numberOfQuestions: 10,
      shuffleQuestions: true
    };
    
    try {
      // Get student's sections
      const student = await User.findById(studentId).select('assignedSections');
      const courseId = unit.course._id;
      
      // Find quiz configuration for any of the student's assigned sections
      if (student.assignedSections && student.assignedSections.length > 0) {
        const customConfig = await QuizConfiguration.findOne({
          course: courseId,
          section: { $in: student.assignedSections },
          unit: unitId,
          isActive: true
        });
        
        if (customConfig) {
          quizConfig = {
            timeLimit: customConfig.timeLimit,
            numberOfQuestions: customConfig.numberOfQuestions,
            shuffleQuestions: customConfig.shuffleQuestions
          };
          console.log('Using custom quiz configuration:', quizConfig);
        } else {
          console.log('Using default quiz configuration:', quizConfig);
        }
      } else {
        console.log('Student has no assigned sections, using defaults');
      }
    } catch (configError) {
      console.error('Error fetching quiz configuration, using defaults:', configError);
    }

    // **CENTRALIZED POOL**: Look up quiz pool by course+unit (not by unit.quizPool reference)
    // This ensures all sections share the same question pool for a given course+unit
    const courseId = unit.course._id;
    const quizPool = await QuizPool.findOne({ 
      course: courseId, 
      unit: unitId, 
      isActive: true 
    }).populate('quizzes');
    
    if (quizPool) {
      console.log('Found centralized quiz pool for course+unit:', quizPool._id);
      
      // Collect all questions from all quizzes in the pool
      // Only include CC-approved questions from QuestionReview
      const QuestionReview = require('../models/QuestionReview');
      const approvedReviews = await QuestionReview.find({
        status: 'approved',
        course: courseId,
        unit: unitId,
        quiz: { $in: quizPool.quizzes.map(q => q._id) }
      }).select('questionId');
      
      // CRITICAL: Questions MUST be CC-approved - no legacy mode bypass
      if (approvedReviews.length === 0) {
        console.log('No CC-approved questions found in quiz pool for unit:', unitId);
        return res.status(403).json({ 
          message: 'No approved questions available for this quiz. The Course Coordinator must approve questions before students can take the exam.',
          requiresApproval: true
        });
      }
      
      const approvedSet = new Set(approvedReviews.map(r => r.questionId.toString()));
      
      let allQuestions = [];
      if (quizPool.quizzes && quizPool.quizzes.length > 0) {
        for (const quiz of quizPool.quizzes) {
          if (quiz.questions && quiz.questions.length > 0) {
            for (const q of quiz.questions) {
              // ONLY include CC-approved questions
              if (approvedSet.has(q._id.toString())) {
                allQuestions.push({
                  ...q.toObject(),
                  quizId: quiz._id
                });
              }
            }
          }
        }
      }
      
      console.log(`Total CC-approved questions in centralized pool: ${allQuestions.length}`);
      
      if (allQuestions.length < quizConfig.numberOfQuestions) {
        console.log('Insufficient CC-approved questions in quiz pool:', allQuestions.length);
        return res.status(400).json({ 
          message: `Insufficient approved questions for this quiz. Found ${allQuestions.length} approved questions, need at least ${quizConfig.numberOfQuestions}. Please contact the Course Coordinator.`,
          availableQuestions: allQuestions.length,
          requiredQuestions: quizConfig.numberOfQuestions
        });
      }

      // Randomly select configured number of questions
      const shuffled = quizConfig.shuffleQuestions 
        ? [...allQuestions].sort(() => 0.5 - Math.random())
        : allQuestions;
      selectedQuestions = shuffled.slice(0, quizConfig.numberOfQuestions).map(q => ({
        questionId: q._id,
        questionText: q.questionText,
        options: q.options,
        correctOption: q.correctOption,
        points: q.points || 1,
        quizId: q.quizId
      }));
      quizSource = { quizPool: quizPool._id };
    } else if (unit.quizzes && unit.quizzes.length > 0) {
      console.log('Unit has quizzes:', unit.quizzes.length);
      // Use questions from unit quizzes
      const quiz = await Quiz.findById(unit.quizzes[0]);
      if (!quiz) {
        console.log('Quiz not found');
        return res.status(400).json({ message: 'Quiz not found' });
      }
      if (!quiz.questions || quiz.questions.length < quizConfig.numberOfQuestions) {
        console.log('Insufficient questions in quiz:', quiz.questions?.length || 0);
        return res.status(400).json({ message: 'Insufficient questions in quiz' });
      }

      const shuffled = quizConfig.shuffleQuestions
        ? [...quiz.questions].sort(() => 0.5 - Math.random())
        : quiz.questions;
      selectedQuestions = shuffled.slice(0, quizConfig.numberOfQuestions).map(q => ({
        questionId: q._id,
        questionText: q.questionText,
        options: q.options,
        correctOption: q.correctOption,
        points: q.points || 1
      }));
      quizSource = { quiz: quiz._id };
    } else {
      return res.status(400).json({ message: 'No quiz available for this unit' });
    }

    // Check for existing quiz attempts for this unit
    let existingAttempt;
    if (quizSource.quizPool) {
      // For quiz pool, check by student, unit, and quizPool
      existingAttempt = await QuizAttempt.findOne({
        student: studentId,
        unit: unitId,
        quizPool: quizSource.quizPool,
        completedAt: { $exists: false } // Only check for incomplete attempts
      });
    } else {
      // For regular quiz, check by student and quiz
      existingAttempt = await QuizAttempt.findOne({
        student: studentId,
        quiz: unit.quizzes[0],
        completedAt: { $exists: false } // Only check for incomplete attempts
      });
    }

    // If there's an existing incomplete attempt, check if destroyIncomplete param is set
    if (existingAttempt) {
      if (req.query.destroyIncomplete === 'true') {
        // Delete the incomplete attempt and proceed to create a new one
        await existingAttempt.deleteOne();
        console.log('Destroyed existing incomplete quiz attempt:', existingAttempt._id);
      } else {
        console.log('Found existing incomplete quiz attempt:', existingAttempt._id);
        const quizForStudent = {
          success: true,
          quizSessionId: existingAttempt._id,
          attemptId: existingAttempt._id,
          unitTitle: unit.title,
          courseTitle: unit.course.title,
          timeLimit: quizConfig.timeLimit,
          incomplete: true,
          questions: existingAttempt.questions.map((q, index) => ({
            questionNumber: index + 1,
            questionId: q.questionId,
            questionText: q.questionText,
            options: q.options,
            points: q.points
          }))
        };
        return res.json(quizForStudent);
      }
    }

    // Create quiz attempt
    const quizAttempt = new QuizAttempt({
      ...quizSource,
      student: studentId,
      course: unit.course._id,
      unit: unitId,
      questions: selectedQuestions,
      answers: [],
      score: 0,
      maxScore: selectedQuestions.reduce((sum, q) => sum + q.points, 0),
      percentage: 0,
      passed: false,
      startedAt: new Date()
    });

    console.log('Creating new quiz attempt with data:', {
      student: studentId,
      course: unit.course._id,
      unit: unitId,
      quizPool: quizSource.quizPool || null,
      quiz: quizSource.quiz || null,
      questionsCount: selectedQuestions.length
    });

    await quizAttempt.save();

    // Return quiz questions without correct answers
    const quizForStudent = {
      success: true,
      quizSessionId: quizAttempt._id,
      attemptId: quizAttempt._id,
      unitTitle: unit.title,
      courseTitle: unit.course.title,
      timeLimit: quizConfig.timeLimit,
      questions: selectedQuestions.map((q, index) => ({
        questionNumber: index + 1,
        questionId: q.questionId,
        questionText: q.questionText,
        options: q.options,
        points: q.points
      }))
    };

    res.json(quizForStudent);
  } catch (err) {
    console.error('Error generating unit quiz:', err);
    res.status(500).json({ success: false, message: err.message });
  }
};

// Submit quiz answers
exports.submitUnitQuiz = async (req, res) => {
  try {
    const { attemptId } = req.params;
    const { 
      answers, 
      securityViolations = [], 
      tabSwitchCount = 0, 
      isAutoSubmit = false, 
      timeSpent = 0 
    } = req.body; // Array of {questionId, selectedOption} plus security data
    const studentId = req.user._id;

    console.log('Quiz submission received:', {
      attemptId,
      studentId,
      answersCount: answers?.length || 0,
      securityViolations: securityViolations.length,
      tabSwitchCount,
      isAutoSubmit,
      timeSpent
    });

    console.log('🔍 Backend securityViolations type:', typeof securityViolations);
    console.log('🔍 Backend securityViolations Array.isArray:', Array.isArray(securityViolations));
    console.log('🔍 Backend securityViolations:', securityViolations);

    // Get quiz attempt
    const attempt = await QuizAttempt.findById(attemptId);
    if (!attempt) {
      return res.status(404).json({ message: 'Quiz attempt not found' });
    }

    if (attempt.student.toString() !== studentId.toString()) {
      return res.status(403).json({ message: 'Not your quiz attempt' });
    }

    if (attempt.completedAt) {
      return res.status(400).json({ 
        message: 'Quiz already submitted',
        attempt: {
          score: attempt.score,
          percentage: attempt.percentage,
          passed: attempt.passed,
          completedAt: attempt.completedAt
        },
        completed: true
      });
    }

  // Log security violations if any
  if (securityViolations.length > 0 || tabSwitchCount > 0) {
      console.warn('Security violations detected:', {
        studentId,
        attemptId,
        violations: securityViolations,
        tabSwitchCount,
        isAutoSubmit
      });
      
      // You might want to store these violations in a separate collection
      // for analysis and potential disciplinary actions
    }

    // Get passing percentage from quiz configuration
    let passingPercentage = 70; // Default
    try {
      const student = await User.findById(studentId).select('assignedSections');
      if (student.assignedSections && student.assignedSections.length > 0) {
        const quizConfig = await QuizConfiguration.findOne({
          course: attempt.course,
          section: { $in: student.assignedSections },
          unit: attempt.unit,
          isActive: true
        });
        if (quizConfig && quizConfig.passingPercentage) {
          passingPercentage = quizConfig.passingPercentage;
          console.log(`Using configured passingPercentage: ${passingPercentage}%`);
        }
      }
    } catch (configErr) {
      console.error('Error fetching passing percentage from config:', configErr);
    }

    // Grade the quiz
    let score = 0;
    const gradedAnswers = [];

    // If no answers provided (auto-submit due to violations), mark all as incorrect
    const answersToProcess = answers || [];

    for (const question of attempt.questions) {
      const answer = answersToProcess.find(a => a.questionId === question.questionId.toString());
      
      if (answer && answer.selectedOption !== undefined && answer.selectedOption !== null) {
        const isCorrect = question.correctOption === answer.selectedOption;
        const points = isCorrect ? question.points : 0;
        score += points;

        gradedAnswers.push({
          questionId: question.questionId,
          selectedOption: answer.selectedOption,
          isCorrect,
          points
        });
      } else {
        // No answer provided - mark as incorrect
        gradedAnswers.push({
          questionId: question.questionId,
          selectedOption: null,
          isCorrect: false,
          points: 0
        });
      }
    }

    const percentage = Math.round((score / attempt.maxScore) * 100);
    const passed = percentage >= passingPercentage; // Use configured passing percentage

    // **REMOVED SCORE PENALTY**: Security violations no longer deduct marks
    // Penalty is now handled on frontend as time deduction (1 min wait per violation)
    let finalScore = score;
    let finalPercentage = percentage;
    
    // Filter out technical violations for logging purposes only
    const actualViolations = securityViolations.filter(violation => {
      const violationType = typeof violation === 'string' ? violation : (violation.type || violation.message || '');
      const violationMessage = typeof violation === 'string' ? violation : (violation.message || '');
      
      // Don't count technical browser issues as violations
      if (violationType.includes('fullscreen-error') || violationMessage.includes('Permissions check failed')) {
        return false;
      }
      if (violationType.includes('browser compatibility') || violationMessage.includes('browser compatibility')) {
        return false;
      }
      return true;
    });

  // Update quiz attempt with security data (no score penalty applied)
    attempt.answers = gradedAnswers;
    attempt.score = finalScore;
    attempt.percentage = finalPercentage;
    attempt.passed = finalPercentage >= passingPercentage; // Use configured passing percentage
    attempt.completedAt = new Date();
    attempt.timeSpent = timeSpent > 0 ? timeSpent : Math.round((Date.now() - attempt.startedAt) / 1000);
    
    // Store security information - map 'type' to 'violationType' to avoid Mongoose schema conflict
    const mappedViolations = securityViolations.map(v => ({
      violationType: v.type || 'UNKNOWN',
      timestamp: v.timestamp,
      message: v.message,
      key: v.key,
      count: v.count,
      method: v.method,
      detection: v.detection
    }));
    
    console.log('🔍 About to set securityData with violations:', JSON.stringify(mappedViolations, null, 2));
    
    attempt.securityData = {
      violations: mappedViolations,
      tabSwitchCount,
      isAutoSubmit,
      securityPenalty: 0, // No score penalty - penalty is time-based on frontend
      originalScore: score,
      originalPercentage: percentage
    };

    console.log('🔍 After setting securityData:', JSON.stringify(attempt.securityData, null, 2));

    // Mark attempt as submitted/complete for consistency with other flows
    attempt.isSubmitted = true;
    attempt.isComplete = true;
    await attempt.save();

    // Log security violations for audit
    if (securityViolations.length > 0 || tabSwitchCount > 0) {
      // Calculate time penalty (60 seconds per violation)
      const timePenaltyPerViolation = 60; // seconds
      const totalTimePenalty = tabSwitchCount * timePenaltyPerViolation;
      
      console.log('Quiz completed with security concerns:', {
        studentId,
        attemptId,
        score,
        percentage,
        violations: securityViolations.length,
        tabSwitches: tabSwitchCount,
        totalTimePenalty: `${totalTimePenalty} seconds`,
        autoSubmitted: isAutoSubmit
      });

      // Create security audit records
      try {
        for (const violation of securityViolations) {
          await QuizSecurityAudit.create({
            student: studentId,
            course: attempt.course,
            unit: attempt.unit,
            quizAttempt: attempt._id,
            violationType: violation.type || 'SUSPICIOUS_ACTIVITY',
            severity: getSeverityLevel(violation.type, tabSwitchCount),
            description: violation.message || 'Security violation detected',
            details: {
              timestamp: violation.timestamp || new Date(),
              userAgent: req.headers['user-agent'],
              ipAddress: req.ip || req.connection.remoteAddress,
              additionalData: violation
            },
            timePenaltyApplied: timePenaltyPerViolation,
            action: isAutoSubmit ? 'AUTO_SUBMIT' : 'PENALTY'
          });
        }

        // Log tab switching as separate violation if significant
        if (tabSwitchCount > 3) {
          await QuizSecurityAudit.create({
            student: studentId,
            course: attempt.course,
            unit: attempt.unit,
            quizAttempt: attempt._id,
            violationType: 'TAB_SWITCH',
            severity: tabSwitchCount > 5 ? 'HIGH' : 'MEDIUM',
            description: `Excessive tab switching detected: ${tabSwitchCount} times`,
            details: {
              timestamp: new Date(),
              userAgent: req.headers['user-agent'],
              ipAddress: req.ip || req.connection.remoteAddress,
              additionalData: { tabSwitchCount, maxAllowed: 3, totalTimePenalty }
            },
            timePenaltyApplied: totalTimePenalty,
            action: isAutoSubmit ? 'AUTO_SUBMIT' : 'PENALTY'
          });
        }
      } catch (auditError) {
        console.error('Failed to create security audit records:', auditError);
        // Don't fail the quiz submission due to audit logging issues
      }
    }

    // Update student progress
    const progress = await StudentProgress.findOne({ 
      student: studentId, 
      course: attempt.course 
    });

    if (progress) {
      const unitProgress = progress.units.find(u => u.unitId.toString() === attempt.unit.toString());
      if (unitProgress) {
        // Add quiz attempt to unit progress
        unitProgress.quizAttempts.push({
          quizId: attempt.quiz,
          quizPoolId: attempt.quizPool,
          attemptId: attempt._id,
          score: finalScore,
          maxScore: attempt.maxScore,
          percentage: finalPercentage,
          passed: attempt.passed,
          completedAt: attempt.completedAt
        });

        unitProgress.unitQuizCompleted = true;
        unitProgress.unitQuizPassed = attempt.passed;

        if (attempt.passed) {
          unitProgress.status = 'completed';
          unitProgress.completedAt = new Date();

          // Unlock next unit
          await unlockNextUnit(progress, attempt.course, attempt.unit);
        }

        // Detect condition for auto-submission and locking
        // Auto submit should already be reflected in isAutoSubmit; ensure lock when threshold hit
        // Criteria: explicit isAutoSubmit OR (tabSwitchCount >= 3) OR (FULLSCREEN_EXIT violations >= 3)
        const fsExitCount = (securityViolations || []).filter(v => (v.type || v.violationType) === 'FULLSCREEN_EXIT').length;
        const autoSubmitTriggered = isAutoSubmit || tabSwitchCount >= 3 || fsExitCount >= 3;
        if (autoSubmitTriggered && !(unitProgress.securityLock && unitProgress.securityLock.locked)) {
          const securityLockReason = tabSwitchCount >= 3
            ? 'Auto-submitted due to excessive tab changes'
            : fsExitCount >= 3
              ? 'Auto-submitted due to repeated fullscreen exit'
              : 'Auto-submitted due to security violations';
          
          unitProgress.securityLock = unitProgress.securityLock || {};
          unitProgress.securityLock.locked = true;
          unitProgress.securityLock.reason = securityLockReason;
          unitProgress.securityLock.lockedAt = new Date();
          unitProgress.securityLock.violationCount = (unitProgress.securityLock.violationCount || 0) + 1;
          unitProgress.securityLock.autoSubmittedAttempt = attempt._id;
          
          // **CREATE QuizLock record for security violations - enables unlock request flow**
          try {
            const QuizLock = require('../models/QuizLock');
            const quizId = attempt.quiz;
            
            if (quizId) {
              let quizLock = await QuizLock.findOne({ studentId, quizId });
              
              if (!quizLock) {
                quizLock = new QuizLock({
                  studentId,
                  quizId,
                  courseId: attempt.course,
                  isLocked: true,
                  failureReason: 'SECURITY_VIOLATION',
                  failedScore: finalPercentage,
                  lockTimestamp: new Date(),
                  unlockAuthorizationLevel: 'TEACHER',
                  teacherUnlockCount: 0,
                  remainingTeacherUnlocks: 3,
                  requiresDeanUnlock: false,
                  securityViolationDetails: {
                    tabSwitchCount,
                    fullscreenExitCount: fsExitCount,
                    reason: securityLockReason,
                    attemptId: attempt._id
                  }
                });
              } else {
                // Update existing lock with security violation
                quizLock.isLocked = true;
                quizLock.failureReason = 'SECURITY_VIOLATION';
                quizLock.lockTimestamp = new Date();
                quizLock.securityViolationDetails = {
                  tabSwitchCount,
                  fullscreenExitCount: fsExitCount,
                  reason: securityLockReason,
                  attemptId: attempt._id
                };
              }
              
              await quizLock.save();
              console.log(`🔒 QuizLock created/updated for security violation - Student: ${studentId}, Quiz: ${quizId}`);
            }
          } catch (lockError) {
            console.error('Error creating QuizLock for security violation:', lockError);
            // Don't fail the submission if lock creation fails
          }
        }

        await progress.save();
      }
    }

    // **AUTOMATIC CERTIFICATE REGENERATION: Update certificate if it exists**
    try {
      const Certificate = require('../models/Certificate');
      const Section = require('../models/Section');
      
      // Find student's section for this course
      const student = await User.findById(studentId);
      const section = await Section.findOne({
        course: attempt.course,
        _id: { $in: student.assignedSections }
      });
      
      if (section) {
        // Check if certificate exists for this student/course/section
        const existingCertificate = await Certificate.findOne({
          student: studentId,
          course: attempt.course,
          section: section._id,
          status: 'active'
        });
        
        if (existingCertificate) {
          console.log(`📜 Updating certificate for student ${studentId} with new marks...`);
          
          // Recalculate marks: Average of PASSED quiz percentages
          // Get all quizzes for the course
          const Quiz = require('../models/Quiz');
          const quizzes = await Quiz.find({ course: attempt.course });
          
          // Get all quiz attempts for this student
          const allAttempts = await QuizAttempt.find({
            student: studentId,
            quiz: { $in: quizzes.map(q => q._id) }
          });
          
          // Get best attempt per quiz
          const bestAttempts = {};
          allAttempts.forEach(att => {
            const quizId = att.quiz.toString();
            if (!bestAttempts[quizId] || att.percentage > bestAttempts[quizId].percentage) {
              bestAttempts[quizId] = att;
            }
          });
          
          // Get ONLY PASSED quizzes (percentage >= 70 or passed flag)
          const passedQuizAttempts = Object.values(bestAttempts).filter(
            att => att.passed || att.percentage >= 70
          );
          
          // Calculate average: Sum of passed quiz percentages / Number of passed quizzes
          let newMarks = 0;
          if (passedQuizAttempts.length > 0) {
            const totalPercentage = passedQuizAttempts.reduce(
              (sum, att) => sum + (att.percentage || 0), 0
            );
            newMarks = Math.round(totalPercentage / passedQuizAttempts.length);
          }
          
          console.log(`📊 Calculated new marks: ${newMarks}% (from ${passedQuizAttempts.length} passed quizzes)`);
          
          // Update certificate marks and regenerate verification data
          const crypto = require('crypto');
          const QRCode = require('qrcode');
          
          existingCertificate.marksPercentage = newMarks;
          
          // Regenerate verification hash with updated marks
          const hashData = [
            existingCertificate.certificateNumber,
            studentId.toString(),
            attempt.course.toString(),
            newMarks.toString(),
            existingCertificate.issueDate.toISOString()
          ].join('|');
          
          existingCertificate.verificationHash = crypto
            .createHash('sha256')
            .update(hashData)
            .digest('hex');
          
          // Regenerate verification URL
          existingCertificate.verificationUrl = `${process.env.FRONTEND_URL}/verify-certificate/${existingCertificate.verificationHash}`;
          
          // Regenerate QR code
          try {
            existingCertificate.qrCodeData = await QRCode.toDataURL(existingCertificate.verificationUrl);
          } catch (qrError) {
            console.error('QR code regeneration error:', qrError);
          }
          
          await existingCertificate.save();
          console.log(`✅ Certificate updated successfully with ${newMarks}% marks`);
        }
      }
    } catch (certError) {
      console.error('Error updating certificate:', certError);
      // Don't fail the quiz submission due to certificate update errors
    }

    // **FIXED: Check and lock quiz ONLY when student has exhausted all attempts**
    try {
      if (!attempt.passed) {
        console.log(`🔒 Student failed quiz (${finalPercentage}%). Checking if quiz should be locked...`);
        
        const QuizLock = require('../models/QuizLock');
        
        // Get max attempts and passing score from quiz configuration
        let maxAttempts = 3; // Default
        let passingScore = 70; // Default
        try {
          const student = await User.findById(studentId).select('assignedSections');
          if (student.assignedSections && student.assignedSections.length > 0) {
            const quizConfig = await QuizConfiguration.findOne({
              course: attempt.course,
              section: { $in: student.assignedSections },
              unit: attempt.unit,
              isActive: true
            });
            if (quizConfig) {
              if (quizConfig.maxAttempts) {
                maxAttempts = quizConfig.maxAttempts;
              }
              if (quizConfig.passingPercentage) {
                passingScore = quizConfig.passingPercentage;
              }
            }
          }
        } catch (configErr) {
          console.error('Error fetching quiz config:', configErr);
        }
        
        // Get or create quiz lock record with actual passing score
        const lock = await QuizLock.getOrCreateLock(
          studentId, 
          attempt.quiz || attempt.quizPool, 
          attempt.course, 
          passingScore
        );
        
        // Record the attempt in the lock
        await lock.recordAttempt(finalPercentage);
        
        // Count completed attempts for this quiz
        const completedAttempts = await QuizAttempt.countDocuments({
          student: studentId,
          unit: attempt.unit,
          $or: [
            { completedAt: { $ne: null } },
            { isComplete: true }
          ]
        });
        
        // Calculate total allowed attempts including unlocks
        const totalUnlocks = (lock.teacherUnlockCount || 0) + 
                            (lock.hodUnlockCount || 0) + 
                            (lock.deanUnlockCount || 0) + 
                            (lock.adminUnlockCount || 0);
        const totalAllowedAttempts = maxAttempts + totalUnlocks;
        
        console.log(`📊 Attempt check: ${completedAttempts}/${totalAllowedAttempts} (base: ${maxAttempts}, unlocks: ${totalUnlocks}, passingScore: ${passingScore}%)`);
        
        // Only lock if student has exhausted all allowed attempts
        if (completedAttempts >= totalAllowedAttempts) {
          await lock.lockQuiz('BELOW_PASSING_SCORE', finalPercentage, passingScore);
          console.log(`✅ Quiz LOCKED for student ${studentId} - exhausted all ${totalAllowedAttempts} attempts`);
        } else {
          console.log(`ℹ️ Quiz NOT locked - student has ${totalAllowedAttempts - completedAttempts} attempts remaining`);
        }
      }
    } catch (lockError) {
      console.error('Error checking/locking quiz:', lockError);
      // Don't fail the submission due to lock errors
    }

    // Return results with security information
    // Note: securityPenalty is 0 because we use TIME penalty (60s wait), not score penalty
    const securityPenalty = 0;
    
    res.json({
      attemptId: attempt._id,
      score: finalScore,
      maxScore: attempt.maxScore,
      percentage: finalPercentage,
      passed: attempt.passed,
      passingScore: 70,
      originalScore: score,
      originalPercentage: percentage,
      securityPenalty,
      securityViolations: securityViolations.length,
      tabSwitchCount,
      isAutoSubmit,
      message: attempt.passed 
        ? 'Congratulations! You passed the quiz.' 
        : tabSwitchCount > 0 
          ? `Quiz completed with ${tabSwitchCount} tab switch violation(s). Time penalties were applied during the quiz.`
          : 'You need 70% to pass. Please review the content and try again.',
      nextUnitUnlocked: attempt.passed,
      timeSpent: attempt.timeSpent
    });
  } catch (err) {
    console.error('Error submitting unit quiz:', err);
    res.status(500).json({ message: err.message });
  }
};

// Helper function to unlock next unit
async function unlockNextUnit(progress, courseId, currentUnitId) {
  try {
    // Get current unit to find its order
    const currentUnit = await Unit.findById(currentUnitId);
    if (!currentUnit) return;

    // Find next unit by order
    const nextUnit = await Unit.findOne({
      course: courseId,
      order: currentUnit.order + 1
    });

    if (nextUnit) {
      // Check if next unit exists in progress
      let nextUnitProgress = progress.units.find(u => u.unitId.toString() === nextUnit._id.toString());
      
      if (!nextUnitProgress) {
        // Add next unit to progress
        progress.units.push({
          unitId: nextUnit._id,
          status: 'in-progress',
          unlocked: true,
          unlockedAt: new Date(),
          videosWatched: [],
          quizAttempts: [],
          unitQuizCompleted: false,
          unitQuizPassed: false,
          allVideosWatched: false
        });
      } else {
        // Unlock existing unit
        nextUnitProgress.unlocked = true;
        nextUnitProgress.status = 'in-progress';
        nextUnitProgress.unlockedAt = new Date();
      }

      // Unlock only the first video in the next unit
      const nextUnitWithVideos = await Unit.findById(nextUnit._id).populate('videos');
      if (nextUnitWithVideos && nextUnitWithVideos.videos.length > 0) {
        // Sort videos by sequence and unlock only the first one
        const sortedVideos = nextUnitWithVideos.videos.sort((a, b) => (a.sequence || 0) - (b.sequence || 0));
        const firstVideoId = sortedVideos[0]._id;
        
        if (!progress.unlockedVideos.includes(firstVideoId)) {
          progress.unlockedVideos.push(firstVideoId);
          console.log('Unlocked first video of next unit:', firstVideoId);
        }
      }
    }
  } catch (err) {
    console.error('Error unlocking next unit:', err);
  }
}

// Get quiz results
exports.getQuizResults = async (req, res) => {
  try {
    const { attemptId } = req.params;
    const studentId = req.user._id;

    const attempt = await QuizAttempt.findById(attemptId)
      .populate('unit', 'title')
      .populate('course', 'title');

    if (!attempt) {
      return res.status(404).json({ message: 'Quiz attempt not found' });
    }

    if (attempt.student.toString() !== studentId.toString()) {
      return res.status(403).json({ message: 'Not your quiz attempt' });
    }

    // Return detailed results
    const results = {
      attemptId: attempt._id,
      unitTitle: attempt.unit.title,
      courseTitle: attempt.course.title,
      score: attempt.score,
      maxScore: attempt.maxScore,
      percentage: attempt.percentage,
      passed: attempt.passed,
      timeSpent: attempt.timeSpent,
      completedAt: attempt.completedAt,
      questions: attempt.questions.map((question, index) => {
        const answer = attempt.answers.find(a => a.questionId.toString() === question.questionId.toString());
        return {
          questionNumber: index + 1,
          questionText: question.questionText,
          options: question.options,
          correctOption: question.correctOption,
          selectedOption: answer ? answer.selectedOption : null,
          isCorrect: answer ? answer.isCorrect : false,
          points: question.points,
          earnedPoints: answer ? answer.points : 0
        };
      })
    };

    res.json(results);
  } catch (err) {
    console.error('Error getting quiz results:', err);
    res.status(500).json({ message: err.message });
  }
};

// Get quiz attempt details for student quiz page
exports.getQuizAttempt = async (req, res) => {
  try {
    const { attemptId } = req.params;
    const studentId = req.user._id;

    // Get quiz attempt
    const attempt = await QuizAttempt.findById(attemptId)
      .populate('unit', 'title')
      .populate('course', 'title');
    
    if (!attempt) {
      return res.status(404).json({ message: 'Quiz attempt not found' });
    }

    // Verify this attempt belongs to the current student
    if (attempt.student.toString() !== studentId.toString()) {
      return res.status(403).json({ message: 'Access denied' });
    }

    // If already completed, return error
    if (attempt.completedAt) {
      return res.status(400).json({ 
        message: 'Quiz already completed',
        completed: true,
        attempt: {
          score: attempt.score,
          maxScore: attempt.maxScore,
          percentage: attempt.percentage,
          passed: attempt.passed
        }
      });
    }

    // **NEW: Fetch quiz configuration**
    let timeLimit = 30; // default
    try {
      const student = await User.findById(studentId).select('assignedSections');
      
      // Find quiz configuration for any of the student's assigned sections
      if (student.assignedSections && student.assignedSections.length > 0) {
        const customConfig = await QuizConfiguration.findOne({
          course: attempt.course._id,
          section: { $in: student.assignedSections },
          unit: attempt.unit._id,
          isActive: true
        });
        
        if (customConfig) {
          timeLimit = customConfig.timeLimit;
        }
      }
    } catch (configError) {
      console.error('Error fetching quiz configuration:', configError);
    }

    // Return quiz data for student (without correct answers)
    const quizData = {
      attemptId: attempt._id,
      unitTitle: attempt.unit.title,
      courseTitle: attempt.course.title,
      timeLimit: timeLimit,
      questions: attempt.questions.map((q, index) => ({
        questionNumber: index + 1,
        questionId: q.questionId,
        questionText: q.questionText,
        options: q.options,
        points: q.points
      })),
      startedAt: attempt.startedAt
    };

    res.json(quizData);
  } catch (err) {
    console.error('Error getting quiz attempt:', err);
    res.status(500).json({ message: err.message });
  }
};
