# AWS S3 aur Rekognition Setup Guide

## Step 1: AWS Console mein IAM User Create Karein

1. **AWS Console** mein login karein: https://console.aws.amazon.com
2. **IAM** service pe jayein
3. **Users** section mein jayein
4. **Create user** button click karein

## Step 2: User Details

- **User name**: `video-kyc-service` (ya kuch bhi naam)
- **Access type**: **Programmatic access** select karein (API access ke liye)

## Step 3: Permissions Attach Karein

### Option 1: Custom Policy (Recommended - Minimum Permissions)

**Policy Name**: `VideoKYCServicePolicy`

**Policy JSON**:
```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Sid": "S3BucketAccess",
            "Effect": "Allow",
            "Action": [
                "s3:PutObject",
                "s3:GetObject",
                "s3:DeleteObject",
                "s3:ListBucket",
                "s3:PutObjectAcl"
            ],
            "Resource": [
                "arn:aws:s3:::video-kyc1",
                "arn:aws:s3:::video-kyc1/*"
            ]
        },
        {
            "Sid": "RekognitionAccess",
            "Effect": "Allow",
            "Action": [
                "rekognition:CompareFaces",
                "rekognition:DetectFaces",
                "rekognition:DetectLabels",
                "rekognition:DetectText"
            ],
            "Resource": "*"
        }
    ]
}
```

### Option 2: AWS Managed Policies (Easier but More Permissions)

Attach these managed policies:
- `AmazonS3FullAccess` (ya `AmazonS3ReadWriteAccess` - agar specific bucket ke liye)
- `AmazonRekognitionFullAccess` (ya `AmazonRekognitionReadOnlyAccess` - agar sirf read chahiye)

**Note**: Agar specific bucket ke liye sirf access chahiye, to custom policy better hai.

## Step 4: S3 Bucket Create Karein (Agar nahi hai)

1. **S3** service mein jayein
2. **Create bucket** click karein
3. **Bucket name**: `videokyc1` (ya kuch bhi unique naam)
4. **Region**: `ap-south-1` (Mumbai) - ya apne region ke according
5. **Block Public Access**: Settings ko adjust karein (agar public access chahiye)
6. **Create bucket**

### Bucket Permissions Setup

Bucket ke **Permissions** tab mein:
- **Bucket policy** add karein (agar public access chahiye):

```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Sid": "PublicReadGetObject",
            "Effect": "Allow",
            "Principal": "*",
            "Action": "s3:GetObject",
            "Resource": "arn:aws:s3:::videokyc1/*"
        }
    ]
}
```

Ya phir **CORS configuration** add karein:

```json
[
    {
        "AllowedHeaders": [
            "*"
        ],
        "AllowedMethods": [
            "GET",
            "PUT",
            "POST",
            "DELETE",
            "HEAD"
        ],
        "AllowedOrigins": [
            "https://kyc.virtualinvestigation.xyz",
            "https://backend.virtualinvestigation.xyz"
        ],
        "ExposeHeaders": [
            "ETag"
        ],
        "MaxAgeSeconds": 3000
    }
]
```

## Step 5: Access Keys Generate Karein

1. IAM user create karne ke baad, **Access key ID** aur **Secret access key** mil jayega
2. **Important**: Secret key ko save kar lein (dubara nahi dikhega)

## Step 6: .env File Mein Add Karein

Backend `.env` file mein yeh add karein:

```env
AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE
AWS_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY
AWS_REGION=ap-south-1
S3_BUCKET_NAME=videokyc1
```

**Note**: Example keys hain, apne actual keys use karein!

## Step 7: Rekognition Service Enable Karein

1. AWS Console mein **Rekognition** service pe jayein
2. Service automatically enable ho jayega (first time use pe)
3. Koi extra setup nahi chahiye

## Required Permissions Summary

### S3 Permissions:
- ✅ `s3:PutObject` - Files upload karne ke liye
- ✅ `s3:GetObject` - Files read karne ke liye
- ✅ `s3:DeleteObject` - Files delete karne ke liye
- ✅ `s3:ListBucket` - Bucket contents list karne ke liye
- ✅ `s3:PutObjectAcl` - Object permissions set karne ke liye

### Rekognition Permissions:
- ✅ `rekognition:CompareFaces` - Face comparison ke liye
- ✅ `rekognition:DetectFaces` - Face detection ke liye
- ✅ `rekognition:DetectLabels` - Image labels detect karne ke liye
- ✅ `rekognition:DetectText` - Text detection (OCR) ke liye

## Security Best Practices

1. ✅ **Never commit** `.env` file to git
2. ✅ **Rotate keys** regularly (every 90 days)
3. ✅ **Use IAM roles** instead of access keys (agar EC2 use kar rahe ho)
4. ✅ **Minimum permissions** principle follow karein
5. ✅ **Enable MFA** on IAM user (agar possible ho)

## Testing

Backend restart karein aur test karein:

```bash
cd /home/ubuntu/video_kyc/backend
npm start
```

Agar credentials sahi hain, to koi error nahi aayega.

## Troubleshooting

### Error: "Access Denied"
- Check karein ki IAM user ko sahi permissions hain
- Bucket name sahi hai ya nahi
- Region sahi hai ya nahi

### Error: "Bucket does not exist"
- Bucket create karein
- Bucket name `.env` file mein sahi hai ya nahi check karein

### Error: "Invalid credentials"
- Access key ID aur Secret key sahi hain ya nahi check karein
- Keys expire nahi hue hain check karein

