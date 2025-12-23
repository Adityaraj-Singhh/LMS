const fs = require('fs');

// Fix groupChat.js
const groupChatPath = '/var/www/sgt-lms/backend/routes/groupChat.js';
let groupChatContent = fs.readFileSync(groupChatPath, 'utf8');

const groupChatValidation = `    const { courseId, sectionId } = req.params;
    const userId = req.user.id;

    // Validate ObjectId format
    const objectIdPattern = /^[0-9a-fA-F]{24}$/;
    if (!objectIdPattern.test(courseId)) {
      console.log('Invalid courseId format in checkChatAccess:', courseId);
      return res.status(400).json({ message: 'Invalid courseId format' });
    }
    if (!objectIdPattern.test(sectionId)) {
      console.log('Invalid sectionId format in checkChatAccess:', sectionId);
      return res.status(400).json({ message: 'Invalid sectionId format' });
    }`;

groupChatContent = groupChatContent.replace(
  /const \{ courseId, sectionId \} = req\.params;\s*const userId = req\.user\.id;/,
  groupChatValidation
);

fs.writeFileSync(groupChatPath, groupChatContent);
console.log('Fixed groupChat.js ObjectId validation');

// Fix courseController.js
const courseControllerPath = '/var/www/sgt-lms/backend/controllers/courseController.js';
let courseControllerContent = fs.readFileSync(courseControllerPath, 'utf8');

const courseValidation = `    const { courseId } = req.params;

    // Validate ObjectId format
    const objectIdPattern = /^[0-9a-fA-F]{24}$/;
    if (!objectIdPattern.test(courseId)) {
      console.log('Invalid courseId format in getCourseById:', courseId);
      return res.status(400).json({ message: 'Invalid courseId format' });
    }`;

courseControllerContent = courseControllerContent.replace(
  /const \{ courseId \} = req\.params;/,
  courseValidation
);

fs.writeFileSync(courseControllerPath, courseControllerContent);
console.log('Fixed courseController.js ObjectId validation');

// Fix sectionController.js
const sectionControllerPath = '/var/www/sgt-lms/backend/controllers/sectionController.js';
let sectionControllerContent = fs.readFileSync(sectionControllerPath, 'utf8');

const sectionValidation = `    const { id } = req.params;

    // Validate ObjectId format
    const objectIdPattern = /^[0-9a-fA-F]{24}$/;
    if (!objectIdPattern.test(id)) {
      console.log('Invalid sectionId format in getSectionById:', id);
      return res.status(400).json({ message: 'Invalid sectionId format' });
    }`;

sectionControllerContent = sectionControllerContent.replace(
  /const \{ id \} = req\.params;/,
  sectionValidation
);

fs.writeFileSync(sectionControllerPath, sectionControllerContent);
console.log('Fixed sectionController.js ObjectId validation');

console.log('All ObjectId validations added successfully!');