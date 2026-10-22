// Money Manager Pro - Registration Controller

document.addEventListener("DOMContentLoaded", () => {
  // Render Lucide Icons
  lucide.createIcons();

  // Elements
  const registerForm = document.getElementById("register-form");
  const nameInput = document.getElementById("fullName");
  const phoneInput = document.getElementById("mobileNumber");
  const emailInput = document.getElementById("email");
  const passwordInput = document.getElementById("password");
  const confirmPasswordInput = document.getElementById("confirmPassword");
  const registerBtn = document.getElementById("register-submit-btn");

  // Form submission handler
  registerForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    const name = nameInput.value.trim();
    const phone = phoneInput.value.trim();
    const email = emailInput.value.trim();
    const password = passwordInput.value;
    const confirmPassword = confirmPasswordInput.value;

    // Client-side validation
    if (!name || !phone || !email || !password || !confirmPassword) {
      showToast("Please fill in all fields.", "error");
      return;
    }

    if (name.length < 2) {
      showToast("Name must be at least 2 characters long.", "error");
      return;
    }

    // Basic phone pattern check (must have at least 8 digits)
    const cleanPhone = phone.replace(/[^0-9+]/g, '');
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

    // Set Loading State
    const originalBtnHTML = registerBtn.innerHTML;
    registerBtn.disabled = true;
    registerBtn.innerHTML = `<span class="spinner"></span> <span>Creating account...</span>`;

    try {
      // Firebase Register & Profile Write
      await MMP_Firebase.registerUser(name, phone, email, password);
      showToast("Account created successfully!", "success");
      
      // Redirect to dashboard after a delay
      setTimeout(() => {
        window.location.href = "dashboard.html";
      }, 1000);
    } catch (error) {
      console.error(error);
      showToast(error.message || "Registration failed. Please try again.", "error");
      // Reset button state
      registerBtn.disabled = false;
      registerBtn.innerHTML = originalBtnHTML;
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
  }, 4000);
}

// Simple email validation regex
function validateEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
