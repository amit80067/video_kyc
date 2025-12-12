const pool = require('../config/database');
const { v4: uuidv4 } = require('uuid');

class SessionController {
    async createSession(req, res) {
        try {
            const { userName, userPhone, userEmail } = req.body;
            const userRole = req.user.role;
            
            // If admin creates session, agent_id should be NULL (unassigned)
            // If agent creates session, use their ID
            const agentId = userRole === 'admin' ? null : req.user.id;

            // Generate unique session ID and join link
            const sessionId = uuidv4();
            const joinLink = `${process.env.FRONTEND_URL || 'http://localhost:3005'}/join/${sessionId}`;
            
            // Link expires in 24 hours
            const linkExpiresAt = new Date();
            linkExpiresAt.setHours(linkExpiresAt.getHours() + 24);

            const result = await pool.query(
                `INSERT INTO kyc_sessions 
                (session_id, user_name, user_phone, user_email, agent_id, join_link, link_expires_at, status)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                RETURNING *`,
                [sessionId, userName, userPhone, userEmail, agentId, joinLink, linkExpiresAt, 'not_started']
            );

            res.status(201).json({
                success: true,
                session: result.rows[0]
            });
        } catch (error) {
            console.error('Create session error:', error);
            res.status(500).json({ error: 'Failed to create session' });
        }
    }

    async getSession(req, res) {
        try {
            const { sessionId } = req.params;
            const userRole = req.user?.role;

            const result = await pool.query(
                `SELECT s.*, 
                u.username as agent_username, u.full_name as agent_name
                FROM kyc_sessions s
                LEFT JOIN users u ON s.agent_id = u.id
                WHERE s.session_id = $1`,
                [sessionId]
            );

            if (result.rows.length === 0) {
                return res.status(404).json({ error: 'Session not found' });
            }

            const session = result.rows[0];

            // Admin ko sabhi sessions dikhne chahiye (expired, completed, etc.)
            // Agent ko sirf active sessions dikhne chahiye
            if (userRole !== 'admin') {
                // Check if session is expired, cancelled, completed, or rejected (only for non-admin)
                if (['expired', 'cancelled', 'completed', 'rejected'].includes(session.status)) {
                    return res.status(403).json({ error: 'This session has expired or been closed' });
                }
            }

            res.json({
                success: true,
                session: session
            });
        } catch (error) {
            console.error('Get session error:', error);
            res.status(500).json({ error: 'Failed to get session' });
        }
    }

    async getSessionByLink(req, res) {
        try {
            const { joinLink } = req.params;
            const fullLink = `${process.env.FRONTEND_URL || 'http://localhost:3005'}/join/${joinLink}`;

            const result = await pool.query(
                `SELECT s.*, 
                u.username as agent_username, u.full_name as agent_name
                FROM kyc_sessions s
                LEFT JOIN users u ON s.agent_id = u.id
                WHERE s.join_link = $1 OR s.session_id = $2`,
                [fullLink, joinLink]
            );

            if (result.rows.length === 0) {
                return res.status(404).json({ error: 'Session not found' });
            }

            const session = result.rows[0];

            // Check if link is expired
            if (new Date(session.link_expires_at) < new Date()) {
                return res.status(400).json({ error: 'Link has expired' });
            }

            // Check if session is expired, cancelled, completed, or rejected
            if (['expired', 'cancelled', 'completed', 'rejected'].includes(session.status)) {
                return res.status(403).json({ error: 'This session has expired or been closed. Please contact support.' });
            }

            res.json({
                success: true,
                session: session
            });
        } catch (error) {
            console.error('Get session by link error:', error);
            res.status(500).json({ error: 'Failed to get session' });
        }
    }

