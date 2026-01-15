-- Migrate old pending_bulk sessions to bulk_upload_data table
-- This preserves old data that was uploaded before the new system

INSERT INTO bulk_upload_data (user_name, user_phone, user_email, agent_id, uploaded_by, created_at, updated_at)
SELECT 
    s.user_name,
    s.user_phone,
    s.user_email,
    s.agent_id,
    s.agent_id as uploaded_by, -- Use agent_id as uploaded_by if available
    s.created_at,
    s.updated_at
FROM kyc_sessions s
WHERE s.status = 'pending_bulk'
AND NOT EXISTS (
    SELECT 1 FROM bulk_upload_data b 
    WHERE b.user_name = s.user_name 
    AND b.user_phone = s.user_phone 
    AND b.created_at = s.created_at
)
ON CONFLICT DO NOTHING;

-- After migration, we can optionally delete old pending_bulk sessions
-- But keeping them for now in case we need to reference them
