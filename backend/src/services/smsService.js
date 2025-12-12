const twilio = require('twilio');

class SMSService {
    constructor() {
        this.client = null;
        this.fromNumber = null;
        this.initialize();
    }

    initialize() {
        const accountSid = process.env.TWILIO_ACCOUNT_SID;
        const authToken = process.env.TWILIO_AUTH_TOKEN;
        this.fromNumber = process.env.TWILIO_PHONE_NUMBER;

        if (accountSid && authToken && this.fromNumber) {
            try {
                this.client = twilio(accountSid, authToken);
                console.log('Twilio SMS service initialized successfully');
            } catch (error) {
                console.error('Error initializing Twilio:', error);
            }
        } else {
            console.warn('Twilio credentials not found. SMS service will not work.');
        }
    }

    /**
     * Send SMS to user with video verification link
     * @param {string} phoneNumber - User's phone number (with country code)
     * @param {string} userName - User's name
     * @param {string} joinLink - Video verification link
     * @returns {Promise<Object>} - Twilio message response
     */
    async sendVerificationSMS(phoneNumber, userName, joinLink) {
        if (!this.client) {
            console.error('Twilio client not initialized. Please check your .env file.');
            throw new Error('Twilio client not initialized. Please check your .env file.');
        }

        if (!phoneNumber) {
            console.error('Phone number is required for SMS');
            throw new Error('Phone number is required');
        }

        console.log(`Attempting to send SMS to: ${phoneNumber}`);

        // Clean phone number (remove spaces, dashes, etc.)
        let cleanPhone = phoneNumber.replace(/[\s\-\(\)]/g, '');
        
        // Remove leading zeros if present
        cleanPhone = cleanPhone.replace(/^0+/, '');
        
        // If phone number already has country code (starts with +), use as is
        // Otherwise, if it starts with country code without +, add +
        // For India numbers starting with 91, ensure + is present
        let formattedPhone;
        if (cleanPhone.startsWith('+')) {
            formattedPhone = cleanPhone;
        } else if (cleanPhone.startsWith('91') && cleanPhone.length >= 12) {
            // India number without +
            formattedPhone = `+${cleanPhone}`;
        } else if (cleanPhone.length === 10) {
            // Assume India number (10 digits) - add +91
            formattedPhone = `+91${cleanPhone}`;
        } else {
            // Try to add + if not present
            formattedPhone = `+${cleanPhone}`;
        }

        console.log(`Formatted phone number: ${formattedPhone}`);

        // SMS message in Hindi/English mix
        const message = `Namaste ${userName}! Aapka Video KYC Verification session ready hai. Link: ${joinLink} - virtualinvestigation`;

        try {
            console.log(`Sending SMS from ${this.fromNumber} to ${formattedPhone}`);
            const messageResponse = await this.client.messages.create({
                body: message,
                from: this.fromNumber,
                to: formattedPhone
            });

            console.log(`✅ SMS sent successfully to ${formattedPhone}. Message SID: ${messageResponse.sid}, Status: ${messageResponse.status}`);
            return {
                success: true,
                messageSid: messageResponse.sid,
                status: messageResponse.status,
                to: formattedPhone
            };
        } catch (error) {
            console.error('❌ Error sending SMS:', error);
            console.error('Error details:', {
                code: error.code,
                message: error.message,
                status: error.status,
                moreInfo: error.moreInfo
            });
            throw new Error(`Failed to send SMS: ${error.message || 'Unknown error'}`);
        }
    }

    /**
     * Check if SMS service is available
     * @returns {boolean}
     */
    isAvailable() {
        return this.client !== null;
    }
}

module.exports = new SMSService();

