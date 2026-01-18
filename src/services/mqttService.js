// src/services/mqttService.js
const mqtt = require('mqtt');
const Device = require('../models/Device');
const Record = require('../models/Record');
const { DeviceStatus } = require('../models/Device');

class MQTTService {
  constructor() {
    this.client = null;
    this.pendingRequests = new Map(); // For command responses (memory, streaming, upload)
    this.pairingRequests = new Map(); // For pairing tokens waiting for device
  }

  connect() {
    const options = {
      clientId: process.env.MQTT_CLIENT_ID || 'iot_server_client',
      username: process.env.MQTT_USERNAME,
      password: process.env.MQTT_PASSWORD,
      clean: true,
      reconnectPeriod: 5000
    };

    this.client = mqtt.connect(process.env.MQTT_BROKER_URL, options);

    this.client.on('connect', () => {
      console.log(' Connected to MQTT Broker');
      this.subscribeToTopics();
    });

    this.client.on('error', (error) => {
      console.error(' MQTT Error:', error);
    });

    this.client.on('message', async (topic, message) => {
      await this.handleMessage(topic, message);
    });

    this.client.on('offline', () => {
      console.log('  MQTT Client is offline');
    });

    this.client.on('reconnect', () => {
      console.log(' Reconnecting to MQTT Broker...');
    });
  }

  subscribeToTopics() {
  const topics = [
      'api/+/cam/memory/filename',          //  NEW RECORD from device
      'api/+/cam/memory',          // Memory command response
      'api/+/cam/memory/status',   // Memory status update
      'api/+/cam/stream',       // Streaming ON/OFF response
      'api/+/cam/stream/status',   // streaming address
      'api/+/cam/connect/status',  // Connection status update
      'api/+/cam/device/ip',          // Upload IP
      'api/+/pair'     ,            // Pairing response
      'api/+/'        
    ];

    
    topics.forEach(topic => {
      this.client.subscribe(topic, (err) => {
        if (err) {
          console.error(` Failed to subscribe to ${topic}:`, err);
        } else {
          console.log(` Subscribed to topic: ${topic}`);
        }
      });
    });
  }

  async handleMessage(topic, message) {
    try {
      const payload = message.toString();
      console.log(` MQTT Message - Topic: ${topic}, Payload: ${payload}`);

      const topicParts = topic.split('/');
      const token = topicParts[1];

      if (topic.includes('/pair')||topic.includes('/cam/stream/status')) {
          
        const existingDevice = await Device.findOne({ token });
        if(existingDevice){
           await this.handleStreamStatus(token, payload);
        }else{
           await this.handlePairingConfirmation(token, payload);
        }
      } else if (topic.includes('/cam/memory/filename')) {
        await this.handleNewRecord(token, payload);
      } else if (topic.includes('/cam/memory/status')) {
        await this.handleStatusUpdate(token, 'memory', payload);
      } else if (topic.includes('/cam/device/ip')) {
        await this.handleStreamStatus(token, payload);
      } else if (topic.includes('/cam/connect/status')) {
        await this.handleStatusUpdate(token, 'recording', payload);
      } else if (topic.includes('/cam/memory') && !topic.includes('/status')) {
        await this.handleCommandResponse(token, 'memory', payload);
      } else if (topic.includes('/cam/stream')) {
        await this.handleCommandResponse(token, 'stream', payload);
      } else if (topic.includes('/cam/upload')) {
        await this.handleCommandResponse(token, 'upload', payload);
      } else {
        console.log('  Unhandled topic:', topic);
      }
    } catch (error) {
      console.error(' Error handling MQTT message:', error);
    }
  }

  /**
   * Handle pairing confirmation from device
   * Device publishes to: api/{token}/pair
   */
  async handlePairingConfirmation(token, payload) {
    try {
      console.log(` Processing pairing confirmation for token: ${token}`);

      // Check if there's a pending pairing request waiting for this token
      const pairingRequest = this.pairingRequests.get(token);
      
      if (!pairingRequest) {
        console.log(`  No pending pairing request found for token: ${token}`);
        return;
      }

      console.log(` Found pending pairing request for token: ${token}`);

      // Parse device data if provided
      let deviceData = {};
      try {
        deviceData = JSON.parse(token);
      } catch (e) {
        // If payload is not JSON, treat as simple confirmation
        deviceData = { confirmed: true };
      }

      // Resolve the pairing promise
      if (pairingRequest.resolve) {
        pairingRequest.resolve(deviceData);
      }

      // Clean up
      this.pairingRequests.delete(token);
      console.log(` Pairing confirmed for token: ${token}`);

    } catch (error) {
      console.error(' Error handling pairing confirmation:', error);
      
      // Reject the pairing promise if it exists
      const pairingRequest = this.pairingRequests.get(token);
      if (pairingRequest && pairingRequest.reject) {
        pairingRequest.reject(error);
      }
      this.pairingRequests.delete(token);
    }
  }

