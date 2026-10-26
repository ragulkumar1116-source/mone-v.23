// Money Manager Pro / KRISHTECH - Direct Reset Password Controller

document.addEventListener("DOMContentLoaded", () => {
  lucide.createIcons();

  const form = document.getElementById("direct-reset-form");
  const emailInput = document.getElementById("reset-email");
  const otpInput = document.getElementById("reset-otp");
  const newPasswordInput = document.getElementById("reset-new-password");
  const confirmPasswordInput = document.getElementById("reset-confirm-password");
  const submitBtn = document.getElementById("reset-submit-btn");
  const requestOtpBtn = document.getElementById("request-otp-inline-btn");

  // Read URL query params (?email=...&otp=...)
  try {
    const params = new URLSearchParams(window.location.search);
    const emailParam = params.get("email");
    const otpParam = params.get("otp");
    if (emailParam && emailInput) emailInput.value = emailParam.trim();
    if (otpParam && otpInput) otpInput.value = otpParam.trim();
  } catch (e) {}

  // Password visibility toggles
  document.querySelectorAll(".password-toggle-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const targetId = btn.getAttribute("data-target");
      const targetInput = document.getElementById(targetId);
      if (!targetInput) return;

      const isPassword = targetInput.type === "password";
      targetInput.type = isPassword ? "text" : "password";
      btn.innerHTML = isPassword ? `<i data-lucide="eye-off"></i>` : `<i data-lucide="eye"></i>`;
      lucide.createIcons();
    });
  });

  // Inline OTP request
  if (requestOtpBtn) {
    requestOtpBtn.addEventListener("click", async () => {
      const email = emailInput.value.trim().toLowerCase();
      if (!email || !validateEmail(email)) {
        showToast("Please enter a valid email address first.", "error");
        emailInput.focus();
        return;
      }

      requestOtpBtn.disabled = true;
      requestOtpBtn.textContent = "Generating OTP...";

      try {
        const result = await MMP_Firebase.requestPasswordResetOTP(email);
        showToast(result.message || "Verification code sent to your email!", "success");
        otpInput.focus();
      } catch (err) {
        showToast(err.message || "Failed to send OTP.", "error");
      } finally {
        requestOtpBtn.disabled = false;
        requestOtpBtn.textContent = "Send OTP Code";
      }
    });
  }

  // Handle Form Submission
  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const email = emailInput.value.trim().toLowerCase();
    const otp = otpInput.value.trim();
    const newPassword = newPasswordInput.value;
    const confirmPassword = confirmPasswordInput.value;

    if (!email || !newPassword || !confirmPassword) {
      showToast("Please fill in all fields.", "error");
      return;
    }

    if (!validateEmail(email)) {
      showToast("Please enter a valid email address.", "error");
      return;
    }

    if (newPassword.length < 6) {
      showToast("Password must be at least 6 characters.", "error");
      return;
    }

    if (newPassword !== confirmPassword) {
      showToast("Passwords do not match.", "error");
      return;
    }

    const origBtnHTML = submitBtn.innerHTML;
    submitBtn.disabled = true;
    submitBtn.innerHTML = `<span class="spinner"></span> <span>Resetting Password...</span>`;

    try {
      if (MMP_Firebase.isBrevoConfigured()) {
        if (!otp || otp.length !== 6) {
          showToast("Verification code must be exactly 6 digits.", "error");
          submitBtn.disabled = false;
          submitBtn.innerHTML = origBtnHTML;
          return;
        }
        await MMP_Firebase.resetPasswordWithOTP(email, otp, newPassword);
      } else {
        const existingUser = await MMP_Firebase.findUserByEmail(email);
        if (existingUser) {
          await MMP_Firebase.adminResetUserPassword(existingUser.uid, newPassword, email);
        } else {
          throw new Error("No account found with this email address.");
        }
      }

      showToast("Password reset successfully! Redirecting to login...", "success");

      setTimeout(() => {
        window.location.href = "index.html";
      }, 1500);
    } catch (error) {
      console.error(error);
      showToast(error.message || "Reset failed. Please check your OTP code.", "error");
      submitBtn.disabled = false;
      submitBtn.innerHTML = origBtnHTML;
      lucide.createIcons();
    }
  });
});

function showToast(message, type = "info") {
  const container = document.getElementById("toast-container");
  if (!container) return;

  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;

  let icon = "info";
  if (type === "success") icon = "check-circle";
  if (type === "error") icon = "alert-circle";

  toast.innerHTML = `
    <i class="toast-icon" data-lucide="${icon}"></i>
    <div class="toast-message">${message}</div>
  `;

  container.appendChild(toast);
  lucide.createIcons();

  toast.style.transform = "translateY(0)";

  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transform = "translateY(-10px)";
    setTimeout(() => toast.remove(), 300);
  }, 4500);
}

function validateEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
