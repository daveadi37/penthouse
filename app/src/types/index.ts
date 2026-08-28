/* ============================================================
   Domain model — apartment 3808 in types.
   Mirrors the Postgres schema in the build plan one-for-one, so
   swapping the local adapter for Supabase is a transport change,
   not a modelling change.
   ============================================================ */

import type { DivoLog, Observance, RunningSheet, ShrineCheck } from './prayer';

/* The running sheet is big enough to live in its own file, and is
   re-exported here so every module still imports types from '@/types'
   alone. prayer.ts deliberately declares its own ID/DateStr/TimeStr/
   Stamp aliases so this re-export cannot close a module cycle. */
export * from './prayer';

export type ID = string;
/** ISO date, `YYYY-MM-DD`. Never a Date object in stored data. */
export type DateStr = string;
/** 24h clock, `HH:MM`. */
export type TimeStr = string;
/** Epoch milliseconds. */
export type Stamp = number;

/* ---------- the spine: the zone, and roles as data ---------- */

/**
 * One zone. The office side was dropped on 2026-08-28 — this is a
 * household app now. The field is kept rather than deleted from thirty
 * interfaces: if a second premises ever comes back, widening this union
 * is the only change, and the compiler then finds every site that cares.
 */
export type Zone = 'household';
export const ZONES: Zone[] = ['household'];

/**
 * A role id. Roles are rows, not a compile-time union, because admins
 * and owners create and edit the hierarchy at runtime. The seeded ids
 * are 'owner', 'admin', 'manager', 'staff', 'helper' and 'family'; any
 * others are whatever the house has since invented.
 */
export type Role = ID;

/**
 * Capabilities are fixed in code, and roles are composed from them.
 * That is the line: the house invents roles, it does not invent powers.
 * Each one is enforced twice — here for what the screen offers, and in
 * Postgres by has_capability() for what the database will hand over.
 */
export const CAPABILITIES = [
  'day.view',
  'day.tick',
  'day.assign',
  'library.edit',
  'sheet.view',
  'sheet.edit',
  'sheet.check',
  'sheet.post',
  'issue.raise',
  'issue.viewAll',
  'issue.manage',
  'inventory.view',
  'inventory.edit',
  'cooking.view',
  'cooking.edit',
  'cooking.approve',
  'money.view',
  'money.viewOwner',
  'property.view',
  'property.edit',
  'register.view',
  'register.edit',
  'people.view',
  'people.manage',
  'occasions.view',
  'occasions.edit',
  'shrine.view',
  'shrine.log',
  'documents.view',
  'documents.viewOwner',
  'settings.edit',
  'roles.manage',
  'accounts.manage',
  'audit.view',
] as const;

export type Capability = (typeof CAPABILITIES)[number];

/** What each capability means, shown beside the tick in the role editor. */
export const CAPABILITY_LABELS: Record<Capability, string> = {
  'day.view': 'See the day and the checklist',
  'day.tick': 'Tick tasks off',
  'day.assign': 'Assign, reschedule and rebuild the day',
  'library.edit': 'Add and edit recurring tasks',
  'sheet.view': 'Read the running sheet',
  'sheet.edit': 'Fill the running sheet in',
  'sheet.check': 'Check the sheet before it goes out',
  'sheet.post': 'Mark the sheet posted to the group',
  'issue.raise': 'Report a fault or make a request',
  'issue.viewAll': 'See every issue, not only their own',
  'issue.manage': 'Assign, progress and close issues',
  'inventory.view': 'See stock levels',
  'inventory.edit': 'Count, adjust and reorder stock',
  'cooking.view': 'See the menu',
  'cooking.edit': 'Plan meals',
  'cooking.approve': 'Approve a menu',
  'money.view': 'See household spending',
  'money.viewOwner': 'See owner-only spending',
  'property.view': 'See assets, vehicles and contracts',
  'property.edit': 'Edit assets, vehicles and contracts',
  'register.view': 'See visitors, deliveries and keys',
  'register.edit': 'Log visitors, deliveries and keys',
  'people.view': 'See who works here',
  'people.manage': 'Staff records, visas, leave and reviews',
  'occasions.view': 'See guests and events',
  'occasions.edit': 'Plan guests and events',
  'shrine.view': 'See the shrine record',
  'shrine.log': 'Log the divo and the shrine checks',
  'documents.view': 'Open documents',
  'documents.viewOwner': 'Open owner-only documents',
  'settings.edit': 'Change how the house is set up',
  'roles.manage': 'Create and edit roles',
  'accounts.manage': 'Create logins and set passwords',
  'audit.view': 'Read the audit trail',
};

