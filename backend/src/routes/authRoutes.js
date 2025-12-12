const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');

// Login
router.post('/login', authController.login);

// Get current user
router.get('/me', authController.authenticate, authController.getMe);

module.exports = router;

