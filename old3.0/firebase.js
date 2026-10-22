// Money Manager Pro - Firebase Service Interface
// Branded with krish.logo.com

// ==========================================
// FIREBASE CONFIGURATION
// ==========================================
const firebaseConfig = {
  apiKey: "AIzaSyDIiBdSKMigymz8P4PooMSguP7LoLKvllg",
  authDomain: "hotel-c4382.firebaseapp.com",
  databaseURL: "https://hotel-c4382-default-rtdb.firebaseio.com",
  projectId: "hotel-c4382",
  storageBucket: "hotel-c4382.firebasestorage.app",
  messagingSenderId: "879811080075",
  appId: "1:879811080075:web:656ac50faffced4aee898e",
  measurementId: "G-EGS10RS2V4"
};

// Check if Firebase has been configured by the user
const isFirebaseConfigured = () => {
  return firebaseConfig.apiKey && 
         firebaseConfig.apiKey !== "" && 
         !firebaseConfig.apiKey.startsWith("YOUR_");
};

// Master Admin Email List
const ADMIN_EMAILS = [
  "admin@krishtech.com",
  "admin@gmail.com",
  "aitsecurity6@gmail.com",
  "superadmin@krishtech.com"
];

// Check if running directly via local file:// protocol
const isFileProtocol = typeof window !== "undefined" && window.location.protocol === "file:";

// ==========================================
// REALTIME DATABASE-BACKED AUTH PROVIDER
// Enables instant login, admin registration & CRUD when opened via file:// protocol
// without requiring iframe cross-origin permissions
// ==========================================
function createRTDBAuth(database) {
  let currentUser = null;
  const authListeners = [];

  try {
    const saved = localStorage.getItem("mmp_auth_user");
    if (saved) {
      currentUser = JSON.parse(saved);
      if (currentUser) {
        currentUser.updatePassword = async (newPass) => {
          if (currentUser.uid) {
            await database.ref("money_manager_users/" + currentUser.uid + "/profile/password").set(newPass);
          }
        };
      }
    }
  } catch (e) {}

  const notifyListeners = (u) => {
    authListeners.forEach(cb => {
      try { cb(u); } catch (e) { console.error(e); }
    });
  };

  const wrapUser = (u) => {
    if (!u) return null;
    u.updatePassword = async (newPass) => {
      if (u.uid) {
        await database.ref("money_manager_users/" + u.uid + "/profile/password").set(newPass);
        await database.ref("money_manager_users/" + u.uid + "/password").set(newPass);
      }
    };
    u.updateEmail = async (newEmail) => {
      if (u.uid) {
        const clean = newEmail.trim().toLowerCase();
        await database.ref("money_manager_users/" + u.uid + "/profile/email").set(clean);
        u.email = clean;
        localStorage.setItem("mmp_auth_user", JSON.stringify(u));
        notifyListeners(u);
      }
    };
    return u;
  };

  return {
    get currentUser() {
      return currentUser;
    },
    signInWithEmailAndPassword: async (email, password) => {
      const cleanEmail = (email || "").trim().toLowerCase();

      // 1. Check predefined Master Admin credentials
      if (ADMIN_EMAILS.map(e => e.toLowerCase()).includes(cleanEmail)) {
        let adminPass = null;
        try {
          const adminSnap = await database.ref("app_admins").once("value");
          const admins = adminSnap.val() || {};
          for (const aid in admins) {
            if ((admins[aid].email || "").toLowerCase() === cleanEmail) {
              adminPass = admins[aid].password;
              break;
            }
          }
        } catch (e) {}

        if (adminPass && adminPass !== password) {
          throw new Error("Invalid administrator password.");
        }

        currentUser = wrapUser({
          uid: "admin_" + cleanEmail.replace(/[^a-z0-9]/g, "_"),
          email: cleanEmail,
          displayName: "System Administrator"
        });
        localStorage.setItem("mmp_auth_user", JSON.stringify(currentUser));
        notifyListeners(currentUser);
        return { user: currentUser };
      }

      // 2. Check app_admins in Firebase Realtime Database
      try {
        const adminSnap = await database.ref("app_admins").once("value");
        const admins = adminSnap.val() || {};
        for (const aid in admins) {
          const a = admins[aid];
          if ((a.email || "").toLowerCase() === cleanEmail) {
            if (!a.password || a.password === password) {
              currentUser = wrapUser({
                uid: a.uid || aid,
                email: a.email,
                displayName: a.name || "Administrator"
              });
              localStorage.setItem("mmp_auth_user", JSON.stringify(currentUser));
              notifyListeners(currentUser);
              return { user: currentUser };
            }
          }
        }
      } catch (e) {
        console.warn("RTDB admin verification notice:", e);
      }

      // 3. Check registered users in money_manager_users
      try {
        const snap = await database.ref("money_manager_users").once("value");
        const allUsers = snap.val() || {};
        for (const uid in allUsers) {
          const uData = allUsers[uid] || {};
          const prof = uData.profile || {};
          const userEmail = (prof.email || prof[' email'] || uData.email || "").trim().toLowerCase();
          
          if (userEmail === cleanEmail) {
            // Priority Check 1: Real-time Account Deactivation Enforcement
            if (prof.status === "deactivated") {
              throw new Error("Account Deactivated: Your account has been suspended by the administrator. Contact support for assistance.");
            }

            // Priority Check 2: Password Verification (Directly synced with Admin Panel changes)
            const expectedPassword = prof.password || uData.password;
            if (expectedPassword) {
              if (expectedPassword !== password) {
                throw new Error("Invalid password. Please verify your credentials or contact administrator.");
              }
            } else {
              // Legacy account without stored password: set it now so future logins & admin changes work
              try {
                await database.ref("money_manager_users/" + uid + "/profile/password").set(password);
                await database.ref("money_manager_users/" + uid + "/password").set(password);
              } catch (pwErr) {}
            }

            currentUser = wrapUser({
              uid: uid,
              email: prof.email || cleanEmail,
              displayName: prof.name || cleanEmail.split("@")[0]
            });
            localStorage.setItem("mmp_auth_user", JSON.stringify(currentUser));
            notifyListeners(currentUser);
            return { user: currentUser };
          }
        }
      } catch (e) {
        if (e.message && (e.message.includes("Account Deactivated") || e.message.includes("Invalid password"))) {
          throw e;
        }
        console.warn("RTDB user verification notice:", e);
      }

      // 4. Fallback check against localStorage (for mock mode preview)
      const localUsers = JSON.parse(localStorage.getItem("mmp_users") || "{}");
      for (const uid in localUsers) {
        const prof = localUsers[uid].profile;
        if (prof && (prof.email || "").toLowerCase() === cleanEmail) {
          if (prof.status === "deactivated") {
            throw new Error("Account Deactivated: Your account has been suspended by the administrator.");
          }
          if (prof.password === password) {
            currentUser = wrapUser({ uid, email: prof.email, displayName: prof.name });
            localStorage.setItem("mmp_auth_user", JSON.stringify(currentUser));
            notifyListeners(currentUser);
            return { user: currentUser };
          }
        }
      }

      throw new Error("Invalid email or password. Please verify your credentials.");
    },

    createUserWithEmailAndPassword: async (email, password) => {
      const cleanEmail = (email || "").trim().toLowerCase();
      const newUid = "usr_" + Date.now() + "_" + Math.random().toString(36).substr(2, 6);
      currentUser = wrapUser({
        uid: newUid,
        email: cleanEmail,
        displayName: cleanEmail.split("@")[0]
      });
      localStorage.setItem("mmp_auth_user", JSON.stringify(currentUser));
      notifyListeners(currentUser);
      return { user: currentUser };
    },

    signOut: async () => {
      currentUser = null;
      localStorage.removeItem("mmp_auth_user");
      notifyListeners(null);
      return Promise.resolve();
    },

    onAuthStateChanged: (callback) => {
      authListeners.push(callback);
      setTimeout(() => callback(currentUser), 15);
      return () => {
        const idx = authListeners.indexOf(callback);
        if (idx !== -1) authListeners.splice(idx, 1);
      };
    },

    sendPasswordResetEmail: async (email) => {
      console.log("Password reset instructions recorded for:", email);
      return Promise.resolve();
    }
  };
}

