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
        // Use word boundaries to find proper 12-digit numbers
        const aadhaarPatterns = [
            /\b(\d{4}\s\d{4}\s\d{4})\b/g,  // Standard format with spaces
            /\b(\d{4}\s?\d{4}\s?\d{4})\b/g  // With optional spaces
        ];
        
        let aadhaarNumber = null;
        let allMatches = [];
        
        // Find all possible matches
        for (const pattern of aadhaarPatterns) {
            const matches = extractedText.match(pattern);
            if (matches) {
                allMatches = allMatches.concat(matches);
            }
        }
        
        // Filter out invalid numbers (like phone numbers, dates, etc.)
        if (allMatches.length > 0) {
            const uniqueMatches = [...new Set(allMatches)];
            
            // Filter out numbers that are likely phone numbers or dates
            const validAadhaar = uniqueMatches.filter(match => {
                const cleaned = match.replace(/\s/g, '');
                if (cleaned.length !== 12) return false;
                if (match.includes('/') || match.includes('-')) return false;
                // Check if it's near "MOBILE" or "PHONE" - likely phone number
                const matchIndex = extractedText.indexOf(match);
                const context = extractedText.substring(Math.max(0, matchIndex - 20), matchIndex + 30).toUpperCase();
                if (context.includes('MOBILE') || context.includes('PHONE') || context.includes('NO.')) {
                    // Prefer standard Aadhaar format with spaces
                    return match.includes(' ') && match.split(' ').length === 3;
                }
                return true;
            });
            
            // Prefer the one with proper spacing (standard Aadhaar format)
            if (validAadhaar.length > 0) {
                const withSpaces = validAadhaar.find(m => m.split(' ').length === 3);
                aadhaarNumber = (withSpaces || validAadhaar[0]).replace(/\s/g, '');
            } else if (uniqueMatches.length > 0) {
                // Fallback to first match if no valid ones found
                aadhaarNumber = uniqueMatches[0].replace(/\s/g, '');
            }
        }

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

        // Extract Gender
        const genderPatterns = [
            /Gender[:\s]+(Male|Female|M|F|MALE|FEMALE)/i,
            /Sex[:\s]+(Male|Female|M|F|MALE|FEMALE)/i,
            /(Male|Female)/i
        ];

        let gender = null;
        for (const pattern of genderPatterns) {
            const match = extractedText.match(pattern);
            if (match) {
                gender = match[1] ? match[1].trim() : match[0].trim();
                // Normalize gender
                if (gender.toUpperCase() === 'M' || gender.toUpperCase() === 'MALE') {
                    gender = 'Male';
                } else if (gender.toUpperCase() === 'F' || gender.toUpperCase() === 'FEMALE') {
                    gender = 'Female';
                }
                break;
            }
        }

        return {
            ...result,
            aadhaarNumber: aadhaarNumber,
            name: name,
            dateOfBirth: dateOfBirth,
            gender: gender,
            address: address,
            extractedText: extractedText
        };
    }

    /**
     * Extract PAN card data
     */
    async extractPANData(imagePath) {
        const result = await this.extractText(imagePath, {
            lang: 'eng',
            whitelist: '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ /-',
            psm: 6 // Single uniform block
        });

        // Parse PAN data
        const extractedText = result.text.toUpperCase();

        // Extract PAN number (format: ABCDE1234F)
        const panRegex = /[A-Z]{5}\d{4}[A-Z]{1}/;
        const panMatch = extractedText.match(panRegex);
        const panNumber = panMatch ? panMatch[0] : null;

        // Extract Name (usually appears after "INCOME TAX DEPARTMENT" or "GOVT. OF INDIA")
        const namePatterns = [
            /(?:INCOME TAX DEPARTMENT|GOVT\.?\s*OF\s*INDIA)[\s\S]{0,100}?([A-Z]{2,}\s+[A-Z]{2,}(?:\s+[A-Z]{2,})?)/,
            /Name[:\s]+([A-Z\s]{3,50})/i,
            /([A-Z]{2,}\s+[A-Z]{2,}(?:\s+[A-Z]{2,})?)/,
            /(?:Name of|Name)[\s\S]{0,50}?([A-Z]{2,}\s+[A-Z]{2,})/
        ];

        let name = null;
        for (const pattern of namePatterns) {
            const match = extractedText.match(pattern);
            if (match) {
                name = match[1] ? match[1].trim() : match[0].trim();
                // Remove common prefixes
                name = name.replace(/^(INCOME TAX DEPARTMENT|GOVT\.?\s*OF\s*INDIA|Name|Name of)/i, '').trim();
                if (name.length > 3 && name.length < 50) {
                    break;
                }
            }
        }

        // Extract Father's Name
        const fatherNamePatterns = [
            /Father['\s]?s?\s*Name[:\s]+([A-Z\s]{3,50})/i,
            /Father[:\s]+([A-Z\s]{3,50})/i,
            /(?:Father|Father's Name)[\s\S]{0,50}?([A-Z]{2,}\s+[A-Z]{2,})/
        ];

        let fatherName = null;
        for (const pattern of fatherNamePatterns) {
            const match = extractedText.match(pattern);
            if (match) {
                fatherName = match[1] ? match[1].trim() : match[0].trim();
                // Remove common prefixes
                fatherName = fatherName.replace(/^(Father|Father's Name|Father's)/i, '').trim();
                if (fatherName.length > 3 && fatherName.length < 50) {
                    break;
                }
            }
        }

        // Extract Date of Birth
        const dobPatterns = [
            /Date of Birth[:\s]+(\d{2}[\/\-]\d{2}[\/\-]\d{4})/i,
            /DOB[:\s]+(\d{2}[\/\-]\d{2}[\/\-]\d{4})/i,
            /(\d{2}[\/\-]\d{2}[\/\-]\d{4})/,
            /Birth[:\s]+(\d{2}[\/\-]\d{2}[\/\-]\d{4})/i
        ];

        let dateOfBirth = null;
        for (const pattern of dobPatterns) {
            const match = extractedText.match(pattern);
            if (match) {
                dateOfBirth = match[1] || match[0];
                break;
            }
        }

        return {
            ...result,
            panNumber: panNumber,
            name: name,
            fatherName: fatherName,
            dateOfBirth: dateOfBirth,
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