export interface RoleDef {
  id: ID;
  name: string;
  /** Higher outranks lower. A role may only be granted by someone above it. */
  rank: number;
  description: string;
  capabilities: Capability[];
  /**
   * People in this role do the work: they appear on the rota, tasks route
   * to them, and they turn up on the running sheet. An owner who also
   * cooks is still not staff.
   */
  works?: boolean;
  /**
   * Seeded roles cannot be deleted, because the seed data and the RLS
   * policies both name them. Their capability lists are still editable.
   */
  system?: boolean;
  active: boolean;
}

/**
 * What a staff member is for. Drives auto-routing of work.
 * `cook` is the two visiting cooks, paid per session and on site for two
 * hours — distinct from `cooking`, which is the everyday kitchen.
 * `priestcare` is Aditya: the priests, and the menu agreed with the cooks.
 */
export type StaffRole =
  | 'housekeeping'
  | 'cooking'
  | 'cook'
  | 'priestcare'
  | 'driver'
  | 'maintenance'
  | 'any';

export const STAFF_ROLES: StaffRole[] = [
  'housekeeping',
  'cooking',
  'cook',
  'priestcare',
  'driver',
  'maintenance',
  'any',
];

export interface Profile {
  id: ID;
  name: string;
  role: Role;
  /** Only meaningful for role === 'staff'. */
  staffRoles: StaffRole[];
  email: string;
  phone: string;
  initials: string;
  active: boolean;
  /**
   * Whether this person has a login at all. The two visiting cooks and
   * the priests appear on every sheet and never open the app.
   */
  canSignIn?: boolean;
  /** The Supabase auth user, once one exists. Empty until one is created. */
  authId?: string;
  /** Household members appear in laundry rotas and meal portions. */
  isHouseholdMember?: boolean;
}

/* ---------- premises ---------- */

export type AreaType =
  | 'bedroom'
  | 'bathroom'
  | 'kitchen'
  | 'living'
  | 'shrine'
  | 'prayer'
  | 'utility'
  | 'storage'
  | 'outdoor'
  | 'circulation';

export type AreaStatus = 'occupied' | 'guest' | 'unused' | 'active';

export interface Area {
  id: ID;
  name: string;
  type: AreaType;
  zone: Zone;
  floor: string;
  status: AreaStatus;
  /** 0 = not on a deep-clean cycle, 7 = weekly, 14 = fortnightly. */
  deepFreq: 0 | 7 | 14 | 30;
  deepDow: number;
  parity: 0 | 1;
  /** High-use bathrooms get an extra midday pass. */
  use?: 'high' | 'low';
  standard: string;
  active: boolean;
}

/* ---------- work: library and instances ---------- */

export type Freq =
  | 'daily'
  | 'weekly'
  | 'fortnightly'
  | 'monthly'
  | 'areaDeep'
  | 'weekdays';

export type ApplyScope = 'global' | 'areaType' | 'area' | 'zone';

export interface TaskCategory {
  id: ID;
  name: string;
  icon: string;
  order: number;
  zone: Zone | 'any';
  /** System categories are generated, not hand-listed. */
  system?: 'laundry' | 'cooking' | 'occasion' | 'plants' | 'contracts';
  active: boolean;
}

export interface LibraryTask {
  id: ID;
  categoryId: ID;
  text: string;
  apply: ApplyScope;
  areaType?: AreaType;
  areaId?: ID;
  zone: Zone | 'any';
  freq: Freq;
  dow: number;
  parity: 0 | 1;
  instructions: string;
  /** Auto-routing: whoever holds this staff role and is working today. */
  role: StaffRole;
  /** Optional clock time, inherited by the instance and freely moved. */
  defaultTime?: TimeStr;
  estMinutes: number;
  groupAs: string;
  /** Light tasks still run on a reduced schedule in unused rooms. */
  light: boolean;
  order: number;
  active: boolean;
}

