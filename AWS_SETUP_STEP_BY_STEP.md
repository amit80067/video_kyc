# AWS Setup - Step by Step Guide (Hindi/Hinglish)

## ⚠️ IMPORTANT: 3 Alag Files, 3 Alag Jagah Use Hoti Hain!

### File 1: `aws-iam-policy.json` 
**Kahan use karein**: AWS IAM Console > Policies > Create Policy
**Kya hai**: IAM User ko permissions dene ke liye
**Principal field**: ❌ NAHI CHAHIYE

### File 2: `s3-bucket-policy.json`
**Kahan use karein**: AWS S3 Console > Bucket > Permissions > Bucket Policy
**Kya hai**: S3 Bucket ko public access dene ke liye (optional)
**Principal field**: ✅ CHAHIYE (yeh bucket policy hai)

### File 3: `s3-cors-config.json`
**Kahan use karein**: AWS S3 Console > Bucket > Permissions > CORS
**Kya hai**: CORS settings (browser se direct access ke liye)
**Principal field**: ❌ NAHI CHAHIYE (yeh CORS config hai, policy nahi)

---

## Step 1: IAM Policy Create Karein (IMPORTANT!)

### ✅ Correct Way:

1. **AWS Console** > **IAM** > **Policies** > **Create policy**
2. **JSON** tab select karein
3. **Sirf yeh content paste karein** (from `aws-iam-policy.json`):

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

4. **Next** click karein
5. Policy name: `VideoKYCServicePolicy`
6. **Create policy** click karein

### ❌ Wrong Things (Mat Karein):

- ❌ `s3-bucket-policy.json` ko IAM policy mein paste mat karein (Principal field error dega)
- ❌ `s3-cors-config.json` ko IAM policy mein paste mat karein (yeh CORS config hai)
- ❌ Principal field IAM policy mein add mat karein

---

## Step 2: IAM User Create Karein

1. **IAM** > **Users** > **Create user**
2. User name: `video-kyc-service`
3. **Programmatic access** select karein
4. **Next: Permissions**
5. **Attach policies directly** select karein
6. `VideoKYCServicePolicy` search karein aur select karein
7. **Next** > **Create user**
8. **Access Key ID** aur **Secret Access Key** copy karein (dubara nahi dikhega!)

---

## Step 3: Access Keys .env Mein Add Karein

Backend `.env` file mein add karein:

```env
AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE
AWS_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY
AWS_REGION=ap-south-1
S3_BUCKET_NAME=video-kyc1
```

---

## Step 4: S3 Bucket Create Karein (Agar nahi hai)

1. **S3** > **Create bucket**
2. Bucket name: `video-kyc1`
3. Region: `ap-south-1` (Mumbai)
4. **Create bucket**

---

## Step 5: S3 Bucket Policy Add Karein (Optional - Public Access ke liye)

**Note**: Agar files private rakhni hain (signed URLs use karein), to yeh step skip karein.

1. **S3** > `video-kyc1` bucket > **Permissions** tab
2. **Bucket policy** section > **Edit**
3. `s3-bucket-policy.json` file ka content paste karein:

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

4. **Save changes**

---

## Step 6: S3 CORS Configuration Add Karein

1. **S3** > `video-kyc1` bucket > **Permissions** tab
2. **Cross-origin resource sharing (CORS)** section > **Edit**
3. `s3-cors-config.json` file ka content paste karein:

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
            "https://backend.virtualinvestigation.xyz",
            "http://localhost:3000",
            "http://localhost:8005"
        ],
        "ExposeHeaders": [
            "ETag"
        ],
        "MaxAgeSeconds": 3000
    }
]
```

4. **Save changes**

---

## Summary Table

| File | Kahan Use Karein | Principal Field? | Purpose |
|------|------------------|-------------------|---------|
| `aws-iam-policy.json` | IAM > Policies > Create Policy | ❌ NO | IAM User ko permissions |
| `s3-bucket-policy.json` | S3 > Bucket > Permissions > Bucket Policy | ✅ YES | Bucket public access |
| `s3-cors-config.json` | S3 > Bucket > Permissions > CORS | ❌ NO | CORS settings |

---

## Common Errors aur Solutions

### Error: "Has prohibited field Principal"
**Solution**: IAM policy mein Principal field nahi chahiye. Sirf `aws-iam-policy.json` use karein.

### Error: "Invalid JSON"
**Solution**: CORS config ko IAM policy mein paste mat karein. CORS config sirf S3 bucket ke CORS settings mein add karein.

### Error: "Access Denied"
**Solution**: 
- IAM user ko policy attach ki hai ya nahi check karein
- Access keys sahi hain ya nahi check karein
- Bucket name `.env` file mein sahi hai ya nahi check karein

---

## Testing

Backend restart karein:

```bash
cd /home/ubuntu/video_kyc/backend
npm start
```

Agar sab sahi hai, to koi error nahi aayega.

