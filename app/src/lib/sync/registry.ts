import type { DB } from '@/types';
import { backendConfigured } from '@/lib/supabase';
import {
  ABSENCES,
  APPOINTMENTS,
  AREAS,
  BUDGETS,
  CHAT,
  COVERAGE,
  EXPENSE_CATEGORIES,
  INCIDENTS,
  INVENTORY,
  INVENTORY_CATEGORIES,
  ISSUE_COMMENTS,
  ISSUES,
  LIBRARY,
  MEALS,
  MOVEMENTS,
  PROCEDURES,
  PROFILES,
  ROLES,
  SHIFTS,
  SHOPPING,
  TASK_CATEGORIES,
  WASTE,
  type FieldMap,
} from './mappers';

/* ============================================================
   The registry: one typed row per slice that exists in Postgres.

   This is the only place that knows a slice is a table. The store
   knows slices, the modules know `db.inventory`, and neither of them
   ever names a table, a column or a filter. Adding a table to the
   sync is a row here plus a map in mappers.ts, and nothing else in
   the app moves.

   A slice that is absent from this registry is not synced. That is a
   real state and not an oversight: `days` and `notifications` are
   deliberately absent, and so is every slice whose app type and whose
   table have drifted apart far enough that mapping it would quietly
   drop fields.
   ============================================================ */

/**
 * What happens when the same row was changed in two places.
 *
 * These three rules are the whole offline story, which is why they
 * are declared beside the tables rather than inside the merge code.
 *
 *   lastWrite  — one field, owned by whoever most recently did the
 *                thing. The later timestamp wins.
 *   appendOnly — two devices offline produce two rows and both are
 *                correct. Never replace, only insert if absent.
 *   onlineOnly — nobody restructures a household from a lift. The
 *                server's copy is the truth and a queued local edit
 *                is discarded rather than replayed over it.
 */
export type ConflictRule = 'lastWrite' | 'appendOnly' | 'onlineOnly';

export type IdKind = 'uuid' | 'text';

/** 1 blocks the boot, 2 follows first paint, 3 waits for a screen, 4 never. */
export type Tier = 1 | 2 | 3 | 4;

export type FilterOp = 'eq' | 'neq' | 'in' | 'notIn' | 'is';

export type Filter = readonly [column: string, op: FilterOp, value: unknown];

/**
 * A write target. Every slice of the mirror, plus the child tables
 * that are edited on their own — an issue comment is a row in
 * issue_comments, not a field of the issue it hangs off.
 */
export type WriteTarget = keyof DB | 'issueComments';

export interface SliceSpec {
  table: string;
  /**
   * Which id generator a new row gets. The uuid tables reject
   * anything else with 22P02, and the text tables carry ids that are
   * written into the source of the app, so this is not cosmetic.
   */
  idKind: IdKind;
  conflict: ConflictRule;
  tier: Tier;
  /** Whether inbound changes arrive on a channel rather than a reload. */
  realtime: boolean;
  map: FieldMap;
  /** Plural and lower case, as it reads in a sentence to the person. */
  noun: string;
  /** Narrows the first read to what the screen actually opens with. */
  filters?: readonly Filter[];
  order?: { column: string; ascending: boolean };
  limit?: number;
  /**
   * Written and read on its own, and folded into a parent row in the
   * mirror rather than living in `db[slice]`.
   */
  child?: boolean;
}

/* ============================================================
   Tier 1 — blocking on boot.

   Under two hundred rows in total, fetched in one Promise.all.
   Nothing below can render honestly without these: can() reads roles
   and role_capabilities, so a screen drawn before they land is a
   screen drawn against the wrong idea of who is looking at it.
   ============================================================ */

const TIER1_SPECS = {
  roles: {
    table: 'roles',
    idKind: 'text',
    conflict: 'onlineOnly',
    tier: 1,
    realtime: false,
    map: ROLES,
    noun: 'roles',
    order: { column: 'rank', ascending: false },
  },
  profiles: {
    table: 'profiles',
    idKind: 'text',
    conflict: 'onlineOnly',
    tier: 1,
    realtime: false,
    map: PROFILES,
    noun: 'people',
    order: { column: 'name', ascending: true },
  },
  areas: {
    table: 'areas',
    idKind: 'text',
    conflict: 'onlineOnly',
    tier: 1,
    realtime: false,
    map: AREAS,
    noun: 'rooms',
  },
  taskCategories: {
    table: 'task_categories',
    idKind: 'text',
    conflict: 'onlineOnly',
    tier: 1,
    realtime: false,
    map: TASK_CATEGORIES,
    noun: 'task groups',
    order: { column: 'sort_order', ascending: true },
  },
  inventoryCategories: {
    table: 'inventory_categories',
    idKind: 'text',
    conflict: 'onlineOnly',
    tier: 1,
    realtime: false,
    map: INVENTORY_CATEGORIES,
    noun: 'stock groups',
    order: { column: 'sort_order', ascending: true },
  },
  expenseCategories: {
    table: 'expense_categories',
    idKind: 'text',
    conflict: 'onlineOnly',
    tier: 1,
    realtime: false,
    map: EXPENSE_CATEGORIES,
    noun: 'spending groups',
    order: { column: 'sort_order', ascending: true },
  },
} as const satisfies Record<string, SliceSpec>;

