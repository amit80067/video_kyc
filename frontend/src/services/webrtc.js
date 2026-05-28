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
    this.currentVideoQuality = 'high'; // Start with high quality for better video clarity
    this.qualityAdjustmentInterval = null;
    this.lastNetworkQuality = 'unknown';
    this.recordingCanvas = null;
    this.recordingCanvasContext = null;
    this.recordingAnimationFrame = null;
    this.localVideoElement = null;
    this.remoteVideoElement = null;
    // Screen recording properties
    this.screenStream = null;
    this.screenRecorder = null;
    this.screenRecordedChunks = [];
    this.isScreenRecording = false;
    this.onScreenRecordingComplete = null;
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
        
        // #region agent log
        try {
          const payload = {
            id: `log_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            timestamp: Date.now(),
            location: 'webrtc.js:343',
            message: 'WebRTC stats update',
            data: {
              connectionState: statsData.connectionState,
              networkQuality: statsData.networkQuality,
              audioQuality: statsData.audioQuality,
              videoQuality: statsData.videoQuality,
              audioStats: statsData.audioStats,
              videoStats: statsData.videoStats,
            },
            sessionId: 'debug-session',
            runId: 'video-stutter',
            hypothesisId: 'stats',
          };
          fetch('http://localhost:7243/ingest/9d5dbcb0-ce84-440d-85f5-3ff39b360db2', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          }).catch(() => {});
        } catch (e) {
          // ignore logging errors
        }
        // #endregion

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
   * Start video recording - records both local and remote streams in one video
   */
  startRecording() {
    // #region agent log
    const memInfo = performance.memory ? {usedJSHeapSize:performance.memory.usedJSHeapSize,totalJSHeapSize:performance.memory.totalJSHeapSize,jsHeapSizeLimit:performance.memory.jsHeapSizeLimit} : null;
    fetch('http://localhost:7243/ingest/9d5dbcb0-ce84-440d-85f5-3ff39b360db2',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'webrtc.js:768',message:'startRecording called',data:{hasLocalStream:!!this.localStream,hasRemoteStream:!!this.remoteStream,remoteTracks:this.remoteStream?.getTracks()?.length||0,memory:memInfo},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
    // #endregion
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
    console.log('Remote stream available:', !!this.remoteStream);
    // #region agent log
    const memInfo2 = performance.memory ? {usedJSHeapSize:performance.memory.usedJSHeapSize,totalJSHeapSize:performance.memory.totalJSHeapSize,jsHeapSizeLimit:performance.memory.jsHeapSizeLimit} : null;
    fetch('http://localhost:7243/ingest/9d5dbcb0-ce84-440d-85f5-3ff39b360db2',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'webrtc.js:785',message:'Stream tracks check',data:{localVideoTracks:videoTracks.length,localAudioTracks:audioTracks.length,hasRemoteStream:!!this.remoteStream,remoteTracksCount:this.remoteStream?.getTracks()?.length||0,remoteVideoTracks:this.remoteStream?.getVideoTracks()?.length||0,remoteAudioTracks:this.remoteStream?.getAudioTracks()?.length||0,memory:memInfo2},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
    // #endregion
    if (this.remoteStream) {
      console.log('Remote stream tracks:', this.remoteStream.getTracks().length, 
                  'video:', this.remoteStream.getVideoTracks().length,
                  'audio:', this.remoteStream.getAudioTracks().length);
    }

    // Clean up any existing recording elements first
    if (this.localVideoElement) {
      this.localVideoElement.srcObject = null;
      this.localVideoElement = null;
    }
    if (this.remoteVideoElement) {
      this.remoteVideoElement.srcObject = null;
      this.remoteVideoElement = null;
    }
    if (this.recordingCanvas) {
      this.recordingCanvas = null;
      this.recordingCanvasContext = null;
    }

    // Create canvas for combining both videos
    // Detect mobile device and use lower resolution to prevent memory crashes
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || 
                     (window.innerWidth <= 768) || 
                     (performance.memory && performance.memory.jsHeapSizeLimit < 1073741824); // Less than 1GB heap limit
    
    // Use adaptive canvas resolution based on device capabilities
    let canvasWidth, canvasHeight;
    if (isMobile) {
      // Mobile: Use 720p to prevent memory crashes
      canvasWidth = 1280;
      canvasHeight = 720;
      console.log('📱 Mobile device detected - using 720p canvas resolution');
    } else {
      // Desktop: Use 1080p
      canvasWidth = 1920;
      canvasHeight = 1080;
      console.log('🖥️ Desktop device - using 1080p canvas resolution');
    }
    
    this.recordingCanvas = document.createElement('canvas');
    this.recordingCanvas.width = canvasWidth;
    this.recordingCanvas.height = canvasHeight;
    this.recordingCanvasContext = this.recordingCanvas.getContext('2d');
    // #region agent log
    const memInfo3 = performance.memory ? {usedJSHeapSize:performance.memory.usedJSHeapSize,totalJSHeapSize:performance.memory.totalJSHeapSize,jsHeapSizeLimit:performance.memory.jsHeapSizeLimit} : null;
    fetch('http://localhost:7243/ingest/9d5dbcb0-ce84-440d-85f5-3ff39b360db2',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'webrtc.js:815',message:'Canvas created',data:{canvasWidth:this.recordingCanvas.width,canvasHeight:this.recordingCanvas.height,memory:memInfo3},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
    // #endregion
    
    // Create temporary video elements for recording
    this.localVideoElement = document.createElement('video');
    this.localVideoElement.srcObject = this.localStream;
    this.localVideoElement.muted = true; // Local audio will be from stream
    this.localVideoElement.autoplay = true;
    this.localVideoElement.playsInline = true;
    this.localVideoElement.play().catch(err => console.error('Error playing local video for recording:', err));

    if (this.remoteStream && this.remoteStream.getTracks().length > 0) {
      console.log('Creating remote video element for recording...');
      // #region agent log
      fetch('http://localhost:7243/ingest/9d5dbcb0-ce84-440d-85f5-3ff39b360db2',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'webrtc.js:819',message:'Creating remote video element',data:{hasRemoteStream:!!this.remoteStream,remoteTracks:this.remoteStream.getTracks().length},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
      // #endregion
      this.remoteVideoElement = document.createElement('video');
      this.remoteVideoElement.srcObject = this.remoteStream;
      this.remoteVideoElement.muted = false; // Remote audio will be captured
      this.remoteVideoElement.autoplay = true;
      this.remoteVideoElement.playsInline = true;
      this.remoteVideoElement.play().then(() => {
        // #region agent log
        fetch('http://localhost:7243/ingest/9d5dbcb0-ce84-440d-85f5-3ff39b360db2',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'webrtc.js:826',message:'Remote video play success',data:{readyState:this.remoteVideoElement?.readyState},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
        // #endregion
      }).catch(err => {
        // #region agent log
        fetch('http://localhost:7243/ingest/9d5dbcb0-ce84-440d-85f5-3ff39b360db2',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'webrtc.js:826',message:'Remote video play failed',data:{error:err.message},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
        // #endregion
        console.error('Error playing remote video for recording:', err);
      });
      console.log('Remote video element created and playing');
    } else {
      // #region agent log
      fetch('http://localhost:7243/ingest/9d5dbcb0-ce84-440d-85f5-3ff39b360db2',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'webrtc.js:830',message:'No remote stream for recording',data:{hasRemoteStream:!!this.remoteStream,remoteTracks:this.remoteStream?.getTracks()?.length||0},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
      // #endregion
      console.log('No remote stream available, recording with local stream only');
      this.remoteVideoElement = null;
    }

    // Wait for videos to be ready before starting recording
    const waitForVideos = () => {
      return new Promise((resolve) => {
        let attempts = 0;
        const maxAttempts = 100; // 10 seconds max wait
        
        const checkReady = () => {
          attempts++;
          const localReady = this.localVideoElement && this.localVideoElement.readyState >= 2;
          const hasRemoteStream = this.remoteStream && this.remoteStream.getTracks().length > 0;
          const remoteReady = !hasRemoteStream || (this.remoteVideoElement && this.remoteVideoElement.readyState >= 2);
          
          console.log('Checking video readiness...', {
            localReady,
            hasRemoteStream,
            remoteReady,
            localState: this.localVideoElement?.readyState,
            remoteState: this.remoteVideoElement?.readyState,
            attempt: attempts
          });
          // #region agent log
          fetch('http://localhost:7243/ingest/9d5dbcb0-ce84-440d-85f5-3ff39b360db2',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'webrtc.js:845',message:'Video readiness check',data:{localReady,hasRemoteStream,remoteReady,localState:this.localVideoElement?.readyState,remoteState:this.remoteVideoElement?.readyState,attempt:attempts},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
          // #endregion
          
          if (localReady && remoteReady) {
            console.log('✅ All videos ready for recording');
            // #region agent log
            fetch('http://localhost:7243/ingest/9d5dbcb0-ce84-440d-85f5-3ff39b360db2',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'webrtc.js:854',message:'All videos ready',data:{localState:this.localVideoElement?.readyState,remoteState:this.remoteVideoElement?.readyState},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
            // #endregion
            resolve();
          } else if (attempts >= maxAttempts) {
            console.warn('⚠️ Timeout waiting for videos, proceeding anyway...');
            // #region agent log
            fetch('http://localhost:7243/ingest/9d5dbcb0-ce84-440d-85f5-3ff39b360db2',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'webrtc.js:858',message:'Timeout waiting for videos',data:{localState:this.localVideoElement?.readyState,remoteState:this.remoteVideoElement?.readyState,attempts},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
            // #endregion
            resolve(); // Proceed even if not fully ready
          } else {
            setTimeout(checkReady, 100);
          }
        };
        checkReady();
      });
    };

    // Wait for videos to be ready
    const setupRecording = async () => {
      // Wait for video elements to be ready
      await waitForVideos();
      // Create combined stream from canvas FIRST (before drawing starts)
      // Canvas stream needs to be captured before drawing starts for proper initialization
      // Use adaptive FPS based on device - lower for mobile to reduce memory pressure
      const isMobileDevice = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || 
                             (window.innerWidth <= 768) || 
                             (performance.memory && performance.memory.jsHeapSizeLimit < 1073741824);
      const targetFPS = isMobileDevice ? 24 : 30; // Mobile: 24 FPS, Desktop: 30 FPS
      const combinedStream = this.recordingCanvas.captureStream(targetFPS);
      
      // Function to draw both videos on canvas (side by side)
      let drawCount = 0;
      let lastMemoryLog = 0;
      let lastDrawTime = 0;
      const TARGET_FPS = 30; // Target 30 FPS for recording
      const FRAME_INTERVAL = 1000 / TARGET_FPS; // ~33ms per frame
      
      const drawVideos = (currentTime) => {
        drawCount++;
        
        // Throttle drawing to target FPS to prevent excessive memory usage
        if (currentTime - lastDrawTime < FRAME_INTERVAL) {
          if (this.isRecording) {
            this.recordingAnimationFrame = requestAnimationFrame(drawVideos);
          }
          return;
        }
        lastDrawTime = currentTime || performance.now();
        
        if (!this.recordingCanvasContext || !this.isRecording) {
          // #region agent log
          if (drawCount <= 5) {
            const memInfo4 = performance.memory ? {usedJSHeapSize:performance.memory.usedJSHeapSize,totalJSHeapSize:performance.memory.totalJSHeapSize,jsHeapSizeLimit:performance.memory.jsHeapSizeLimit} : null;
            fetch('http://localhost:7243/ingest/9d5dbcb0-ce84-440d-85f5-3ff39b360db2',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'webrtc.js:907',message:'drawVideos early return',data:{hasContext:!!this.recordingCanvasContext,isRecording:this.isRecording,drawCount,memory:memInfo4},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
          }
          // #endregion
          return;
        }
        
        // Memory check - if memory is getting high, reduce quality or skip frame
        if (performance.memory) {
          const memoryUsage = performance.memory.usedJSHeapSize / performance.memory.jsHeapSizeLimit;
          if (memoryUsage > 0.85) {
            // Memory usage > 85% - skip this frame to prevent crash
            console.warn('⚠️ High memory usage detected, skipping frame:', (memoryUsage * 100).toFixed(1) + '%');
            if (this.isRecording) {
              this.recordingAnimationFrame = requestAnimationFrame(drawVideos);
            }
            return;
          }
        }
        
        const ctx = this.recordingCanvasContext;
        const canvas = this.recordingCanvas;
        
        // Clear canvas
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        const halfWidth = canvas.width / 2;
        const fullHeight = canvas.height;
        
        let localDrawn = false;
        let remoteDrawn = false;
        
        // Draw local video (left side)
        // IMPORTANT: Continue drawing even if video element is not visible in DOM
        // Recording uses separate video elements created in memory, not DOM elements
        if (this.localVideoElement && this.localVideoElement.readyState >= 2) {
          try {
            ctx.drawImage(
              this.localVideoElement,
              0, 0,
              halfWidth, fullHeight
            );
            localDrawn = true;
            // #region agent log
            if (drawCount <= 5 || drawCount % 30 === 0) fetch('http://localhost:7243/ingest/9d5dbcb0-ce84-440d-85f5-3ff39b360db2',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'webrtc.js:923',message:'Local video drawn',data:{readyState:this.localVideoElement.readyState,drawCount},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
            // #endregion
          } catch (err) {
            // #region agent log
            fetch('http://localhost:7243/ingest/9d5dbcb0-ce84-440d-85f5-3ff39b360db2',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'webrtc.js:928',message:'Error drawing local video',data:{error:err.message,readyState:this.localVideoElement?.readyState,drawCount},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
            // #endregion
            console.warn('Error drawing local video:', err);
          }
        } else {
          // #region agent log
          if (drawCount <= 5 || drawCount % 30 === 0) fetch('http://localhost:7243/ingest/9d5dbcb0-ce84-440d-85f5-3ff39b360db2',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'webrtc.js:935',message:'Local video not ready for drawing',data:{hasElement:!!this.localVideoElement,readyState:this.localVideoElement?.readyState,drawCount},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
          // #endregion
        }
        
        // Draw remote video (right side)
        // IMPORTANT: Continue drawing even if video element is not visible in DOM
        // Recording uses separate video elements created in memory, not DOM elements
        // This ensures recording continues even when DocumentCapture is shown
        if (this.remoteVideoElement && this.remoteVideoElement.readyState >= 2) {
          try {
            ctx.drawImage(
              this.remoteVideoElement,
              halfWidth, 0,
              halfWidth, fullHeight
            );
            remoteDrawn = true;
            // #region agent log
            if (drawCount <= 5 || drawCount % 30 === 0) fetch('http://localhost:7243/ingest/9d5dbcb0-ce84-440d-85f5-3ff39b360db2',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'webrtc.js:945',message:'Remote video drawn',data:{readyState:this.remoteVideoElement.readyState,drawCount},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
            // #endregion
          } catch (err) {
            // #region agent log
            fetch('http://localhost:7243/ingest/9d5dbcb0-ce84-440d-85f5-3ff39b360db2',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'webrtc.js:950',message:'Error drawing remote video',data:{error:err.message,readyState:this.remoteVideoElement?.readyState,drawCount},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
            // #endregion
            console.warn('Error drawing remote video:', err);
          }
        } else {
          // #region agent log
          if (drawCount <= 5 || drawCount % 30 === 0) fetch('http://localhost:7243/ingest/9d5dbcb0-ce84-440d-85f5-3ff39b360db2',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'webrtc.js:957',message:'Remote video not ready for drawing',data:{hasElement:!!this.remoteVideoElement,readyState:this.remoteVideoElement?.readyState,drawCount},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
          // #endregion
        }
        
        // #region agent log
        if (drawCount === 1 || drawCount % 30 === 0) {
          const memInfo5 = performance.memory ? {usedJSHeapSize:performance.memory.usedJSHeapSize,totalJSHeapSize:performance.memory.totalJSHeapSize,jsHeapSizeLimit:performance.memory.jsHeapSizeLimit} : null;
          const timeSinceLastLog = Date.now() - lastMemoryLog;
          fetch('http://localhost:7243/ingest/9d5dbcb0-ce84-440d-85f5-3ff39b360db2',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'webrtc.js:960',message:'Draw summary',data:{localDrawn,remoteDrawn,drawCount,memory:memInfo5,timeSinceLastLog},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
          lastMemoryLog = Date.now();
        }
        // #endregion
        
        // Draw divider line
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(halfWidth, 0);
        ctx.lineTo(halfWidth, fullHeight);
        ctx.stroke();
        
        // Continue animation with throttling
        if (this.isRecording) {
          this.recordingAnimationFrame = requestAnimationFrame(drawVideos);
        }
      };

      // Verify stream has tracks
      const canvasTracks = combinedStream.getVideoTracks();
      console.log('Canvas stream video tracks:', canvasTracks.length);
      
      if (canvasTracks.length === 0) {
        console.error('Canvas stream has no video tracks!');
        this.isRecording = false;
        return;
      }
      
      // Add audio tracks from both streams FIRST (before creating MediaRecorder)
      if (this.localStream) {
        const localAudioTracks = this.localStream.getAudioTracks();
        localAudioTracks.forEach(track => {
          if (track.enabled && track.readyState === 'live') {
            combinedStream.addTrack(track);
            console.log('Added local audio track to combined stream');
          }
        });
      }
      
      // Use remote audio if available, otherwise use local
      if (this.remoteStream) {
        const remoteAudioTracks = this.remoteStream.getAudioTracks();
        remoteAudioTracks.forEach(track => {
          if (track.enabled && track.readyState === 'live') {
            combinedStream.addTrack(track);
            console.log('Added remote audio track to combined stream');
          }
        });
      }
      
      console.log('Combined stream tracks - Video:', combinedStream.getVideoTracks().length, 'Audio:', combinedStream.getAudioTracks().length);

      // Verify canvas stream is active
      const activeTracks = combinedStream.getVideoTracks().filter(t => t.readyState === 'live');
      if (activeTracks.length === 0) {
        console.error('Canvas stream has no active tracks!');
        this.isRecording = false;
        return;
      }
      
      // Verify stream is actually producing data
      const videoTrack = activeTracks[0];
      if (!videoTrack || videoTrack.readyState !== 'live') {
        console.error('Video track is not live!');
        this.isRecording = false;
        return;
      }

        this.recordedChunks = [];
        // Adaptive bitrate based on device - lower for mobile to prevent memory issues
        const isMobileDevice2 = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || 
                                (window.innerWidth <= 768) || 
                                (performance.memory && performance.memory.jsHeapSizeLimit < 1073741824);
        const targetBitrate = isMobileDevice2 ? 1000000 : 1500000; // Mobile: 1 Mbps, Desktop: 1.5 Mbps
        const options = {
          mimeType: 'video/webm;codecs=vp9,opus', // VP9 for better quality (if supported)
          videoBitsPerSecond: targetBitrate,
        };

      try {
        // Check if MediaRecorder supports the mimeType
        if (MediaRecorder.isTypeSupported(options.mimeType)) {
          this.mediaRecorder = new MediaRecorder(combinedStream, options);
          console.log('MediaRecorder created with mimeType:', options.mimeType);
        } else {
          console.warn('MimeType not supported, using default');
          this.mediaRecorder = new MediaRecorder(combinedStream);
        }
      } catch (error) {
        console.error('MediaRecorder creation error:', error);
        // Fallback to default
        this.mediaRecorder = new MediaRecorder(combinedStream);
      }

      this.mediaRecorder.ondataavailable = (event) => {
        console.log('Data available event, size:', event.data.size, 'bytes');
        // #region agent log
        const memInfo6 = performance.memory ? {usedJSHeapSize:performance.memory.usedJSHeapSize,totalJSHeapSize:performance.memory.totalJSHeapSize,jsHeapSizeLimit:performance.memory.jsHeapSizeLimit} : null;
        const totalSize = this.recordedChunks.reduce((sum, chunk) => sum + chunk.size, 0);
        fetch('http://localhost:7243/ingest/9d5dbcb0-ce84-440d-85f5-3ff39b360db2',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'webrtc.js:1067',message:'Data available',data:{chunkSize:event.data?.size||0,chunksCount:this.recordedChunks.length,totalSize,memory:memInfo6},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
        // #endregion
        if (event.data && event.data.size > 0) {
          this.recordedChunks.push(event.data);
          console.log('Chunk added, total chunks:', this.recordedChunks.length, 'Total size:', this.recordedChunks.reduce((sum, chunk) => sum + chunk.size, 0), 'bytes');
        } else {
          console.warn('Empty data chunk received');
        }
      };

      this.mediaRecorder.onerror = (event) => {
        console.error('MediaRecorder error:', event.error);
      };

      this.mediaRecorder.onstop = () => {
        console.log('MediaRecorder stopped, chunks:', this.recordedChunks.length);
        console.log('Chunk sizes:', this.recordedChunks.map(c => c.size));
        
        // Store callback reference before async operations
        const callback = this.onRecordingComplete;
        
        // Stop canvas animation
        if (this.recordingAnimationFrame) {
          cancelAnimationFrame(this.recordingAnimationFrame);
          this.recordingAnimationFrame = null;
        }
        
        // Wait a bit to ensure all chunks are processed
        setTimeout(() => {
          // Cleanup video elements
          if (this.localVideoElement) {
            this.localVideoElement.srcObject = null;
            this.localVideoElement = null;
          }
          if (this.remoteVideoElement) {
            this.remoteVideoElement.srcObject = null;
            this.remoteVideoElement = null;
          }
          
          // Cleanup canvas
          if (this.recordingCanvas) {
            this.recordingCanvas = null;
            this.recordingCanvasContext = null;
          }
          
          if (this.recordedChunks.length > 0) {
            const totalSize = this.recordedChunks.reduce((sum, chunk) => sum + chunk.size, 0);
            if (totalSize > 0) {
              const blob = new Blob(this.recordedChunks, { type: 'video/webm' });
              console.log('Recording blob created, size:', blob.size, 'bytes');
              // #region agent log
              const memInfo7 = performance.memory ? {usedJSHeapSize:performance.memory.usedJSHeapSize,totalJSHeapSize:performance.memory.totalJSHeapSize,jsHeapSizeLimit:performance.memory.jsHeapSizeLimit} : null;
              fetch('http://localhost:7243/ingest/9d5dbcb0-ce84-440d-85f5-3ff39b360db2',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'webrtc.js:1115',message:'Blob created',data:{blobSize:blob.size,chunksCount:this.recordedChunks.length,memory:memInfo7},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'F'})}).catch(()=>{});
              // #endregion
              
              // Use stored callback reference (captured before async operations)
              // Also check current callback in case it was set again
              const currentCallback = this.onRecordingComplete || callback;
              
              if (currentCallback) {
                console.log('Calling onRecordingComplete callback');
                try {
                  currentCallback(blob);
                } catch (err) {
                  console.error('Error in onRecordingComplete callback:', err);
                }
              } else {
                console.warn('onRecordingComplete callback not set!');
                console.warn('Recording blob available but no callback to handle it');
              }
            } else {
              console.warn('All chunks are empty, recording failed');
            }
          } else {
            console.warn('No recorded chunks available, recording may have failed');
            console.warn('MediaRecorder state:', this.mediaRecorder?.state);
          }
          // Clear chunks after processing
          this.recordedChunks = [];
        }, 500);
      };

      // Start drawing loop immediately and keep it running continuously
      // This will feed the canvas stream continuously
      this.isRecording = true; // Set flag BEFORE starting drawing loop
      // #region agent log
      const memInfoStart = performance.memory ? {usedJSHeapSize:performance.memory.usedJSHeapSize,totalJSHeapSize:performance.memory.totalJSHeapSize,jsHeapSizeLimit:performance.memory.jsHeapSizeLimit} : null;
      const isMobileDevice3 = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || 
                              (window.innerWidth <= 768) || 
                              (performance.memory && performance.memory.jsHeapSizeLimit < 1073741824);
      const targetFPSValue = isMobileDevice3 ? 24 : 30;
      fetch('http://localhost:7243/ingest/9d5dbcb0-ce84-440d-85f5-3ff39b360db2',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'webrtc.js:1126',message:'Starting drawVideos loop',data:{hasLocalElement:!!this.localVideoElement,hasRemoteElement:!!this.remoteVideoElement,isRecording:this.isRecording,isMobile:isMobileDevice3,canvasWidth:this.recordingCanvas.width,canvasHeight:this.recordingCanvas.height,targetFPS:targetFPSValue,memory:memInfoStart},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
      // #endregion
      drawVideos(performance.now()); // Start the continuous drawing loop with timestamp
      
      // Wait a short time for first frames to be drawn, then start MediaRecorder
      setTimeout(() => {
        try {
          // Start MediaRecorder with timeslice - this ensures regular data capture
          this.mediaRecorder.start(1000); // Capture data every 1 second
          console.log('✅ Recording started with combined stream, state:', this.mediaRecorder.state);
          console.log('Canvas stream active tracks:', combinedStream.getTracks().length);
          console.log('Canvas stream video tracks:', combinedStream.getVideoTracks().length);
          console.log('Canvas stream audio tracks:', combinedStream.getAudioTracks().length);
          console.log('Video track readyState:', videoTrack?.readyState);
        } catch (error) {
          console.error('Error starting MediaRecorder:', error);
          this.isRecording = false;
          throw error;
        }
      }, 500); // Wait only 500ms for first frames to be drawn
    };

    // Wait for videos to be ready
    const checkReady = () => {
      const localReady = this.localVideoElement && this.localVideoElement.readyState >= 2;
      const remoteReady = !this.remoteStream || (this.remoteVideoElement && this.remoteVideoElement.readyState >= 2);
      
      if (localReady && remoteReady) {
        setupRecording();
      } else {
        setTimeout(checkReady, 100);
      }
    };

    // Start checking after a short delay
    setTimeout(checkReady, 500);
  }

  /**
   * Stop video recording
   */
  stopRecording() {
    if (this.mediaRecorder && this.isRecording) {
      console.log('Stopping MediaRecorder, state:', this.mediaRecorder.state);
      
      // Request final data chunk before stopping
      if (this.mediaRecorder.state === 'recording') {
        this.mediaRecorder.requestData();
      }
      
      // Stop the recorder
      try {
        this.mediaRecorder.stop();
        this.isRecording = false;
        console.log('MediaRecorder stop() called');
      } catch (error) {
        console.error('Error stopping MediaRecorder:', error);
        this.isRecording = false;
      }
      
      // Stop canvas animation immediately
      if (this.recordingAnimationFrame) {
        cancelAnimationFrame(this.recordingAnimationFrame);
        this.recordingAnimationFrame = null;
      }
      
      // Clean up video elements and canvas immediately for restart
      // This ensures clean state if recording is restarted
      if (this.localVideoElement) {
        this.localVideoElement.srcObject = null;
        this.localVideoElement = null;
      }
      if (this.remoteVideoElement) {
        this.remoteVideoElement.srcObject = null;
        this.remoteVideoElement = null;
      }
      if (this.recordingCanvas) {
        this.recordingCanvas = null;
        this.recordingCanvasContext = null;
      }
    } else {
      console.warn('stopRecording called but MediaRecorder not active', {
        hasRecorder: !!this.mediaRecorder,
        isRecording: this.isRecording
      });
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
    // Check if mediaRecorder exists and is still active (even if isRecording is false)
    const hasActiveRecorder = this.mediaRecorder && 
                              (this.mediaRecorder.state === 'recording' || 
                               this.mediaRecorder.state === 'paused' ||
                               this.recordedChunks.length > 0);
    
    if (this.isRecording || hasActiveRecorder) {
      console.log('Stopping recording in endCall', {
        isRecording: this.isRecording,
        recorderState: this.mediaRecorder?.state,
        chunksCount: this.recordedChunks.length
      });
      
      if (this.isRecording && this.mediaRecorder) {
        this.stopRecording();
      }
      
      // Wait longer for recording to process and upload (15 seconds)
      // The callback will be cleared after upload completes or timeout
      setTimeout(() => {
        console.log('Recording processing timeout - clearing callback');
        // Only clear if still exists (might have been cleared by upload success)
        if (this.onRecordingComplete) {
          this.onRecordingComplete = null;
        }
      }, 15000); // 15 seconds timeout
    } else {
      // If not recording and no active recorder, clear callback immediately
      console.log('No active recording, clearing callback immediately');
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
    
    // Stop screen recording if active
    if (this.isScreenRecording) {
      this.stopScreenRecording();
    }
  }

  /**
   * Start screen recording (agent's screen)
   */
  async startScreenRecording() {
    if (this.isScreenRecording) {
      console.warn('Screen recording already in progress');
      return;
    }

    try {
      console.log('🖥️ Starting screen recording...');
      
      // Request screen capture
      this.screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          width: { ideal: 1920, min: 1280 },
          height: { ideal: 1080, min: 720 },
          frameRate: { ideal: 30, max: 30 }
        },
        audio: true // Capture system audio if available
      });

      // Handle user stopping screen share
      this.screenStream.getVideoTracks()[0].addEventListener('ended', () => {
        console.log('🖥️ Screen share ended by user');
        this.stopScreenRecording();
      });

      // Setup MediaRecorder for screen
      this.screenRecordedChunks = [];
      const options = {
        mimeType: 'video/webm;codecs=vp9,opus',
        videoBitsPerSecond: 2500000 // 2.5 Mbps
      };

      // Fallback to VP8 if VP9 not supported
      if (!MediaRecorder.isTypeSupported(options.mimeType)) {
        options.mimeType = 'video/webm;codecs=vp8,opus';
      }

      this.screenRecorder = new MediaRecorder(this.screenStream, options);

      this.screenRecorder.ondataavailable = (event) => {
        console.log('📹 Screen recording data available, size:', event.data.size, 'bytes');
        if (event.data && event.data.size > 0) {
          this.screenRecordedChunks.push(event.data);
        }
      };

      this.screenRecorder.onstop = () => {
        console.log('🖥️ Screen recording stopped, chunks:', this.screenRecordedChunks.length);
        
        if (this.screenRecordedChunks.length > 0) {
          const totalSize = this.screenRecordedChunks.reduce((sum, chunk) => sum + chunk.size, 0);
          if (totalSize > 0) {
            const blob = new Blob(this.screenRecordedChunks, { type: 'video/webm' });
            console.log('📹 Screen recording blob created, size:', blob.size, 'bytes');
            
            if (this.onScreenRecordingComplete) {
              this.onScreenRecordingComplete(blob);
            }
          } else {
            console.warn('⚠️ Screen recording chunks are empty');
          }
        } else {
          console.warn('⚠️ No screen recording chunks available');
        }
        
        // Cleanup
        this.screenRecordedChunks = [];
        if (this.screenStream) {
          this.screenStream.getTracks().forEach(track => track.stop());
          this.screenStream = null;
        }
      };

      this.screenRecorder.onerror = (event) => {
        console.error('❌ Screen recording error:', event.error);
      };

      // Start recording with 1 second timeslice
      this.screenRecorder.start(1000);
      this.isScreenRecording = true;
      console.log('✅ Screen recording started');
      
    } catch (error) {
      console.error('❌ Failed to start screen recording:', error);
      throw error;
    }
  }

  /**
   * Stop screen recording
   */
  stopScreenRecording() {
    if (this.screenRecorder && this.isScreenRecording) {
      console.log('🖥️ Stopping screen recording...');
      
      if (this.screenRecorder.state === 'recording') {
        this.screenRecorder.requestData();
        this.screenRecorder.stop();
      }
      
      this.isScreenRecording = false;
    } else {
      console.warn('⚠️ Screen recording not active');
    }
  }
}

export default new WebRTCService();

