const ContentArrangement = require('../models/ContentArrangement');
const Course = require('../models/Course');
const Unit = require('../models/Unit');
const Video = require('../models/Video');
const ReadingMaterial = require('../models/ReadingMaterial');
const User = require('../models/User');
const mongoose = require('mongoose');
const { logContentArrangement } = require('../utils/auditLogger');

// Get content arrangement for CC to manage or HOD to review
exports.getContentArrangement = async (req, res) => {
  try {
    const { courseId } = req.params;
    const userId = req.user._id;

    console.log('🔍 Getting content arrangement for course:', courseId, 'by user:', userId);

    // Verify user is CC for this course or HOD for the department
    const course = await Course.findById(courseId).populate('department');
    if (!course) {
      return res.status(404).json({ message: 'Course not found' });
    }

    const isCC = course.coordinators && course.coordinators.some(ccId => 
      ccId.toString() === userId.toString()
    );

    let isHOD = false;
    const userRoles = req.user.roles || [req.user.role]; // Support multi-role
    const hasHodRole = userRoles.includes('hod');
    const isAdmin = userRoles.includes('admin');
    
    if (hasHodRole) {
      // Check if user is HOD of the course's department using multiple methods
      const Department = require('../models/Department');
      
      // Method 1: Department.hod field references this user
      let departments = await Department.find({ hod: userId });
      
      // Method 2: If no departments found, check user's department/departments fields
      if (departments.length === 0) {
        const currentUser = await User.findById(userId).select('department departments roleAssignments');
        const userDeptIds = [];
        
        if (currentUser?.department) userDeptIds.push(currentUser.department);
        if (currentUser?.departments?.length > 0) userDeptIds.push(...currentUser.departments);
        
        // Method 3: Check roleAssignments for hod role
        if (currentUser?.roleAssignments?.length > 0) {
          const hodAssignments = currentUser.roleAssignments.filter(r => r.role === 'hod' && r.isActive);
          for (const assignment of hodAssignments) {
            if (assignment.departments?.length > 0) userDeptIds.push(...assignment.departments);
          }
        }
        
        if (userDeptIds.length > 0) {
          departments = await Department.find({ _id: { $in: userDeptIds } });
        }
      }
      
      isHOD = departments.some(dept => dept._id.toString() === course.department._id.toString());
      console.log('📋 HOD check result:', { hasHodRole, departmentsFound: departments.length, isHOD });
    }

    if (!isCC && !isHOD && !isAdmin) {
      console.log('🚫 Access denied for user:', userId, { isCC, isHOD, isAdmin, hasHodRole });
      return res.status(403).json({ message: 'Access denied. Only Course Coordinators, HODs, or Admins can view content arrangements' });
    }

    // Get the latest arrangement based on user role
    let arrangement;
    
    if (isHOD && !isCC) {
      // HOD should see submitted arrangements for review
      console.log('📋 HOD requesting arrangement, looking for submitted/approved/rejected');
      arrangement = await ContentArrangement.findOne({
        course: courseId,
        status: { $in: ['submitted', 'approved', 'rejected'] }
      }).sort({ version: -1 });
      console.log('📋 Found arrangement for HOD:', arrangement ? { id: arrangement._id, status: arrangement.status, itemsCount: arrangement.items?.length } : 'null');
      
      // If HOD found an arrangement, return it directly
      if (arrangement) {
        const units = await Unit.find({ course: courseId })
          .sort({ order: 1 })
          .select('title description order');

        const response = {
          arrangement: arrangement,
          units: units,
          canEdit: false // HOD cannot edit
        };

        console.log('📋 Returning content arrangement for HOD:', {
          version: arrangement.version,
          status: arrangement.status,
          itemsCount: arrangement.items?.length || 0,
          unitsCount: units.length
        });

        return res.json(response);
      } else {
        // No arrangement found for HOD
        return res.status(404).json({ message: 'No content arrangement found for this course' });
      }
    } else {
      // CC gets their own arrangement (or creates new one)
      arrangement = await ContentArrangement.findOne({
        course: courseId,
        coordinator: userId
      }).sort({ version: -1 });
    }

    if ((!arrangement || arrangement.status === 'approved') && !isHOD) {
      // For CCs: Create new arrangement ONLY if course has new content or needs relaunch
      const course = await Course.findById(courseId);
      
      // CC can only create new arrangements if:
      // 1. No arrangement exists at all, OR
      // 2. Course has new content added by admin, OR  
      // 3. Course is marked for relaunch
      const canCreateNewArrangement = !arrangement || 
                                      course.hasNewContent ||
                                      course.currentArrangementStatus === 'pending_relaunch';

      if (canCreateNewArrangement) {
        // Additional check: if there's an approved arrangement but no new content, don't allow new arrangement
        if (arrangement && arrangement.status === 'approved' && !course.hasNewContent && course.currentArrangementStatus !== 'pending_relaunch') {
          return res.status(403).json({ 
            message: 'Course arrangement is approved and locked. New content must be added before creating new arrangements.',
            arrangement: arrangement,
            units: [],
            canEdit: false,
            isLocked: true
          });
        }
        const units = await Unit.find({ course: courseId }).sort({ order: 1 });
        const items = [];

      for (const unit of units) {
        // Get ALL videos in this unit (including new ones)
        const videos = await Video.find({ unit: unit._id }).sort({ sequence: 1 });
        videos.forEach((video, index) => {
          items.push({
            type: 'video',
            contentId: video._id,
            title: video.title,
            unitId: unit._id,
            order: index + 1,
            originalUnitId: unit._id,
            originalOrder: index + 1
          });
        });

        // Get ALL documents in this unit (including new ones)
        const documents = await ReadingMaterial.find({ unit: unit._id }).sort({ order: 1 });
        documents.forEach((doc, index) => {
          items.push({
            type: 'document',
            contentId: doc._id,
            title: doc.title,
            unitId: unit._id,
            order: videos.length + index + 1,
            originalUnitId: unit._id,
            originalOrder: videos.length + index + 1
          });
        });
      }

      arrangement = new ContentArrangement({
        course: courseId,
        coordinator: userId,
        items: items,
        status: 'open',
        version: arrangement ? arrangement.version + 1 : 1
      });

      await arrangement.save();
      
      // Reset hasNewContent flag since CC is now arranging the new content
      await Course.findByIdAndUpdate(courseId, {
        hasNewContent: false,
        currentArrangementStatus: 'draft'
      });
      
      console.log('✅ Created new content arrangement version:', arrangement.version, 'with', items.length, 'items');
      }
    } else if (arrangement && arrangement.status === 'open' && !isHOD) {
      // ALWAYS check if there's new content that needs to be added to the existing open arrangement
      // This ensures CC always sees all content, even if hasNewContent flag was already reset
      console.log('🔄 Checking open arrangement for any missing content');
      
      // Get current content IDs in the arrangement
      const existingContentIds = new Set(
        arrangement.items.map(item => item.contentId.toString())
      );
      
      console.log('📋 Arrangement has', existingContentIds.size, 'existing items');
      
      // Find ALL content not in arrangement
      const units = await Unit.find({ course: courseId }).sort({ order: 1 });
      let hasNewItems = false;
      
      for (const unit of units) {
        // Check for new videos
        const videos = await Video.find({ unit: unit._id }).sort({ sequence: 1 });
        for (const video of videos) {
          if (!existingContentIds.has(video._id.toString())) {
            const unitItems = arrangement.items.filter(i => i.unitId.toString() === unit._id.toString());
            const maxOrder = unitItems.length > 0 
              ? Math.max(...unitItems.map(i => i.order)) 
              : 0;
            
            arrangement.items.push({
              type: 'video',
              contentId: video._id,
              title: video.title,
              unitId: unit._id,
              order: maxOrder + 1,
              originalUnitId: unit._id,
              originalOrder: maxOrder + 1
            });
            hasNewItems = true;
            console.log('➕ Added new video to arrangement:', video.title);
          }
        }
        
        // Check for new documents
        const documents = await ReadingMaterial.find({ unit: unit._id }).sort({ order: 1 });
        for (const doc of documents) {
          if (!existingContentIds.has(doc._id.toString())) {
            const unitItems = arrangement.items.filter(i => i.unitId.toString() === unit._id.toString());
            const maxOrder = unitItems.length > 0 
              ? Math.max(...unitItems.map(i => i.order)) 
              : 0;
            
            arrangement.items.push({
              type: 'document',
              contentId: doc._id,
              title: doc.title,
              unitId: unit._id,
              order: maxOrder + 1,
              originalUnitId: unit._id,
              originalOrder: maxOrder + 1
            });
            hasNewItems = true;
            console.log('➕ Added new document to arrangement:', doc.title);
          }
        }
      }
      
      if (hasNewItems) {
        await arrangement.save();
        console.log('✅ Updated arrangement with new content, now has', arrangement.items.length, 'items');
        
        // Reset hasNewContent flag since we've now synced
        await Course.findByIdAndUpdate(courseId, {
          hasNewContent: false
        });
      } else {
        console.log('✅ Arrangement already has all content');
      }
    }

    // Get course units with their current content
    const units = await Unit.find({ course: courseId })
      .sort({ order: 1 })
      .select('title description order');

    const response = {
      arrangement: arrangement,
      units: units,
      canEdit: arrangement.status === 'open'
    };

    console.log('📋 Returning content arrangement:', {
      version: arrangement.version,
      status: arrangement.status,
      itemsCount: arrangement.items.length,
      unitsCount: units.length
    });

    res.json(response);
  } catch (error) {
    console.error('Error getting content arrangement:', error);
    res.status(500).json({ message: 'Failed to get content arrangement', error: error.message });
  }
};

