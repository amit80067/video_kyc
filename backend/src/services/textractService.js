const { textract, S3_BUCKET } = require('../config/aws');
const fs = require('fs');

class TextractService {
    /**
     * Extract text from document using Textract (from S3)
     * @param {string} s3Key - S3 key of the document
     * @returns {Promise<Object>} Extracted text and data
     */
    async extractTextFromS3(s3Key) {
        try {
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
        } catch (error) {
            console.error('Textract extractTextFromS3 error:', error);
            throw new Error(`Textract extraction failed: ${error.message}`);
        }
    }

    /**
     * Analyze document with forms and tables (from S3)
     * @param {string} s3Key - S3 key of the document
     * @returns {Promise<Object>} Extracted forms, tables, and text
     */
    async analyzeDocument(s3Key) {
        try {
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
            return this.parseAnalyzeDocumentResult(result);
        } catch (error) {
            console.error('Textract analyzeDocument error:', error);
            throw new Error(`Textract analysis failed: ${error.message}`);
        }
    }

    /**
     * Analyze ID document (Aadhaar, PAN, etc.) - Best for Indian IDs
     * @param {string} s3Key - S3 key of the ID document
     * @returns {Promise<Object>} Extracted ID data
     */
    async analyzeID(s3Key) {
        try {
            const params = {
                DocumentPages: [{
                    S3Object: {
                        Bucket: S3_BUCKET,
                        Name: s3Key
                    }
                }]
            };

            const result = await textract.analyzeID(params).promise();
            return this.parseAnalyzeIDResult(result);
        } catch (error) {
            console.error('Textract analyzeID error:', error);
            throw new Error(`Textract ID analysis failed: ${error.message}`);
        }
    }

    /**
     * Extract text from local file (uploads to S3 first, then processes)
     * @param {string} filePath - Local file path
     * @param {string} s3Key - S3 key to use
     * @returns {Promise<Object>} Extracted text
     */
    async extractTextFromFile(filePath, s3Key) {
        try {
            // First upload to S3
            const { s3 } = require('../config/aws');
            const fileContent = fs.readFileSync(filePath);
            
            await s3.putObject({
                Bucket: S3_BUCKET,
                Key: s3Key,
                Body: fileContent,
                ContentType: 'image/jpeg'
            }).promise();

            // Then extract text
            return await this.extractTextFromS3(s3Key);
        } catch (error) {
            console.error('Textract extractTextFromFile error:', error);
            throw new Error(`Textract extraction failed: ${error.message}`);
        }
    }

    /**
     * Parse Textract detectDocumentText result
     */
    parseTextractResult(result) {
        if (!result.Blocks) {
            return {
                text: '',
                words: [],
                lines: [],
                confidence: 0
            };
        }

        // Extract lines (complete text lines)
        const lines = result.Blocks
            .filter(block => block.BlockType === 'LINE')
            .map(block => ({
                text: block.Text,
                confidence: block.Confidence,
                geometry: block.Geometry
            }));

        // Extract words
        const words = result.Blocks
            .filter(block => block.BlockType === 'WORD')
            .map(block => ({
                text: block.Text,
                confidence: block.Confidence
            }));

        // Combine all text
        const text = lines.map(l => l.text).join('\n');

        // Calculate average confidence
        const confidences = lines.map(l => l.confidence).filter(c => c);
        const avgConfidence = confidences.length > 0
            ? confidences.reduce((a, b) => a + b, 0) / confidences.length
            : 0;

        return {
            text,
            words,
            lines,
            confidence: Math.round(avgConfidence * 100) / 100
        };
    }

