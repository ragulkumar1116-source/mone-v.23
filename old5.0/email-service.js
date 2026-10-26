// Money Manager Pro / KRISHTECH - Gmail SMTP & Flask OTP Service
// Integrates Flask Gmail OTP API (port 7000) with Firebase Realtime Database & localStorage

(function(window) {
  'use strict';

  // ==========================================
  // CONFIGURATION & BACKEND ENDPOINT
  // ==========================================
  const DEFAULT_CONFIG = {
    senderEmail: "ragulkumar1116@gmail.com",
    senderName: "KRISHTECH Security",
    otpExpiryMs: 10 * 60 * 1000, // 10 minutes
    apiBaseUrl: "http://127.0.0.1:7000"
  };

  let activeConfig = { ...DEFAULT_CONFIG };

  // Load configuration from localStorage if available
  try {
    const savedLocal = localStorage.getItem("mmp_otp_config") || localStorage.getItem("mmp_brevo_config");
    if (savedLocal) {
      activeConfig = { ...activeConfig, ...JSON.parse(savedLocal) };
    }
  } catch (e) {}

  // Helper to determine active API base URL
  function getApiBaseUrl() {
    if (activeConfig.apiBaseUrl && activeConfig.apiBaseUrl.trim()) {
      return activeConfig.apiBaseUrl.trim().replace(/\/+$/, "");
    }
    // If running in browser and already on port 7000, use origin
    if (window.location && window.location.origin && window.location.port === "7000") {
      return window.location.origin;
    }
    return "http://127.0.0.1:7000";
  }

  // Helper to sanitize email for RTDB keys (Firebase RTDB keys cannot contain '.', '#', '$', '[', or ']')
  function sanitizeEmailKey(email) {
    return (email || "").trim().toLowerCase().replace(/[^a-z0-9]/g, "_");
  }

  // ==========================================
  // CONFIGURATION HELPERS
  // ==========================================
  function isConfigured() {
    // Gmail OTP service is active and ready
    return true;
  }

  function getConfig() {
    return { ...activeConfig };
  }

  function setConfig(newConfig) {
    activeConfig = { ...activeConfig, ...newConfig };
    try {
      localStorage.setItem("mmp_otp_config", JSON.stringify(activeConfig));
    } catch (e) {}
  }

  // Listen to system_settings from Firebase RTDB
  function initRTDBListener(database) {
    if (!database) return;
    try {
      database.ref("system_settings/email").on("value", (snap) => {
        const val = snap.val();
        if (val && typeof val === "object") {
          setConfig(val);
          console.log("[OTPService] Loaded dynamic configuration from Firebase RTDB");
        }
      });
    } catch (err) {
      console.warn("[OTPService] Could not attach RTDB config listener:", err);
    }
  }

  // ==========================================
  // CORE EMAIL SENDER (VIA FLASK GMAIL SMTP)
  // ==========================================
  async function sendEmail({ to, toName = "", subject, htmlContent, textContent = "" }) {
    if (!to) {
      throw new Error("Recipient email address is required.");
    }

    const apiBase = getApiBaseUrl();
    const payload = {
      to: to.trim().toLowerCase(),
      toName: toName || to.split("@")[0],
      subject: subject,
      htmlContent: htmlContent,
      textContent: textContent
    };

    try {
      const response = await fetch(`${apiBase}/api/send-email`, {
        method: "POST",
        headers: {
          "Accept": "application/json",
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok || data.success === false) {
        const errMsg = data.message || `Server error (${response.status}): ${response.statusText}`;
        console.error("[OTPService] Send failed:", data);
        throw new Error(errMsg);
      }

      console.log("[OTPService] Email sent successfully via Gmail SMTP:", data);
      return {
        success: true,
        message: data.message || "Email sent successfully."
      };
    } catch (error) {
      console.error("[OTPService] Error sending email:", error);
      if (error.message && (error.message.includes("Failed to fetch") || error.message.includes("NetworkError"))) {
        throw new Error(`OTP server is not reachable at ${apiBase}. Please start 'run.bat' in the project directory.`);
      }
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

  // Store OTP record locally and in RTDB
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
        console.warn("[OTPService] RTDB set OTP warning:", err);
      }
    }

    // Also keep in localStorage
    try {
      const allOtps = JSON.parse(localStorage.getItem("mmp_otps") || "{}");
      allOtps[cleanKey] = record;
      localStorage.setItem("mmp_otps", JSON.stringify(allOtps));
    } catch (e) {}

    return record;
  }

  // Verify OTP via Flask backend and RTDB
  async function verifyOTP(database, email, enteredOtp, purpose) {
    const cleanEmail = (email || "").trim().toLowerCase();
    const cleanKey = sanitizeEmailKey(cleanEmail);
    const cleanEntered = (enteredOtp || "").toString().trim();

    if (!cleanEntered || cleanEntered.length !== 6) {
      throw new Error("Please enter a valid 6-digit verification code.");
    }

    const apiBase = getApiBaseUrl();
    let verified = false;

    // 1. Verify with Flask backend
    try {
      const res = await fetch(`${apiBase}/api/verify-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: cleanEmail,
          otp: cleanEntered,
          purpose: purpose || ""
        })
      });

      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        verified = true;
      } else {
        throw new Error(data.message || "Invalid verification code.");
      }
    } catch (apiErr) {
      // If network failure connecting to Flask, fallback to RTDB/local verification
      if (apiErr.message && (apiErr.message.includes("Failed to fetch") || apiErr.message.includes("NetworkError"))) {
        console.warn("[OTPService] Backend unreachable, falling back to local/RTDB check");
        verified = await verifyOTPLocal(database, cleanEmail, cleanEntered, purpose);
      } else {
        throw apiErr;
      }
    }

    // Mark as verified in RTDB & localStorage
    if (database) {
      try {
        await database.ref(`otp_verifications/${cleanKey}`).update({
          verified: true,
          verifiedAt: Date.now()
        });
      } catch (e) {}
    }

    try {
      const allOtps = JSON.parse(localStorage.getItem("mmp_otps") || "{}");
      if (allOtps[cleanKey]) {
        allOtps[cleanKey].verified = true;
        allOtps[cleanKey].verifiedAt = Date.now();
        localStorage.setItem("mmp_otps", JSON.stringify(allOtps));
      }
    } catch (e) {}

    return {
      success: true,
      email: cleanEmail,
      verified: true
    };
  }

  // Local/RTDB verification fallback
  async function verifyOTPLocal(database, cleanEmail, cleanEntered, purpose) {
    const cleanKey = sanitizeEmailKey(cleanEmail);
    let record = null;

    if (database) {
      try {
        const snap = await database.ref(`otp_verifications/${cleanKey}`).once("value");
        record = snap.val();
      } catch (err) {}
    }

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

    if (Date.now() > record.expiresAt) {
      throw new Error("Verification code has expired. Please request a new one.");
    }

    if (record.otp.trim() !== cleanEntered) {
      throw new Error("Incorrect verification code. Please check and try again.");
    }

    return true;
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

    const apiBase = getApiBaseUrl();
    try {
      const res = await fetch(`${apiBase}/api/send-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: cleanEmail,
          name: recipientName,
          purpose: "password_reset"
        })
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.success === false) {
        throw new Error(data.message || `Failed to send OTP (${res.status})`);
      }

      // Store in RTDB for client sync if code provided
      if (data.otp) {
        await storeOTP(database, cleanEmail, data.otp, "password_reset");
      }

      return {
        success: true,
        message: data.message || `Verification code sent to ${cleanEmail}. Please check your inbox.`
      };
    } catch (error) {
      console.error("[OTPService] Error requesting reset OTP:", error);
      if (error.message && (error.message.includes("Failed to fetch") || error.message.includes("NetworkError"))) {
        throw new Error(`OTP server is not reachable at ${apiBase}. Please make sure 'run.bat' is running.`);
      }
      throw error;
    }
  }

  // 2. Send OTP for New User Registration
  async function sendRegistrationOTP(database, email, name = "") {
    const cleanEmail = (email || "").trim().toLowerCase();
    if (!cleanEmail) throw new Error("Email address is required.");

    const apiBase = getApiBaseUrl();
    try {
      const res = await fetch(`${apiBase}/api/send-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: cleanEmail,
          name: name,
          purpose: "registration"
        })
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.success === false) {
        throw new Error(data.message || `Failed to send OTP (${res.status})`);
      }

      // Store in RTDB for client sync if code provided
      if (data.otp) {
        await storeOTP(database, cleanEmail, data.otp, "registration");
      }

      return {
        success: true,
        message: data.message || `Verification code sent to ${cleanEmail}. Please check your inbox.`
      };
    } catch (error) {
      console.error("[OTPService] Error requesting registration OTP:", error);
      if (error.message && (error.message.includes("Failed to fetch") || error.message.includes("NetworkError"))) {
        throw new Error(`OTP server is not reachable at ${apiBase}. Please make sure 'run.bat' is running.`);
      }
      throw error;
    }
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
      console.warn("[OTPService] Confirmation email warning:", e);
    }
  }

  // 4. Test SMTP API Connection
  async function testConnection(testToEmail) {
    const apiBase = getApiBaseUrl();
    const cleanTo = (testToEmail || "").trim().toLowerCase() || activeConfig.senderEmail;

    try {
      const res = await fetch(`${apiBase}/api/test-connection`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: cleanTo })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.success === false) {
        throw new Error(data.message || `Test failed (${res.status})`);
      }
      return data;
    } catch (error) {
      if (error.message && (error.message.includes("Failed to fetch") || error.message.includes("NetworkError"))) {
        throw new Error(`Cannot reach OTP server at ${apiBase}. Please ensure 'run.bat' is running.`);
      }
      throw error;
    }
  }

  // Export to Global namespace (supporting both window.MMP_Brevo for legacy and window.MMP_OTP)
  const serviceObj = {
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
    sanitizeEmailKey,
    getApiBaseUrl
  };

  window.MMP_Brevo = serviceObj;
  window.MMP_OTP = serviceObj;

})(window);
