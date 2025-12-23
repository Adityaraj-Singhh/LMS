// Validation helpers for School and Department

const validateSchoolCode = (code) => {
  if (!code || code.trim() === '') {
    return { valid: false, error: 'School code is required' };
  }
  const trimmedCode = code.trim().toUpperCase();
  if (trimmedCode.length < 3) {
    return { valid: false, error: 'School code must be at least 3 characters' };
  }
  if (trimmedCode.length > 10) {
    return { valid: false, error: 'School code cannot exceed 10 characters' };
  }
  if (!/^[A-Z0-9]+$/.test(trimmedCode)) {
    return { valid: false, error: 'School code must contain only letters (A-Z) and numbers (0-9). Special characters not allowed.' };
  }
  return { valid: true, error: '' };
};

const validateSchoolName = (name) => {
  if (!name || name.trim() === '') {
    return { valid: false, error: 'School name is required' };
  }
  const trimmedName = name.trim();
  if (trimmedName.length < 3) {
    return { valid: false, error: 'School name must be at least 3 characters' };
  }
  if (trimmedName.length > 100) {
    return { valid: false, error: 'School name cannot exceed 100 characters' };
  }
  // Allow letters, numbers, spaces, and common punctuation
  if (!/^[A-Za-z0-9\s&.,'-]+$/.test(trimmedName)) {
    return { valid: false, error: 'School name contains invalid characters. Only letters, numbers, spaces, and basic punctuation allowed.' };
  }
  return { valid: true, error: '' };
};

// Validation helpers for Department
const validateDepartmentCode = (code) => {
  if (!code || code.trim() === '') {
    return { valid: false, error: 'Department code is required' };
  }
  const trimmedCode = code.trim().toUpperCase();
  if (trimmedCode.length < 2) {
    return { valid: false, error: 'Department code must be at least 2 characters' };
  }
  if (trimmedCode.length > 10) {
    return { valid: false, error: 'Department code cannot exceed 10 characters' };
  }
  if (!/^[A-Z0-9]+$/.test(trimmedCode)) {
    return { valid: false, error: 'Department code must contain only letters (A-Z) and numbers (0-9). Special characters not allowed.' };
  }
  return { valid: true, error: '' };
};

const validateDepartmentName = (name) => {
  if (!name || name.trim() === '') {
    return { valid: false, error: 'Department name is required' };
  }
  const trimmedName = name.trim();
  if (trimmedName.length < 3) {
    return { valid: false, error: 'Department name must be at least 3 characters' };
  }
  if (trimmedName.length > 100) {
    return { valid: false, error: 'Department name cannot exceed 100 characters' };
  }
  // Allow letters, numbers, spaces, and common punctuation
  if (!/^[A-Za-z0-9\s&.,'-]+$/.test(trimmedName)) {
    return { valid: false, error: 'Department name contains invalid characters. Only letters, numbers, spaces, and basic punctuation allowed.' };
  }
  return { valid: true, error: '' };
};

module.exports = { 
  validateSchoolCode, 
  validateSchoolName,
  validateDepartmentCode,
  validateDepartmentName
};
