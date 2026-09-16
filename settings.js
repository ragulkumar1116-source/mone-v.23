// Money Manager Pro - Settings Controller

document.addEventListener("DOMContentLoaded", () => {
  // Global states
  let rawUserData = null;
  let currentTheme = "auto";

  // Elements
  const profileForm = document.getElementById("profile-settings-form");
  const profileNameInput = document.getElementById("profile-name");
  const profilePhoneInput = document.getElementById("profile-phone");
  const profileSaveBtn = document.getElementById("profile-save-btn");

  const securityForm = document.getElementById("security-settings-form");
  const securityPassInput = document.getElementById("security-password");
  const securityConfInput = document.getElementById("security-confirm");
  const securitySaveBtn = document.getElementById("security-save-btn");

  const logoutBtn = document.getElementById("logout-btn");

  // Load Lucide Icons
  lucide.createIcons();

  // ==========================================
  // AUTHENTICATION & INITIALIZATION
  // ==========================================
  MMP_Firebase.onAuthChanged((user) => {
    if (!user) {
      window.location.replace("index.html");
      return;
    }

    // Load account stats in metadata card
    document.getElementById("meta-uid").textContent = user.uid;
    document.getElementById("meta-email").textContent = user.email;

    // Load and update form inputs dynamically using Realtime Listener
    MMP_Firebase.listenToUserData((data) => {
      rawUserData = data || {};
      
      updateProfileUI();
      applyUserTheme();
      updateThemeCardsUI();
    });
  });

  // Apply theme settings on load
  function applyUserTheme() {
    if (rawUserData && rawUserData.settings) {
      currentTheme = rawUserData.settings.theme || "auto";
    }

    const htmlElement = document.documentElement;
    if (currentTheme === "dark") {
      htmlElement.setAttribute("data-theme", "dark");
    } else if (currentTheme === "light") {
      htmlElement.setAttribute("data-theme", "light");
    } else {
      // Auto Mode
      const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      htmlElement.setAttribute("data-theme", prefersDark ? "dark" : "light");
    }
  }

  // Highlights active theme card visually
  function updateThemeCardsUI() {
    const cards = document.querySelectorAll(".theme-card");
    cards.forEach(card => {
      if (card.getAttribute("data-val") === currentTheme) {
        card.classList.add("active");
      } else {
        card.classList.remove("active");
      }
    });
  }

  // Populate profiles inputs
  function updateProfileUI() {
    const profile = (rawUserData && rawUserData.profile) || {};
    const name = profile.name || "User";
    const phone = profile.phone || "";
    const email = profile.email || "";

    // Fill Sidebar card
    document.getElementById("sb-user-name").textContent = name;
    document.getElementById("sb-user-phone").textContent = phone;
    document.getElementById("sb-user-email").textContent = email;

    // Fill form inputs (only if they aren't active, to avoid disturbing user typing)
    if (document.activeElement !== profileNameInput) {
      profileNameInput.value = name;
    }
    if (document.activeElement !== profilePhoneInput) {
      profilePhoneInput.value = phone;
    }
  }

  // ==========================================
  // PROFILE & SECURITY ACTIONS SUBMITS
  // ==========================================
  profileForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = profileNameInput.value.trim();
    const phone = profilePhoneInput.value.trim();

    if (!name || !phone) {
      showToast("Please fill in profile fields.", "error");
      return;
    }

    // Disable button & loader state
    const originalBtn = profileSaveBtn.innerHTML;
    profileSaveBtn.disabled = true;
    profileSaveBtn.innerHTML = `<span class="spinner"></span> <span>Saving changes...</span>`;

    try {
      await MMP_Firebase.updateProfileSettings(name, phone);
      showToast("Profile settings updated successfully.", "success");
    } catch (err) {
      showToast(err.message || "Failed to update profile settings.", "error");
    } finally {
      profileSaveBtn.disabled = false;
      profileSaveBtn.innerHTML = originalBtn;
    }
  });

  securityForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const password = securityPassInput.value;
    const confirm = securityConfInput.value;

    if (!password || !confirm) {
      showToast("Please fill in security password fields.", "error");
      return;
    }

    if (password.length < 6) {
      showToast("Password must be at least 6 characters.", "error");
      return;
    }

    if (password !== confirm) {
      showToast("Passwords do not match.", "error");
      return;
    }

    // Loader State
    const originalBtn = securitySaveBtn.innerHTML;
    securitySaveBtn.disabled = true;
    securitySaveBtn.innerHTML = `<span class="spinner"></span> <span>Updating password...</span>`;

    try {
      await MMP_Firebase.changePassword(password);
      showToast("Password updated successfully.", "success");
      
      // Clear password inputs
      securityPassInput.value = "";
      securityConfInput.value = "";
    } catch (err) {
      showToast(err.message || "Failed to change password. Secure actions may require re-authentication.", "error");
    } finally {
      securitySaveBtn.disabled = false;
      securitySaveBtn.innerHTML = originalBtn;
    }
  });

  // ==========================================
  // THEME CARD CLICKS SELECTIONS
  // ==========================================
  const themeCards = document.querySelectorAll(".theme-card");
  themeCards.forEach(card => {
    card.addEventListener("click", async () => {
      const themeVal = card.getAttribute("data-val");
      
      try {
        await MMP_Firebase.updateThemeSettings(themeVal);
        showToast(`Theme updated to ${themeVal}.`, "success");
      } catch (err) {
        showToast("Failed to save theme settings.", "error");
      }
    });
  });

  // ==========================================
  // ACCOUNT LOGOUT
  // ==========================================
  const handleLogout = async () => {
    try {
      await MMP_Firebase.logoutUser();
      window.location.href = "index.html";
    } catch (error) {
      showToast("Error signing out.", "error");
    }
  };

  logoutBtn.addEventListener("click", handleLogout);

  // Toast Notification helper
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
});
