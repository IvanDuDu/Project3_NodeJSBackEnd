// src/server.js
require('dotenv').config();
const app = require('./app');
const connectDB = require('./config/database');
const mqttService = require('./services/mqttService');

const PORT = process.env.PORT || 3000 ||80;

// Connect to MongoDB
connectDB();

// Connect to MQTT Broker
mqttService.connect();

// Start server
const server = app.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════════════╗
║                                                ║
║    IoT Camera Server Started                ║
║                                                ║
║    Port: ${PORT}                            ║
║    Environment: ${process.env.NODE_ENV || 'development'}              ║
║    MongoDB: Connected                        ║
║    MQTT: Connected                           ║
║                                                ║
╚════════════════════════════════════════════════╝
  `);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (err) => {
  console.error(' Unhandled Rejection:', err);
  server.close(() => process.exit(1));
});

// Handle SIGTERM
process.on('SIGTERM', () => {
  console.log(' SIGTERM received, shutting down gracefully...');
  server.close(() => {
    console.log(' Server closed');
    mqttService.disconnect();
    process.exit(0);
  });
});

// Handle SIGINT (Ctrl+C)
process.on('SIGINT', () => {
  console.log('\n SIGINT received, shutting down gracefully...');
  server.close(() => {
    console.log(' Server closed');
    mqttService.disconnect();
    process.exit(0);
  });
});