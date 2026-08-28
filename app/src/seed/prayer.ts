import type {
  CheckGroup,
  DateStr,
  DivoLog,
  ID,
  MenuRow,
  Observance,
  OrderRow,
  PrayerBreak,
  RunningSheet,
  SheetGuestRow,
  SheetPhoto,
  SheetRoleRow,
  ShoppingRow,
  ShrineCheck,
  Stamp,
  TimeStr,
  ToiletCheck,
} from '@/types';
import { addDays, diffDays, today } from '@/lib/date';

/* ============================================================
   The running sheet, transcribed from the two source documents.

   Every string in the templates below is reproduced character for
   character from docs/RUNNING-SHEET-SPEC.md — the em dashes, the en
   dashes in the shift hours, the capitalised PRAYERS BEGIN and the
   exclamation mark on Rosie's salad note included. Nothing here is
   paraphrased, because the house reads these words off the page and
   a reworded duty is a different duty.
   ============================================================ */

/** `YYYY-MM-DD` + `HH:MM` → epoch ms. lib/date has the inverse but not this. */
function stampAt(date: DateStr, time: TimeStr): Stamp {
  return new Date(`${date}T${time}:00`).getTime();
}

const MIN = 60_000;

/* ---------- identity ---------- */

export const SHEET_META = {
  title: 'DAILY PRAYER RUNNING SHEET',
  address: 'Goldcrest Views 1, Jumeirah Lakes Towers, Cluster V, Dubai',
  apartment: '3808',
  whatsappGroup: '3808 Home',
  postByTime: '09:00',
  checkedByName: 'Earl Tiongco',
  /**
   * Thirty days, 13 August to 11 September 2026. Both dates confirmed by
   * Aditya on 2026-08-28. Day one was first worked out from the source
   * document — the sheet dated Friday 21 August is headed '9th day of
   * the Prayer' — and that reading turned out to be right.
   *
   * Moving either date moves the occasion line on every sheet and the
   * window the food rule bites in. Nothing else reads them.
   */
  observanceFrom: '2026-08-13',
  observanceTo: '2026-09-11',
};

/* ---------- the rules ---------- */

export const FOOD_RULE_HEADING = 'FOOD RULE — THIS IS NOT OPTIONAL';

export const FOOD_RULE =
  'All food today is vegetarian. NO meat. NO fish. NO eggs. Milk, cheese, yoghurt and butter are fine. Onion and garlic are fine.\n\nDo not bring meat into the kitchen or the home today. Wash shrine items with the shrine sponge only — that sponge never touches meat or normal washing-up.';

export const PRAYER_ITEM_RULE_HEADING = 'PRAYER ITEM RULE — THIS IS NOT OPTIONAL';

export const PRAYER_ITEM_RULE =
  'Any items brought for prayer (Milk, Yoghurt, Juices, Fruits etc) are to be marked and not used for Consumption.';

export const FOOTER_RULES = [
  'IF YOU ARE NOT SURE ABOUT THE SHRINE OR THE PRAYERS — STOP AND ASK ADITYA BEFORE YOU DO ANYTHING.',
  'Never send this sheet out with the prayer start time or the number of meals left blank.',
];

/* ---------- section 1: who is working today ---------- */

