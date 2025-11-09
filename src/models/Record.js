// src/models/Record.js
const mongoose = require('mongoose');

const recordSchema = new mongoose.Schema({
  folderName: {
    type: String,
    required: [true, 'Folder name is required'],
    trim: true
  },
  deviceId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Device',
    required: true,
    index: true
  },
  fileCount: {
    type: Number,
    default: 0
  },
  size: {
    type: Number,
    default: 0,
    comment: 'Size in bytes'
  },
  uploadStatus: {
    type: String,
    enum: ['pending', 'uploading', 'completed', 'failed'],
    default: 'pending'
  },
  metadata: {
    duration: Number,
    resolution: String,
    fps: Number
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

// Create compound index for faster queries
recordSchema.index({ deviceId: 1, createdAt: -1 });

// Update timestamp before update
recordSchema.pre('findOneAndUpdate', function(next) {
  this.set({ updatedAt: Date.now() });
  next();
});

// Static method to get records by device
recordSchema.statics.getByDevice = async function(deviceId) {
  return await this.find({ deviceId })
    .sort({ createdAt: -1 })
    .select('folderName fileCount size uploadStatus metadata createdAt');
};

module.exports = mongoose.model('Record', recordSchema);