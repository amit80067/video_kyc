# AWS Setup Guide - Video KYC System

## AWS Services Required

Aapko **2 main AWS services** chahiye:

1. **Amazon S3** - Video recordings aur document images store karne ke liye
2. **Amazon Rekognition** - Face verification aur face detection ke liye

---

## Step-by-Step AWS Setup

### Step 1: AWS Account Create Karein

1. AWS Console mein login karein: https://aws.amazon.com/console/
2. Agar account nahi hai to create karein (credit card required)

---

### Step 2: S3 Bucket Create Karein

#### 2.1 S3 Bucket Create

1. AWS Console mein **S3** service pe jao
2. **"Create bucket"** button click karo
3. Settings:
   - **Bucket name**: `video-kyc-storage` (unique name, aapka choice)
   - **Region**: `us-east-1` (ya aapka preferred region)
   - **Block Public Access**: ✅ **ENABLE** (private bucket, security ke liye)
   - **Versioning**: Optional (enable kar sakte ho)
   - **Encryption**: ✅ **Enable** (SSE-S3 recommended)
4. **Create bucket** click karo

#### 2.2 S3 Bucket Structure

Bucket mein ye folders automatically create honge:
```
video-kyc-storage/
├── documents/
│   └── {sessionId}/
│       └── {timestamp}-{filename}
├── recordings/
│   └── {sessionId}/
│       └── {uuid}.webm
└── temp/ (if needed)
```

---

### Step 3: IAM User Create Karein (API Access)

#### 3.1 IAM User Create

1. AWS Console mein **IAM** service pe jao
2. **Users** → **Add users** click karo
3. Settings:
   - **User name**: `video-kyc-api-user`
   - **Access type**: ✅ **Programmatic access** (API keys ke liye)
4. **Next: Permissions** click karo

#### 3.2 Permissions Attach Karein

**Option 1: Custom Policy (Recommended)**

1. **"Attach policies directly"** select karo
2. **"Create policy"** click karo
3. **JSON** tab mein ye policy paste karo:

```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Action": [
                "s3:PutObject",
                "s3:GetObject",
                "s3:DeleteObject",
                "s3:ListBucket",
                "s3:HeadObject"
            ],
            "Resource": [
                "arn:aws:s3:::video-kyc-storage",
                "arn:aws:s3:::video-kyc-storage/*"
            ]
        },
        {
            "Effect": "Allow",
            "Action": [
                "rekognition:CompareFaces",
                "rekognition:DetectFaces",
                "rekognition:DetectLabels"
            ],
            "Resource": "*"
        }
    ]
}
```

4. **Policy name**: `VideoKYC-Policy`
5. **Create policy** click karo
6. Wapas **Add users** page pe jao
7. **Refresh** karo aur **VideoKYC-Policy** select karo

**Option 2: AWS Managed Policies (Simple)**

Agar custom policy nahi banana chahte, to ye managed policies attach karo:
- `AmazonS3FullAccess` (S3 ke liye)
- `AmazonRekognitionFullAccess` (Rekognition ke liye)

⚠️ **Note**: Full access policies production mein use mat karo, security risk hai.

#### 3.3 Access Keys Generate Karein

1. **Next: Tags** (optional, skip kar sakte ho)
2. **Next: Review** → **Create user**
3. **Important**: Access keys save karo:
   - **Access Key ID**: Copy karo
   - **Secret Access Key**: Copy karo (ye sirf ek baar dikhega!)

⚠️ **Security**: Access keys ko safe jagah save karo, backend `.env` file mein use karenge.

---

### Step 4: AWS Rekognition Setup

Rekognition ke liye **kuch extra setup nahi chahiye**. IAM permissions se hi kaam chal jayega.

**Rekognition APIs jo use ho rahi hain:**
- `CompareFaces` - Face matching
- `DetectFaces` - Face detection

---

## Required AWS APIs/Permissions

### S3 APIs (Required)

| API Action | Purpose | Used In |
|------------|---------|---------|
| `s3:PutObject` | Files upload karna | Document & video upload |
| `s3:GetObject` | Files download karna | File access |
| `s3:DeleteObject` | Files delete karna | Cleanup |
| `s3:ListBucket` | Bucket list karna | File management |
| `s3:HeadObject` | File exists check | File validation |

