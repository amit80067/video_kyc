# Video KYC Verification System

Complete video KYC verification system with WebRTC video calls, OCR, face verification, and bank export functionality.

## Technology Stack

### Frontend
- React.js - User interface and agent dashboard
- Socket.io-client - Real-time communication
- WebRTC - Video call functionality
- Material-UI - UI components

### Backend
- Node.js + Express - API server
- Socket.io - WebRTC signaling server
- PostgreSQL - Main database
- Tesseract.js - OCR for document text extraction
- AWS Rekognition - Face verification & liveness detection
- AWS S3 - Video recordings and document images storage

## Project Structure

```
video-kyc/
├── frontend/          # React frontend application
├── backend/           # Node.js backend server
├── database/          # Database migrations
└── README.md
```

## Setup Instructions

### Prerequisites
- Node.js (v16 or higher)
- PostgreSQL (v12 or higher)
- AWS Account (for Rekognition and S3)

### Backend Setup

1. Navigate to backend directory:
```bash
cd backend
```

2. Install dependencies:
```bash
npm install
```

3. Create `.env` file:
```env
PORT=3000
DB_HOST=localhost
DB_PORT=5432
DB_NAME=video_kyc
DB_USER=postgres
DB_PASSWORD=your_password
JWT_SECRET=your_jwt_secret
AWS_ACCESS_KEY_ID=your_aws_access_key
AWS_SECRET_ACCESS_KEY=your_aws_secret_key
AWS_REGION=ap-south-1
S3_BUCKET_NAME=videokyc1
```

4. Run database migrations:
```bash
psql -U postgres -d video_kyc -f database/migrations/initial_schema.sql
```

5. Start server:
```bash
npm start
# or for development
npm run dev
```

### Frontend Setup

1. Navigate to frontend directory:
```bash
cd frontend
```

2. Install dependencies:
```bash
npm install
```

3. Create `.env` file:
```env
REACT_APP_API_URL=http://localhost:3000
REACT_APP_SOCKET_URL=http://localhost:3000
```

4. Start development server:
```bash
npm start
```

## Features

- Video call between user and agent using WebRTC
- Document capture and OCR extraction
- Face verification using AWS Rekognition
- Video recording and storage
- Admin dashboard for session management
- PDF and Excel export for bank submission

## API Endpoints

### Session Management
- `POST /api/sessions` - Create new KYC session
- `GET /api/sessions/:sessionId` - Get session details
- `PUT /api/sessions/:sessionId/status` - Update session status

### Document Processing
- `POST /api/documents/upload` - Upload document image
- `POST /api/documents/ocr` - Process OCR on document
- `POST /api/documents/verify-face` - Verify face match

### Export
- `GET /api/export/pdf/:sessionId` - Generate PDF report
- `GET /api/export/excel` - Generate Excel export

## License

ISC

