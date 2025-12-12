const express = require('express');
const router = express.Router();
const exportController = require('../controllers/exportController');
const { authenticate, requireRole } = require('../middleware/auth');

// Generate PDF report for a session
router.get('/pdf/:sessionId', authenticate, requireRole('admin', 'agent'), exportController.generatePDF);

// Generate Excel export
router.get('/excel', authenticate, requireRole('admin'), exportController.generateExcel);

// Bulk export
router.post('/bulk', authenticate, requireRole('admin'), exportController.bulkExport);

module.exports = router;