### Rekognition APIs (Required)

| API Action | Purpose | Used In |
|------------|---------|---------|
| `rekognition:CompareFaces` | Face matching | Face verification |
| `rekognition:DetectFaces` | Face detection | Face detection |

---

## Backend Configuration

### .env File Mein Add Karein

```env
# AWS Configuration
AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE
AWS_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY
AWS_REGION=us-east-1
S3_BUCKET_NAME=video-kyc-storage
```

**Replace karo:**
- `AWS_ACCESS_KEY_ID` - IAM user ka Access Key ID
- `AWS_SECRET_ACCESS_KEY` - IAM user ka Secret Access Key
- `AWS_REGION` - Aapka bucket region
- `S3_BUCKET_NAME` - Aapka bucket name

---

## Cost Estimation (Approximate)

### S3 Storage
- **Storage**: ₹0.023 per GB/month (first 50 GB free)
- **PUT requests**: ₹0.005 per 1,000 requests
- **GET requests**: ₹0.0004 per 1,000 requests

**Example**: 
- 100 GB storage = ₹2.30/month
- 10,000 uploads = ₹0.05
- **Total**: ~₹2.35/month

### Rekognition
- **Face comparison**: ₹0.001 per image (first 5,000 free/month)
- **Face detection**: ₹0.001 per image (first 5,000 free/month)

**Example**:
- 1,000 face comparisons = ₹1.00
- 1,000 face detections = ₹1.00
- **Total**: ~₹2.00/month

### Total Estimated Cost
- **Low usage** (100 sessions/month): ~₹500-1,000/month
- **Medium usage** (1,000 sessions/month): ~₹3,000-5,000/month
- **High usage** (10,000 sessions/month): ~₹25,000-30,000/month

⚠️ **Note**: Actual cost usage ke hisaab se vary hoga.

---

## Security Best Practices

1. ✅ **Never commit** `.env` file to Git
2. ✅ **Use IAM roles** instead of access keys (if possible)
3. ✅ **Rotate access keys** regularly (every 90 days)
4. ✅ **Enable S3 encryption** (already enabled in setup)
5. ✅ **Use signed URLs** for file access (already implemented)
6. ✅ **Set up CloudWatch** for monitoring (optional)
7. ✅ **Enable MFA** on AWS account

---

## Testing AWS Connection

### Test Script

Backend mein test karne ke liye:

```javascript
// test-aws.js
const AWS = require('aws-sdk');
require('dotenv').config();

AWS.config.update({
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    region: process.env.AWS_REGION
});

const s3 = new AWS.S3();
const rekognition = new AWS.Rekognition();

// Test S3
s3.listBuckets((err, data) => {
    if (err) {
        console.error('S3 Error:', err);
    } else {
        console.log('S3 Connected! Buckets:', data.Buckets.map(b => b.Name));
    }
});

// Test Rekognition (simple test)
console.log('Rekognition service initialized');
```

Run karo: `node test-aws.js`

---

## Troubleshooting

### Error: "Access Denied"
- ✅ IAM permissions check karo
- ✅ Bucket name correct hai ya nahi
- ✅ Region correct hai ya nahi

### Error: "Bucket not found"
- ✅ Bucket name check karo
- ✅ Region check karo
- ✅ Bucket exists hai ya nahi

### Error: "Invalid credentials"
- ✅ Access Key ID check karo
- ✅ Secret Access Key check karo
- ✅ Keys expire to nahi ho gaye

---

## Summary

**Aapko chahiye:**
1. ✅ **S3 Bucket** - 1 bucket (private, encrypted)
2. ✅ **IAM User** - 1 user with API access
3. ✅ **IAM Policy** - S3 aur Rekognition permissions
4. ✅ **Access Keys** - Access Key ID aur Secret Access Key

**Total setup time**: 15-20 minutes

**Cost**: ~₹500-5,000/month (usage ke hisaab se)

---

## Quick Checklist

- [ ] AWS Account created
- [ ] S3 Bucket created (private, encrypted)
- [ ] IAM User created
- [ ] IAM Policy attached (S3 + Rekognition permissions)
- [ ] Access Keys generated aur saved
- [ ] Backend `.env` file mein credentials add kiye
- [ ] Test connection successful

---

**Setup complete hone ke baad system ready hai!** 🎉

