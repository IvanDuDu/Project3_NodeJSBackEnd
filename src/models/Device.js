// src/models/Device.js
const mongoose = require('mongoose');

const DeviceStatus = {
  OFF: 'OFF',
  STREAMING: 'STREAMING',
  MEMORY: 'MEMORY',
  RECORDING: 'RECORDING'
};

const deviceSchema = new mongoose.Schema({
  token: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  status: {
    type: String,
    enum: Object.values(DeviceStatus),
    default: DeviceStatus.OFF
  },
  recordList: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Record'
  }],
  lastSeen: {
    type: Date,
    default: Date.now
  },
  streamingUrl: {
    type: String,
    default: null
  },
  isPaired: {
    type: Boolean,
    default: false
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Update timestamp before update
deviceSchema.pre('findOneAndUpdate', function(next) {
  this.set({ updatedAt: Date.now() });
  next();
});

// Update lastSeen when status changes
deviceSchema.pre('save', function(next) {
  if (this.isModified('status')) {
    this.lastSeen = Date.now();
  }
  next();
});

// Static method to update device status
deviceSchema.statics.updateStatus = async function(token, status) {
  return await this.findOneAndUpdate(
    { token },
    { status, lastSeen: Date.now(), updatedAt: Date.now() },
    { new: true }
  );
};

// Static method to check if device is online
deviceSchema.methods.isOnline = function() {
  const fiveMinutesAgo = Date.now() - (5 * 60 * 1000);
  return this.lastSeen > fiveMinutesAgo && this.status !== DeviceStatus.OFF;
};

module.exports = mongoose.model('Device', deviceSchema);
module.exports.DeviceStatus = DeviceStatus;