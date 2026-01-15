const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { requireRole } = require('../middleware/auth');

// Login
router.post('/login', authController.login);

// Get current user
router.get('/me', authController.authenticate, authController.getMe);

// Investigator management (admin only)
router.post('/agents', authController.authenticate, requireRole('admin'), authController.createAgent);
router.get('/agents', authController.authenticate, requireRole('admin'), authController.listAgents);

module.exports = router;