    async assignSession(req, res) {
        try {
            const { sessionId } = req.params;
            const { agentId } = req.body;

            if (!agentId) {
                return res.status(400).json({ error: 'Agent ID is required' });
            }

            // First check if session exists and is available
            const sessionCheck = await pool.query(
                `SELECT id, agent_id, status FROM kyc_sessions WHERE session_id = $1`,
                [sessionId]
            );

            if (sessionCheck.rows.length === 0) {
                return res.status(404).json({ error: 'Session not found' });
            }

            const session = sessionCheck.rows[0];

            // Check if session is already in progress with another agent
            if (session.status === 'in_progress' && session.agent_id && session.agent_id !== agentId) {
                return res.status(403).json({ error: 'Session is already in progress with another agent' });
            }

            // Check if session is expired (cancelled, completed, rejected)
            if (['cancelled', 'completed', 'rejected'].includes(session.status)) {
                return res.status(403).json({ error: 'Session has expired or been closed' });
            }

            // Assign session to agent
            const result = await pool.query(
                `UPDATE kyc_sessions 
                SET agent_id = $1, updated_at = NOW()
                WHERE session_id = $2 AND (agent_id IS NULL OR agent_id = $1)
                RETURNING *`,
                [agentId, sessionId]
            );

            if (result.rows.length === 0) {
                return res.status(403).json({ error: 'Session is already assigned to another agent' });
            }

            res.json({
                success: true,
                session: result.rows[0]
            });
        } catch (error) {
            console.error('Assign session error:', error);
            res.status(500).json({ error: 'Failed to assign session' });
        }
    }

    async updateStatus(req, res) {
        try {
            const { sessionId } = req.params;
            const { status, notes } = req.body;
            const userId = req.user.id;
            const userRole = req.user.role;

            if (!['pending', 'in_progress', 'pending_review', 'completed', 'rejected', 'cancelled', 'expired'].includes(status)) {
                return res.status(400).json({ error: 'Invalid status' });
            }

            // Check if session exists and get current status
            const sessionCheck = await pool.query(
                `SELECT id, agent_id, status FROM kyc_sessions WHERE session_id = $1`,
                [sessionId]
            );

            if (sessionCheck.rows.length === 0) {
                return res.status(404).json({ error: 'Session not found' });
            }

            const currentSession = sessionCheck.rows[0];

            // If agent is trying to set status to in_progress, check if session is already in progress
            if (status === 'in_progress' && userRole === 'agent') {
                if (currentSession.status === 'in_progress' && currentSession.agent_id && currentSession.agent_id !== userId) {
                    return res.status(403).json({ error: 'Session is already in progress with another agent' });
                }
                if (['cancelled', 'completed', 'rejected', 'expired'].includes(currentSession.status)) {
                    return res.status(403).json({ error: 'Session has expired or been closed' });
                }
            }

            const updateFields = ['status = $1'];
            const values = [status];
            let paramIndex = 2;

            if (notes) {
                updateFields.push(`notes = $${paramIndex}`);
                values.push(notes);
                paramIndex++;
            }

            if (status === 'in_progress') {
                updateFields.push(`started_at = NOW()`);
                // Ensure agent_id is set when status becomes in_progress
                if (userRole === 'agent') {
                    updateFields.push(`agent_id = $${paramIndex}`);
                    values.push(userId);
                    paramIndex++;
                }
            } else if (status === 'completed' || status === 'rejected') {
                updateFields.push(`completed_at = NOW()`);
            } else if (status === 'pending_review') {
                // Document captured, waiting for admin review
                if (!notes) {
                    updateFields.push(`notes = $${paramIndex}`);
                    values.push('Document captured, waiting for admin review');
                    paramIndex++;
                }
            } else if (status === 'expired' || status === 'cancelled') {
                // Session expired or cancelled - mark as expired
                updateFields.push(`completed_at = NOW()`);
            }

            updateFields.push(`updated_at = NOW()`);

            const result = await pool.query(
                `UPDATE kyc_sessions 
                SET ${updateFields.join(', ')}
                WHERE session_id = $${paramIndex}
                RETURNING *`,
                [...values, sessionId]
            );

            if (result.rows.length === 0) {
                return res.status(404).json({ error: 'Session not found' });
            }

            res.json({
                success: true,
                session: result.rows[0]
            });
        } catch (error) {
            console.error('Update status error:', error);
            res.status(500).json({ error: 'Failed to update session status' });
        }
    }

