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
import { CameraAlt, ArrowBack, Upload } from '@mui/icons-material';
import api from '../../services/api';

const DocumentCapture = ({ sessionId, onBack, onUploaded }) => {
  const [capturedImage, setCapturedImage] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploaded, setUploaded] = useState(false);
  const [error, setError] = useState(null);
  const [documentType, setDocumentType] = useState('aadhaar');
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);

  const startCamera = async () => {
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
          throw new Error('getUserMedia is not supported in this browser. Please use a modern browser.');
        }
        
        // For older browsers, use legacy API
        const stream = await new Promise((resolve, reject) => {
          getUserMedia.call(navigator, {
            video: { facingMode: 'environment' }
          }, resolve, reject);
        });
        streamRef.current = stream;
      } else {
        // Modern browser API
      const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' } // Use back camera on mobile
      });
      streamRef.current = stream;
      }
      
      if (videoRef.current) {
        videoRef.current.srcObject = streamRef.current;
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

      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      context.drawImage(video, 0, 0);

      const imageData = canvas.toDataURL('image/jpeg');
      setCapturedImage(imageData);

      // Stop camera
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }
    }
  };

  const retakePhoto = () => {
    setCapturedImage(null);
    setUploaded(false);
    startCamera();
  };

  const uploadDocument = async () => {
    if (!capturedImage) return;

    setUploading(true);
    setError(null);

    try {
      // Convert data URL to blob
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
      
      // Document uploaded callback
      if (onUploaded) {
        setTimeout(() => {
          onUploaded();
        }, 1000);
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to upload document');
    } finally {
      setUploading(false);
    }
  };

  React.useEffect(() => {
    startCamera();
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  return (
    <Box>
      <Paper elevation={3} sx={{ p: 3 }}>
        <Typography variant="h6" gutterBottom>
          Capture Document
        </Typography>

        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        {!capturedImage ? (
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
              />
              <canvas ref={canvasRef} style={{ display: 'none' }} />
            </Box>

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

            <Box sx={{ display: 'flex', gap: 2 }}>
              <Button
                variant="contained"
                startIcon={<CameraAlt />}
                onClick={capturePhoto}
                fullWidth
              >
                Capture Photo
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
              src={capturedImage}
              alt="Captured document"
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
                Document uploaded successfully!
              </Alert>
            ) : (
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
              {!uploaded && (
                <Button
                  variant="contained"
                  startIcon={uploading ? <CircularProgress size={20} /> : <Upload />}
                  onClick={uploadDocument}
                  disabled={uploading}
                  fullWidth
                >
                  {uploading ? 'Uploading...' : 'Upload Document'}
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

