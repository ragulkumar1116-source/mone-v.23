import os
import re
import time
import secrets
import hashlib
import hmac
import smtplib
from email.message import EmailMessage
from threading import Lock

from flask import Flask, request, jsonify, send_from_directory, render_template_string
from flask_cors import CORS

# Initialize Flask application
STATIC_DIR = os.path.dirname(os.path.abspath(__file__))
app = Flask(__name__, static_folder=STATIC_DIR)

# Secret Key & Gmail Credentials from environment or defaults
app.secret_key = os.environ.get(
    "FLASK_SECRET_KEY",
    "myapi_live_ak_219b85e3_ec786bcbdcb62d2189f53dbaeec1f20dd1f915eec92a230341df9b7ca61dc5b7"
)

GMAIL_ADDRESS = os.environ.get("GMAIL_ADDRESS", "ragulkumar1116@gmail.com").strip()
GMAIL_APP_PASSWORD = os.environ.get("GMAIL_APP_PASSWORD", "swqqrkhdnjkbnecv").strip()
PORT = int(os.environ.get("PORT", 7000))

# Enable Cross-Origin Resource Sharing (CORS)
CORS(app, resources={r"/*": {"origins": "*"}}, supports_credentials=True)

# OTP Security Parameters
OTP_TTL = 10 * 60       # 10 minutes (600 seconds)
RESEND_WAIT = 60        # 60 seconds between resends
MAX_ATTEMPTS = 5        # Max failed verification attempts

# In-Memory thread-safe OTP store & rate limiting
otp_store = {}
last_sent = {}
store_lock = Lock()


def get_otp_html(code, purpose_text="verifying your account", recipient_name=""):
    """Generate modern, high-contrast KRISHTECH branded HTML email."""
    greeting = f"Hello <strong>{recipient_name}</strong>," if recipient_name else "Hello,"
    return f"""<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>KRISHTECH Security Verification</title>
</head>
<body style="margin: 0; padding: 0; background-color: #0b0f19; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #f8fafc;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #0b0f19; padding: 40px 15px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" style="max-width: 520px; background: linear-gradient(180deg, #161e2e 0%, #0f172a 100%); border: 1px solid rgba(255, 255, 255, 0.12); border-radius: 18px; overflow: hidden; box-shadow: 0 20px 50px rgba(0,0,0,0.6);">
          <!-- Header -->
          <tr>
            <td style="padding: 32px 32px 24px 32px; text-align: center; border-bottom: 1px solid rgba(255, 255, 255, 0.08);">
              <div style="font-size: 26px; font-weight: 800; letter-spacing: -0.5px; color: #ffffff;">
                KRISH<span style="color: #6366f1;">TECH</span>
              </div>
              <div style="font-size: 13px; color: #94a3b8; margin-top: 4px; font-weight: 500; letter-spacing: 0.5px;">
                Money Manager Pro &bull; Security Verification
              </div>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding: 32px;">
              <p style="margin: 0 0 16px 0; font-size: 16px; color: #e2e8f0; line-height: 1.5;">
                {greeting}
              </p>
              <p style="margin: 0 0 24px 0; font-size: 15px; color: #94a3b8; line-height: 1.6;">
                You recently requested a security verification code for <strong>{purpose_text}</strong>. Please enter the 6-digit One-Time Password (OTP) below to proceed.
              </p>

              <!-- OTP Code Box -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin: 28px 0;">
                <tr>
                  <td align="center">
                    <div style="display: inline-block; background: rgba(99, 102, 241, 0.12); border: 2px dashed #6366f1; border-radius: 14px; padding: 18px 36px; text-align: center;">
                      <span style="font-family: 'Courier New', Courier, monospace; font-size: 38px; font-weight: 800; letter-spacing: 10px; color: #a5b4fc; display: block; margin-left: 10px;">
                        {code}
                      </span>
                    </div>
                  </td>
                </tr>
              </table>

              <p style="margin: 0 0 20px 0; font-size: 13px; color: #fbbf24; text-align: center; line-height: 1.4;">
                &bull; This code is valid for <strong>10 minutes</strong>. Do not share this code with anyone.
              </p>

              <p style="margin: 0; font-size: 13px; color: #64748b; line-height: 1.5; border-top: 1px solid rgba(255, 255, 255, 0.08); padding-top: 20px;">
                If you did not request this verification code, someone may be trying to access your account. Please secure your account immediately.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 20px 32px; background-color: rgba(0, 0, 0, 0.3); text-align: center; font-size: 12px; color: #64748b; border-top: 1px solid rgba(255, 255, 255, 0.05);">
              &copy; 2026 KRISHTECH. All rights reserved. &bull; Automated Security Service
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
"""


