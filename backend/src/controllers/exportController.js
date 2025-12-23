const PDFDocument = require('pdfkit');
const ExcelJS = require('exceljs');
const pool = require('../config/database');
const s3Service = require('../services/s3Service');
const videoRecordingService = require('../services/videoRecordingService');
const ocrService = require('../services/ocrService');
const path = require('path');
const fs = require('fs');
const https = require('https');
const http = require('http');

class ExportController {
    async generatePDF(req, res) {
        try {
            const { sessionId } = req.params;

            // Get session data
            const sessionResult = await pool.query(
                `SELECT s.*, u.username as agent_username, u.full_name as agent_name
                FROM kyc_sessions s
                LEFT JOIN users u ON s.agent_id = u.id
                WHERE s.session_id = $1`,
                [sessionId]
            );

            if (sessionResult.rows.length === 0) {
                return res.status(404).json({ error: 'Session not found' });
            }

            const session = sessionResult.rows[0];

            // Get documents with OCR data
            const documentsResult = await pool.query(
                `SELECT * FROM documents 
                WHERE session_id = (SELECT id FROM kyc_sessions WHERE session_id = $1)
                ORDER BY created_at DESC`,
                [sessionId]
            );
            
            // If documents don't have OCR data, process them
            for (const doc of documentsResult.rows) {
                if (!doc.ocr_extracted_data && doc.s3_key) {
                    let tempFilePath = null;
                    try {
                        // Download file from S3 to temp location for OCR
                        const tempPath = path.join(__dirname, '../../temp', `doc-export-${doc.id}-${Date.now()}.jpg`);
                        const tempDir = path.dirname(tempPath);
                        if (!fs.existsSync(tempDir)) {
                            fs.mkdirSync(tempDir, { recursive: true });
                        }
                        
                        tempFilePath = await s3Service.downloadFile(doc.s3_key, tempPath);
                        
                        let ocrResult;
                        if (doc.document_type === 'aadhaar') {
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
                                doc.id
                            ]
                        );
                        
                        // Update the document object with new OCR data
                        doc.ocr_extracted_data = JSON.stringify(ocrResult);
                        doc.aadhaar_number = ocrResult.aadhaarNumber || null;
                        doc.name = ocrResult.name || null;
                        doc.date_of_birth = ocrResult.dateOfBirth || null;
                        doc.ocr_confidence = ocrResult.confidence || null;
                    } catch (err) {
                        console.error(`Failed to process OCR for document ${doc.id}:`, err);
                        // Continue with other documents
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
                }
            }

            // Get face verification results
            const faceVerificationResult = await pool.query(
                `SELECT fv.* FROM face_verification fv
                JOIN kyc_sessions s ON fv.session_id = s.id
                WHERE s.session_id = $1`,
                [sessionId]
            );

            // Get video recordings
            const recordingsResult = await pool.query(
                `SELECT vr.* FROM video_recordings vr
                JOIN kyc_sessions s ON vr.session_id = s.id
                WHERE s.session_id = $1`,
                [sessionId]
            );

            // Create PDF
            const doc = new PDFDocument({ margin: 50 });
            
            // Set headers before piping
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', `attachment; filename=kyc-report-${sessionId}.pdf`);

            // Handle PDF generation errors
            doc.on('error', (err) => {
                console.error('PDF generation stream error:', err);
                if (!res.headersSent) {
                    res.status(500).json({ error: 'Failed to generate PDF', details: err.message });
                }
            });

            doc.pipe(res);

            // Header
            doc.fontSize(24).font('Helvetica-Bold').text('Video KYC Verification Report', { align: 'center' });
            doc.moveDown(0.5);
            doc.fontSize(10).font('Helvetica').fillColor('gray').text(`Generated on: ${new Date().toLocaleString()}`, { align: 'center' });
            doc.fillColor('black');
            doc.moveDown();

            // Session Information
            doc.fontSize(16).font('Helvetica-Bold').fillColor('#1976d2').text('Session Information', { underline: true });
            doc.fillColor('black').font('Helvetica').fontSize(11);
            doc.moveDown(0.3);
            
            const sessionInfo = [
                { label: 'Session ID', value: session.session_id },
                { label: 'User Name', value: session.user_name || 'N/A' },
                { label: 'User Phone', value: session.user_phone || 'N/A' },
                { label: 'User Email', value: session.user_email || 'N/A' },
                { label: 'Agent', value: session.agent_name || session.agent_username || 'N/A' },
                { label: 'Status', value: session.status.toUpperCase() },
                { label: 'Created At', value: new Date(session.created_at).toLocaleString() }
            ];
            
            if (session.completed_at) {
                sessionInfo.push({ label: 'Completed At', value: new Date(session.completed_at).toLocaleString() });
            }
            
            sessionInfo.forEach(info => {
                doc.font('Helvetica-Bold').text(`${info.label}:`, { continued: true });
                doc.font('Helvetica').text(` ${info.value}`);
            });
            
            doc.moveDown();

            // Documents
            if (documentsResult.rows.length > 0) {
                doc.fontSize(16).font('Helvetica-Bold').fillColor('#1976d2').text('Documents', { underline: true });
                doc.fillColor('black').font('Helvetica').fontSize(11);
                doc.moveDown(0.3);
                documentsResult.rows.forEach((document, index) => {
                    doc.moveDown(0.5);
                    doc.font('Helvetica-Bold').fontSize(12).fillColor('#424242').text(`Document ${index + 1}: ${document.document_type.toUpperCase()}`, { underline: false });
                    doc.fillColor('black').font('Helvetica').fontSize(10);
                    doc.moveDown(0.2);
                    
                    // OCR Extracted Data - check ocr_extracted_data JSON first
                    let ocrData = {};
                    if (document.ocr_extracted_data) {
                        try {
                            ocrData = typeof document.ocr_extracted_data === 'string' 
                                ? JSON.parse(document.ocr_extracted_data) 
                                : document.ocr_extracted_data;
                        } catch (err) {
                            console.error('Error parsing OCR data:', err);
                        }
                    }
                    
                    // Extract fields based on document type
                    const isPAN = document.document_type.toLowerCase() === 'pan';
                    const isAadhaar = document.document_type.toLowerCase() === 'aadhaar';
                    
                    if (isPAN) {
                        // PAN Card fields
                        const panNumber = ocrData.panNumber || document.aadhaar_number || 'N/A';
                        const name = ocrData.name || document.name || 'N/A';
                        const fatherName = ocrData.fatherName || 'N/A';
                        const dob = ocrData.dateOfBirth || document.date_of_birth || 'N/A';
                        
                        doc.font('Helvetica-Bold').text('PAN Number:', { continued: true });
                        doc.font('Helvetica').text(` ${panNumber}`);
                        
                        doc.font('Helvetica-Bold').text('Name:', { continued: true });
                        doc.font('Helvetica').text(` ${name}`);
                        
                        doc.font('Helvetica-Bold').text('Father Name:', { continued: true });
                        doc.font('Helvetica').text(` ${fatherName}`);
                        
                        doc.font('Helvetica-Bold').text('Date of Birth:', { continued: true });
                        doc.font('Helvetica').text(` ${dob}`);
                    } else if (isAadhaar) {
                        // Aadhaar Card fields
                        const aadhaarNum = ocrData.aadhaarNumber || document.aadhaar_number || 'N/A';
                        const name = ocrData.name || document.name || 'N/A';
                        const dob = ocrData.dateOfBirth || document.date_of_birth || 'N/A';
                        const gender = ocrData.gender || 'N/A';
                        
                        doc.font('Helvetica-Bold').text('Aadhaar Number:', { continued: true });
                        doc.font('Helvetica').text(` ${aadhaarNum}`);
                        
                        doc.font('Helvetica-Bold').text('Name:', { continued: true });
                        doc.font('Helvetica').text(` ${name}`);
                        
                        doc.font('Helvetica-Bold').text('Date of Birth:', { continued: true });
                        doc.font('Helvetica').text(` ${dob}`);
                        
                        doc.font('Helvetica-Bold').text('Gender:', { continued: true });
                        doc.font('Helvetica').text(` ${gender}`);
                    } else {
                        // Generic document fields
                        const docNumber = ocrData.aadhaarNumber || ocrData.panNumber || document.aadhaar_number || 'N/A';
                        const name = ocrData.name || document.name || 'N/A';
                        const dob = ocrData.dateOfBirth || document.date_of_birth || 'N/A';
                        
                        doc.font('Helvetica-Bold').text('Document Number:', { continued: true });
                        doc.font('Helvetica').text(` ${docNumber}`);
                        
                        doc.font('Helvetica-Bold').text('Name:', { continued: true });
                        doc.font('Helvetica').text(` ${name}`);
                        
                        doc.font('Helvetica-Bold').text('Date of Birth:', { continued: true });
                        doc.font('Helvetica').text(` ${dob}`);
                    }
                    
                    doc.font('Helvetica-Bold').text('Verification Status:', { continued: true });
                    doc.font('Helvetica').text(` ${document.verification_status.toUpperCase()}`);
                    
                    doc.font('Helvetica-Bold').text('OCR Confidence:', { continued: true });
                    doc.font('Helvetica').text(` ${document.ocr_confidence ? document.ocr_confidence + '%' : 'N/A'}`);
                    
                    // Add document image URL as clickable link
                    doc.moveDown(0.3);
                    if (document.s3_key) {
                        try {
                            const imageUrl = s3Service.getSignedUrl(document.s3_key, 3600);
                            doc.font('Helvetica-Bold').fontSize(11).fillColor('#1976d2');
                            doc.text('View Document Image', { 
                                link: imageUrl,
                                underline: true
                            });
                        } catch (err) {
                            console.error('Error generating signed URL for PDF:', err);
                        }
                    } else if (document.image_url) {
                        doc.font('Helvetica-Bold').fontSize(11).fillColor('#1976d2');
                        doc.text('View Document Image', { 
                            link: document.image_url,
                            underline: true
                        });
                    }
                    doc.fillColor('black').fontSize(10);
                });
                doc.moveDown();
            }

            // Face Verification
            if (faceVerificationResult.rows.length > 0) {
                doc.fontSize(16).font('Helvetica-Bold').fillColor('#1976d2').text('Face Verification', { underline: true });
                doc.fillColor('black').font('Helvetica').fontSize(11);
                doc.moveDown(0.3);
                const fv = faceVerificationResult.rows[0];
                doc.font('Helvetica-Bold').text('Match Score:', { continued: true });
                doc.font('Helvetica').text(` ${fv.match_score || 'N/A'}`);
                doc.font('Helvetica-Bold').text('Similarity:', { continued: true });
                doc.font('Helvetica').text(` ${fv.similarity_percentage || 'N/A'}%`);
                doc.font('Helvetica-Bold').text('Liveness Detected:', { continued: true });
                doc.font('Helvetica').text(` ${fv.liveness_detected ? 'Yes' : 'No'}`);
                doc.font('Helvetica-Bold').text('Verification Result:', { continued: true });
                doc.font('Helvetica').text(` ${fv.verification_result || 'N/A'}`);
                doc.moveDown();
            }

            // Video Recordings
            doc.fontSize(16).font('Helvetica-Bold').fillColor('#1976d2').text('Video Recordings', { underline: true });
            doc.fillColor('black').font('Helvetica').fontSize(11);
            doc.moveDown(0.3);
            if (recordingsResult.rows.length > 0) {
                recordingsResult.rows.forEach((rec, index) => {
                    doc.moveDown(0.5);
                    doc.font('Helvetica-Bold').fontSize(12).fillColor('#424242').text(`Recording ${index + 1}`, { underline: false });
                    doc.fillColor('black').font('Helvetica').fontSize(10);
                    doc.moveDown(0.2);
                    
                    doc.font('Helvetica-Bold').text('Duration:', { continued: true });
                    doc.font('Helvetica').text(` ${rec.duration_seconds ? rec.duration_seconds + ' seconds' : 'N/A'}`);
                    
                    doc.font('Helvetica-Bold').text('File Size:', { continued: true });
                    doc.font('Helvetica').text(` ${rec.file_size_bytes ? (rec.file_size_bytes / 1024 / 1024).toFixed(2) + ' MB' : 'N/A'}`);
                    
                    doc.font('Helvetica-Bold').text('Recorded At:', { continued: true });
                    doc.font('Helvetica').text(` ${rec.recording_started_at ? new Date(rec.recording_started_at).toLocaleString() : 'N/A'}`);
                    
                    // Add video URL as clickable link
                    doc.moveDown(0.3);
                    let videoUrlToUse = null;
                    
                    // Try to get signed URL from s3_key first
                    if (rec.s3_key) {
                        try {
                            videoUrlToUse = videoRecordingService.getVideoUrl(rec.s3_key, 3600);
                            console.log(`Generated signed URL for recording ${rec.id}: ${videoUrlToUse.substring(0, 50)}...`);
                        } catch (err) {
                            console.error('Error generating signed URL for video:', err);
                            // Fallback to video_url if signed URL generation fails
                            if (rec.video_url) {
                                videoUrlToUse = rec.video_url;
                                console.log(`Using video_url as fallback for recording ${rec.id}`);
                            }
                        }
                    } else if (rec.video_url) {
                        // Use video_url directly if s3_key is not available
                        videoUrlToUse = rec.video_url;
                        console.log(`Using video_url directly for recording ${rec.id}`);
                    }
                    
                    // Add link to PDF if we have a URL
                    if (videoUrlToUse) {
                        doc.font('Helvetica-Bold').fontSize(11).fillColor('#1976d2');
                        doc.text('View Video Recording', { 
                            link: videoUrlToUse,
                            underline: true
                        });
                        // Also add the URL as text for reference
                        doc.moveDown(0.1);
                        doc.font('Helvetica').fontSize(9).fillColor('gray');
                        doc.text(`Link: ${videoUrlToUse.substring(0, 80)}${videoUrlToUse.length > 80 ? '...' : ''}`, {
                            link: videoUrlToUse
                        });
                    } else {
                        doc.font('Helvetica').fontSize(10).fillColor('red');
                        doc.text('Video recording URL not available');
                    }
                    doc.fillColor('black').fontSize(10);
                });
            } else {
                doc.moveDown(0.3);
                doc.font('Helvetica').text('No video recordings available for this session.');
            }
            doc.moveDown();

            // Notes / Reject Reason
            if (session.notes) {
                doc.moveDown();
                const notesTitle = session.status === 'rejected' ? 'Reject Reason' : 'Notes';
                doc.fontSize(16).font('Helvetica-Bold').fillColor(session.status === 'rejected' ? '#d32f2f' : '#1976d2').text(notesTitle, { underline: true });
                doc.fillColor('black').font('Helvetica').fontSize(11);
                doc.moveDown(0.3);
                doc.text(session.notes);
            }
            
            // Footer
            doc.moveDown(2);
            doc.fontSize(8).fillColor('gray').text('This is an automated report generated by Video KYC Verification System.', { align: 'center' });
            doc.text('All document images and video recordings are securely stored in AWS S3.', { align: 'center' });

            doc.end();
        } catch (error) {
            console.error('Generate PDF error:', error);
            // Check if response headers have been sent
            if (!res.headersSent) {
                res.status(500).json({ error: 'Failed to generate PDF', details: error.message });
            } else {
                // If headers already sent, we can't send JSON response
                // Just log the error
                console.error('Cannot send error response - headers already sent');
            }
        }
    }

