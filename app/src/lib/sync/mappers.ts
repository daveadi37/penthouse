/* ============================================================
   The app's field names on one side, the table's columns on the
   other, and the conversions between them.

   Written as data rather than as forty pairs of hand-rolled
   functions. A pair of functions per slice is forty places for a
   column name to be wrong in one direction only — the write goes to
   `min_qty` and the read comes back from `min`, and nothing complains
   until a minimum silently reads as zero and the buy list goes quiet.
   One map used in both directions cannot drift against itself.

   The map is also what makes the column mask work: `fields` names
   app fields, and the mask is translated through the same table.
   ============================================================ */

/**
 * How one value crosses. The `OrNull` variants are the difference
 * between a column that is `not null default ''` and one that is
 * genuinely optional — sending '' to a nullable date is a 22P02, and
 * sending null to a not-null text is a 23502.
 */
export type Kind =
  | 'text'
  | 'textOrNull'
  | 'num'
  | 'numOrNull'
  | 'int'
  | 'bool'
  /** Milliseconds in the app, timestamptz in the database. */
  | 'stamp'
  | 'stampOrNull'
  /** 'YYYY-MM-DD' both sides. */
  | 'date'
  | 'dateOrNull'
  /** 'HH:MM' in the app; Postgres hands back 'HH:MM:SS'. */
  | 'time'
  | 'timeOrNull'
  /** Arrays, enums and json — carried across untouched. */
  | 'raw'
  | 'rawOrNull';

export type FieldMap = Record<string, readonly [column: string, kind: Kind]>;

export type Row = Record<string, unknown>;

const isNil = (v: unknown): boolean => v === undefined || v === null || v === '';

function toColumn(v: unknown, kind: Kind): unknown {
  switch (kind) {
    case 'text':
      return v == null ? '' : String(v);
    case 'textOrNull':
      return isNil(v) ? null : String(v);
    case 'num':
      return Number(v ?? 0);
    case 'numOrNull':
      return v === undefined || v === null || v === '' ? null : Number(v);
    case 'int':
      return Math.round(Number(v ?? 0));
    case 'bool':
      return Boolean(v);
    case 'stamp':
      return new Date(Number(v ?? Date.now())).toISOString();
    case 'stampOrNull':
      return isNil(v) ? null : new Date(Number(v)).toISOString();
    case 'date':
      return v == null ? null : String(v).slice(0, 10);
    case 'dateOrNull':
      return isNil(v) ? null : String(v).slice(0, 10);
    case 'time':
      return v == null ? null : String(v).slice(0, 8);
    case 'timeOrNull':
      return isNil(v) ? null : String(v).slice(0, 8);
    case 'rawOrNull':
      return v === undefined || v === '' ? null : v;
    default:
      return v;
  }
}

function fromColumn(v: unknown, kind: Kind): unknown {
  switch (kind) {
    case 'text':
      return v == null ? '' : String(v);
    case 'textOrNull':
      return v == null || v === '' ? undefined : String(v);
    case 'num':
      // numeric arrives as a JSON number, but a wide numeric can arrive
      // as a string. Number() covers both; NaN would poison a total.
      return Number(v ?? 0) || 0;
    case 'numOrNull':
      return v == null ? undefined : Number(v);
    case 'int':
      return Math.round(Number(v ?? 0)) || 0;
    case 'bool':
      return Boolean(v);
    case 'stamp':
      return v == null ? 0 : Date.parse(String(v));
    case 'stampOrNull':
      return v == null ? undefined : Date.parse(String(v));
    case 'date':
      return v == null ? '' : String(v).slice(0, 10);
    case 'dateOrNull':
      return v == null ? undefined : String(v).slice(0, 10);
    case 'time':
      return v == null ? '' : String(v).slice(0, 5);
    case 'timeOrNull':
      return v == null ? undefined : String(v).slice(0, 5);
    case 'rawOrNull':
      return v == null ? undefined : v;
    default:
      return v;
  }
}

/** App record to database row. Every mapped field, always. */
export function toRow(rec: Row, map: FieldMap): Row {
  const out: Row = {};
  for (const field of Object.keys(map)) {
    const [col, kind] = map[field];
    out[col] = toColumn(rec[field], kind);
  }
  return out;
}

