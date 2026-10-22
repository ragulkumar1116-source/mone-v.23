// KRISHTECH Service Worker
const CACHE_NAME = "krishtech-cache-v5";
const ASSETS_TO_CACHE = [
  "./",
  "./index.html",
  "./dashboard.html",
  "./settings.html",
  "./admin.html",
  "./admin-login.html",
  "./newuser.html",
  "./forgot.html",
  "./reset-password.html",
  "./reset-password.js",
  "./style.css",
  "./email-service.js",
  "./firebase.js",
  "./index.js",
  "./dashboard.js",
  "./settings.js",
  "./admin.js",
  "./admin-login.js",
  "./pwa-install.js",
  "./krish-logo.svg",
  "./krish-icon.svg",
  "./manifest.json"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE).catch((err) => {
        console.warn("Some assets failed to cache:", err);
      });
    })
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  // Pass network requests through, fallback to cache for offline support
  if (event.request.method !== "GET" || event.request.url.includes("firebase") || event.request.url.includes("gstatic")) {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        return networkResponse;
      })
      .catch(() => {
        return caches.match(event.request);
      })
  );
});
