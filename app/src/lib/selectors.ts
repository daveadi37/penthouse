/* ============================================================
   Derived reads. Everything computed lives here rather than in a
   component, so the alert centre and the dashboards cannot drift
   apart from each other.
   ============================================================ */

import type {
  Asset,
  DB,
  DateStr,
  ID,
  Issue,
  IssuePriority,
  InventoryItem,
  MovementReason,
  Profile,
  ServiceContract,
  ShoppingItem,
  TaskInstance,
  Vehicle,
  Zone,
} from '@/types';
import { addDays, daysUntil, diffDays, monthKey, today } from './date';

export type ZoneFilter = Zone | 'all';

export const inZone = <T extends { zone: Zone }>(list: T[], z: ZoneFilter): T[] =>
  z === 'all' ? list : list.filter((x) => x.zone === z);

/* ---------- people ---------- */

/**
 * The people work routes to. Read from the role's `works` flag rather
 * than a hardcoded word, so a role the house invents later — night
 * cover, a second driver — is picked up everywhere at once.
 */
export const staffList = (db: DB): Profile[] =>
  db.profiles.filter((p) => p.active && db.roles.find((r) => r.id === p.role)?.works);

export const householdMembers = (db: DB): Profile[] =>
  db.profiles.filter((p) => p.isHouseholdMember);

export const profileName = (db: DB, id?: ID): string =>
  id ? (db.profiles.find((p) => p.id === id)?.name ?? 'Unknown') : 'Unassigned';

export const areaName = (db: DB, id?: ID): string =>
  id ? (db.areas.find((a) => a.id === id)?.name ?? '—') : '—';

export const vendorName = (db: DB, id?: ID): string =>
  id ? (db.vendors.find((v) => v.id === id)?.name ?? '—') : '—';

export const catName = (db: DB, id?: ID): string =>
  id ? (db.expenseCategories.find((c) => c.id === id)?.name ?? '—') : '—';

/* ---------- issues ---------- */

export const OPEN_STATUSES: Issue['status'][] = [
  'reported',
  'acknowledged',
  'assigned',
  'in_progress',
  'awaiting_vendor',
];

export const openIssues = (db: DB): Issue[] =>
  db.issues.filter((i) => OPEN_STATUSES.includes(i.status));

export const urgentIssues = (db: DB): Issue[] =>
  openIssues(db).filter((i) => i.priority === 'urgent');

export const unassignedIssues = (db: DB): Issue[] =>
  db.issues.filter((i) => i.status === 'reported');

export const issuesFor = (db: DB, profileId: ID): Issue[] =>
  db.issues.filter((i) => i.reportedBy === profileId);

export const assignedIssues = (db: DB, profileId: ID): Issue[] =>
  openIssues(db).filter((i) => i.assignedTo === profileId);

export const PRIORITY_ORDER: Record<IssuePriority, number> = {
  urgent: 0,
  high: 1,
  normal: 2,
  low: 3,
};

export const byPriority = (a: Issue, b: Issue) =>
  PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority] || b.reportedAt - a.reportedAt;

/* ---------- inventory ---------- */

export const belowMin = (db: DB): InventoryItem[] =>
  db.inventory.filter((i) => i.active && i.qty < i.min);

export const atZero = (db: DB): InventoryItem[] =>
  db.inventory.filter((i) => i.active && i.qty <= 0);

/**
 * Units consumed per week, from the movement log.
 *
 * A stocktake correction is not consumption. Counting mode writes one
 * every time Rosie walks the cupboard and finds fewer than the app
 * thought, and left in the sum the first proper count of the year would
 * read as a week of enormous use — which would then raise every minimum
 * and put the whole cupboard on the buy list. Only stock that actually
 * left the house counts.
 */
export const CONSUMING: MovementReason[] = ['used', 'wasted', 'transferred'];

export function burnRate(db: DB, itemId: ID, days = 28): number {
  const cutoff = Date.now() - days * 864e5;
  const used = db.movements
    .filter((m) => m.itemId === itemId && m.at >= cutoff && m.delta < 0 && CONSUMING.includes(m.reason))
    .reduce((sum, m) => sum + Math.abs(m.delta), 0);
  return Math.round((used / days) * 7 * 10) / 10;
}

/** Days of cover left at the current burn rate. */
export function daysOfCover(db: DB, item: InventoryItem): number | null {
  const weekly = burnRate(db, item.id);
  if (!weekly) return null;
  return Math.round((item.qty / weekly) * 7);
}

