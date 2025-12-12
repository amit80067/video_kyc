# AWS Setup - Step by Step Guide

## S3 Bucket Create Karne Ke Steps

### Step 1: AWS Console Mein Login

1. Browser mein jao: **https://aws.amazon.com/console/**
2. **"Sign In to the Console"** button click karo
3. AWS account credentials se login karo
4. Agar account nahi hai to **"Create a new AWS account"** click karo

---

### Step 2: S3 Service Open Karein

1. AWS Console ke **top left corner** mein **"Services"** dropdown click karo
2. Search box mein type karo: **"S3"**
3. **"S3"** service pe click karo
   - Ya directly: https://s3.console.aws.amazon.com/

---

### Step 3: S3 Bucket Create Karein

1. S3 dashboard mein **"Create bucket"** button (top right) pe click karo

2. **General configuration** section:
   - **Bucket name**: `videokyc1` ✅
     - ⚠️ **Important**: Name globally unique hona chahiye
   - **AWS Region**: Dropdown se select karo
     - ✅ **Mumbai, India**: `Asia Pacific (Mumbai) ap-south-1` ✅

3. **Object Ownership** section:
   - ✅ **"ACLs disabled (recommended)"** select karo
   - Ya **"ACLs enabled"** (agar chahiye)

4. **Block Public Access settings** section:
   - ✅ **"Block all public access"** - **CHECKED** (security ke liye)
   - ✅ Sabhi 4 checkboxes checked rahengi:
     - Block public access to buckets and objects granted through new access control lists (ACLs)
     - Block public access to buckets and objects granted through any access control lists (ACLs)
     - Block public access to buckets and objects granted through new public bucket or access point policies
     - Block public and cross-account access to buckets and objects through any public bucket or access point policies

5. **Bucket Versioning** section (optional):
   - **"Enable"** ya **"Disable"** (recommended: Disable for now)

6. **Default encryption** section:
   - ✅ **"Enable"** select karo
   - **Encryption type**: **"Amazon S3 managed keys (SSE-S3)"** select karo
   - ✅ **"Bucket Key"** enable karo (cost saving ke liye)

7. **Advanced settings** section (optional):
   - Object Lock: **Disable** (default)
   - Tags: Optional (skip kar sakte ho)

8. **"Create bucket"** button click karo

9. ✅ Success message dikhega: **"Successfully created bucket 'videokyc1'"**

---

### Step 4: S3 Bucket Verify Karein

1. S3 dashboard mein aapka bucket dikhega
2. Bucket name pe click karo
3. **"Properties"** tab check karo:
   - Region: `ap-south-1` (ya jo aapne select kiya)
   - Encryption: Enabled
   - Block public access: On

✅ **S3 Bucket Setup Complete!**

---

## Rekognition Service Setup - Step by Step

### Important: Rekognition Service Create Nahi Karna Padta!

**Good News**: Rekognition ek **managed service** hai - matlab AWS automatically provide karta hai. Aapko sirf **IAM permissions** dene hain.

---

### Step 1: IAM Service Open Karein

1. AWS Console ke top mein **"Services"** click karo
2. Search box mein type karo: **"IAM"**
3. **"IAM"** service pe click karo
   - Ya directly: https://console.aws.amazon.com/iam/

---

### Step 2: IAM User Create Karein

1. Left sidebar mein **"Users"** pe click karo
2. **"Add users"** button (top right) pe click karo

3. **User details** section:
   - **User name**: `video-kyc-api-user` (ya aapka choice)
   - ✅ **"Provide user access to the AWS Management Console"** - **UNCHECK** (optional)
   - ✅ **"Access key - Programmatic access"** - **CHECK** (zaroori hai)
   - **"Next"** button click karo

---

### Step 3: Permissions Attach Karein

#### Option A: Custom Policy (Recommended - Secure)

1. **"Attach policies directly"** radio button select karo

2. **"Create policy"** button click karo (new tab open hoga)

3. **JSON tab** pe click karo

4. Purana content delete karo aur ye **complete policy** paste karo:

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
                "arn:aws:s3:::videokyc1",
                "arn:aws:s3:::videokyc1/*"
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

✅ **Bucket name**: `videokyc1` (already set)

5. **"Next"** button click karo

6. **Policy details** section:
   - **Policy name**: `VideoKYC-Policy`
   - **Description** (optional): `Policy for Video KYC system - S3 and Rekognition access`

7. **"Create policy"** button click karo

8. ✅ Success message: **"Policy VideoKYC-Policy created successfully"**

9. **Wapas "Add users" tab** pe jao (browser tab switch karo)

10. **Refresh** button (🔄) click karo

11. Search box mein type karo: `VideoKYC`

12. ✅ **"VideoKYC-Policy"** checkbox check karo

13. **"Next"** button click karo

#### Option B: AWS Managed Policies (Simple - Less Secure)

1. **"Attach policies directly"** select karo

2. Search box mein type karo: `S3`
   - ✅ **"AmazonS3FullAccess"** checkbox check karo

3. Search box mein type karo: `Rekognition`
   - ✅ **"AmazonRekognitionFullAccess"** checkbox check karo

4. **"Next"** button click karo

---

### Step 4: Tags (Optional)

1. **"Next: Tags"** pe click karo
2. Tags add kar sakte ho (optional)
3. Ya directly **"Next: Review"** click karo

---

### Step 5: Review & Create User

1. **Review** section mein check karo:
   - User name: `video-kyc-api-user`
   - Access type: Programmatic access
   - Permissions: VideoKYC-Policy (ya jo aapne select kiya)

2. **"Create user"** button click karo

---

