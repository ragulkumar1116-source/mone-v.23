// Money Manager Pro - Login Controller

document.addEventListener("DOMContentLoaded", () => {
  // Render Lucide Icons
  lucide.createIcons();

  // Elements
  const loginForm = document.getElementById("login-form");
  const emailInput = document.getElementById("email");
  const passwordInput = document.getElementById("password");
  const loginBtn = document.getElementById("login-submit-btn");
  const fallbackBadge = document.getElementById("fallback-badge");

  // Show mock mode badge if Firebase is running locally
  if (!MMP_Firebase.isConfigured()) {
    fallbackBadge.style.display = "block";
  }

  // Session Check: Redirect to dashboard if user already authenticated
  MMP_Firebase.onAuthChanged((user) => {
    if (user) {
      window.location.replace("dashboard.html");
    }
  });

  // Form submission handler
  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    const email = emailInput.value.trim();
    const password = passwordInput.value;

    // Client-side Validation
    if (!email || !password) {
      showToast("Please fill in all fields.", "error");
      return;
    }

    if (!validateEmail(email)) {
      showToast("Please enter a valid email address.", "error");
      return;
    }

    // Set Loading State
    const originalBtnHTML = loginBtn.innerHTML;
    loginBtn.disabled = true;
    loginBtn.innerHTML = `<span class="spinner"></span> <span>Logging in...</span>`;

    try {
      // Firebase Sign In
      await MMP_Firebase.loginUser(email, password);
      showToast("Successfully logged in!", "success");
      
      // Redirect after success toast
      setTimeout(() => {
        window.location.href = "dashboard.html";
      }, 1000);
    } catch (error) {
      console.error(error);
      showToast(error.message || "Authentication failed. Please check credentials.", "error");
      // Reset button state
      loginBtn.disabled = false;
      loginBtn.innerHTML = originalBtnHTML;
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
  
  // Slide in effect
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
