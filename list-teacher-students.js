const mongoose = require('mongoose');

mongoose.connect('mongodb://localhost:27017/sgt-lms-db').then(async () => {
  const User = require('./models/User');
  const SectionCourseTeacher = require('./models/SectionCourseTeacher');
  const Section = require('./models/Section');
  
  const teacher = await User.findOne({ email: 'palak@gmail.com' });
  
  if (!teacher) {
    console.log('Teacher not found');
    process.exit(1);
  }
  
  console.log('Teacher:', teacher.name, teacher._id.toString());
  console.log('Role:', teacher.role);
  
  const assignments = await SectionCourseTeacher.find({ 
    teacher: teacher._id, 
    isActive: true 
  })
  .populate('section')
  .populate('course', 'title courseCode');
  
  console.log('\nTotal Assignments:', assignments.length);
  
  const allStudents = new Set();
  
  for (const assignment of assignments) {
    console.log('\n=== Assignment ===');
    console.log('Section:', assignment.section.name);
    console.log('Course:', assignment.course?.title, '(' + assignment.course?.courseCode + ')');
    
    const section = await Section.findById(assignment.section._id)
      .populate('students', 'name email regNo');
    
    console.log('Students in section:', section.students.length);
    
    section.students.forEach(student => {
      console.log('  -', student.name, '|', student.email, '| RegNo:', student.regNo);
      allStudents.add(student._id.toString());
    });
  }
  
  console.log('\n=== SUMMARY ===');
  console.log('Total Unique Students:', allStudents.size);
  console.log('Total Sections:', assignments.length);
  
  process.exit(0);
}).catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