/** Database row to app record. Absent optionals stay absent. */
export function fromRow(row: Row, map: FieldMap): Row {
  const out: Row = {};
  for (const field of Object.keys(map)) {
    const [col, kind] = map[field];
    const v = fromColumn(row[col], kind);
    if (v !== undefined) out[field] = v;
  }
  return out;
}

/**
 * The column mask, translated.
 *
 * `fields` names app fields because that is what the calling code
 * knows. An unmapped name is dropped rather than guessed at — sending
 * a column that does not exist fails the whole statement, and taking
 * one row's edit down with it is worse than not sending a field the
 * database was never going to store.
 */
export function maskToRow(rec: Row, map: FieldMap, fields: readonly string[]): Row {
  const out: Row = {};
  for (const field of fields) {
    const spec = map[field];
    if (!spec) continue;
    out[spec[0]] = toColumn(rec[field], spec[1]);
  }
  return out;
}

/* ============================================================
   The maps.

   Each one is checked against its `create table` in
   supabase/migrations. Where the two genuinely disagree the slice is
   left out of the registry entirely rather than mapped lossily —
   see registry.ts.
   ============================================================ */

/* ---------- tier 1: identity and the grid ---------- */

/** roles.capabilities lives in role_capabilities and is handled apart. */
export const ROLES: FieldMap = {
  id: ['id', 'text'],
  name: ['name', 'text'],
  rank: ['rank', 'int'],
  description: ['description', 'text'],
  works: ['works', 'bool'],
  system: ['is_system', 'bool'],
  active: ['active', 'bool'],
};

export const PROFILES: FieldMap = {
  id: ['id', 'text'],
  name: ['name', 'text'],
  role: ['role', 'text'],
  staffRoles: ['staff_roles', 'raw'],
  email: ['email', 'text'],
  phone: ['phone', 'text'],
  initials: ['initials', 'text'],
  diet: ['diet', 'text'],
  active: ['active', 'bool'],
  canSignIn: ['can_sign_in', 'bool'],
  isHouseholdMember: ['is_household_member', 'bool'],
  // A uuid column: '' would be 22P02, so it has to become null.
  authId: ['auth_user_id', 'textOrNull'],
};

export const AREAS: FieldMap = {
  id: ['id', 'text'],
  name: ['name', 'text'],
  type: ['type', 'raw'],
  zone: ['zone', 'raw'],
  floor: ['floor', 'text'],
  status: ['status', 'raw'],
  deepFreq: ['deep_freq', 'int'],
  deepDow: ['deep_dow', 'int'],
  parity: ['parity', 'int'],
  use: ['use_level', 'rawOrNull'],
  standard: ['standard', 'text'],
  active: ['active', 'bool'],
};

export const TASK_CATEGORIES: FieldMap = {
  id: ['id', 'text'],
  name: ['name', 'text'],
  icon: ['icon', 'text'],
  order: ['sort_order', 'int'],
  zone: ['zone', 'raw'],
  system: ['system', 'rawOrNull'],
  active: ['active', 'bool'],
};

export const INVENTORY_CATEGORIES: FieldMap = {
  id: ['id', 'text'],
  name: ['name', 'text'],
  zone: ['zone', 'raw'],
  order: ['sort_order', 'int'],
  active: ['active', 'bool'],
};

export const EXPENSE_CATEGORIES: FieldMap = {
  id: ['id', 'text'],
  name: ['name', 'text'],
  kind: ['kind', 'raw'],
  zone: ['zone', 'raw'],
  order: ['sort_order', 'int'],
  active: ['active', 'bool'],
};

/* ---------- tier 2: what the house actually touches ---------- */

export const INVENTORY: FieldMap = {
  id: ['id', 'text'],
  name: ['name', 'text'],
  categoryId: ['category_id', 'text'],
  zone: ['zone', 'raw'],
  qty: ['qty', 'num'],
  min: ['min_qty', 'num'],
  unit: ['unit', 'text'],
  recurring: ['recurring', 'bool'],
  vendorId: ['vendor_id', 'textOrNull'],
  notes: ['notes', 'text'],
  active: ['active', 'bool'],
};

export const SHOPPING: FieldMap = {
  id: ['id', 'text'],
  itemId: ['item_id', 'textOrNull'],
  name: ['name', 'text'],
  zone: ['zone', 'raw'],
  qty: ['qty', 'num'],
  unit: ['unit', 'text'],
  status: ['status', 'raw'],
  addedBy: ['added_by', 'text'],
  addedAt: ['added_at', 'stamp'],
  // Moves with status by constraint: purchased has a date, nothing else does.
  purchasedAt: ['purchased_at', 'stampOrNull'],
  cost: ['cost', 'numOrNull'],
  vendorId: ['vendor_id', 'textOrNull'],
  notes: ['notes', 'text'],
};

