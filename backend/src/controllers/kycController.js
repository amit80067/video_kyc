const pool = require('../config/database');
const ocrService = require('../services/ocrService');
const textractService = require('../services/textractService');
const faceVerificationService = require('../services/faceVerificationService');
const s3Service = require('../services/s3Service');
const videoRecordingService = require('../services/videoRecordingService');
const path = require('path');
const fs = require('fs');

class KYCController {
    async uploadDocument(req, res) {
        try {
            const { sessionId, documentType, remark } = req.body;
            const file = req.file;

            if (!file) {
                return res.status(400).json({ error: 'No file uploaded' });
            }

            if (!sessionId || !documentType) {
                return res.status(400).json({ error: 'Session ID and document type are required' });
            }

            // Verify session exists
            const sessionResult = await pool.query(
                'SELECT id FROM kyc_sessions WHERE session_id = $1',
                [sessionId]
            );

            if (sessionResult.rows.length === 0) {
                return res.status(404).json({ error: 'Session not found' });
            }

            const kycSessionId = sessionResult.rows[0].id;

            // Upload to S3
            const s3Key = `documents/${sessionId}/${Date.now()}-${file.filename}`;
            let uploadResult;
            try {
                uploadResult = await s3Service.uploadFile(file.path, s3Key);
            } catch (s3Error) {
                console.error('S3 upload failed:', s3Error);
                console.error('S3 error details:', {
                    message: s3Error.message,
                    code: s3Error.code,
                    statusCode: s3Error.statusCode
                });
                // Clean up local file
                if (fs.existsSync(file.path)) {
                    fs.unlinkSync(file.path);
                }
                
                // Provide more helpful error message
                let errorMessage = 'Failed to upload document to storage';
                if (s3Error.message && s3Error.message.includes('signature')) {
                    errorMessage = 'AWS credentials configuration error. Please contact administrator.';
                } else if (s3Error.message) {
                    errorMessage = `Storage upload failed: ${s3Error.message}`;
                }
                throw new Error(errorMessage);
            }

            // Save to database
            const result = await pool.query(
                `INSERT INTO documents 
                (session_id, document_type, image_url, s3_key, verification_status, remark)
                VALUES ($1, $2, $3, $4, $5, $6)
                RETURNING *`,
                [kycSessionId, documentType, uploadResult.url, s3Key, 'pending', remark || null]
            );

            const document = result.rows[0];

            // User profile capture: same image is stored as a document row + session fields (PDF / admin)
            if (documentType === 'user_photo') {
                await pool.query(
                    `UPDATE kyc_sessions
                    SET user_photo_url = $1, user_photo_s3_key = $2, updated_at = NOW()
                    WHERE id = $3`,
                    [uploadResult.url, s3Key, kycSessionId]
                );
            }

            // Process OCR in background (skip for profile photos — not ID docs)
            if (documentType !== 'user_photo') {
            setImmediate(async () => {
                let tempFilePath = null;
                try {
                    let ocrResult;
                    
                    // Try Textract first if AWS credentials available
                    if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) {
                        try {
                            console.log(`Using Textract for document ${document.id} with S3 key: ${s3Key}`);
                            if (documentType === 'aadhaar') {
                                ocrResult = await textractService.extractAadhaarData(s3Key);
                            } else if (documentType === 'pan') {
                                ocrResult = await textractService.extractPANData(s3Key);
                            } else {
                                ocrResult = await textractService.extractTextFromS3(s3Key);
                            }
                            console.log(`✅ Textract extraction successful for document ${document.id}`);
                        } catch (textractError) {
                            console.warn(`⚠️ Textract failed for document ${document.id}, falling back to Tesseract:`, textractError.message);
                            // Fallback to Tesseract - download file first
                            const tempPath = path.join(__dirname, '../../temp', `doc-${document.id}-${Date.now()}.jpg`);
                            const tempDir = path.dirname(tempPath);
                            if (!fs.existsSync(tempDir)) {
                                fs.mkdirSync(tempDir, { recursive: true });
                            }
                            
                            tempFilePath = await s3Service.downloadFile(s3Key, tempPath);
                            
                            // Use specialized extraction based on document type
                            if (documentType === 'aadhaar') {
                                ocrResult = await ocrService.extractAadhaarData(tempFilePath);
                            } else if (documentType === 'pan') {
                                ocrResult = await ocrService.extractPANData(tempFilePath);
                            } else {
                                ocrResult = await ocrService.extractText(tempFilePath);
                            }
                        }
                    } else {
                        // Use Tesseract (download file first)
                        console.log(`Using Tesseract for document ${document.id} (AWS credentials not available)`);
                        const tempPath = path.join(__dirname, '../../temp', `doc-${document.id}-${Date.now()}.jpg`);
                        const tempDir = path.dirname(tempPath);
                        if (!fs.existsSync(tempDir)) {
                            fs.mkdirSync(tempDir, { recursive: true });
                        }
                        
                        tempFilePath = await s3Service.downloadFile(s3Key, tempPath);
                        
                        // Use specialized extraction based on document type
                        if (documentType === 'aadhaar') {
                            ocrResult = await ocrService.extractAadhaarData(tempFilePath);
                        } else if (documentType === 'pan') {
                            ocrResult = await ocrService.extractPANData(tempFilePath);
                        } else {
                            ocrResult = await ocrService.extractText(tempFilePath);
                        }
                    }

                    // Update document with OCR results
                    // For PAN: save panNumber, fatherName
                    // For Aadhaar: save aadhaarNumber, gender
                    const updateData = [
                        JSON.stringify(ocrResult),
                        ocrResult.aadhaarNumber || ocrResult.panNumber || null, // Store PAN or Aadhaar number in aadhaar_number field
                        ocrResult.name || null,
                        ocrResult.dateOfBirth || null,
                        ocrResult.confidence || null,
                        document.id
                    ];
                    
                    // Store additional fields in ocr_extracted_data JSON
                    const ocrDataToStore = {
                        ...ocrResult,
                        panNumber: ocrResult.panNumber || null,
                        fatherName: ocrResult.fatherName || null,
                        gender: ocrResult.gender || null
                    };
                    
                    await pool.query(
                        `UPDATE documents 
                        SET ocr_extracted_data = $1,
                            aadhaar_number = $2,
                            name = $3,
                            date_of_birth = $4,
                            ocr_confidence = $5,
                            updated_at = NOW()
                        WHERE id = $6`,
                        [
                            JSON.stringify(ocrDataToStore),
                            ocrResult.aadhaarNumber || ocrResult.panNumber || null,
                            ocrResult.name || null,
                            ocrResult.dateOfBirth || null,
                            ocrResult.confidence || null,
                            document.id
                        ]
                    );
                    console.log(`OCR processed successfully for document ${document.id}`);
                } catch (ocrError) {
                    console.error(`OCR processing error for document ${document.id}:`, ocrError);
                    // Don't fail the upload if OCR fails
                } finally {
                    // Cleanup temp file
                    if (tempFilePath && fs.existsSync(tempFilePath)) {
                        try {
                            fs.unlinkSync(tempFilePath);
                        } catch (cleanupError) {
                            console.error('Failed to cleanup temp file:', cleanupError);
                        }
                    }
                }
            });
            }

            // Clean up local file
            if (fs.existsSync(file.path)) {
                fs.unlinkSync(file.path);
            }

            res.status(201).json({
                success: true,
                document: document
            });
        } catch (error) {
            console.error('Upload document error:', error);
            console.error('Error stack:', error.stack);
            
            // Clean up file if it exists
            if (req.file && req.file.path && fs.existsSync(req.file.path)) {
                try {
                    fs.unlinkSync(req.file.path);
                } catch (cleanupError) {
                    console.error('Failed to cleanup file:', cleanupError);
                }
            }
            
            // Return detailed error for debugging
            const errorMessage = error.message || 'Failed to upload document';
            
            // Check if it's an AWS/S3 error
            let userFriendlyError = 'Failed to upload document. Please try again.';
            if (errorMessage.includes('AWS') || errorMessage.includes('S3') || errorMessage.includes('signature') || errorMessage.includes('credentials')) {
                userFriendlyError = 'Storage service configuration error. Please contact administrator.';
            }
            
            res.status(500).json({ 
                error: userFriendlyError,
                details: process.env.NODE_ENV === 'development' ? errorMessage : undefined,
                stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
            });
        }
    }

    async processOCR(req, res) {
        try {
            const { documentId } = req.params;

            // Get document from database
            const docResult = await pool.query(
                'SELECT * FROM documents WHERE id = $1',
                [documentId]
            );

            if (docResult.rows.length === 0) {
                return res.status(404).json({ error: 'Document not found' });
            }

            const document = docResult.rows[0];

            // Download from S3 to temp location
            const tempPath = path.join(__dirname, '../../temp', `doc-${documentId}-${Date.now()}.jpg`);
            const tempDir = path.dirname(tempPath);
            if (!fs.existsSync(tempDir)) {
                fs.mkdirSync(tempDir, { recursive: true });
            }

            // For now, we'll use the S3 URL directly with Tesseract
            // In production, you might want to download the file first
            const imageUrl = document.image_url;

            // Process OCR - Try Textract first (if S3 key available), fallback to Tesseract
            let ocrResult;
            try {
                // If document has S3 key and AWS credentials available, use Textract
                if (document.s3_key && process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) {
                    try {
                        console.log(`Using Textract for document ${documentId} with S3 key: ${document.s3_key}`);
                        if (document.document_type === 'aadhaar') {
                            ocrResult = await textractService.extractAadhaarData(document.s3_key);
                        } else if (document.document_type === 'pan') {
                            ocrResult = await textractService.extractPANData(document.s3_key);
                        } else {
                            ocrResult = await textractService.extractTextFromS3(document.s3_key);
                        }
                        console.log('✅ Textract extraction successful');
                    } catch (textractError) {
                        console.warn('⚠️ Textract failed, falling back to Tesseract:', textractError.message);
                        // Fallback to Tesseract
                        if (document.document_type === 'aadhaar') {
                            ocrResult = await ocrService.extractAadhaarData(imageUrl);
                        } else if (document.document_type === 'pan') {
                            ocrResult = await ocrService.extractPANData(imageUrl);
                        } else {
                            ocrResult = await ocrService.extractText(imageUrl);
                        }
                    }
                } else {
                    // Use Tesseract (local OCR)
                    console.log(`Using Tesseract for document ${documentId}`);
                    if (document.document_type === 'aadhaar') {
                        ocrResult = await ocrService.extractAadhaarData(imageUrl);
                    } else if (document.document_type === 'pan') {
                        ocrResult = await ocrService.extractPANData(imageUrl);
                    } else {
                        ocrResult = await ocrService.extractText(imageUrl);
                    }
                }
            } catch (ocrError) {
                console.error('OCR processing error:', ocrError);
                return res.status(500).json({ error: 'OCR processing failed', details: ocrError.message });
            }

            // Update document with OCR results
            // Store additional fields in ocr_extracted_data JSON
            const ocrDataToStore = {
                ...ocrResult,
                panNumber: ocrResult.panNumber || null,
                fatherName: ocrResult.fatherName || null,
                gender: ocrResult.gender || null
            };
            
            const updateResult = await pool.query(
                `UPDATE documents 
                SET ocr_extracted_data = $1,
                    aadhaar_number = $2,
                    name = $3,
                    date_of_birth = $4,
                    ocr_confidence = $5,
                    updated_at = NOW()
                WHERE id = $6
                RETURNING *`,
                [
                    JSON.stringify(ocrDataToStore),
                    ocrResult.aadhaarNumber || ocrResult.panNumber || null,
                    ocrResult.name || null,
                    ocrResult.dateOfBirth || null,
                    ocrResult.confidence || null,
                    documentId
                ]
            );

            res.json({
                success: true,
                document: updateResult.rows[0],
                ocrResult: ocrResult
            });
        } catch (error) {
            console.error('Process OCR error:', error);
            res.status(500).json({ error: 'Failed to process OCR' });
        }
    }

    async verifyFace(req, res) {
        try {
            const { documentId } = req.params;
            const liveImageFile = req.file;

            if (!liveImageFile) {
                return res.status(400).json({ error: 'Live image is required' });
            }

            // Get document from database
            const docResult = await pool.query(
                'SELECT * FROM documents WHERE id = $1',
                [documentId]
            );

            if (docResult.rows.length === 0) {
                return res.status(404).json({ error: 'Document not found' });
            }

            const document = docResult.rows[0];

            // Perform face verification
            const verificationResult = await faceVerificationService.verifyFace(
                document.image_url, // Document image
                liveImageFile.path  // Live image
            );

            // Save verification result to database
            const sessionResult = await pool.query(
                'SELECT id FROM kyc_sessions WHERE id = $1',
                [document.session_id]
            );

            if (sessionResult.rows.length > 0) {
                await pool.query(
                    `INSERT INTO face_verification 
                    (session_id, document_id, match_score, similarity_percentage, 
                     liveness_detected, liveness_confidence, verification_result, aws_rekognition_response)
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
                    [
                        sessionResult.rows[0].id,
                        documentId,
                        verificationResult.similarity || 0,
                        verificationResult.similarity || 0,
                        verificationResult.verified || false,
                        verificationResult.confidence || 0,
                        verificationResult.verified ? 'match' : 'no_match',
                        JSON.stringify(verificationResult)
                    ]
                );
            }

            // Clean up local file
            if (fs.existsSync(liveImageFile.path)) {
                fs.unlinkSync(liveImageFile.path);
            }

            res.json({
                success: true,
                verification: verificationResult
            });
        } catch (error) {
            console.error('Face verification error:', error);
            res.status(500).json({ error: 'Face verification failed', details: error.message });
        }
    }

    async getDocument(req, res) {
        try {
            const { documentId } = req.params;

            const result = await pool.query(
                'SELECT * FROM documents WHERE id = $1',
                [documentId]
            );

            if (result.rows.length === 0) {
                return res.status(404).json({ error: 'Document not found' });
            }

            const document = result.rows[0];
            
            // Generate signed URL if s3_key exists
            if (document.s3_key) {
                try {
                    document.image_url = s3Service.getSignedUrl(document.s3_key, 3600); // 1 hour expiry
                } catch (err) {
                    console.error('Error generating signed URL for document:', documentId, err);
                    // Keep original URL if signed URL generation fails
                }
            }

            res.json({
                success: true,
                document: document
            });
        } catch (error) {
            console.error('Get document error:', error);
            res.status(500).json({ error: 'Failed to get document' });
        }
    }

    async getDocumentsBySession(req, res) {
        try {
            const { sessionId } = req.query;

            if (!sessionId) {
                return res.status(400).json({ error: 'Session ID is required' });
            }

            // Get session ID from session_id string
            const sessionResult = await pool.query(
                'SELECT id FROM kyc_sessions WHERE session_id = $1',
                [sessionId]
            );

            if (sessionResult.rows.length === 0) {
                return res.status(404).json({ error: 'Session not found' });
            }

            const kycSessionId = sessionResult.rows[0].id;

            const result = await pool.query(
                'SELECT * FROM documents WHERE session_id = $1 ORDER BY created_at DESC',
                [kycSessionId]
            );

            // Generate signed URLs for images
            const documentsWithSignedUrls = result.rows.map(doc => {
                const docData = { ...doc };
                // If s3_key exists, generate signed URL
                if (doc.s3_key) {
                    try {
                        docData.image_url = s3Service.getSignedUrl(doc.s3_key, 3600); // 1 hour expiry
                    } catch (err) {
                        console.error('Error generating signed URL for document:', doc.id, err);
                        // Keep original URL if signed URL generation fails
                    }
                }
                return docData;
            });

            res.json({
                success: true,
                documents: documentsWithSignedUrls
            });
        } catch (error) {
            console.error('Get documents by session error:', error);
            res.status(500).json({ error: 'Failed to get documents' });
        }
    }

    async updateDocumentVerification(req, res) {
        try {
            const { documentId } = req.params;
            const { verificationStatus, notes } = req.body;
            const verifiedBy = req.user.id;

            if (!['pending', 'verified', 'rejected'].includes(verificationStatus)) {
                return res.status(400).json({ error: 'Invalid verification status' });
            }

            const result = await pool.query(
                `UPDATE documents 
                SET verification_status = $1,
                    verified_by = $2,
                    verified_at = NOW(),
                    updated_at = NOW()
                WHERE id = $3
                RETURNING *`,
                [verificationStatus, verifiedBy, documentId]
            );

            if (result.rows.length === 0) {
                return res.status(404).json({ error: 'Document not found' });
            }

            res.json({
                success: true,
                document: result.rows[0]
            });
        } catch (error) {
            console.error('Update document verification error:', error);
            res.status(500).json({ error: 'Failed to update document verification' });
        }
    }

    async uploadRecording(req, res) {
        let tempFilePath = null;
        try {
            // Get sessionId from body (multer parses multipart/form-data fields into req.body)
            const sessionId = req.body?.sessionId;
            const file = req.file;

            console.log('📥 Upload recording request received:', {
                hasFile: !!file,
                sessionId: sessionId,
                bodyKeys: Object.keys(req.body || {}),
                body: req.body
            });

            if (!file) {
                return res.status(400).json({ error: 'No video file uploaded' });
            }

            if (!sessionId || sessionId === 'null' || sessionId === 'undefined') {
                console.error('❌ Session ID is missing or invalid:', {
                    sessionId: sessionId,
                    type: typeof sessionId,
                    body: req.body
                });
                return res.status(400).json({ 
                    error: 'Session ID is required',
                    details: 'sessionId is missing or null in request body'
                });
            }

            tempFilePath = file.path;

            // Verify session exists
            const sessionResult = await pool.query(
                'SELECT id FROM kyc_sessions WHERE session_id = $1',
                [sessionId]
            );

            if (sessionResult.rows.length === 0) {
                // Clean up file
                if (fs.existsSync(tempFilePath)) {
                    fs.unlinkSync(tempFilePath);
                }
                return res.status(404).json({ error: 'Session not found' });
            }

            const kycSessionId = sessionResult.rows[0].id;

            // Save recording to S3
            let recordingResult;
            try {
                recordingResult = await videoRecordingService.saveRecording(file.path, sessionId);
            } catch (s3Error) {
                console.error('S3 upload failed for recording:', s3Error);
                console.error('S3 error details:', {
                    message: s3Error.message,
                    code: s3Error.code,
                    statusCode: s3Error.statusCode
                });
                
                // Clean up local file
                if (fs.existsSync(tempFilePath)) {
                    fs.unlinkSync(tempFilePath);
                }
                
                // Provide more helpful error message
                let errorMessage = 'Failed to upload recording to storage';
                if (s3Error.message && s3Error.message.includes('signature')) {
                    errorMessage = 'AWS credentials configuration error. Please contact administrator.';
                } else if (s3Error.message) {
                    errorMessage = `Storage upload failed: ${s3Error.message}`;
                }
                
                return res.status(500).json({ 
                    error: 'Failed to upload recording',
                    details: errorMessage,
                    s3Error: process.env.NODE_ENV === 'development' ? s3Error.message : undefined
                });
            }

            // Save to database (default recording_type is 'video')
            // First ensure column exists (if migration not run yet)
            try {
                await pool.query(`ALTER TABLE video_recordings ADD COLUMN IF NOT EXISTS recording_type VARCHAR(20) DEFAULT 'video'`);
            } catch (colErr) {
                // Column might already exist or permission issue - continue anyway
                console.log('Note: recording_type column check:', colErr.message);
            }
            
            // Try with recording_type first, fallback to without if column doesn't exist
            let result;
            try {
                result = await pool.query(
                    `INSERT INTO video_recordings 
                    (session_id, video_url, s3_key, file_size_bytes, recording_type, recording_started_at, recording_ended_at)
                    VALUES ($1, $2, $3, $4, 'video', NOW(), NOW())
                    RETURNING *`,
                    [
                        kycSessionId,
                        recordingResult.s3Url,
                        recordingResult.s3Key,
                        recordingResult.fileSizeBytes
                    ]
                );
            } catch (insertErr) {
                // If column doesn't exist, insert without it
                if (insertErr.message.includes('recording_type') || insertErr.message.includes('column')) {
                    console.log('Inserting without recording_type column (will be added later)');
                    result = await pool.query(
                        `INSERT INTO video_recordings 
                        (session_id, video_url, s3_key, file_size_bytes, recording_started_at, recording_ended_at)
                        VALUES ($1, $2, $3, $4, NOW(), NOW())
                        RETURNING *`,
                        [
                            kycSessionId,
                            recordingResult.s3Url,
                            recordingResult.s3Key,
                            recordingResult.fileSizeBytes
                        ]
                    );
                } else {
                    throw insertErr;
                }
            }

            // Clean up local file
            if (fs.existsSync(tempFilePath)) {
                fs.unlinkSync(tempFilePath);
            }

            // #region agent log
            const logEntry = {
                id: `log_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                timestamp: Date.now(),
                location: 'kycController.js:652',
                message: 'Recording saved to database',
                data: {
                    recordingId: result.rows[0].id,
                    sessionId: sessionId,
                    kycSessionId: kycSessionId,
                    video_url: result.rows[0].video_url,
                    s3_key: result.rows[0].s3_key,
                    hasVideoUrl: !!result.rows[0].video_url,
                    hasS3Key: !!result.rows[0].s3_key,
                    recordingResult_s3Url: recordingResult.s3Url,
                    recordingResult_s3Key: recordingResult.s3Key
                },
                sessionId: 'debug-session',
                runId: 'run1',
                hypothesisId: 'A'
            };
            fs.appendFileSync('/home/ubuntu/video_kyc/.cursor/debug.log', JSON.stringify(logEntry) + '\n');
            // #endregion

            res.status(201).json({
                success: true,
                recording: result.rows[0]
            });
        } catch (error) {
            console.error('Upload recording error:', error);
            console.error('Error stack:', error.stack);
            
            // Clean up file if it exists
            if (tempFilePath && fs.existsSync(tempFilePath)) {
                try {
                    fs.unlinkSync(tempFilePath);
                } catch (cleanupError) {
                    console.error('Failed to cleanup file:', cleanupError);
                }
            }
            
            // Return detailed error for debugging
            const errorMessage = error.message || 'Failed to upload recording';
            res.status(500).json({ 
                error: 'Failed to upload recording',
                details: process.env.NODE_ENV === 'development' ? errorMessage : undefined,
                stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
            });
        }
    }

    /**
     * Upload screen recording
     */
    async uploadScreenRecording(req, res) {
        let tempFilePath = null;
        try {
            // Get sessionId from body (multer parses multipart/form-data fields into req.body)
            const sessionId = req.body?.sessionId;
            const recordingType = req.body?.recordingType || 'screen';
            const file = req.file;

            console.log('📥 Upload screen recording request received:', {
                hasFile: !!file,
                sessionId: sessionId,
                recordingType: recordingType,
                bodyKeys: Object.keys(req.body || {}),
                body: req.body
            });

            if (!file) {
                return res.status(400).json({ error: 'No video file uploaded' });
            }

            if (!sessionId || sessionId === 'null' || sessionId === 'undefined') {
                console.error('❌ Session ID is missing or invalid:', {
                    sessionId: sessionId,
                    type: typeof sessionId,
                    body: req.body
                });
                return res.status(400).json({ 
                    error: 'Session ID is required',
                    details: 'sessionId is missing or null in request body'
                });
            }

            tempFilePath = file.path;

            // Verify session exists
            const sessionResult = await pool.query(
                'SELECT id FROM kyc_sessions WHERE session_id = $1',
                [sessionId]
            );

            if (sessionResult.rows.length === 0) {
                if (fs.existsSync(tempFilePath)) {
                    fs.unlinkSync(tempFilePath);
                }
                return res.status(404).json({ error: 'Session not found' });
            }

            const kycSessionId = sessionResult.rows[0].id;

            // Save screen recording to S3
            let recordingResult;
            try {
                recordingResult = await videoRecordingService.saveRecording(file.path, sessionId);
            } catch (s3Error) {
                console.error('S3 upload failed for screen recording:', s3Error);
                if (fs.existsSync(tempFilePath)) {
                    fs.unlinkSync(tempFilePath);
                }
                return res.status(500).json({ 
                    error: 'Failed to upload screen recording',
                    details: s3Error.message
                });
            }

            // Save to database with recording_type = 'screen'
            // Check if recording_type column exists
            let hasRecordingTypeColumn = false;
            try {
                const colCheck = await pool.query(
                    `SELECT column_name FROM information_schema.columns 
                     WHERE table_name = 'video_recordings' AND column_name = 'recording_type'`
                );
                hasRecordingTypeColumn = colCheck.rows.length > 0;
            } catch (e) {
                // Ignore check errors
            }
            
            let result;
            if (hasRecordingTypeColumn) {
                result = await pool.query(
                    `INSERT INTO video_recordings 
                    (session_id, video_url, s3_key, file_size_bytes, recording_type, recording_started_at, recording_ended_at)
                    VALUES ($1, $2, $3, $4, 'screen', NOW(), NOW())
                    RETURNING *`,
                    [
                        kycSessionId,
                        recordingResult.s3Url,
                        recordingResult.s3Key,
                        recordingResult.fileSizeBytes
                    ]
                );
            } else {
                // Insert without recording_type column (will be added later by admin)
                // For now, we'll store it in a comment or separate table, but for simplicity, just insert without it
                console.warn('⚠️ recording_type column not found - screen recording saved without type');
                result = await pool.query(
                    `INSERT INTO video_recordings 
                    (session_id, video_url, s3_key, file_size_bytes, recording_started_at, recording_ended_at)
                    VALUES ($1, $2, $3, $4, NOW(), NOW())
                    RETURNING *`,
                    [
                        kycSessionId,
                        recordingResult.s3Url,
                        recordingResult.s3Key,
                        recordingResult.fileSizeBytes
                    ]
                );
            }

            // Clean up local file
            if (fs.existsSync(tempFilePath)) {
                fs.unlinkSync(tempFilePath);
            }

            // #region agent log
            const logEntry = {
                id: `log_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                timestamp: Date.now(),
                location: 'kycController.js:794',
                message: 'Screen recording saved to database',
                data: {
                    recordingId: result.rows[0].id,
                    sessionId: sessionId,
                    kycSessionId: kycSessionId,
                    video_url: result.rows[0].video_url,
                    s3_key: result.rows[0].s3_key,
                    hasVideoUrl: !!result.rows[0].video_url,
                    hasS3Key: !!result.rows[0].s3_key,
                    recordingResult_s3Url: recordingResult.s3Url,
                    recordingResult_s3Key: recordingResult.s3Key
                },
                sessionId: 'debug-session',
                runId: 'run1',
                hypothesisId: 'A'
            };
            fs.appendFileSync('/home/ubuntu/video_kyc/.cursor/debug.log', JSON.stringify(logEntry) + '\n');
            // #endregion

            res.status(201).json({
                success: true,
                recording: result.rows[0],
                recordingId: result.rows[0].id
            });
        } catch (error) {
            console.error('Upload screen recording error:', error);
            if (tempFilePath && fs.existsSync(tempFilePath)) {
                try {
                    fs.unlinkSync(tempFilePath);
                } catch (cleanupError) {
                    console.error('Failed to cleanup file:', cleanupError);
                }
            }
            res.status(500).json({ 
                error: 'Failed to upload screen recording',
                details: process.env.NODE_ENV === 'development' ? error.message : undefined
            });
        }
    }

    /**
     * Generate PDF for session (delegates to exportController)
     */
    async generatePDF(req, res) {
        try {
            // Use existing generatePDF method from exportController
            const exportController = require('./exportController');
            await exportController.generatePDF(req, res);
        } catch (error) {
            console.error('Generate PDF error:', error);
            if (!res.headersSent) {
                res.status(500).json({ 
                    error: 'Failed to generate PDF',
                    details: process.env.NODE_ENV === 'development' ? error.message : undefined
                });
            }
        }
    }

    /**
     * Get video recordings by session
     */
    async getRecordingsBySession(req, res) {
        try {
            const { sessionId } = req.query;

            if (!sessionId) {
                return res.status(400).json({ error: 'Session ID is required' });
            }

            // Get session ID from session_id
            const sessionResult = await pool.query(
                'SELECT id FROM kyc_sessions WHERE session_id = $1',
                [sessionId]
            );

            if (sessionResult.rows.length === 0) {
                return res.status(404).json({ error: 'Session not found' });
            }

            const kycSessionId = sessionResult.rows[0].id;

            // Get recordings
            const result = await pool.query(
                `SELECT vr.* FROM video_recordings vr
                WHERE vr.session_id = $1
                ORDER BY vr.recording_started_at DESC`,
                [kycSessionId]
            );

            res.json({
                success: true,
                recordings: result.rows
            });
        } catch (error) {
            console.error('Get recordings error:', error);
            res.status(500).json({ error: 'Failed to get recordings' });
        }
    }

    /**
     * Real-time face matching during call
     * Compares live video frame with document photo
     */
    async realtimeFaceMatch(req, res) {
        try {
            const { sessionId } = req.body;
            const liveImageFile = req.file;

            if (!liveImageFile) {
                return res.status(400).json({ error: 'Live image is required' });
            }

            if (!sessionId) {
                return res.status(400).json({ error: 'Session ID is required' });
            }

            // Get session
            const sessionResult = await pool.query(
                'SELECT id FROM kyc_sessions WHERE session_id = $1',
                [sessionId]
            );

            if (sessionResult.rows.length === 0) {
                return res.status(404).json({ error: 'Session not found' });
            }

            const kycSessionId = sessionResult.rows[0].id;

            // Get latest document for this session (prefer aadhaar, but allow any document with face)
            const docResult = await pool.query(
                `SELECT * FROM documents 
                WHERE session_id = $1 
                AND (document_type = 'aadhaar' OR document_type = 'pan' OR document_type = 'voter_id')
                ORDER BY 
                    CASE document_type 
                        WHEN 'aadhaar' THEN 1 
                        WHEN 'pan' THEN 2 
                        ELSE 3 
                    END,
                    created_at DESC 
                LIMIT 1`,
                [kycSessionId]
            );

            if (docResult.rows.length === 0) {
                return res.status(404).json({ 
                    error: 'No document found for this session. Please capture Aadhaar, PAN, or Voter ID document first.' 
                });
            }

            const document = docResult.rows[0];

            // Download document image from S3 to local temp file
            let documentTempPath = null;
            let liveImagePath = liveImageFile.path;

            try {
                // Download document from S3
                const tempDir = path.join(__dirname, '../../temp');
                if (!fs.existsSync(tempDir)) {
                    fs.mkdirSync(tempDir, { recursive: true });
                }
                documentTempPath = path.join(tempDir, `doc-${document.id}-${Date.now()}.jpg`);
                await s3Service.downloadFile(document.s3_key, documentTempPath);

                // Perform face verification
                const verificationResult = await faceVerificationService.verifyFace(
                    documentTempPath,
                    liveImagePath
                );

                // Save verification result to database
                await pool.query(
                    `INSERT INTO face_verification 
                    (session_id, document_id, live_face_image_url, document_face_image_url,
                     match_score, similarity_percentage, liveness_detected, liveness_confidence, 
                     verification_result, aws_rekognition_response)
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
                    [
                        kycSessionId,
                        document.id,
                        null, // Live face image URL (not stored for real-time matching)
                        document.image_url,
                        verificationResult.similarity || 0,
                        verificationResult.similarity || 0,
                        verificationResult.verified || false,
                        verificationResult.confidence || 0,
                        verificationResult.verified && verificationResult.similarity >= 70 ? 'match' : 'no_match',
                        JSON.stringify(verificationResult)
                    ]
                );

                // Clean up temp files
                if (documentTempPath && fs.existsSync(documentTempPath)) {
                    fs.unlinkSync(documentTempPath);
                }
                if (liveImagePath && fs.existsSync(liveImagePath)) {
                    fs.unlinkSync(liveImagePath);
                }

                // Enhanced response with detailed error messages
                let message = 'Face match not verified';
                if (verificationResult.error) {
                    message = verificationResult.error;
                } else if (verificationResult.verified && verificationResult.similarity >= 70) {
                    message = `Face match verified (${(verificationResult.similarity || 0).toFixed(1)}% similarity)`;
                } else if (verificationResult.similarity > 0) {
                    message = `Face match failed: Similarity ${(verificationResult.similarity || 0).toFixed(1)}% (Minimum required: 70%)`;
                } else {
                    message = verificationResult.message || 'No face match found';
                }

                res.json({
                    success: true,
                    match: verificationResult.verified && verificationResult.similarity >= 70,
                    similarity: verificationResult.similarity || 0,
                    confidence: verificationResult.confidence || 0,
                    message: message,
                    documentFaceDetected: verificationResult.documentFaceDetected || false,
                    liveFaceDetected: verificationResult.liveFaceDetected || false
                });
            } catch (error) {
                // Clean up temp files on error
                if (documentTempPath && fs.existsSync(documentTempPath)) {
                    try { fs.unlinkSync(documentTempPath); } catch (e) {}
                }
                if (liveImagePath && fs.existsSync(liveImagePath)) {
                    try { fs.unlinkSync(liveImagePath); } catch (e) {}
                }
                throw error;
            }
        } catch (error) {
            console.error('Real-time face match error:', error);
            res.status(500).json({ 
                error: 'Failed to perform face matching',
                message: error.message 
            });
        }
    }

    async uploadUserPhoto(req, res) {
        try {
            const { sessionId } = req.body;
            const file = req.file;

            if (!file) {
                return res.status(400).json({ error: 'No file uploaded' });
            }

            if (!sessionId) {
                return res.status(400).json({ error: 'Session ID is required' });
            }

            // Verify session exists
            const sessionResult = await pool.query(
                'SELECT id FROM kyc_sessions WHERE session_id = $1',
                [sessionId]
            );

            if (sessionResult.rows.length === 0) {
                return res.status(404).json({ error: 'Session not found' });
            }

            const kycSessionId = sessionResult.rows[0].id;

            // Upload to S3
            const s3Key = `user-photos/${sessionId}/${Date.now()}-${file.filename}`;
            let uploadResult;
            try {
                uploadResult = await s3Service.uploadFile(file.path, s3Key);
            } catch (s3Error) {
                console.error('S3 upload failed:', s3Error);
                // Clean up local file
                if (fs.existsSync(file.path)) {
                    fs.unlinkSync(file.path);
                }
                throw new Error('Failed to upload user photo to storage');
            }

            // Update session with user photo
            const updateResult = await pool.query(
                `UPDATE kyc_sessions 
                SET user_photo_url = $1,
                    user_photo_s3_key = $2,
                    updated_at = NOW()
                WHERE id = $3
                RETURNING *`,
                [uploadResult.url, s3Key, kycSessionId]
            );

            // Clean up local file
            if (fs.existsSync(file.path)) {
                fs.unlinkSync(file.path);
            }

            res.json({
                success: true,
                session: updateResult.rows[0],
                userPhotoUrl: uploadResult.url
            });
        } catch (error) {
            console.error('Upload user photo error:', error);
            res.status(500).json({ error: 'Failed to upload user photo', details: error.message });
        }
    }
}

module.exports = new KYCController();

