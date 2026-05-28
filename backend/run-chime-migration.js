#!/usr/bin/env node
/**
 * Run Chime columns migration on kyc_sessions.
 * Uses DB_* from .env. If you get "must be owner", add to .env:
 *   MIGRATION_DB_USER=postgres
 *   MIGRATION_DB_PASSWORD=your_postgres_password
 * and run again.
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
require('dotenv').config({ path: path.join(__dirname, '.env') });
const { Pool } = require('pg');

const config = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT) || 5432,
  database: process.env.DB_NAME || 'video_kyc',
  user: process.env.MIGRATION_DB_USER || process.env.DB_USER || 'postgres',
  password: String(process.env.MIGRATION_DB_PASSWORD || process.env.DB_PASSWORD || ''),
};

const sql = `
ALTER TABLE kyc_sessions
ADD COLUMN IF NOT EXISTS chime_meeting_id VARCHAR(255),
ADD COLUMN IF NOT EXISTS chime_meeting_arn TEXT,
ADD COLUMN IF NOT EXISTS chime_media_pipeline_id VARCHAR(255);

CREATE INDEX IF NOT EXISTS idx_kyc_sessions_chime_meeting_id ON kyc_sessions(chime_meeting_id);
`;

async function run() {
  const pool = new Pool(config);
  try {
    await pool.query(sql);
    console.log('Chime migration completed successfully.');
  } catch (err) {
    console.error('Migration failed:', err.message);
    if (err.message.includes('must be owner') && !process.env.MIGRATION_DB_USER) {
      console.error('\nTip: Add to .env (as table owner): MIGRATION_DB_USER=postgres, MIGRATION_DB_PASSWORD=... then run again.');
    }
    process.exit(1);
  } finally {
    await pool.end();
  }
}

run();
