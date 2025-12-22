const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
require('dotenv').config();

const app = express();
const server = http.createServer(app);

// Socket.io setup with CORS
const frontendUrlForSocket = process.env.FRONTEND_URL || "https://kyc.virtualinvestigation.xyz";
const io = socketIo(server, {
    cors: {
        origin: [
            'https://kyc.virtualinvestigation.xyz',
            'http://kyc.virtualinvestigation.xyz',
            'https://backend.virtualinvestigation.xyz',
            'http://backend.virtualinvestigation.xyz',
            'http://localhost:3000',
            'http://localhost:3005',
            frontendUrlForSocket
        ],
        methods: ["GET", "POST"],
        credentials: true
    }
});

// Middleware - CORS configuration
const frontendUrl = process.env.FRONTEND_URL || 'https://kyc.virtualinvestigation.xyz';
const corsOptions = {
    origin: function (origin, callback) {
        // Allow requests with no origin (like mobile apps or curl requests)
        if (!origin) return callback(null, true);
        
        const allowedOrigins = [
            'https://kyc.virtualinvestigation.xyz',
            'http://kyc.virtualinvestigation.xyz',
            'https://backend.virtualinvestigation.xyz',
            'http://backend.virtualinvestigation.xyz',
            'http://localhost:3000',
            'http://localhost:3005',
            'http://localhost:8005',
            frontendUrl
        ];
        
        // Check if origin is in allowed list or matches patterns
        if (allowedOrigins.includes(origin) || 
            /^http:\/\/localhost(:\d+)?$/.test(origin) ||
            /^https?:\/\/kyc\.virtualinvestigation\.xyz(:\d+)?$/.test(origin) ||
            /^https?:\/\/backend\.virtualinvestigation\.xyz(:\d+)?$/.test(origin)) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin'],
    exposedHeaders: ['Content-Range', 'X-Content-Range'],
    maxAge: 86400 // 24 hours
};

app.use(cors(corsOptions));
app.use(express.json({ limit: '500mb' }));
app.use(express.urlencoded({ extended: true, limit: '500mb' }));

// Routes
const sessionRoutes = require('./routes/sessionRoutes');
const kycRoutes = require('./routes/kycRoutes');
const exportRoutes = require('./routes/exportRoutes');
const authRoutes = require('./routes/authRoutes');

app.use('/api/auth', authRoutes);
app.use('/api/sessions', sessionRoutes);
app.use('/api/kyc', kycRoutes);
app.use('/api/export', exportRoutes);

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// 404 handler for undefined API routes (must be before static files)
app.use('/api/*', (req, res) => {
    res.status(404).json({ 
        error: 'Route not found',
        path: req.path,
        method: req.method,
        message: `The endpoint ${req.method} ${req.path} does not exist`
    });
});

// Serve static files from React app (only for non-API routes)
const path = require('path');
const frontendBuildPath = path.join(__dirname, '../../frontend/build');
app.use(express.static(frontendBuildPath));

// Serve React app for all non-API routes (catch-all must be last)
app.get('*', (req, res) => {
    res.sendFile(path.join(frontendBuildPath, 'index.html'));
});

// WebRTC Signaling - Socket.io handlers
const rooms = new Map(); // Store active rooms

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    // Join a room (session)
    socket.on('join-room', async (roomId, userType) => {
        console.log(`User ${socket.id} attempting to join room ${roomId} as ${userType}`);
        
        // Check if session is expired before allowing room join
        try {
            const pool = require('./config/database');
            const result = await pool.query(
                `SELECT status FROM kyc_sessions WHERE session_id = $1`,
                [roomId]
            );
            
            if (result.rows.length > 0) {
                const session = result.rows[0];
                // If session is expired, cancelled, completed, or rejected, don't allow join
                if (['expired', 'cancelled', 'completed', 'rejected'].includes(session.status)) {
                    console.log(`Session ${roomId} is ${session.status}, blocking join`);
                    socket.emit('session-expired', {
                        error: 'This session has expired or been closed.',
                        sessionId: roomId
                    });
                    return;
                }
            }
        } catch (err) {
            console.error('Error checking session status for room join:', err);
            // Allow join if check fails (better UX, but log the error)
        }
        
        socket.join(roomId);
        console.log(`User ${socket.id} joined room ${roomId} as ${userType}`);

        // Store room info
        if (!rooms.has(roomId)) {
            rooms.set(roomId, {
                users: [],
                userType: {}
            });
        }

        const room = rooms.get(roomId);
        room.users.push(socket.id);
        room.userType[socket.id] = userType;

        // Update session status: not_started → pending (baat-chit start)
        try {
            const pool = require('./config/database');
            await pool.query(
                `UPDATE kyc_sessions 
                 SET status = CASE 
                     WHEN status = 'not_started' THEN 'pending'
                     WHEN status = 'pending' AND (SELECT COUNT(*) FROM kyc_sessions WHERE session_id = $1) > 0 THEN 'pending'
                     ELSE status
                 END,
                 updated_at = NOW()
                 WHERE session_id = $1 AND status = 'not_started'`,
                [roomId]
            );
        } catch (err) {
            console.error('Error updating session status on join:', err);
        }

        // Notify others in the room
        socket.to(roomId).emit('user-joined', { socketId: socket.id, userType });

        // Send list of existing users in room
        const existingUsers = room.users.filter(id => id !== socket.id);
        if (existingUsers.length > 0) {
            socket.emit('existing-users', existingUsers);
        }
    });

    // Handle WebRTC offer
    socket.on('offer', (data) => {
        const { offer, roomId, targetSocketId } = data;
        console.log(`Offer from ${socket.id} to ${targetSocketId || 'broadcast'} in room ${roomId}`);
        
        if (targetSocketId) {
            // Send to specific user
            io.to(targetSocketId).emit('offer', {
                offer,
                socketId: socket.id
            });
        } else {
            // Broadcast to room
            socket.to(roomId).emit('offer', {
                offer,
                socketId: socket.id
            });
        }
    });

    // Handle WebRTC answer
    socket.on('answer', (data) => {
        const { answer, roomId, targetSocketId } = data;
        console.log(`Answer from ${socket.id} to ${targetSocketId || 'broadcast'} in room ${roomId}`);
        
        if (targetSocketId) {
            io.to(targetSocketId).emit('answer', {
                answer,
                socketId: socket.id
            });
        } else {
            socket.to(roomId).emit('answer', {
                answer,
                socketId: socket.id
            });
        }
    });

    // Handle ICE candidates
    socket.on('ice-candidate', (data) => {
        const { candidate, roomId, targetSocketId } = data;
        
        if (targetSocketId) {
            io.to(targetSocketId).emit('ice-candidate', {
                candidate,
                socketId: socket.id
            });
        } else {
            socket.to(roomId).emit('ice-candidate', {
                candidate,
                socketId: socket.id
            });
        }
    });

    // Handle recording data
    socket.on('recording-data', (data) => {
        const { roomId, blob } = data;
        // Forward recording data to server for processing
        socket.to(roomId).emit('recording-data', {
            blob,
            socketId: socket.id
        });
    });

    // Handle disconnect
    socket.on('disconnect', async () => {
        console.log('User disconnected:', socket.id);
        
        // Remove from rooms and update session status
        for (const [roomId, room] of rooms.entries()) {
            const index = room.users.indexOf(socket.id);
            if (index > -1) {
                const userType = room.userType[socket.id];
                room.users.splice(index, 1);
                delete room.userType[socket.id];
                
                // Notify others
                socket.to(roomId).emit('user-left', { socketId: socket.id });
                
                // If room is empty or last user left, mark session as expired
                if (room.users.length === 0) {
                    try {
                        const pool = require('./config/database');
                        // Update session status: pending/in_progress → expired (call end)
                        await pool.query(
                            `UPDATE kyc_sessions 
                             SET status = 'expired', 
                                 updated_at = NOW(),
                                 notes = COALESCE(notes || ' ', '') || 'Session expired - all users disconnected'
                             WHERE session_id = $1 AND status IN ('pending', 'in_progress', 'not_started')`,
                            [roomId]
                        );
                        console.log(`Session ${roomId} marked as expired due to disconnect`);
                    } catch (err) {
                        console.error('Error updating session status on disconnect:', err);
                    }
                    rooms.delete(roomId);
                }
            }
        }
    });

    // Error handling
    socket.on('error', (error) => {
        console.error('Socket error:', error);
    });
});

const PORT = process.env.PORT || 8005;

server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`WebSocket server ready for WebRTC signaling`);
});

module.exports = { app, io };

