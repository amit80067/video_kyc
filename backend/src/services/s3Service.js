const { s3, S3_BUCKET } = require('../config/aws');
const fs = require('fs');
const path = require('path');

class S3Service {
    /**
     * Upload file to S3
     */
    async uploadFile(filePath, key, contentType = null) {
        try {
            const fileContent = fs.readFileSync(filePath);
            const fileExtension = path.extname(filePath).toLowerCase();
            
            // Determine content type if not provided
            if (!contentType) {
                const contentTypes = {
                    '.jpg': 'image/jpeg',
                    '.jpeg': 'image/jpeg',
                    '.png': 'image/png',
                    '.webp': 'image/webp',
                    '.mp4': 'video/mp4',
                    '.webm': 'video/webm',
                    '.pdf': 'application/pdf'
                };
                contentType = contentTypes[fileExtension] || 'application/octet-stream';
            }

            const params = {
                Bucket: S3_BUCKET,
                Key: key,
                Body: fileContent,
                ContentType: contentType,
                ACL: 'private' // Private by default, use signed URLs for access
            };

            const result = await s3.upload(params).promise();
            return {
                url: result.Location,
                key: result.Key,
                bucket: result.Bucket
            };
        } catch (error) {
            console.error('S3 upload error:', error);
            throw new Error(`Failed to upload file to S3: ${error.message}`);
        }
    }

    /**
     * Generate signed URL for private file access
     */
    getSignedUrl(key, expiresIn = 3600) {
        try {
            const params = {
                Bucket: S3_BUCKET,
                Key: key,
                Expires: expiresIn // URL expires in seconds (default 1 hour)
            };

            return s3.getSignedUrl('getObject', params);
        } catch (error) {
            console.error('S3 signed URL error:', error);
            throw new Error(`Failed to generate signed URL: ${error.message}`);
        }
    }

    /**
     * Delete file from S3
     */
    async deleteFile(key) {
        try {
            const params = {
                Bucket: S3_BUCKET,
                Key: key
            };

            await s3.deleteObject(params).promise();
            return true;
        } catch (error) {
            console.error('S3 delete error:', error);
            throw new Error(`Failed to delete file from S3: ${error.message}`);
        }
    }

    /**
     * Upload buffer directly to S3
     */
    async uploadBuffer(buffer, key, contentType) {
        try {
            const params = {
                Bucket: S3_BUCKET,
                Key: key,
                Body: buffer,
                ContentType: contentType,
                ACL: 'private'
            };

            const result = await s3.upload(params).promise();
            return {
                url: result.Location,
                key: result.Key,
                bucket: result.Bucket
            };
        } catch (error) {
            console.error('S3 buffer upload error:', error);
            throw new Error(`Failed to upload buffer to S3: ${error.message}`);
        }
    }

    /**
     * Check if file exists in S3
     */
    async fileExists(key) {
        try {
            const params = {
                Bucket: S3_BUCKET,
                Key: key
            };

            await s3.headObject(params).promise();
            return true;
        } catch (error) {
            if (error.code === 'NotFound') {
                return false;
            }
            throw error;
        }
    }

    /**
     * Download file from S3 to local path
     */
    async downloadFile(s3Key, localPath) {
        try {
            const params = {
                Bucket: S3_BUCKET,
                Key: s3Key
            };

            // Ensure directory exists
            const dir = path.dirname(localPath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }

            // Download file
            const result = await s3.getObject(params).promise();
            fs.writeFileSync(localPath, result.Body);

            return localPath;
        } catch (error) {
            console.error('S3 download error:', error);
            throw new Error(`Failed to download file from S3: ${error.message}`);
        }
    }
}

module.exports = new S3Service();

