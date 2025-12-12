const { rekognition } = require('../config/aws');
const s3Service = require('./s3Service');

class FaceVerificationService {
    /**
     * Compare faces from two images
     * @param {string} sourceImagePath - Path to source image (document photo)
     * @param {string} targetImagePath - Path to target image (live video frame)
     * @returns {Promise<Object>} Comparison results
     */
    async compareFaces(sourceImagePath, targetImagePath) {
        try {
            const fs = require('fs');
            
            // Read images as buffers
            const sourceImage = fs.readFileSync(sourceImagePath);
            const targetImage = fs.readFileSync(targetImagePath);

            const params = {
                SourceImage: {
                    Bytes: sourceImage
                },
                TargetImage: {
                    Bytes: targetImage
                },
                SimilarityThreshold: 70 // Minimum similarity threshold (0-100)
            };

            const result = await rekognition.compareFaces(params).promise();

            if (result.FaceMatches && result.FaceMatches.length > 0) {
                const match = result.FaceMatches[0];
                return {
                    match: true,
                    similarity: match.Similarity,
                    confidence: match.Similarity,
                    faceMatchDetails: match.Face
                };
            } else {
                return {
                    match: false,
                    similarity: 0,
                    confidence: 0,
                    message: 'No face match found'
                };
            }
        } catch (error) {
            console.error('Face comparison error:', error);
            throw new Error(`Face verification failed: ${error.message}`);
        }
    }

    /**
     * Compare faces using S3 keys
     * @param {string} sourceS3Key - S3 key of source image
     * @param {string} targetS3Key - S3 key of target image
     */
    async compareFacesFromS3(sourceS3Key, targetS3Key) {
        try {
            const { S3_BUCKET } = require('../config/aws');

            const params = {
                SourceImage: {
                    S3Object: {
                        Bucket: S3_BUCKET,
                        Name: sourceS3Key
                    }
                },
                TargetImage: {
                    S3Object: {
                        Bucket: S3_BUCKET,
                        Name: targetS3Key
                    }
                },
                SimilarityThreshold: 70
            };

            const result = await rekognition.compareFaces(params).promise();

            if (result.FaceMatches && result.FaceMatches.length > 0) {
                const match = result.FaceMatches[0];
                return {
                    match: true,
                    similarity: match.Similarity,
                    confidence: match.Similarity,
                    faceMatchDetails: match.Face
                };
            } else {
                return {
                    match: false,
                    similarity: 0,
                    confidence: 0,
                    message: 'No face match found'
                };
            }
        } catch (error) {
            console.error('Face comparison from S3 error:', error);
            throw new Error(`Face verification failed: ${error.message}`);
        }
    }

    /**
     * Detect faces in an image
     */
    async detectFaces(imagePath) {
        try {
            const fs = require('fs');
            const image = fs.readFileSync(imagePath);

            const params = {
                Image: {
                    Bytes: image
                },
                Attributes: ['ALL'] // Get all face attributes
            };

            const result = await rekognition.detectFaces(params).promise();
            return result.FaceDetails;
        } catch (error) {
            console.error('Face detection error:', error);
            throw new Error(`Face detection failed: ${error.message}`);
        }
    }

    /**
     * Detect faces from S3
     */
    async detectFacesFromS3(s3Key) {
        try {
            const { S3_BUCKET } = require('../config/aws');

            const params = {
                Image: {
                    S3Object: {
                        Bucket: S3_BUCKET,
                        Name: s3Key
                    }
                },
                Attributes: ['ALL']
            };

            const result = await rekognition.detectFaces(params).promise();
            return result.FaceDetails;
        } catch (error) {
            console.error('Face detection from S3 error:', error);
            throw new Error(`Face detection failed: ${error.message}`);
        }
    }

    /**
     * Complete face verification process
     * Compares document photo with live video frame
     */
    async verifyFace(documentImagePath, liveImagePath) {
        try {
            // First, detect faces in both images
            const documentFaces = await this.detectFaces(documentImagePath);
            const liveFaces = await this.detectFaces(liveImagePath);

            if (documentFaces.length === 0) {
                return {
                    verified: false,
                    error: 'No face detected in document image'
                };
            }

            if (liveFaces.length === 0) {
                return {
                    verified: false,
                    error: 'No face detected in live image'
                };
            }

            // Compare faces
            const comparison = await this.compareFaces(documentImagePath, liveImagePath);

            return {
                verified: comparison.match && comparison.similarity >= 70,
                similarity: comparison.similarity,
                confidence: comparison.confidence,
                documentFaceDetected: documentFaces.length > 0,
                liveFaceDetected: liveFaces.length > 0,
                faceDetails: {
                    document: documentFaces[0],
                    live: liveFaces[0]
                }
            };
        } catch (error) {
            console.error('Face verification error:', error);
            return {
                verified: false,
                error: error.message
            };
        }
    }
}

module.exports = new FaceVerificationService();

