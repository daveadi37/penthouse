/* ============================================================
   The local cache.

   This used to be the database. It is now a cache of one, and the
   difference matters: Postgres holds the house, and what is on this
   device is a copy kept so the app opens instantly on a cold start
   and keeps working in the lift.

   There is deliberately no SupabaseAdapter behind this interface.
   The three methods here take the whole DB at once, and that shape
   cannot survive the trip:

     - save() would be sixty-one table upserts for one keystroke.
     - it has no way to express a partial failure, which is the
       normal outcome against row-level security — Rosie's stock
       count lands and her edit to the budget is refused, in the same
       call, and a Promise<void> has nowhere to put that.
     - it has no id for a row, so nothing could be retried, masked or
       rolled back.

   Writes leave as typed intents instead, through src/lib/sync. This
   file only ever writes a blob to localStorage and reads it back.
   ============================================================ */

import type { DB } from '@/types';
import { describeBackend } from './supabase';

export interface Adapter {
  load(): Promise<DB | null>;
  save(db: DB): Promise<void>;
  reset(): Promise<void>;
  readonly label: string;
  readonly online: boolean;
}

const KEY = 'penthouse.db.v1';

/**
 * Which backend the cached blob came from.
 *
 * DB_VERSION alone is not enough to decide the cache is still good.
 * A build pointed at a new Supabase project has the same version
 * number and a completely different house, and without this key it
 * would read the old one off disk and show it as though it were
 * live — the seeded example house wearing the real project's name.
 * Two keys, and either one failing throws the copy away.
 */
const ORIGIN_KEY = 'penthouse.db.origin';

class LocalCache implements Adapter {
  readonly label = 'This device';
  readonly online = true;

  async load(): Promise<DB | null> {
    try {
      const origin = localStorage.getItem(ORIGIN_KEY);
      if (origin !== null && origin !== describeBackend()) {
        // Pointed somewhere else since this was written. Not ours.
        localStorage.removeItem(KEY);
        localStorage.removeItem(ORIGIN_KEY);
        return null;
      }
      const raw = localStorage.getItem(KEY);
      return raw ? (JSON.parse(raw) as DB) : null;
    } catch {
      return null;
    }
  }

  async save(db: DB): Promise<void> {
    try {
      localStorage.setItem(KEY, JSON.stringify(db));
      localStorage.setItem(ORIGIN_KEY, describeBackend());
    } catch (e) {
      // Quota. Materialised days are the bulk of the blob and the
      // cheapest thing to lose, because buildDay() reconstructs them.
      // The copy written is trimmed; the live object is left alone,
      // because silently deleting a day out of the running state is
      // how a screen empties itself while somebody is reading it.
      try {
        const dates = Object.keys(db.days).sort();
        const keep = new Set(dates.slice(Math.max(0, dates.length - 40)));
        const days: DB['days'] = {};
        for (const d of dates) if (keep.has(d)) days[d] = db.days[d];
        localStorage.setItem(KEY, JSON.stringify({ ...db, days }));
        localStorage.setItem(ORIGIN_KEY, describeBackend());
      } catch {
        console.warn('Storage full — changes are in memory only', e);
      }
    }
  }

  async reset(): Promise<void> {
    try {
      localStorage.removeItem(KEY);
      localStorage.removeItem(ORIGIN_KEY);
    } catch {
      /* ignore */
    }
  }
}

export const adapter: Adapter = new LocalCache();
