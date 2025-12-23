require('dotenv').config();
const mongoose = require('mongoose');

async function findCourseAndProgress() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/lms_db');
    console.log('✅ Connected to MongoDB\n');
    
    const studentId = '6944ee7d2d55e94f73e76089';
    
    // Raw query to find progress
    console.log('🔍 Searching for student progress...');
    const db = mongoose.connection.db;
    const progressRecords = await db.collection('studentprogresses').find({
      studentId: new mongoose.Types.ObjectId(studentId)
    }).toArray();
    
    console.log(`\nFound ${progressRecords.length} progress records:\n`);
    
    for (const progress of progressRecords) {
      console.log(`📊 Progress Record:`);
      console.log(`   Course ID: ${progress.courseId}`);
      console.log(`   Section ID: ${progress.sectionId || 'N/A'}`);
      console.log(`   Arrangement Version: ${progress.arrangementVersion || 'Not set'}`);
      console.log(`   Unlocked Videos: ${progress.unlockedVideos.length}`);
      progress.unlockedVideos.forEach(v => console.log(`      - ${v}`));
      console.log();
      
      // Get course details
      const course = await db.collection('courses').findOne({ _id: progress.courseId });
      if (course) {
        console.log(`📚 Course: ${course.title}`);
        console.log(`   Active Arrangement Version: ${course.activeArrangementVersion || 'Not set'}`);
        console.log(`   Is Launched: ${course.isLaunched}`);
        console.log();
      }
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await mongoose.connection.close();
    console.log('✅ Done');
  }
}

findCourseAndProgress();
