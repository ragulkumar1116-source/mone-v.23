// KRISHTECH - Dedicated Admin Authentication Controller

document.addEventListener("DOMContentLoaded", () => {
  lucide.createIcons();

  const form = document.getElementById("admin-login-form");
  const emailInput = document.getElementById("admin-email");
  const passwordInput = document.getElementById("admin-password");
  const submitBtn = document.getElementById("admin-submit-btn");

  // If already authenticated and verified as admin, jump straight to admin portal
  MMP_Firebase.onAuthChanged(async (user) => {
    if (user) {
      const isAdmin = await MMP_Firebase.checkIsAdmin(user);
      if (isAdmin) {
        window.location.replace("admin.html");
      }
    }
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const email = emailInput.value.trim();
    const password = passwordInput.value;

    if (!email || !password) {
      showToast("Please provide both email and password.", "error");
      return;
    }

    const origHTML = submitBtn.innerHTML;
    submitBtn.disabled = true;
    submitBtn.innerHTML = `<span class="spinner"></span> <span>Verifying privileges...</span>`;

    try {
      await MMP_Firebase.loginAdmin(email, password);
      showToast("Admin credentials verified. Launching console...", "success");
      setTimeout(() => {
        window.location.href = "admin.html";
      }, 1000);
    } catch (err) {
      console.error(err);
      showToast(err.message || "Failed to authenticate administrator.", "error");
      submitBtn.disabled = false;
      submitBtn.innerHTML = origHTML;
    }
  });
});

function showToast(message, type = "info") {
  const container = document.getElementById("toast-container");
  if (!container) return;

  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `<span>${message}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.classList.add("fade-out");
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}
