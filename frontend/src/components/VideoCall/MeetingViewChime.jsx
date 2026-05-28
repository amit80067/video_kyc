import React, { useState, useEffect, useRef } from 'react';
import {
  Box,
  Button,
  IconButton,
  Typography,
  CircularProgress,
  Alert,
  Snackbar,
} from '@mui/material';
import { Videocam, VideocamOff, Mic, MicOff, CallEnd, PhotoCamera, Face } from '@mui/icons-material';
import {
  getChimeJoinInfo,
  createMeetingSession,
  startChimeRecording,
  stopChimeRecording,
} from '../../services/chimeMeeting';
import webrtcService from '../../services/webrtc';
import api from '../../services/api';

export default function MeetingViewChime({ sessionId, role = 'user', onEndCall, showDocumentCapture = true, onDocumentCapture, showFaceMatch = true }) {
  const [meetingSession, setMeetingSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [videoEnabled, setVideoEnabled] = useState(true);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [isMatchingFace, setIsMatchingFace] = useState(false);
  const [faceMatchResult, setFaceMatchResult] = useState(null);
  const [showMatchResult, setShowMatchResult] = useState(false);
  const recordingStartedRef = useRef(false);
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const sessionRef = useRef(null);
  const compositeCanvasRef = useRef(null);
  const compositeAnimationFrameRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const recordedChunksRef = useRef([]);
  const recordingUploadResolveRef = useRef(null);
  const recordingUploadPromiseRef = useRef(null);

  useEffect(() => {
    let session = null;
    async function join() {
      try {
        const { Meeting, Attendee } = await getChimeJoinInfo(sessionId, role);
        session = createMeetingSession(Meeting, Attendee);
        sessionRef.current = session;
        setMeetingSession(session);

        const audioVideo = session.audioVideo;
        // SDK no longer has startLocalAudioInput; ensure it never gets called (e.g. from old cached bundles)
        if (typeof audioVideo.startLocalAudioInput !== 'function') {
          audioVideo.startLocalAudioInput = () => Promise.resolve();
        }
        if (typeof audioVideo.stopLocalAudioInput !== 'function') {
          audioVideo.stopLocalAudioInput = () => Promise.resolve();
        }

        const observer = {
          videoTileDidUpdate: (tileState) => {
            if (tileState.boundVideoElement) return;
            if (tileState.localTile && localVideoRef.current) {
              audioVideo.bindVideoElement(tileState.tileId, localVideoRef.current);
            } else if (!tileState.localTile && remoteVideoRef.current) {
              audioVideo.bindVideoElement(tileState.tileId, remoteVideoRef.current);
            }
          },
          videoTileWasRemoved: () => {},
        };
        audioVideo.addObserver(observer);

        const videoDevices = await audioVideo.listVideoInputDevices();
        const audioDevices = await audioVideo.listAudioInputDevices();
        if (videoDevices.length > 0) {
          await audioVideo.startVideoInput(videoDevices[0]);
        }
        if (audioDevices.length > 0) {
          await audioVideo.startAudioInput(audioDevices[0]);
        }
        await audioVideo.chooseAudioOutput(null);

        audioVideo.start();

        audioVideo.startLocalVideoTile();

        if (role === 'investigator') {
          try {
            await startChimeRecording(sessionId);
            recordingStartedRef.current = true;
          } catch (e) {
            console.warn('Chime recording start failed:', e);
          }

          // Defer local recording so React has committed and video refs are set
          setTimeout(() => {
            startLocalCompositeRecording().catch((e) => {
              console.warn('Local composite recording start failed:', e);
            });
          }, 500);
        }
      } catch (e) {
        console.error('Chime join error:', e);
        setError(e.response?.data?.error || e.message || 'Failed to join meeting');
      } finally {
        setLoading(false);
      }
    }
    join();
    return () => {
      if (sessionRef.current) {
        try {
          sessionRef.current.audioVideo.stopLocalVideoTile();
          sessionRef.current.audioVideo.stop();
          sessionRef.current.audioVideo.stopVideoInput?.();
          sessionRef.current.audioVideo.stopAudioInput?.();
        } catch (e) {}
        if (role === 'investigator' && recordingStartedRef.current) {
          stopChimeRecording(sessionId).catch(console.warn);
        }
      }

      // Stop local composite recording on unmount
      stopLocalCompositeRecording().catch(() => {});
    };
  }, [sessionId, role]);

  const toggleVideo = () => {
    if (!meetingSession) return;
    if (videoEnabled) {
      meetingSession.audioVideo.stopLocalVideoTile();
    } else {
      meetingSession.audioVideo.startLocalVideoTile();
    }
    setVideoEnabled(!videoEnabled);
  };

  const toggleAudio = () => {
    if (!meetingSession) return;
    if (audioEnabled) {
      meetingSession.audioVideo.realtimeMuteLocalAudio();
    } else {
      meetingSession.audioVideo.realtimeUnmuteLocalAudio();
    }
    setAudioEnabled(!audioEnabled);
  };

  const handleEndCall = async () => {
    if (meetingSession && role === 'investigator' && recordingStartedRef.current) {
      try {
        await stopChimeRecording(sessionId);
      } catch (e) {
        console.warn(e);
      }
    }
    if (role === 'investigator') {
      try {
        await stopLocalCompositeRecording();
      } catch (e) {
        console.warn(e);
      }
    }
    if (onEndCall) onEndCall();
  };

  /**
   * Start a local composite recording of what the investigator sees:
   * remote video full-screen + local PiP in the corner, then upload to backend.
   * Works even before remote video is bound (draws black until then).
   */
  const startLocalCompositeRecording = async () => {
    if (mediaRecorderRef.current) return;

    const canvas = document.createElement('canvas');
    // 16:9 canvas; this is what will be recorded
    canvas.width = 1280;
    canvas.height = 720;
    compositeCanvasRef.current = canvas;

    const ctx = canvas.getContext('2d');

    const drawFrame = () => {
      const remoteVideo = remoteVideoRef.current;
      const localVideo = localVideoRef.current;
      if (!remoteVideo) {
        compositeAnimationFrameRef.current = requestAnimationFrame(drawFrame);
        return;
      }

      const { videoWidth: rw, videoHeight: rh } = remoteVideo;
      if (rw && rh) {
        // Draw remote video covering the canvas
        ctx.drawImage(remoteVideo, 0, 0, canvas.width, canvas.height);
      } else {
        // Fallback background
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }

      // Draw local PiP in the top-right corner if available
      if (localVideo && localVideo.videoWidth && localVideo.videoHeight) {
        const pipWidth = canvas.width * 0.25;
        const pipHeight = (pipWidth * 3) / 4; // 4:3
        const x = canvas.width - pipWidth - 16;
        const y = 16;
        ctx.save();
        ctx.beginPath();
        const radius = 12;
        ctx.moveTo(x + radius, y);
        ctx.lineTo(x + pipWidth - radius, y);
        ctx.quadraticCurveTo(x + pipWidth, y, x + pipWidth, y + radius);
        ctx.lineTo(x + pipWidth, y + pipHeight - radius);
        ctx.quadraticCurveTo(x + pipWidth, y + pipHeight, x + pipWidth - radius, y + pipHeight);
        ctx.lineTo(x + radius, y + pipHeight);
        ctx.quadraticCurveTo(x, y + pipHeight, x, y + pipHeight - radius);
        ctx.lineTo(x, y + radius);
        ctx.quadraticCurveTo(x, y, x + radius, y);
        ctx.closePath();
        ctx.clip();
        ctx.drawImage(localVideo, x, y, pipWidth, pipHeight);
        ctx.restore();
      }

      compositeAnimationFrameRef.current = requestAnimationFrame(drawFrame);
    };

    compositeAnimationFrameRef.current = requestAnimationFrame(drawFrame);

    let stream = canvas.captureStream(25);
    let usingScreenFallback = false;
    if (!stream || stream.getTracks().length === 0) {
      console.warn('Canvas capture failed, trying screen capture fallback');
      try {
        stream = await navigator.mediaDevices.getDisplayMedia({
          video: { width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: true,
        });
        usingScreenFallback = true;
        if (compositeAnimationFrameRef.current) {
          cancelAnimationFrame(compositeAnimationFrameRef.current);
          compositeAnimationFrameRef.current = null;
        }
      } catch (screenErr) {
        console.error('Screen capture fallback failed:', screenErr);
        throw new Error('Failed to capture composite stream');
      }
    }

    const mimeTypes = [
      'video/webm;codecs=vp9',
      'video/webm;codecs=vp8',
      'video/webm',
    ];
    let mimeType = '';
    for (const mt of mimeTypes) {
      if (window.MediaRecorder && MediaRecorder.isTypeSupported(mt)) {
        mimeType = mt;
        break;
      }
    }

    const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    recordedChunksRef.current = [];

    // Promise that resolves when upload (or skip) is done so we can await on stop
    recordingUploadPromiseRef.current = new Promise((resolve) => {
      recordingUploadResolveRef.current = resolve;
    });

    recorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) {
        recordedChunksRef.current.push(event.data);
      }
    };

    recorder.onstop = async () => {
      try {
        if (recordedChunksRef.current.length > 0) {
          const blob = new Blob(recordedChunksRef.current, { type: mimeType || 'video/webm' });
          if (blob.size > 0) {
            await uploadCompositeRecording(blob);
          }
        }
      } catch (e) {
        console.error('Composite recording upload failed:', e);
      } finally {
        recordedChunksRef.current = [];
        recordingUploadResolveRef.current?.();
        recordingUploadResolveRef.current = null;
      }
    };

    mediaRecorderRef.current = recorder;
    // timeslice 2s so data is pushed regularly; ensures we get data on stop in all browsers
    recorder.start(2000);
  };

  const stopLocalCompositeRecording = async () => {
    if (compositeAnimationFrameRef.current) {
      cancelAnimationFrame(compositeAnimationFrameRef.current);
      compositeAnimationFrameRef.current = null;
    }
    if (mediaRecorderRef.current) {
      if (mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }
      mediaRecorderRef.current = null;
      // Wait for onstop upload to finish (with timeout)
      const uploadPromise = recordingUploadPromiseRef.current;
      if (uploadPromise) {
        await Promise.race([
          uploadPromise,
          new Promise((r) => setTimeout(r, 60000)),
        ]);
      }
    }
    compositeCanvasRef.current = null;
  };

  const uploadCompositeRecording = async (blob) => {
    if (!sessionId) {
      console.warn('Cannot upload recording: no sessionId');
      return;
    }
    const fileName = `kyc-recording-${sessionId}-${Date.now()}.webm`;
    const formData = new FormData();
    formData.append('video', blob, fileName);
    formData.append('sessionId', sessionId);
    try {
      await api.post('/kyc/recordings/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 120000,
      });
      console.log('Composite recording uploaded to S3');
    } catch (err) {
      console.error('Error uploading composite recording:', err);
    }
  };

  const handleFaceMatch = async () => {
    if (!remoteVideoRef.current || !remoteVideoRef.current.videoWidth || !sessionId) {
      return;
    }
    setIsMatchingFace(true);
    setFaceMatchResult(null);
    try {
      const blob = await webrtcService.captureFrame(remoteVideoRef.current);
      if (!blob) {
        throw new Error('Failed to capture video frame');
      }
      const formData = new FormData();
      formData.append('liveImage', blob, 'face-frame.jpg');
      formData.append('sessionId', sessionId);
      const response = await api.post('/kyc/realtime-face-match', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setFaceMatchResult(response.data);
      setShowMatchResult(true);
    } catch (err) {
      console.error('Face matching error:', err);
      setFaceMatchResult({
        match: false,
        similarity: 0,
        message: err.response?.data?.error || 'Failed to perform face matching',
      });
      setShowMatchResult(true);
    } finally {
      setIsMatchingFace(false);
    }
  };

  if (loading) {
    return (
      <Box display="flex" alignItems="center" justifyContent="center" minHeight="50vh">
        <CircularProgress />
        <Typography sx={{ ml: 2 }}>Joining meeting...</Typography>
      </Box>
    );
  }

  if (error) {
    return (
      <Box p={3}>
        <Alert severity="error">{error}</Alert>
        <Button variant="contained" sx={{ mt: 2 }} onClick={onEndCall}>
          Back
        </Button>
      </Box>
    );
  }

  return (
    <Box sx={{ height: '100vh', minHeight: 0, display: 'flex', flexDirection: 'column', bgcolor: '#000' }}>
      <Box sx={{ flex: 1, minHeight: 0, overflow: 'hidden', display: 'flex', position: 'relative', paddingBottom: '80px' }}>
        <video
          ref={remoteVideoRef}
          autoPlay
          playsInline
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        />
        <Box
          sx={{
            position: 'absolute',
            top: 16,
            right: 16,
            width: 240,
            aspectRatio: '4/3',
            bgcolor: '#333',
            borderRadius: 2,
            overflow: 'hidden',
          }}
        >
          <video ref={localVideoRef} autoPlay playsInline muted style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        </Box>
      </Box>
      <Box
        component="nav"
        aria-label="Call controls"
        sx={{
          position: 'fixed',
          left: 0,
          right: 0,
          bottom: 0,
          flexShrink: 0,
          display: 'flex',
          flexWrap: 'wrap',
          justifyContent: 'center',
          alignItems: 'center',
          gap: 1.5,
          py: 2,
          px: 1,
          bgcolor: 'rgba(0,0,0,0.95)',
          borderTop: '1px solid rgba(255,255,255,0.2)',
          zIndex: 10,
        }}
      >
        <IconButton onClick={toggleVideo} sx={{ color: 'white' }} title="Toggle video">
          {videoEnabled ? <Videocam /> : <VideocamOff />}
        </IconButton>
        <IconButton onClick={toggleAudio} sx={{ color: 'white' }} title="Toggle mic">
          {audioEnabled ? <Mic /> : <MicOff />}
        </IconButton>
        {role === 'investigator' && showDocumentCapture && onDocumentCapture && (
          <Button
            variant="contained"
            color="secondary"
            startIcon={<PhotoCamera />}
            onClick={onDocumentCapture}
            sx={{ color: 'white' }}
          >
            Capture Document
          </Button>
        )}
        {role === 'investigator' && sessionId && showFaceMatch && (
          <Button
            variant="contained"
            startIcon={isMatchingFace ? <CircularProgress size={16} color="inherit" /> : <Face />}
            onClick={handleFaceMatch}
            disabled={isMatchingFace || !remoteVideoRef.current?.videoWidth}
            color="primary"
            sx={{ color: 'white' }}
          >
            {isMatchingFace ? 'Matching...' : 'Match Face'}
          </Button>
        )}
        <IconButton color="error" onClick={handleEndCall} sx={{ color: 'white', bgcolor: 'rgba(244,67,54,0.8)' }} title="End call">
          <CallEnd />
        </IconButton>
      </Box>

      <Snackbar
        open={showMatchResult}
        autoHideDuration={6000}
        onClose={() => setShowMatchResult(false)}
        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
      >
        <Alert onClose={() => setShowMatchResult(false)} severity={faceMatchResult?.match ? 'success' : 'error'} sx={{ width: '100%' }}>
          {faceMatchResult?.match ? (
            <Box>
              <Typography variant="body1" fontWeight="bold">✓ Face Match Verified</Typography>
              <Typography variant="body2">Similarity: {faceMatchResult?.similarity?.toFixed(1)}%</Typography>
            </Box>
          ) : (
            <Box>
              <Typography variant="body1" fontWeight="bold">✗ Face Match Failed</Typography>
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
}