    /**
     * Parse Textract analyzeDocument result (with forms and tables)
     */
    parseAnalyzeDocumentResult(result) {
        const basicResult = this.parseTextractResult(result);

        // Extract key-value pairs from forms
        const keyValuePairs = {};
        if (result.Blocks) {
            const relationships = result.Blocks.filter(b => b.BlockType === 'KEY_VALUE_SET');
            const keyBlocks = relationships.filter(b => b.EntityTypes && b.EntityTypes.includes('KEY'));
            const valueBlocks = relationships.filter(b => b.EntityTypes && b.EntityTypes.includes('VALUE'));

            keyBlocks.forEach(keyBlock => {
                const keyText = this.getTextFromBlock(keyBlock, result.Blocks);
                const valueBlock = this.findValueForKey(keyBlock, valueBlocks, result.Blocks);
                if (valueBlock) {
                    const valueText = this.getTextFromBlock(valueBlock, result.Blocks);
                    keyValuePairs[keyText] = valueText;
                }
            });
        }

        // Extract tables
        const tables = [];
        if (result.Blocks) {
            const tableBlocks = result.Blocks.filter(b => b.BlockType === 'TABLE');
            tableBlocks.forEach(tableBlock => {
                const table = this.extractTable(tableBlock, result.Blocks);
                tables.push(table);
            });
        }

        return {
            ...basicResult,
            keyValuePairs,
            tables
        };
    }

    /**
     * Parse Textract analyzeID result (for Aadhaar, PAN, etc.)
     */
    parseAnalyzeIDResult(result) {
        const idData = {
            documentIndex: 0,
            identityDocuments: []
        };

        if (result.IdentityDocuments && result.IdentityDocuments.length > 0) {
            result.IdentityDocuments.forEach((doc, index) => {
                const documentFields = {};
                
                if (doc.DocumentIndex !== undefined) {
                    documentFields.documentIndex = doc.DocumentIndex;
                }

                // Extract fields from document
                if (doc.Fields) {
                    doc.Fields.forEach(field => {
                        if (field.Type && field.ValueDetection) {
                            documentFields[field.Type.Text] = {
                                value: field.ValueDetection.Text,
                                confidence: field.ValueDetection.Confidence
                            };
                        }
                    });
                }

                idData.identityDocuments.push(documentFields);
            });
        }

        // Also extract text for manual parsing
        const textResult = this.parseTextractResult(result);
        
        return {
            ...idData,
            rawText: textResult.text,
            confidence: textResult.confidence
        };
    }

    /**
     * Helper: Get text from a block
     */
    getTextFromBlock(block, allBlocks) {
        if (block.Text) return block.Text;
        
        // If block has relationships, get text from child blocks
        if (block.Relationships) {
            const textBlocks = block.Relationships
                .filter(rel => rel.Type === 'CHILD')
                .flatMap(rel => rel.Ids.map(id => allBlocks.find(b => b.Id === id)))
                .filter(b => b && b.BlockType === 'WORD')
                .map(b => b.Text);
            
            return textBlocks.join(' ');
        }
        
        return '';
    }

    /**
     * Helper: Find value block for a key block
     */
    findValueForKey(keyBlock, valueBlocks, allBlocks) {
        if (!keyBlock.Relationships) return null;

        const valueIds = keyBlock.Relationships
            .filter(rel => rel.Type === 'VALUE')
            .flatMap(rel => rel.Ids);

        return valueBlocks.find(vb => valueIds.includes(vb.Id));
    }

    /**
     * Helper: Extract table data
     */
    extractTable(tableBlock, allBlocks) {
        const cells = [];
        
        if (tableBlock.Relationships) {
            const cellIds = tableBlock.Relationships
                .filter(rel => rel.Type === 'CHILD')
                .flatMap(rel => rel.Ids);

            cellIds.forEach(cellId => {
                const cellBlock = allBlocks.find(b => b.Id === cellId);
                if (cellBlock && cellBlock.BlockType === 'CELL') {
                    cells.push({
                        rowIndex: cellBlock.RowIndex,
                        columnIndex: cellBlock.ColumnIndex,
                        text: this.getTextFromBlock(cellBlock, allBlocks),
                        confidence: cellBlock.Confidence
                    });
                }
            });
        }

        return cells;
    }

