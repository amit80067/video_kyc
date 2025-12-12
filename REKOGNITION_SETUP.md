# Amazon Rekognition Setup - Detailed Guide

## Rekognition Kya Hai?

Amazon Rekognition ek **AI service** hai jo images aur videos mein faces detect aur compare kar sakta hai. Aapke system mein ye use hoga:
- Document photo se face extract karna
- Live video frame se face extract karna  
- Dono faces ko compare karna (match hai ya nahi)

---

## Important: Rekognition Setup

**Good News**: Rekognition ke liye **kuch extra setup nahi chahiye**! 

Rekognition ek **managed service** hai - matlab AWS automatically handle karta hai. Aapko sirf **IAM permissions** dene hain, aur service automatically available ho jayega.

---

## Step-by-Step Setup (AWS Console)

### Step 1: AWS Console Mein Login

1. Browser mein jao: https://aws.amazon.com/console/
2. AWS account se login karo
3. Agar account nahi hai to create karo (credit card required)

---

### Step 2: IAM User Create Karein (Agar pehle se nahi hai)

#### 2.1 IAM Service Open

1. AWS Console ke top mein **"Services"** click karo
2. Search box mein type karo: **"IAM"**
3. **IAM** service pe click karo

#### 2.2 New User Create

1. Left sidebar mein **"Users"** pe click karo
2. **"Add users"** button (top right) pe click karo
3. **User name** enter karo: `video-kyc-api-user`
4. ✅ **"Provide user access to the AWS Management Console"** - **UNCHECK** (ye optional hai)
5. ✅ **"Access key - Programmatic access"** - **CHECK** (ye zaroori hai)
6. **"Next"** button click karo

---

### Step 3: Permissions Attach Karein

#### Option A: Custom Policy (Recommended - Secure)

1. **"Attach policies directly"** select karo
2. **"Create policy"** button click karo (new tab open hoga)

3. **JSON tab** pe click karo
4. Purana content delete karo aur ye policy paste karo:

```json
{
    "Version": "2012-10-17",
    "Statement": [
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

5. **"Next"** button click karo
6. **Policy name** enter karo: `VideoKYC-Rekognition-Policy`
7. **Description** (optional): `Allows face comparison and detection for Video KYC system`
8. **"Create policy"** button click karo

9. Wapas **Add users** tab pe jao
10. **Refresh** button (🔄) click karo
11. Search box mein type karo: `VideoKYC-Rekognition`
12. ✅ **VideoKYC-Rekognition-Policy** checkbox check karo
13. **"Next"** button click karo

#### Option B: AWS Managed Policy (Simple - Less Secure)

1. **"Attach policies directly"** select karo
2. Search box mein type karo: `Rekognition`
3. ✅ **"AmazonRekognitionFullAccess"** checkbox check karo
4. **"Next"** button click karo

⚠️ **Note**: Full access policy production mein use mat karo, security risk hai.

---

### Step 4: Access Keys Generate Karein

1. **"Next: Tags"** pe click karo (tags optional hai, skip kar sakte ho)
2. **"Next: Review"** pe click karo
3. Review karo:
   - User name: `video-kyc-api-user`
   - Access type: Programmatic access
   - Permissions: VideoKYC-Rekognition-Policy (ya AmazonRekognitionFullAccess)
4. **"Create user"** button click karo

5. **⚠️ IMPORTANT**: Ab ye screen dikhega:
   - **Access key ID**: Copy karo (ye baad mein mil sakta hai)
   - **Secret access key**: Copy karo (ye sirf ek baar dikhega!)
   
6. **"Download .csv"** button click karo (keys save karne ke liye)
   Ya manually copy karke safe jagah save karo

7. **"Done"** button click karo

---

### Step 5: Rekognition Service Test Karein (Optional)

#### 5.1 Rekognition Console Mein Check

1. AWS Console ke top mein **"Services"** click karo
2. Search box mein type karo: **"Rekognition"**
3. **Amazon Rekognition** service pe click karo
4. Left sidebar mein **"Use cases"** pe click karo
5. **"Face comparison"** ya **"Face detection"** dekh sakte ho

**Note**: Rekognition console sirf demo/testing ke liye hai. Aapka code directly API use karega.

---

## Backend Configuration

### .env File Mein Add Karein

Aapke backend `.env` file mein ye add karo:

```env
# AWS Configuration
AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE
AWS_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY
AWS_REGION=us-east-1
```

**Replace karo:**
- `AWS_ACCESS_KEY_ID` - Step 4 mein copy kiye gaye Access Key ID
- `AWS_SECRET_ACCESS_KEY` - Step 4 mein copy kiye gaye Secret Access Key
- `AWS_REGION` - Aapka preferred region (us-east-1, ap-south-1, etc.)

---

## Code Mein Kaise Use Hoga

### Aapke Code Mein Already Implemented Hai:

```javascript
// backend/src/config/aws.js
const AWS = require('aws-sdk');