// Update content arrangement (CC rearranges content)
exports.updateContentArrangement = async (req, res) => {
  try {
    const { arrangementId } = req.params;
    const { items } = req.body;
    const userId = req.user._id;

    console.log('🔄 Updating content arrangement:', arrangementId);

    // Find the arrangement
    const arrangement = await ContentArrangement.findById(arrangementId);
    if (!arrangement) {
      return res.status(404).json({ message: 'Arrangement not found' });
    }

    // Verify user is the coordinator or admin
    const userRoles = req.user.roles || [req.user.role]; // Support multi-role
    const isAdmin = userRoles.includes('admin');
    
    if (arrangement.coordinator.toString() !== userId.toString() && !isAdmin) {
      return res.status(403).json({ message: 'Only the assigned coordinator can update this arrangement' });
    }

    // Verify arrangement is editable
    if (arrangement.status !== 'open') {
      return res.status(400).json({ 
        message: `Cannot edit arrangement with status: ${arrangement.status}` 
      });
    }

    // Validate items structure
    if (!Array.isArray(items)) {
      return res.status(400).json({ message: 'Items must be an array' });
    }

    // Update arrangement items
    arrangement.items = items.map(item => ({
      type: item.type,
      contentId: item.contentId,
      title: item.title,
      unitId: item.unitId,
      order: item.order,
      originalUnitId: item.originalUnitId,
      originalOrder: item.originalOrder
    }));

    arrangement.updatedAt = new Date();
    await arrangement.save();

    console.log('✅ Updated content arrangement with', items.length, 'items');
    res.json({ message: 'Arrangement updated successfully', arrangement });
  } catch (error) {
    console.error('Error updating content arrangement:', error);
    res.status(500).json({ message: 'Failed to update arrangement', error: error.message });
  }
};

