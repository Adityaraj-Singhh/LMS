const mongoose = require('mongoose');

// MongoDB connection
const MONGODB_URI = 'mongodb://localhost:27017/lms_db';

// Models
const StudentProgress = mongoose.model('StudentProgress', new mongoose.Schema({}, { strict: false }), 'studentprogresses');
const Video = mongoose.model('Video', new mongoose.Schema({}, { strict: false }), 'videos');
const Unit = mongoose.model('Unit', new mongoose.Schema({}, { strict: false }), 'units');
const Course = mongoose.model('Course', new mongoose.Schema({}, { strict: false }), 'courses');
const ContentArrangement = mongoose.model('ContentArrangement', new mongoose.Schema({}, { strict: false }), 'contentarrangements');

const STUDENT_ID = '6944ee7d2d55e94f73e76089';
const COURSE_ID = '6944ee5e2d55e94f73e7603b';

async function unlockNextVideo() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    // Get student progress
    const progress = await StudentProgress.findOne({
      student: STUDENT_ID,
      course: COURSE_ID
    });

    if (!progress) {
      console.log('❌ No progress found for student');
      return;
    }

    console.log('📊 Current Progress:');
    console.log(`   Unlocked Videos: ${progress.unlockedVideos.length}`);
    progress.unlockedVideos.forEach((vid, idx) => {
      console.log(`      ${idx + 1}. ${vid}`);
    });
    console.log();

    // Get course and active arrangement
    const course = await Course.findById(COURSE_ID);
    console.log(`📚 Course: ${course.title}`);
    console.log(`   Active Arrangement Version: ${course.activeArrangementVersion}`);
    console.log(`   Is Launched: ${course.isLaunched}`);
    console.log();

    // Get active arrangement
    const arrangement = await ContentArrangement.findOne({
      course: COURSE_ID,
      version: course.activeArrangementVersion
    });

    if (!arrangement) {
      console.log('❌ No active arrangement found');
      return;
    }

    console.log(`📋 Active Arrangement (v${arrangement.version}):`);
    console.log(`   Status: ${arrangement.status}`);
    console.log(`   Total Items: ${arrangement.items.length}`);
    console.log();

    // Get all video items in arrangement order
    const videoItems = arrangement.items
      .filter(item => item.type === 'video')
      .sort((a, b) => a.order - b.order);

    console.log(`🎬 Videos in Arrangement Order:`);
    videoItems.forEach((item, idx) => {
      const isUnlocked = progress.unlockedVideos.map(v => v.toString()).includes(item.contentId.toString());
      console.log(`   ${idx + 1}. ${item.contentId} ${isUnlocked ? '✅ UNLOCKED' : '🔒 LOCKED'}`);
    });
    console.log();

    // Find first locked video
    const firstLockedVideo = videoItems.find(item =>
      !progress.unlockedVideos.map(v => v.toString()).includes(item.contentId.toString())
    );

    if (!firstLockedVideo) {
      console.log('✅ All videos are already unlocked!');
      return;
    }

    console.log(`🔓 Unlocking video: ${firstLockedVideo.contentId}`);

    // Get video details
    const video = await Video.findById(firstLockedVideo.contentId);
    if (video) {
      console.log(`   Title: ${video.title}`);
      console.log(`   Unit: ${video.unit || 'none'}`);
    }

    // Unlock the video
    progress.unlockedVideos.push(firstLockedVideo.contentId.toString());
    await progress.save();

    console.log(`\n✅ Video ${firstLockedVideo.contentId} unlocked successfully!`);
    console.log(`   Total unlocked videos: ${progress.unlockedVideos.length}`);

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
  } finally {
    await mongoose.connection.close();
    console.log('\n🔌 Disconnected from MongoDB');
  }
}

unlockNextVideo();
