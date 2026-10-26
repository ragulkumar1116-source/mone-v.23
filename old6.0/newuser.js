// Money Manager Pro / KRISHTECH - Registration Controller with Brevo Email OTP Verification

document.addEventListener("DOMContentLoaded", () => {
  lucide.createIcons();

  // Elements - Main Form
  const registerForm = document.getElementById("register-form");
  const nameInput = document.getElementById("fullName");
  const phoneInput = document.getElementById("mobileNumber");
  const emailInput = document.getElementById("email");
  const passwordInput = document.getElementById("password");
  const confirmPasswordInput = document.getElementById("confirmPassword");
  const registerBtn = document.getElementById("register-submit-btn");

  // Elements - OTP Modal
  const otpModal = document.getElementById("modal-otp-verify");
  const closeOtpModalBtn = document.getElementById("close-otp-modal-btn");
  const cancelOtpBtn = document.getElementById("reg-cancel-otp-btn");
  const modalTargetEmail = document.getElementById("modal-otp-target-email");
  const regOtpForm = document.getElementById("reg-otp-form");
  const regOtpBoxes = Array.from(document.querySelectorAll(".reg-otp-box"));
  const regVerifySubmitBtn = document.getElementById("reg-verify-submit-btn");
  const regResendBtn = document.getElementById("reg-resend-otp-btn");
  const regResendTimerSeconds = document.getElementById("reg-resend-timer-seconds");

  // State
  let pendingRegistration = null;
  let timerInterval = null;
  let resendCountdown = 60;

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

  // Main Form Submission -> Request OTP
  registerForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    const name = nameInput.value.trim();
    const phone = phoneInput.value.trim();
    const email = emailInput.value.trim().toLowerCase();
    const password = passwordInput.value;
    const confirmPassword = confirmPasswordInput.value;

    // Client-side validations
    if (!name || !phone || !email || !password || !confirmPassword) {
      showToast("Please fill in all fields.", "error");
      return;
    }

    if (name.length < 2) {
      showToast("Name must be at least 2 characters long.", "error");
      return;
    }

    const cleanPhone = phone.replace(/[^0-9+]/g, "");
    if (cleanPhone.length < 8) {
      showToast("Please enter a valid mobile number.", "error");
      return;
    }

    if (!validateEmail(email)) {
      showToast("Please enter a valid email address.", "error");
      return;
    }

    if (password.length < 6) {
      showToast("Password must be at least 6 characters.", "error");
      return;
    }

    if (password !== confirmPassword) {
      showToast("Passwords do not match.", "error");
      return;
    }

    // Set Loading State on Register Button
    const origBtnHTML = registerBtn.innerHTML;
    registerBtn.disabled = true;

    // Initiate Client-Side Email OTP Verification
    registerBtn.innerHTML = `<span class="spinner"></span> <span>Generating OTP code...</span>`;

    try {
      // 1. Request OTP
      const otpResult = await MMP_Firebase.requestRegistrationOTP(email, name);

      // Save pending registration payload
      pendingRegistration = { name, phone, email, password };

      // Populate Modal
      if (modalTargetEmail) modalTargetEmail.textContent = email;

      // Open Modal
      openOtpModal();
      startResendTimer();
      showToast(otpResult.message || "Verification code sent to your email!", "success");
    } catch (error) {
      console.error(error);
      showToast(error.message || "Failed to initiate verification. Please try again.", "error");
    } finally {
      registerBtn.disabled = false;
      registerBtn.innerHTML = origBtnHTML;
      lucide.createIcons();
    }
  });

  // ==========================================
  // OTP MODAL CONTROLS & INPUT NAVIGATION
  // ==========================================

  function openOtpModal() {
    if (otpModal) {
      otpModal.style.display = "flex";
      clearOtpInputs();
      if (regOtpBoxes.length > 0) regOtpBoxes[0].focus();
      lucide.createIcons();
    }
  }

  function closeOtpModal() {
    if (otpModal) {
      otpModal.style.display = "none";
      if (timerInterval) clearInterval(timerInterval);
    }
  }

  if (closeOtpModalBtn) closeOtpModalBtn.addEventListener("click", closeOtpModal);
  if (cancelOtpBtn) cancelOtpBtn.addEventListener("click", closeOtpModal);

  function clearOtpInputs() {
    regOtpBoxes.forEach((b) => (b.value = ""));
  }

  function getEnteredOtp() {
    return regOtpBoxes.map((b) => b.value.trim()).join("");
  }

  // OTP box arrow / auto-advance
  regOtpBoxes.forEach((box, idx) => {
    box.addEventListener("input", (e) => {
      const val = e.target.value.replace(/[^0-9]/g, "");
      e.target.value = val ? val[val.length - 1] : "";

      if (e.target.value && idx < regOtpBoxes.length - 1) {
        regOtpBoxes[idx + 1].focus();
      }

      if (getEnteredOtp().length === 6) {
        regOtpForm.dispatchEvent(new Event("submit"));
      }
    });

    box.addEventListener("keydown", (e) => {
      if (e.key === "Backspace" && !e.target.value && idx > 0) {
        regOtpBoxes[idx - 1].focus();
      }
    });

    box.addEventListener("paste", (e) => {
      e.preventDefault();
      const pasteData = (e.clipboardData || window.clipboardData).getData("text").trim();
      const digits = pasteData.replace(/[^0-9]/g, "").slice(0, 6);
      if (digits.length > 0) {
        digits.split("").forEach((d, i) => {
          if (regOtpBoxes[i]) regOtpBoxes[i].value = d;
        });
        const nextIdx = Math.min(digits.length, regOtpBoxes.length - 1);
        regOtpBoxes[nextIdx].focus();

        if (digits.length === 6) {
          regOtpForm.dispatchEvent(new Event("submit"));
        }
      }
    });
  });

  // Resend Timer
  function startResendTimer() {
    if (timerInterval) clearInterval(timerInterval);
    resendCountdown = 60;
    regResendBtn.disabled = true;
    if (regResendTimerSeconds) regResendTimerSeconds.textContent = resendCountdown;

    timerInterval = setInterval(() => {
      resendCountdown--;
      if (regResendTimerSeconds) regResendTimerSeconds.textContent = resendCountdown;
      if (resendCountdown <= 0) {
        clearInterval(timerInterval);
        regResendBtn.disabled = false;
        const lbl = document.getElementById("reg-resend-timer-label");
        if (lbl) lbl.textContent = "Didn't receive code?";
      }
    }, 1000);
  }

  regResendBtn.addEventListener("click", async () => {
    if (!pendingRegistration) return;
    regResendBtn.disabled = true;
    regResendBtn.textContent = "Resending...";

    try {
      const result = await MMP_Firebase.requestRegistrationOTP(pendingRegistration.email, pendingRegistration.name);
      showToast(result.message || "Fresh verification code sent!", "success");

      clearOtpInputs();
      regOtpBoxes[0].focus();
      startResendTimer();
    } catch (err) {
      showToast(err.message || "Failed to resend OTP.", "error");
      regResendBtn.disabled = false;
    } finally {
      regResendBtn.textContent = "Resend Code";
    }
  });

  // Verify OTP & Finalize Registration
  regOtpForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    if (!pendingRegistration) {
      showToast("Session expired. Please fill out the registration form again.", "error");
      closeOtpModal();
      return;
    }

    const enteredOtp = getEnteredOtp();
    if (enteredOtp.length !== 6) {
      showToast("Please enter the complete 6-digit verification code.", "error");
      return;
    }

    const origBtnHTML = regVerifySubmitBtn.innerHTML;
    regVerifySubmitBtn.disabled = true;
    regVerifySubmitBtn.innerHTML = `<span class="spinner"></span> <span>Verifying &amp; Creating Account...</span>`;

    try {
      await MMP_Firebase.completeRegistrationWithOTP(
        pendingRegistration.name,
        pendingRegistration.phone,
        pendingRegistration.email,
        pendingRegistration.password,
        enteredOtp
      );

      showToast("Account created successfully with verified email!", "success");
      closeOtpModal();

      setTimeout(() => {
        window.location.href = "dashboard.html";
      }, 1200);
    } catch (error) {
      console.error(error);
      showToast(error.message || "Verification failed. Please try again.", "error");
      clearOtpInputs();
      regOtpBoxes[0].focus();
      regVerifySubmitBtn.disabled = false;
      regVerifySubmitBtn.innerHTML = origBtnHTML;
      lucide.createIcons();
    }
  });
});

// Toast notification helper
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
