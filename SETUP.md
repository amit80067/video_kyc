# Video KYC System - Setup Guide

## Prerequisites

1. **Node.js** (v16 or higher)
2. **PostgreSQL** (v12 or higher)
3. **AWS Account** (for Rekognition and S3)
4. **npm** or **yarn**

## Installation Steps

### 1. Database Setup

```bash
# Create database
createdb video_kyc

# Run migrations
psql -U postgres -d video_kyc -f database/migrations/initial_schema.sql
```

### 2. Backend Setup

```bash
cd backend
npm install

# Create .env file
cp .env.example .env
# Edit .env with your configuration:
# - Database credentials
# - AWS credentials
# - JWT secret

# Start server
npm start
# or for development
npm run dev
```

### 3. Frontend Setup

```bash
cd frontend
npm install

# Create .env file
cp .env.example .env
# Edit .env with your API URLs

# Start development server
npm start
```

## Environment Variables

### Backend (.env)

```env
PORT=3000
FRONTEND_URL=http://localhost:3001

DB_HOST=localhost
DB_PORT=5432
DB_NAME=video_kyc
DB_USER=postgres
DB_PASSWORD=your_password

JWT_SECRET=your_jwt_secret_key

AWS_ACCESS_KEY_ID=your_aws_access_key
AWS_SECRET_ACCESS_KEY=your_aws_secret_key
AWS_REGION=ap-south-1
S3_BUCKET_NAME=videokyc1
```

### Frontend (.env)

```env
REACT_APP_API_URL=http://localhost:3000
REACT_APP_SOCKET_URL=http://localhost:3000
```

## Default Login Credentials

After running migrations, default users are created:

- **Admin**: username: `admin`, password: `admin123` (change in production!)
- **Agent**: username: `agent1`, password: `agent123` (change in production!)

## AWS Setup

1. Create an S3 bucket for storing videos and documents
2. Create IAM user with permissions for:
   - S3 (read/write)
   - Rekognition (face comparison, face detection)
3. Add credentials to backend .env file

## Running the Application

1. Start PostgreSQL database
2. Start backend server: `cd backend && npm start`
3. Start frontend: `cd frontend && npm start`
4. Open browser: http://localhost:3001

## Features

- ✅ Video call between user and agent
- ✅ Document capture and OCR
- ✅ Face verification
- ✅ Video recording
- ✅ Session management
- ✅ PDF/Excel export

## Troubleshooting

### Database Connection Error
- Check PostgreSQL is running
- Verify database credentials in .env

### AWS Errors
- Verify AWS credentials
- Check IAM permissions
- Ensure S3 bucket exists

### WebRTC Not Working
- Check browser permissions for camera/mic
- Verify Socket.io connection
- Check firewall settings

## Production Deployment

1. Update all default passwords
2. Use strong JWT secret
3. Enable HTTPS
4. Configure CORS properly
5. Set up proper logging
6. Use environment-specific configurations

