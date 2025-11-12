// PWA installation and service worker utilities

import { debugLog, debugError } from "./debug";

export function registerServiceWorker() {
  // Register the service worker as early as possible. Previously we waited for the
  // `load` event — that causes some environments to never register if the app is
  // initialized after load. Register immediately and fall back to waiting for load
  // only if registration throws.
  if ('serviceWorker' in navigator) {
    const doRegister = async () => {
      try {
        const registration = await navigator.serviceWorker.register('/sw.js');
        debugLog('ServiceWorker', 'Service Worker registered successfully:', registration.scope);

        // Check for updates periodically
        setInterval(() => {
          try {
            registration.update();
          } catch (e) {
            debugError('ServiceWorker', 'Error updating service worker:', e);
          }
        }, 60000); // Check every minute
      } catch (error) {
        debugError('ServiceWorker', 'Service Worker registration failed, will retry on load:', error);
        // Retry registration on load if immediate registration failed
        window.addEventListener('load', () => {
          navigator.serviceWorker.register('/sw.js').catch((err) => debugError('ServiceWorker', 'Retry registration failed:', err));
        });
      }
    };

    // Fire-and-forget registration
    void doRegister();
  }
}

export interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferredPrompt: BeforeInstallPromptEvent | null = null;

export function initPWAInstallPrompt(callback?: (canInstall: boolean) => void) {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e as BeforeInstallPromptEvent;
    
    if (callback) {
      callback(true);
    }
  });

  window.addEventListener('appinstalled', () => {
    debugLog('PWA', 'Lumi PWA installed successfully!');
    deferredPrompt = null;
  });
}

export async function showInstallPrompt(): Promise<boolean> {
  if (!deferredPrompt) {
    debugLog('PWA', 'Install prompt not available');
    return false;
  }

  try {
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    
  debugLog('PWA', `User ${outcome} the install prompt`);
    deferredPrompt = null;
    
    return outcome === 'accepted';
  } catch (error) {
    debugError('PWA', 'Error showing install prompt:', error);
    return false;
  }
}

export function canInstallPWA(): boolean {
  return deferredPrompt !== null;
}

// Request notification permission
export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (!('Notification' in window)) {
    debugLog('PWA', 'This browser does not support notifications');
    return 'denied';
  }

  const permission = await Notification.requestPermission();
  debugLog('PWA', 'Notification permission:', permission);
  return permission;
}

// Show a notification either via the service worker (preferred) or the
// regular Notification API as a fallback. Ensures permission is requested
// if needed.
export async function showNotification(title: string, options?: NotificationOptions) {
  try {
    if (!('Notification' in window)) {
      debugLog('PWA', 'Notifications not supported in this browser');
      return;
    }

    if (Notification.permission !== 'granted') {
      await requestNotificationPermission();
    }

    if (Notification.permission !== 'granted') {
      debugLog('PWA', 'Notification permission not granted');
      return;
    }

    // Try to use service worker registration to show notification (works
    // even when page is in background). Fallback to new Notification.
    if ('serviceWorker' in navigator) {
      let reg = await navigator.serviceWorker.getRegistration();
      if (!reg) {
        // Try to (re)register the service worker if not present
        try {
          debugLog('PWA', 'No service worker registration found - attempting to register');
          reg = await navigator.serviceWorker.register('/sw.js');
          debugLog('PWA', 'Service worker registered during notification flow:', reg.scope);
        } catch (e) {
          debugError('PWA', 'Failed to register service worker during notification flow:', e);
        }
      }

      if (reg && reg.showNotification) {
        debugLog('PWA', 'Showing notification via ServiceWorker:', title, options);
        await reg.showNotification(title, options || {});
        return;
      }
    }

    // Fallback to the Notification constructor when service worker isn't available
    debugLog('PWA', 'Showing notification via Notification constructor:', title, options);
    // eslint-disable-next-line no-new
    new Notification(title, options);
  } catch (err) {
    debugError('PWA', 'Error showing notification:', err);
  }
}

// Check if app is running as PWA
export function isPWA(): boolean {
  return window.matchMedia('(display-mode: standalone)').matches ||
         (window.navigator as any).standalone === true;
}

// Get installation status
export function getInstallationStatus(): 'installed' | 'installable' | 'not-installable' {
  if (isPWA()) {
    return 'installed';
  }
  if (canInstallPWA()) {
    return 'installable';
  }
  return 'not-installable';
}
