import React, { useState, useRef } from 'react';
import {
  Box,
  Paper,
  Button,
  Typography,
  Alert,
  CircularProgress,
  TextField,
  Grid,
} from '@mui/material';
import { CameraAlt, ArrowBack, Upload, Person } from '@mui/icons-material';
import api from '../../services/api';

const DocumentCapture = ({ sessionId, remoteStream, onBack, onUploaded }) => {
  const [capturedImage, setCapturedImage] = useState(null);
  const [capturedUserPhoto, setCapturedUserPhoto] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploaded, setUploaded] = useState(false);
  const [error, setError] = useState(null);
  const [documentType, setDocumentType] = useState('aadhaar');
  const [captureMode, setCaptureMode] = useState('document'); // 'document' or 'userPhoto'
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);

  // Use remoteStream (user's video) if available, otherwise fallback to agent's camera
  React.useEffect(() => {
    if (remoteStream && videoRef.current) {
      // Use user's remote stream (preferred) - this shows USER's video to agent
      videoRef.current.srcObject = remoteStream;
      streamRef.current = remoteStream;
      console.log('Using remote stream (user video) for document capture');
    } else if (!remoteStream) {
      // Fallback: Use agent's camera if remote stream not available
      startCamera();
    }

    return () => {
      // Only stop tracks if we started our own camera (not remote stream)
      if (streamRef.current && streamRef.current !== remoteStream) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }
    };
  }, [remoteStream]);

  const startCamera = async () => {
    try {
      // Enhanced video constraints for better quality and auto-focus
      const videoConstraints = {
        facingMode: 'environment', // Use back camera on mobile
        width: { ideal: 1920, min: 1280 }, // High resolution
        height: { ideal: 1080, min: 720 },
        aspectRatio: { ideal: 16/9 },
        // Enable auto-focus and other advanced features
        advanced: [
          { focusMode: 'continuous' }, // Continuous auto-focus
          { exposureMode: 'continuous' }, // Auto exposure
          { whiteBalanceMode: 'continuous' }, // Auto white balance
        ]
      };

      // Check if getUserMedia is available
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        // Fallback for older browsers
        const getUserMedia = navigator.mediaDevices?.getUserMedia ||
                             navigator.getUserMedia ||
                             navigator.webkitGetUserMedia ||
                             navigator.mozGetUserMedia ||
                             navigator.msGetUserMedia;
        
        if (!getUserMedia) {
          throw new Error('getUserMedia is not supported in this browser. Please use a modern browser.');
        }
        
        // For older browsers, use legacy API
        const stream = await new Promise((resolve, reject) => {
          getUserMedia.call(navigator, {
            video: videoConstraints
          }, resolve, reject);
        });
        streamRef.current = stream;
      } else {
        // Modern browser API with enhanced constraints
        const stream = await navigator.mediaDevices.getUserMedia({
          video: videoConstraints
        });
        streamRef.current = stream;
        
        // Apply additional camera settings if supported
        const videoTrack = stream.getVideoTracks()[0];
        if (videoTrack && videoTrack.getCapabilities) {
          const capabilities = videoTrack.getCapabilities();
          const settings = videoTrack.getSettings();
          
          console.log('Camera capabilities:', capabilities);
          console.log('Camera settings:', settings);
          
          // Try to set focus mode if supported
          if (videoTrack.getConstraints && capabilities.focusMode) {
            try {
              await videoTrack.applyConstraints({
                advanced: [{ focusMode: 'continuous' }]
              });
              console.log('✅ Auto-focus enabled');
            } catch (focusErr) {
              console.warn('Could not set focus mode:', focusErr);
            }
          }
        }
      }
      
      if (videoRef.current) {
        videoRef.current.srcObject = streamRef.current;
        // Wait for video to load and then trigger focus
        videoRef.current.onloadedmetadata = () => {
          console.log('Video loaded, dimensions:', videoRef.current.videoWidth, 'x', videoRef.current.videoHeight);
        };
      }
    } catch (err) {
      let errorMsg = 'Failed to access camera: ';
      
      if (!navigator.mediaDevices && window.location.protocol !== 'https:' && window.location.hostname !== 'localhost') {
        errorMsg += 'HTTPS is required for camera access. Please use HTTPS.';
      } else if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        errorMsg += 'Please allow camera permissions in your browser settings.';
      } else if (err.name === 'NotFoundError') {
        errorMsg += 'No camera found. Please connect a camera device.';
      } else {
        errorMsg += err.message || 'Unknown error occurred.';
      }
      
      setError(errorMsg);
      console.error('Camera access error:', err);
    }
  };

  const capturePhoto = () => {
    if (videoRef.current && canvasRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const context = canvas.getContext('2d');

      // Use actual video dimensions for better quality
      const videoWidth = video.videoWidth || 1920;
      const videoHeight = video.videoHeight || 1080;
      
      // Set canvas to high resolution
      canvas.width = videoWidth;
      canvas.height = videoHeight;
      
      // Enable high-quality image rendering
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = 'high';
      
      // Draw video frame to canvas
      context.drawImage(video, 0, 0, canvas.width, canvas.height);

      // Capture at high quality (0.95 = 95% quality, max is 1.0)
      const imageData = canvas.toDataURL('image/jpeg', 0.95);
      
      if (captureMode === 'userPhoto') {
        setCapturedUserPhoto(imageData);
      } else {
        setCapturedImage(imageData);
      }

      // Don't stop remote stream tracks (user's video), only stop if it's our own camera
      if (streamRef.current && streamRef.current !== remoteStream) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }
    }
  };

  const retakePhoto = () => {
    if (captureMode === 'userPhoto') {
      setCapturedUserPhoto(null);
    } else {
      setCapturedImage(null);
    }
    setUploaded(false);
    // Restore video stream (remoteStream if available, otherwise agent's camera)
    if (remoteStream && videoRef.current) {
      videoRef.current.srcObject = remoteStream;
      streamRef.current = remoteStream;
    } else if (videoRef.current) {
      startCamera();
    }
  };

  const uploadDocument = async () => {
    if (!capturedImage && !capturedUserPhoto) return;

    setUploading(true);
    setError(null);

    try {
      if (captureMode === 'userPhoto' && capturedUserPhoto) {
        // Upload user photo
        const response = await fetch(capturedUserPhoto);
        const blob = await response.blob();
        const file = new File([blob], 'user-photo.jpg', { type: 'image/jpeg' });

        const formData = new FormData();
        formData.append('userPhoto', file);
        formData.append('sessionId', sessionId);

        await api.post('/kyc/sessions/upload-user-photo', formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });

        setUploaded(true);
        setCapturedUserPhoto(null);
        setCaptureMode('document'); // Switch back to document mode
        
        if (onUploaded) {
          setTimeout(() => {
            onUploaded();
          }, 1000);
        }
      } else if (capturedImage) {
        // Upload document
        const response = await fetch(capturedImage);
        const blob = await response.blob();
        const file = new File([blob], 'document.jpg', { type: 'image/jpeg' });

        const formData = new FormData();
        formData.append('document', file);
        formData.append('sessionId', sessionId);
        formData.append('documentType', documentType);

        await api.post('/kyc/documents/upload', formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });

        setUploaded(true);
        setCapturedImage(null);
        
        // Document uploaded callback
        if (onUploaded) {
          setTimeout(() => {
            onUploaded();
          }, 1000);
        }
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to upload');
    } finally {
      setUploading(false);
    }
  };


  return (
    <Box>
      <Paper elevation={3} sx={{ p: 3 }}>
        <Typography variant="h6" gutterBottom>
          {captureMode === 'userPhoto' ? 'Capture User Photo' : 'Capture Document'}
        </Typography>

        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        {/* Mode Toggle */}
        {!capturedImage && !capturedUserPhoto && (
          <Box sx={{ mb: 2, display: 'flex', gap: 1 }}>
            <Button
              variant={captureMode === 'document' ? 'contained' : 'outlined'}
              onClick={() => setCaptureMode('document')}
              startIcon={<CameraAlt />}
              fullWidth
            >
              Document
            </Button>
            <Button
              variant={captureMode === 'userPhoto' ? 'contained' : 'outlined'}
              onClick={() => setCaptureMode('userPhoto')}
              startIcon={<Person />}
              fullWidth
            >
              User Photo
            </Button>
          </Box>
        )}

        {!capturedImage && !capturedUserPhoto ? (
          <Box>
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
                ref={videoRef}
                autoPlay
                playsInline
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                }}
                onLoadedMetadata={() => {
                  // Trigger focus when video is ready
                  if (videoRef.current && streamRef.current) {
                    const videoTrack = streamRef.current.getVideoTracks()[0];
                    if (videoTrack && videoTrack.getCapabilities) {
                      const capabilities = videoTrack.getCapabilities();
                      if (capabilities.focusMode && capabilities.focusMode.includes('continuous')) {
                        videoTrack.applyConstraints({
                          advanced: [{ focusMode: 'continuous' }]
                        }).catch(err => console.warn('Focus adjustment:', err));
                      }
                    }
                  }
                }}
              />
              <canvas ref={canvasRef} style={{ display: 'none' }} />
            </Box>

            {captureMode === 'document' && (
              <TextField
                select
                fullWidth
                label="Document Type"
                value={documentType}
                onChange={(e) => setDocumentType(e.target.value)}
                sx={{ mb: 2 }}
                SelectProps={{
                  native: true,
                }}
              >
                <option value="aadhaar">Aadhaar Card</option>
                <option value="pan">PAN Card</option>
                <option value="passport">Passport</option>
                <option value="other">Other</option>
              </TextField>
            )}

            <Box sx={{ display: 'flex', gap: 2 }}>
              <Button
                variant="contained"
                startIcon={captureMode === 'userPhoto' ? <Person /> : <CameraAlt />}
                onClick={capturePhoto}
                fullWidth
              >
                {captureMode === 'userPhoto' ? 'Capture User Photo' : 'Capture Document'}
              </Button>
              <Button variant="outlined" onClick={onBack} fullWidth>
                Back
              </Button>
            </Box>
          </Box>
        ) : (
          <Box>
            <Box
              component="img"
              src={capturedUserPhoto || capturedImage}
              alt={capturedUserPhoto ? "Captured user photo" : "Captured document"}
              sx={{
                width: '100%',
                maxHeight: '500px',
                objectFit: 'contain',
                borderRadius: 2,
                mb: 2,
              }}
            />

            {uploaded ? (
              <Alert severity="success" sx={{ mb: 2 }}>
                {capturedUserPhoto ? 'User photo uploaded successfully!' : 'Document uploaded successfully!'}
              </Alert>
            ) : (
              captureMode === 'document' && (
                <TextField
                  select
                  fullWidth
                  label="Document Type"
                  value={documentType}
                  onChange={(e) => setDocumentType(e.target.value)}
                  sx={{ mb: 2 }}
                  SelectProps={{
                    native: true,
                  }}
                >
                  <option value="aadhaar">Aadhaar Card</option>
                  <option value="pan">PAN Card</option>
                  <option value="passport">Passport</option>
                  <option value="other">Other</option>
                </TextField>
              )
            )}

            <Box sx={{ display: 'flex', gap: 2 }}>
              {!uploaded && (
                <Button
                  variant="contained"
                  startIcon={uploading ? <CircularProgress size={20} /> : <Upload />}
                  onClick={uploadDocument}
                  disabled={uploading}
                  fullWidth
                >
                  {uploading ? 'Uploading...' : (capturedUserPhoto ? 'Upload User Photo' : 'Upload Document')}
                </Button>
              )}
              <Button variant="outlined" onClick={retakePhoto} fullWidth>
                Retake
              </Button>
              <Button variant="outlined" onClick={onBack} fullWidth>
                Back to Call
              </Button>
            </Box>
          </Box>
        )}
      </Paper>
    </Box>
  );
};

export default DocumentCapture;

