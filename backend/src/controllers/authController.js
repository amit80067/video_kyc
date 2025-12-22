const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../config/database');
const { authenticate } = require('../middleware/auth');

class AuthController {
    async login(req, res) {
        try {
            const { username, password } = req.body;

            if (!username || !password) {
                return res.status(400).json({ error: 'Username/Email and password are required' });
            }

            // Get user from database - support both username and email (case-insensitive)
            const result = await pool.query(
                'SELECT id, username, email, password_hash, role, full_name, is_active FROM users WHERE LOWER(username) = LOWER($1) OR LOWER(email) = LOWER($1)',
                [username]
            );

            if (result.rows.length === 0) {
                return res.status(401).json({ error: 'Invalid credentials' });
            }

            const user = result.rows[0];

            if (!user.is_active) {
                return res.status(401).json({ error: 'Account is deactivated' });
            }

            // Verify password
            const isValidPassword = await bcrypt.compare(password, user.password_hash);

            if (!isValidPassword) {
                return res.status(401).json({ error: 'Invalid credentials' });
            }

            // Generate JWT token
            const token = jwt.sign(
                { userId: user.id, username: user.username, role: user.role },
                process.env.JWT_SECRET || 'your-secret-key',
                { expiresIn: '24h' }
            );

            res.json({
                token,
                user: {
                    id: user.id,
                    username: user.username,
                    email: user.email,
                    role: user.role,
                    fullName: user.full_name
                }
            });
        } catch (error) {
            console.error('Login error:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    }

    async getMe(req, res) {
        try {
            res.json({
                user: {
                    id: req.user.id,
                    username: req.user.username,
                    email: req.user.email,
                    role: req.user.role
                }
            });
        } catch (error) {
            console.error('Get me error:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    }

    async createAgent(req, res) {
        try {
            const { username, password, fullName } = req.body;

            if (!username || !password) {
                return res.status(400).json({ error: 'Username and password are required' });
            }

            // Validate username format (alphanumeric and underscore, 3-30 characters)
            const usernameRegex = /^[a-zA-Z0-9_]{3,30}$/;
            if (!usernameRegex.test(username.trim())) {
                return res.status(400).json({ error: 'Username must be 3-30 characters long and contain only letters, numbers, and underscores' });
            }

            // Validate password strength
            if (password.length < 6) {
                return res.status(400).json({ error: 'Password must be at least 6 characters long' });
            }

            // Check if username already exists
            const usernameCheck = await pool.query(
                'SELECT id FROM users WHERE username = $1',
                [username.trim().toLowerCase()]
            );

            if (usernameCheck.rows.length > 0) {
                return res.status(400).json({ error: 'Username already exists' });
            }

            // Hash password
            const passwordHash = await bcrypt.hash(password, 10);

            // Create agent user (email will be null for agents created this way)
            const finalUsername = username.trim().toLowerCase();
            const result = await pool.query(
                `INSERT INTO users (username, email, password_hash, role, full_name, is_active)
                 VALUES ($1, NULL, $2, 'agent', $3, true)
                 RETURNING id, username, email, role, full_name, created_at`,
                [finalUsername, passwordHash, fullName || null]
            );

            const newAgent = result.rows[0];

            res.status(201).json({
                message: 'Agent created successfully',
                agent: {
                    id: newAgent.id,
                    username: newAgent.username,
                    email: newAgent.email,
                    fullName: newAgent.full_name,
                    role: newAgent.role,
                    createdAt: newAgent.created_at
                }
            });
        } catch (error) {
            console.error('Create agent error:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    }

    async listAgents(req, res) {
        try {
            const result = await pool.query(
                `SELECT id, username, email, role, full_name, is_active, created_at, updated_at
                 FROM users
                 WHERE role = 'agent'
                 ORDER BY created_at DESC`
            );

            res.json({
                agents: result.rows.map(agent => ({
                    id: agent.id,
                    username: agent.username,
                    email: agent.email,
                    fullName: agent.full_name,
                    isActive: agent.is_active,
                    createdAt: agent.created_at,
                    updatedAt: agent.updated_at
                }))
            });
        } catch (error) {
            console.error('List agents error:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    }
}

// Export instance methods
const authController = new AuthController();
authController.authenticate = authenticate;

module.exports = authController;

