// src/utils/validators.js
const mongoose = require('mongoose');

/**
 * Validate if string is a valid MongoDB ObjectId
 */
const isValidObjectId = (id) => {
  return mongoose.Types.ObjectId.isValid(id);
};

/**
 * Validate username format
 */
const isValidUsername = (username) => {
  const regex = /^[a-zA-Z0-9_]{3,20}$/;
  return regex.test(username);
};

/**
 * Validate password strength
 */
const isValidPassword = (password) => {
  return password && password.length >= 6;
};

/**
 * Validate device token format
 */
const isValidDeviceToken = (token) => {
  const regex = /^[a-f0-9]{16}$/;
  return regex.test(token);
};

/**
 * Validate pairing token format
 */
const isValidPairingToken = (token) => {
  const regex = /^[A-F0-9]{12}$/;
  return regex.test(token);
};

/**
 * Sanitize string input
 */
const sanitizeString = (str) => {
  if (typeof str !== 'string') return '';
  return str.trim().replace(/[<>]/g, '');
};

module.exports = {
  isValidObjectId,
  isValidUsername,
  isValidPassword,
  isValidDeviceToken,
  isValidPairingToken,
  sanitizeString
};