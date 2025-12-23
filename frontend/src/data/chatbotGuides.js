// LMS Navigation Chatbot Knowledge Base
// Maps user intents to step-by-step navigation paths

export const synonyms = {
  create: ['create', 'add', 'make', 'new', 'setup', 'set up', 'build'],
  course: ['course', 'courses', 'subject', 'subjects', 'class'],
  section: ['section', 'sections', 'batch', 'batches', 'group', 'groups', 'class'],
  teacher: ['teacher', 'teachers', 'instructor', 'instructors', 'faculty', 'staff'],
  student: ['student', 'students', 'learner', 'learners', 'pupil', 'pupils'],
  assign: ['assign', 'allocate', 'give', 'add', 'enroll', 'enrol', 'link', 'connect'],
  upload: ['upload', 'add', 'import', 'put', 'insert'],
  video: ['video', 'videos', 'lecture', 'lectures', 'recording', 'recordings'],
  document: ['document', 'documents', 'doc', 'docs', 'pdf', 'file', 'files', 'material', 'materials'],
  quiz: ['quiz', 'quizzes', 'test', 'tests', 'exam', 'exams', 'assessment'],
  unit: ['unit', 'units', 'module', 'modules', 'chapter', 'chapters', 'topic', 'topics'],
  school: ['school', 'schools', 'institute', 'institution'],
  department: ['department', 'departments', 'dept', 'depts'],
  dean: ['dean', 'deans'],
  hod: ['hod', 'hods', 'head of department', 'department head'],
  delete: ['delete', 'remove', 'erase', 'clear'],
  edit: ['edit', 'update', 'modify', 'change'],
  view: ['view', 'see', 'show', 'display', 'list', 'check', 'find'],
  unlock: ['unlock', 'open', 'release', 'enable'],
  progress: ['progress', 'completion', 'status', 'tracking'],
  certificate: ['certificate', 'certificates', 'cert', 'certs', 'credential'],
  announcement: ['announcement', 'announcements', 'notice', 'notices', 'news'],
  chat: ['chat', 'message', 'messages', 'communication'],
  analytics: ['analytics', 'reports', 'statistics', 'stats', 'dashboard', 'insights'],
  password: ['password', 'pwd', 'credentials', 'login'],
  bulk: ['bulk', 'mass', 'batch', 'multiple', 'csv', 'excel', 'import'],
  role: ['role', 'roles', 'permission', 'permissions', 'access'],
  start: ['start', 'begin', 'first step', 'first steps', 'first thing', 'kickoff', 'initial', 'getting started', 'onboard', 'setup'],
};

const gettingStartedTriggers = [
  'what should i do first',
  'what to do first',
  'where do i start',
  'how do i start',
  'getting started',
  'first step',
  'first steps',
  'initial setup',
  'what next',
  'what now',
  'start my work',
  'guide me',
  'help me start',
];

