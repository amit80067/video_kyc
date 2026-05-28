require('dotenv').config();
const smsService = require('./src/services/smsService');

async function testSMS() {
    const testPhone = '+919690793617'; // User provided number with country code
    const testName = 'Test User';
    const testLink = 'https://kyc.virtualinvestigation.xyz/join/test-session-123';

    console.log('Testing SMS Service...');
    console.log('Phone:', testPhone);
    console.log('Name:', testName);
    console.log('Link:', testLink);
    console.log('SMS Service Available:', smsService.isAvailable());
    console.log('');

    if (!smsService.isAvailable()) {
        console.error(
            '❌ SMS service is not available. Set HiTech (HITECH_SMS_API_KEY + HITECH_SMS_SENDER_ID) or Twilio in .env'
        );
        process.exit(1);
    }

    try {
        console.log('Sending test SMS...');
        const result = await smsService.sendVerificationSMS(testPhone, testName, testLink);
        console.log('');
        console.log('✅ SMS sent successfully!');
        console.log('Result:', JSON.stringify(result, null, 2));
    } catch (error) {
        console.error('');
        console.error('❌ Failed to send SMS:');
        console.error('Error:', error.message);
        if (error.code) {
            console.error('Error Code:', error.code);
        }
        if (error.moreInfo) {
            console.error('More Info:', error.moreInfo);
        }
        process.exit(1);
    }
}

testSMS();