export type TaskSource =
  | 'library'
  | 'adhoc'
  | 'occasion'
  | 'plant'
  | 'contract'
  | 'meal'
  | 'laundry';

export interface TaskInstance {
  id: ID;
  date: DateStr;
  libraryId?: ID;
  categoryId: ID;
  title: string;
  instructions?: string;
  areaId?: ID;
  areaName?: string;
  zone: Zone;
  role: StaffRole;
  assignedTo?: ID;
  scheduledAt?: TimeStr;
  estMinutes: number;
  groupAs?: string;
  done: boolean;
  doneBy?: ID;
  doneAt?: Stamp;
  note?: string;
  source: TaskSource;
  sourceRef?: string;
  /** Off means it fell on the assignee's day off and is not counted. */
  off?: boolean;
  order: number;
}

export interface Procedure {
  id: ID;
  title: string;
  category: string;
  zone: Zone | 'any';
  purpose: string;
  frequency: string;
  supplies: string;
  steps: string[];
  standard: string;
  watchFor: string;
  role: StaffRole;
  version: number;
  updatedAt: Stamp;
}

/* ---------- schedule ---------- */

export type AppointmentKind =
  | 'vendor'
  | 'meeting'
  | 'personal'
  | 'school'
  | 'delivery'
  | 'medical'
  | 'other';

export interface Appointment {
  id: ID;
  date: DateStr;
  start: TimeStr;
  end: TimeStr;
  title: string;
  kind: AppointmentKind;
  zone: Zone;
  areaId?: ID;
  vendorId?: ID;
  /** Staff member who must be present or prepare for it. */
  assignedTo?: ID;
  attendees: string;
  notes: string;
}

export interface Shift {
  id: ID;
  staffId: ID;
  /** Days of week worked, 0 = Sunday. */
  days: number[];
  start: TimeStr;
  end: TimeStr;
  dayOff: number;
}

export type AbsenceType = 'Day off' | 'Annual leave' | 'Sick' | 'Unpaid' | 'Public holiday';

export interface Absence {
  id: ID;
  staffId: ID;
  from: DateStr;
  to: DateStr;
  type: AbsenceType;
  notes: string;
}

export interface CoverageRule {
  id: ID;
  role: StaffRole;
  zone: Zone | 'any';
  coverStaffId: ID;
  notes: string;
}

/* ---------- issues: faults, flags and requests, unified ---------- */

export type IssueKind = 'fault' | 'condition' | 'request' | 'supply';
export type IssuePriority = 'urgent' | 'high' | 'normal' | 'low';
export type IssueStatus =
  | 'reported'
  | 'acknowledged'
  | 'assigned'
  | 'in_progress'
  | 'awaiting_vendor'
  | 'resolved'
  | 'closed';

export const ISSUE_STATUS_FLOW: IssueStatus[] = [
  'reported',
  'acknowledged',
  'assigned',
  'in_progress',
  'awaiting_vendor',
  'resolved',
  'closed',
];

export interface IssuePhoto {
  id: ID;
  /** Data URL locally; a storage path once the backend is wired. */
  path: string;
  at: Stamp;
  by: ID;
  caption?: string;
}

export interface IssueComment {
  id: ID;
  by: ID;
  at: Stamp;
  text: string;
}

export interface Issue {
  id: ID;
  kind: IssueKind;
  title: string;
  detail: string;
  areaId?: ID;
  zone: Zone;
  priority: IssuePriority;
  status: IssueStatus;
  reportedBy: ID;
  reportedAt: Stamp;
  assignedTo?: ID;
  vendorId?: ID;
  assetId?: ID;
  cost?: number;
  photos: IssuePhoto[];
  comments: IssueComment[];
  resolvedAt?: Stamp;
  resolution?: string;
}

export type IncidentType =
  | 'Damage'
  | 'Injury'
  | 'Security'
  | 'Water'
  | 'Electrical'
  | 'Fire'
  | 'Other';

