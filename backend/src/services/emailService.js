const brevo = require('@getbrevo/brevo');
const path = require('path');

// Load .env explicitly with correct path
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

class EmailService {
    constructor() {
        this.apiInstance = null;
        this.fromEmail = null;
        this.fromName = null;
        this.initialize();
    }

    initialize() {
        const apiKey = process.env.BREVO_API_KEY;
        this.fromEmail = process.env.BREVO_FROM_EMAIL || process.env.ADMIN_EMAIL || 'noreply@virtualinvestigation.xyz';
        this.fromName = process.env.BREVO_FROM_NAME || 'Virtual Investigation';

        if (apiKey) {
            try {
                // Initialize Brevo API client
                this.apiInstance = new brevo.TransactionalEmailsApi();
                
                // Set API key
                this.apiInstance.setApiKey(
                    brevo.TransactionalEmailsApiApiKeys.apiKey,
                    apiKey
                );
                
                console.log('Brevo email service initialized successfully');
            } catch (error) {
                console.error('Error initializing Brevo:', error);
            }
        } else {
            console.warn('Brevo API key not found. Email service will not work.');
        }
    }

    /**
     * Send email to user with video verification link
     * @param {string} userEmail - User's email address
     * @param {string} userName - User's name
     * @param {string} joinLink - Video verification link
     * @returns {Promise<Object>} - Brevo message response
     */
    async sendVerificationEmail(userEmail, userName, joinLink) {
        if (!this.apiInstance) {
            console.error('Brevo API client not initialized. Please check your .env file.');
            throw new Error('Brevo API client not initialized. Please check your .env file.');
        }

        if (!userEmail) {
            console.error('Email address is required');
            throw new Error('Email address is required');
        }

        // Validate email format
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(userEmail)) {
            console.error(`Invalid email format: ${userEmail}`);
            throw new Error('Invalid email format');
        }

        console.log(`Attempting to send email to: ${userEmail}`);

        // Email subject
        const subject = `Your Video KYC Verification Session is Ready - ${userName}`;

