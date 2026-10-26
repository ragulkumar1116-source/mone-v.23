/**
 * KRISHTECH - Resend Email Delivery Test Script
 * Run with: node test-resend.js [recipient@email.com]
 */

const RESEND_API_KEY = process.env.RESEND_API_KEY || 're_RXFqdPKn_JNUiMbRaC4gwn4f4h8y8Zu2s';
const RECIPIENT = process.argv[2] || 'ragulkumar1116@gmail.com';
const SENDER = process.env.RESEND_FROM || 'KRISHTECH Security <onboarding@resend.dev>';

async function sendTestEmail() {
  console.log('='.repeat(60));
  console.log(' KRISHTECH - Testing Resend Email API');
  console.log(` API Key:   ${RESEND_API_KEY.slice(0, 7)}...${RESEND_API_KEY.slice(-5)}`);
  console.log(` Sender:    ${SENDER}`);
  console.log(` Recipient: ${RECIPIENT}`);
  console.log('='.repeat(60));

  const testCode = Math.floor(100000 + Math.random() * 900000).toString();

  const payload = {
    from: SENDER,
    to: [RECIPIENT],
    subject: `Your KRISHTECH Security Code: ${testCode}`,
    html: `
      <div style="font-family: Arial, sans-serif; background: #0f172a; color: #f8fafc; padding: 30px; border-radius: 12px; max-width: 500px; margin: 0 auto;">
        <h2 style="color: #ffffff; margin-top: 0;">KRISH<span style="color: #6366f1;">TECH</span></h2>
        <p style="color: #94a3b8; font-size: 14px;">Money Manager Pro &bull; Security Verification</p>
        <hr style="border: none; border-top: 1px solid rgba(255,255,255,0.1); margin: 20px 0;">
        <p>Hello,</p>
        <p>Your one-time verification code is:</p>
        <div style="background: rgba(99, 102, 241, 0.15); border: 2px dashed #6366f1; border-radius: 8px; padding: 16px; text-align: center; margin: 20px 0;">
          <span style="font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #a5b4fc;">${testCode}</span>
        </div>
        <p style="color: #f59e0b; font-size: 13px;">This code is valid for 10 minutes. Do not share this code.</p>
        <hr style="border: none; border-top: 1px solid rgba(255,255,255,0.1); margin: 20px 0;">
        <p style="color: #64748b; font-size: 12px; text-align: center;">&copy; 2026 KRISHTECH. All rights reserved.</p>
      </div>
    `
  };

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('\n❌ Resend API Error:', data);
      process.exit(1);
    }

    console.log('\n✅ Email sent successfully via Resend!');
    console.log('   Message ID:', data.id);
    console.log(`   Delivered to: ${RECIPIENT}\n`);
  } catch (error) {
    console.error('\n❌ Network or script error:', error.message);
    process.exit(1);
  }
}

sendTestEmail();
