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
  const [fullscreenVideo, setFullscreenVideo] = useState(null); // 'local' or 'remote' or null
  const [mainVideo, setMainVideo] = useState('remote'); // 'local' or 'remote' - which video is main (big)
  
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
    console.log('🎥 VideoCall: remoteStream changed', {
      hasRemoteStream: !!remoteStream,
      streamId: remoteStream?.id,
      tracks: remoteStream?.getTracks()?.length,
      videoRef: !!remoteVideoRef.current
    });
    if (remoteVideoRef.current && remoteStream) {
      console.log('✅ Setting remote video srcObject');
      remoteVideoRef.current.srcObject = remoteStream;
      // Force play
      remoteVideoRef.current.play().catch(err => {
        console.error('Error playing remote video:', err);
      });
    } else if (remoteVideoRef.current && !remoteStream) {
      console.log('⚠️ Clearing remote video srcObject');
      remoteVideoRef.current.srcObject = null;
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

  // Handle video click to swap main and small video
  const handleVideoClick = (videoType) => {
    // If clicking on small video, swap it with main video
    if (mainVideo !== videoType) {
      // Swap videos - clicked video becomes main
      setMainVideo(videoType);
      setFullscreenVideo(null);
      setIsFullscreen(false);
    } else {
      // If clicking on main video, make it fullscreen
      const videoElement = videoType === 'local' ? localVideoRef.current : remoteVideoRef.current;
      if (!videoElement) return;

      if (fullscreenVideo === videoType) {
        // Exit fullscreen
        if (document.exitFullscreen) {
          document.exitFullscreen();
        } else if (document.webkitExitFullscreen) {
          document.webkitExitFullscreen();
        } else if (document.msExitFullscreen) {
          document.msExitFullscreen();
        }
        setFullscreenVideo(null);
        setIsFullscreen(false);
      } else {
        // Enter fullscreen
        if (videoElement.requestFullscreen) {
          videoElement.requestFullscreen();
        } else if (videoElement.webkitRequestFullscreen) {
          videoElement.webkitRequestFullscreen();
        } else if (videoElement.mozRequestFullScreen) {
          videoElement.mozRequestFullScreen();
        } else if (videoElement.msRequestFullscreen) {
          videoElement.msRequestFullscreen();
        }
        setFullscreenVideo(videoType);
        setIsFullscreen(true);
      }
    }
  };

  const toggleFullscreen = () => {
    if (!isFullscreen) {
      // Fullscreen the remote video by default
      handleVideoClick('remote');
    } else {
      // Exit fullscreen
      if (document.exitFullscreen) {
        document.exitFullscreen();
      } else if (document.webkitExitFullscreen) {
        document.webkitExitFullscreen();
      } else if (document.msExitFullscreen) {
        document.msExitFullscreen();
      }
      setFullscreenVideo(null);
      setIsFullscreen(false);
    }
  };

  useEffect(() => {
    const handleFullscreenChange = () => {
      const isCurrentlyFullscreen = !!(
        document.fullscreenElement || 
        document.webkitFullscreenElement || 
        document.msFullscreenElement ||
        document.mozFullScreenElement
      );
      
      setIsFullscreen(isCurrentlyFullscreen);
      
      // If exited fullscreen, reset state
      if (!isCurrentlyFullscreen) {
        setFullscreenVideo(null);
      }
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    document.addEventListener('msfullscreenchange', handleFullscreenChange);
    document.addEventListener('mozfullscreenchange', handleFullscreenChange);

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
      document.removeEventListener('msfullscreenchange', handleFullscreenChange);
      document.removeEventListener('mozfullscreenchange', handleFullscreenChange);
    };
  }, []);

  // Determine which video is main (big) and which is small (corner)
  const isRemoteMain = mainVideo === 'remote';
  const MainVideo = isRemoteMain ? remoteVideoRef : localVideoRef;
  const SmallVideo = isRemoteMain ? localVideoRef : remoteVideoRef;
  const mainUserName = isRemoteMain ? remoteUserName : localUserName;
  const smallUserName = isRemoteMain ? localUserName : remoteUserName;
  const mainStream = isRemoteMain ? remoteStream : localStream;
  const smallStream = isRemoteMain ? localStream : remoteStream;

  return (
    <Box sx={{ height: '100vh', display: 'flex', flexDirection: 'column', bgcolor: '#000', position: 'relative' }}>
      {/* Main Video (Full Screen) */}
      <Box
        sx={{
          position: 'relative',
          width: '100%',
          height: 'calc(100vh - 80px)',
          backgroundColor: '#000',
          cursor: 'pointer',
          '&:hover': {
            '&::after': {
              content: '"Click to fullscreen"',
              position: 'absolute',
              bottom: 20,
              right: 20,
              backgroundColor: 'rgba(0, 0, 0, 0.7)',
              color: 'white',
              px: 2,
              py: 1,
              borderRadius: 1,
              fontSize: '12px',
            },
          },
        }}
        onClick={() => handleVideoClick(mainVideo)}
      >
        <video
          ref={MainVideo}
          autoPlay
          playsInline
          muted={!isRemoteMain}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
          }}
        />
        {!mainStream && (
          <Box
            sx={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              color: 'white',
            }}
          >
            <Typography>Waiting for {mainUserName} to join...</Typography>
          </Box>
        )}
        {/* Main User Name Overlay */}
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
            {mainUserName}
          </Typography>
        </Box>

        {/* Call Quality Indicators - Only on remote when it's main */}
        {isRemoteMain && (
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
            <Chip
              icon={getNetworkIcon(networkQuality)}
              label={`Network: ${networkQuality}`}
              color={getQualityColor(networkQuality)}
              size="small"
              sx={{ backgroundColor: 'rgba(0, 0, 0, 0.7)', color: 'white' }}
            />
            <Chip
              icon={<Mic />}
              label={`Audio: ${audioQuality}`}
              color={getQualityColor(audioQuality)}
              size="small"
              sx={{ backgroundColor: 'rgba(0, 0, 0, 0.7)', color: 'white' }}
            />
            <Chip
              icon={<Videocam />}
              label={`Video: ${videoQuality}`}
              color={getQualityColor(videoQuality)}
              size="small"
              sx={{ backgroundColor: 'rgba(0, 0, 0, 0.7)', color: 'white' }}
            />
            <Chip
              label={`Connection: ${connectionState}`}
              color={connectionState === 'connected' ? 'success' : 'warning'}
              size="small"
              sx={{ backgroundColor: 'rgba(0, 0, 0, 0.7)', color: 'white' }}
            />
          </Box>
        )}
      </Box>

      {/* Small Video (Picture-in-Picture - Top Right Corner) */}
      <Paper
        sx={{
          position: 'absolute',
          top: 16,
          right: 16,
          width: { xs: '120px', sm: '180px', md: '240px' },
          aspectRatio: '4/3',
          backgroundColor: '#000',
          borderRadius: 2,
          overflow: 'hidden',
          boxShadow: '0 4px 20px rgba(0,0,0,0.8)',
          cursor: 'pointer',
          zIndex: 1000,
          '&:hover': {
            boxShadow: '0 0 30px rgba(255,255,255,0.5)',
            transform: 'scale(1.05)',
            transition: 'all 0.2s',
          },
        }}
        onClick={() => handleVideoClick(isRemoteMain ? 'local' : 'remote')}
      >
        <video
          ref={SmallVideo}
          autoPlay
          playsInline
          muted={isRemoteMain}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
          }}
        />
        {/* Small User Name Overlay */}
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
            {smallUserName}
          </Typography>
        </Box>
        
        {/* Click hint */}
        <Box
          sx={{
            position: 'absolute',
            top: 8,
            right: 8,
            backgroundColor: 'rgba(0, 0, 0, 0.7)',
            color: 'white',
            px: 1,
            py: 0.5,
            borderRadius: 1,
            display: 'flex',
            alignItems: 'center',
            gap: 0.5,
          }}
        >
          <Fullscreen sx={{ fontSize: 12 }} />
        </Box>
      </Paper>

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

