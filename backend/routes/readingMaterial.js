const express = require('express');
const router = express.Router();
const readingMaterialController = require('../controllers/readingMaterialController');
const { auth, authorizeRoles } = require('../middleware/auth');
const { validateContentAccess } = require('../middleware/contentValidationMiddleware');
const upload = require('../middleware/upload')('documents');
const ReadingMaterial = require('../models/ReadingMaterial');
const bunnyStorageService = require('../services/bunnyStorageService');
const crypto = require('crypto');
const path = require('path');

// Helper function to get MIME type from file extension
function getMimeType(filename) {
  const ext = path.extname(filename).toLowerCase();
  const mimeTypes = {
    '.pdf': 'application/pdf',
    '.doc': 'application/msword',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.ppt': 'application/vnd.ms-powerpoint',
    '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    '.xls': 'application/vnd.ms-excel',
    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    '.txt': 'text/plain',
    '.rtf': 'application/rtf'
  };
  return mimeTypes[ext] || 'application/octet-stream';
}

// Store for secure document tokens (in production, use Redis)
const documentTokenStore = new Map();

// Token expiration time (15 minutes)
const TOKEN_EXPIRATION = 15 * 60 * 1000;

// Clean up expired tokens periodically
setInterval(() => {
  const now = Date.now();
  for (const [token, data] of documentTokenStore.entries()) {
    if (now > data.expiresAt) {
      documentTokenStore.delete(token);
    }
  }
}, 60000); // Clean up every minute

// Teacher routes
router.post('/', 
  auth, 
  authorizeRoles('teacher', 'admin'), 
  upload.single('file'), 
  readingMaterialController.createReadingMaterial
);

router.put('/:materialId', 
  auth, 
  authorizeRoles('teacher', 'admin'), 
  upload.single('file'), 
  readingMaterialController.updateReadingMaterial
);

router.delete('/:materialId', 
  auth, 
  authorizeRoles('teacher', 'admin'), 
  readingMaterialController.deleteReadingMaterial
);

// Common routes
router.get('/:materialId', auth, readingMaterialController.getReadingMaterial);
router.get('/unit/:unitId', auth, readingMaterialController.getUnitReadingMaterials);

// Get signed URL for reading material preview
// Get signed URL for reading material preview - with content validation
// NOTE: This now returns a secure proxy token instead of the actual S3 URL
router.get('/:materialId/signed-url', auth, validateContentAccess, async (req, res) => {
  try {
    const { materialId } = req.params;
    const userId = req.user._id || req.user.id;

    console.log(`📖 Generating secure document token for reading material: ${materialId}`);

    // Find the reading material
    const material = await ReadingMaterial.findById(materialId);
    if (!material) {
      return res.status(404).json({ message: 'Reading material not found' });
    }

    // Check if material has a file URL
    if (!material.fileUrl) {
      console.error(`❌ Reading material ${materialId} has no fileUrl. Title: ${material.title}`);
      return res.status(400).json({ message: 'Reading material has no file associated. Please upload a file first.' });
    }

    // Generate a secure token for document access
    const secureToken = crypto.randomBytes(32).toString('hex');
    
    // Determine MIME type from file URL or content type
    const mimeType = getMimeType(material.fileUrl || material.content || '');
    
    // Store token with material info and expiration
    documentTokenStore.set(secureToken, {
      materialId: materialId,
      userId: userId.toString(),
      fileUrl: material.fileUrl,
      title: material.title,
      contentType: material.contentType,
      mimeType: mimeType,
      filename: material.content || material.title,
      createdAt: Date.now(),
      expiresAt: Date.now() + TOKEN_EXPIRATION
    });

    console.log(`✅ Generated secure token for reading material: ${material.title}`);

    // Return proxy URL instead of file URL - use absolute URL for iframe compatibility
    const protocol = req.get('x-forwarded-proto') || req.protocol || 'http';
    const host = req.get('host');
    const proxyUrl = `${protocol}://${host}/api/reading-materials/secure-view/${secureToken}`;

    res.json({
      signedUrl: proxyUrl,
      title: material.title,
      contentType: material.contentType,
      expiresIn: TOKEN_EXPIRATION / 1000,
      contentDisposition: 'inline',
      isSecureProxy: true
    });

  } catch (error) {
    console.error('Error generating reading material signed URL:', error);
    res.status(500).json({ message: 'Failed to generate reading material preview URL' });
  }
});

