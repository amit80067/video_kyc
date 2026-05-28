const pool = require('../config/database');

/**
 * Helper: resolve kyc_sessions.id from external session_id (UUID string)
 */
async function getKycSessionId(sessionId) {
  if (!sessionId) return null;
  const result = await pool.query(
    'SELECT id FROM kyc_sessions WHERE session_id = $1',
    [sessionId]
  );
  if (result.rows.length === 0) {
    return null;
  }
  return result.rows[0].id;
}

class TelemetryController {
  /**
   * Store environment info for a session (device/browser/network context)
   * Body: { sessionId, role, deviceType, osName, osVersion, browserName, browserVersion,
   *         userAgent, isInAppBrowser, isHttps, pageOrigin }
   */
  async saveEnvironment(req, res) {
    try {
      const {
        sessionId,
        role,
        deviceType,
        osName,
        osVersion,
        browserName,
        browserVersion,
        userAgent,
        isInAppBrowser,
        isHttps,
        pageOrigin,
      } = req.body || {};

      if (!sessionId) {
        return res.status(400).json({ error: 'sessionId is required' });
      }

      const kycSessionId = await getKycSessionId(sessionId);
      if (!kycSessionId) {
        return res.status(404).json({ error: 'Session not found' });
      }

      await pool.query(
        `INSERT INTO session_environment
         (session_id, role, device_type, os_name, os_version, browser_name, browser_version,
          user_agent, is_in_app_browser, is_https, page_origin, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())`,
        [
          kycSessionId,
          role || null,
          deviceType || null,
          osName || null,
          osVersion || null,
          browserName || null,
          browserVersion || null,
          userAgent || null,
          typeof isInAppBrowser === 'boolean' ? isInAppBrowser : null,
          typeof isHttps === 'boolean' ? isHttps : null,
          pageOrigin || null,
        ]
      );

      return res.json({ success: true });
    } catch (error) {
      console.error('Telemetry saveEnvironment error:', error);
      return res.status(500).json({ error: 'Failed to save environment info' });
    }
  }

  /**
   * Store WebRTC state snapshot.
   * Body: { sessionId, role, connectionState, iceConnectionState, signalingState,
   *         hadRemoteVideo, hadRemoteAudio, remoteVideoStartedAt,
   *         videoCodec, audioCodec, videoResolutionSent, videoResolutionReceived,
   *         videoFps, networkQuality, rttMs, packetLossAudioPercent,
   *         packetLossVideoPercent, availableOutgoingBitrate }
   */
  async saveWebRTCState(req, res) {
    try {
      const {
        sessionId,
        role,
        connectionState,
        iceConnectionState,
        signalingState,
        hadRemoteVideo,
        hadRemoteAudio,
        remoteVideoStartedAt,
        videoCodec,
        audioCodec,
        videoResolutionSent,
        videoResolutionReceived,
        videoFps,
        networkQuality,
        rttMs,
        packetLossAudioPercent,
        packetLossVideoPercent,
        availableOutgoingBitrate,
      } = req.body || {};

      if (!sessionId) {
        return res.status(400).json({ error: 'sessionId is required' });
      }

      const kycSessionId = await getKycSessionId(sessionId);
      if (!kycSessionId) {
        return res.status(404).json({ error: 'Session not found' });
      }

      await pool.query(
        `INSERT INTO webrtc_session_state
         (session_id, role, connection_state, ice_connection_state, signaling_state,
          had_remote_video, had_remote_audio, remote_video_started_at,
          video_codec, audio_codec, video_resolution_sent, video_resolution_received,
          video_fps, network_quality, rtt_ms, packet_loss_audio_percent,
          packet_loss_video_percent, available_outgoing_bitrate, created_at)
         VALUES
         ($1, $2, $3, $4, $5,
          $6, $7, $8,
          $9, $10, $11, $12,
          $13, $14, $15, $16,
          $17, $18, NOW())`,
        [
          kycSessionId,
          role || null,
          connectionState || null,
          iceConnectionState || null,
          signalingState || null,
          typeof hadRemoteVideo === 'boolean' ? hadRemoteVideo : null,
          typeof hadRemoteAudio === 'boolean' ? hadRemoteAudio : null,
          remoteVideoStartedAt ? new Date(remoteVideoStartedAt) : null,
          videoCodec || null,
          audioCodec || null,
          videoResolutionSent || null,
          videoResolutionReceived || null,
          videoFps != null ? Number(videoFps) : null,
          networkQuality || null,
          rttMs != null ? Number(rttMs) : null,
          packetLossAudioPercent != null ? Number(packetLossAudioPercent) : null,
          packetLossVideoPercent != null ? Number(packetLossVideoPercent) : null,
          availableOutgoingBitrate != null ? Number(availableOutgoingBitrate) : null,
        ]
      );

      return res.json({ success: true });
    } catch (error) {
      console.error('Telemetry saveWebRTCState error:', error);
      return res.status(500).json({ error: 'Failed to save WebRTC state' });
    }
  }

  /**
   * Store high-level call events.
   * Body: { sessionId, role, eventType, eventTimestamp, details }
   */
  async addCallEvent(req, res) {
    try {
      const { sessionId, role, eventType, eventTimestamp, details } = req.body || {};

      if (!sessionId || !eventType) {
        return res.status(400).json({ error: 'sessionId and eventType are required' });
      }

      const kycSessionId = await getKycSessionId(sessionId);
      if (!kycSessionId) {
        return res.status(404).json({ error: 'Session not found' });
      }

      await pool.query(
        `INSERT INTO call_events
         (session_id, role, event_type, event_timestamp, details, created_at)
         VALUES ($1, $2, $3, $4, $5, NOW())`,
        [
          kycSessionId,
          role || null,
          eventType,
          eventTimestamp ? new Date(eventTimestamp) : new Date(),
          details || null,
        ]
      );

      return res.json({ success: true });
    } catch (error) {
      console.error('Telemetry addCallEvent error:', error);
      return res.status(500).json({ error: 'Failed to add call event' });
    }
  }
}

module.exports = new TelemetryController();