  /**
   * Handle command responses (memory, streaming, upload)
   */
  async handleCommandResponse(token, commandType, payload) {
    try {
      const requestKey = `${commandType}_${token}`;
      const pendingRequest = this.pendingRequests.get(requestKey);
      
      if (!pendingRequest) {
        console.log(`  No pending ${commandType} request for token: ${token}`);
        return;
      }

      console.log(` Received ${commandType} response from device: ${token}`);

      // Parse response
      let responseData = {};
      try {
        responseData = JSON.parse(payload);
      } catch (e) {
        responseData = { raw: payload };
      }

      // Update device status based on command type
      if (commandType === 'stream' && responseData.status === 'ON') {
        await Device.findOneAndUpdate(
          { token },
          { 
            status: DeviceStatus.STREAMING,
            streamingUrl: responseData.streamUrl || responseData.ip,
            lastSeen: Date.now()
          }
        );
      }

      // Resolve the promise
      if (pendingRequest.resolve) {
        pendingRequest.resolve(responseData);
      }

      // Clean up
      this.pendingRequests.delete(requestKey);

    } catch (error) {
      console.error(` Error handling ${commandType} response:`, error);
      
      const requestKey = `${commandType}_${token}`;
      const pendingRequest = this.pendingRequests.get(requestKey);
      if (pendingRequest && pendingRequest.reject) {
        pendingRequest.reject(error);
      }
      this.pendingRequests.delete(requestKey);
    }
  }

  /**
   * Handle status updates from device
   */
  async handleStatusUpdate(token, statusType, payload) {
    try {
      const isOn = payload.toUpperCase() === 'ON';
      let newStatus = DeviceStatus.OFF;

      if (isOn) {
        switch (statusType) {
          case 'memory':
            newStatus = DeviceStatus.MEMORY;
            break;
          case 'streaming':
            newStatus = DeviceStatus.STREAMING;
            break;
          case 'recording':
            newStatus = DeviceStatus.RECORDING;
            break;
        }
      }

      const device = await Device.findOneAndUpdate(
        { token },
        { status: newStatus, lastSeen: Date.now() },
        { new: true }
      );

      if (device) {
        console.log(` Device ${token} status updated to: ${newStatus}`);
      } else {
        console.log(` Device not found for token: ${token}`);
      }

    } catch (error) {
      console.error(' Error updating device status:', error);
    }
  }

  /**
   * Handle streaming status with IP address
   */
  async handleStreamStatus(token, payload) {
    try {
      // Payload is the IP address
      const ipAddress = payload.trim();
      
      const device = await Device.findOneAndUpdate(
        { token },
        { 
          ipAdress: ipAddress,
          lastSeen: Date.now()
        },
        { new: true }
      );

      if (device) {
        console.log(` Device ${token} stream at IP: ${ipAddress}`);
      }

    } catch (error) {
      console.error(' Error saving device IP address:', error);
    }
  }

  /**
   * Handle new record notification from device
   * Device publishes to: api/{token}/cam/memory/filename
   * Payload: folderName (in base36 format)
   */
  async handleNewRecord(token, payload) {
    try {
      console.log(` Processing new record for token: ${token}`);
      let encodeName= payload

      // Decode folder name from base36
      let folderName='';
      try {
      let value = 0;

        // payload là LSB-first → đảo chuỗi
        for (let i = payload.length - 1; i >= 0; i--) {
          const c = payload[i];
          let digit = 0;

          if (c >= '0' && c <= '9') digit = c.charCodeAt(0) - 48;
          else if (c >= 'A' && c <= 'Z') digit = c.charCodeAt(0) - 65 + 10;
          else throw new Error("Invalid base36 char");

          value = value * 36 + digit;
        }
        while( value>0 ){
          const rem = value %100;
          folderName = rem.toString() + folderName;
          value = Math.floor(value/100);
        }

        console.log(` Decoded folder name: ${payload} -> ${folderName}`);
      } catch (decodeError) {
        console.error(' Failed to decode base36 folder name:', decodeError);
        return;
      }

      // Find device
      const device = await Device.findOne({ token });
      if (!device) {
        console.error(` Device not found for token: ${token}`);
        return;
      }

      // Check if record already exists
      const existingRecord = await Record.findOne({
        folderName,
        deviceId: device._id
      });

      if (existingRecord) {
        console.log(`  Record already exists: ${folderName}`);
        return;
      }

      // Create new record
      const record = await Record.create({
        folderName,
        encodeName: encodeName,
        deviceId: device._id,
        fileCount: 0,
        size: 0,
        uploadStatus: 'pending'
      });

      // Add to device's recordList
      device.recordList.push(record._id);
      await device.save();

      console.log(` New record created: ${record._id} (${folderName})`);

    } catch (error) {
      console.error(' Error handling new record:', error);
    }
  }

