# AWS Policies Setup - Important Instructions

## ⚠️ Important: Do NOT confuse IAM Policy aur S3 Bucket Policy

### 1. IAM Policy (Identity-Based Policy)
**File**: `aws-iam-policy.json`
**Use**: IAM User/Role ke liye
**Where to add**: AWS IAM Console > Policies > Create Policy > JSON tab
**Important**: ❌ Principal field NAHI chahiye!

**Correct IAM Policy** (already in `aws-iam-policy.json`):
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

### 2. S3 Bucket Policy (Resource-Based Policy)
**File**: `s3-bucket-policy.json`
**Use**: S3 Bucket ke liye (public access ke liye)
**Where to add**: AWS S3 Console > Bucket > Permissions > Bucket Policy
**Important**: ✅ Principal field CHAHIYE (yeh bucket policy hai, IAM policy nahi!)

**Correct S3 Bucket Policy** (already in `s3-bucket-policy.json`):
```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Sid": "PublicReadGetObject",
            "Effect": "Allow",
            "Principal": "*",
            "Action": "s3:GetObject",
            "Resource": "arn:aws:s3:::video-kyc1/*"
        }
    ]
}
```

## Step-by-Step Setup

### Step 1: Create IAM Policy (for IAM User)

1. AWS Console > IAM > Policies > **Create policy**
2. **JSON** tab select karein
3. `aws-iam-policy.json` file ka content copy karein
4. Paste karein JSON editor mein
5. **Next** click karein
6. Policy name: `VideoKYCServicePolicy`
7. **Create policy** click karein

### Step 2: Attach Policy to IAM User

1. IAM > Users > Apna user select karein
2. **Add permissions** > **Attach policies directly**
3. `VideoKYCServicePolicy` select karein
4. **Add permissions** click karein

### Step 3: Create S3 Bucket Policy (Optional - for public access)

1. AWS Console > S3 > `video-kyc1` bucket select karein
2. **Permissions** tab pe jayein
3. **Bucket policy** section mein **Edit** click karein
4. `s3-bucket-policy.json` file ka content copy karein
5. Paste karein aur **Save changes** click karein

**Note**: Agar files private rakhni hain (signed URLs use karein), to bucket policy ki zarurat nahi hai.

## Common Mistakes

❌ **Wrong**: IAM policy mein `Principal` field add karna
✅ **Correct**: IAM policy mein sirf `Effect`, `Action`, aur `Resource` fields

❌ **Wrong**: S3 bucket policy ko IAM policy ki tarah use karna
✅ **Correct**: S3 bucket policy ko S3 bucket ke Permissions tab mein add karna

## Summary

| File | Type | Use For | Principal Field? |
|------|------|---------|------------------|
| `aws-iam-policy.json` | IAM Policy | IAM User/Role | ❌ NO |
| `s3-bucket-policy.json` | Bucket Policy | S3 Bucket | ✅ YES |

**Remember**: 
- IAM Policy = User/Role ko permissions deta hai
- Bucket Policy = Bucket ko permissions deta hai (public access ke liye)

