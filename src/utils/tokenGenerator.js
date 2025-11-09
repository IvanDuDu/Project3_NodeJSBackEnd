// src/utils/tokenGenerator.js
const crypto = require('crypto');
const jwt = require('jsonwebtoken');

/**
 * Generate a unique device token
 * Format: 16 characters alphanumeric
 */
const generateDeviceToken = () => {
  return crypto.randomBytes(8).toString('hex');
};

/**
 * Generate a pairing token (temporary, expires in 5 minutes)
 * Format: 12 characters alphanumeric uppercase
 */
const generatePairingToken = () => {
  return crypto.randomBytes(6).toString('hex').toUpperCase();
};

/**
 * Generate JWT token for user authentication
 */
const generateJWT = (userId) => {
  return jwt.sign(
    { userId },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRE || '7d' }
  );
};

/**
 * Verify JWT token
 */
const verifyJWT = (token) => {
  try {
    return jwt.verify(token, process.env.JWT_SECRET);
  } catch (error) {
    return null;
  }
};

module.exports = {
  generateDeviceToken,
  generatePairingToken,
  generateJWT,
  verifyJWT
};