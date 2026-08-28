/* ============================================================
   A hash router in fifty lines.

   Routes here are flat — `#/module/sub/id` — so a dependency that
   models nested layouts would be paying for shape we do not have.
   Deep links from push notifications land straight on a record.

   One wrinkle worth stating, because it is not obvious and it cost a
   set of broken detail pages: `href` drops an empty segment rather than
   emitting `#/issues//i12`. So a module with no tabs is addressed as
   `#/issues/i12`, and the id arrives in `sub`, not in `id`.

   That is fine — a module knows whether it has tabs and the router
   cannot — but it means a tab-less module must read `route.id ??
   route.sub`. `detailId()` below is that read, written once so the next
   module does not get it wrong.
   ============================================================ */

import { useEffect, useState } from 'react';

export interface Route {
  module: string;
  sub?: string;
  id?: string;
  /** `?k=v` after the hash path. */
  query: Record<string, string>;
}

export function parseHash(hash: string): Route {
  const raw = hash.replace(/^#\/?/, '');
  const [path, qs] = raw.split('?');
  const parts = path.split('/').filter(Boolean).map(decodeURIComponent);
  const query: Record<string, string> = {};
  if (qs) {
    new URLSearchParams(qs).forEach((v, k) => {
      query[k] = v;
    });
  }
  return {
    module: parts[0] || 'today',
    sub: parts[1],
    id: parts[2],
    query,
  };
}

/**
 * The record a tab-less module is being asked for. Reads `id` first so
 * the three-segment form still works, then falls back to `sub`, which
 * is where a two-segment link puts it.
 */
export function detailId(route: Route): string | undefined {
  return route.id ?? route.sub;
}

export function href(module: string, sub?: string, id?: string, query?: Record<string, string>): string {
  let out =
    '#/' +
    [module, sub, id]
      .filter((p): p is string => !!p)
      .map((p) => encodeURIComponent(p))
      .join('/');
  if (query && Object.keys(query).length) out += '?' + new URLSearchParams(query).toString();
  return out;
}

export function navigate(module: string, sub?: string, id?: string, query?: Record<string, string>): void {
  const next = href(module, sub, id, query);
  if (window.location.hash !== next) window.location.hash = next;
}

export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parseHash(window.location.hash));
  useEffect(() => {
    const onChange = () => setRoute(parseHash(window.location.hash));
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return route;
}