// Submit arrangement for HOD approval
exports.submitArrangement = async (req, res) => {
  try {
    const { arrangementId } = req.params;
    const userId = req.user._id;

    console.log('📤 Submitting arrangement for approval:', arrangementId);

    const arrangement = await ContentArrangement.findById(arrangementId);
    if (!arrangement) {
      return res.status(404).json({ message: 'Arrangement not found' });
    }

    // Verify user is the coordinator or admin
    const userRoles = req.user.roles || [req.user.role]; // Support multi-role
    const isAdmin = userRoles.includes('admin');
    
    if (arrangement.coordinator.toString() !== userId.toString() && !isAdmin) {
      return res.status(403).json({ message: 'Only the assigned coordinator can submit this arrangement' });
    }

    // Verify arrangement is open
    if (arrangement.status !== 'open') {
      return res.status(400).json({ 
        message: `Cannot submit arrangement with status: ${arrangement.status}` 
      });
    }

    // Update status to submitted
    arrangement.status = 'submitted';
    arrangement.submittedAt = new Date();
    await arrangement.save();

    // Get course info for audit log
    const course = await Course.findById(arrangement.course).select('title');
    const coordinator = await User.findById(arrangement.coordinator).select('name');

    // Log to audit trail
    await logContentArrangement(req, {
      action: 'SUBMIT',
      arrangementId: arrangement._id,
      courseId: arrangement.course,
      courseTitle: course?.title || 'Unknown Course',
      arrangementVersion: arrangement.version,
      itemCount: arrangement.items?.length || 0,
      coordinatorId: arrangement.coordinator,
      coordinatorName: coordinator?.name || 'Unknown CC',
      success: true
    });

    console.log('✅ Arrangement submitted for approval');
    res.json({ message: 'Arrangement submitted for approval', arrangement });
  } catch (error) {
    console.error('Error submitting arrangement:', error);
    res.status(500).json({ message: 'Failed to submit arrangement', error: error.message });
  }
};

