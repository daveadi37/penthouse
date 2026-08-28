/** Money, quantities and other display helpers. */

export function money(n: number | undefined | null, currency = 'AED'): string {
  if (n == null || Number.isNaN(n)) return '—';
  const abs = Math.abs(n);
  const s = abs.toLocaleString('en-AE', {
    minimumFractionDigits: abs % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  });
  return `${n < 0 ? '−' : ''}${currency} ${s}`;
}

export function moneyCompact(n: number | undefined | null, currency = 'AED'): string {
  if (n == null || Number.isNaN(n)) return '—';
  const abs = Math.abs(n);
  if (abs >= 1000) return `${currency} ${(n / 1000).toFixed(abs >= 10000 ? 0 : 1)}k`;
  return `${currency} ${Math.round(n)}`;
}

export function qty(n: number, unit: string): string {
  const rounded = Math.round(n * 100) / 100;
  return `${rounded.toLocaleString('en-AE')} ${unit}`;
}

export function pct(n: number): string {
  return `${Math.round(n)}%`;
}

export function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join('');
}

export function plural(n: number, one: string, many?: string): string {
  return `${n} ${n === 1 ? one : many ?? one + 's'}`;
}

export function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s;
}

export function titleCase(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
