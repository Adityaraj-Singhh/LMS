const express = require('express');
const router = express.Router();
const pdf2pic = require('pdf2pic');
const sharp = require('sharp');
const fs = require('fs').promises;
const path = require('path');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const ReadingMaterial = require('../models/ReadingMaterial');
const Unit = require('../models/Unit');
const Course = require('../models/Course');

// Enhanced middleware to verify user authentication
const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      return res.status(401).json({ message: 'Access token required' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Get full user information from database
    const user = await User.findById(decoded.id).select('-password');
    if (!user) {
      return res.status(403).json({ message: 'User not found' });
    }

    req.user = {
      id: user._id,
      name: user.name,
      email: user.email,
      registrationNumber: user.registrationNumber || user.studentId,
      role: user.role,
      section: user.section,
      department: user.department
    };
    
    next();
  } catch (err) {
    console.error('Authentication error:', err);
    return res.status(403).json({ message: 'Invalid token' });
  }
};

// Enhanced document access verification with proper enrollment checking
const verifyDocumentAccess = async (req, res, next) => {
  try {
    const { materialId } = req.params;
    const userId = req.user.id;
    
    console.log(`🔐 Verifying document access for material: ${materialId}, user: ${userId}`);
    
    // Find the reading material
    const material = await ReadingMaterial.findById(materialId)
      .populate({
        path: 'unit',
        populate: {
          path: 'course',
          model: 'Course'
        }
      });

    if (!material) {
      console.log(`❌ Reading material not found: ${materialId}`);
      return res.status(404).json({ message: 'Document not found' });
    }

    // Check if user is enrolled in the course
    const course = material.unit.course;
    const isEnrolled = course.students.some(studentId => 
      studentId.toString() === userId.toString()
    );

    if (!isEnrolled && req.user.role !== 'teacher' && req.user.role !== 'admin') {
      console.log(`❌ User not enrolled in course: ${course.title}`);
      return res.status(403).json({ message: 'Access denied - not enrolled in this course' });
    }

    // Log access attempt for audit
    console.log(`✅ Document access granted: ${material.title} to user: ${req.user.name}`);
    
    req.material = material;
    next();
  } catch (error) {
    console.error('Document access verification failed:', error);
    res.status(500).json({ message: 'Access verification failed' });
  }
};

// Enhanced watermark application with better visibility and security
const applyWatermark = async (imageBuffer, userInfo) => {
  try {
    const timestamp = new Date().toLocaleString();
    
    // Get image dimensions
    const image = sharp(imageBuffer);
    const metadata = await image.metadata();
    const { width, height } = metadata;
    
    // Create multiple watermark layers for better security
    const watermarks = [];
    
    // Main watermark (center, large)
    const mainWatermark = Buffer.from(`
      <svg width="${width}" height="${height}">
        <defs>
          <pattern id="mainWatermark" patternUnits="userSpaceOnUse" width="400" height="300">
            <g transform="rotate(45 200 150)" opacity="0.15">
              <text x="200" y="120" font-family="Arial Black, sans-serif" font-size="24" fill="red" text-anchor="middle" font-weight="bold">
                ${userInfo.name || 'SGT University'}
              </text>
              <text x="200" y="150" font-family="Arial, sans-serif" font-size="18" fill="darkred" text-anchor="middle">
                Reg: ${userInfo.registrationNumber || 'PROTECTED'}
              </text>
              <text x="200" y="180" font-family="Arial, sans-serif" font-size="14" fill="gray" text-anchor="middle">
                ${timestamp}
              </text>
            </g>
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#mainWatermark)"/>
      </svg>
    `);
    
    // Corner watermarks (smaller, more frequent)
    const cornerWatermark = Buffer.from(`
      <svg width="${width}" height="${height}">
        <!-- Top Left -->
        <text x="20" y="30" font-family="Arial" font-size="12" fill="rgba(255,0,0,0.4)" font-weight="bold">
          ${userInfo.name || 'SGT LMS'}
        </text>
        <text x="20" y="45" font-family="Arial" font-size="10" fill="rgba(255,0,0,0.3)">
          ${userInfo.registrationNumber || 'PROTECTED'}
        </text>
        
        <!-- Top Right -->
        <text x="${width - 20}" y="30" font-family="Arial" font-size="12" fill="rgba(255,0,0,0.4)" font-weight="bold" text-anchor="end">
          ${timestamp.split(',')[0]}
        </text>
        <text x="${width - 20}" y="45" font-family="Arial" font-size="10" fill="rgba(255,0,0,0.3)" text-anchor="end">
          ${timestamp.split(',')[1]}
        </text>
        
        <!-- Bottom Left -->
        <text x="20" y="${height - 30}" font-family="Arial" font-size="10" fill="rgba(255,0,0,0.3)" font-weight="bold">
          SGT LMS - CONFIDENTIAL
        </text>
        
        <!-- Bottom Right -->
        <text x="${width - 20}" y="${height - 30}" font-family="Arial" font-size="10" fill="rgba(255,0,0,0.3)" text-anchor="end">
          User ID: ${userInfo.id}
        </text>
      </svg>
    `);

    // Apply all watermarks
    const watermarkedImage = await sharp(imageBuffer)
      .composite([
        { input: mainWatermark, blend: 'over' },
        { input: cornerWatermark, blend: 'over' }
      ])
      .png({ quality: 90 })
      .toBuffer();

    return watermarkedImage;
  } catch (error) {
    console.error('Failed to apply watermark:', error);
    // Return original image with basic text overlay as fallback
    try {
      const fallbackWatermark = await sharp(imageBuffer)
        .composite([{
          input: Buffer.from(`<svg><text x="50" y="50" font-size="20" fill="red">PROTECTED - ${userInfo.name || 'USER'}</text></svg>`),
          blend: 'over'
        }])
        .png()
        .toBuffer();
      return fallbackWatermark;
    } catch {
      return imageBuffer; // Return original if everything fails
    }
  }
};