// Get approved arrangements for HOD launch
exports.getApprovedArrangements = async (req, res) => {
  try {
    const userId = req.user._id;
    console.log('📋 Getting approved arrangements for HOD:', userId);
    
    // Check if user has HOD role
    const userRoles = req.user.roles || [req.user.role];
    const hasHodRole = userRoles.includes('hod');
    const isAdmin = userRoles.includes('admin');
    
    if (!hasHodRole && !isAdmin) {
      return res.status(403).json({ message: 'Only HODs can view approved arrangements' });
    }

    // Get courses in HOD's departments
    const Department = require('../models/Department');
    const User = require('../models/User');
    let courseIds = [];
    
    if (hasHodRole) {
      // Get the current user with department info
      const currentUser = await User.findById(userId).select('department departments roleAssignments');
      
      // Method 1: Departments where hod field = userId
      let departments = await Department.find({ hod: userId });
      
      // Method 2 & 3: If no departments found via hod field, check user's assigned departments
      if (departments.length === 0 && currentUser) {
        const userDeptIds = [];
        if (currentUser.department) userDeptIds.push(currentUser.department);
        if (currentUser.departments && currentUser.departments.length > 0) {
          userDeptIds.push(...currentUser.departments);
        }
        
        // Method 3: Check roleAssignments for hod role
        if (currentUser.roleAssignments && currentUser.roleAssignments.length > 0) {
          const hodAssignments = currentUser.roleAssignments.filter(r => r.role === 'hod' && r.isActive);
          for (const assignment of hodAssignments) {
            if (assignment.departments && assignment.departments.length > 0) {
              userDeptIds.push(...assignment.departments);
            }
          }
        }
        
        if (userDeptIds.length > 0) {
          departments = await Department.find({ _id: { $in: userDeptIds } });
          console.log('📋 Found departments via user department fields:', departments.map(d => d.name));
        }
      }
      
      const departmentIds = departments.map(d => d._id);
      const courses = await Course.find({ department: { $in: departmentIds } });
      courseIds = courses.map(c => c._id);
    } else {
      // Admin can see all
      const allCourses = await Course.find({});
      courseIds = allCourses.map(c => c._id);
    }

    // Get approved arrangements for courses
    const approvedArrangements = await ContentArrangement.find({
      course: { $in: courseIds },
      status: 'approved'
    })
    .populate({
      path: 'course',
      select: 'title courseCode department isLaunched hasNewContent currentArrangementStatus activeArrangementVersion',
      populate: {
        path: 'department',
        select: 'name'
      }
    })
    .populate('coordinator', 'name email')
    .sort({ approvedAt: -1 });

    console.log('📋 All approved arrangements:', approvedArrangements.map(arr => ({
      course: arr.course?.title,
      version: arr.version,
      isLaunched: arr.course?.isLaunched,
      activeVersion: arr.course?.activeArrangementVersion
    })));

    // Filter for arrangements that need to be launched:
    // 1. Non-launched courses (first time launch)
    // 2. Launched courses where the approved arrangement version > active arrangement version (re-launch)
    const launchReadyArrangements = approvedArrangements.filter(arr => {
      if (!arr.course) return false;
      
      // First time launch - course not yet launched
      if (!arr.course.isLaunched) return true;
      
      // Re-launch - approved arrangement version is newer than active version
      if (arr.version > (arr.course.activeArrangementVersion || 0)) return true;
      
      return false;
    });

    console.log(`✅ Found ${launchReadyArrangements.length} approved arrangements ready for launch`);

    res.json({
      arrangements: launchReadyArrangements,
      message: 'Approved arrangements retrieved successfully'
    });
  } catch (error) {
    console.error('Error getting approved arrangements:', error);
    res.status(500).json({ message: 'Failed to get approved arrangements', error: error.message });
  }
};