export const ROSTER_TEMPLATE: SheetRoleRow[] = [
  {
    id: 'rt1',
    personId: 'p-rosie',
    who: 'Rosie',
    job: 'House staff — in charge of the kitchen',
    hours: 'Lives in — on duty until close-down',
    duties:
      "Runs the kitchen and tells Reza what to do. Makes the salads. Keeps Jagdishbhai's food covered and reheats it. Dusts the shrine, checks the divo and tops it up.",
    order: 1,
  },
  {
    id: 'rt2',
    personId: 'p-reza',
    who: 'Reza',
    job: 'Helper (paid hourly)',
    hours: '14:00 – 22:00',
    duties:
      'Helps Rosie in the kitchen. Balconies and outside from 17:00. Looks after guests in the breaks. Keeps Ken away. Helps serve and clear up.',
    order: 2,
  },
  {
    id: 'rt3',
    personId: 'p-jagdish',
    who: 'Jagdishbhai',
    job: 'Cook — afternoon',
    hours: '15:00 – 17:00',
    duties:
      "Cooks sabji, dal, farsan and sweets. Hands his food to Rosie before he leaves, with next week's shopping list. Ensures stock for tomorrow's meal is complete before he leaves.",
    order: 3,
  },
  {
    id: 'rt4',
    personId: 'p-hitesh',
    who: 'Hiteshbhai',
    job: 'Cook — evening',
    hours: '19:00 – 21:00',
    duties:
      'Reheats the food. Makes breads fresh — rotli, bhakhri, paratha, rotla. Shows the others how to lay the table.',
    order: 4,
  },
  {
    id: 'rt5',
    personId: 'p-marvin',
    who: 'Marvin',
    job: 'House staff',
    hours: 'As directed',
    duties:
      'Buys milk, yoghurt and regular items. Clears clutter with Rosie. Receives guests and deliveries. Posts deliveries on the group.',
    order: 5,
  },
  {
    id: 'rt6',
    personId: 'p-aditya',
    who: 'Aditya',
    job: 'Looks after the priests; co-ordinates with the chefs on menu and ingredients in advance',
    hours: 'All day',
    duties:
      'Stays with the priests. Passes what they need to Earl or Rosie. Tells Marvin what time prayers will finish so the cook knows when to heat the food.',
    order: 6,
  },
  {
    id: 'rt7',
    personId: 'p-earl',
    who: 'Earl',
    job: 'In charge overall',
    hours: 'All day',
    duties: 'Checks this sheet before it goes out. Ask Earl if anything is unclear.',
    order: 7,
  },
  {
    id: 'rt8',
    personId: 'p-shrien',
    who: 'Shrien',
    job: 'Owner',
    hours: '—',
    duties: 'Owner of the home. Not staff.',
    order: 8,
  },
];

/* ---------- section 2: order of the day ---------- */

/* sortAt is only there to put the free-text labels on a timeline — the
   label is what gets printed and what the house reads. */
const ORDER_ROWS: [string, TimeStr, string, string][] = [
  [
    'Morning',
    '07:00',
    'Marvin buys the regular items — milk, yoghurt and so on. House and shrine made tidy. All clutter put away.',
    'Marvin / Rosie',
  ],
  [
    '09:00',
    '09:00',
    'Prepare a list of anything needed for the day, in case there are regular items to buy.',
    'Rosie',
  ],
  ['14:00', '14:00', 'Reza arrives. Straight into the kitchen to prepare food with Rosie.', 'Rosie / Reza'],
  ['15:00', '15:00', 'Jagdishbhai arrives. Starts the food.', 'Jagdishbhai'],
  [
    'By 15:45',
    '15:45',
    'Prayer set-up finished. Mics on and tested. Everything ready for prayers to start.',
    'Earl / Marvin / Aditya',
  ],
  [
    '16:00',
    '16:00',
    'PRAYERS BEGIN. They run until about 19:30–20:00, with 2 or 3 breaks. Serve water to everyone at every break.',
    'Priests / Reza',
  ],
  [
    '17:00',
    '17:00',
    "Jagdishbhai leaves. Hands his food to Rosie and gives her the shopping list for next week. Stock for tomorrow's meal complete before he leaves. Kitchen is Rosie's until 19:00.",
    'Rosie',
  ],
  [
    'During prayers',
    '17:30',
    'Fill water jugs and glasses. Reza checks cleanliness and restocks toilet paper in the guest toilet every 20 mins. Rosie offers refreshments. Marvin checks Ken is away from the open doors. Aditya stays with the priests. Earl keeps Marvin informed — no messages passed second-hand.',
    'Reza / Aditya / Earl / Rosie',
  ],
  [
    '19:00',
    '19:00',
    'Hiteshbhai arrives. Reheats the food and starts the breads. Tell Marvin what time prayers should finish so the breads are timed right.',
    'Rosie / Earl',
  ],
  ['19:30 – 20:30', '19:30', 'Prayers finish. Aarti, then prasad handed out.', 'Priests'],
  [
    'Straight after aarti',
    '20:30',
    'Meal served. Hiteshbhai shows Rosie, Marvin and Reza how to lay the table.',
    'Hiteshbhai',
  ],
  ['21:00', '21:00', 'Hiteshbhai leaves.', 'Rosie'],
  ['After the meal', '21:15', 'Do the Daily Checks in section 6.', 'Rosie / Reza'],
  ['22:00', '22:00', 'Reza shift ends.', 'Rosie'],
  [
    'Before bed',
    '22:30',
    'Check the divo and top it up. Post photos of the set-up and clear-up on the group. Log any cash spent, with receipts.',
    'Rosie',
  ],
];

