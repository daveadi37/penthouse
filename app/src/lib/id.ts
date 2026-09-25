let counter = 0;

/* ============================================================
   Two kinds of id, because the database has two kinds of key.

   profiles, roles, areas and the *_categories tables have text
   primary keys on purpose — 'p-earl' and 'c-household' are written
   into the source of the app, so they have to survive a rebuild.
   Those keep uid()/sid().

   Everything else — inventory_items, shopping_items, issues,
   chat_messages, inventory_movements, issue_comments — declares
   `id uuid primary key default gen_random_uuid()`. Postgres rejects
   anything that is not a uuid with 22P02, and a row needs its id the
   moment it is drawn on screen, long before any insert is
   acknowledged. So those rows are born with newId().
   ============================================================ */

/**
 * A real uuid, for the tables whose primary key is one.
 *
 * crypto.randomUUID() only exists in a secure context. This app is
 * served over plain http on the flat's wi-fi as well as over https,
 * and on the iPad at http://192.168.x.x the function is simply
 * missing — so the fallback is not theoretical, it is the LAN.
 */
export function newId(): string {
  const c: Crypto | undefined = globalThis.crypto;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();

  const b = new Uint8Array(16);
  if (c && typeof c.getRandomValues === 'function') c.getRandomValues(b);
  else for (let i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256);

  // Version 4, variant 1 — the two fields a uuid is checked on.
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;

  const h = Array.from(b, (n) => n.toString(16).padStart(2, '0'));
  return [
    h.slice(0, 4).join(''),
    h.slice(4, 6).join(''),
    h.slice(6, 8).join(''),
    h.slice(8, 10).join(''),
    h.slice(10, 16).join(''),
  ].join('-');
}

/** Short, sortable-enough, collision-safe for a household. */
export function uid(prefix = ''): string {
  counter = (counter + 1) % 4096;
  return (
    prefix +
    Date.now().toString(36) +
    counter.toString(36).padStart(2, '0') +
    Math.random().toString(36).slice(2, 6)
  );
}

/** Stable, human-readable ids for seed data so links survive a reseed. */
export function sid(prefix: string, n: number | string): string {
  return `${prefix}${n}`;
}

export const slug = (s: string): string =>
  String(s)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48);
