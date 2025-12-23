const Certificate = require('../models/Certificate');
const Course = require('../models/Course');
const Section = require('../models/Section');
const User = require('../models/User');
const Department = require('../models/Department');
const School = require('../models/School');
const Quiz = require('../models/Quiz');
const QuizAttempt = require('../models/QuizAttempt');
const StudentProgress = require('../models/StudentProgress');
const PDFDocument = require('pdfkit');
const QRCode = require('qrcode');
const fs = require('fs');
const path = require('path');

// S3 and AWS removed - certificates stored locally

// Helper function to load image from URL or local path
async function loadImageBuffer(imageUrl) {
  if (!imageUrl) return null;
  
  try {
    // Check if it's a URL (fetch from remote server)
    if (imageUrl.startsWith('http://') || imageUrl.startsWith('https://')) {
      console.log(`   Fetching image from URL: ${imageUrl}`);
      const axios = require('axios');
      const response = await axios.get(imageUrl, { responseType: 'arraybuffer' });
      console.log(`   ✓ Successfully loaded image (${response.data.length} bytes)`);
      return Buffer.from(response.data);
    } else {
      // Local file path
      const localPath = path.join(__dirname, '..', imageUrl);
      if (fs.existsSync(localPath)) {
        console.log(`   Loading local image: ${localPath}`);
        return fs.readFileSync(localPath);
      }
    }
  } catch (error) {
    console.error(`   Error loading image from ${imageUrl}:`, error.message);
  }
  return null;
}

// HOD: Upload signature for department
exports.uploadSignature = async (req, res) => {
  try {
    const userId = req.user.id;
    const signatureType = req.body.signatureType || 'hod'; // 'hod' or 'registrar'
    
    console.log('[uploadSignature] User ID:', userId);
    console.log('[uploadSignature] Signature Type:', signatureType);
    console.log('[uploadSignature] File:', req.file);
    console.log('[uploadSignature] Body:', req.body);
    
    if (!req.file) {
      return res.status(400).json({ message: 'No signature file uploaded' });
    }

    // Update user's signature URL based on type
    // When using S3, req.file.location contains the full S3 URL
    const signatureUrl = req.file.location || `/uploads/signatures/${req.file.filename}`;
    const updateField = signatureType === 'registrar' ? 'registrarSignatureUrl' : 'signatureUrl';
    
    console.log('[uploadSignature] Update Field:', updateField);
    console.log('[uploadSignature] Signature URL:', signatureUrl);
    
    const updateResult = await User.findByIdAndUpdate(
      userId, 
      { [updateField]: signatureUrl },
      { new: true }
    );
    
    console.log('[uploadSignature] Updated User:', updateResult?.email, updateResult?.signatureUrl, updateResult?.registrarSignatureUrl);

    const responseData = { 
      message: `${signatureType === 'registrar' ? 'Sub-Register (Exam)' : 'HOD'} signature uploaded successfully`
    };
    
    if (signatureType === 'registrar') {
      responseData.registrarSignatureUrl = signatureUrl;
      responseData.hasRegistrarSignature = true;
    } else {
      responseData.signatureUrl = signatureUrl;
      responseData.hasSignature = true;
    }

    console.log('[uploadSignature] Response Data:', responseData);
    res.json(responseData);
  } catch (error) {
    console.error('Upload signature error:', error);
    res.status(500).json({ message: error.message });
  }
};

// HOD: Get signature status
exports.getSignatureStatus = async (req, res) => {
  try {
    const userId = req.user.id;
    const user = await User.findById(userId).select('signatureUrl registrarSignatureUrl');
    
    // Return signature URLs directly (no S3 signing needed)
    const signedHodUrl = user.signatureUrl;
    const signedRegistrarUrl = user.registrarSignatureUrl;
    
    res.json({ 
      hasSignature: !!user.signatureUrl,
      signatureUrl: signedHodUrl,
      hasRegistrarSignature: !!user.registrarSignatureUrl,
      registrarSignatureUrl: signedRegistrarUrl
    });
  } catch (error) {
    console.error('Get signature status error:', error);
    res.status(500).json({ message: error.message });
  }
};

