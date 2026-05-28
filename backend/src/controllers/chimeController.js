const chimeService = require('../services/chimeService');
const pool = require('../config/database');

/**
 * Get Chime meeting + attendee for joining the call. role = user | investigator
 * User: call by sessionId (from join link), no auth.
 * Investigator: call with auth, sessionId in body/params.
 */
async function getJoinInfo(req, res) {
  try {
    const { sessionId } = req.params;
    const role = (req.query.role || req.body?.role || 'user').toLowerCase();
    if (!['user', 'investigator'].includes(role)) {
      return res.status(400).json({ error: 'role must be user or investigator' });
    }
    const sessionRow = await pool.query(
      'SELECT id, status FROM kyc_sessions WHERE session_id = $1',
      [sessionId]
    );
    if (sessionRow.rows.length === 0) {
      return res.status(404).json({ error: 'Session not found' });
    }
    if (['expired', 'cancelled', 'completed', 'rejected'].includes(sessionRow.rows[0].status)) {
      return res.status(403).json({ error: 'Session has expired or been closed' });
    }
    const data = await chimeService.getMeetingAndAttendee(sessionId, role);
    return res.json({ success: true, ...data });
  } catch (err) {
    console.error('Chime getJoinInfo error:', err);
    return res.status(500).json({
      error: 'Failed to get meeting info',
      details: err.message || String(err),
    });
  }
}

/**
 * Start server-side recording (Chime media capture pipeline). Investigator only.
 */
async function startRecording(req, res) {
  try {
    const { sessionId } = req.params;
    const sessionRow = await pool.query(
      'SELECT id FROM kyc_sessions WHERE session_id = $1',
      [sessionId]
    );
    if (sessionRow.rows.length === 0) {
      return res.status(404).json({ error: 'Session not found' });
    }
    const result = await chimeService.startRecording(sessionId);
    return res.json({ success: true, ...result });
  } catch (err) {
    console.error('Chime startRecording error:', err);
    return res.status(500).json({
      error: 'Failed to start recording',
      details: process.env.NODE_ENV === 'development' ? err.message : undefined,
    });
  }
}

/**
 * Stop server-side recording. Investigator or when call ends.
 */
async function stopRecording(req, res) {
  try {
    const { sessionId } = req.params;
    const result = await chimeService.stopRecording(sessionId);
    return res.json({ success: true, ...result });
  } catch (err) {
    console.error('Chime stopRecording error:', err);
    return res.status(500).json({
      error: 'Failed to stop recording',
      details: process.env.NODE_ENV === 'development' ? err.message : undefined,
    });
  }
}

module.exports = {
  getJoinInfo,
  startRecording,
  stopRecording,
};
