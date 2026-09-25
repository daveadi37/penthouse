import type { ID } from '@/types';
import type { WriteTarget } from './registry';

/* ============================================================
   What has been done on this device and not yet accepted by the
   database.

   One queue, global, drained one at a time and in order. Per-slice
   queues would drain faster and would be wrong: a buy-list line can
   name an inventory item created ten seconds earlier in the same
   offline session, and sending the shopping row first earns a 23503
   against a row that is sitting two queues away.

   The queue is somebody's morning. It is never trimmed to fit.
   ============================================================ */

const KEY = 'penthouse.outbox.v2';

/* The v1 queue held { entity, summary } — a note that something had
   happened, with no way to replay it. Nothing can be recovered from
   those entries, so they are cleared rather than carried forward. */
const LEGACY_KEY = 'penthouse.outbox.v1';

/**
 * Past this, new synced writes are refused rather than queued.
 *
 * The old code kept the last two hundred and dropped the rest from
 * the front, which is the worst of both: the app looked healthy and
 * the oldest writes — a whole offline shift — were gone. Refusing
 * loudly beats losing quietly, so this is a wall and not a window.
 */
export const QUEUE_LIMIT = 500;

export type WriteOp = 'insert' | 'update' | 'delete';

export type IntentState = 'pending' | 'sending' | 'failed';

export interface WriteIntent {
  id: string;
  at: number;
  slice: WriteTarget;
  op: WriteOp;
  rowId: ID;
  /** The app record as it stood when the intent was made. */
  record: Record<string, unknown>;
  /**
   * Which app fields this write claims. Empty on an insert, which
   * sends the whole row, and on a delete, which sends none of it.
   * On an update it is a column mask: sending a whole row would let
   * a rename overwrite a stock count somebody took a minute ago.
   */
  fields: string[];
  summary: string;
  tries: number;
  state: IntentState;
}

/* ---------- the queue itself ---------- */

let queue: WriteIntent[] = load();
let seq = 0;

function load(): WriteIntent[] {
  try {
    localStorage.removeItem(LEGACY_KEY);
    const raw = localStorage.getItem(KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    // Anything caught mid-flight when the tab closed is pending again:
    // the send either never happened or was never acknowledged, and an
    // insert is an upsert on id, so replaying it is safe.
    return (parsed as WriteIntent[]).map((i) =>
      i.state === 'sending' ? { ...i, state: 'pending' } : i,
    );
  } catch {
    return [];
  }
}

function save(): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(queue));
  } catch {
    // Out of quota. The in-memory queue is still the truth for this
    // session, so the work is not lost — it only stops surviving a
    // reload, and the banner is already up for the queue depth.
  }
}

/* ---------- letting the panel know ---------- */

const listeners = new Set<() => void>();

export function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function changed(): void {
  save();
  listeners.forEach((fn) => fn());
}

/* ---------- reading ---------- */

export function all(): readonly WriteIntent[] {
  return queue;
}

export const pendingCount = (): number => queue.filter((i) => i.state !== 'failed').length;

export const failedCount = (): number => queue.filter((i) => i.state === 'failed').length;

export const isFull = (): boolean => pendingCount() >= QUEUE_LIMIT;

/** The next thing to send. One at a time, oldest first, always. */
export function head(): WriteIntent | undefined {
  return queue.find((i) => i.state === 'pending');
}

/**
 * The fields any queued write already claims on this row.
 *
 * An inbound realtime change must not overwrite a field somebody is
 * part-way through changing here. Null means nothing is queued for
 * the row and the remote copy may be taken whole.
 */
export function inFlightFields(slice: WriteTarget, rowId: ID): Set<string> | null {
  const mine = queue.filter((i) => i.slice === slice && i.rowId === rowId && i.state !== 'failed');
  if (!mine.length) return null;
  const mask = new Set<string>();
  for (const intent of mine) {
    // An insert or a delete claims the whole row, not a list of fields.
    if (intent.op !== 'update') return new Set<string>(['*']);
    intent.fields.forEach((f) => mask.add(f));
  }
  return mask;
}

