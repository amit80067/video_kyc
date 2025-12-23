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
    console.log('🔧 Setting up peer connection...');
    const configuration = {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
      ],
    };

    // Close existing connection if any
    if (this.peerConnection) {
      console.log('🔄 Closing existing peer connection');
      this.peerConnection.close();
      this.peerConnection = null;
    }

    this.peerConnection = new RTCPeerConnection(configuration);
    console.log('✅ Peer connection created, state:', this.peerConnection.signalingState);

    // Add local stream tracks BEFORE setting up handlers
    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => {
        console.log('➕ Adding local track:', track.kind, track.id);
        this.peerConnection.addTrack(track, this.localStream);
      });
    } else {
      console.warn('⚠️ No local stream available when setting up peer connection');
    }

    // Handle remote stream - must be set before any offer/answer exchange
    this.peerConnection.ontrack = (event) => {
      console.log('🎥 Received remote track:', event.track.kind, 'Streams:', event.streams?.length, 'Track ID:', event.track.id);
      console.log('ontrack event details:', {
        streams: event.streams?.length || 0,
        trackKind: event.track.kind,
        trackId: event.track.id,
        trackEnabled: event.track.enabled,
        trackReadyState: event.track.readyState
      });
      
      if (event.streams && event.streams.length > 0) {
        this.remoteStream = event.streams[0];
        console.log('✅ Remote stream set from event.streams:', {
          streamId: this.remoteStream.id,
          tracks: this.remoteStream.getTracks().length,
          videoTracks: this.remoteStream.getVideoTracks().length,
          audioTracks: this.remoteStream.getAudioTracks().length
        });
        if (this.onRemoteStream) {
          console.log('📞 Calling onRemoteStream callback with stream');
          // Force callback with setTimeout to ensure state update
          setTimeout(() => {
            if (this.onRemoteStream && this.remoteStream) {
              this.onRemoteStream(this.remoteStream);
            }
          }, 100);
        } else {
          console.warn('⚠️ onRemoteStream callback not set!');
        }
      } else if (event.track) {
        // If no stream, create one from track
        if (!this.remoteStream) {
          this.remoteStream = new MediaStream();
          console.log('📹 Created new remote stream for track');
        }
        this.remoteStream.addTrack(event.track);
        console.log('✅ Added track to remote stream:', {
          trackKind: event.track.kind,
          trackId: event.track.id,
          totalTracks: this.remoteStream.getTracks().length,
          videoTracks: this.remoteStream.getVideoTracks().length,
          audioTracks: this.remoteStream.getAudioTracks().length
        });
        if (this.onRemoteStream) {
          console.log('📞 Calling onRemoteStream callback with stream (from track)');
          // Force callback with setTimeout to ensure state update
          setTimeout(() => {
            if (this.onRemoteStream && this.remoteStream) {
              this.onRemoteStream(this.remoteStream);
            }
          }, 100);
        } else {
          console.warn('⚠️ onRemoteStream callback not set!');
        }
      }
      
      // Also check if we need to update the callback after tracks are added
      if (this.remoteStream && this.remoteStream.getTracks().length > 0 && this.onRemoteStream) {
        console.log('🔄 Ensuring remote stream callback is called with latest stream');
        setTimeout(() => {
          if (this.onRemoteStream && this.remoteStream) {
            this.onRemoteStream(this.remoteStream);
          }
        }, 200);
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
   * Enhanced with auto-focus and better quality settings
   */
  getVideoConstraints() {
    const constraints = {
      facingMode: 'user'
    };
    
    switch (this.currentVideoQuality) {
      case 'high':
        constraints.width = { ideal: 1920, min: 1280 };
        constraints.height = { ideal: 1080, min: 720 };
        constraints.frameRate = { ideal: 30, max: 30 };
        break;
      case 'medium':
        constraints.width = { ideal: 1280, min: 640 };
        constraints.height = { ideal: 720, min: 480 };
        constraints.frameRate = { ideal: 24, max: 24 };
        break;
      case 'low':
        constraints.width = { ideal: 640, min: 320 };
        constraints.height = { ideal: 480, min: 240 };
        constraints.frameRate = { ideal: 15, max: 15 };
        break;
      default:
        constraints.width = { ideal: 1280, min: 640 };
        constraints.height = { ideal: 720, min: 480 };
        constraints.frameRate = { ideal: 24 };
    }
    
    // Add advanced camera features for better quality
    constraints.advanced = [
      { focusMode: 'continuous' }, // Continuous auto-focus
      { exposureMode: 'continuous' }, // Auto exposure
      { whiteBalanceMode: 'continuous' }, // Auto white balance
    ];
    
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
        console.log('Received offer from:', data.socketId);
        
        if (!this.peerConnection) {
          await this.setupPeerConnection();
        }

        // Only process offer if we're in stable state (not already processing)
        if (this.peerConnection.signalingState === 'stable') {
          await this.peerConnection.setRemoteDescription(
            new RTCSessionDescription(data.offer)
          );
          console.log('Remote description set, creating answer...');

          // Create and set answer
          const answer = await this.peerConnection.createAnswer();
          await this.peerConnection.setLocalDescription(answer);
          console.log('✅ Answer created and set, sending to:', data.socketId);
          
          // Check if we already have remote tracks (sometimes tracks arrive before answer)
          if (this.peerConnection.getReceivers().length > 0) {
            console.log('📡 Found existing receivers:', this.peerConnection.getReceivers().length);
            this.peerConnection.getReceivers().forEach((receiver, index) => {
              if (receiver.track) {
                console.log(`Receiver ${index}:`, receiver.track.kind, receiver.track.id);
                if (!this.remoteStream) {
                  this.remoteStream = new MediaStream();
                }
                if (!this.remoteStream.getTracks().some(t => t.id === receiver.track.id)) {
                  this.remoteStream.addTrack(receiver.track);
                  console.log('✅ Added existing receiver track to remote stream');
                }
              }
            });
            if (this.remoteStream && this.remoteStream.getTracks().length > 0 && this.onRemoteStream) {
              console.log('📞 Calling onRemoteStream with existing tracks');
              this.onRemoteStream(this.remoteStream);
            }
          }

          this.socket.emit('answer', {
            answer: answer,
            roomId: this.roomId,
            targetSocketId: data.socketId,
          });
        } else {
          console.warn('Cannot handle offer, current state:', this.peerConnection.signalingState);
        }
      } catch (error) {
        console.error('Error handling offer:', error);
        // If error, try to reset connection
        if (error.name === 'InvalidStateError' || error.name === 'OperationError') {
          console.log('Invalid state error, resetting peer connection');
          if (this.peerConnection) {
            this.peerConnection.close();
            this.peerConnection = null;
          }
          // Retry after a short delay
          setTimeout(async () => {
            if (!this.peerConnection && this.localStream) {
              await this.setupPeerConnection();
              // Retry handling the offer
              if (data && data.offer) {
                try {
                  await this.peerConnection.setRemoteDescription(new RTCSessionDescription(data.offer));
                  const answer = await this.peerConnection.createAnswer();
                  await this.peerConnection.setLocalDescription(answer);
                  this.socket.emit('answer', {
                    answer: answer,
                    roomId: this.roomId,
                    targetSocketId: data.socketId,
                  });
                } catch (retryError) {
                  console.error('Retry failed:', retryError);
                }
              }
            }
          }, 1000);
        }
      }
    });

    // Handle answer
    this.socket.on('answer', async (data) => {
      try {
        console.log('Received answer from:', data.socketId);
        if (this.peerConnection) {
          // Check connection state before setting remote description
          if (this.peerConnection.signalingState === 'have-local-offer') {
            await this.peerConnection.setRemoteDescription(
              new RTCSessionDescription(data.answer)
            );
            console.log('✅ Answer set successfully, connection should be established');
            
            // Check if we already have remote tracks
            if (this.peerConnection.getReceivers().length > 0) {
              console.log('📡 Found existing receivers after answer:', this.peerConnection.getReceivers().length);
              this.peerConnection.getReceivers().forEach((receiver, index) => {
                if (receiver.track) {
                  console.log(`Receiver ${index}:`, receiver.track.kind, receiver.track.id);
                  if (!this.remoteStream) {
                    this.remoteStream = new MediaStream();
                  }
                  if (!this.remoteStream.getTracks().some(t => t.id === receiver.track.id)) {
                    this.remoteStream.addTrack(receiver.track);
                    console.log('✅ Added existing receiver track to remote stream after answer');
                  }
                }
              });
              if (this.remoteStream && this.remoteStream.getTracks().length > 0 && this.onRemoteStream) {
                console.log('📞 Calling onRemoteStream with existing tracks after answer');
                this.onRemoteStream(this.remoteStream);
              }
            }
          } else {
            console.warn('Cannot set remote answer, current state:', this.peerConnection.signalingState);
          }
        } else {
          console.warn('Received answer but no peer connection exists');
        }
      } catch (error) {
        console.error('Error handling answer:', error);
        if (error.name === 'InvalidStateError' || error.name === 'OperationError') {
          console.log('Invalid state error in answer handler, state:', this.peerConnection?.signalingState);
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
      // If there are existing users and we don't have a connection, create offer
      // But only if we have local stream ready
      if (users.length > 0 && !this.peerConnection && this.localStream) {
        setTimeout(() => {
          if (!this.peerConnection && this.localStream) {
            this.createOffer();
          }
        }, 500);
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

      // Apply additional camera settings for better focus and quality
      const videoTrack = this.localStream.getVideoTracks()[0];
      if (videoTrack && videoTrack.getCapabilities) {
        const capabilities = videoTrack.getCapabilities();
        console.log('Camera capabilities:', capabilities);
        
        // Try to enable continuous auto-focus if supported
        if (capabilities.focusMode && capabilities.focusMode.includes('continuous')) {
          try {
            await videoTrack.applyConstraints({
              advanced: [{ focusMode: 'continuous' }]
            });
            console.log('✅ Auto-focus enabled for video call');
          } catch (focusErr) {
            console.warn('Could not set focus mode:', focusErr);
          }
        }
      }

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
      console.log('Creating offer, current state:', this.peerConnection?.signalingState);
      
      if (!this.peerConnection) {
        console.log('No peer connection, setting up...');
        await this.setupPeerConnection();
      }

      // Ensure local stream is added
      if (this.localStream && this.peerConnection) {
        const existingTracks = this.peerConnection.getSenders().map(s => s.track?.kind);
        this.localStream.getTracks().forEach((track) => {
          if (!existingTracks.includes(track.kind)) {
            console.log('Adding local track to existing connection:', track.kind);
            this.peerConnection.addTrack(track, this.localStream);
          }
        });
      }

      // Check if already in a state where we can create offer
      if (this.peerConnection.signalingState !== 'stable') {
        console.warn('Cannot create offer, current state:', this.peerConnection.signalingState);
        return;
      }

      console.log('Creating offer...');
      const offer = await this.peerConnection.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: true
      });
      
      // Set local description only if still in stable state
      if (this.peerConnection.signalingState === 'stable') {
        await this.peerConnection.setLocalDescription(offer);
        console.log('Local description set, sending offer to room:', this.roomId);

        this.socket.emit('offer', {
          offer: offer,
          roomId: this.roomId,
        });
      } else {
        console.warn('State changed before setting local description:', this.peerConnection.signalingState);
      }
    } catch (error) {
      console.error('Error creating offer:', error);
      if (error.name === 'InvalidStateError' || error.name === 'OperationError') {
        console.log('Invalid state error in createOffer, resetting connection');
        if (this.peerConnection) {
          this.peerConnection.close();
          this.peerConnection = null;
        }
        // Retry after a short delay
        setTimeout(async () => {
          if (!this.peerConnection && this.localStream) {
            await this.setupPeerConnection();
            // Retry creating offer
            setTimeout(() => this.createOffer(), 500);
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

