const ReadingMaterial = require('../models/ReadingMaterial');
const Unit = require('../models/Unit');
const Course = require('../models/Course');
const StudentProgress = require('../models/StudentProgress');
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const bunnyStorageService = require('../services/bunnyStorageService');

// Create a new reading material
exports.createReadingMaterial = async (req, res) => {
  try {
    const { title, description, unitId, courseId, contentType, content, order } = req.body;
    let fileUrl = null;

    // Validate course and unit
    const course = await Course.findById(courseId);
    if (!course) {
      return res.status(404).json({ message: 'Course not found' });
    }

    const unit = await Unit.findById(unitId);
    if (!unit) {
      return res.status(404).json({ message: 'Unit not found' });
    }

    // Handle file upload for documents (PDF, DOC, DOCX, PPT, PPTX, XLS, XLSX)
    const documentTypes = ['pdf', 'doc', 'docx', 'ppt', 'pptx', 'xls', 'xlsx', 'document'];
    if (documentTypes.includes(contentType) && req.file) {
      try {
        // Upload to Bunny Storage
        const uploadResult = await bunnyStorageService.uploadDocument(
          req.file.buffer,
          req.file.originalname,
          'reading-materials'
        );
        
        // Set fileUrl to Bunny CDN URL
        fileUrl = uploadResult.cdnUrl;
        console.log(`✅ Reading material uploaded to Bunny CDN: ${fileUrl}`);
        
      } catch (error) {
        console.error('❌ Failed to upload to Bunny Storage:', error);
        return res.status(500).json({ 
          message: 'Failed to upload document to storage',
          error: error.message 
        });
      }
    }

    // Create reading material
    const readingMaterial = await ReadingMaterial.create({
      title,
      description,
      unit: unitId,
      course: courseId,
      contentType,
      content,
      fileUrl,
      order: order || 0,
      createdBy: req.user._id
    });

    // Add reading material to unit
    await Unit.findByIdAndUpdate(unitId, {
      $push: { readingMaterials: readingMaterial._id }
    });

    // Trigger content integrity validation if this is for a launched course
    try {
      const course = await Course.findById(courseId);
      if (course && course.isLaunched) {
        console.log('🔒 New reading material added to launched course, triggering content validation');
        
        // Import and trigger content integrity service
        const ContentIntegrityService = require('../services/contentIntegrityService');
        const impactAnalysis = await ContentIntegrityService.invalidateProgressForNewContent(courseId, unitId);
        
        console.log('📊 Reading material upload impact on student progress:', impactAnalysis);
        
        // Mark course as having new content
        await Course.findByIdAndUpdate(courseId, {
          hasNewContent: true,
          lastContentUpdate: new Date(),
          currentArrangementStatus: 'pending_relaunch'
        });
      }
    } catch (validationError) {
      console.error('Error triggering content validation:', validationError);
      // Continue with upload success but log the validation error
    }

    res.status(201).json(readingMaterial);
  } catch (err) {
    console.error('Error creating reading material:', err);
    res.status(500).json({ message: err.message });
  }
};

// Get reading material by ID
exports.getReadingMaterial = async (req, res) => {
  try {
    const { materialId } = req.params;

    const material = await ReadingMaterial.findById(materialId);
    if (!material) {
      return res.status(404).json({ message: 'Reading material not found' });
    }

    res.json(material);
  } catch (err) {
    console.error('Error getting reading material:', err);
    res.status(500).json({ message: err.message });
  }
};

