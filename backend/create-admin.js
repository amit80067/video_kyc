const bcrypt = require('bcryptjs');
const pool = require('./src/config/database');

async function createAdmin() {
    try {
        const email = 'verification@virtualinvestigation.xyz';
        const username = 'verification';
        const password = 'Verification@2025'; // Secure password - change this if needed
        const fullName = 'Verification Admin';
        
        // Check if user already exists
        const existingUser = await pool.query(
            'SELECT id, username, email FROM users WHERE username = $1 OR email = $2',
            [username, email]
        );
        
        if (existingUser.rows.length > 0) {
            console.log('⚠️ User already exists:');
            console.log('Username:', existingUser.rows[0].username);
            console.log('Email:', existingUser.rows[0].email);
            console.log('\nTo update password, use:');
            console.log('node update-admin-password.js');
            process.exit(0);
        }
        
        // Hash password
        const passwordHash = await bcrypt.hash(password, 10);
        
        // Create admin user
        const result = await pool.query(
            `INSERT INTO users (username, email, password_hash, role, full_name, is_active)
             VALUES ($1, $2, $3, 'admin', $4, true)
             RETURNING id, username, email, role, full_name, created_at`,
            [username, email, passwordHash, fullName]
        );
        
        const newAdmin = result.rows[0];
        
        console.log('✅ Admin user created successfully!');
        console.log('\n📋 Credentials:');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('Username:', newAdmin.username);
        console.log('Email:', newAdmin.email);
        console.log('Password:', password);
        console.log('Role:', newAdmin.role);
        console.log('Full Name:', newAdmin.full_name);
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('\n⚠️  Please save these credentials securely!');
        console.log('⚠️  Change the password after first login for security.');
        
        process.exit(0);
    } catch (error) {
        console.error('❌ Error creating admin user:', error);
        if (error.code === '23505') { // Unique violation
            console.error('User with this username or email already exists!');
        }
        process.exit(1);
    }
}

createAdmin();










