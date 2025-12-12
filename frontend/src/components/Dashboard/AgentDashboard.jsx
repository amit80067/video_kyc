import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Container,
  Box,
  Paper,
  Typography,
  Button,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Tabs,
  Tab,
} from '@mui/material';
import {
  VideoCall as VideoCallIcon,
  Logout,
  Refresh,
} from '@mui/icons-material';
import api from '../../services/api';
import VideoCall from '../VideoCall/VideoCall';
import DocumentCapture from '../DocumentCapture/DocumentCapture';
import webrtcService from '../../services/webrtc';

const AgentDashboard = () => {
  const navigate = useNavigate();
  const [sessions, setSessions] = useState([]);
  const [expiredSessions, setExpiredSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedSession, setSelectedSession] = useState(null);
  const [inCall, setInCall] = useState(false);
  const [localStream, setLocalStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);
  const [showDocumentCapture, setShowDocumentCapture] = useState(false);
  const [activeTab, setActiveTab] = useState(0); // 0 = Pending, 1 = Expired

  useEffect(() => {
    loadSessions();
    const interval = setInterval(loadSessions, 5000); // Refresh every 5 seconds
    return () => clearInterval(interval);
  }, []);

  const loadSessions = async () => {
    try {
      // Get all available sessions (not_started, pending, in_progress) - backend will filter for agent
      // Backend automatically shows unassigned sessions (agent_id IS NULL) or assigned to this agent
      const response = await api.get('/sessions');
      
      // Filter sessions: not_started, pending, in_progress, pending_review
      const availableSessions = (response.data.sessions || []).filter(session => 
        ['not_started', 'pending', 'in_progress', 'pending_review'].includes(session.status)
      );
      
      setSessions(availableSessions);
      
      // Load expired sessions separately
      try {
        const expiredResponse = await api.get('/sessions?status=expired');
        const expiredSessionsList = expiredResponse.data.sessions || [];
        setExpiredSessions(expiredSessionsList);
      } catch (expiredErr) {
        console.error('Failed to load expired sessions:', expiredErr);
        setExpiredSessions([]);
      }
      
      setLoading(false);
    } catch (err) {
      console.error('Failed to load sessions:', err);
      setLoading(false);
    }
  };

  const handleJoinCall = async (session) => {
    try {
      // Check if session is already in progress with another agent
      if (session.status === 'in_progress' && session.agent_id) {
        const userStr = localStorage.getItem('user');
        const user = JSON.parse(userStr);
        if (session.agent_id !== user.id) {
          alert('This session is already in progress with another agent. Please select a different session.');
          return;
        }
      }

      // Check if session is expired or closed
      if (['expired', 'cancelled', 'completed', 'rejected'].includes(session.status)) {
        alert('This session has expired or been closed. Please select a different session.');
        return;
      }

      setSelectedSession(session);

      // If session is unassigned (agent_id is null), assign it to current agent
      if (!session.agent_id) {
        try {
          const userStr = localStorage.getItem('user');
          const user = JSON.parse(userStr);
          await api.put(`/sessions/${session.session_id}/assign`, {
            agentId: user.id
          });
          // Reload sessions to get updated data
          await loadSessions();
        } catch (err) {
          console.error('Failed to assign session:', err);
          if (err.response?.data?.error) {
            alert(err.response.data.error);
          }
          return;
        }
      } else {
        // Check if session is assigned to current agent
        const userStr = localStorage.getItem('user');
        const user = JSON.parse(userStr);
        if (session.agent_id !== user.id && session.status === 'in_progress') {
          alert('This session is already in progress with another agent.');
          return;
        }
      }

      // Get user media
      const stream = await webrtcService.getUserMedia();
      setLocalStream(stream);

      // Setup WebRTC callbacks
      webrtcService.onLocalStream = setLocalStream;
      webrtcService.onRemoteStream = setRemoteStream;
      webrtcService.onConnectionStateChange = (state) => {
        console.log('Connection state:', state);
        // Agar connection disconnect ho gaya
        if (state === 'disconnected' || state === 'failed' || state === 'closed') {
          handleEndCall();
        }
      };

      // User disconnect event handle
      if (webrtcService.socket) {
        webrtcService.socket.on('user-left', async (data) => {
          console.log('User left:', data);
          // User disconnect ho gaya - session expire kar do
          const currentSession = selectedSession;
          if (currentSession && currentSession.session_id) {
            try {
              await api.put(`/sessions/${currentSession.session_id}/status`, {
                status: 'expired',
                notes: 'Call ended by user - session expired',
              });
            } catch (err) {
              console.error('Failed to update status:', err);
            }
          }
          handleEndCall();
        });
        
        // Handle existing users - if user already joined, create offer
        webrtcService.socket.on('existing-users', (users) => {
          console.log('Existing users in room:', users);
          if (users.length > 0) {
            // User already in room, create offer
            setTimeout(() => {
              webrtcService.createOffer();
            }, 500);
          }
        });
        
        // Handle user joined - if user joins after agent, create offer
        webrtcService.socket.on('user-joined', (data) => {
          console.log('User joined room:', data);
          // If user joins after agent, create offer
          if (data.userType === 'user') {
            setTimeout(() => {
              webrtcService.createOffer();
            }, 500);
          }
        });
      }

      // Join room
      webrtcService.joinRoom(session.session_id, 'agent');
      
      // Create offer after joining (in case user already joined)
      setTimeout(() => {
        webrtcService.createOffer();
      }, 1000);

      // Start recording automatically
      webrtcService.startRecording();
      webrtcService.onRecordingComplete = async (blob) => {
        // Upload recording when call ends
        console.log('Recording complete callback triggered, blob size:', blob.size);
        if (!blob || blob.size === 0) {
          console.error('Recording blob is empty, cannot upload');
          return;
        }
        try {
          const formData = new FormData();
          formData.append('video', blob, 'recording.webm');
          formData.append('sessionId', session.session_id);
          console.log('Uploading recording for session:', session.session_id);
          const response = await api.post('/kyc/recordings/upload', formData, {
            headers: { 'Content-Type': 'multipart/form-data' },
          });
          console.log('Recording uploaded successfully:', response.data);
        } catch (err) {
          console.error('Failed to upload recording:', err);
          console.error('Error details:', err.response?.data || err.message);
          // Don't block session expiration if upload fails
          if (err.response?.status === 413) {
            console.warn('Video file too large, but continuing...');
          }
        }
      };

      // Update session status: pending → in_progress (call chal rahi hai)
      await api.put(`/sessions/${session.session_id}/status`, {
        status: 'in_progress',
      });

      setInCall(true);
    } catch (err) {
      console.error('Failed to join call:', err);
    }
  };

  const handleEndCall = async () => {
    const sessionToEnd = selectedSession; // Store before clearing
    
    try {
      // Stop recording and wait for upload BEFORE ending call
      if (webrtcService.isRecording) {
        console.log('Stopping recording before call end');
        webrtcService.stopRecording();
        // Wait longer for recording to complete and upload (2 minutes = 120 seconds)
        console.log('Waiting 2 minutes for recording upload...');
        await new Promise(resolve => setTimeout(resolve, 120000));
        console.log('Recording stop wait completed (2 minutes)');
      }
      
      // End call pe status expired kar do (session expire ho jayega)
      if (sessionToEnd && sessionToEnd.session_id) {
        try {
          const response = await api.put(`/sessions/${sessionToEnd.session_id}/status`, {
            status: 'expired',
            notes: 'Call ended by agent - session expired',
          });
          console.log('Session status updated to expired:', response.data);
        } catch (err) {
          console.error('Failed to update session status:', err);
          // Retry once
          try {
            await api.put(`/sessions/${sessionToEnd.session_id}/status`, {
              status: 'expired',
              notes: 'Call ended by agent - session expired',
            });
          } catch (retryErr) {
            console.error('Failed to update session status (retry):', retryErr);
          }
        }
      }
    } catch (err) {
      console.error('Error in handleEndCall:', err);
    } finally {
      webrtcService.endCall();
      setInCall(false);
      setLocalStream(null);
      setRemoteStream(null);
      setSelectedSession(null);
      setShowDocumentCapture(false);
      
      // Reload sessions after a short delay to ensure status is updated
      setTimeout(() => {
        loadSessions();
      }, 500);
    }
  };

  const handleDocumentCapture = () => {
    setShowDocumentCapture(true);
  };

  const handleDocumentUploaded = async () => {
    // Document uploaded, wapas video call pe jao
    setShowDocumentCapture(false);
    alert('Document captured successfully!');
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    navigate('/agent/login');
  };

  const getStatusColor = (status) => {
    const colors = {
      pending: 'warning',
      in_progress: 'info',
      completed: 'success',
      rejected: 'error',
      cancelled: 'default',
      expired: 'default',
    };
    return colors[status] || 'default';
  };

  if (inCall && selectedSession) {
    // Document capture screen
    if (showDocumentCapture) {
      return (
        <Container maxWidth="md">
          <Box sx={{ mt: 2 }}>
            <DocumentCapture 
              sessionId={selectedSession.session_id} 
              onBack={() => setShowDocumentCapture(false)}
              onUploaded={handleDocumentUploaded}
            />
          </Box>
        </Container>
      );
    }

    // Video call screen
    const userStr = localStorage.getItem('user');
    const user = userStr ? JSON.parse(userStr) : null;
    const agentName = user?.full_name || user?.username || 'Agent';
    const userName = selectedSession?.user_name || 'User';

    return (
      <Box sx={{ height: '100vh', overflow: 'hidden' }}>
        <VideoCall
          localStream={localStream}
          remoteStream={remoteStream}
          onDocumentCapture={handleDocumentCapture}
          onEndCall={handleEndCall}
          showDocumentCapture={true}
          localUserName={agentName}
          remoteUserName={userName}
          sessionId={selectedSession?.session_id}
        />
      </Box>
    );
  }

  return (
    <Container maxWidth="lg">
      <Box sx={{ mt: 2, mb: 2 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Typography variant="h4">Agent Dashboard</Typography>
          <Box>
            <IconButton onClick={loadSessions} color="primary">
              <Refresh />
            </IconButton>
            <Button
              variant="outlined"
              startIcon={<Logout />}
              onClick={handleLogout}
              sx={{ ml: 1 }}
            >
              Logout
            </Button>
          </Box>
        </Box>

        <TableContainer component={Paper}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Session ID</TableCell>
                <TableCell>User Name</TableCell>
                <TableCell>User Phone</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Created At</TableCell>
                <TableCell>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {sessions.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} align="center">
                    No pending sessions
                  </TableCell>
                </TableRow>
              ) : (
                sessions.map((session) => (
                  <TableRow key={session.id}>
                    <TableCell>{session.session_id}</TableCell>
                    <TableCell>{session.user_name || 'N/A'}</TableCell>
                    <TableCell>{session.user_phone || 'N/A'}</TableCell>
                    <TableCell>
                      <Chip
                        label={session.status}
                        color={getStatusColor(session.status)}
                        size="small"
                      />
                    </TableCell>
                    <TableCell>
                      {new Date(session.created_at).toLocaleString()}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="contained"
                        size="small"
                        startIcon={<VideoCallIcon />}
                        onClick={() => handleJoinCall(session)}
                      >
                        Join Call
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Box>
    </Container>
  );
};

export default AgentDashboard;

