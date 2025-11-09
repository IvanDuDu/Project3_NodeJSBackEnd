// src/controllers/deviceController.js
const User = require('../models/User');
const Device = require('../models/Device');
const Record = require('../models/Record');
const mqttService = require('../services/mqttService');
const { isValidObjectId } = require('../utils/validators');

/**
 * @desc    Get device list for user
 * @route   GET /api/user/:userID/deviceList
 * @access  Private
 */
const getDeviceList = async (req, res, next) => {
  try {
    const { userID } = req.params;

    // Verify user ID
    if (!isValidObjectId(userID)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid user ID'
      });
    }

    // Check if requesting user matches the userID in params
    if (req.user._id.toString() !== userID) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    const user = await User.findById(userID).populate({
      path: 'deviceList',
      select: 'token status lastSeen streamingUrl recordList createdAt'
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    console.log(`📋 Device list fetched for user: ${userID}`);

    res.status(200).json({
      success: true,
      count: user.deviceList.length,
      data: user.deviceList
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get memory list (records) for a device
 * @route   GET /api/user/:userID/device/:deviceID/memoryList
 * @access  Private
 */
const getMemoryList = async (req, res, next) => {
  try {
    const { userID, deviceID } = req.params;

    // Validation
    if (!isValidObjectId(userID) || !isValidObjectId(deviceID)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid user ID or device ID'
      });
    }

    // Check if requesting user matches the userID in params
    if (req.user._id.toString() !== userID) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    // Verify device ownership
    const user = await User.findById(userID);
    const deviceExists = user.deviceList.some(
      devId => devId.toString() === deviceID
    );

    if (!deviceExists) {
      return res.status(403).json({
        success: false,
        message: 'You do not have access to this device'
      });
    }

    // Get device with records
    const device = await Device.findById(deviceID).populate({
      path: 'recordList',
      select: 'folderName fileCount size uploadStatus metadata createdAt',
      options: { sort: { createdAt: -1 } }
    });

    if (!device) {
      return res.status(404).json({
        success: false,
        message: 'Device not found'
      });
    }

    console.log(`📁 Memory list fetched for device: ${deviceID}`);

    res.status(200).json({
      success: true,
      count: device.recordList.length,
      data: device.recordList
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Send command to device - Memory (MEM)
 * @route   POST /api/user/:userID/device/:deviceID/MEM
 * @access  Private
 */
const sendMemoryCommand = async (req, res, next) => {
  try {
    const { userID, deviceID } = req.params;
    const { recordID } = req.body;

    // Validation
    if (!isValidObjectId(userID) || !isValidObjectId(deviceID)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid user ID or device ID'
      });
    }

    if (!recordID || !isValidObjectId(recordID)) {
      return res.status(400).json({
        success: false,
        message: 'Valid record ID is required'
      });
    }

    // Check authorization
    if (req.user._id.toString() !== userID) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    // Verify device ownership
    const user = await User.findById(userID);
    const deviceExists = user.deviceList.some(
      devId => devId.toString() === deviceID
    );

    if (!deviceExists) {
      return res.status(403).json({
        success: false,
        message: 'You do not have access to this device'
      });
    }

    // Get device and record
    const device = await Device.findById(deviceID);
    const record = await Record.findById(recordID);

    if (!device) {
      return res.status(404).json({
        success: false,
        message: 'Device not found'
      });
    }

    if (!record) {
      return res.status(404).json({
        success: false,
        message: 'Record not found'
      });
    }

    // Send command to device via MQTT
    const payload = {
      command: 'GET_MEMORY',
      recordID: record._id,
      folderName: record.folderName
    };

    console.log(`📤 Sending memory command to device ${device.token}`);

    const response = await mqttService.sendCommandAndWait(
      device.token,
      'memory',
      payload,
      30000
    );

    console.log(`✅ Memory command response received from device ${device.token}`);

    res.status(200).json({
      success: true,
      message: 'Memory data request sent successfully',
      data: response
    });
  } catch (error) {
    if (error.message === 'Device response timeout') {
      return res.status(408).json({
        success: false,
        message: 'Device did not respond in time'
      });
    }
    next(error);
  }
};

/**
 * @desc    Send command to device - Streaming (STM)
 * @route   POST /api/user/:userID/device/:deviceID/STM
 * @access  Private
 */
const sendStreamingCommand = async (req, res, next) => {
  try {
    const { userID, deviceID } = req.params;
    const { action } = req.body; // "ON" or "OFF"

    // Validation
    if (!isValidObjectId(userID) || !isValidObjectId(deviceID)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid user ID or device ID'
      });
    }

    if (!action || !['ON', 'OFF'].includes(action.toUpperCase())) {
      return res.status(400).json({
        success: false,
        message: 'Action must be "ON" or "OFF"'
      });
    }

    // Check authorization
    if (req.user._id.toString() !== userID) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    // Verify device ownership
    const user = await User.findById(userID);
    const deviceExists = user.deviceList.some(
      devId => devId.toString() === deviceID
    );

    if (!deviceExists) {
      return res.status(403).json({
        success: false,
        message: 'You do not have access to this device'
      });
    }

    // Get device
    const device = await Device.findById(deviceID);
    if (!device) {
      return res.status(404).json({
        success: false,
        message: 'Device not found'
      });
    }

    // Send command to device via MQTT
    const payload = {
      command: action.toUpperCase() === 'ON' ? 'START_STREAMING' : 'STOP_STREAMING',
      action: action.toUpperCase()
    };

    console.log(`📤 Sending streaming command to device ${device.token}: ${action}`);

    const response = await mqttService.sendCommandAndWait(
      device.token,
      'streaming',
      payload,
      30000
    );

    console.log(`✅ Streaming command response received from device ${device.token}`);

    res.status(200).json({
      success: true,
      message: `Streaming ${action.toLowerCase()} command sent successfully`,
      data: response
    });
  } catch (error) {
    if (error.message === 'Device response timeout') {
      return res.status(408).json({
        success: false,
        message: 'Device did not respond in time'
      });
    }
    next(error);
  }
};

/**
 * @desc    Get status of all devices for user
 * @route   GET /api/device/:userID/status
 * @access  Private
 */
const getAllDeviceStatus = async (req, res, next) => {
  try {
    const { userID } = req.params;

    // Validation
    if (!isValidObjectId(userID)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid user ID'
      });
    }

    // Check authorization
    if (req.user._id.toString() !== userID) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    const user = await User.findById(userID).populate({
      path: 'deviceList',
      select: 'token status lastSeen streamingUrl'
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const deviceStatus = user.deviceList.map(device => ({
      deviceID: device._id,
      token: device.token,
      status: device.status,
      lastSeen: device.lastSeen,
      isOnline: device.isOnline(),
      streamingUrl: device.streamingUrl
    }));

    console.log(`📊 Device status fetched for user: ${userID}`);

    res.status(200).json({
      success: true,
      count: deviceStatus.length,
      data: deviceStatus
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get status of single device
 * @route   GET /api/device/:userID/status/:deviceID
 * @access  Private
 */
const getSingleDeviceStatus = async (req, res, next) => {
  try {
    const { userID, deviceID } = req.params;

    // Validation
    if (!isValidObjectId(userID) || !isValidObjectId(deviceID)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid user ID or device ID'
      });
    }

    // Check authorization
    if (req.user._id.toString() !== userID) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    // Verify device ownership
    const user = await User.findById(userID);
    const deviceExists = user.deviceList.some(
      devId => devId.toString() === deviceID
    );

    if (!deviceExists) {
      return res.status(403).json({
        success: false,
        message: 'You do not have access to this device'
      });
    }

    const device = await Device.findById(deviceID);
    if (!device) {
      return res.status(404).json({
        success: false,
        message: 'Device not found'
      });
    }

    console.log(`📊 Device status fetched: ${deviceID}`);

    res.status(200).json({
      success: true,
      data: {
        deviceID: device._id,
        token: device.token,
        status: device.status,
        lastSeen: device.lastSeen,
        isOnline: device.isOnline(),
        streamingUrl: device.streamingUrl,
        recordCount: device.recordList.length
      }
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getDeviceList,
  getMemoryList,
  sendMemoryCommand,
  sendStreamingCommand,
  getAllDeviceStatus,
  getSingleDeviceStatus
};