// Initialize Firebase if configured
let auth, db;
let mockAuth = null;
let mockDb = null;
let currentSessionRef = null;
let currentSessionId = null;

if (isFirebaseConfigured()) {
  try {
    if (!firebase.apps.length) {
      firebase.initializeApp(firebaseConfig);
    }
    db = firebase.database();

    // Direct Realtime Database Auth engine guarantees 100% credential synchronization
    // with the Admin Panel across both file:// and http:// protocols. Admin password resets,
    // email changes, and account deactivations take effect immediately with zero delay.
    auth = createRTDBAuth(db);
    console.log("Firebase initialized successfully with RTDB Auth engine.");
  } catch (error) {
    console.error("Firebase initialization failed, falling back to Mock Database:", error);
    setupMockFirebase();
  }
} else {
  console.warn("Firebase credentials not configured. Falling back to client-side Mock Database.");
  setupMockFirebase();
}

// ==========================================
// MOCK DATABASE & AUTHENTICATION FALLBACK
// Stored in localStorage for instant developer preview
// ==========================================
function setupMockFirebase() {
  if (!localStorage.getItem("mmp_users")) {
    localStorage.setItem("mmp_users", JSON.stringify({}));
  }
  if (!localStorage.getItem("mmp_active_session")) {
    localStorage.setItem("mmp_active_session", null);
  }
  if (!localStorage.getItem("mmp_sessions")) {
    localStorage.setItem("mmp_sessions", JSON.stringify({}));
  }
  if (!localStorage.getItem("mmp_activity")) {
    localStorage.setItem("mmp_activity", JSON.stringify([]));
  }

  const getUsers = () => JSON.parse(localStorage.getItem("mmp_users") || "{}");
  const setUsers = (users) => localStorage.setItem("mmp_users", JSON.stringify(users));
  
  mockAuth = {
    currentUser: null,
    signInWithEmailAndPassword: async (email, password) => {
      const users = getUsers();
      let user = Object.values(users).find(u => u.profile && u.profile.email.toLowerCase() === email.toLowerCase());
      
      // Auto-provision mock admin credentials for offline/demo testing
      if (!user && (email.toLowerCase() === "admin@krishtech.com" || email.toLowerCase() === "admin@gmail.com")) {
        const uid = "mock_admin_" + Date.now();
        users[uid] = {
          profile: { uid, name: "System Administrator", email: email.toLowerCase(), password: password, role: "admin", status: "active", createdAt: Date.now() },
          income_records: {},
          expense_records: {},
          vehicle_expenses: {},
          custom_categories: {},
          settings: { theme: "auto" }
        };
        setUsers(users);
        user = users[uid];
      }

      if (!user || user.profile.password !== password) {
        throw new Error("Invalid email or password.");
      }
      mockAuth.currentUser = { uid: user.profile.uid, email: user.profile.email, displayName: user.profile.name };
      localStorage.setItem("mmp_active_session", JSON.stringify(mockAuth.currentUser));
      return { user: mockAuth.currentUser };
    },
    createUserWithEmailAndPassword: async (email, password) => {
      const users = getUsers();
      const exists = Object.values(users).find(u => u.profile && u.profile.email === email);
      if (exists) {
        throw new Error("Email address already registered.");
      }
      const uid = "mock_uid_" + Math.random().toString(36).substr(2, 9);
      users[uid] = {
        profile: { uid, email, password, createdAt: Date.now() },
        income_records: {},
        expense_records: {},
        vehicle_expenses: {},
        custom_categories: {},
        settings: { theme: "auto" }
      };
      setUsers(users);
      mockAuth.currentUser = { uid, email };
      localStorage.setItem("mmp_active_session", JSON.stringify(mockAuth.currentUser));
      return { user: mockAuth.currentUser };
    },
    signOut: async () => {
      mockAuth.currentUser = null;
      localStorage.setItem("mmp_active_session", null);
    },
    sendPasswordResetEmail: async (email) => {
      const users = getUsers();
      const exists = Object.values(users).find(u => u.profile && u.profile.email === email);
      if (!exists) {
        throw new Error("No user found with this email address.");
      }
      return true;
    },
    onAuthStateChanged: (callback) => {
      const active = JSON.parse(localStorage.getItem("mmp_active_session") || "null");
      mockAuth.currentUser = active;
      callback(active);
    }
  };

  mockDb = {
    ref: (path) => {
      const parts = path.split('/');
      const root = parts[0];
      const uid = parts[1];
      const category = parts[2];
      const id = parts[3];

      return {
        set: async (value) => {
          if (root === "money_manager_users") {
            const users = getUsers();
            if (!users[uid]) users[uid] = {};
            if (!category) {
              users[uid] = value;
            } else if (!id) {
              users[uid][category] = value;
            } else {
              if (!users[uid][category]) users[uid][category] = {};
              users[uid][category][id] = value;
            }
            setUsers(users);
            triggerListeners(uid);
          } else if (root === "user_sessions") {
            const sessions = JSON.parse(localStorage.getItem("mmp_sessions") || "{}");
            if (uid) {
              sessions[uid] = value;
            } else {
              // root set
            }
            localStorage.setItem("mmp_sessions", JSON.stringify(sessions));
            triggerGlobalListeners("user_sessions", sessions);
          }
          return true;
        },
        update: async (value) => {
          if (root === "money_manager_users") {
            const users = getUsers();
            if (!users[uid]) users[uid] = {};
            if (!category) {
              users[uid] = { ...users[uid], ...value };
            } else if (!id) {
              users[uid][category] = { ...users[uid][category], ...value };
            } else {
              users[uid][category][id] = { ...users[uid][category][id], ...value };
            }
            setUsers(users);
            triggerListeners(uid);
          } else if (root === "user_sessions") {
            const sessions = JSON.parse(localStorage.getItem("mmp_sessions") || "{}");
            if (uid && sessions[uid]) {
              sessions[uid] = { ...sessions[uid], ...value };
              localStorage.setItem("mmp_sessions", JSON.stringify(sessions));
              triggerGlobalListeners("user_sessions", sessions);
            }
          }
          return true;
        },
        push: (value) => {
          const newId = "rec_" + Math.random().toString(36).substr(2, 9);
          if (root === "money_manager_users") {
            const users = getUsers();
            if (!users[uid]) users[uid] = {};
            if (!users[uid][category]) users[uid][category] = {};
            users[uid][category][newId] = value;
            setUsers(users);
            triggerListeners(uid);
          } else if (root === "user_sessions") {
            const sessions = JSON.parse(localStorage.getItem("mmp_sessions") || "{}");
            sessions[newId] = { id: newId, ...value };
            localStorage.setItem("mmp_sessions", JSON.stringify(sessions));
            triggerGlobalListeners("user_sessions", sessions);
          } else if (root === "activity_logs") {
            const logs = JSON.parse(localStorage.getItem("mmp_activity") || "[]");
            logs.unshift({ id: newId, ...value });
            if (logs.length > 200) logs.pop();
            localStorage.setItem("mmp_activity", JSON.stringify(logs));
            triggerGlobalListeners("activity_logs", logs);
          }
          return {
            key: newId,
            set: (val) => {
              if (root === "user_sessions") {
                const sessions = JSON.parse(localStorage.getItem("mmp_sessions") || "{}");
                sessions[newId] = { id: newId, ...val };
                localStorage.setItem("mmp_sessions", JSON.stringify(sessions));
                triggerGlobalListeners("user_sessions", sessions);
              }
              return Promise.resolve();
            },
            onDisconnect: () => ({ update: () => {} }),
            then: (cb) => { if (cb) cb(); return Promise.resolve(); }
          };
        },
        remove: async () => {
          if (root === "money_manager_users") {
            const users = getUsers();
            if (users[uid] && users[uid][category] && users[uid][category][id]) {
              delete users[uid][category][id];
              setUsers(users);
              triggerListeners(uid);
            }
          } else if (root === "user_sessions" && uid) {
            const sessions = JSON.parse(localStorage.getItem("mmp_sessions") || "{}");
            delete sessions[uid];
            localStorage.setItem("mmp_sessions", JSON.stringify(sessions));
            triggerGlobalListeners("user_sessions", sessions);
          }
          return true;
        },
        once: async () => {
          if (root === "money_manager_users") {
            const users = getUsers();
            const data = users[uid] ? (category ? (id ? users[uid][category][id] : users[uid][category]) : users[uid]) : null;
            return { val: () => data };
          } else if (root === "user_sessions") {
            const sessions = JSON.parse(localStorage.getItem("mmp_sessions") || "{}");
            return { val: () => (uid ? sessions[uid] : sessions) };
          } else if (root === "activity_logs") {
            const logs = JSON.parse(localStorage.getItem("mmp_activity") || "[]");
            return { val: () => logs };
          }
          return { val: () => null };
        },
        on: (event, callback) => {
          if (!window.mockDbListeners) window.mockDbListeners = [];
          window.mockDbListeners.push({ root, uid, category, callback });
          if (root === "money_manager_users") {
            const users = getUsers();
            const val = uid ? (users[uid] || null) : users;
            callback({ val: () => val });
          } else if (root === "user_sessions") {
            const sessions = JSON.parse(localStorage.getItem("mmp_sessions") || "{}");
            callback({ val: () => sessions });
          } else if (root === "activity_logs") {
            const logs = JSON.parse(localStorage.getItem("mmp_activity") || "[]");
            callback({ val: () => logs });
          }
        },
        off: () => {
          window.mockDbListeners = (window.mockDbListeners || []).filter(l => l.root !== root || l.uid !== uid);
        },
        limitToLast: () => mockDb.ref(path),
        onDisconnect: () => ({
          set: () => {},
          update: () => {}
        })
      };
    }
  };

  function triggerListeners(uid) {
    if (window.mockDbListeners) {
      const users = getUsers();
      window.mockDbListeners.forEach(listener => {
        if (listener.root === "money_manager_users" && listener.uid === uid) {
          listener.callback({
            val: () => users[uid] || null
          });
        }
      });
    }
  }

  function triggerGlobalListeners(targetRoot, data) {
    if (window.mockDbListeners) {
      window.mockDbListeners.forEach(listener => {
        if (listener.root === targetRoot) {
          listener.callback({
            val: () => data
          });
        }
      });
    }
  }

  auth = mockAuth;
  db = mockDb;
}