export interface Incident {
  id: ID;
  date: DateStr;
  time: TimeStr;
  type: IncidentType;
  zone: Zone;
  areaId?: ID;
  description: string;
  people: string;
  actionTaken: string;
  reportedBy: ID;
  photos: IssuePhoto[];
  followUpIssueId?: ID;
}

/* ---------- supplies ---------- */

export interface InventoryCategory {
  id: ID;
  name: string;
  zone: Zone;
  order: number;
  active: boolean;
}

export interface InventoryItem {
  id: ID;
  name: string;
  categoryId: ID;
  zone: Zone;
  qty: number;
  min: number;
  unit: string;
  recurring: boolean;
  vendorId?: ID;
  notes: string;
  /** Brought for prayer — marked, and never used for consumption (R6). */
  prayerItem?: boolean;
  /** Shrine cloth, shrine sponge. Never meat, never chemicals (R7). */
  shrineOnly?: boolean;
  active: boolean;
}

export type MovementReason =
  | 'count'
  | 'used'
  | 'purchased'
  | 'wasted'
  | 'transferred'
  | 'adjustment';

export interface InventoryMovement {
  id: ID;
  itemId: ID;
  delta: number;
  reason: MovementReason;
  by: ID;
  at: Stamp;
  ref?: string;
}

export type ShoppingStatus = 'needed' | 'ordered' | 'purchased';

export interface ShoppingItem {
  id: ID;
  itemId?: ID;
  name: string;
  zone: Zone;
  qty: number;
  unit: string;
  status: ShoppingStatus;
  addedBy: ID;
  addedAt: Stamp;
  purchasedAt?: Stamp;
  cost?: number;
  vendorId?: ID;
  notes: string;
}

/* ---------- kitchen ---------- */

export type MealType = 'Breakfast' | 'Lunch' | 'Dinner';
export const MEAL_TYPES: MealType[] = ['Breakfast', 'Lunch', 'Dinner'];

export type MealStatus =
  | 'Draft'
  | 'Submitted'
  | 'Changes requested'
  | 'Approved'
  | 'Prepared'
  | 'Completed';

export const MEAL_STATUSES: MealStatus[] = [
  'Draft',
  'Submitted',
  'Changes requested',
  'Approved',
  'Prepared',
  'Completed',
];

export type Leftovers = 'None' | 'Small amount' | 'Planned leftovers';

export interface MealIngredient {
  id: ID;
  itemId?: ID;
  name: string;
  qty: number;
  unit: string;
}

export interface Meal {
  id: ID;
  date: DateStr;
  type: MealType;
  name: string;
  portions: number;
  serveAt: TimeStr;
  zone: Zone;
  ingredients: MealIngredient[];
  prep: string;
  cook: string;
  diet: string;
  leftovers: Leftovers;
  status: MealStatus;
  by: ID;
  at: Stamp;
  approvedBy?: ID;
  feedback: string;
}

export interface WasteEntry {
  id: ID;
  date: DateStr;
  mealId?: ID;
  description: string;
  reason: string;
  approxValue?: number;
  by: ID;
  at: Stamp;
}

export interface LaundrySlot {
  person: string;
  type: string;
}

export interface LaundryRota {
  /** Keyed by day of week, 0 = Sunday. */
  [dow: number]: LaundrySlot[];
}

/* ---------- property ---------- */

export const ASSET_CATS = [
  'Appliances',
  'Electronics',
  'Furniture',
  'Outdoor',
  'Lighting',
  'Soft furnishings',
  'Artwork',
  'Kitchen equipment',
  'Cleaning equipment',
  'Fixtures',
  'Other',
] as const;
export type AssetCat = (typeof ASSET_CATS)[number];

export interface ServiceLogEntry {
  id: ID;
  date: DateStr;
  vendorId?: ID;
  cost?: number;
  notes: string;
  documentId?: ID;
}