// HOD: Activate certificates for a course-section
exports.activateCertificates = async (req, res) => {
  try {
    const { courseId, sectionId } = req.body;
    const hodId = req.user.id;

    // Verify HOD has permission for this course
    const course = await Course.findById(courseId)
      .populate('school')
      .populate('department');
    
    if (!course) {
      return res.status(404).json({ message: 'Course not found' });
    }

    const hod = await User.findById(hodId).populate('department');
    
    // Check if HOD belongs to the course's department
    if (course.department.toString() !== hod.department.toString()) {
      return res.status(403).json({ 
        message: 'You do not have permission to activate certificates for this course' 
      });
    }

    // Check if HOD has uploaded both signatures
    if (!hod.signatureUrl) {
      return res.status(400).json({ 
        message: 'Please upload your HOD digital signature before activating certificates' 
      });
    }

    if (!hod.registrarSignatureUrl) {
      return res.status(400).json({ 
        message: 'Please upload the Sub-Register (Exam) signature before activating certificates' 
      });
    }

    // Get section to verify it exists
    const section = await Section.findById(sectionId);
    
    if (!section) {
      return res.status(404).json({ message: 'Section not found' });
    }

    // Get students assigned to this section who are enrolled in this course
    const enrolledStudents = await User.find({
      role: 'student',
      assignedSections: sectionId
    }).select('_id name email').lean();

    console.log(`📋 Found ${enrolledStudents.length} students assigned to section ${sectionId}`);

    if (enrolledStudents.length === 0) {
      return res.status(400).json({ 
        message: 'No students assigned to this section' 
      });
    }

    // Get all student IDs - we'll activate certificates for all assigned students
    // even if they haven't started the course yet (they'll get 0% marks)
    const studentIds = enrolledStudents.map(s => s._id);

    console.log(`🎯 Activating certificates for ${studentIds.length} students`);
    enrolledStudents.forEach(student => {
      console.log(`  📄 ${student.name} (${student.email})`);
    });

    console.log(`\n🔍 Checking for Dean signature for school: ${course.school._id}...`);

    // Get Dean signature (from school)
    const dean = await User.findOne({ 
      role: 'dean',
      school: course.school._id 
    }).select('signatureUrl name email');

    console.log(`  Dean found: ${!!dean}`);
    if (dean) {
      console.log(`  Dean name: ${dean.name}, email: ${dean.email}`);
      console.log(`  Has signature: ${!!dean.signatureUrl}`);
    }

    if (!dean || !dean.signatureUrl) {
      console.log(`❌ Dean signature check failed - returning error to client`);
      return res.status(400).json({ 
        message: 'Dean signature not found. Please ensure the Dean has uploaded their signature.' 
      });
    }

    console.log(`✅ Dean signature verified`);

    // Use HOD's uploaded registrar signature
    const registrarSignature = hod.registrarSignatureUrl;

    console.log(`\n🚀 Starting certificate creation for ${studentIds.length} students...`);

    // Process each student in the section
    const results = {
      activated: 0,
      failed: 0,
      errors: []
    };

    for (const studentId of studentIds) {
      try {
        console.log(`\n🔄 Processing student: ${studentId}`);
        
        // Calculate marks from unit quizzes
        const quizzes = await Quiz.find({ 
          course: courseId,
          unit: { $exists: true }
        });

        console.log(`  📚 Found ${quizzes.length} total quizzes for course`);

        // Get ALL quiz attempts for this student (not just passed)
        const attempts = await QuizAttempt.find({
          student: studentId,
          quiz: { $in: quizzes.map(q => q._id) }
        }).populate('quiz', 'title');

        console.log(`  📝 Found ${attempts.length} total quiz attempts for student`);

        // Get BEST attempt per quiz (highest percentage)
        const bestAttempts = {};
        attempts.forEach(attempt => {
          const quizId = attempt.quiz._id.toString();
          if (!bestAttempts[quizId] || attempt.percentage > bestAttempts[quizId].percentage) {
            bestAttempts[quizId] = attempt;
          }
        });

        const totalQuizzes = quizzes.length;
        
        // Get ONLY PASSED quizzes (where percentage >= 70 or passed flag is true)
        const passedAttempts = Object.values(bestAttempts).filter(
          attempt => attempt.passed || attempt.percentage >= 70
        );
        const passedQuizzesCount = passedAttempts.length;
        
        // Calculate average: Sum of PASSED quiz percentages / Number of PASSED quizzes
        let marksPercentage = 0;
        if (passedQuizzesCount > 0) {
          const totalPercentage = passedAttempts.reduce(
            (sum, attempt) => sum + (attempt.percentage || 0), 
            0
          );
          marksPercentage = Math.round(totalPercentage / passedQuizzesCount);
          console.log(`  📊 Marks: (${totalPercentage}) / ${passedQuizzesCount} passed quizzes = ${marksPercentage}%`);
        } else {
          console.log(`  ⚠️ No quiz attempts - marks will be 0%`);
        }

        // Fetch student and course details for public verification
        const student = await User.findById(studentId).select('name');
        const courseDetails = await Course.findById(courseId).select('title');

        if (!student) {
          console.log(`  ❌ Student not found: ${studentId}`);
          throw new Error(`Student not found: ${studentId}`);
        }

        console.log(`  👤 Student: ${student.name}`);
        console.log(`  📖 Course: ${courseDetails.title}`);

        // Create or update certificate
        const certificateData = {
          student: studentId,
          course: courseId,
          section: sectionId,
          status: 'available',
          totalQuizzes,
          passedQuizzes: passedQuizzesCount,
          marksPercentage,
          activatedBy: hodId,
          activatedAt: new Date(),
          hodSignature: hod.signatureUrl,
          deanSignature: dean.signatureUrl,
          registrarSignature: registrarSignature,
          progressLocked: true,
          issueDate: new Date(),
          publicVerificationData: {
            studentName: student.name,
            courseName: courseDetails.title,
            issueDate: new Date(),
            marksPercentage
          }
        };

        console.log(`  💾 Creating/updating certificate...`);

        const certificate = await Certificate.findOneAndUpdate(
          { student: studentId, course: courseId, section: sectionId },
          certificateData,
          { upsert: true, new: true }
        );

        console.log(`  ✅ Certificate created/updated: ${certificate._id}`);

        // Ensure certificate number and verification hash are generated
        if (!certificate.certificateNumber || !certificate.verificationHash) {
          console.log(`  🔢 Generating certificate number and hash...`);
          // Trigger the pre-save hook by explicitly saving
          await certificate.save();
          console.log(`  ✅ Certificate number: ${certificate.certificateNumber}`);
        }

        // Generate QR code for verification
        if (certificate.verificationHash) {
          console.log(`  📱 Generating QR code...`);
          const qrCodeDataURL = await QRCode.toDataURL(certificate.verificationUrl, {
            errorCorrectionLevel: 'H',
            type: 'image/png',
            width: 200,
            margin: 2
          });
          
          certificate.qrCodeData = qrCodeDataURL;
          await certificate.save();
          console.log(`  ✅ QR code generated`);
        }

        results.activated++;
        console.log(`  ✅ Certificate activation complete for ${student.name}`);
      } catch (err) {
        console.error(`  ❌ Error activating certificate for student ${studentId}:`, err);
        results.failed++;
        results.errors.push({
          studentId,
          error: err.message
        });
      }
    }

    console.log(`\n📊 ACTIVATION SUMMARY:`);
    console.log(`  ✅ Activated: ${results.activated}`);
    console.log(`  ❌ Failed: ${results.failed}`);
    if (results.errors.length > 0) {
      console.log(`  🔍 Errors:`);
      results.errors.forEach(err => {
        console.log(`    - Student ${err.studentId}: ${err.error}`);
      });
    }

    res.json({
      message: `Certificates activated for ${results.activated} students`,
      results
    });

  } catch (error) {
    console.error('Activate certificates error:', error);
    res.status(500).json({ message: error.message });
  }
};

