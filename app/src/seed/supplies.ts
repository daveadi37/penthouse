import type {
  InventoryCategory,
  InventoryItem,
  InventoryMovement,
  Meal,
  ShoppingItem,
  WasteEntry,
} from '@/types';
import { addDays, today } from '@/lib/date';
import { uid } from '@/lib/id';

/* Minimums are set so that hitting one is a warning, not an emergency:
   the level is roughly a week's use, because the grocery run is weekly
   and anything that goes below its minimum on a Sunday has to survive
   until the following Saturday. */

export const SEED_INV_CATEGORIES: InventoryCategory[] = [
  { id: 'ic-clean-h', name: 'Cleaning', zone: 'household', order: 1, active: true },
  { id: 'ic-bath-h', name: 'Bathroom', zone: 'household', order: 2, active: true },
  { id: 'ic-kitchen-h', name: 'Kitchen', zone: 'household', order: 3, active: true },
  { id: 'ic-pantry-h', name: 'Pantry & Food', zone: 'household', order: 4, active: true },
  { id: 'ic-cat', name: 'Cat', zone: 'household', order: 5, active: true },
  { id: 'ic-laundry', name: 'Laundry', zone: 'household', order: 6, active: true },
  { id: 'ic-linen', name: 'Linen', zone: 'household', order: 7, active: true },
];

type Row = [name: string, cat: string, zone: 'household', qty: number, min: number, unit: string, recurring: 0 | 1, notes?: string];

const ROWS: Row[] = [
  /* household — cleaning */
  ['Multi-surface cleaner', 'ic-clean-h', 'household', 4, 2, 'bottles', 1],
  ['Disinfectant', 'ic-clean-h', 'household', 2, 1, 'bottles', 1],
  ['Glass cleaner', 'ic-clean-h', 'household', 1, 1, 'bottles', 1],
  ['pH-neutral stone cleaner', 'ic-clean-h', 'household', 1, 1, 'bottles', 1, 'Marble surfaces only. Nothing acidic.'],
  ['Microfibre cloths — household', 'ic-clean-h', 'household', 9, 6, 'units', 0, 'Colour-coded. Bathroom cloths never leave the bathroom.'],
  ['Bin bags — household', 'ic-clean-h', 'household', 2, 2, 'rolls', 1],
  ['Paper towels', 'ic-clean-h', 'household', 5, 3, 'rolls', 1],
  /* household — bathroom */
  ['Toilet paper — household', 'ic-bath-h', 'household', 14, 8, 'rolls', 1],
  ['Tissues', 'ic-bath-h', 'household', 4, 3, 'boxes', 1],
  ['Hand soap — household', 'ic-bath-h', 'household', 3, 2, 'bottles', 1],
  ['Guest toiletry sets', 'ic-bath-h', 'household', 2, 2, 'sets', 0],
  /* household — kitchen */
  ['Dishwasher tablets — household', 'ic-kitchen-h', 'household', 1, 2, 'boxes', 1],
  ['Washing-up liquid', 'ic-kitchen-h', 'household', 2, 1, 'bottles', 1],
  ['Foil & cling film', 'ic-kitchen-h', 'household', 3, 2, 'rolls', 0],
  ['Food storage containers', 'ic-kitchen-h', 'household', 12, 8, 'units', 0],
  ['Labels for leftovers', 'ic-kitchen-h', 'household', 1, 1, 'rolls', 1],
  /* household — pantry */
  ['Chicken', 'ic-pantry-h', 'household', 400, 600, 'g', 1],
  ['Basmati rice', 'ic-pantry-h', 'household', 1000, 500, 'g', 1],
  ['Coconut milk', 'ic-pantry-h', 'household', 4, 3, 'tins', 1],
  ['Cooking oil', 'ic-pantry-h', 'household', 1, 1, 'bottles', 1],
  ['Onions', 'ic-pantry-h', 'household', 6, 4, 'units', 1],
  ['Garlic', 'ic-pantry-h', 'household', 12, 6, 'cloves', 1],
  ['Salt & spices', 'ic-pantry-h', 'household', 8, 4, 'units', 0],
  ['Coffee — household', 'ic-pantry-h', 'household', 2, 1, 'bags', 1],
  ['Bottled water — household', 'ic-pantry-h', 'household', 18, 12, 'bottles', 1],
  ['Tea — household', 'ic-pantry-h', 'household', 3, 1, 'boxes', 1],
  ['Potatoes', 'ic-pantry-h', 'household', 2000, 1000, 'g', 1],
  ['Seasonal vegetables', 'ic-pantry-h', 'household', 1500, 1000, 'g', 1],
  /* cat */
  ['Cat food — wet', 'ic-cat', 'household', 9, 10, 'tins', 1],
  ['Cat food — dry', 'ic-cat', 'household', 1, 1, 'bags', 1],
  ['Cat treats', 'ic-cat', 'household', 2, 1, 'packs', 1],
  ['Cat litter', 'ic-cat', 'household', 1, 2, 'bags', 1, 'Runs down faster than expected in summer.'],
  ['Litter liners', 'ic-cat', 'household', 3, 2, 'packs', 1],
  /* laundry (shared) */
  ['Laundry detergent', 'ic-laundry', 'household', 3, 2, 'bottles', 1],
  ['Fabric softener', 'ic-laundry', 'household', 2, 1, 'bottles', 1],
  ['Stain remover', 'ic-laundry', 'household', 1, 1, 'bottles', 1],
  /* linen */
  ['King bed sheet sets', 'ic-linen', 'household', 4, 3, 'sets', 0],
  ['Queen bed sheet sets', 'ic-linen', 'household', 3, 2, 'sets', 0],
  ['Pillowcases', 'ic-linen', 'household', 12, 8, 'units', 0],
  ['Bath towels', 'ic-linen', 'household', 14, 10, 'units', 0],
  ['Guest towel sets', 'ic-linen', 'household', 3, 2, 'sets', 0, 'Never used by the household.'],
];