export interface Asset {
  id: ID;
  name: string;
  cat: AssetCat;
  sub: string;
  areaId?: ID;
  zone: Zone;
  brand: string;
  model: string;
  serial: string;
  qty: number;
  photo?: string;
  description: string;
  care: string;
  assignedTo?: ID;
  purchase: { date: DateStr; price?: number; vendorId?: ID; ref: string };
  warranty: { start: DateStr; end: DateStr; provider: string; notes: string };
  service: {
    freqDays: 0 | 90 | 180 | 365 | 730;
    last: DateStr;
    next: DateStr;
    vendorId?: ID;
    notes: string;
    history: ServiceLogEntry[];
  };
  replacement: { lifespanYears?: number; by: DateStr; budget?: number; notes: string };
  documentIds: ID[];
  active: boolean;
}

export type VehicleLogType = 'Fuel' | 'Service' | 'Repair' | 'Fine' | 'Toll' | 'Salik' | 'Other';

export interface VehicleLogEntry {
  id: ID;
  date: DateStr;
  type: VehicleLogType;
  odometer?: number;
  cost?: number;
  vendorId?: ID;
  notes: string;
}

export interface Vehicle {
  id: ID;
  name: string;
  make: string;
  model: string;
  year: string;
  plate: string;
  vin: string;
  zone: Zone;
  assignedTo?: ID;
  colour: string;
  odometer: number;
  registrationExpiry: DateStr;
  insuranceExpiry: DateStr;
  insuranceProvider: string;
  policyNo: string;
  serviceFreqDays: number;
  serviceFreqKm: number;
  serviceLast: DateStr;
  serviceLastKm: number;
  serviceNext: DateStr;
  notes: string;
  log: VehicleLogEntry[];
  documentIds: ID[];
  active: boolean;
}

export type ContractCat =
  | 'AC'
  | 'Water tank'
  | 'Pest control'
  | 'Pool'
  | 'Lift'
  | 'Fire safety'
  | 'Generator'
  | 'Cleaning'
  | 'Windows'
  | 'IT'
  | 'Other';

export interface ServiceContract {
  id: ID;
  name: string;
  cat: ContractCat;
  vendorId?: ID;
  zone: Zone;
  areaId?: ID;
  freqDays: number;
  last: DateStr;
  next: DateStr;
  costPerVisit?: number;
  contractStart: DateStr;
  contractEnd: DateStr;
  documentIds: ID[];
  notes: string;
  active: boolean;
}

export interface Plant {
  id: ID;
  name: string;
  species: string;
  areaId?: ID;
  zone: Zone;
  waterFreqDays: number;
  waterLast: DateStr;
  feedFreqDays: number;
  feedLast: DateStr;
  light: string;
  care: string;
  photo?: string;
  active: boolean;
}

/* ---------- people and access ---------- */

export const CONTACT_CATS = [
  'Emergency',
  'Building',
  'Medical',
  'Family',
  'School',
  'Vet',
  'Government',
  'Other',
] as const;
export type ContactCat = (typeof CONTACT_CATS)[number];

export interface Contact {
  id: ID;
  name: string;
  org: string;
  cat: ContactCat;
  phone: string;
  altPhone: string;
  email: string;
  notes: string;
  isEmergency: boolean;
  order: number;
  active: boolean;
}

export const VENDOR_CATS = [
  'Cleaning',
  'Rugs',
  'Upholstery',
  'Pest control',
  'AC',
  'Plumbing',
  'Electrical',
  'Pool',
  'Handyman',
  'Appliances',
  'IT',
  'Stationery',
  'Grocery',
  'Laundry',
  'Vehicle',
  'Other',
] as const;
export type VendorCat = (typeof VENDOR_CATS)[number];

export interface Vendor {
  id: ID;
  name: string;
  cat: VendorCat;
  contactName: string;
  phone: string;
  email: string;
  web: string;
  cadence: string;
  nextVisit: DateStr;
  rating: 0 | 1 | 2 | 3 | 4 | 5;
  accountRef: string;
  notes: string;
  active: boolean;
}

export interface Visitor {
  id: ID;
  name: string;
  org: string;
  visiting: string;
  purpose: string;
  zone: Zone;
  date: DateStr;
  arrived: TimeStr;
  departed?: TimeStr;
  badge: string;
  loggedBy: ID;
  notes: string;
}

