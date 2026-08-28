import type { Capability, DB, ID, Profile, RoleDef } from '@/types';

/* ============================================================
   Who can do what.

   Every screen asks this file rather than comparing a role string,
   because the role strings are no longer fixed — a house that has
   invented a 'night cover' role expects it to work everywhere, not
   only in the places somebody remembered to add it to an if.

   This is the second of two enforcement points, and the weaker one.
   It decides what the interface offers. What the database will
   actually hand over is decided by has_capability() in Postgres, and
   that one is not negotiable from a browser.
   ============================================================ */

export function roleOf(db: DB, roleId: ID): RoleDef | undefined {
  return db.roles.find((r) => r.id === roleId);
}

export function capabilitiesOf(db: DB, profile: Profile | undefined): Capability[] {
  if (!profile) return [];
  return roleOf(db, profile.role)?.capabilities ?? [];
}

/** The one question every screen asks. */
export function can(db: DB, profile: Profile | undefined, cap: Capability): boolean {
  if (!profile || !profile.active) return false;
  const role = roleOf(db, profile.role);
  if (!role || !role.active) return false;
  return role.capabilities.includes(cap);
}

/** True if any one of these would do. */
export function canAny(db: DB, profile: Profile | undefined, ...caps: Capability[]): boolean {
  return caps.some((c) => can(db, profile, c));
}

export function rankOf(db: DB, profile: Profile | undefined): number {
  if (!profile) return 0;
  return roleOf(db, profile.role)?.rank ?? 0;
}

/**
 * A role may only be granted, edited or deleted by someone who outranks
 * it. Without this, whoever holds `roles.manage` could promote themselves
 * and the hierarchy would mean nothing.
 */
export function canGrant(db: DB, actor: Profile | undefined, roleId: ID): boolean {
  if (!can(db, actor, 'roles.manage') && !can(db, actor, 'accounts.manage')) return false;
  const target = roleOf(db, roleId);
  if (!target) return false;
  return rankOf(db, actor) >= target.rank;
}

export function roleLabel(db: DB, roleId: ID): string {
  return roleOf(db, roleId)?.name ?? roleId;
}

/** The roles this person is allowed to hand out, highest first. */
export function grantableRoles(db: DB, actor: Profile | undefined): RoleDef[] {
  const rank = rankOf(db, actor);
  return db.roles
    .filter((r) => r.active && r.rank <= rank)
    .sort((a, b) => b.rank - a.rank);
}