### Step 6: Access Keys Save Karein

⚠️ **CRITICAL STEP**: Ye step sirf ek baar dikhega!

1. **Success screen** dikhega with:
   - ✅ **Access key ID**: Copy karo (ye baad mein bhi mil sakta hai)
   - ⚠️ **Secret access key**: Copy karo (ye sirf ek baar dikhega!)

2. **"Download .csv"** button click karo (recommended)
   - File download hogi: `credentials.csv`
   - Is file ko safe jagah save karo

3. Ya manually copy karke safe jagah save karo:
   - Access key ID: `AKIAIOSFODNN7EXAMPLE`
   - Secret access key: `wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY`

4. **"Done"** button click karo

✅ **IAM User Setup Complete!**

---

## Backend Configuration

### Step 7: Backend .env File Mein Add Karein

1. Backend folder mein jao: `cd backend`

2. `.env` file create karo (agar nahi hai):
   ```bash
   touch .env
   ```

3. `.env` file mein ye add karo:

```env
# AWS Configuration
AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE
AWS_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY
AWS_REGION=ap-south-1
S3_BUCKET_NAME=videokyc1
```

4. **Replace karo**:
   - `AWS_ACCESS_KEY_ID` - Step 6 mein copy kiye gaye Access Key ID
   - `AWS_SECRET_ACCESS_KEY` - Step 6 mein copy kiye gaye Secret Access Key
   - `AWS_REGION` - Aapka selected region (`ap-south-1` for Mumbai)
   - `S3_BUCKET_NAME` - Aapka bucket name

---

## Testing Setup

### Step 8: Test Script Create Karein

1. Backend folder mein `test-aws-setup.js` file create karo:

```javascript
// test-aws-setup.js
const AWS = require('aws-sdk');
require('dotenv').config();

// Configure AWS
AWS.config.update({
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    region: process.env.AWS_REGION || 'ap-south-1'
});

const s3 = new AWS.S3();
const rekognition = new AWS.Rekognition();

console.log('Testing AWS Setup...\n');

// Test 1: S3 Connection
s3.listBuckets((err, data) => {
    if (err) {
        console.error('❌ S3 Error:', err.message);
    } else {
        console.log('✅ S3 Connected!');
        console.log('Buckets:', data.Buckets.map(b => b.Name));
        
        // Check if our bucket exists
        const bucketName = process.env.S3_BUCKET_NAME;
        const bucketExists = data.Buckets.some(b => b.Name === bucketName);
        
        if (bucketExists) {
            console.log(`✅ Bucket "${bucketName}" found!`);
        } else {
            console.log(`⚠️ Bucket "${bucketName}" not found. Please create it.`);
        }
    }
});

// Test 2: Rekognition Service
console.log('\n✅ Rekognition service initialized');
console.log('Region:', process.env.AWS_REGION || 'ap-south-1');

// Test 3: Check credentials
if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) {
    console.log('✅ AWS Credentials found');
} else {
    console.log('❌ AWS Credentials missing in .env file');
}
```

2. Test run karo:

```bash
cd backend
node test-aws-setup.js
```

3. Expected output:
```
Testing AWS Setup...

✅ S3 Connected!
Buckets: [ 'videokyc1', ... ]
✅ Bucket "videokyc1" found!

✅ Rekognition service initialized
Region: ap-south-1

✅ AWS Credentials found
```

---

## Complete Checklist

### S3 Bucket:
- [ ] AWS Console mein login kiya
- [ ] S3 service open kiya
- [ ] Bucket create kiya (name: `videokyc1`)
- [ ] Region select kiya (`ap-south-1` for Mumbai)
- [ ] Block public access enabled
- [ ] Encryption enabled
- [ ] Bucket successfully created ✅

### IAM User & Permissions:
- [ ] IAM service open kiya
- [ ] User create kiya (`video-kyc-api-user`)
- [ ] Programmatic access enabled
- [ ] Custom policy create kiya (S3 + Rekognition)
- [ ] Policy attach kiya
- [ ] Access keys generated
- [ ] Access keys saved (CSV file) ✅

### Backend Configuration:
- [ ] Backend `.env` file create kiya
- [ ] AWS_ACCESS_KEY_ID add kiya
- [ ] AWS_SECRET_ACCESS_KEY add kiya
- [ ] AWS_REGION add kiya (`ap-south-1`)
- [ ] S3_BUCKET_NAME add kiya
- [ ] Test script run kiya
- [ ] All tests passed ✅

---

## Troubleshooting

### Error: "Bucket name already exists"
**Solution**: Different unique name use karo (e.g., `videokyc1-2024`)

### Error: "Access Denied" S3 mein
**Solution**: IAM policy check karo - bucket name correct hai ya nahi

### Error: "Invalid credentials"
**Solution**: `.env` file mein credentials check karo - exact copy kiya hai ya nahi

### Error: "Region not supported"
**Solution**: Valid region code use karo (`ap-south-1`, `us-east-1`, etc.)

---

## Summary

### S3 Bucket Create:
1. AWS Console → S3 → Create bucket
2. Name: `videokyc1`
3. Region: `ap-south-1` (Mumbai)
4. Block public access: ON
5. Encryption: ON
6. Create bucket ✅

### Rekognition Setup:
1. AWS Console → IAM → Users → Add user
2. User name: `video-kyc-api-user`
3. Programmatic access: Enable
4. Create policy (S3 + Rekognition permissions)
5. Attach policy
6. Generate access keys
7. Save keys ✅

### Backend Config:
1. `.env` file create
2. Access keys add
3. Region add
4. Bucket name add
5. Test ✅

**Setup Complete!** 🎉

