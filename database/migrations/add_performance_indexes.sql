-- Additional Performance Indexes for Video KYC Database
-- This migration adds indexes for frequently queried columns to improve query performance

-- ============================================
-- KYC Sessions Table Indexes
-- ============================================

-- Index for created_at (used in ORDER BY and date filtering)
CREATE INDEX IF NOT EXISTS idx_kyc_sessions_created_at ON kyc_sessions(created_at DESC);

-- Index for link_expires_at (used for expiration checks)
CREATE INDEX IF NOT EXISTS idx_kyc_sessions_link_expires_at ON kyc_sessions(link_expires_at);

-- Index for user_phone (used for searching/filtering by phone)
CREATE INDEX IF NOT EXISTS idx_kyc_sessions_user_phone ON kyc_sessions(user_phone);

-- Index for user_email (used for searching/filtering by email)
CREATE INDEX IF NOT EXISTS idx_kyc_sessions_user_email ON kyc_sessions(user_email);

-- Composite index for status + agent_id (frequently used together in WHERE clauses)
CREATE INDEX IF NOT EXISTS idx_kyc_sessions_status_agent_id ON kyc_sessions(status, agent_id);

-- Composite index for agent_id + status (agent dashboard queries)
CREATE INDEX IF NOT EXISTS idx_kyc_sessions_agent_id_status ON kyc_sessions(agent_id, status);

-- Composite index for status + created_at (filtering by status and sorting by date)
CREATE INDEX IF NOT EXISTS idx_kyc_sessions_status_created_at ON kyc_sessions(status, created_at DESC);

-- Index for updated_at (used in some queries)
CREATE INDEX IF NOT EXISTS idx_kyc_sessions_updated_at ON kyc_sessions(updated_at DESC);

-- ============================================
-- Documents Table Indexes
-- ============================================

-- Index for verification_status (frequently filtered)
CREATE INDEX IF NOT EXISTS idx_documents_verification_status ON documents(verification_status);

-- Index for document_type (used in filtering)
CREATE INDEX IF NOT EXISTS idx_documents_document_type ON documents(document_type);

-- Index for verified_by (used in JOIN operations)
CREATE INDEX IF NOT EXISTS idx_documents_verified_by ON documents(verified_by);

-- Composite index for session_id + verification_status (common query pattern)
CREATE INDEX IF NOT EXISTS idx_documents_session_status ON documents(session_id, verification_status);

-- Index for created_at (time-based queries)
CREATE INDEX IF NOT EXISTS idx_documents_created_at ON documents(created_at DESC);

-- Index for verified_at (verification time queries)
CREATE INDEX IF NOT EXISTS idx_documents_verified_at ON documents(verified_at DESC);

-- ============================================
-- Video Recordings Table Indexes
-- ============================================

-- Index for created_at (time-based queries)
CREATE INDEX IF NOT EXISTS idx_video_recordings_created_at ON video_recordings(created_at DESC);

-- Index for recording_started_at (time-based filtering)
CREATE INDEX IF NOT EXISTS idx_video_recordings_started_at ON video_recordings(recording_started_at DESC);

-- ============================================
-- Face Verification Table Indexes
-- ============================================

-- Index for document_id (JOIN operations)
CREATE INDEX IF NOT EXISTS idx_face_verification_document_id ON face_verification(document_id);

-- Index for verification_result (filtering by result)
CREATE INDEX IF NOT EXISTS idx_face_verification_result ON face_verification(verification_result);

-- Composite index for session_id + verification_result
CREATE INDEX IF NOT EXISTS idx_face_verification_session_result ON face_verification(session_id, verification_result);

-- Index for created_at (time-based queries)
CREATE INDEX IF NOT EXISTS idx_face_verification_created_at ON face_verification(created_at DESC);

-- ============================================
-- Users Table Indexes
-- ============================================

-- Index for role (login and filtering by role)
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

-- Index for is_active (filtering active users)
CREATE INDEX IF NOT EXISTS idx_users_is_active ON users(is_active);

-- Composite index for role + is_active (common query pattern)
CREATE INDEX IF NOT EXISTS idx_users_role_active ON users(role, is_active);

-- Index for created_at (time-based queries)
CREATE INDEX IF NOT EXISTS idx_users_created_at ON users(created_at DESC);

-- Note: username and email already have UNIQUE constraints which create indexes automatically

-- ============================================
-- Performance Notes
-- ============================================
-- These indexes will improve query performance for:
-- 1. Session listing with status/agent filters
-- 2. Date range queries
-- 3. User search by phone/email
-- 4. Document verification status queries
-- 5. Time-based sorting and filtering
-- 6. JOIN operations between tables

