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
import {
  SEED_DIVO_LOG,
  SEED_OBSERVANCE,
  SEED_SHEETS,
  SEED_SHRINE_CHECKS,
} from './prayer';
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

/* Bumped to 3 on 2026-08-28: the office side came out and roles became
   rows rather than a fixed word. A stored database from version 2 has
   office areas, office people and a 'requester' role in it, none of
   which mean anything now, so it is discarded rather than migrated. */
export const DB_VERSION = 3;

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
    sheets: { ...SEED_SHEETS },
    observances: [SEED_OBSERVANCE],
    divoLog: SEED_DIVO_LOG,
    shrineChecks: SEED_SHRINE_CHECKS,
    procedures: SEED_PROCEDURES,
    appointments: SEED_APPOINTMENTS,
    shifts: SEED_SHIFTS,
    absences: SEED_ABSENCES,
    coverage: SEED_COVERAGE,
    issues: SEED_ISSUES,
    incidents: SEED_INCIDENTS,
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
