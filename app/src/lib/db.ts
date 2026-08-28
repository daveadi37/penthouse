/* ============================================================
   Storage adapter.

   Everything above this file talks to `adapter` and never to
   localStorage or Supabase directly. Wiring the real backend means
   writing a SupabaseAdapter with the same three methods — the app
   does not change.

   The local adapter also keeps a write queue, so the offline
   behaviour the original build had is preserved and the mutation
   outbox already exists when the backend lands.
   ============================================================ */

import type { DB } from '@/types';

export interface Adapter {
  load(): Promise<DB | null>;
  save(db: DB): Promise<void>;
  reset(): Promise<void>;
  readonly label: string;
  readonly online: boolean;
}

const KEY = 'penthouse.db.v1';
const QUEUE_KEY = 'penthouse.outbox.v1';

export interface OutboxEntry {
  id: string;
  at: number;
  /** Which slice changed. The Supabase adapter maps this to a table. */
  entity: string;
  summary: string;
}

class LocalAdapter implements Adapter {
  readonly label = 'This device';
  readonly online = true;

  async load(): Promise<DB | null> {
    try {
      const raw = localStorage.getItem(KEY);
      return raw ? (JSON.parse(raw) as DB) : null;
    } catch {
      return null;
    }
  }

  async save(db: DB): Promise<void> {
    try {
      localStorage.setItem(KEY, JSON.stringify(db));
    } catch (e) {
      // Quota. Drop the oldest materialised days and retry once — the
      // same strategy the original build used, for the same reason.
      try {
        const dates = Object.keys(db.days).sort();
        dates.slice(0, Math.max(0, dates.length - 40)).forEach((d) => delete db.days[d]);
        localStorage.setItem(KEY, JSON.stringify(db));
      } catch {
        console.warn('Storage full — changes are in memory only', e);
      }
    }
  }

  async reset(): Promise<void> {
    try {
      localStorage.removeItem(KEY);
      localStorage.removeItem(QUEUE_KEY);
    } catch {
      /* ignore */
    }
  }
}

export const adapter: Adapter = new LocalAdapter();

/* ---------- the outbox: what would be in flight to the server ---------- */

export function readOutbox(): OutboxEntry[] {
  try {
    return JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]') as OutboxEntry[];
  } catch {
    return [];
  }
}

export function pushOutbox(entity: string, summary: string): void {
  try {
    const q = readOutbox();
    q.push({ id: String(Date.now()) + Math.random().toString(36).slice(2, 6), at: Date.now(), entity, summary });
    localStorage.setItem(QUEUE_KEY, JSON.stringify(q.slice(-200)));
  } catch {
    /* ignore */
  }
}

export function clearOutbox(): void {
  try {
    localStorage.setItem(QUEUE_KEY, '[]');
  } catch {
    /* ignore */
  }
}

/* ---------- conflict rules, declared where they belong ----------
   Documented here rather than buried in the sync code, because
   these three rules are the whole offline story.                */

export type ConflictRule = 'lastWrite' | 'appendOnly' | 'onlineOnly';

export const CONFLICT_RULES: Record<string, ConflictRule> = {
  // A single field owned by whoever most recently did the thing.
  days: 'lastWrite',
  inventory: 'lastWrite',
  issues: 'lastWrite',
  meals: 'lastWrite',
  shopping: 'lastWrite',

  // Two offline devices produce two rows, both correct.
  movements: 'appendOnly',
  attendance: 'appendOnly',
  visitors: 'appendOnly',
  deliveries: 'appendOnly',
  contractorVisits: 'appendOnly',
  waste: 'appendOnly',
  incidents: 'appendOnly',
  audit: 'appendOnly',
  transactions: 'appendOnly',
  pettyCash: 'appendOnly',

  // Nobody restructures a household from a lift.
  areas: 'onlineOnly',
  library: 'onlineOnly',
  taskCategories: 'onlineOnly',
  budgets: 'onlineOnly',
  staffDetails: 'onlineOnly',
  profiles: 'onlineOnly',
  settings: 'onlineOnly',
};