export const SEED_INVENTORY: InventoryItem[] = ROWS.map(([name, cat, zone, qty, min, unit, recurring, notes]) => ({
  id: uid('iv'),
  name,
  categoryId: cat,
  zone,
  qty,
  min,
  unit,
  recurring: !!recurring,
  notes: notes ?? '',
  active: true,
}));

/* Movement history, so burn rates have something to compute from. */
export const SEED_MOVEMENTS: InventoryMovement[] = (() => {
  const out: InventoryMovement[] = [];
  // The things that actually move, so the burn rates on the Inventory
  // screen have something real underneath them rather than a flat line.
  const fast = SEED_INVENTORY.filter((i) =>
    /toilet paper|milk|yoghurt|cat|bin bags|water/i.test(i.name),
  );
  for (let d = 28; d >= 1; d--) {
    const date = addDays(today(), -d);
    fast.forEach((item, idx) => {
      if ((d + idx) % 3 !== 0) return;
      out.push({
        id: uid('mv'),
        itemId: item.id,
        delta: -1,
        reason: 'used',
        by: 'p-rosie',
        at: new Date(date + 'T14:00:00').getTime(),
      });
      if ((d + idx) % 12 === 0) {
        out.push({
          id: uid('mv'),
          itemId: item.id,
          delta: 6,
          reason: 'purchased',
          by: 'p-marvin',
          at: new Date(date + 'T10:00:00').getTime(),
        });
      }
    });
  }
  return out;
})();

/* The buy list as it actually looks: a couple of standing runs Marvin
   does without being asked, and whatever Rosie has added since the last
   shop. Anything below its minimum joins them automatically, so nothing
   here needs to duplicate the stock list. */