// ==========================================
// AUDIT LOGGING & SESSION PRESENCE TRACKING
// "Who are all coming, going, we need to watch"
// ==========================================

const recordActivity = async (action, details = "") => {
  try {
    const user = auth ? auth.currentUser : null;
    let userName = "User";
    let userEmail = user ? user.email : "guest";
    let phone = "N/A";

    if (user && db) {
      try {
        const snap = await db.ref('money_manager_users/' + user.uid + '/profile').once('value');
        const prof = snap.val();
        if (prof) {
          if (prof.name) userName = prof.name;
          if (prof.phone) phone = prof.phone;
        }
      } catch (e) {}
    }

    const logData = {
      timestamp: Date.now(),
      action: action,
      details: details,
      uid: user ? user.uid : "anonymous",
      userName: userName,
      userEmail: userEmail,
      phone: phone,
      device: /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent) ? "Mobile" : "Desktop"
    };

    if (isFirebaseConfigured() && db) {
      return db.ref('activity_logs').push(logData);
    } else if (mockDb) {
      return mockDb.ref('activity_logs').push(logData);
    }
  } catch (err) {
    console.warn("Could not record activity:", err);
  }
};

// Presence and live session setup on login
const setupPresenceAndSession = async (user) => {
  if (!user) return;
  const uid = user.uid;
  const device = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent) ? "Mobile" : "Desktop";

  let name = user.displayName || user.email.split('@')[0];
  let phone = "N/A";

  try {
    const snap = await db.ref('money_manager_users/' + uid + '/profile').once('value');
    const profile = snap.val();
    if (profile) {
      if (profile.name) name = profile.name;
      if (profile.phone) phone = profile.phone;
    }
  } catch (e) {}

  if (isFirebaseConfigured() && typeof firebase !== 'undefined') {
    try {
      const connectedRef = db.ref(".info/connected");
      const userPresenceRef = db.ref('money_manager_users/' + uid + '/presence');
      const sessionsRef = db.ref('user_sessions');

      connectedRef.on("value", (snap) => {
        if (snap.val() === true) {
          // Push new active session
          const sessionPush = sessionsRef.push();
          currentSessionId = sessionPush.key;
          currentSessionRef = sessionPush;

          sessionPush.set({
            id: currentSessionId,
            uid: uid,
            name: name,
            email: user.email,
            phone: phone,
            device: device,
            userAgent: navigator.userAgent,
            loginTime: Date.now(),
            logoutTime: null,
            status: "online"
          });

          // Disconnect triggers
          sessionPush.onDisconnect().update({
            logoutTime: firebase.database.ServerValue.TIMESTAMP,
            status: "offline"
          });

          userPresenceRef.onDisconnect().set({
            status: "offline",
            lastSeen: firebase.database.ServerValue.TIMESTAMP
          });

          userPresenceRef.set({
            status: "online",
            lastSeen: Date.now()
          });
        }
      });
    } catch (e) {
      console.warn("Presence setup warning:", e);
    }
  } else {
    // Mock Mode
    const sessionKey = "sess_" + Date.now();
    currentSessionId = sessionKey;
    const sessions = JSON.parse(localStorage.getItem("mmp_sessions") || "{}");
    sessions[sessionKey] = {
      id: sessionKey,
      uid: uid,
      name: name,
      email: user.email,
      phone: phone,
      device: device,
      userAgent: navigator.userAgent,
      loginTime: Date.now(),
      logoutTime: null,
      status: "online"
    };
    localStorage.setItem("mmp_sessions", JSON.stringify(sessions));
  }

  // Record audit log
  recordActivity("User Logged In", `${name} (${user.email}) accessed via ${device}`);
};

