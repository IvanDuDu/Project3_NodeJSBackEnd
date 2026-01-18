// src/routes/deviceRoutes.js
const express = require('express');
const router = express.Router();
const {
  getDeviceList,
  getMemoryList,
  sendMemoryCommand,
  sendStreamingCommand,
  getAllDeviceStatus,
  getSingleDeviceStatus,
  requestUpload,
  receiveUpload,
  finalizeUpload,
  getUploadStatus,
  getVideoStatus,
  getStream
} = require('../controllers/deviceController');
const { protect } = require('../middleware/auth');

// All routes are protected except receiveUpload and finalizeUpload
// (which are called by the device)

// Device list routes
router.get('/user/:userID/deviceList', protect, getDeviceList);

// Memory list route
router.get('/user/:userID/device/:deviceID/memoryList', protect, getMemoryList);

// Command routes
router.post('/user/:userID/device/:deviceID/MEM', protect, sendMemoryCommand);
router.post('/user/:userID/device/:deviceID/STM', protect, sendStreamingCommand);

// Upload routes
router.post('/user/:userID/device/:deviceID/upload', protect, requestUpload);
router.post('/user/:userID/device/:deviceID/record/:recordID/finalize', finalizeUpload);
router.get('/user/:userID/device/:deviceID/record/:recordID/upload-status', protect, getUploadStatus);

// Video status route
router.get('/user/:userID/device/:deviceID/record/:recordID/video-status', protect, getVideoStatus);

// Stream route
router.get('/user/:userID/device/:deviceID/getStream', protect, getStream);

// Status routes
router.get('/device/:userID/status', protect, getAllDeviceStatus);
router.get('/device/:userID/status/:deviceID', protect, getSingleDeviceStatus);

module.exports = router;