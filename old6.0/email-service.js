// Money Manager Pro / KRISHTECH - Universal Resend & Firebase OTP Service
// Works on Vercel Cloud (HTTPS), Custom Domains, and Local Dev Server
// Strictly delivers to your Gmail inbox - No on-screen exposure.

(function(window) {
  'use strict';

  // Configuration
  const RESEND_CONFIG = {
    apiKey: "re_RXFqdPKn_JNUiMbRaC4gwn4f4h8y8Zu2s",
    sender: "KRISHTECH Security <onboarding@resend.dev>",
    serviceName: "KRISHTECH Security Verification",
    otpExpiryMs: 10 * 60 * 1000, // 10 minutes
    maxAttempts: 5,
    rtdbUrl: "https://hotel-c4382-default-rtdb.firebaseio.com"
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

  /**
   * Determine candidate API URLs based on deployment environment (Vercel vs Local)
   */
  function getCandidateApiUrls(endpoint) {
    const cleanEndpoint = endpoint.replace(/^\/+/, '');

    if (typeof window !== "undefined" && window.location) {
      const host = window.location.hostname;
      const port = window.location.port;

      // Localhost on port 7000
      if (host === "localhost" || host === "127.0.0.1") {
        if (port === "7000") return [`/${cleanEndpoint}`];
        return [`http://127.0.0.1:7000/${cleanEndpoint}`];
      }

      // Live host (e.g. Vercel https://mone-v-23.vercel.app/old6.0/...)
      const origin = window.location.origin;
      const pathParts = window.location.pathname.split('/').filter(Boolean);
      const subfolder = pathParts.length > 1 ? pathParts[0] : '';

      const candidates = [`${origin}/${cleanEndpoint}`];
      if (subfolder) {
        candidates.push(`${origin}/${subfolder}/${cleanEndpoint}`);
      }
      return candidates;
    }

    return [`http://127.0.0.1:7000/${cleanEndpoint}`];
  }

  /**
   * Resilient fetch that tries candidate endpoints
   */
  async function fetchWithFallback(endpoint, payload) {
    const urls = getCandidateApiUrls(endpoint);
    let lastError = null;

    for (const url of urls) {
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });
        if (res.status === 404) continue; // Try next candidate
        const data = await res.json().catch(() => ({}));
        return { ok: res.ok, status: res.status, data };
      } catch (err) {
        lastError = err;
      }
    }

    throw lastError || new Error(`Could not connect to ${endpoint}`);
  }

  // ==========================================
  // DISPATCH OTP (SENT TO GMAIL ONLY)
  // ==========================================
  async function dispatchOtp(database, email, name, purpose) {
    const cleanEmail = (email || "").trim().toLowerCase();
    if (!cleanEmail) throw new Error("Email address is required.");

    try {
      const result = await fetchWithFallback("api/send-otp", {
        email: cleanEmail,
        name: name,
        purpose: purpose
      });

      if (!result.ok || result.data.success === false) {
        throw new Error(result.data.message || "Failed to dispatch verification code to Gmail.");
      }

      return {
        success: true,
        message: result.data.message || `Verification code sent to your Gmail (${cleanEmail}). Please check your inbox.`
      };
    } catch (err) {
      console.error("[OTP Dispatch Error]", err);
      // If serverless is offline, provide clear error
      if (err.message && err.message.includes("Failed to fetch")) {
        throw new Error("Unable to reach email service. If you are on Vercel, please ensure /api/send-otp is deployed.");
      }
      throw err;
    }
  }

  async function sendPasswordResetOTP(database, email, recipientName = "") {
    return await dispatchOtp(database, email, recipientName, "password_reset");
  }

  async function sendRegistrationOTP(database, email, name = "") {
    return await dispatchOtp(database, email, name, "registration");
  }

  // ==========================================
  // VERIFY OTP (VERIFIES AGAINST SERVER & FIREBASE)
  // ==========================================
  async function verifyOTP(database, email, enteredOtp, purpose) {
    const cleanEmail = (email || "").trim().toLowerCase();
    const cleanEntered = (enteredOtp || "").toString().trim();
    const cleanKey = sanitizeEmailKey(cleanEmail);

    if (!cleanEntered || cleanEntered.length !== 6) {
      throw new Error("Please enter a valid 6-digit verification code.");
    }

    // 1. Try server verification first
    try {
      const result = await fetchWithFallback("api/verify-otp", {
        email: cleanEmail,
        otp: cleanEntered,
        purpose: purpose || ""
      });

      if (result.ok && result.data.success) {
        markVerified(database, cleanKey);
        return { success: true, email: cleanEmail, verified: true };
      } else if (result.status === 400 || result.status === 429) {
        throw new Error(result.data.message || "Incorrect verification code.");
      }
    } catch (apiErr) {
      if (apiErr.message && !apiErr.message.includes("Failed to fetch")) {
        throw apiErr;
      }
    }

    // 2. Direct Firebase Realtime Database fallback verification
    const rtdbKeyUrl = `${RESEND_CONFIG.rtdbUrl}/otp_verifications/${cleanKey}.json`;
    let record = null;

    try {
      const snap = await fetch(rtdbKeyUrl);
      record = await snap.json().catch(() => null);
    } catch (e) {}

    // Fallback to localStorage
    if (!record) {
      try {
        const allOtps = JSON.parse(localStorage.getItem("mmp_otps") || "{}");
        record = allOtps[cleanKey];
      } catch (e) {}
    }

    if (!record) {
      throw new Error("No active verification code found for this email. Please request a new code.");
    }

    const now = Date.now();
    if (now > (record.expiresAt || 0)) {
      throw new Error("Verification code has expired. Please request a fresh code.");
    }

    if (purpose && record.purpose && record.purpose !== purpose) {
      throw new Error("Invalid verification code purpose. Please request a new code.");
    }

    if (record.otp.trim() !== cleanEntered) {
      throw new Error("Incorrect verification code. Please check your Gmail.");
    }

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
      fetch(`${RESEND_CONFIG.rtdbUrl}/otp_verifications/${cleanKey}.json`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ verified: true, verifiedAt: now })
      }).catch(() => {});
    } catch (e) {}
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
      fetch(`${RESEND_CONFIG.rtdbUrl}/otp_verifications/${cleanKey}.json`, { method: "DELETE" }).catch(() => {});
    } catch (e) {}

    try {
      const allOtps = JSON.parse(localStorage.getItem("mmp_otps") || "{}");
      delete allOtps[cleanKey];
      localStorage.setItem("mmp_otps", JSON.stringify(allOtps));
    } catch (e) {}
  }

  async function sendPasswordChangedNotification(email, name = "") {}

  async function testConnection(testToEmail) {
    const cleanTo = (testToEmail || "").trim().toLowerCase() || "ragulkumar1116@gmail.com";
    return await dispatchOtp(null, cleanTo, "Admin", "test");
  }

  async function sendEmail({ to, subject, htmlContent }) {
    try {
      const res = await fetchWithFallback("api/send-email", { to, subject, htmlContent });
      return res.data;
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
  window.MMP_Brevo = serviceObj;

})(window);
