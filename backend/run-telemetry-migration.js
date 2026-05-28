
const fs = require('fs');
const path = require('path');
const pool = require('./src/config/database');

async function runTelemetryMigration() {
  const migrationPath = path.join(__dirname, '../database/migrations/add_webrtc_telemetry.sql');
  console.log('Running telemetry migration from:', migrationPath);

  const sql = fs.readFileSync(migrationPath, 'utf8');

  try {
    await pool.query(sql);
    console.log('✅ Telemetry migration completed successfully');
    process.exit(0);
  } catch (err) {
    console.error('❌ Telemetry migration failed:', err);
    process.exit(1);
  }
}

runTelemetryMigration();

