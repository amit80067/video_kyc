import React, { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import {
  Container,
  Box,
  Typography,
  Button,
  Paper,
  CircularProgress,
  Alert,
  Checkbox,
  FormControlLabel,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Divider,
} from '@mui/material';
import {
  CheckCircle,
  RadioButtonUnchecked,
  Videocam,
  Mic,
  LocationOn,
} from '@mui/icons-material';
import VideoCall from '../components/VideoCall/VideoCall';
import api from '../services/api';
import webrtcService from '../services/webrtc';

const UserJoinPage = () => {
  const { sessionId } = useParams();
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [step, setStep] = useState('instructions'); // instructions, consent, audioVideoCheck, join, video
  const [localStream, setLocalStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);
  const [consentAccepted, setConsentAccepted] = useState(false);
  const [audioVideoChecked, setAudioVideoChecked] = useState(false);
  const [previewStream, setPreviewStream] = useState(null);
  const previewVideoRef = useRef(null);

  useEffect(() => {
    loadSession();
    return () => {
      webrtcService.endCall();
    };
  }, [sessionId]);

  // Audio/Video Check Step - useEffect for preview (must be at top level, before any conditional returns)
  useEffect(() => {
    if (step === 'audioVideoCheck') {
      let stream = null;
      let timer = null;
      
      const startPreview = async () => {
        try {
          // Check if getUserMedia is available
          if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            // Fallback for older browsers
            const getUserMedia = navigator.mediaDevices?.getUserMedia ||
                                 navigator.getUserMedia ||
                                 navigator.webkitGetUserMedia ||
                                 navigator.mozGetUserMedia ||
                                 navigator.msGetUserMedia;
            
            if (!getUserMedia) {
              throw new Error('getUserMedia is not supported in this browser. Please use a modern browser like Chrome, Firefox, or Safari.');
            }
            
            // For older browsers, use legacy API
            stream = await new Promise((resolve, reject) => {
              getUserMedia.call(navigator, {
                video: true,
                audio: true
              }, resolve, reject);
            });
          } else {
            // Modern browser API
            stream = await navigator.mediaDevices.getUserMedia({
              video: {
                width: { ideal: 1280 },
                height: { ideal: 720 }
              },
              audio: {
                echoCancellation: true,
                noiseSuppression: true
              }
            });
          }
          
          setPreviewStream(stream);
          if (previewVideoRef.current) {
            previewVideoRef.current.srcObject = stream;
          }
          // Auto-enable proceed button after 30 seconds
          timer = setTimeout(() => {
            setAudioVideoChecked(true);
          }, 30000);
        } catch (err) {
          console.error('Failed to get media:', err);
          
          // Provide specific error messages
          let errorMsg = 'Failed to access camera/microphone. ';
          
          if (!navigator.mediaDevices && window.location.protocol !== 'https:' && window.location.hostname !== 'localhost') {
            errorMsg += 'HTTPS is required for camera/microphone access. Please use HTTPS or contact support.';
          } else if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
            errorMsg += 'Please allow camera and microphone permissions in your browser settings and refresh the page.';
          } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
            errorMsg += 'No camera or microphone found. Please connect a device and try again.';
          } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
            errorMsg += 'Camera or microphone is already in use by another application.';
          } else if (err.name === 'SecurityError') {
            errorMsg += 'HTTPS is required for camera/microphone access. Please use HTTPS.';
          } else {
            errorMsg += err.message || 'Please check permissions and try again.';
          }
          
          setError(errorMsg);
          
          // Log detailed error for debugging
          console.error('Error name:', err.name);
          console.error('Error details:', {
            name: err.name,
            message: err.message,
            constraint: err.constraint,
            protocol: window.location.protocol,
            hostname: window.location.hostname,
            hasMediaDevices: !!navigator.mediaDevices
          });
        }
      };

      startPreview();

      return () => {
        // Cleanup preview stream
        if (stream) {
          stream.getTracks().forEach(track => track.stop());
        }
        if (timer) {
          clearTimeout(timer);
        }
        setAudioVideoChecked(false);
      };
    } else {
      // Cleanup when leaving audioVideoCheck step
      if (previewStream) {
        previewStream.getTracks().forEach(track => track.stop());
        setPreviewStream(null);
      }
      setAudioVideoChecked(false);
    }
  }, [step]);

  const loadSession = async () => {
    try {
      const response = await api.get(`/sessions/link/${sessionId}`);
      const sessionData = response.data.session;
      
      // Check if session is expired or closed
      if (['expired', 'cancelled', 'completed', 'rejected'].includes(sessionData.status)) {
        setError('This session has expired or been closed. Please contact support.');
        setLoading(false);
        return;
      }
      
      setSession(sessionData);
      setLoading(false);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load session');
      setLoading(false);
    }
  };

  const handleJoinCall = async () => {
    try {
      // Check if session is still valid before joining
      if (!session) {
        setError('Session not found');
        return;
      }

      // Real-time session status check from backend before joining
      try {
        const statusCheck = await api.get(`/api/sessions/link/${sessionId}`);
        const currentSession = statusCheck.data.session;
        
        // Check if session is expired or closed
        if (['expired', 'cancelled', 'completed', 'rejected'].includes(currentSession.status)) {
          setError('This session has expired or been closed. Please contact support.');
          setSession(null); // Clear session
          return;
        }
        
        // Update session with latest data
        setSession(currentSession);
      } catch (statusErr) {
        // If backend returns error, don't allow join
        if (statusErr.response?.status === 403 || statusErr.response?.status === 400) {
          setError(statusErr.response?.data?.error || 'This session has expired or been closed.');
          setSession(null);
          return;
        }
        console.error('Failed to check session status:', statusErr);
      }

      // Double check session status before joining
      if (['expired', 'cancelled', 'completed', 'rejected'].includes(session.status)) {
        setError('This session has expired or been closed. Please contact support.');
        return;
      }

      // Get user media
      const stream = await webrtcService.getUserMedia();
      setLocalStream(stream);

      // Setup WebRTC callbacks
      webrtcService.onLocalStream = setLocalStream;
      webrtcService.onRemoteStream = setRemoteStream;
      webrtcService.onConnectionStateChange = (state) => {
        console.log('Connection state:', state);
        // Agar connection disconnect ho gaya to status update
        if (state === 'disconnected' || state === 'failed' || state === 'closed') {
          handleEndCall();
        }
      };
      
      // User disconnect event handle
      if (webrtcService.socket) {
        webrtcService.socket.on('user-left', (data) => {
          console.log('User left:', data);
          // Agent disconnect ho gaya
          alert('Agent has left the call');
          handleEndCall();
        });
        
        // Handle session expired event from server
        webrtcService.socket.on('session-expired', (data) => {
          console.log('Session expired:', data);
          setError('This session has expired or been closed. Please contact support.');
          setStep('join');
          setLocalStream(null);
          setRemoteStream(null);
          webrtcService.endCall();
        });
      }

      // Join room
      webrtcService.joinRoom(sessionId, 'user');

      // Create offer if needed
      setTimeout(() => {
        webrtcService.createOffer();
      }, 1000);

      // Start recording
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
          formData.append('sessionId', sessionId);
          console.log('Uploading recording for session:', sessionId);
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

      setStep('video');
    } catch (err) {
      setError('Failed to start video call: ' + err.message);
    }
  };



  const handleEndCall = async () => {
    const currentSessionId = sessionId; // Store before clearing
    
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
      
      // Call end pe status expired kar do (session expire ho jayega)
      // User ke liye special endpoint use karo (authentication nahi chahiye)
      if (currentSessionId) {
        try {
          const response = await api.put(`/sessions/${currentSessionId}/end-by-user`);
          console.log('Session status updated to expired:', response.data);
          
          // Update session state immediately to show expired message
          if (session) {
            setSession({
              ...session,
              status: 'expired'
            });
          }
        } catch (err) {
          console.error('Failed to update session status:', err);
          // Retry once (without /api prefix - api.js already adds it)
          try {
            await api.put(`/sessions/${currentSessionId}/end-by-user`);
            // Update session state even if first call failed but retry succeeded
            if (session) {
              setSession({
                ...session,
                status: 'expired'
              });
            }
          } catch (retryErr) {
            console.error('Failed to update session status (retry):', retryErr);
            // Even if update fails, mark session as expired locally
            if (session) {
              setSession({
                ...session,
                status: 'expired'
              });
            }
          }
        }
      }
    } catch (err) {
      console.error('Error in handleEndCall:', err);
      // Even on error, mark session as expired locally
      if (session) {
        setSession({
          ...session,
          status: 'expired'
        });
      }
    } finally {
      webrtcService.endCall();
      setStep('join');
      setLocalStream(null);
      setRemoteStream(null);
    }
  };

  if (loading) {
    return (
      <Container>
        <Box display="flex" justifyContent="center" alignItems="center" minHeight="100vh">
          <CircularProgress />
        </Box>
      </Container>
    );
  }

  if (error && (step === 'join' || step === 'instructions' || step === 'consent' || step === 'audioVideoCheck')) {
    return (
      <Container maxWidth="sm">
        <Box
          display="flex"
          flexDirection="column"
          alignItems="center"
          justifyContent="center"
          minHeight="100vh"
          gap={3}
        >
          <Paper elevation={3} sx={{ p: 4, width: '100%', textAlign: 'center' }}>
            <Box sx={{ mb: 3 }}>
              <Typography variant="h4" gutterBottom color="error" fontWeight="bold">
                Session Expired
              </Typography>
              <Typography variant="h6" gutterBottom color="text.secondary">
                Video KYC Verification
              </Typography>
            </Box>

            <Alert 
              severity="error" 
              sx={{ 
                mb: 3,
                textAlign: 'left',
                '& .MuiAlert-message': {
                  width: '100%'
                }
              }}
            >
              <Typography variant="body1" fontWeight="bold" gutterBottom>
                {error}
              </Typography>
            </Alert>

            <Box sx={{ mt: 4, p: 3, bgcolor: '#f5f5f5', borderRadius: 2 }}>
              <Typography variant="body2" color="text.secondary" gutterBottom>
                <strong>What happened?</strong>
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                This session has been closed or expired. This can happen if:
              </Typography>
              <List dense sx={{ textAlign: 'left', mb: 2 }}>
                <ListItem sx={{ py: 0.5 }}>
                  <ListItemIcon sx={{ minWidth: 32 }}>
                    <RadioButtonUnchecked fontSize="small" />
                  </ListItemIcon>
                  <ListItemText 
                    primary="The video call was ended"
                    primaryTypographyProps={{ variant: 'body2' }}
                  />
                </ListItem>
                <ListItem sx={{ py: 0.5 }}>
                  <ListItemIcon sx={{ minWidth: 32 }}>
                    <RadioButtonUnchecked fontSize="small" />
                  </ListItemIcon>
                  <ListItemText 
                    primary="The session link has expired"
                    primaryTypographyProps={{ variant: 'body2' }}
                  />
                </ListItem>
              </List>

              <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
                <strong>What should I do?</strong>
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Please contact support or request a new session link from your service provider.
              </Typography>
            </Box>

            <Box sx={{ mt: 3 }}>
              <Typography variant="caption" color="text.secondary">
                Session ID: {sessionId}
              </Typography>
            </Box>
          </Paper>
        </Box>
      </Container>
    );
  }

  // Instructions Step
  if (step === 'instructions') {
    return (
      <Container maxWidth="md">
        <Box
          display="flex"
          flexDirection="column"
          alignItems="center"
          justifyContent="center"
          minHeight="100vh"
          gap={3}
        >
          <Paper elevation={3} sx={{ p: 4, width: '100%' }}>
            <Typography variant="h4" gutterBottom align="center" fontWeight="bold">
              Video KYC
            </Typography>
            <Typography variant="h6" gutterBottom align="center" sx={{ mb: 3 }}>
              Instructions
            </Typography>
            
            <List>
              <ListItem>
                <ListItemIcon>
                  <RadioButtonUnchecked fontSize="small" />
                </ListItemIcon>
                <ListItemText 
                  primary="Do not refresh the page or access any other app, else, you will be logged out of the Digital KYC process."
                />
              </ListItem>
              <ListItem>
                <ListItemIcon>
                  <RadioButtonUnchecked fontSize="small" />
                </ListItemIcon>
                <ListItemText 
                  primary="Please do not open the same link in multiple tabs."
                />
              </ListItem>
              <ListItem>
                <ListItemIcon>
                  <RadioButtonUnchecked fontSize="small" />
                </ListItemIcon>
                <ListItemText 
                  primary="Please ensure your internet connectivity is stable."
                />
              </ListItem>
              <ListItem>
                <ListItemIcon>
                  <RadioButtonUnchecked fontSize="small" />
                </ListItemIcon>
                <ListItemText 
                  primary="Enable camera, microphone and location settings on your device."
                />
              </ListItem>
              <ListItem>
                <ListItemIcon>
                  <RadioButtonUnchecked fontSize="small" />
                </ListItemIcon>
                <ListItemText 
                  primary="Do not let your mobile screen go into sleep mode."
                />
              </ListItem>
              <ListItem>
                <ListItemIcon>
                  <RadioButtonUnchecked fontSize="small" />
                </ListItemIcon>
                <ListItemText 
                  primary="Do not go back in any step of the KYC process."
                  primaryTypographyProps={{ color: 'error', fontWeight: 'bold' }}
                />
              </ListItem>
            </List>

            <Button
              variant="contained"
              fullWidth
              size="large"
              onClick={() => setStep('consent')}
              sx={{ mt: 3 }}
            >
              I Understand, Proceed
            </Button>
          </Paper>
        </Box>
      </Container>
    );
  }

  // User Consent Step
  if (step === 'consent') {
    return (
      <Container maxWidth="md">
        <Box
          display="flex"
          flexDirection="column"
          alignItems="center"
          justifyContent="center"
          minHeight="100vh"
          gap={3}
        >
          <Paper elevation={3} sx={{ p: 4, width: '100%' }}>
            <Typography variant="h5" gutterBottom align="center" fontWeight="bold">
              User Consent
            </Typography>
            
            <List sx={{ mt: 2 }}>
              <ListItem>
                <ListItemText 
                  primary="Your Video interaction session with the VKYC Agent will be in the recording mode."
                />
              </ListItem>
              <ListItem>
                <ListItemText 
                  primary="A live Photograph will be captured during the Video interaction session with the VKYC Agent."
                />
              </ListItem>
              <ListItem>
                <ListItemText 
                  primary="Your Aadhaar details will be used for Aadhaar verification in the V-CIP process."
                />
              </ListItem>
              <ListItem>
                <ListItemText 
                  primary="A photograph of Your PAN Card will be collected to perform PAN verification in the V-CIP process."
                />
              </ListItem>
              <ListItem>
                <ListItemText 
                  primary="Your Live Location will be Captured in the V-CIP process."
                />
              </ListItem>
              <ListItem>
                <ListItemText 
                  primary="You should ensure all the details are correct during the Video interaction Session."
                />
              </ListItem>
              <ListItem>
                <ListItemText 
                  primary="The Aadhaar XML packet or Aadhaar secure QR code should not be older than 3 days."
                />
              </ListItem>
              <ListItem>
                <ListItemText 
                  primary="All the above-mentioned steps are as per RBI guidelines."
                />
              </ListItem>
            </List>

            <Divider sx={{ my: 3 }} />

            <FormControlLabel
              control={
                <Checkbox
                  checked={consentAccepted}
                  onChange={(e) => setConsentAccepted(e.target.checked)}
                  icon={<RadioButtonUnchecked />}
                  checkedIcon={<CheckCircle />}
                />
              }
              label={
                <Typography>
                  I, <strong>{session?.user_name || 'User'}</strong> with the Session ID - <strong>{sessionId}</strong> agrees with all the above-mentioned points and hereby, confirm my consent.
                </Typography>
              }
              sx={{ mb: 2 }}
            />

            <Button
              variant="contained"
              fullWidth
              size="large"
              onClick={() => setStep('audioVideoCheck')}
              disabled={!consentAccepted}
              sx={{ mt: 2 }}
            >
              Proceed
            </Button>
          </Paper>
        </Box>
      </Container>
    );
  }

  // Audio/Video Check Step
  if (step === 'audioVideoCheck') {
    return (
      <Container maxWidth="sm">
        <Box
          display="flex"
          flexDirection="column"
          alignItems="center"
          justifyContent="center"
          minHeight="100vh"
          gap={3}
        >
          <Paper elevation={3} sx={{ p: 4, width: '100%' }}>
            <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
              <Typography variant="h6" fontWeight="bold">
                Audio / Video Check
              </Typography>
              <Button
                size="small"
                onClick={() => {
                  if (previewStream) {
                    previewStream.getTracks().forEach(track => track.stop());
                  }
                  setStep('consent');
                }}
              >
                ✕
              </Button>
            </Box>

            <Typography variant="body2" color="text.secondary" gutterBottom sx={{ mb: 2 }}>
              Please check if your camera and mic is working and proceed.
            </Typography>

            <Typography variant="subtitle2" gutterBottom>
              Video Preview
            </Typography>

            <Box
              sx={{
                position: 'relative',
                width: '100%',
                paddingTop: '75%',
                backgroundColor: '#000',
                borderRadius: 2,
                overflow: 'hidden',
                mb: 2,
              }}
            >
              <video
                ref={previewVideoRef}
                autoPlay
                playsInline
                muted
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                }}
              />
              <Box
                sx={{
                  position: 'absolute',
                  top: 8,
                  left: 8,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1,
                  color: 'white',
                  backgroundColor: 'rgba(0,0,0,0.6)',
                  px: 1,
                  py: 0.5,
                  borderRadius: 1,
                }}
              >
                <Videocam fontSize="small" />
                <Typography variant="caption">Video Running</Typography>
              </Box>
              <Box
                sx={{
                  position: 'absolute',
                  bottom: 8,
                  left: 8,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1,
                  color: 'white',
                }}
              >
                <Mic fontSize="small" />
                <Box sx={{ display: 'flex', gap: 0.5 }}>
                  {[...Array(5)].map((_, i) => (
                    <Box
                      key={i}
                      sx={{
                        width: 2,
                        height: 20,
                        backgroundColor: 'rgba(255,255,255,0.5)',
                        borderRadius: 1,
                      }}
                    />
                  ))}
                </Box>
              </Box>
            </Box>

            <Alert severity="info" sx={{ mb: 2 }}>
              If the Proceed button does not enable in 30 seconds. Please close the pop-up and join the call again
            </Alert>

            <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 2 }}>
              This video cannot be seen by anyone except you
            </Typography>

            <Button
              variant="contained"
              fullWidth
              size="large"
              onClick={() => {
                if (previewStream) {
                  previewStream.getTracks().forEach(track => track.stop());
                }
                setStep('join');
              }}
              disabled={!audioVideoChecked}
              sx={{ mt: 2 }}
            >
              Proceed
            </Button>
          </Paper>
        </Box>
      </Container>
    );
  }

  if (step === 'join') {
    return (
      <Container maxWidth="sm">
        <Box
          display="flex"
          flexDirection="column"
          alignItems="center"
          justifyContent="center"
          minHeight="100vh"
          gap={3}
        >
          <Paper elevation={3} sx={{ p: 4, width: '100%' }}>
            <Typography variant="h4" gutterBottom align="center">
              Video KYC Verification
            </Typography>
            {session && (
              <>
                <Typography variant="body1" gutterBottom>
                  Session ID: {session.session_id}
                </Typography>
                <Typography variant="body2" color="text.secondary" gutterBottom>
                  Please ensure your camera and microphone are ready.
                </Typography>
                {['expired', 'cancelled', 'completed', 'rejected'].includes(session.status) ? (
                  <Alert severity="error" sx={{ mt: 2 }}>
                    This session has expired or been closed. Please contact support.
                  </Alert>
                ) : (
                  <Button
                    variant="contained"
                    fullWidth
                    size="large"
                    onClick={handleJoinCall}
                    sx={{ mt: 3 }}
                  >
                    Join Video Call
                  </Button>
                )}
              </>
            )}
          </Paper>
        </Box>
      </Container>
    );
  }

  if (step === 'video') {
    const userName = session?.user_name || 'You';
    const agentName = session?.agent_name || session?.agent_username || 'Agent';

    return (
      <Box sx={{ height: '100vh', overflow: 'hidden' }}>
        <VideoCall
          localStream={localStream}
          remoteStream={remoteStream}
          onEndCall={handleEndCall}
          showDocumentCapture={false}
          localUserName={userName}
          remoteUserName={agentName}
          sessionId={sessionId}
        />
      </Box>
    );
  }

  return null;
};

export default UserJoinPage;

