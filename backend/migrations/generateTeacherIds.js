/**
 * Migration script to generate teacher IDs for existing teachers without one
 * Format: 5-digit numeric (10001, 10002, etc.)
 */
const User = require('../models/User');

async function generateTeacherIds() {
  try {
    console.log('Checking for teachers without teacherId...');
    
    // Find all staff (teachers, HOD, dean) without a teacherId
    const staffRoles = ['teacher', 'hod', 'dean'];
    const staffUsers = await User.find({ 
      $or: [
        { role: { $in: staffRoles } },
        { roles: { $in: staffRoles } }
      ],
      $or: [
        { teacherId: null },
        { teacherId: { $exists: false } },
        { teacherId: '' }
      ]
    });
    
    if (staffUsers.length === 0) {
      console.log('No staff found without teacherId.');
      return;
    }
    
    console.log(`Found ${staffUsers.length} staff without teacherId. Generating IDs...`);
    
    // Find the highest existing teacherId (5-digit numeric format)
    const highestStaff = await User.findOne(
      { teacherId: { $regex: /^\d{5}$/ } },
      { teacherId: 1 },
      { sort: { teacherId: -1 } }
    );
    
    let nextNumber = 10001; // Start from 10001 (5 digits)
    if (highestStaff && highestStaff.teacherId) {
      // Parse the numeric ID and increment
      const currentNumber = parseInt(highestStaff.teacherId, 10);
      if (currentNumber >= 10001) {
        nextNumber = currentNumber + 1;
      }
    }
    
    // Generate and assign IDs to each staff member
    for (const staff of staffUsers) {
      const teacherId = nextNumber.toString();
      await User.findByIdAndUpdate(staff._id, { teacherId });
      console.log(`Assigned ${teacherId} to ${staff.role} ${staff.name} (${staff.email})`);
      nextNumber++;
    }
    
    console.log('Staff ID generation complete.');
  } catch (error) {
    console.error('Error generating staff IDs:', error);
  }
}

module.exports = generateTeacherIds;
