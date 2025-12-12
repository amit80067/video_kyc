const s3Service = require('./s3Service');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

class VideoRecordingService {
    /**
     * Save video recording to S3
     * @param {string} videoFilePath - Local path to video file
     * @param {number} sessionId - KYC session ID
     * @returns {Promise<Object>} Recording metadata
     */
    async saveRecording(videoFilePath, sessionId) {
        try {
            // Generate unique S3 key
            const fileExtension = path.extname(videoFilePath);
            const s3Key = `recordings/${sessionId}/${uuidv4()}${fileExtension}`;

            // Upload to S3
            const uploadResult = await s3Service.uploadFile(
                videoFilePath,
                s3Key,
                fileExtension === '.mp4' ? 'video/mp4' : 'video/webm'
            );

            // Get file size
            const stats = fs.statSync(videoFilePath);
            const fileSizeBytes = stats.size;

            return {
                s3Key: uploadResult.key,
                s3Url: uploadResult.url,
                fileSizeBytes: fileSizeBytes,
                duration: null // Duration will be calculated from video metadata if needed
            };
        } catch (error) {
            console.error('Video recording save error:', error);
            throw new Error(`Failed to save video recording: ${error.message}`);
        }
    }

    /**
     * Save video recording from buffer
     * @param {Buffer} videoBuffer - Video file buffer
     * @param {number} sessionId - KYC session ID
     * @param {string} mimeType - Video MIME type
     * @returns {Promise<Object>} Recording metadata
     */
    async saveRecordingFromBuffer(videoBuffer, sessionId, mimeType = 'video/webm') {
        try {
            // Generate unique S3 key
            const extension = mimeType === 'video/mp4' ? '.mp4' : '.webm';
            const s3Key = `recordings/${sessionId}/${uuidv4()}${extension}`;

            // Upload to S3
            const uploadResult = await s3Service.uploadBuffer(
                videoBuffer,
                s3Key,
                mimeType
            );

            return {
                s3Key: uploadResult.key,
                s3Url: uploadResult.url,
                fileSizeBytes: videoBuffer.length,
                duration: null
            };
        } catch (error) {
            console.error('Video recording save from buffer error:', error);
            throw new Error(`Failed to save video recording: ${error.message}`);
        }
    }

    /**
     * Get signed URL for video access
     * @param {string} s3Key - S3 key of the video
     * @param {number} expiresIn - URL expiration time in seconds
     * @returns {string} Signed URL
     */
    getVideoUrl(s3Key, expiresIn = 3600) {
        return s3Service.getSignedUrl(s3Key, expiresIn);
    }

    /**
     * Delete video recording
     * @param {string} s3Key - S3 key of the video
     */
    async deleteRecording(s3Key) {
        return await s3Service.deleteFile(s3Key);
    }

    /**
     * Calculate video duration (requires ffmpeg or similar)
     * This is a placeholder - actual implementation would require ffmpeg
     */
    async getVideoDuration(videoFilePath) {
        // TODO: Implement using ffmpeg or similar tool
        // For now, return null
        return null;
    }
}

module.exports = new VideoRecordingService();

