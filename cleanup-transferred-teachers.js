const mongoose = require('mongoose');
require('dotenv').config();

const User = require('./models/User');
const Section = require('./models/Section');
const Course = require('./models/Course');
const SectionCourseTeacher = require('./models/SectionCourseTeacher');
const School = require('./models/School');
const Department = require('./models/Department');

async function cleanupTransferredTeachers() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to MongoDB');

    // Find all teachers
    const teachers = await User.find({ 
      $or: [{ role: 'teacher' }, { roles: 'teacher' }] 
    }).populate('school department');

    console.log(`\nFound ${teachers.length} teachers`);
    
    let cleanedCount = 0;

    for (const teacher of teachers) {
      if (!teacher.school || !teacher.department) {
        console.log(`⚠️  Teacher ${teacher.name} (${teacher.email}) has no school/department assigned`);
        continue;
      }

      // Get all SectionCourseTeacher assignments for this teacher
      const assignments = await SectionCourseTeacher.find({ teacher: teacher._id })
        .populate({
          path: 'section',
          populate: { path: 'department school' }
        })
        .populate({
          path: 'course',
          populate: { path: 'department school' }
        });

      let removedAssignments = 0;

      // Check each assignment - remove if section/course belongs to different school
      for (const assignment of assignments) {
        if (!assignment.section || !assignment.course) {
          // Remove orphaned assignments
          await SectionCourseTeacher.deleteOne({ _id: assignment._id });
          removedAssignments++;
          console.log(`🧹 Removed orphaned assignment for teacher ${teacher.name}`);
          continue;
        }

        const sectionSchool = assignment.section.school?._id || assignment.section.school;
        const courseSchool = assignment.course.school?._id || assignment.course.school;
        const teacherSchool = teacher.school._id || teacher.school;

        // If section or course belongs to different school than teacher, remove assignment
        if (sectionSchool?.toString() !== teacherSchool.toString() || 
            courseSchool?.toString() !== teacherSchool.toString()) {
          
          await SectionCourseTeacher.deleteOne({ _id: assignment._id });
          removedAssignments++;
          
          console.log(`🗑️  Removed assignment: Teacher ${teacher.name} (${teacher.school.name}) from Section ${assignment.section.name} / Course ${assignment.course.name}`);
        }
      }

      // Also clean up Section.teachers array
      const sectionsToClean = await Section.find({ teachers: teacher._id })
        .populate('school department');

      for (const section of sectionsToClean) {
        const sectionSchool = section.school?._id || section.school;
        const teacherSchool = teacher.school._id || teacher.school;

        if (sectionSchool?.toString() !== teacherSchool.toString()) {
          await Section.updateOne(
            { _id: section._id },
            { $pull: { teachers: teacher._id } }
          );
          removedAssignments++;
          console.log(`🗑️  Removed teacher ${teacher.name} from section ${section.name} (different school)`);
        }
      }

      // Clean up Course.coordinators array
      const coursesToClean = await Course.find({ coordinators: teacher._id })
        .populate('school department');

      for (const course of coursesToClean) {
        const courseSchool = course.school?._id || course.school;
        const teacherSchool = teacher.school._id || teacher.school;

        if (courseSchool?.toString() !== teacherSchool.toString()) {
          await Course.updateOne(
            { _id: course._id },
            { $pull: { coordinators: teacher._id } }
          );
          removedAssignments++;
          console.log(`🗑️  Removed teacher ${teacher.name} as coordinator from course ${course.name} (different school)`);
        }
      }

      if (removedAssignments > 0) {
        cleanedCount++;
        console.log(`✅ Cleaned up ${removedAssignments} stale assignments for teacher ${teacher.name}\n`);
      }
    }

    console.log(`\n🎉 Cleanup complete! Fixed ${cleanedCount} teachers with stale assignments.`);
    
  } catch (error) {
    console.error('Error during cleanup:', error);
  } finally {
    await mongoose.connection.close();
    console.log('Database connection closed');
  }
}

cleanupTransferredTeachers();
