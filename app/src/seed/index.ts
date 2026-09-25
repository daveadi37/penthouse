import type { DB } from '@/types';
import { SEED_AREAS, SEED_SETTINGS } from './premises';
import { SEED_ROLES } from './roles';
import {
  SEED_ABSENCES,
  SEED_ATTENDANCE,
  SEED_COVERAGE,
  SEED_LEAVE,
  SEED_PROFILES,
  SEED_REVIEWS,
  SEED_SHIFTS,
  SEED_STAFF_DETAILS,
} from './people';
import { SEED_CATEGORIES, SEED_LIBRARY, SEED_PROCEDURES } from './work';
import { SEED_CHAT } from './chat';
import {
  SEED_INVENTORY,
  SEED_INV_CATEGORIES,
  SEED_MEALS,
  SEED_MOVEMENTS,
  SEED_SHOPPING,
  SEED_WASTE,
} from './supplies';
import { SEED_ASSETS, SEED_CONTRACTS, SEED_PLANTS, SEED_VEHICLES } from './property';
import {
  SEED_CONTACTS,
  SEED_CONTRACTOR_VISITS,
  SEED_CREDENTIALS,
  SEED_DELIVERIES,
  SEED_INCIDENTS,
  SEED_VENDORS,
  SEED_VISITORS,
} from './network';
import {
  SEED_BUDGETS,
  SEED_DOCUMENTS,
  SEED_EXPENSE_CATEGORIES,
  SEED_PETTY,
  SEED_RECURRING,
  SEED_TRANSACTIONS,
} from './money';
import {
  SEED_EVENTS,
  SEED_GUESTS,
  SEED_TEMPLATES,
  SEED_VACATIONS,
} from './occasions';
import {
  SEED_APPOINTMENTS,
  SEED_ISSUES,
  SEED_NOTIFICATIONS,
  SEED_NOTIF_PREFS,
  SEED_PUSH_SUBS,
} from './live';

/* Bumped to 4 on 2026-09-23: the observance is over and its whole domain
   is gone, and the house chat is new. The bump is not cosmetic — a browser
   holding version 3 keeps its old roles array, so chat.view is missing
   from every role and the chat is simply invisible with no error to
   explain it. Version 3 is discarded rather than migrated, as version 2
   was when the office side came out.

   5 the same day: the seed still carried a salary and a residence visa
   for a member of staff who has left. The visa outlives the person — it
   has an expiry and a reminder, so a device holding version 4 would go on
   raising an alert about someone the house no longer employs. */
export const DB_VERSION = 5;

/* ============================================================
   The empty house.

   What the store starts from when a backend is configured: the shape
   of a DB with nothing in it, filled by tier 1 and tier 2 before the
   first screen is drawn.

   It exists so that a real database is never mixed with seeded rows.
   Starting from seedDB() and letting the reads overwrite it looks
   harmless and is not — every slice the reads do not cover keeps its
   invented contents, so the Register lists assets that are not in the
   flat and Reports scores three weeks of ticks that never happened.
   An empty screen against a real database is honest; a populated one
   is not.
   ============================================================ */
export function emptyDB(): DB {
  return {
    ...seedDB(),
    settings: {
      house: '',
      address: '',
      // Matching the column defaults in the settings table, so nothing
      // here contradicts what the database will send a moment later.
      currency: 'AED',
      locale: 'en-GB',
      mealTimes: {},
      portionDefault: 4,
      workingWeek: { days: [], start: '09:00', end: '18:00' },
      alertLeadDays: 30,
      laundry: {},
      laundryStages: [],
      unusedDows: [],
      planStart: '06:00',
      planEnd: '22:00',
      // Replaced by the real epoch in tier 1. Fortnightly parity is
      // meaningless until it lands, and no room is drawn before then.
      parityEpoch: '1970-01-01',
    },
    roles: [],
    profiles: [],
    areas: [],
    taskCategories: [],
    library: [],
    days: {},
    procedures: [],
    appointments: [],
    shifts: [],
    absences: [],
    coverage: [],
    issues: [],
    incidents: [],
    chat: [],
    inventoryCategories: [],
    inventory: [],
    movements: [],
    shopping: [],
    meals: [],
    waste: [],
    assets: [],
    vehicles: [],
    contracts: [],
    plants: [],
    contacts: [],
    vendors: [],
    visitors: [],
    contractorVisits: [],
    deliveries: [],
    credentials: [],
    expenseCategories: [],
    budgets: [],
    transactions: [],
    recurring: [],
    pettyCash: [],
    documents: [],
    staffDetails: [],
    attendance: [],
    leave: [],
    reviews: [],
    guests: [],
    events: [],
    templates: [],
    vacations: [],
    notifications: [],
    pushSubs: [],
    notifPrefs: [],
    audit: [],
  };
}

export function seedDB(): DB {
  return {
    version: DB_VERSION,
    settings: SEED_SETTINGS,
    roles: SEED_ROLES,
    profiles: SEED_PROFILES,
    areas: SEED_AREAS,
    taskCategories: SEED_CATEGORIES,
    library: SEED_LIBRARY,
    days: {},
    procedures: SEED_PROCEDURES,
    appointments: SEED_APPOINTMENTS,
    shifts: SEED_SHIFTS,
    absences: SEED_ABSENCES,
    coverage: SEED_COVERAGE,
    issues: SEED_ISSUES,
    incidents: SEED_INCIDENTS,
    chat: SEED_CHAT,
    inventoryCategories: SEED_INV_CATEGORIES,
    inventory: SEED_INVENTORY,
    movements: SEED_MOVEMENTS,
    shopping: SEED_SHOPPING,
    meals: SEED_MEALS,
    waste: SEED_WASTE,
    assets: SEED_ASSETS,
    vehicles: SEED_VEHICLES,
    contracts: SEED_CONTRACTS,
    plants: SEED_PLANTS,
    contacts: SEED_CONTACTS,
    vendors: SEED_VENDORS,
    visitors: SEED_VISITORS,
    contractorVisits: SEED_CONTRACTOR_VISITS,
    deliveries: SEED_DELIVERIES,
    credentials: SEED_CREDENTIALS,
    expenseCategories: SEED_EXPENSE_CATEGORIES,
    budgets: SEED_BUDGETS,
    transactions: SEED_TRANSACTIONS,
    recurring: SEED_RECURRING,
    pettyCash: SEED_PETTY,
    documents: SEED_DOCUMENTS,
    staffDetails: SEED_STAFF_DETAILS,
    attendance: SEED_ATTENDANCE,
    leave: SEED_LEAVE,
    reviews: SEED_REVIEWS,
    guests: SEED_GUESTS,
    events: SEED_EVENTS,
    templates: SEED_TEMPLATES,
    vacations: SEED_VACATIONS,
    notifications: SEED_NOTIFICATIONS,
    pushSubs: SEED_PUSH_SUBS,
    notifPrefs: SEED_NOTIF_PREFS,
    audit: [],
  };
}