export const shoppingOpen = (db: DB) => db.shopping.filter((s) => s.status !== 'purchased');

/* ---------- meals ---------- */

export const awaitingApproval = (db: DB) =>
  db.meals.filter((m) => m.status === 'Submitted');

export const mealsOn = (db: DB, date: DateStr) =>
  db.meals.filter((m) => m.date === date).sort((a, b) => a.serveAt.localeCompare(b.serveAt));

/** Does the pantry hold enough of every named ingredient? */
export function ingredientStatus(db: DB, name: string): 'ok' | 'low' | 'unknown' {
  const item = db.inventory.find((i) => i.name.toLowerCase() === name.toLowerCase());
  if (!item) return 'unknown';
  return item.qty >= item.min ? 'ok' : 'low';
}

/* ---------- expiries: one engine for everything with a date ---------- */

export type ExpiryKind =
  | 'warranty'
  | 'service'
  | 'contract'
  | 'document'
  | 'registration'
  | 'insurance'
  | 'visa'
  | 'passport'
  | 'medical'
  | 'staffContract';

export interface Expiry {
  id: string;
  kind: ExpiryKind;
  label: string;
  detail: string;
  date: DateStr;
  days: number;
  zone: Zone;
  url: string;
  ownerOnly: boolean;
}

export function allExpiries(db: DB): Expiry[] {
  const out: Expiry[] = [];
  const push = (e: Omit<Expiry, 'days'>) => {
    if (!e.date) return;
    out.push({ ...e, days: daysUntil(e.date) });
  };

  db.assets
    .filter((a) => a.active)
    .forEach((a) => {
      push({ id: `wa-${a.id}`, kind: 'warranty', label: `${a.name} warranty`, detail: a.warranty.provider || a.brand, date: a.warranty.end, zone: a.zone, url: `#/register/assets/${a.id}`, ownerOnly: false });
      if (a.service.freqDays)
        push({ id: `sv-${a.id}`, kind: 'service', label: `${a.name} service`, detail: `Every ${a.service.freqDays} days`, date: a.service.next, zone: a.zone, url: `#/register/assets/${a.id}`, ownerOnly: false });
    });

  db.vehicles
    .filter((v) => v.active)
    .forEach((v) => {
      push({ id: `vr-${v.id}`, kind: 'registration', label: `${v.name} registration`, detail: v.plate, date: v.registrationExpiry, zone: v.zone, url: `#/register/vehicles/${v.id}`, ownerOnly: false });
      push({ id: `vi-${v.id}`, kind: 'insurance', label: `${v.name} insurance`, detail: v.insuranceProvider, date: v.insuranceExpiry, zone: v.zone, url: `#/register/vehicles/${v.id}`, ownerOnly: false });
      push({ id: `vs-${v.id}`, kind: 'service', label: `${v.name} service`, detail: `${v.odometer.toLocaleString()} km`, date: v.serviceNext, zone: v.zone, url: `#/register/vehicles/${v.id}`, ownerOnly: false });
    });

  db.contracts
    .filter((c) => c.active)
    .forEach((c) => {
      push({ id: `cs-${c.id}`, kind: 'service', label: `${c.name} — visit due`, detail: vendorName(db, c.vendorId), date: c.next, zone: c.zone, url: `#/register/contracts/${c.id}`, ownerOnly: false });
      push({ id: `ce-${c.id}`, kind: 'contract', label: `${c.name} — contract ends`, detail: vendorName(db, c.vendorId), date: c.contractEnd, zone: c.zone, url: `#/register/contracts/${c.id}`, ownerOnly: false });
    });

  db.documents.forEach((d) => {
    push({ id: `dc-${d.id}`, kind: 'document', label: d.title, detail: d.cat, date: d.expiryDate, zone: d.zone, url: `#/documents/${d.id}`, ownerOnly: d.visibility === 'owner' });
  });

  db.staffDetails.forEach((s) => {
    const name = profileName(db, s.profileId);
    push({ id: `sv-visa-${s.id}`, kind: 'visa', label: `${name} — residence visa`, detail: 'Renewal takes about three weeks', date: s.visaExpiry, zone: 'household', url: `#/staff/${s.profileId}`, ownerOnly: true });
    push({ id: `sp-${s.id}`, kind: 'passport', label: `${name} — passport`, detail: 'A visa renewal needs six months validity', date: s.passportExpiry, zone: 'household', url: `#/staff/${s.profileId}`, ownerOnly: true });
    push({ id: `sm-${s.id}`, kind: 'medical', label: `${name} — medical`, detail: 'Needed before a visa renewal', date: s.medicalExpiry, zone: 'household', url: `#/staff/${s.profileId}`, ownerOnly: true });
    push({ id: `sc-${s.id}`, kind: 'staffContract', label: `${name} — contract ends`, detail: s.roleTitle, date: s.contractEnd, zone: 'household', url: `#/staff/${s.profileId}`, ownerOnly: true });
  });

  return out.sort((a, b) => a.days - b.days);
}

