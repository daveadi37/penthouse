import type {
  Absence,
  AttendanceEntry,
  CoverageRule,
  LeaveRequest,
  Profile,
  Shift,
  StaffDetails,
  StaffReview,
} from '@/types';
import { addDays, today, weekStart } from '@/lib/date';
import { uid } from '@/lib/id';

/* ============================================================
   The people of apartment 3808.

   Shrien owns the home. Aditya looks after the priests and agrees the
   menu with the cooks in advance. Salyna runs the household side. Those
   three are the admins, and everyone else's account is created by them.

   Earl is in charge overall and checks the sheet before it goes out.
   Rosie, Reza and Marvin are staff. Jagdishbhai and Hiteshbhai are
   helpers — on site for a session, paid per session, and neither of
   them has an email address, so neither of them has a login. They are
   on every sheet regardless. The priests lead the prayers and are not
   staff. Ken is the cat.

   `role` is an id into db.roles, not a fixed word. Every one of these
   can be changed from the role editor without touching this file.
   ============================================================ */

export const SEED_PROFILES: Profile[] = [
  /* ---------- the three admins ---------- */
  { id: 'p-shrien', name: 'Shrien', role: 'owner', staffRoles: [], email: 'shrien@3808.local', phone: '+971 50 000 0001', initials: 'SH', active: true, isHouseholdMember: true, canSignIn: true },
  { id: 'p-aditya', name: 'Aditya Dave', role: 'owner', staffRoles: ['priestcare'], email: 'aditya.dave@evolvecaregroup.com', phone: '+971 50 000 0002', initials: 'AD', active: true, isHouseholdMember: true, canSignIn: true },
  { id: 'p-salyna', name: 'Salyna', role: 'owner', staffRoles: [], email: 'salyna@3808.local', phone: '+971 50 000 0021', initials: 'SA', active: true, isHouseholdMember: true, canSignIn: true },

  /* ---------- in charge of the day ---------- */
  { id: 'p-earl', name: 'Earl Tiongco', role: 'manager', staffRoles: [], email: 'earl@3808.local', phone: '+971 50 000 0003', initials: 'ET', active: true, canSignIn: true },

  /* ---------- staff ---------- */
  { id: 'p-rosie', name: 'Rosie', role: 'staff', staffRoles: ['housekeeping', 'cooking'], email: 'rosie@3808.local', phone: '+971 50 000 0011', initials: 'RO', active: true, canSignIn: true },
  { id: 'p-reza', name: 'Reza', role: 'staff', staffRoles: ['cooking', 'housekeeping'], email: 'reza@3808.local', phone: '+971 50 000 0012', initials: 'RE', active: true, canSignIn: true },
  { id: 'p-marvin', name: 'Marvin', role: 'staff', staffRoles: ['driver', 'housekeeping'], email: 'marvin@3808.local', phone: '+971 50 000 0013', initials: 'MA', active: true, canSignIn: true },

  /* ---------- helpers: on site for a session, no login ---------- */
  { id: 'p-jagdish', name: 'Jagdishbhai', role: 'helper', staffRoles: ['cook'], email: '', phone: '+971 50 000 0014', initials: 'JB', active: true, canSignIn: false },
  { id: 'p-hitesh', name: 'Hiteshbhai', role: 'helper', staffRoles: ['cook'], email: '', phone: '+971 50 000 0015', initials: 'HB', active: true, canSignIn: false },

  /* ---------- the prayers ---------- */
  { id: 'p-priests', name: 'Priests', role: 'family', staffRoles: [], email: '', phone: '', initials: 'PR', active: true, canSignIn: false },

  /* ---------- household ---------- */
  { id: 'p-charlie', name: 'Charlie', role: 'family', staffRoles: [], email: 'charlie@3808.local', phone: '+971 50 000 0022', initials: 'CH', active: true, isHouseholdMember: true, canSignIn: true },
  { id: 'p-aria', name: 'Aria', role: 'family', staffRoles: [], email: '', phone: '', initials: 'AR', active: true, isHouseholdMember: true, canSignIn: false },
  { id: 'p-noor', name: 'Noor', role: 'family', staffRoles: [], email: '', phone: '', initials: 'NO', active: true, isHouseholdMember: true, canSignIn: false },
];

/* Hours are the running sheet's own: Rosie lives in and is on until
   close-down, Reza comes at 14:00 for the prayers, and the two cooks
   are on site for their session only. Each has one day off, which is
   what makes the coverage rules below do real work. */

