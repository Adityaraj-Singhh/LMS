const rateLimit = require('express-rate-limit');

// General rate limiter: 200 requests per 15 minutes per IP
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200,
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    // Skip rate limiting for health checks
    return req.path === '/health' || req.path === '/api/health';
  }
});

// Auth-specific rate limiter: 30 requests per 15 minutes per IP
// Increased from 10/10min to 30/15min to allow testing while still preventing abuse
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 30,
  message: 'Too many authentication attempts, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
  // Custom handler to provide more details
  handler: (req, res) => {
    const ip = req.ip || req.headers['x-forwarded-for']?.split(',')[0]?.trim() || 'unknown';
    console.warn(`[Rate Limit] Auth limit exceeded for IP: ${ip}, Path: ${req.path}`);
    
    res.status(429).json({
      message: 'Too many authentication attempts, please try again later.',
      retryAfter: Math.ceil(req.rateLimit.resetTime / 1000),
      limit: req.rateLimit.limit,
      current: req.rateLimit.current
    });
  }
});

module.exports = { generalLimiter, authLimiter };
