const Tesseract = require('tesseract.js');
const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

class OCRService {
    /**
     * Preprocess image for better OCR accuracy
     */
    async preprocessImage(imagePath) {
        const processedPath = path.join(__dirname, '../../temp/processed.jpg');
        
        // Ensure temp directory exists
        const tempDir = path.dirname(processedPath);
        if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir, { recursive: true });
        }

        try {
            await sharp(imagePath)
                .greyscale()           // Convert to grayscale
                .normalize()           // Improve contrast
                .sharpen()            // Enhance sharpness
                .threshold(128)       // Binary threshold
                .toFile(processedPath);

            return processedPath;
        } catch (error) {
            console.error('Image preprocessing error:', error);
            // Return original if preprocessing fails
            return imagePath;
        }
    }

    /**
     * Extract text from image using OCR
     */
    async extractText(imagePath, options = {}) {
        try {
            // Preprocess image
            const processedPath = await this.preprocessImage(imagePath);

            // OCR configuration
            const config = {
                lang: options.lang || 'eng',
                logger: (m) => {
                    if (options.onProgress && m.status === 'recognizing text') {
                        options.onProgress(Math.round(m.progress * 100));
                    }
                }
            };

            // Custom options
            if (options.whitelist) {
                config.tessedit_char_whitelist = options.whitelist;
            }

            if (options.psm) {
                config.psm = options.psm;
            }

            // Perform OCR
            const { data } = await Tesseract.recognize(processedPath, config.lang, config);

            // Cleanup processed image if it's different from original
            if (processedPath !== imagePath && fs.existsSync(processedPath)) {
                fs.unlinkSync(processedPath);
            }

            return {
                text: data.text,
                confidence: data.confidence,
                words: data.words || []
            };
        } catch (error) {
            throw new Error(`OCR Error: ${error.message}`);
        }
    }

    /**
     * Extract Aadhaar card data
     */
    async extractAadhaarData(imagePath) {
        const result = await this.extractText(imagePath, {
            lang: 'eng',
            whitelist: '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ ',
            psm: 6 // Single uniform block
        });

        // Parse Aadhaar data
        const extractedText = result.text.toUpperCase();

        // Extract Aadhaar number (12 digits, may have spaces)
        const aadhaarRegex = /\d{4}\s?\d{4}\s?\d{4}/;
        const aadhaarMatch = extractedText.match(aadhaarRegex);
        const aadhaarNumber = aadhaarMatch ? aadhaarMatch[0].replace(/\s/g, '') : null;

        // Extract name (usually after "Name:" or "NAME:")
        const namePatterns = [
            /NAME[:\s]+([A-Z\s]{3,50})/i,
            /Name[:\s]+([A-Z\s]{3,50})/,
            /([A-Z]{2,}\s+[A-Z]{2,})/ // Fallback: two or more capital words
        ];

        let name = null;
        for (const pattern of namePatterns) {
            const match = extractedText.match(pattern);
            if (match) {
                name = match[1] ? match[1].trim() : match[0].trim();
                break;
            }
        }

        // Extract Date of Birth
        const dobPatterns = [
            /(\d{2}[\/\-]\d{2}[\/\-]\d{4})/,
            /DOB[:\s]+(\d{2}[\/\-]\d{2}[\/\-]\d{4})/i,
            /Date of Birth[:\s]+(\d{2}[\/\-]\d{2}[\/\-]\d{4})/i
        ];

        let dateOfBirth = null;
        for (const pattern of dobPatterns) {
            const match = extractedText.match(pattern);
            if (match) {
                dateOfBirth = match[1] || match[0];
                break;
            }
        }

        // Extract address (if available)
        const addressPatterns = [
            /Address[:\s]+([A-Z0-9\s,]{10,200})/i,
            /([A-Z0-9\s,]{20,200})/ // Fallback: long text block
        ];

        let address = null;
        for (const pattern of addressPatterns) {
            const match = extractedText.match(pattern);
            if (match && match[1] && match[1].length > 20) {
                address = match[1].trim();
                break;
            }
        }

        return {
            ...result,
            aadhaarNumber: aadhaarNumber,
            name: name,
            dateOfBirth: dateOfBirth,
            address: address,
            extractedText: extractedText
        };
    }

    /**
     * Validate Aadhaar number format
     */
    validateAadhaarNumber(aadhaarNumber) {
        if (!aadhaarNumber) return false;
        
        // Remove spaces and check if it's 12 digits
        const cleaned = aadhaarNumber.replace(/\s/g, '');
        return /^\d{12}$/.test(cleaned);
    }
}

module.exports = new OCRService();

