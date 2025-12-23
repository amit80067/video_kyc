const express = require('express');
const router = express.Router();
const kycController = require('../controllers/kycController');
const upload = require('../middleware/upload');
const { authenticate, requireRole } = require('../middleware/auth');

// Upload document
router.post('/documents/upload', authenticate, upload.single('document'), kycController.uploadDocument);

// Upload user photo
router.post('/sessions/upload-user-photo', authenticate, upload.single('userPhoto'), kycController.uploadUserPhoto);

// Process OCR on document
router.post('/documents/:documentId/ocr', authenticate, requireRole('agent', 'admin'), kycController.processOCR);

// Verify face
router.post('/documents/:documentId/verify-face', authenticate, requireRole('agent', 'admin'), upload.single('liveImage'), kycController.verifyFace);

// Get document details
router.get('/documents/:documentId', authenticate, kycController.getDocument);

// Get documents by session
router.get('/documents', authenticate, kycController.getDocumentsBySession);

// Update document verification status
router.put('/documents/:documentId/verify', authenticate, requireRole('agent', 'admin'), kycController.updateDocumentVerification);

// Upload video recording
router.post('/recordings/upload', authenticate, upload.single('video'), kycController.uploadRecording);

// Get video recordings by session
router.get('/recordings', authenticate, kycController.getRecordingsBySession);

// Real-time face matching (unauthenticated - for users during call)
router.post('/realtime-face-match', upload.single('liveImage'), kycController.realtimeFaceMatch);

module.exports = router;