    /**
     * Extract Aadhaar card data using Textract
     * @param {string} s3Key - S3 key of Aadhaar card image
     * @returns {Promise<Object>} Extracted Aadhaar data
     */
    async extractAadhaarData(s3Key) {
        try {
            // Use detectDocumentText directly (more reliable)
            const result = await this.extractTextFromS3(s3Key);
            
            // Get text from result - combine all words for better matching
            const fullText = result.text || '';
            const wordsText = result.words ? result.words.map(w => w.text).join(' ') : '';
            const combinedText = (fullText + ' ' + wordsText).toUpperCase();
            
            // Parse Aadhaar number from text (12 digits, may have spaces)
            // Try to find the most likely Aadhaar number (usually appears after name/DOB)
            // Pattern: 4 digits, space, 4 digits, space, 4 digits (standard Aadhaar format)
            const aadhaarPatterns = [
                /\b(\d{4}\s\d{4}\s\d{4})\b/g,  // Standard format with spaces
                /\b(\d{4}\s?\d{4}\s?\d{4})\b/g, // With optional spaces
                /(\d{4}\s\d{4}\s\d{4})/g       // Fallback
            ];
            
            let aadhaarNumber = null;
            let allMatches = [];
            
            // Find all possible matches
            for (const pattern of aadhaarPatterns) {
                const matches = combinedText.match(pattern);
                if (matches) {
                    allMatches = allMatches.concat(matches);
                }
            }
            
            // Filter out invalid numbers (like phone numbers, dates, etc.)
            if (allMatches.length > 0) {
                // Remove duplicates
                const uniqueMatches = [...new Set(allMatches)];
                
                // Filter out numbers that are likely phone numbers (start with 6,7,8,9 and have mobile context)
                // or dates (contain / or -)
                const validAadhaar = uniqueMatches.filter(match => {
                    const cleaned = match.replace(/\s/g, '');
                    // Aadhaar usually doesn't start with 0, and is 12 digits
                    // Phone numbers often start with 6,7,8,9
                    // Dates contain / or -
                    if (cleaned.length !== 12) return false;
                    if (match.includes('/') || match.includes('-')) return false;
                    // Check if it's near "MOBILE" or "PHONE" - likely phone number
                    const matchIndex = combinedText.indexOf(match);
                    const context = combinedText.substring(Math.max(0, matchIndex - 20), matchIndex + 30).toUpperCase();
                    if (context.includes('MOBILE') || context.includes('PHONE') || context.includes('NO.')) {
                        // If it's near mobile/phone, it might be phone number
                        // But Aadhaar can also appear near these, so check format
                        // Aadhaar format: XXXX XXXX XXXX (standard spacing)
                        return match.includes(' ') && match.split(' ').length === 3;
                    }
                    return true;
                });
                
                // If we have valid matches, prefer the one with proper spacing (standard Aadhaar format)
                if (validAadhaar.length > 0) {
                    // Prefer format with spaces: "XXXX XXXX XXXX"
                    const withSpaces = validAadhaar.find(m => m.split(' ').length === 3);
                    aadhaarNumber = (withSpaces || validAadhaar[0]).replace(/\s/g, '');
                } else if (uniqueMatches.length > 0) {
                    // Fallback to first match if no valid ones found
                    aadhaarNumber = uniqueMatches[0].replace(/\s/g, '');
                }
            }

            // Extract name - improved patterns (for Aadhaar)
            const namePatterns = [
                /NAME[:\s]+([A-Z\s]{3,50})/i,
                /NOME[:\s]+([A-Z\s]{3,50})/i, // OCR might read NAME as NOME
                /Name[:\s]+([A-Z\s]{3,50})/,
                /([A-Z]{3,}\s+[A-Z]{3,}(?:\s+[A-Z]{3,})?)/ // At least 3 chars per word, 2-3 words
            ];

            let name = null;
            for (const pattern of namePatterns) {
                const match = combinedText.match(pattern);
                if (match) {
                    let extractedName = match[1] ? match[1].trim() : match[0].trim();
                    // Clean up common OCR errors and invalid matches
                    extractedName = extractedName.replace(/^(NAME|NOME|Name|GOVT|OF|INDIA|LIVE|PERSONAL|CARD)[:\s]+/i, '').trim();
                    // Filter out invalid names
                    const invalidPatterns = /^(GOVT|OF|INDIA|LIVE|PERSONAL|CARD|BIRTHER|HRA|HAR)$/i;
                    if (extractedName.length >= 3 && extractedName.length <= 50 && 
                        /^[A-Z\s]+$/.test(extractedName) && 
                        !invalidPatterns.test(extractedName) &&
                        extractedName.split(/\s+/).length >= 2) {
                        name = extractedName;
                        break;
                    }
                }
            }

            // Extract DOB - improved patterns
            const dobPatterns = [
                /DOB[:\s]*(\d{2}[\/\-]\d{2}[\/\-]\d{4})/i,
                /Date of Birth[:\s]*(\d{2}[\/\-]\d{2}[\/\-]\d{4})/i,
                /(\d{2}[\/\-]\d{2}[\/\-]\d{4})/,
                /(\d{2}\s*[\/\-]\s*\d{2}\s*[\/\-]\s*\d{4})/
            ];

            let dateOfBirth = null;
            for (const pattern of dobPatterns) {
                const match = combinedText.match(pattern);
                if (match) {
                    dateOfBirth = (match[1] || match[0]).replace(/\s/g, '');
                    // Validate date format
                    if (/^\d{2}[\/\-]\d{2}[\/\-]\d{4}$/.test(dateOfBirth)) {
                        break;
                    }
                }
            }

            // Extract address
            const addressPatterns = [
                /Address[:\s]+([A-Z0-9\s,]{10,200})/i,
                /([A-Z0-9\s,]{20,200})/
            ];

            let address = null;
            for (const pattern of addressPatterns) {
                const match = combinedText.match(pattern);
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
                const match = combinedText.match(pattern);
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
                text: combinedText,
                aadhaarNumber: aadhaarNumber,
                name: name,
                dateOfBirth: dateOfBirth,
                gender: gender,
                address: address,
                confidence: result.confidence || 0,
                keyValuePairs: result.keyValuePairs || {},
                source: 'textract'
            };
        } catch (error) {
            console.error('Textract extractAadhaarData error:', error);
            throw error;
        }
    }

