// Money Manager Pro / KRISHTECH - Resend Email & OTP Service (Only Gmail Delivery)
// The OTP code is NEVER displayed on the screen — it is strictly delivered to your Gmail inbox.

(function(window) {
  'use strict';

  // Configuration
  const RESEND_CONFIG = {
    apiKey: "re_RXFqdPKn_JNUiMbRaC4gwn4f4h8y8Zu2s",
    sender: "KRISHTECH Security <onboarding@resend.dev>",
    serviceName: "KRISHTECH Security Verification",
    otpExpiryMs: 10 * 60 * 1000, // 10 minutes
    maxAttempts: 5,
    apiBaseUrl: "http://127.0.0.1:7000"
  };

  function sanitizeEmailKey(email) {
    return (email || "").trim().toLowerCase().replace(/[^a-z0-9]/g, "_");
  }

  function isConfigured() {
    return true;
  }

  function getConfig() {
    return { ...RESEND_CONFIG };
  }

  function setConfig(cfg) {
    Object.assign(RESEND_CONFIG, cfg);
  }

  function initRTDBListener(database) {}

  // Verify OTP via Server API
  async function verifyOTP(database, email, enteredOtp, purpose) {
    const cleanEmail = (email || "").trim().toLowerCase();
    const cleanEntered = (enteredOtp || "").toString().trim();

    if (!cleanEntered || cleanEntered.length !== 6) {
      throw new Error("Please enter a valid 6-digit verification code.");
    }

    let response;
    try {
      response = await fetch(`${RESEND_CONFIG.apiBaseUrl}/api/verify-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: cleanEmail, otp: cleanEntered, purpose: purpose || "" })
      });
    } catch (netErr) {
      throw new Error(`Cannot reach OTP server at ${RESEND_CONFIG.apiBaseUrl}. Please ensure the server is running.`);
    }

    const data = await response.json().catch(() => ({}));

    if (!response.ok || data.success === false) {
      throw new Error(data.message || "Incorrect verification code. Please check your Gmail.");
    }

    const cleanKey = sanitizeEmailKey(cleanEmail);
    markVerified(database, cleanKey);

    return {
      success: true,
      email: cleanEmail,
      verified: true
    };
  }

  function markVerified(database, cleanKey) {
    const now = Date.now();
    if (database) {
      try {
        database.ref(`otp_verifications/${cleanKey}`).update({ verified: true, verifiedAt: now });
      } catch (e) {}
    }
    try {
      const allOtps = JSON.parse(localStorage.getItem("mmp_otps") || "{}");
      if (allOtps[cleanKey]) {
        allOtps[cleanKey].verified = true;
        allOtps[cleanKey].verifiedAt = now;
        localStorage.setItem("mmp_otps", JSON.stringify(allOtps));
      }
    } catch (e) {}
  }

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
  // DISPATCH HELPERS (DELIVER ONLY TO GMAIL)
  // ==========================================
  async function dispatchOtp(database, email, name, purpose) {
    const cleanEmail = (email || "").trim().toLowerCase();
    if (!cleanEmail) throw new Error("Email address is required.");

    let response;
    try {
      response = await fetch(`${RESEND_CONFIG.apiBaseUrl}/api/send-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: cleanEmail, name, purpose })
      });
    } catch (netErr) {
      throw new Error(`Cannot reach OTP server at ${RESEND_CONFIG.apiBaseUrl}. Please ensure the server is running.`);
    }

    const data = await response.json().catch(() => ({}));

    if (!response.ok || data.success === false) {
      throw new Error(data.message || "Failed to deliver verification code to your Gmail.");
    }

    return {
      success: true,
      message: data.message || `Verification code sent to ${cleanEmail}. Please check your Gmail inbox.`
    };
  }

  async function sendPasswordResetOTP(database, email, recipientName = "") {
    return await dispatchOtp(database, email, recipientName, "password_reset");
  }

  async function sendRegistrationOTP(database, email, name = "") {
    return await dispatchOtp(database, email, name, "registration");
  }

  async function sendPasswordChangedNotification(email, name = "") {}

  async function testConnection(testToEmail) {
    const cleanTo = (testToEmail || "").trim().toLowerCase() || "ragulkumar1116@gmail.com";
    try {
      const res = await fetch(`${RESEND_CONFIG.apiBaseUrl}/api/send-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: cleanTo, name: "Admin", purpose: "test" })
      });
      const data = await res.json();
      return {
        success: true,
        message: data.message || `Test OTP sent to ${cleanTo} via Resend!`
      };
    } catch (e) {
      throw new Error("Could not connect to Resend OTP server.");
    }
  }

  async function sendEmail({ to, subject, htmlContent }) {
    try {
      const res = await fetch(`${RESEND_CONFIG.apiBaseUrl}/api/send-email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to, subject, htmlContent })
      });
      return await res.json();
    } catch (e) {
      return { success: true };
    }
  }

  const serviceObj = {
    isConfigured,
    getConfig,
    setConfig,
    initRTDBListener,
    sendEmail,
    verifyOTP,
    clearOTP,
    sendPasswordResetOTP,
    sendRegistrationOTP,
    sendPasswordChangedNotification,
    testConnection,
    sanitizeEmailKey
  };

  window.MMP_OTP = serviceObj;
  window.MMP_Brevo = serviceObj; // Compatibility alias

})(window);
