/**
 * XSS Protection and Input Sanitization Utilities for Backend
 * Prevents script injection and validates input
 */

// HTML entities to escape
const htmlEntities = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#x27;',
  '/': '&#x2F;',
  '`': '&#x60;',
  '=': '&#x3D;'
};

/**
 * Escape HTML special characters to prevent XSS
 * @param {string} str - Input string
 * @returns {string} - Sanitized string
 */
const escapeHtml = (str) => {
  if (typeof str !== 'string') return str;
  return str.replace(/[&<>"'`=/]/g, char => htmlEntities[char]);
};

/**
 * Remove all HTML tags from string
 * @param {string} str - Input string
 * @returns {string} - String without HTML tags
 */
const stripHtmlTags = (str) => {
  if (typeof str !== 'string') return str;
  return str.replace(/<[^>]*>/g, '');
};

/**
 * Remove potentially dangerous patterns (scripts, event handlers, etc.)
 * @param {string} str - Input string
 * @returns {string} - Sanitized string
 */
const removeDangerousPatterns = (str) => {
  if (typeof str !== 'string') return str;
  
  // Remove script tags and content
  let sanitized = str.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
  
  // Remove event handlers (onclick, onerror, onload, etc.)
  sanitized = sanitized.replace(/\s*on\w+\s*=\s*["'][^"']*["']/gi, '');
  sanitized = sanitized.replace(/\s*on\w+\s*=\s*[^\s>]*/gi, '');
  
  // Remove javascript: protocol
  sanitized = sanitized.replace(/javascript\s*:/gi, '');
  
  // Remove data: protocol (can be used for XSS)
  sanitized = sanitized.replace(/data\s*:/gi, '');
  
  // Remove vbscript: protocol
  sanitized = sanitized.replace(/vbscript\s*:/gi, '');
  
  // Remove expression() CSS function
  sanitized = sanitized.replace(/expression\s*\(/gi, '');
  
  // Remove eval() calls
  sanitized = sanitized.replace(/eval\s*\(/gi, '');
  
  // Remove document.cookie access
  sanitized = sanitized.replace(/document\s*\.\s*cookie/gi, '');
  
  // Remove document.write
  sanitized = sanitized.replace(/document\s*\.\s*write/gi, '');
  
  // Remove innerHTML
  sanitized = sanitized.replace(/\.innerHTML/gi, '');
  
  // Remove MongoDB injection patterns
  sanitized = sanitized.replace(/\$where/gi, '');
  sanitized = sanitized.replace(/\$gt/gi, '');
  sanitized = sanitized.replace(/\$lt/gi, '');
  sanitized = sanitized.replace(/\$ne/gi, '');
  sanitized = sanitized.replace(/\$regex/gi, '');
  
  return sanitized;
};

/**
 * Full sanitization - strips tags and removes dangerous patterns
 * @param {string} str - Input string
 * @returns {string} - Fully sanitized string
 */
const sanitizeInput = (str) => {
  if (typeof str !== 'string') return str;
  let sanitized = stripHtmlTags(str);
  sanitized = removeDangerousPatterns(sanitized);
  return sanitized.trim();
};

/**
 * Sanitize object - recursively sanitize all string values in an object
 * @param {object} obj - Object to sanitize
 * @returns {object} - Sanitized object
 */
const sanitizeObject = (obj) => {
  if (typeof obj !== 'object' || obj === null) {
    return typeof obj === 'string' ? sanitizeInput(obj) : obj;
  }
  
  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeObject(item));
  }
  
  const sanitized = {};
  for (const [key, value] of Object.entries(obj)) {
    sanitized[key] = sanitizeObject(value);
  }
  return sanitized;
};

/**
 * Input length limits by field type
 */
const INPUT_LIMITS = {
  name: 100,
  email: 254,
  password: 128,
  code: 20,
  description: 500,
  title: 200,
  uid: 50,
  phone: 20,
  address: 300,
  default: 255
};

/**
 * Validate and limit input length
 * @param {string} str - Input string
 * @param {string} fieldType - Type of field (name, email, etc.)
 * @returns {string} - Validated string
 */
const validateInputLength = (str, fieldType = 'default') => {
  if (typeof str !== 'string') return str;
  const limit = INPUT_LIMITS[fieldType] || INPUT_LIMITS.default;
  return str.slice(0, limit);
};

/**
 * Validate email format
 * @param {string} email - Email to validate
 * @returns {boolean} - True if valid
 */
const isValidEmail = (email) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

/**
 * Sanitize CSV row data
 * @param {object} row - CSV row object
 * @returns {object} - Sanitized row
 */
const sanitizeCSVRow = (row) => {
  const sanitized = {};
  for (const [key, value] of Object.entries(row)) {
    const sanitizedKey = sanitizeInput(key);
    let sanitizedValue = sanitizeInput(String(value || ''));
    
    // Remove formula injection attempts (=, +, -, @, |, etc. at start)
    if (/^[=+\-@|]/.test(sanitizedValue)) {
      sanitizedValue = sanitizedValue.substring(1);
    }
    
    sanitized[sanitizedKey] = sanitizedValue;
  }
  return sanitized;
};

/**
 * Express middleware to sanitize request body
 */
const sanitizeRequestBody = (req, res, next) => {
  if (req.body && typeof req.body === 'object') {
    req.body = sanitizeObject(req.body);
  }
  next();
};

/**
 * Express middleware to sanitize query parameters
 */
const sanitizeQueryParams = (req, res, next) => {
  if (req.query && typeof req.query === 'object') {
    req.query = sanitizeObject(req.query);
  }
  next();
};

module.exports = {
  escapeHtml,
  stripHtmlTags,
  removeDangerousPatterns,
  sanitizeInput,
  sanitizeObject,
  validateInputLength,
  isValidEmail,
  sanitizeCSVRow,
  sanitizeRequestBody,
  sanitizeQueryParams,
  INPUT_LIMITS
};