    async getAllSessions(req, res) {
        try {
            const { status, limit = 50, offset = 0 } = req.query;
            const userId = req.user.id;
            const userRole = req.user.role;

            let query = `
                SELECT s.*, 
                u.username as agent_username, u.full_name as agent_name,
                COUNT(vr.id) as recording_count
                FROM kyc_sessions s
                LEFT JOIN users u ON s.agent_id = u.id
                LEFT JOIN video_recordings vr ON vr.session_id = s.id
                WHERE 1=1
            `;
            const params = [];
            let paramIndex = 1;

            // If agent, show their assigned sessions OR unassigned sessions (agent_id IS NULL)
            // Include: not_started, pending, in_progress, pending_review
            // Exclude: expired, cancelled, completed, rejected
            if (userRole === 'agent') {
                query += ` AND (s.agent_id = $${paramIndex} OR s.agent_id IS NULL) 
                          AND s.status IN ('not_started', 'pending', 'in_progress', 'pending_review')`;
                params.push(userId);
                paramIndex++;
            }

            if (status) {
                query += ` AND s.status = $${paramIndex}`;
                params.push(status);
                paramIndex++;
            }

            query += ` GROUP BY s.id, u.username, u.full_name ORDER BY s.created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
            params.push(parseInt(limit), parseInt(offset));

            const result = await pool.query(query, params);

            res.json({
                success: true,
                sessions: result.rows,
                count: result.rows.length
            });
        } catch (error) {
            console.error('Get all sessions error:', error);
            res.status(500).json({ error: 'Failed to get sessions' });
        }
    }

    async getPendingSessions(req, res) {
        try {
            const userId = req.user.id;

            const result = await pool.query(
                `SELECT s.*, 
                u.username as agent_username, u.full_name as agent_name
                FROM kyc_sessions s
                LEFT JOIN users u ON s.agent_id = u.id
                WHERE s.status IN ('not_started', 'pending') AND s.agent_id = $1
                ORDER BY s.created_at ASC`,
                [userId]
            );

            res.json({
                success: true,
                sessions: result.rows,
                count: result.rows.length
            });
        } catch (error) {
            console.error('Get pending sessions error:', error);
            res.status(500).json({ error: 'Failed to get pending sessions' });
        }
    }

    // User ke liye unauthenticated endpoint - call end karne ke liye
    async endSessionByUser(req, res) {
        try {
            const { sessionId } = req.params;

            // Check if session exists
            const sessionCheck = await pool.query(
                `SELECT id, status FROM kyc_sessions WHERE session_id = $1`,
                [sessionId]
            );

            if (sessionCheck.rows.length === 0) {
                return res.status(404).json({ error: 'Session not found' });
            }

            const session = sessionCheck.rows[0];

            // Allow ending if session is pending or in_progress (user can end call anytime)
            if (!['pending', 'in_progress'].includes(session.status)) {
                // If already expired/completed/rejected, just return success
                if (['expired', 'completed', 'rejected', 'cancelled'].includes(session.status)) {
                    return res.json({
                        success: true,
                        session: session,
                        message: 'Session already closed'
                    });
                }
                return res.status(400).json({ error: `Cannot end session with status: ${session.status}` });
            }

            // Update session status to expired
            const result = await pool.query(
                `UPDATE kyc_sessions 
                SET status = 'expired', 
                    completed_at = NOW(),
                    notes = 'Call ended by user - session expired',
                    updated_at = NOW()
                WHERE session_id = $1
                RETURNING *`,
                [sessionId]
            );

            res.json({
                success: true,
                session: result.rows[0]
            });
        } catch (error) {
            console.error('End session by user error:', error);
            res.status(500).json({ error: 'Failed to end session' });
        }
    }
}

module.exports = new SessionController();

