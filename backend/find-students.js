const mongoose = require('mongoose');
require('dotenv').config();

// Import models
const User = require('./models/User');

// Database connection
const connectDB = async () => {
  try {
    console.log('🔗 Connecting to database...');
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Database connected successfully');
  } catch (error) {
    console.error('❌ Database connection failed:', error.message);
    process.exit(1);
  }
};

// Find all students
const findStudents = async () => {
  try {
    console.log('\n👥 Finding all students...');
    
    const students = await User.find({ role: 'student' }).select('name email role enrolledCourses');
    
    console.log(`📊 Found ${students.length} students:`);
    
    students.forEach((student, index) => {
      console.log(`\n👤 Student ${index + 1}:`);
      console.log(`   📧 Email: ${student.email}`);
      console.log(`   👤 Name: ${student.name}`);
      console.log(`   📚 Enrolled Courses: ${student.enrolledCourses.length}`);
    });
    
    // Also find users with 'sourav' in email or name
    console.log('\n🔍 Searching for users with "sourav"...');
    const souravUsers = await User.find({
      $or: [
        { email: { $regex: 'sourav', $options: 'i' } },
        { name: { $regex: 'sourav', $options: 'i' } }
      ]
    }).select('name email role');
    
    console.log(`📊 Found ${souravUsers.length} users with "sourav":`);
    souravUsers.forEach((user, index) => {
      console.log(`   ${index + 1}. ${user.email} - ${user.name} (${user.role})`);
    });
    
  } catch (error) {
    console.error('❌ Error finding students:', error.message);
  }
};

// Main function
const run = async () => {
  try {
    await connectDB();
    await findStudents();
  } catch (error) {
    console.error('\n❌ Script failed:', error.message);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Database disconnected');
    process.exit(0);
  }
};

run();