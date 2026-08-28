import type {
  Budget,
  DocumentRec,
  ExpenseCategory,
  PettyCashEntry,
  RecurringCharge,
  Transaction,
} from '@/types';
import { addDays, monthKey, today } from '@/lib/date';
import { uid } from '@/lib/id';

const t = today();
const thisMonth = monthKey(t);

export const SEED_EXPENSE_CATEGORIES: ExpenseCategory[] = [
  { id: 'ec-groc', name: 'Groceries & food', kind: 'household', zone: 'household', order: 1, active: true },
  { id: 'ec-hclean', name: 'Cleaning & consumables', kind: 'supplies', zone: 'household', order: 2, active: true },
  { id: 'ec-cat', name: 'Cat', kind: 'household', zone: 'household', order: 3, active: true },
  { id: 'ec-hmaint', name: 'Maintenance & repairs', kind: 'maintenance', zone: 'household', order: 4, active: true },
  { id: 'ec-util', name: 'Utilities', kind: 'utilities', zone: 'household', order: 5, active: true },
  { id: 'ec-veh', name: 'Vehicles', kind: 'vehicle', zone: 'household', order: 6, active: true },
  { id: 'ec-staff', name: 'Staff costs', kind: 'staff', zone: 'household', order: 7, active: true },
  { id: 'ec-contract', name: 'Service contracts', kind: 'maintenance', zone: 'household', order: 8, active: true },
  { id: 'ec-guest', name: 'Guests & entertaining', kind: 'household', zone: 'household', order: 13, active: true },
  { id: 'ec-other', name: 'Other', kind: 'other', zone: 'household', order: 14, active: true },
];

export const SEED_BUDGETS: Budget[] = [
  { id: uid('bg'), month: thisMonth, categoryId: 'ec-groc', zone: 'household', amount: 5500, notes: 'Includes the weekly fresh delivery.' },
  { id: uid('bg'), month: thisMonth, categoryId: 'ec-hclean', zone: 'household', amount: 900, notes: '' },
  { id: uid('bg'), month: thisMonth, categoryId: 'ec-cat', zone: 'household', amount: 450, notes: '' },
  { id: uid('bg'), month: thisMonth, categoryId: 'ec-hmaint', zone: 'household', amount: 1500, notes: 'Rolling. Underspend carries.' },
  { id: uid('bg'), month: thisMonth, categoryId: 'ec-util', zone: 'household', amount: 4200, notes: 'DEWA plus cooling. Higher June–September.' },
  { id: uid('bg'), month: thisMonth, categoryId: 'ec-veh', zone: 'household', amount: 2200, notes: 'Fuel, Salik, servicing sinking fund.' },
  { id: uid('bg'), month: thisMonth, categoryId: 'ec-contract', zone: 'household', amount: 3800, notes: 'AC, water tank, pest, facade, quarterly deep clean.' },
  { id: uid('bg'), month: thisMonth, categoryId: 'ec-guest', zone: 'household', amount: 1200, notes: '' },
];

type TxRow = [
  daysAgo: number,
  desc: string,
  amount: number,
  cat: string,
  zone: 'household',
  method: Transaction['method'],
  vis: 'owner' | 'manager',
  vendorId?: string,
];

