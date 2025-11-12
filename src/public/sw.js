// Minimal placeholder service worker to avoid executing previous caching logic.
// The app has moved to server-side push (Supabase Edge Function + Expo/FCM).
// Keeping an empty/harmless sw file prevents browsers from executing legacy
// cache.addAll logic that caused installation failures in some environments.

'use strict';

self.addEventListener('install', (e) => {
  // Activate immediately but do not cache files here.
  e.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (e) => {
  e.waitUntil(self.clients.claim());
});

// No fetch handlers, no cache.addAll, no push handlers. Push handled server-side.