export const dueExpiries = (db: DB, withinDays = 60): Expiry[] =>
  allExpiries(db).filter((e) => e.days <= withinDays);

/* ---------- assets and contracts ---------- */

export type ServiceState = 'none' | 'ok' | 'due' | 'overdue';

export function serviceState(a: Asset): { state: ServiceState; label: string } {
  if (!a.service.freqDays || !a.service.next) return { state: 'none', label: 'Not serviced' };
  const d = daysUntil(a.service.next);
  if (d < 0) return { state: 'overdue', label: `${Math.abs(d)} days overdue` };
  if (d <= 30) return { state: 'due', label: `Due in ${d} days` };
  return { state: 'ok', label: `Due in ${d} days` };
}

export function warrantyState(a: Asset): { state: 'none' | 'ok' | 'soon' | 'expired'; label: string } {
  if (!a.warranty.end) return { state: 'none', label: 'No warranty recorded' };
  const d = daysUntil(a.warranty.end);
  if (d < 0) return { state: 'expired', label: `Expired ${Math.abs(d)} days ago` };
  if (d <= 60) return { state: 'soon', label: `${d} days left` };
  return { state: 'ok', label: `${d} days left` };
}

export function contractState(c: ServiceContract): { state: ServiceState; label: string } {
  if (!c.next) return { state: 'none', label: 'No visit scheduled' };
  const d = daysUntil(c.next);
  if (d < 0) return { state: 'overdue', label: `${Math.abs(d)} days overdue` };
  if (d <= 14) return { state: 'due', label: d === 0 ? 'Today' : `In ${d} days` };
  return { state: 'ok', label: `In ${d} days` };
}

export function vehicleState(v: Vehicle): { state: ServiceState; label: string }[] {
  const out: { state: ServiceState; label: string }[] = [];
  const reg = daysUntil(v.registrationExpiry);
  const ins = daysUntil(v.insuranceExpiry);
  const svc = daysUntil(v.serviceNext);
  out.push({ state: reg < 0 ? 'overdue' : reg <= 30 ? 'due' : 'ok', label: reg < 0 ? `Registration expired ${Math.abs(reg)}d ago` : `Registration ${reg}d` });
  out.push({ state: ins < 0 ? 'overdue' : ins <= 30 ? 'due' : 'ok', label: ins < 0 ? `Insurance LAPSED ${Math.abs(ins)}d ago` : `Insurance ${ins}d` });
  out.push({ state: svc < 0 ? 'overdue' : svc <= 30 ? 'due' : 'ok', label: svc < 0 ? `Service ${Math.abs(svc)}d overdue` : `Service ${svc}d` });
  return out;
}

/* ---------- plants ---------- */

export function plantsDue(db: DB, date = today()) {
  return db.plants
    .filter((p) => p.active)
    .map((p) => ({
      plant: p,
      waterDue: p.waterFreqDays ? diffDays(p.waterLast, date) >= p.waterFreqDays : false,
      feedDue: p.feedFreqDays ? diffDays(p.feedLast, date) >= p.feedFreqDays : false,
    }))
    .filter((x) => x.waterDue || x.feedDue);
}

/* ---------- money ---------- */

/** `seeOwner` is the money.viewOwner capability, resolved by the caller. */
export function visibleTransactions(db: DB, seeOwner: boolean) {
  return seeOwner ? db.transactions : db.transactions.filter((t) => t.visibility === 'manager');
}

export function visibleRecurring(db: DB, seeOwner: boolean) {
  return seeOwner ? db.recurring : db.recurring.filter((r) => r.visibility === 'manager');
}

export interface BudgetLine {
  categoryId: ID;
  name: string;
  zone: Zone;
  budget: number;
  spent: number;
  pct: number;
}