export const ORDER_TEMPLATE: OrderRow[] = ORDER_ROWS.map(([timeLabel, sortAt, what, who], i) => ({
  id: `ot${i + 1}`,
  timeLabel,
  sortAt,
  what,
  who,
  order: i + 1,
  done: false,
}));

/* ---------- section 4: shopping list ---------- */

export const SHOPPING_TEMPLATE: ShoppingRow[] = [
  {
    id: 'st1',
    item: 'Daily items — milk and yoghurt',
    howMuch: '2L low-fat fresh milk\n1kg yoghurt',
    inStock: 'unknown',
    whoBuys:
      'Marvin. Mark the containers so prayer items are not used for consumption. Check yoghurt daily — only buy if finished or nearly finished.',
    order: 1,
  },
  {
    id: 'st2',
    item: 'Oil for the divo',
    howMuch: 'Keep 2 spare',
    inStock: 'unknown',
    whoBuys: 'Marvin — first thing',
    order: 2,
  },
  {
    id: 'st3',
    item: 'Flowers, incense, matches, wicks',
    howMuch: '',
    inStock: 'unknown',
    whoBuys: 'Marvin',
    order: 3,
  },
];

/* ---------- section 6: the 31 daily checks ---------- */

const CHECK_GROUPS: [string, string[]][] = [
  [
    'SHRINE — before prayers',
    [
      'Divo lit and topped up — correct oil only',
      'Shoes off before going near the shrine',
      'Dusted with the shrine cloth — no sprays, no chemicals',
      'Used matchsticks and ash cleared away',
      'Statues not moved',
      'Area around the shrine clear',
      'Matches, wicks and 2 spare bottles of divo oil in stock',
    ],
  ],
  [
    'PRAYER SET-UP — finished by 15:45',
    [
      'Mats and seating laid out for the number expected',
      'Mics on and tested',
      'Fresh flowers',
      'Incense',
      'Prasad made and covered',
      'Thali and prayer items laid out',
      'Drinking water and clean glasses ready for the breaks',
      'Prayer books or sheets out, if being used',
    ],
  ],
  [
    'THE HOUSE — before the first guest arrives',
    [
      'Dining room, lounge and balcony clear and tidy',
      'No cat bowls or cleaning things on show',
      'Ken shut away from the prayer area and the open doors',
      'Guest toilet spotless and stocked',
      'Table laid to standard',
      'Rooms aired — no cooking smell in the lounge',
      'Lights set warm for the evening',
    ],
  ],
  [
    'AFTER THE MEAL — close-down',
    [
      'Prayer area cleared and put back',
      'Shrine items washed with the shrine sponge only',
      'Divo checked and topped up before anyone goes to bed',
      'Leftovers covered, labelled and dated',
      'All bins emptied',
      'Kitchen back to normal',
      'Photos of the set-up and clear-up posted on the 3808 Home group',
      'Any cash spent logged, with receipts',
      'Anything broken, missing or missed — tell Earl the same day',
    ],
  ],
];

export const CHECK_TEMPLATE: CheckGroup[] = CHECK_GROUPS.map(([title, items], gi) => ({
  id: `cg${gi + 1}`,
  title,
  items: items.map((text, ii) => ({ id: `cg${gi + 1}-${ii + 1}`, text, done: false })),
}));

/* ---------- building a sheet ---------- */

const cloneRoster = (): SheetRoleRow[] => ROSTER_TEMPLATE.map((r) => ({ ...r }));
const cloneOrder = (): OrderRow[] => ORDER_TEMPLATE.map((r) => ({ ...r, done: false }));
const cloneShopping = (): ShoppingRow[] => SHOPPING_TEMPLATE.map((r) => ({ ...r }));

const cloneChecks = (): CheckGroup[] =>
  CHECK_TEMPLATE.map((g) => ({
    ...g,
    items: g.items.map((i) => ({ ...i, done: false })),
  }));

