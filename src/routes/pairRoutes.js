// src/routes/pairRoutes.js
const express = require('express');
const router = express.Router();
const {
  initiatePairing,
  checkPairingStatus,
  cancelPairing,
  unpairDevice,
  getPairedDevices,
  getPendingPairings
} = require('../controllers/pairingController');
const { protect } = require('../middleware/auth');

// All routes are protected
router.use(protect);

// Pairing initiation and status check
router.get('/:userID', initiatePairing);
router.get('/:userID/status/:token', checkPairingStatus);

// Cancel pending pairing
router.delete('/:userID/cancel/:token', cancelPairing);

// Get all paired devices
router.get('/:userID/devices', getPairedDevices);

// Unpair a device
router.delete('/:userID/device/:deviceID', unpairDevice);

// Get pending pairings (for debugging)
router.get('/pending/all', getPendingPairings);

module.exports = router;