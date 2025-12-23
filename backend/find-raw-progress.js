require('dotenv').config();
const mongoose = require('mongoose');

async function findRaw() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/lms_db');
    console.log('✅ Connected to MongoDB');
    
    const db = mongoose.connection.db;
    const studentId = new mongoose.Types.ObjectId('6944ee7d2d55e94f73e76089');
    
    // Try different collection names
    const possibleCollections = ['studentprogresses', 'studentprogress', 'student_progress'];
    
    for (const collName of possibleCollections) {
      try {
        const coll = db.collection(collName);
        const count = await coll.countDocuments({ studentId });
        console.log(`\n📁 Collection: ${collName}`);
        console.log(`   Count for student: ${count}`);
        
        if (count > 0) {
          const docs = await coll.find({ studentId }).toArray();
          docs.forEach((doc, i) => {
            console.log(`\n   ${i + 1}. _id: ${doc._id}`);
            console.log(`      courseId: ${doc.courseId}`);
            console.log(`      sectionId: ${doc.sectionId || 'N/A'}`);
            console.log(`      unlockedVideos: ${doc.unlockedVideos?.length || 0}`);
            if (doc.unlockedVideos && doc.unlockedVideos.length > 0) {
              doc.unlockedVideos.forEach(v => console.log(`         - ${v}`));
            }
          });
        }
      } catch (e) {
        console.log(`   ❌ Collection not found or error: ${e.message}`);
      }
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await mongoose.connection.close();
    console.log('\n✅ Done');
  }
}

findRaw();