export const SEED_SHOPPING: ShoppingItem[] = [
  { id: 'sh1', name: 'Daily items — milk and yoghurt', zone: 'household', qty: 1, unit: 'run', status: 'needed', addedBy: 'p-rosie', addedAt: Date.now() - 864e5, notes: '2L low-fat fresh milk, 1kg yoghurt. Marvin. Check the yoghurt first — only buy if it is finished or nearly finished.' },
  { id: 'sh4', name: 'Cat litter', zone: 'household', qty: 3, unit: 'bags', status: 'needed', addedBy: 'p-rosie', addedAt: Date.now() - 3 * 864e5, notes: 'Same brand — Ken will not use the other one.' },
  { id: 'sh5', name: 'Paneer and double cream', zone: 'household', qty: 1, unit: 'run', status: 'needed', addedBy: 'p-rosie', addedAt: Date.now() - 864e5, notes: 'For Thursday and Saturday.' },
  { id: 'sh6', name: 'Buttermilk', zone: 'household', qty: 6, unit: 'litres', status: 'purchased', addedBy: 'p-rosie', addedAt: Date.now() - 5 * 864e5, purchasedAt: Date.now() - 4 * 864e5, cost: 42, notes: 'Rosie makes it up on the day where she can.' },
];

/* ---------- meals ---------- */

const t = today();

/* A week of ordinary household food. Rosie cooks it all. The house eats
   together, so a menu is one dish for everybody plus whatever any one
   person needs separately — Aditya's vegetarian portion is the standing
   one, and the Cooking screen reads that off his profile rather than
   anyone having to remember it. */