// Secure document proxy - streams document from local storage (S3 removed)
router.get('/secure-view/:token', async (req, res) => {
  try {
    const { token } = req.params;

    // Validate token
    const tokenData = documentTokenStore.get(token);
    if (!tokenData) {
      console.error('❌ Invalid or expired document token');
      return res.status(403).json({ message: 'Invalid or expired document access token' });
    }

    // Check if token has expired
    if (Date.now() > tokenData.expiresAt) {
      documentTokenStore.delete(token);
      console.error('❌ Document token expired');
      return res.status(403).json({ message: 'Document access token has expired' });
    }

    console.log(`🔒 Secure document access: ${tokenData.title} (Material: ${tokenData.materialId})`);

    // Get file URL
    const fileUrl = tokenData.fileUrl;
    if (!fileUrl) {
      console.error('❌ Missing file URL');
      return res.status(400).json({ message: 'Missing file URL' });
    }

    // Check if it's a Bunny CDN URL - proxy it to avoid CORS issues
    if (fileUrl.includes('b-cdn.net')) {
      console.log('🐰 Proxying reading material from Bunny Storage:', fileUrl);
      
      try {
        // Convert CDN URL to Storage API URL for private access
        const storagePath = fileUrl.replace(
          'https://lms-document-storage.b-cdn.net',
          ''
        );
        const storageUrl = `https://sg.storage.bunnycdn.com/lms-document-storage${storagePath}`;
        
        console.log('📥 Fetching from Storage API:', storageUrl);
        
        const axios = require('axios');
        const cdnResponse = await axios.get(storageUrl, {
          responseType: 'stream',
          timeout: 30000,
          headers: {
            'AccessKey': process.env.BUNNY_STORAGE_PASSWORD || 'd3fe18a7-89bb-43a8-9297c4dc3105-d995-43af'
          }
        });
        
        // Set headers for inline viewing
        const mimeType = tokenData.mimeType || getMimeType(tokenData.filename || tokenData.fileUrl) || 'application/pdf';
        res.setHeader('Content-Type', mimeType);
        res.setHeader('Content-Disposition', `inline; filename="${tokenData.filename || tokenData.title}"`);
        res.setHeader('Content-Length', cdnResponse.headers['content-length']);
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('Cache-Control', 'private, max-age=300'); // 5 minutes cache
        
        // Stream from CDN to client
        cdnResponse.data.pipe(res);
        
        cdnResponse.data.on('error', (err) => {
          console.error('❌ CDN stream error:', err);
          if (!res.headersSent) {
            res.status(500).json({ message: 'Error streaming file from CDN' });
          }
        });
        
        return;
      } catch (cdnError) {
        console.error('❌ Failed to fetch from Bunny CDN:', cdnError.message);
        return res.status(500).json({ 
          message: 'Failed to load document from CDN',
          error: cdnError.message 
        });
      }
    }

    // Legacy local file handling
    if (!fileUrl.startsWith('/uploads/')) {
      console.error('❌ Invalid file URL format:', fileUrl);
      return res.status(400).json({ message: 'Invalid file URL format' });
    }

    // Build absolute path to file - check both reading-materials and old materials directory
    const filename = path.basename(fileUrl);
    let filePath = path.join(__dirname, '..', 'uploads', 'reading-materials', filename);
    
    // Fallback: check old materials directory for backwards compatibility
    if (!fs.existsSync(filePath)) {
      const oldPath = path.join(__dirname, '..', 'uploads', 'materials', filename);
      if (fs.existsSync(oldPath)) {
        filePath = oldPath;
        console.log('📂 Using file from old materials directory');
      } else {
        console.error('❌ File not found in either directory:', filename);
        return res.status(404).json({ message: 'File not found' });
      }
    }

    // Determine content type from file extension
    const fileExt = filename.split('.').pop().toLowerCase();
    const contentTypeMap = {
      'pdf': 'application/pdf',
      'doc': 'application/msword',
      'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'ppt': 'application/vnd.ms-powerpoint',
      'pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'xls': 'application/vnd.ms-excel',
      'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    };
    
    const contentType = contentTypeMap[fileExt] || 'application/octet-stream';
    const fileStats = fs.statSync(filePath);

    // Set security headers
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', 'inline');
    res.setHeader('Content-Length', fileStats.size);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'private, no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('Content-Security-Policy', "default-src 'self'; frame-ancestors 'self'");

    console.log(`✅ Streaming local document: ${tokenData.title} (${fileStats.size} bytes)`);

    // Stream the file
    const fileStream = fs.createReadStream(filePath);
    fileStream.pipe(res);
    
    fileStream.on('error', (err) => {
      console.error('❌ File stream error:', err);
      if (!res.headersSent) {
        res.status(500).json({ message: 'Error streaming file' });
      }
    });

  } catch (error) {
    console.error('Error in secure document proxy:', error);
    res.status(500).json({ message: 'Failed to load document' });
  }
});

// Secure document stream endpoint - for iframe/embed viewing
router.get('/secure-stream/:token', async (req, res) => {
  try {
    const { token } = req.params;

    // Validate token
    const tokenData = documentTokenStore.get(token);
    if (!tokenData) {
      console.error('❌ Invalid or expired document token for stream');
      return res.status(403).send('Access denied');
    }

    // Check if token has expired
    if (Date.now() > tokenData.expiresAt) {
      documentTokenStore.delete(token);
      console.error('❌ Document stream token expired');
      return res.status(403).send('Token expired');
    }

    // Get Bunny CDN URL from fileUrl
    const cdnUrl = tokenData.fileUrl;
    if (!cdnUrl) {
      return res.status(400).send('Invalid document URL');
    }

    // Get file extension from URL
    const fileExt = path.extname(cdnUrl).replace('.', '').toLowerCase();
    
    // **FIX: For Office documents (DOC, PPT, Excel, TXT), use external viewers**
    if (['doc', 'docx', 'ppt', 'pptx', 'xls', 'xlsx', 'txt'].includes(fileExt)) {
      // Use the Bunny CDN URL directly with external viewers
      const bunnyUrl = cdnUrl;
      
      console.log(`📄 Using external viewer for Office document: ${tokenData.title}`);
      console.log(`📄 Bunny CDN URL: ${bunnyUrl}`);
      console.log(`📄 File extension: ${fileExt}`);
      
      // For TXT files, fetch and display as plain text
      if (fileExt === 'txt') {
        try {
          const axios = require('axios');
          const response = await axios.get(bunnyUrl, { responseType: 'text' });
          res.setHeader('Content-Type', 'text/plain; charset=utf-8');
          res.setHeader('Content-Disposition', 'inline');
          return res.send(response.data);
        } catch (error) {
          console.error('❌ Error fetching TXT file from Bunny:', error.message);
          return res.status(500).send('Error loading text file');
        }
      }
      
      // Choose viewer based on file type
      let viewerUrl;
      if (['ppt', 'pptx'].includes(fileExt)) {
        // Use Office Online for PowerPoint (works better)
        viewerUrl = `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(bunnyUrl)}`;
        console.log(`📄 Using Office Online viewer for PPT: ${viewerUrl}`);
      } else {
        // Use Google Docs Viewer for DOC/Excel (more reliable with CDN URLs)
        viewerUrl = `https://docs.google.com/viewer?url=${encodeURIComponent(bunnyUrl)}&embedded=true`;
        console.log(`📄 Using Google Docs viewer for ${fileExt.toUpperCase()}: ${viewerUrl}`);
      }
      
      // Return HTML page with viewer
      const viewerHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${tokenData.title || 'Document'}</title>
  <style>
    body, html { margin: 0; padding: 0; height: 100%; overflow: hidden; }
    iframe { width: 100%; height: 100%; border: none; }
  </style>
</head>
<body>
  <iframe src="${viewerUrl}" frameborder="0">
    This is an embedded document viewer.
  </iframe>
</body>
</html>`;
      
      res.setHeader('Content-Type', 'text/html');
      return res.send(viewerHtml);
    }

    // For PDFs, stream directly from Bunny CDN
    const axios = require('axios');
    const response = await axios.get(cdnUrl, { responseType: 'arraybuffer' });
    
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline');
    res.setHeader('Content-Length', response.data.length);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'private, no-cache');
    
    res.send(response.data);

  } catch (error) {
    console.error('Error in secure document stream:', error);
    res.status(500).send('Failed to load document');
  }
});

// Student routes
router.post('/:materialId/complete', 
  auth, 
  authorizeRoles('student'), 
  readingMaterialController.markAsCompleted
);

router.get('/student/course/:courseId', 
  auth, 
  authorizeRoles('student'), 
  readingMaterialController.getStudentReadingMaterialStatus
);

module.exports = router;
