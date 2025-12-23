// Find the actual course
const mongoose = require('mongoose');
require('dotenv').config();

const Course = require('./models/Course');

async function findCourse() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    const courses = await Course.find({}).select('title _id');
    console.log('Courses:', JSON.stringify(courses, null, 2));
    await mongoose.connection.close();
  } catch (error) {
    console.error('Error:', error);
  }
}

findCourse();