exports.getPendingArrangements = async (req, res) => {
  try {
    const userId = req.user._id;

    console.log('📋 Getting pending arrangements for HOD:', userId);

    // Find departments where user is HOD - check multiple ways:
    // 1. Department.hod field references this user
    // 2. User has this department in their department/departments fields
    // 3. User's roleAssignments with hod role
    const Department = require('../models/Department');
    const User = require('../models/User');
    
    // Get the current user with department info
    const currentUser = await User.findById(userId).select('department departments roleAssignments');
    
    console.log('📋 HOD user info:', {
      department: currentUser?.department,
      departments: currentUser?.departments,
      roleAssignments: currentUser?.roleAssignments?.filter(r => r.role === 'hod')
    });
    
    // Method 1: Departments where hod field = userId
    let departments = await Department.find({ hod: userId });
    console.log('📋 Method 1 - Departments with hod field:', departments.length);
    
    // Method 2: If no departments found via hod field, check user's assigned departments
    if (departments.length === 0 && currentUser) {
      const userDeptIds = [];
      if (currentUser.department) userDeptIds.push(currentUser.department);
      if (currentUser.departments && currentUser.departments.length > 0) {
        userDeptIds.push(...currentUser.departments);
      }
      
      // Method 3: Check roleAssignments for hod role
      if (currentUser.roleAssignments && currentUser.roleAssignments.length > 0) {
        const hodAssignments = currentUser.roleAssignments.filter(r => r.role === 'hod' && r.isActive);
        for (const assignment of hodAssignments) {
          if (assignment.departments && assignment.departments.length > 0) {
            userDeptIds.push(...assignment.departments);
          }
        }
      }
      
      if (userDeptIds.length > 0) {
        departments = await Department.find({ _id: { $in: userDeptIds } });
        console.log('📋 Method 2/3 - Found departments via user fields:', departments.map(d => d.name));
      }
    }
    
    console.log('📋 HOD manages', departments.length, 'departments:', departments.map(d => ({ id: d._id, name: d.name })));

    // Find courses that belong to these departments
    const courses = await Course.find({
      department: { $in: departments.map(d => d._id) }
    }).populate('department');

    console.log('📋 Found', courses.length, 'courses in HOD departments:', courses.map(c => ({ id: c._id, title: c.title, dept: c.department?.name })));

    const courseIds = courses.map(c => c._id);

    // Get ALL submitted arrangements first for debugging
    const allSubmittedArrangements = await ContentArrangement.find({
      status: 'submitted'
    }).populate('course', 'title courseCode');

    console.log('📋 Total submitted arrangements in system:', allSubmittedArrangements.length);
    allSubmittedArrangements.forEach(arr => {
      console.log(`   - Course: ${arr.course?.title} (${arr.course?._id}) | Status: ${arr.status}`);
    });

    // Get pending arrangements for these courses
    const arrangements = await ContentArrangement.find({
      course: { $in: courseIds },
      status: 'submitted'
    })
    .populate('course', 'title courseCode')
    .populate('coordinator', 'name email')
    .sort({ submittedAt: 1 });

    console.log('📋 Found', arrangements.length, 'pending arrangements for this HOD');

    res.json({
      courses: courses.map(c => ({
        _id: c._id,
        title: c.title,
        courseCode: c.courseCode
      })),
      arrangements: arrangements
    });
  } catch (error) {
    console.error('Error getting pending arrangements:', error);
    res.status(500).json({ message: 'Failed to get pending arrangements', error: error.message });
  }
};

