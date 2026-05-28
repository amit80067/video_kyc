-- Add Chime SDK meeting and media pipeline IDs to kyc_sessions for AWS video call + recording
ALTER TABLE kyc_sessions
ADD COLUMN IF NOT EXISTS chime_meeting_id VARCHAR(255),
ADD COLUMN IF NOT EXISTS chime_meeting_arn TEXT,
ADD COLUMN IF NOT EXISTS chime_media_pipeline_id VARCHAR(255);

CREATE INDEX IF NOT EXISTS idx_kyc_sessions_chime_meeting_id ON kyc_sessions(chime_meeting_id);