    /**
     * Extract PAN card data using Textract
     * @param {string} s3Key - S3 key of PAN card image
     * @returns {Promise<Object>} Extracted PAN data
     */
    async extractPANData(s3Key) {
        try {
            // Use detectDocumentText directly
            const result = await this.extractTextFromS3(s3Key);
            
            // Get text from result - combine all words for better matching
            const fullText = result.text || '';
            const wordsText = result.words ? result.words.map(w => w.text).join(' ') : '';
            const combinedText = (fullText + ' ' + wordsText).toUpperCase();

            // Parse PAN number from text (format: ABCDE1234F)
            // Try multiple patterns - PAN might have spaces or be split across words
            const panRegex1 = /[A-Z]{5}\d{4}[A-Z]{1}/;
            const panRegex2 = /[A-Z]{5}\s?\d{4}\s?[A-Z]{1}/;
            const panRegex3 = /[A-Z]{3,5}\s?\d{4}\s?[A-Z]{1}/;
            
            let panNumber = null;
            const panMatch1 = combinedText.match(panRegex1);
            const panMatch2 = combinedText.match(panRegex2);
            const panMatch3 = combinedText.replace(/\s/g, '').match(panRegex1);
            
            if (panMatch1) {
                panNumber = panMatch1[0];
            } else if (panMatch2) {
                panNumber = panMatch2[0].replace(/\s/g, '');
            } else if (panMatch3) {
                panNumber = panMatch3[0];
            }

            // Extract Name - improved patterns
            const namePatterns = [
                /(?:INCOME TAX DEPARTMENT|GOVT\.?\s*OF\s*INDIA)[\s\S]{0,150}?([A-Z]{2,}\s+[A-Z]{2,}(?:\s+[A-Z]{2,})?)/,
                /NAME[:\s]+([A-Z\s]{3,50})/i,
                /NOME[:\s]+([A-Z\s]{3,50})/i, // OCR might read NAME as NOME
                /Name[:\s]+([A-Z\s]{3,50})/,
                /([A-Z]{2,}\s+[A-Z]{2,}(?:\s+[A-Z]{2,})?)/, // Two or three capital words
                /([A-Z]{3,}\s+[A-Z]{3,})/ // At least 3 chars per word
            ];

            let name = null;
            for (const pattern of namePatterns) {
                const match = combinedText.match(pattern);
                if (match) {
                    let extractedName = match[1] ? match[1].trim() : match[0].trim();
                    // Remove common prefixes
                    extractedName = extractedName.replace(/^(INCOME TAX DEPARTMENT|GOVT\.?\s*OF\s*INDIA|NAME|NOME|Name|Name of)[:\s]+/i, '').trim();
                    if (extractedName.length >= 3 && extractedName.length <= 50 && /^[A-Z\s]+$/.test(extractedName)) {
                        name = extractedName;
                        break;
                    }
                }
            }

            // Extract Father's Name - improved patterns
            const fatherNamePatterns = [
                /FATHER['\s]?S?\s*NAME[:\s]+([A-Z\s]{3,50})/i,
                /FATHER[:\s]+([A-Z\s]{3,50})/i,
                /(?:FATHER|FATHER'S NAME)[\s\S]{0,50}?([A-Z]{2,}\s+[A-Z]{2,})/
            ];

            let fatherName = null;
            for (const pattern of fatherNamePatterns) {
                const match = combinedText.match(pattern);
                if (match) {
                    let extractedFatherName = match[1] ? match[1].trim() : match[0].trim();
                    // Remove common prefixes
                    extractedFatherName = extractedFatherName.replace(/^(FATHER|FATHER'S NAME|FATHER'S|FATHERS)[:\s]+/i, '').trim();
                    if (extractedFatherName.length >= 3 && extractedFatherName.length <= 50 && /^[A-Z\s]+$/.test(extractedFatherName)) {
                        fatherName = extractedFatherName;
                        break;
                    }
                }
            }

            // Extract Date of Birth - improved patterns
            const dobPatterns = [
                /DATE OF BIRTH[:\s]*(\d{2}[\/\-]\d{2}[\/\-]\d{4})/i,
                /DOB[:\s]*(\d{2}[\/\-]\d{2}[\/\-]\d{4})/i,
                /(\d{2}[\/\-]\d{2}[\/\-]\d{4})/,
                /BIRTH[:\s]*(\d{2}[\/\-]\d{2}[\/\-]\d{4})/i
            ];

            let dateOfBirth = null;
            for (const pattern of dobPatterns) {
                const match = combinedText.match(pattern);
                if (match) {
                    dateOfBirth = (match[1] || match[0]).replace(/\s/g, '');
                    // Validate date format
                    if (/^\d{2}[\/\-]\d{2}[\/\-]\d{4}$/.test(dateOfBirth)) {
                        break;
                    }
                }
            }

            return {
                text: combinedText,
                panNumber: panNumber,
                name: name,
                fatherName: fatherName,
                dateOfBirth: dateOfBirth,
                confidence: result.confidence || 0,
                keyValuePairs: result.keyValuePairs || {},
                source: 'textract'
            };
        } catch (error) {
            console.error('Textract extractPANData error:', error);
            throw error;
        }
    }
}

module.exports = new TextractService();