AWS.config.update({
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    region: process.env.AWS_REGION || 'us-east-1'
});

// Rekognition instance automatically create ho jayega
const rekognition = new AWS.Rekognition();
```

### APIs Jo Use Ho Rahi Hain:

1. **CompareFaces** - Face matching
   ```javascript
   rekognition.compareFaces({
       SourceImage: { Bytes: documentImage },
       TargetImage: { Bytes: liveImage },
       SimilarityThreshold: 70
   })
   ```

2. **DetectFaces** - Face detection
   ```javascript
   rekognition.detectFaces({
       Image: { Bytes: image },
       Attributes: ['ALL']
   })
   ```

---

## Rekognition Regions

Rekognition available hai in regions:

- **us-east-1** (N. Virginia) - Recommended
- **us-west-2** (Oregon)
- **eu-west-1** (Ireland)
- **ap-south-1** (Mumbai) - India ke liye best
- **ap-southeast-1** (Singapore)

**India ke liye**: `ap-south-1` (Mumbai) use karo - faster aur cheaper.

---

## Cost/Pricing

### Rekognition Pricing (India - ap-south-1)

1. **Face Comparison** (CompareFaces):
   - First 5,000 images/month: **FREE**
   - After that: **₹0.001 per image** (~$0.001)

2. **Face Detection** (DetectFaces):
   - First 5,000 images/month: **FREE**
   - After that: **₹0.001 per image** (~$0.001)

### Example Cost Calculation

**Scenario**: 1,000 KYC sessions/month
- Face comparisons: 1,000 × 2 = 2,000 (document + live)
- Face detections: 1,000 × 2 = 2,000
- **Total**: 4,000 images/month
- **Cost**: ₹0 (free tier ke andar)

**Scenario**: 10,000 KYC sessions/month
- Face comparisons: 10,000 × 2 = 20,000
- Face detections: 10,000 × 2 = 20,000
- **Total**: 40,000 images/month
- Free tier: 5,000
- Paid: 35,000 images
- **Cost**: 35,000 × ₹0.001 = **₹35/month**

---

## Testing Rekognition

### Test Script Create Karein

Backend folder mein `test-rekognition.js` file create karo:

```javascript
// test-rekognition.js
const AWS = require('aws-sdk');
require('dotenv').config();
const fs = require('fs');

// Configure AWS
AWS.config.update({
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    region: process.env.AWS_REGION || 'ap-south-1'
});

const rekognition = new AWS.Rekognition();

// Test 1: Detect Faces
async function testDetectFaces() {
    try {
        // Test image path (aapki koi test image)
        const imagePath = './test-image.jpg';
        
        if (!fs.existsSync(imagePath)) {
            console.log('⚠️ Test image not found. Create a test image first.');
            return;
        }

        const image = fs.readFileSync(imagePath);
        
        const params = {
            Image: {
                Bytes: image
            },
            Attributes: ['ALL']
        };

        const result = await rekognition.detectFaces(params).promise();
        
        console.log('✅ Face Detection Test:');
        console.log('Faces detected:', result.FaceDetails.length);
        
        if (result.FaceDetails.length > 0) {
            console.log('Face details:', JSON.stringify(result.FaceDetails[0], null, 2));
        }
    } catch (error) {
        console.error('❌ Face Detection Error:', error.message);
    }
}