/* ============================================================
   Tier 2 — after first paint.

   The four things the house actually touches, narrowed to what the
   screen opens with. The whole of chat is not needed to read this
   morning's messages, and a year of purchased shopping lines is not
   needed to write a buy list.
   ============================================================ */

const TIER2_SPECS = {
  chat: {
    table: 'chat_messages',
    idKind: 'uuid',
    conflict: 'appendOnly',
    tier: 2,
    realtime: true,
    map: CHAT,
    noun: 'messages',
    order: { column: 'said_at', ascending: false },
    limit: 100,
  },
  shopping: {
    table: 'shopping_items',
    idKind: 'uuid',
    conflict: 'lastWrite',
    tier: 2,
    realtime: true,
    map: SHOPPING,
    noun: 'buy list',
    // Standing rows stay on the list once bought, so status alone is
    // the filter and `standing` is not part of it.
    filters: [['status', 'neq', 'purchased']],
    order: { column: 'added_at', ascending: false },
  },
  inventory: {
    table: 'inventory_items',
    idKind: 'uuid',
    conflict: 'lastWrite',
    tier: 2,
    realtime: true,
    map: INVENTORY,
    noun: 'stock list',
    filters: [['active', 'eq', true]],
    order: { column: 'name', ascending: true },
  },
  issues: {
    table: 'issues',
    idKind: 'uuid',
    conflict: 'lastWrite',
    tier: 2,
    realtime: true,
    map: ISSUES,
    noun: 'reports',
    filters: [['status', 'notIn', ['resolved', 'closed']]],
    order: { column: 'reported_at', ascending: false },
  },
} as const satisfies Record<string, SliceSpec>;

/* ============================================================
   Tier 3 — opened when the screen is.

   Loaded once, on the first navigation that needs them, and kept.
   The registry only names the slices whose app type and whose table
   agree field for field; see the note at the foot of this file.
   ============================================================ */

const TIER3_SPECS = {
  library: {
    table: 'library_tasks',
    idKind: 'text',
    conflict: 'onlineOnly',
    tier: 3,
    realtime: false,
    map: LIBRARY,
    noun: 'task library',
    order: { column: 'sort_order', ascending: true },
  },
  procedures: {
    table: 'procedures',
    idKind: 'uuid',
    conflict: 'onlineOnly',
    tier: 3,
    realtime: false,
    map: PROCEDURES,
    noun: 'procedures',
  },
  appointments: {
    table: 'appointments',
    idKind: 'uuid',
    conflict: 'lastWrite',
    tier: 3,
    realtime: false,
    map: APPOINTMENTS,
    noun: 'appointments',
    order: { column: 'date', ascending: false },
  },
  shifts: {
    table: 'shifts',
    idKind: 'uuid',
    conflict: 'onlineOnly',
    tier: 3,
    realtime: false,
    map: SHIFTS,
    noun: 'rota',
  },
  absences: {
    table: 'absences',
    idKind: 'uuid',
    conflict: 'lastWrite',
    tier: 3,
    realtime: false,
    map: ABSENCES,
    noun: 'absences',
  },
  coverage: {
    table: 'coverage_rules',
    idKind: 'uuid',
    conflict: 'onlineOnly',
    tier: 3,
    realtime: false,
    map: COVERAGE,
    noun: 'cover rules',
  },
  incidents: {
    table: 'incidents',
    idKind: 'uuid',
    conflict: 'appendOnly',
    tier: 3,
    realtime: false,
    map: INCIDENTS,
    noun: 'incidents',
    order: { column: 'happened_on', ascending: false },
  },
  meals: {
    table: 'meals',
    idKind: 'uuid',
    conflict: 'lastWrite',
    tier: 3,
    realtime: false,
    map: MEALS,
    noun: 'meals',
    order: { column: 'served_on', ascending: false },
  },
  waste: {
    table: 'waste_entries',
    idKind: 'uuid',
    conflict: 'appendOnly',
    tier: 3,
    realtime: false,
    map: WASTE,
    noun: 'waste log',
    order: { column: 'wasted_on', ascending: false },
  },
  budgets: {
    table: 'budgets',
    idKind: 'uuid',
    conflict: 'lastWrite',
    tier: 3,
    realtime: false,
    map: BUDGETS,
    noun: 'budget',
  },
} as const satisfies Record<string, SliceSpec>;