export function budgetLines(db: DB, month = monthKey(today()), seeOwner = true): BudgetLine[] {
  const tx = visibleTransactions(db, seeOwner).filter((t) => monthKey(t.date) === month);
  return db.budgets
    .filter((b) => b.month === month)
    .map((b) => {
      const cat = db.expenseCategories.find((c) => c.id === b.categoryId);
      const spent = tx.filter((t) => t.categoryId === b.categoryId).reduce((s, t) => s + t.amount, 0);
      return {
        categoryId: b.categoryId,
        name: cat?.name ?? '—',
        zone: b.zone,
        budget: b.amount,
        spent,
        pct: b.amount ? Math.round((spent / b.amount) * 100) : 0,
      };
    })
    .sort((a, b) => b.pct - a.pct);
}

export function spendByZone(db: DB, month = monthKey(today()), seeOwner = true) {
  const tx = visibleTransactions(db, seeOwner).filter((t) => monthKey(t.date) === month);
  const out: Record<Zone, number> = { household: 0 };
  tx.forEach((t) => {
    out[t.zone] += t.amount;
  });
  return out;
}

export function billsDue(db: DB, withinDays = 14, seeOwner = true) {
  return visibleRecurring(db, seeOwner)
    .filter((r) => r.active && r.nextDue && daysUntil(r.nextDue) <= withinDays)
    .sort((a, b) => a.nextDue.localeCompare(b.nextDue));
}

export function pettyBalance(db: DB, holderId: ID): number {
  return db.pettyCash
    .filter((p) => p.holderId === holderId)
    .reduce((sum, p) => sum + (p.direction === 'float' ? p.amount : -p.amount), 0);
}

/* ============================================================
   The buy list and the shop.

   The shopping screen is the one the house opens most, so the
   arithmetic behind it sits here rather than inside the component:
   what to buy, which shelf it came off, what the trip has cost so
   far, and which budget that lands on. parseList is here too. A list
   photographed on paper is turned into rows by guessing, and guessing
   belongs in a pure function where it can be read and corrected
   rather than buried in a form.
   ============================================================ */

/** Case and spacing are the whole difference between paper and the database. */
const sameName = (a: string, b: string): boolean =>
  a.trim().toLowerCase() === b.trim().toLowerCase();

/** How much to buy of something under its level — back up to two weeks' use. */
export const suggestQty = (i: InventoryItem): number => Math.max(i.min * 2 - i.qty, i.min);

/** The tracked product a written line means, if the house tracks one. */
export const matchInventory = (db: DB, name: string): InventoryItem | undefined =>
  db.inventory.find((i) => i.active && sameName(i.name, name));

/** Below minimum and not on the list yet — the gap that bites. */
export function notOnList(db: DB): InventoryItem[] {
  const open = shoppingOpen(db);
  return belowMin(db).filter(
    (i) => !open.some((s) => (s.itemId ? s.itemId === i.id : sameName(s.name, i.name))),
  );
}

/** The product a line on the list refers to, by id first and name second. */
export const lineItem = (db: DB, line: ShoppingItem): InventoryItem | undefined =>
  line.itemId ? db.inventory.find((i) => i.id === line.itemId) : matchInventory(db, line.name);

export interface ShopGroup {
  id: ID;
  name: string;
  lines: ShoppingItem[];
}

/**
 * What one trip covers: everything still needed, plus whatever has
 * already gone in the basket today. A line disappearing the moment it is
 * ticked would leave no way to undo a mis-tap at the till and nothing to
 * total up, so the morning's ticks stay on screen until the day turns.
 */
export function tripLines(db: DB): ShoppingItem[] {
  const dayStart = new Date(`${today()}T00:00:00`).getTime();
  return db.shopping.filter((s) => s.status !== 'purchased' || (s.purchasedAt ?? 0) >= dayStart);
}

/**
 * The list in the order a shop is walked, which is the order the cupboard
 * is stacked in — one pass, no doubling back. Anything the house does not
 * track goes last, because it is the part of the trip that needs thinking
 * about rather than picking up.
 */
