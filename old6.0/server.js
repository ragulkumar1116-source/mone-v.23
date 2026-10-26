/**
 * KRISHTECH Money Manager Pro - Resend Web & OTP Server
 * Delivers transactional emails & OTP verification codes via Resend API
 */

const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');

const app = express();
const STATIC_DIR = __dirname;

// Resend Configuration
const RESEND_API_KEY = (process.env.RESEND_API_KEY || 're_RXFqdPKn_JNUiMbRaC4gwn4f4h8y8Zu2s').trim();
const RESEND_FROM = (process.env.RESEND_FROM || 'KRISHTECH Security <onboarding@resend.dev>').trim();
const PORT = parseInt(process.env.PORT, 10) || 7000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// OTP In-Memory Storage
const OTP_TTL = 10 * 60 * 1000;  // 10 minutes
const RESEND_WAIT = 30 * 1000;   // 30 seconds
const MAX_ATTEMPTS = 5;

const otpStore = new Map();
const lastSent = new Map();

/**
 * Deliver email via Resend REST API v1
 */
async function sendResendEmail({ to, subject, html, text }) {
  if (!RESEND_API_KEY) {
    throw new Error('Resend API key is not configured.');
  }

  const payload = {
    from: RESEND_FROM,
    to: Array.isArray(to) ? to : [to],
    subject: subject,
    html: html
  };
  if (text) payload.text = text;

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    const errorMsg = data.message || `Resend API error (${res.status})`;
    throw new Error(errorMsg);
  }

  return data;
}

function getOtpEmailHTML(code, purposeText = 'verifying your account', recipientName = '') {
  const greeting = recipientName ? `Hello <strong>${recipientName}</strong>,` : 'Hello,';
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>KRISHTECH Verification</title>
</head>
<body style="margin: 0; padding: 0; background-color: #0b0f19; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #f8fafc;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #0b0f19; padding: 40px 15px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" style="max-width: 520px; background: linear-gradient(180deg, #161e2e 0%, #0f172a 100%); border: 1px solid rgba(255, 255, 255, 0.12); border-radius: 18px; overflow: hidden; box-shadow: 0 20px 50px rgba(0,0,0,0.6);">
          <tr>
            <td style="padding: 32px 32px 24px 32px; text-align: center; border-bottom: 1px solid rgba(255, 255, 255, 0.08);">
              <div style="font-size: 26px; font-weight: 800; color: #ffffff;">
                KRISH<span style="color: #6366f1;">TECH</span>
              </div>
              <div style="font-size: 13px; color: #94a3b8; margin-top: 4px;">
                Money Manager Pro &bull; Security Verification
              </div>
            </td>
          </tr>
          <tr>
            <td style="padding: 32px;">
              <p style="margin: 0 0 16px 0; font-size: 16px; color: #e2e8f0;">${greeting}</p>
              <p style="margin: 0 0 24px 0; font-size: 15px; color: #94a3b8; line-height: 1.6;">
                You recently requested a security verification code for <strong>${purposeText}</strong>. Please use the 6-digit One-Time Password below:
              </p>
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin: 28px 0;">
                <tr>
                  <td align="center">
                    <div style="display: inline-block; background: rgba(99, 102, 241, 0.12); border: 2px dashed #6366f1; border-radius: 14px; padding: 18px 36px; text-align: center;">
                      <span style="font-family: monospace; font-size: 38px; font-weight: 800; letter-spacing: 10px; color: #a5b4fc; display: block; margin-left: 10px;">
                        ${code}
                      </span>
                    </div>
                  </td>
                </tr>
              </table>
              <p style="margin: 0 0 20px 0; font-size: 13px; color: #fbbf24; text-align: center;">
                &bull; This code is valid for <strong>10 minutes</strong>. Do not share this code.
              </p>
              <p style="margin: 0; font-size: 13px; color: #64748b; border-top: 1px solid rgba(255, 255, 255, 0.08); padding-top: 20px;">
                If you did not request this, please secure your account immediately.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding: 20px 32px; background-color: rgba(0, 0, 0, 0.3); text-align: center; font-size: 12px; color: #64748b;">
              &copy; 2026 KRISHTECH Financial Systems &bull; Powered by Resend
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

// ==========================================
// REST API ENDPOINTS
// ==========================================

// 1. Health & Status
app.get('/api/status', (req, res) => {
  res.json({
    status: 'online',
    provider: 'Resend',
    configured: Boolean(RESEND_API_KEY),
    sender: RESEND_FROM,
    port: PORT
  });
});

// 2. Send 6-Digit OTP Email via Resend
app.post('/api/send-otp', async (req, res) => {
  try {
    const email = (req.body.email || '').trim().toLowerCase();
    const name = (req.body.name || '').trim();
    const purpose = (req.body.purpose || 'verification').trim();

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ success: false, message: 'A valid email address is required.' });
    }

    const now = Date.now();
    const prev = lastSent.get(email) || 0;
    if (now - prev < RESEND_WAIT) {
      const remaining = Math.ceil((RESEND_WAIT - (now - prev)) / 1000);
      return res.status(429).json({
        success: false,
        message: `Please wait ${remaining} seconds before requesting a new code.`
      });
    }

    const code = crypto.randomInt(100000, 999999).toString();
    const purposeDesc = purpose === 'registration' ? 'verifying your new account' : 'resetting your password';
    const subject = `Your KRISHTECH Security Code: ${code}`;
    const html = getOtpEmailHTML(code, purposeDesc, name);

    // Send via Resend to Gmail only
    const resendResult = await sendResendEmail({
      to: email,
      subject: subject,
      html: html,
      text: `Your KRISHTECH verification code is: ${code}. Valid for 10 minutes.`
    });
    console.log(`[Resend] OTP successfully delivered to Gmail (${email}):`, resendResult.id);

    lastSent.set(email, now);
    const hash = crypto.createHash('sha256').update(code).digest('hex');
    otpStore.set(email, {
      code,
      hash,
      purpose,
      expires: now + OTP_TTL,
      attempts: 0
    });

    return res.json({
      success: true,
      message: `Verification code sent to your Gmail (${email}). Please check your inbox.`,
      otpExpiryMs: OTP_TTL,
      resendId: resendResult.id
    });
  } catch (error) {
    console.error('[Resend] Send OTP error:', error);
    return res.status(500).json({
      success: false,
      message: `Failed to dispatch OTP: ${error.message}`
    });
  }
});

