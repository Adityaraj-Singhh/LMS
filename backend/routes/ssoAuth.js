/**
 * SSO Authentication Routes for LMS
 * Handles Single Sign-On from UMS (University Management System)
 */

const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const User = require('../models/User');

// SSO Secret - must match UMS backend
const SSO_SECRET = process.env.SSO_SECRET || 'sso-shared-secret-key-change-in-production';

/**
 * Role mapping from UMS to LMS
 */
const roleMapping = {
  'superadmin': 'admin',
  'admin': 'admin',
  'faculty': 'teacher',
  'staff': 'teacher',
  'student': 'student',
  'parent': 'student'
};

/**
 * @route   POST /api/auth/sso-login
 * @desc    SSO Login - Accepts token from UMS and creates LMS session
 * @access  Public
 */
router.post('/sso-login', async (req, res) => {
  try {
    const { ssoToken } = req.body;

    if (!ssoToken) {
      return res.status(400).json({ 
        success: false,
        message: 'SSO token is required' 
      });
    }

    // Verify SSO token
    let decoded;
    try {
      decoded = jwt.verify(ssoToken, SSO_SECRET);
    } catch (err) {
      if (err.name === 'TokenExpiredError') {
        return res.status(401).json({ 
          success: false,
          message: 'SSO token has expired. Please try again from UMS.' 
        });
      }
      return res.status(401).json({ 
        success: false,
        message: 'Invalid SSO token' 
      });
    }

    // Verify token source
    if (decoded.source !== 'ums') {
      return res.status(401).json({ 
        success: false,
        message: 'Invalid token source' 
      });
    }

    console.log('🔑 SSO Login attempt for:', decoded.email);

    // Find existing user in LMS by email or UID
    let user = await User.findOne({
      $or: [
        { email: decoded.email?.toLowerCase() },
        { uid: decoded.uid },
        { regNo: decoded.uid },
        { teacherId: decoded.uid }
      ]
    })
    .populate({
      path: 'roleAssignments.school roleAssignments.schools',
      select: 'name code'
    })
    .populate({
      path: 'roleAssignments.departments',
      select: 'name code school'
    })
    .populate('school', 'name code')
    .populate('department', 'name code');

    // If user doesn't exist, create new user
    if (!user) {
      console.log('📝 Creating new LMS user via SSO:', decoded.email);

      const lmsRole = roleMapping[decoded.role] || 'student';
      
      // Generate a secure random password (user won't need it for SSO)
      const tempPassword = await bcrypt.hash(`sso_${Date.now()}_${Math.random()}`, 10);

      user = new User({
        name: decoded.name || decoded.email?.split('@')[0] || 'SSO User',
        email: decoded.email?.toLowerCase(),
        password: tempPassword,
        uid: decoded.uid,
        role: lmsRole,
        roles: [lmsRole],
        primaryRole: lmsRole,
        isActive: true,
        emailVerified: true,
        metadata: {
          source: 'ums_sso',
          importedAt: new Date(),
          lastSyncedAt: new Date()
        }
      });

      // Set appropriate ID field based on role
      if (lmsRole === 'student') {
        user.regNo = decoded.uid;
      } else if (['teacher', 'hod', 'dean', 'admin'].includes(lmsRole)) {
        user.teacherId = decoded.uid;
      }

      await user.save();
      console.log('✅ New LMS user created via SSO:', user.email, 'Role:', lmsRole);
    } else {
      // Update last sync timestamp
      user.metadata = {
        ...user.metadata,
        lastSyncedAt: new Date()
      };
      user.lastLoginAt = new Date();
      await user.save();
      console.log('✅ Existing LMS user logged in via SSO:', user.email);
    }

    // Generate a unique session ID
    const sessionId = `sso_${Date.now()}_${Math.random().toString(36).substring(7)}`;

    // Update session info
    user.currentSessionId = sessionId;
    user.lastLoginAt = new Date();
    await user.save();

    // Normalize permissions
    const normalizedPermissions = Array.isArray(user.permissions) 
      ? user.permissions.filter(p => p && typeof p === 'string')
      : [];

    // Generate LMS JWT token
    const lmsToken = jwt.sign(
      {
        id: user._id,
        email: user.email,
        role: user.role,
        roles: user.roles || [user.role],
        primaryRole: user.primaryRole || user.role,
        name: user.name,
        uid: user.uid,
        school: user.school?._id,
        department: user.department?._id,
        roleAssignments: user.roleAssignments || [],
        permissions: normalizedPermissions,
        sessionId: sessionId,
        ssoLogin: true
      },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    // Prepare user data for response
    const userData = {
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      roles: user.roles || [user.role],
      primaryRole: user.primaryRole || user.role,
      uid: user.uid,
      regNo: user.regNo,
      teacherId: user.teacherId,
      school: user.school,
      department: user.department,
      departments: user.departments,
      roleAssignments: user.roleAssignments,
      permissions: normalizedPermissions,
      isActive: user.isActive,
      profileImage: user.profileImage
    };

    // Log successful SSO login
    const AuditLog = require('../models/AuditLog');
    await AuditLog.create({
      action: 'SSO_LOGIN',
      description: `User ${user.name} (${user.email}) logged in via UMS SSO`,
      actionType: 'login',
      performedBy: user._id,
      performedByRole: user.role,
      performedByName: user.name,
      performedByEmail: user.email,
      sessionId: sessionId,
      status: 'success',
      statusCode: 200,
      severity: 'info',
      category: 'authentication',
      details: {
        ssoSource: 'ums',
        sessionId: sessionId,
        uid: decoded.uid
      },
      timestamp: new Date()
    });

    res.json({
      success: true,
      message: 'SSO login successful',
      token: lmsToken,
      user: userData
    });

  } catch (error) {
    console.error('❌ SSO Login error:', error);
    res.status(500).json({ 
      success: false,
      message: 'SSO authentication failed',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * @route   GET /api/auth/sso-verify
 * @desc    Verify if SSO token is valid (for frontend pre-check)
 * @access  Public
 */
router.get('/sso-verify', async (req, res) => {
  try {
    const { token } = req.query;

    if (!token) {
      return res.status(400).json({ 
        valid: false, 
        message: 'Token is required' 
      });
    }

    const decoded = jwt.verify(token, SSO_SECRET);
    
    res.json({
      valid: true,
      email: decoded.email,
      role: decoded.role,
      expiresAt: new Date(decoded.exp * 1000).toISOString()
    });

  } catch (error) {
    res.status(401).json({ 
      valid: false, 
      message: error.name === 'TokenExpiredError' ? 'Token expired' : 'Invalid token'
    });
  }
});

module.exports = router;
