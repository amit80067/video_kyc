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
  Alert,
  Snackbar,
} from '@mui/material';
import {
  VideoCall as VideoCallIcon,
  Logout,
  Refresh,
} from '@mui/icons-material';
import api from '../../services/api';
import VideoCall from '../VideoCall/VideoCall';
import MeetingViewChime from '../VideoCall/MeetingViewChime';
import DocumentCapture from '../DocumentCapture/DocumentCapture';
import webrtcService from '../../services/webrtc';

const InvestigatorDashboard = () => {
  const navigate = useNavigate();
  const [sessions, setSessions] = useState([]);
  const [expiredSessions, setExpiredSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedSession, setSelectedSession] = useState(null);
  const [inCall, setInCall] = useState(false);
  const [localStream, setLocalStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);
  const [showDocumentCapture, setShowDocumentCapture] = useState(false);
  const [ipAlert, setIpAlert] = useState(null);
  const [showIpAlert, setShowIpAlert] = useState(false);

  useEffect(() => {
    loadSessions();
    const interval = setInterval(() => {
      loadSessions();
    }, 5000); // Refresh every 5 seconds
    return () => clearInterval(interval);
  }, []);

  const loadSessions = async () => {
    try {
      // Get all available sessions (not_started, pending, in_progress) - backend will filter for investigator
      // Backend automatically shows unassigned sessions (agent_id IS NULL) or assigned to this investigator
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
      // Check if session is already in progress with another investigator
      if (session.status === 'in_progress' && session.agent_id) {
        const userStr = localStorage.getItem('user');
        const user = JSON.parse(userStr);
        if (session.agent_id !== user.id) {
          alert('This session is already in progress with another investigator. Please select a different session.');
          return;
        }
      }

      // Check if session is expired or closed
      if (['expired', 'cancelled', 'completed', 'rejected'].includes(session.status)) {
        alert('This session has expired or been closed. Please select a different session.');
        return;
      }

      setSelectedSession(session);

      if (process.env.REACT_APP_USE_CHIME === 'true') {
        if (!session.agent_id) {
          const userStr = localStorage.getItem('user');
          const user = JSON.parse(userStr);
          await api.put(`/sessions/${session.session_id}/assign`, { agentId: user.id });
        }
        await api.put(`/sessions/${session.session_id}/status`, { status: 'in_progress' });
        setInCall(true);
        return;
      }

      // If session is unassigned (agent_id is null), assign it to current investigator
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
        // Check if session is assigned to current investigator
        const userStr = localStorage.getItem('user');
        const user = JSON.parse(userStr);
        if (session.agent_id !== user.id && session.status === 'in_progress') {
          alert('This session is already in progress with another investigator.');
          return;
        }
      }

      // Setup WebRTC callbacks FIRST (before any connection setup)
      webrtcService.onLocalStream = (stream) => {
        console.log('📹 AgentDashboard: Local stream callback called');
        setLocalStream(stream);
      };
      webrtcService.onRemoteStream = (stream) => {
        console.log('🔄 AgentDashboard: Remote stream callback called!', {
          stream: stream,
          streamId: stream?.id,
          tracks: stream?.getTracks()?.length,
          videoTracks: stream?.getVideoTracks()?.length,
          audioTracks: stream?.getAudioTracks()?.length
        });
        if (stream && stream.getTracks().length > 0) {
          console.log('✅ Remote stream has tracks, setting state');
          setRemoteStream(stream);
          
          // Check if recording was started before remote stream arrived
          // If recording is active, check if it needs restart with remote stream
          if (webrtcService.isRecording && webrtcService.mediaRecorder) {
            // Check if remote video element exists and has srcObject
            const hasRemoteVideo = webrtcService.remoteVideoElement && 
                                   webrtcService.remoteVideoElement.srcObject;
            
            if (!hasRemoteVideo) {
              console.log('🔄 Restarting recording with remote stream (was recording without remote stream)...');
              webrtcService.stopRecording();
              setTimeout(() => {
                try {
                  webrtcService.startRecording();
                  console.log('✅ Recording restarted with remote stream');
                } catch (err) {
                  console.error('❌ Failed to restart recording:', err);
                }
              }, 1000);
            }
          }
        } else {
          console.warn('⚠️ Remote stream has no tracks!');
        }
      };
      webrtcService.onConnectionStateChange = (state) => {
        console.log('Connection state:', state);
        // Agar connection disconnect ho gaya
        if (state === 'disconnected' || state === 'failed' || state === 'closed') {
          handleEndCall();
        }
      };

      // Get user media
      const stream = await webrtcService.getUserMedia();
      setLocalStream(stream);

      // Track if both user and investigator are connected
      let bothUsersConnected = false;
      let screenRecordingStarted = false;

      // Function to check if both users are connected and start screen recording
      const checkAndStartScreenRecording = async () => {
        if (bothUsersConnected && !screenRecordingStarted && webrtcService.localStream && webrtcService.remoteStream) {
          try {
            console.log('🖥️ Both users connected - starting screen recording...');
            screenRecordingStarted = true;
            
            // Store session_id for screen recording callback
            const screenRecordingSessionId = session?.session_id;
            if (!screenRecordingSessionId) {
              console.error('❌ Cannot setup screen recording: session.session_id is missing');
              return;
            }
            
            // Setup screen recording upload callback
            webrtcService.onScreenRecordingComplete = async (blob) => {
              console.log('📹 Screen recording complete, uploading...', blob.size, 'bytes');
              if (!blob || blob.size === 0) {
                console.error('❌ Screen recording blob is empty');
                return;
              }
              
              // Use captured sessionId
              const uploadSessionId = screenRecordingSessionId || session?.session_id;
              if (!uploadSessionId) {
                console.error('❌ Session ID is null/undefined when trying to upload screen recording');
                return;
              }
              
              try {
                const formData = new FormData();
                formData.append('video', blob, 'screen-recording.webm');
                formData.append('sessionId', uploadSessionId);
                formData.append('recordingType', 'screen');
                
                console.log('📤 Uploading screen recording for session:', uploadSessionId);
                const response = await api.post('/kyc/recordings/upload-screen', formData, {
                  headers: { 'Content-Type': 'multipart/form-data' },
                  timeout: 120000,
                });
                
                console.log('✅ Screen recording uploaded:', response.data);
                
                // Generate PDF after upload
                if (response.data.recordingId) {
                  try {
                    console.log('📄 Generating PDF for session:', uploadSessionId);
                    const pdfResponse = await api.post(`/kyc/sessions/${uploadSessionId}/generate-pdf`, {
                      includeScreenRecording: true
                    });
                    console.log('✅ PDF generated:', pdfResponse.data);
                  } catch (pdfErr) {
                    console.error('❌ Failed to generate PDF:', pdfErr);
                  }
                }
              } catch (err) {
                console.error('❌ Failed to upload screen recording:', err);
                console.error('Error details:', err.response?.data || err.message);
                console.error('SessionId used:', uploadSessionId);
              }
            };
            
            await webrtcService.startScreenRecording();
            console.log('✅ Screen recording started successfully');
          } catch (err) {
            console.error('❌ Failed to start screen recording:', err);
            screenRecordingStarted = false;
          }
        }
      };

      // User disconnect event handle
      if (webrtcService.socket) {
        // Remove old listeners to prevent duplicates
        webrtcService.socket.off('user-left');
        webrtcService.socket.off('existing-users');
        webrtcService.socket.off('user-joined');
        
        webrtcService.socket.on('user-left', async (data) => {
          console.log('👋 User left:', data);
          
          // Stop screen recording if active
          if (screenRecordingStarted && webrtcService.isScreenRecording) {
            console.log('🖥️ User left - stopping screen recording...');
            webrtcService.stopScreenRecording();
            screenRecordingStarted = false;
          }
          
          // IMPORTANT: Continue video recording for a few more seconds to capture final moments
          // Then update session status and end call
          setTimeout(async () => {
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
          }, 3000); // Wait 3 seconds before ending to allow recording to continue
        });
        
        // Handle existing users - if user already joined, create offer
        webrtcService.socket.on('existing-users', (users) => {
          console.log('👥 Existing users in room:', users);
          if (users.length > 0) {
            // User already in room - both connected
            bothUsersConnected = true;
            // Wait a bit for streams to be ready
            setTimeout(() => {
              checkAndStartScreenRecording();
            }, 2000);
            
            // Ensure we have local stream and peer connection setup
            if (!webrtcService.peerConnection && stream) {
              console.log('🔧 Setting up peer connection for existing users...');
              webrtcService.setupPeerConnection().then(() => {
                setTimeout(() => {
                  if (webrtcService.peerConnection && stream) {
                    console.log('📤 Creating offer for existing users...');
                    webrtcService.createOffer();
                  }
                }, 1500);
              });
            } else if (webrtcService.peerConnection && stream) {
              // Connection exists, just create offer
              setTimeout(() => {
                console.log('📤 Creating offer (connection exists)...');
                webrtcService.createOffer();
              }, 1000);
            }
          }
        });
        
        // Handle user joined - if user joins after investigator, create offer
        webrtcService.socket.on('user-joined', (data) => {
          console.log('👤 User joined room:', data);
          if (data.userType === 'user') {
            // Ensure we have local stream and peer connection setup
            if (!webrtcService.peerConnection && stream) {
              console.log('🔧 Setting up peer connection for new user...');
              webrtcService.setupPeerConnection().then(() => {
                setTimeout(() => {
                  if (webrtcService.peerConnection && stream) {
                    console.log('📤 Creating offer for new user...');
                    webrtcService.createOffer();
                  }
                }, 1500);
              });
            } else if (webrtcService.peerConnection && stream) {
              // Connection exists, just create offer
              setTimeout(() => {
                console.log('📤 Creating offer for new user (connection exists)...');
                webrtcService.createOffer();
              }, 1000);
            }
          }
        });

        // Listen for IP duplicate alerts
        webrtcService.socket.on('ip-duplicate-alert', (alertData) => {
          console.log('🔔 IP Duplicate Alert received:', alertData);
          setIpAlert(alertData);
          setShowIpAlert(true);
        });
      }

      // Join room AFTER setting up callbacks
      console.log('🚪 Joining room:', session.session_id);
      webrtcService.joinRoom(session.session_id, 'investigator');
      
      // Don't create offer immediately - wait for existing-users or user-joined event
      // This prevents race conditions where both user and investigator create offers

      // Track if recording has been started
      let recordingStarted = false;
      
      // Store original callback
      const originalOnRemoteStream = webrtcService.onRemoteStream;
      
      // Enhanced remote stream callback that handles recording
      webrtcService.onRemoteStream = (stream) => {
        // Call original callback first (this sets state)
        if (originalOnRemoteStream) {
          originalOnRemoteStream(stream);
        }
        
        // Handle recording when remote stream arrives
        if (stream && stream.getTracks().length > 0) {
          // Check if recording is already active
          const isCurrentlyRecording = webrtcService.isRecording && webrtcService.mediaRecorder;
          
          if (!recordingStarted && !isCurrentlyRecording) {
            // Start recording for the first time
            console.log('🎥 Starting recording now that remote stream is available...');
            try {
              webrtcService.startRecording();
              recordingStarted = true;
              console.log('✅ Recording started with remote stream');
            } catch (err) {
              console.error('❌ Failed to start recording:', err);
            }
          } else if (isCurrentlyRecording) {
            // Recording already started - check if it needs restart
            const hasRemoteVideo = webrtcService.remoteVideoElement && 
                                   webrtcService.remoteVideoElement.srcObject;
            
            if (!hasRemoteVideo) {
              console.log('🔄 Restarting recording with remote stream (was recording without remote stream)...');
              webrtcService.stopRecording();
              setTimeout(() => {
                try {
                  webrtcService.startRecording();
                  recordingStarted = true;
                  console.log('✅ Recording restarted with remote stream');
                } catch (err) {
                  console.error('❌ Failed to restart recording:', err);
                }
              }, 1000);
            }
          }
        }
      };
      
      // Fallback: If remote stream doesn't arrive in 10 seconds, start recording anyway
      setTimeout(() => {
        if (!recordingStarted) {
          console.log('⏰ Remote stream timeout - starting recording with local stream only...');
          try {
            webrtcService.startRecording();
            recordingStarted = true;
          } catch (err) {
            console.error('❌ Failed to start recording:', err);
          }
        }
      }, 10000);
      
      // Store session_id to ensure it's available when callback executes
      const currentSessionId = session?.session_id;
      if (!currentSessionId) {
        console.error('❌ Cannot setup recording: session.session_id is missing');
        return;
      }
      
      console.log('🎥 Setting up recording callback with sessionId:', currentSessionId);
      webrtcService.onRecordingComplete = async (blob) => {
        // Upload recording when call ends
        console.log('🎥 Recording complete callback triggered, blob size:', blob.size, 'bytes');
        if (!blob || blob.size === 0) {
          console.error('❌ Recording blob is empty, cannot upload');
          return;
        }
        
        // Use the captured sessionId (from closure)
        const uploadSessionId = currentSessionId || session?.session_id;
        if (!uploadSessionId) {
          console.error('❌ Session ID is null/undefined when trying to upload recording');
          console.error('Current session:', session);
          console.error('Captured sessionId:', currentSessionId);
          return;
        }
        
        try {
          const formData = new FormData();
          formData.append('video', blob, 'recording.webm');
          formData.append('sessionId', uploadSessionId);
          console.log('📤 Uploading recording for session:', uploadSessionId, 'Size:', blob.size, 'bytes');
          const response = await api.post('/kyc/recordings/upload', formData, {
            headers: { 'Content-Type': 'multipart/form-data' },
            timeout: 120000, // 2 minutes timeout for large files
          });
          console.log('✅ Recording uploaded successfully:', response.data);
          // Clear callback after successful upload
          webrtcService.onRecordingComplete = null;
        } catch (err) {
          console.error('❌ Failed to upload recording:', err);
          console.error('Error details:', err.response?.data || err.message);
          console.error('SessionId used:', uploadSessionId);
          // Don't block session expiration if upload fails
          if (err.response?.status === 413) {
            console.warn('⚠️ Video file too large, but continuing...');
          }
          // Clear callback even on error to prevent memory leaks
          webrtcService.onRecordingComplete = null;
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
      // Stop screen recording first
      if (webrtcService.isScreenRecording) {
        console.log('🖥️ Stopping screen recording before call end');
        webrtcService.stopScreenRecording();
        // Wait for screen recording to upload
        await new Promise(resolve => setTimeout(resolve, 10000)); // 10 seconds
      }
      
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
            notes: 'Call ended by investigator - session expired',
          });
          console.log('Session status updated to expired:', response.data);
        } catch (err) {
          console.error('Failed to update session status:', err);
          // Retry once
          try {
            await api.put(`/sessions/${sessionToEnd.session_id}/status`, {
              status: 'expired',
              notes: 'Call ended by investigator - session expired',
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
    navigate('/investigator/login');
  };


  const getStatusColor = (status) => {
    const colors = {
      pending: 'warning',
      pending_bulk: 'warning',
      not_started: 'info',
      in_progress: 'info',
      completed: 'success',
      rejected: 'error',
      cancelled: 'default',
      expired: 'default',
    };
    return colors[status] || 'default';
  };

  if (inCall && selectedSession) {
    const userStr = localStorage.getItem('user');
    const user = userStr ? JSON.parse(userStr) : null;
    const investigatorName = user?.full_name || user?.username || 'Investigator';
    const userName = selectedSession?.user_name || 'User';

    // Chime: keep call + recording running when Document Capture is open (don't unmount MeetingViewChime)
    if (process.env.REACT_APP_USE_CHIME === 'true') {
      return (
        <Box sx={{ height: '100vh', overflow: 'hidden', position: 'relative' }}>
          <Box
            sx={{
              visibility: showDocumentCapture ? 'hidden' : 'visible',
              position: showDocumentCapture ? 'absolute' : 'relative',
              width: '100%',
              height: '100%',
              zIndex: 0,
            }}
          >
            <MeetingViewChime
              sessionId={selectedSession?.session_id}
              role="investigator"
              onEndCall={handleEndCall}
              showDocumentCapture={true}
              onDocumentCapture={handleDocumentCapture}
            />
          </Box>
          {showDocumentCapture && (
            <Box
              sx={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                zIndex: 10,
                bgcolor: 'background.paper',
                overflow: 'auto',
              }}
            >
              <Container maxWidth="md" sx={{ py: 2 }}>
                <DocumentCapture
                  sessionId={selectedSession.session_id}
                  remoteStream={remoteStream}
                  onBack={() => setShowDocumentCapture(false)}
                  onUploaded={handleDocumentUploaded}
                />
              </Container>
            </Box>
          )}
        </Box>
      );
    }

    // WebRTC: document capture screen (full replace)
    if (showDocumentCapture) {
      return (
        <Container maxWidth="md">
          <Box sx={{ mt: 2 }}>
            <DocumentCapture
              sessionId={selectedSession.session_id}
              remoteStream={remoteStream}
              onBack={() => setShowDocumentCapture(false)}
              onUploaded={handleDocumentUploaded}
            />
          </Box>
        </Container>
      );
    }

    // WebRTC: video call screen
    return (
      <Box sx={{ height: '100vh', overflow: 'hidden' }}>
        <VideoCall
          localStream={localStream}
          remoteStream={remoteStream}
          onDocumentCapture={handleDocumentCapture}
          onEndCall={handleEndCall}
          showDocumentCapture={true}
          localUserName={investigatorName}
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
          <Typography variant="h4">Investigator Dashboard</Typography>
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

        {(
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
                      No active sessions
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
        )}
      </Box>

      {/* IP Duplicate Alert Snackbar */}
      <Snackbar
        open={showIpAlert}
        autoHideDuration={10000}
        onClose={() => setShowIpAlert(false)}
        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
      >
        <Alert
          onClose={() => setShowIpAlert(false)}
          severity="warning"
          sx={{ width: '100%', maxWidth: '600px' }}
        >
          <Typography variant="h6" fontWeight="bold" gutterBottom>
            {ipAlert?.title || 'IP Address Alert'}
          </Typography>
          <Typography variant="body2" paragraph>
            {ipAlert?.message || 'This IP address has been used in previous sessions.'}
          </Typography>
          {ipAlert?.lastSession && (
            <Box sx={{ mt: 1, pt: 1, borderTop: '1px solid rgba(0,0,0,0.1)' }}>
              <Typography variant="caption" display="block">
                <strong>Last Session:</strong> {ipAlert.lastSession.userName || 'Unknown'} 
                {' - '} {new Date(ipAlert.lastSession.createdAt).toLocaleString()}
              </Typography>
              {ipAlert.lastSession.location && (
                <Typography variant="caption" display="block">
                  <strong>Location:</strong> {ipAlert.lastSession.location}
                </Typography>
              )}
              <Typography variant="caption" display="block">
                <strong>Total Previous Sessions:</strong> {ipAlert.previousSessionsCount}
              </Typography>
            </Box>
          )}
        </Alert>
      </Snackbar>
    </Container>
  );
};

export default InvestigatorDashboard;