export function shopGroups(db: DB, lines: ShoppingItem[] = shoppingOpen(db)): ShopGroup[] {
  const byCat = new Map<ID, ShoppingItem[]>();
  const untracked: ShoppingItem[] = [];

  lines.forEach((line) => {
    const item = lineItem(db, line);
    if (!item) {
      untracked.push(line);
      return;
    }
    const found = byCat.get(item.categoryId);
    if (found) found.push(line);
    else byCat.set(item.categoryId, [line]);
  });

  const out: ShopGroup[] = db.inventoryCategories
    .filter((c) => byCat.has(c.id))
    .sort((a, b) => a.order - b.order)
    .map((c) => ({ id: c.id, name: c.name, lines: byCat.get(c.id) ?? [] }));

  if (untracked.length) out.push({ id: 'untracked', name: 'Not tracked in stock', lines: untracked });
  return out;
}

/** What the trip has cost so far. A blank price is "not priced yet", not free. */
export const tripSpend = (lines: ShoppingItem[]): number =>
  lines.reduce((sum, l) => sum + (l.cost ?? 0), 0);

/**
 * Which budget a bought thing is charged to.
 *
 * Stock categories and expense categories are two separate lists and
 * nobody is going to keep a mapping table between them in step by hand,
 * so the join is made once here, by name: the pantry is food, the cat has
 * a line of its own, and the rest of the house is cleaning and
 * consumables. Kitchen is deliberately not food — what is stocked under
 * it is washing-up liquid and foil, not dinner. Something nobody tracks
 * is food, because an untracked thing on a grocery run almost always is.
 */
export function budgetForCategory(db: DB, categoryId?: ID): ID | undefined {
  const expense = (re: RegExp) =>
    db.expenseCategories.find((c) => c.active && re.test(c.name.toLowerCase()))?.id;
  const food = () => expense(/grocer|food/) ?? expense(/other/);

  const name = db.inventoryCategories.find((c) => c.id === categoryId)?.name.toLowerCase();
  if (!name) return food();
  if (/\bcats?\b/.test(name)) return expense(/\bcats?\b/) ?? food();
  if (/pantry|food|grocer/.test(name)) return food();
  return expense(/clean|consumable/) ?? food();
}

export const budgetForItem = (db: DB, item?: InventoryItem): ID | undefined =>
  budgetForCategory(db, item?.categoryId);

export interface SupplySpend {
  lines: BudgetLine[];
  budget: number;
  spent: number;
  pct: number;
}

/**
 * This month's shopping budgets against what has actually gone out. The
 * lines are derived from the stock categories rather than listed by hand,
 * so a budget only appears here if the shopping can actually charge to it.
 */
export function supplySpend(db: DB, month = monthKey(today()), seeOwner = true): SupplySpend {
  const ids = new Set<ID>();
  db.inventoryCategories
    .filter((c) => c.active)
    .forEach((c) => {
      const id = budgetForCategory(db, c.id);
      if (id) ids.add(id);
    });

  const lines = budgetLines(db, month, seeOwner).filter((l) => ids.has(l.categoryId));
  const budget = lines.reduce((s, l) => s + l.budget, 0);
  const spent = lines.reduce((s, l) => s + l.spent, 0);
  return { lines, budget, spent, pct: budget ? Math.round((spent / budget) * 100) : 0 };
}

/* ---------- a written list, turned into rows ---------- */

export interface ParsedLine {
  name: string;
  /** Undefined where the line did not say — never guessed at 1. */
  qty?: number;
  unit?: string;
}

/* The units a household actually writes down. Anything not on this list
   is treated as part of the name, which is why "1st floor bulbs" does not
   come back as one "st". */
const UNITS = [
  'kg', 'kgs', 'g', 'gm', 'gms', 'gram', 'grams',
  'l', 'ltr', 'ltrs', 'litre', 'litres', 'ml',
  'pc', 'pcs', 'piece', 'pieces', 'pack', 'packs', 'packet', 'packets',
  'box', 'boxes', 'bottle', 'bottles', 'tin', 'tins', 'can', 'cans',
  'jar', 'jars', 'roll', 'rolls', 'bag', 'bags', 'sachet', 'sachets',
  'tube', 'tubes', 'bar', 'bars', 'dozen', 'set', 'sets',
  'unit', 'units', 'loaf', 'loaves', 'bunch', 'bunches', 'clove', 'cloves',
];

const N = '(?<qty>\\d+(?:\\.\\d+)?)';
/* Longest first, so "500 grams" is not read as 500 "g" followed by "rams". */
const U = `(?<unit>${[...UNITS].sort((a, b) => b.length - a.length).join('|')})`;
const NAME = '(?<name>.+?)';