// Approve or reject arrangement (HOD action)
exports.reviewArrangement = async (req, res) => {
  try {
    const { arrangementId } = req.params;
    const { action, reason } = req.body; // action: 'approve' or 'reject'
    const userId = req.user._id;

    console.log('👨‍💼 HOD reviewing arrangement:', arrangementId, 'action:', action);

    const arrangement = await ContentArrangement.findById(arrangementId)
      .populate('course', 'title courseCode department hod');

    if (!arrangement) {
      return res.status(404).json({ message: 'Arrangement not found' });
    }

    // Populate course and department information
    const course = await arrangement.course.populate('department');
    
    // Verify user has HOD role or is admin using multiple methods
    const userRoles = req.user.roles || [req.user.role]; // Support both new and legacy format
    const hasHodRole = userRoles.includes('hod');
    const isAdmin = userRoles.includes('admin');
    
    // Check if user is HOD of the department using multiple methods
    let isHodOfDepartment = course.department.hod && course.department.hod.toString() === userId.toString();
    
    if (!isHodOfDepartment && hasHodRole) {
      // Method 2 & 3: Check user's department fields
      const currentUser = await User.findById(userId).select('department departments roleAssignments');
      const userDeptIds = [];
      
      if (currentUser?.department) userDeptIds.push(currentUser.department.toString());
      if (currentUser?.departments?.length > 0) {
        userDeptIds.push(...currentUser.departments.map(d => d.toString()));
      }
      
      if (currentUser?.roleAssignments?.length > 0) {
        const hodAssignments = currentUser.roleAssignments.filter(r => r.role === 'hod' && r.isActive);
        for (const assignment of hodAssignments) {
          if (assignment.departments?.length > 0) {
            userDeptIds.push(...assignment.departments.map(d => d.toString()));
          }
        }
      }
      
      isHodOfDepartment = userDeptIds.includes(course.department._id.toString());
    }
    
    if (!hasHodRole && !isAdmin && !isHodOfDepartment) {
      return res.status(403).json({ message: 'Only HOD can approve/reject arrangements' });
    }

    // Verify arrangement is submitted
    if (arrangement.status !== 'submitted') {
      return res.status(400).json({ 
        message: `Cannot review arrangement with status: ${arrangement.status}` 
      });
    }

    if (action === 'approve') {
      // Apply the arrangement to actual content
      await applyArrangementToContent(arrangement);
      
      arrangement.status = 'approved';
      arrangement.approvedAt = new Date();
      arrangement.approvedBy = userId;
      
      // Update course status
      await Course.findByIdAndUpdate(arrangement.course, {
        currentArrangementStatus: 'approved'
      });
      
      // Get coordinator info for audit
      const coordinator = await User.findById(arrangement.coordinator).select('name');
      
      // Log to audit trail
      await logContentArrangement(req, {
        action: 'APPROVE',
        arrangementId: arrangement._id,
        courseId: arrangement.course._id,
        courseTitle: course.title,
        arrangementVersion: arrangement.version,
        itemCount: arrangement.items?.length || 0,
        coordinatorId: arrangement.coordinator,
        coordinatorName: coordinator?.name,
        success: true
      });
      
      console.log('✅ Arrangement approved and applied');
    } else if (action === 'reject') {
      arrangement.status = 'rejected';
      arrangement.rejectedAt = new Date();
      arrangement.rejectedBy = userId;
      arrangement.rejectionReason = reason;
      
      // Update course status to rejected - CC needs to resubmit
      await Course.findByIdAndUpdate(arrangement.course, {
        currentArrangementStatus: 'rejected'
      });
      
      // Get coordinator info for audit
      const coordinator = await User.findById(arrangement.coordinator).select('name');
      
      // Log to audit trail
      await logContentArrangement(req, {
        action: 'REJECT',
        arrangementId: arrangement._id,
        courseId: arrangement.course._id,
        courseTitle: course.title,
        arrangementVersion: arrangement.version,
        itemCount: arrangement.items?.length || 0,
        coordinatorId: arrangement.coordinator,
        coordinatorName: coordinator?.name,
        reason: reason,
        success: true
      });
      
      console.log('❌ Arrangement rejected');
    } else {
      return res.status(400).json({ message: 'Invalid action. Use "approve" or "reject"' });
    }

    await arrangement.save();

    res.json({ 
      message: `Arrangement ${action}d successfully`, 
      arrangement 
    });
  } catch (error) {
    console.error('Error reviewing arrangement:', error);
    res.status(500).json({ message: 'Failed to review arrangement', error: error.message });
  }
};

