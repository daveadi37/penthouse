import { backendConfigured, functionsUrl, supabase } from './supabase';
import type { ID, Profile } from '@/types';

/* ============================================================
   Signing in.

   Passwords, not magic links. Aditya creates every account and sets
   every password; nobody chooses their own and there is no self-service
   reset. That is a deliberate trade: it costs him a phone call when
   somebody forgets, and it buys a house where access ends the moment a
   login is deleted, with no reset email sitting in an old inbox.

   The service-role key can create users and set passwords. It is not in
   this bundle and never will be — those two calls go to an Edge
   Function, which checks the caller holds `accounts.manage` before it
   does anything at all.
   ============================================================ */

export interface AuthResult {
  ok: boolean;
  message: string;
}

export interface Session {
  authId: string;
  email: string;
}

export async function signIn(email: string, password: string): Promise<AuthResult> {
  if (!supabase) {
    return { ok: false, message: 'No backend is connected on this build. Pick a person below to look around the example house instead.' };
  }
  const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
  if (error) {
    // Supabase says "Invalid login credentials" for both a wrong password
    // and an account that does not exist. Do not improve on that — telling
    // people which of the two it was is how you enumerate a household.
    return { ok: false, message: error.message };
  }
  return { ok: Boolean(data.session), message: 'Signed in' };
}

export async function signOut(): Promise<void> {
  await supabase?.auth.signOut();
}

export async function currentSession(): Promise<Session | null> {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  const s = data.session;
  return s ? { authId: s.user.id, email: s.user.email ?? '' } : null;
}

export function onAuthChange(fn: (s: Session | null) => void): () => void {
  if (!supabase) return () => {};
  const { data } = supabase.auth.onAuthStateChange((_e, session) => {
    fn(session ? { authId: session.user.id, email: session.user.email ?? '' } : null);
  });
  return () => data.subscription.unsubscribe();
}

/* ---------- the admin calls ---------- */

async function callAdmin(action: string, body: Record<string, unknown>): Promise<AuthResult> {
  if (!backendConfigured || !supabase) {
    return {
      ok: false,
      message: 'Saved here, but no backend is connected — the login itself will be created the first time this runs against the real project.',
    };
  }
  const { data: sess } = await supabase.auth.getSession();
  const token = sess.session?.access_token;
  if (!token) return { ok: false, message: 'Sign in again — the session has expired.' };

  try {
    const res = await fetch(`${functionsUrl}/admin-users`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ action, ...body }),
    });
    const json = (await res.json()) as { error?: string; message?: string };
    if (!res.ok) return { ok: false, message: json.error ?? `The server refused that (${res.status}).` };
    return { ok: true, message: json.message ?? 'Done' };
  } catch (e) {
    return { ok: false, message: `Could not reach the server: ${(e as Error).message}` };
  }
}

/** Create the login for a profile that does not have one yet. */
export function createLogin(profile: Profile, password: string): Promise<AuthResult> {
  return callAdmin('create', { profileId: profile.id, email: profile.email, password });
}

/** Set or replace somebody's password. */
export function setPassword(profileId: ID, password: string): Promise<AuthResult> {
  return callAdmin('set-password', { profileId, password });
}

/** End somebody's access completely. */
export function deleteLogin(profileId: ID): Promise<AuthResult> {
  return callAdmin('delete', { profileId });
}