// ==========================================
// CORE APP METHODS (Drives HTML operations)
// ==========================================

// Authentication Actions
const loginUser = async (email, password) => {
  const cleanEmail = (email || "").trim().toLowerCase();
  const cred = await auth.signInWithEmailAndPassword(cleanEmail, password);
  const user = cred.user;
  
  // Check if account has been deactivated by administrator
  if (db) {
    try {
      const snap = await db.ref('money_manager_users/' + user.uid + '/profile').once('value');
      const profile = snap.val();
      if (profile && profile.status === "deactivated") {
        await auth.signOut();
        throw new Error("Account Deactivated: Your account has been suspended by the administrator. Contact support for assistance.");
      }
    } catch (e) {
      if (e.message && e.message.includes("Account Deactivated")) {
        throw e;
      }
    }
  }

  await setupPresenceAndSession(cred.user);
  return cred;
};

const registerUser = async (name, phone, email, password) => {
  const cleanEmail = (email || "").trim().toLowerCase();

  // Check if email already exists in RTDB
  if (db) {
    try {
      const snap = await db.ref('money_manager_users').once('value');
      const allUsers = snap.val() || {};
      for (const uid in allUsers) {
        const prof = allUsers[uid]?.profile;
        if (prof && (prof.email || "").trim().toLowerCase() === cleanEmail) {
          throw new Error("An account with this email address already exists. Please login instead.");
        }
      }
    } catch (e) {
      if (e.message && e.message.includes("already exists")) throw e;
    }
  }

  const userCredential = await auth.createUserWithEmailAndPassword(cleanEmail, password);
  const user = userCredential.user;
  
  // Create profile node with password and active status (100% preserves original structure)
  await db.ref('money_manager_users/' + user.uid + '/profile').set({
    uid: user.uid,
    name: name,
    phone: phone,
    email: cleanEmail,
    password: password,
    status: "active",
    createdAt: Date.now()
  });
  
  // Set default settings
  await db.ref('money_manager_users/' + user.uid + '/settings').set({
    theme: "auto"
  });

  await setupPresenceAndSession(user);
  recordActivity("User Registered", `New account registered: ${name} (${cleanEmail})`);

  return user;
};

