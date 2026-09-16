// KRISHTECH - Dedicated Master Admin Registration Controller

document.addEventListener("DOMContentLoaded", async () => {
  lucide.createIcons();

  const form = document.getElementById("admin-register-form");
  const nameInput = document.getElementById("admin-name");
  const emailInput = document.getElementById("admin-email");
  const passwordInput = document.getElementById("admin-password");
  const confirmPasswordInput = document.getElementById("admin-confirm-password");
  const registerBtn = document.getElementById("admin-register-btn");
  const existsBanner = document.getElementById("admin-exists-banner");

  // Check if an admin already exists in the system
  try {
    const adminExists = await MMP_Firebase.checkAdminExists();
    if (adminExists && existsBanner) {
      existsBanner.style.display = "flex";
      lucide.createIcons();
    }
  } catch (err) {
    console.warn("Admin existence check notice:", err);
  }

  // Handle Form Submission
  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const name = nameInput.value.trim();
    const email = emailInput.value.trim();
    const password = passwordInput.value;
    const confirmPassword = confirmPasswordInput.value;

    if (!name || !email || !password || !confirmPassword) {
      showToast("Please complete all fields.", "error");
      return;
    }

    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailPattern.test(email)) {
      showToast("Please enter a valid email address.", "error");
      return;
    }

    if (password.length < 6) {
      showToast("Password must be at least 6 characters long.", "error");
      return;
    }

    if (password !== confirmPassword) {
      showToast("Passwords do not match. Please verify.", "error");
      return;
    }

    const origBtnHTML = registerBtn.innerHTML;
    registerBtn.disabled = true;
    registerBtn.innerHTML = `<span class="spinner"></span> <span>Registering Master Admin...</span>`;

    try {
      await MMP_Firebase.registerAdmin(name, email, password);
      showToast("Master Administrator account successfully registered!", "success");
      
      setTimeout(() => {
        window.location.href = "admin.html";
      }, 1200);
    } catch (err) {
      console.error(err);
      showToast(err.message || "Failed to register admin account.", "error");
      registerBtn.disabled = false;
      registerBtn.innerHTML = origBtnHTML;
    }
  });
});

function showToast(message, type = "info") {
  const container = document.getElementById("toast-container");
  if (!container) return;

  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `<span>${escapeHTML(message)}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.classList.add("fade-out");
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

function escapeHTML(str) {
  return String(str || "").replace(/[&<>'"]/g, tag => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;"
  }[tag] || tag));
}