export const MOVEMENTS: FieldMap = {
  id: ['id', 'text'],
  itemId: ['item_id', 'text'],
  delta: ['delta', 'num'],
  reason: ['reason', 'raw'],
  by: ['by_id', 'text'],
  at: ['happened_at', 'stamp'],
  ref: ['ref', 'text'],
};

/** photos and comments are child tables; see hydrateIssues in engine.ts. */
export const ISSUES: FieldMap = {
  id: ['id', 'text'],
  kind: ['kind', 'raw'],
  title: ['title', 'text'],
  detail: ['detail', 'text'],
  areaId: ['area_id', 'textOrNull'],
  zone: ['zone', 'raw'],
  priority: ['priority', 'raw'],
  status: ['status', 'raw'],
  reportedBy: ['reported_by', 'text'],
  reportedAt: ['reported_at', 'stamp'],
  assignedTo: ['assigned_to', 'textOrNull'],
  vendorId: ['vendor_id', 'textOrNull'],
  assetId: ['asset_id', 'textOrNull'],
  cost: ['cost', 'numOrNull'],
  resolvedAt: ['resolved_at', 'stampOrNull'],
  resolution: ['resolution', 'textOrNull'],
};

/** A comment carries its parent only on the way to the database. */
export const ISSUE_COMMENTS: FieldMap = {
  id: ['id', 'text'],
  issueId: ['issue_id', 'text'],
  by: ['by_id', 'text'],
  at: ['said_at', 'stamp'],
  text: ['body', 'text'],
};

export const ISSUE_PHOTOS: FieldMap = {
  id: ['id', 'text'],
  path: ['path', 'text'],
  caption: ['caption', 'text'],
  at: ['taken_at', 'stamp'],
  by: ['by_id', 'text'],
};

/* The house chat. Column names follow issue_comments deliberately —
   by_id, said_at, body — because it is the same shape of thing and
   the table is created by the migration that goes with this build. */
export const CHAT: FieldMap = {
  id: ['id', 'text'],
  by: ['by_id', 'text'],
  at: ['said_at', 'stamp'],
  text: ['body', 'text'],
  pinned: ['pinned', 'bool'],
  pinnedBy: ['pinned_by', 'textOrNull'],
  photo: ['photo_path', 'textOrNull'],
};

/* ---------- tier 3: opened when the screen is ---------- */

export const LIBRARY: FieldMap = {
  id: ['id', 'text'],
  categoryId: ['category_id', 'text'],
  text: ['text', 'text'],
  apply: ['apply', 'raw'],
  areaType: ['area_type', 'rawOrNull'],
  areaId: ['area_id', 'textOrNull'],
  zone: ['zone', 'raw'],
  freq: ['freq', 'raw'],
  dow: ['dow', 'int'],
  parity: ['parity', 'int'],
  instructions: ['instructions', 'text'],
  role: ['role', 'raw'],
  defaultTime: ['default_time', 'timeOrNull'],
  estMinutes: ['est_minutes', 'int'],
  groupAs: ['group_as', 'text'],
  light: ['light', 'bool'],
  order: ['sort_order', 'int'],
  active: ['active', 'bool'],
};

export const PROCEDURES: FieldMap = {
  id: ['id', 'text'],
  title: ['title', 'text'],
  category: ['category', 'text'],
  zone: ['zone', 'raw'],
  purpose: ['purpose', 'text'],
  frequency: ['frequency', 'text'],
  supplies: ['supplies', 'text'],
  steps: ['steps', 'raw'],
  standard: ['standard', 'text'],
  watchFor: ['watch_for', 'text'],
  role: ['role', 'raw'],
  version: ['version', 'int'],
  updatedAt: ['updated_at', 'stamp'],
};

export const APPOINTMENTS: FieldMap = {
  id: ['id', 'text'],
  date: ['date', 'date'],
  start: ['start_time', 'time'],
  end: ['end_time', 'time'],
  title: ['title', 'text'],
  kind: ['kind', 'raw'],
  zone: ['zone', 'raw'],
  areaId: ['area_id', 'textOrNull'],
  vendorId: ['vendor_id', 'textOrNull'],
  assignedTo: ['assigned_to', 'textOrNull'],
  attendees: ['attendees', 'text'],
  notes: ['notes', 'text'],
};

