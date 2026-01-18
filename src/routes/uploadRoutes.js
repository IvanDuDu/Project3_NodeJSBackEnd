// src/routes/uploadRoutes.js
const express = require('express');
const router = express.Router();
const { receiveUpload } = require('../controllers/deviceController');

// Middleware to parse raw binary data
const rawBodyParser = express.raw({
  type: 'image/jpeg',
  limit: '50mb' // Adjust based on your file size needs
});

/**
 * @desc    Public endpoint for device to upload files
 * @route   POST /upload&fileName=xxx&deviceToken=xxx
 * @access  Public (device authentication via token in query)
 */
router.post('/', rawBodyParser, receiveUpload);

module.exports = router;