/** The blank template carries six empty menu lines for the cooks to fill. */
const emptyMenu = (): MenuRow[] =>
  Array.from({ length: 6 }, (_, i) => ({
    id: `mt${i + 1}`,
    dish: '',
    whoMakes: '',
    howMany: '',
    notes: '',
    order: i + 1,
  }));

const menuRows = (rows: [string, string, string, string][]): MenuRow[] =>
  rows.map(([dish, whoMakes, howMany, notes], i) => ({
    id: `mn${i + 1}`,
    dish,
    whoMakes,
    howMany,
    notes,
    order: i + 1,
  }));

export function blankSheet(date: DateStr, occasionLabel?: string): RunningSheet {
  return {
    id: `sheet-${date}`,
    date,
    occasion: occasionLabel ?? '',
    // The meal always follows the prayers, so Dinner is the standing sitting.
    sitting: 'Dinner',
    status: 'draft',
    roster: cloneRoster(),
    order: cloneOrder(),
    menu: emptyMenu(),
    shopping: cloneShopping(),
    sheetGuests: [],
    checks: cloneChecks(),
    breaks: [],
    toiletChecks: [],
    photos: [],
    notes: '',
  };
}

/* ---------- the observance ---------- */

const T = today();

/* Real dates, not offsets from today. An observance has a start and an
   end that the house already agreed, and the sheet dated Friday 21
   August — headed '9th day of the Prayer' — is what fixes day one. */
const OBS_START = SHEET_META.observanceFrom;
const OBS_END = SHEET_META.observanceTo;

export const SEED_OBSERVANCE: Observance = {
  id: 'ob-prayer',
  name: 'The Prayer',
  startDate: OBS_START,
  endDate: OBS_END,
  dayCount: diffDays(OBS_START, OBS_END) + 1,
  notes:
    'Thirty days, from the 13th of August to the 11th of September. The priests lead every afternoon from 16:00 and the meal follows the aarti. The ninth day was the large sitting.',
  active: true,
};

/** True while the running sheet is the front of the app rather than a record. */
export function withinObservance(date: DateStr): boolean {
  return date >= OBS_START && date <= OBS_END;
}

/** How many days of the observance are left, today included. Zero once it is over. */
export function daysRemaining(date: DateStr): number {
  if (date > OBS_END) return 0;
  const from = date < OBS_START ? OBS_START : date;
  return diffDays(from, OBS_END) + 1;
}

export function ordinalDay(n: number): string {
  const r = n % 100;
  if (r >= 11 && r <= 13) return `${n}th`;
  const suffix = n % 10 === 1 ? 'st' : n % 10 === 2 ? 'nd' : n % 10 === 3 ? 'rd' : 'th';
  return `${n}${suffix}`;
}

/** Day 1 is the start date. Returns 0 outside the observance. */
export function observanceDayNo(o: Observance, date: DateStr): number {
  if (date < o.startDate || date > o.endDate) return 0;
  return diffDays(o.startDate, date) + 1;
}

/** '9th day of the Prayer' — the occasion line as it is printed. */
export function occasionFor(o: Observance, date: DateStr): string {
  const n = observanceDayNo(o, date);
  if (!n) return '';
  return `${ordinalDay(n)} day of ${o.name.replace(/^The /, 'the ')}`;
}

/* ---------- filling in a finished sheet ---------- */

const PERSON_BY_NAME: Record<string, ID> = {
  Rosie: 'p-rosie',
  Reza: 'p-reza',
  Jagdishbhai: 'p-jagdish',
  Hiteshbhai: 'p-hitesh',
  Marvin: 'p-marvin',
  Aditya: 'p-aditya',
  Earl: 'p-earl',
  Shrien: 'p-shrien',
  Priests: 'p-priests',
};

const firstPerson = (who: string): ID | undefined => PERSON_BY_NAME[who.split(' / ')[0]!.trim()];

interface TickPlan {
  by: ID[];
  from: TimeStr;
  every: number;
}

/* Who ticks which group, and roughly when. Rosie takes the shrine because
   that is her duty on the roster; the set-up is Marvin, Earl and Aditya. */
const TICK_PLAN: TickPlan[] = [
  { by: ['p-rosie'], from: '10:00', every: 6 },
  { by: ['p-marvin', 'p-earl', 'p-aditya'], from: '14:15', every: 10 },
  { by: ['p-rosie', 'p-reza'], from: '15:00', every: 7 },
  { by: ['p-reza', 'p-rosie'], from: '21:20', every: 8 },
];

