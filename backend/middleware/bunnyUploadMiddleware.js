const multer = require('multer');
const path = require('path');

/**
 * Video Upload Middleware for Bunny Stream
 * Uses memory storage to buffer the file before uploading to Bunny Stream API
 * 
 * This replaces the S3 multer-s3 storage for video uploads
 */

// Configure multer for memory storage (for Bunny Stream uploads)
const videoUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024 * 1024 // 5GB max file size
  },
  fileFilter: function(req, file, cb) {
    const ext = path.extname(file.originalname).toLowerCase();
    const videoExts = ['.mp4', '.avi', '.mov', '.wmv', '.flv', '.webm', '.mkv', '.m4v', '.3gp'];
    const videoMimeTypes = ['video/mp4', 'video/avi', 'video/quicktime', 'video/x-ms-wmv', 
                           'video/x-flv', 'video/webm', 'video/x-matroska', 'video/x-m4v', 'video/3gpp'];
    
    if (videoMimeTypes.includes(file.mimetype) || videoExts.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Only video files are allowed (MP4, AVI, MOV, WMV, FLV, WebM, MKV, M4V, 3GP)'), false);
    }
  }
});

// Configure multer for document uploads (still uses local disk storage)
const documentUpload = multer({
  storage: multer.diskStorage({
    destination: function(req, file, cb) {
      const uploadDir = path.join(__dirname, '..', 'uploads', 'documents');
      const fs = require('fs');
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
      }
      cb(null, uploadDir);
    },
    filename: function(req, file, cb) {
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
      cb(null, 'doc-' + uniqueSuffix + path.extname(file.originalname));
    }
  }),
  limits: {
    fileSize: 100 * 1024 * 1024 // 100MB max for documents
  },
  fileFilter: function(req, file, cb) {
    const ext = path.extname(file.originalname).toLowerCase();
    const documentExts = ['.pdf', '.doc', '.docx', '.ppt', '.pptx', '.xls', '.xlsx', '.txt', '.rtf', '.odt'];
    const documentMimeTypes = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-powerpoint',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'text/plain',
      'text/rtf',
      'application/rtf'
    ];
    
    if (documentMimeTypes.includes(file.mimetype) || documentExts.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Only document files are allowed (PDF, DOC, DOCX, PPT, PPTX, XLS, XLSX, TXT)'), false);
    }
  }
});

// Unified upload that handles both video and document files
const unifiedUpload = multer({
  storage: multer.memoryStorage(), // Use memory for all, we'll handle differently based on type
  limits: {
    fileSize: 5 * 1024 * 1024 * 1024 // 5GB max
  },
  fileFilter: function(req, file, cb) {
    const ext = path.extname(file.originalname).toLowerCase();
    const videoExts = ['.mp4', '.avi', '.mov', '.wmv', '.flv', '.webm', '.mkv', '.m4v', '.3gp'];
    const documentExts = ['.pdf', '.doc', '.docx', '.ppt', '.pptx', '.xls', '.xlsx', '.txt', '.rtf', '.odt'];
    
    if (file.mimetype.startsWith('video/') || videoExts.includes(ext) || 
        file.mimetype.startsWith('application/') || file.mimetype.startsWith('text/') || 
        documentExts.includes(ext)) {
      // Mark the file type for later processing
      file.isVideo = file.mimetype.startsWith('video/') || videoExts.includes(ext);
      cb(null, true);
    } else {
      cb(new Error('Only video and document files are allowed'), false);
    }
  }
});

// CSV upload for bulk operations (disk storage)
const csvUpload = multer({
  storage: multer.diskStorage({
    destination: function(req, file, cb) {
      const uploadDir = path.join(__dirname, '..', 'uploads', 'csv');
      const fs = require('fs');
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
      }
      cb(null, uploadDir);
    },
    filename: function(req, file, cb) {
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
      cb(null, 'csv-' + uniqueSuffix + path.extname(file.originalname));
    }
  }),
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit for CSV files
  },
  fileFilter: function(req, file, cb) {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ext === '.csv' || file.mimetype === 'text/csv' || file.mimetype === 'application/vnd.ms-excel') {
      cb(null, true);
    } else {
      cb(new Error('Only CSV files are allowed for bulk uploads'), false);
    }
  }
});

module.exports = {
  videoUpload,
  documentUpload,
  unifiedUpload,
  csvUpload
};
