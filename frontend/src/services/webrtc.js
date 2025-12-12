import io from 'socket.io-client';

// Use relative URL for socket (nginx will proxy to backend)
// Or use environment variable if set
const SOCKET_URL = process.env.REACT_APP_SOCKET_URL || '';

class WebRTCService {
  constructor() {
    this.socket = null;
    this.peerConnection = null;
    this.localStream = null;
    this.remoteStream = null;
    this.roomId = null;
    this.isRecording = false;
    this.mediaRecorder = null;
    this.recordedChunks = [];
    this.statsInterval = null;
    this.onStatsUpdate = null;
    this.currentVideoQuality = 'medium'; // Start with medium, upgrade to 'high' only on excellent network
    this.qualityAdjustmentInterval = null;
    this.lastNetworkQuality = 'unknown';
  }

  /**
   * Initialize socket connection
   */
  connect() {
    // Use relative URL if SOCKET_URL is empty, otherwise use provided URL
    const socketUrl = SOCKET_URL || window.location.origin;
    this.socket = io(socketUrl, {
      transports: ['websocket', 'polling'],
      path: '/socket.io',
    });

    this.socket.on('connect', () => {
      console.log('Socket connected:', this.socket.id);
    });

    this.socket.on('disconnect', () => {
      console.log('Socket disconnected');
    });

    return this.socket;
  }

  /**
   * Join a room (session)
   */
  joinRoom(roomId, userType) {
    if (!this.socket) {
      this.connect();
    }

    this.roomId = roomId;
    this.socket.emit('join-room', roomId, userType);

    // Listen for WebRTC events
    this.setupWebRTCHandlers();
  }

  /**
   * Setup WebRTC peer connection
   */
  async setupPeerConnection() {
    const configuration = {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
      ],
    };

    this.peerConnection = new RTCPeerConnection(configuration);

