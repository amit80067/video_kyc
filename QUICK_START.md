# Quick Start Guide - Video KYC System

## AWS Configuration (Mumbai Region)

### Bucket Name: `videokyc1`
### Region: `ap-south-1` (Mumbai, India)

---

## Backend .env File Configuration

Backend folder mein `.env` file create karo aur ye add karo:

```env
# Server
PORT=3000
FRONTEND_URL=http://localhost:3001

# Database
DB_HOST=localhost
DB_PORT=5432
DB_NAME=video_kyc
DB_USER=postgres
DB_PASSWORD=your_password

# JWT
JWT_SECRET=your_jwt_secret_key

# AWS Configuration (Mumbai Region)
AWS_ACCESS_KEY_ID=your_aws_access_key_id
AWS_SECRET_ACCESS_KEY=your_aws_secret_access_key
AWS_REGION=ap-south-1
S3_BUCKET_NAME=videokyc1
```

---

## AWS Setup Checklist

### S3 Bucket:
- [ ] Bucket name: `videokyc1`
- [ ] Region: `Asia Pacific (Mumbai) ap-south-1`
- [ ] Block public access: ✅ Enabled
- [ ] Encryption: ✅ Enabled

### IAM User:
- [ ] User created with programmatic access
- [ ] Policy attached (S3 + Rekognition permissions)
- [ ] Access keys generated and saved

### IAM Policy (Bucket ARN):
```json
{
    "Resource": [
        "arn:aws:s3:::videokyc1",
        "arn:aws:s3:::videokyc1/*"
    ]
}
```

---

## Quick Test

Backend folder mein test script run karo:

```bash
cd backend
node test-aws-setup.js
```

Expected output:
```
✅ S3 Connected!
✅ Bucket "videokyc1" found!
✅ Rekognition service initialized
Region: ap-south-1
```

---

## Summary

- **Bucket**: `videokyc1`
- **Region**: `ap-south-1` (Mumbai)
- **Code Updated**: ✅ Default values set

Setup complete! 🎉