// HOD: Get certificate activation status for courses
exports.getCertificateStatus = async (req, res) => {
  try {
    const { courseId, sectionId } = req.query;
    const hodId = req.user.id;

    // Get students assigned to this section (all students, regardless of progress)
    const enrolledStudents = await User.find({
      role: 'student',
      assignedSections: sectionId
    }).select('_id').lean();

    const totalStudents = enrolledStudents.length;

    // Get existing certificates
    const certificates = await Certificate.find({
      course: courseId,
      section: sectionId
    }).populate('student', 'name regNo uid');

    const activatedCount = certificates.filter(c => c.status !== 'locked').length;
    const downloadedCount = certificates.filter(c => c.status === 'downloaded').length;

    res.json({
      totalStudents,
      activatedCount,
      downloadedCount,
      isActivated: activatedCount > 0,
      certificates: certificates.map(c => ({
        student: c.student,
        status: c.status,
        marksPercentage: c.marksPercentage,
        activatedAt: c.activatedAt,
        downloadedAt: c.downloadedAt
      }))
    });

  } catch (error) {
    console.error('Get certificate status error:', error);
    res.status(500).json({ message: error.message });
  }
};

// Student: Get available certificates
exports.getStudentCertificates = async (req, res) => {
  try {
    const studentId = req.user.id;

    console.log('🔍 Fetching certificates for student:', studentId);

    // Debug: Check student details
    const student = await User.findById(studentId).select('name email assignedSections');
    console.log('Student details:', {
      name: student?.name,
      email: student?.email,
      assignedSections: student?.assignedSections
    });

    // Find all certificates for this student (any status)
    const allCertificates = await Certificate.find({
      student: studentId
    }).lean();
    console.log('All certificates for student:', allCertificates.length);

    // Find available/downloaded certificates
    const certificates = await Certificate.find({
      student: studentId,
      status: { $in: ['available', 'downloaded'] }
    })
    .populate('course', 'title courseCode')
    .populate('section', 'name');

    console.log('Available/downloaded certificates:', certificates.length);

    // Recalculate marks for each certificate
    const certificatesWithUpdatedMarks = await Promise.all(
      certificates.map(async (cert) => {
        try {
          // SIMPLE LOGIC: Get ALL passed quiz attempts for this student in this course
          // QuizAttempt has a 'course' field directly, so we don't need to query quizzes first
          const passedAttempts = await QuizAttempt.find({
            student: studentId,
            course: cert.course._id,
            passed: true
          });

          console.log(`📚 Certificate ${cert._id}: Found ${passedAttempts.length} passed attempts for course`);

          if (passedAttempts.length === 0) {
            console.log(`⚠️ No passed quizzes found`);
            return cert.toObject();
          }

          // Get best score per unit (to avoid counting multiple attempts of same quiz)
          const bestByUnit = {};
          passedAttempts.forEach(attempt => {
            const unitId = attempt.unit?.toString() || 'no-unit';
            if (!bestByUnit[unitId] || attempt.percentage > bestByUnit[unitId]) {
              bestByUnit[unitId] = attempt.percentage;
            }
          });

          const scores = Object.values(bestByUnit);
          console.log(`✅ Passed units: ${scores.length}, Scores:`, scores);
          
          // Calculate average: Sum of passed percentages / Number of passed
          const totalPercentage = scores.reduce((sum, p) => sum + p, 0);
          const currentMarksPercentage = Math.round(totalPercentage / scores.length);
          
          console.log(`📊 Calculation: ${totalPercentage} / ${scores.length} = ${currentMarksPercentage}%`);

          console.log(`📊 Certificate ${cert._id}: Recalculated marks = ${currentMarksPercentage}%`);

          // Update certificate if marks changed - also regenerate verification hash
          if (cert.marksPercentage !== currentMarksPercentage) {
            cert.marksPercentage = currentMarksPercentage;
            
            // Update public verification data
            cert.publicVerificationData = {
              ...cert.publicVerificationData,
              marksPercentage: currentMarksPercentage
            };
            
            // Regenerate verification hash with new marks
            const crypto = require('crypto');
            const hashData = {
              certificateNumber: cert.certificateNumber,
              student: cert.student.toString(),
              course: cert.course._id.toString(),
              issueDate: cert.issueDate,
              marksPercentage: currentMarksPercentage,
              blockNumber: cert.blockNumber
            };
            if (cert.previousHash) {
              hashData.previousHash = cert.previousHash;
            }
            cert.verificationHash = crypto
              .createHash('sha256')
              .update(JSON.stringify(hashData))
              .digest('hex');
            
            // Update verification URL - use environment variable
            const FRONTEND_URL = process.env.FRONTEND_URL || 'http://ec2-13-202-61-143.ap-south-1.compute.amazonaws.com';
            cert.verificationUrl = `${FRONTEND_URL}/verify-certificate/${cert.verificationHash}`;
            
            // Regenerate QR code
            try {
              cert.qrCodeData = await QRCode.toDataURL(cert.verificationUrl, {
                errorCorrectionLevel: 'H',
                type: 'image/png',
                width: 300,
                margin: 2
              });
            } catch (qrErr) {
              console.error('QR generation error:', qrErr);
            }
            
            await cert.save();
            console.log(`💾 Certificate updated with new hash: ${cert.verificationHash}`);
          }

          const certObj = cert.toObject();
          certObj.marksPercentage = currentMarksPercentage;
          return certObj;
        } catch (err) {
          console.error(`Error recalculating marks for cert ${cert._id}:`, err);
          return cert.toObject();
        }
      })
    );

    res.json({ certificates: certificatesWithUpdatedMarks });

  } catch (error) {
    console.error('Get student certificates error:', error);
    res.status(500).json({ message: error.message });
  }
};

