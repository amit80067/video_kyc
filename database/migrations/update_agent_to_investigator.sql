-- Migration: Update 'agent' role to 'investigator'
-- This script updates the role column to use 'investigator' instead of 'agent'

-- Step 1: Update the CHECK constraint to allow 'investigator' instead of 'agent'
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('investigator', 'admin'));

-- Step 2: Update all existing 'agent' roles to 'investigator'
UPDATE users SET role = 'investigator' WHERE role = 'agent';

-- Step 3: Verify the update
SELECT role, COUNT(*) as count FROM users GROUP BY role;

