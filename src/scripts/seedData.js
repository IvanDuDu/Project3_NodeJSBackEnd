// src/scripts/seedData.js
require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const Device = require('../models/Device');
const Record = require('../models/Record');

// MongoDB connection
const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/iot_camera_db', {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log(' MongoDB Connected for seeding');
  } catch (error) {
    console.error(' MongoDB connection error:', error);
    process.exit(1);
  }
};

// Clear all collections
const clearDatabase = async () => {
  try {
    await User.deleteMany({});
    await Device.deleteMany({});
    await Record.deleteMany({});
    console.log('  Database cleared');
  } catch (error) {
    console.error(' Error clearing database:', error);
    throw error;
  }
};

const seedDatabase = async () => {
  try {
    console.log(' Starting to seed database...\n');

    const device1 = await Device.create({
      token: 'test_token_12345',
      status: 'OFF',
      recordList: [],
      lastSeen: new Date(),
      createdAt: new Date('2024-01-15T08:00:00'),
    });


    // Create Records for Device 1
    const records1 = await Record.create([
      {
        folderName: 'REC_2024_01_15_Morning',
        deviceId: device1._id,
        fileCount: 15,
        size: 5242880, // 5MB
        uploadStatus: 'completed',
        metadata: {
          duration: 180,
          resolution: '1920x1080',
          fps: 30
        },
        createdAt: new Date('2024-01-15T09:30:00'),
      },
      {
        folderName: 'REC_2024_01_16_Afternoon',
        deviceId: device1._id,
        fileCount: 25,
        size: 8388608, // 8MB
        uploadStatus: 'completed',
        metadata: {
          duration: 300,
          resolution: '1920x1080',
          fps: 30
        },
        createdAt: new Date('2024-01-16T14:20:00'),
      },
      {
        folderName: 'REC_2024_01_17_Evening',
        deviceId: device1._id,
        fileCount: 10,
        size: 3145728, // 3MB
        uploadStatus: 'pending',
        metadata: {
          duration: 120,
          resolution: '1280x720',
          fps: 24
        },
        createdAt: new Date('2024-01-17T18:45:00'),
      }
    ]);

    // Update Device 1 with record IDs
    device1.recordList = records1.map(record => record._id);
    await device1.save();

    console.log(` ${records1.length} Records created for Device 1`);

    // Create User 1
    const user1 = await User.create({
      username: 'john_doe',
      password: 'password123', // Will be hashed by the pre-save hook
      deviceList: [device1._id],
      createdAt: new Date('2024-01-10T10:00:00'),
    });

    // ============================================
    // USER 2 with DEVICE 2 and RECORDS
    // ============================================

    // Create Device 2 for User 2
    const device2 = await Device.create({
      token: 'DEV_TOKEN_XYZ789',
      status: 'OFF',
      recordList: [],
      lastSeen: new Date(),
      createdAt: new Date('2024-01-18T10:30:00'),
    });


    // Create Records for Device 2
    const records2 = await Record.create([
      {
        folderName: 'REC_2024_01_18_Night',
        deviceId: device2._id,
        fileCount: 30,
        size: 10485760, // 10MB
        uploadStatus: 'completed',
        metadata: {
          duration: 360,
          resolution: '1920x1080',
          fps: 30
        },
        createdAt: new Date('2024-01-18T20:00:00'),
      },
      {
        folderName: 'REC_2024_01_19_Morning',
        deviceId: device2._id,
        fileCount: 20,
        size: 6291456, // 6MB
        uploadStatus: 'uploading',
        metadata: {
          duration: 240,
          resolution: '1920x1080',
          fps: 30
        },
        createdAt: new Date('2024-01-19T08:15:00'),
      },
      {
        folderName: 'REC_2024_01_20_Security',
        deviceId: device2._id,
        fileCount: 50,
        size: 15728640, // 15MB
        uploadStatus: 'completed',
        metadata: {
          duration: 600,
          resolution: '1280x720',
          fps: 24
        },
        createdAt: new Date('2024-01-20T16:30:00'),
      },
      {
        folderName: 'REC_2024_01_21_Test',
        deviceId: device2._id,
        fileCount: 5,
        size: 1048576, // 1MB
        uploadStatus: 'failed',
        metadata: {
          duration: 60,
          resolution: '640x480',
          fps: 15
        },
        createdAt: new Date('2024-01-21T11:00:00'),
      }
    ]);

    // Update Device 2 with record IDs
    device2.recordList = records2.map(record => record._id);
    await device2.save();

    console.log(` ${records2.length} Records created for Device 2`);

    // Create User 2
    const user2 = await User.create({
      username: 'jane_smith',
      password: 'securepass456', // Will be hashed by the pre-save hook
      deviceList: [device2._id],
      createdAt: new Date('2024-01-12T14:30:00'),
    });


      

  } catch (error) {
    console.error(' Error seeding database:', error);
    throw error;
  }
};

// Main execution
const run = async () => {
  try {
    await connectDB();
    await clearDatabase();
    await seedDatabase();
    
    console.log('\n Seed process completed!');
    process.exit(0);
  } catch (error) {
    console.error(' Seed process failed:', error);
    process.exit(1);
  }
};

// Run if called directly
if (require.main === module) {
  run();
}

module.exports = { seedDatabase, clearDatabase };