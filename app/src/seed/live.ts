import type {
  Appointment,
  Issue,
  Notification,
  NotificationPref,
  PushSubscriptionRec,
} from '@/types';
import { addDays, today } from '@/lib/date';
import { uid } from '@/lib/id';

const t = today();
const h = (n: number) => Date.now() - n * 36e5;

/* The unified issues table: faults, condition flags, requests
   and supply requests are all the same object. One inbox, one status
   flow, one push channel. */

export const SEED_ISSUES: Issue[] = [
  {
    id: 'is-wash', kind: 'fault', title: 'Washing machine — bearing noise on spin',
    detail: 'Loud grinding on the spin cycle for about two weeks, getting worse. Out of warranty since last month.',
    areaId: 'a-ut1', zone: 'household', priority: 'high', status: 'in_progress',
    reportedBy: 'p-rosie', reportedAt: h(150), assignedTo: 'p-earl', vendorId: 'v-appl', assetId: undefined, cost: 1400,
    photos: [], comments: [
      { id: uid('ic'), by: 'p-earl', at: h(140), text: 'Better Life attended. AED 1,400 for the bearing on a machine that cost AED 3,100 and is out of warranty.' },
      { id: uid('ic'), by: 'p-aditya', at: h(130), text: 'Repair it. Replacing is not worth it while it still holds a load — and check what the replacement lifespan in the register says.' },
    ],
  },
  {
    id: 'is-blind', kind: 'fault', title: 'Bedroom 2 blind will not stay up',
    detail: 'Drops about a third of the way down on its own within an hour. Mechanism, not the cord.',
    areaId: 'a-br2', zone: 'household', priority: 'normal', status: 'acknowledged',
    reportedBy: 'p-rosie', reportedAt: h(70), assignedTo: 'p-marvin',
    photos: [], comments: [
      { id: uid('ic'), by: 'p-marvin', at: h(60), text: 'Looked at it. Needs a part. Grouping it with the hallway wall touch-up so we get one visit.' },
    ],
  },
  {
    id: 'is-towel', kind: 'condition', title: 'Four bath towels fraying at the hem',
    detail: 'Greying and thin at the edges. Should come out of rotation before a guest gets one.',
    areaId: undefined, zone: 'household', priority: 'low', status: 'reported',
    reportedBy: 'p-rosie', reportedAt: h(56),
    photos: [], comments: [],
  },
  {
    id: 'is-wall', kind: 'condition', title: 'Hallway wall chipped at waist height',
    detail: 'About 4cm, ground floor hallway near the lift. Looks like a delivery trolley.',
    areaId: 'a-cr2', zone: 'household', priority: 'low', status: 'acknowledged',
    reportedBy: 'p-rosie', reportedAt: h(520), assignedTo: 'p-marvin',
    photos: [], comments: [
      { id: uid('ic'), by: 'p-marvin', at: h(500), text: 'Grouped with the Bedroom 2 blind for one handyman visit.' },
    ],
  },
  {
    id: 'is-terrace', kind: 'condition', title: 'Terrace tile cracked near the pool edge',
    detail: 'Hairline, about 15cm, third tile from the steps. Not a trip hazard yet but it will spread.',
    areaId: 'a-ot1', zone: 'household', priority: 'normal', status: 'closed',
    reportedBy: 'p-rosie', reportedAt: h(900), assignedTo: 'p-earl',
    resolvedAt: h(700), resolution: 'Raised with building management — the pool surround is theirs. Ticket logged, they replaced the tile.',
    photos: [], comments: [],
  },
];