/* Order matters. A quantity can be written at either end of a line, and
   only one reading of each line can win, so the leading forms are settled
   before the trailing ones are tried. */
const PATTERNS: RegExp[] = [
  // 2kg atta · 500 g atta · 2 kg of atta
  new RegExp(`^${N}\\s*${U}\\b\\s*(?:of\\s+|x\\s+|-\\s*)?(?<name>.+)$`, 'i'),
  // 5 x tinned tomatoes
  new RegExp(`^${N}\\s*(?:x|×|\\*)\\s*(?<name>.+)$`, 'i'),
  // 12 eggs
  new RegExp(`^${N}\\s+(?<name>[a-z].*)$`, 'i'),
  // Tinned tomatoes (6)
  new RegExp(`^${NAME}\\s*\\(\\s*${N}\\s*${U}?\\s*\\)$`, 'i'),
  // Toilet roll - 12 · Basmati rice — 5 kg
  new RegExp(`^${NAME}\\s*[-–—:]\\s*${N}\\s*${U}?$`, 'i'),
  // Basmati rice 5kg · Atta 2 kg
  new RegExp(`^${NAME}\\s+${N}\\s*${U}\\b$`, 'i'),
  // Vim bar x2
  new RegExp(`^${NAME}\\s*[x×]\\s*${N}$`, 'i'),
  // Eggs 12
  new RegExp(`^${NAME}\\s+${N}$`, 'i'),
];

const tidy = (s: string): string =>
  s.replace(/\s+/g, ' ').replace(/^[-–—•*:,.\s]+/, '').replace(/[-–—•*:,.\s]+$/, '').trim();

/**
 * One written line to one row. Returns null for a blank line or a bullet
 * with nothing after it, so a pasted list keeps its spacing without
 * producing rows nobody meant.
 */
export function parseListLine(raw: string): ParsedLine | null {
  // A leading bullet or a list number is decoration, not a quantity.
  const line = tidy(raw.replace(/^\s*(?:[-–—•*]\s+|\d+[.)]\s+)/, ''));
  if (!line) return null;

  for (const re of PATTERNS) {
    const found = re.exec(line)?.groups;
    if (!found) continue;
    const name = tidy(found.name ?? '');
    if (!name) continue;
    return {
      name,
      qty: found.qty ? Number(found.qty) : undefined,
      unit: found.unit ? found.unit.toLowerCase() : undefined,
    };
  }
  return { name: line };
}

/** A pasted list, one thing per line. Capped so a stray paste of a whole
    document does not turn into two hundred rows to read through. */
export function parseList(text: string, max = 200): ParsedLine[] {
  const out: ParsedLine[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const row = parseListLine(raw);
    if (row) out.push(row);
    if (out.length >= max) break;
  }
  return out;
}

/* ---------- deliveries and traffic ---------- */

export const uncollected = (db: DB) =>
  db.deliveries.filter((d) => d.status === 'received').sort((a, b) => a.date.localeCompare(b.date));

export const staleDeliveries = (db: DB) =>
  uncollected(db).filter((d) => daysUntil(d.date) <= -3);

export const visitorsOnSite = (db: DB) =>
  db.visitors.filter((v) => v.date === today() && !v.departed);

export const openVisitorEntries = (db: DB) =>
  db.visitors.filter((v) => !v.departed && v.date < today());

export const credentialsOutstanding = (db: DB) =>
  db.credentials.filter((c) => c.active && !c.returnedAt);

export const codesNeedingChange = (db: DB, afterDays = 90) =>
  db.credentials.filter((c) => c.active && c.kind === 'Code' && daysUntil(c.lastChanged) <= -afterDays);

/* ---------- occasions ---------- */

export const activeGuest = (db: DB) =>
  db.guests
    .filter((g) => g.status !== 'cancelled' && g.departure >= today())
    .sort((a, b) => a.arrival.localeCompare(b.arrival))[0];

export const upcomingEvents = (db: DB) =>
  db.events
    .filter((e) => e.status !== 'cancelled' && e.date >= today())
    .sort((a, b) => a.date.localeCompare(b.date));

export const activeVacation = (db: DB) =>
  db.vacations
    .filter((v) => v.status !== 'cancelled' && v.return >= today())
    .sort((a, b) => a.depart.localeCompare(b.depart))[0];

