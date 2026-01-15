const express = require('express');
const router = express.Router();
const sessionController = require('../controllers/sessionController');
const { authenticate, requireRole } = require('../middleware/auth');
const upload = require('../middleware/upload');

// Create new KYC session
router.post('/', authenticate, requireRole('admin', 'agent'), sessionController.createSession);

// Get all sessions (for agent/admin) - MUST be before /:sessionId
router.get('/', authenticate, requireRole('agent', 'admin'), sessionController.getAllSessions);

// Get pending sessions (for agent) - MUST be before /:sessionId
router.get('/pending/list', authenticate, requireRole('agent'), sessionController.getPendingSessions);

// Bulk upload CSV/Excel to create pending sessions
router.post('/bulk-upload', authenticate, requireRole('agent', 'admin'), upload.single('file'), sessionController.bulkUploadSessions.bind(sessionController));

// Get bulk pending sessions (for agent)
router.get('/bulk-pending', authenticate, requireRole('agent', 'admin'), sessionController.getBulkPendingSessions.bind(sessionController));

// Start session from pending
router.post('/:sessionId/start-from-pending', authenticate, requireRole('agent', 'admin'), sessionController.startSessionFromPending.bind(sessionController));

// Get session by join link - MUST be before /:sessionId
router.get('/link/:joinLink', sessionController.getSessionByLink);

// User ke liye unauthenticated endpoint - call end karne ke liye - MUST be before /:sessionId
router.put('/:sessionId/end-by-user', sessionController.endSessionByUser);

// Assign session to agent - MUST be before /:sessionId
router.put('/:sessionId/assign', authenticate, requireRole('agent', 'admin'), sessionController.assignSession);

// Update session status - MUST be before /:sessionId
router.put('/:sessionId/status', authenticate, requireRole('agent', 'admin'), sessionController.updateStatus);

// Get session by ID - MUST be last (generic route)
router.get('/:sessionId', authenticate, sessionController.getSession);

module.exports = router;

