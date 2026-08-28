import type { LibraryTask, Procedure, TaskCategory } from '@/types';

/* The task library. Nothing in the checklist is hard-coded at render
   time — every task on every day comes from here, crossed with the
   area list and the recurrence engine. */

export const SEED_CATEGORIES: TaskCategory[] = [
  { id: 'c-cat', name: 'Cat Care', icon: '🐱', order: 1, zone: 'household', active: true },
  { id: 'c-open', name: 'Opening Up', icon: '🌅', order: 2, zone: 'any', active: true },
  { id: 'c-bed', name: 'Bedrooms', icon: '🛏', order: 3, zone: 'household', active: true },
  { id: 'c-bath', name: 'Bathrooms', icon: '🛁', order: 4, zone: 'any', active: true },
  { id: 'c-kitchen', name: 'Kitchen', icon: '🍳', order: 5, zone: 'household', active: true },
  { id: 'c-living', name: 'Living Areas', icon: '🛋', order: 6, zone: 'household', active: true },
  { id: 'c-reception', name: 'Reception & Entrance', icon: '🚪', order: 9, zone: 'household', active: true },
  { id: 'c-waste', name: 'Waste & Recycling', icon: '♻️', order: 10, zone: 'any', active: true },
  { id: 'c-laundry', name: 'Laundry', icon: '🧺', order: 11, zone: 'household', system: 'laundry', active: true },
  { id: 'c-cooking', name: 'Cooking', icon: '🍲', order: 12, zone: 'any', system: 'cooking', active: true },
  { id: 'c-plants', name: 'Plants', icon: '🪴', order: 13, zone: 'any', system: 'plants', active: true },
  { id: 'c-deep', name: 'Deep Cleaning', icon: '✨', order: 14, zone: 'any', active: true },
  { id: 'c-occasion', name: 'Guests & Events', icon: '🗝', order: 15, zone: 'any', system: 'occasion', active: true },
  { id: 'c-contracts', name: 'Service Visits', icon: '🔧', order: 16, zone: 'any', system: 'contracts', active: true },
  { id: 'c-close', name: 'Closing Down', icon: '🌙', order: 17, zone: 'any', active: true },
  { id: 'c-household', name: 'Household', icon: '🏠', order: 18, zone: 'any', active: true },
];

type Seed = Partial<LibraryTask> & { text: string };

let n = 0;
function T(base: Partial<LibraryTask>, seeds: (string | Seed)[]): LibraryTask[] {
  return seeds.map((s, i) => {
    const o: Seed = typeof s === 'string' ? { text: s } : s;
    n += 1;
    return {
      id: `lt${n}`,
      categoryId: 'c-household',
      apply: 'global',
      zone: 'any',
      freq: 'daily',
      dow: 1,
      parity: 0,
      instructions: '',
      role: 'housekeeping',
      estMinutes: 10,
      groupAs: '',
      light: false,
      order: (base.order ?? 0) + i,
      active: true,
      ...base,
      ...o,
    } as LibraryTask;
  });
}