/** All 31 ticked, spread across the day by whoever the plan says. */
function tickedChecks(date: DateStr, upTo: number[] = [7, 8, 7, 9]): CheckGroup[] {
  return CHECK_TEMPLATE.map((g, gi) => {
    const plan = TICK_PLAN[gi]!;
    const cut = upTo[gi] ?? 0;
    return {
      ...g,
      items: g.items.map((item, ii) => {
        if (ii >= cut) return { ...item, done: false };
        return {
          ...item,
          done: true,
          doneBy: plan.by[ii % plan.by.length]!,
          doneAt: stampAt(date, plan.from) + ii * plan.every * MIN,
        };
      }),
    };
  });
}

function doneOrder(date: DateStr): OrderRow[] {
  return cloneOrder().map((r) => ({
    ...r,
    done: true,
    doneBy: firstPerson(r.who),
    doneAt: stampAt(date, r.sortAt ?? '12:00') + 5 * MIN,
  }));
}

function breaksFor(date: DateStr, spans: [TimeStr, TimeStr, ID][]): PrayerBreak[] {
  return spans.map(([from, to, by], i) => ({
    id: `br${i + 1}`,
    startedAt: stampAt(date, from),
    endedAt: stampAt(date, to),
    waterServed: true,
    servedBy: by,
    notes: '',
  }));
}

/** Reza's twenty-minute round of the guest toilet while the prayers run. */
function toiletChecksFor(date: DateStr, from: TimeStr, count: number): ToiletCheck[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `tc${i + 1}`,
    at: stampAt(date, from) + i * 20 * MIN,
    by: 'p-reza',
    restocked: i % 3 === 0,
    clean: true,
    notes: i === 3 ? 'Second roll put out — the holder was down to the last few sheets.' : '',
  }));
}

function photosFor(date: DateStr): SheetPhoto[] {
  // path is blank: the photographs live in the WhatsApp group, and the
  // sheet only records that they went out and who sent them.
  return [
    { id: 'ph1', kind: 'setup', path: '', at: stampAt(date, '15:50'), by: 'p-marvin', postedToGroup: true },
    { id: 'ph2', kind: 'clearup', path: '', at: stampAt(date, '22:35'), by: 'p-rosie', postedToGroup: true },
  ];
}

const guestRows = (rows: [string, string, string][]): SheetGuestRow[] =>
  rows.map(([name, arriving, notes], i) => ({ id: `gs${i + 1}`, name, arriving, notes, order: i + 1 }));

/** A sheet that ran its course, was checked and went out to the group. */
function postedSheet(date: DateStr, dayNo: number, over: Partial<RunningSheet>): RunningSheet {
  return {
    ...blankSheet(date, `${ordinalDay(dayNo)} day of the Prayer`),
    occasionDayNo: dayNo,
    prayersStart: '16:00',
    prayersEnd: '19:30',
    status: 'posted',
    order: doneOrder(date),
    checks: tickedChecks(date),
    breaks: breaksFor(date, [
      ['16:55', '17:10', 'p-reza'],
      ['17:55', '18:08', 'p-reza'],
    ]),
    toiletChecks: toiletChecksFor(date, '16:20', 9),
    photos: photosFor(date),
    preparedBy: 'Rosie',
    preparedAt: stampAt(date, '08:40'),
    checkedBy: SHEET_META.checkedByName,
    checkedAt: stampAt(date, '08:52'),
    postedAt: stampAt(date, '08:57'),
    ...over,
  };
}

/* ---------- the sheets ---------- */

const DAY9 = addDays(T, -7);
const DAY6 = addDays(T, -10);
const DAY3 = addDays(T, -13);

/* The 21 August sheet, reproduced. Its menu, its one guest and its one
   shopping row are the document's own — including the note Rosie left
   about the lunch menu, which is why it reads the way it does. */
