// src/routes/deviceRoutes.js
const express = require('express');
const router = express.Router();
const {
  getDeviceList,
  getMemoryList,
  sendMemoryCommand,
  sendStreamingCommand,
  getAllDeviceStatus,
  getSingleDeviceStatus
} = require('../controllers/deviceController');
const { protect } = require('../middleware/auth');

// All routes are protected
router.use(protect);

// Device list routes
router.get('/user/:userID/deviceList', getDeviceList);

// Memory list route
router.get('/user/:userID/device/:deviceID/memoryList', getMemoryList);

// Command routes
router.post('/user/:userID/device/:deviceID/MEM', sendMemoryCommand);
router.post('/user/:userID/device/:deviceID/STM', sendStreamingCommand);

// Status routes
router.get('/device/:userID/status', getAllDeviceStatus);
router.get('/device/:userID/status/:deviceID', getSingleDeviceStatus);

module.exports = router;