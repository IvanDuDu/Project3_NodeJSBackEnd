// src/services/mqttService.js
const mqtt = require('mqtt');
const Device = require('../models/Device');
const Record = require('../models/Record');
const { DeviceStatus } = require('../models/Device');

class MQTTService {
  constructor() {
    this.client = null;
    this.pendingRequests = new Map(); // Store pending requests waiting for device response
    this.pairingRequests = new Map(); // Store pending pairing requests
  }

  /**
   * Connect to MQTT Broker
   */
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
      console.log('✅ Connected to MQTT Broker');
      this.subscribeToTopics();
    });

    this.client.on('error', (error) => {
      console.error('❌ MQTT Error:', error);
    });

    this.client.on('message', async (topic, message) => {
      await this.handleMessage(topic, message);
    });

    this.client.on('offline', () => {
      console.log('⚠️  MQTT Client is offline');
    });

    this.client.on('reconnect', () => {
      console.log('🔄 Reconnecting to MQTT Broker...');
    });
  }

  /**
   * Subscribe to all device topics
   */
  subscribeToTopics() {
    // Subscribe to all device topics with wildcards
    const topics = [
      'api/+/cam/memory',
      'api/+/cam/memory/status',
      'api/+/cam/streaming',
      'api/+/cam/stream/status',
      'api/+/cam/connect/status',
      'api/+/cam/record',
      'api/+/pair'
    ];

    topics.forEach(topic => {
      this.client.subscribe(topic, (err) => {
        if (err) {
          console.error(`❌ Failed to subscribe to ${topic}:`, err);
        } else {
          console.log(`📡 Subscribed to topic: ${topic}`);
        }
      });
    });
  }

  /**
   * Handle incoming MQTT messages
   */
  async handleMessage(topic, message) {
    try {
      const payload = message.toString();
      console.log(`📨 MQTT Message - Topic: ${topic}, Payload: ${payload}`);

      const topicParts = topic.split('/');
      const token = topicParts[1];

      // Handle pairing request
      if (topic.includes('/pair')) {
        await this.handlePairingResponse(token, payload);
        return;
      }

      // Handle status updates
      if (topic.includes('/status')) {
        await this.handleStatusUpdate(topic, token, payload);
        return;
      }

      // Handle memory response
      if (topic.includes('/cam/memory') && !topic.includes('/status')) {
        await this.handleMemoryResponse(token, payload);
        return;
      }

      // Handle streaming response
      if (topic.includes('/cam/streaming')) {
        await this.handleStreamingResponse(token, payload);
        return;
      }

      // Handle new record from device
      if (topic.includes('/cam/record')) {
        await this.handleNewRecord(token, payload);
        return;
      }

    } catch (error) {
      console.error('❌ Error handling MQTT message:', error);
    }
  }

  /**
   * Handle device status updates
   */
  async handleStatusUpdate(topic, token, payload) {
    try {
      let status = DeviceStatus.OFF;

      if (topic.includes('/memory/status') && payload === 'ON') {
        status = DeviceStatus.MEMORY;
      } else if (topic.includes('/stream/status') && payload === 'ON') {
        status = DeviceStatus.STREAMING;
      } else if (topic.includes('/connect/status') && payload === 'ON') {
        status = DeviceStatus.RECORDING;
      }

      await Device.updateStatus(token, status);
      console.log(`📊 Device ${token} status updated to: ${status}`);
    } catch (error) {
      console.error('❌ Error updating device status:', error);
    }
  }

  /**
   * Handle pairing response from device
   */
  async handlePairingResponse(token, payload) {
    try {
      const pairingData = this.pairingRequests.get(token);
      
      if (pairingData && pairingData.callback) {
        const data = JSON.parse(payload);
        pairingData.callback(null, data);
        this.pairingRequests.delete(token);
        console.log(`✅ Device paired successfully with token: ${token}`);
      }
    } catch (error) {
      console.error('❌ Error handling pairing response:', error);
    }
  }

  /**
   * Handle memory response from device
   */
  async handleMemoryResponse(token, payload) {
    try {
      const requestData = this.pendingRequests.get(`memory_${token}`);
      
      if (requestData && requestData.callback) {
        const data = JSON.parse(payload);
        requestData.callback(null, data);
        this.pendingRequests.delete(`memory_${token}`);
        console.log(`✅ Memory response received from device: ${token}`);
      }
    } catch (error) {
      console.error('❌ Error handling memory response:', error);
    }
  }

  /**
   * Handle streaming response from device
   */
  async handleStreamingResponse(token, payload) {
    try {
      const requestData = this.pendingRequests.get(`streaming_${token}`);
      
      if (requestData && requestData.callback) {
        const data = JSON.parse(payload);
        
        // Update device with streaming URL
        await Device.findOneAndUpdate(
          { token },
          { streamingUrl: data.streamUrl || data.ip, status: DeviceStatus.STREAMING }
        );
        
        requestData.callback(null, data);
        this.pendingRequests.delete(`streaming_${token}`);
        console.log(`✅ Streaming response received from device: ${token}`);
      }
    } catch (error) {
      console.error('❌ Error handling streaming response:', error);
    }
  }

  /**
   * Handle new record notification from device
   */
  async handleNewRecord(token, payload) {
    try {
      const data = JSON.parse(payload);
      const { folderName } = data;

      // Find device by token
      const device = await Device.findOne({ token });
      if (!device) {
        console.error(`❌ Device not found for token: ${token}`);
        return;
      }

      // Create new record
      const record = await Record.create({
        folderName,
        deviceId: device._id
      });

      // Add record to device's recordList
      device.recordList.push(record._id);
      await device.save();

      console.log(`✅ New record created: ${folderName} for device: ${token}`);
    } catch (error) {
      console.error('❌ Error handling new record:', error);
    }
  }

  /**
   * Publish message to device
   */
  publish(topic, message, options = {}) {
    return new Promise((resolve, reject) => {
      if (!this.client || !this.client.connected) {
        return reject(new Error('MQTT client not connected'));
      }

      this.client.publish(topic, message, options, (err) => {
        if (err) {
          console.error(`❌ Failed to publish to ${topic}:`, err);
          reject(err);
        } else {
          console.log(`📤 Published to ${topic}: ${message}`);
          resolve();
        }
      });
    });
  }

  /**
   * Send command to device and wait for response
   */
  sendCommandAndWait(token, command, payload, timeout = 30000) {
    return new Promise((resolve, reject) => {
      const requestKey = `${command}_${token}`;
      const timer = setTimeout(() => {
        this.pendingRequests.delete(requestKey);
        reject(new Error('Device response timeout'));
      }, timeout);

      this.pendingRequests.set(requestKey, {
        callback: (err, data) => {
          clearTimeout(timer);
          if (err) reject(err);
          else resolve(data);
        }
      });

      const topic = `api/${token}/cam/${command}`;
      this.publish(topic, JSON.stringify(payload))
        .catch(err => {
          clearTimeout(timer);
          this.pendingRequests.delete(requestKey);
          reject(err);
        });
    });
  }

  /**
   * Wait for device pairing
   */
  waitForPairing(token, timeout = 300000) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pairingRequests.delete(token);
        reject(new Error('Pairing timeout'));
      }, timeout);

      this.pairingRequests.set(token, {
        callback: (err, data) => {
          clearTimeout(timer);
          if (err) reject(err);
          else resolve(data);
        }
      });

      console.log(`⏳ Waiting for device pairing with token: ${token}`);
    });
  }

  /**
   * Disconnect from MQTT broker
   */
  disconnect() {
    if (this.client) {
      this.client.end();
      console.log('📴 Disconnected from MQTT Broker');
    }
  }
}

// Export singleton instance
module.exports = new MQTTService();