    // Add local stream tracks
    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => {
        this.peerConnection.addTrack(track, this.localStream);
      });
    }

    // Handle remote stream
    this.peerConnection.ontrack = (event) => {
      this.remoteStream = event.streams[0];
      if (this.onRemoteStream) {
        this.onRemoteStream(this.remoteStream);
      }
    };

    // Handle ICE candidates
    this.peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        this.socket.emit('ice-candidate', {
          candidate: event.candidate,
          roomId: this.roomId,
        });
      }
    };

    // Handle connection state changes
    this.peerConnection.onconnectionstatechange = () => {
      console.log('Connection state:', this.peerConnection.connectionState);
      if (this.onConnectionStateChange) {
        this.onConnectionStateChange(this.peerConnection.connectionState);
      }
    };

    // Start collecting stats
    this.startStatsCollection();
    
    // Start adaptive quality adjustment
    this.startAdaptiveQuality();
  }
  
  /**
   * Get video constraints based on current quality setting
   */
  getVideoConstraints() {
    const constraints = {
      facingMode: 'user'
    };
    
    switch (this.currentVideoQuality) {
      case 'high':
        constraints.width = { ideal: 1280, max: 1920 };
        constraints.height = { ideal: 720, max: 1080 };
        constraints.frameRate = { ideal: 30, max: 30 };
        break;
      case 'medium':
        constraints.width = { ideal: 640, max: 1280 };
        constraints.height = { ideal: 480, max: 720 };
        constraints.frameRate = { ideal: 24, max: 24 };
        break;
      case 'low':
        constraints.width = { ideal: 320, max: 640 };
        constraints.height = { ideal: 240, max: 480 };
        constraints.frameRate = { ideal: 15, max: 15 };
        break;
      default:
        constraints.width = { ideal: 640 };
        constraints.height = { ideal: 480 };
        constraints.frameRate = { ideal: 24 };
    }
    
    return constraints;
  }
  
  /**
   * Start adaptive quality adjustment based on network conditions
   */
  startAdaptiveQuality() {
    if (this.qualityAdjustmentInterval) {
      clearInterval(this.qualityAdjustmentInterval);
    }
    
    this.qualityAdjustmentInterval = setInterval(async () => {
      if (!this.peerConnection || !this.localStream) return;
      
      try {
        const stats = await this.peerConnection.getStats();
        const statsData = this.parseStats(stats);
        
        // Adjust quality based on network conditions
        this.adjustQualityBasedOnNetwork(statsData);
      } catch (error) {
        console.error('Error in adaptive quality adjustment:', error);
      }
    }, 5000); // Check every 5 seconds
  }
  
  /**
   * Adjust video quality based on network conditions
   * High Quality (1280x720 @ 30fps) - ONLY for excellent network
   */
  adjustQualityBasedOnNetwork(statsData) {
    const networkQuality = statsData.networkQuality;
    const videoQuality = statsData.videoQuality;
    
    // Only adjust if network quality changed significantly
    if (networkQuality === this.lastNetworkQuality) return;
    
    this.lastNetworkQuality = networkQuality;
    
    let newQuality = this.currentVideoQuality;
    
    // Adjust based on network quality
    // High quality ONLY for excellent network + excellent video quality
    if (networkQuality === 'excellent' && videoQuality === 'excellent') {
      newQuality = 'high';
    } else if (networkQuality === 'poor' || videoQuality === 'poor') {
      newQuality = 'low';
    } else if (networkQuality === 'fair' || videoQuality === 'fair') {
      newQuality = 'medium';
    } else if (networkQuality === 'good' || videoQuality === 'good') {
      // Good network gets medium quality, NOT high
      newQuality = 'medium';
    } else {
      // Default to medium for unknown/other cases
      newQuality = 'medium';
    }
    
    // Only change if quality actually changed
    if (newQuality !== this.currentVideoQuality) {
      this.setVideoQuality(newQuality);
    }
  }
  
  /**
   * Set video quality and apply constraints
   */
  async setVideoQuality(quality) {
    if (quality === this.currentVideoQuality) return;
    
    this.currentVideoQuality = quality;
    
    if (!this.localStream) return;
    
    const videoTrack = this.localStream.getVideoTracks()[0];
    if (!videoTrack) return;
    
    try {
      const constraints = this.getVideoConstraints();
      await videoTrack.applyConstraints(constraints);
      console.log(`Video quality adjusted to: ${quality}`, constraints);
    } catch (error) {
      console.error('Error applying video constraints:', error);
    }
  }
  
  /**
   * Stop adaptive quality adjustment
   */
  stopAdaptiveQuality() {
    if (this.qualityAdjustmentInterval) {
      clearInterval(this.qualityAdjustmentInterval);
      this.qualityAdjustmentInterval = null;
    }
  }

  /**
   * Start collecting WebRTC connection statistics
   */
  startStatsCollection() {
    if (this.statsInterval) {
      clearInterval(this.statsInterval);
    }

    this.statsInterval = setInterval(async () => {
      if (!this.peerConnection) return;

      try {
        const stats = await this.peerConnection.getStats();
        const statsData = this.parseStats(stats);
        
        if (this.onStatsUpdate) {
          this.onStatsUpdate(statsData);
        }
      } catch (error) {
        console.error('Error getting stats:', error);
      }
    }, 2000); // Update every 2 seconds
  }

  /**
   * Parse WebRTC stats into readable format
   */
  parseStats(stats) {
    const statsData = {
      connectionState: this.peerConnection?.connectionState || 'disconnected',
      networkQuality: 'unknown',
      audioQuality: 'unknown',
      videoQuality: 'unknown',
      audioStats: {},
      videoStats: {},
    };

    stats.forEach((report) => {
      // Connection stats
      if (report.type === 'transport' || report.type === 'candidate-pair') {
        const availableOutgoingBitrate = report.availableOutgoingBitrate || report.bytesReceived || 0;
        if (availableOutgoingBitrate > 500000) {
          statsData.networkQuality = 'excellent';
        } else if (availableOutgoingBitrate > 250000) {
          statsData.networkQuality = 'good';
        } else if (availableOutgoingBitrate > 100000) {
          statsData.networkQuality = 'fair';
        } else {
          statsData.networkQuality = 'poor';
        }
      }

      // Audio stats
      if (report.type === 'inbound-rtp' && report.mediaType === 'audio') {
        const packetsLost = report.packetsLost || 0;
        const packetsReceived = report.packetsReceived || 1;
        const lossRate = (packetsLost / (packetsReceived + packetsLost)) * 100;
        const jitter = report.jitter || 0;

        statsData.audioStats = {
          packetsLost,
          packetsReceived,
          lossRate,
          jitter,
        };

        if (lossRate < 1 && jitter < 20) {
          statsData.audioQuality = 'excellent';
        } else if (lossRate < 3 && jitter < 50) {
          statsData.audioQuality = 'good';
        } else if (lossRate < 5 && jitter < 100) {
          statsData.audioQuality = 'fair';
        } else {
          statsData.audioQuality = 'poor';
        }
      }

      // Video stats
      if (report.type === 'inbound-rtp' && report.mediaType === 'video') {
        const packetsLost = report.packetsLost || 0;
        const packetsReceived = report.packetsReceived || 1;
        const lossRate = (packetsLost / (packetsReceived + packetsLost)) * 100;
        const frameWidth = report.frameWidth || 0;
        const frameHeight = report.frameHeight || 0;
        const framesPerSecond = report.framesPerSecond || 0;

        statsData.videoStats = {
          packetsLost,
          packetsReceived,
          lossRate,
          frameWidth,
          frameHeight,
          framesPerSecond,
        };

        if (lossRate < 1 && framesPerSecond >= 25) {
          statsData.videoQuality = 'excellent';
        } else if (lossRate < 3 && framesPerSecond >= 20) {
          statsData.videoQuality = 'good';
        } else if (lossRate < 5 && framesPerSecond >= 15) {
          statsData.videoQuality = 'fair';
        } else {
          statsData.videoQuality = 'poor';
        }
      }
    });

    return statsData;
  }

  /**
   * Stop stats collection
   */
  stopStatsCollection() {
    if (this.statsInterval) {
      clearInterval(this.statsInterval);
      this.statsInterval = null;
    }
  }

  /**
   * Setup WebRTC event handlers
   */
  setupWebRTCHandlers() {
    // Handle offer
    this.socket.on('offer', async (data) => {
      try {
        if (!this.peerConnection) {
          await this.setupPeerConnection();
        }

        // Check connection state before setting remote description
        if (this.peerConnection.signalingState === 'stable' || 
            this.peerConnection.signalingState === 'have-local-offer') {
          // Only set remote description if in correct state
          if (this.peerConnection.signalingState === 'stable') {
            await this.peerConnection.setRemoteDescription(
              new RTCSessionDescription(data.offer)
            );
          } else {
            console.warn('Cannot set remote description, current state:', this.peerConnection.signalingState);
            return;
          }
        } else {
          await this.peerConnection.setRemoteDescription(
            new RTCSessionDescription(data.offer)
          );
        }

        // Create and set answer only if in correct state
        if (this.peerConnection.signalingState === 'have-remote-offer') {
          const answer = await this.peerConnection.createAnswer();
          await this.peerConnection.setLocalDescription(answer);

          this.socket.emit('answer', {
            answer: answer,
            roomId: this.roomId,
            targetSocketId: data.socketId,
          });
        }
      } catch (error) {
        console.error('Error handling offer:', error);
        // If error, try to reset connection
        if (error.name === 'InvalidStateError') {
          console.log('Invalid state error, resetting peer connection');
          if (this.peerConnection) {
            this.peerConnection.close();
            this.peerConnection = null;
          }
          // Retry after a short delay
          setTimeout(async () => {
            if (!this.peerConnection) {
              await this.setupPeerConnection();
            }
          }, 1000);
        }
      }
    });

    // Handle answer
    this.socket.on('answer', async (data) => {
      try {
        if (this.peerConnection) {
          // Check connection state before setting remote description
          if (this.peerConnection.signalingState === 'have-local-offer') {
            await this.peerConnection.setRemoteDescription(
              new RTCSessionDescription(data.answer)
            );
          } else {
            console.warn('Cannot set remote answer, current state:', this.peerConnection.signalingState);
          }
        }
      } catch (error) {
        console.error('Error handling answer:', error);
        if (error.name === 'InvalidStateError') {
          console.log('Invalid state error in answer handler');
        }
      }
    });

    // Handle ICE candidates
    this.socket.on('ice-candidate', async (data) => {
      if (this.peerConnection && data.candidate) {
        await this.peerConnection.addIceCandidate(
          new RTCIceCandidate(data.candidate)
        );
      }
    });

    // Handle user joined
    this.socket.on('user-joined', (data) => {
      console.log('User joined:', data);
      if (this.onUserJoined) {
        this.onUserJoined(data);
      }
    });

    // Handle existing users
    this.socket.on('existing-users', (users) => {
      console.log('Existing users:', users);
      // If there are existing users, create offer
      if (users.length > 0 && !this.peerConnection) {
        this.createOffer();
      }
    });
  }

  /**
   * Get user media (camera and microphone)
   */
  async getUserMedia() {
    try {
      // Check if getUserMedia is available
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('getUserMedia is not supported in this browser. Please use a modern browser.');
      }

      // Check if we're on HTTPS or localhost (required for getUserMedia)
      const isSecure = window.location.protocol === 'https:' || 
                      window.location.hostname === 'localhost' || 
                      window.location.hostname === '127.0.0.1';
      
      if (!isSecure) {
        console.warn('getUserMedia requires HTTPS. Current protocol:', window.location.protocol);
        // Still try, some browsers allow it
      }

      // Adaptive quality based on current setting
      const videoConstraints = this.getVideoConstraints();
      
      this.localStream = await navigator.mediaDevices.getUserMedia({
        video: videoConstraints,
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        },
      });

      if (this.onLocalStream) {
        this.onLocalStream(this.localStream);
      }

      return this.localStream;
    } catch (error) {
      console.error('Error accessing media devices:', error);
      
      // Provide more specific error messages
      let errorMessage = 'Failed to access camera/microphone. ';
      
      if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
        errorMessage += 'Please allow camera and microphone permissions in your browser settings.';
      } else if (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError') {
        errorMessage += 'No camera or microphone found. Please connect a device and try again.';
      } else if (error.name === 'NotReadableError' || error.name === 'TrackStartError') {
        errorMessage += 'Camera or microphone is already in use by another application.';
      } else if (error.name === 'OverconstrainedError' || error.name === 'ConstraintNotSatisfiedError') {
        errorMessage += 'Camera or microphone does not meet the required specifications.';
      } else if (error.name === 'SecurityError') {
        errorMessage += 'HTTPS is required for camera/microphone access. Please use HTTPS.';
      } else {
        errorMessage += `Error: ${error.message || 'Unknown error'}`;
      }
      
      const enhancedError = new Error(errorMessage);
      enhancedError.originalError = error;
      throw enhancedError;
    }
  }

  /**
   * Create offer for WebRTC connection
   */
  async createOffer() {
    try {
      if (!this.peerConnection) {
        await this.setupPeerConnection();
      }

      // Check if already in a state where we can create offer
      if (this.peerConnection.signalingState !== 'stable') {
        console.warn('Cannot create offer, current state:', this.peerConnection.signalingState);
        return;
      }

      const offer = await this.peerConnection.createOffer();
      
      // Set local description only if still in stable state
      if (this.peerConnection.signalingState === 'stable') {
        await this.peerConnection.setLocalDescription(offer);

        this.socket.emit('offer', {
          offer: offer,
          roomId: this.roomId,
        });
      } else {
        console.warn('State changed before setting local description');
      }
    } catch (error) {
      console.error('Error creating offer:', error);
      if (error.name === 'InvalidStateError') {
        console.log('Invalid state error in createOffer, resetting connection');
        if (this.peerConnection) {
          this.peerConnection.close();
          this.peerConnection = null;
        }
        // Retry after a short delay
        setTimeout(async () => {
          if (!this.peerConnection) {
            await this.setupPeerConnection();
          }
        }, 1000);
      }
    }
  }

  /**
   * Start video recording
   */
  startRecording() {
    if (!this.localStream) {
      console.error('Cannot start recording: No local stream available');
      throw new Error('No local stream available');
    }

    // Check if stream has active tracks
    const videoTracks = this.localStream.getVideoTracks();
    const audioTracks = this.localStream.getAudioTracks();
    
    if (videoTracks.length === 0 && audioTracks.length === 0) {
      console.error('Cannot start recording: No active tracks in stream');
      throw new Error('No active tracks in stream');
    }

    console.log('Starting recording with', videoTracks.length, 'video tracks and', audioTracks.length, 'audio tracks');

    this.recordedChunks = [];
    const options = {
      mimeType: 'video/webm;codecs=vp8,opus',
    };

    try {
      // Check if MediaRecorder supports the mimeType
      if (MediaRecorder.isTypeSupported(options.mimeType)) {
        this.mediaRecorder = new MediaRecorder(this.localStream, options);
        console.log('MediaRecorder created with mimeType:', options.mimeType);
      } else {
        console.warn('MimeType not supported, using default');
        this.mediaRecorder = new MediaRecorder(this.localStream);
      }
    } catch (error) {
      console.error('MediaRecorder creation error:', error);
      // Fallback to default
      this.mediaRecorder = new MediaRecorder(this.localStream);
    }

    this.mediaRecorder.ondataavailable = (event) => {
      console.log('Data available event, size:', event.data.size, 'bytes');
      if (event.data.size > 0) {
        this.recordedChunks.push(event.data);
        console.log('Chunk added, total chunks:', this.recordedChunks.length);
      }
    };

    this.mediaRecorder.onerror = (event) => {
      console.error('MediaRecorder error:', event.error);
    };

    this.mediaRecorder.onstop = () => {
      console.log('MediaRecorder stopped, chunks:', this.recordedChunks.length);
      if (this.recordedChunks.length > 0) {
        const blob = new Blob(this.recordedChunks, { type: 'video/webm' });
        console.log('Recording blob created, size:', blob.size, 'bytes');
        if (this.onRecordingComplete) {
          console.log('Calling onRecordingComplete callback');
          this.onRecordingComplete(blob);
        } else {
          console.warn('onRecordingComplete callback not set!');
        }
      } else {
        console.warn('No recorded chunks available, recording may have failed');
      }
      // Clear chunks after processing
      this.recordedChunks = [];
    };

    // Start recording with timeslice to ensure data is captured regularly
    try {
      this.mediaRecorder.start(1000); // Capture data every 1 second
      this.isRecording = true;
      console.log('Recording started with timeslice, state:', this.mediaRecorder.state);
    } catch (error) {
      console.error('Error starting MediaRecorder:', error);
      this.isRecording = false;
      throw error;
    }
  }

  /**
   * Stop video recording
   */
  stopRecording() {
    if (this.mediaRecorder && this.isRecording) {
      this.mediaRecorder.stop();
      this.isRecording = false;
    }
  }

  /**
   * Toggle camera
   */
  toggleCamera() {
    if (this.localStream) {
      const videoTrack = this.localStream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
      }
    }
  }

  /**
   * Toggle microphone
   */
  toggleMicrophone() {
    if (this.localStream) {
      const audioTrack = this.localStream.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
      }
    }
  }

  /**
   * Capture frame from video stream
   */
  captureFrame(videoElement) {
    if (!videoElement || !videoElement.videoWidth) {
      return null;
    }

    const canvas = document.createElement('canvas');
    canvas.width = videoElement.videoWidth;
    canvas.height = videoElement.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(videoElement, 0, 0);
    
    return new Promise((resolve) => {
      canvas.toBlob((blob) => {
        resolve(blob);
      }, 'image/jpeg', 0.95);
    });
  }

  /**
   * End call and cleanup
   */
  endCall() {
    // Stop stats collection
    this.stopStatsCollection();
    
    // Stop adaptive quality adjustment
    this.stopAdaptiveQuality();

    // Stop recording BEFORE clearing callback
    // IMPORTANT: Don't clear onRecordingComplete here - let it process first
    if (this.isRecording) {
      console.log('Stopping recording in endCall');
      this.stopRecording();
      // Wait a bit for recording to process (don't clear callback immediately)
      setTimeout(() => {
        console.log('Recording should be processed by now');
        // Clear callback after processing
        this.onRecordingComplete = null;
      }, 2000);
    } else {
      // If not recording, clear callback immediately
      this.onRecordingComplete = null;
    }

    // Stop all tracks
    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => track.stop());
    }

    // Close peer connection
    if (this.peerConnection) {
      this.peerConnection.close();
      this.peerConnection = null;
    }

    // Disconnect socket
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }

    this.localStream = null;
    this.remoteStream = null;
    this.roomId = null;
  }
}

export default new WebRTCService();

