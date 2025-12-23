/**
 * XSS Protection and Input Sanitization Utilities
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
export const escapeHtml = (str) => {
  if (typeof str !== 'string') return str;
  return str.replace(/[&<>"'`=/]/g, char => htmlEntities[char]);
};

/**
 * Remove all HTML tags from string
 * @param {string} str - Input string
 * @returns {string} - String without HTML tags
 */
export const stripHtmlTags = (str) => {
  if (typeof str !== 'string') return str;
  return str.replace(/<[^>]*>/g, '');
};

/**
 * Remove potentially dangerous patterns (scripts, event handlers, etc.)
 * @param {string} str - Input string
 * @returns {string} - Sanitized string
 */
export const removeDangerousPatterns = (str) => {
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
  
  return sanitized;
};

/**
 * Full sanitization - strips tags and removes dangerous patterns
 * @param {string} str - Input string
 * @returns {string} - Fully sanitized string
 */
export const sanitizeInput = (str) => {
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
export const sanitizeObject = (obj) => {
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
export const INPUT_LIMITS = {
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
export const validateInputLength = (str, fieldType = 'default') => {
  if (typeof str !== 'string') return str;
  const limit = INPUT_LIMITS[fieldType] || INPUT_LIMITS.default;
  return str.slice(0, limit);
};

/**
 * Validate email format
 * @param {string} email - Email to validate
 * @returns {boolean} - True if valid
 */
export const isValidEmail = (email) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

/**
 * Check if string contains potential XSS patterns
 * @param {string} str - String to check
 * @returns {boolean} - True if contains potential XSS
 */
export const containsXSS = (str) => {
  if (typeof str !== 'string') return false;
  
  const xssPatterns = [
    /<script/i,
    /javascript\s*:/i,
    /on\w+\s*=/i,
    /data\s*:/i,
    /vbscript\s*:/i,
    /expression\s*\(/i,
    /eval\s*\(/i,
    /document\s*\.\s*cookie/i,
    /document\s*\.\s*write/i,
    /\.innerHTML/i,
    /<iframe/i,
    /<object/i,
    /<embed/i,
    /<form/i,
    /<input/i,
    /<link/i,
    /<meta/i
  ];
  
  return xssPatterns.some(pattern => pattern.test(str));
};

/**
 * Validate alphanumeric with spaces
 * @param {string} str - String to validate
 * @returns {boolean} - True if valid
 */
export const isAlphanumericWithSpaces = (str) => {
  const regex = /^[a-zA-Z0-9\s\-_.]+$/;
  return regex.test(str);
};

/**
 * Sanitize CSV row data
 * @param {object} row - CSV row object
 * @returns {object} - Sanitized row
 */
export const sanitizeCSVRow = (row) => {
  const sanitized = {};
  for (const [key, value] of Object.entries(row)) {
    const sanitizedKey = sanitizeInput(key);
    let sanitizedValue = sanitizeInput(String(value || ''));
    
    // Additional CSV-specific checks
    // Remove formula injection attempts (=, +, -, @, |, etc. at start)
    if (/^[=+\-@|]/.test(sanitizedValue)) {
      sanitizedValue = "'" + sanitizedValue; // Prefix with quote to neutralize
    }
    
    sanitized[sanitizedKey] = sanitizedValue;
  }
  return sanitized;
};

/**
 * Validate CSV file content
 * @param {Array} data - Parsed CSV data
 * @param {Array} requiredFields - Required field names
 * @returns {object} - { valid: boolean, errors: Array, sanitizedData: Array }
 */
export const validateCSVData = (data, requiredFields = []) => {
  const errors = [];
  const sanitizedData = [];
  
  if (!Array.isArray(data) || data.length === 0) {
    return { valid: false, errors: ['CSV file is empty or invalid'], sanitizedData: [] };
  }
  
  data.forEach((row, index) => {
    const rowNumber = index + 2; // +2 because header is row 1 and index starts at 0
    const sanitizedRow = sanitizeCSVRow(row);
    
    // Check required fields
    for (const field of requiredFields) {
      if (!sanitizedRow[field] || sanitizedRow[field].trim() === '') {
        errors.push(`Row ${rowNumber}: Missing required field "${field}"`);
      }
    }
    
    // Validate email if present
    if (sanitizedRow.email && !isValidEmail(sanitizedRow.email)) {
      errors.push(`Row ${rowNumber}: Invalid email format "${sanitizedRow.email}"`);
    }
    
    // Check for suspiciously long values (potential attack)
    for (const [key, value] of Object.entries(sanitizedRow)) {
      if (value.length > 1000) {
        errors.push(`Row ${rowNumber}: Field "${key}" exceeds maximum length`);
      }
    }
    
    sanitizedData.push(sanitizedRow);
  });
  
  return {
    valid: errors.length === 0,
    errors: errors.slice(0, 10), // Limit error messages
    sanitizedData
  };
};

export default {
  escapeHtml,
  stripHtmlTags,
  removeDangerousPatterns,
  sanitizeInput,
  sanitizeObject,
  validateInputLength,
  isValidEmail,
  containsXSS,
  isAlphanumericWithSpaces,
  sanitizeCSVRow,
  validateCSVData,
  INPUT_LIMITS
};
