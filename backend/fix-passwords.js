const bcrypt = require('bcryptjs');
const pool = require('./src/config/database');

async function fixPasswords() {
    try {
        const agentHash = await bcrypt.hash('agent123', 10);
        const adminHash = await bcrypt.hash('admin123', 10);
        
        console.log('Agent hash:', agentHash);
        console.log('Admin hash:', adminHash);
        
        await pool.query('UPDATE users SET password_hash = $1 WHERE username = $2', [agentHash, 'agent1']);
        await pool.query('UPDATE users SET password_hash = $1 WHERE username = $2', [adminHash, 'admin']);
        
        console.log('✅ Passwords updated');
        
        // Verify
        const agentResult = await pool.query('SELECT password_hash FROM users WHERE username = $1', ['agent1']);
        const match = await bcrypt.compare('agent123', agentResult.rows[0].password_hash);
        console.log('Verification:', match ? '✅ Success' : '❌ Failed');
        
        process.exit(0);
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
}

fixPasswords();

