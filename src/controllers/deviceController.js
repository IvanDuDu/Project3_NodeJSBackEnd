// src/controllers/deviceController.js
const User = require('../models/User');
const Device = require('../models/Device');
const { DeviceStatus } = require('../models/Device');
const Record = require('../models/Record');
const mqttService = require('../services/mqttService');
const videoService = require('../services/videoService');
const { isValidObjectId } = require('../utils/validators');
const path = require('path');
const fs = require('fs').promises;

/**
 * @desc    Get device list for user
 * @route   GET /api/user/:userID/deviceList
 * @access  Private
 */
const getDeviceList = async (req, res, next) => {
  try {
    const { userID } = req.params;

    if (!isValidObjectId(userID)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid user ID'
      });
    }

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

    console.log(` Device list fetched for user: ${userID}`);

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

    if (!isValidObjectId(userID) || !isValidObjectId(deviceID)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid user ID or device ID'
      });
    }

    if (req.user._id.toString() !== userID) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

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

    const device = await Device.findById(deviceID).populate({
      path: 'recordList',
      select: 'folderName encodeName fileCount size uploadStatus metadata createdAt',
      options: { sort: { createdAt: -1 } }
    });

    if (!device) {
      return res.status(404).json({
        success: false,
        message: 'Device not found'
      });
    }

    // Check which records have videos
    const recordsWithVideoStatus = await Promise.all(
      device.recordList.map(async (record) => {
        const hasVideo = await videoService.videoExists(record.encodeName);
        return {
          ...record.toObject(),
          hasVideo,
          videoUrl: hasVideo ? `/uploads/${record.encodeName}.mp4` : null
        };
      })
    );

    console.log(` Memory list fetched for device: ${deviceID}`);

    res.status(200).json({
      success: true,
      count: recordsWithVideoStatus.length,
      data: recordsWithVideoStatus
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

    // Check if video already exists
    const videoExists = await videoService.videoExists(record.encodeName);

    if (videoExists) {
      console.log(` Video already exists for record: ${record.encodeName}`);
      
      // Get video info
      const videoPath = videoService.getVideoPath(record.encodeName);
      const videoInfo = await videoService.getVideoInfo(videoPath);
      
      const baseUrl = `${req.protocol}://${req.get('host')}`;
      const videoUrl = `${baseUrl}/uploads/${record.encodeName}.mp4`;

      return res.status(200).json({
        success: true,
        message: 'Video is ready',
        data: {
          recordID: record._id,
          folderName: record.folderName,
          encodeName: record.encodeName,
          videoUrl: videoUrl,
          videoPath: `/uploads/${record.encodeName}.mp4`,
          videoInfo: {
            duration: videoInfo.duration,
            size: videoInfo.size,
            resolution: `${videoInfo.width}x${videoInfo.height}`,
            fps: videoInfo.fps
          },
          status: 'ready'
        }
      });
    }

    // Video doesn't exist, request from device
    console.log(` Requesting memory data from device ${device.token}`); 

    // Send command to device via MQTT 
    const payload = record.encodeName;

    const response = await mqttService.sendCommandAndWait(
      device.token,
      'memory',
      payload,
      30000
    );

    console.log(` Memory command response received from device ${device.token}`);

    // Update record status
    record.uploadStatus = 'uploading';
    await record.save();

    res.status(202).json({
      success: true,
      message: 'Video is being prepared. Images are being uploaded from device.',
      data: {
        recordID: record._id,
        folderName: record.folderName,
        encodeName: record.encodeName,
        status: 'uploading',
        estimatedTime: '30-60 seconds',
        deviceResponse: response
      }
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
 * @desc    Get video status for a record
 * @route   GET /api/user/:userID/device/:deviceID/record/:recordID/video-status
 * @access  Private
 */
const getVideoStatus = async (req, res, next) => {
  try {
    const { userID, deviceID, recordID } = req.params;

    // Validation
    if (!isValidObjectId(userID) || !isValidObjectId(deviceID) || !isValidObjectId(recordID)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid IDs'
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

    // Get record
    const record = await Record.findById(recordID);
    if (!record) {
      return res.status(404).json({
        success: false,
        message: 'Record not found'
      });
    }

    // Check video status
    const videoExists = await videoService.videoExists(record.encodeName);

    if (videoExists) {
      const videoPath = videoService.getVideoPath(record.encodeName);
      const videoInfo = await videoService.getVideoInfo(videoPath);
      const baseUrl = `${req.protocol}://${req.get('host')}`;

      return res.status(200).json({
        success: true,
        data: {
          recordID: record._id,
          encodeName: record.encodeName,
          status: 'ready',
          videoUrl: `${baseUrl}/uploads/${record.encodeName}.mp4`,
          videoInfo: {
            duration: videoInfo.duration,
            size: videoInfo.size,
            resolution: `${videoInfo.width}x${videoInfo.height}`,
            fps: videoInfo.fps
          }
        }
      });
    }

    res.status(200).json({
      success: true,
      data: {
        recordID: record._id,
        encodeName: record.encodeName,
        status: record.uploadStatus,
        message: record.uploadStatus === 'uploading' 
          ? 'Video is being prepared' 
          : 'Video not available yet'
      }
    });

  } catch (error) {
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
    const { action } = req.body;

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

    if (req.user._id.toString() !== userID) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

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
    
    const payload = action.toUpperCase();

    console.log(` Sending streaming command to device ${device.token}: ${action}`);



    const response = await mqttService.sendCommandAndWait(
      device.token,
      'stream',
      payload,
      10000
    );
    console.log(` Device response: ${JSON.stringify(response)}`);

    console.log(` Streaming command response received from device ${device.token}`);

    res.status(200).json({
      success: true,
      message: `Streaming ${action.toLowerCase()} command sent successfully`,
      deviceIP: device.ipAdress,
    });
    console.log(` Streaming command response received from device ${device.ipAdress}`);

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

    if (!isValidObjectId(userID)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid user ID'
      });
    }

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

    console.log(` Device status fetched for user: ${userID}`);

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

    if (!isValidObjectId(userID) || !isValidObjectId(deviceID)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid user ID or device ID'
      });
    }

    if (req.user._id.toString() !== userID) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

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

    console.log(` Device status fetched: ${deviceID}`);

    res.status(200).json({
      success: true,
      data: {
        deviceID: device._id,
        token: device.token,
        status: device.status,
        lastSeen: device.lastSeen,
        isOnline: device.isOnline(),
        streamingUrl: device.ipAdress,
        recordCount: device.recordList.length
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Request device to upload record files
 * @route   POST /api/user/:userID/device/:deviceID/upload
 * @access  Private
 */
const requestUpload = async (req, res, next) => {
  try {
    const { userID, deviceID } = req.params;
    const { recordID } = req.body;

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

    if (req.user._id.toString() !== userID) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

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

    if (record.deviceId.toString() !== deviceID) {
      return res.status(403).json({
        success: false,
        message: 'Record does not belong to this device'
      });
    }

    record.uploadStatus = 'uploading';
    await record.save();

    const payload = {
      command: 'UPLOAD_MEMORY',
      recordID: record._id.toString(),
      folderName: record.folderName
    };

    console.log(` Sending upload request to device ${device.token} for record: ${record.folderName}`);

    const response = await mqttService.sendCommandAndWait(
      device.token,
      'upload',
      payload,
      300000
    );

    if (response.status === 'ESP_FAILED') {
      record.uploadStatus = 'failed';
      await record.save();

      return res.status(500).json({
        success: false,
        message: 'Device failed to process upload request',
        data: response
      });
    }

    console.log(` Device acknowledged upload request: ${device.token}`);

    res.status(200).json({
      success: true,
      message: 'Upload request sent successfully. Device is uploading files.',
      data: {
        recordID: record._id,
        folderName: record.folderName,
        uploadStatus: 'uploading',
        deviceResponse: response
      }
    });

  } catch (error) {
    if (req.body.recordID) {
      await Record.findByIdAndUpdate(req.body.recordID, {
        uploadStatus: 'failed'
      });
    }

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
 * @desc    Receive uploaded JPEG files from device
 * @route   POST /upload?fileName=xxx&deviceToken=xxx
 * @access  Public (called by device)
 */
const receiveUpload = async (req, res, next) => {
  try {
    const { fileName, deviceToken } = req.query;
    
    console.log(` Receiving upload - File: ${fileName}, Token: ${deviceToken}`);

    if (!deviceToken) {
      return res.status(400).json({
        success: false,
        message: 'Device token is required'
      });
    }

    // Verify device exists
    const device = await Device.findOne({ token: deviceToken });
    if (!device) {
      return res.status(404).json({
        success: false,
        message: 'Device not found'
      });
    }

    // fileName is encodeName
    const record = await Record.findOne({ 
      encodeName: fileName,
      deviceId: device._id 
    });
    
    if (!record) {
      return res.status(404).json({
        success: false,
        message: 'Record not found'
      });
    }

    // Process uploaded file
    const fileBuffer = req.body;
    const fileSize = fileBuffer.length;

    console.log(` File size: ${(fileSize / 1024).toFixed(2)} KB`);

    // Save file to storage
    const uploadDir = path.join(__dirname, '../../uploads', record.encodeName);
    await fs.mkdir(uploadDir, { recursive: true });
    
    const filePath = path.join(uploadDir, `image_${Date.now()}.jpg`);
    await fs.writeFile(filePath, fileBuffer);

    console.log(` File saved: ${filePath}`);

    // Update record
    record.fileCount += 1;
    record.size += fileSize;
    await record.save();

    console.log(`Upload completed for record: ${record._id} (${record.fileCount} files)`);
    
    res.status(200).json({
      success: true,
      message: 'File uploaded successfully',
      data: {
        fileName: fileName,
        size: fileSize,
        recordId: record._id,
        fileCount: record.fileCount
      }
    });

  } catch (error) {
    console.error(' Upload error:', error);
    next(error);
  }
};

/**
 * @desc    Finalize upload and convert to video
 * @route   POST /api/user/:userID/device/:deviceID/record/:recordID/finalize
 * @access  Public (called by device after all images uploaded)
 */
const finalizeUpload = async (req, res, next) => {
  try {
    const { userID, deviceID, recordID } = req.params;

    console.log(` Finalizing upload for record: ${recordID}`);

    // Get record
    const record = await Record.findById(recordID);
    if (!record) {
      return res.status(404).json({
        success: false,
        message: 'Record not found'
      });
    }

    // Update record status
    record.uploadStatus = 'processing';
    await record.save();

    // Convert images to video
    try {
      const videoPath = await videoService.convertImagesToVideo(record.encodeName, 10);
      
      // Get video info
      const videoInfo = await videoService.getVideoInfo(videoPath);
      
      // Update record with video info
      record.uploadStatus = 'completed';
      record.metadata = {
        duration: videoInfo.duration,
        resolution: `${videoInfo.width}x${videoInfo.height}`,
        fps: videoInfo.fps
      };
      await record.save();

      console.log(` Video created for record: ${record._id}`);

      res.status(200).json({
        success: true,
        message: 'Video created successfully',
        data: {
          recordID: record._id,
          encodeName: record.encodeName,
          videoPath: `/uploads/${record.encodeName}.mp4`,
          videoInfo: {
            duration: videoInfo.duration,
            size: videoInfo.size,
            resolution: `${videoInfo.width}x${videoInfo.height}`,
            fps: videoInfo.fps
          }
        }
      });

    } catch (error) {
      console.error(' Error creating video:', error);
      record.uploadStatus = 'failed';
      await record.save();

      return res.status(500).json({
        success: false,
        message: 'Failed to create video',
        error: error.message
      });
    }

  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get upload progress/status
 * @route   GET /api/user/:userID/device/:deviceID/record/:recordID/upload-status
 * @access  Private
 */
const getUploadStatus = async (req, res, next) => {
  try {
    const { userID, deviceID, recordID } = req.params;

    if (!isValidObjectId(userID) || !isValidObjectId(deviceID) || !isValidObjectId(recordID)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid IDs'
      });
    }

    if (req.user._id.toString() !== userID) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

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

    const record = await Record.findById(recordID);
    if (!record) {
      return res.status(404).json({
        success: false,
        message: 'Record not found'
      });
    }

    const videoExists = await videoService.videoExists(record.encodeName);

    res.status(200).json({
      success: true,
      data: {
        recordID: record._id,
        folderName: record.folderName,
        encodeName: record.encodeName,
        uploadStatus: record.uploadStatus,
        fileCount: record.fileCount,
        size: record.size,
        hasVideo: videoExists,
        lastUpdated: record.updatedAt
      }
    });

  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get stream from device
 * @route   GET /api/user/:userID/device/:deviceID/getStream
 * @access  Private
 */
const getStream = async (req, res, next) => {
  try {
    const { userID, deviceID } = req.params;

    if (!isValidObjectId(userID) || !isValidObjectId(deviceID)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid user ID or device ID'
      });
    }

    if (req.user._id.toString() !== userID) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

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

    if (!device.ipAdress || device.ipAdress === '') {
      return res.status(404).json({
        success: false,
        message: 'Device IP address not available. Make sure device is online.'
      });
    }

    if (device.status !== DeviceStatus.STREAMING) {
      const payload = {
        command: 'START_STREAMING',
        action: 'ON'
      };

      console.log(` Requesting streaming from device ${device.token}`);

      try {
        const response = await mqttService.sendCommandAndWait(
          device.token,
          'stream',
          payload,
          5000
        );

        console.log(` Streaming started on device ${device.token}`);
      } catch (error) {
        if (error.message === 'Device response timeout') {
          return res.status(408).json({
            success: false,
            message: 'Device did not respond in time'
          });
        }
        throw error;
      }
    }

    const streamUrl = `http://${device.ipAdress}:81/stream`;

    console.log(` Stream URL provided for device: ${deviceID}`);

    res.status(200).json({
      success: true,
      message: 'Stream URL retrieved successfully',
      data: {
        deviceID: device._id,
        streamUrl: streamUrl,
        ipAddress: device.ipAdress,
        status: device.status
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
  getSingleDeviceStatus,
  requestUpload,
  receiveUpload,
  finalizeUpload,
  getUploadStatus,
  getVideoStatus,
  getStream
};