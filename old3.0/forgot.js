// Money Manager Pro - Password Reset Controller

document.addEventListener("DOMContentLoaded", () => {
  // Render Lucide Icons
  lucide.createIcons();

  // Elements
  const forgotForm = document.getElementById("forgot-form");
  const emailInput = document.getElementById("email");
  const forgotBtn = document.getElementById("forgot-submit-btn");

  // Form submission handler
  forgotForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    const email = emailInput.value.trim();

    // Client-side validation
    if (!email) {
      showToast("Please enter your email address.", "error");
      return;
    }

    if (!validateEmail(email)) {
      showToast("Please enter a valid email address.", "error");
      return;
    }

    // Set Loading State
    const originalBtnHTML = forgotBtn.innerHTML;
    forgotBtn.disabled = true;
    forgotBtn.innerHTML = `<span class="spinner"></span> <span>Sending request...</span>`;

    try {
      // Firebase Password Reset Call
      await MMP_Firebase.resetPassword(email);
      showToast("Password reset email sent! Check your inbox.", "success");
      
      // Clear input
      emailInput.value = "";
      
      // Reset button state
      forgotBtn.disabled = false;
      forgotBtn.innerHTML = originalBtnHTML;
    } catch (error) {
      console.error(error);
      showToast(error.message || "Failed to send reset email. Please try again.", "error");
      // Reset button state
      forgotBtn.disabled = false;
      forgotBtn.innerHTML = originalBtnHTML;
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
