-- Add pending_bulk status to kyc_sessions table
-- This allows bulk uploaded sessions to be in pending state before actual session creation

-- First, drop the existing CHECK constraint
ALTER TABLE kyc_sessions DROP CONSTRAINT IF EXISTS kyc_sessions_status_check;

-- Add new CHECK constraint with pending_bulk status
ALTER TABLE kyc_sessions ADD CONSTRAINT kyc_sessions_status_check 
CHECK (status IN ('pending', 'pending_bulk', 'not_started', 'in_progress', 'pending_review', 'completed', 'rejected', 'cancelled', 'expired'));