/* ============================================================
   The children.

   Rows of their own table that appear nested in the mirror. They are
   never read as a tier — they arrive hydrated onto their parent —
   but they are written like anything else.
   ============================================================ */

const CHILD_SPECS = {
  issueComments: {
    table: 'issue_comments',
    idKind: 'uuid',
    conflict: 'appendOnly',
    tier: 2,
    realtime: false,
    map: ISSUE_COMMENTS,
    noun: 'comments',
    child: true,
  },
  movements: {
    table: 'inventory_movements',
    idKind: 'uuid',
    conflict: 'appendOnly',
    tier: 4,
    realtime: false,
    map: MOVEMENTS,
    noun: 'stock movements',
  },
} as const satisfies Record<string, SliceSpec>;

export const REGISTRY: Partial<Record<WriteTarget, SliceSpec>> = {
  ...TIER1_SPECS,
  ...TIER2_SPECS,
  ...TIER3_SPECS,
  ...CHILD_SPECS,
};

/* ---------- reading the registry ---------- */

export function specFor(target: WriteTarget): SliceSpec | undefined {
  return REGISTRY[target];
}

/**
 * Whether a write to this slice should leave the device at all.
 *
 * Both halves matter. A slice absent from the registry is never sent,
 * and with no backend configured nothing is — otherwise the build
 * that runs on the seeded house with no project behind it would queue
 * an intent for every edit, fill five hundred slots and then start
 * refusing writes with a banner about a database it cannot reach.
 */
export function isSynced(target: WriteTarget): boolean {
  return backendConfigured && Boolean(REGISTRY[target]);
}

export function idKindFor(target: WriteTarget): IdKind {
  return REGISTRY[target]?.idKind ?? 'text';
}

export function nounFor(target: WriteTarget): string {
  return REGISTRY[target]?.noun ?? 'record';
}

export function conflictFor(target: WriteTarget): ConflictRule {
  return REGISTRY[target]?.conflict ?? 'lastWrite';
}

const keysAtTier = (tier: Tier): WriteTarget[] =>
  (Object.keys(REGISTRY) as WriteTarget[]).filter(
    (k) => REGISTRY[k]?.tier === tier && !REGISTRY[k]?.child,
  );

/** Identity and the capability grid. Nothing renders before these land. */
export const TIER1: WriteTarget[] = keysAtTier(1);

/** What the house touches. Fetched after the first paint. */
export const TIER2: WriteTarget[] = ['chat', 'shopping', 'inventory', 'issues'];

/** The tables a channel is opened on. */
export const REALTIME: WriteTarget[] = (Object.keys(REGISTRY) as WriteTarget[]).filter(
  (k) => REGISTRY[k]?.realtime,
);

/* ============================================================
   Which screen needs which slice.

   Read once, on the first navigation to a module, by the single
   effect in App.tsx. A module that is missing here needs nothing
   beyond tiers 1 and 2, which is true of most of them.
   ============================================================ */
export const MODULE_SLICES: Record<string, WriteTarget[]> = {
  today: ['library', 'appointments', 'shifts', 'absences', 'coverage', 'meals'],
  planner: ['library', 'appointments', 'shifts', 'absences', 'coverage'],
  checklist: ['library', 'procedures'],
  calendar: ['appointments', 'absences', 'meals'],
  issues: ['incidents'],
  cooking: ['meals', 'waste'],
  laundry: ['shifts', 'absences'],
  money: ['budgets'],
  staff: ['shifts', 'absences'],
  manual: ['procedures', 'library'],
  admin: ['library'],
};

/* ============================================================
   Deliberately not synced.

   `days` — buildDay() in src/lib/schedule.ts and build_day() in
   Postgres do the same job from the same library. Two builders over
   one table is not a merge problem, it is a data-loss bug: whichever
   ran second replaces a morning of ticks with a fresh empty list. The
   day stays local and is rebuilt on the device that shows it.

   `notifications` — the row-level security on that table has no
   insert policy for `authenticated`, by design. Every notify() call
   from a browser would be refused, and a queue full of refusals that
   can never drain is worse than no push at all. Pushes are the
   database's job, from the triggers in 20260828001500_functions_cron.

   `settings` — one row, and the app's Settings object is not that
   row: workingWeek is three columns and laundry is a separate table.
   It is read in tier 1 by hand in engine.ts and, for now, not
   written back.

   The rest — contacts, vendors, visitors, contractorVisits,
   deliveries, credentials, transactions, recurring, pettyCash,
   documents, staffDetails, attendance, leave, reviews, guests,
   events, templates, vacations, assets, vehicles, contracts, plants —
   have app types and tables that no longer agree: Vendor carries web,
   cadence and nextVisit with no columns behind them, Delivery carries
   tracking and collectedBy, Contact carries altPhone. Mapping them
   now would send a row that silently loses those fields on the first
   edit. They stay local until the types and the migrations are made
   to agree, which is a schema decision and not this file's to take.
   ============================================================ */
