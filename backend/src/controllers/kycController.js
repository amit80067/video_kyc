const pool = require('../config/database');
const ocrService = require('../services/ocrService');
const faceVerificationService = require('../services/faceVerificationService');
const s3Service = require('../services/s3Service');
const videoRecordingService = require('../services/videoRecordingService');
const path = require('path');
const fs = require('fs');

class KYCController {
    async uploadDocument(req, res) {
        try {
            const { sessionId, documentType } = req.body;
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
                throw new Error(`S3 upload failed: ${s3Error.message}`);
            }

            // Save to database
            const result = await pool.query(
                `INSERT INTO documents 
                (session_id, document_type, image_url, s3_key, verification_status)
                VALUES ($1, $2, $3, $4, $5)
                RETURNING *`,
                [kycSessionId, documentType, uploadResult.url, s3Key, 'pending']
            );

            const document = result.rows[0];

            // Process OCR automatically in background (don't wait for it)
            setImmediate(async () => {
                let tempFilePath = null;
                try {
                    // Download file from S3 to temp location for OCR
                    const tempPath = path.join(__dirname, '../../temp', `doc-${document.id}-${Date.now()}.jpg`);
                    const tempDir = path.dirname(tempPath);
                    if (!fs.existsSync(tempDir)) {
                        fs.mkdirSync(tempDir, { recursive: true });
                    }
                    
                    tempFilePath = await s3Service.downloadFile(s3Key, tempPath);
                    
                    let ocrResult;
                    // If document type is Aadhaar, use specialized extraction
                    if (documentType === 'aadhaar') {
                        ocrResult = await ocrService.extractAadhaarData(tempFilePath);
                    } else {
                        ocrResult = await ocrService.extractText(tempFilePath);
                    }

                    // Update document with OCR results
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
                            JSON.stringify(ocrResult),
                            ocrResult.aadhaarNumber || null,
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
            res.status(500).json({ 
                error: 'Failed to upload document',
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

            // Process OCR (assuming we have local file path)
            // In production, download from S3 first
            let ocrResult;
            try {
                // If document type is Aadhaar, use specialized extraction
                if (document.document_type === 'aadhaar') {
                    ocrResult = await ocrService.extractAadhaarData(imageUrl);
                } else {
                    ocrResult = await ocrService.extractText(imageUrl);
                }
            } catch (ocrError) {
                console.error('OCR processing error:', ocrError);
                return res.status(500).json({ error: 'OCR processing failed', details: ocrError.message });
            }

            // Update document with OCR results
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
                    JSON.stringify(ocrResult),
                    ocrResult.aadhaarNumber || null,
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
        try {
            const { sessionId } = req.body;
            const file = req.file;

            if (!file) {
                return res.status(400).json({ error: 'No video file uploaded' });
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

            // Save recording to S3
            const recordingResult = await videoRecordingService.saveRecording(file.path, sessionId);

            // Save to database
            const result = await pool.query(
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

            // Clean up local file
            if (fs.existsSync(file.path)) {
                fs.unlinkSync(file.path);
            }

            res.status(201).json({
                success: true,
                recording: result.rows[0]
            });
        } catch (error) {
            console.error('Upload recording error:', error);
            res.status(500).json({ error: 'Failed to upload recording' });
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

            // Get latest document for this session
            const docResult = await pool.query(
                `SELECT * FROM documents 
                WHERE session_id = $1 AND document_type = 'aadhaar'
                ORDER BY created_at DESC LIMIT 1`,
                [kycSessionId]
            );

            if (docResult.rows.length === 0) {
                return res.status(404).json({ error: 'No document found for this session. Please capture document first.' });
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

                res.json({
                    success: true,
                    match: verificationResult.verified && verificationResult.similarity >= 70,
                    similarity: verificationResult.similarity || 0,
                    confidence: verificationResult.confidence || 0,
                    message: verificationResult.verified && verificationResult.similarity >= 70 
                        ? 'Face match verified' 
                        : 'Face match not verified'
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
}

module.exports = new KYCController();