const TX: TxRow[] = [
  [1, 'Kibsons fresh delivery', 780, 'ec-groc', 'household', 'Card', 'manager', 'v-groc'],
  [2, 'ENOC fuel — family car', 240, 'ec-veh', 'household', 'Card', 'manager'],
  [4, 'Cat food and litter', 285, 'ec-cat', 'household', 'Card', 'manager'],
  [6, 'Household cleaning supplies', 320, 'ec-hclean', 'household', 'Card', 'manager'],
  [7, 'DEWA — August', 3920, 'ec-util', 'household', 'Direct debit', 'manager'],
  [10, 'Kibsons fresh delivery', 810, 'ec-groc', 'household', 'Card', 'manager', 'v-groc'],
  [11, 'Salik top-up — both cars', 200, 'ec-veh', 'household', 'Card', 'manager'],
  [13, 'Skyline facade clean', 950, 'ec-contract', 'household', 'Bank transfer', 'manager', 'v-window'],
  [14, 'Rosie — salary', 4200, 'ec-staff', 'household', 'Bank transfer', 'owner'],
  [14, 'Marvin — salary', 3800, 'ec-staff', 'household', 'Bank transfer', 'owner'],
  [14, 'Reza — salary', 4000, 'ec-staff', 'household', 'Bank transfer', 'owner'],
  [15, 'ENOC fuel — errands car', 165, 'ec-veh', 'household', 'Card', 'manager'],
  [16, 'Traffic fine — Sheikh Zayed Rd', 400, 'ec-veh', 'household', 'Card', 'manager'],
  [17, 'Kibsons fresh delivery', 745, 'ec-groc', 'household', 'Card', 'manager', 'v-groc'],
  [18, 'Gulf Pest — quarterly treatment', 450, 'ec-contract', 'household', 'Bank transfer', 'manager', 'v-pest'],
  [19, 'Guest dinner — wine and flowers', 460, 'ec-guest', 'household', 'Card', 'manager'],
  [21, 'Master ensuite — silicone reseal', 550, 'ec-hmaint', 'household', 'Cash', 'manager'],
  [23, 'Kibsons fresh delivery', 690, 'ec-groc', 'household', 'Card', 'manager', 'v-groc'],
  [25, 'Cool Breeze — AC quarterly', 1200, 'ec-contract', 'household', 'Bank transfer', 'manager', 'v-ac'],
  [27, 'Household toilet paper and tissues — bulk', 240, 'ec-hclean', 'household', 'Card', 'manager'],
];

export const SEED_TRANSACTIONS: Transaction[] = TX.map(([d, desc, amount, cat, zone, method, vis, vendorId]) => ({
  id: uid('tx'),
  date: addDays(t, -d),
  description: desc,
  amount,
  categoryId: cat,
  zone,
  vendorId,
  method,
  ref: '',
  enteredBy: vis === 'owner' ? 'p-aditya' : 'p-earl',
  visibility: vis,
  notes: '',
}));

export const SEED_RECURRING: RecurringCharge[] = [
  { id: 'rc1', name: 'DEWA — electricity & water', kind: 'bill', categoryId: 'ec-util', zone: 'household', amount: 3900, cadence: 'monthly', nextDue: addDays(t, 4), autopay: true, accountRef: '2044-8812-1', visibility: 'manager', notes: 'Direct debit. Higher June to September.', active: true },
  { id: 'rc2', name: 'District cooling', kind: 'bill', categoryId: 'ec-util', zone: 'household', amount: 1450, cadence: 'monthly', nextDue: addDays(t, 6), autopay: true, accountRef: 'EMP-4102', visibility: 'manager', notes: '', active: true },
  { id: 'rc7', name: 'Tenancy — annual rent', kind: 'bill', categoryId: 'ec-other', zone: 'household', amount: 385000, cadence: 'annual', nextDue: addDays(t, 118), autopay: false, accountRef: 'EJARI-441028', visibility: 'owner', notes: 'Four cheques. Next one due with the Ejari renewal.', active: true },
  { id: 'rc8', name: 'Home & contents insurance', kind: 'bill', categoryId: 'ec-other', zone: 'household', amount: 4800, cadence: 'annual', nextDue: addDays(t, 62), autopay: false, accountRef: 'RSA-HOME-2201', visibility: 'owner', notes: 'Contents sum insured needs reviewing against the register.', active: true },
  { id: 'rc9', name: 'Vehicle insurance — family car', kind: 'bill', categoryId: 'ec-veh', zone: 'household', amount: 4200, cadence: 'annual', nextDue: addDays(t, 41), autopay: false, accountRef: 'AXA-MOT-99201', visibility: 'manager', notes: 'Due with the registration renewal.', active: true },
  { id: 'rc10', name: 'Vehicle insurance — errands car', kind: 'bill', categoryId: 'ec-veh', zone: 'household', amount: 2600, cadence: 'annual', nextDue: addDays(t, -6), autopay: false, accountRef: 'OI-MOT-33110', visibility: 'manager', notes: 'LAPSED. Car must not be driven until renewed.', active: true },
  { id: 'rc11', name: 'Netflix & family streaming', kind: 'subscription', categoryId: 'ec-other', zone: 'household', amount: 96, cadence: 'monthly', nextDue: addDays(t, 9), autopay: true, accountRef: '', visibility: 'owner', notes: '', active: true },
  { id: 'rc12', name: 'School fees — term', kind: 'bill', categoryId: 'ec-other', zone: 'household', amount: 42000, cadence: 'quarterly', nextDue: addDays(t, 27), autopay: false, accountRef: 'GEMS-88201', visibility: 'owner', notes: 'Aria and Noor. Early-payment discount if paid two weeks ahead.', active: true },
  { id: 'rc13', name: 'Kibsons weekly delivery', kind: 'subscription', categoryId: 'ec-groc', zone: 'household', amount: 760, cadence: 'weekly', nextDue: addDays(t, 3), autopay: true, accountRef: 'KB-4410', visibility: 'manager', notes: 'Slot booked the night before. Amount varies.', active: true },
];

