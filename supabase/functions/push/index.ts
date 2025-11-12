import { Hono } from "npm:hono";
import { cors } from "npm:hono/cors";
import { logger } from "npm:hono/logger";
import { createClient } from "jsr:@supabase/supabase-js@2";

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

    // Collect tokens: prefer explicit token on the record, otherwise query push_tokens table
    let tokens: string[] = [];
    if (record.push_token) tokens.push(record.push_token as string);
    if (record.expo_token) tokens.push(record.expo_token as string);

    if (tokens.length === 0 && userId) {
      try {
        const { data: tokenRows, error } = await supabase
          .from('push_tokens')
          .select('token')
          .eq('user_id', userId);

        if (error) {
          console.error('push: error querying push_tokens', error);
        } else if (Array.isArray(tokenRows)) {
          tokens.push(...tokenRows.map((r: any) => r.token).filter(Boolean));
        }
      } catch (qErr) {
        console.error('push: exception while querying tokens', qErr);
      }
    }

    if (tokens.length === 0) {
      console.log('push: no tokens found for record, nothing to send', { userId });
      return c.json({ ok: true, delivered: 0 });
    }

    // Prepare Expo push messages (batch)
    const messages = tokens.map((token) => ({
      to: token,
      title,
      body: messageBody,
      data,
      sound: 'default',
    }));

    const expoToken = Deno.env.get('EXPO_ACCESS_TOKEN') || Deno.env.get('SUPABASE_EXPO_ACCESS_TOKEN');
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (expoToken) headers['Authorization'] = `Bearer ${expoToken}`;

    console.log('push: sending messages to Expo for tokens count', messages.length);

    const resp = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers,
      body: JSON.stringify(messages),
    });

    const respJson = await resp.json().catch(() => ({ status: resp.status }));

    console.log('push: expo response', respJson);

    return c.json({ ok: true, delivered: messages.length, result: respJson });
  } catch (error) {
    console.error('push: unexpected error', error);
    return c.json({ error: String(error) }, 500);
  }
});

// For quick health checks
app.get('/health', (c) => c.json({ status: 'ok' }));

Deno.serve(app.fetch);
