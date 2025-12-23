#!/bin/bash

# Backup the current file
cp /home/ubuntu/lms-bunny/backend/controllers/adminController.js /home/ubuntu/lms-bunny/backend/controllers/adminController.js.backup

# Update the adminController.js to use Bunny Storage for documents
cd /home/ubuntu/lms-bunny/backend/controllers

# Remove the contentUrl line that's no longer needed
sed -i '/^    let contentUrl = req.file.location;$/d' adminController.js

# Update the document upload section to include Bunny Storage
# Find the line "} else {" after video handling and replace the next few lines

cat > /tmp/admin-document-upload-fix.txt << 'EOFIX'
    } else {
      // Handle as document upload
      const ReadingMaterial = require('../models/ReadingMaterial');
      const bunnyStorageService = require('../services/bunnyStorageService');
      
      console.log('📄 Admin Document Upload - Using Bunny Storage');
      console.log('  File:', req.file.originalname);
      console.log('  Size:', req.file.size, 'bytes');
      console.log('  Buffer available:', !!req.file.buffer);
      
      // Upload document to Bunny Storage
      let uploadResult;
      try {
        uploadResult = await bunnyStorageService.uploadDocument(
          req.file.buffer,
          req.file.originalname,
          'reading-materials'
        );
        console.log('✅ Document uploaded to Bunny Storage:', uploadResult.cdnUrl);
      } catch (bunnyError) {
        console.error('❌ Failed to upload document to Bunny Storage:', bunnyError);
        return res.status(500).json({ 
          message: 'Failed to upload document to storage',
          error: bunnyError.message 
        });
      }
      
      // Determine content type based on file extension
      let contentType = 'pdf';
      if (ext === '.pdf') contentType = 'pdf';
      else if (['.doc', '.docx'].includes(ext)) contentType = 'doc';
      else if (['.ppt', '.pptx'].includes(ext)) contentType = 'ppt';
      else if (['.xls', '.xlsx'].includes(ext)) contentType = 'excel';
      else if (ext === '.txt') contentType = 'txt';
      else if (['.txt', '.rtf', '.odt'].includes(ext)) contentType = 'text';
      else if (['.ppt', '.pptx'].includes(ext)) contentType = 'document';
      
      // Create reading material document with approval status based on course launch state
      const materialData = {
        title,
        description,
        unit: unitId,
        course: courseId,
        contentType: contentType,
        content: req.file.originalname, // Store original filename as content identifier
        fileUrl: uploadResult.cdnUrl, // Use Bunny Storage CDN URL
EOFIX

# Update fileUrl line from contentUrl to uploadResult.cdnUrl
sed -i 's/fileUrl: contentUrl,/fileUrl: uploadResult.cdnUrl, \/\/ Use Bunny Storage CDN URL/' adminController.js

echo "✅ Admin controller updated for Bunny Storage document uploads"
