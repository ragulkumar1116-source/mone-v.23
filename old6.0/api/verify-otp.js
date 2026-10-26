/**
 * Vercel Serverless Function: Verify OTP from Firebase Realtime Database
 * Endpoint: /api/verify-otp
 */

const FIREBASE_RTDB_URL = 'https://hotel-c4382-default-rtdb.firebaseio.com';
const MAX_ATTEMPTS = 5;

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
    const enteredCode = (body.otp || '').trim();
    const purpose = (body.purpose || '').trim();

    if (!email || !enteredCode) {
      return res.status(400).json({ success: false, message: 'Email and 6-digit OTP code are required.' });
    }

    const cleanKey = email.replace(/[^a-z0-9]/g, '_');
    const rtdbKeyUrl = `${FIREBASE_RTDB_URL}/otp_verifications/${cleanKey}.json`;

    // Fetch stored record from Firebase RTDB
    const snap = await fetch(rtdbKeyUrl);
    const record = await snap.json().catch(() => null);

    if (!record) {
      return res.status(400).json({
        success: false,
        message: 'No active verification code found for this email. Please request a new code.'
      });
    }

    const now = Date.now();

    // Check expiration
    if (now > (record.expiresAt || 0)) {
      await fetch(rtdbKeyUrl, { method: 'DELETE' });
      return res.status(400).json({
        success: false,
        message: 'Verification code has expired. Please request a fresh code.'
      });
    }

    // Check purpose
    if (purpose && record.purpose && record.purpose !== purpose) {
      return res.status(400).json({
        success: false,
        message: 'Invalid code purpose. Please request a new code.'
      });
    }

    // Check attempts limit
    const attempts = (record.attempts || 0) + 1;
    if (attempts > MAX_ATTEMPTS) {
      await fetch(rtdbKeyUrl, { method: 'DELETE' });
      return res.status(429).json({
        success: false,
        message: 'Too many failed attempts. Please request a new verification code.'
      });
    }

    // Code match
    if (record.otp.trim() !== enteredCode) {
      await fetch(rtdbKeyUrl, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ attempts: attempts })
      });
      const remaining = MAX_ATTEMPTS - attempts;
      return res.status(400).json({
        success: false,
        message: `Incorrect verification code. ${remaining} attempt(s) remaining.`
      });
    }

    // Successfully verified!
    await fetch(rtdbKeyUrl, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ verified: true, verifiedAt: now })
    });

    return res.status(200).json({
      success: true,
      verified: true,
      email: email,
      message: 'Email verified successfully.'
    });
  } catch (error) {
    console.error('[Serverless Verify Error]', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};
