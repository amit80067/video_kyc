import React, { useState, useEffect, useRef } from 'react';
import {
  Box,
  Paper,
  Button,
  IconButton,
  Grid,
  Typography,
  Chip,
  CircularProgress,
  Alert,
  Snackbar,
} from '@mui/material';
import {
  Videocam,
  VideocamOff,
  Mic,
  MicOff,
  CallEnd,
  PhotoCamera,
  Fullscreen,
  FullscreenExit,
  Face,
  NetworkWifi,
  NetworkWifi3Bar,
  NetworkWifi2Bar,
  NetworkWifi1Bar,
} from '@mui/icons-material';
import webrtcService from '../../services/webrtc';
import api from '../../services/api';

const VideoCall = ({ 
  localStream, 
  remoteStream, 
  onDocumentCapture, 
  onEndCall, 
  showDocumentCapture = true,
  localUserName = 'You',
  remoteUserName = 'Remote User',
  sessionId = null
}) => {
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const [cameraEnabled, setCameraEnabled] = useState(true);
  const [micEnabled, setMicEnabled] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  
  // Call quality states
  const [networkQuality, setNetworkQuality] = useState('unknown');
  const [audioQuality, setAudioQuality] = useState('unknown');
  const [videoQuality, setVideoQuality] = useState('unknown');
  const [connectionState, setConnectionState] = useState('disconnected');
  
  // Face matching states
  const [isMatchingFace, setIsMatchingFace] = useState(false);
  const [faceMatchResult, setFaceMatchResult] = useState(null);
  const [showMatchResult, setShowMatchResult] = useState(false);

  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream]);

  useEffect(() => {
    if (remoteVideoRef.current && remoteStream) {
      remoteVideoRef.current.srcObject = remoteStream;
    }
  }, [remoteStream]);

  // Setup stats collection
  useEffect(() => {
    webrtcService.onStatsUpdate = (stats) => {
      setNetworkQuality(stats.networkQuality);
      setAudioQuality(stats.audioQuality);
      setVideoQuality(stats.videoQuality);
      setConnectionState(stats.connectionState);
    };

    webrtcService.onConnectionStateChange = (state) => {
      setConnectionState(state);
    };

    return () => {
      webrtcService.onStatsUpdate = null;
      webrtcService.onConnectionStateChange = null;
    };
  }, []);

  // Get quality color
  const getQualityColor = (quality) => {
    switch (quality) {
      case 'excellent':
        return 'success';
      case 'good':
        return 'info';
      case 'fair':
        return 'warning';
      case 'poor':
        return 'error';
      default:
        return 'default';
    }
  };

  // Get quality icon
  const getNetworkIcon = (quality) => {
    switch (quality) {
      case 'excellent':
        return <NetworkWifi />;
      case 'good':
        return <NetworkWifi3Bar />;
      case 'fair':
        return <NetworkWifi2Bar />;
      case 'poor':
        return <NetworkWifi1Bar />;
      default:
        return <NetworkWifi1Bar />;
    }
  };

  // Handle face matching
  const handleFaceMatch = async () => {
    if (!sessionId || !remoteVideoRef.current) {
      alert('Session ID or video stream not available');
      return;
    }

    setIsMatchingFace(true);
    setFaceMatchResult(null);

    try {
      // Capture frame from remote video
      const blob = await webrtcService.captureFrame(remoteVideoRef.current);
      
      if (!blob) {
        throw new Error('Failed to capture video frame');
      }

      // Create form data
      const formData = new FormData();
      formData.append('liveImage', blob, 'face-frame.jpg');
      formData.append('sessionId', sessionId);

      // Call API
      const response = await api.post('/kyc/realtime-face-match', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      setFaceMatchResult(response.data);
      setShowMatchResult(true);
    } catch (error) {
      console.error('Face matching error:', error);
      setFaceMatchResult({
        match: false,
        similarity: 0,
        message: error.response?.data?.error || 'Failed to perform face matching'
      });
      setShowMatchResult(true);
    } finally {
      setIsMatchingFace(false);
    }
  };

  const toggleCamera = () => {
    webrtcService.toggleCamera();
    setCameraEnabled(!cameraEnabled);
  };

  const toggleMicrophone = () => {
    webrtcService.toggleMicrophone();
    setMicEnabled(!micEnabled);
  };

  const handleEndCall = () => {
    webrtcService.endCall();
    if (onEndCall) {
      onEndCall();
    }
  };

  const toggleFullscreen = () => {
    if (!isFullscreen) {
      if (document.documentElement.requestFullscreen) {
        document.documentElement.requestFullscreen();
      } else if (document.documentElement.webkitRequestFullscreen) {
        document.documentElement.webkitRequestFullscreen();
      } else if (document.documentElement.msRequestFullscreen) {
        document.documentElement.msRequestFullscreen();
      }
      setIsFullscreen(true);
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
      } else if (document.webkitExitFullscreen) {
        document.webkitExitFullscreen();
      } else if (document.msExitFullscreen) {
        document.msExitFullscreen();
      }
      setIsFullscreen(false);
    }
  };

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement || !!document.webkitFullscreenElement || !!document.msFullscreenElement);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    document.addEventListener('msfullscreenchange', handleFullscreenChange);

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
      document.removeEventListener('msfullscreenchange', handleFullscreenChange);
    };
  }, []);

  return (
    <Box sx={{ height: '100vh', display: 'flex', flexDirection: 'column', bgcolor: '#000' }}>
      <Grid container spacing={1} sx={{ flex: 1, p: 1, height: 'calc(100vh - 80px)' }}>
        {/* Remote Video (Main Screen) */}
        <Grid item xs={12} sx={{ height: '100%' }}>
          <Paper
            sx={{
              position: 'relative',
              height: '100%',
              backgroundColor: '#000',
              borderRadius: 2,
              overflow: 'hidden',
            }}
          >
            <video
              ref={remoteVideoRef}
              autoPlay
              playsInline
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
              }}
            />
            {!remoteStream && (
              <Box
                sx={{
                  position: 'absolute',
                  top: '50%',
                  left: '50%',
                  transform: 'translate(-50%, -50%)',
                  color: 'white',
                }}
              >
                <Typography>Waiting for {remoteUserName} to join...</Typography>
              </Box>
            )}
            {/* Remote User Name Overlay */}
            <Box
              sx={{
                position: 'absolute',
                bottom: 16,
                left: 16,
                backgroundColor: 'rgba(0, 0, 0, 0.7)',
                color: 'white',
                px: 2,
                py: 1,
                borderRadius: 2,
              }}
            >
              <Typography variant="body1" fontWeight="bold">
                {remoteUserName}
              </Typography>
            </Box>

            {/* Call Quality Indicators */}
            <Box
              sx={{
                position: 'absolute',
                top: 16,
                right: 16,
                display: 'flex',
                flexDirection: 'column',
                gap: 1,
                zIndex: 10,
              }}
            >
              {/* Network Quality */}
              <Chip
                icon={getNetworkIcon(networkQuality)}
                label={`Network: ${networkQuality}`}
                color={getQualityColor(networkQuality)}
                size="small"
                sx={{ backgroundColor: 'rgba(0, 0, 0, 0.7)', color: 'white' }}
              />
              
              {/* Audio Quality */}
              <Chip
                icon={<Mic />}
                label={`Audio: ${audioQuality}`}
                color={getQualityColor(audioQuality)}
                size="small"
                sx={{ backgroundColor: 'rgba(0, 0, 0, 0.7)', color: 'white' }}
              />
              
              {/* Video Quality */}
              <Chip
                icon={<Videocam />}
                label={`Video: ${videoQuality}`}
                color={getQualityColor(videoQuality)}
                size="small"
                sx={{ backgroundColor: 'rgba(0, 0, 0, 0.7)', color: 'white' }}
              />
              
              {/* Connection State */}
              <Chip
                label={`Connection: ${connectionState}`}
                color={connectionState === 'connected' ? 'success' : 'warning'}
                size="small"
                sx={{ backgroundColor: 'rgba(0, 0, 0, 0.7)', color: 'white' }}
              />
            </Box>
          </Paper>
        </Grid>

        {/* Local Video (Small Picture-in-Picture) */}
        <Grid item xs={12} sm={4} md={3} sx={{ position: 'absolute', bottom: 80, right: 16, zIndex: 1000 }}>
          <Paper
            sx={{
              position: 'relative',
              paddingTop: '75%', // 4:3 aspect ratio
              backgroundColor: '#000',
              borderRadius: 2,
              overflow: 'hidden',
              boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
            }}
          >
            <video
              ref={localVideoRef}
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
            {/* Local User Name Overlay */}
            <Box
              sx={{
                position: 'absolute',
                bottom: 8,
                left: 8,
                backgroundColor: 'rgba(0, 0, 0, 0.7)',
                color: 'white',
                px: 1.5,
                py: 0.5,
                borderRadius: 1,
              }}
            >
              <Typography variant="caption" fontWeight="bold">
                {localUserName}
              </Typography>
            </Box>
          </Paper>
        </Grid>
      </Grid>

      {/* Controls - Fixed at bottom */}
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          gap: 2,
          py: 2,
          bgcolor: 'rgba(0, 0, 0, 0.8)',
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          zIndex: 1001,
        }}
      >
        <IconButton
          color={cameraEnabled ? 'primary' : 'default'}
          onClick={toggleCamera}
          size="large"
          sx={{ color: 'white', bgcolor: 'rgba(255,255,255,0.1)', '&:hover': { bgcolor: 'rgba(255,255,255,0.2)' } }}
        >
          {cameraEnabled ? <Videocam /> : <VideocamOff />}
        </IconButton>

        <IconButton
          color={micEnabled ? 'primary' : 'default'}
          onClick={toggleMicrophone}
          size="large"
          sx={{ color: 'white', bgcolor: 'rgba(255,255,255,0.1)', '&:hover': { bgcolor: 'rgba(255,255,255,0.2)' } }}
        >
          {micEnabled ? <Mic /> : <MicOff />}
        </IconButton>

        {showDocumentCapture && onDocumentCapture && (
          <Button
            variant="contained"
            startIcon={<PhotoCamera />}
            onClick={onDocumentCapture}
            color="secondary"
            sx={{ color: 'white' }}
          >
            Capture Document
          </Button>
        )}

        {/* Face Matching Button */}
        {sessionId && (
          <Button
            variant="contained"
            startIcon={isMatchingFace ? <CircularProgress size={16} color="inherit" /> : <Face />}
            onClick={handleFaceMatch}
            disabled={isMatchingFace || !remoteStream}
            color="primary"
            sx={{ color: 'white' }}
          >
            {isMatchingFace ? 'Matching...' : 'Match Face'}
          </Button>
        )}

        <IconButton
          onClick={toggleFullscreen}
          size="large"
          sx={{ color: 'white', bgcolor: 'rgba(255,255,255,0.1)', '&:hover': { bgcolor: 'rgba(255,255,255,0.2)' } }}
        >
          {isFullscreen ? <FullscreenExit /> : <Fullscreen />}
        </IconButton>

        <IconButton
          color="error"
          onClick={handleEndCall}
          size="large"
          sx={{ color: 'white', bgcolor: 'rgba(244, 67, 54, 0.8)', '&:hover': { bgcolor: 'rgba(244, 67, 54, 1)' } }}
        >
          <CallEnd />
        </IconButton>
      </Box>

      {/* Face Match Result Snackbar */}
      <Snackbar
        open={showMatchResult}
        autoHideDuration={6000}
        onClose={() => setShowMatchResult(false)}
        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
      >
        <Alert
          onClose={() => setShowMatchResult(false)}
          severity={faceMatchResult?.match ? 'success' : 'error'}
          sx={{ width: '100%' }}
        >
          {faceMatchResult?.match ? (
            <Box>
              <Typography variant="body1" fontWeight="bold">
                ✓ Face Match Verified
              </Typography>
              <Typography variant="body2">
                Similarity: {faceMatchResult?.similarity?.toFixed(1)}%
              </Typography>
            </Box>
          ) : (
            <Box>
              <Typography variant="body1" fontWeight="bold">
                ✗ Face Match Failed
              </Typography>
              <Typography variant="body2">
                {faceMatchResult?.similarity > 0 
                  ? `Similarity: ${faceMatchResult?.similarity?.toFixed(1)}% (Minimum: 70%)`
                  : faceMatchResult?.message || 'No face detected or match not found'}
              </Typography>
            </Box>
          )}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default VideoCall;

