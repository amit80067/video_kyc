import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useParams, useLocation } from 'react-router-dom';
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
import MeetingViewChime from '../components/VideoCall/MeetingViewChime';
import api from '../services/api';
import webrtcService from '../services/webrtc';
import { sendEnvironmentTelemetry, sendCallEventTelemetry } from '../services/telemetry';

/** Supports /join/:uuid and /join/?32hex (DLT query-pair links). */
function parseJoinSessionIdFromLocation(pathname, search, pathSplat) {
  const rest = String(pathSplat || '')
    .replace(/^\/+/, '')
    .replace(/\/+$/, '');
  if (rest && !rest.includes('/')) {
    return rest;
  }
  const q = String(search || '').replace(/^\?/, '');
  if (q.length === 32 && /^[0-9a-fA-F]+$/.test(q)) {
    const h = q.toLowerCase();
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
  }
  return null;
}

const UserJoinPage = () => {
  const params = useParams();
  const location = useLocation();
  const pathSplat = params['*'];
  const sessionId = useMemo(
    () => parseJoinSessionIdFromLocation(location.pathname, location.search, pathSplat),
    [location.pathname, location.search, pathSplat]
  );
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [step, setStep] = useState('join'); // instructions, consent, audioVideoCheck, join, video
  const [localStream, setLocalStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);
  const [consentAccepted, setConsentAccepted] = useState(false);
  const [audioVideoChecked, setAudioVideoChecked] = useState(false);
  const [previewStream, setPreviewStream] = useState(null);
  const previewVideoRef = useRef(null);
  const autoJoinTriggeredRef = useRef(false);

  useEffect(() => {
    if (!sessionId) {
      setError('Invalid or missing join link. Please use the link sent by SMS or email.');
      setLoading(false);
      return;
    }
    loadSession();
    // Capture environment info when user opens join link
    try {
      sendEnvironmentTelemetry(sessionId, 'user');
      sendCallEventTelemetry(sessionId, 'user', 'USER_PAGE_OPENED', {
        step: 'instructions',
      });
    } catch (e) {
      // non-blocking
      console.error('Telemetry error (user join page):', e);
    }
    return () => {
      webrtcService.endCall();
    };
  }, [sessionId]);

  // Auto-join immediately after session is loaded (skip instructions/consent/check screens)
  useEffect(() => {
    if (!loading && !error && session && !autoJoinTriggeredRef.current && step !== 'video') {
      autoJoinTriggeredRef.current = true;
      handleJoinCall(session);
    }
  }, [loading, error, session, step]);

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
          
          // Actually verify that camera and mic are working
          const verifyDevices = () => {
            const video = previewVideoRef.current;
            const videoTracks = stream.getVideoTracks();
            const audioTracks = stream.getAudioTracks();
            
            // Check if video track exists and is active
            const hasVideo = videoTracks.length > 0 && videoTracks[0].readyState === 'live';
            
            // Check if audio track exists and is active
            const hasAudio = audioTracks.length > 0 && audioTracks[0].readyState === 'live';
            
            // Check if video element is playing and has dimensions
            const videoPlaying = video && 
                                video.readyState >= 2 && 
                                video.videoWidth > 0 && 
                                video.videoHeight > 0;
            
            console.log('Device verification:', {
              hasVideo,
              hasAudio,
              videoPlaying,
              videoWidth: video?.videoWidth,
              videoHeight: video?.videoHeight,
              videoReadyState: video?.readyState
            });
            
            if (hasVideo && hasAudio && videoPlaying) {
              console.log('✅ Camera and mic verified - enabling proceed button');
              setAudioVideoChecked(true);
              return true;
            }
            return false;
          };
          
          // Try to verify immediately
          if (verifyDevices()) {
            return; // Already verified
          }
          
          // Wait for video to load, then verify
          if (previewVideoRef.current) {
            previewVideoRef.current.onloadedmetadata = () => {
              if (verifyDevices()) {
                return; // Verified
              }
              // If not verified yet, try again after a short delay
              setTimeout(() => {
                if (verifyDevices()) {
                  return;
                }
                // Fallback: Auto-enable after 10 seconds if verification fails
                timer = setTimeout(() => {
                  console.warn('⚠️ Auto-enabling proceed button after timeout');
                  setAudioVideoChecked(true);
                }, 10000);
              }, 1000);
            };
          }
          
          // Fallback: Auto-enable after 10 seconds if video doesn't load
          let verified = false;
          const checkVerified = () => {
            if (!verified && verifyDevices()) {
              verified = true;
            }
          };
          
          timer = setTimeout(() => {
            checkVerified();
            if (!verified) {
              console.warn('⚠️ Auto-enabling proceed button after 10 seconds timeout');
              setAudioVideoChecked(true);
            }
          }, 10000);
        } catch (err) {
          console.error('Failed to get media:', err);
          
          // Provide specific error messages
          let errorMsg = 'Failed to access camera/microphone. ';
          
          if (!navigator.mediaDevices && window.location.protocol !== 'https:' && window.location.hostname !== 'localhost') {
            errorMsg += 'HTTPS is required for camera/microphone access. Please use HTTPS or contact support.';
          } else if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
            errorMsg += 'You denied camera/mic permissions. Please enable them in your browser settings and refresh the page.';
          } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
            errorMsg += 'No camera or microphone found. Please connect a device and try again.';
          } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
            errorMsg += 'Camera or microphone is already in use by another application (WhatsApp / Zoom / banking app). Please close other apps using the camera and try again.';
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

          // Telemetry: preview media error
          try {
            sendCallEventTelemetry(sessionId, 'user', 'PREVIEW_MEDIA_ERROR', {
              errorName: err.name,
              message: err.message,
              protocol: window.location.protocol,
              hostname: window.location.hostname,
              hasMediaDevices: !!navigator.mediaDevices,
            });
          } catch (e) {
            console.error('Telemetry error (preview media):', e);
          }
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
    if (!sessionId) {
      setError('Invalid or missing join link.');
      setLoading(false);
      return;
    }
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

  const handleJoinCall = async (sessionOverride = null) => {
    try {
      const currentSession = sessionOverride || session;

      // Check if session is still valid before joining
      if (!currentSession) {
        setError('Session not found');
        return;
      }

      // Real-time session status check from backend before joining
      try {
        const statusCheck = await api.get(`/sessions/link/${sessionId}`);
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
      if (['expired', 'cancelled', 'completed', 'rejected'].includes(currentSession.status)) {
        setError('This session has expired or been closed. Please contact support.');
        return;
      }

      // Log join attempt
      sendCallEventTelemetry(sessionId, 'user', 'USER_JOIN_CALL_ATTEMPT');

      if (process.env.REACT_APP_USE_CHIME === 'true') {
        setStep('video');
        return;
      }

      // Get user media
      const stream = await webrtcService.getUserMedia();
      setLocalStream(stream);

      // Setup WebRTC callbacks FIRST
      webrtcService.onLocalStream = (stream) => {
        console.log('📹 UserJoinPage: Local stream callback called');
        setLocalStream(stream);
      };
      webrtcService.onRemoteStream = (stream) => {
        console.log('🔄 UserJoinPage: Remote stream callback called!', {
          stream: stream,
          streamId: stream?.id,
          tracks: stream?.getTracks()?.length,
          videoTracks: stream?.getVideoTracks()?.length,
          audioTracks: stream?.getAudioTracks()?.length
        });
        if (stream && stream.getTracks().length > 0) {
          console.log('✅ Remote stream has tracks, setting state');
          setRemoteStream(stream);
        } else {
          console.warn('⚠️ Remote stream has no tracks!');
        }
      };
      webrtcService.onConnectionStateChange = (state) => {
        console.log('Connection state:', state);
        // IMPORTANT: Don't stop recording on temporary disconnect
        // Recording should continue until session actually ends
        // Only handle call end if connection is permanently closed
        if (state === 'closed') {
          // Connection permanently closed - wait a bit then end call
          // But don't stop recording immediately - let it continue if streams are still active
          console.log('Connection permanently closed, ending call after delay');
          setTimeout(() => {
            // Only stop recording if streams are actually stopped
            if (webrtcService.isRecording && (!webrtcService.localStream || !webrtcService.remoteStream)) {
              console.log('Stopping recording - streams are stopped');
              webrtcService.stopRecording();
              setTimeout(() => {
                handleEndCall();
              }, 5000);
            } else {
              handleEndCall();
            }
          }, 2000);
        }
        // Note: 'disconnected' and 'failed' are temporary states - don't stop recording
      };
      
      // User disconnect event handle
      if (webrtcService.socket) {
        // Remove old listeners
        webrtcService.socket.off('user-left');
        webrtcService.socket.off('session-expired');
        webrtcService.socket.off('existing-users');
        webrtcService.socket.off('user-joined');
        
        webrtcService.socket.on('user-left', (data) => {
          console.log('User left:', data);
          // Investigator disconnect ho gaya
          alert('Investigator has left the call');
          // IMPORTANT: Continue recording for a few more seconds to capture any final moments
          // Then stop recording and end call
          setTimeout(() => {
            if (webrtcService.isRecording) {
              console.log('Stopping recording after user left (delayed)');
              webrtcService.stopRecording();
              // Wait for recording to process (5 seconds)
              setTimeout(() => {
                handleEndCall();
              }, 5000);
            } else {
              handleEndCall();
            }
          }, 3000); // Wait 3 seconds before stopping recording
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
        
        // Handle existing users - if investigator already joined, wait for offer or create one
        webrtcService.socket.on('existing-users', (users) => {
          console.log('👥 UserJoinPage: Existing users in room:', users);
          if (users.length > 0) {
            // Investigator already in room, setup connection and create offer
            if (!webrtcService.peerConnection && stream) {
              console.log('🔧 UserJoinPage: Setting up peer connection for existing investigator...');
              webrtcService.setupPeerConnection().then(() => {
                setTimeout(() => {
                  if (webrtcService.peerConnection && stream) {
                    console.log('📤 UserJoinPage: Creating offer for existing investigator...');
                    webrtcService.createOffer();
                  }
                }, 1500);
              });
            }
          }
        });
        
        // Handle investigator joined - if investigator joins after user, create offer
        webrtcService.socket.on('user-joined', (data) => {
          console.log('👤 UserJoinPage: Someone joined room:', data);
          if (data.userType === 'investigator') {
            // Investigator joined after user, setup connection and create offer
            if (!webrtcService.peerConnection && stream) {
              console.log('🔧 UserJoinPage: Setting up peer connection for new investigator...');
              webrtcService.setupPeerConnection().then(() => {
                setTimeout(() => {
                  if (webrtcService.peerConnection && stream) {
                    console.log('📤 UserJoinPage: Creating offer for new investigator...');
                    webrtcService.createOffer();
                  }
                }, 1500);
              });
            }
          }
        });
      }

      // Join room
      console.log('🚪 UserJoinPage: Joining room:', sessionId);
      webrtcService.joinRoom(sessionId, 'user');
      
      // Don't create offer immediately - wait for existing-users or user-joined event
      // This prevents race conditions

      // Start recording
      // Store sessionId in a ref to ensure it's available when callback executes
      const currentSessionId = sessionId;
      if (!currentSessionId) {
        console.error('❌ Cannot start recording: sessionId is missing');
        throw new Error('Session ID is required');
      }
      
      console.log('🎥 Starting recording with sessionId:', currentSessionId);
      // #region agent log
      const memInfoJoin = performance.memory ? {usedJSHeapSize:performance.memory.usedJSHeapSize,totalJSHeapSize:performance.memory.totalJSHeapSize,jsHeapSizeLimit:performance.memory.jsHeapSizeLimit} : null;
      fetch('http://localhost:7243/ingest/9d5dbcb0-ce84-440d-85f5-3ff39b360db2',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'UserJoinPage.jsx:346',message:'Before startRecording',data:{sessionId:currentSessionId,hasLocalStream:!!stream,memory:memInfoJoin},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
      // #endregion
      webrtcService.startRecording();
      // #region agent log
      const memInfoJoin2 = performance.memory ? {usedJSHeapSize:performance.memory.usedJSHeapSize,totalJSHeapSize:performance.memory.totalJSHeapSize,jsHeapSizeLimit:performance.memory.jsHeapSizeLimit} : null;
      fetch('http://localhost:7243/ingest/9d5dbcb0-ce84-440d-85f5-3ff39b360db2',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'UserJoinPage.jsx:348',message:'After startRecording',data:{sessionId:currentSessionId,memory:memInfoJoin2},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
      // #endregion
      webrtcService.onRecordingComplete = async (blob) => {
        // Upload recording when call ends
        console.log('🎥 Recording complete callback triggered, blob size:', blob.size, 'bytes');
        // #region agent log
        const memInfoBlob = performance.memory ? {usedJSHeapSize:performance.memory.usedJSHeapSize,totalJSHeapSize:performance.memory.totalJSHeapSize,jsHeapSizeLimit:performance.memory.jsHeapSizeLimit} : null;
        fetch('http://localhost:7243/ingest/9d5dbcb0-ce84-440d-85f5-3ff39b360db2',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'UserJoinPage.jsx:348',message:'onRecordingComplete called',data:{blobSize:blob?.size||0,memory:memInfoBlob},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'F'})}).catch(()=>{});
        // #endregion
        if (!blob || blob.size === 0) {
          console.error('❌ Recording blob is empty, cannot upload');
          return;
        }
        
        // Use the captured sessionId (from closure)
        const uploadSessionId = currentSessionId || sessionId;
        if (!uploadSessionId) {
          console.error('❌ Session ID is null/undefined when trying to upload recording');
          console.error('Current sessionId from params:', sessionId);
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
        } catch (err) {
          console.error('❌ Failed to upload recording:', err);
          console.error('Error details:', err.response?.data || err.message);
          console.error('SessionId used:', uploadSessionId);
          // Don't block session expiration if upload fails
          if (err.response?.status === 413) {
            console.warn('⚠️ Video file too large, but continuing...');
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
      // After call ends, show completion message instead of going back to join
      // This prevents showing expired session error
      setStep('completed');
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
                  primary="Your Video interaction session with the VKYC investigator will be in the recording mode."
                />
              </ListItem>
              <ListItem>
                <ListItemText 
                  primary="A live Photograph will be captured during the Video interaction session with the VKYC investigator."
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
              If the Proceed button does not enable in 10 seconds. Please close the pop-up and join the call again
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

    if (process.env.REACT_APP_USE_CHIME === 'true') {
      return (
        <Box sx={{ height: '100vh', overflow: 'hidden' }}>
          <MeetingViewChime
            sessionId={sessionId}
            role="user"
            onEndCall={handleEndCall}
            showDocumentCapture={false}
          />
        </Box>
      );
    }

    return (
      <Box sx={{ height: '100vh', overflow: 'hidden' }}>
        <VideoCall
          localStream={localStream}
          remoteStream={remoteStream}
          onEndCall={handleEndCall}
          showDocumentCapture={false}
          showFaceMatch={false}
          localUserName={userName}
          remoteUserName={agentName}
          sessionId={sessionId}
        />
      </Box>
    );
  }

  // Completion step - shown after call ends successfully
  if (step === 'completed') {
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
              <CheckCircle sx={{ fontSize: 80, color: 'success.main', mb: 2 }} />
              <Typography variant="h4" gutterBottom color="success.main" fontWeight="bold">
                Verification Complete
              </Typography>
              <Typography variant="h6" gutterBottom color="text.secondary">
                Video KYC Verification
              </Typography>
            </Box>

            <Alert severity="success" sx={{ mb: 3 }}>
              <Typography variant="body1" fontWeight="bold" gutterBottom>
                Thank you for completing the video KYC verification.
              </Typography>
              <Typography variant="body2">
                Your session has been completed successfully. The verification process is now complete.
              </Typography>
            </Alert>

            <Box sx={{ mt: 4, p: 3, bgcolor: '#f5f5f5', borderRadius: 2 }}>
              <Typography variant="body2" color="text.secondary" gutterBottom>
                <strong>What's next?</strong>
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Your verification has been submitted and is being processed. You will be contacted by your service provider if any additional information is required.
              </Typography>
            </Box>

            {sessionId && (
              <Box sx={{ mt: 3 }}>
                <Typography variant="caption" color="text.secondary">
                  Session ID: {sessionId}
                </Typography>
              </Box>
            )}
          </Paper>
        </Box>
      </Container>
    );
  }

  return null;
};

export default UserJoinPage;

