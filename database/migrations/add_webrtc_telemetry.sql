-- WebRTC telemetry tables for environment, connection state, and call events

-- Session environment - one or more rows per KYC session / role / device
CREATE TABLE IF NOT EXISTS session_environment (
    id SERIAL PRIMARY KEY,
    session_id INTEGER REFERENCES kyc_sessions(id) ON DELETE CASCADE,
    role VARCHAR(20), -- 'user' / 'investigator' / 'admin'
    device_type VARCHAR(50), -- mobile / desktop / tablet
    os_name VARCHAR(100),
    os_version VARCHAR(100),
    browser_name VARCHAR(100),
    browser_version VARCHAR(100),
    user_agent TEXT,
    is_in_app_browser BOOLEAN,
    is_https BOOLEAN,
    page_origin TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_session_environment_session_id
    ON session_environment(session_id);

CREATE INDEX IF NOT EXISTS idx_session_environment_role
    ON session_environment(role);

-- WebRTC session state snapshot - per side (user/investigator) per call
CREATE TABLE IF NOT EXISTS webrtc_session_state (
    id SERIAL PRIMARY KEY,
    session_id INTEGER REFERENCES kyc_sessions(id) ON DELETE CASCADE,
    role VARCHAR(20), -- 'user' / 'investigator'
    connection_state VARCHAR(50), -- connected / failed / disconnected / closed
    ice_connection_state VARCHAR(50),
    signaling_state VARCHAR(50),
    had_remote_video BOOLEAN,
    had_remote_audio BOOLEAN,
    remote_video_started_at TIMESTAMP,
    video_codec VARCHAR(50),
    audio_codec VARCHAR(50),
    video_resolution_sent VARCHAR(50), -- e.g. "1280x720"
    video_resolution_received VARCHAR(50),
    video_fps NUMERIC(6,2),
    network_quality VARCHAR(20), -- excellent / good / fair / poor / unknown
    rtt_ms NUMERIC(10,2),
    packet_loss_audio_percent NUMERIC(5,2),
    packet_loss_video_percent NUMERIC(5,2),
    available_outgoing_bitrate NUMERIC(12,2),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_webrtc_session_state_session_id
    ON webrtc_session_state(session_id);

CREATE INDEX IF NOT EXISTS idx_webrtc_session_state_role
    ON webrtc_session_state(role);

-- High-level call events timeline
CREATE TABLE IF NOT EXISTS call_events (
    id SERIAL PRIMARY KEY,
    session_id INTEGER REFERENCES kyc_sessions(id) ON DELETE CASCADE,
    role VARCHAR(20), -- 'user' / 'investigator' / 'system'
    event_type VARCHAR(100), -- e.g. USER_JOIN_ATTEMPT, USER_JOIN_SUCCESS, MEDIA_ERROR
    event_timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    details JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_call_events_session_id
    ON call_events(session_id);

CREATE INDEX IF NOT EXISTS idx_call_events_event_type
    ON call_events(event_type);

