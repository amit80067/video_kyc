-- Add recording_type column to video_recordings table
-- This column distinguishes between 'video' (regular call recording) and 'screen' (screen recording)

ALTER TABLE video_recordings 
ADD COLUMN IF NOT EXISTS recording_type VARCHAR(20) DEFAULT 'video';

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_video_recordings_type ON video_recordings(recording_type);

-- Update existing records to have 'video' as default
UPDATE video_recordings 
SET recording_type = 'video' 
WHERE recording_type IS NULL;




