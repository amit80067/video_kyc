const express = require('express');
const router = express.Router();
const chimeController = require('../controllers/chimeController');
const { authenticate, requireRole } = require('../middleware/auth');

// Get meeting + attendee for joining (user: no auth, investigator: auth)
router.get('/sessions/:sessionId/join', chimeController.getJoinInfo);
router.post('/sessions/:sessionId/join', chimeController.getJoinInfo);

// Start/stop recording (investigator only)
router.post('/sessions/:sessionId/recording/start', authenticate, requireRole('agent', 'admin'), chimeController.startRecording);
router.post('/sessions/:sessionId/recording/stop', authenticate, requireRole('agent', 'admin'), chimeController.stopRecording);

module.exports = router;