  /**
   * Publish message to MQTT topic
   */
  publish(topic, message, options = {}) {
    return new Promise((resolve, reject) => {
      if (!this.client || !this.client.connected) {
        return reject(new Error('MQTT client not connected'));
      }

      this.client.publish(topic, message, options, (err) => {
        if (err) {
          console.error(` Failed to publish to ${topic}:`, err);
          reject(err);
        } else {
          console.log(` Published to ${topic}: ${message}`);
          resolve();
        }
      });
    });
  }

  /**
   * Send command to device and wait for response
   * @param {string} token - Device token
   * @param {string} commandType - Command type: 'memory', 'stream', 'upload'
   * @param {object} payload - Command payload
   * @param {number} timeout - Timeout in milliseconds
   */
  sendCommandAndWait(token, commandType, payload, timeout = 30000) {
    return new Promise((resolve, reject) => {
      const requestKey = `${commandType}_${token}`;
      
      // Set timeout
      const timer = setTimeout(() => {
        console.log(` Command ${commandType} timeout for device: ${token}`);
        this.pendingRequests.delete(requestKey);
        reject(new Error('Device response timeout'));
      }, timeout);

      // Store pending request
      this.pendingRequests.set(requestKey, {
        resolve: (data) => {
          clearTimeout(timer);
          resolve(data);
        },
        reject: (err) => {
          clearTimeout(timer);
          reject(err);
        },
        timestamp: Date.now()
      });

      // Publish command
      const topic = `api/${token}/cam/${commandType}`;
      this.publish(topic, payload)
        .catch(err => {
          clearTimeout(timer);
          this.pendingRequests.delete(requestKey);
          reject(err);
        });
    });
  }

  /**
   * Wait for device to confirm pairing
   * @param {string} token - Pairing token
   * @param {number} timeout - Timeout in milliseconds (default 5 minutes)
   */
  waitForPairing(token, timeout = 300000) {
    return new Promise((resolve, reject) => {
      console.log(` Waiting for device pairing with token: ${token}`);

      // Set timeout
      const timer = setTimeout(() => {
        this.pairingRequests.delete(token);
        reject(new Error('Pairing timeout'));
      }, timeout);

      // Store pairing request
      this.pairingRequests.set(token, {
        resolve: (data) => {
          clearTimeout(timer);
          resolve(data);
        },
        reject: (err) => {
          clearTimeout(timer);
          reject(err);
        },
        timestamp: Date.now()
      });
    });
  }

  /**
   * Check if there's a pending pairing request for a token
   */
  hasPendingPairing(token) {
    return this.pairingRequests.has(token);
  }

  /**
   * Check if there's a pending command request for a device
   */
  hasPendingCommand(token, commandType) {
    const requestKey = `${commandType}_${token}`;
    return this.pendingRequests.has(requestKey);
  }

  /**
   * Get all pending pairing tokens
   */
  getPendingPairings() {
    return Array.from(this.pairingRequests.keys());
  }

  /**
   * Cancel a pending pairing request
   */
  cancelPairing(token) {
    const request = this.pairingRequests.get(token);
    if (request && request.reject) {
      request.reject(new Error('Pairing cancelled'));
    }
    this.pairingRequests.delete(token);
  }

  /**
   * Cleanup expired requests (optional maintenance function)
   */
  cleanupExpiredRequests() {
    const now = Date.now();
    const expireTime = 5 * 60 * 1000; // 5 minutes

    // Cleanup pairing requests
    for (const [token, request] of this.pairingRequests.entries()) {
      if (now - request.timestamp > expireTime) {
        console.log(` Cleaning up expired pairing request: ${token}`);
        if (request.reject) {
          request.reject(new Error('Request expired'));
        }
        this.pairingRequests.delete(token);
      }
    }

    // Cleanup command requests
    for (const [key, request] of this.pendingRequests.entries()) {
      if (now - request.timestamp > expireTime) {
        console.log(` Cleaning up expired command request: ${key}`);
        if (request.reject) {
          request.reject(new Error('Request expired'));
        }
        this.pendingRequests.delete(key);
      }
    }
  }

  disconnect() {
    if (this.client) {
      this.client.end();
      console.log('Disconnected from MQTT Broker');
    }
  }
}

module.exports = new MQTTService();