export const SEED_LIBRARY: LibraryTask[] = [
  /* ---------- cat care ---------- */
  ...T(
    { categoryId: 'c-cat', zone: 'household', groupAs: 'Morning', role: 'housekeeping', defaultTime: '07:15', estMinutes: 5, order: 0,
      instructions: 'Wash bowls with the sponge kept only for the cat. Wellbeing check: eating, drinking, moving normally, eyes and nose clear.' },
    ['Feed breakfast', 'Fresh water', 'Clean food bowls', 'Scoop litter tray', 'Sweep around litter area', 'General wellbeing check'],
  ),
  ...T({ categoryId: 'c-cat', zone: 'household', groupAs: 'Afternoon', defaultTime: '15:00', estMinutes: 5, order: 10 },
    ['Give afternoon snack', 'Check and refill water', 'Check litter tray']),
  ...T({ categoryId: 'c-cat', zone: 'household', groupAs: 'Evening', defaultTime: '19:00', estMinutes: 5, order: 20 },
    ['Feed dinner', 'Fresh water', 'Final litter check']),
  ...T({ categoryId: 'c-cat', zone: 'household', groupAs: 'Weekly', freq: 'weekly', dow: 6, estMinutes: 20, order: 30 },
    ['Full litter change and tray wash']),

  /* ---------- opening up ---------- */
  ...T({ categoryId: 'c-open', apply: 'global', zone: 'household', defaultTime: '07:00', estMinutes: 5, order: 0,
    instructions: 'The house should look ready before anyone comes downstairs.' },
    ['Unlock and check the entrance', 'Open blinds in shared areas', 'Check AC running throughout', 'Walk the floor and note anything out of place']),

  /* ---------- bedrooms (every bedroom) ---------- */
  ...T({ categoryId: 'c-bed', apply: 'areaType', areaType: 'bedroom', zone: 'household', defaultTime: '09:00', order: 0 },
    [{ text: 'Open curtains and air the room', light: true, estMinutes: 2,
       instructions: 'Always first. Work in natural light so you can actually see dust and marks.' },
     { text: 'Make the bed and arrange pillows', estMinutes: 6,
       instructions: 'Sheets pulled tight and square, top sheet folded back evenly. Pillows upright against the headboard, largest at the back, edges chopped.' },
     { text: 'Tidy and dust, high to low', estMinutes: 8,
       instructions: 'Clothing to the basket; personal items back to their own place, never a new place. Shelves, headboard, side tables, lamps, skirting. Lift objects rather than cleaning around them. Check mirrors and glass.' },
     { text: 'Vacuum and empty the bin', light: true, estMinutes: 6,
       instructions: 'Under the bed and along the edges. Replace the liner if there is anything in it at all.' },
     { text: 'Doorway check', light: true, estMinutes: 1,
       instructions: 'Stand at the door and look. Everything square and symmetrical, nothing out of place.' }]),
  ...T({ categoryId: 'c-bed', apply: 'areaType', areaType: 'bedroom', zone: 'household', freq: 'weekly', dow: 6, estMinutes: 15, order: 20 },
    ['Change bed linen', 'Rotate linen set from the bottom of the pile']),
  ...T({ categoryId: 'c-bed', apply: 'areaType', areaType: 'bedroom', zone: 'household', freq: 'areaDeep', order: 30,
    instructions: 'Lift objects, do not clean around them. Under the bed and along the edges.' },
    [{ text: 'Deep clean — move furniture and vacuum beneath', estMinutes: 20 },
     { text: 'Wipe skirting, door and switch plates', estMinutes: 8 },
     { text: 'Clean inside wardrobe', estMinutes: 10 },
     { text: 'Wash or air soft furnishings', estMinutes: 7 }]),

  /* ---------- bathrooms (all zones, frequency by use) ---------- */
  ...T({ categoryId: 'c-bath', apply: 'areaType', areaType: 'bathroom', zone: 'any', defaultTime: '09:30', order: 0 },
    [{ text: 'Daily clean — sink, surfaces, toilet, shower', estMinutes: 10,
       instructions: 'Ventilate first. Apply toilet cleaner and leave it to work while you do the rest. Then sink, vanity top, taps. Wipe the shower glass and squeegee. Return to the toilet: brush the bowl, then disinfect seat, lid, rim and handle. Always cleanest to dirtiest.' },
     { text: 'Polish taps, metal and glass dry', estMinutes: 4,
       instructions: 'A separate dry cloth. Water spots are the most visible fault in a bathroom, and the one thing that makes a clean room look uncleaned.' },
     { text: 'Towels aligned, bin emptied, floor mopped dry', estMinutes: 6,
       instructions: 'Check the mirror at eye height and from an angle. Check the drain for hair. Leave the floor dry, not damp.' }]),
  ...T({ categoryId: 'c-bath', apply: 'areaType', areaType: 'bathroom', zone: 'any', freq: 'areaDeep', order: 30,
    instructions: 'Descaler on glass and fixtures first, leave to work. Behind the toilet must be as clean as the front.' },
    [{ text: 'Deep clean — descale glass and fixtures', estMinutes: 18 },
     { text: 'Scrub grout lines', estMinutes: 10 },
     { text: 'Clean behind and under the toilet', estMinutes: 8 },
     { text: 'Clear drains and flush through', estMinutes: 5 },
     { text: 'Wash bin inside and out', estMinutes: 4 }]),

  /* ---------- family kitchen ---------- */
  ...T({ categoryId: 'c-kitchen', apply: 'area', areaId: 'a-kt1', zone: 'household', estMinutes: 15, defaultTime: '10:00', order: 0,
    instructions: 'Reset to a clean, empty state after every use so the next person starts from zero.' },
    ['Load or run the dishwasher', 'Clear countertops completely, then clean the full surface', 'Clean the hob while still warm',
     'Wipe appliance fronts and handles', 'Clean and dry the sink, polish the tap', 'Check the bin', 'Sweep and mop']),
  ...T({ categoryId: 'c-kitchen', apply: 'area', areaId: 'a-kt1', zone: 'household', freq: 'weekly', dow: 4, order: 10 },
    [{ text: 'Detail clean — inside microwave and oven door', estMinutes: 20 },
     { text: 'Degrease wall behind the hob', estMinutes: 12 },
     { text: 'Empty and wipe the toaster tray', estMinutes: 4 }]),
  ...T({ categoryId: 'c-kitchen', apply: 'area', areaId: 'a-kt1', zone: 'household', freq: 'monthly', dow: 4, estMinutes: 60, order: 20 },
    ['Refrigerator — empty, clean, check dates, restock']),

  /* ---------- living areas ---------- */
  ...T({ categoryId: 'c-living', apply: 'areaType', areaType: 'living', zone: 'household', defaultTime: '11:00', order: 0 },
    [{ text: 'Reset the room', estMinutes: 8,
       instructions: 'Cushions plumped, throws straightened, surfaces cleared and wiped, remotes back in their place.' },
     { text: 'Vacuum or sweep', estMinutes: 7 }]),
  ...T({ categoryId: 'c-living', apply: 'area', areaId: 'a-ot1', zone: 'household', estMinutes: 12, defaultTime: '11:30', order: 10,
    instructions: 'Sand builds up quickly in the corners and along the door track. Pool water itself is building management.' },
    ['Sweep the terrace', 'Check poolside for debris, glasses and towels', 'Wipe outdoor table and square the furniture', 'Clean glass doors and balustrade']),



  /* ---------- reception and entrance ---------- */
  ...T({ categoryId: 'c-reception', apply: 'area', areaId: 'a-cr1', zone: 'household', estMinutes: 8, defaultTime: '07:30', order: 10 },
    ['Sweep and mop the lobby', 'Clean the lift glass and call panel', 'Check nothing is being stored in the lobby']),
  ...T({ categoryId: 'c-reception', apply: 'area', areaId: 'a-cr2', zone: 'household', estMinutes: 12, defaultTime: '12:00', order: 20 },
    ['Vacuum stairs and hallways', 'Dust the handrail full length', 'Check the treads']),

  /* ---------- waste ---------- */
  ...T({ categoryId: 'c-waste', apply: 'global', zone: 'household', estMinutes: 8, defaultTime: '20:00', order: 10 },
    ['Take household waste out', 'Separate recycling', 'Wash the bin if anything leaked']),

  /* ---------- deep cleaning (area cycle) ---------- */
  ...T({ categoryId: 'c-deep', apply: 'areaType', areaType: 'circulation', zone: 'household', freq: 'areaDeep', estMinutes: 45, order: 10 },
    ['Deep clean circulation — corners, edges, door frames']),
  ...T({ categoryId: 'c-deep', apply: 'areaType', areaType: 'kitchen', zone: 'any', freq: 'areaDeep', estMinutes: 50, order: 20 },
    ['Deep clean kitchen — inside cupboards, extractor filter, behind appliances']),
  ...T({ categoryId: 'c-deep', apply: 'areaType', areaType: 'utility', zone: 'household', freq: 'areaDeep', order: 30 },
    [{ text: 'Clean machine filters and drum seals', estMinutes: 14 },
     { text: 'Wipe down machines and behind them', estMinutes: 10 },
     { text: 'Mop the utility floor', estMinutes: 8 }]),

  /* ---------- closing down ---------- */
  ...T({ categoryId: 'c-close', apply: 'global', zone: 'household', defaultTime: '21:00', order: 10,
    instructions: 'Evening turndown. The house should feel settled, not merely tidy.' },
    [{ text: 'Close blinds and curtains', estMinutes: 5 },
     { text: 'Dim and check lights', estMinutes: 3 },
     { text: 'Final kitchen reset', estMinutes: 8 },
     { text: 'Fresh water on bedside tables', estMinutes: 4 },
     { text: 'Check doors and balcony locked', estMinutes: 3 }]),

  /* ---------- household admin ---------- */
  ...T({ categoryId: 'c-household', apply: 'global', zone: 'any', freq: 'weekly', dow: 0, estMinutes: 30, order: 0,
    instructions: 'Both zones, separately. Anything below its minimum goes onto the list the same day.' },
    ['Full inventory count — kitchen and cleaning', 'Full inventory count — prayer and shrine stock']),
  ...T({ categoryId: 'c-household', apply: 'global', zone: 'household', freq: 'weekly', dow: 5, estMinutes: 20, order: 10 },
    ['Linen count and rotation check', 'Retire anything thin, greying or stained']),
  ...T({ categoryId: 'c-household', apply: 'global', zone: 'household', role: 'driver', freq: 'weekdays', defaultTime: '07:20', estMinutes: 40, order: 20,
    instructions: 'Aria and Noor. Leave by twenty past — the Marina road backs up after half past.' },
    ['School run — morning']),
  ...T({ categoryId: 'c-household', apply: 'global', zone: 'household', role: 'driver', freq: 'weekdays', defaultTime: '15:15', estMinutes: 40, order: 22 },
    ['School run — afternoon']),
  ...T({ categoryId: 'c-household', apply: 'global', zone: 'household', role: 'driver', freq: 'weekly', dow: 6, defaultTime: '09:00', estMinutes: 90, order: 30 },
    ['Weekly grocery run against the shopping list']),
];

