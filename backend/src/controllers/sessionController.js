const pool = require('../config/database');
const { v4: uuidv4 } = require('uuid');
const smsService = require('../services/smsService');
const { validateIndianMobile } = require('../utils/phoneValidation');
const emailService = require('../services/emailService');
const ipLocationService = require('../services/ipLocationService');
const ExcelJS = require('exceljs');
const fs = require('fs');
const csv = require('csv-parser');
const path = require('path');
const { buildJoinLink, getFrontendBase } = require('../utils/joinLink');

class SessionController {
    async createSession(req, res) {
        try {
            const { userName, userPhone, userEmail, agentId } = req.body;
            const userRole = req.user.role;

            if (!userName || !String(userName).trim()) {
                return res.status(400).json({ error: 'User name is required' });
            }
            if (!userPhone || !String(userPhone).trim()) {
                return res.status(400).json({ error: 'Mobile number is required' });
            }
            const phoneCheck = validateIndianMobile(userPhone);
            if (!phoneCheck.ok) {
                return res.status(400).json({ error: phoneCheck.error });
            }
            const normalizedPhone = phoneCheck.e164;
            
            // If admin creates session, use agentId from request (can be null for unassigned)
            // If agent creates session, use their ID (ignore agentId from request for security)
            let finalAgentId = null;
            if (userRole === 'admin') {
                // Admin can assign to specific agent or leave unassigned (null)
                finalAgentId = agentId || null;
            } else {
                // Agent can only create sessions for themselves
                finalAgentId = req.user.id;
            }

            // Generate unique session ID and join link
            const sessionId = uuidv4();
            const joinLink = buildJoinLink(sessionId);
            
            // Link expires in 72 hours
            const linkExpiresAt = new Date();
            linkExpiresAt.setHours(linkExpiresAt.getHours() + 72);

            const result = await pool.query(
                `INSERT INTO kyc_sessions 
                (session_id, user_name, user_phone, user_email, agent_id, join_link, link_expires_at, status)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                RETURNING *`,
                [sessionId, userName, normalizedPhone, userEmail, finalAgentId, joinLink, linkExpiresAt, 'not_started']
            );

            // Send SMS to user with verification link
            let smsSent = false;
            let smsError = null;
            let smsWarning = null;

            if (smsService.isAvailable()) {
                try {
                    console.log(`Attempting to send SMS for session ${sessionId} to ${normalizedPhone}`);
                    const smsResult = await smsService.sendVerificationSMS(normalizedPhone, userName, joinLink);
                    smsSent = smsResult.success;
                    smsWarning = smsResult.dltWarning || null;
                    console.log(`✅ SMS sent successfully to ${normalizedPhone} for session ${sessionId}`);
                } catch (smsErr) {
                    smsError = smsErr.message || 'Unknown SMS error';
                    console.error(`❌ Failed to send SMS to ${normalizedPhone}:`, smsErr);
                    console.error('SMS Error details:', {
                        message: smsErr.message,
                        stack: smsErr.stack
                    });
                }
            } else {
                console.warn('⚠️ SMS service not available. Set HiTech (HITECH_SMS_API_KEY + HITECH_SMS_SENDER_ID) or Twilio.');
                smsError = 'SMS service not available';
            }

            // Send Email to user with verification link
            let emailSent = false;
            let emailError = null;
            
            if (userEmail && emailService.isAvailable()) {
                try {
                    console.log(`Attempting to send email for session ${sessionId} to ${userEmail}`);
                    const emailResult = await emailService.sendVerificationEmail(userEmail, userName, joinLink);
                    emailSent = emailResult.success;
                    console.log(`✅ Email sent successfully to ${userEmail} for session ${sessionId}`);
                } catch (emailErr) {
                    // Log error but don't fail the session creation
                    emailError = emailErr.message || 'Unknown email error';
                    console.error(`❌ Failed to send email to ${userEmail}:`, emailErr);
                    console.error('Email Error details:', {
                        message: emailErr.message,
                        stack: emailErr.stack
                    });
                    // Session created successfully, just email failed
                }
            } else if (userEmail && !emailService.isAvailable()) {
                console.warn('⚠️ Email service not available. Brevo API key missing or not initialized.');
                emailError = 'Email service not available';
            } else if (!userEmail) {
                console.log('No email address provided, skipping email');
            }

            res.status(201).json({
                success: true,
                session: result.rows[0],
                smsSent: smsSent,
                smsError: smsError || null,
                smsWarning: smsWarning || null,
                emailSent: emailSent,
                emailError: emailError || null
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
            const built = buildJoinLink(joinLink);
            const legacy = `${getFrontendBase()}/join/${joinLink}`;

            const result = await pool.query(
                `SELECT s.*, 
                u.username as agent_username, u.full_name as agent_name
                FROM kyc_sessions s
                LEFT JOIN users u ON s.agent_id = u.id
                WHERE s.session_id = $1 OR s.join_link = $2 OR s.join_link = $3`,
                [joinLink, built, legacy]
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

            // Capture IP and location when user joins (only if not already captured)
            if (!session.user_ip) {
                const clientIP = ipLocationService.getClientIP(req);
                console.log(`Capturing IP and location for session ${session.session_id}: ${clientIP}`);
                
                // Check if same IP was used in previous sessions
                pool.query(
                    `SELECT session_id, user_name, created_at, user_location
                     FROM kyc_sessions 
                     WHERE user_ip = $1 AND session_id != $2
                     ORDER BY created_at DESC
                     LIMIT 5`,
                    [clientIP, session.session_id]
                ).then(previousSessions => {
                    // If previous sessions found with same IP, notify agent
                    if (previousSessions.rows.length > 0) {
                        const previousSession = previousSessions.rows[0];
                        const notificationMessage = `⚠️ Alert: User joining from IP address ${clientIP} has been used in ${previousSessions.rows.length} previous session(s). Last session: ${previousSession.user_name || 'Unknown'} on ${new Date(previousSession.created_at).toLocaleString()}. Location: ${previousSession.user_location || 'Unknown'}.`;
                        
                        console.log('🔔 IP Duplicate Alert:', notificationMessage);
                        
                        // Send notification to agent via WebSocket if agent is assigned
                        if (session.agent_id) {
                            try {
                                // Get io instance from server (lazy require to avoid circular dependency)
                                const serverModule = require('../server');
                                const io = serverModule.io;
                                if (io) {
                                    // Emit to all sockets in the session room (agent will receive this)
                                    io.to(session.session_id).emit('ip-duplicate-alert', {
                                        type: 'warning',
                                        title: 'IP Address Alert',
                                        message: notificationMessage,
                                        ip: clientIP,
                                        previousSessionsCount: previousSessions.rows.length,
                                        lastSession: {
                                            sessionId: previousSession.session_id,
                                            userName: previousSession.user_name,
                                            createdAt: previousSession.created_at,
                                            location: previousSession.user_location
                                        },
                                        currentSession: {
                                            sessionId: session.session_id,
                                            userName: session.user_name
                                        },
                                        timestamp: new Date().toISOString()
                                    });
                                    console.log(`✅ IP duplicate notification sent to agent for session ${session.session_id}`);
                                }
                            } catch (ioError) {
                                console.error('Error sending IP duplicate notification:', ioError);
                            }
                        }
                    }
                }).catch(err => {
                    console.error('Error checking previous sessions for IP:', err);
                });
                
                // Get location asynchronously (don't block response)
                ipLocationService.getLocationFromIP(clientIP).then(location => {
                    // Update session with IP and location
                    pool.query(
                        `UPDATE kyc_sessions 
                        SET user_ip = $1, user_location = $2, updated_at = NOW()
                        WHERE session_id = $3`,
                        [clientIP, location, session.session_id]
                    ).catch(err => {
                        console.error('Error updating session with IP/location:', err);
                    });
                }).catch(err => {
                    console.error('Error getting location:', err);
                    // Still save IP even if location fails
                    pool.query(
                        `UPDATE kyc_sessions 
                        SET user_ip = $1, updated_at = NOW()
                        WHERE session_id = $2`,
                        [clientIP, session.session_id]
                    ).catch(updateErr => {
                        console.error('Error updating session with IP:', updateErr);
                    });
                });
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
            const userRole = req.user.role;
            const userId = req.user.id;

            // Use agentId from body if provided (admin assigning), otherwise use logged-in user's ID (agent self-assigning)
            const targetAgentId = agentId || userId;

            // Only agents can self-assign, admin can assign to any agent
            if (!agentId && userRole !== 'agent') {
                return res.status(400).json({ error: 'Agent ID is required for admin users' });
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
            if (session.status === 'in_progress' && session.agent_id && session.agent_id !== targetAgentId) {
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
                [targetAgentId, sessionId]
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
                
                // Automatically update all documents' verification status when session is approved/rejected
                const sessionIdForDocs = currentSession.id;
                if (status === 'completed') {
                    // When session is approved, mark all documents as verified
                    await pool.query(
                        `UPDATE documents 
                        SET verification_status = 'verified',
                            verified_by = $1,
                            verified_at = NOW(),
                            updated_at = NOW()
                        WHERE session_id = $2 AND verification_status = 'pending'`,
                        [userId, sessionIdForDocs]
                    );
                    console.log(`[Status Update] Session ${sessionId} - All documents marked as verified`);
                } else if (status === 'rejected') {
                    // When session is rejected, mark all documents as rejected
                    await pool.query(
                        `UPDATE documents 
                        SET verification_status = 'rejected',
                            verified_by = $1,
                            verified_at = NOW(),
                            updated_at = NOW()
                        WHERE session_id = $2 AND verification_status = 'pending'`,
                        [userId, sessionIdForDocs]
                    );
                    console.log(`[Status Update] Session ${sessionId} - All documents marked as rejected`);
                }
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

            const updatedSession = result.rows[0];
            
            // Log status update for debugging
            console.log(`[Status Update] Session ${sessionId} - Status updated to: ${updatedSession.status}`);

            res.json({
                success: true,
                session: updatedSession
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

            // Filter: Only show sessions from last 90 days
            query += ` AND s.created_at >= NOW() - INTERVAL '90 days'`;
            
            // Exclude pending_bulk from main sessions list (they show in BULK PENDING tab)
            query += ` AND s.status != 'pending_bulk'`;

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
                WHERE s.status IN ('not_started', 'pending') 
                AND s.agent_id = $1
                AND s.created_at >= NOW() - INTERVAL '90 days'
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

    /**
     * Bulk upload CSV/Excel and create pending sessions
     */
    async bulkUploadSessions(req, res) {
        let tempFilePath = null;
        try {
            const file = req.file;
            const investigatorId = req.user.id; // Current logged-in investigator

            if (!file) {
                return res.status(400).json({ error: 'No file uploaded' });
            }

            tempFilePath = file.path;
            const fileExt = path.extname(file.originalname).toLowerCase();
            
            let rows = [];
            
            // Parse CSV or Excel
            if (fileExt === '.csv') {
                rows = await this.parseCSV(tempFilePath);
            } else if (fileExt === '.xlsx' || fileExt === '.xls') {
                rows = await this.parseExcel(tempFilePath);
            } else {
                return res.status(400).json({ error: 'Invalid file format. Only CSV and Excel files are supported.' });
            }

            if (rows.length === 0) {
                return res.status(400).json({ error: 'No data found in file' });
            }

            console.log(`📄 Parsed ${rows.length} rows from file`);
            console.log('First row sample:', JSON.stringify(rows[0], null, 2));

            // Validate and store data in bulk_upload_data table (NO SESSIONS CREATED)
            const storedRecords = [];
            const errors = [];

            for (let i = 0; i < rows.length; i++) {
                const row = rows[i];
                const rowNum = i + 2; // +2 because row 1 is header

                try {
                    // Extract data - ONLY map these exact columns (case-insensitive): user_name, user_phone, investigator_name
                    // All other columns will be ignored
                    let userName = this.getColumnValue(row, ['user_name', 'user name']);
                    let userPhone = this.getColumnValue(row, ['user_phone', 'user phone']);
                    const investigatorName = this.getColumnValue(row, ['investigator_name', 'investigator name']);

                    // Trim and validate required fields - check for null, undefined, empty string, or whitespace-only
                    userName = userName ? String(userName).trim() : '';
                    userPhone = userPhone ? String(userPhone).trim() : '';
                    
                    console.log(`Processing row ${rowNum}: userName="${userName}", userPhone="${userPhone}", investigatorName="${investigatorName}"`);

                    // Validate required fields
                    if (!userName || !userPhone) {
                        let missingFields = [];
                        if (!userName) missingFields.push('user_name');
                        if (!userPhone) missingFields.push('user_phone');
                        const errorMsg = `Row ${rowNum}: Missing or empty required field(s): ${missingFields.join(', ')}`;
                        console.warn(errorMsg);
                        errors.push(errorMsg);
                        continue;
                    }

                    // Find investigator by name if provided
                    let assignedInvestigatorId = null; // Will be set if investigator found
                    if (investigatorName) {
                        const investigatorResult = await pool.query(
                            `SELECT id FROM users WHERE (LOWER(full_name) = LOWER($1) OR LOWER(username) = LOWER($1)) AND role = 'agent'`,
                            [investigatorName]
                        );
                        if (investigatorResult.rows.length > 0) {
                            assignedInvestigatorId = investigatorResult.rows[0].id;
                        } else {
                            // If investigator not found, store name but log warning
                            console.warn(`Investigator "${investigatorName}" not found for row ${rowNum}, will be assigned later`);
                        }
                    } else {
                        // If no investigator name provided, use current user as default
                        assignedInvestigatorId = investigatorId;
                    }
                    
                    // Store data in bulk_upload_data table (NO SESSION CREATED)
                    console.log(`Storing data for row ${rowNum} (NO SESSION CREATED)`);
                    
                    const result = await pool.query(
                        `INSERT INTO bulk_upload_data 
                        (user_name, user_phone, investigator_name, agent_id, uploaded_by, created_at, updated_at)
                        VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
                        RETURNING *`,
                        [userName, userPhone, investigatorName || null, assignedInvestigatorId, investigatorId]
                    );

                    console.log(`✅ Successfully stored data for row ${rowNum} (ID: ${result.rows[0].id})`);
                    storedRecords.push(result.rows[0]);
                } catch (rowError) {
                    const errorMsg = `Row ${rowNum}: ${rowError.message}`;
                    console.error(`❌ Error processing row ${rowNum}:`, rowError);
                    console.error(`Error details:`, {
                        message: rowError.message,
                        code: rowError.code,
                        detail: rowError.detail,
                        constraint: rowError.constraint
                    });
                    errors.push(errorMsg);
                }
            }

            // Clean up temp file
            if (fs.existsSync(tempFilePath)) {
                fs.unlinkSync(tempFilePath);
            }

            res.status(201).json({
                success: true,
                created: storedRecords.length,
                errors: errors.length,
                message: `${storedRecords.length} record(s) stored in Bulk Pending. Click "CREATE SESSION" to create actual sessions.`,
                records: storedRecords,
                errorDetails: errors.length > 0 ? errors : undefined
            });
        } catch (error) {
            console.error('Bulk upload sessions error:', error);
            
            // Clean up file if exists
            if (tempFilePath && fs.existsSync(tempFilePath)) {
                try {
                    fs.unlinkSync(tempFilePath);
                } catch (cleanupError) {
                    console.error('Failed to cleanup file:', cleanupError);
                }
            }
            
            res.status(500).json({ 
                error: 'Failed to bulk upload sessions',
                details: error.message 
            });
        }
    }

    /**
     * Get bulk pending data (NOT sessions - just stored data)
     */
    async getBulkPendingSessions(req, res) {
        try {
            console.log('🚀🚀🚀 [getBulkPendingSessions] ====== FUNCTION CALLED ======');
            console.log('🚀 [getBulkPendingSessions] Full req.user:', JSON.stringify(req.user, null, 2));
            
            const userId = req.user?.id;
            const userRole = req.user?.role;

            console.log('🔍 [getBulkPendingSessions] Request received');
            console.log('🔍 [getBulkPendingSessions] User ID:', userId);
            console.log('🔍 [getBulkPendingSessions] User Role:', userRole);
            console.log('🔍 [getBulkPendingSessions] Type of userId:', typeof userId);
            console.log('🔍 [getBulkPendingSessions] Type of userRole:', typeof userRole);

            // First, check total records in table
            const totalCheck = await pool.query('SELECT COUNT(*) as count FROM bulk_upload_data');
            console.log('📊 [getBulkPendingSessions] Total records in bulk_upload_data:', totalCheck.rows[0].count);

            // Admin can see all bulk upload data, agents see only their own or unassigned
            let query, params;
            
            // Debug: Check role comparison
            console.log('🔍 [getBulkPendingSessions] Role comparison:', {
                userRole,
                isAdmin: userRole === 'admin',
                roleType: typeof userRole,
                roleLength: userRole?.length
            });
            
            if (userRole === 'admin' || userRole?.toLowerCase() === 'admin') {
                console.log('✅ [getBulkPendingSessions] Admin user - fetching all records');
                query = `SELECT b.*, 
                    u.username as agent_username, u.full_name as agent_name,
                    uploader.username as uploaded_by_username
                    FROM bulk_upload_data b
                    LEFT JOIN users u ON b.agent_id = u.id
                    LEFT JOIN users uploader ON b.uploaded_by = uploader.id
                    ORDER BY b.created_at ASC`;
                params = [];
            } else {
                console.log('👤 [getBulkPendingSessions] Agent user - fetching filtered records for userId:', userId);
                query = `SELECT b.*, 
                    u.username as agent_username, u.full_name as agent_name,
                    uploader.username as uploaded_by_username
                    FROM bulk_upload_data b
                    LEFT JOIN users u ON b.agent_id = u.id
                    LEFT JOIN users uploader ON b.uploaded_by = uploader.id
                    WHERE b.agent_id = $1 OR b.agent_id IS NULL
                    ORDER BY b.created_at ASC`;
                params = [userId];
            }

            console.log('📊 [getBulkPendingSessions] Executing query...');
            const result = await pool.query(query, params);
            console.log('✅ [getBulkPendingSessions] Query executed, rows found:', result.rows.length);

            if (result.rows.length > 0) {
                console.log('📋 [getBulkPendingSessions] First record:', result.rows[0].id, result.rows[0].user_name);
            }

            res.json({
                success: true,
                sessions: result.rows, // Keeping 'sessions' key for frontend compatibility
                count: result.rows.length
            });
        } catch (error) {
            console.error('❌ [getBulkPendingSessions] Error:', error);
            console.error('❌ [getBulkPendingSessions] Error stack:', error.stack);
            res.status(500).json({ error: 'Failed to get bulk pending sessions' });
        }
    }

    /**
     * Create session from bulk upload data - create actual session, send SMS, assign investigator
     */
    async startSessionFromPending(req, res) {
        try {
            const { sessionId } = req.params; // This is actually bulk_upload_data.id
            const investigatorId = req.user.id;
            const userRole = req.user.role;

            // Get bulk upload data (NOT a session yet)
            const bulkDataResult = await pool.query(
                `SELECT * FROM bulk_upload_data WHERE id = $1`,
                [sessionId]
            );

            if (bulkDataResult.rows.length === 0) {
                return res.status(404).json({ error: 'Bulk upload data not found' });
            }

            const bulkData = bulkDataResult.rows[0];

            const phoneCheck = validateIndianMobile(bulkData.user_phone);
            if (!phoneCheck.ok) {
                return res.status(400).json({
                    error: phoneCheck.error || 'Invalid mobile number in bulk record',
                });
            }
            const normalizedBulkPhone = phoneCheck.e164;

            // Verify investigator has access (admin can access any, agent only their own or unassigned)
            if (userRole !== 'admin' && bulkData.agent_id !== investigatorId && bulkData.agent_id !== null) {
                return res.status(403).json({ error: 'You do not have access to this data' });
            }

            // Determine which agent to assign
            let assignedAgentId = bulkData.agent_id;
            if (!assignedAgentId) {
                // If no agent assigned in bulk data, use current user
                assignedAgentId = investigatorId;
            }

            // NOW CREATE THE ACTUAL SESSION
            const newSessionId = uuidv4();
            const joinLink = buildJoinLink(newSessionId);
            
            // Link expires in 72 hours
            const linkExpiresAt = new Date();
            linkExpiresAt.setHours(linkExpiresAt.getHours() + 72);

            // Create actual session in kyc_sessions table
            const createResult = await pool.query(
                `INSERT INTO kyc_sessions 
                (session_id, user_name, user_phone, user_email, agent_id, status, join_link, link_expires_at, created_at, updated_at)
                VALUES ($1, $2, $3, $4, $5, 'not_started', $6, $7, NOW(), NOW())
                RETURNING *`,
                [newSessionId, bulkData.user_name, normalizedBulkPhone, bulkData.user_email || null, assignedAgentId, joinLink, linkExpiresAt]
            );

            const session = createResult.rows[0];

            // Delete the bulk upload data record (it's now converted to a session)
            await pool.query(
                `DELETE FROM bulk_upload_data WHERE id = $1`,
                [sessionId]
            );

            // Send SMS to user
            let smsSent = false;
            let smsError = null;
            let smsWarning = null;

            if (smsService.isAvailable()) {
                try {
                    console.log(`Attempting to send SMS for session ${newSessionId} to ${session.user_phone}`);
                    const smsResult = await smsService.sendVerificationSMS(
                        session.user_phone,
                        session.user_name,
                        joinLink
                    );
                    smsSent = smsResult.success;
                    smsWarning = smsResult.dltWarning || null;
                    console.log(`✅ SMS sent successfully to ${session.user_phone} for session ${newSessionId}`);
                } catch (smsErr) {
                    smsError = smsErr.message || 'Unknown SMS error';
                    console.error(`❌ Failed to send SMS to ${session.user_phone}:`, smsErr);
                }
            } else {
                smsError = 'SMS service not available';
            }

            res.json({
                success: true,
                session: session,
                smsSent: smsSent,
                smsError: smsError,
                smsWarning: smsWarning || null,
                message: 'Session created successfully from bulk upload data'
            });
        } catch (error) {
            console.error('Start session from pending error:', error);
            res.status(500).json({ error: 'Failed to start session from pending' });
        }
    }

    // Helper methods for file parsing
    async parseCSV(filePath) {
        return new Promise((resolve, reject) => {
            const results = [];
            fs.createReadStream(filePath)
                .pipe(csv())
                .on('data', (data) => results.push(data))
                .on('end', () => resolve(results))
                .on('error', reject);
        });
    }

    async parseExcel(filePath) {
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.readFile(filePath);
        const worksheet = workbook.worksheets[0];
        const rows = [];
        
        // Get headers from first row
        const headerRow = worksheet.getRow(1);
        const headers = [];
        headerRow.eachCell((cell, colNumber) => {
            headers[colNumber] = cell.value ? String(cell.value).trim() : '';
        });

        // Get data rows
        worksheet.eachRow((row, rowNumber) => {
            if (rowNumber === 1) return; // Skip header row
            
            const rowData = {};
            row.eachCell((cell, colNumber) => {
                const header = headers[colNumber];
                if (header) {
                    rowData[header] = cell.value ? String(cell.value).trim() : '';
                }
            });
            rows.push(rowData);
        });

        return rows;
    }

    /**
     * Get column value - Only matches exact column names (case-insensitive)
     * Supports both underscore and space variations: user_name or "user name"
     * All other columns are ignored
     */
    getColumnValue(row, possibleColumnNames) {
        // Normalize row keys to lowercase for case-insensitive matching
        const normalizedRow = {};
        for (const key in row) {
            // Remove extra spaces and normalize
            const normalizedKey = key.trim().toLowerCase().replace(/\s+/g, ' ');
            normalizedRow[normalizedKey] = row[key];
        }
        
        for (const colName of possibleColumnNames) {
            // Normalize column name (handle both underscore and space)
            const normalizedColName = colName.trim().toLowerCase().replace(/\s+/g, ' ');
            
            // Try exact match (case-insensitive)
            if (normalizedRow[normalizedColName]) {
                const value = normalizedRow[normalizedColName];
                return value ? String(value).trim() : null;
            }
            
            // Also try underscore/space variations
            const underscoreVersion = normalizedColName.replace(/\s+/g, '_');
            const spaceVersion = normalizedColName.replace(/_/g, ' ');
            
            if (normalizedRow[underscoreVersion]) {
                const value = normalizedRow[underscoreVersion];
                return value ? String(value).trim() : null;
            }
            
            if (normalizedRow[spaceVersion]) {
                const value = normalizedRow[spaceVersion];
                return value ? String(value).trim() : null;
            }
        }
        return null;
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

