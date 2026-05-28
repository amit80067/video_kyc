const express = require('express');
const router = express.Router();
const telemetryController = require('../controllers/telemetryController');

// These endpoints are intentionally unauthenticated because they are used
// by both authenticated (agent) and unauthenticated (user) frontends
// to send non-sensitive telemetry data about device/browser and WebRTC state.

router.post('/environment', telemetryController.saveEnvironment.bind(telemetryController));
router.post('/webrtc-state', telemetryController.saveWebRTCState.bind(telemetryController));
router.post('/event', telemetryController.addCallEvent.bind(telemetryController));

module.exports = router;

