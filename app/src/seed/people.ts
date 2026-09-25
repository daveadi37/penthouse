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

   Shrien owns the home and is in the UK at the moment. Aditya owns it
   too and works from it, which is why his day is in here at all. Earl is
   in charge overall. Salyna, Charlie, Aria and Noor are household.

   Two staff, and that is the whole payroll: Rosie cooks and keeps the
   house, Marvin drives. Anyone else is a vendor or a helper brought in
   for one occasion, and neither of those is on this list.

   `role` is an id into db.roles, not a fixed word. Every one of these
   can be changed from the role editor without touching this file.
   ============================================================ */

export const SEED_PROFILES: Profile[] = [
  /* ---------- the owners ---------- */
  { id: 'p-shrien', name: 'Shrien', role: 'owner', staffRoles: [], email: 'shrien@3808.local', phone: '+971 50 000 0001', initials: 'SH', active: true, isHouseholdMember: true, canSignIn: true },
  { id: 'p-aditya', name: 'Aditya Dave', role: 'owner', staffRoles: [], email: 'aditya.dave@evolvecaregroup.com', phone: '+971 50 000 0002', initials: 'AD', active: true, isHouseholdMember: true, canSignIn: true, diet: 'Vegetarian — no meat, no fish, no eggs. Dairy is fine.' },

  /* ---------- in charge of the day ---------- */
  { id: 'p-earl', name: 'Earl Tiongco', role: 'manager', staffRoles: [], email: 'earl@3808.local', phone: '+971 50 000 0003', initials: 'ET', active: true, canSignIn: true },

  /* ---------- staff ---------- */
  { id: 'p-rosie', name: 'Rosie', role: 'staff', staffRoles: ['housekeeping', 'cooking'], email: 'rosie@3808.local', phone: '+971 50 000 0011', initials: 'RO', active: true, canSignIn: true },
  { id: 'p-marvin', name: 'Marvin', role: 'staff', staffRoles: ['driver'], email: 'marvin@3808.local', phone: '+971 50 000 0013', initials: 'MA', active: true, canSignIn: true },

  /* ---------- household ---------- */
  { id: 'p-salyna', name: 'Salyna', role: 'family', staffRoles: [], email: 'salyna@3808.local', phone: '+971 50 000 0021', initials: 'SA', active: true, isHouseholdMember: true, canSignIn: true },
  { id: 'p-charlie', name: 'Charlie', role: 'family', staffRoles: [], email: 'charlie@3808.local', phone: '+971 50 000 0022', initials: 'CH', active: true, isHouseholdMember: true, canSignIn: true },
  { id: 'p-aria', name: 'Aria', role: 'family', staffRoles: [], email: '', phone: '', initials: 'AR', active: true, isHouseholdMember: true, canSignIn: false },
  { id: 'p-noor', name: 'Noor', role: 'family', staffRoles: [], email: '', phone: '', initials: 'NO', active: true, isHouseholdMember: true, canSignIn: false },
];

/* Rosie lives in and works a long day; Marvin's is bracketed by the two
   school runs. Each has one day off, and they are different days on
   purpose — that is what makes the coverage rules below do real work
   rather than pointing at somebody who is also away. */

export const SEED_SHIFTS: Shift[] = [
  { id: 's-rosie', staffId: 'p-rosie', days: [0, 2, 3, 4, 5, 6], start: '07:00', end: '19:00', dayOff: 1 },
  { id: 's-marvin', staffId: 'p-marvin', days: [0, 1, 2, 4, 5, 6], start: '08:00', end: '18:00', dayOff: 3 },
];

export const SEED_ABSENCES: Absence[] = [
  { id: 'ab1', staffId: 'p-marvin', from: addDays(today(), 9), to: addDays(today(), 13), type: 'Annual leave', notes: 'Family visit. The school run needs a taxi booked for the whole week.' },
];

