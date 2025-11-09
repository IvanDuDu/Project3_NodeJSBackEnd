// src/controllers/userController.js
const User = require('../models/User');
const Device = require('../models/Device');
const { generateJWT } = require('../utils/tokenGenerator');
const { isValidUsername, isValidPassword } = require('../utils/validators');

/**
 * @desc    Register new user
 * @route   POST /api/user/signin
 * @access  Public
 */
const register = async (req, res, next) => {
  try {
    const { username, password } = req.body;

    // Validation
    if (!username || !password) {
      return res.status(400).json({
        success: false,
        message: 'Please provide username and password'
      });
    }

    if (!isValidUsername(username)) {
      return res.status(400).json({
        success: false,
        message: 'Username must be 3-20 characters and contain only letters, numbers, and underscores'
      });
    }

    if (!isValidPassword(password)) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 6 characters'
      });
    }

    // Check if user already exists
    const existingUser = await User.findOne({ username });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'Username already exists'
      });
    }

    // Create user
    const user = await User.create({
      username,
      password,
      deviceList: []
    });

    // Generate token
    const token = generateJWT(user._id);

    console.log(`✅ User registered: ${username}`);

    res.status(201).json({
      success: true,
      message: 'User registered successfully',
      data: {
        userId: user._id,
        username: user.username,
        token
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Login user
 * @route   POST /api/user/login
 * @access  Public
 */
const login = async (req, res, next) => {
  try {
    const { username, password } = req.body;

    // Validation
    if (!username || !password) {
      return res.status(400).json({
        success: false,
        message: 'Please provide username and password'
      });
    }

    // Check if user exists (include password for comparison)
    const user = await User.findOne({ username }).select('+password');
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    // Check password
    const isPasswordMatch = await user.comparePassword(password);
    if (!isPasswordMatch) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    // Generate token
    const token = generateJWT(user._id);

    console.log(`✅ User logged in: ${username}`);

    res.status(200).json({
      success: true,
      message: 'Login successful',
      data: {
        userId: user._id,
        username: user.username,
        token
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Delete user account
 * @route   DELETE /api/user/account
 * @access  Private
 */
const deleteAccount = async (req, res, next) => {
  try {
    const userId = req.user._id;

    // Get user with devices
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Delete all devices associated with this user
    if (user.deviceList && user.deviceList.length > 0) {
      await Device.deleteMany({ _id: { $in: user.deviceList } });
    }

    // Delete user
    await User.findByIdAndDelete(userId);

    console.log(`✅ User account deleted: ${user.username}`);

    res.status(200).json({
      success: true,
      message: 'Account deleted successfully'
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Update user account
 * @route   POST /api/user/account
 * @access  Private
 */
const updateAccount = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const { username, password, newPassword } = req.body;

    const user = await User.findById(userId).select('+password');
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Update username
    if (username && username !== user.username) {
      if (!isValidUsername(username)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid username format'
        });
      }

      // Check if new username already exists
      const existingUser = await User.findOne({ username });
      if (existingUser) {
        return res.status(400).json({
          success: false,
          message: 'Username already exists'
        });
      }

      user.username = username;
    }

    // Update password
    if (newPassword) {
      if (!password) {
        return res.status(400).json({
          success: false,
          message: 'Current password is required to change password'
        });
      }

      // Verify current password
      const isPasswordMatch = await user.comparePassword(password);
      if (!isPasswordMatch) {
        return res.status(401).json({
          success: false,
          message: 'Current password is incorrect'
        });
      }

      if (!isValidPassword(newPassword)) {
        return res.status(400).json({
          success: false,
          message: 'New password must be at least 6 characters'
        });
      }

      user.password = newPassword;
    }

    await user.save();

    console.log(`✅ User account updated: ${user.username}`);

    res.status(200).json({
      success: true,
      message: 'Account updated successfully',
      data: {
        userId: user._id,
        username: user.username
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get user profile
 * @route   GET /api/user/profile
 * @access  Private
 */
const getProfile = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id)
      .populate('deviceList', 'token status lastSeen');

    res.status(200).json({
      success: true,
      data: user
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  register,
  login,
  deleteAccount,
  updateAccount,
  getProfile
};