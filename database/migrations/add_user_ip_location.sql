-- Add user IP and location fields to kyc_sessions table
ALTER TABLE kyc_sessions 
ADD COLUMN IF NOT EXISTS user_ip VARCHAR(45), -- IPv6 can be up to 45 chars
ADD COLUMN IF NOT EXISTS user_location TEXT; -- Store location as text (city, state, country)

-- Add index for IP address queries
CREATE INDEX IF NOT EXISTS idx_kyc_sessions_user_ip ON kyc_sessions(user_ip);

-- Add comment
COMMENT ON COLUMN kyc_sessions.user_ip IS 'IP address of user when they joined the session';
COMMENT ON COLUMN kyc_sessions.user_location IS 'Geographic location of user based on IP address';