// Update reading material
exports.updateReadingMaterial = async (req, res) => {
  try {
    const { materialId } = req.params;
    const { title, description, contentType, content, order } = req.body;
    let fileUrl = undefined;

    // Handle file upload for documents (PDF, DOC, DOCX, PPT, PPTX, XLS, XLSX)
    const documentTypes = ['pdf', 'doc', 'docx', 'ppt', 'pptx', 'xls', 'xlsx', 'document'];
    if (documentTypes.includes(contentType) && req.file) {
      try {
        // Delete old file from Bunny Storage if it exists
        const oldMaterial = await ReadingMaterial.findById(materialId);
        if (oldMaterial && oldMaterial.fileUrl) {
          // Check if it's a Bunny CDN URL
          if (oldMaterial.fileUrl.includes('b-cdn.net')) {
            await bunnyStorageService.deleteDocument(oldMaterial.fileUrl);
          } else {
            // Old local file - delete from disk
            const oldFilePath = path.join(__dirname, '..', oldMaterial.fileUrl.replace(/^\//, ''));
            if (fs.existsSync(oldFilePath)) {
              fs.unlinkSync(oldFilePath);
            }
          }
        }
        
        // Upload new file to Bunny Storage
        const uploadResult = await bunnyStorageService.uploadDocument(
          req.file.buffer,
          req.file.originalname,
          'reading-materials'
        );
        
        // Set fileUrl to Bunny CDN URL
        fileUrl = uploadResult.cdnUrl;
        console.log(`✅ Reading material updated on Bunny CDN: ${fileUrl}`);
        
      } catch (error) {
        console.error('❌ Failed to upload to Bunny Storage:', error);
        return res.status(500).json({ 
          message: 'Failed to upload document to storage',
          error: error.message 
        });
      }
    }

    // Update fields
    const updateData = {
      title,
      description,
      contentType,
      content,
      order,
      updatedAt: Date.now()
    };
    
    // Only update fileUrl if a new file was uploaded
    if (fileUrl) {
      updateData.fileUrl = fileUrl;
    }

    const material = await ReadingMaterial.findByIdAndUpdate(
      materialId,
      { $set: updateData },
      { new: true }
    );

    if (!material) {
      return res.status(404).json({ message: 'Reading material not found' });
    }

    res.json(material);
  } catch (err) {
    console.error('Error updating reading material:', err);
    res.status(500).json({ message: err.message });
  }
};

// Delete reading material
exports.deleteReadingMaterial = async (req, res) => {
  try {
    const { materialId } = req.params;

    const material = await ReadingMaterial.findById(materialId);
    if (!material) {
      return res.status(404).json({ message: 'Reading material not found' });
    }

    // Remove from unit
    await Unit.findByIdAndUpdate(material.unit, {
      $pull: { readingMaterials: materialId }
    });

    // Delete file if exists
    if (material.fileUrl) {
      const filePath = path.join(__dirname, '..', material.fileUrl.replace(/^\//, ''));
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }

    // Delete material
    await ReadingMaterial.findByIdAndDelete(materialId);

    res.json({ message: 'Reading material deleted successfully' });
  } catch (err) {
    console.error('Error deleting reading material:', err);
    res.status(500).json({ message: err.message });
  }
};

// Mark reading material as completed
exports.markAsCompleted = async (req, res) => {
  try {
    const { materialId } = req.params;
    const studentId = req.user._id;

    // Find material
    const material = await ReadingMaterial.findById(materialId);
    if (!material) {
      return res.status(404).json({ message: 'Reading material not found' });
    }

    // Find student progress
    let progress = await StudentProgress.findOne({
      student: studentId,
      course: material.course
    });

    if (!progress) {
      return res.status(404).json({ message: 'Student progress not found' });
    }

    // Check if already completed
    if (progress.completedReadingMaterials.includes(materialId)) {
      return res.status(200).json({ message: 'Reading material already marked as completed' });
    }

    // Mark as completed
    progress = await StudentProgress.findOneAndUpdate(
      {
        student: studentId,
        course: material.course
      },
      {
        $addToSet: { completedReadingMaterials: materialId },
        $push: {
          'units.$[unit].readingMaterialsCompleted': {
            materialId: materialId,
            completed: true,
            completedAt: new Date()
          }
        },
        $set: { lastActivity: new Date() }
      },
      { 
        new: true,
        arrayFilters: [{ 'unit.unitId': material.unit }]
      }
    );

    res.json({ message: 'Reading material marked as completed', progress });
  } catch (err) {
    console.error('Error marking reading material as completed:', err);
    res.status(500).json({ message: err.message });
  }
};

// Get all reading materials for a unit
exports.getUnitReadingMaterials = async (req, res) => {
  try {
    const { unitId } = req.params;

    const materials = await ReadingMaterial.find({ unit: unitId })
      .sort('order')
      .select('title description contentType content fileUrl order createdAt');

    res.json(materials);
  } catch (err) {
    console.error('Error getting unit reading materials:', err);
    res.status(500).json({ message: err.message });
  }
};

// Get student's reading material status
exports.getStudentReadingMaterialStatus = async (req, res) => {
  try {
    const { courseId } = req.params;
    const studentId = req.user._id;

    // Find student progress
    const progress = await StudentProgress.findOne({
      student: studentId,
      course: courseId
    });

    if (!progress) {
      return res.status(404).json({ message: 'Student progress not found' });
    }

    // Get completed reading materials
    const completedIds = progress.completedReadingMaterials.map(id => id.toString());

    // Get all reading materials for the course
    const materials = await ReadingMaterial.find({ course: courseId })
      .select('title description contentType unit order');

    // Add completion status
    const materialsWithStatus = materials.map(material => ({
      ...material.toObject(),
      completed: completedIds.includes(material._id.toString())
    }));

    res.json(materialsWithStatus);
  } catch (err) {
    console.error('Error getting student reading material status:', err);
    res.status(500).json({ message: err.message });
  }
};