// Get document page count - Updated to work with reading materials
router.get('/secure-docs/:materialId/pages', authenticateToken, verifyDocumentAccess, async (req, res) => {
  try {
    const { materialId } = req.params;
    const material = req.material;
    
    console.log(`📊 Getting page count for material: ${material.title}`);
    
    // Set strict no-cache headers
    res.set({
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0',
      'Surrogate-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY'
    });

    // S3 functionality disabled - using Bunny Stream for videos only
    // PDF document viewing temporarily unavailable
    return res.status(503).json({ 
      message: 'PDF document viewing is temporarily unavailable. Migrating to new storage solution.' 
    });
    
    /* Disabled S3 code
    const s3Key = s3Service.extractKeyFromUrl(material.fileUrl);
    if (!s3Key) {
      throw new Error('Invalid file URL format');
    }
    const pdfBuffer = await s3Service.getFileBuffer(s3Key);
    */
    
    // Save to temporary file for pdf2pic processing
    const tempDir = path.join(__dirname, '../temp');
    await fs.mkdir(tempDir, { recursive: true });
    const tempPdfPath = path.join(tempDir, `${materialId}-${Date.now()}.pdf`);
    
    await fs.writeFile(tempPdfPath, pdfBuffer);

    // Get page count using pdf2pic
    const convert = pdf2pic.fromPath(tempPdfPath, {
      density: 100,
      saveFilename: "page",
      savePath: tempDir,
      format: "png",
      width: 800,
      height: 1200
    });

    // Convert first page to get total count
    const result = await convert.bulk(-1, { responseType: "base64" });
    const totalPages = result.length;

    // Clean up temp file
    await fs.unlink(tempPdfPath).catch(err => console.log('Cleanup error:', err));

    // Log access for audit trail
    console.log(`📖 Document "${material.title}" (${totalPages} pages) accessed by ${req.user.name} (${req.user.registrationNumber})`);

    res.json({ 
      totalPages, 
      materialId,
      title: material.title,
      contentType: material.contentType || 'application/pdf'
    });
  } catch (error) {
    console.error('Failed to get document page count:', error);
    res.status(500).json({ message: 'Failed to process document' });
  }
});

// Get specific page as watermarked image - Updated for reading materials
router.get('/secure-docs/:materialId/page/:pageNumber', authenticateToken, verifyDocumentAccess, async (req, res) => {
  try {
    const { materialId, pageNumber } = req.params;
    const material = req.material;
    const page = parseInt(pageNumber);
    
    if (page < 1) {
      return res.status(400).json({ message: 'Invalid page number' });
    }

    console.log(`📄 Serving page ${page} of material: ${material.title} to user: ${req.user.name}`);

    // Set strict no-cache headers
    res.set({
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0',
      'Surrogate-Control': 'no-store',
      'Content-Type': 'image/png',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Content-Security-Policy': "default-src 'none'; img-src 'self'",
      'X-XSS-Protection': '1; mode=block'
    });

    // S3 functionality disabled - using Bunny Stream for videos only
    // PDF page viewing temporarily unavailable
    return res.status(503).json({ 
      message: 'PDF page viewing is temporarily unavailable. Migrating to new storage solution.' 
    });
    
    /* Disabled S3 code
    const s3Key = s3Service.extractKeyFromUrl(material.fileUrl);
    if (!s3Key) {
      throw new Error('Invalid file URL format');
    }
    const pdfBuffer = await s3Service.getFileBuffer(s3Key);
    */

    // Save to temporary file for pdf2pic processing
    const tempDir = path.join(__dirname, '../temp');
    await fs.mkdir(tempDir, { recursive: true });
    const tempPdfPath = path.join(tempDir, `${materialId}-page${page}-${Date.now()}.pdf`);
    
    await fs.writeFile(tempPdfPath, pdfBuffer);

    // Convert specific page to high-quality image
    const convert = pdf2pic.fromPath(tempPdfPath, {
      density: 200, // Higher DPI for better quality
      saveFilename: "page",
      savePath: tempDir,
      format: "png",
      width: 1200, // Larger width for better readability
      height: 1600
    });

    const pageResult = await convert(page, { responseType: "buffer" });
    
    if (!pageResult || !pageResult.buffer) {
      await fs.unlink(tempPdfPath).catch(err => console.log('Cleanup error:', err));
      return res.status(404).json({ message: 'Page not found' });
    }

    // Apply enhanced watermark with user information
    const userInfo = {
      name: req.user.name || 'Unknown User',
      registrationNumber: req.user.registrationNumber || 'N/A',
      id: req.user.id,
      email: req.user.email
    };

    const watermarkedBuffer = await applyWatermark(pageResult.buffer, userInfo);

    // Clean up temp file
    await fs.unlink(tempPdfPath).catch(err => console.log('Cleanup error:', err));

    // Enhanced audit logging
    console.log(`📊 Page access: Material="${material.title}", Page=${page}, User="${req.user.name}", Reg="${req.user.registrationNumber}", Time=${new Date().toISOString()}`);

    res.send(watermarkedBuffer);
  } catch (error) {
    console.error('Failed to get document page:', error);
    res.status(500).json({ message: 'Failed to process document page' });
  }
});

module.exports = router;