// 3. Verify OTP Code
app.post('/api/verify-otp', (req, res) => {
  const email = (req.body.email || '').trim().toLowerCase();
  const enteredCode = (req.body.otp || '').trim();
  const purpose = (req.body.purpose || '').trim();

  if (!email || !enteredCode) {
    return res.status(400).json({ success: false, message: 'Email and 6-digit OTP code are required.' });
  }

  const now = Date.now();
  const record = otpStore.get(email);

  if (!record) {
    return res.status(400).json({
      success: false,
      message: 'No active verification code found for this email. Please request a new one.'
    });
  }

  if (now > record.expires) {
    otpStore.delete(email);
    return res.status(400).json({
      success: false,
      message: 'Verification code has expired. Please request a fresh code.'
    });
  }

  if (purpose && record.purpose && record.purpose !== purpose) {
    return res.status(400).json({
      success: false,
      message: 'Invalid code purpose. Please request a new code.'
    });
  }

  if (record.attempts >= MAX_ATTEMPTS) {
    otpStore.delete(email);
    return res.status(429).json({
      success: false,
      message: 'Too many failed attempts. Please request a new verification code.'
    });
  }

  record.attempts += 1;

  const enteredHash = crypto.createHash('sha256').update(enteredCode).digest('hex');
  const match = crypto.timingSafeEqual(Buffer.from(enteredHash), Buffer.from(record.hash));

  if (!match) {
    const remaining = MAX_ATTEMPTS - record.attempts;
    return res.status(400).json({
      success: false,
      message: `Incorrect verification code. ${remaining} attempt(s) remaining.`
    });
  }

  otpStore.delete(email);
  return res.json({
    success: true,
    verified: true,
    email: email,
    message: 'Email verified successfully.'
  });
});

// 4. Send Custom Email via Resend
app.post('/api/send-email', async (req, res) => {
  try {
    const to = (req.body.to || req.body.recipient || '').trim().toLowerCase();
    const subject = (req.body.subject || 'KRISHTECH Notification').trim();
    const html = req.body.htmlContent || req.body.html || '';

    if (!to || !html) {
      return res.status(400).json({ success: false, message: 'Recipient and content are required.' });
    }

    const result = await sendResendEmail({ to, subject, html });
    return res.json({ success: true, message: 'Email sent via Resend.', id: result.id });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

// Static File Hosting
app.use(express.static(STATIC_DIR));
app.get('/', (req, res) => res.sendFile(path.join(STATIC_DIR, 'index.html')));
app.use((req, res) => {
  const filePath = path.join(STATIC_DIR, req.path);
  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    return res.sendFile(filePath);
  }
  res.sendFile(path.join(STATIC_DIR, 'index.html'));
});

// Start Server
app.listen(PORT, '127.0.0.1', () => {
  console.log('='.repeat(60));
  console.log('  KRISHTECH Money Manager Pro - Resend Web & OTP Server');
  console.log(`  Provider: Resend (https://resend.com)`);
  console.log(`  Sender:   ${RESEND_FROM}`);
  console.log(`  URL:      http://127.0.0.1:${PORT}`);
  console.log('='.repeat(60));
});