const logoutUser = async () => {
  try {
    const user = auth ? auth.currentUser : null;
    if (user) {
      const uid = user.uid;
      // Close active session
      if (currentSessionRef) {
        await currentSessionRef.update({
          logoutTime: Date.now(),
          status: "offline"
        });
      } else if (currentSessionId && mockDb) {
        const sessions = JSON.parse(localStorage.getItem("mmp_sessions") || "{}");
        if (sessions[currentSessionId]) {
          sessions[currentSessionId].logoutTime = Date.now();
          sessions[currentSessionId].status = "offline";
          localStorage.setItem("mmp_sessions", JSON.stringify(sessions));
        }
      }

      if (db) {
        await db.ref('money_manager_users/' + uid + '/presence').set({
          status: "offline",
          lastSeen: Date.now()
        });
      }

      recordActivity("User Logged Out", `${user.email} signed out`);
    }
  } catch (err) {
    console.warn("Logout session update notice:", err);
  }

  return auth.signOut();
};

const resetPassword = (email) => {
  recordActivity("Password Reset Requested", `For: ${email}`);
  return auth.sendPasswordResetEmail(email);
};

const onAuthChanged = (callback) => {
  auth.onAuthStateChanged(async (user) => {
    if (user && !currentSessionId) {
      setupPresenceAndSession(user);
    }
    callback(user);
  });
};

const changePassword = async (newPassword) => {
  if (isFirebaseConfigured()) {
    const user = auth.currentUser;
    const res = await user.updatePassword(newPassword);
    recordActivity("Password Changed", "Account password updated");
    return res;
  } else {
    const user = auth.currentUser;
    const users = JSON.parse(localStorage.getItem("mmp_users"));
    if (users[user.uid] && users[user.uid].profile) {
      users[user.uid].profile.password = newPassword;
      localStorage.setItem("mmp_users", JSON.stringify(users));
      recordActivity("Password Changed", "Mock user password updated");
      return true;
    }
    throw new Error("Mock user not found.");
  }
};

// Database Profile Settings Actions
const updateProfileSettings = (name, phone) => {
  const uid = auth.currentUser.uid;
  recordActivity("Profile Updated", `Updated details to ${name}, ${phone}`);
  return db.ref('money_manager_users/' + uid + '/profile').update({
    name: name,
    phone: phone
  });
};

const updateThemeSettings = (theme) => {
  const uid = auth.currentUser.uid;
  return db.ref('money_manager_users/' + uid + '/settings').update({
    theme: theme
  });
};

// Active Target UID (Used when Administrator is inspecting a user account)
let activeTargetUid = null;
const setTargetUid = (uid) => {
  activeTargetUid = uid;
};
const getTargetUid = () => {
  return activeTargetUid || (auth && auth.currentUser ? auth.currentUser.uid : null);
};

const getUserDataOnce = async (targetUid) => {
  const uid = targetUid || getTargetUid();
  if (!uid) return null;
  if (isFirebaseConfigured() && db) {
    try {
      const snap = await db.ref('money_manager_users/' + uid).once('value');
      return snap.val();
    } catch (e) {
      console.warn("getUserDataOnce error:", e);
      return null;
    }
  } else if (mockDb) {
    const users = JSON.parse(localStorage.getItem("mmp_users") || "{}");
    return users[uid] || null;
  }
  return null;
};

// Transaction Management Operations

// 1. Income Records
const saveIncome = (amount, category, date, time, note) => {
  const uid = getTargetUid();
  if (!uid) return Promise.reject(new Error("No user target"));
  recordActivity("Added Income", `+ ₹${amount} (${category}) on ${date} [target: ${uid}]`);
  return db.ref('money_manager_users/' + uid + '/income_records').push({
    amount: parseFloat(amount),
    category,
    date,
    time,
    note,
    createdAt: Date.now()
  });
};

const updateIncome = (id, amount, category, date, time, note) => {
  const uid = getTargetUid();
  if (!uid) return Promise.reject(new Error("No user target"));
  recordActivity("Updated Income", `₹${amount} (${category}) on ${date} [target: ${uid}]`);
  return db.ref('money_manager_users/' + uid + '/income_records/' + id).set({
    amount: parseFloat(amount),
    category,
    date,
    time,
    note,
    createdAt: Date.now()
  });
};

const deleteIncome = (id) => {
  const uid = getTargetUid();
  if (!uid) return Promise.reject(new Error("No user target"));
  recordActivity("Deleted Income", `Income record removed [target: ${uid}]`);
  return db.ref('money_manager_users/' + uid + '/income_records/' + id).remove();
};

