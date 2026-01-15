-- Sync old documents status based on session status
-- This migration updates documents' verification_status for old sessions that were approved/rejected
-- but their documents still have 'pending' status

-- Update documents for completed sessions: mark as 'verified'
UPDATE documents d
SET verification_status = 'verified',
    verified_at = COALESCE(d.verified_at, s.completed_at, NOW()),
    updated_at = NOW()
FROM kyc_sessions s
WHERE d.session_id = s.id
  AND s.status = 'completed'
  AND d.verification_status = 'pending';

-- Update documents for rejected sessions: mark as 'rejected'
UPDATE documents d
SET verification_status = 'rejected',
    verified_at = COALESCE(d.verified_at, s.completed_at, NOW()),
    updated_at = NOW()
FROM kyc_sessions s
WHERE d.session_id = s.id
  AND s.status = 'rejected'
  AND d.verification_status = 'pending';

-- Log the results
DO $$
DECLARE
    completed_count INTEGER;
    rejected_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO completed_count
    FROM documents d
    INNER JOIN kyc_sessions s ON d.session_id = s.id
    WHERE s.status = 'completed' AND d.verification_status = 'verified';
    
    SELECT COUNT(*) INTO rejected_count
    FROM documents d
    INNER JOIN kyc_sessions s ON d.session_id = s.id
    WHERE s.status = 'rejected' AND d.verification_status = 'rejected';
    
    RAISE NOTICE 'Migration completed:';
    RAISE NOTICE '  - Documents synced for completed sessions: %', completed_count;
    RAISE NOTICE '  - Documents synced for rejected sessions: %', rejected_count;
END $$;
