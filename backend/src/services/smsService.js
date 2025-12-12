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
            throw new Error('Twilio client not initialized. Please check your .env file.');
        }

        if (!phoneNumber) {
            throw new Error('Phone number is required');
        }

        // Clean phone number (remove spaces, dashes, etc.)
        const cleanPhone = phoneNumber.replace(/[\s\-\(\)]/g, '');
        
        // Ensure phone number starts with + (Twilio requirement)
        const formattedPhone = cleanPhone.startsWith('+') ? cleanPhone : `+${cleanPhone}`;

        // SMS message in Hindi/English mix
        const message = `Namaste ${userName}! Aapka Video KYC Verification session ready hai. Link: ${joinLink} - MyAstroWalk`;

        try {
            const messageResponse = await this.client.messages.create({
                body: message,
                from: this.fromNumber,
                to: formattedPhone
            });

            console.log(`SMS sent successfully to ${formattedPhone}. Message SID: ${messageResponse.sid}`);
            return {
                success: true,
                messageSid: messageResponse.sid,
                status: messageResponse.status,
                to: formattedPhone
            };
        } catch (error) {
            console.error('Error sending SMS:', error);
            throw new Error(`Failed to send SMS: ${error.message}`);
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