const pathRoleMap = [
  { matcher: /^\/admin\//, role: 'admin' },
  { matcher: /^\/dean\//, role: 'dean' },
  { matcher: /^\/hod\//, role: 'hod' },
  { matcher: /^\/teacher\//, role: 'teacher' },
  { matcher: /^\/student\//, role: 'student' },
];

const normalizeRole = (role = '') => {
  if (!role) return 'student';
  const value = role.toLowerCase();
  if (['admin', 'dean', 'hod', 'teacher', 'student'].includes(value)) {
    return value;
  }
  return 'student';
};

export const resolveRoleFromPath = (path = '', fallbackRole = 'student') => {
  if (typeof path !== 'string' || path.length === 0) {
    return normalizeRole(fallbackRole);
  }

  const match = pathRoleMap.find(({ matcher }) => matcher.test(path));
  if (match) {
    return match.role;
  }

  return normalizeRole(fallbackRole);
};

export const dashboardWorkflows = {
  admin: {
    title: 'Admin: Start Here',
    description: 'Use this checklist before working on advanced tasks. Follow the order so dependent features work correctly.',
    preChecks: [
      { icon: '🔍', label: 'Review existing schools', description: 'Go to Schools and confirm if any schools already exist.', path: '/admin/schools' },
      { icon: '📋', label: 'Confirm department coverage', description: 'Ensure each school has the right departments linked.', path: '/admin/departments' },
    ],
    primaryActions: [
      { icon: '🏫', label: 'Create or update schools', description: 'Every department, course, and user must belong to a school.', path: '/admin/schools' },
      { icon: '🏢', label: 'Create departments under schools', description: 'Departments cannot exist without a parent school.', path: '/admin/departments' },
      { icon: '🎓', label: 'Assign deans to schools', description: 'Each school should have a dean responsible for oversight.', path: '/admin/deans' },
      { icon: '👔', label: 'Assign HODs to departments', description: 'Departments need HODs to manage teachers and approvals.', path: '/admin/hods' },
      { icon: '👨‍🏫', label: 'Add teachers and set credentials', description: 'Teachers must exist before they can be assigned to sections.', path: '/admin/teachers' },
      { icon: '🧑‍🎓', label: 'Add students (individually or bulk)', description: 'Students must be linked to departments and sections.', path: '/admin/students' },
      { icon: '📚', label: 'Create courses for each department', description: 'Courses are the backbone for content, quizzes, and assignments.', path: '/admin/courses' },
      { icon: '👥', label: 'Build sections and assign teachers/students', description: 'Sections connect courses, teachers, and students together.', path: '/admin/sections' },
    ],
    followUps: [
      { icon: '🎬', label: 'Upload course videos and documents', description: 'Add content to each course unit for students to consume.', path: '/admin/courses' },
      { icon: '📝', label: 'Create quizzes and sequence unlocks', description: 'Ensure quizzes unlock only after prerequisite content.', path: '/admin/courses' },
      { icon: '🔐', label: 'Configure user roles & permissions', description: 'Review access levels in User Role Management.', path: '/admin/user-roles' },
      { icon: '📢', label: 'Send announcements or onboard messages', description: 'Let users know when new content or courses go live.', path: '/admin/announcements' },
      { icon: '📊', label: 'Monitor analytics and audit logs', description: 'Verify setup via dashboards and audit activity.', path: '/admin/analytics' },
    ],
    tips: [
      'Always create or verify schools before adding departments or users.',
      'Use the quiz unlock dashboard to override locks only after checking prerequisites.',
      'Bulk upload tools are faster but require validated data—download the template first.',
      'Keep communication flowing: send an announcement after major setup changes.',
    ],
  },
  dean: {
    title: 'Dean: First Things To Review',
    description: 'Focus on school-wide oversight: confirm structure, people assignments, and performance indicators.',
    preChecks: [
      { icon: '🏫', label: 'Review assigned schools', description: 'Check which schools you oversee and their status.', path: '/dean/dashboard' },
      { icon: '🧭', label: 'Check department coverage', description: 'Confirm every school has the right departments and HODs.', path: '/dean/departments' },
    ],
    primaryActions: [
      { icon: '👔', label: 'Meet with each HOD', description: 'Align on priorities, pending approvals, and timelines.', path: '/dean/departments' },
      { icon: '👨‍🏫', label: 'Review teacher distribution', description: 'Ensure teachers are assigned to the right sections.', path: '/dean/teachers' },
      { icon: '📚', label: 'Check course readiness', description: 'Verify courses have units, content, and assigned sections.', path: '/dean/dashboard' },
      { icon: '🎯', label: 'Inspect key analytics dashboards', description: 'Look at course, department, and section performance.', path: '/dean/analytics' },
    ],
    followUps: [
      { icon: '📢', label: 'Send school-wide announcements', description: 'Communicate goals or updates to teachers and students.', path: '/dean/announcements' },
      { icon: '📝', label: 'Monitor certificate eligibility', description: 'Check if students are completing courses on schedule.', path: '/dean/certificates' },
      { icon: '🔐', label: 'Handle escalated quiz unlocks', description: 'Assist HODs with exceptional unlock or reset cases.', path: '/dean/unlock-requests' },
    ],
    tips: [
      'Analytics dashboards highlight struggling departments—follow up with HODs promptly.',
      'Use announcement history to track previous communications.',
      'Keep an eye on certificate issuance rates to understand completion trends.',
    ],
  },
  hod: {
    title: 'HOD: Department Kick-off Plan',
    description: 'Get your department running smoothly by verifying people, content, and approvals.',
    preChecks: [
      { icon: '🏢', label: 'Review department profile', description: 'Confirm department info and linked school are accurate.', path: '/hod/dashboard' },
      { icon: '👨‍🏫', label: 'List assigned teachers', description: 'Ensure every course has at least one responsible teacher.', path: '/hod/teachers' },
    ],
    primaryActions: [
      { icon: '📚', label: 'Audit department courses', description: 'Check syllabus coverage, content readiness, and sequencing.', path: '/hod/courses' },
      { icon: '👥', label: 'Verify sections and enrollment', description: 'Confirm teachers and students are properly assigned.', path: '/hod/sections' },
      { icon: '✅', label: 'Approve pending content changes', description: 'Review uploads awaiting approval before go-live.', path: '/hod/content-approval' },
      { icon: '🎬', label: 'Process video unlock requests', description: 'Respond to student unlock tickets quickly to avoid delays.', path: '/hod/video-unlock-requests' },
    ],
    followUps: [
      { icon: '📝', label: 'Review quiz reports and unlocks', description: 'Check quiz health, pass rates, and manual unlock requests.', path: '/hod/quiz-management' },
      { icon: '🔓', label: 'Handle quiz unlock tickets', description: 'Resolve escalated quiz locks for students.', path: '/hod/quiz-unlock-requests' },
      { icon: '📢', label: 'Send department announcements', description: 'Share timelines, expectations, or policy updates.', path: '/hod/announcements' },
      { icon: '📊', label: 'Track department analytics', description: 'Monitor progress trends and intervene where needed.', path: '/hod/analytics' },
    ],
    tips: [
      'Keep approvals timely so teachers can publish content without bottlenecks.',
      'Use quiz unlock dashboards to spot recurring issues with prerequisites.',
      'Leverage analytics to identify courses needing extra faculty support.',
    ],
  },
  teacher: {
    title: 'Teacher: Getting Started Today',
    description: 'Focus on preparing your classes, content, and communication before the semester ramps up.',
    preChecks: [
      { icon: '📋', label: 'Review assigned courses and sections', description: 'Confirm your course list and section responsibilities.', path: '/teacher/dashboard' },
      { icon: '👥', label: 'Check enrolled students', description: 'Understand class sizes and student rosters early.', path: '/teacher/students' },
    ],
    primaryActions: [
      { icon: '📖', label: 'Outline units and modules', description: 'Ensure each course has a clear unit structure.', path: '/teacher/courses' },
      { icon: '🎬', label: 'Upload videos and documents', description: 'Add lecture videos and supporting resources.', path: '/teacher/videos' },
      { icon: '📝', label: 'Create or import quizzes', description: 'Set assessments with criteria for success.', path: '/teacher/quizzes' },
      { icon: '📢', label: 'Post a welcome announcement', description: 'Tell students how to start and what to expect.', path: '/teacher/announcements' },
    ],
    followUps: [
      { icon: '📊', label: 'Monitor student progress analytics', description: 'Identify students who need attention early on.', path: '/teacher/analytics' },
      { icon: '💬', label: 'Engage in chats and announcements', description: 'Respond to student questions to keep them on track.', path: '/teacher/chats' },
      { icon: '🆘', label: 'Handle quiz unlock requests', description: 'Review student unlock tickets or issues promptly.', path: '/teacher/unlock-requests' },
      { icon: '🎬', label: 'Review video unlock requests', description: 'Approve or reject video unlock requests quickly.', path: '/teacher/video-unlock-requests' },
    ],
    tips: [
      'Schedule content uploads ahead of time so sections unlock smoothly.',
      'Use quiz analytics to refine questions and grading.',
      'Consider recording quick intro videos for each unit to boost engagement.',
    ],
  },
  student: {
    title: 'Student: Start Learning',
    description: 'Make sure you understand your dashboard and how to progress through each course.',
    preChecks: [
      { icon: '🏠', label: 'Review your dashboard cards', description: 'Check your enrolled courses and upcoming activities.', path: '/student/dashboard' },
      { icon: '🕒', label: 'Note important deadlines', description: 'Look for due dates in announcements or course outlines.', path: '/student/dashboard' },
    ],
    primaryActions: [
      { icon: '📚', label: 'Open your first course', description: 'Enter the course with the nearest deadline or priority.', path: '/student/dashboard' },
      { icon: '🎬', label: 'Watch the first video or read the material', description: 'Content unlocks sequentially—finish one to open the next.', path: '/student/dashboard' },
      { icon: '📝', label: 'Complete the first quiz or checkpoint', description: 'Quizzes often unlock after content—attempt them as soon as they appear.', path: '/student/dashboard' },
    ],
    followUps: [
      { icon: '📈', label: 'Track your progress bars', description: 'Ensure each course is progressing steadily.', path: '/student/dashboard' },
      { icon: '💬', label: 'Ask questions in forums or chat', description: 'Use discussions to clear doubts quickly.', path: '/student/forums' },
      { icon: '🏆', label: 'Claim certificate after completion', description: 'Download certificates once course progress hits 100%.', path: '/student/dashboard' },
    ],
    tips: [
      'Stay on top of announcements—they contain critical updates and timelines.',
      'If a quiz stays locked, check if you missed a prerequisite video or document.',
      'Use secure quiz mode guidelines: don\'t switch tabs, and ensure stable internet.',
    ],
  },
};

const roleLabels = {
  admin: 'Admin',
  dean: 'Dean',
  hod: 'HOD',
  teacher: 'Teacher',
  student: 'Student',
};

const buildWorkflowPayload = (role = 'student') => {
  const normalizedRole = normalizeRole(role);
  const workflow = dashboardWorkflows[normalizedRole] || dashboardWorkflows.student;
  return {
    type: 'workflow',
    workflow: {
      role: normalizedRole,
      roleLabel: roleLabels[normalizedRole] || 'User',
      ...workflow,
    },
    suggestions: quickSuggestions[normalizedRole] || quickSuggestions.student,
  };
};

export const getWorkflowResponse = (role = 'student', { currentPath } = {}) => {
  const effectiveRole = resolveRoleFromPath(currentPath, role);
  return buildWorkflowPayload(effectiveRole);
};

const isGettingStartedQuery = (input = '') => {
  if (!input) return false;
  const normalized = input.toLowerCase();
  return gettingStartedTriggers.some(trigger => normalized.includes(trigger)) ||
    (/what|where|how/.test(normalized) && /first|start|begin/.test(normalized));
};

export const guides = {
  // ==================== COURSE MANAGEMENT ====================
  createCourse: {
    keywords: ['create course', 'add course', 'new course', 'make course', 'setup course'],
    title: '📚 Create a New Course',
    description: 'Let me guide you through creating a new course in the system.',
    roles: ['admin', 'teacher'],
    steps: [
      { label: 'Go to Courses', path: '/admin/courses', icon: '📚', description: 'Navigate to the Courses section' },
      { label: 'Click "Add Course"', action: 'button', icon: '➕', description: 'Click the Add Course button at the top' },
      { label: 'Fill Course Details', action: 'form', icon: '✏️', description: 'Enter course name, code, description, and select school/department' },
      { label: 'Save Course', action: 'button', icon: '💾', description: 'Click Save to create the course' },
    ],
    tips: ['Course codes should be unique', 'You can add units and content after creating the course'],
  },

  viewCourses: {
    keywords: ['view courses', 'see courses', 'list courses', 'show courses', 'all courses', 'my courses'],
    title: '📋 View All Courses',
    description: 'Here\'s how to view and manage existing courses.',
    roles: ['admin', 'teacher', 'dean', 'hod'],
    steps: [
      { label: 'Go to Courses', path: '/admin/courses', icon: '📚', description: 'Navigate to the Courses section' },
      { label: 'Browse or Search', action: 'info', icon: '🔍', description: 'Use the search bar or filters to find specific courses' },
    ],
  },

  addUnitToCourse: {
    keywords: ['add unit', 'create unit', 'new unit', 'add module', 'create module', 'add chapter'],
    title: '📖 Add Unit to Course',
    description: 'Let me show you how to add a unit/module to a course.',
    roles: ['admin', 'teacher'],
    steps: [
      { label: 'Go to Courses', path: '/admin/courses', icon: '📚', description: 'Navigate to the Courses section' },
      { label: 'Select Course', action: 'click', icon: '👆', description: 'Click on the course you want to add a unit to' },
      { label: 'Go to Units Tab', action: 'tab', icon: '📑', description: 'Click on the Units tab' },
      { label: 'Click "Add Unit"', action: 'button', icon: '➕', description: 'Click the Add Unit button' },
      { label: 'Enter Unit Details', action: 'form', icon: '✏️', description: 'Enter unit title, description, and order' },
      { label: 'Save Unit', action: 'button', icon: '💾', description: 'Click Save to create the unit' },
    ],
  },

  // ==================== CONTENT UPLOAD ====================
  uploadVideo: {
    keywords: ['upload video', 'add video', 'upload lecture', 'add lecture', 'upload recording'],
    title: '🎬 Upload Video to Course',
    description: 'Here\'s how to upload video content to a course unit.',
    roles: ['admin', 'teacher'],
    steps: [
      { label: 'Go to Courses', path: '/admin/courses', icon: '📚', description: 'Navigate to the Courses section' },
      { label: 'Select Course', action: 'click', icon: '👆', description: 'Click on the course' },
      { label: 'Select Unit', action: 'click', icon: '📖', description: 'Click on the unit where you want to add video' },
      { label: 'Click "Add Content"', action: 'button', icon: '➕', description: 'Click Add Content button' },
      { label: 'Select Video Type', action: 'select', icon: '🎬', description: 'Choose "Video" as content type' },
      { label: 'Upload or Paste URL', action: 'form', icon: '📤', description: 'Upload video file or paste YouTube/external URL' },
      { label: 'Save Content', action: 'button', icon: '💾', description: 'Click Save to add the video' },
    ],
    tips: ['Supported formats: MP4, WebM', 'You can also embed YouTube videos by pasting the URL'],
  },

  uploadDocument: {
    keywords: ['upload document', 'add document', 'upload pdf', 'add pdf', 'upload file', 'add material', 'upload notes'],
    title: '📄 Upload Document to Course',
    description: 'Here\'s how to upload documents/PDFs to a course unit.',
    roles: ['admin', 'teacher'],
    steps: [
      { label: 'Go to Courses', path: '/admin/courses', icon: '📚', description: 'Navigate to the Courses section' },
      { label: 'Select Course', action: 'click', icon: '👆', description: 'Click on the course' },
      { label: 'Select Unit', action: 'click', icon: '📖', description: 'Click on the unit where you want to add document' },
      { label: 'Click "Add Content"', action: 'button', icon: '➕', description: 'Click Add Content button' },
      { label: 'Select Document Type', action: 'select', icon: '📄', description: 'Choose "Document" as content type' },
      { label: 'Upload File', action: 'form', icon: '📤', description: 'Upload your PDF or document file' },
      { label: 'Save Content', action: 'button', icon: '💾', description: 'Click Save to add the document' },
    ],
    tips: ['Supported formats: PDF, DOC, DOCX, PPT, PPTX'],
  },

  createQuiz: {
    keywords: ['create quiz', 'add quiz', 'make quiz', 'new quiz', 'add test', 'create test', 'add exam'],
    title: '📝 Create Quiz/Test',
    description: 'Let me guide you through creating a quiz for a course unit.',
    roles: ['admin', 'teacher'],
    steps: [
      { label: 'Go to Courses', path: '/admin/courses', icon: '📚', description: 'Navigate to the Courses section' },
      { label: 'Select Course', action: 'click', icon: '👆', description: 'Click on the course' },
      { label: 'Select Unit', action: 'click', icon: '📖', description: 'Click on the unit where you want to add quiz' },
      { label: 'Click "Add Quiz"', action: 'button', icon: '➕', description: 'Click Add Quiz button' },
      { label: 'Enter Quiz Details', action: 'form', icon: '✏️', description: 'Set title, time limit, passing score, and attempts allowed' },
      { label: 'Add Questions', action: 'form', icon: '❓', description: 'Add multiple choice, true/false, or other question types' },
      { label: 'Save Quiz', action: 'button', icon: '💾', description: 'Click Save to create the quiz' },
    ],
    tips: ['Set a reasonable time limit', 'Mix question types for better assessment', 'Preview quiz before publishing'],
  },

  // ==================== SECTION MANAGEMENT ====================
  createSection: {
    keywords: ['create section', 'add section', 'new section', 'make section', 'create batch', 'add batch', 'create group'],
    title: '👥 Create a New Section',
    description: 'Here\'s how to create a new section/batch for organizing students.',
    roles: ['admin'],
    steps: [
      { label: 'Go to Sections', path: '/admin/sections', icon: '👥', description: 'Navigate to the Sections page' },
      { label: 'Click "Create Section"', action: 'button', icon: '➕', description: 'Click the Create Section button' },
      { label: 'Select School & Department', action: 'form', icon: '🏫', description: 'Choose the school and department' },
      { label: 'Enter Section Details', action: 'form', icon: '✏️', description: 'Enter section name, semester, year, and capacity' },
      { label: 'Save Section', action: 'button', icon: '💾', description: 'Click Create to save the section' },
    ],
  },

  assignCourseToSection: {
    keywords: ['assign course section', 'add course section', 'link course section', 'course to section', 'section course'],
    title: '🔗 Assign Course to Section',
    description: 'Let me show you how to assign a course to a section.',
    roles: ['admin'],
    steps: [
      { label: 'Go to Sections', path: '/admin/sections', icon: '👥', description: 'Navigate to the Sections page' },
      { label: 'Find Your Section', action: 'search', icon: '🔍', description: 'Locate the section you want to assign courses to' },
      { label: 'Click Section Card', action: 'click', icon: '👆', description: 'Click on the section to open details' },
      { label: 'Go to Courses Tab', action: 'tab', icon: '📚', description: 'Click on the Courses tab' },
      { label: 'Click "Assign Course"', action: 'button', icon: '➕', description: 'Click the Assign Course button' },
      { label: 'Select Course', action: 'select', icon: '📋', description: 'Choose the course from the dropdown' },
      { label: 'Confirm Assignment', action: 'button', icon: '✅', description: 'Click Assign to complete' },
    ],
  },

  assignTeacherToSection: {
    keywords: ['assign teacher section', 'add teacher section', 'teacher to section', 'section teacher', 'assign instructor'],
    title: '👨‍🏫 Assign Teacher to Section Course',
    description: 'Here\'s how to assign a teacher to teach a course in a section.',
    roles: ['admin'],
    steps: [
      { label: 'Go to Sections', path: '/admin/sections', icon: '👥', description: 'Navigate to the Sections page' },
      { label: 'Find Your Section', action: 'search', icon: '🔍', description: 'Locate the section' },
      { label: 'Click Section Card', action: 'click', icon: '👆', description: 'Click on the section to open details' },
      { label: 'Go to Courses Tab', action: 'tab', icon: '📚', description: 'Click on the Courses tab' },
      { label: 'Find the Course', action: 'search', icon: '🔍', description: 'Locate the course you want to assign teacher to' },
      { label: 'Click "Assign Teacher"', action: 'button', icon: '👨‍🏫', description: 'Click the Assign Teacher button next to the course' },
      { label: 'Select Teacher', action: 'select', icon: '📋', description: 'Choose the teacher from the dropdown' },
      { label: 'Confirm Assignment', action: 'button', icon: '✅', description: 'Click Assign to complete' },
    ],
  },

  assignStudentsToSection: {
    keywords: ['assign student section', 'add student section', 'enroll student', 'student to section', 'section student'],
    title: '🎓 Add Students to Section',
    description: 'Here\'s how to add students to a section.',
    roles: ['admin'],
    steps: [
      { label: 'Go to Sections', path: '/admin/sections', icon: '👥', description: 'Navigate to the Sections page' },
      { label: 'Find Your Section', action: 'search', icon: '🔍', description: 'Locate the section' },
      { label: 'Click Section Card', action: 'click', icon: '👆', description: 'Click on the section to open details' },
      { label: 'Go to Students Tab', action: 'tab', icon: '🎓', description: 'Click on the Students tab' },
      { label: 'Click "Add Students"', action: 'button', icon: '➕', description: 'Click the Add Students button' },
      { label: 'Select Students', action: 'select', icon: '☑️', description: 'Check the students you want to add' },
      { label: 'Confirm Addition', action: 'button', icon: '✅', description: 'Click Add to complete' },
    ],
  },

  // ==================== USER MANAGEMENT ====================
  createTeacher: {
    keywords: ['create teacher', 'add teacher', 'new teacher', 'register teacher', 'add instructor', 'add faculty'],
    title: '👨‍🏫 Add New Teacher',
    description: 'Here\'s how to add a new teacher to the system.',
    roles: ['admin'],
    steps: [
      { label: 'Go to Teachers', path: '/admin/teachers', icon: '👨‍🏫', description: 'Navigate to Teacher Management' },
      { label: 'Click "Add Teacher"', action: 'button', icon: '➕', description: 'Click the Add Teacher button' },
      { label: 'Enter Teacher Details', action: 'form', icon: '✏️', description: 'Fill in name, email, and other details' },
      { label: 'Set Password', action: 'form', icon: '🔐', description: 'Set initial password for the teacher' },
      { label: 'Save Teacher', action: 'button', icon: '💾', description: 'Click Add to create the teacher account' },
    ],
    tips: ['Teacher will receive login credentials via email', 'You can bulk upload teachers using CSV'],
  },

  createStudent: {
    keywords: ['create student', 'add student', 'new student', 'register student', 'enroll student'],
    title: '🎓 Add New Student',
    description: 'Here\'s how to add a new student to the system.',
    roles: ['admin'],
    steps: [
      { label: 'Go to Students', path: '/admin/students', icon: '🎓', description: 'Navigate to Student Management' },
      { label: 'Click "Create Student" Tab', action: 'tab', icon: '➕', description: 'Click on Create Student tab' },
      { label: 'Enter Student Details', action: 'form', icon: '✏️', description: 'Fill in name, email, registration number, school' },
      { label: 'Save Student', action: 'button', icon: '💾', description: 'Click Create to add the student' },
    ],
    tips: ['Registration number must be unique', 'You can bulk upload students using CSV in Bulk Upload tab'],
  },

  bulkUploadStudents: {
    keywords: ['bulk upload students', 'import students', 'csv students', 'mass add students', 'multiple students'],
    title: '📤 Bulk Upload Students',
    description: 'Here\'s how to upload multiple students at once using CSV.',
    roles: ['admin'],
    steps: [
      { label: 'Go to Students', path: '/admin/students', icon: '🎓', description: 'Navigate to Student Management' },
      { label: 'Click "Bulk Upload" Tab', action: 'tab', icon: '📤', description: 'Click on Bulk Upload tab' },
      { label: 'Download Template', action: 'button', icon: '📥', description: 'Download the CSV template first' },
      { label: 'Fill CSV File', action: 'info', icon: '📝', description: 'Fill in student details in the CSV file' },
      { label: 'Upload CSV', action: 'button', icon: '📤', description: 'Click Choose File and select your CSV' },
      { label: 'Click Upload', action: 'button', icon: '✅', description: 'Click Upload to import students' },
    ],
  },

  createDean: {
    keywords: ['create dean', 'add dean', 'new dean', 'assign dean'],
    title: '🎓 Add New Dean',
    description: 'Here\'s how to add a dean and assign them to a school.',
    roles: ['admin'],
    steps: [
      { label: 'Go to Deans', path: '/admin/deans', icon: '🎓', description: 'Navigate to Dean Management' },
      { label: 'Click "Add Dean"', action: 'button', icon: '➕', description: 'Click the Add Dean button' },
      { label: 'Enter Dean Details', action: 'form', icon: '✏️', description: 'Fill in name, email, and password' },
      { label: 'Select School', action: 'select', icon: '🏫', description: 'Assign the dean to a school' },
      { label: 'Save Dean', action: 'button', icon: '💾', description: 'Click Add to create the dean' },
    ],
  },

  createHOD: {
    keywords: ['create hod', 'add hod', 'new hod', 'assign hod', 'head of department'],
    title: '👔 Add New HOD',
    description: 'Here\'s how to add an HOD and assign them to a department.',
    roles: ['admin'],
    steps: [
      { label: 'Go to HODs', path: '/admin/hods', icon: '👔', description: 'Navigate to HOD Management' },
      { label: 'Click "Add HOD"', action: 'button', icon: '➕', description: 'Click the Add HOD button' },
      { label: 'Enter HOD Details', action: 'form', icon: '✏️', description: 'Fill in name, email, and password' },
      { label: 'Select Department', action: 'select', icon: '🏢', description: 'Assign the HOD to a department' },
      { label: 'Save HOD', action: 'button', icon: '💾', description: 'Click Add to create the HOD' },
    ],
  },

  // ==================== SCHOOL & DEPARTMENT ====================
  createSchool: {
    keywords: ['create school', 'add school', 'new school', 'setup school'],
    title: '🏫 Create New School',
    description: 'Here\'s how to create a new school in the system.',
    roles: ['admin'],
    steps: [
      { label: 'Go to Schools', path: '/admin/schools', icon: '🏫', description: 'Navigate to Schools page' },
      { label: 'Click "Add School"', action: 'button', icon: '➕', description: 'Click the Add School button' },
      { label: 'Enter School Name', action: 'form', icon: '✏️', description: 'Enter the school name and code' },
      { label: 'Save School', action: 'button', icon: '💾', description: 'Click Save to create the school' },
    ],
  },

  createDepartment: {
    keywords: ['create department', 'add department', 'new department', 'setup department'],
    title: '🏢 Create New Department',
    description: 'Here\'s how to create a new department under a school.',
    roles: ['admin'],
    steps: [
      { label: 'Go to Departments', path: '/admin/departments', icon: '🏢', description: 'Navigate to Departments page' },
      { label: 'Click "Add Department"', action: 'button', icon: '➕', description: 'Click the Add Department button' },
      { label: 'Select School', action: 'select', icon: '🏫', description: 'Choose the parent school' },
      { label: 'Enter Department Name', action: 'form', icon: '✏️', description: 'Enter department name and code' },
      { label: 'Save Department', action: 'button', icon: '💾', description: 'Click Save to create the department' },
    ],
  },

  // ==================== QUIZ UNLOCK ====================
  unlockQuiz: {
    keywords: ['unlock quiz', 'unlock test', 'quiz locked', 'student locked', 'unlock student quiz', 'quiz unlock'],
    title: '🔓 Unlock Student Quiz',
    description: 'Here\'s how to unlock a quiz for a student who is locked out.',
    roles: ['admin', 'teacher', 'hod', 'dean'],
    steps: [
      { label: 'Go to Quiz Unlock', path: '/admin/quiz-unlock-dashboard', icon: '🔓', description: 'Navigate to Quiz Unlock Dashboard' },
      { label: 'Find the Student', action: 'search', icon: '🔍', description: 'Search for the student by name or reg number' },
      { label: 'Review Lock Reason', action: 'info', icon: '📋', description: 'Check why the quiz was locked' },
      { label: 'Click "Unlock"', action: 'button', icon: '🔓', description: 'Click the Unlock button' },
      { label: 'Add Note (Optional)', action: 'form', icon: '📝', description: 'Add a reason for unlocking' },
      { label: 'Confirm Unlock', action: 'button', icon: '✅', description: 'Confirm to unlock the quiz' },
    ],
  },

  // ==================== ANNOUNCEMENTS ====================
  createAnnouncement: {
    keywords: ['create announcement', 'add announcement', 'new announcement', 'post announcement', 'send notice'],
    title: '📢 Create Announcement',
    description: 'Here\'s how to create and send an announcement.',
    roles: ['admin', 'teacher', 'dean', 'hod'],
    steps: [
      { label: 'Go to Announcements', path: '/admin/announcements', icon: '📢', description: 'Navigate to Announcements' },
      { label: 'Click "New Announcement"', action: 'button', icon: '➕', description: 'Click to create new announcement' },
      { label: 'Enter Title & Content', action: 'form', icon: '✏️', description: 'Write your announcement title and message' },
      { label: 'Select Audience', action: 'select', icon: '👥', description: 'Choose who should see this (all, specific courses, sections)' },
      { label: 'Publish', action: 'button', icon: '📤', description: 'Click Publish to send the announcement' },
    ],
  },

  // ==================== ANALYTICS ====================
  viewAnalytics: {
    keywords: ['view analytics', 'see analytics', 'reports', 'statistics', 'dashboard', 'insights', 'performance'],
    title: '📊 View Analytics Dashboard',
    description: 'Here\'s how to access analytics and reports.',
    roles: ['admin', 'dean', 'hod'],
    steps: [
      { label: 'Go to Analytics', path: '/admin/analytics', icon: '📊', description: 'Navigate to Analytics Dashboard' },
      { label: 'Select Report Type', action: 'tab', icon: '📈', description: 'Choose the type of report you want to view' },
      { label: 'Apply Filters', action: 'form', icon: '🔍', description: 'Filter by date range, school, department, or course' },
      { label: 'View/Export Data', action: 'info', icon: '📥', description: 'View charts or export data as needed' },
    ],
  },

  // ==================== USER ROLES ====================
  manageUserRoles: {
    keywords: ['user roles', 'manage roles', 'change role', 'assign role', 'permissions', 'access control'],
    title: '🔐 Manage User Roles',
    description: 'Here\'s how to view and manage user roles and permissions.',
    roles: ['admin'],
    steps: [
      { label: 'Go to User Roles', path: '/admin/user-roles', icon: '🔐', description: 'Navigate to User Role Management' },
      { label: 'Find User', action: 'search', icon: '🔍', description: 'Search for the user by name or email' },
      { label: 'Click Edit', action: 'button', icon: '✏️', description: 'Click the edit icon next to the user' },
      { label: 'Modify Roles', action: 'select', icon: '☑️', description: 'Add or remove roles as needed' },
      { label: 'Save Changes', action: 'button', icon: '💾', description: 'Click Save to update the user roles' },
    ],
  },

  // ==================== STUDENT GUIDES ====================
  studentViewCourses: {
    keywords: ['my courses', 'enrolled courses', 'view my courses', 'student courses'],
    title: '📚 View Your Enrolled Courses',
    description: 'Here\'s how to see your enrolled courses.',
    roles: ['student'],
    steps: [
      { label: 'Go to Dashboard', path: '/student/dashboard', icon: '🏠', description: 'Go to your Student Dashboard' },
      { label: 'View Course Cards', action: 'info', icon: '📚', description: 'Your enrolled courses are shown on the dashboard' },
      { label: 'Click to Open', action: 'click', icon: '👆', description: 'Click any course to start learning' },
    ],
  },

  studentStartLearning: {
    keywords: ['start course', 'begin course', 'watch video', 'start learning', 'open course', 'study'],
    title: '▶️ Start Learning a Course',
    description: 'Here\'s how to start learning a course.',
    roles: ['student'],
    steps: [
      { label: 'Go to Dashboard', path: '/student/dashboard', icon: '🏠', description: 'Go to your Student Dashboard' },
      { label: 'Select Course', action: 'click', icon: '📚', description: 'Click on the course you want to study' },
      { label: 'Select Unit', action: 'click', icon: '📖', description: 'Click on a unit to see its content' },
      { label: 'Start Content', action: 'click', icon: '▶️', description: 'Click on video/document to start learning' },
      { label: 'Complete & Continue', action: 'info', icon: '✅', description: 'Complete content to unlock the next item' },
    ],
  },

  studentTakeQuiz: {
    keywords: ['take quiz', 'attempt quiz', 'start quiz', 'do test', 'exam'],
    title: '📝 Take a Quiz',
    description: 'Here\'s how to attempt a quiz in your course.',
    roles: ['student'],
    steps: [
      { label: 'Open Course', action: 'click', icon: '📚', description: 'Open your course' },
      { label: 'Go to Unit with Quiz', action: 'click', icon: '📖', description: 'Navigate to the unit containing the quiz' },
      { label: 'Complete Prerequisites', action: 'info', icon: '⚠️', description: 'Complete all videos/documents first' },
      { label: 'Click on Quiz', action: 'click', icon: '📝', description: 'Click on the quiz to start' },
      { label: 'Answer Questions', action: 'form', icon: '✏️', description: 'Answer all questions within the time limit' },
      { label: 'Submit Quiz', action: 'button', icon: '✅', description: 'Click Submit when done' },
    ],
    tips: ['Make sure you have stable internet', 'Don\'t switch tabs during the quiz', 'Time limit is strictly enforced'],
  },

  studentViewProgress: {
    keywords: ['my progress', 'course progress', 'completion status', 'how much completed'],
    title: '📈 View Your Progress',
    description: 'Here\'s how to check your course progress.',
    roles: ['student'],
    steps: [
      { label: 'Go to Dashboard', path: '/student/dashboard', icon: '🏠', description: 'Go to your Student Dashboard' },
      { label: 'View Progress Bars', action: 'info', icon: '📊', description: 'Each course shows a progress percentage' },
      { label: 'Open Course for Details', action: 'click', icon: '📚', description: 'Click a course to see detailed unit-wise progress' },
    ],
  },

  studentGetCertificate: {
    keywords: ['get certificate', 'download certificate', 'course certificate', 'completion certificate'],
    title: '🏆 Get Course Certificate',
    description: 'Here\'s how to get your course completion certificate.',
    roles: ['student'],
    steps: [
      { label: 'Complete All Content', action: 'info', icon: '✅', description: 'First, complete all units and quizzes in the course' },
      { label: 'Go to Course', action: 'click', icon: '📚', description: 'Open the completed course' },
      { label: 'Click Certificate Tab', action: 'tab', icon: '🏆', description: 'Click on the Certificate tab' },
      { label: 'Download Certificate', action: 'button', icon: '📥', description: 'Click Download to get your certificate' },
    ],
    tips: ['Certificate is only available after 100% course completion', 'All quizzes must be passed'],
  },

  // ==================== TEACHER GUIDES ====================
  teacherViewStudents: {
    keywords: ['my students', 'view students', 'student list', 'class students'],
    title: '👥 View Your Students',
    description: 'Here\'s how to see students in your assigned sections.',
    roles: ['teacher'],
    steps: [
      { label: 'Go to Dashboard', path: '/teacher/dashboard', icon: '🏠', description: 'Go to your Teacher Dashboard' },
      { label: 'View Assigned Sections', action: 'info', icon: '👥', description: 'See your assigned sections and courses' },
      { label: 'Click Section', action: 'click', icon: '👆', description: 'Click on a section to see enrolled students' },
    ],
  },

  teacherViewProgress: {
    keywords: ['student progress', 'class progress', 'track students', 'monitor progress'],
    title: '📊 Track Student Progress',
    description: 'Here\'s how to monitor your students\' progress.',
    roles: ['teacher'],
    steps: [
      { label: 'Go to Dashboard', path: '/teacher/dashboard', icon: '🏠', description: 'Go to your Teacher Dashboard' },
      { label: 'Select Course', action: 'click', icon: '📚', description: 'Click on one of your assigned courses' },
      { label: 'View Progress Tab', action: 'tab', icon: '📊', description: 'Click on Student Progress tab' },
      { label: 'Review Individual Progress', action: 'info', icon: '👤', description: 'See each student\'s completion status' },
    ],
  },
};

// Greeting responses
export const greetings = {
  triggers: ['hi', 'hello', 'hey', 'help', 'assist', 'support', 'guide'],
  responses: [
    "Hello! 👋 I'm your LMS assistant. How can I help you today?",
    "Hi there! 👋 I'm here to guide you through the LMS. What would you like to do?",
    "Hey! 👋 Need help navigating the system? Just ask me anything!",
  ],
};

// Fallback responses
export const fallbacks = [
  "I'm not sure I understand. Could you try rephrasing that? You can ask me about creating courses, managing sections, uploading content, or any other LMS task.",
  "Hmm, I couldn't find a guide for that. Try asking about: courses, sections, teachers, students, quizzes, or uploads.",
  "I didn't quite catch that. Here are some things I can help with: creating courses, assigning teachers, uploading videos, managing sections, and more!",
];

// Quick suggestions by role
export const quickSuggestions = {
  admin: [
    { label: '🧭 What should I do first?', intent: 'roleFirstSteps' },
    { label: '📚 Create Course', intent: 'createCourse' },
    { label: '👥 Create Section', intent: 'createSection' },
    { label: '🔗 Assign Course to Section', intent: 'assignCourseToSection' },
    { label: '👨‍🏫 Add Teacher', intent: 'createTeacher' },
    { label: '🎓 Add Student', intent: 'createStudent' },
    { label: '📤 Bulk Upload Students', intent: 'bulkUploadStudents' },
  ],
  teacher: [
    { label: '🧭 What should I do first?', intent: 'roleFirstSteps' },
    { label: '🎬 Upload Video', intent: 'uploadVideo' },
    { label: '📄 Upload Document', intent: 'uploadDocument' },
    { label: '📝 Create Quiz', intent: 'createQuiz' },
    { label: '📖 Add Unit', intent: 'addUnitToCourse' },
    { label: '📊 View Student Progress', intent: 'teacherViewProgress' },
  ],
  student: [
    { label: '🧭 What should I do first?', intent: 'roleFirstSteps' },
    { label: '📚 View My Courses', intent: 'studentViewCourses' },
    { label: '▶️ Start Learning', intent: 'studentStartLearning' },
    { label: '📝 Take Quiz', intent: 'studentTakeQuiz' },
    { label: '📈 Check Progress', intent: 'studentViewProgress' },
    { label: '🏆 Get Certificate', intent: 'studentGetCertificate' },
  ],
  dean: [
    { label: '🧭 What should I do first?', intent: 'roleFirstSteps' },
    { label: '📊 View Analytics', intent: 'viewAnalytics' },
    { label: '📚 View Courses', intent: 'viewCourses' },
    { label: '🔓 Unlock Quiz', intent: 'unlockQuiz' },
  ],
  hod: [
    { label: '🧭 What should I do first?', intent: 'roleFirstSteps' },
    { label: '📊 View Analytics', intent: 'viewAnalytics' },
    { label: '📚 View Courses', intent: 'viewCourses' },
    { label: '🔓 Unlock Quiz', intent: 'unlockQuiz' },
  ],
};

// Function to find matching guide
export const findMatchingGuide = (input, userRole = 'student', options = {}) => {
  const normalizedInput = input.toLowerCase().trim();
  const effectiveRole = resolveRoleFromPath(options.currentPath, userRole);
  
  // Check for greetings first
  if (greetings.triggers.some(trigger => normalizedInput.includes(trigger)) && normalizedInput.length < 20) {
    return {
      type: 'greeting',
      message: greetings.responses[Math.floor(Math.random() * greetings.responses.length)],
      suggestions: quickSuggestions[effectiveRole] || quickSuggestions.student,
    };
  }

  if (isGettingStartedQuery(normalizedInput)) {
    return buildWorkflowPayload(effectiveRole);
  }
  
  let bestMatch = null;
  let bestScore = 0;
  
  // Score each guide
  Object.entries(guides).forEach(([key, guide]) => {
    // Check if guide is available for user's role
    if (guide.roles && !guide.roles.includes(effectiveRole) && effectiveRole !== 'admin') {
      return;
    }
    
    let score = 0;
    
    // Check direct keyword matches
    guide.keywords.forEach(keyword => {
      if (normalizedInput.includes(keyword)) {
        score += 10;
      }
      // Partial word matching
      const words = keyword.split(' ');
      words.forEach(word => {
        if (normalizedInput.includes(word) && word.length > 2) {
          score += 2;
        }
      });
    });
    
    // Check synonym matches
    Object.entries(synonyms).forEach(([concept, syns]) => {
      syns.forEach(syn => {
        if (normalizedInput.includes(syn)) {
          // Check if this concept is relevant to this guide
          const guideText = guide.title.toLowerCase() + ' ' + guide.description.toLowerCase();
          if (guideText.includes(concept) || guide.keywords.some(k => k.includes(concept))) {
            score += 3;
          }
        }
      });
    });
    
    if (score > bestScore) {
      bestScore = score;
      bestMatch = { key, ...guide };
    }
  });
  
  if (bestMatch && bestScore >= 5) {
    return {
      type: 'guide',
      guide: bestMatch,
    };
  }
  
  // Return fallback
  return {
    type: 'fallback',
    message: fallbacks[Math.floor(Math.random() * fallbacks.length)],
    suggestions: quickSuggestions[effectiveRole] || quickSuggestions.student,
  };
};
