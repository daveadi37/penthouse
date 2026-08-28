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

/* Prayer stock is counted apart from the kitchen, and two flags carry
   rules that exist nowhere else: prayer_item is marked and never used
   for consumption, shrineOnly never meets a chemical or meat. Divo oil
   sits at a minimum of two, not one, because it burns down over about
   three days and Marvin buys it first thing — one spare is already a
   problem. */

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
  // The things that actually move. During the observance that is the
  // prayer stock as much as the kitchen — the divo burns down over about
  // three days and Marvin buys the oil first thing.
  const fast = SEED_INVENTORY.filter((i) =>
    /toilet paper|milk|yoghurt|cat|bin bags|water|divo|wick|matches|flower|incense/i.test(i.name),
  );
  const prayerStock = (name: string) => /divo|wick|matches|flower|incense/i.test(name);
  for (let d = 28; d >= 1; d--) {
    const date = addDays(today(), -d);
    fast.forEach((item, idx) => {
      if ((d + idx) % 3 !== 0) return;
      out.push({
        id: uid('mv'),
        itemId: item.id,
        delta: -1,
        reason: 'used',
        by: prayerStock(item.name) ? 'p-rosie' : 'p-rosie',
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

/* The three standing rows are the ones printed on every running sheet.
   They are on the list every day of the observance whether or not
   anyone adds them, which is the point of them being standing. */
export const SEED_SHOPPING: ShoppingItem[] = [
  { id: 'sh1', name: 'Daily items — milk and yoghurt', zone: 'household', qty: 1, unit: 'run', status: 'needed', addedBy: 'p-rosie', addedAt: Date.now() - 864e5, notes: '2L low-fat fresh milk, 1kg yoghurt. Marvin. Mark the containers so prayer items are not used for consumption. Check the yoghurt daily — only buy if finished or nearly finished.' },
  { id: 'sh2', name: 'Oil for the divo', zone: 'household', qty: 2, unit: 'bottles', status: 'needed', addedBy: 'p-rosie', addedAt: Date.now() - 2 * 864e5, notes: 'Keep 2 spare. Marvin, first thing. Correct oil only.' },
  { id: 'sh3', name: 'Flowers, incense, matches, wicks', zone: 'household', qty: 1, unit: 'set', status: 'needed', addedBy: 'p-rosie', addedAt: Date.now() - 864e5, notes: 'Marvin. Fresh flowers for the set-up.' },
  { id: 'sh4', name: 'Cat litter', zone: 'household', qty: 3, unit: 'bags', status: 'needed', addedBy: 'p-rosie', addedAt: Date.now() - 3 * 864e5, notes: 'Same brand — Ken will not use the other one.' },
  { id: 'sh5', name: 'Paneer and double cream', zone: 'household', qty: 1, unit: 'run', status: 'needed', addedBy: 'p-rosie', addedAt: Date.now() - 864e5, notes: 'For Thursday and Saturday. Vegetarian only until the 11th — no meat, no fish, no eggs in the house.' },
  { id: 'sh6', name: 'Buttermilk', zone: 'household', qty: 6, unit: 'litres', status: 'purchased', addedBy: 'p-rosie', addedAt: Date.now() - 5 * 864e5, purchasedAt: Date.now() - 4 * 864e5, cost: 42, notes: 'Rosie makes it up on the day where she can.' },
];

/* ---------- meals ---------- */

const t = today();

/* Every one of these falls inside the observance, so every one of them
   is vegetarian. The menu is the running sheet's own: the two cooks
   make the food, Rosie makes the salads and the buttermilk, and the
   breads are Hiteshbhai's, fresh, in the evening. Nothing here contains
   meat, fish or eggs — see foodRuleBreaches() in lib/foodrule.ts, which
   refuses to let a meal be approved while it does. */
export const SEED_MEALS: Meal[] = [
  {
    id: 'm1', date: t, type: 'Breakfast', name: 'Thepla, chundo & chai', portions: 6, serveAt: '08:00', zone: 'household',
    ingredients: [
      { id: 'mi1', name: 'Wheat flour', qty: 500, unit: 'g' },
      { id: 'mi2', name: 'Yoghurt', qty: 200, unit: 'g' },
      { id: 'mi3', name: 'Fresh milk', qty: 500, unit: 'ml' },
    ],
    prep: 'Dough rested overnight.', cook: 'Cooked to order — they go leathery if they sit.',
    diet: 'Vegetarian. Prayer-marked milk is not to be used.',
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
    diet: 'Vegetarian — observance. No meat, no fish, no eggs in the kitchen today.',
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
    prep: 'Jagdishbhai cooks 15:00–17:00 and hands the food to Rosie before he leaves. Rosie keeps it covered and reheats.',
    cook: 'Hiteshbhai from 19:00 — breads fresh, timed to when the prayers actually finish. Ask Marvin for the finish time before starting.',
    diet: 'Vegetarian — observance. Milk, cheese, yoghurt and butter are fine. Onion and garlic are fine.',
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
    cook: 'Rest the rice ten minutes before serving.', diet: 'Vegetarian. No onion or garlic for Mrs Raman on her first night.',
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
    diet: 'Vegetarian — observance. Guest joining: Mrs Raman, no onion or garlic.',
    leftovers: 'None', status: 'Changes requested', by: 'p-rosie', at: Date.now() - 3 * 36e5, approvedBy: 'p-earl',
    feedback: 'Twenty is right with Mrs Raman and her two, but move it to 20:00 — she lands at 18:40 and will not be seated by half seven.',
  },
  {
    id: 'm6', date: addDays(t, 2), type: 'Lunch', name: 'Dal dhokli & buttermilk', portions: 8, serveAt: '13:30', zone: 'household',
    ingredients: [{ id: 'mi20', name: 'Toor dal', qty: 400, unit: 'g' }, { id: 'mi21', name: 'Buttermilk', qty: 2, unit: 'litres' }],
    prep: '', cook: '', diet: 'Vegetarian — observance.', leftovers: 'None', status: 'Draft', by: 'p-rosie', at: Date.now() - 36e5, feedback: '',
  },
];

export const SEED_WASTE: WasteEntry[] = [
  { id: 'w1', date: addDays(t, -2), mealId: undefined, description: 'Half a tray of biryani', reason: 'Cooked for six, four ate. Second week running.', approxValue: 35, by: 'p-rosie', at: Date.now() - 2 * 864e5 },
  { id: 'w2', date: addDays(t, -4), description: 'Two litres of milk', reason: 'Went over date. Bought on the same run as the prayer-marked milk and mixed up with it, so nobody would touch either.', approxValue: 18, by: 'p-reza', at: Date.now() - 4 * 864e5 },
  { id: 'w3', date: addDays(t, -6), description: 'Bag of salad leaves', reason: 'Bought for a lunch that was cancelled.', approxValue: 12, by: 'p-rosie', at: Date.now() - 6 * 864e5 },
  { id: 'w4', date: addDays(t, -9), description: 'Unlabelled containers from the fridge', reason: 'Thursday clear-out. Three containers, undated, nobody claimed them. Could not be ruled out as prayer stock, so none of it could be used.', approxValue: 0, by: 'p-reza', at: Date.now() - 9 * 864e5 },
];
