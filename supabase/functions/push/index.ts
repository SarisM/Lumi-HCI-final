import { Hono } from "npm:hono";
import { cors } from "npm:hono/cors";
import { logger } from "npm:hono/logger";
import { createClient } from "jsr:@supabase/supabase-js@2";
// Use web-push for Web Push (VAPID) delivery
import webpush from "npm:web-push";

const app = new Hono();

// Supabase server client (requires SERVICE_ROLE key in env)
const supabase = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
);

app.use('*', logger(console.log));

app.use(
  '/*',
  cors({
    origin: '*',
    allowHeaders: ['Content-Type'],
    allowMethods: ['POST', 'OPTIONS'],
  })
);

// POST / - expects a DB webhook payload. It will extract the inserted record
// and send push notification(s) via Expo push service. The function is defensive
// about payload shape and will try to find the record in several common keys.
app.post('/', async (c) => {
  try {
    const body = await c.req.json();

    // Try a few common locations for the new/inserted row depending on webhook shape
    const record = (body && (body.record || body.new || body.data?.new || body.payload?.record || body.events?.[0]?.record)) ?? null;

    if (!record) {
      console.error('push: no record found in webhook payload', { body });
      return c.json({ error: 'No record found in webhook payload' }, 400);
    }

    // Expected record fields (try common names): user_id, title, body, data, push_token/expo_token
    const userId = record.user_id || record.userId || record.user;
    const title = record.title || record.notification_title || 'Lumi';
    const messageBody = record.body || record.message || record.notification_body || '';
    const data = record.data || record.payload || {};

        // Collect tokens: support several formats
        // - record.push_token or record.expo_token (Expo)
        // - record.subscription (Web Push subscription object)
        // - entries in push_tokens table which may contain a token string OR JSON subscription
        const expoMessages: any[] = [];
        const webpushSubscriptions: any[] = [];
        const fcmTokens: string[] = [];

        // Helper to push Expo token into array
        if (record.push_token) expoMessages.push({ to: record.push_token, title, body: messageBody, data, sound: 'default' });
        if (record.expo_token) expoMessages.push({ to: record.expo_token, title, body: messageBody, data, sound: 'default' });

        // If record contains a web-push subscription object directly
        if (record.subscription && typeof record.subscription === 'object') {
          webpushSubscriptions.push(record.subscription);
        }

        // Query push_tokens table for additional delivery endpoints
        if (userId) {
          try {
            const { data: tokenRows, error } = await supabase
              .from('push_tokens')
              .select('token, type, subscription')
              .eq('user_id', userId);

            if (error) {
              console.error('push: error querying push_tokens', error);
            } else if (Array.isArray(tokenRows)) {
              for (const r of tokenRows) {
                // If explicit subscription column exists, use it
                if (r.subscription) {
                  webpushSubscriptions.push(r.subscription);
                  continue;
                }

                const tokenVal = r.token;
                const type = (r.type || '').toLowerCase();

                if (!tokenVal) continue;

                // If token looks like an Expo token
                if (typeof tokenVal === 'string' && tokenVal.startsWith('ExponentPushToken')) {
                  expoMessages.push({ to: tokenVal, title, body: messageBody, data, sound: 'default' });
                  continue;
                }

                // If type indicates fcm
                if (type === 'fcm' || (typeof tokenVal === 'string' && tokenVal.startsWith('fcm:'))) {
                  fcmTokens.push(typeof tokenVal === 'string' && tokenVal.startsWith('fcm:') ? tokenVal.replace(/^fcm:/, '') : tokenVal);
                  continue;
                }

                // Try to parse token as JSON subscription
                if (typeof tokenVal === 'string') {
                  try {
                    const parsed = JSON.parse(tokenVal);
                    if (parsed && parsed.endpoint) {
                      webpushSubscriptions.push(parsed);
                      continue;
                    }
                  } catch (e) {
                    // not JSON
                  }
                }

                // Fallback: treat as FCM token
                if (typeof tokenVal === 'string') fcmTokens.push(tokenVal);
              }
            }
          } catch (qErr) {
            console.error('push: exception while querying tokens', qErr);
          }
        }

        let delivered = 0;

        // 1) Send Expo messages (existing flow)
        if (expoMessages.length > 0) {
          const expoToken = Deno.env.get('EXPO_ACCESS_TOKEN') || Deno.env.get('SUPABASE_EXPO_ACCESS_TOKEN');
          const headers: Record<string, string> = { 'Content-Type': 'application/json' };
          if (expoToken) headers['Authorization'] = `Bearer ${expoToken}`;

          console.log('push: sending messages to Expo for tokens count', expoMessages.length);
          try {
            const resp = await fetch('https://exp.host/--/api/v2/push/send', {
              method: 'POST',
              headers,
              body: JSON.stringify(expoMessages),
            });
            const respJson = await resp.json().catch(() => ({ status: resp.status }));
            console.log('push: expo response', respJson);
            delivered += expoMessages.length;
          } catch (e) {
            console.error('push: expo send error', e);
          }
        }

        // 2) Send Web Push messages using web-push if VAPID keys are set
        const vapidPublic = Deno.env.get('VAPID_PUBLIC_KEY') || Deno.env.get('VAPID_PUBLIC');
        const vapidPrivate = Deno.env.get('VAPID_PRIVATE_KEY') || Deno.env.get('VAPID_PRIVATE');
        const vapidSubject = Deno.env.get('VAPID_SUBJECT') || 'mailto:admin@example.com';

        if (webpushSubscriptions.length > 0) {
          if (vapidPublic && vapidPrivate) {
            try {
              webpush.setVapidDetails(vapidSubject, vapidPublic, vapidPrivate);
            } catch (e) {
              console.error('push: error setting VAPID details', e);
            }

            for (const sub of webpushSubscriptions) {
              try {
                const payload = { title, body: messageBody, data };
                await webpush.sendNotification(sub, JSON.stringify(payload));
                delivered += 1;
              } catch (wpErr) {
                console.error('push: web-push send error for subscription', wpErr);
              }
            }
          } else {
            console.warn('push: webpush subscriptions present but VAPID keys not configured (VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY)');
          }
        }

        // 3) Send to FCM legacy endpoint if FCM tokens present and FCM_SERVER_KEY configured
        const fcmServerKey = Deno.env.get('FCM_SERVER_KEY') || Deno.env.get('FIREBASE_SERVER_KEY');
        if (fcmTokens.length > 0) {
          if (!fcmServerKey) {
            console.warn('push: FCM tokens present but FCM_SERVER_KEY not configured');
          } else {
            for (const t of fcmTokens) {
              try {
                const fcmBody = {
                  to: t,
                  notification: { title, body: messageBody },
                  data,
                };
                const resp = await fetch('https://fcm.googleapis.com/fcm/send', {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    Authorization: `key=${fcmServerKey}`,
                  },
                  body: JSON.stringify(fcmBody),
                });
                const json = await resp.json().catch(() => ({ status: resp.status }));
                console.log('push: fcm response', json);
                delivered += 1;
              } catch (fErr) {
                console.error('push: FCM send error', fErr);
              }
            }
          }
        }

        return c.json({ ok: true, delivered });
  } catch (error) {
    console.error('push: unexpected error', error);
    return c.json({ error: String(error) }, 500);
  }
});

// For quick health checks
app.get('/health', (c) => c.json({ status: 'ok' }));

Deno.serve(app.fetch);
