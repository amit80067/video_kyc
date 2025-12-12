const AWS = require('aws-sdk');
require('dotenv').config();

// Configure AWS SDK
AWS.config.update({
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    region: process.env.AWS_REGION || 'ap-south-1' // Mumbai, India
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

