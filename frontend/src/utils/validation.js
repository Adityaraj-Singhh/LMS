/**
 * Centralized validation utilities for all admin forms
 * Provides consistent validation logic across the application
 */

// Regular expressions
export const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const phoneRegex = /^[6-9]\d{9}$/; // Indian phone number
export const uidRegex = /^\d{5,6}$/; // 5-6 digit UID
export const regNoRegex = /^\d{9,}$/; // 9+ digit registration number
export const alphanumericRegex = /^[a-zA-Z0-9\s]+$/;
export const nameRegex = /^[a-zA-Z\s.'-]+$/; // Names with common characters

// Password strength validation
export const passwordStrengthRegex = {
  weak: /^.{6,}$/, // At least 6 characters
  medium: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/, // 8+ chars, upper, lower, number
  strong: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&#])[A-Za-z\d@$!%*?&#]{8,}$/ // 8+ chars, upper, lower, number, special
};

/**
 * Validate required field
 */
export const validateRequired = (value, fieldName = 'Field') => {
  if (!value || (typeof value === 'string' && value.trim() === '')) {
    return `${fieldName} is required`;
  }
  return '';
};

/**
 * Validate email format
 */
export const validateEmail = (email) => {
  if (!email || email.trim() === '') {
    return 'Email is required';
  }
  if (!emailRegex.test(email.trim())) {
    return 'Invalid email format (e.g., user@example.com)';
  }
  return '';
};

/**
 * Validate password
 */
export const validatePassword = (password, minLength = 6) => {
  if (!password || password.trim() === '') {
    return 'Password is required';
  }
  if (password.length < minLength) {
    return `Password must be at least ${minLength} characters`;
  }
  return '';
};

/**
 * Validate password strength
 */
export const validatePasswordStrength = (password) => {
  if (!password || password.trim() === '') {
    return { valid: false, message: 'Password is required', strength: 'none' };
  }
  if (password.length < 6) {
    return { valid: false, message: 'Password must be at least 6 characters', strength: 'none' };
  }
  
  if (passwordStrengthRegex.strong.test(password)) {
    return { valid: true, message: 'Strong password', strength: 'strong' };
  } else if (passwordStrengthRegex.medium.test(password)) {
    return { valid: true, message: 'Medium strength password', strength: 'medium' };
  } else {
    return { valid: true, message: 'Weak password - consider adding uppercase, numbers, and special characters', strength: 'weak' };
  }
};

/**
 * Validate name
 */
export const validateName = (name) => {
  if (!name || name.trim() === '') {
    return 'Name is required';
  }
  if (name.trim().length < 2) {
    return 'Name must be at least 2 characters';
  }
  if (name.trim().length > 100) {
    return 'Name must not exceed 100 characters';
  }
  if (!nameRegex.test(name.trim())) {
    return 'Name can only contain letters, spaces, dots, hyphens, and apostrophes';
  }
  return '';
};

/**
 * Validate UID (5-6 digits)
 */
export const validateUID = (uid, isRequired = false) => {
  if (!uid || uid.trim() === '') {
    return isRequired ? 'UID is required' : '';
  }
  if (!uidRegex.test(uid.trim())) {
    return 'UID must be 5-6 digits only (e.g., 10001)';
  }
  return '';
};

/**
 * Validate registration number (9+ digits)
 */
export const validateRegNo = (regNo, isRequired = false) => {
  if (!regNo || regNo.trim() === '') {
    return isRequired ? 'Registration number is required' : '';
  }
  if (!regNoRegex.test(regNo.trim())) {
    return 'Registration number should be 9 or more digits (e.g., 100000001)';
  }
  return '';
};

/**
 * Validate phone number (Indian format)
 */
export const validatePhone = (phone, isRequired = false) => {
  if (!phone || phone.trim() === '') {
    return isRequired ? 'Phone number is required' : '';
  }
  if (!phoneRegex.test(phone.trim())) {
    return 'Invalid phone number (10 digits starting with 6-9)';
  }
  return '';
};

/**
 * Validate dropdown/select field
 */
export const validateSelect = (value, fieldName = 'Field') => {
  if (!value || value.trim() === '') {
    return `${fieldName} is required`;
  }
  return '';
};

/**
 * Validate alphanumeric field
 */
export const validateAlphanumeric = (value, fieldName = 'Field', isRequired = true) => {
  if (!value || value.trim() === '') {
    return isRequired ? `${fieldName} is required` : '';
  }
  if (!alphanumericRegex.test(value.trim())) {
    return `${fieldName} can only contain letters, numbers, and spaces`;
  }
  return '';
};

/**
 * Validate text length
 */
export const validateLength = (value, min = 0, max = 1000, fieldName = 'Field') => {
  if (!value) value = '';
  const length = value.trim().length;
  
  if (min > 0 && length < min) {
    return `${fieldName} must be at least ${min} characters`;
  }
  if (max > 0 && length > max) {
    return `${fieldName} must not exceed ${max} characters`;
  }
  return '';
};

/**
 * Validate course code format
 */
export const validateCourseCode = (code) => {
  if (!code || code.trim() === '') {
    return 'Course code is required';
  }
  if (!/^[A-Z]{2,4}\d{3,4}$/.test(code.trim())) {
    return 'Invalid course code format (e.g., CS101, MATH1001)';
  }
  return '';
};

/**
 * Validate URL format
 */
export const validateURL = (url, isRequired = false) => {
  if (!url || url.trim() === '') {
    return isRequired ? 'URL is required' : '';
  }
  try {
    new URL(url);
    return '';
  } catch {
    return 'Invalid URL format';
  }
};

/**
 * Validate number range
 */
export const validateNumber = (value, min = null, max = null, fieldName = 'Value') => {
  if (value === '' || value === null || value === undefined) {
    return `${fieldName} is required`;
  }
  
  const num = Number(value);
  if (isNaN(num)) {
    return `${fieldName} must be a number`;
  }
  
  if (min !== null && num < min) {
    return `${fieldName} must be at least ${min}`;
  }
  if (max !== null && num > max) {
    return `${fieldName} must not exceed ${max}`;
  }
  return '';
};

/**
 * Validate file upload
 */
export const validateFile = (file, allowedTypes = [], maxSizeMB = 10) => {
  if (!file) {
    return 'Please select a file';
  }
  
  if (allowedTypes.length > 0) {
    const fileType = file.type;
    const fileExt = file.name.split('.').pop().toLowerCase();
    
    const isValidType = allowedTypes.some(type => 
      fileType.includes(type) || type === `.${fileExt}`
    );
    
    if (!isValidType) {
      return `File type must be one of: ${allowedTypes.join(', ')}`;
    }
  }
  
  const fileSizeMB = file.size / (1024 * 1024);
  if (fileSizeMB > maxSizeMB) {
    return `File size must not exceed ${maxSizeMB}MB`;
  }
  
  return '';
};

/**
 * Validate date
 */
export const validateDate = (date, fieldName = 'Date', isFutureRequired = false, isPastRequired = false) => {
  if (!date) {
    return `${fieldName} is required`;
  }
  
  const selectedDate = new Date(date);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  if (isNaN(selectedDate.getTime())) {
    return 'Invalid date format';
  }
  
  if (isFutureRequired && selectedDate < today) {
    return `${fieldName} must be in the future`;
  }
  
  if (isPastRequired && selectedDate > today) {
    return `${fieldName} must be in the past`;
  }
  
  return '';
};

/**
 * Sanitize input to prevent XSS
 */
export const sanitizeInput = (input) => {
  if (typeof input !== 'string') return input;
  
  return input
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;');
};

/**
 * Check for potential XSS patterns
 */
export const containsXSS = (input) => {
  if (typeof input !== 'string') return false;
  
  const xssPatterns = [
    /<script[\s\S]*?>[\s\S]*?<\/script>/gi,
    /<iframe[\s\S]*?>/gi,
    /javascript:/gi,
    /on\w+\s*=/gi, // onclick=, onload=, etc.
    /<object[\s\S]*?>/gi,
    /<embed[\s\S]*?>/gi
  ];
  
  return xssPatterns.some(pattern => pattern.test(input));
};

/**
 * Comprehensive form validation
 * Returns object with field errors
 */
export const validateForm = (formData, validationRules) => {
  const errors = {};
  
  Object.keys(validationRules).forEach(field => {
    const rules = validationRules[field];
    const value = formData[field];
    
    for (const rule of rules) {
      const error = rule(value);
      if (error) {
        errors[field] = error;
        break; // Stop at first error for this field
      }
    }
  });
  
  return errors;
};

/**
 * Get error helper text for MUI TextField
 */
export const getFieldError = (touched, errors, fieldName) => {
  return touched[fieldName] && errors[fieldName] ? errors[fieldName] : '';
};

/**
 * Check if field has error for MUI TextField
 */
export const hasFieldError = (touched, errors, fieldName) => {
  return touched[fieldName] && !!errors[fieldName];
};

// Export all validators as default
export default {
  validateRequired,
  validateEmail,
  validatePassword,
  validatePasswordStrength,
  validateName,
  validateUID,
  validateRegNo,
  validatePhone,
  validateSelect,
  validateAlphanumeric,
  validateLength,
  validateCourseCode,
  validateURL,
  validateNumber,
  validateFile,
  validateDate,
  sanitizeInput,
  containsXSS,
  validateForm,
  getFieldError,
  hasFieldError,
  // Regex exports
  emailRegex,
  phoneRegex,
  uidRegex,
  regNoRegex,
  alphanumericRegex,
  nameRegex,
  passwordStrengthRegex
};
