const express = require('express');
const router = express.Router();
const { auth } = require('../middleware/auth');

// Log security attempts
router.post('/log-attempt', auth, async (req, res) => {
  try {
    const { type, timestamp, userAgent } = req.body;
    const userId = req.user.id;
    
    console.warn(`🚨 Security Alert: ${type} detected for user ${userId} at ${timestamp}`);
    console.warn(`User Agent: ${userAgent}`);
    
    // Here you could save to a security log database table
    // For now, we'll just log it to console and optionally notify admins
    
    // You could add database logging here:
    // const SecurityLog = require('../models/SecurityLog');
    // await SecurityLog.create({
    //   userId,
    //   type,
    //   timestamp,
    //   userAgent,
    //   ipAddress: req.ip
    // });
    
    res.json({ message: 'Security event logged' });
  } catch (error) {
    console.error('Error logging security event:', error);
    res.status(500).json({ message: 'Failed to log security event' });
  }
});

module.exports = router;