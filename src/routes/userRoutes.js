// src/routes/userRoutes.js
const express = require('express');
const router = express.Router();
const {
  register,
  login,
  deleteAccount,
  updateAccount,
  getProfile
} = require('../controllers/userController');
const { protect } = require('../middleware/auth');

// Public routes
router.post('/signin', register);
router.post('/login', login);

// Protected routes
router.get('/profile', protect, getProfile);
router.delete('/account', protect, deleteAccount);
router.post('/account', protect, updateAccount);

module.exports = router;