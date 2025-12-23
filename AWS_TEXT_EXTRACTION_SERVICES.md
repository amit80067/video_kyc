# AWS Document Text Extraction Services

## AWS Services for Text Extraction

### 1. **Amazon Textract** (Recommended for Documents) ⭐
**Best for**: Forms, tables, invoices, ID cards, structured documents
**Features**:
- ✅ Forms aur tables detect karta hai
- ✅ Key-value pairs extract karta hai
- ✅ Handwritten text bhi detect karta hai
- ✅ High accuracy
- ✅ Structured data return karta hai

**Use Cases**:
- Aadhaar card, PAN card extraction
- Forms processing
- Invoice processing
- Table data extraction

**Pricing**: Pay per page (first 1000 pages/month free)

---

### 2. **Amazon Rekognition - DetectText** (Simple Text Detection)
**Best for**: Simple images mein text detection
**Features**:
- ✅ Simple text detection
- ✅ Multiple languages support
- ✅ Fast processing
- ❌ Forms/tables detect nahi karta
- ❌ Structured data nahi deta

**Use Cases**:
- Simple images se text extract
- Street signs, labels
- Basic OCR needs

**Pricing**: Pay per image

---

### 3. **Amazon Comprehend** (NLP/Understanding)
**Best for**: Text analysis, sentiment, entities
**Features**:
- ✅ Text analysis
- ✅ Entity extraction
- ✅ Sentiment analysis
- ❌ Text extraction nahi karta (already extracted text pe kaam karta hai)

---

## Comparison

| Service | Best For | Forms/Tables | Handwritten | Cost |
|---------|----------|--------------|-------------|------|
| **Textract** | Documents, Forms | ✅ Yes | ✅ Yes | $$ |
| **Rekognition DetectText** | Simple Images | ❌ No | ❌ No | $ |
| **Tesseract.js** (Current) | Simple OCR | ❌ No | ❌ Limited | Free |

---

## Current Setup

**Currently using**: Tesseract.js (local, free)
- ✅ No AWS cost
- ✅ Works offline
- ❌ Limited accuracy
- ❌ Forms/tables detect nahi karta

---

## Recommendation for Your Project

### Option 1: AWS Textract (Best Accuracy) ⭐
**Pros**:
- High accuracy for Aadhaar/PAN cards
- Forms aur tables detect karta hai
- Structured data (name, DOB, address automatically extract)

**Cons**:
- AWS cost (but reasonable)
- Internet required

### Option 2: AWS Rekognition DetectText (Simple & Cheap)
**Pros**:
- Cheaper than Textract
- Fast processing
- Good for simple text extraction

**Cons**:
- Forms/tables detect nahi karta
- Less accurate than Textract

### Option 3: Keep Tesseract.js (Current)
**Pros**:
- Free
- No AWS cost
- Works offline

**Cons**:
- Lower accuracy
- Manual parsing required

---

## AWS Textract Setup (Recommended)

### Step 1: Add Textract to IAM Policy

`aws-iam-policy.json` mein yeh add karein:

```json
{
    "Sid": "TextractAccess",
    "Effect": "Allow",
    "Action": [
        "textract:DetectDocumentText",
        "textract:AnalyzeDocument",
        "textract:AnalyzeExpense",
        "textract:AnalyzeID"
    ],
    "Resource": "*"
}
```

### Step 2: Update AWS Config

Backend `src/config/aws.js` mein:

```javascript
const textract = new AWS.Textract();
module.exports = {
    s3,
    rekognition,
    textract,
    S3_BUCKET: process.env.S3_BUCKET_NAME || 'video-kyc1'
};
```

### Step 3: Create Textract Service

New file: `src/services/textractService.js`

```javascript
const { textract, S3_BUCKET } = require('../config/aws');

class TextractService {
    async extractTextFromS3(s3Key) {
        const params = {
            Document: {
                S3Object: {
                    Bucket: S3_BUCKET,
                    Name: s3Key
                }
            }
        };

        const result = await textract.detectDocumentText(params).promise();
        return this.parseTextractResult(result);
    }

    async analyzeDocument(s3Key) {
        const params = {
            Document: {
                S3Object: {
                    Bucket: S3_BUCKET,
                    Name: s3Key
                }
            },
            FeatureTypes: ['FORMS', 'TABLES']
        };

        const result = await textract.analyzeDocument(params).promise();
        return this.parseTextractResult(result);
    }

    parseTextractResult(result) {
        // Extract text from blocks
        const textBlocks = result.Blocks.filter(b => b.BlockType === 'LINE');
        const text = textBlocks.map(b => b.Text).join('\n');
        
        // Extract key-value pairs (for forms)
        const keyValuePairs = {};
        // ... parsing logic
        
        return {
            text,
            keyValuePairs,
            confidence: result.Blocks[0]?.Confidence || 0
        };
    }
}

module.exports = new TextractService();
```

---

## AWS Rekognition DetectText Setup (Simpler)

### Step 1: IAM Policy (Already Added)
Rekognition permissions already hain in `aws-iam-policy.json`

### Step 2: Use DetectText API

```javascript
const { rekognition, S3_BUCKET } = require('../config/aws');

async function extractTextFromImage(s3Key) {
    const params = {
        Image: {
            S3Object: {
                Bucket: S3_BUCKET,
                Name: s3Key
            }
        }
    };

    const result = await rekognition.detectText(params).promise();
    
    // Extract text
    const textDetections = result.TextDetections
        .filter(td => td.Type === 'LINE')
        .map(td => td.DetectedText)
        .join('\n');
    
    return {
        text: textDetections,
        confidence: result.TextDetections[0]?.Confidence || 0
    };
}
```

---

## Which One to Choose?

### For Aadhaar/PAN Cards: **Textract** ⭐
- Better accuracy
- Structured data extraction
- Forms detect karta hai

### For Simple Images: **Rekognition DetectText**
- Cheaper
- Fast
- Simple text extraction

### For Cost Savings: **Tesseract.js** (Current)
- Free
- Works but lower accuracy

---

## Cost Comparison (Approximate)

- **Textract**: ~$1.50 per 1000 pages (first 1000 free/month)
- **Rekognition DetectText**: ~$1.00 per 1000 images (first 1000 free/month)
- **Tesseract.js**: Free (but server resources use karta hai)

---

## Recommendation

**For Production**: AWS Textract use karein
- Better accuracy for Indian documents
- Forms/tables automatically detect
- Structured data extraction

**For Development/Testing**: Tesseract.js (current) theek hai
- Free
- No AWS setup needed

