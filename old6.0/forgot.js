// Money Manager Pro / KRISHTECH - Multi-Step Forgot & Reset Password Controller
// Integrates Brevo OTP Verification & Firebase Realtime Database Password Sync

document.addEventListener("DOMContentLoaded", () => {
  lucide.createIcons();

  // State
  let currentStep = 1;
  let targetEmail = "";
  let verifiedOtp = "";
  let resendCountdown = 60;
  let timerInterval = null;

  // DOM Elements - Wizard
  const progressBar = document.getElementById("step-progress-bar");
  const stepNodes = {
    1: document.getElementById("step-node-1"),
    2: document.getElementById("step-node-2"),
    3: document.getElementById("step-node-3")
  };
  const stepSections = {
    1: document.getElementById("step-1-section"),
    2: document.getElementById("step-2-section"),
    3: document.getElementById("step-3-section"),
    success: document.getElementById("step-success-section")
  };

  // Step 1 Elements
  const step1Form = document.getElementById("step-1-form");
  const emailInput = document.getElementById("email");
  const step1Btn = document.getElementById("step-1-btn");

  // Step 2 Elements
  const step2Form = document.getElementById("step-2-form");
  const displayTargetEmail = document.getElementById("display-target-email");
  const otpBoxes = Array.from(document.querySelectorAll(".otp-box"));
  const step2Btn = document.getElementById("step-2-btn");
  const resendBtn = document.getElementById("resend-otp-btn");
  const resendTimerSeconds = document.getElementById("resend-timer-seconds");
  const backToStep1Btn = document.getElementById("back-to-step-1-btn");

  // Step 3 Elements
  const step3Form = document.getElementById("step-3-form");
  const newPasswordInput = document.getElementById("new-password");
  const confirmPasswordInput = document.getElementById("confirm-new-password");
  const step3Btn = document.getElementById("step-3-btn");
  const strengthBar = document.getElementById("password-strength-bar");
  const strengthLabel = document.getElementById("password-strength-label");
  const strengthHint = document.getElementById("password-req-hint");

  // ==========================================
  // WIZARD NAVIGATION LOGIC
  // ==========================================
  function goToStep(step) {
    currentStep = step;

    // Update progress bar & node classes
    if (step === 1) {
      if (progressBar) progressBar.style.width = "0%";
      setNodeState(1, "active");
      setNodeState(2, "idle");
      setNodeState(3, "idle");
    } else if (step === 2) {
      if (progressBar) progressBar.style.width = "50%";
      setNodeState(1, "completed");
      setNodeState(2, "active");
      setNodeState(3, "idle");
    } else if (step === 3) {
      if (progressBar) progressBar.style.width = "100%";
      setNodeState(1, "completed");
      setNodeState(2, "completed");
      setNodeState(3, "active");
    } else if (step === "success") {
      if (progressBar) progressBar.style.width = "100%";
      setNodeState(1, "completed");
      setNodeState(2, "completed");
      setNodeState(3, "completed");
    }

    // Toggle Section Visibility
    Object.keys(stepSections).forEach((key) => {
      const sec = stepSections[key];
      if (!sec) return;
      if (key === String(step)) {
        sec.style.display = "block";
        sec.classList.add("fade-in");
      } else {
        sec.style.display = "none";
      }
    });

    // Auto-focus appropriate input
    if (step === 1 && emailInput) emailInput.focus();
    if (step === 2 && otpBoxes.length > 0) {
      clearOtpInputs();
      otpBoxes[0].focus();
    }
    if (step === 3 && newPasswordInput) newPasswordInput.focus();

    lucide.createIcons();
  }

  function setNodeState(nodeIdx, state) {
    const node = stepNodes[nodeIdx];
    if (!node) return;
    node.classList.remove("active", "completed");
    if (state === "active") node.classList.add("active");
    if (state === "completed") node.classList.add("completed");
  }

  // ==========================================
  // STEP 1: REQUEST OTP VIA BREVO
  // ==========================================
  step1Form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = emailInput.value.trim().toLowerCase();

    if (!email) {
      showToast("Please enter your email address.", "error");
      return;
    }

    if (!validateEmail(email)) {
      showToast("Please enter a valid email address.", "error");
      return;
    }

    const origBtnHTML = step1Btn.innerHTML;
    step1Btn.disabled = true;

    try {
      targetEmail = email;

      // Verify that account exists in database
      const existingUser = await MMP_Firebase.findUserByEmail(email);
      if (!existingUser) {
        showToast("No account found with this email address. Please verify your email.", "error");
        return;
      }

      if (existingUser.status === "deactivated") {
        showToast("Account Deactivated: This account has been suspended by an administrator.", "error");
        return;
      }

      // OTP service is active
      step1Btn.innerHTML = `<span class="spinner"></span> <span>Generating OTP code...</span>`;
      const result = await MMP_Firebase.requestPasswordResetOTP(email);

      showToast(result.message || "OTP code sent to your email!", "success");

      // Update UI with target email
      if (displayTargetEmail) displayTargetEmail.textContent = email;

      startResendTimer();
      goToStep(2);
    } catch (error) {
      console.error(error);
      showToast(error.message || "Failed to send verification code. Please try again.", "error");
    } finally {
      step1Btn.disabled = false;
      step1Btn.innerHTML = origBtnHTML;
      lucide.createIcons();
    }
  });

  // ==========================================
  // STEP 2: 6-DIGIT OTP VERIFICATION
  // ==========================================

  // OTP input navigation & backspace
  otpBoxes.forEach((box, idx) => {
    box.addEventListener("input", (e) => {
      const val = e.target.value.replace(/[^0-9]/g, "");
      e.target.value = val ? val[val.length - 1] : "";

      if (e.target.value && idx < otpBoxes.length - 1) {
        otpBoxes[idx + 1].focus();
      }

      // Check if all 6 boxes are filled to trigger submit automatically
      const currentCode = getOtpCode();
      if (currentCode.length === 6) {
        step2Form.dispatchEvent(new Event("submit"));
      }
    });

    box.addEventListener("keydown", (e) => {
      if (e.key === "Backspace" && !e.target.value && idx > 0) {
        otpBoxes[idx - 1].focus();
      }
    });

    // Support pasting full 6-digit code into any box
    box.addEventListener("paste", (e) => {
      e.preventDefault();
      const pasteData = (e.clipboardData || window.clipboardData).getData("text").trim();
      const digits = pasteData.replace(/[^0-9]/g, "").slice(0, 6);
      if (digits.length > 0) {
        digits.split("").forEach((d, i) => {
          if (otpBoxes[i]) otpBoxes[i].value = d;
        });
        const nextIdx = Math.min(digits.length, otpBoxes.length - 1);
        otpBoxes[nextIdx].focus();

        if (digits.length === 6) {
          step2Form.dispatchEvent(new Event("submit"));
        }
      }
    });
  });

  function getOtpCode() {
    return otpBoxes.map((b) => b.value.trim()).join("");
  }

  function clearOtpInputs() {
    otpBoxes.forEach((b) => (b.value = ""));
  }

  // Resend OTP timer
  function startResendTimer() {
    if (timerInterval) clearInterval(timerInterval);
    resendCountdown = 60;
    resendBtn.disabled = true;
    if (resendTimerSeconds) resendTimerSeconds.textContent = resendCountdown;

    timerInterval = setInterval(() => {
      resendCountdown--;
      if (resendTimerSeconds) resendTimerSeconds.textContent = resendCountdown;
      if (resendCountdown <= 0) {
        clearInterval(timerInterval);
        resendBtn.disabled = false;
        const label = document.getElementById("resend-timer-label");
        if (label) label.textContent = "Didn't receive code?";
      }
    }, 1000);
  }

  // Resend OTP action
  resendBtn.addEventListener("click", async () => {
    if (!targetEmail) return;
    resendBtn.disabled = true;
    resendBtn.textContent = "Resending...";

    try {
      const result = await MMP_Firebase.requestPasswordResetOTP(targetEmail);
      showToast(result.message || "Fresh verification code sent!", "success");

      clearOtpInputs();
      otpBoxes[0].focus();
      startResendTimer();
    } catch (err) {
      showToast(err.message || "Failed to resend OTP.", "error");
      resendBtn.disabled = false;
    } finally {
      resendBtn.textContent = "Resend Code";
    }
  });

  // Back to step 1
  if (backToStep1Btn) {
    backToStep1Btn.addEventListener("click", () => {
      if (timerInterval) clearInterval(timerInterval);
      goToStep(1);
    });
  }

  // Step 2 Form Submit (Verify OTP)
  step2Form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const enteredOtp = getOtpCode();

    if (enteredOtp.length !== 6) {
      showToast("Please enter the complete 6-digit OTP code.", "error");
      return;
    }

    const origBtnHTML = step2Btn.innerHTML;
    step2Btn.disabled = true;
    step2Btn.innerHTML = `<span class="spinner"></span> <span>Verifying OTP...</span>`;

    try {
      await MMP_Firebase.verifyPasswordResetOTP(targetEmail, enteredOtp);
      verifiedOtp = enteredOtp;
      showToast("OTP verified successfully!", "success");
      goToStep(3);
    } catch (error) {
      console.error(error);
      showToast(error.message || "Invalid OTP code. Please try again.", "error");
      clearOtpInputs();
      otpBoxes[0].focus();
    } finally {
      step2Btn.disabled = false;
      step2Btn.innerHTML = origBtnHTML;
      lucide.createIcons();
    }
  });

  // ==========================================
  // STEP 3: RESET & SET NEW PASSWORD
  // ==========================================

  // Password visibility toggle buttons
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

  // Realtime password strength calculation
  newPasswordInput.addEventListener("input", () => {
    const pwd = newPasswordInput.value;
    const strength = evaluatePassword(pwd);

    if (strengthBar && strengthLabel) {
      strengthBar.style.width = strength.pct + "%";
      strengthBar.style.backgroundColor = strength.color;
      strengthLabel.textContent = strength.text;
      strengthLabel.style.color = strength.color;
    }
  });

  function evaluatePassword(pwd) {
    if (!pwd || pwd.length < 6) {
      return { pct: 20, color: "#ef4444", text: "Too short (min. 6)" };
    }
    let score = 0;
    if (pwd.length >= 8) score++;
    if (/[A-Z]/.test(pwd)) score++;
    if (/[0-9]/.test(pwd)) score++;
    if (/[^A-Za-z0-9]/.test(pwd)) score++;

    if (score <= 1) return { pct: 40, color: "#f97316", text: "Weak" };
    if (score === 2) return { pct: 65, color: "#eab308", text: "Fair" };
    if (score === 3) return { pct: 85, color: "#10b981", text: "Good" };
    return { pct: 100, color: "#059669", text: "Strong" };
  }

  // Step 3 Form Submit (Save New Password in Firebase RTDB)
  step3Form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const newPassword = newPasswordInput.value;
    const confirmPassword = confirmPasswordInput.value;

    if (!newPassword || !confirmPassword) {
      showToast("Please enter and confirm your new password.", "error");
      return;
    }

    if (newPassword.length < 6) {
      showToast("Password must be at least 6 characters long.", "error");
      return;
    }

    if (newPassword !== confirmPassword) {
      showToast("Passwords do not match. Please verify.", "error");
      return;
    }

    const origBtnHTML = step3Btn.innerHTML;
    step3Btn.disabled = true;
    step3Btn.innerHTML = `<span class="spinner"></span> <span>Updating Firebase Password...</span>`;

    try {
      const hasBrevo = MMP_Firebase.isBrevoConfigured && MMP_Firebase.isBrevoConfigured();

      if (hasBrevo && verifiedOtp) {
        await MMP_Firebase.resetPasswordWithOTP(targetEmail, verifiedOtp, newPassword);
      } else {
        // Direct reset when Brevo is not configured or in direct mode
        const existingUser = await MMP_Firebase.findUserByEmail(targetEmail);
        if (existingUser) {
          await MMP_Firebase.adminResetUserPassword(existingUser.uid, newPassword, targetEmail);
        } else {
          throw new Error("Could not find account to update.");
        }
      }

      showToast("Password updated successfully!", "success");
      goToStep("success");
    } catch (error) {
      console.error(error);
      showToast(error.message || "Failed to update password. Please try again.", "error");
      step3Btn.disabled = false;
      step3Btn.innerHTML = origBtnHTML;
      lucide.createIcons();
    }
  });

  // Check URL query parameters for pre-filled email or reset token
  try {
    const params = new URLSearchParams(window.location.search);
    const paramEmail = params.get("email");
    if (paramEmail && emailInput) {
      emailInput.value = paramEmail.trim();
    }
  } catch (e) {}
});

// Toast Notification Helper
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

// Simple email validation regex
function validateEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