export const SEED_SHIFTS: Shift[] = [
  { id: 's-rosie', staffId: 'p-rosie', days: [0, 2, 3, 4, 5, 6], start: '07:00', end: '22:00', dayOff: 1 },
  { id: 's-reza', staffId: 'p-reza', days: [0, 1, 3, 4, 5, 6], start: '14:00', end: '22:00', dayOff: 2 },
  { id: 's-marvin', staffId: 'p-marvin', days: [0, 1, 2, 4, 5, 6], start: '09:00', end: '18:00', dayOff: 3 },
  { id: 's-jagdish', staffId: 'p-jagdish', days: [0, 1, 2, 3, 4, 5], start: '15:00', end: '17:00', dayOff: 6 },
  { id: 's-hitesh', staffId: 'p-hitesh', days: [0, 1, 2, 4, 5, 6], start: '19:00', end: '21:00', dayOff: 3 },
];

export const SEED_ABSENCES: Absence[] = [
  { id: 'ab1', staffId: 'p-marvin', from: addDays(today(), 9), to: addDays(today(), 13), type: 'Annual leave', notes: 'Family visit. Reza takes the morning items and the deliveries.' },
];

export const SEED_COVERAGE: CoverageRule[] = [
  { id: 'cv1', role: 'driver', zone: 'any', coverStaffId: 'p-reza', notes: 'Reza holds a licence and picks up the regular items.' },
  { id: 'cv2', role: 'housekeeping', zone: 'household', coverStaffId: 'p-reza', notes: 'Essential household tasks only on Rosie’s day off.' },
  { id: 'cv3', role: 'maintenance', zone: 'household', coverStaffId: 'p-marvin', notes: 'Small repairs and anything that needs carrying. Anything electrical or plumbed goes to a vendor, not to Marvin.' },
  { id: 'cv4', role: 'cooking', zone: 'household', coverStaffId: 'p-reza', notes: 'Simple meals only — otherwise the household orders in.' },
  { id: 'cv5', role: 'cook', zone: 'household', coverStaffId: 'p-rosie', notes: 'On the cooks’ session days off Rosie reheats and makes the breads. Aditya is told the day before.' },
  { id: 'cv6', role: 'priestcare', zone: 'household', coverStaffId: 'p-earl', notes: 'Earl stays with the priests if Aditya is away. Nothing about the shrine is decided without Aditya.' },
];

export const SEED_STAFF_DETAILS: StaffDetails[] = [
  {
    id: 'sd1', profileId: 'p-rosie', roleTitle: 'House staff — in charge of the kitchen',
    contractStart: addDays(today(), -900), contractEnd: addDays(today(), 190),
    visaExpiry: addDays(today(), 54), passportExpiry: addDays(today(), 620), medicalExpiry: addDays(today(), 140),
    leaveEntitlementDays: 30, payDay: 28, salary: 4200, livesIn: true,
    emergencyContact: 'Marites (sister)', emergencyPhone: '+63 917 000 0000',
    notes: 'Lives in. Runs the kitchen and tells Reza what to do. Dusts the shrine and tops up the divo. Has run this home for two and a half years.',
  },
  {
    id: 'sd2', profileId: 'p-reza', roleTitle: 'Helper — paid hourly',
    contractStart: addDays(today(), -240), contractEnd: addDays(today(), 490),
    visaExpiry: addDays(today(), 480), passportExpiry: addDays(today(), 900), medicalExpiry: addDays(today(), 470),
    leaveEntitlementDays: 30, payDay: 28, livesIn: false,
    emergencyContact: 'Ali (brother)', emergencyPhone: '+971 56 000 0000',
    notes: 'Paid by the hour, 14:00 to 22:00. Kitchen with Rosie, then balconies and outside from 17:00. Looks after guests in the breaks and keeps Ken away from the open doors. Guest toilet every 20 minutes during prayers. Helps serve and clear up.',
  },
  {
    id: 'sd3', profileId: 'p-marvin', roleTitle: 'House staff',
    contractStart: addDays(today(), -600), contractEnd: addDays(today(), 400),
    visaExpiry: addDays(today(), 310), passportExpiry: addDays(today(), 25), medicalExpiry: addDays(today(), 300),
    leaveEntitlementDays: 30, payDay: 28, salary: 3800, livesIn: false,
    emergencyContact: 'Jocelyn (wife)', emergencyPhone: '+971 55 000 0000',
    notes: 'As directed. Buys the regular items first thing, receives guests and deliveries, posts deliveries on the group. UAE licence renewed last year.',
  },
  {
    id: 'sd4', profileId: 'p-jagdish', roleTitle: 'Cook — afternoon, paid per session',
    contractStart: addDays(today(), -420), contractEnd: addDays(today(), 300),
    visaExpiry: addDays(today(), 520), passportExpiry: addDays(today(), 740), medicalExpiry: addDays(today(), 260),
    leaveEntitlementDays: 0, payDay: 28, livesIn: false,
    emergencyContact: 'Nileshbhai (cousin)', emergencyPhone: '+971 55 000 0001',
    notes: 'Paid per session, 15:00 to 17:00. Sabji, dal, farsan and sweets. Hands his food to Rosie before he leaves with next week’s shopping list, and confirms tomorrow’s stock is complete.',
  },
  {
    id: 'sd5', profileId: 'p-hitesh', roleTitle: 'Cook — evening, paid per session',
    contractStart: addDays(today(), -300), contractEnd: addDays(today(), 300),
    visaExpiry: addDays(today(), 610), passportExpiry: addDays(today(), 820), medicalExpiry: addDays(today(), 330),
    leaveEntitlementDays: 0, payDay: 28, livesIn: false,
    emergencyContact: 'Rekhaben (wife)', emergencyPhone: '+971 55 000 0002',
    notes: 'Paid per session, 19:00 to 21:00. Reheats the food and makes the breads fresh — rotli, bhakhri, paratha, rotla. Shows the others how to lay the table.',
  },
];