export function occasionPct(tasks: { done: boolean }[]): number {
  if (!tasks.length) return 0;
  return Math.round((tasks.filter((t) => t.done).length / tasks.length) * 100);
}

/* ---------- notifications ---------- */

export const unreadFor = (db: DB, profileId: ID) =>
  db.notifications.filter((n) => n.profileId === profileId && !n.readAt);

export const quietDevices = (db: DB) =>
  db.pushSubs.filter((s) => !s.active || (s.lastSeen && daysUntil(new Date(s.lastSeen).toISOString().slice(0, 10)) < -14));

/* ---------- the day, split by person ---------- */

export interface PersonDay {
  profile: Profile;
  working: boolean;
  absent?: string;
  tasks: TaskInstance[];
  scheduledMinutes: number;
  shiftMinutes: number;
  done: number;
}

/* ---------- the alert centre: one query, everything ---------- */

export interface Alert {
  id: string;
  priority: IssuePriority;
  kind: string;
  title: string;
  detail: string;
  url: string;
  zone?: Zone;
  ownerOnly?: boolean;
}

/**
 * `sees` is resolved from capabilities by the caller. The alert list is
 * the one screen where getting visibility wrong leaks a salary, so it
 * takes the two answers explicitly rather than guessing from a role.
 */
export function allAlerts(db: DB, sees: { money: boolean; ownerOnly: boolean }): Alert[] {
  const out: Alert[] = [];
  const isOwner = sees.ownerOnly;
  const canSeeMoney = sees.money;

  urgentIssues(db).forEach((i) =>
    out.push({ id: `is-${i.id}`, priority: 'urgent', kind: 'Issue', title: i.title, detail: `${areaName(db, i.areaId)} · reported by ${profileName(db, i.reportedBy)}`, url: `#/issues/${i.id}`, zone: i.zone }),
  );

  unassignedIssues(db).forEach((i) =>
    out.push({ id: `un-${i.id}`, priority: i.priority === 'urgent' ? 'urgent' : 'high', kind: 'Unassigned', title: `Nobody has picked up: ${i.title}`, detail: `Reported by ${profileName(db, i.reportedBy)}`, url: `#/issues/${i.id}`, zone: i.zone }),
  );

  allExpiries(db)
    .filter((e) => e.days <= db.settings.alertLeadDays)
    .forEach((e) => {
      if (e.ownerOnly && !isOwner) return;
      out.push({
        id: e.id,
        priority: e.days < 0 ? 'urgent' : e.days <= 14 ? 'high' : 'normal',
        kind: e.kind === 'service' ? 'Service' : e.kind === 'warranty' ? 'Warranty' : 'Expiry',
        title: e.days < 0 ? `${e.label} — overdue by ${Math.abs(e.days)} days` : `${e.label} — ${e.days} days`,
        detail: e.detail,
        url: e.url,
        zone: e.zone,
        ownerOnly: e.ownerOnly,
      });
    });

  atZero(db).forEach((i) =>
    out.push({ id: `z-${i.id}`, priority: 'high', kind: 'Stock', title: `${i.name} is out`, detail: `Minimum ${i.min} ${i.unit}`, url: '#/inventory', zone: i.zone }),
  );

  const low = belowMin(db).filter((i) => i.qty > 0);
  if (low.length)
    out.push({ id: 'low-all', priority: 'normal', kind: 'Stock', title: `${low.length} items below minimum`, detail: low.slice(0, 4).map((i) => i.name).join(', ') + (low.length > 4 ? '…' : ''), url: '#/inventory' });

  if (canSeeMoney) {
    billsDue(db, 7, isOwner).forEach((b) =>
      out.push({ id: `bill-${b.id}`, priority: daysUntil(b.nextDue) < 0 ? 'urgent' : 'normal', kind: 'Bill', title: `${b.name} — ${daysUntil(b.nextDue) < 0 ? 'overdue' : `due in ${daysUntil(b.nextDue)} days`}`, detail: `AED ${b.amount.toLocaleString()}${b.autopay ? ' · autopay' : ' · manual'}`, url: '#/money/recurring', zone: b.zone }),
    );

    budgetLines(db, monthKey(today()), isOwner)
      .filter((l) => l.pct > 100)
      .forEach((l) =>
        out.push({ id: `bg-${l.categoryId}`, priority: 'normal', kind: 'Budget', title: `${l.name} is ${l.pct - 100}% over budget`, detail: `AED ${l.spent.toLocaleString()} of ${l.budget.toLocaleString()}`, url: '#/money', zone: l.zone }),
      );
  }

  const pend = awaitingApproval(db);
  if (pend.length && canSeeMoney)
    out.push({ id: 'meals', priority: 'normal', kind: 'Approval', title: `${pend.length} meal${pend.length > 1 ? 's' : ''} awaiting approval`, detail: pend.map((m) => m.name).join(' · '), url: '#/cooking' });

  staleDeliveries(db).forEach((d) =>
    out.push({ id: `dl-${d.id}`, priority: 'normal', kind: 'Delivery', title: `Parcel uncollected for ${Math.abs(daysUntil(d.date))} days`, detail: `${d.description} for ${d.forWhom}`, url: '#/people/deliveries', zone: d.zone }),
  );

  openVisitorEntries(db).forEach((v) =>
    out.push({ id: `vs-${v.id}`, priority: 'normal', kind: 'Visitors', title: `${v.name} was never signed out`, detail: `Arrived ${v.arrived} on ${v.date}`, url: '#/people/visitors', zone: v.zone }),
  );

  codesNeedingChange(db).forEach((c) =>
    out.push({ id: `cd-${c.id}`, priority: 'normal', kind: 'Access', title: `${c.label} — code overdue a change`, detail: `Last changed ${Math.abs(daysUntil(c.lastChanged))} days ago`, url: '#/people/access', zone: c.zone }),
  );

  // Coverage: an absence with only one other person able to cover.
  db.absences
    .filter((a) => a.to >= today() && daysUntil(a.from) <= 21)
    .forEach((a) =>
      out.push({ id: `ab-${a.id}`, priority: daysUntil(a.from) <= 7 ? 'high' : 'normal', kind: 'Coverage', title: `${profileName(db, a.staffId)} away from ${a.from}`, detail: `${a.type} · ${diffDays(a.from, a.to) + 1} days. Check cover is in place.`, url: '#/staff' }),
    );

  db.leave
    .filter((l) => l.status === 'requested')
    .forEach((l) =>
      out.push({ id: `lv-${l.id}`, priority: 'normal', kind: 'Leave', title: `${profileName(db, l.staffId)} requested ${l.days} days leave`, detail: `${l.from} to ${l.to} · awaiting approval`, url: '#/staff' }),
    );

  return out.sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]);
}

