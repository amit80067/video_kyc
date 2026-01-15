const pool = require('./src/config/database');
const fs = require('fs');
const path = require('path');

async function runSyncMigration() {
    try {
        const migrationPath = path.join(__dirname, '../database/migrations/sync_old_documents_status.sql');
        const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
        
        console.log('🔄 Running migration: sync_old_documents_status.sql');
        console.log('   Syncing old documents status based on session status...\n');
        
        // Run the migration
        await pool.query(migrationSQL);
        
        // Get counts to show results
        const completedResult = await pool.query(
            `SELECT COUNT(*) as count
             FROM documents d
             INNER JOIN kyc_sessions s ON d.session_id = s.id
             WHERE s.status = 'completed' AND d.verification_status = 'verified'`
        );
        
        const rejectedResult = await pool.query(
            `SELECT COUNT(*) as count
             FROM documents d
             INNER JOIN kyc_sessions s ON d.session_id = s.id
             WHERE s.status = 'rejected' AND d.verification_status = 'rejected'`
        );
        
        console.log('✅ Migration completed successfully!');
        console.log(`   - Documents synced for completed sessions: ${completedResult.rows[0].count}`);
        console.log(`   - Documents synced for rejected sessions: ${rejectedResult.rows[0].count}\n`);
        
        await pool.end();
        process.exit(0);
    } catch (error) {
        console.error('❌ Migration failed:', error);
        await pool.end();
        process.exit(1);
    }
}

runSyncMigration();
