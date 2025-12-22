const AWS = require('aws-sdk');
const path = require('path');

// Load .env explicitly with correct path
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

// Configure AWS SDK
const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
const region = process.env.AWS_REGION || 'ap-south-1';

if (!accessKeyId || !secretAccessKey) {
    console.error('⚠️ AWS credentials not found in environment variables');
    console.error('Please check your .env file in the backend directory');
}

AWS.config.update({
    accessKeyId: accessKeyId,
    secretAccessKey: secretAccessKey,
    region: region
});

// S3 instance
const s3 = new AWS.S3();

// Rekognition instance
const rekognition = new AWS.Rekognition();

module.exports = {
    s3,
    rekognition,
    S3_BUCKET: process.env.S3_BUCKET_NAME || 'videokyc1'
};

