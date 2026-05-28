const https = require('https');
const { URLSearchParams } = require('url');
const twilio = require('twilio');
const { validateIndianMobile } = require('../utils/phoneValidation');

const HITECH_URL = 'https://sms.hitechsms.com/app/smsapi/index.php';

class SMSService {
  constructor() {
    this.twilioClient = null;
    this.twilioFrom = null;
    this.hitechKey = null;
    this.hitechRouteId = null;
    this.hitechSenderId = null;
    this.hitechCampaign = '0';
    this.hitechTemplateId = '';
    this.initialize();
  }

  initialize() {
    this.hitechKey = process.env.HITECH_SMS_API_KEY || process.env.HITECH_SMS_KEY || null;
    this.hitechRouteId = process.env.HITECH_SMS_ROUTE_ID || '13';
    this.hitechSenderId = process.env.HITECH_SMS_SENDER_ID || null;
    this.hitechCampaign = process.env.HITECH_SMS_CAMPAIGN || '0';
    this.hitechTemplateId = process.env.HITECH_SMS_TEMPLATE_ID || '';
    // Optional: full DLT-approved SMS body; use {{name}} and {{link}}. If unset, body = join URL only.
    this.hitechMessageTemplate = process.env.HITECH_SMS_MESSAGE_TEMPLATE || null;

    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    this.twilioFrom = process.env.TWILIO_PHONE_NUMBER;

    if (accountSid && authToken && this.twilioFrom) {
      try {
        this.twilioClient = twilio(accountSid, authToken);
        console.log('Twilio SMS: credentials loaded (fallback provider).');
      } catch (error) {
        console.error('Twilio SMS init error:', error);
      }
    }

    if (this.hitechKey && this.hitechSenderId) {
      console.log('HiTech SMS: API key + sender configured (primary SMS provider).');
      if (!this.hitechTemplateId) {
        console.warn(
          'HiTech SMS: HITECH_SMS_TEMPLATE_ID is empty. In India, DLT usually requires template_id; SMS may show as accepted but fail on the handset.'
        );
      }
      if (this.hitechMessageTemplate) {
        console.log('HiTech SMS: HITECH_SMS_MESSAGE_TEMPLATE set — SMS body uses that text ({{name}}, {{link}}).');
      } else {
        console.log(
          'HiTech SMS: default SMS body is the join URL only. For full DLT wording, set HITECH_SMS_MESSAGE_TEMPLATE (+ matching HITECH_SMS_TEMPLATE_ID).'
        );
      }
    } else if (!this.twilioClient) {
      console.warn('SMS: neither HiTech (HITECH_SMS_API_KEY + HITECH_SMS_SENDER_ID) nor Twilio is fully configured.');
    }
  }

  _useHiTech() {
    return !!(this.hitechKey && this.hitechSenderId);
  }

  /**
   * HiTech first if configured; otherwise Twilio.
   */
  isAvailable() {
    return this._useHiTech() || !!(this.twilioClient && this.twilioFrom);
  }

  /**
   * @param {string} phoneNumber - User phone (+91… or 10-digit Indian)
   * @param {string} userName - Used only when HITECH_SMS_MESSAGE_TEMPLATE contains {{name}}
   * @param {string} joinLink - Full join URL (default SMS body is this URL only)
   */
  async sendVerificationSMS(phoneNumber, userName, joinLink) {
    const pv = validateIndianMobile(phoneNumber);
    if (!pv.ok) {
      throw new Error(pv.error);
    }
    const contacts = pv.digits10;
    const displayName = (userName && String(userName).trim()) || 'User';

    if (this._useHiTech()) {
      const msgText = this.hitechMessageTemplate?.trim()
        ? this.hitechMessageTemplate
            .replace(/\{\{name\}\}/g, displayName)
            .replace(/\{\{link\}\}/g, joinLink)
        : joinLink;
      return this._sendHiTech(contacts, msgText);
    }

    if (this.twilioClient && this.twilioFrom) {
      return this._sendTwilio(pv.e164, joinLink);
    }

    throw new Error('SMS service not configured (HiTech or Twilio)');
  }

  _sendHiTech(contacts10, msgText) {
    const params = new URLSearchParams();
    params.set('key', this.hitechKey);
    params.set('campaign', this.hitechCampaign);
    params.set('routeid', String(this.hitechRouteId));
    params.set('type', 'text');
    params.set('contacts', contacts10);
    params.set('senderid', this.hitechSenderId);
    params.set('msg', msgText);
    params.set('time', '');
    params.set('template_id', this.hitechTemplateId || '');

    const body = params.toString();

    return new Promise((resolve, reject) => {
      const u = new URL(HITECH_URL);
      const req = https.request(
        {
          hostname: u.hostname,
          port: 443,
          path: u.pathname,
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Content-Length': Buffer.byteLength(body),
          },
        },
        (res) => {
          let data = '';
          res.on('data', (c) => {
            data += c;
          });
          res.on('end', () => {
            const text = (data || '').trim();
            if (text.startsWith('ERR:')) {
              console.error('HiTech SMS error response:', text);
              reject(new Error(text));
              return;
            }
            if (text.includes('SMS-SHOOT-ID')) {
              console.log('HiTech SMS OK:', text);
              const dltWarning =
                !this.hitechTemplateId || !String(this.hitechTemplateId).trim()
                  ? 'DLT: set HITECH_SMS_TEMPLATE_ID. SMS body is the join URL only — your approved DLT template must match exactly (or set HITECH_SMS_MESSAGE_TEMPLATE).'
                  : undefined;
              resolve({
                success: true,
                provider: 'hitech',
                response: text,
                contacts: contacts10,
                dltWarning,
              });
              return;
            }
            console.error('HiTech SMS unexpected response:', text);
            reject(new Error(text || 'Unknown SMS gateway response'));
          });
        }
      );
      req.on('error', (e) => {
        console.error('HiTech SMS request error:', e);
        reject(e);
      });
      req.write(body);
      req.end();
    });
  }

  async _sendTwilio(e164, joinLink) {
    const messageResponse = await this.twilioClient.messages.create({
      body: joinLink,
      from: this.twilioFrom,
      to: e164,
    });
    console.log(`Twilio SMS sent: ${messageResponse.sid}`);
    return {
      success: true,
      provider: 'twilio',
      messageSid: messageResponse.sid,
      status: messageResponse.status,
      to: e164,
    };
  }
}

module.exports = new SMSService();