export interface ContractorVisit {
  id: ID;
  vendorId?: ID;
  vendorName: string;
  purpose: string;
  areaId?: ID;
  zone: Zone;
  date: DateStr;
  scheduled: TimeStr;
  arrived?: TimeStr;
  departed?: TimeStr;
  escortedBy?: ID;
  issueId?: ID;
  contractId?: ID;
  notes: string;
}

export type DeliveryStatus = 'received' | 'collected' | 'returned';

export interface Delivery {
  id: ID;
  courier: string;
  tracking: string;
  forWhom: string;
  forProfileId?: ID;
  description: string;
  zone: Zone;
  date: DateStr;
  arrived: TimeStr;
  receivedBy: ID;
  status: DeliveryStatus;
  collectedAt?: Stamp;
  collectedBy?: string;
  photo?: string;
  notes: string;
}

export type CredentialKind = 'Key' | 'Fob' | 'Code' | 'Remote' | 'Card';

export interface AccessCredential {
  id: ID;
  kind: CredentialKind;
  label: string;
  areaId?: ID;
  zone: Zone;
  /** Where the actual value is kept. Never the value itself. */
  heldWhere: string;
  issuedTo?: ID;
  issuedToName: string;
  issuedAt: DateStr;
  returnedAt?: DateStr;
  lastChanged: DateStr;
  copies: number;
  notes: string;
  active: boolean;
}

/* ---------- money ---------- */

export type ExpenseKind =
  | 'household'
  | 'staff'
  | 'vehicle'
  | 'maintenance'
  | 'supplies'
  | 'utilities'
  | 'other';

export interface ExpenseCategory {
  id: ID;
  name: string;
  kind: ExpenseKind;
  zone: Zone;
  order: number;
  active: boolean;
}

export interface Budget {
  id: ID;
  /** `YYYY-MM`. */
  month: string;
  categoryId: ID;
  zone: Zone;
  amount: number;
  notes: string;
}

export type Visibility = 'owner' | 'manager';

export type PaymentMethod =
  | 'Card'
  | 'Bank transfer'
  | 'Cash'
  | 'Petty cash'
  | 'Direct debit'
  | 'Cheque';

export interface Transaction {
  id: ID;
  date: DateStr;
  description: string;
  amount: number;
  categoryId: ID;
  zone: Zone;
  vendorId?: ID;
  method: PaymentMethod;
  ref: string;
  receiptId?: ID;
  enteredBy: ID;
  visibility: Visibility;
  linkedType?: 'issue' | 'asset' | 'vehicle' | 'contract' | 'shopping' | 'staff';
  linkedId?: ID;
  notes: string;
}

export type ChargeKind = 'bill' | 'subscription';
export type ChargeCadence = 'monthly' | 'quarterly' | 'biannual' | 'annual' | 'weekly';

export interface RecurringCharge {
  id: ID;
  name: string;
  kind: ChargeKind;
  vendorId?: ID;
  categoryId: ID;
  zone: Zone;
  amount: number;
  cadence: ChargeCadence;
  nextDue: DateStr;
  autopay: boolean;
  accountRef: string;
  visibility: Visibility;
  notes: string;
  active: boolean;
}

export type PettyDirection = 'float' | 'spend' | 'return';

export interface PettyCashEntry {
  id: ID;
  date: DateStr;
  direction: PettyDirection;
  amount: number;
  holderId: ID;
  purpose: string;
  categoryId?: ID;
  zone: Zone;
  receiptId?: ID;
  approvedBy?: ID;
  notes: string;
}

export const DOC_CATS = [
  'Tenancy',
  'Insurance',
  'Warranty',
  'Permit',
  'Visa',
  'Passport',
  'Contract',
  'Manual',
  'Invoice',
  'Receipt',
  'Certificate',
  'Payslip',
  'Other',
] as const;
export type DocCat = (typeof DOC_CATS)[number];

