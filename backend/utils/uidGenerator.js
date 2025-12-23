/**
 * UID Generation Utilities
 * 
 * Generates unique IDs for users based on their role:
 * - Staff (teachers, HOD, dean, admin): ##### (5-6 digits)
 * - Students: ######### (9+ digits, starting from 100000001)
 */

const User = require('../models/User');

/**
 * Generate next available UID for staff
 * @returns {Promise<string>} UID in format ##### (5 digits)
 */
async function generateStaffUID() {
  try {
    // Find highest existing 5-digit staff UID
    const latestStaff = await User.findOne({ 
      uid: /^\d{5,6}$/,
      $or: [
        { role: 'teacher' },
        { role: 'hod' },
        { role: 'dean' },
        { role: 'admin' },
        { roles: { $in: ['teacher', 'hod', 'dean', 'admin'] } }
      ]
    })
      .sort({ uid: -1 })
      .select('uid')
      .lean();

    let nextNumber = 10001; // Start from 5 digits
    
    if (latestStaff && latestStaff.uid) {
      // Parse numeric UID
      const currentNumber = parseInt(latestStaff.uid);
      nextNumber = currentNumber + 1;
    }

    // Format as ##### (5-6 digits)
    return String(nextNumber);
  } catch (error) {
    console.error('Error generating staff UID:', error);
    throw new Error('Failed to generate staff UID');
  }
}

/**
 * Generate next available UID for students
 * @returns {Promise<string>} UID in format ######### (9+ digits)
 */
async function generateStudentUID() {
  try {
    // Find highest existing 9+ digit student UID
    const latestStudent = await User.findOne({ 
      uid: /^\d{9,}$/,
      $or: [
        { role: 'student' },
        { roles: 'student' }
      ]
    })
      .sort({ uid: -1 })
      .select('uid')
      .lean();

    let nextNumber = 100000001; // Start from 100000001 (9 digits)
    
    if (latestStudent && latestStudent.uid) {
      // Parse numeric UID
      const currentNumber = parseInt(latestStudent.uid);
      if (currentNumber >= 100000001) {
        nextNumber = currentNumber + 1;
      }
    }

    // Format as ######### (9+ digits)
    return String(nextNumber);
  } catch (error) {
    console.error('Error generating student UID:', error);
    throw new Error('Failed to generate student UID');
  }
}

/**
 * Generate UID based on user role
 * @param {string|string[]} roles - User role(s)
 * @returns {Promise<string>} Generated UID
 */
async function generateUID(roles) {
  const roleArray = Array.isArray(roles) ? roles : [roles];
  
  // Check if user is a student
  if (roleArray.includes('student')) {
    return await generateStudentUID();
  }
  
  // Check if user is staff (teacher, hod, dean, admin)
  if (roleArray.some(r => ['teacher', 'hod', 'dean', 'admin'].includes(r))) {
    return await generateStaffUID();
  }
  
  throw new Error('Invalid role for UID generation');
}

module.exports = {
  generateStaffUID,
  generateStudentUID,
  generateUID
};