export const SEED_APPOINTMENTS: Appointment[] = [
  { id: uid('ap'), date: t, start: '07:20', end: '08:00', title: 'School run — morning', kind: 'school', zone: 'household', assignedTo: 'p-marvin', attendees: 'Aria, Noor', notes: 'Leave by twenty past.' },
  { id: uid('ap'), date: t, start: '15:15', end: '16:00', title: 'School run — afternoon', kind: 'school', zone: 'household', assignedTo: 'p-marvin', attendees: 'Aria, Noor', notes: '' },
  { id: uid('ap'), date: addDays(t, 1), start: '18:40', end: '19:40', title: 'Airport pickup — Mrs Raman', kind: 'personal', zone: 'household', assignedTo: 'p-marvin', attendees: 'Mrs Devi Raman', notes: 'Terminal 3. Flight EK. Leave by 17:50.' },
  { id: uid('ap'), date: addDays(t, 2), start: '18:30', end: '20:00', title: 'Gulf Pest — quarterly treatment', kind: 'vendor', zone: 'household', vendorId: 'v-pest', assignedTo: 'p-marvin', attendees: 'Ahmed', notes: 'After hours. Escort throughout.' },
  { id: uid('ap'), date: addDays(t, 5), start: '11:00', end: '12:00', title: 'Dr Sharma — Noor, routine', kind: 'medical', zone: 'household', assignedTo: 'p-marvin', attendees: 'Noor, Salyna', notes: 'Mediclinic City.' },
  { id: uid('ap'), date: addDays(t, 8), start: '07:00', end: '11:00', title: 'Skyline — facade & terrace glass', kind: 'vendor', zone: 'household', vendorId: 'v-window', assignedTo: 'p-marvin', attendees: 'Joseph’s crew', notes: 'Terrace furniture moved in the night before.' },
  { id: uid('ap'), date: addDays(t, 10), start: '09:00', end: '10:00', title: 'AquaPure — water tank cleaning', kind: 'vendor', zone: 'household', vendorId: 'v-water', assignedTo: 'p-marvin', attendees: 'Ravi', notes: 'Certificate issued on the day — file it.' },
  { id: uid('ap'), date: addDays(t, 15), start: '09:00', end: '16:00', title: 'Cool Breeze — quarterly AC service', kind: 'vendor', zone: 'household', vendorId: 'v-ac', assignedTo: 'p-marvin', attendees: 'Sameer’s team', notes: 'Eleven units, most of a day. Book the morning so it is finished before the school run.' },
];

export const SEED_NOTIFICATIONS: Notification[] = [
  { id: uid('nt'), profileId: 'p-marvin', kind: 'day_ready', title: 'Today’s work is ready', body: '6 tasks — both school runs, the grocery list and two deliveries expected.', url: '#/planner', priority: 'normal', createdAt: h(9), sentAt: h(9), readAt: h(8) },
  { id: uid('nt'), profileId: 'p-rosie', kind: 'day_ready', title: 'Today’s work is ready', body: '44 tasks across the household.', url: '#/planner', priority: 'normal', createdAt: h(11), sentAt: h(11), readAt: h(10) },
  { id: uid('nt'), profileId: 'p-marvin', kind: 'issue_raised', title: 'Washing machine — bearing noise on spin', body: 'Reported by Rosie. Getting worse, and it is out of warranty.', url: '#/issues/is-wash', priority: 'high', createdAt: h(22), sentAt: h(22), readAt: h(21) },
  { id: uid('nt'), profileId: 'p-earl', kind: 'issue_raised', title: 'Washing machine — bearing noise on spin', body: 'AED 1,400 to repair, on a machine that cost AED 3,100 and is out of warranty.', url: '#/issues/is-wash', priority: 'high', createdAt: h(22), sentAt: h(22), readAt: h(20) },
  { id: uid('nt'), profileId: 'p-earl', kind: 'meal_approval', title: '2 meals awaiting your approval', body: 'Tonight’s olo, kadhi and khichdi, and tomorrow’s biryani.', url: '#/cooking', priority: 'normal', createdAt: h(6), sentAt: h(6) },
  { id: uid('nt'), profileId: 'p-earl', kind: 'stock_low', title: '4 items below minimum', body: 'Chicken, cat food, cat litter and dishwasher tablets.', url: '#/inventory', priority: 'high', createdAt: h(9), sentAt: h(9) },
  { id: uid('nt'), profileId: 'p-marvin', kind: 'chat', title: 'Earl posted to the house chat', body: 'Tomorrow’s afternoon school run is 15:45, not 15:15 — the school has moved pickup.', url: '#/chat', priority: 'normal', createdAt: h(3), sentAt: h(3) },
  { id: uid('nt'), profileId: 'p-aditya', kind: 'expiry', title: 'Marvin’s passport expires in 25 days', body: 'A visa renewal needs six months validity. This blocks the visa.', url: '#/documents/dc8', priority: 'urgent', createdAt: h(30), sentAt: h(30) },
  { id: uid('nt'), profileId: 'p-earl', kind: 'expiry', title: 'Errands car insurance has lapsed', body: 'Expired 6 days ago. The car must not be driven.', url: '#/register/vehicles/veh2', priority: 'urgent', createdAt: h(140), sentAt: h(140), readAt: h(138) },
  { id: uid('nt'), profileId: 'p-earl', kind: 'bill_due', title: 'Etisalat due in 2 days', body: 'AED 749, on autopay.', url: '#/money/recurring', priority: 'low', createdAt: h(12), sentAt: h(12) },
  { id: uid('nt'), profileId: 'p-marvin', kind: 'task_reminder', title: 'School run in 30 minutes', body: 'Afternoon run, 15:15. Aria and Noor.', url: '#/planner', priority: 'normal', createdAt: h(1), sentAt: h(1) },
  { id: uid('nt'), profileId: 'p-earl', kind: 'coverage_gap', title: 'Coverage gap in 9 days', body: 'Marvin is on leave 9–13 days from now and nobody else in the house drives. Both school runs need a taxi booked for the week.', url: '#/staff', priority: 'high', createdAt: h(50), sentAt: h(50) },
];

