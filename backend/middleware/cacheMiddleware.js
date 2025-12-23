/**
 * Cache Middleware for Express Routes
 * Provides automatic caching for analytics and expensive endpoints
 * 
 * Usage:
 *   const { cacheAnalytics } = require('../middleware/cacheMiddleware');
 *   router.get('/dashboard', cacheAnalytics('dashboard', 300), getDashboard);
 */

const cacheService = require('../services/cacheService');
const { CacheTTL } = require('../services/cacheService');

/**
 * Generic cache middleware
 * @param {Function} keyGenerator - Function to generate cache key from req
 * @param {number} ttlSeconds - Cache TTL in seconds
 */
const cacheMiddleware = (keyGenerator, ttlSeconds = 300) => {
  return async (req, res, next) => {
    // Skip caching for non-GET requests
    if (req.method !== 'GET') {
      return next();
    }

    try {
      const cacheKey = keyGenerator(req);
      const cached = await cacheService.get(cacheKey);

      if (cached !== null) {
        // Add cache header for debugging
        res.set('X-Cache', 'HIT');
        res.set('X-Cache-Key', cacheKey.substring(0, 50));
        return res.json(cached);
      }

      // Store original json method
      const originalJson = res.json.bind(res);

      // Override json method to cache response
      res.json = (data) => {
        // Only cache successful responses
        if (res.statusCode >= 200 && res.statusCode < 300) {
          cacheService.set(cacheKey, data, ttlSeconds).catch(() => {});
        }
        res.set('X-Cache', 'MISS');
        return originalJson(data);
      };

      next();
    } catch (error) {
      console.error('Cache middleware error:', error.message);
      next(); // Continue without caching on error
    }
  };
};

/**
 * Cache middleware for analytics endpoints
 * @param {string} type - Type of analytics (dashboard, course, department, etc.)
 * @param {number} ttlSeconds - Cache TTL (default: 5 minutes)
 */
const cacheAnalytics = (type, ttlSeconds = CacheTTL.ANALYTICS_DASHBOARD) => {
  return cacheMiddleware((req) => {
    const userId = req.user?.id || 'anonymous';
    const role = req.user?.role || 'unknown';
    const params = Object.values(req.params).join(':');
    const query = Object.entries(req.query)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join('&');
    
    return `analytics:${role}:${type}:${userId}:${params}:${query}`;
  }, ttlSeconds);
};

/**
 * Cache middleware for signed URLs
 * Uses shorter key based on S3 key
 */
const cacheSignedUrl = () => {
  return cacheMiddleware((req) => {
    const s3Key = req.params.key || req.params.videoId || req.query.key || '';
    return `s3:signed:${Buffer.from(s3Key).toString('base64').substring(0, 100)}`;
  }, CacheTTL.SIGNED_URL);
};

/**
 * Cache invalidation middleware
 * Invalidates relevant caches after data mutations
 * @param {string} pattern - Cache key pattern to invalidate
 */
const invalidateCache = (pattern) => {
  return async (req, res, next) => {
    // Store original methods
    const originalJson = res.json.bind(res);
    const originalSend = res.send.bind(res);

    const invalidate = async () => {
      try {
        const dynamicPattern = pattern
          .replace(':userId', req.user?.id || '*')
          .replace(':deptId', req.params.deptId || req.body?.department || '*')
          .replace(':courseId', req.params.courseId || req.body?.course || '*');
        
        await cacheService.delPattern(dynamicPattern);
      } catch (error) {
        console.error('Cache invalidation error:', error.message);
      }
    };

    // Override response methods to invalidate after success
    res.json = (data) => {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        invalidate(); // Fire and forget
      }
      return originalJson(data);
    };

    res.send = (data) => {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        invalidate();
      }
      return originalSend(data);
    };

    next();
  };
};

/**
 * Selective cache - only cache if response meets conditions
 */
const cacheIf = (condition, keyGenerator, ttlSeconds) => {
  return async (req, res, next) => {
    if (!condition(req)) {
      return next();
    }
    return cacheMiddleware(keyGenerator, ttlSeconds)(req, res, next);
  };
};

module.exports = {
  cacheMiddleware,
  cacheAnalytics,
  cacheSignedUrl,
  invalidateCache,
  cacheIf,
};