// Student: Download certificate PDF
exports.downloadCertificate = async (req, res) => {
  try {
    const { certificateId } = req.params;
    const studentId = req.user.id;

    const certificate = await Certificate.findById(certificateId)
      .populate('student', 'name regNo uid')
      .populate('course', 'title courseCode')
      .populate('section', 'name')
      .populate({
        path: 'course',
        populate: {
          path: 'school department',
          select: 'name code'
        }
      });

    if (!certificate) {
      return res.status(404).json({ message: 'Certificate not found' });
    }

    if (certificate.student._id.toString() !== studentId) {
      return res.status(403).json({ message: 'Unauthorized access' });
    }

    if (certificate.status === 'locked') {
      return res.status(400).json({ 
        message: 'Certificate not yet available. Please contact your HOD.' 
      });
    }

    // ✅ SIMPLE LOGIC: Get all PASSED quiz attempts for this course
    console.log('🔄 Recalculating current marks for certificate download...');
    console.log(`   Student ID: ${studentId}`);
    console.log(`   Course ID: ${certificate.course._id}`);
    
    // Get ALL passed quiz attempts for this student in this course directly
    const passedAttempts = await QuizAttempt.find({
      student: studentId,
      course: certificate.course._id,
      passed: true
    });
    
    console.log(`📚 Found ${passedAttempts.length} passed quiz attempts for course`);
    
    let currentMarksPercentage = 0;
    
    if (passedAttempts.length > 0) {
      // Get best score per unit (to avoid counting multiple attempts of same unit quiz)
      const bestByUnit = {};
      passedAttempts.forEach(attempt => {
        const unitId = attempt.unit?.toString() || 'no-unit';
        console.log(`   Unit ${unitId}: ${attempt.percentage}%`);
        if (!bestByUnit[unitId] || attempt.percentage > bestByUnit[unitId]) {
          bestByUnit[unitId] = attempt.percentage;
        }
      });
      
      const scores = Object.values(bestByUnit);
      console.log(`✅ Passed units: ${scores.length}, Best scores:`, scores);
      
      // Calculate average: Sum of passed scores / Number of passed
      const totalPercentage = scores.reduce((sum, p) => sum + p, 0);
      currentMarksPercentage = Math.round(totalPercentage / scores.length);
      
      console.log(`📊 Calculation: ${totalPercentage} / ${scores.length} = ${currentMarksPercentage}%`);
    } else {
      console.log(`⚠️ No passed quizzes found - marks will be 0%`);
    }

    console.log(`🎯 Final marks percentage: ${currentMarksPercentage}%`);

    // Update certificate with current marks
    certificate.marksPercentage = currentMarksPercentage;
    certificate.status = 'downloaded';
    certificate.downloadedAt = new Date();
    certificate.downloadCount += 1;
    
    // Update public verification data
    certificate.publicVerificationData = {
      ...certificate.publicVerificationData,
      marksPercentage: currentMarksPercentage
    };

    // ALWAYS regenerate verification hash with current marks to ensure integrity
    const crypto = require('crypto');
    const CORRECT_FRONTEND_URL = process.env.FRONTEND_URL || 'http://ec2-13-202-61-143.ap-south-1.compute.amazonaws.com';
    
    // Ensure certificate number exists
    if (!certificate.certificateNumber) {
      const year = new Date().getFullYear();
      const count = await Certificate.countDocuments();
      const blockNumber = certificate.blockNumber || count + 1;
      certificate.certificateNumber = `SGTLMS-${year}-${String(blockNumber).padStart(6, '0')}`;
      certificate.blockNumber = blockNumber;
    }
    
    // ALWAYS regenerate verification hash with updated marks
    console.log(`🔄 Regenerating verification hash with marks: ${currentMarksPercentage}%`);
    const hashData = {
      certificateNumber: certificate.certificateNumber,
      student: certificate.student._id.toString(),
      course: certificate.course._id.toString(),
      issueDate: certificate.issueDate || new Date(),
      marksPercentage: currentMarksPercentage,
      blockNumber: certificate.blockNumber
    };
    
    // Include previous hash if exists
    if (certificate.previousHash) {
      hashData.previousHash = certificate.previousHash;
    }
    
    certificate.verificationHash = crypto
      .createHash('sha256')
      .update(JSON.stringify(hashData))
      .digest('hex');
    
    console.log(`✅ New verification hash: ${certificate.verificationHash}`);
    
    // Update verification URL
    certificate.verificationUrl = `${CORRECT_FRONTEND_URL}/verify-certificate/${certificate.verificationHash}`;
    
    await certificate.save();
    console.log(`✅ Certificate number: ${certificate.certificateNumber}`);
    console.log(`✅ Verification hash: ${certificate.verificationHash}`);
    console.log(`✅ Verification URL: ${certificate.verificationUrl}`);
    
    // ALWAYS regenerate QR code to ensure it's correct and visible
    if (certificate.verificationUrl) {
      console.log(`📱 Generating QR code for URL: ${certificate.verificationUrl}`);
      try {
        const qrCodeDataURL = await QRCode.toDataURL(certificate.verificationUrl, {
          errorCorrectionLevel: 'H',
          type: 'image/png',
          width: 300,  // Increased for better quality
          margin: 2,
          color: {
            dark: '#000000',
            light: '#ffffff'
          }
        });
        certificate.qrCodeData = qrCodeDataURL;
        await certificate.save();
        console.log(`✅ QR code generated successfully`);
      } catch (qrError) {
        console.error(`⚠️ QR code generation failed:`, qrError.message);
        // Create a fallback placeholder
        certificate.qrCodeData = null;
      }
    } else {
      console.log(`⚠️ No verification URL - skipping QR code generation`);
    }

    console.log(`💾 Certificate updated with marks: ${currentMarksPercentage}%`);

    // Debug certificate fields
    console.log(`📋 Certificate Details:`);
    console.log(`   ID: ${certificate._id}`);
    console.log(`   Certificate Number: ${certificate.certificateNumber}`);
    console.log(`   Verification Hash: ${certificate.verificationHash}`);
    console.log(`   Verification URL: ${certificate.verificationUrl}`);
    console.log(`   QR Code Data: ${certificate.qrCodeData ? 'Present' : 'Missing'}`);
    console.log(`   HOD Signature: ${certificate.hodSignature || 'Missing'}`);
    console.log(`   Dean Signature: ${certificate.deanSignature || 'Missing'}`);
    console.log(`   Registrar Signature: ${certificate.registrarSignature || 'Missing'}`);

    // Generate PDF - OPTIMIZED SINGLE PAGE DESIGN
    const doc = new PDFDocument({ 
      size: 'A4', 
      margin: 30,
      bufferPages: false, // Prevent multi-page
      autoFirstPage: true
    });
    
    // Set response headers
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=certificate-${certificate.certificateNumber || 'certificate'}.pdf`);

    // Pipe PDF to response
    doc.pipe(res);

    const pageWidth = doc.page.width;
    const pageHeight = doc.page.height;

    // Decorative Border
    doc.rect(20, 20, pageWidth - 40, pageHeight - 40)
       .lineWidth(2)
       .stroke('#1976d2');
    doc.rect(24, 24, pageWidth - 48, pageHeight - 48)
       .lineWidth(0.5)
       .stroke('#1976d2');

    // Header - Compact
    doc.fontSize(26)
       .font('Helvetica-Bold')
       .fillColor('#1976d2')
       .text('SGT UNIVERSITY', 0, 50, { align: 'center' });

    doc.fontSize(18)
       .fillColor('#333333')
       .text('Certificate of Completion', 0, 82, { align: 'center' });

    // Certificate Number and Date
    doc.fontSize(8)
       .fillColor('#666666')
       .font('Helvetica')
       .text(`Certificate No: ${certificate.certificateNumber}`, 0, 108, { align: 'center' });

    const issueDate = new Date(certificate.issueDate).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
    doc.fontSize(8)
       .text(`Issue Date: ${issueDate}`, 0, 120, { align: 'center' });

    // Main Content
    doc.fontSize(11)
       .fillColor('#000000')
       .text('This is to certify that', 0, 150, { align: 'center' });

    doc.fontSize(19)
       .font('Helvetica-Bold')
       .fillColor('#1976d2')
       .text(certificate.student.name.toUpperCase(), 0, 170, { align: 'center' });

    doc.fontSize(9)
       .font('Helvetica')
       .fillColor('#666666')
       .text(`Reg. No: ${certificate.student.regNo || certificate.student.uid}`, 0, 194, { align: 'center' });

    doc.fontSize(11)
       .fillColor('#000000')
       .text('has successfully completed the course', 0, 216, { align: 'center' });

    doc.fontSize(15)
       .font('Helvetica-Bold')
       .fillColor('#333333')
       .text(`${certificate.course.title}`, 0, 237, { align: 'center', width: pageWidth });

    doc.fontSize(10)
       .font('Helvetica')
       .fillColor('#666666')
       .text(`(${certificate.course.courseCode})`, 0, 257, { align: 'center' });

    doc.fontSize(9)
       .text(`${certificate.course.school?.name || 'School'} - ${certificate.course.department?.name || 'Department'}`, 0, 273, { align: 'center' });

    doc.fontSize(11)
       .font('Helvetica-Bold')
       .fillColor('#000000')
       .text(`with ${certificate.marksPercentage}% marks`, 0, 295, { align: 'center' });

    // Signatures - Optimized layout
    const signatureY = 335;
    const sigWidth = 55;
    const sigHeight = 28;

    // Registrar
    if (certificate.registrarSignature) {
      const registrarBuffer = await loadImageBuffer(certificate.registrarSignature);
      if (registrarBuffer) {
        doc.image(registrarBuffer, 65, signatureY, { width: sigWidth, height: sigHeight });
      } else {
        console.log('   ⚠️ Registrar signature not found');
      }
    }
    doc.fontSize(7)
       .fillColor('#000000')
       .font('Helvetica')
       .text('_______________', 55, signatureY + 30)
       .text('Registrar', 55, signatureY + 41, { width: 75, align: 'center' });

    // HOD
    if (certificate.hodSignature) {
      const hodBuffer = await loadImageBuffer(certificate.hodSignature);
      if (hodBuffer) {
        doc.image(hodBuffer, pageWidth / 2 - 27, signatureY, { width: sigWidth, height: sigHeight });
      } else {
        console.log('   ⚠️ HOD signature not found');
      }
    }
    doc.text('_______________', pageWidth / 2 - 37, signatureY + 30)
       .text('HOD', pageWidth / 2 - 37, signatureY + 41, { width: 75, align: 'center' });

    // Dean
    if (certificate.deanSignature) {
      const deanBuffer = await loadImageBuffer(certificate.deanSignature);
      if (deanBuffer) {
        doc.image(deanBuffer, pageWidth - 120, signatureY, { width: sigWidth, height: sigHeight });
      } else {
        console.log('   ⚠️ Dean signature not found');
      }
    }
    doc.text('_______________', pageWidth - 130, signatureY + 30)
       .text('Dean', pageWidth - 130, signatureY + 41, { width: 75, align: 'center' });

    // QR Code and Verification Section - Improved visibility
    const footerY = 415;
    const qrSize = 85;  // Increased QR size for better visibility
    
    // QR Code - with better positioning and fallback
    if (certificate.qrCodeData) {
      try {
        doc.image(certificate.qrCodeData, 40, footerY, { width: qrSize, height: qrSize });
        console.log('✅ QR code added to PDF');
      } catch (qrImageError) {
        console.error('⚠️ Error adding QR code to PDF:', qrImageError.message);
        // Draw placeholder box if QR fails
        doc.rect(40, footerY, qrSize, qrSize).stroke('#cccccc');
        doc.fontSize(8).fillColor('#999999').text('QR Code', 40, footerY + 35, { width: qrSize, align: 'center' });
      }
    } else {
      console.log('⚠️ No QR code data available');
      // Draw placeholder box
      doc.rect(40, footerY, qrSize, qrSize).stroke('#cccccc');
      doc.fontSize(8).fillColor('#999999').text('QR Code', 40, footerY + 35, { width: qrSize, align: 'center' });
    }
    
    // Verification details beside QR - with better styling
    const verifyX = 135;
    doc.fontSize(9)
       .fillColor('#1976d2')
       .font('Helvetica-Bold')
       .text('Verify Certificate Authenticity', verifyX, footerY + 2);
    
    doc.fontSize(8)
       .fillColor('#333333')
       .font('Helvetica')
       .text(`Certificate Number: ${certificate.certificateNumber || 'N/A'}`, verifyX, footerY + 18);
    
    doc.text(`Verification Hash:`, verifyX, footerY + 32)
       .fontSize(6)
       .fillColor('#666666')
       .text(certificate.verificationHash || 'N/A', verifyX, footerY + 43, { width: pageWidth - verifyX - 50 });
    
    // Verification URL - make it more prominent
    doc.fontSize(8)
       .fillColor('#1976d2')
       .font('Helvetica-Bold')
       .text('Verify Online:', verifyX, footerY + 58);
    
    if (certificate.verificationUrl) {
      doc.fontSize(7)
         .fillColor('#0066cc')
         .font('Helvetica')
         .text(certificate.verificationUrl, verifyX, footerY + 70, {
           link: certificate.verificationUrl,
           underline: true,
           width: pageWidth - verifyX - 50
         });
    } else {
      doc.fontSize(7)
         .fillColor('#999999')
         .font('Helvetica')
         .text('Verification URL not available', verifyX, footerY + 70);
    }

    // Scan instruction - below QR
    doc.fontSize(7)
       .fillColor('#666666')
       .font('Helvetica')
       .text('← Scan QR to verify', 40, footerY + qrSize + 5, { width: qrSize, align: 'center' });

    // Bottom disclaimer
    doc.fontSize(6)
       .fillColor('#888888')
       .font('Helvetica')
       .text('This certificate is digitally signed and can be verified at the URL above or by scanning the QR code.', 35, pageHeight - 25, { 
         align: 'center',
         width: pageWidth - 70
       });

    // Finalize PDF - SINGLE PAGE ONLY
    doc.end();

  } catch (error) {
    console.error('Download certificate error:', error);
    res.status(500).json({ message: error.message });
  }
};

// Public certificate verification by hash (NO AUTH REQUIRED)
exports.verifyCertificate = async (req, res) => {
  try {
    const { hash } = req.params;
    
    if (!hash || hash.length !== 64) {
      return res.status(400).json({ 
        valid: false,
        message: 'Invalid verification hash format' 
      });
    }

    const certificate = await Certificate.findOne({ 
      verificationHash: hash,
      isRevoked: false 
    })
      .select('certificateNumber issueDate publicVerificationData blockNumber previousHash verificationHash isRevoked')
      .lean();

    if (!certificate) {
      return res.status(404).json({ 
        valid: false,
        message: 'Certificate not found or has been revoked' 
      });
    }

    // Verify integrity
    const certDoc = await Certificate.findOne({ verificationHash: hash });
    const integrityValid = certDoc.verifyIntegrity();

    res.json({
      valid: true,
      verified: integrityValid,
      certificate: {
        certificateNumber: certificate.certificateNumber,
        studentName: certificate.publicVerificationData.studentName,
        courseName: certificate.publicVerificationData.courseName,
        marksPercentage: certificate.publicVerificationData.marksPercentage,
        issueDate: certificate.publicVerificationData.issueDate,
        blockNumber: certificate.blockNumber,
        verificationHash: certificate.verificationHash
      },
      message: integrityValid 
        ? 'Certificate is authentic and valid' 
        : 'Warning: Certificate data integrity check failed'
    });

  } catch (error) {
    console.error('Verify certificate error:', error);
    res.status(500).json({ 
      valid: false,
      message: 'Verification service error' 
    });
  }
};

// Public certificate verification by certificate number (NO AUTH REQUIRED)
exports.verifyCertificateByNumber = async (req, res) => {
  try {
    const { certificateNumber } = req.params;
    
    if (!certificateNumber) {
      return res.status(400).json({ 
        valid: false,
        message: 'Certificate number is required' 
      });
    }

    const certificate = await Certificate.findOne({ 
      certificateNumber,
      isRevoked: false 
    })
      .select('certificateNumber issueDate publicVerificationData blockNumber verificationHash verificationUrl isRevoked')
      .lean();

    if (!certificate) {
      return res.status(404).json({ 
        valid: false,
        message: 'Certificate not found or has been revoked' 
      });
    }

    // Verify integrity
    const certDoc = await Certificate.findOne({ certificateNumber });
    const integrityValid = certDoc.verifyIntegrity();

    res.json({
      valid: true,
      verified: integrityValid,
      certificate: {
        certificateNumber: certificate.certificateNumber,
        studentName: certificate.publicVerificationData.studentName,
        courseName: certificate.publicVerificationData.courseName,
        marksPercentage: certificate.publicVerificationData.marksPercentage,
        issueDate: certificate.publicVerificationData.issueDate,
        blockNumber: certificate.blockNumber,
        verificationHash: certificate.verificationHash,
        verificationUrl: certificate.verificationUrl
      },
      message: integrityValid 
        ? 'Certificate is authentic and valid' 
        : 'Warning: Certificate data integrity check failed'
    });

  } catch (error) {
    console.error('Verify certificate by number error:', error);
    res.status(500).json({ 
      valid: false,
      message: 'Verification service error' 
    });
  }
};

// Admin: Revoke a certificate
exports.revokeCertificate = async (req, res) => {
  try {
    const { certificateId } = req.params;
    const { reason } = req.body;
    const adminId = req.user.id;

    const certificate = await Certificate.findById(certificateId);
    
    if (!certificate) {
      return res.status(404).json({ message: 'Certificate not found' });
    }

    if (certificate.isRevoked) {
      return res.status(400).json({ message: 'Certificate is already revoked' });
    }

    certificate.isRevoked = true;
    certificate.revokedAt = new Date();
    certificate.revokedBy = adminId;
    certificate.revocationReason = reason || 'No reason provided';
    
    await certificate.save();

    res.json({
      message: 'Certificate revoked successfully',
      certificate: {
        certificateNumber: certificate.certificateNumber,
        revokedAt: certificate.revokedAt,
        revocationReason: certificate.revocationReason
      }
    });

  } catch (error) {
    console.error('Revoke certificate error:', error);
    res.status(500).json({ message: error.message });
  }
};

// Get certificate chain integrity status (for auditing)
exports.getCertificateChainStatus = async (req, res) => {
  try {
    const certificates = await Certificate.find()
      .sort({ blockNumber: 1 })
      .select('certificateNumber blockNumber verificationHash previousHash');

    let brokenChain = [];
    let validChain = true;

    for (let i = 1; i < certificates.length; i++) {
      const current = certificates[i];
      const previous = certificates[i - 1];
      
      if (current.previousHash !== previous.verificationHash) {
        validChain = false;
        brokenChain.push({
          blockNumber: current.blockNumber,
          certificateNumber: current.certificateNumber,
          expectedHash: previous.verificationHash,
          actualHash: current.previousHash
        });
      }
    }

    res.json({
      totalCertificates: certificates.length,
      chainValid: validChain,
      brokenLinks: brokenChain.length,
      brokenChain: brokenChain.length > 0 ? brokenChain : null,
      message: validChain 
        ? 'Certificate chain integrity verified' 
        : `Chain integrity compromised at ${brokenChain.length} point(s)`
    });

  } catch (error) {
    console.error('Get chain status error:', error);
    res.status(500).json({ message: error.message });
  }
};

module.exports = exports;