export const SEED_PUSH_SUBS: PushSubscriptionRec[] = [
  { id: uid('ps'), profileId: 'p-rosie', device: 'iPad — kitchen', endpoint: 'https://web.push.apple.com/…a41', createdAt: Date.now() - 90 * 864e5, lastSeen: Date.now() - 2 * 36e5, lastDelivery: h(10), active: true },
  { id: uid('ps'), profileId: 'p-rosie', device: 'iPhone', endpoint: 'https://web.push.apple.com/…b22', createdAt: Date.now() - 88 * 864e5, lastSeen: Date.now() - 36e5, lastDelivery: h(10), active: true },
  { id: uid('ps'), profileId: 'p-marvin', device: 'Android — Chrome', endpoint: 'https://fcm.googleapis.com/…c19', createdAt: Date.now() - 80 * 864e5, lastSeen: Date.now() - 4 * 36e5, lastDelivery: h(1), active: true },
  { id: uid('ps'), profileId: 'p-earl', device: 'iPhone', endpoint: 'https://web.push.apple.com/…e77', createdAt: Date.now() - 95 * 864e5, lastSeen: Date.now() - 2 * 36e5, lastDelivery: h(6), active: true },
  { id: uid('ps'), profileId: 'p-earl', device: 'MacBook — Safari', endpoint: 'https://web.push.apple.com/…f31', createdAt: Date.now() - 95 * 864e5, lastSeen: Date.now() - 30 * 864e5, lastDelivery: Date.now() - 30 * 864e5, active: false },
  { id: uid('ps'), profileId: 'p-aditya', device: 'iPhone', endpoint: 'https://web.push.apple.com/…g88', createdAt: Date.now() - 95 * 864e5, lastSeen: Date.now() - 8 * 36e5, lastDelivery: h(30), active: true },
];

const allOn = { assigned: true, reminder: true, escalation: true, response: true };

export const SEED_NOTIF_PREFS: NotificationPref[] = [
  { profileId: 'p-aditya', classes: { ...allOn, assigned: false, reminder: false }, quietFrom: '22:00', quietTo: '07:00' },
  { profileId: 'p-earl', classes: allOn, quietFrom: '23:00', quietTo: '06:30' },
  { profileId: 'p-rosie', classes: { ...allOn, escalation: false }, quietFrom: '21:00', quietTo: '06:00' },
  { profileId: 'p-marvin', classes: { ...allOn, escalation: false }, quietFrom: '21:00', quietTo: '06:00' },
];
