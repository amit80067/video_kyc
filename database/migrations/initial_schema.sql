-- Video KYC Database Schema

-- Users table (agents and admins)
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(100) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(20) NOT NULL CHECK (role IN ('agent', 'admin')),
    full_name VARCHAR(255),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- KYC Sessions table
CREATE TABLE IF NOT EXISTS kyc_sessions (
    id SERIAL PRIMARY KEY,
    session_id VARCHAR(100) UNIQUE NOT NULL,
    user_name VARCHAR(255),
    user_phone VARCHAR(20),
    user_email VARCHAR(255),
    agent_id INTEGER REFERENCES users(id),
    status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'rejected', 'cancelled')),
    join_link VARCHAR(500) UNIQUE NOT NULL,
    link_expires_at TIMESTAMP,
    started_at TIMESTAMP,
    completed_at TIMESTAMP,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Documents table
CREATE TABLE IF NOT EXISTS documents (
    id SERIAL PRIMARY KEY,
    session_id INTEGER REFERENCES kyc_sessions(id) ON DELETE CASCADE,
    document_type VARCHAR(50) NOT NULL CHECK (document_type IN ('aadhaar', 'pan', 'passport', 'other')),
    image_url TEXT NOT NULL,
    s3_key VARCHAR(500),
    ocr_extracted_data JSONB,
    aadhaar_number VARCHAR(12),
    name VARCHAR(255),
    date_of_birth DATE,
    address TEXT,
    ocr_confidence DECIMAL(5,2),
    verification_status VARCHAR(50) DEFAULT 'pending' CHECK (verification_status IN ('pending', 'verified', 'rejected')),
    verified_by INTEGER REFERENCES users(id),
    verified_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Video Recordings table
CREATE TABLE IF NOT EXISTS video_recordings (
    id SERIAL PRIMARY KEY,
    session_id INTEGER REFERENCES kyc_sessions(id) ON DELETE CASCADE,
    video_url TEXT NOT NULL,
    s3_key VARCHAR(500),
    duration_seconds INTEGER,
    file_size_bytes BIGINT,
    recording_started_at TIMESTAMP,
    recording_ended_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Face Verification Results table
CREATE TABLE IF NOT EXISTS face_verification (
    id SERIAL PRIMARY KEY,
    session_id INTEGER REFERENCES kyc_sessions(id) ON DELETE CASCADE,
    document_id INTEGER REFERENCES documents(id) ON DELETE CASCADE,
    live_face_image_url TEXT,
    document_face_image_url TEXT,
    match_score DECIMAL(5,2),
    similarity_percentage DECIMAL(5,2),
    liveness_detected BOOLEAN,
    liveness_confidence DECIMAL(5,2),
    verification_result VARCHAR(50) CHECK (verification_result IN ('match', 'no_match', 'uncertain')),
    aws_rekognition_response JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for better performance
CREATE INDEX IF NOT EXISTS idx_kyc_sessions_session_id ON kyc_sessions(session_id);
CREATE INDEX IF NOT EXISTS idx_kyc_sessions_status ON kyc_sessions(status);
CREATE INDEX IF NOT EXISTS idx_kyc_sessions_agent_id ON kyc_sessions(agent_id);
CREATE INDEX IF NOT EXISTS idx_kyc_sessions_join_link ON kyc_sessions(join_link);
CREATE INDEX IF NOT EXISTS idx_documents_session_id ON documents(session_id);
CREATE INDEX IF NOT EXISTS idx_documents_aadhaar_number ON documents(aadhaar_number);
CREATE INDEX IF NOT EXISTS idx_video_recordings_session_id ON video_recordings(session_id);
CREATE INDEX IF NOT EXISTS idx_face_verification_session_id ON face_verification(session_id);

-- Insert default admin user (password: admin123 - should be changed in production)
-- Password hash for 'admin123' using bcrypt
INSERT INTO users (username, email, password_hash, role, full_name) 
VALUES ('admin', 'admin@video-kyc.com', '$2a$10$rOzJqZqZqZqZqZqZqZqZqOZqZqZqZqZqZqZqZqZqZqZqZqZqZqZq', 'admin', 'System Admin')
ON CONFLICT (username) DO NOTHING;

-- Insert default agent user (password: agent123 - should be changed in production)
INSERT INTO users (username, email, password_hash, role, full_name) 
VALUES ('agent1', 'agent1@video-kyc.com', '$2a$10$rOzJqZqZqZqZqZqZqZqZqOZqZqZqZqZqZqZqZqZqZqZqZqZqZqZq', 'agent', 'Agent One')
ON CONFLICT (username) DO NOTHING;