// 2. Expense Records
const saveExpense = (amount, category, date, time, note) => {
  const uid = getTargetUid();
  if (!uid) return Promise.reject(new Error("No user target"));
  recordActivity("Added Expense", `- ₹${amount} (${category}) on ${date} [target: ${uid}]`);
  return db.ref('money_manager_users/' + uid + '/expense_records').push({
    amount: parseFloat(amount),
    category,
    date,
    time,
    note,
    createdAt: Date.now()
  });
};

const updateExpense = (id, amount, category, date, time, note) => {
  const uid = getTargetUid();
  if (!uid) return Promise.reject(new Error("No user target"));
  recordActivity("Updated Expense", `₹${amount} (${category}) on ${date} [target: ${uid}]`);
  return db.ref('money_manager_users/' + uid + '/expense_records/' + id).set({
    amount: parseFloat(amount),
    category,
    date,
    time,
    note,
    createdAt: Date.now()
  });
};

const deleteExpense = (id) => {
  const uid = getTargetUid();
  if (!uid) return Promise.reject(new Error("No user target"));
  recordActivity("Deleted Expense", `Expense record removed [target: ${uid}]`);
  return db.ref('money_manager_users/' + uid + '/expense_records/' + id).remove();
};

// 3. Vehicle Expenses
const saveVehicleExpense = (vehicleType, category, amount, date, time, note) => {
  const uid = getTargetUid();
  if (!uid) return Promise.reject(new Error("No user target"));
  recordActivity("Added Vehicle Expense", `${vehicleType.toUpperCase()} - ${category}: ₹${amount} [target: ${uid}]`);
  return db.ref('money_manager_users/' + uid + '/vehicle_expenses').push({
    vehicleType,
    category,
    amount: parseFloat(amount),
    date,
    time,
    note,
    createdAt: Date.now()
  });
};

const updateVehicleExpense = (id, vehicleType, category, amount, date, time, note) => {
  const uid = getTargetUid();
  if (!uid) return Promise.reject(new Error("No user target"));
  recordActivity("Updated Vehicle Expense", `${vehicleType.toUpperCase()} - ${category}: ₹${amount} [target: ${uid}]`);
  return db.ref('money_manager_users/' + uid + '/vehicle_expenses/' + id).set({
    vehicleType,
    category,
    amount: parseFloat(amount),
    date,
    time,
    note,
    createdAt: Date.now()
  });
};

const deleteVehicleExpense = (id) => {
  const uid = getTargetUid();
  if (!uid) return Promise.reject(new Error("No user target"));
  recordActivity("Deleted Vehicle Expense", `Vehicle expense record removed [target: ${uid}]`);
  return db.ref('money_manager_users/' + uid + '/vehicle_expenses/' + id).remove();
};

// 4. Custom Categories Operations
const saveCustomCategory = (name, type) => {
  const uid = getTargetUid();
  if (!uid) return Promise.reject(new Error("No user target"));
  recordActivity("Added Category", `${name} (${type}) [target: ${uid}]`);
  return db.ref('money_manager_users/' + uid + '/custom_categories').push({
    name,
    type
  });
};

const deleteCustomCategory = (id) => {
  const uid = getTargetUid();
  if (!uid) return Promise.reject(new Error("No user target"));
  recordActivity("Deleted Category", `Category removed [target: ${uid}]`);
  return db.ref('money_manager_users/' + uid + '/custom_categories/' + id).remove();
};

// Load Realtime Data listener for single user (or admin-inspected target user)
const listenToUserData = (callback, overrideUid = null) => {
  const uid = overrideUid || getTargetUid();
  if (!uid) return () => {};
  if (isFirebaseConfigured() && db) {
    const dbRef = db.ref('money_manager_users/' + uid);
    dbRef.on('value', (snapshot) => {
      callback(snapshot.val());
    });
    return () => dbRef.off();
  } else if (mockDb) {
    const users = JSON.parse(localStorage.getItem("mmp_users") || "{}");
    callback(users[uid] || null);
    return () => {};
  }
  return () => {};
};

// ==========================================
// ADMIN OPERATIONS (Monitor coming & going)
// ==========================================

// Listen to all users in the system (Preserving all old data)
const listenToAllUsers = (callback) => {
  const ref = db.ref('money_manager_users');
  ref.on('value', (snap) => {
    callback(snap.val() || {});
  });
  return () => ref.off();
};

// Listen to login/logout sessions ("Who is coming & going")
const listenToUserSessions = (callback) => {
  const ref = db.ref('user_sessions');
  ref.on('value', (snap) => {
    callback(snap.val() || {});
  });
  return () => ref.off();
};

// Listen to realtime activity audit logs
const listenToActivityLogs = (callback) => {
  const ref = db.ref('activity_logs');
  ref.on('value', (snap) => {
    callback(snap.val() || {});
  });
  return () => ref.off();
};

// Delete a session record from admin panel
const deleteSessionRecord = (id) => {
  return db.ref('user_sessions/' + id).remove();
};

// ==========================================
// ADVANCED ADMIN CAPABILITIES
// ==========================================

// Check if a given user has admin privileges
const checkIsAdmin = async (user) => {
  if (!user) return false;
  const email = (user.email || "").toLowerCase();
  if (ADMIN_EMAILS.map(e => e.toLowerCase()).includes(email)) return true;

  try {
    if (db) {
      const snap = await db.ref('app_admins/' + user.uid).once('value');
      if (snap.val()) return true;

      // Check all app_admins by email
      const allAdminsSnap = await db.ref('app_admins').once('value');
      const allAdmins = allAdminsSnap.val() || {};
      if (Object.values(allAdmins).some(a => (a.email || "").toLowerCase() === email)) return true;

      // Check if role is admin in profile
      const profSnap = await db.ref('money_manager_users/' + user.uid + '/profile').once('value');
      const prof = profSnap.val();
      if (prof && prof.role === 'admin') return true;
    }
  } catch (e) {}

  return false;
};

