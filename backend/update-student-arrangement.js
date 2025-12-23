require('dotenv').config();
const mongoose = require('mongoose');
const StudentProgress = require('./models/StudentProgress');
const Course = require('./models/Course');
const ContentArrangement = require('./models/ContentArrangement');

async function updateStudentToNewArrangement() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/lms_db');
    console.log('✅ Connected to MongoDB\n');
    
    const courseId = '694617c2bb2f121113a903bf';
    
    // Get course and active arrangement
    console.log('🔍 Fetching course and active arrangement...');
    const course = await Course.findById(courseId);
    if (!course) {
      console.log('❌ Course not found');
      process.exit(1);
    }
    
    console.log(`📚 Course: ${course.title}`);
    console.log(`   Active Arrangement Version: ${course.activeArrangementVersion}`);
    console.log(`   Is Launched: ${course.isLaunched}`);
    
    // Get the active arrangement
    const arrangement = await ContentArrangement.findOne({
      course: courseId,
      version: course.activeArrangementVersion
    });
    
    if (!arrangement) {
      console.log('❌ Active arrangement not found');
      process.exit(1);
    }
    
    console.log(`\n📋 Active Arrangement (v${arrangement.version}):`);
    console.log(`   Status: ${arrangement.status}`);
    console.log(`   Total Items: ${arrangement.items.length}`);
    
    // Get first video in arrangement
    const videoItems = arrangement.items
      .filter(item => item.type === 'video')
      .sort((a, b) => a.order - b.order);
    
    console.log(`\n🎬 Videos in arrangement order:`);
    videoItems.forEach((item, idx) => {
      console.log(`   ${idx + 1}. ${item.contentId} (order: ${item.order})`);
    });
    
    const firstVideoId = videoItems.length > 0 ? videoItems[0].contentId.toString() : null;
    console.log(`\n🔓 First video to unlock: ${firstVideoId}`);
    
    // Find and update student progress
    console.log(`\n🔍 Finding student progress records for this course...`);
    const progressRecords = await StudentProgress.find({ 
      courseId: new mongoose.Types.ObjectId(courseId)
    }).populate('studentId', 'name email');
    
    console.log(`\n📊 Found ${progressRecords.length} student(s) in this course\n`);
    
    for (const progress of progressRecords) {
      const studentName = progress.studentId ? progress.studentId.name : 'Unknown';
      const studentEmail = progress.studentId ? progress.studentId.email : 'Unknown';
      
      console.log(`👤 Student: ${studentName} (${studentEmail})`);
      console.log(`   Current Arrangement Version: ${progress.arrangementVersion || 'Not set'}`);
      console.log(`   Currently Unlocked Videos: ${progress.unlockedVideos.length}`);
      
      if (progress.arrangementVersion === course.activeArrangementVersion) {
        console.log(`   ✅ Already on latest arrangement version\n`);
        continue;
      }
      
      console.log(`   🔄 Updating to arrangement v${course.activeArrangementVersion}...`);
      progress.arrangementVersion = course.activeArrangementVersion;
      
      // Unlock first video if not already unlocked
      if (firstVideoId && !progress.unlockedVideos.some(v => v.toString() === firstVideoId)) {
        console.log(`   🔓 Unlocking first video: ${firstVideoId}`);
        progress.unlockedVideos.push(new mongoose.Types.ObjectId(firstVideoId));
      }
      
      await progress.save();
      console.log(`   ✅ Updated successfully!\n`);
    }
    
    console.log('✅ All students updated to new arrangement version');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
  } finally {
    await mongoose.connection.close();
    console.log('\n✅ Done');
  }
}

updateStudentToNewArrangement();
