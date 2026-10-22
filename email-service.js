// Money Manager Pro / KRISHTECH - Email & OTP Service
// Supports EmailJS (Service ID: service_7z8m9rp) and Transactional Email APIs

(function(window) {
  'use strict';

  // ==========================================
  // DEFAULT EMAILJS & EMAIL CONFIGURATION
  // ==========================================
  const DEFAULT_EMAIL_CONFIG = {
    provider: "emailjs",
    // Configured EmailJS Service ID
    serviceId: "service_7z8m9rp",
    // EmailJS Public Key (Account > Public Key)
    publicKey: "0OBbBDlcECVbIHacM",
    // EmailJS Template ID (Email Templates > Template ID)
    templateId: "template_fpgn76o",
    // Optional EmailJS Private Key (if Strict Mode is enabled in Account > Security)
    privateKey: "",
    // Fallback Brevo API Key
    brevoApiKey: "",
    senderEmail: "aitsecurity6@gmail.com",
    senderName: "KRISHTECH Security",
    otpExpiryMs: 10 * 60 * 1000
  };

  let activeConfig = { ...DEFAULT_EMAIL_CONFIG };

  // Load configuration from localStorage
  try {
    const savedLocal = localStorage.getItem("mmp_email_config") || localStorage.getItem("mmp_brevo_config");
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
    // 1. Check EmailJS configuration
    const srv = (activeConfig.serviceId || "").trim();
    const pub = (activeConfig.publicKey || "").trim();
    const tpl = (activeConfig.templateId || "").trim();
    if (srv && pub && tpl && !pub.startsWith("YOUR_") && !tpl.startsWith("YOUR_")) {
      return true;
    }

    // 2. Check Brevo fallback
    const brevoKey = (activeConfig.brevoApiKey || activeConfig.apiKey || "").trim();
    if (brevoKey && !brevoKey.startsWith("YOUR_") && brevoKey.length >= 10) {
      return true;
    }

    return false;
  }

  function getConfig() {
    return { ...activeConfig };
  }

  function setConfig(newConfig) {
    activeConfig = { ...activeConfig, ...newConfig };
    try {
      localStorage.setItem("mmp_email_config", JSON.stringify(activeConfig));
      localStorage.setItem("mmp_brevo_config", JSON.stringify(activeConfig));
    } catch (e) {}

    // Initialize EmailJS SDK if available
    if (typeof window !== "undefined" && window.emailjs && activeConfig.publicKey) {
      try {
        window.emailjs.init({ publicKey: activeConfig.publicKey.trim() });
      } catch (e) {}
    }
  }

  // Listen to system_settings/email or system_settings/brevo from Firebase RTDB
  function initRTDBListener(database) {
    if (!database) return;
    try {
      // Listen to system_settings/email
      database.ref("system_settings/email").on("value", (snap) => {
        const val = snap.val();
        if (val && typeof val === "object") {
          setConfig(val);
          console.log("[EmailService] Loaded dynamic EmailJS configuration from Firebase RTDB");
        }
      });
      // Backwards compatibility with system_settings/brevo
      database.ref("system_settings/brevo").on("value", (snap) => {
        const val = snap.val();
        if (val && typeof val === "object") {
          if (!activeConfig.publicKey && val.apiKey) {
            setConfig({ ...val, brevoApiKey: val.apiKey });
          }
        }
      });
    } catch (err) {
      console.warn("[EmailService] Could not attach RTDB config listener:", err);
    }
  }

  // ==========================================
  // SEND EMAIL DISPATCHER (EMAILJS + FALLBACK)
  // ==========================================
  async function sendEmail({ to, toName = "", subject, otp = "", message = "", htmlContent = "" }) {
    if (!to) {
      throw new Error("Recipient email address is required.");
    }

    const cleanTo = to.trim().toLowerCase();
    const cleanName = toName || cleanTo.split("@")[0];

    // Priority 1: EmailJS Delivery
    const serviceId = (activeConfig.serviceId || "").trim();
    const publicKey = (activeConfig.publicKey || "").trim();
    const templateId = (activeConfig.templateId || "").trim();

    const isEmailJSReady = serviceId && publicKey && templateId && !publicKey.startsWith("YOUR_") && !templateId.startsWith("YOUR_");

    if (isEmailJSReady) {
      return await sendViaEmailJS({
        serviceId,
        templateId,
        publicKey,
        to: cleanTo,
        toName: cleanName,
        subject,
        otp,
        message
      });
    }

    // Priority 2: Brevo API v3 Delivery (if configured)
    const brevoKey = (activeConfig.brevoApiKey || activeConfig.apiKey || "").trim();
    if (brevoKey && !brevoKey.startsWith("YOUR_") && brevoKey.length >= 10) {
      return await sendViaBrevo({
        apiKey: brevoKey,
        senderEmail: activeConfig.senderEmail || "aitsecurity6@gmail.com",
        senderName: activeConfig.senderName || "KRISHTECH Security",
        to: cleanTo,
        toName: cleanName,
        subject,
        htmlContent: htmlContent || getOtpEmailHTML(otp, subject, cleanName)
      });
    }

    // Not configured
    throw new Error("Email service is not configured. Please enter your EmailJS Public Key and Template ID in Admin Settings.");
  }

  // Send using EmailJS (supports both Browser SDK and REST API)
  async function sendViaEmailJS({ serviceId, templateId, publicKey, to, toName, subject, otp, message }) {
    const defaultMsg = otp 
      ? `Your KRISHTECH verification code is: ${otp}. It is valid for 10 minutes. Do not share this code.` 
      : message;

    // Comprehensive template params covering all possible EmailJS template variables
    const templateParams = {
      // Recipient email aliases
      to_email: to,
      email: to,
      recipient_email: to,
      reply_to: to,
      // Recipient name aliases
      to_name: toName,
      user_name: toName,
      name: toName,
      // Sender aliases
      from_name: "KRISHTECH Security",
      company_name: "KRISHTECH",
      // Subject
      subject: subject || "KRISHTECH Security Verification Code",
      // Message / Content / Request aliases (fixes template {{request}})
      request: defaultMsg,
      user_request: defaultMsg,
      message: defaultMsg,
      user_message: defaultMsg,
      content: defaultMsg,
      inquiry: defaultMsg,
      details: defaultMsg,
      description: defaultMsg,
      body: defaultMsg,
      notes: defaultMsg,
      // OTP code aliases
      otp: otp,
      passcode: otp,
      code: otp,
      verification_code: otp,
      otp_code: otp,
      pin: otp,
      token: otp
    };

    console.log("[EmailService] Dispatching email via EmailJS (Service:", serviceId, "Template:", templateId, ")");

    // 1. Try EmailJS Browser SDK if loaded
    if (typeof window !== "undefined" && window.emailjs && typeof window.emailjs.send === "function") {
      try {
        window.emailjs.init({ publicKey: publicKey });
        const res = await window.emailjs.send(serviceId, templateId, templateParams, publicKey);
        console.log("[EmailService] EmailJS SDK send success:", res.status, res.text);
        return {
          success: true,
          provider: "emailjs",
          status: res.status,
          message: "Email sent successfully via EmailJS."
        };
      } catch (sdkError) {
        console.warn("[EmailService] EmailJS SDK send warning:", sdkError);
        handleEmailJSError(sdkError);
      }
    }

    // 2. Direct REST API Call to EmailJS
    try {
      const requestBody = {
        service_id: serviceId,
        template_id: templateId,
        user_id: publicKey,
        template_params: templateParams
      };

      if (activeConfig.privateKey && activeConfig.privateKey.trim()) {
        requestBody.accessToken = activeConfig.privateKey.trim();
      }

      const response = await fetch("https://api.emailjs.com/api/v1.0/email/send", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json"
        },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => "");
        if (response.status === 412 || errorText.includes("412") || errorText.includes("Gmail_API")) {
          throw new Error("Gmail Authorization Error (412): Please reconnect your Gmail service in the EmailJS dashboard and grant required permissions.");
        }
        if (errorText.includes("strict mode") || errorText.includes("Private Key")) {
          throw new Error("EmailJS Strict Mode Error: In EmailJS Dashboard > Account > Security, disable 'Strict Mode' or add your website to Allowed Origins.");
        }
        throw new Error(`EmailJS Error (${response.status}): ${errorText || response.statusText}`);
      }

      console.log("[EmailService] EmailJS REST API send success");
      return {
        success: true,
        provider: "emailjs",
        message: "Email sent successfully via EmailJS."
      };
    } catch (fetchError) {
      console.error("[EmailService] EmailJS fetch error:", fetchError);
      handleEmailJSError(fetchError);
    }
  }

  // Handle and format common EmailJS errors
  function handleEmailJSError(error) {
    const msg = (error && (error.text || error.message || error.toString())) || "";
    if (msg.includes("412") || msg.includes("Gmail") || msg.includes("scope")) {
      throw new Error("EmailJS Gmail Error (412): Reconnect your Gmail account in your EmailJS dashboard and accept Google permissions.");
    }
    if (msg.includes("strict mode") || msg.includes("Private Key")) {
      throw new Error("EmailJS Strict Mode Error: In EmailJS Dashboard > Account > Security, disable 'Strict Mode' or add your website to Allowed Origins.");
    }
    if (msg.includes("400") || msg.includes("template")) {
      throw new Error(`EmailJS Template Error: Please verify your Template ID (${activeConfig.templateId}) in EmailJS dashboard.`);
    }
    if (msg.includes("401") || msg.includes("public key")) {
      throw new Error("EmailJS Public Key Error: Please check your Public Key in Admin Settings.");
    }
    throw new Error(msg || "Failed to send email via EmailJS. Please verify your EmailJS configuration.");
  }

  // Send using Brevo REST API v3
  async function sendViaBrevo({ apiKey, senderEmail, senderName, to, toName, subject, htmlContent }) {
    const payload = {
      sender: { name: senderName, email: senderEmail },
      to: [{ email: to, name: toName }],
      subject: subject,
      htmlContent: htmlContent
    };

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
      throw new Error(data.message || `Brevo Error (${response.status})`);
    }

    return {
      success: true,
      provider: "brevo",
      messageId: data.messageId,
      message: "Email sent successfully via Brevo."
    };
  }

  // ==========================================
  // BRANDED EMAIL HTML TEMPLATES
  // ==========================================
  function getOtpEmailHTML(otp, purposeText, recipientName = "") {
    const greeting = recipientName ? `Hello <strong>${recipientName}</strong>,` : "Hello,";
    return `
      <!DOCTYPE html>
      <html>
      <body style="margin: 0; padding: 24px; background-color: #0f172a; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #f8fafc;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width: 500px; margin: 0 auto; background: #1e293b; border: 1px solid rgba(255,255,255,0.1); border-radius: 12px; overflow: hidden;">
          <tr>
            <td style="padding: 24px; text-align: center; border-bottom: 1px solid rgba(255,255,255,0.08);">
              <h2 style="margin: 0; font-size: 22px; color: #ffffff;">KRISH<span style="color: #6366f1;">TECH</span></h2>
              <div style="font-size: 13px; color: #94a3b8; margin-top: 4px;">Security Verification</div>
            </td>
          </tr>
          <tr>
            <td style="padding: 28px;">
              <p style="margin: 0 0 16px 0; font-size: 15px; color: #e2e8f0;">${greeting}</p>
              <p style="margin: 0 0 20px 0; font-size: 14px; color: #94a3b8; line-height: 1.5;">
                Your verification code for <strong>${purposeText}</strong> is:
              </p>
              <div style="text-align: center; margin: 24px 0;">
                <span style="display: inline-block; font-family: monospace; font-size: 32px; font-weight: 800; letter-spacing: 6px; color: #a5b4fc; background: rgba(99,102,241,0.12); padding: 14px 28px; border-radius: 8px; border: 2px dashed #6366f1;">
                  ${otp}
                </span>
              </div>
              <p style="margin: 0; font-size: 12px; color: #f59e0b; text-align: center;">
                Valid for 10 minutes. Do not share this code.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding: 16px; background-color: rgba(0,0,0,0.25); text-align: center; font-size: 12px; color: #64748b;">
              &copy; 2026 KRISHTECH Financial Systems
            </td>
          </tr>
        </table>
      </body>
      </html>
    `;
  }

  // ==========================================
  // OTP LIFECYCLE MANAGEMENT (FIREBASE RTDB)
  // ==========================================
  function generateOTP() {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  async function storeOTP(database, email, otp, purpose) {
    const cleanEmail = (email || "").trim().toLowerCase();
    const cleanKey = sanitizeEmailKey(cleanEmail);
    const now = Date.now();
    const expiresAt = now + (activeConfig.otpExpiryMs || 10 * 60 * 1000);

    const record = {
      email: cleanEmail,
      otp: otp,
      purpose: purpose,
      createdAt: now,
      expiresAt: expiresAt,
      verified: false,
      attempts: 0
    };

    if (database) {
      try {
        await database.ref(`otp_verifications/${cleanKey}`).set(record);
      } catch (err) {
        console.warn("[EmailService] RTDB set OTP warning:", err);
      }
    }

    try {
      const allOtps = JSON.parse(localStorage.getItem("mmp_otps") || "{}");
      allOtps[cleanKey] = record;
      localStorage.setItem("mmp_otps", JSON.stringify(allOtps));
    } catch (e) {}

    return record;
  }

  async function verifyOTP(database, email, enteredOtp, purpose) {
    const cleanEmail = (email || "").trim().toLowerCase();
    const cleanKey = sanitizeEmailKey(cleanEmail);
    const cleanEntered = (enteredOtp || "").toString().trim();

    if (!cleanEntered || cleanEntered.length !== 6) {
      throw new Error("Please enter a valid 6-digit verification code.");
    }

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
      throw new Error("Invalid verification code purpose.");
    }

    if (Date.now() > record.expiresAt) {
      throw new Error("Verification code has expired. Please request a fresh code.");
    }

    if ((record.attempts || 0) >= 5) {
      throw new Error("Too many failed attempts. Please request a fresh verification code.");
    }

    if (record.otp.trim() !== cleanEntered) {
      const newAttempts = (record.attempts || 0) + 1;
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

    // Verified
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

    return { success: true, email: cleanEmail, verified: true };
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
  // WORKFLOWS: OTP VIA EMAILJS
  // ==========================================
  async function sendPasswordResetOTP(database, email, recipientName = "") {
    const cleanEmail = (email || "").trim().toLowerCase();
    if (!cleanEmail) throw new Error("Email address is required.");

    const otp = generateOTP();
    await storeOTP(database, cleanEmail, otp, "password_reset");

    const subject = `Your KRISHTECH Password Reset Code: ${otp}`;
    const message = `Your password reset verification code is: ${otp}. Valid for 10 minutes.`;

    await sendEmail({
      to: cleanEmail,
      toName: recipientName,
      subject: subject,
      otp: otp,
      message: message,
      htmlContent: getOtpEmailHTML(otp, "password reset", recipientName)
    });

    return {
      success: true,
      message: `Verification code sent to ${cleanEmail}. Please check your inbox.`
    };
  }

  async function sendRegistrationOTP(database, email, name = "") {
    const cleanEmail = (email || "").trim().toLowerCase();
    if (!cleanEmail) throw new Error("Email address is required.");

    const otp = generateOTP();
    await storeOTP(database, cleanEmail, otp, "registration");

    const subject = `Your KRISHTECH Registration Verification Code: ${otp}`;
    const message = `Your registration verification code is: ${otp}. Valid for 10 minutes.`;

    await sendEmail({
      to: cleanEmail,
      toName: name,
      subject: subject,
      otp: otp,
      message: message,
      htmlContent: getOtpEmailHTML(otp, "account registration", name)
    });

    return {
      success: true,
      message: `Verification code sent to ${cleanEmail}. Please check your inbox.`
    };
  }

  async function sendPasswordChangedNotification(email, name = "") {
    try {
      const cleanEmail = (email || "").trim().toLowerCase();
      await sendEmail({
        to: cleanEmail,
        toName: name,
        subject: "Security Notification: Password Changed",
        otp: "",
        message: "Your KRISHTECH account password was successfully updated."
      });
    } catch (e) {
      console.warn("[EmailService] Password changed notification error:", e);
    }
  }

  async function testConnection(testToEmail) {
    const cleanTo = (testToEmail || "").trim().toLowerCase() || activeConfig.senderEmail;
    const testOtp = generateOTP();
    return await sendEmail({
      to: cleanTo,
      toName: "Administrator",
      subject: `[Test] KRISHTECH Email Verification Test (${testOtp})`,
      otp: testOtp,
      message: `This is a test email sent from KRISHTECH using EmailJS (Service ID: ${activeConfig.serviceId}). Your test code is ${testOtp}.`
    });
  }

  // Unified Service object
  const emailServiceInstance = {
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

  // Export to window as both MMP_Email and MMP_Brevo for seamless compatibility
  window.MMP_Email = emailServiceInstance;
  window.MMP_Brevo = emailServiceInstance;

})(window);
