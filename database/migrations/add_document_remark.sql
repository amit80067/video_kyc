-- Add remark column to documents table
-- This allows investigators to add remarks/notes when uploading documents

ALTER TABLE documents 
ADD COLUMN IF NOT EXISTS remark TEXT;

-- Add index for remark searches (optional, but useful if we want to search by remarks)
CREATE INDEX IF NOT EXISTS idx_documents_remark ON documents(remark) WHERE remark IS NOT NULL;




