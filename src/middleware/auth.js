// src/middleware/auth.js
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Device = require('../models/Device');

/**
 * Middleware to protect routes - verify JWT token
 */
const protect = async (req, res, next) => {
  try {
    let token;

    // Get token from header
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Not authorized to access this route'
      });
    }

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Get user from token
    req.user = await User.findById(decoded.userId).select('-password');

    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'User not found'
      });
    }

    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: 'Not authorized to access this route',
      error: error.message
    });
  }
};

/**
 * Middleware to verify user owns the device
 */
const verifyDeviceOwnership = async (req, res, next) => {
  try {
    const { deviceID } = req.params;
    const userId = req.user._id;

    // Check if device exists
    const device = await Device.findById(deviceID);
    if (!device) {
      return res.status(404).json({
        success: false,
        message: 'Device not found'
      });
    }

    // Check if user owns this device
    const user = await User.findById(userId);
    const deviceExists = user.deviceList.some(
      devId => devId.toString() === deviceID
    );

    if (!deviceExists) {
      return res.status(403).json({
        success: false,
        message: 'You do not have access to this device'
      });
    }

    req.device = device;
    next();
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Error verifying device ownership',
      error: error.message
    });
  }
};

module.exports = {
  protect,
  verifyDeviceOwnership
};