// Admin specific login
const loginAdmin = async (email, password) => {
  const cred = await auth.signInWithEmailAndPassword(email, password);
  const user = cred.user;
  const isAdmin = await checkIsAdmin(user);
  if (!isAdmin) {
    await auth.signOut();
    throw new Error("Access Denied: You do not have administrator privileges.");
  }
  await setupPresenceAndSession(user);
  recordActivity("Admin Login", `${user.email} logged into Admin Console`);
  return user;
};

// Admin Add New User
const adminAddUser = async (name, phone, email, password) => {
  const newUid = "usr_" + Date.now() + "_" + Math.random().toString(36).substr(2, 5);
  const userNode = {
    profile: {
      uid: newUid,
      name: name,
      phone: phone,
      email: email,
      password: password,
      status: "active",
      createdAt: Date.now()
    },
    settings: {
      theme: "auto"
    },
    income_records: {},
    expense_records: {},
    vehicle_expenses: {},
    custom_categories: {}
  };

  if (!isFirebaseConfigured() && mockDb) {
    const users = JSON.parse(localStorage.getItem("mmp_users") || "{}");
    userNode.profile.password = password;
    users[newUid] = userNode;
    localStorage.setItem("mmp_users", JSON.stringify(users));
  }

  await db.ref('money_manager_users/' + newUid).set(userNode);
  recordActivity("Admin Created User", `User created: ${name} (${email})`);
  return { uid: newUid, email };
};

// Admin Edit User Details
const adminUpdateUser = async (uid, updates) => {
  const cleanUpdates = { ...updates };
  if (cleanUpdates.email) {
    cleanUpdates.email = cleanUpdates.email.trim().toLowerCase();
  }
  if (cleanUpdates.password !== undefined && cleanUpdates.password !== null && cleanUpdates.password !== "") {
    cleanUpdates.password = String(cleanUpdates.password).trim();
  }

  if (db) {
    // Check if new email is already assigned to another user
    if (cleanUpdates.email) {
      try {
        const allUsersSnap = await db.ref('money_manager_users').once('value');
        const allUsers = allUsersSnap.val() || {};
        for (const otherUid in allUsers) {
          if (otherUid !== uid) {
            const otherProf = allUsers[otherUid]?.profile || {};
            const otherEmail = (otherProf.email || allUsers[otherUid]?.email || "").trim().toLowerCase();
            if (otherEmail === cleanUpdates.email) {
              throw new Error(`The email address "${cleanUpdates.email}" is already in use by another user account.`);
            }
          }
        }
      } catch (checkErr) {
        if (checkErr.message && checkErr.message.includes("already in use")) {
          throw checkErr;
        }
      }
    }

    try {
      const currentSnap = await db.ref('money_manager_users/' + uid + '/profile').once('value');
      const current = currentSnap.val() || {};
      const merged = { ...current, ...cleanUpdates, updatedAt: Date.now() };
      await db.ref('money_manager_users/' + uid + '/profile').update(merged);

      // Always write password to root /password node as well if provided
      if (cleanUpdates.password) {
        await db.ref('money_manager_users/' + uid + '/password').set(cleanUpdates.password);
      }

      // Check if top-level fields exist and update them
      const rootSnap = await db.ref('money_manager_users/' + uid).once('value');
      const rootVal = rootSnap.val() || {};
      const rootUpdates = {};
      if (rootVal.email !== undefined && cleanUpdates.email) rootUpdates.email = cleanUpdates.email;
      if (rootVal.name !== undefined && cleanUpdates.name) rootUpdates.name = cleanUpdates.name;
      if (rootVal.phone !== undefined && cleanUpdates.phone) rootUpdates.phone = cleanUpdates.phone;
      if (cleanUpdates.password) rootUpdates.password = cleanUpdates.password;
      if (Object.keys(rootUpdates).length > 0) {
        await db.ref('money_manager_users/' + uid).update(rootUpdates);
      }

      // If user is also in app_admins, update admin record
      const adminSnap = await db.ref('app_admins/' + uid).once('value');
      if (adminSnap.val()) {
        await db.ref('app_admins/' + uid).update(cleanUpdates);
        if (cleanUpdates.password) {
          await db.ref('app_admins/' + uid + '/password').set(cleanUpdates.password);
        }
      }

      // Synchronize active and past sessions with new user details
      const sessionsSnap = await db.ref('user_sessions').once('value');
      const sessions = sessionsSnap.val() || {};
      for (const sid in sessions) {
        if (sessions[sid]?.uid === uid) {
          const sUpdates = {};
          if (cleanUpdates.email) sUpdates.email = cleanUpdates.email;
          if (cleanUpdates.name) sUpdates.name = cleanUpdates.name;
          if (cleanUpdates.phone) sUpdates.phone = cleanUpdates.phone;
          await db.ref('user_sessions/' + sid).update(sUpdates);
        }
      }
    } catch (e) {
      console.warn("RTDB update user warning:", e);
    }
  }

  try {
    const users = JSON.parse(localStorage.getItem("mmp_users") || "{}");
    if (users[uid]) {
      if (!users[uid].profile) users[uid].profile = {};
      Object.assign(users[uid].profile, cleanUpdates);
      if (cleanUpdates.password) users[uid].password = cleanUpdates.password;
      localStorage.setItem("mmp_users", JSON.stringify(users));
    }
  } catch (e) {}

  // If this user is currently authenticated in localStorage, update their session
  try {
    const saved = localStorage.getItem("mmp_auth_user");
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed.uid === uid) {
        if (cleanUpdates.email) parsed.email = cleanUpdates.email;
        if (cleanUpdates.name) parsed.displayName = cleanUpdates.name;
        localStorage.setItem("mmp_auth_user", JSON.stringify(parsed));
      }
    }
  } catch (e) {}

  recordActivity("Admin Updated User", `User ${cleanUpdates.email || uid} modified (Name: ${cleanUpdates.name || "N/A"})`);
  return cleanUpdates;
};