// Apply approved arrangement to actual content
async function applyArrangementToContent(arrangement) {
  try {
    console.log('🔄 Applying arrangement to actual content...');

    // Group items by unit
    const unitGroups = {};
    arrangement.items.forEach(item => {
      if (!unitGroups[item.unitId]) {
        unitGroups[item.unitId] = [];
      }
      unitGroups[item.unitId].push(item);
    });

    // Apply changes to each unit
    for (const [unitId, items] of Object.entries(unitGroups)) {
      // Sort items by their new order
      items.sort((a, b) => a.order - b.order);

      const videos = items.filter(item => item.type === 'video');
      const documents = items.filter(item => item.type === 'document');

      // Update unit's content arrays
      await Unit.findByIdAndUpdate(unitId, {
        videos: videos.map(v => v.contentId),
        readingMaterials: documents.map(d => d.contentId)
      });

      // Update individual content items with new unit and sequence
      for (let i = 0; i < videos.length; i++) {
        await Video.findByIdAndUpdate(videos[i].contentId, {
          unit: unitId,
          sequence: i + 1
        });
      }

      for (let i = 0; i < documents.length; i++) {
        await ReadingMaterial.findByIdAndUpdate(documents[i].contentId, {
          unit: unitId,
          order: i + 1
        });
      }
      
      // Update video durations after sequence changes
      console.log('🔄 Updating video durations after sequence changes...');
      const bunnyStreamService = require('../services/bunnyStreamService');
      
      for (const video of videos) {
        try {
          const videoDoc = await Video.findById(video.contentId);
          if (videoDoc && videoDoc.bunnyVideoId && (!videoDoc.duration || videoDoc.duration === 0)) {
            console.log(`📺 Checking duration for video: ${videoDoc.title} (ID: ${videoDoc._id})`);
            
            try {
              const videoDetails = await bunnyStreamService.getVideoDetails(videoDoc.bunnyVideoId);
              if (videoDetails && videoDetails.length > 0) {
                await Video.findByIdAndUpdate(videoDoc._id, {
                  duration: Math.round(videoDetails.length)
                });
                console.log(`✅ Updated duration for ${videoDoc.title}: ${Math.round(videoDetails.length)} seconds`);
              }
            } catch (durationError) {
              console.error(`⚠️ Failed to update duration for video ${videoDoc._id}:`, durationError.message);
            }
          }
        } catch (error) {
          console.error(`❌ Error processing video ${video.contentId}:`, error.message);
        }
      }
    }

    console.log('✅ Successfully applied arrangement to content');
  } catch (error) {
    console.error('❌ Error applying arrangement to content:', error);
    throw error;
  }
}

// Get arrangement history for a course
exports.getArrangementHistory = async (req, res) => {
  try {
    const { courseId } = req.params;

    console.log('📚 Getting arrangement history for course:', courseId);

    const arrangements = await ContentArrangement.find({ course: courseId })
      .populate('coordinator', 'name email')
      .populate('approvedBy', 'name email')
      .populate('rejectedBy', 'name email')
      .sort({ version: -1 });

    res.json(arrangements);
  } catch (error) {
    console.error('Error getting arrangement history:', error);
    res.status(500).json({ message: 'Failed to get arrangement history', error: error.message });
  }
};