export const SEED_COVERAGE: CoverageRule[] = [
  { id: 'cv1', role: 'driver', zone: 'any', coverStaffId: 'p-earl', notes: 'On Marvin’s day off Earl books the school run and any pickup. Nobody else in the house drives.' },
  { id: 'cv2', role: 'housekeeping', zone: 'household', coverStaffId: 'p-marvin', notes: 'Essential household tasks only on Rosie’s day off — bins, bathrooms, the cat.' },
  { id: 'cv3', role: 'maintenance', zone: 'household', coverStaffId: 'p-marvin', notes: 'Small repairs and anything that needs carrying. Anything electrical or plumbed goes to a vendor, not to Marvin.' },
  { id: 'cv4', role: 'cooking', zone: 'household', coverStaffId: 'p-marvin', notes: 'Reheating what Rosie left only. Anything else, the household orders in.' },
];

export const SEED_STAFF_DETAILS: StaffDetails[] = [
  {
    id: 'sd1', profileId: 'p-rosie', roleTitle: 'House staff — cook and helper',
    contractStart: addDays(today(), -900), contractEnd: addDays(today(), 190),
    visaExpiry: addDays(today(), 54), passportExpiry: addDays(today(), 620), medicalExpiry: addDays(today(), 140),
    leaveEntitlementDays: 30, payDay: 28, salary: 4200, livesIn: true,
    emergencyContact: 'Marites (sister)', emergencyPhone: '+63 917 000 0000',
    notes: 'Lives in. Runs the kitchen and the house, and keeps the buy list. Has run this home for two and a half years.',
  },
  {
    id: 'sd2', profileId: 'p-marvin', roleTitle: 'House staff — driver',
    contractStart: addDays(today(), -600), contractEnd: addDays(today(), 400),
    visaExpiry: addDays(today(), 310), passportExpiry: addDays(today(), 25), medicalExpiry: addDays(today(), 300),
    leaveEntitlementDays: 30, payDay: 28, salary: 3800, livesIn: false,
    emergencyContact: 'Jocelyn (wife)', emergencyPhone: '+971 55 000 0000',
    notes: 'School runs morning and afternoon, the grocery run, and receiving guests and deliveries between them. UAE licence renewed last year.',
  },
];

export const SEED_ATTENDANCE: AttendanceEntry[] = (() => {
  const out: AttendanceEntry[] = [];
  const staff = [
    { id: 'p-rosie', days: [0, 2, 3, 4, 5, 6], inT: '07:02', outT: '19:05', base: 12 },
    { id: 'p-marvin', days: [0, 1, 2, 4, 5, 6], inT: '07:55', outT: '18:05', base: 10 },
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
  { id: 'lv2', staffId: 'p-rosie', from: addDays(today(), 40), to: addDays(today(), 54), type: 'Annual leave', days: 15, status: 'requested', requestedAt: Date.now() - 2 * 864e5, notes: 'Home visit. Needs cover for the full period — there is nobody else in the kitchen.' },
  { id: 'lv3', staffId: 'p-marvin', from: addDays(today(), -20), to: addDays(today(), -20), type: 'Sick', days: 1, status: 'taken', requestedAt: Date.now() - 20 * 864e5, approvedBy: 'p-earl', notes: '' },
];

export const SEED_REVIEWS: StaffReview[] = [
  {
    id: 'rv1', staffId: 'p-rosie',
    periodStart: addDays(weekStart(today()), -84), periodEnd: addDays(weekStart(today()), -1),
    completionPct: 94,
    strengths: 'Consistently high completion. Flags faults the day she sees them rather than saving them up.',
    development: 'The buy list goes up late on the days she is also cooking for a full table. Worth building it the night before.',
    notes: 'Asked whether the weekly grocery order could go in a day earlier, so a missing item still has a day to be fixed.',
    by: 'p-earl', at: Date.now() - 10 * 864e5,
  },
  {
    id: 'rv2', staffId: 'p-marvin',
    periodStart: addDays(weekStart(today()), -84), periodEnd: addDays(weekStart(today()), -1),
    completionPct: 96,
    strengths: 'Never late for a school run in the period. Posts deliveries to the house chat the moment they land, which is why nothing has gone missing.',
    development: 'The grocery run comes back short when the list is added to after he has left. He should ask for it to be closed before he goes.',
    notes: 'Passport expires in under a month and a visa renewal needs six months on it — this is the blocker, not the visa date.',
    by: 'p-earl', at: Date.now() - 10 * 864e5,
  },
];