export interface DocumentRec {
  id: ID;
  title: string;
  cat: DocCat;
  /** Data URL locally; a storage path once the backend is wired. */
  path?: string;
  filename: string;
  mime: string;
  sizeKb: number;
  zone: Zone;
  linkedType?: 'asset' | 'vehicle' | 'contract' | 'staff' | 'issue' | 'transaction';
  linkedId?: ID;
  issueDate: DateStr;
  expiryDate: DateStr;
  reminderDays: number;
  visibility: Visibility;
  uploadedBy: ID;
  uploadedAt: Stamp;
  notes: string;
}

/* ---------- employment ---------- */

export interface StaffDetails {
  id: ID;
  profileId: ID;
  roleTitle: string;
  contractStart: DateStr;
  contractEnd: DateStr;
  visaExpiry: DateStr;
  passportExpiry: DateStr;
  medicalExpiry: DateStr;
  leaveEntitlementDays: number;
  payDay: number;
  salary?: number;
  livesIn: boolean;
  emergencyContact: string;
  emergencyPhone: string;
  notes: string;
}

export interface AttendanceEntry {
  id: ID;
  staffId: ID;
  date: DateStr;
  clockIn?: TimeStr;
  clockOut?: TimeStr;
  hours?: number;
  source: 'manual' | 'derived';
  notes: string;
}

export type LeaveStatus = 'requested' | 'approved' | 'declined' | 'taken';

export interface LeaveRequest {
  id: ID;
  staffId: ID;
  from: DateStr;
  to: DateStr;
  type: AbsenceType;
  days: number;
  status: LeaveStatus;
  requestedAt: Stamp;
  approvedBy?: ID;
  notes: string;
}

export interface StaffReview {
  id: ID;
  staffId: ID;
  periodStart: DateStr;
  periodEnd: DateStr;
  completionPct?: number;
  strengths: string;
  development: string;
  notes: string;
  by: ID;
  at: Stamp;
}

/* ---------- occasions ---------- */

export type OffsetUnit = 'days' | 'hours' | 'minutes';

export interface TaskOffset {
  n: number;
  unit: OffsetUnit;
  dir: 'before' | 'after';
}

export interface OccasionTask {
  id: ID;
  text: string;
  offset: TaskOffset;
  role: StaffRole;
  estMinutes: number;
  done: boolean;
  doneBy?: ID;
  doneAt?: Stamp;
  order: number;
}

export type OccasionStatus = 'planned' | 'active' | 'complete' | 'cancelled';

export interface Guest {
  id: ID;
  name: string;
  arrival: DateStr;
  arrivalTime: TimeStr;
  departure: DateStr;
  areaId?: ID;
  notes: string;
  dietary: string;
  status: OccasionStatus;
  tasks: OccasionTask[];
}

export interface HouseEvent {
  id: ID;
  name: string;
  date: DateStr;
  start: TimeStr;
  end: TimeStr;
  areaId?: ID;
  zone: Zone;
  headcount: number;
  notes: string;
  status: OccasionStatus;
  tasks: OccasionTask[];
}

export interface OccasionTemplate {
  id: ID;
  kind: 'guest' | 'event';
  name: string;
  tasks: Omit<OccasionTask, 'done' | 'doneBy' | 'doneAt'>[];
}

export interface Vacation {
  id: ID;
  depart: DateStr;
  return: DateStr;
  notes: string;
  status: OccasionStatus;
  preTasks: OccasionTask[];
  duringTasks: OccasionTask[];
  postTasks: OccasionTask[];
}

/* ---------- notifications ---------- */

export type NotifKind =
  | 'day_ready'
  | 'task_assigned'
  | 'task_reminder'
  | 'issue_raised'
  | 'issue_update'
  | 'meal_approval'
  | 'stock_low'
  | 'bill_due'
  | 'expiry'
  | 'coverage_gap'
  | 'delivery'
  | 'incident';

export type NotifClass = 'assigned' | 'reminder' | 'escalation' | 'response';

export const NOTIF_CLASS_OF: Record<NotifKind, NotifClass> = {
  day_ready: 'assigned',
  task_assigned: 'assigned',
  task_reminder: 'reminder',
  issue_raised: 'escalation',
  issue_update: 'response',
  meal_approval: 'escalation',
  stock_low: 'escalation',
  bill_due: 'escalation',
  expiry: 'escalation',
  coverage_gap: 'escalation',
  delivery: 'response',
  incident: 'escalation',
};