export const SEED_PETTY: PettyCashEntry[] = [
  { id: uid('pc'), date: addDays(t, -28), direction: 'float', amount: 1500, holderId: 'p-rosie', purpose: 'Monthly household float', zone: 'household', approvedBy: 'p-earl', notes: '' },
  { id: uid('pc'), date: addDays(t, -24), direction: 'spend', amount: 180, holderId: 'p-rosie', purpose: 'Fresh fish and bread, Saturday market', categoryId: 'ec-groc', zone: 'household', notes: '' },
  { id: uid('pc'), date: addDays(t, -18), direction: 'spend', amount: 95, holderId: 'p-rosie', purpose: 'Flowers for the dining table', categoryId: 'ec-guest', zone: 'household', notes: '' },
  { id: uid('pc'), date: addDays(t, -9), direction: 'spend', amount: 260, holderId: 'p-rosie', purpose: 'Cat food — the brand she will eat', categoryId: 'ec-cat', zone: 'household', notes: '' },
  { id: uid('pc'), date: addDays(t, -2), direction: 'spend', amount: 140, holderId: 'p-rosie', purpose: 'Herbs and salad, local shop', categoryId: 'ec-groc', zone: 'household', notes: '' },
];

export const SEED_DOCUMENTS: DocumentRec[] = [
  { id: 'dc1', title: 'Tenancy contract & Ejari', cat: 'Tenancy', filename: 'ejari-441028.pdf', mime: 'application/pdf', sizeKb: 1840, zone: 'household', issueDate: addDays(t, -247), expiryDate: addDays(t, 118), reminderDays: 60, visibility: 'owner', uploadedBy: 'p-aditya', uploadedAt: Date.now() - 240 * 864e5, notes: 'Renewal negotiation should start 90 days out.' },
  { id: 'dc2', title: 'Home & contents insurance policy', cat: 'Insurance', filename: 'rsa-home-2201.pdf', mime: 'application/pdf', sizeKb: 920, zone: 'household', issueDate: addDays(t, -303), expiryDate: addDays(t, 62), reminderDays: 45, visibility: 'owner', uploadedBy: 'p-aditya', uploadedAt: Date.now() - 300 * 864e5, notes: 'Contents sum insured AED 600,000 — review against the register, it looks low.' },
  { id: 'dc3', title: 'Family car — registration (Mulkiya)', cat: 'Certificate', filename: 'mulkiya-n41882.pdf', mime: 'application/pdf', sizeKb: 340, zone: 'household', linkedType: 'vehicle', linkedId: 'veh1', issueDate: addDays(t, -324), expiryDate: addDays(t, 41), reminderDays: 30, visibility: 'manager', uploadedBy: 'p-earl', uploadedAt: Date.now() - 320 * 864e5, notes: 'Renew with the insurance — same date.' },
  { id: 'dc4', title: 'Errands car — registration (Mulkiya)', cat: 'Certificate', filename: 'mulkiya-k77410.pdf', mime: 'application/pdf', sizeKb: 336, zone: 'household', linkedType: 'vehicle', linkedId: 'veh2', issueDate: addDays(t, -247), expiryDate: addDays(t, 118), reminderDays: 30, visibility: 'manager', uploadedBy: 'p-earl', uploadedAt: Date.now() - 240 * 864e5, notes: '' },
  { id: 'dc5', title: 'Errands car — insurance certificate', cat: 'Insurance', filename: 'oi-mot-33110.pdf', mime: 'application/pdf', sizeKb: 410, zone: 'household', linkedType: 'vehicle', linkedId: 'veh2', issueDate: addDays(t, -371), expiryDate: addDays(t, -6), reminderDays: 30, visibility: 'manager', uploadedBy: 'p-earl', uploadedAt: Date.now() - 370 * 864e5, notes: 'EXPIRED. Car must not be driven.' },
  { id: 'dc6', title: 'Rosie — employment contract', cat: 'Contract', filename: 'contract-rosie.pdf', mime: 'application/pdf', sizeKb: 620, zone: 'household', linkedType: 'staff', linkedId: 'p-rosie', issueDate: addDays(t, -900), expiryDate: addDays(t, 190), reminderDays: 60, visibility: 'owner', uploadedBy: 'p-aditya', uploadedAt: Date.now() - 900 * 864e5, notes: '' },
  { id: 'dc7', title: 'Rosie — residence visa', cat: 'Visa', filename: 'visa-rosie.pdf', mime: 'application/pdf', sizeKb: 480, zone: 'household', linkedType: 'staff', linkedId: 'p-rosie', issueDate: addDays(t, -676), expiryDate: addDays(t, 54), reminderDays: 90, visibility: 'owner', uploadedBy: 'p-aditya', uploadedAt: Date.now() - 670 * 864e5, notes: 'Renewal takes about three weeks. Medical needed first.' },
  { id: 'dc8', title: 'Marvin — passport', cat: 'Passport', filename: 'passport-marvin.pdf', mime: 'application/pdf', sizeKb: 510, zone: 'household', linkedType: 'staff', linkedId: 'p-marvin', issueDate: addDays(t, -3625), expiryDate: addDays(t, 25), reminderDays: 90, visibility: 'owner', uploadedBy: 'p-aditya', uploadedAt: Date.now() - 600 * 864e5, notes: 'URGENT — 25 days. Cannot renew the visa on a passport with under six months.' },
  { id: 'dc9', title: 'Marvin — UAE driving licence', cat: 'Certificate', filename: 'licence-marvin.pdf', mime: 'application/pdf', sizeKb: 280, zone: 'household', linkedType: 'staff', linkedId: 'p-marvin', issueDate: addDays(t, -400), expiryDate: addDays(t, 1425), reminderDays: 60, visibility: 'manager', uploadedBy: 'p-earl', uploadedAt: Date.now() - 400 * 864e5, notes: '' },
  { id: 'dc10', title: 'Reza — residence visa', cat: 'Visa', filename: 'visa-reza.pdf', mime: 'application/pdf', sizeKb: 470, zone: 'household', linkedType: 'staff', linkedId: 'p-reza', issueDate: addDays(t, -240), expiryDate: addDays(t, 480), reminderDays: 90, visibility: 'owner', uploadedBy: 'p-aditya', uploadedAt: Date.now() - 240 * 864e5, notes: '' },
  { id: 'dc11', title: 'Water tank cleaning certificate', cat: 'Certificate', filename: 'watertank-cert.pdf', mime: 'application/pdf', sizeKb: 240, zone: 'household', linkedType: 'contract', linkedId: 'sc2', issueDate: addDays(t, -170), expiryDate: addDays(t, 10), reminderDays: 21, visibility: 'manager', uploadedBy: 'p-earl', uploadedAt: Date.now() - 170 * 864e5, notes: 'Municipality requirement. Keep the current one to hand.' },
  { id: 'dc12', title: 'Miele dishwasher — warranty', cat: 'Warranty', filename: 'miele-g7310-warranty.pdf', mime: 'application/pdf', sizeKb: 180, zone: 'household', linkedType: 'asset', issueDate: addDays(t, -500), expiryDate: addDays(t, 230), reminderDays: 30, visibility: 'manager', uploadedBy: 'p-earl', uploadedAt: Date.now() - 500 * 864e5, notes: '' },
  { id: 'dc15', title: 'Fire safety inspection report', cat: 'Certificate', filename: 'fire-inspection.pdf', mime: 'application/pdf', sizeKb: 1120, zone: 'household', linkedType: 'contract', linkedId: 'sc5', issueDate: addDays(t, -300), expiryDate: addDays(t, 65), reminderDays: 30, visibility: 'manager', uploadedBy: 'p-earl', uploadedAt: Date.now() - 300 * 864e5, notes: 'Building-wide. Two extinguishers in our zones flagged for replacement.' },
  { id: 'dc16', title: 'Building rules & fit-out guide', cat: 'Other', filename: 'building-rules.pdf', mime: 'application/pdf', sizeKb: 2400, zone: 'household', issueDate: addDays(t, -900), expiryDate: '', reminderDays: 0, visibility: 'manager', uploadedBy: 'p-earl', uploadedAt: Date.now() - 900 * 864e5, notes: 'Contractor access rules and permitted working hours are in section 7.' },
];
