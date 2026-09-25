import type { ID } from '@/types';
import { supabase } from '@/lib/supabase';
import { classify, explain, zeroRowsFault, type Fault } from './errors';
import {
  fromRow,
  maskToRow,
  toRow,
  ISSUE_COMMENTS,
  ISSUE_PHOTOS,
  LAUNDRY_SLOTS,
  SETTINGS_SCALARS,
  type Row,
} from './mappers';
import {
  MODULE_SLICES,
  REGISTRY,
  TIER1,
  TIER2,
  specFor,
  type SliceSpec,
  type WriteTarget,
} from './registry';
import * as outbox from './outbox';

/* ============================================================
   The engine.

   Reads come down in tiers, writes go up one at a time, and inbound
   changes are merged through three guards. It knows nothing about
   React and nothing about the store — the store hands it a mirror to
   write into, which is what keeps this file out of a cycle with
   store.ts and keeps all eighteen screens reading db.x synchronously.

   With no backend configured every function here returns immediately
   and the app is exactly the offline app it was before.
   ============================================================ */

/* ---------- the mirror the store hands over ---------- */

export interface Mirror {
  /** Replace a whole slice, after a tier read. */
  replaceSlice(slice: WriteTarget, rows: Row[]): void;
  /** Merge one row in, from a channel or a refetch. */
  applyRow(slice: WriteTarget, record: Row): void;
  /** Take one row out. */
  dropRow(slice: WriteTarget, rowId: ID): void;
  /** The local copy of a row, for the field mask and for rollback. */
  getRow(slice: WriteTarget, rowId: ID): Row | undefined;
  /** Settings is one object rather than a list. */
  setSettings(patch: Row): void;
  /** One sentence, to the person at the screen. */
  say(message: string): void;
}

let mirror: Mirror | null = null;

export function attachMirror(m: Mirror): void {
  mirror = m;
}

/* ---------- status, for the panel in the sidebar ---------- */

export type Phase = 'off' | 'idle' | 'loading' | 'sending' | 'offline' | 'paused' | 'blocked';

/** A write the database refused outright, kept so it can be seen. */
export interface RefusedWrite {
  at: number;
  /** What the person was doing, in their words. */
  summary: string;
  /** Why it was refused, in their words. */
  reason: string;
}

export interface SyncStatus {
  configured: boolean;
  phase: Phase;
  pending: number;
  failed: number;
  /** The last thing that went wrong, in the person's words. */
  lastError: string;
  lastSyncedAt: number;
  /**
   * Writes the database rejected for good — an RLS refusal, a
   * constraint, a bad enum value. They are off the queue and will not
   * be retried, so unless they are held here the only trace is a toast
   * that lives 2.6 seconds, and the panel then says "All changes
   * saved" over the top of work that was lost.
   */
  refused: RefusedWrite[];
}

const configured = Boolean(supabase);

let phase: Phase = configured ? 'idle' : 'off';
let lastError = '';
let lastSyncedAt = 0;
/* Capped, newest kept. A refusal usually repeats — a role that cannot
   write inventory refuses every count — and twenty is plenty to show
   the shape of it without growing without bound. */
let refused: RefusedWrite[] = [];
const REFUSED_LIMIT = 20;

/* useSyncExternalStore compares snapshots by identity, so the object
   is rebuilt only when something in it actually moved. Returning a
   fresh object every read is an infinite render. */
let snapshot: SyncStatus = {
  configured,
  phase,
  pending: 0,
  failed: 0,
  lastError: '',
  lastSyncedAt: 0,
  refused: [],
};

const listeners = new Set<() => void>();

