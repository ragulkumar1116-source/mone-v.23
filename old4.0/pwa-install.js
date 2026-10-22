// KRISHTECH - PWA Mobile Install Banner and Service Worker Manager

let deferredPrompt = null;

window.addEventListener('beforeinstallprompt', (e) => {
  // Prevent browser's default mini-infobar
  e.preventDefault();
  deferredPrompt = e;
  
  // Reveal install triggers across UI
  showInstallPrompts();
});

function showInstallPrompts() {
  // Header install button (if present)
  const headerBtn = document.getElementById('pwa-header-install-btn');
  if (headerBtn) {
    headerBtn.style.display = 'inline-flex';
  }

  // Settings install card (if present)
  const settingsCard = document.getElementById('pwa-settings-install-card');
  if (settingsCard) {
    settingsCard.style.display = 'block';
  }

  // Create bottom mobile banner if not already installed and on mobile device
  createFloatingInstallBanner();
}

function createFloatingInstallBanner() {
  if (document.getElementById('pwa-floating-banner')) return;

  // If already running in standalone PWA mode, don't show
  if (window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true) {
    return;
  }

  // Check if dismissed in this session
  if (sessionStorage.getItem('krishtech_pwa_dismissed')) {
    return;
  }

  const banner = document.createElement('div');
  banner.id = 'pwa-floating-banner';
  banner.className = 'pwa-install-banner fade-in';
  banner.innerHTML = 
    <div class=pwa-banner-content>
      <div class=pwa-banner-logo>
        <img src=krish-icon.svg alt=KRISHTECH width=40 height=40>
      </div>
      <div class=pwa-banner-text>
        <div class=pwa-banner-title>Install KrishTech App</div>
        <div class=pwa-banner-subtitle>Fast, full-screen mobile experience</div>
      </div>
    </div>
    <div class=pwa-banner-actions>
      <button type=button class=btn btn-sm btn-secondary id=pwa-banner-close-btn>&times;</button>
      <button type=button class=btn btn-sm btn-primary pwa-install-trigger id=pwa-banner-install-btn>
        Install App
      </button>
    </div>
  ;

  document.body.appendChild(banner);

  document.getElementById('pwa-banner-close-btn')?.addEventListener('click', () => {
    banner.remove();
    sessionStorage.setItem('krishtech_pwa_dismissed', '1');
  });

  document.getElementById('pwa-banner-install-btn')?.addEventListener('click', triggerPWAInstall);
}

// Global function to trigger installation prompt
window.triggerPWAInstall = async () => {
  if (deferredPrompt) {
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      console.log('User accepted KrishTech app installation');
      hideInstallPrompts();
    }
    deferredPrompt = null;
  } else {
    // Check if iOS Safari
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
    if (isIOS) {
      alert(To install KRISHTECH on iOS:\n1. Tap the Share button in Safari (square with arrow pointing up)\n2. Scroll down and tap 'Add to Home Screen'\n3. Tap 'Add' in the top right.);
    } else {
      alert(To install KRISHTECH App:\nTap the three dots menu (⋮) in your browser and select 'Install app' or 'Add to Home screen'.);
    }
  }
};

function hideInstallPrompts() {
  const headerBtn = document.getElementById('pwa-header-install-btn');
  if (headerBtn) headerBtn.style.display = 'none';

  const settingsCard = document.getElementById('pwa-settings-install-card');
  if (settingsCard) settingsCard.style.display = 'none';

  const banner = document.getElementById('pwa-floating-banner');
  if (banner) banner.remove();
}

window.addEventListener('appinstalled', () => {
  console.log('KRISHTECH PWA installed successfully.');
  hideInstallPrompts();
  deferredPrompt = null;
});

// Attach triggers on page load
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.pwa-install-trigger').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      triggerPWAInstall();
    });
  });

  // Automatically check if running on mobile browser to suggest install after 2 seconds
  setTimeout(() => {
    const isMobile = /Android|iPhone|iPad|iPod|webOS|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
    if (isMobile && !isStandalone) {
      showInstallPrompts();
    }
  }, 2000);
});
