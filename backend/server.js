const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const compression = require('compression');
const helmet = require('helmet');
const app = express();
require('dotenv').config();

// Import Redis cache service
const cacheService = require('./services/cacheService');

// HTTP-only CORS configuration
const corsOptions = {
  origin: [
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    process.env.FRONTEND_URL,
    process.env.VERCEL_URL, // Add Vercel URL
    'http://ec2-65-0-69-254.ap-south-1.compute.amazonaws.com',
    'https://ec2-65-0-69-254.ap-south-1.compute.amazonaws.com',
    process.env.UMS_FRONTEND_URL,
    'https://ums-frontend-cyr2.onrender.com'
  ].filter(Boolean), // Remove undefined values
  credentials: true,
  optionsSuccessStatus: 200,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
};

app.use(cors(corsOptions));

// Trust proxy for rate limiting
app.set('trust proxy', 1);

// Security headers (lightweight defaults with CSP for document viewers)
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
      imgSrc: ["'self'", "data:", "https:", "http:"],
      fontSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "https:", "http:"],
      frameSrc: [
        "'self'", 
        "https://docs.google.com",
        "https://view.officeapps.live.com",
        "https://*.amazonaws.com"
      ],
      workerSrc: ["'self'", "blob:"],
      childSrc: ["'self'", "blob:"]
    }
  }
}));

// Gzip compression for JSON/text responses
app.use(compression());

// Remove file size limits for video uploads
app.use(express.json({ limit: '50gb' }));
app.use(express.urlencoded({ limit: '50gb', extended: true }));

// Increase header size limits to handle large requests
app.use((req, res, next) => {
  req.headers['max-http-header-size'] = 16384; // 16KB
  next();
});

// XSS Sanitization middleware - sanitize all request body data
const { sanitizeRequestBody } = require('./utils/sanitize');
app.use(sanitizeRequestBody);

// Serve static files from the public directory with cache headers
app.use(express.static(path.join(__dirname, 'public'), {
  maxAge: '7d',
  etag: true,
  lastModified: true,
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.html')) {
      // Do not cache HTML to avoid stale shells
      res.setHeader('Cache-Control', 'no-cache');
    }
  }
}));

// Serve uploaded files
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Import routes
const adminRoutes = require('./routes/admin');
const authRoutes = require('./routes/auth');
const ssoAuthRoutes = require('./routes/ssoAuth'); // SSO Authentication from UMS
const roleRoutes = require('./routes/role');
const notificationRoutes = require('./routes/notification');
const studentRoutes = require('./routes/student');
const teacherRoutes = require('./routes/teacher');
const hodRoutes = require('./routes/hod');
const deanRoutes = require('./routes/dean');
const hodAnnouncementHistoryRoutes = require('./routes/hodAnnouncementHistory');
const quizRoutes = require('./routes/quiz');
const quizPoolRoutes = require('./routes/quizPool');
const unitRoutes = require('./routes/unit');
const readingMaterialRoutes = require('./routes/readingMaterial');
const teacherRequestRoutes = require('./routes/teacherRequest');
const studentQuizAttemptRoutes = require('./routes/studentQuizAttempt');
const unitQuizRoutes = require('./routes/unitQuiz');
const announcementRoutes = require('./routes/announcement');
const schoolRoutes = require('./routes/school');
const departmentRoutes = require('./routes/department');
const courseRoutes = require('./routes/course');
const sectionRoutes = require('./routes/section');
const hierarchyRoutes = require('./routes/hierarchy');
const quizSecurityRoutes = require('./routes/quizSecurity');
const secureQuizRoutes = require('./routes/secureQuiz');
const ccRoutes = require('./routes/cc');
const quizUnlockRoutes = require('./routes/quizUnlock');
// Live class routes removed - moved to independent video call module
const groupChatRoutes = require('./routes/groupChat');
const teacherAssignmentRoutes = require('./routes/teacherAssignments');
const certificateRoutes = require('./routes/certificate');
const teacherAnalyticsRoutes = require('./routes/teacherAnalytics');
const hodAnalyticsRoutes = require('./routes/hodAnalytics');
const studentIndividualAnalyticsRoutes = require('./routes/studentIndividualAnalytics');
const sectionAnalyticsRoutes = require('./routes/sectionAnalytics');
const deanSectionAnalyticsRoutes = require('./routes/deanSectionAnalytics');
const deanDepartmentRoutes = require('./routes/deanDepartment');
const deanCourseRoutes = require('./routes/deanCourse');
const quizConfigurationRoutes = require('./routes/quizConfiguration');
const contentArrangementRoutes = require('./routes/contentArrangement');
const unitValidationRoutes = require('./routes/unitValidation');

