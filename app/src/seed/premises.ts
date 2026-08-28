import type { Area, Settings } from '@/types';
import { addDays, today } from '@/lib/date';
import { SHEET_META } from './prayer';

/* ============================================================
   Apartment 3808, Goldcrest Views 1.

   The office side was dropped on 2026-08-28 — this is one household on
   one floor now, and every area below is inside 3808.

   Two rooms are the reason the rest of the app exists: the Shrine and
   the Prayer Area. They are typed separately from 'living' because the
   rules that apply to them apply nowhere else — shrine cloth only,
   shrine sponge only, statues not moved, and nothing decided about
   either without asking Aditya.
   ============================================================ */

export const SEED_AREAS: Area[] = [
  { id: 'a-sh1', name: 'Shrine', type: 'shrine', zone: 'household', floor: '38', status: 'active', deepFreq: 7, deepDow: 1, parity: 0, standard: 'Dusted with the shrine cloth only — no sprays, no chemicals. Statues not moved. Used matchsticks and ash cleared. Divo lit and topped up with the correct oil.', active: true },
  { id: 'a-pr1', name: 'Prayer Area', type: 'prayer', zone: 'household', floor: '38', status: 'active', deepFreq: 7, deepDow: 6, parity: 0, standard: 'Mats and seating square and laid out for the number expected. Mics tested. Cleared and put back after every sitting. Ken never in here.', active: true },
  { id: 'a-lv1', name: 'Lounge', type: 'living', zone: 'household', floor: '38', status: 'active', deepFreq: 14, deepDow: 3, parity: 0, standard: 'Cushions plumped, surfaces clear, no cooking smell, lights set warm for the evening.', active: true },
  { id: 'a-lv2', name: 'Dining Room', type: 'living', zone: 'household', floor: '38', status: 'active', deepFreq: 14, deepDow: 3, parity: 1, standard: 'Table laid to standard, chairs aligned and evenly spaced.', active: true },
  { id: 'a-kt1', name: 'Kitchen', type: 'kitchen', zone: 'household', floor: '38', status: 'active', deepFreq: 7, deepDow: 4, parity: 0, standard: 'Empty countertops, dry sink, polished tap. No meat in here on a prayer day. Shrine items washed with the shrine sponge only.', active: true },
  { id: 'a-ba3', name: 'Guest Toilet', type: 'bathroom', zone: 'household', floor: '38', status: 'active', use: 'high', deepFreq: 7, deepDow: 2, parity: 0, standard: 'Spotless and stocked. Checked and toilet paper restocked every 20 minutes while the prayers run.', active: true },
  { id: 'a-br1', name: 'Master Bedroom', type: 'bedroom', zone: 'household', floor: '38', status: 'occupied', deepFreq: 14, deepDow: 1, parity: 0, standard: 'Symmetrical, calm, no personal clutter visible from the doorway.', active: true },
  { id: 'a-br2', name: 'Bedroom 2', type: 'bedroom', zone: 'household', floor: '38', status: 'occupied', deepFreq: 14, deepDow: 2, parity: 0, standard: 'Symmetrical, calm, no personal clutter visible from the doorway.', active: true },
  { id: 'a-br3', name: 'Bedroom 3 — Guest', type: 'bedroom', zone: 'household', floor: '38', status: 'guest', deepFreq: 14, deepDow: 3, parity: 1, standard: 'Kept permanently guest-ready. Used by the priests when they stay.', active: true },
  { id: 'a-ot1', name: 'Balcony — main', type: 'outdoor', zone: 'household', floor: '38', status: 'active', deepFreq: 14, deepDow: 6, parity: 0, standard: 'No sand or leaf litter, furniture square, glass clear. Reza from 17:00.', active: true },
  { id: 'a-ot2', name: 'Balcony — second', type: 'outdoor', zone: 'household', floor: '38', status: 'active', deepFreq: 14, deepDow: 6, parity: 1, standard: 'Swept and clear. The door is the draught that puts the divo out — keep it shut during prayers.', active: true },
  { id: 'a-cr1', name: 'Entrance & Hallway', type: 'circulation', zone: 'household', floor: '38', status: 'active', deepFreq: 7, deepDow: 5, parity: 0, standard: 'First thing a guest sees. Shoes off here. Floor dry, glass clear, nothing stored here.', active: true },
  { id: 'a-ut1', name: 'Laundry & Utility', type: 'utility', zone: 'household', floor: '38', status: 'active', deepFreq: 14, deepDow: 6, parity: 0, standard: 'Machines wiped, filters clear, floor dry, nothing left in a drum overnight.', active: true },
  { id: 'a-st2', name: 'Store', type: 'storage', zone: 'household', floor: '38', status: 'active', deepFreq: 30, deepDow: 6, parity: 0, standard: 'Stock visible and countable from the door. Divo oil, wicks and matches always two deep.', active: true },
];

export const SEED_SETTINGS: Settings = {
  house: 'Goldcrest Views 3808',
  address: SHEET_META.address,
  whatsappGroup: SHEET_META.whatsappGroup,
  sheetPostBy: SHEET_META.postByTime,
  checkedByName: SHEET_META.checkedByName,
  currency: 'AED',
  locale: 'en-AE',
  mealTimes: { Breakfast: '08:00', Lunch: '13:30', Dinner: '19:30' },
  portionDefault: 4,
  // Sunday to Thursday. The cooks and the deliveries keep to it; the
  // prayers do not, which is why the sheet exists seven days a week.
  workingWeek: { days: [0, 1, 2, 3, 4], start: '09:00', end: '18:00' },
  observanceWindow: { from: SHEET_META.observanceFrom, to: SHEET_META.observanceTo },
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