def send_gmail_smtp(recipient, subject, html_content, text_fallback=None):
    """Deliver an email using Gmail SMTP (smtp.gmail.com:587) with TLS."""
    if not GMAIL_ADDRESS or not GMAIL_APP_PASSWORD:
        raise RuntimeError("GMAIL_ADDRESS or GMAIL_APP_PASSWORD is not configured.")

    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = f"KRISHTECH Security <{GMAIL_ADDRESS}>"
    msg["To"] = recipient

    if text_fallback:
        msg.set_content(text_fallback)
    else:
        msg.set_content("Please view this email in an HTML-compatible email client.")

    msg.add_alternative(html_content, subtype="html")

    with smtplib.SMTP("smtp.gmail.com", 587, timeout=20) as server:
        server.ehlo()
        server.starttls()
        server.ehlo()
        server.login(GMAIL_ADDRESS, GMAIL_APP_PASSWORD)
        server.send_message(msg)


# ==========================================
# REST API ENDPOINTS
# ==========================================

@app.route("/api/status", methods=["GET"])
def api_status():
    """Health & Configuration check."""
    return jsonify({
        "status": "online",
        "service": "KRISHTECH OTP Mailer",
        "configured": bool(GMAIL_ADDRESS and GMAIL_APP_PASSWORD),
        "sender": GMAIL_ADDRESS,
        "port": PORT
    })


@app.route("/api/send-otp", methods=["POST"])
def api_send_otp():
    """Generate and send 6-digit OTP code to recipient email."""
    data = request.get_json(silent=True) or request.form.to_dict()
    email = (data.get("email") or "").strip().lower()
    name = (data.get("name") or "").strip()
    purpose = (data.get("purpose") or "verification").strip()

    if not email or not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", email):
        return jsonify({"success": False, "message": "A valid email address is required."}), 400

    now = time.time()
    with store_lock:
        # Check resend cooldown
        prev_sent = last_sent.get(email, 0)
        if now - prev_sent < RESEND_WAIT:
            remaining = int(RESEND_WAIT - (now - prev_sent)) + 1
            return jsonify({
                "success": False,
                "message": f"Please wait {remaining} seconds before requesting a new OTP."
            }), 429

        last_sent[email] = now

    # Generate cryptographically secure 6-digit code
    code = f"{secrets.randbelow(1_000_000):06d}"

    # Purpose description for email template
    purpose_desc = "verifying your new account" if purpose == "registration" else "resetting your password"
    subject = f"Your KRISHTECH Security Code: {code}"
    html_content = get_otp_html(code, purpose_desc, name)

    try:
        send_gmail_smtp(email, subject, html_content)
    except Exception as e:
        app.logger.exception("Failed to send OTP email via Gmail SMTP")
        with store_lock:
            last_sent.pop(email, None)
        return jsonify({
            "success": False,
            "message": f"Failed to send email via Gmail SMTP: {str(e)}"
        }), 500

    # Store OTP details securely
    with store_lock:
        otp_store[email] = {
            "code": code,
            "hash": hashlib.sha256(code.encode()).hexdigest(),
            "purpose": purpose,
            "expires": now + OTP_TTL,
            "attempts": 0,
            "created_at": now
        }

    return jsonify({
        "success": True,
        "message": f"Verification code sent to {email}. Please check your inbox.",
        "otp": code,  # Provided for dev/testing ease
        "otpExpiryMs": OTP_TTL * 1000
    })