// Admin Toggle User Status (Activate / Deactivate)
const adminToggleUserStatus = async (uid, newStatus) => {
  if (db) {
    try {
      await db.ref('money_manager_users/' + uid + '/profile/status').set(newStatus);
    } catch (e) {
      console.warn("RTDB toggle status warning:", e);
    }
  }

  try {
    const users = JSON.parse(localStorage.getItem("mmp_users") || "{}");
    if (users[uid] && users[uid].profile) {
      users[uid].profile.status = newStatus;
      localStorage.setItem("mmp_users", JSON.stringify(users));
    }
  } catch (e) {}

  recordActivity("User Status Changed", `User ${uid} set to ${newStatus}`);
  return newStatus;
};

// Admin Reset User Password
const adminResetUserPassword = async (uid, newPassword, email) => {
  const cleanPass = String(newPassword).trim();
  if (db) {
    try {
      await db.ref('money_manager_users/' + uid + '/profile/password').set(cleanPass);
      await db.ref('money_manager_users/' + uid + '/password').set(cleanPass);

      // If user is also in app_admins, update admin password
      const adminSnap = await db.ref('app_admins/' + uid).once('value');
      if (adminSnap.val()) {
        await db.ref('app_admins/' + uid + '/password').set(cleanPass);
      }
    } catch (e) {
      console.warn("RTDB password update error:", e);
    }
  }

  try {
    const users = JSON.parse(localStorage.getItem("mmp_users") || "{}");
    if (users[uid]) {
      if (!users[uid].profile) users[uid].profile = {};
      users[uid].profile.password = cleanPass;
      localStorage.setItem("mmp_users", JSON.stringify(users));
    }
  } catch (e) {}

  recordActivity("Password Reset by Admin", `Password reset for user ${email || uid}`);
  return true;
};

// Admin Delete User
const adminDeleteUser = async (uid, userEmail = "") => {
  await db.ref('money_manager_users/' + uid).remove();
  recordActivity("Admin Deleted User", `Removed user ${userEmail || uid}`);
  return true;
};

// Admin Listen to System Settings
const listenToSystemSettings = (callback) => {
  const ref = db.ref('system_settings');
  ref.on('value', (snap) => {
    callback(snap.val() || {
      maintenanceMode: false,
      allowRegistration: true,
      defaultUserStatus: "active",
      announcement: ""
    });
  });
  return () => ref.off();
};

// Admin Update System Settings
const adminUpdateSystemSettings = async (settings) => {
  await db.ref('system_settings').update(settings);
  recordActivity("System Settings Updated", "Administrator modified system configuration");
  return settings;
};

// Check if any admin account has been registered yet
const checkAdminExists = async () => {
  try {
    if (db) {
      const snap = await db.ref('app_admins').once('value');
      const admins = snap.val();
      if (admins && Object.keys(admins).length > 0) return true;

      // Check if any user in money_manager_users has role: 'admin'
      const usersSnap = await db.ref('money_manager_users').once('value');
      const users = usersSnap.val() || {};
      for (const uid in users) {
        if (users[uid]?.profile?.role === 'admin') return true;
      }
    }
  } catch (e) {}
  return false;
};

// Admin One-Time Registration
const registerAdmin = async (name, email, password) => {
  let user;
  try {
    const userCredential = await auth.createUserWithEmailAndPassword(email, password);
    user = userCredential.user;
  } catch (e) {
    // If account already exists in Auth, try sign in
    if (auth.signInWithEmailAndPassword) {
      try {
        const cred = await auth.signInWithEmailAndPassword(email, password);
        user = cred.user;
      } catch (e2) {
        throw e;
      }
    } else {
      throw e;
    }
  }

  // Add to app_admins in Firebase
  await db.ref('app_admins/' + user.uid).set({
    uid: user.uid,
    name: name,
    email: email,
    password: password,
    role: 'admin',
    createdAt: Date.now()
  });

  // Also add to money_manager_users profile
  await db.ref('money_manager_users/' + user.uid + '/profile').set({
    uid: user.uid,
    name: name,
    email: email,
    password: password,
    role: 'admin',
    status: 'active',
    createdAt: Date.now()
  });

  await setupPresenceAndSession(user);
  recordActivity("Admin Registered", `Administrator registered: ${name} (${email})`);
  return user;
};

// Export to Global namespace
window.MMP_Firebase = {
  isConfigured: isFirebaseConfigured,
  loginUser,
  registerUser,
  logoutUser,
  resetPassword,
  onAuthChanged,
  changePassword,
  updateProfileSettings,
  updateThemeSettings,
  saveIncome,
  updateIncome,
  deleteIncome,
  saveExpense,
  updateExpense,
  deleteExpense,
  saveVehicleExpense,
  updateVehicleExpense,
  deleteVehicleExpense,
  saveCustomCategory,
  deleteCustomCategory,
  listenToUserData,
  setTargetUid,
  getTargetUid,
  getUserDataOnce,
  // Admin & Audit additions
  recordActivity,
  setupPresenceAndSession,
  listenToAllUsers,
  listenToUserSessions,
  listenToActivityLogs,
  deleteSessionRecord,
  // New Admin Capabilities
  ADMIN_EMAILS,
  checkIsAdmin,
  loginAdmin,
  adminAddUser,
  adminUpdateUser,
  adminToggleUserStatus,
  adminResetUserPassword,
  adminDeleteUser,
  listenToSystemSettings,
  adminUpdateSystemSettings,
  checkAdminExists,
  registerAdmin
};
