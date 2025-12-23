require('dotenv').config();
const mongoose = require('mongoose');
const StudentProgress = require('./models/StudentProgress');
const ContentArrangement = require('./models/ContentArrangement');

async function unlockSecondVideo() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/lms_db');
    console.log('✅ Connected to MongoDB\n');
    
    const studentId = '6944ee7d2d55e94f73e76089';
    const courseId = '694617d3bb2f121113a903b5';
    
    console.log('🔍 Finding student progress...');
    const progress = await StudentProgress.findOne({
      student: new mongoose.Types.ObjectId(studentId),
      course: new mongoose.Types.ObjectId(courseId)
    });
    
    if (!progress) {
      console.log('❌ Progress not found');
      process.exit(1);
    }
    
    console.log(`✅ Found progress (Arrangement v${progress.arrangementVersion})\n`);
    
    // Get the arrangement
    const arrangement = await ContentArrangement.findOne({
      course: new mongoose.Types.ObjectId(courseId),
      version: progress.arrangementVersion
    });
    
    if (!arrangement) {
      console.log('❌ Arrangement not found');
      process.exit(1);
    }
    
    // Get all videos in order
    const videoItems = arrangement.items
      .filter(item => item.type === 'video')
      .sort((a, b) => a.order - b.order);
    
    console.log(`🎬 Videos in arrangement (${videoItems.length} total):`);
    videoItems.forEach((item, idx) => {
      const isUnlocked = progress.unlockedVideos.some(v => v.toString() === item.contentId.toString());
      console.log(`   ${idx + 1}. ${item.contentId} ${isUnlocked ? '✅ UNLOCKED' : '🔒 LOCKED'}`);
    });
    
    console.log(`\n📊 Current unlocked videos: ${progress.unlockedVideos.length}`);
    
    // Find first locked video
    const firstLocked = videoItems.find(item => 
      !progress.unlockedVideos.some(v => v.toString() === item.contentId.toString())
    );
    
    if (!firstLocked) {
      console.log('\n✅ All videos are already unlocked!');
      return;
    }
    
    console.log(`\n🔓 Unlocking: ${firstLocked.contentId}`);
    progress.unlockedVideos.push(new mongoose.Types.ObjectId(firstLocked.contentId));
    await progress.save();
    
    console.log(`✅ Video unlocked successfully!`);
    console.log(`\n📊 Now unlocked: ${progress.unlockedVideos.length} videos`);
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
  } finally {
    await mongoose.connection.close();
    console.log('\n✅ Done');
  }
}

unlockSecondVideo();
