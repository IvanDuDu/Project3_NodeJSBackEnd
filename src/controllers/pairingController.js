// src/controllers/pairingController.js
const User = require('../models/User');
const Device = require('../models/Device');
const mqttService = require('../services/mqttService');
const { generateDeviceToken } = require('../utils/tokenGenerator');
const { isValidObjectId } = require('../utils/validators');

/**
 * @desc    Initiate device pairing
 * @route   GET /api/pair/:userID
 * @access  Private
 */
const initiatePairing = async (req, res, next) => {
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

    // Check if user exists
    const user = await User.findById(userID);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Generate unique device token
    let token;
    let tokenExists = true;
    
    while (tokenExists) {
      token = generateDeviceToken();
      const existingDevice = await Device.findOne({ token });
      tokenExists = !!existingDevice;
    }

    console.log(`🔄 Pairing initiated for user: ${userID}, Token: ${token}`);

    // Start waiting for device to connect with this token
    // This is an async operation that will complete when device responds
    mqttService.waitForPairing(token, 300000) // 5 minutes timeout
      .then(async (deviceData) => {
        try {
          // Create new device
          const device = await Device.create({
            token,
            status: 'OFF',
            isPaired: true,
            recordList: []
          });

          // Add device to user's device list
          user.deviceList.push(device._id);
          await user.save();

          console.log(`✅ Device paired successfully: ${token} for user: ${userID}`);
        } catch (error) {
          console.error('❌ Error completing pairing:', error);
        }
      })
      .catch((error) => {
        console.error(`❌ Pairing timeout for token: ${token}`, error.message);
      });

    // Return token immediately to client
    res.status(200).json({
      success: true,
      message: 'Pairing initiated. Please configure your device with this token.',
      data: {
        token,
        expiresIn: '5 minutes',
        instructions: `Configure your device to publish to topic: api/${token}/pair`
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Check pairing status
 * @route   GET /api/pair/:userID/status/:token
 * @access  Private
 */
const checkPairingStatus = async (req, res, next) => {
  try {
    const { userID, token } = req.params;

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

    // Check if device with this token exists and is paired
    const device = await Device.findOne({ token });

    if (!device) {
      return res.status(200).json({
        success: true,
        paired: false,
        message: 'Device not yet paired. Waiting for device connection...'
      });
    }

    // Check if this device belongs to the user
    const user = await User.findById(userID);
    const deviceBelongsToUser = user.deviceList.some(
      devId => devId.toString() === device._id.toString()
    );

    if (!deviceBelongsToUser) {
      return res.status(403).json({
        success: false,
        message: 'This device is paired to another user'
      });
    }

    res.status(200).json({
      success: true,
      paired: true,
      message: 'Device paired successfully',
      data: {
        deviceID: device._id,
        token: device.token,
        status: device.status,
        pairedAt: device.createdAt
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Unpair device
 * @route   DELETE /api/pair/:userID/device/:deviceID
 * @access  Private
 */
const unpairDevice = async (req, res, next) => {
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

    // Get user and verify device ownership
    const user = await User.findById(userID);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const deviceIndex = user.deviceList.findIndex(
      devId => devId.toString() === deviceID
    );

    if (deviceIndex === -1) {
      return res.status(403).json({
        success: false,
        message: 'You do not have access to this device'
      });
    }

    // Remove device from user's list
    user.deviceList.splice(deviceIndex, 1);
    await user.save();

    // Delete the device
    await Device.findByIdAndDelete(deviceID);

    console.log(`✅ Device unpaired: ${deviceID} from user: ${userID}`);

    res.status(200).json({
      success: true,
      message: 'Device unpaired successfully'
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get all paired devices for user
 * @route   GET /api/pair/:userID/devices
 * @access  Private
 */
const getPairedDevices = async (req, res, next) => {
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
      match: { isPaired: true },
      select: 'token status lastSeen isPaired createdAt'
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    res.status(200).json({
      success: true,
      count: user.deviceList.length,
      data: user.deviceList
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  initiatePairing,
  checkPairingStatus,
  unpairDevice,
  getPairedDevices
};