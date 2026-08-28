import { createClient } from 'jsr:@supabase/supabase-js@2';

/* ============================================================
   Creating logins, and setting passwords.

   This function exists for one reason: the service-role key can create
   an auth user and set a password, and that key must never be in a
   browser bundle. So the browser asks here, and here checks who is
   asking before it does anything at all.

   Three checks, in order, and none of them is skippable:

     1. The caller has a valid session. Taken from the Authorization
        header and verified against Supabase, not trusted from a body
        field — a request can claim to be anyone.

     2. The caller holds accounts.manage.

     3. The caller outranks the target's role. Without this, whoever can
        create logins can create an owner, and the hierarchy is
        decorative.

   The password is never logged, never echoed back, and never stored
   anywhere but Supabase Auth.
   ============================================================ */

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, content-type',
  'access-control-allow-methods': 'POST, OPTIONS',
};

function fail(status: number, error: string) {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: { ...CORS, 'content-type': 'application/json' },
  });
}

function ok(message: string, extra: Record<string, unknown> = {}) {
  return new Response(JSON.stringify({ message, ...extra }), {
    status: 200,
    headers: { ...CORS, 'content-type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return fail(405, 'POST only.');

  const url = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

  const authHeader = req.headers.get('authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) return fail(401, 'Sign in first.');

  // 1. Who is asking. Verified, not claimed.
  const asCaller = createClient(url, anonKey, {
    global: { headers: { authorization: authHeader } },
  });
  const { data: userData, error: userErr } = await asCaller.auth.getUser();
  if (userErr || !userData.user) return fail(401, 'That session is not valid. Sign in again.');

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

  // 2 and 3. What they may do, and how high they stand. Read with the
  // service key because the caller's own row-level policies are not the
  // authority on their own rank.
  const { data: caller, error: callerErr } = await admin
    .from('profiles')
    .select('id, name, role, active, roles!inner(rank, active)')
    .eq('auth_user_id', userData.user.id)
    .maybeSingle();

  if (callerErr) return fail(500, `Could not read the caller: ${callerErr.message}`);
  if (!caller || !caller.active) return fail(403, 'That account is not active here.');

  const { data: caps } = await admin
    .from('role_capabilities')
    .select('capability')
    .eq('role_id', caller.role);

  const held = new Set((caps ?? []).map((c: { capability: string }) => c.capability));
  if (!held.has('accounts.manage')) {
    return fail(403, 'Creating logins needs the accounts.manage capability.');
  }

  // deno-lint-ignore no-explicit-any
  const callerRank = (caller as any).roles.rank as number;

  let body: { action?: string; profileId?: string; email?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return fail(400, 'That was not JSON.');
  }

  const { action, profileId, password } = body;
  if (!action || !profileId) return fail(400, 'action and profileId are both required.');

  const { data: target, error: targetErr } = await admin
    .from('profiles')
    .select('id, name, email, auth_user_id, role, roles!inner(rank, name)')
    .eq('id', profileId)
    .maybeSingle();

  if (targetErr) return fail(500, `Could not read that person: ${targetErr.message}`);
  if (!target) return fail(404, 'No such person.');

  // deno-lint-ignore no-explicit-any
  const targetRole = (target as any).roles as { rank: number; name: string };
  if (targetRole.rank > callerRank) {
    return fail(403, `You cannot manage a ${targetRole.name} account — it outranks yours.`);
  }

  const email = (body.email ?? target.email ?? '').trim();

  if (action === 'create' || action === 'set-password') {
    if (!password || password.length < 10) {
      return fail(400, 'A password of fewer than ten characters is not worth setting.');
    }

    if (target.auth_user_id) {
      const { error } = await admin.auth.admin.updateUserById(target.auth_user_id, { password });
      if (error) return fail(400, error.message);
      await admin.from('profiles').update({ can_sign_in: true }).eq('id', profileId);
      return ok(`Password set for ${target.name}.`);
    }

    if (!email) return fail(400, 'A login needs an email address on the profile.');

    const { data: created, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // No confirmation email: the owner set this password deliberately.
      user_metadata: { profile_id: profileId, name: target.name },
    });
    if (error) return fail(400, error.message);

    const { error: linkErr } = await admin
      .from('profiles')
      .update({ auth_user_id: created.user.id, can_sign_in: true, email })
      .eq('id', profileId);

    if (linkErr) {
      // The auth user exists but is not joined to a profile, which would
      // let somebody sign in to nothing. Undo it rather than leave that.
      await admin.auth.admin.deleteUser(created.user.id);
      return fail(500, `Created the login but could not link it, so it was undone: ${linkErr.message}`);
    }

    return ok(`${target.name} can now sign in as ${email}.`, { authId: created.user.id });
  }

  if (action === 'delete') {
    if (!target.auth_user_id) return ok(`${target.name} had no login to remove.`);
    const { error } = await admin.auth.admin.deleteUser(target.auth_user_id);
    if (error) return fail(400, error.message);
    await admin
      .from('profiles')
      .update({ auth_user_id: null, can_sign_in: false })
      .eq('id', profileId);
    return ok(`${target.name}'s access has ended.`);
  }

  return fail(400, `Unknown action: ${action}`);
});