export interface Notification {
  id: ID;
  profileId: ID;
  kind: NotifKind;
  title: string;
  body: string;
  /** Deep link into the app, e.g. `#/issues/i12`. */
  url: string;
  priority: IssuePriority;
  createdAt: Stamp;
  sentAt?: Stamp;
  readAt?: Stamp;
}

export interface PushSubscriptionRec {
  id: ID;
  profileId: ID;
  device: string;
  endpoint: string;
  createdAt: Stamp;
  lastSeen: Stamp;
  lastDelivery?: Stamp;
  active: boolean;
}

export interface NotificationPref {
  profileId: ID;
  /** Which classes this person receives. */
  classes: Record<NotifClass, boolean>;
  quietFrom: TimeStr;
  quietTo: TimeStr;
}

/* ---------- audit ---------- */

export interface AuditEntry {
  id: ID;
  at: Stamp;
  actorId: ID;
  action: string;
  entity: string;
  entityId: ID;
  summary: string;
}

/* ---------- settings ---------- */

export interface Settings {
  house: string;
  /** Printed on every running sheet. */
  address: string;
  /** Where the sheet is posted each morning. */
  whatsappGroup: string;
  /** The sheet is late after this. */
  sheetPostBy: TimeStr;
  /** Fixed on the printed sheet — Earl checks it before it goes out. */
  checkedByName: string;
  currency: string;
  locale: string;
  mealTimes: Record<string, TimeStr>;
  portionDefault: number;
  /** Which days count as working days, and the span of the household day. */
  workingWeek: { days: number[]; start: TimeStr; end: TimeStr };
  /** The observance that owns the running sheet. Outside it, Today leads. */
  observanceWindow?: { from: DateStr; to: DateStr };
  alertLeadDays: number;
  laundry: LaundryRota;
  laundryStages: string[];
  unusedDows: number[];
  planStart: TimeStr;
  planEnd: TimeStr;
  /** Fortnightly parity is measured from here. */
  parityEpoch: DateStr;
}

/* ---------- the whole database ---------- */

export interface DB {
  version: number;
  settings: Settings;
  roles: RoleDef[];
  profiles: Profile[];
  areas: Area[];
  taskCategories: TaskCategory[];
  library: LibraryTask[];
  /** Materialised days, keyed by date. */
  days: Record<DateStr, TaskInstance[]>;
  /** The running sheets, one per date. The spine of the prayer day. */
  sheets: Record<DateStr, RunningSheet>;
  observances: Observance[];
  divoLog: DivoLog[];
  shrineChecks: ShrineCheck[];
  procedures: Procedure[];
  appointments: Appointment[];
  shifts: Shift[];
  absences: Absence[];
  coverage: CoverageRule[];
  issues: Issue[];
  incidents: Incident[];
  inventoryCategories: InventoryCategory[];
  inventory: InventoryItem[];
  movements: InventoryMovement[];
  shopping: ShoppingItem[];
  meals: Meal[];
  waste: WasteEntry[];
  assets: Asset[];
  vehicles: Vehicle[];
  contracts: ServiceContract[];
  plants: Plant[];
  contacts: Contact[];
  vendors: Vendor[];
  visitors: Visitor[];
  contractorVisits: ContractorVisit[];
  deliveries: Delivery[];
  credentials: AccessCredential[];
  expenseCategories: ExpenseCategory[];
  budgets: Budget[];
  transactions: Transaction[];
  recurring: RecurringCharge[];
  pettyCash: PettyCashEntry[];
  documents: DocumentRec[];
  staffDetails: StaffDetails[];
  attendance: AttendanceEntry[];
  leave: LeaveRequest[];
  reviews: StaffReview[];
  guests: Guest[];
  events: HouseEvent[];
  templates: OccasionTemplate[];
  vacations: Vacation[];
  notifications: Notification[];
  pushSubs: PushSubscriptionRec[];
  notifPrefs: NotificationPref[];
  audit: AuditEntry[];
}
