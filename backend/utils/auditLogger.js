/**
 * Audit Logger Utility
 * Provides easy-to-use functions for logging specific activities to the audit log
 */

const AuditLog = require('../models/AuditLog');

/**
 * Get client IP from request
 */
const getIpAddress = (req) => {
  if (!req) return 'Unknown';
  const ip = req.headers?.['x-forwarded-for']?.split(',')[0]?.trim() ||
             req.headers?.['x-real-ip'] ||
             req.headers?.['x-client-ip'] ||
             req.connection?.remoteAddress ||
             req.socket?.remoteAddress ||
             req.ip ||
             'Unknown';
  return ip.replace('::ffff:', '').replace('::1', 'localhost');
};

/**
 * Parse User Agent
 */
const parseUserAgent = (userAgent) => {
  if (!userAgent) return { browser: 'Unknown', os: 'Unknown', device: 'Unknown' };
  const ua = userAgent.toLowerCase();
  
  let browser = 'Unknown';
  if (ua.includes('edg/')) browser = 'Edge';
  else if (ua.includes('chrome/')) browser = 'Chrome';
  else if (ua.includes('firefox/')) browser = 'Firefox';
  else if (ua.includes('safari/') && !ua.includes('chrome')) browser = 'Safari';
  
  let os = 'Unknown';
  if (ua.includes('windows')) os = 'Windows';
  else if (ua.includes('mac os')) os = 'macOS';
  else if (ua.includes('android')) os = 'Android';
  else if (ua.includes('iphone') || ua.includes('ipad')) os = 'iOS';
  else if (ua.includes('linux')) os = 'Linux';
  
  let device = 'Desktop';
  if (ua.includes('mobile')) device = 'Mobile';
  else if (ua.includes('tablet') || ua.includes('ipad')) device = 'Tablet';
  
  return { browser, os, device };
};

/**
 * Log Quiz Unlock Activity
 */
const logQuizUnlock = async (req, {
  unlockType, // 'TEACHER', 'HOD', 'DEAN', 'ADMIN'
  studentId,
  studentName,
  studentEmail,
  quizId,
  quizTitle,
  courseId,
  courseName,
  reason,
  notes,
  unlockCount,
  remainingUnlocks,
  previousLevel,
  newLevel,
  success = true,
  errorMessage = null
}) => {
  try {
    const user = req.user;
    const logData = {
      action: `QUIZ_UNLOCK_${unlockType}`,
      description: `${user?.name || 'Unknown'} (${unlockType}) unlocked quiz "${quizTitle}" for student ${studentName}. Reason: ${reason}`,
      actionType: 'update',
      
      performedBy: user?.id || user?._id,
      performedByRole: unlockType.toLowerCase(),
      performedByName: user?.name,
      performedByEmail: user?.email,
      
      targetUser: studentId,
      targetUserName: studentName,
      targetResource: 'Quiz',
      targetResourceId: quizId,
      
      ipAddress: getIpAddress(req),
      userAgent: req.headers?.['user-agent'],
      requestMethod: req.method,
      requestUrl: req.originalUrl,
      
      status: success ? 'success' : 'failure',
      errorMessage: errorMessage,
      
      severity: 'medium',
      category: 'quiz_unlock',
      
      details: {
        unlockType,
        quizId,
        quizTitle,
        courseId,
        courseName,
        studentId,
        studentName,
        studentEmail,
        reason,
        notes,
        unlockCount,
        remainingUnlocks,
        previousLevel,
        newLevel
      },
      
      deviceInfo: parseUserAgent(req.headers?.['user-agent']),
      tags: ['quiz-unlock', unlockType.toLowerCase(), success ? 'successful' : 'failed']
    };

    await AuditLog.create(logData);
    console.log(`📝 Audit: Quiz unlock by ${unlockType} logged`);
  } catch (error) {
    console.error('❌ Failed to log quiz unlock audit:', error.message);
  }
};

/**
 * Log Content Arrangement Activity
 */
