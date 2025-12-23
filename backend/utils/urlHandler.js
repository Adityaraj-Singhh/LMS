/**
 * URL Handler Utility
 * Provides functions to normalize URLs, especially for S3 signed URLs
 */

/**
 * Normalize a single URL (adds protocol if missing, handles S3 URLs)
 * @param {string} url - The URL to normalize
 * @param {string} type - The type of content (video, document, etc.)
 * @returns {string} - Normalized URL
 */
const normalizeUrl = (url, type = 'video') => {
  if (!url) return '';
  
  // If it's already a full URL, return as is
  if (url.startsWith('http://') || url.startsWith('https://')) {
    return url;
  }
  
  // If it starts with '/', assume it's a relative path on the same domain
  if (url.startsWith('/')) {
    return url;
  }
  
  // Otherwise, assume it needs https://
  return `https://${url}`;
};

/**
 * Normalize URLs for user objects (profile pictures, etc.)
 * @param {Object} user - User object
 * @returns {Object} - User object with normalized URLs
 */
const normalizeUserUrls = (user) => {
  if (!user) return user;
  
  const normalized = { ...user };
  
  if (normalized.profilePicture) {
    normalized.profilePicture = normalizeUrl(normalized.profilePicture, 'image');
  }
  
  return normalized;
};

/**
 * Recursively normalize URLs in an object or array
 * @param {Object|Array} obj - Object or array to process
 * @returns {Object|Array} - Object/array with normalized URLs
 */
const normalizeObjectUrls = (obj) => {
  if (!obj) return obj;
  
  // Handle arrays
  if (Array.isArray(obj)) {
    return obj.map(item => normalizeObjectUrls(item));
  }
  
  // Handle objects
  if (typeof obj === 'object' && obj !== null) {
    const normalized = {};
    
    for (const [key, value] of Object.entries(obj)) {
      if (typeof value === 'string') {
        // Normalize URL fields
        if (key.toLowerCase().includes('url') || 
            key.toLowerCase().includes('picture') ||
            key.toLowerCase().includes('image') ||
            key.toLowerCase().includes('video') ||
            key.toLowerCase().includes('document')) {
          normalized[key] = normalizeUrl(value);
        } else {
          normalized[key] = value;
        }
      } else if (typeof value === 'object') {
        normalized[key] = normalizeObjectUrls(value);
      } else {
        normalized[key] = value;
      }
    }
    
    return normalized;
  }
  
  return obj;
};

module.exports = {
  normalizeUrl,
  normalizeUserUrls,
  normalizeObjectUrls
};