@app.route("/api/verify-otp", methods=["POST"])
def api_verify_otp():
    """Validate submitted 6-digit OTP code."""
    data = request.get_json(silent=True) or request.form.to_dict()
    email = (data.get("email") or "").strip().lower()
    entered_code = (data.get("otp") or "").strip()
    purpose = (data.get("purpose") or "").strip()

    if not email or not entered_code:
        return jsonify({"success": False, "message": "Email and 6-digit OTP code are required."}), 400

    now = time.time()
    with store_lock:
        record = otp_store.get(email)

        if not record:
            return jsonify({
                "success": False,
                "message": "No active verification code found for this email. Please request a new one."
            }), 400

        # Check expiration
        if now > record["expires"]:
            otp_store.pop(email, None)
            return jsonify({
                "success": False,
                "message": "Verification code has expired. Please request a fresh code."
            }), 400

        # Check purpose if specified
        if purpose and record.get("purpose") and record["purpose"] != purpose:
            return jsonify({
                "success": False,
                "message": "Invalid code purpose. Please request a new code."
            }), 400

        # Check max attempts
        if record["attempts"] >= MAX_ATTEMPTS:
            otp_store.pop(email, None)
            return jsonify({
                "success": False,
                "message": "Too many failed attempts. Please request a new verification code."
            }), 429

        record["attempts"] += 1

        # Check code match (timing-safe HMAC comparison)
        submitted_hash = hashlib.sha256(entered_code.encode()).hexdigest()
        if not hmac.compare_digest(submitted_hash, record["hash"]):
            remaining = MAX_ATTEMPTS - record["attempts"]
            return jsonify({
                "success": False,
                "message": f"Incorrect verification code. {remaining} attempt(s) remaining."
            }), 400

        # Successfully verified! Remove single-use OTP
        otp_store.pop(email, None)

    return jsonify({
        "success": True,
        "verified": True,
        "email": email,
        "message": "Email verified successfully."
    })


@app.route("/api/send-email", methods=["POST"])
def api_send_email():
    """Send generic or notification email (password reset success, security alert, etc.)."""
    data = request.get_json(silent=True) or request.form.to_dict()
    to_email = (data.get("to") or data.get("recipient") or "").strip().lower()
    subject = (data.get("subject") or "KRISHTECH Notification").strip()
    html_content = data.get("htmlContent") or data.get("html") or ""
    text_fallback = data.get("textContent") or data.get("text") or None

    if not to_email or not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", to_email):
        return jsonify({"success": False, "message": "Valid recipient email is required."}), 400

    if not html_content and not text_fallback:
        return jsonify({"success": False, "message": "Email content is required."}), 400

    try:
        send_gmail_smtp(to_email, subject, html_content, text_fallback)
        return jsonify({
            "success": True,
            "message": f"Email successfully sent to {to_email}"
        })
    except Exception as e:
        app.logger.exception("Failed to send generic email via Gmail SMTP")
        return jsonify({
            "success": False,
            "message": f"Failed to send email: {str(e)}"
        }), 500


@app.route("/api/test-connection", methods=["POST", "GET"])
def api_test_connection():
    """Validate Gmail SMTP credentials by attempting SMTP login and sending test ping."""
    data = (request.get_json(silent=True) if request.is_json else None) or request.args.to_dict() or {}
    test_to = (data.get("email") or GMAIL_ADDRESS).strip().lower()

    try:
        with smtplib.SMTP("smtp.gmail.com", 587, timeout=15) as server:
            server.ehlo()
            server.starttls()
            server.ehlo()
            server.login(GMAIL_ADDRESS, GMAIL_APP_PASSWORD)

        test_code = f"{secrets.randbelow(1_000_000):06d}"
        subject = f"[Test] KRISHTECH SMTP Connection Verified ({test_code})"
        html = get_otp_html(test_code, "testing the KRISHTECH Gmail SMTP Integration", "Administrator")
        send_gmail_smtp(test_to, subject, html)

        return jsonify({
            "success": True,
            "message": f"SMTP Login successful! Test email delivered to {test_to}.",
            "sender": GMAIL_ADDRESS
        })
    except Exception as e:
        return jsonify({
            "success": False,
            "message": f"SMTP Test failed: {str(e)}"
        }), 500


# ==========================================
# STATIC FILE SERVING FOR MONEY MANAGER PRO
# ==========================================

@app.route("/")
def serve_index():
    return send_from_directory(STATIC_DIR, "index.html")


@app.route("/<path:filename>")
def serve_static(filename):
    file_path = os.path.join(STATIC_DIR, filename)
    if os.path.isfile(file_path):
        return send_from_directory(STATIC_DIR, filename)
    # Default fallback
    return send_from_directory(STATIC_DIR, "index.html")


if __name__ == "__main__":
    print("=" * 60)
    print("  KRISHTECH Money Manager Pro - OTP & Web Server")
    print(f"  Sender: {GMAIL_ADDRESS}")
    print(f"  Port:   {PORT}")
    print(f"  URL:    http://127.0.0.1:{PORT}")
    print("=" * 60)

    app.run(host="127.0.0.1", port=PORT, debug=False)