const logContentArrangement = async (req, {
  action, // 'SUBMIT', 'APPROVE', 'REJECT', 'UPDATE', 'LAUNCH'
  arrangementId,
  courseId,
  courseTitle,
  arrangementVersion,
  itemCount,
  coordinatorId,
  coordinatorName,
  reason = null,
  success = true,
  errorMessage = null
}) => {
  try {
    const user = req.user;
    
    let description = '';
    let severity = 'info';
    
    switch (action) {
      case 'SUBMIT':
        description = `${coordinatorName || 'CC'} submitted content arrangement (v${arrangementVersion}) for course "${courseTitle}" for HOD approval`;
        severity = 'medium';
        break;
      case 'APPROVE':
        description = `HOD ${user?.name} approved content arrangement (v${arrangementVersion}) for course "${courseTitle}"`;
        severity = 'high';
        break;
      case 'REJECT':
        description = `HOD ${user?.name} rejected content arrangement (v${arrangementVersion}) for course "${courseTitle}". Reason: ${reason}`;
        severity = 'medium';
        break;
      case 'UPDATE':
        description = `${user?.name} updated content arrangement (v${arrangementVersion}) for course "${courseTitle}" with ${itemCount} items`;
        severity = 'low';
        break;
      case 'LAUNCH':
        description = `HOD ${user?.name} launched course "${courseTitle}" with arrangement version ${arrangementVersion}`;
        severity = 'critical';
        break;
      default:
        description = `Content arrangement action: ${action} for course "${courseTitle}"`;
    }

    const logData = {
      action: `CONTENT_ARRANGEMENT_${action}`,
      description,
      actionType: action === 'APPROVE' || action === 'REJECT' ? 'update' : (action === 'LAUNCH' ? 'other' : 'update'),
      
      performedBy: user?.id || user?._id,
      performedByRole: user?.role || user?.roles?.[0],
      performedByName: user?.name,
      performedByEmail: user?.email,
      
      targetUser: coordinatorId,
      targetUserName: coordinatorName,
      targetResource: 'ContentArrangement',
      targetResourceId: arrangementId,
      
      ipAddress: getIpAddress(req),
      userAgent: req.headers?.['user-agent'],
      requestMethod: req.method,
      requestUrl: req.originalUrl,
      
      status: success ? 'success' : 'failure',
      errorMessage: errorMessage,
      
      severity,
      category: 'approval_workflow',
      
      details: {
        action,
        arrangementId,
        courseId,
        courseTitle,
        arrangementVersion,
        itemCount,
        coordinatorId,
        coordinatorName,
        reason
      },
      
      deviceInfo: parseUserAgent(req.headers?.['user-agent']),
      tags: ['content-arrangement', action.toLowerCase(), success ? 'successful' : 'failed']
    };

    await AuditLog.create(logData);
    console.log(`📝 Audit: Content arrangement ${action} logged`);
  } catch (error) {
    console.error('❌ Failed to log content arrangement audit:', error.message);
  }
};

/**
 * Log Group Chat Activity
 * Supports both HTTP request context (req, data) and socket context (data only)
 */
