const DEFAULT_BREVO_CONFIG = {
  apiKey: "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",
  senderEmail: "ragulkumar1116@gmail.com",
  senderName: "KRISHTECH Security",
  otpExpiryMs: 10 * 60 * 1000
};// Money Manager Pro / KRISHTECH - Brevo Email & OTP Service
// Integrates Brevo (formerly Sendinblue) REST API v3 with Firebase Realtime Database

(function(window) {
  'use strict';

  // ==========================================
  // DEFAULT BREVO CONFIGURATION
  // (Can also be dynamically updated via Admin Console & Firebase RTDB)
  // ==========================================
  const DEFAULT_BREVO_CONFIG = {
    // You can set your Brevo API key here or configure via Admin Settings -> Brevo Email
    apiKey: "", 
    // Verified sender email in your Brevo account (e.g. aitsecurity6@gmail.com)
    senderEmail: "aitsecurity6@gmail.com",
    // Sender display name
    senderName: "KRISHTECH Security",
    // OTP validity duration in milliseconds (default 10 minutes)
    otpExpiryMs: 10 * 60 * 1000
  };

  let activeConfig = { ...DEFAULT_BREVO_CONFIG };

  // Load configuration from localStorage or Firebase RTDB if available
  try {
    const savedLocal = localStorage.getItem("mmp_brevo_config");
    if (savedLocal) {
      activeConfig = { ...activeConfig, ...JSON.parse(savedLocal) };
    }
  } catch (e) {}

  // Helper to sanitize email for RTDB keys (Firebase RTDB keys cannot contain '.', '#', '$', '[', or ']')
  function sanitizeEmailKey(email) {
    return (email || "").trim().toLowerCase().replace(/[^a-z0-9]/g, "_");
  }

  // ==========================================
  // CONFIGURATION HELPERS
  // ==========================================
  function isConfigured() {
    const apiKey = activeConfig.apiKey ? activeConfig.apiKey.trim() : "";
    return !!apiKey && !apiKey.startsWith("YOUR_") && apiKey.length >= 10;
  }

  function getConfig() {
    return { ...activeConfig };
  }

  function setConfig(newConfig) {
    activeConfig = { ...activeConfig, ...newConfig };
    try {
      localStorage.setItem("mmp_brevo_config", JSON.stringify(activeConfig));
    } catch (e) {}
  }

  // Listen to system_settings/brevo from Firebase RTDB
  function initRTDBListener(database) {
    if (!database) return;
    try {
      database.ref("system_settings/brevo").on("value", (snap) => {
        const val = snap.val();
        if (val && typeof val === "object") {
          setConfig(val);
          console.log("[BrevoService] Loaded dynamic configuration from Firebase RTDB");
        }
      });
    } catch (err) {
      console.warn("[BrevoService] Could not attach RTDB config listener:", err);
    }
  }

  // ==========================================
  // CORE EMAIL SENDER (BREVO API v3)
  // ==========================================
  async function sendEmail({ to, toName = "", subject, htmlContent }) {
    if (!to) {
      throw new Error("Recipient email address is required.");
    }

    const apiKey = activeConfig.apiKey ? activeConfig.apiKey.trim() : "";
    const senderEmail = activeConfig.senderEmail ? activeConfig.senderEmail.trim() : "";
    const senderName = activeConfig.senderName ? activeConfig.senderName.trim() : "KRISHTECH Security";

    // Require configured Brevo API Key
    if (!apiKey || apiKey.startsWith("YOUR_") || apiKey.length < 10) {
      throw new Error("Brevo API key is not configured. Please enter your Brevo API key in Admin Settings.");
    }

    const payload = {
      sender: {
        name: senderName,
        email: senderEmail
      },
      to: [
        {
          email: to.trim().toLowerCase(),
          name: toName || to.split("@")[0]
        }
      ],
      subject: subject,
      htmlContent: htmlContent
    };

    try {
      const response = await fetch("https://api.brevo.com/v3/smtp/email", {
        method: "POST",
        headers: {
          "Accept": "application/json",
          "Content-Type": "application/json",
          "api-key": apiKey
        },
        body: JSON.stringify(payload)
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        const errMsg = data.message || `Brevo API error (${response.status}): ${response.statusText}`;
        console.error("[BrevoService] Send failed:", data);
        throw new Error(errMsg);
      }

      console.log("[BrevoService] Email sent successfully via Brevo:", data.messageId || data);
      return {
        success: true,
        messageId: data.messageId,
        message: "Email sent successfully."
      };
    } catch (error) {
      console.error("[BrevoService] Error sending email via Brevo:", error);
      throw error;
    }
  }

  // ==========================================
  // BEAUTIFULLY BRANDED EMAIL TEMPLATES
  // ==========================================
  function getOtpEmailHTML(otp, purposeText, recipientName = "") {
    const greeting = recipientName ? `Hello <strong>${recipientName}</strong>,` : "Hello,";
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Your Verification Code</title>
      </head>
      <body style="margin: 0; padding: 0; background-color: #0f172a; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #f8fafc;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #0f172a; padding: 40px 15px;">
          <tr>
            <td align="center">
              <table role="presentation" width="100%" style="max-width: 520px; background: linear-gradient(180deg, #1e293b 0%, #0f172a 100%); border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 16px; overflow: hidden; box-shadow: 0 20px 40px rgba(0,0,0,0.5);">
                <!-- Header -->
                <tr>
                  <td style="padding: 32px 32px 20px 32px; text-align: center; border-bottom: 1px solid rgba(255, 255, 255, 0.08);">
                    <div style="display: inline-block; font-size: 24px; font-weight: 800; letter-spacing: -0.5px; color: #ffffff;">
                      KRISH<span style="color: #6366f1;">TECH</span>
                    </div>
                    <div style="font-size: 13px; color: #94a3b8; margin-top: 4px; font-weight: 500;">
                      Money Manager Pro &bull; Security Verification
                    </div>
                  </td>
                </tr>

                <!-- Content -->
                <tr>
                  <td style="padding: 32px;">
                    <p style="margin: 0 0 16px 0; font-size: 16px; color: #e2e8f0; line-height: 1.5;">
                      ${greeting}
                    </p>
                    <p style="margin: 0 0 24px 0; font-size: 15px; color: #94a3b8; line-height: 1.6;">
                      You recently requested a verification code for <strong>${purposeText}</strong>. Please use the 6-digit One-Time Password (OTP) below to proceed.
                    </p>

                    <!-- OTP Box -->
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin: 24px 0;">
                      <tr>
                        <td align="center">
                          <div style="display: inline-block; background: rgba(99, 102, 241, 0.12); border: 2px dashed #6366f1; border-radius: 12px; padding: 18px 36px; text-align: center;">
                            <span style="font-family: 'Courier New', Courier, monospace; font-size: 36px; font-weight: 800; letter-spacing: 8px; color: #a5b4fc; display: block; margin-left: 8px;">
                              ${otp}
                            </span>
                          </div>
                        </td>
                      </tr>
                    </table>

                    <p style="margin: 0 0 20px 0; font-size: 13px; color: #f59e0b; text-align: center; line-height: 1.4;">
                      &bull; This code is valid for <strong>10 minutes</strong>. Do not share this code with anyone.
                    </p>

                    <p style="margin: 0; font-size: 13px; color: #64748b; line-height: 1.5; border-top: 1px solid rgba(255, 255, 255, 0.08); padding-top: 20px;">
                      If you did not request this verification code, please ignore this email or update your account credentials immediately.
                    </p>
                  </td>
                </tr>

                <!-- Footer -->
                <tr>
                  <td style="padding: 20px 32px; background-color: rgba(0, 0, 0, 0.25); text-align: center; font-size: 12px; color: #64748b; border-top: 1px solid rgba(255, 255, 255, 0.05);">
                    &copy; 2026 KRISHTECH. All rights reserved. &bull; Automated Security Service
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
      </html>
    `;
  }

  function getPasswordResetSuccessHTML(recipientName = "") {
    const greeting = recipientName ? `Hello <strong>${recipientName}</strong>,` : "Hello,";
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Password Reset Successful</title>
      </head>
      <body style="margin: 0; padding: 0; background-color: #0f172a; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #f8fafc;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #0f172a; padding: 40px 15px;">
          <tr>
            <td align="center">
              <table role="presentation" width="100%" style="max-width: 520px; background: linear-gradient(180deg, #1e293b 0%, #0f172a 100%); border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 16px; overflow: hidden; box-shadow: 0 20px 40px rgba(0,0,0,0.5);">
                <tr>
                  <td style="padding: 32px 32px 20px 32px; text-align: center; border-bottom: 1px solid rgba(255, 255, 255, 0.08);">
                    <div style="font-size: 24px; font-weight: 800; color: #ffffff;">
                      KRISH<span style="color: #10b981;">TECH</span>
                    </div>
                    <div style="font-size: 13px; color: #94a3b8; margin-top: 4px;">Security Notification</div>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 32px;">
                    <p style="margin: 0 0 16px 0; font-size: 16px; color: #e2e8f0;">${greeting}</p>
                    <div style="background: rgba(16, 185, 129, 0.12); border: 1px solid #10b981; border-radius: 12px; padding: 16px; text-align: center; margin-bottom: 20px;">
                      <span style="font-size: 16px; font-weight: 700; color: #34d399; display: block;">
                        ✓ Password Changed Successfully
                      </span>
                    </div>
                    <p style="margin: 0 0 16px 0; font-size: 14px; color: #94a3b8; line-height: 1.6;">
                      The password for your KRISHTECH Money Manager account was recently changed. You can now use your new password to sign in.
                    </p>
                    <p style="margin: 0; font-size: 13px; color: #ef4444; line-height: 1.5; border-top: 1px solid rgba(255, 255, 255, 0.08); padding-top: 16px;">
                      If you did not perform this action, please contact support or reset your password immediately.
                    </p>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 16px; background-color: rgba(0, 0, 0, 0.25); text-align: center; font-size: 12px; color: #64748b;">
                    &copy; 2026 KRISHTECH Money Manager Pro
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
      </html>
    `;
  }

  // ==========================================
  // OTP GENERATION & DATABASE VERIFICATION
  // ==========================================

  // Generate a random 6-digit number
  function generateOTP() {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  // Store OTP in Firebase Realtime Database
  async function storeOTP(database, email, otp, purpose) {
    const cleanEmail = (email || "").trim().toLowerCase();
    const cleanKey = sanitizeEmailKey(cleanEmail);
    const now = Date.now();
    const expiresAt = now + (activeConfig.otpExpiryMs || 10 * 60 * 1000);

    const record = {
      email: cleanEmail,
      otp: otp,
      purpose: purpose, // "password_reset" or "registration"
      createdAt: now,
      expiresAt: expiresAt,
      verified: false,
      attempts: 0
    };

    // Store in Firebase Realtime Database
    if (database) {
      try {
        await database.ref(`otp_verifications/${cleanKey}`).set(record);
      } catch (err) {
        console.warn("[BrevoService] RTDB set OTP warning:", err);
      }
    }

    // Always keep in localStorage as reliable fallback
    try {
      const allOtps = JSON.parse(localStorage.getItem("mmp_otps") || "{}");
      allOtps[cleanKey] = record;
      localStorage.setItem("mmp_otps", JSON.stringify(allOtps));
    } catch (e) {}

    return record;
  }

  // Verify OTP from Firebase Realtime Database
  async function verifyOTP(database, email, enteredOtp, purpose) {
    const cleanEmail = (email || "").trim().toLowerCase();
    const cleanKey = sanitizeEmailKey(cleanEmail);
    const cleanEntered = (enteredOtp || "").toString().trim();

    if (!cleanEntered || cleanEntered.length !== 6) {
      throw new Error("Please enter a valid 6-digit verification code.");
    }

    let record = null;

    // Check Firebase Realtime Database first
    if (database) {
      try {
        const snap = await database.ref(`otp_verifications/${cleanKey}`).once("value");
        record = snap.val();
      } catch (err) {
        console.warn("[BrevoService] RTDB fetch OTP warning:", err);
      }
    }

    // Fallback to localStorage if needed
    if (!record) {
      try {
        const allOtps = JSON.parse(localStorage.getItem("mmp_otps") || "{}");
        record = allOtps[cleanKey];
      } catch (e) {}
    }

    if (!record) {
      throw new Error("No verification code found. Please request a new code.");
    }

    if (purpose && record.purpose && record.purpose !== purpose) {
      throw new Error("Invalid verification code purpose. Please request a new code.");
    }

    // Expiry check
    if (Date.now() > record.expiresAt) {
      throw new Error("Verification code has expired. Please request a new one.");
    }

    // Max attempts check
    if ((record.attempts || 0) >= 5) {
      throw new Error("Too many failed attempts. Please request a fresh verification code.");
    }

    // Match check
    if (record.otp.trim() !== cleanEntered) {
      const newAttempts = (record.attempts || 0) + 1;
      
      // Update attempts in RTDB
      if (database) {
        try {
          await database.ref(`otp_verifications/${cleanKey}/attempts`).set(newAttempts);
        } catch (e) {}
      }
      try {
        const allOtps = JSON.parse(localStorage.getItem("mmp_otps") || "{}");
        if (allOtps[cleanKey]) {
          allOtps[cleanKey].attempts = newAttempts;
          localStorage.setItem("mmp_otps", JSON.stringify(allOtps));
        }
      } catch (e) {}

      const remaining = 5 - newAttempts;
      throw new Error(`Incorrect verification code. ${remaining} attempt(s) remaining.`);
    }

    // Mark as verified
    record.verified = true;
    record.verifiedAt = Date.now();

    if (database) {
      try {
        await database.ref(`otp_verifications/${cleanKey}`).update({
          verified: true,
          verifiedAt: record.verifiedAt
        });
      } catch (e) {}
    }

    try {
      const allOtps = JSON.parse(localStorage.getItem("mmp_otps") || "{}");
      if (allOtps[cleanKey]) {
        allOtps[cleanKey].verified = true;
        allOtps[cleanKey].verifiedAt = record.verifiedAt;
        localStorage.setItem("mmp_otps", JSON.stringify(allOtps));
      }
    } catch (e) {}

    return {
      success: true,
      email: cleanEmail,
      verified: true
    };
  }

  // Clean up / remove OTP record after completed operation
  async function clearOTP(database, email) {
    const cleanEmail = (email || "").trim().toLowerCase();
    const cleanKey = sanitizeEmailKey(cleanEmail);

    if (database) {
      try {
        await database.ref(`otp_verifications/${cleanKey}`).remove();
      } catch (e) {}
    }

    try {
      const allOtps = JSON.parse(localStorage.getItem("mmp_otps") || "{}");
      delete allOtps[cleanKey];
      localStorage.setItem("mmp_otps", JSON.stringify(allOtps));
    } catch (e) {}
  }

  // ==========================================
  // HIGH-LEVEL WORKFLOWS
  // ==========================================

  // 1. Send OTP for Password Reset
  async function sendPasswordResetOTP(database, email, recipientName = "") {
    const cleanEmail = (email || "").trim().toLowerCase();
    if (!cleanEmail) throw new Error("Email address is required.");

    const otp = generateOTP();
    await storeOTP(database, cleanEmail, otp, "password_reset");

    const subject = `Your KRISHTECH Password Reset Code: ${otp}`;
    const htmlContent = getOtpEmailHTML(otp, "resetting your password", recipientName);

    await sendEmail({
      to: cleanEmail,
      toName: recipientName,
      subject: subject,
      htmlContent: htmlContent
    });

    return {
      success: true,
      message: `Verification code sent to ${cleanEmail}. Please check your inbox.`
    };
  }

  // 2. Send OTP for New User Registration
  async function sendRegistrationOTP(database, email, name = "") {
    const cleanEmail = (email || "").trim().toLowerCase();
    if (!cleanEmail) throw new Error("Email address is required.");

    const otp = generateOTP();
    await storeOTP(database, cleanEmail, otp, "registration");

    const subject = `Your KRISHTECH Email Verification Code: ${otp}`;
    const htmlContent = getOtpEmailHTML(otp, "verifying your new account", name);

    await sendEmail({
      to: cleanEmail,
      toName: name,
      subject: subject,
      htmlContent: htmlContent
    });

    return {
      success: true,
      message: `Verification code sent to ${cleanEmail}. Please check your inbox.`
    };
  }

  // 3. Send Password Change Confirmation
  async function sendPasswordChangedNotification(email, name = "") {
    try {
      const cleanEmail = (email || "").trim().toLowerCase();
      const subject = "Security Alert: KRISHTECH Password Changed Successfully";
      const htmlContent = getPasswordResetSuccessHTML(name);
      await sendEmail({
        to: cleanEmail,
        toName: name,
        subject: subject,
        htmlContent: htmlContent
      });
    } catch (e) {
      console.warn("[BrevoService] Confirmation email warning:", e);
    }
  }

  // 4. Test Brevo API Connection
  async function testConnection(testToEmail) {
    const cleanTo = (testToEmail || "").trim().toLowerCase() || activeConfig.senderEmail;
    const testOtp = generateOTP();
    const subject = `[Test] KRISHTECH Brevo API Connection Test (${testOtp})`;
    const html = getOtpEmailHTML(testOtp, "testing the Brevo email integration", "Administrator");

    return await sendEmail({
      to: cleanTo,
      toName: "System Admin",
      subject: subject,
      htmlContent: html
    });
  }

  // Export to Global namespace
  window.MMP_Brevo = {
    isConfigured,
    getConfig,
    setConfig,
    initRTDBListener,
    sendEmail,
    generateOTP,
    storeOTP,
    verifyOTP,
    clearOTP,
    sendPasswordResetOTP,
    sendRegistrationOTP,
    sendPasswordChangedNotification,
    testConnection,
    sanitizeEmailKey
  };

})(window);
