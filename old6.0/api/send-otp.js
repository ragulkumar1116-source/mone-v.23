/**
 * Vercel Serverless Function: Send OTP via Resend & Persist in Firebase RTDB
 * Endpoint: /api/send-otp
 */

const RESEND_API_KEY = process.env.RESEND_API_KEY || 're_RXFqdPKn_JNUiMbRaC4gwn4f4h8y8Zu2s';
const SENDER = process.env.RESEND_FROM || 'KRISHTECH Security <onboarding@resend.dev>';
const FIREBASE_RTDB_URL = 'https://hotel-c4382-default-rtdb.firebaseio.com';
const OTP_TTL = 10 * 60 * 1000; // 10 minutes

function getOtpEmailHTML(code, purposeText = 'verifying your account', recipientName = '') {
  const greeting = recipientName ? `Hello <strong>${recipientName}</strong>,` : 'Hello,';
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>KRISHTECH Verification</title></head>
<body style="margin: 0; padding: 0; background-color: #0b0f19; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #f8fafc;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #0b0f19; padding: 40px 15px;">
    <tr><td align="center">
      <table role="presentation" width="100%" style="max-width: 520px; background: linear-gradient(180deg, #161e2e 0%, #0f172a 100%); border: 1px solid rgba(255, 255, 255, 0.12); border-radius: 18px; overflow: hidden; box-shadow: 0 20px 50px rgba(0,0,0,0.6);">
        <tr>
          <td style="padding: 32px 32px 24px 32px; text-align: center; border-bottom: 1px solid rgba(255, 255, 255, 0.08);">
            <div style="font-size: 26px; font-weight: 800; color: #ffffff;">KRISH<span style="color: #6366f1;">TECH</span></div>
            <div style="font-size: 13px; color: #94a3b8; margin-top: 4px;">Money Manager Pro &bull; Security Verification</div>
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
          </td>
        </tr>
        <tr>
          <td style="padding: 20px 32px; background-color: rgba(0, 0, 0, 0.3); text-align: center; font-size: 12px; color: #64748b;">
            &copy; 2026 KRISHTECH Financial Systems &bull; Powered by Resend
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

module.exports = async (req, res) => {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const email = (body.email || '').trim().toLowerCase();
    const name = (body.name || '').trim();
    const purpose = (body.purpose || 'verification').trim();

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ success: false, message: 'A valid email address is required.' });
    }

    const cleanKey = email.replace(/[^a-z0-9]/g, '_');
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const purposeDesc = purpose === 'registration' ? 'verifying your new account' : 'resetting your password';

    // 1. Dispatch email via Resend API
    const resendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: SENDER,
        to: [email],
        subject: `Your KRISHTECH Security Code: ${code}`,
        html: getOtpEmailHTML(code, purposeDesc, name),
        text: `Your KRISHTECH verification code is: ${code}. Valid for 10 minutes.`
      })
    });

    const resendData = await resendRes.json().catch(() => ({}));

    if (!resendRes.ok) {
      console.error('[Resend Error]', resendData);
      return res.status(resendRes.status).json({
        success: false,
        message: resendData.message || 'Failed to dispatch email via Resend'
      });
    }

    // 2. Persist OTP in Firebase Realtime Database
    const now = Date.now();
    const record = {
      otp: code,
      email: email,
      purpose: purpose,
      createdAt: now,
      expiresAt: now + OTP_TTL,
      attempts: 0,
      verified: false
    };

    await fetch(`${FIREBASE_RTDB_URL}/otp_verifications/${cleanKey}.json`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(record)
    });

    return res.status(200).json({
      success: true,
      message: `Verification code sent to your Gmail (${email}). Please check your inbox.`,
      otpExpiryMs: OTP_TTL,
      resendId: resendData.id
    });
  } catch (error) {
    console.error('[Serverless Send Error]', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};