const logGroupChat = async (reqOrData, dataOrUndefined) => {
  try {
    // Determine if called with (req, data) or just (data)
    let data, req;
    if (dataOrUndefined === undefined) {
      // Called with just data object (socket context)
      data = reqOrData;
      req = null;
    } else {
      // Called with (req, data) - HTTP context
      req = reqOrData;
      data = dataOrUndefined;
    }
    
    const {
      action, // 'SEND_MESSAGE', 'DELETE_MESSAGE', 'PIN_MESSAGE', 'UPLOAD_FILE', 'JOIN_CHAT', 'LEAVE_CHAT', 'message_sent', 'message_deleted'
      messageId = null,
      messageContent = null,
      messagePreview = null,
      courseId,
      courseName,
      sectionId,
      sectionName,
      recipientCount = null,
      fileType = null,
      fileName = null,
      messageType = null,
      hasFile = false,
      isFlagged = false,
      flaggedReason = null,
      // Socket context fields
      userId = null,
      userName = null,
      userRole = null,
      metadata = {},
      success = true,
      errorMessage = null
    } = data;
    
    // Get user info from req or from data (socket context)
    const user = req?.user || { _id: userId, name: userName, role: userRole, roles: [userRole] };
    
    let description = '';
    let severity = 'info';
    
    // Truncate message content for privacy
    const truncatedContent = messageContent || messagePreview ? 
      ((messageContent || messagePreview).length > 50 ? (messageContent || messagePreview).substring(0, 50) + '...' : (messageContent || messagePreview)) : null;
    
    // Normalize action (support both formats)
    const normalizedAction = action.toUpperCase().replace('_SENT', '_MESSAGE').replace('_DELETED', '_MESSAGE');
    
    switch (normalizedAction) {
      case 'SEND_MESSAGE':
      case 'MESSAGE_SENT':
        description = `${user?.name || userName} sent a ${messageType || 'text'} message in group chat`;
        if (truncatedContent) description += `: "${truncatedContent}"`;
        if (hasFile || fileName) description = `${user?.name || userName} sent a file "${fileName}" in group chat`;
        severity = 'low';
        break;
      case 'DELETE_MESSAGE':
      case 'MESSAGE_DELETED':
        description = `${user?.name || userName} deleted a message in group chat`;
        severity = 'medium';
        break;
      case 'PIN_MESSAGE':
        description = `${user?.name || userName} pinned a message in group chat`;
        severity = 'low';
        break;
      case 'UPLOAD_FILE':
        description = `${user?.name || userName} uploaded ${fileType || 'file'} "${fileName}" in chat`;
        severity = 'medium';
        break;
      case 'JOIN_CHAT':
        description = `${user?.name || userName} joined group chat`;
        severity = 'info';
        break;
      case 'LEAVE_CHAT':
        description = `${user?.name || userName} left group chat`;
        severity = 'info';
        break;
      default:
        description = `Chat activity: ${action} by ${user?.name || userName}`;
    }

    const logData = {
      action: `GROUP_CHAT_${normalizedAction}`,
      description,
      actionType: normalizedAction.includes('DELETE') ? 'delete' : (normalizedAction.includes('SEND') || normalizedAction.includes('UPLOAD') ? 'create' : 'other'),
      
      performedBy: user?._id || user?.id || userId,
      performedByRole: user?.role || user?.roles?.[0] || userRole,
      performedByName: user?.name || userName,
      performedByEmail: user?.email,
      
      targetResource: 'GroupChat',
      targetResourceId: messageId,
      
      ipAddress: req ? getIpAddress(req) : (metadata?.ip || 'Socket'),
      userAgent: req?.headers?.['user-agent'] || metadata?.userAgent || 'Socket.IO',
      requestMethod: req?.method || 'SOCKET',
      requestUrl: req?.originalUrl || '/socket.io/group-chat',
      
      status: success ? 'success' : 'failure',
      errorMessage: errorMessage,
      
      severity,
      category: 'group_chat',
      
      details: {
        action: normalizedAction,
        messageId,
        courseId,
        courseName,
        sectionId,
        sectionName,
        recipientCount,
        fileType,
        fileName,
        messageType,
        hasFile,
        isFlagged,
        flaggedReason,
        hasAttachment: hasFile || !!fileType
      },
      
      deviceInfo: parseUserAgent(req?.headers?.['user-agent'] || metadata?.userAgent),
      tags: ['group-chat', normalizedAction.toLowerCase().replace('_', '-'), success ? 'successful' : 'failed']
    };

    await AuditLog.create(logData);
    console.log(`📝 Audit: Group chat ${normalizedAction} logged for user ${user?.name || userName}`);
  } catch (error) {
    console.error('❌ Failed to log group chat audit:', error.message);
  }
};

/**
 * Generic activity logger
 */
const logActivity = async (req, {
  action,
  description,
  actionType = 'other',
  targetResource = null,
  targetResourceId = null,
  targetUser = null,
  targetUserName = null,
  category = 'other',
  severity = 'info',
  details = {},
  success = true,
  errorMessage = null
}) => {
  try {
    const user = req.user;
    
    const logData = {
      action,
      description,
      actionType,
      
      performedBy: user?.id || user?._id,
      performedByRole: user?.role || user?.roles?.[0],
      performedByName: user?.name,
      performedByEmail: user?.email,
      
      targetUser,
      targetUserName,
      targetResource,
      targetResourceId,
      
      ipAddress: getIpAddress(req),
      userAgent: req.headers?.['user-agent'],
      requestMethod: req.method,
      requestUrl: req.originalUrl,
      
      status: success ? 'success' : 'failure',
      errorMessage,
      
      severity,
      category,
      details,
      
      deviceInfo: parseUserAgent(req.headers?.['user-agent']),
      tags: [category, action.toLowerCase().replace(/_/g, '-')]
    };

    await AuditLog.create(logData);
  } catch (error) {
    console.error('❌ Failed to log activity audit:', error.message);
  }
};

module.exports = {
  logQuizUnlock,
  logContentArrangement,
  logGroupChat,
  logActivity
};