/* ---------- the house manual ---------- */

const P = (o: Partial<Procedure> & { id: string; title: string; category: string }): Procedure => ({
  zone: 'any', purpose: '', frequency: '', supplies: '', steps: [], standard: '', watchFor: '',
  role: 'housekeeping', version: 1, updatedAt: Date.now() - 30 * 864e5, ...o,
});

export const SEED_PROCEDURES: Procedure[] = [
  P({
    id: 'sop-bedroom', title: 'Bedroom Cleaning', category: 'Household cleaning', zone: 'household',
    purpose: 'Every bedroom should look as though it has just been prepared for a guest, whether or not anyone slept in it.',
    frequency: 'Daily — occupied and guest rooms. Twice weekly — unused rooms.',
    supplies: 'Microfibre cloths, multi-surface cleaner, glass cleaner, vacuum, mop, bin bags, fresh linen if changing.',
    steps: [
      'Open curtains and blinds first — always work in natural light so you can see dust and marks.',
      'Strip and remake the bed. Sheets pulled tight and square, top sheet folded back evenly, no creases.',
      'Arrange pillows standing upright against the headboard, largest at the back, edges chopped.',
      'Collect clothing and personal items. Clothing to the laundry basket, personal items returned to their own place — never moved to a new place.',
      'Dust from high to low: shelves, headboard, side tables, lamps, skirting. Lift objects, do not clean around them.',
      'Check mirrors and glass for marks and fingerprints.',
      'Vacuum the whole floor including under the bed and along the edges. Mop hard floors after vacuuming.',
      'Empty the bin and replace the liner if there is anything in it at all.',
      'Stand at the doorway for the final look. Everything square, symmetrical, nothing out of place.',
    ],
    standard: 'From the doorway the room reads as calm and symmetrical. No visible dust, no personal clutter, bed lines straight, curtains hanging evenly.',
    watchFor: 'Dust on the tops of headboards and picture frames. Sheets untucked at the foot. Bedside drawers left slightly open. Chargers and cables trailing.',
  }),
  P({
    id: 'sop-bath-daily', title: 'Bathroom Daily Clean', category: 'Household cleaning',
    purpose: 'Keep every bathroom fresh, dry and presentable at all times of day.',
    frequency: 'Daily — every bathroom. The guest toilet gets an additional midday pass, and every twenty minutes while the prayers run.',
    supplies: 'Toilet cleaner, disinfectant, glass cleaner, colour-coded bathroom cloths, non-scratch sponge, mop.',
    steps: [
      'Ventilate first — open the window or run the extractor.',
      'Apply toilet cleaner inside the bowl and leave it to work while you do the rest.',
      'Clean the sink, then the vanity top, then the taps. Always work from cleanest to dirtiest surface.',
      'Polish taps and metal dry with a separate dry cloth — water spots are the most visible fault in a bathroom.',
      'Wipe shower glass and squeegee dry. Check the shower tray and drain for hair.',
      'Return to the toilet: brush the bowl, then disinfect the seat, lid, rim and flush handle.',
      'Check the mirror at eye height and from an angle for splashes.',
      'Arrange towels folded or hung evenly, edges aligned.',
      'Empty the bin, sweep or vacuum, then mop the floor and leave it dry.',
    ],
    standard: 'Dry, odour-free, no water marks on glass or metal, towels aligned, no product bottles out of position.',
    watchFor: 'Water spots on taps and glass. Hair in the drain or on the floor edges. Damp towels left folded. During a sitting the guest toilet runs out of paper by the second break if the twenty-minute round is skipped.',
  }),
  P({
    id: 'sop-kitchen', title: 'Family Kitchen', category: 'Household cleaning', zone: 'household',
    purpose: 'The kitchen is reset to a clean, empty state after every use so the next person always starts from zero.',
    frequency: 'Daily reset after each meal. Detail clean weekly. Refrigerator monthly.',
    supplies: 'Degreaser, multi-surface cleaner, stainless steel polish, separate food-safe cloths, mop.',
    steps: [
      'Clear and load the dishwasher, or wash by hand and dry immediately.',
      'Clear all countertops completely, then clean the full surface — not just around objects.',
      'Clean the hob after every cooking session while it is still warm, never cold and set.',
      'Wipe appliance fronts, handles and the fridge door — handles are touched most and noticed most.',
      'Clean and dry the sink, then polish the tap.',
      'Check the bin; take it out if more than two-thirds full or if it holds any food waste.',
      'Store all food correctly — sealed, labelled, dated, nothing left uncovered.',
      'Sweep, then mop where necessary. Finish with the final reset look.',
    ],
    standard: 'Empty countertops, dry sink, polished tap, no crumbs on the floor, no smell from the bin, everything put away.',
    watchFor: 'Grease film on the wall behind the hob. Crumbs in the toaster tray. Cloths left damp in the sink — always hang to dry.',
  }),
  P({
    id: 'sop-laundry', title: 'Laundry', category: 'Household', zone: 'household',
    purpose: 'Each household member’s laundry is washed entirely separately so nothing is mixed up or lost.',
    frequency: 'One person or category per day, following the rota.',
    supplies: 'Detergent, fabric softener, separate baskets per person, hangers, iron and board.',
    steps: [
      'Confirm today’s person or category on the dashboard before starting.',
      'Never mix two people in one load, even a small one. Run a half load rather than mixing.',
      'Sort by colour and fabric within that person’s laundry only.',
      'Check every pocket. Anything found goes on the owner’s dresser, never in the bin.',
      'Wash on the correct programme; delicates separately.',
      'Dry, then fold or hang immediately — leaving items in the machine causes creasing.',
      'Iron what needs ironing while items are still slightly cool from folding.',
      'Put everything away in that person’s own wardrobe and drawers.',
      'Only mark the task complete once everything is put away. Washed and folded is not finished.',
    ],
    standard: 'No item of clothing ever appears in another person’s room. Nothing is left in the machine overnight. Baskets empty at the end of the day.',
    watchFor: 'New or unknown garments — check the care label and ask before washing. Report damage or staining found before washing, not after.',
  }),
  P({
    id: 'sop-cooking', title: 'Cooking & Food Management', category: 'Household', zone: 'household', role: 'cooking',
    purpose: 'Meals are planned, portioned and cooked so the family eats well, the kitchen is reset afterwards, and nothing is wasted.',
    frequency: 'Daily. Menus proposed a week ahead and approved by the house manager.',
    supplies: 'The Cooking planner, kitchen scales, measuring jug, labelled storage containers.',
    steps: [
      'Plan around what is already in the house. The planner marks each ingredient as in stock or needing purchase.',
      'Propose the week’s meals with the number of portions for every meal. Do not shop against an unapproved menu.',
      'Weigh and measure rather than estimating. 150–200g of rice and roughly 200g of protein per person is the house standard.',
      'Cook the portions stated. Cooking for six when four are eating is the most common cause of waste in this house.',
      'Record the expected leftovers honestly before you cook.',
      'Use older ingredients before newer ones, and open stock before unopened stock.',
      'Store leftovers within an hour of service, sealed, labelled with contents and date.',
      'Reset the kitchen completely after service — this is part of cooking, not a separate task.',
      'Update Inventory for anything used up, and add anything running low to the shopping list the same day.',
      'Record significant food waste with the reason. This is information, not blame.',
    ],
    standard: 'Served within ten minutes of the stated time, in the stated portions, leftovers either planned or absent. Kitchen reset within the hour. No unlabelled container in the fridge.',
    watchFor: 'No pork in the house. Check the dietary notes on each meal — they change. Anything cooked in excess two weeks running means the portion count needs revising, so say so.',
  }),
  P({
    id: 'sop-cat', title: 'Cat Care', category: 'Household', zone: 'household',
    purpose: 'The cat is fed, watered, clean and observed three times a day, every day, without exception.',
    frequency: 'Morning, afternoon and evening.',
    supplies: 'Wet and dry food, treats, litter, scoop, liners, bowl-only sponge.',
    steps: [
      'Morning: fresh food, fresh water, wash the bowls properly with the sponge kept only for this.',
      'Scoop the litter tray and sweep the area around it.',
      'Wellbeing check every morning: eating, drinking, moving normally, eyes and nose clear, coat normal, using the tray normally.',
      'Afternoon: snack, top up water, check the tray.',
      'Evening: dinner, fresh water, final tray check.',
      'Full litter change and tray wash weekly.',
      'Report immediately — the same day — if the cat stops eating, stops using the tray, or seems withdrawn.',
    ],
    standard: 'Bowls clean, water always fresh, tray never left with waste in it, no smell in the litter area.',
    watchFor: 'Water bowls develop a film quickly in the heat — wash daily, do not just top up. Note anything unusual as a task note so there is a record.',
  }),
  P({
    id: 'sop-guest', title: 'Guest Preparation', category: 'Occasions', zone: 'household',
    purpose: 'A guest should arrive to a room that feels prepared for them specifically, not simply cleaned.',
    frequency: 'Begins 48 hours before arrival; final pass on the day.',
    supplies: 'Fresh bedding, fresh towels, guest toiletry set, water carafe and glasses, hangers.',
    steps: [
      '48 hours before: full deep clean of the guest bedroom and bathroom.',
      'Clear wardrobe and drawer space and provide at least eight free hangers.',
      'Remove all personal and household belongings stored in the room.',
      'Check the room condition — lights, sockets, AC, blinds — and report faults now, while there is still time to fix them.',
      'Day of arrival: fresh bedding and towels, final clean, bathroom inspection.',
      'Place the toiletry set and water. Empty the bin.',
      'Reset the common areas, tidy the terrace and clean the kitchen.',
      'Final presentation check from the doorway with the lights on.',
    ],
    standard: 'The room smells fresh, the bed is crisp, the bathroom is dry and stocked, and there is nowhere the guest has to move something of ours to put something of theirs.',
    watchFor: 'Rooms that have been closed up need airing well in advance. Check for dust on surfaces cleaned two days earlier.',
  }),
  P({
    id: 'sop-inventory', title: 'Inventory', category: 'Household', zone: 'any',
    purpose: 'The house never runs out of anything essential — and never runs out of divo oil, which is not the same sentence.',
    frequency: 'Update quantities as you use things. Full count weekly on Sunday, both zones separately.',
    supplies: 'The Inventory screen.',
    steps: [
      'Update the quantity when you open the last of something, not when it runs out.',
      'Anything below its minimum level moves automatically onto the shopping list.',
      'Count prayer and shrine stock separately from the kitchen. Prayer-marked items are not available to use, so they do not count as stock you have.',
      'Do a full count every Sunday and correct the numbers.',
      'Add a note to any item that needs a specific brand or size.',
      'Tell the house manager immediately about anything urgent rather than waiting for the weekly list.',
    ],
    standard: 'Nothing on the shopping list is a surprise. No essential item ever reaches zero.',
    watchFor: 'During the observance the divo oil, wicks, matches, flowers and incense run down far faster than anything else — the divo alone is about a bottle every three days. Milk and yoghurt are bought daily. Ken’s litter and food also go faster than expected.',
  }),
  P({
    id: 'sop-maintenance', title: 'Reporting a Fault', category: 'Maintenance', zone: 'any',
    purpose: 'Small faults are reported early, before they become expensive.',
    frequency: 'As soon as you notice something.',
    supplies: 'A phone camera and the Issues screen.',
    steps: [
      'Report the fault the day you notice it. Do not wait to see if it gets worse.',
      'Photograph it first — one clear picture saves a long explanation.',
      'Say exactly where it is and exactly what happens.',
      'Set the priority honestly: urgent means water, electricity, safety or the cat.',
      'Never attempt electrical repairs or anything involving water shut-off yourself.',
      'Water leaks: place a container, turn off the supply if you safely can, and report as urgent immediately.',
    ],
    standard: 'Every fault in the building is either on the list or fixed. Nothing is known but unrecorded.',
    watchFor: 'Smells and sounds matter — a burning smell or a new noise from the AC is urgent even if nothing looks wrong.',
  }),
  P({
    id: 'sop-products', title: 'Cleaning Product Guide', category: 'Reference', zone: 'any',
    purpose: 'The right product on the right surface — the wrong one causes permanent damage.',
    frequency: 'Reference as needed.',
    supplies: 'All cleaning products. The shrine cloth and the shrine sponge are not among them and never leave the shrine.',
    steps: [
      'Cloths are colour-coded: bathroom cloths are never used in the kitchen or on bedroom surfaces.',
      'Natural stone and marble: pH-neutral cleaner only. Never vinegar, never descaler, never anything acidic.',
      'Stainless steel: polish with the grain, then buff dry.',
      'Glass and mirrors: spray the cloth, not the glass, so nothing runs into the frames.',
      'Screens and monitors: screen-safe wipes only, never glass cleaner.',
      'Wood: damp, not wet, and always dry immediately after.',
      'Never mix products — particularly anything containing bleach with anything containing acid.',
      'Always test a new product somewhere hidden first.',
    ],
    standard: 'No dulling, streaking or etching on any surface in the building.',
    watchFor: 'Descaler on the wrong bathroom surface will permanently mark stone. If in doubt, ask before using it.',
  }),
  P({
    id: 'sop-emergency', title: 'Emergency Reference', category: 'Reference', zone: 'any',
    purpose: 'What to do first, before anyone is called.',
    frequency: 'Read now, not when it happens.',
    supplies: 'Nothing. Know where things are.',
    steps: [
      'Fire: get everyone out first, then raise the alarm, then call 997. Never fight a fire that is above waist height.',
      'Water leak: turn the supply off at the isolator under the affected sink, or the main stopcock in the utility room. Then report as urgent.',
      'Electrical: the consumer unit is in the utility room. Trip the affected circuit. Do not touch anything wet.',
      'Injury: the first aid kit is in the kitchen, top cupboard left of the hob. Call 998 for an ambulance.',
      'Lift entrapment: use the lift call panel, then building reception. Do not attempt to open the doors.',
      'Anything involving a child or the cat: tell a family member first, then act.',
      'Log every incident on the Incidents screen the same day, with photographs.',
    ],
    standard: 'People first, property second, records third — but the records always get made.',
    watchFor: 'Both first aid kits get raided for plasters. Check monthly that they are actually complete.',
  }),
];
