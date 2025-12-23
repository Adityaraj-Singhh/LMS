const mongoose = require('mongoose');
const ContentArrangement = require('./models/ContentArrangement');
const ReadingMaterial = require('./models/ReadingMaterial');

mongoose.connect('mongodb://localhost:27017/lms_bunny')
  .then(async () => {
    const courseId = '694518259b786d83d5b9a2b9';
    const badMaterialId = '694518569b786d83d5b9a33e';
    
    console.log('Checking if material exists...');
    const material = await ReadingMaterial.findById(badMaterialId);
    console.log('Material exists:', !!material);
    
    console.log('\nFinding content arrangement...');
    const arrangement = await ContentArrangement.findOne({ course: courseId });
    
    if (!arrangement) {
      console.log('No arrangement found');
      process.exit(0);
    }
    
    console.log('Found arrangement, checking units...');
    let found = false;
    let cleaned = false;
    
    arrangement.units.forEach((unit, uIndex) => {
      unit.items.forEach((item, iIndex) => {
        if (item.item && item.item.toString() === badMaterialId) {
          console.log(`\nFound stale reference in unit ${uIndex}, item ${iIndex}`);
          console.log('Item type:', item.itemType);
          found = true;
          
          // Remove this item
          arrangement.units[uIndex].items.splice(iIndex, 1);
          cleaned = true;
        }
      });
    });
    
    if (!found) {
      console.log('Material reference not found in arrangement');
    } else if (cleaned) {
      console.log('\nSaving cleaned arrangement...');
      await arrangement.save();
      console.log('✅ Cleaned up stale material reference');
    }
    
    process.exit(0);
  })
  .catch(err => {
    console.error('Error:', err);
    process.exit(1);
  });