const SHEET_DAY9: RunningSheet = postedSheet(DAY9, 9, {
  occasion: '9th day of the Prayer',
  meals: 22,
  guests: 1,
  actualPrayersEnd: '19:45',
  menu: menuRows([
    ['OLO', 'Jagdishbhai', '', ''],
    ['KADHI', 'Jagdishbhai', '', ''],
    ['KHICHDI', 'Jagdishbhai', '', ''],
    ['Rotlo / Bhakhri', 'Hiteshbhai', '', ''],
    ['Chutney & Chillies', 'Jagdishbhai', '', ''],
    ['Salad 2 types', 'Rosie', '', 'Rosie is still yet to send the Lunch Menu up to Saturday!'],
    ['Buttermilk', 'Rosie', '', ''],
    ['Milk', '', '', 'Double Cream'],
  ]),
  sheetGuests: guestRows([['Mama', '-', 'Prefer sugar-free Tea']]),
  shopping: [
    {
      id: 'st1',
      item: 'Daily items — milk and yoghurt',
      howMuch: '2L low-fat fresh milk\n1kg yoghurt',
      inStock: 'yes',
      whoBuys:
        'Marvin. Mark the containers so prayer items are not used for consumption. Check yoghurt daily — only buy if finished or nearly finished.',
      order: 1,
    },
  ],
  breaks: breaksFor(DAY9, [
    ['16:55', '17:10', 'p-reza'],
    ['17:55', '18:08', 'p-reza'],
    ['18:50', '19:02', 'p-rosie'],
  ]),
  toiletChecks: toiletChecksFor(DAY9, '16:20', 10),
  notes:
    'Prayers ran fifteen minutes past 19:30. Aditya passed the finish time to Marvin at 19:20 so Hiteshbhai held the breads back — the table went out at 20:05 and nothing was dry.',
});

const SHEET_DAY6: RunningSheet = postedSheet(DAY6, 6, {
  meals: 14,
  guests: 0,
  actualPrayersEnd: '19:25',
  menu: menuRows([
    ['Sabji — bhinda', 'Jagdishbhai', '', ''],
    ['Dal', 'Jagdishbhai', '', ''],
    ['Bhaat', 'Jagdishbhai', '', ''],
    ['Rotli', 'Hiteshbhai', '', 'Made fresh at 19:40'],
    ['Salad 2 types', 'Rosie', '', ''],
    ['Buttermilk', 'Rosie', '', ''],
  ]),
  notes: 'Quiet day, household only. Divo oil down to one spare — Marvin to buy two first thing.',
});

const SHEET_DAY3: RunningSheet = postedSheet(DAY3, 3, {
  meals: 18,
  guests: 4,
  actualPrayersEnd: '20:05',
  menu: menuRows([
    ['Sabji — ringan bateta', 'Jagdishbhai', '', ''],
    ['Kadhi', 'Jagdishbhai', '', ''],
    ['Khichdi', 'Jagdishbhai', '', ''],
    ['Bhakhri', 'Hiteshbhai', '', ''],
    ['Farsan — dhokla', 'Jagdishbhai', '', 'Steamed in the afternoon, kept covered'],
    ['Salad 2 types', 'Rosie', '', ''],
    ['Shrikhand', 'Jagdishbhai', '', 'Prayer item — marked, not for the table'],
  ]),
  sheetGuests: guestRows([
    ['Mama', '15:30', 'Prefer sugar-free Tea'],
    ['Bhabhi and family', '15:45', 'Three of them. No chilli for the youngest.'],
  ]),
  breaks: breaksFor(DAY3, [
    ['16:50', '17:05', 'p-reza'],
    ['17:50', '18:05', 'p-reza'],
    ['19:00', '19:12', 'p-reza'],
  ]),
  toiletChecks: toiletChecksFor(DAY3, '16:20', 11),
  notes:
    'Prayers ran to 20:05. Mics cut out twice in the first hour — Reza swapped the battery in the second one. Worth a spare set before the last week.',
});

/* Today, part-way through. The shrine is nearly done because Rosie does it
   in the morning; the set-up has started; the house and the close-down have
   not. Nothing is posted yet — that is the job the sheet opens on. */
