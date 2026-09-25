import type { Area, Settings } from '@/types';
import { addDays, today } from '@/lib/date';

/* ============================================================
   Apartment 3808, Goldcrest Views 1.

   The office side was dropped on 2026-08-28 — this is one household on
   one floor now, and every area below is inside 3808. It is also where
   Aditya works, which is why the standards read as they do: the lounge
   and the dining room are both a home and a place someone takes a call.
   ============================================================ */

export const SEED_AREAS: Area[] = [
  { id: 'a-lv1', name: 'Lounge', type: 'living', zone: 'household', floor: '38', status: 'active', deepFreq: 14, deepDow: 3, parity: 0, standard: 'Cushions plumped, surfaces clear, no cooking smell, lights set warm for the evening.', active: true },
  { id: 'a-lv2', name: 'Dining Room', type: 'living', zone: 'household', floor: '38', status: 'active', deepFreq: 14, deepDow: 3, parity: 1, standard: 'Table laid to standard, chairs aligned and evenly spaced.', active: true },
  { id: 'a-kt1', name: 'Kitchen', type: 'kitchen', zone: 'household', floor: '38', status: 'active', deepFreq: 7, deepDow: 4, parity: 0, standard: 'Empty countertops, dry sink, polished tap. Vegetarian food prepared with its own board and pan, never the ones meat has been on.', active: true },
  { id: 'a-ba3', name: 'Guest Toilet', type: 'bathroom', zone: 'household', floor: '38', status: 'active', use: 'high', deepFreq: 7, deepDow: 2, parity: 0, standard: 'Spotless and stocked. Checked again at midday — it is the one a visitor uses.', active: true },
  { id: 'a-br1', name: 'Master Bedroom', type: 'bedroom', zone: 'household', floor: '38', status: 'occupied', deepFreq: 14, deepDow: 1, parity: 0, standard: 'Symmetrical, calm, no personal clutter visible from the doorway.', active: true },
  { id: 'a-br2', name: 'Bedroom 2', type: 'bedroom', zone: 'household', floor: '38', status: 'occupied', deepFreq: 14, deepDow: 2, parity: 0, standard: 'Symmetrical, calm, no personal clutter visible from the doorway.', active: true },
  { id: 'a-br3', name: 'Bedroom 3 — Guest', type: 'bedroom', zone: 'household', floor: '38', status: 'guest', deepFreq: 14, deepDow: 3, parity: 1, standard: 'Kept permanently guest-ready, whether or not anyone is expected.', active: true },
  { id: 'a-ot1', name: 'Balcony — main', type: 'outdoor', zone: 'household', floor: '38', status: 'active', deepFreq: 14, deepDow: 6, parity: 0, standard: 'No sand or leaf litter, furniture square, glass clear. Late afternoon, once the sun is off it.', active: true },
  { id: 'a-ot2', name: 'Balcony — second', type: 'outdoor', zone: 'household', floor: '38', status: 'active', deepFreq: 14, deepDow: 6, parity: 1, standard: 'Swept and clear. Keep the door shut — it is the draught that blows the lounge doors about.', active: true },
  { id: 'a-cr1', name: 'Entrance & Hallway', type: 'circulation', zone: 'household', floor: '38', status: 'active', deepFreq: 7, deepDow: 5, parity: 0, standard: 'First thing a guest sees. Shoes off here. Floor dry, glass clear, nothing stored here.', active: true },
  { id: 'a-ut1', name: 'Laundry & Utility', type: 'utility', zone: 'household', floor: '38', status: 'active', deepFreq: 14, deepDow: 6, parity: 0, standard: 'Machines wiped, filters clear, floor dry, nothing left in a drum overnight.', active: true },
  { id: 'a-st2', name: 'Store', type: 'storage', zone: 'household', floor: '38', status: 'active', deepFreq: 30, deepDow: 6, parity: 0, standard: 'Stock visible and countable from the door. Nothing stacked in front of anything else — a count you cannot do from the doorway does not get done.', active: true },
];

export const SEED_SETTINGS: Settings = {
  house: 'Goldcrest Views 3808',
  address: 'Goldcrest Views 1, Jumeirah Lakes Towers, Cluster V, Dubai',
  currency: 'AED',
  locale: 'en-AE',
  mealTimes: { Breakfast: '08:00', Lunch: '13:30', Dinner: '19:30' },
  portionDefault: 4,
  // Sunday to Thursday. Deliveries, vendors and the school run keep to
  // it; the house itself runs seven days a week.
  workingWeek: { days: [0, 1, 2, 3, 4], start: '09:00', end: '18:00' },
  alertLeadDays: 30,
  laundry: {
    0: [{ person: 'Household', type: 'Catch-up & anything outstanding' }],
    1: [{ person: 'Salyna', type: 'Clothing' }],
    2: [{ person: 'Charlie', type: 'Clothing' }],
    3: [{ person: 'Aria', type: 'Clothing' }],
    4: [{ person: 'Noor', type: 'Clothing' }],
    5: [{ person: 'Household', type: 'Towels' }],
    6: [{ person: 'Household', type: 'Bedding' }],
  },
  laundryStages: ['Wash', 'Dry', 'Fold', 'Iron', 'Put away'],
  unusedDows: [1, 5],
  planStart: '06:00',
  planEnd: '22:00',
  parityEpoch: addDays(today(), -((new Date().getDay() + 6) % 7)),
};