// Import and use COMPREHENSIVE audit log middleware - tracks EVERY user action
const comprehensiveAuditLogger = require('./middleware/comprehensiveAuditLogger');
app.use(comprehensiveAuditLogger);

app.use('/api/admin', adminRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/auth', ssoAuthRoutes); // SSO routes from UMS
app.use('/api/security', require('./routes/security')); // Security monitoring routes
app.use('/api', require('./routes/secureDocuments')); // Secure document routes
app.use('/api', roleRoutes);
app.use('/api/notifications', notificationRoutes);

// Remove verbose debug tracing in production to reduce overhead

app.use('/api/student', studentRoutes);
app.use('/api/teacher', teacherRoutes);
app.use('/api/hod', hodRoutes);
// Add logging for dean requests
app.use('/api/dean', (req, res, next) => {
  console.log('🌟 DEAN REQUEST:', req.method, req.url, 'Params:', req.params);
  next();
});
app.use('/api/dean', deanRoutes);
app.use('/api/hod/announcements', hodAnnouncementHistoryRoutes);
// ...existing code...
app.use('/api/quizzes', quizRoutes); // Quiz routes
app.use('/api/quiz-pools', quizPoolRoutes); // Quiz pool routes
app.use('/api/unit', unitRoutes); // Unit routes (mounted at /api/unit)
app.use('/api/units', unitRoutes); // Unit routes (also mounted at /api/units for backwards compatibility)
app.use('/api/reading-materials', readingMaterialRoutes); // Reading material routes with signed URL support
app.use('/api/videos', require('./routes/video')); // Video routes with signed URL support
app.use('/api/teacher-requests', teacherRequestRoutes);
app.use('/api/student', studentQuizAttemptRoutes); // Student quiz attempt routes (delete incomplete)
app.use('/api/student', unitQuizRoutes); // Unit quiz routes for students
app.use('/api/announcement', announcementRoutes); // Generic announcement route
app.use('/api/announcements', announcementRoutes); // New hierarchical announcement system (plural)
app.use('/api/schools', schoolRoutes); // School management routes
app.use('/api/departments', departmentRoutes); // Department management routes
app.use('/api/courses', courseRoutes); // Course management routes
app.use('/api/sections', sectionRoutes); // Section management routes
app.use('/api/hierarchy', hierarchyRoutes); // Hierarchy management routes
app.use('/api/quiz', quizSecurityRoutes); // Quiz security monitoring routes
app.use('/api/student/quiz', quizRoutes); // Student quiz routes
app.use('/api/student', secureQuizRoutes); // Secure quiz routes
app.use('/api/cc', ccRoutes); // Course Coordinator routes
app.use('/api/quiz-unlock', quizUnlockRoutes); // Quiz unlock system routes
// Live class routes removed - moved to independent video call module
app.use('/api/group-chat', groupChatRoutes); // Group chat routes
app.use('/api/video-unlock', require('./routes/videoUnlock')); // Video unlock system routes
app.use('/api/teacher-assignments', teacherAssignmentRoutes); // Enhanced teacher assignment system
app.use('/api/certificates', certificateRoutes); // Certificate system routes
app.use('/api/teacher-analytics', teacherAnalyticsRoutes); // Teacher analytics routes
app.use('/api/hod-analytics', hodAnalyticsRoutes); // HOD analytics routes
app.use('/api/student-analytics', studentIndividualAnalyticsRoutes); // Student individual analytics routes
app.use('/api/section-analytics', sectionAnalyticsRoutes); // Section analytics routes (Dean)
app.use('/api/dean-section-analytics', deanSectionAnalyticsRoutes); // Dean section analytics routes
app.use('/api/dean', deanDepartmentRoutes); // Dean department analytics routes
app.use('/api/dean', deanCourseRoutes); // Dean course analytics routes
app.use('/api/quiz-configuration', quizConfigurationRoutes); // Quiz configuration routes
app.use('/api/content-arrangement', contentArrangementRoutes); // Content arrangement workflow routes
app.use('/api/unit-validation', unitValidationRoutes); // Unit validation and progression routes

// Connect to MongoDB using only the .env file configuration
mongoose.connect(process.env.MONGO_URI)
  .then(() => {
    console.log('MongoDB Connected Successfully');
    
    // Run migrations after successful connection
    const generateTeacherIds = require('./migrations/generateTeacherIds');
    generateTeacherIds();
  })
  .catch(err => {
    console.error('MongoDB Connection Error:', err.message);
    console.log('Please check your MONGO_URI in .env file and ensure MongoDB is running');
    process.exit(1); // Exit with error code
  });

const db = mongoose.connection;
db.on('error', (err) => {
  console.error('MongoDB connection error:', err);
  console.log('Please check your MONGO_URI in .env file and ensure MongoDB is running');
});
db.once('open', () => {
  console.log('Connected to MongoDB');
});

app.get('/', (req, res) => {
  res.send('SGT Project Backend Running');
});

// Add a database status check endpoint for debugging
app.get('/api/db-status', (req, res) => {
  const status = {
    isConnected: mongoose.connection.readyState === 1,
    connectionState: mongoose.connection.readyState,
    stateDescription: ['disconnected', 'connected', 'connecting', 'disconnecting'][mongoose.connection.readyState]
  };
  res.json(status);
});

// Health check endpoint for scalable services
app.get('/health', async (req, res) => {
  try {
    const cacheStats = await cacheService.getStats();
    const health = {
      status: 'healthy',
      timestamp: Date.now(),
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      database: {
        status: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
      },
      cache: {
        status: cacheStats.connected ? 'connected' : 'disconnected',
        enabled: cacheStats.enabled,
        keys: cacheStats.keys || 0,
      },
    };

    // Live class services removed - moved to independent video call module

    res.json(health);
  } catch (error) {
    res.status(500).json({
      status: 'unhealthy',
      error: error.message,
      timestamp: Date.now(),
    });
  }
});

// Metrics endpoint for monitoring
app.get('/metrics', async (req, res) => {
  try {
    const cacheStats = await cacheService.getStats();
    const metrics = {
      timestamp: Date.now(),
      server: {
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        cpu: process.cpuUsage(),
      },
      cache: {
        enabled: cacheStats.enabled,
        connected: cacheStats.connected,
        keys: cacheStats.keys || 0,
      },
    };

    // Live class metrics removed - moved to independent video call module

    res.json(metrics);
  } catch (error) {
    res.status(500).json({
      error: error.message,
      timestamp: Date.now(),
    });
  }
});


// Auto-create single admin if not exists
const User = require('./models/User');
const bcrypt = require('bcryptjs');

async function createAdmin() {
  try {
    const email = process.env.ADMIN_EMAIL;
    const password = process.env.ADMIN_PASSWORD;
    const name = process.env.ADMIN_NAME || 'Admin';
    if (!email || !password) {
      console.warn('Admin credentials not set in .env');
      return;
    }
    let user = await User.findOne({ email, role: 'admin' });
    if (!user) {
      const hashed = await bcrypt.hash(password, 10);
      user = new User({
        name,
        email,
        password: hashed,
        role: 'admin',
        permissions: ['*'],
        isActive: true,
        emailVerified: true
      });
      await user.save();
      console.log('Admin created:', email);
    } else {
      console.log('Admin already exists:', email);
    }
  } catch (err) {
    console.error('Error creating admin:', err.message);
  }
}

// Error handling middleware for multer and file uploads
app.use((err, req, res, next) => {
  if (err.name === 'MulterError') {
    // Multer error handling
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ 
        message: 'File is too large. The server supports unlimited file sizes, but this error may indicate a configuration issue.',
        error: err.message
      });
    }
    return res.status(400).json({ 
      message: 'File upload error: ' + err.message,
      code: err.code 
    });
  } else if (err.message === 'Only video files are allowed') {
    return res.status(400).json({ message: err.message });
  } else if (err.type === 'entity.too.large') {
    return res.status(413).json({ 
      message: 'Request body is too large. This may be due to body-parser limits.',
      error: err.message
    });
  }
  // For any other errors
  console.error('Server error:', err);
  res.status(500).json({ 
    message: 'Internal server error',
    error: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// Initialize Socket.IO for live classes and group chat BEFORE starting the server
const http = require('http');
const https = require('https');
const fs = require('fs');

// Set PORT
const PORT = process.env.PORT || 5000;

// Use HTTP server (HTTPS support removed)
const server = http.createServer(app);

// Configure server for large file uploads
server.timeout = 0; // Disable timeout for large uploads
server.keepAliveTimeout = 0; // Disable keep-alive timeout
server.headersTimeout = 0; // Disable headers timeout
server.requestTimeout = 0; // Disable request timeout
server.maxRequestsPerSocket = 0; // Unlimited requests per socket

console.log('🌐 HTTP server created with unlimited upload configuration');

// Create a single Socket.IO instance for group chat
const { Server } = require('socket.io');
const io = new Server(server, {
  cors: {
    origin: [
      "http://localhost:3000",
      process.env.FRONTEND_URL
    ],
    methods: ["GET", "POST"],
    credentials: true
  }
});

// Live class services removed - moved to independent video call module

function initializeBasicServices() {
  // Initialize Group Chat Socket (using shared Socket.IO instance)
  const initializeGroupChatSocket = require('./socket/groupChatSocket');
  initializeGroupChatSocket(io);
  console.log('✅ Group Chat Socket.IO server initialized');
}
server.listen(PORT, '0.0.0.0', async () => {
  await createAdmin();
  
  // Run migrations
  const generateTeacherIds = require('./migrations/generateTeacherIds');
  await generateTeacherIds();
  
  // Initialize basic services (group chat only)
  initializeBasicServices();
  
  // Start background job for duration updates
  const { updateVideosDuration } = require('./jobs/updateVideosDuration');
  // Run immediately on startup
  console.log('🔄 Starting video duration update job...');
  updateVideosDuration().then(() => {
    console.log('✅ Initial video duration update completed');
  }).catch(err => {
    console.error('❌ Initial video duration update failed:', err);
  });
  
  // Schedule periodic updates every 12 hours
  setInterval(async () => {
    console.log('🔄 Running scheduled video duration update...');
    try {
      await updateVideosDuration();
      console.log('✅ Scheduled video duration update completed');
    } catch (error) {
      console.error('❌ Scheduled video duration update failed:', error);
    }
  }, 12 * 60 * 60 * 1000); // 12 hours in milliseconds
  
  console.log(`🌐 HTTP Server running on port ${PORT}`);
  console.log(`   Access via: http://${process.env.HOST}:${PORT}`);
  console.log(`   Access via: http://localhost:${PORT}`);
  console.log(`🎯 SGT-LMS Backend Ready - Group chat with Socket.IO enabled`);
  console.log(`📊 Video duration update job scheduled every 12 hours`);
});
