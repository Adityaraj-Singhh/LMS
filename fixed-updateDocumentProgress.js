exports.updateDocumentProgress = async (req, res) => {
  try {
    const { documentId } = req.params;
    const studentId = req.user.id;
    const { isRead, readAt, readingTime } = req.body;

    console.log(`📖 Updating document progress for document ${documentId}, student ${studentId}`);

    // First, find the reading material to get its unit and course
    const readingMaterial = await ReadingMaterial.findById(documentId).populate('unit');
    if (!readingMaterial) {
      return res.status(404).json({ message: 'Document not found' });
    }

    const courseId = readingMaterial.unit.course;

    // Find or create progress record for this document
    let progress = await StudentProgress.findOne({
      student: studentId,
      contentId: documentId,
      contentType: 'document'
    });

    if (!progress) {
      progress = new StudentProgress({
        student: studentId,
        course: courseId, // Add the required course field
        contentId: documentId,
        contentType: 'document',
        isCompleted: false,
        progress: 0
      });
    }

    // Update progress fields
    if (isRead !== undefined) {
      progress.isCompleted = isRead;
      progress.progress = isRead ? 100 : progress.progress;
    }

    if (readAt) {
      progress.completedAt = new Date(readAt);
    }

    if (readingTime) {
      progress.timeSpent = (progress.timeSpent || 0) + readingTime;
    }

    progress.lastAccessed = new Date();

    await progress.save();

    console.log(`✅ Document progress updated successfully for document ${documentId}`);
    
    res.json({
      message: 'Document progress updated successfully',
      progress: {
        isRead: progress.isCompleted,
        progress: progress.progress,
        timeSpent: progress.timeSpent,
        lastAccessed: progress.lastAccessed,
        completedAt: progress.completedAt
      }
    });
  } catch (error) {
    console.error('Error updating document progress:', error);
    res.status(500).json({ message: error.message });
  }
};