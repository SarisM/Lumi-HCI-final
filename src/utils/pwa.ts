// PWA installation and service worker utilities

import { debugLog, debugError } from "./debug";

export function registerServiceWorker() {
  // Service worker registration has been disabled.
  // Reason: server-side push via Supabase Edge Function + Expo/FCM will be used
  // for reliable mobile notifications. The previous client-side service worker
  // was causing persistent installation errors (cache.addAll failures) and
  // blocking notification delivery. Keeping registration in code causes the
  // browser to repeatedly try and fail to install the SW, so we disable it here.
  debugLog('ServiceWorker', 'registerServiceWorker() called but service worker registration is disabled (server-side push enabled)');
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
    // Service worker disabled - show notifications directly via Notification
    // constructor. This means notifications will only appear while the page
    // is in the foreground or when the browser permits them (no background SW).
    debugLog('PWA', 'Service worker disabled; using Notification constructor for:', title, options);

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