// Test 2: Compare Faces (2 images chahiye)
async function testCompareFaces() {
    try {
        const image1Path = './test-image1.jpg';
        const image2Path = './test-image2.jpg';
        
        if (!fs.existsSync(image1Path) || !fs.existsSync(image2Path)) {
            console.log('⚠️ Test images not found. Need 2 images for comparison.');
            return;
        }

        const image1 = fs.readFileSync(image1Path);
        const image2 = fs.readFileSync(image2Path);
        
        const params = {
            SourceImage: {
                Bytes: image1
            },
            TargetImage: {
                Bytes: image2
            },
            SimilarityThreshold: 70
        };

        const result = await rekognition.compareFaces(params).promise();
        
        console.log('\n✅ Face Comparison Test:');
        if (result.FaceMatches && result.FaceMatches.length > 0) {
            console.log('✅ Faces match!');
            console.log('Similarity:', result.FaceMatches[0].Similarity + '%');
        } else {
            console.log('❌ Faces do not match');
        }
    } catch (error) {
        console.error('❌ Face Comparison Error:', error.message);
    }
}

// Run tests
console.log('Testing Amazon Rekognition...\n');
testDetectFaces().then(() => {
    testCompareFaces();
});
```

### Test Run Karein

```bash
cd backend
node test-rekognition.js
```

---

## Troubleshooting

### Error: "User is not authorized to perform: rekognition:CompareFaces"

**Solution**:
1. IAM user ke permissions check karo
2. Policy properly attach hui hai ya nahi
3. Policy mein `rekognition:CompareFaces` permission hai ya nahi

### Error: "Invalid credentials"

**Solution**:
1. `.env` file mein Access Key ID check karo
2. Secret Access Key correct hai ya nahi
3. Keys expire to nahi ho gaye

### Error: "Region not supported"

**Solution**:
1. Rekognition supported region use karo
2. India ke liye: `ap-south-1` (Mumbai)
3. Ya `us-east-1` (N. Virginia)

### Error: "Image too large"

**Solution**:
1. Image size 15MB se kam honi chahiye
2. Image format: JPEG, PNG
3. Image resolution: 4096x4096 pixels se kam

---

## Security Best Practices

1. ✅ **Never commit** `.env` file to Git
2. ✅ **Use IAM roles** instead of access keys (if EC2/ECS use kar rahe ho)
3. ✅ **Rotate access keys** regularly (every 90 days)
4. ✅ **Use least privilege** - sirf required permissions do
5. ✅ **Enable CloudWatch** for monitoring API calls
6. ✅ **Set up billing alerts** - unexpected costs se bachne ke liye

---

## Summary Checklist

- [ ] AWS Account created
- [ ] IAM User created (`video-kyc-api-user`)
- [ ] Rekognition permissions attached (CompareFaces, DetectFaces)
- [ ] Access Keys generated aur saved
- [ ] Backend `.env` file mein credentials add kiye
- [ ] Region set kiya (`ap-south-1` for India)
- [ ] Test script run kiya (optional)
- [ ] Rekognition working ✅

---

## Quick Reference

**Rekognition Setup = IAM Permissions Only**

1. IAM User create karo
2. Rekognition permissions attach karo
3. Access keys generate karo
4. Backend `.env` mein add karo
5. **Done!** Rekognition automatically available hai

**No extra setup needed!** 🎉

---

## Next Steps

1. ✅ Rekognition setup complete
2. ✅ S3 bucket setup (separate guide)
3. ✅ Backend `.env` configure karo
4. ✅ Test karo
5. ✅ Production mein deploy karo

---

**Rekognition setup complete! Ab aap face verification use kar sakte ho.** 🚀

