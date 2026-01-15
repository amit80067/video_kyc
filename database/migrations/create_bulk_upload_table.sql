-- Create table for storing bulk upload data (before creating actual sessions)
CREATE TABLE IF NOT EXISTS bulk_upload_data (
    id SERIAL PRIMARY KEY,
    user_name VARCHAR(255) NOT NULL,
    user_phone VARCHAR(20) NOT NULL,
    user_email VARCHAR(255),
    investigator_name VARCHAR(255),
    agent_id INTEGER REFERENCES users(id),
    uploaded_by INTEGER REFERENCES users(id) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Index for faster queries
CREATE INDEX IF NOT EXISTS idx_bulk_upload_data_agent_id ON bulk_upload_data(agent_id);
CREATE INDEX IF NOT EXISTS idx_bulk_upload_data_uploaded_by ON bulk_upload_data(uploaded_by);
CREATE INDEX IF NOT EXISTS idx_bulk_upload_data_created_at ON bulk_upload_data(created_at DESC);