/* ---------- the weekly report ---------- */

export interface ReportRow {
  date: DateStr;
  pct: number;
  done: number;
  total: number;
}

export interface Report {
  from: DateStr;
  to: DateStr;
  /** Null until at least one day has finished — an unfinished day is never scored. */
  score: number | null;
  band: string;
  rows: ReportRow[];
  recordedDays: number;
  closedDays: number;
  byZone: Record<Zone, { done: number; total: number; pct: number }>;
}

export function buildReport(db: DB, from: DateStr, to: DateStr): Report {
  const rows: ReportRow[] = [];
  const byZone: Record<Zone, { done: number; total: number; pct: number }> = {
    household: { done: 0, total: 0, pct: 0 },
  };
  let cursor = from;
  let recorded = 0;
  let closed = 0;
  const t = today();

  while (cursor <= to) {
    const tasks = db.days[cursor];
    if (tasks?.length) {
      recorded++;
      const live = tasks.filter((x) => !x.off);
      const done = live.filter((x) => x.done).length;
      // Only finished days count toward the score.
      if (cursor < t) {
        closed++;
        rows.push({ date: cursor, done, total: live.length, pct: live.length ? Math.round((done / live.length) * 100) : 0 });
        live.forEach((x) => {
          byZone[x.zone].total++;
          if (x.done) byZone[x.zone].done++;
        });
      }
    }
    cursor = addDays(cursor, 1);
  }

  (Object.keys(byZone) as Zone[]).forEach((z) => {
    const b = byZone[z];
    b.pct = b.total ? Math.round((b.done / b.total) * 100) : 0;
  });

  const score = rows.length ? Math.round(rows.reduce((s, r) => s + r.pct, 0) / rows.length) : null;
  const band =
    score == null ? '' : score >= 95 ? 'Excellent' : score >= 88 ? 'Good' : score >= 78 ? 'Fair' : 'Needs attention';

  return { from, to, score, band, rows, recordedDays: recorded, closedDays: closed, byZone };
}