/* ---------- writing ---------- */

export interface EnqueueResult {
  ok: boolean;
  /** Set when the write was refused, for the banner. */
  reason?: 'full';
}

/**
 * Add a write, coalescing it into one already queued for the same row.
 *
 * Without this the 350ms save debounce is no protection at all: it
 * batches the cache flush, not the intents, so a name typed into a
 * field arrives as forty updates of one column. Coalescing merges
 * them into the earliest entry, which also keeps the queue in the
 * order the rows were created in.
 */
export function enqueue(intent: Omit<WriteIntent, 'id' | 'tries' | 'state'>): EnqueueResult {
  const open = queue.find(
    (i) => i.slice === intent.slice && i.rowId === intent.rowId && i.state === 'pending',
  );

  if (open) {
    merge(open, intent);
    changed();
    return { ok: true };
  }

  if (isFull()) return { ok: false, reason: 'full' };

  seq += 1;
  queue.push({
    ...intent,
    id: `${Date.now().toString(36)}-${seq.toString(36)}`,
    tries: 0,
    state: 'pending',
  });
  changed();
  return { ok: true };
}

function merge(open: WriteIntent, next: Omit<WriteIntent, 'id' | 'tries' | 'state'>): void {
  // A delete of a row whose insert has not gone yet cancels both: the
  // server never heard of it, so there is nothing to delete.
  if (next.op === 'delete' && open.op === 'insert') {
    queue = queue.filter((i) => i.id !== open.id);
    return;
  }

  if (next.op === 'delete') {
    open.op = 'delete';
    open.fields = [];
    open.record = next.record;
    open.summary = next.summary;
    return;
  }

  // An update on top of an unsent insert is still an insert — the whole
  // row goes, so the mask stays empty and only the record moves on.
  open.record = next.record;
  open.summary = next.summary;
  if (open.op === 'insert') return;

  open.op = next.op === 'insert' ? 'insert' : open.op;
  if (next.op === 'insert') {
    open.fields = [];
    return;
  }
  open.fields = Array.from(new Set([...open.fields, ...next.fields]));
}

/* ---------- moving one through ---------- */

export function markSending(id: string): void {
  const i = queue.find((x) => x.id === id);
  if (!i) return;
  i.state = 'sending';
  i.tries += 1;
  changed();
}

/** Accepted by the database. The only way a write leaves the queue clean. */
export function complete(id: string): void {
  queue = queue.filter((x) => x.id !== id);
  changed();
}

/** A dropped connection. Back to pending, to go again on the next drain. */
export function requeue(id: string): void {
  const i = queue.find((x) => x.id === id);
  if (!i) return;
  i.state = 'pending';
  changed();
}

/** Refused, and it will be refused again. Off the queue, on to the banner. */
export function discard(id: string): void {
  queue = queue.filter((x) => x.id !== id);
  changed();
}

/** Tried enough times without a verdict. Kept, so it can be seen and retried. */
export function markFailed(id: string): void {
  const i = queue.find((x) => x.id === id);
  if (!i) return;
  i.state = 'failed';
  changed();
}

export function retryFailed(): void {
  queue.forEach((i) => {
    if (i.state === 'failed') {
      i.state = 'pending';
      i.tries = 0;
    }
  });
  changed();
}

/**
 * Drop whatever is queued for one row.
 *
 * Used only by the onlineOnly conflict rule, where the server's copy
 * wins outright and replaying a local edit over it would undo
 * somebody else's deliberate restructuring of the house.
 */
export function discardFor(slice: WriteTarget, rowId: ID): void {
  const before = queue.length;
  queue = queue.filter((i) => !(i.slice === slice && i.rowId === rowId && i.state === 'pending'));
  if (queue.length !== before) changed();
}

/** Everything is up. Used when a fresh sign-in makes the queue moot. */
export function clear(): void {
  queue = [];
  changed();
}
