// KRISHTECH - Admin Portal Comprehensive Controller

document.addEventListener("DOMContentLoaded", () => {
  lucide.createIcons();

  // State cache
  let allUsersCache = {};
  let allSessionsCache = {};
  let allActivitiesCache = [];
  let currentAdmin = null;

  // Strict Admin Authorization Guard
  MMP_Firebase.onAuthChanged(async (user) => {
    if (!user) {
      window.location.replace("admin-login.html");
      return;
    }
    
    const isAdmin = await MMP_Firebase.checkIsAdmin(user);
    if (!isAdmin) {
      alert("Access Denied: Your account does not have administrator privileges.");
      await MMP_Firebase.logoutUser();
      window.location.replace("admin-login.html");
      return;
    }

    currentAdmin = user;
    const emailEl = document.getElementById("admin-user-email");
    if (emailEl) emailEl.textContent = user.email;

    // Initialize all admin listeners
    initAdminListeners();
  });

  function initAdminListeners() {
    // 1. Listen to All Registered Users (Zero data loss, 100% preserves existing user nodes)
    MMP_Firebase.listenToAllUsers((users) => {
      allUsersCache = users || {};
      updateUsersUI();
      updateSystemStatsUI();
    });

    // 2. Listen to All User Sessions (Who is coming & going)
    MMP_Firebase.listenToUserSessions((sessions) => {
      allSessionsCache = sessions || {};
      updateSessionsUI();
    });

    // 3. Listen to Realtime Activity Logs
    MMP_Firebase.listenToActivityLogs((activities) => {
      if (Array.isArray(activities)) {
        allActivitiesCache = activities;
      } else if (typeof activities === "object" && activities !== null) {
        allActivitiesCache = Object.values(activities);
      } else {
        allActivitiesCache = [];
      }
      allActivitiesCache.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
      updateActivitiesUI();
    });

    // 4. System Settings & Brevo Configuration
    MMP_Firebase.listenToSystemSettings((settings) => {
      const ann = document.getElementById("setting-announcement");
      const stat = document.getElementById("setting-default-status");
      const reg = document.getElementById("setting-allow-reg");
      if (ann && settings.announcement !== undefined) ann.value = settings.announcement;
      if (stat && settings.defaultUserStatus !== undefined) stat.value = settings.defaultUserStatus;
      if (reg && settings.allowRegistration !== undefined) reg.checked = settings.allowRegistration;

      // Populate OTP Security settings
      const brevoSenderEmail = document.getElementById("setting-brevo-sender-email");
      const brevoSenderName = document.getElementById("setting-brevo-sender-name");
      const brevoCfg = (settings && settings.brevo) || (MMP_Firebase.getBrevoConfig && MMP_Firebase.getBrevoConfig()) || {};

      if (brevoSenderEmail && brevoCfg.senderEmail !== undefined) brevoSenderEmail.value = brevoCfg.senderEmail;
      if (brevoSenderName && brevoCfg.senderName !== undefined) brevoSenderName.value = brevoCfg.senderName;
    });
  }

  // ==========================================
  // TAB NAVIGATION CONTROLS
  // ==========================================
  const tabLinks = document.querySelectorAll(".sidebar .nav-link[data-tab], .mobile-bottom-nav .mobile-nav-link[data-tab]");
  tabLinks.forEach(link => {
    link.addEventListener("click", (e) => {
      e.preventDefault();
      const tabName = link.getAttribute("data-tab");
      switchAdminTab(tabName);
    });
  });

  function switchAdminTab(tabName) {
    // Update active nav links
    tabLinks.forEach(l => {
      if (l.getAttribute("data-tab") === tabName) {
        l.classList.add("active");
      } else {
        l.classList.remove("active");
      }
    });

    // Update panes
    const panes = document.querySelectorAll(".view-pane");
    panes.forEach(p => p.style.display = "none");

    const targetPane = document.getElementById(`pane-${tabName}`);
    if (targetPane) {
      targetPane.style.display = "block";
      targetPane.classList.add("fade-in");
    }

    // Update title
    const titleMap = {
      users: "User Management",
      sessions: "Attendance Sessions",
      stats: "System Statistics",
      activity: "Audit Trail",
      settings: "Platform Settings"
    };
    const hTitle = document.getElementById("admin-header-title");
    if (hTitle) {
      hTitle.innerHTML = `<i data-lucide="shield-check" style="color: var(--primary);"></i> ${titleMap[tabName] || "Admin Console"}`;
      lucide.createIcons();
    }
  }

  // ==========================================
  // 1. RENDER REGISTERED USERS DIRECTORY
  // ==========================================
  function updateUsersUI() {
    const tbody = document.getElementById("users-table-body");
    const kpiTotal = document.getElementById("kpi-total-users");
    const kpiActive = document.getElementById("kpi-active-users");
    const kpiDeactivated = document.getElementById("kpi-deactivated-users");
    const kpiOnline = document.getElementById("kpi-online-count");

    const searchVal = (document.getElementById("users-search-input")?.value || "").toLowerCase().trim();
    const statusVal = document.getElementById("users-status-filter")?.value || "all";

    const uids = Object.keys(allUsersCache);
    let activeCount = 0;
    let deactCount = 0;
    let onlineCount = 0;

    const userEntries = uids.map(uid => {
      const u = allUsersCache[uid] || {};
      const prof = u.profile || {};
      const pres = u.presence || {};
      const status = prof.status || "active";
      if (status === "active") activeCount++;
      else deactCount++;
      if (pres.status === "online") onlineCount++;
      return { uid, data: u, status, isOnline: pres.status === "online" };
    });

    if (kpiTotal) kpiTotal.textContent = uids.length;
    if (kpiActive) kpiActive.textContent = activeCount;
    if (kpiDeactivated) kpiDeactivated.textContent = deactCount;
    if (kpiOnline) kpiOnline.textContent = onlineCount;

    const filtered = userEntries.filter(entry => {
      const prof = entry.data.profile || {};
      const name = (prof.name || "").toLowerCase();
      const email = (prof.email || "").toLowerCase();
      const phone = (prof.phone || "").toLowerCase();
      const matchesSearch = !searchVal || name.includes(searchVal) || email.includes(searchVal) || phone.includes(searchVal) || entry.uid.toLowerCase().includes(searchVal);
      const matchesStatus = statusVal === "all" || entry.status === statusVal;
      return matchesSearch && matchesStatus;
    });

    const countBadge = document.getElementById("users-count-badge");
    if (countBadge) {
      countBadge.textContent = `${filtered.length} of ${uids.length} Users`;
    }

    if (!tbody) return;

    if (filtered.length === 0) {
      tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; color: var(--text-secondary); padding: 2.5rem 1rem;">No user accounts match the search criteria.</td></tr>`;
      return;
    }

    const getInitials = (name) => {
      if (!name) return "U";
      const parts = name.trim().split(/\s+/);
      if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
      return name.slice(0, 2).toUpperCase();
    };

    tbody.innerHTML = filtered.map(entry => {
      const u = entry.data;
      const prof = u.profile || {};
      const name = prof.name || "Unnamed User";
      const initials = getInitials(name);
      const incCount = Object.keys(u.income_records || {}).length;
      const expCount = Object.keys(u.expense_records || {}).length;
      const vhCount = Object.keys(u.vehicle_expenses || {}).length;

      const userPass = prof.password || u.password || "";
      const passHTML = userPass
        ? `<div class="password-cell-badge" title="Account Password">
             <span class="user-pass-text">${escapeHTML(userPass)}</span>
             <button type="button" class="btn-pass-copy" onclick="copyUserPass('${escapeHTML(userPass)}')" title="Copy password">
               <i data-lucide="copy" style="width: 12px; height: 12px;"></i>
             </button>
           </div>`
        : `<span class="password-cell-badge not-set" title="Password not stored yet">Not Set</span>`;

      const statusBadge = entry.status === "active"
        ? `<span class="badge-status badge-active"><span class="badge-dot"></span> Active</span>`
        : `<span class="badge-status badge-inactive"><span class="badge-dot"></span> Deactivated</span>`;

      const presenceBadge = entry.isOnline
        ? `<span class="badge-presence badge-online"><span class="presence-pulse-dot"></span> Online</span>`
        : `<span class="badge-presence badge-offline"><span class="presence-pulse-dot"></span> Offline</span>`;

      const toggleActionText = entry.status === "active" ? "Deactivate" : "Activate";
      const targetStatus = entry.status === "active" ? "deactivated" : "active";

      return `
        <tr class="user-row" data-uid="${entry.uid}">
          <td>
            <div class="user-cell-profile">
              <div class="user-avatar">${escapeHTML(initials)}</div>
              <div class="user-info-text">
                <div class="user-name-title">${escapeHTML(name)}</div>
                <div class="user-uid-pill" title="Firebase UID">${entry.uid}</div>
              </div>
            </div>
          </td>
          <td>
            <div class="cell-flex">
              <i data-lucide="mail"></i>
              <span>${escapeHTML(prof.email || "N/A")}</span>
            </div>
          </td>
          <td>
            <div class="cell-flex">
              <i data-lucide="phone"></i>
              <span>${escapeHTML(prof.phone || "N/A")}</span>
            </div>
          </td>
          <td>
            ${passHTML}
          </td>
          <td>${statusBadge}</td>
          <td>${presenceBadge}</td>
          <td>
            <div class="records-badge-group">
              <span class="micro-badge badge-inc" title="Income entries: ${incCount}"><i data-lucide="trending-up"></i> ${incCount}</span>
              <span class="micro-badge badge-exp" title="Expense entries: ${expCount}"><i data-lucide="trending-down"></i> ${expCount}</span>
              <span class="micro-badge badge-vh" title="Vehicle expense bills: ${vhCount}"><i data-lucide="car"></i> ${vhCount}</span>
            </div>
          </td>
          <td style="text-align: right;">
            <div class="table-actions-cluster">
              <button type="button" class="btn btn-inspect-account" data-action="view-account" data-uid="${entry.uid}" title="Directly inspect real user dashboard & reports">
                <i data-lucide="external-link"></i> View Account
              </button>
              <button type="button" class="btn btn-action-icon" data-action="edit" data-uid="${entry.uid}" onclick="openEditUserModal('${entry.uid}')" title="Edit User Details">
                <i data-lucide="edit-3"></i>
              </button>
              <button type="button" class="btn btn-action-icon" data-action="password" data-uid="${entry.uid}" onclick="openResetPasswordModal('${entry.uid}')" title="Reset User Password">
                <i data-lucide="key"></i>
              </button>
              <button type="button" class="btn btn-action-pill ${entry.status === 'active' ? 'btn-deactivate' : 'btn-activate'}" data-action="toggle-status" data-uid="${entry.uid}" data-status="${targetStatus}" onclick="toggleUserStatus('${entry.uid}', '${targetStatus}')" title="${toggleActionText} Account">
                ${toggleActionText}
              </button>
              <button type="button" class="btn btn-action-danger" data-action="delete" data-uid="${entry.uid}" onclick="deleteUserAccount('${entry.uid}')" title="Delete User Account">
                <i data-lucide="trash-2"></i>
              </button>
            </div>
          </td>
        </tr>
      `;
    }).join("");

    lucide.createIcons();
  }

 // ==========================================
 // 2. RENDER COMING & GOING SESSIONS
 // ==========================================
  function updateSessionsUI() {
    const tbody = document.getElementById("sessions-table-body");
    const searchVal = (document.getElementById("session-search-input")?.value || "").toLowerCase().trim();
    const statusVal = document.getElementById("session-status-filter")?.value || "all";

    const sessionList = Object.values(allSessionsCache);
    sessionList.sort((a, b) => (b.loginTime || 0) - (a.loginTime || 0));

    const filtered = sessionList.filter(s => {
      const name = (s.name || "").toLowerCase();
      const email = (s.email || "").toLowerCase();
      const matchesSearch = !searchVal || name.includes(searchVal) || email.includes(searchVal);
      const isOnline = s.status === "online" && !s.logoutTime;
      const matchesStatus = statusVal === "all" || (statusVal === "online" ? isOnline : !isOnline);
      return matchesSearch && matchesStatus;
    });

    if (!tbody) return;

    if (filtered.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--text-secondary); padding: 2rem;">No session attendance logs match the filter.</td></tr>`;
      return;
    }

    tbody.innerHTML = filtered.map(s => {
      const isOnline = s.status === "online" && !s.logoutTime;
      const statusBadge = isOnline 
        ? `<span style="background: rgba(16, 185, 129, 0.15); color: #059669; padding: 0.2rem 0.55rem; border-radius: 50px; font-weight: 700; font-size: 0.75rem;">Online</span>`
        : `<span style="background: rgba(100, 116, 139, 0.15); color: #64748b; padding: 0.2rem 0.55rem; border-radius: 50px; font-weight: 600; font-size: 0.75rem;">Offline</span>`;

      const duration = s.loginTime ? (s.logoutTime ? formatDuration(s.logoutTime - s.loginTime) : formatDuration(Date.now() - s.loginTime) + " (live)") : "N/A";

      return `
        <tr>
          <td>
            <div style="font-weight: 700; color: var(--text-primary);">${escapeHTML(s.name || "User")}</div>
            <div style="font-size: 0.75rem; color: var(--text-tertiary);">${escapeHTML(s.email || "")}</div>
          </td>
          <td><span style="font-size: 0.8rem; font-weight: 600;">${escapeHTML(s.device || "Desktop")}</span></td>
          <td>${statusBadge}</td>
          <td style="font-size: 0.85rem; font-family: monospace;">${formatFullDateTime(s.loginTime)}</td>
          <td style="font-size: 0.85rem; font-family: monospace;">${s.logoutTime ? formatFullDateTime(s.logoutTime) : '<span style="color: #059669; font-weight: 600;">Active Now</span>'}</td>
          <td style="font-weight: 600; font-size: 0.85rem;">${duration}</td>
        </tr>
      `;
    }).join("");
  }

  // ==========================================
  // 3. RENDER SYSTEM STATISTICS & DATA
  // ==========================================
  function updateSystemStatsUI() {
    const volEl = document.getElementById("stats-total-volume");
    const incEl = document.getElementById("stats-total-income");
    const incCntEl = document.getElementById("stats-income-count");
    const expEl = document.getElementById("stats-total-expense");
    const expCntEl = document.getElementById("stats-expense-count");
    const vhEl = document.getElementById("stats-total-vehicle");
    const vhCntEl = document.getElementById("stats-vehicle-count");

    let totalIncome = 0;
    let countIncome = 0;
    let totalExpense = 0;
    let countExpense = 0;
    let totalVehicle = 0;
    let countVehicle = 0;

    Object.values(allUsersCache).forEach(u => {
      const incs = Object.values(u.income_records || {});
      const exps = Object.values(u.expense_records || {});
      const vhs = Object.values(u.vehicle_expenses || {});

      incs.forEach(r => { totalIncome += (r.amount || 0); countIncome++; });
      exps.forEach(r => { totalExpense += (r.amount || 0); countExpense++; });
      vhs.forEach(r => { totalVehicle += (r.amount || 0); countVehicle++; });
    });

    const cumulativeVolume = totalIncome + totalExpense + totalVehicle;

    if (volEl) volEl.textContent = formatCurrency(cumulativeVolume);
    if (incEl) incEl.textContent = formatCurrency(totalIncome);
    if (incCntEl) incCntEl.textContent = `${countIncome} total records`;
    if (expEl) expEl.textContent = formatCurrency(totalExpense);
    if (expCntEl) expCntEl.textContent = `${countExpense} total records`;
    if (vhEl) vhEl.textContent = formatCurrency(totalVehicle);
    if (vhCntEl) vhCntEl.textContent = `${countVehicle} total records`;
  }

  // ==========================================
  // 4. RENDER REALTIME AUDIT LOGS
  // ==========================================
  function updateActivitiesUI() {
    const list = document.getElementById("activity-stream-list");
    const searchVal = (document.getElementById("activity-search-input")?.value || "").toLowerCase().trim();

    if (!list) return;

    const filtered = allActivitiesCache.filter(a => {
      if (!searchVal) return true;
      const act = (a.action || "").toLowerCase();
      const det = (a.details || "").toLowerCase();
      const u = (a.userName || a.userEmail || "").toLowerCase();
      return act.includes(searchVal) || det.includes(searchVal) || u.includes(searchVal);
    });

    if (filtered.length === 0) {
      list.innerHTML = `<div style="text-align: center; color: var(--text-secondary); padding: 2rem;">No audit logs recorded yet.</div>`;
      return;
    }

    list.innerHTML = filtered.slice(0, 100).map(a => {
      return `
        <div style="display: flex; justify-content: space-between; align-items: flex-start; padding: 0.85rem 1rem; background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: var(--border-radius-md); gap: 1rem;">
          <div style="display: flex; align-items: flex-start; gap: 0.75rem;">
            <div style="width: 32px; height: 32px; border-radius: 8px; background: rgba(79, 70, 229, 0.1); color: var(--primary); display: flex; align-items: center; justify-content: center; flex-shrink: 0; font-size: 0.9rem;">
              <i data-lucide="shield"></i>
            </div>
            <div>
              <div style="font-weight: 700; font-size: 0.9rem; color: var(--text-primary); display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap;">
                <span>${escapeHTML(a.action || "Activity")}</span>
                <span style="font-size: 0.8rem; font-weight: 500; color: var(--text-secondary);">by ${escapeHTML(a.userName || a.userEmail || "System")}</span>
              </div>
              <div style="font-size: 0.85rem; color: var(--text-secondary); margin-top: 0.2rem;">
                ${escapeHTML(a.details || "")}
              </div>
            </div>
          </div>
          <div style="text-align: right; flex-shrink: 0; font-size: 0.75rem; color: var(--text-tertiary); font-weight: 500;">
            ${a.timestamp ? formatTimeAgo(a.timestamp) : "Just now"}
            <div style="font-size: 0.7rem; opacity: 0.7;">${escapeHTML(a.device || "Desktop")}</div>
          </div>
        </div>
      `;
    }).join("");

    lucide.createIcons();
  }

  // ==========================================
  // MODAL ACTIONS & CRUD OPERATIONS
  // ==========================================

  // Add User Trigger
  const addBtn = document.getElementById("admin-add-user-btn");
  if (addBtn) {
    addBtn.addEventListener("click", () => {
      document.getElementById("modal-add-user").style.display = "flex";
    });
  }

  // Add User Form Submission
  const addForm = document.getElementById("form-add-user");
  if (addForm) {
    addForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const name = document.getElementById("add-user-name").value.trim();
      const phone = document.getElementById("add-user-phone").value.trim();
      const email = document.getElementById("add-user-email").value.trim();
      const pass = document.getElementById("add-user-password").value;

      try {
        await MMP_Firebase.adminAddUser(name, phone, email, pass);
        showToast("User successfully created!", "success");
        document.getElementById("modal-add-user").style.display = "none";
        addForm.reset();
      } catch (err) {
        showToast(err.message || "Failed to create user.", "error");
      }
    });
  }

  // Helper for Eye icon toggles on password inputs
  function setupPasswordToggle(btnId, inputId) {
    const btn = document.getElementById(btnId);
    const input = document.getElementById(inputId);
    if (!btn || !input) return;
    btn.onclick = (e) => {
      e.preventDefault();
      const isText = input.type === "text";
      input.type = isText ? "password" : "text";
      btn.innerHTML = `<i data-lucide="${isText ? 'eye-off' : 'eye'}"></i>`;
      lucide.createIcons();
    };
  }

  setupPasswordToggle("toggle-edit-pwd-btn", "edit-user-password");
  setupPasswordToggle("toggle-reset-pwd-btn", "reset-new-password");
  setupPasswordToggle("toggle-add-pwd-btn", "add-user-password");

  // Copy password helper
  window.copyUserPass = (pwd) => {
    if (!pwd || pwd === "Not set") {
      showToast("No password has been set for this account yet.", "info");
      return;
    }
    navigator.clipboard.writeText(pwd).then(() => {
      showToast("Password copied to clipboard!", "success");
    }).catch(() => {
      showToast("Password: " + pwd, "info");
    });
  };

  // Edit User Modal Opening
  window.openEditUserModal = (uid) => {
    const user = allUsersCache[uid] || {};
    const prof = user.profile || user || {};
    const nameEl = document.getElementById("edit-user-name");
    const phoneEl = document.getElementById("edit-user-phone");
    const emailEl = document.getElementById("edit-user-email");
    const passEl = document.getElementById("edit-user-password");
    const uidEl = document.getElementById("edit-user-uid");
    const modal = document.getElementById("modal-edit-user");

    if (uidEl) uidEl.value = uid;
    if (nameEl) nameEl.value = prof.name || "";
    if (phoneEl) phoneEl.value = prof.phone || "";
    if (emailEl) emailEl.value = prof.email || "";
    if (passEl) {
      passEl.type = "text";
      passEl.value = prof.password || user.password || "";
    }
    const eyeBtn = document.getElementById("toggle-edit-pwd-btn");
    if (eyeBtn) eyeBtn.innerHTML = `<i data-lucide="eye"></i>`;
    if (modal) modal.style.display = "flex";
    lucide.createIcons();
  };

  // Edit User Form Submission
  const editForm = document.getElementById("form-edit-user");
  if (editForm) {
    editForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const uid = document.getElementById("edit-user-uid").value;
      const name = document.getElementById("edit-user-name").value.trim();
      const phone = document.getElementById("edit-user-phone").value.trim();
      const email = document.getElementById("edit-user-email").value.trim();
      const password = (document.getElementById("edit-user-password")?.value || "").trim();

      if (!name) {
        showToast("User name cannot be blank.", "error");
        return;
      }

      if (!email) {
        showToast("Email address cannot be blank.", "error");
        return;
      }

      const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailPattern.test(email)) {
        showToast("Please enter a valid email address.", "error");
        return;
      }

      try {
        await MMP_Firebase.adminUpdateUser(uid, { name, phone, email, password });
        showToast("User details & password updated successfully!", "success");
        const modal = document.getElementById("modal-edit-user");
        if (modal) modal.style.display = "none";
      } catch (err) {
        showToast(err.message || "Failed to update user.", "error");
      }
    });
  }

  // Reset Password Modal Opening
  window.openResetPasswordModal = (uid, name, email) => {
    const user = allUsersCache[uid] || {};
    const prof = user.profile || user || {};
    const resolvedName = name || prof.name || "User";
    const resolvedEmail = email || prof.email || "";
    const currentPass = prof.password || user.password || "Not set";

    const uidEl = document.getElementById("reset-user-uid");
    const emailEl = document.getElementById("reset-user-email");
    const nameDisplayEl = document.getElementById("reset-user-name-display");
    const currPassEl = document.getElementById("reset-current-password-display");
    const passInput = document.getElementById("reset-new-password");
    const modal = document.getElementById("modal-reset-password");

    if (uidEl) uidEl.value = uid;
    if (emailEl) emailEl.value = resolvedEmail;
    if (nameDisplayEl) nameDisplayEl.textContent = `${resolvedName} (${resolvedEmail || uid})`;
    if (currPassEl) currPassEl.textContent = currentPass;
    if (passInput) {
      passInput.type = "text";
      passInput.value = currentPass !== "Not set" ? currentPass : "";
    }
    const eyeBtn = document.getElementById("toggle-reset-pwd-btn");
    if (eyeBtn) eyeBtn.innerHTML = `<i data-lucide="eye"></i>`;
    if (modal) modal.style.display = "flex";
    lucide.createIcons();
  };

  // Reset Password Form Submission
  const resetForm = document.getElementById("form-reset-password");
  if (resetForm) {
    resetForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const uid = document.getElementById("reset-user-uid").value;
      const email = document.getElementById("reset-user-email").value;
      const newPass = (document.getElementById("reset-new-password").value || "").trim();

      if (!newPass) {
        showToast("Password cannot be blank.", "error");
        return;
      }

      try {
        await MMP_Firebase.adminResetUserPassword(uid, newPass, email);
        showToast("Password updated successfully!", "success");
        const modal = document.getElementById("modal-reset-password");
        if (modal) modal.style.display = "none";
        resetForm.reset();
      } catch (err) {
        showToast(err.message || "Failed to reset password.", "error");
      }
    });
  }

  // Toggle User Status (Activate / Deactivate)
  window.toggleUserStatus = async (uid, targetStatus) => {
    const actionLabel = targetStatus === "active" ? "activate" : "deactivate";
    if (!confirm(`Are you sure you want to ${actionLabel} this user account?`)) return;

    try {
      await MMP_Firebase.adminToggleUserStatus(uid, targetStatus);
      showToast(`User account ${actionLabel}d.`, "success");
    } catch (err) {
      showToast("Error toggling account status.", "error");
    }
  };

  // Delete User Account
  window.deleteUserAccount = async (uid, email) => {
    if (!confirm(`Warning: Are you sure you want to completely remove user ${email || uid}? This cannot be undone.`)) return;

    try {
      await MMP_Firebase.adminDeleteUser(uid, email);
      showToast("User account deleted.", "success");
    } catch (err) {
      showToast("Error deleting user account.", "error");
    }
  };

  // Direct Access into User Real Account (Admin-Only Super Access)
  window.accessUserAccount = (uid) => {
    const u = allUsersCache[uid] || {};
    const prof = u.profile || {};
    const targetInfo = {
      uid: uid,
      name: prof.name || "User",
      email: prof.email || "",
      phone: prof.phone || "",
      accessedAt: Date.now()
    };
    sessionStorage.setItem("admin_inspect_user", JSON.stringify(targetInfo));
    MMP_Firebase.recordActivity("Admin Accessed Account", `Administrator opened real account: ${prof.name || "User"} (${prof.email || uid})`);
    window.location.href = `dashboard.html?adminViewUid=${encodeURIComponent(uid)}`;
  };

  // Event delegation on Users table body for button clicks
  const usersTbody = document.getElementById("users-table-body");
  if (usersTbody) {
    usersTbody.addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-action]");
      if (!btn) return;
      const action = btn.dataset.action;
      const uid = btn.dataset.uid;
      if (!uid) return;

      if (action === "view-account") {
        accessUserAccount(uid);
      } else if (action === "edit") {
        openEditUserModal(uid);
      } else if (action === "password") {
        openResetPasswordModal(uid);
      } else if (action === "toggle-status") {
        const targetStatus = btn.dataset.status;
        toggleUserStatus(uid, targetStatus);
      } else if (action === "delete") {
        const email = btn.dataset.email || uid;
        deleteUserAccount(uid, email);
      }
    });
  }

  // Close modals
  document.querySelectorAll("[data-close]").forEach(btn => {
    btn.addEventListener("click", () => {
      const modalId = btn.getAttribute("data-close");
      const modal = document.getElementById(modalId);
      if (modal) modal.style.display = "none";
    });
  });

  // Close modal when clicking on backdrop
  document.querySelectorAll(".modal-overlay").forEach(overlay => {
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) {
        overlay.style.display = "none";
      }
    });
  });

  // Settings Save
  const settingsForm = document.getElementById("admin-settings-form");
  if (settingsForm) {
    settingsForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const ann = document.getElementById("setting-announcement").value;
      const stat = document.getElementById("setting-default-status").value;
      const reg = document.getElementById("setting-allow-reg").checked;

      try {
        await MMP_Firebase.adminUpdateSystemSettings({
          announcement: ann,
          defaultUserStatus: stat,
          allowRegistration: reg
        });
        showToast("System settings saved successfully!", "success");
      } catch (err) {
        showToast("Failed to save settings.", "error");
      }
    });
  }

  // OTP Security Settings Form Save & Test
  const brevoForm = document.getElementById("admin-brevo-form");
  const saveBrevoBtn = document.getElementById("save-brevo-btn");
  const testBrevoBtn = document.getElementById("test-brevo-btn");

  if (brevoForm) {
    brevoForm.addEventListener("submit", async (e) => {
      e.preventDefault();

      const senderEmail = (document.getElementById("setting-brevo-sender-email").value || "").trim();
      const senderName = (document.getElementById("setting-brevo-sender-name").value || "").trim();

      if (!senderEmail) {
        showToast("Please enter a valid security email.", "error");
        return;
      }

      const origHTML = saveBrevoBtn.innerHTML;
      saveBrevoBtn.disabled = true;
      saveBrevoBtn.innerHTML = `<span class="spinner"></span> <span>Saving...</span>`;

      try {
        await MMP_Firebase.saveBrevoConfig({
          senderEmail: senderEmail,
          senderName: senderName || "KRISHTECH Security"
        });
        showToast("Security settings saved successfully!", "success");
      } catch (err) {
        console.error(err);
        showToast(err.message || "Failed to save settings.", "error");
      } finally {
        saveBrevoBtn.disabled = false;
        saveBrevoBtn.innerHTML = origHTML;
        lucide.createIcons();
      }
    });
  }

  // Test OTP Generation
  if (testBrevoBtn) {
    testBrevoBtn.addEventListener("click", async () => {
      const senderEmail = (document.getElementById("setting-brevo-sender-email").value || "").trim();
      const targetTestEmail = prompt("Enter email address to generate test verification OTP for:", senderEmail || "ragulkumar1116@gmail.com");
      if (!targetTestEmail) return;

      const origHTML = testBrevoBtn.innerHTML;
      testBrevoBtn.disabled = true;
      testBrevoBtn.innerHTML = `<span class="spinner"></span> <span>Generating Test OTP...</span>`;

      try {
        await MMP_Firebase.testBrevoConnection(targetTestEmail.trim());
        showToast(`Test OTP generated for ${targetTestEmail}!`, "success");
      } catch (err) {
        console.error(err);
        showToast(err.message || "Failed to generate test OTP.", "error");
      } finally {
        testBrevoBtn.disabled = false;
        testBrevoBtn.innerHTML = origHTML;
        lucide.createIcons();
      }
    });
  }

  // Export Backups
  const exportUsersBtn = document.getElementById("admin-export-users-json-btn");
  if (exportUsersBtn) {
    exportUsersBtn.addEventListener("click", () => {
      const safeData = {};
      Object.keys(allUsersCache).forEach(uid => {
        const u = allUsersCache[uid];
        safeData[uid] = { profile: u.profile, createdAt: u.profile?.createdAt };
      });
      const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(safeData, null, 2));
      const a = document.createElement("a");
      a.href = dataStr;
      a.download = "KRISHTECH_Users_Backup_" + new Date().toISOString().slice(0, 10) + ".json";
      a.click();
    });
  }

  // Admin Logout
  const logoutBtn = document.getElementById("admin-logout-btn");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", async () => {
      try {
        await MMP_Firebase.logoutUser();
        window.location.href = "admin-login.html";
      } catch (err) {
        showToast("Error logging out.", "error");
      }
    });
  }

  // Search & Filter event listeners
  document.getElementById("users-search-input")?.addEventListener("input", updateUsersUI);
  document.getElementById("users-status-filter")?.addEventListener("change", updateUsersUI);
  document.getElementById("session-search-input")?.addEventListener("input", updateSessionsUI);
  document.getElementById("session-status-filter")?.addEventListener("change", updateSessionsUI);
  document.getElementById("activity-search-input")?.addEventListener("input", updateActivitiesUI);

  // Helpers
  function formatCurrency(n) {
    return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(n || 0);
  }

  function formatFullDateTime(ts) {
    if (!ts) return "N/A";
    const d = new Date(ts);
    const day = String(d.getDate()).padStart(2, "0");
    const mon = String(d.getMonth() + 1).padStart(2, "0");
    const yr = d.getFullYear();
    let hrs = d.getHours();
    const min = String(d.getMinutes()).padStart(2, "0");
    const ampm = hrs >= 12 ? "PM" : "AM";
    hrs = hrs % 12 || 12;
    return `${day}/${mon}/${yr} ${hrs}:${min} ${ampm}`;
  }

  function formatDuration(ms) {
    if (!ms || ms < 0) return "0m";
    const totalSecs = Math.floor(ms / 1000);
    const hrs = Math.floor(totalSecs / 3600);
    const mins = Math.floor((totalSecs % 3600) / 60);
    if (hrs > 0) return `${hrs}h ${mins}m`;
    return `${mins}m`;
  }

  function formatTimeAgo(ts) {
    const diff = Math.floor((Date.now() - ts) / 1000);
    if (diff < 60) return "Just now";
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
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
});
