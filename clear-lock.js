const mongoose = require("mongoose");
require("dotenv").config();

async function clearLock() {
  await mongoose.connect(process.env.MONGO_URI);
  
  const studentId = "692d142e897c8f144067ab4b";
  const unitId = "6929c86d17f292535e143afb"; // Unit 2
  
  const StudentProgress = require("./models/StudentProgress");
  const QuizLock = require("./models/QuizLock");
  
  // Find ALL StudentProgress entries for this student
  console.log("Looking for all StudentProgress entries...");
  const allProgress = await StudentProgress.find({ student: studentId });
  console.log("Total StudentProgress entries:", allProgress.length);
  
  for (const progress of allProgress) {
    console.log("\nCourse:", progress.course);
    console.log("Unit progress count:", progress.unitProgress ? progress.unitProgress.length : 0);
    
    if (progress.unitProgress && progress.unitProgress.length > 0) {
      for (const up of progress.unitProgress) {
        console.log("  Unit:", up.unitId);
        if (up.securityLock && up.securityLock.locked) {
          console.log("    ** SECURITY LOCK FOUND:", up.securityLock);
          up.securityLock.locked = false;
          console.log("    Cleared security lock");
        }
      }
      await progress.save();
    }
  }
  
  // Clear ALL QuizLocks for this student
  console.log("\n\nClearing all QuizLocks for student...");
  const allLocks = await QuizLock.find({ studentId });
  console.log("Total QuizLocks:", allLocks.length);
  
  for (const lock of allLocks) {
    console.log("  Quiz:", lock.quizId, "isLocked:", lock.isLocked, "reason:", lock.failureReason);
    if (lock.isLocked) {
      lock.isLocked = false;
      await lock.save();
      console.log("    Cleared!");
    }
  }
  
  console.log("\nDone!");
  await mongoose.disconnect();
}

clearLock().catch(console.error);