const SHEET_TODAY: RunningSheet = {
  ...blankSheet(T, occasionFor(SEED_OBSERVANCE, T)),
  occasionDayNo: observanceDayNo(SEED_OBSERVANCE, T),
  meals: 18,
  guests: 3,
  prayersStart: '16:00',
  prayersEnd: '19:30',
  order: cloneOrder().map((r, i) =>
    i < 2
      ? { ...r, done: true, doneBy: firstPerson(r.who), doneAt: stampAt(T, r.sortAt ?? '09:00') + 20 * MIN }
      : r,
  ),
  menu: menuRows([
    ['OLO', 'Jagdishbhai', '', ''],
    ['KADHI', 'Jagdishbhai', '', ''],
    ['KHICHDI', 'Jagdishbhai', '', ''],
    ['Rotlo / Bhakhri', 'Hiteshbhai', '', 'Fresh after the aarti'],
    ['Salad 2 types', 'Rosie', '', 'Waiting on Jagdishbhai to confirm the farsan'],
    ['Buttermilk', 'Rosie', '', ''],
  ]),
  shopping: [
    {
      ...SHOPPING_TEMPLATE[0]!,
      inStock: 'yes',
      notes: 'Marvin bought both at 07:20. Milk marked for prayer.',
    },
    { ...SHOPPING_TEMPLATE[1]!, inStock: 'partial', notes: 'One spare bottle only. Second one still to buy.' },
    { ...SHOPPING_TEMPLATE[2]!, inStock: 'yes', notes: 'Flowers came with the morning delivery.' },
  ],
  sheetGuests: guestRows([
    ['Mama', '15:30', 'Prefer sugar-free Tea'],
    ['Kaka and Kaki', '15:45', 'Both need chairs, not floor seating. No chilli.'],
  ]),
  checks: tickedChecks(T, [6, 3, 0, 0]),
  preparedAt: stampAt(T, '08:35'),
  notes:
    'Aditya to confirm the priests will finish by 19:30 so Hiteshbhai can time the breads. Second bottle of divo oil still outstanding.',
};

export const SEED_SHEETS: Record<DateStr, RunningSheet> = {
  [DAY3]: SHEET_DAY3,
  [DAY6]: SHEET_DAY6,
  [DAY9]: SHEET_DAY9,
  [T]: SHEET_TODAY,
};

/* ---------- the shrine ---------- */

/* Two weeks of the divo. It burns down over about three days, and Rosie
   tops it up — which is exactly the pattern the shopping list is guarding
   against with its two spare bottles. */
export const SEED_DIVO_LOG: DivoLog[] = (() => {
  const out: DivoLog[] = [];
  const levels: DivoLog['oilLevel'][] = ['full', 'half', 'low'];
  let n = 0;
  const push = (e: Omit<DivoLog, 'id'>) => out.push({ id: `dv${++n}`, ...e });

  for (let back = 13; back >= 0; back--) {
    const date = addDays(T, -back);

    if (back % 3 === 1) {
      push({
        at: stampAt(date, '15:20'),
        by: 'p-rosie',
        action: 'topped',
        oilLevel: 'full',
        notes: 'Topped from the spare bottle before the set-up.',
      });
    }

    // One accidental go-out, relit straight away — the balcony door was open.
    if (back === 6) {
      push({
        at: stampAt(date, '18:40'),
        by: 'p-reza',
        action: 'extinguished',
        oilLevel: 'half',
        notes: 'Went out in the draught from the second balcony. Told Rosie immediately.',
      });
      push({ at: stampAt(date, '18:45'), by: 'p-rosie', action: 'lit', oilLevel: 'half' });
    }

    push({
      at: stampAt(date, '22:30'),
      by: 'p-rosie',
      action: 'checked',
      oilLevel: levels[(13 - back) % 3],
      notes: back === 10 ? 'Down to one spare bottle. Told Marvin.' : '',
    });
  }
  return out;
})();

export const SEED_SHRINE_CHECKS: ShrineCheck[] = (() => {
  const out: ShrineCheck[] = [];
  for (let back = 13; back >= 0; back--) {
    const date = addDays(T, -back);
    out.push({
      id: `sc${14 - back}`,
      date,
      by: 'p-rosie',
      at: stampAt(date, '10:15'),
      dusted: true,
      statuesUntouched: true,
      // Two honest exceptions, because a fortnight of perfect rows is nobody's fortnight.
      ashCleared: back !== 8,
      areaClear: back !== 4,
      notes:
        back === 8
          ? 'Ash left in the tray until after the prayers — the priests asked for it to stay.'
          : back === 4
            ? 'Delivery boxes stacked near the shrine on arrival. Marvin moved them before 15:00.'
            : '',
    });
  }
  return out;
})();