export function subscribeStatus(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function syncStatus(): SyncStatus {
  return snapshot;
}

function bump(): void {
  const pending = outbox.pendingCount();
  const failed = outbox.failedCount();
  const next: SyncStatus = { configured, phase, pending, failed, lastError, lastSyncedAt, refused };
  const same =
    next.phase === snapshot.phase &&
    next.pending === snapshot.pending &&
    next.failed === snapshot.failed &&
    next.lastError === snapshot.lastError &&
    next.lastSyncedAt === snapshot.lastSyncedAt &&
    next.refused === snapshot.refused;
  if (same) return;
  snapshot = next;
  listeners.forEach((fn) => fn());
}

/** Record a write the database will never accept. */
function noteRefused(summary: string, reason: string): void {
  // A new array, because bump() compares by identity.
  refused = [{ at: Date.now(), summary, reason }, ...refused].slice(0, REFUSED_LIMIT);
  bump();
}

/** Dismiss the list once somebody has read it. */
export function clearRefused(): void {
  if (!refused.length) return;
  refused = [];
  bump();
}

function setPhase(p: Phase): void {
  phase = p;
  bump();
}

function report(message: string): void {
  lastError = message;
  bump();
}

outbox.subscribe(bump);

/* ============================================================
   Reading.
   ============================================================ */

function query(spec: SliceSpec) {
  const sb = supabase;
  if (!sb) return null;
  let q = sb.from(spec.table).select('*');
  for (const [column, op, value] of spec.filters ?? []) {
    if (op === 'eq') q = q.eq(column, value);
    else if (op === 'neq') q = q.neq(column, value);
    else if (op === 'is') q = q.is(column, value as null);
    else if (op === 'in') q = q.in(column, value as unknown[]);
    else if (op === 'notIn') q = q.not(column, 'in', `(${(value as unknown[]).join(',')})`);
  }
  if (spec.order) q = q.order(spec.order.column, { ascending: spec.order.ascending });
  if (spec.limit) q = q.limit(spec.limit);
  return q;
}

async function fetchSlice(slice: WriteTarget): Promise<Row[]> {
  const spec = specFor(slice);
  const q = spec ? query(spec) : null;
  if (!spec || !q) return [];
  const { data, error } = await q;
  if (error) throw error;
  const rows = (data ?? []) as Row[];
  rows.forEach((r) => noteStamp(slice, String(r.id ?? ''), stampOf(r)));
  return rows.map((r) => fromRow(r, spec.map));
}

/**
 * Identity and the capability grid, blocking, in one round trip.
 *
 * Under two hundred rows altogether. Nothing can be drawn honestly
 * before these land, because can() reads roles and role_capabilities
 * and a screen rendered without them is a screen rendered against
 * the wrong idea of who is looking at it.
 */
export async function loadTier1(): Promise<{ ok: boolean; profiles: number; message: string }> {
  const sb = supabase;
  if (!sb || !mirror) return { ok: false, profiles: 0, message: '' };

  setPhase('loading');
  try {
    const [slices, caps, settingsRow, laundry] = await Promise.all([
      Promise.all(TIER1.map(fetchSlice)),
      sb.from('role_capabilities').select('role_id, capability'),
      sb.from('settings').select('*').limit(1).maybeSingle(),
      sb.from('laundry_slots').select('*').order('sort_order', { ascending: true }),
    ]);

    if (caps.error) throw caps.error;

    // The capability grid is a join table, so it arrives beside the
    // roles and is folded back onto them here. A role with no rows is
    // a role that may do nothing, which is the correct reading.
    const byRole = new Map<string, string[]>();
    for (const row of (caps.data ?? []) as Row[]) {
      const id = String(row.role_id);
      const list = byRole.get(id) ?? [];
      list.push(String(row.capability));
      byRole.set(id, list);
    }

    TIER1.forEach((slice, i) => {
      const rows = slices[i];
      if (slice === 'roles') {
        rows.forEach((r) => {
          r.capabilities = byRole.get(String(r.id)) ?? [];
        });
      }
      mirror?.replaceSlice(slice, rows);
    });

    if (settingsRow.data) {
      const patch = fromRow(settingsRow.data as Row, SETTINGS_SCALARS);
      const row = settingsRow.data as Row;
      patch.workingWeek = {
        days: (row.working_days as number[]) ?? [],
        start: String(row.working_start ?? '').slice(0, 5),
        end: String(row.working_end ?? '').slice(0, 5),
      };
      // The rota is its own table, keyed by day of week.
      const rota: Record<number, { person: string; type: string }[]> = {};
      for (const slot of (laundry.data ?? []) as Row[]) {
        const s = fromRow(slot, LAUNDRY_SLOTS);
        const dow = Number(s.dow ?? 0);
        (rota[dow] ??= []).push({ person: String(s.person), type: String(s.type) });
      }
      patch.laundry = rota;
      mirror.setSettings(patch);
    }

    const profiles = slices[TIER1.indexOf('profiles')]?.length ?? 0;
    setPhase('idle');
    return { ok: true, profiles, message: '' };
  } catch (e) {
    const fault = classify(e);
    setPhase(fault.kind === 'offline' ? 'offline' : 'blocked');
    report(fault.message);
    return { ok: false, profiles: 0, message: fault.message };
  }
}

/** What the house touches. Fetched once the first screen is up. */
export async function loadTier2(): Promise<void> {
  if (!supabase || !mirror) return;
  setPhase('loading');
  try {
    const rows = await Promise.all(TIER2.map(fetchSlice));
    TIER2.forEach((slice, i) => {
      // Newest-first is right for the query and wrong for the thread.
      const list = slice === 'chat' ? [...rows[i]].reverse() : rows[i];
      mirror?.replaceSlice(slice, list);
    });
    const issues = rows[TIER2.indexOf('issues')] ?? [];
    await hydrateIssues(issues.map((i) => String(i.id)));
    setPhase('idle');
  } catch (e) {
    const fault = classify(e);
    setPhase(fault.kind === 'offline' ? 'offline' : 'idle');
    report(fault.message);
  }
}

/**
 * An issue's comments and photographs are rows of their own tables.
 * They are fetched for the issues already in hand rather than for
 * everything, because the closed ones are not on screen.
 */
async function hydrateIssues(ids: string[]): Promise<void> {
  const sb = supabase;
  if (!sb || !mirror || !ids.length) return;

  const [comments, photos] = await Promise.all([
    sb.from('issue_comments').select('*').in('issue_id', ids).order('said_at', { ascending: true }),
    sb.from('issue_photos').select('*').in('issue_id', ids),
  ]);

  const byIssue = new Map<string, { comments: Row[]; photos: Row[] }>();
  const bucket = (id: string) => {
    const b = byIssue.get(id) ?? { comments: [], photos: [] };
    byIssue.set(id, b);
    return b;
  };
  for (const c of (comments.data ?? []) as Row[]) {
    bucket(String(c.issue_id)).comments.push(fromRow(c, ISSUE_COMMENTS));
  }
  for (const p of (photos.data ?? []) as Row[]) {
    bucket(String(p.issue_id)).photos.push(fromRow(p, ISSUE_PHOTOS));
  }

  for (const [id, b] of byIssue) {
    const issue = mirror.getRow('issues', id);
    if (!issue) continue;
    mirror.applyRow('issues', { ...issue, comments: b.comments, photos: b.photos });
  }
}

/* ---------- tier 3: opened when the screen is ---------- */

const loaded = new Set<WriteTarget>();
const inFlight = new Map<WriteTarget, Promise<void>>();

/**
 * Called once per navigation by the single effect in App.tsx.
 *
 * Idempotent in both directions: a slice already in hand is not
 * fetched again, and two screens asking for the same slice at once
 * share the one request rather than racing.
 */
export async function ensureLoaded(module: string): Promise<void> {
  if (!supabase || !mirror) return;
  const want = (MODULE_SLICES[module] ?? []).filter((s) => !loaded.has(s));
  if (!want.length) return;

  await Promise.all(
    want.map((slice) => {
      const running = inFlight.get(slice);
      if (running) return running;
      const p = fetchSlice(slice)
        .then((rows) => {
          mirror?.replaceSlice(slice, rows);
          loaded.add(slice);
        })
        .catch((e: unknown) => {
          report(classify(e).message);
        })
        .finally(() => {
          inFlight.delete(slice);
        });
      inFlight.set(slice, p);
      return p;
    }),
  );
}

/* ============================================================
   Writing.

   One at a time, oldest first. A write that fails for the network
   stops the drain rather than skipping ahead, because the order is
   load-bearing — a buy-list line can name an item created a moment
   earlier in the same offline session.
   ============================================================ */

let draining = false;
let paused = false;
let refreshedOnce = false;
let retryTimer: number | undefined;

const BACKOFF_MS = [1000, 4000, 15000, 60000];

function scheduleRetry(tries: number): void {
  window.clearTimeout(retryTimer);
  const wait = BACKOFF_MS[Math.min(tries, BACKOFF_MS.length - 1)];
  retryTimer = window.setTimeout(() => void drain(), wait);
}

export function resumeSync(): void {
  paused = false;
  refreshedOnce = false;
  setPhase('idle');
  void drain();
}

export async function drain(): Promise<void> {
  const sb = supabase;
  if (!sb || !mirror || draining || paused) return;
  if (!navigator.onLine) {
    setPhase('offline');
    return;
  }

  draining = true;
  setPhase('sending');
  try {
    for (;;) {
      const intent = outbox.head();
      if (!intent) break;

      outbox.markSending(intent.id);
      const fault = await send(intent);

      if (!fault) {
        outbox.complete(intent.id);
        lastSyncedAt = Date.now();
        refreshedOnce = false;
        lastError = '';
        continue;
      }

      if (fault.kind === 'offline') {
        outbox.requeue(intent.id);
        setPhase('offline');
        scheduleRetry(intent.tries);
        return;
      }

      if (fault.kind === 'auth') {
        // One refresh, one retry. Then stop — the queue is correct and
        // only the token is stale, so emptying it would throw away work
        // that a fresh sign-in would have sent perfectly well.
        if (!refreshedOnce) {
          refreshedOnce = true;
          const { error } = await sb.auth.refreshSession();
          if (!error) {
            outbox.requeue(intent.id);
            continue;
          }
        }
        outbox.requeue(intent.id);
        paused = true;
        setPhase('paused');
        report(explain(fault, nounOf(intent.slice)));
        return;
      }

      if (fault.kind === 'refused') {
        // Final. Off the queue, and the mirror is put back to whatever
        // the database actually holds so the screen stops showing a
        // change that was never accepted.
        outbox.discard(intent.id);
        await rollback(intent);
        const message = explain(fault, nounOf(intent.slice));
        report(message);
        mirror.say(message);
        // The toast is gone in 2.6 seconds and the queue is now empty,
        // so without this the sidebar would go back to reading "All
        // changes saved" over the top of a change that was thrown away.
        noteRefused(intent.summary || nounOf(intent.slice), message);
        continue;
      }

      if (intent.tries >= 3) {
        outbox.markFailed(intent.id);
        report(explain(fault, nounOf(intent.slice)));
        continue;
      }
      outbox.requeue(intent.id);
      scheduleRetry(intent.tries);
      return;
    }
    setPhase('idle');
  } finally {
    draining = false;
    bump();
  }
}

function nounOf(slice: WriteTarget): string {
  return REGISTRY[slice]?.noun ?? 'record';
}

async function send(intent: outbox.WriteIntent): Promise<Fault | null> {
  const sb = supabase;
  const spec = specFor(intent.slice);
  if (!sb || !spec) return null;

  try {
    if (intent.op === 'insert') {
      // upsert on id, so a retry after a timeout whose answer never
      // arrived writes the same row rather than a duplicate or a 23505.
      const { data, error } = await sb
        .from(spec.table)
        .upsert(toRow(intent.record, spec.map), { onConflict: 'id' })
        .select('*')
        .maybeSingle();
      if (error) return classify(error);
      if (data) accept(intent, data as Row, spec);
      return null;
    }

    if (intent.op === 'update') {
      const patch = maskToRow(intent.record, spec.map, intent.fields);
      if (!Object.keys(patch).length) return null;
      const { data, error } = await sb
        .from(spec.table)
        .update(patch)
        .eq('id', intent.rowId)
        .select('*');
      if (error) return classify(error);
      // Success with no rows is the loudest signal there is: the row
      // exists, so a policy filtered it out of the using clause.
      if (!data || !data.length) return zeroRowsFault();
      accept(intent, data[0] as Row, spec);
      return null;
    }

    const { data, error } = await sb
      .from(spec.table)
      .delete()
      .eq('id', intent.rowId)
      .select('id');
    if (error) return classify(error);
    if (!data || !data.length) return zeroRowsFault();
    return null;
  } catch (e) {
    return classify(e);
  }
}

/* The server's own updated_at for a row we just wrote. Recording it
   here is what makes the echo of our own write free to ignore: the
   realtime event that follows carries the same stamp, and guard one
   drops anything not strictly newer. */
function accept(intent: outbox.WriteIntent, row: Row, spec: SliceSpec): void {
  noteStamp(intent.slice, intent.rowId, stampOf(row));
  if (spec.child || !mirror) return;
  const record = fromRow(row, spec.map);
  const local = mirror.getRow(intent.slice, intent.rowId);
  // Keep whatever the mirror knows that the table does not — an
  // issue's comments and photographs live in other tables.
  mirror.applyRow(intent.slice, { ...local, ...record });
}

async function rollback(intent: outbox.WriteIntent): Promise<void> {
  const sb = supabase;
  const spec = specFor(intent.slice);
  if (!sb || !spec || !mirror) return;

  // A refused insert never existed on the server, so there is nothing
  // to read back — the local row is the only copy and it goes.
  if (intent.op === 'insert') {
    mirror.dropRow(intent.slice, intent.rowId);
    return;
  }

  try {
    const { data } = await sb.from(spec.table).select('*').eq('id', intent.rowId).maybeSingle();
    if (data) {
      const local = mirror.getRow(intent.slice, intent.rowId);
      mirror.applyRow(intent.slice, { ...local, ...fromRow(data as Row, spec.map) });
    } else {
      mirror.dropRow(intent.slice, intent.rowId);
    }
  } catch {
    // If the row cannot be re-read the mirror is left as it is. The
    // person has already been told the change was not saved, and
    // guessing at the server's copy would be worse than saying so.
  }
}

/* ============================================================
   Inbound.

   Three guards, in order. Each one exists because of a specific way
   the screen otherwise goes wrong in front of somebody.
   ============================================================ */

/* Guard one's memory, deliberately outside the app types: a mirror
   row is a Profile or an InventoryItem, and hanging a sync timestamp
   off it would put transport state into the shape every screen
   reads. Keyed slice:id, holding the last updated_at taken. */
const stamps = new Map<string, number>();

function stampOf(row: Row): number {
  const raw = row.updated_at ?? row.said_at ?? row.happened_at ?? row.created_at;
  const n = raw ? Date.parse(String(raw)) : 0;
  return Number.isFinite(n) ? n : 0;
}

function noteStamp(slice: WriteTarget, rowId: ID, at: number): void {
  if (!rowId || !at) return;
  const key = `${slice}:${rowId}`;
  if ((stamps.get(key) ?? 0) < at) stamps.set(key, at);
}

export type RemoteEvent = 'INSERT' | 'UPDATE' | 'DELETE';

export function applyRemote(slice: WriteTarget, event: RemoteEvent, row: Row): void {
  const spec = specFor(slice);
  if (!spec || !mirror) return;

  const rowId = String(row.id ?? '');
  if (!rowId) return;

  if (event === 'DELETE') {
    stamps.delete(`${slice}:${rowId}`);
    outbox.discardFor(slice, rowId);
    mirror.dropRow(slice, rowId);
    return;
  }

  /* Guard one — monotonic. Anything not strictly newer than what has
     already been taken for this row is stale or is the echo of our
     own write coming back. Either way it is dropped. */
  const at = stampOf(row);
  const key = `${slice}:${rowId}`;
  if (at && at <= (stamps.get(key) ?? 0)) return;
  if (at) stamps.set(key, at);

  let record = fromRow(row, spec.map);

  /* Guard two — the field mask. Somebody is part-way through editing
     this row on this device and the write has not landed yet. Their
     fields are theirs until it does; the rest of the row may move. */
  const claimed = outbox.inFlightFields(slice, rowId);
  if (claimed) {
    if (claimed.has('*')) return;
    const local = mirror.getRow(slice, rowId);
    if (local) {
      const kept: Row = { ...record };
      for (const field of claimed) {
        if (field in local) kept[field] = local[field];
      }
      record = kept;
    }
  }

  /* Guard three — the conflict rule for this slice. */
  const local = mirror.getRow(slice, rowId);
  switch (spec.conflict) {
    case 'appendOnly':
      // Two devices offline produce two rows and both are correct, so
      // an arriving INSERT never replaces a row already held. An
      // UPDATE is a different statement about a row that genuinely
      // changed: on chat_messages the body is immutable by trigger and
      // pinned is the only field that can move, and a notice Earl puts
      // up has to reach Rosie's iPad without a reload.
      if (event === 'INSERT') {
        if (!local) mirror.applyRow(slice, record);
        return;
      }
      if (local) mirror.applyRow(slice, { ...local, ...record });
      return;
    case 'onlineOnly':
      // Nobody restructures a household from a lift. The server's copy
      // is the truth and a queued local edit is dropped, not replayed.
      outbox.discardFor(slice, rowId);
      mirror.applyRow(slice, { ...local, ...record });
      return;
    default:
      mirror.applyRow(slice, { ...local, ...record });
  }
}

/* ---------- the connection itself ---------- */

/* StrictMode mounts App twice in development, so init() — and this —
   runs twice. Without the guard that is two sets of window listeners
   and two drains racing for the head of the queue. */
let started = false;

export function startSync(): void {
  if (!supabase || started) return;
  started = true;
  window.addEventListener('online', onOnline);
  window.addEventListener('offline', onOffline);
  void drain();
}

export function stopSync(): void {
  started = false;
  window.removeEventListener('online', onOnline);
  window.removeEventListener('offline', onOffline);
  window.clearTimeout(retryTimer);
}

function onOnline(): void {
  setPhase('idle');
  void drain();
}

function onOffline(): void {
  setPhase('offline');
}

/** Everything that is queued, given up on and put back in the queue. */
export function retryAll(): void {
  outbox.retryFailed();
  void drain();
}
