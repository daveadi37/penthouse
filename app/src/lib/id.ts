let counter = 0;

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