export const SEED_MEALS: Meal[] = [
  {
    id: 'm1', date: t, type: 'Breakfast', name: 'Thepla, chundo & chai', portions: 6, serveAt: '08:00', zone: 'household',
    ingredients: [
      { id: 'mi1', name: 'Wheat flour', qty: 500, unit: 'g' },
      { id: 'mi2', name: 'Yoghurt', qty: 200, unit: 'g' },
      { id: 'mi3', name: 'Fresh milk', qty: 500, unit: 'ml' },
    ],
    prep: 'Dough rested overnight.', cook: 'Cooked to order — they go leathery if they sit.',
    diet: 'Vegetarian as it stands — everyone eats the same at breakfast.',
    leftovers: 'None', status: 'Completed', by: 'p-rosie', at: Date.now() - 864e5, approvedBy: 'p-earl', feedback: '',
  },
  {
    id: 'm2', date: t, type: 'Lunch', name: 'Khichdi, kadhi & salad', portions: 8, serveAt: '13:30', zone: 'household',
    ingredients: [
      { id: 'mi4', name: 'Basmati rice', qty: 400, unit: 'g' },
      { id: 'mi5', name: 'Yellow moong dal', qty: 300, unit: 'g' },
      { id: 'mi6', name: 'Yoghurt', qty: 400, unit: 'g' },
      { id: 'mi7', name: 'Gram flour', qty: 60, unit: 'g' },
    ],
    prep: 'Dal soaked from the morning.', cook: 'Kadhi thin, not claggy. Salad dressed at the table.',
    diet: 'Vegetarian throughout, so no separate portion is needed.',
    leftovers: 'Small amount', status: 'Approved', by: 'p-rosie',
    at: Date.now() - 2 * 864e5, approvedBy: 'p-earl', feedback: '',
  },
  {
    id: 'm3', date: t, type: 'Dinner', name: 'Olo, kadhi, khichdi, rotlo & chutney', portions: 18, serveAt: '19:30', zone: 'household',
    ingredients: [
      { id: 'mi8', name: 'Aubergine', qty: 1500, unit: 'g' },
      { id: 'mi9', name: 'Bajra flour', qty: 800, unit: 'g' },
      { id: 'mi10', name: 'Basmati rice', qty: 700, unit: 'g' },
      { id: 'mi11', name: 'Yellow moong dal', qty: 500, unit: 'g' },
      { id: 'mi12', name: 'Yoghurt', qty: 800, unit: 'g' },
      { id: 'mi13', name: 'Buttermilk', qty: 3, unit: 'litres' },
    ],
    prep: 'Rosie starts the olo and the dal in the afternoon and keeps them covered.',
    cook: 'Rotlo made fresh from 19:00, not before — it goes hard within the hour.',
    diet: 'Vegetarian throughout. No separate portion is needed.',
    leftovers: 'Planned leftovers', status: 'Submitted', by: 'p-rosie', at: Date.now() - 6 * 36e5, feedback: '',
  },
  {
    id: 'm4', date: addDays(t, 1), type: 'Lunch', name: 'Vegetable biryani & raita', portions: 8, serveAt: '13:30', zone: 'household',
    ingredients: [
      { id: 'mi14', name: 'Basmati rice', qty: 600, unit: 'g' },
      { id: 'mi15', name: 'Seasonal vegetables', qty: 900, unit: 'g' },
      { id: 'mi16', name: 'Yoghurt', qty: 300, unit: 'g' },
    ],
    prep: 'Mrs Raman arrives at 18:40 — this is the meal before she lands.',
    cook: 'Rest the rice ten minutes before serving.', diet: 'No onion or garlic for Mrs Raman on her first night.',
    leftovers: 'Planned leftovers', status: 'Submitted', by: 'p-rosie', at: Date.now() - 4 * 36e5, feedback: '',
  },
  {
    id: 'm5', date: addDays(t, 1), type: 'Dinner', name: 'Undhiyu, puri & shrikhand', portions: 20, serveAt: '19:30', zone: 'household',
    ingredients: [
      { id: 'mi17', name: 'Seasonal vegetables', qty: 1800, unit: 'g' },
      { id: 'mi18', name: 'Wheat flour', qty: 900, unit: 'g' },
      { id: 'mi19', name: 'Yoghurt', qty: 1200, unit: 'g' },
    ],
    prep: 'Shrikhand hung from the night before.', cook: '',
    diet: 'Guest joining: Mrs Raman, no onion or garlic.',
    leftovers: 'None', status: 'Changes requested', by: 'p-rosie', at: Date.now() - 3 * 36e5, approvedBy: 'p-earl',
    feedback: 'Twenty is right with Mrs Raman and her two, but move it to 20:00 — she lands at 18:40 and will not be seated by half seven.',
  },
  {
    id: 'm6', date: addDays(t, 2), type: 'Lunch', name: 'Dal dhokli & buttermilk', portions: 8, serveAt: '13:30', zone: 'household',
    ingredients: [{ id: 'mi20', name: 'Toor dal', qty: 400, unit: 'g' }, { id: 'mi21', name: 'Buttermilk', qty: 2, unit: 'litres' }],
    prep: '', cook: '', diet: 'Vegetarian throughout.', leftovers: 'None', status: 'Draft', by: 'p-rosie', at: Date.now() - 36e5, feedback: '',
  },
];

export const SEED_WASTE: WasteEntry[] = [
  { id: 'w1', date: addDays(t, -2), mealId: undefined, description: 'Half a tray of biryani', reason: 'Cooked for six, four ate. Second week running.', approxValue: 35, by: 'p-rosie', at: Date.now() - 2 * 864e5 },
  { id: 'w2', date: addDays(t, -4), description: 'Two litres of milk', reason: 'Went over date. Two lots bought in the same week because the buy list was not checked against the fridge first.', approxValue: 18, by: 'p-rosie', at: Date.now() - 4 * 864e5 },
  { id: 'w3', date: addDays(t, -6), description: 'Bag of salad leaves', reason: 'Bought for a lunch that was cancelled.', approxValue: 12, by: 'p-rosie', at: Date.now() - 6 * 864e5 },
  { id: 'w4', date: addDays(t, -9), description: 'Unlabelled containers from the fridge', reason: 'Thursday clear-out. Three containers, undated, nobody could say what was in them or when it was made.', approxValue: 0, by: 'p-rosie', at: Date.now() - 9 * 864e5 },
];