    async generateExcel(req, res) {
        try {
            const { startDate, endDate, status } = req.query;

            // Build query
            let query = `
                SELECT s.*, 
                u.username as agent_username, u.full_name as agent_name,
                COUNT(DISTINCT d.id) as document_count,
                COUNT(DISTINCT vr.id) as recording_count
                FROM kyc_sessions s
                LEFT JOIN users u ON s.agent_id = u.id
                LEFT JOIN documents d ON d.session_id = s.id
                LEFT JOIN video_recordings vr ON vr.session_id = s.id
                WHERE 1=1
            `;
            const params = [];
            let paramIndex = 1;

            if (startDate) {
                query += ` AND s.created_at >= $${paramIndex}`;
                params.push(startDate);
                paramIndex++;
            }

            if (endDate) {
                query += ` AND s.created_at <= $${paramIndex}`;
                params.push(endDate);
                paramIndex++;
            }

            if (status) {
                query += ` AND s.status = $${paramIndex}`;
                params.push(status);
                paramIndex++;
            }

            query += ` GROUP BY s.id, u.username, u.full_name ORDER BY s.created_at DESC`;

            const sessionsResult = await pool.query(query, params);

            // Create Excel workbook
            const workbook = new ExcelJS.Workbook();
            const worksheet = workbook.addWorksheet('KYC Sessions');

            // Define columns
            worksheet.columns = [
                { header: 'Session ID', key: 'session_id', width: 30 },
                { header: 'User Name', key: 'user_name', width: 20 },
                { header: 'User Phone', key: 'user_phone', width: 15 },
                { header: 'User Email', key: 'user_email', width: 25 },
                { header: 'Agent', key: 'agent_name', width: 20 },
                { header: 'Status', key: 'status', width: 15 },
                { header: 'Documents', key: 'document_count', width: 12 },
                { header: 'Recordings', key: 'recording_count', width: 12 },
                { header: 'Created At', key: 'created_at', width: 20 },
                { header: 'Completed At', key: 'completed_at', width: 20 }
            ];

            // Style header
            worksheet.getRow(1).font = { bold: true };
            worksheet.getRow(1).fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: 'FFE0E0E0' }
            };