export const SEED_ATTENDANCE: AttendanceEntry[] = (() => {
  const out: AttendanceEntry[] = [];
  const staff = [
    { id: 'p-rosie', days: [0, 2, 3, 4, 5, 6], inT: '07:02', outT: '22:05', base: 15 },
    { id: 'p-reza', days: [0, 1, 3, 4, 5, 6], inT: '14:02', outT: '22:10', base: 8 },
    { id: 'p-marvin', days: [0, 1, 2, 4, 5, 6], inT: '08:55', outT: '18:05', base: 9 },
    { id: 'p-jagdish', days: [0, 1, 2, 3, 4, 5], inT: '15:00', outT: '17:10', base: 2 },
    { id: 'p-hitesh', days: [0, 1, 2, 4, 5, 6], inT: '18:58', outT: '21:15', base: 2.25 },
  ];
  for (let i = 1; i <= 21; i++) {
    const date = addDays(today(), -i);
    const dow = new Date(date + 'T12:00:00').getDay();
    staff.forEach((s) => {
      if (!s.days.includes(dow)) return;
      out.push({
        id: uid('at'), staffId: s.id, date,
        clockIn: s.inT, clockOut: s.outT,
        hours: Math.round((s.base + (i % 3) * 0.25) * 10) / 10,
        source: 'manual', notes: '',
      });
    });
  }
  return out;
})();

export const SEED_LEAVE: LeaveRequest[] = [
  { id: 'lv1', staffId: 'p-marvin', from: addDays(today(), 9), to: addDays(today(), 13), type: 'Annual leave', days: 5, status: 'approved', requestedAt: Date.now() - 12 * 864e5, approvedBy: 'p-earl', notes: 'Family visit.' },
  { id: 'lv2', staffId: 'p-rosie', from: addDays(today(), 40), to: addDays(today(), 54), type: 'Annual leave', days: 15, status: 'requested', requestedAt: Date.now() - 2 * 864e5, notes: 'Home visit. Needs cover for the full period, prayers included.' },
  { id: 'lv3', staffId: 'p-reza', from: addDays(today(), -20), to: addDays(today(), -20), type: 'Sick', days: 1, status: 'taken', requestedAt: Date.now() - 20 * 864e5, approvedBy: 'p-earl', notes: '' },
];

export const SEED_REVIEWS: StaffReview[] = [
  {
    id: 'rv1', staffId: 'p-rosie',
    periodStart: addDays(weekStart(today()), -84), periodEnd: addDays(weekStart(today()), -1),
    completionPct: 94,
    strengths: 'Consistently high completion. The shrine has not been missed once — divo lit and topped up every day of the Prayer so far. Flags faults the day she sees them.',
    development: 'The sheet goes to the group late on the days she is also doing the shopping list. Worth preparing it the night before.',
    notes: 'Asked about agreeing the menu with Jagdishbhai a full week ahead rather than three days.',
    by: 'p-earl', at: Date.now() - 10 * 864e5,
  },
  {
    id: 'rv2', staffId: 'p-reza',
    periodStart: addDays(weekStart(today()), -84), periodEnd: addDays(weekStart(today()), -1),
    completionPct: 88,
    strengths: 'The 20-minute guest toilet round holds up under load — not a single gap logged during the last three sittings. Good with the guests in the breaks, and Ken has not got into the prayer area once on his watch.',
    development: 'Balconies slip when the prayers overrun, because he is serving water instead. Needs the two decoupled, or Marvin on the balconies from 17:00.',
    notes: 'Four months in. Settling well. Paid hourly — the timesheet is the pay record, so it has to be right.',
    by: 'p-earl', at: Date.now() - 10 * 864e5,
  },
];