// Launch course for students
exports.launchCourse = async (req, res) => {
  try {
    const { courseId } = req.params;
    const userId = req.user._id;

    console.log('🚀 Launching course:', courseId, 'by user:', userId);

    // Check if user is HOD for this course's department
    const course = await Course.findById(courseId).populate('department');
    if (!course) {
      return res.status(404).json({ message: 'Course not found' });
    }

    // Check if user is HOD using multiple methods (same as getContentArrangement)
    const Department = require('../models/Department');
    let departments = await Department.find({ hod: userId });
    
    // Method 2 & 3: If no departments found, check user's department/departments fields
    if (departments.length === 0) {
      const currentUser = await User.findById(userId).select('department departments roleAssignments');
      const userDeptIds = [];
      
      if (currentUser?.department) userDeptIds.push(currentUser.department);
      if (currentUser?.departments?.length > 0) userDeptIds.push(...currentUser.departments);
      
      // Method 3: Check roleAssignments for hod role
      if (currentUser?.roleAssignments?.length > 0) {
        const hodAssignments = currentUser.roleAssignments.filter(r => r.role === 'hod' && r.isActive);
        for (const assignment of hodAssignments) {
          if (assignment.departments?.length > 0) userDeptIds.push(...assignment.departments);
        }
      }
      
      if (userDeptIds.length > 0) {
        departments = await Department.find({ _id: { $in: userDeptIds } });
      }
    }
    
    const isHOD = departments.some(dept => dept._id.toString() === course.department._id.toString());
    console.log('📋 Launch HOD check:', { departmentsFound: departments.length, isHOD });
    
    // Support multi-role users
    const userRoles = req.user.roles || [req.user.role];
    const isAdmin = userRoles.includes('admin');

    if (!isHOD && !isAdmin) {
      console.log('🚫 Launch access denied:', { isHOD, isAdmin });
      return res.status(403).json({ message: 'Only HODs can launch courses' });
    }

    // Check if there's an approved arrangement
    const approvedArrangement = await ContentArrangement.findOne({
      course: courseId,
      status: 'approved'
    }).sort({ version: -1 });

    if (!approvedArrangement) {
      return res.status(400).json({ message: 'Course must have an approved content arrangement before launch' });
    }

    // Update launch history and activate new arrangement for students
    const launchData = {
      isLaunched: true,
      launchedAt: new Date(),
      launchedBy: userId,
      currentArrangementStatus: 'approved',
      activeArrangementVersion: approvedArrangement.version,
      hasNewContent: false, // Reset after launch
      $push: {
        launchHistory: {
          version: approvedArrangement.version,
          launchedAt: new Date(),
          launchedBy: userId,
          arrangementId: approvedArrangement._id
        }
      }
    };

    await Course.findByIdAndUpdate(courseId, launchData);

    // Approve all pending videos and documents in this course
    // Get all content IDs from the approved arrangement
    const videoIds = approvedArrangement.items
      .filter(item => item.type === 'video')
      .map(item => item.contentId);
    
    const documentIds = approvedArrangement.items
      .filter(item => item.type === 'document')
      .map(item => item.contentId);

    // Update all videos to approved
    if (videoIds.length > 0) {
      const videoUpdateResult = await Video.updateMany(
        { _id: { $in: videoIds } },
        { 
          isApproved: true, 
          approvalStatus: 'approved',
          approvedAt: new Date(),
          approvedBy: userId
        }
      );
      console.log(`✅ Approved ${videoUpdateResult.modifiedCount} videos`);
    }

    // Update all documents to approved
    if (documentIds.length > 0) {
      const docUpdateResult = await ReadingMaterial.updateMany(
        { _id: { $in: documentIds } },
        { 
          isApproved: true, 
          approvalStatus: 'approved',
          approvedAt: new Date(),
          approvedBy: userId
        }
      );
      console.log(`✅ Approved ${docUpdateResult.modifiedCount} documents`);
    }

    // Migrate student progress to new arrangement version (preserve existing progress)
    await migrateStudentProgressToNewVersion(courseId, approvedArrangement.version);

    // Get coordinator info for audit
    const coordinator = await User.findById(approvedArrangement.coordinator).select('name');

    // Log to audit trail
    await logContentArrangement(req, {
      action: 'LAUNCH',
      arrangementId: approvedArrangement._id,
      courseId: courseId,
      courseTitle: course.title,
      arrangementVersion: approvedArrangement.version,
      itemCount: approvedArrangement.items?.length || 0,
      coordinatorId: approvedArrangement.coordinator,
      coordinatorName: coordinator?.name,
      success: true
    });

    console.log('✅ Course launched successfully with arrangement version:', approvedArrangement.version);

    res.json({ 
      message: 'Course launched successfully',
      course: course.title,
      arrangementVersion: approvedArrangement.version,
      launchedAt: new Date()
    });
  } catch (error) {
    console.error('Error launching course:', error);
    res.status(500).json({ message: 'Failed to launch course', error: error.message });
  }
};

// Mark course as having new content (triggers re-arrangement workflow)
exports.markCourseContentUpdated = async (req, res) => {
  try {
    const { courseId } = req.params;
    const { unitId } = req.body; // Unit that had new content added
    
    console.log('📝 Marking course as having new content:', courseId, 'Unit:', unitId);

    // Import content integrity service
    const ContentIntegrityService = require('../services/contentIntegrityService');
    
    // Invalidate student progress for the affected unit
    let impactAnalysis = { studentsAffected: 0 };
    if (unitId) {
      impactAnalysis = await ContentIntegrityService.invalidateProgressForNewContent(courseId, unitId);
      console.log('📊 Content update impact:', impactAnalysis);
    }

    await Course.findByIdAndUpdate(courseId, {
      hasNewContent: true,
      lastContentUpdate: new Date(),
      currentArrangementStatus: 'pending_relaunch'
    });

    res.json({ 
      message: 'Course marked as having new content. Student progress updated.', 
      impact: impactAnalysis
    });
  } catch (error) {
    console.error('Error marking course content updated:', error);
    res.status(500).json({ message: 'Failed to mark content updated', error: error.message });
  }
};

// Migrate student progress to new arrangement version
async function migrateStudentProgressToNewVersion(courseId, newVersion) {
  try {
    console.log('🔄 Migrating student progress to arrangement version:', newVersion);
    
    const StudentProgress = require('../models/StudentProgress');
    
    // Update all student progress records for this course to track new version
    await StudentProgress.updateMany(
      { course: courseId },
      { 
        $set: { 
          arrangementVersion: newVersion,
          lastUpdated: new Date()
        }
      }
    );

    console.log('✅ Student progress migrated successfully');
  } catch (error) {
    console.error('Error migrating student progress:', error);
    throw error;
  }
}

// Functions are already exported using exports.functionName above
// No need for module.exports when using exports.functionName