            // Add data
            sessionsResult.rows.forEach(session => {
                worksheet.addRow({
                    session_id: session.session_id,
                    user_name: session.user_name || '',
                    user_phone: session.user_phone || '',
                    user_email: session.user_email || '',
                    agent_name: session.agent_name || session.agent_username || '',
                    status: session.status,
                    document_count: session.document_count || 0,
                    recording_count: session.recording_count || 0,
                    created_at: new Date(session.created_at).toLocaleString(),
                    completed_at: session.completed_at ? new Date(session.completed_at).toLocaleString() : ''
                });
            });

            // Set response headers
            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            res.setHeader('Content-Disposition', 'attachment; filename=kyc-sessions-export.xlsx');

            // Write to response
            await workbook.xlsx.write(res);
            res.end();
        } catch (error) {
            console.error('Generate Excel error:', error);
            res.status(500).json({ error: 'Failed to generate Excel file' });
        }
    }

    async bulkExport(req, res) {
        try {
            const { sessionIds, format } = req.body;

            if (!sessionIds || !Array.isArray(sessionIds) || sessionIds.length === 0) {
                return res.status(400).json({ error: 'Session IDs array is required' });
            }

            if (format === 'excel') {
                // Generate Excel with multiple sheets or combined data
                return this.generateExcel(req, res);
            } else {
                // For PDF, could create a combined PDF or zip file
                return res.status(400).json({ error: 'Bulk PDF export not yet implemented' });
            }
        } catch (error) {
            console.error('Bulk export error:', error);
            res.status(500).json({ error: 'Failed to perform bulk export' });
        }
    }
}

module.exports = new ExportController();

