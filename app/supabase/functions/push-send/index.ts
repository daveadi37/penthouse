import { createClient } from 'jsr:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';

/* ============================================================
   Delivering the queue.

   Called every two minutes by pg_cron, and directly by the app when
   something urgent happens and two minutes is too long.

   Three things it does that a naive sender does not:

     It asks should_send_now() in Postgres rather than reimplementing
     quiet hours here. Quiet hours wrap midnight, and two
     implementations of that are two chances to get it wrong.

     It records failures on the row instead of throwing them away, so a
     notification that has not arrived is visible rather than merely
     absent.

     It removes a subscription on 404 or 410. Those two codes mean the
     browser has thrown the subscription away — Rosie reinstalled the
     app, or cleared her data — and retrying forever is how a queue
     silently stops working for everybody.
   ============================================================ */

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  const url = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const publicKey = Deno.env.get('VAPID_PUBLIC_KEY');
  const privateKey = Deno.env.get('VAPID_PRIVATE_KEY');
  const subject = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:aditya.dave@evolvecaregroup.com';

  if (!publicKey || !privateKey) {
    return new Response(
      JSON.stringify({ error: 'VAPID keys are not set. See docs/DEPLOY.md step 5 — the private half goes in Edge Function secrets, never in the app folder.' }),
      { status: 500, headers: { ...CORS, 'content-type': 'application/json' } },
    );
  }

  webpush.setVapidDetails(subject, publicKey, privateKey);
  const db = createClient(url, serviceKey, { auth: { persistSession: false } });

  // Oldest first, and a ceiling: a backlog after an outage should drain
  // over several runs rather than time this one out.
  const { data: queued, error } = await db
    .from('notifications')
    .select('id, profile_id, kind, title, body, url, priority')
    .is('sent_at', null)
    .order('created_at', { ascending: true })
    .limit(100);

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...CORS, 'content-type': 'application/json' },
    });
  }

  let sent = 0;
  let held = 0;
  let failed = 0;
  const dead: string[] = [];

  for (const n of queued ?? []) {
    // Quiet hours, answered by the database that defines them.
    const { data: allowed } = await db.rpc('should_send_now', {
      p_profile_id: n.profile_id,
      p_kind: n.kind,
      p_priority: n.priority,
    });

    if (allowed === false) {
      held++;
      continue;
    }

    const { data: subs } = await db
      .from('push_subscriptions')
      .select('id, endpoint, p256dh, auth')
      .eq('profile_id', n.profile_id)
      .eq('active', true);

    if (!subs || subs.length === 0) {
      // No device. Mark it sent anyway: it is in the in-app list, and
      // leaving it queued forever would mean retrying it every two
      // minutes until somebody installs the app.
      await db.from('notifications')
        .update({ sent_at: new Date().toISOString(), last_error: 'No registered device' })
        .eq('id', n.id);
      continue;
    }

    const payload = JSON.stringify({
      title: n.title,
      body: n.body,
      url: n.url,
      priority: n.priority,
    });

    let anyDelivered = false;
    let lastError: string | null = null;

    for (const sub of subs) {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload,
          { urgency: n.priority === 'urgent' ? 'high' : 'normal', TTL: 60 * 60 * 12 },
        );
        anyDelivered = true;
        await db.from('push_subscriptions')
          .update({ last_delivery: new Date().toISOString() })
          .eq('id', sub.id);
      } catch (e) {
        const status = (e as { statusCode?: number }).statusCode;
        lastError = `${status ?? '?'} ${(e as Error).message}`;
        // Gone for good. Retrying these is how a queue silently stops.
        if (status === 404 || status === 410) {
          dead.push(sub.id);
          await db.from('push_subscriptions').update({ active: false }).eq('id', sub.id);
        }
      }
    }

    if (anyDelivered) {
      await db.from('notifications')
        .update({ sent_at: new Date().toISOString(), last_error: null })
        .eq('id', n.id);
      sent++;
    } else {
      // Left unsent on purpose, so the next run tries again.
      await db.from('notifications').update({ last_error: lastError }).eq('id', n.id);
      failed++;
    }
  }

  return new Response(
    JSON.stringify({ sent, heldForQuietHours: held, failed, subscriptionsRetired: dead.length }),
    { status: 200, headers: { ...CORS, 'content-type': 'application/json' } },
  );
});