export const SHIFTS: FieldMap = {
  id: ['id', 'text'],
  staffId: ['staff_id', 'text'],
  days: ['days', 'raw'],
  start: ['start_time', 'time'],
  end: ['end_time', 'time'],
  dayOff: ['day_off', 'int'],
};

export const ABSENCES: FieldMap = {
  id: ['id', 'text'],
  staffId: ['staff_id', 'text'],
  from: ['from_date', 'date'],
  to: ['to_date', 'date'],
  type: ['type', 'raw'],
  notes: ['notes', 'text'],
};

export const COVERAGE: FieldMap = {
  id: ['id', 'text'],
  role: ['role', 'raw'],
  zone: ['zone', 'raw'],
  coverStaffId: ['cover_staff_id', 'text'],
  notes: ['notes', 'text'],
};

/** photos is a child table, like issues. */
export const INCIDENTS: FieldMap = {
  id: ['id', 'text'],
  date: ['happened_on', 'date'],
  time: ['happened_at', 'time'],
  type: ['type', 'raw'],
  zone: ['zone', 'raw'],
  areaId: ['area_id', 'textOrNull'],
  description: ['description', 'text'],
  people: ['people', 'text'],
  actionTaken: ['action_taken', 'text'],
  reportedBy: ['reported_by', 'text'],
  followUpIssueId: ['follow_up_issue_id', 'textOrNull'],
};

/** ingredients is a child table. */
export const MEALS: FieldMap = {
  id: ['id', 'text'],
  date: ['served_on', 'date'],
  type: ['type', 'raw'],
  name: ['name', 'text'],
  portions: ['portions', 'int'],
  serveAt: ['serve_at', 'time'],
  zone: ['zone', 'raw'],
  prep: ['prep', 'text'],
  cook: ['cook', 'text'],
  diet: ['diet', 'text'],
  leftovers: ['leftovers', 'raw'],
  status: ['status', 'raw'],
  by: ['proposed_by', 'text'],
  at: ['proposed_at', 'stamp'],
  approvedBy: ['approved_by', 'textOrNull'],
  feedback: ['feedback', 'text'],
};

export const MEAL_INGREDIENTS: FieldMap = {
  id: ['id', 'text'],
  itemId: ['item_id', 'textOrNull'],
  name: ['name', 'text'],
  qty: ['qty', 'num'],
  unit: ['unit', 'text'],
};

export const WASTE: FieldMap = {
  id: ['id', 'text'],
  date: ['wasted_on', 'date'],
  mealId: ['meal_id', 'textOrNull'],
  description: ['description', 'text'],
  reason: ['reason', 'text'],
  approxValue: ['approx_value', 'numOrNull'],
  by: ['by_id', 'text'],
  at: ['recorded_at', 'stamp'],
};

export const BUDGETS: FieldMap = {
  id: ['id', 'text'],
  month: ['month', 'text'],
  categoryId: ['category_id', 'text'],
  zone: ['zone', 'raw'],
  amount: ['amount', 'num'],
  notes: ['notes', 'text'],
};

/* ---------- settings, which is not a list ---------- */

/* One row with id = true, and two fields that are not columns at all:
   workingWeek is three columns in the app's one object, and laundry is
   the separate laundry_slots table. Hand-written for that reason. */

export const SETTINGS_SCALARS: FieldMap = {
  house: ['house', 'text'],
  address: ['address', 'text'],
  currency: ['currency', 'text'],
  locale: ['locale', 'text'],
  mealTimes: ['meal_times', 'raw'],
  portionDefault: ['portion_default', 'int'],
  alertLeadDays: ['alert_lead_days', 'int'],
  laundryStages: ['laundry_stages', 'raw'],
  unusedDows: ['unused_dows', 'raw'],
  planStart: ['plan_start', 'time'],
  planEnd: ['plan_end', 'time'],
  parityEpoch: ['parity_epoch', 'date'],
};

export const LAUNDRY_SLOTS: FieldMap = {
  dow: ['dow', 'int'],
  person: ['person', 'text'],
  type: ['load_type', 'text'],
  order: ['sort_order', 'int'],
};
