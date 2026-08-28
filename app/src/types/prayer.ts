/* ============================================================
   The daily prayer running sheet — apartment 3808.

   Modelled from the two source documents rather than from the app's
   task library. The sheet is one printed page that gets posted to a
   WhatsApp group each morning, so it is stored whole and per date:
   its roster, its order of the day and its 31 checks belong to that
   day's sheet, not to a global schedule. Decomposing it into task
   instances would lose the thing the house actually uses.
   ============================================================ */

/* Redeclared rather than imported from './index', because index.ts
   re-exports this file and importing back would close a module cycle. */
type ID = string;
type DateStr = string;
type TimeStr = string;
type Stamp = number;

/* ---------- the sheet's life ---------- */

/**
 * `draft` while it is being filled in, `checked` once Earl has read it,
 * `posted` once it has gone to the group. Posting is gated on the
 * footer rule: never with the prayer start time or the meals count blank.
 */
export type RunningSheetStatus = 'draft' | 'checked' | 'posted';

/* ---------- section 1: who is working today ---------- */

export interface SheetRoleRow {
  id: ID;
  /** Set where the row is a real account; blank for Priests and one-offs. */
  personId?: ID;
  who: string;
  job: string;
  /** Free text — 'Lives in — on duty until close-down', 'As directed', '—'. */
  hours: string;
  duties: string;
  order: number;
}

/* ---------- section 2: order of the day ---------- */

export interface OrderRow {
  id: ID;
  /**
   * Free text, and often not a clock time — 'Morning', 'By 15:45',
   * 'During prayers', 'Straight after aarti', 'After the meal',
   * 'Before bed' are all valid on the real sheet.
   */
  timeLabel: string;
  /** Optional HH:MM, used only for ordering on a timeline. */
  sortAt?: TimeStr;
  what: string;
  /** Free text — the sheet writes 'Reza / Aditya / Earl / Rosie'. */
  who: string;
  order: number;
  done: boolean;
  doneBy?: ID;
  doneAt?: Stamp;
}

/* ---------- section 3: menu ---------- */

export interface MenuRow {
  id: ID;
  dish: string;
  whoMakes: string;
  /** Free text — the source sheet leaves it blank as often as not. */
  howMany: string;
  notes: string;
  order: number;
}

/* ---------- section 4: shopping list ---------- */

export type StockState = 'yes' | 'no' | 'partial' | 'unknown';

export interface ShoppingRow {
  id: ID;
  item: string;
  /** Multi-line on the real sheet — '2L low-fat fresh milk' then '1kg yoghurt'. */
  howMuch: string;
  inStock: StockState;
  whoBuys: string;
  notes?: string;
  order: number;
}

/* ---------- section 5: guests ---------- */

export interface SheetGuestRow {
  id: ID;
  name: string;
  /** Free text — the source sheet uses '-' when nobody knows yet. */
  arriving: string;
  /** What they cannot eat, and where they sit. */
  notes: string;
  order: number;
}

/* ---------- section 6: the 31 daily checks ---------- */

export interface CheckItem {
  id: ID;
  text: string;
  done: boolean;
  doneBy?: ID;
  doneAt?: Stamp;
}

/** Four groups on every sheet: 7 shrine, 8 prayer set-up, 7 house, 9 close-down. */
export interface CheckGroup {
  id: ID;
  title: string;
  items: CheckItem[];
}

/* ---------- what happens during the prayers ---------- */

/** Two or three each day. Water goes round at every one of them. */
export interface PrayerBreak {
  id: ID;
  startedAt: Stamp;
  endedAt?: Stamp;
  waterServed: boolean;
  servedBy?: ID;
  notes?: string;
}

/** The guest toilet, every 20 minutes while the prayers run. */
export interface ToiletCheck {
  id: ID;
  at: Stamp;
  by: ID;
  restocked: boolean;
  clean: boolean;
  notes?: string;
}

export interface SheetPhoto {
  id: ID;
  kind: 'setup' | 'clearup';
  /** Data URL locally; a storage path once the backend is wired. */
  path: string;
  at: Stamp;
  by: ID;
  postedToGroup: boolean;
}

/* ---------- the sheet ---------- */

export interface RunningSheet {
  id: ID;
  date: DateStr;
  /** '9th day of the Prayer' — the header line, as printed. */
  occasion: string;
  /** Which day of the observance this is, where one is running. */
  occasionDayNo?: number;
  /** Number of meals to lay. Blank blocks posting. */
  meals?: number;
  guests?: number;
  /** Blank blocks posting. */
  prayersStart?: TimeStr;
  /** Planned finish, as printed on the sheet. */
  prayersEnd?: TimeStr;
  /** When they actually finished — this is what Marvin needs for the breads. */
  actualPrayersEnd?: TimeStr;
  /** 'Dinner' on the 21 August sheet; the blank template says only 'Menu'. */
  sitting: string;
  status: RunningSheetStatus;
  roster: SheetRoleRow[];
  order: OrderRow[];
  menu: MenuRow[];
  shopping: ShoppingRow[];
  sheetGuests: SheetGuestRow[];
  checks: CheckGroup[];
  breaks: PrayerBreak[];
  toiletChecks: ToiletCheck[];
  photos: SheetPhoto[];
  /** Names, not ids — these two lines are printed on the page. */
  preparedBy?: string;
  preparedAt?: Stamp;
  checkedBy?: string;
  checkedAt?: Stamp;
  postedAt?: Stamp;
  notes: string;
}

/* ---------- the shrine ---------- */

export interface DivoLog {
  id: ID;
  at: Stamp;
  by: ID;
  action: 'lit' | 'topped' | 'checked' | 'extinguished';
  oilLevel?: 'full' | 'half' | 'low' | 'empty';
  notes?: string;
}

/** One a day. The seven shrine checks, kept as a record rather than a tick. */
export interface ShrineCheck {
  id: ID;
  date: DateStr;
  by: ID;
  at: Stamp;
  dusted: boolean;
  statuesUntouched: boolean;
  ashCleared: boolean;
  areaClear: boolean;
  notes?: string;
}

/* ---------- the observance ---------- */

/**
 * A multi-day Prayer. Day N of the observance is what gives the sheet
 * its occasion line — '9th day of the Prayer'.
 */
export interface Observance {
  id: ID;
  name: string;
  startDate: DateStr;
  endDate: DateStr;
  dayCount: number;
  notes: string;
  active: boolean;
}
