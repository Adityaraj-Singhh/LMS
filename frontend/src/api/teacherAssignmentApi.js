import axios from 'axios';

/**
 * Enhanced Teacher Assignment API
 * Matches the backend endpoints at /api/teacher-assignments
 */

// Get teacher's assignments
export const getTeacherAssignments = async (teacherId) => {
  const response = await axios.get(`/api/teacher-assignments/teacher/${teacherId}`);
  return response.data;
};

// Assign teacher to courses with enhanced validation
export const assignTeacherToCourses = async (teacherId, assignments) => {
  const response = await axios.post('/api/teacher-assignments/assign', {
    teacherId,
    assignments
  });
  return response.data;
};

// Get available teachers (with role and department validation)
export const getAvailableTeachers = async (departmentId = null) => {
  const params = departmentId ? { departmentId } : {};
  const response = await axios.get('/api/teacher-assignments/teachers', { params });
  return response.data;
};

// Get available teachers for a specific course
export const getAvailableTeachersForCourse = async (courseId) => {
  const response = await axios.get(`/api/teacher-assignments/teachers/course/${courseId}`);
  return response.data;
};

// Get section's assignments (teachers assigned to courses in section)
export const getSectionAssignments = async (sectionId) => {
  const response = await axios.get(`/api/teacher-assignments/section/${sectionId}`);
  return response.data;
};

// Remove assignment
export const removeAssignment = async (assignmentData) => {
  const response = await axios.post('/api/teacher-assignments/remove', assignmentData);
  return response.data;
};

// Validate teacher assignments
export const validateTeacherAssignments = async () => {
  const response = await axios.get('/api/teacher-assignments/validate');
  return response.data;
};

// Teacher-Section-Course Management (works for both Admin and HOD)
export const assignTeacherToSectionCourse = async (sectionId, courseId, teacherId) => {
  // Get user role to determine endpoint
  const token = localStorage.getItem('token');
  
  // Try multiple sources for role detection
  let userRole = localStorage.getItem('activeRole');
  
  // If no activeRole, check the user object
  if (!userRole) {
    try {
      const userStr = localStorage.getItem('user');
      if (userStr) {
        const user = JSON.parse(userStr);
        userRole = user.role;
      }
    } catch (e) {
      console.error('Error parsing user from localStorage:', e);
    }
  }
  
  // Check if on admin path as fallback
  if (!userRole && window.location.pathname.includes('/admin')) {
    userRole = 'admin';
  }
  
  console.log('🔍 Role detection for assignment:', { 
    userRole, 
    activeRole: localStorage.getItem('activeRole'),
    pathname: window.location.pathname
  });
  
  // Use admin endpoint if user is admin, otherwise use HOD endpoint
  const isAdmin = userRole === 'admin' || 
                 (typeof userRole === 'string' && userRole.includes('admin'));
                 
  const endpoint = isAdmin
    ? '/api/admin/assign-teacher-to-section-course'
    : '/api/hod/assign-teacher-to-section-course';
    
  console.log('📍 Using endpoint:', endpoint, 'for role:', userRole);
  
  const response = await axios.post(endpoint, {
    sectionId,
    courseId,
    teacherId
  }, {
    headers: { Authorization: `Bearer ${token}` }
  });
  return response.data;
};

export const removeTeacherFromSectionCourse = async (sectionId, courseId, teacherId) => {
  // Get user role to determine endpoint
  const token = localStorage.getItem('token');
  
  // Try multiple sources for role detection
  let userRole = localStorage.getItem('activeRole');
  
  // If no activeRole, check the user object
  if (!userRole) {
    try {
      const userStr = localStorage.getItem('user');
      if (userStr) {
        const user = JSON.parse(userStr);
        userRole = user.role;
      }
    } catch (e) {
      console.error('Error parsing user from localStorage:', e);
    }
  }
  
  // Check if on admin path as fallback
  if (!userRole && window.location.pathname.includes('/admin')) {
    userRole = 'admin';
  }
  
  console.log('🔍 Role detection for removal:', { 
    userRole, 
    activeRole: localStorage.getItem('activeRole'),
    pathname: window.location.pathname
  });
  
  // Use admin endpoint if user is admin, otherwise use HOD endpoint
  const isAdmin = userRole === 'admin' || 
                 (typeof userRole === 'string' && userRole.includes('admin'));
                 
  const endpoint = isAdmin
    ? '/api/admin/remove-teacher-from-section-course'
    : '/api/hod/remove-teacher-from-section-course';
    
  console.log('📍 Using endpoint:', endpoint, 'for role:', userRole);
  
  const response = await axios.post(endpoint, {
    sectionId,
    courseId,
    teacherId
  }, {
    headers: { Authorization: `Bearer ${token}` }
  });
  return response.data;
};

// Enhanced teacher assignment with section context
export const assignTeacherToCourseInSection = async (assignmentData, token) => {
  const response = await axios.post('/api/teacher-assignments/assign', {
    teacherId: assignmentData.teacherId,
    assignments: [{
      sectionId: assignmentData.sectionId,
      courseId: assignmentData.courseId
    }]
  }, {
    headers: { Authorization: `Bearer ${token}` }
  });
  return response.data;
};

// Create the teacherAssignmentApi object for named import
export const teacherAssignmentApi = {
  getTeacherAssignments,
  assignTeacherToCourses,
  getAvailableTeachers,
  getAvailableTeachersForCourse,
  getSectionAssignments,
  removeAssignment,
  validateTeacherAssignments,
  // Enhanced workflow functions
  assignTeacherToSectionCourse,
  removeTeacherFromSectionCourse,
  assignTeacherToCourseInSection
};

// Also export as default
export default teacherAssignmentApi;

// Export all existing functions from sectionApi for backward compatibility
export * from './sectionApi';