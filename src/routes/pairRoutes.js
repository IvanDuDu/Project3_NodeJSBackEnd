// src/routes/pairRoutes.js
const express = require('express');
const router = express.Router();
const {
  initiatePairing,
  checkPairingStatus,
  unpairDevice,
  getPairedDevices
} = require('../controllers/pairingController');
const { protect } = require('../middleware/auth');

// All routes are protected
router.use(protect);

// Pairing routes
router.get('/:userID', initiatePairing);
router.get('/:userID/status/:token', checkPairingStatus);
router.get('/:userID/devices', getPairedDevices);
router.delete('/:userID/device/:deviceID', unpairDevice);

module.exports = router;