        // Email body in HTML format - Professional English Template
        const htmlBody = `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <style>
                    * {
                        margin: 0;
                        padding: 0;
                        box-sizing: border-box;
                    }
                    body {
                        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
                        line-height: 1.6;
                        color: #333333;
                        background-color: #f4f4f4;
                        padding: 20px;
                    }
                    .email-container {
                        max-width: 600px;
                        margin: 0 auto;
                        background-color: #ffffff;
                        border-radius: 8px;
                        overflow: hidden;
                        box-shadow: 0 2px 4px rgba(0,0,0,0.1);
                    }
                    .header {
                        background: linear-gradient(135deg, #1976d2 0%, #1565c0 100%);
                        color: #ffffff;
                        padding: 40px 30px;
                        text-align: center;
                    }
                    .header h1 {
                        font-size: 28px;
                        font-weight: 600;
                        margin: 0;
                        letter-spacing: -0.5px;
                    }
                    .content {
                        padding: 40px 30px;
                        background-color: #ffffff;
                    }
                    .greeting {
                        font-size: 18px;
                        color: #333333;
                        margin-bottom: 20px;
                        font-weight: 500;
                    }
                    .message {
                        font-size: 16px;
                        color: #555555;
                        margin-bottom: 30px;
                        line-height: 1.8;
                    }
                    .cta-container {
                        text-align: center;
                        margin: 35px 0;
                    }
                    .button {
                        display: inline-block;
                        padding: 18px 45px;
                        background-color: #1976d2;
                        color: #ffffff !important;
                        text-decoration: none;
                        border-radius: 8px;
                        font-weight: 700;
                        font-size: 18px;
                        letter-spacing: 0.5px;
                        box-shadow: 0 4px 12px rgba(25, 118, 210, 0.4);
                        border: none;
                        min-width: 250px;
                        text-align: center;
                    }
                    .button:hover {
                        background-color: #1565c0;
                        box-shadow: 0 6px 16px rgba(25, 118, 210, 0.5);
                    }
                    .info-box {
                        background-color: #f8f9fa;
                        border-left: 4px solid #1976d2;
                        padding: 20px;
                        margin: 30px 0;
                        border-radius: 4px;
                    }
                    .info-box p {
                        margin: 8px 0;
                        font-size: 14px;
                        color: #666666;
                    }
                    .info-box strong {
                        color: #333333;
                    }
                    .link-container {
                        margin: 25px 0;
                        padding: 15px;
                        background-color: #f8f9fa;
                        border-radius: 4px;
                        word-break: break-all;
                    }
                    .link-container p {
                        font-size: 12px;
                        color: #888888;
                        margin-bottom: 8px;
                    }
                    .link {
                        color: #1976d2;
                        text-decoration: none;
                        font-size: 14px;
                        word-break: break-all;
                    }
                    .link:hover {
                        text-decoration: underline;
                    }
                    .footer {
                        background-color: #f8f9fa;
                        padding: 30px;
                        text-align: center;
                        border-top: 1px solid #e9ecef;
                    }
                    .footer p {
                        font-size: 13px;
                        color: #888888;
                        margin: 5px 0;
                        line-height: 1.6;
                    }
                    .footer .company-name {
                        font-weight: 600;
                        color: #333333;
                        font-size: 14px;
                    }
                    .divider {
                        height: 1px;
                        background-color: #e9ecef;
                        margin: 30px 0;
                    }
                    @media only screen and (max-width: 600px) {
                        .content {
                            padding: 30px 20px;
                        }
                        .header {
                            padding: 30px 20px;
                        }
                        .header h1 {
                            font-size: 24px;
                        }
                    }
                </style>
            </head>
            <body>
                <div class="email-container">
                    <div class="header">
                        <h1>Video KYC Verification</h1>
                    </div>
                    <div class="content">
                        <div class="greeting">
                            Hello ${userName},
                        </div>
                        <div class="message">
                            Your Video KYC (Know Your Customer) verification session has been successfully created and is ready for you to join. This secure session will allow you to complete your identity verification process.
                        </div>
                        <div class="cta-container">
                            <a href="${joinLink}" class="button" style="display: inline-block; padding: 18px 45px; background-color: #1976d2; color: #ffffff !important; text-decoration: none; border-radius: 8px; font-weight: 700; font-size: 18px; letter-spacing: 0.5px; box-shadow: 0 4px 12px rgba(25, 118, 210, 0.4); min-width: 250px; text-align: center;">Join Verification Session</a>
                        </div>
                        <div class="info-box">
                            <p><strong>Session Details:</strong></p>
                            <p>• Session Link: <a href="${joinLink}" class="link">Click here to join</a></p>
                            <p>• Link Validity: 24 hours from the time of creation</p>
                            <p>• Please ensure you have a stable internet connection and a working camera/microphone</p>
                        </div>
                        <div class="link-container">
                            <p>Or copy and paste this link into your browser:</p>
                            <a href="${joinLink}" class="link">${joinLink}</a>
                        </div>
                        <div class="divider"></div>
                        <div class="message" style="font-size: 14px; color: #666666;">
                            <strong>What to expect:</strong><br>
                            During the verification session, you will be guided through the process by one of our authorized agents. Please have your valid identification documents ready for verification.
                        </div>
                    </div>
                    <div class="footer">
                        <p class="company-name">Virtual Investigation</p>
                        <p>Professional Video KYC Verification Service</p>
                        <p style="margin-top: 15px;">This is an automated email. Please do not reply to this message.</p>
                        <p>If you have any questions or concerns, please contact our support team.</p>
                    </div>
                </div>
            </body>
            </html>
        `;

        // Plain text version for email clients that don't support HTML
        const textBody = `
Hello ${userName},

Your Video KYC (Know Your Customer) verification session has been successfully created and is ready for you to join. This secure session will allow you to complete your identity verification process.

JOIN YOUR SESSION:
${joinLink}

SESSION DETAILS:
- Link Validity: 24 hours from the time of creation
- Please ensure you have a stable internet connection and a working camera/microphone

WHAT TO EXPECT:
During the verification session, you will be guided through the process by one of our authorized agents. Please have your valid identification documents ready for verification.

---
Virtual Investigation
Professional Video KYC Verification Service

This is an automated email. Please do not reply to this message.
If you have any questions or concerns, please contact our support team.
        `;

        const sendSmtpEmail = new brevo.SendSmtpEmail();
        sendSmtpEmail.subject = subject;
        sendSmtpEmail.htmlContent = htmlBody;
        sendSmtpEmail.textContent = textBody;
        sendSmtpEmail.sender = {
            name: this.fromName,
            email: this.fromEmail
        };
        sendSmtpEmail.to = [{
            email: userEmail,
            name: userName
        }];

        try {
            console.log(`Sending email from ${this.fromEmail} to ${userEmail}`);
            const result = await this.apiInstance.sendTransacEmail(sendSmtpEmail);

            console.log(`✅ Email sent successfully to ${userEmail}. Message ID: ${result.messageId}`);
            return {
                success: true,
                messageId: result.messageId,
                to: userEmail
            };
        } catch (error) {
            console.error('❌ Error sending email:', error);
            console.error('Error details:', {
                message: error.message,
                response: error.response?.body || error.response?.text
            });
            throw new Error(`Failed to send email: ${error.message || 'Unknown error'}`);
        }
    }

    /**
     * Check if email service is available
     * @returns {boolean}
     */
    isAvailable() {
        return this.apiInstance !== null;
    }
}

module.exports = new EmailService();
