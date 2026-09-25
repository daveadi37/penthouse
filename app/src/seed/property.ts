import type { Asset, Plant, ServiceContract, Vehicle } from '@/types';
import { addDays, today } from '@/lib/date';
import { uid } from '@/lib/id';

const t = today();

const A = (o: Partial<Asset> & { name: string; cat: Asset['cat']; zone: Asset['zone'] }): Asset => ({
  id: uid('as'),
  sub: '',
  brand: '',
  model: '',
  serial: '',
  qty: 1,
  description: '',
  care: '',
  purchase: { date: '', ref: '' },
  warranty: { start: '', end: '', provider: '', notes: '' },
  service: { freqDays: 0, last: '', next: '', notes: '', history: [] },
  replacement: { by: '', notes: '' },
  documentIds: [],
  active: true,
  ...o,
});

export const SEED_ASSETS: Asset[] = [
  A({
    name: 'Miele Dishwasher', cat: 'Appliances', sub: 'Kitchen', areaId: 'a-kt1', zone: 'household',
    brand: 'Miele', model: 'G7310', serial: 'MI-7310-4482',
    care: 'Clean the filter weekly. Never use descaler on the stainless front.',
    purchase: { date: addDays(t, -500), price: 4200, vendorId: 'v-appl', ref: 'BL-88421' },
    warranty: { start: addDays(t, -500), end: addDays(t, 230), provider: 'Miele UAE', notes: '2-year manufacturer warranty.' },
    service: { freqDays: 180, last: addDays(t, -190), next: addDays(t, 12), notes: '', history: [
      { id: uid('sl'), date: addDays(t, -190), vendorId: 'v-appl', cost: 380, notes: 'Annual service. Filter and seal replaced.' },
    ] },
    replacement: { lifespanYears: 10, by: addDays(t, 3150), budget: 4800, notes: '' },
  }),
  A({
    name: 'Washing Machine', cat: 'Appliances', sub: 'Laundry', areaId: 'a-ut1', zone: 'household',
    brand: 'Bosch', model: 'WAX32EH1GB', serial: 'BS-2291-7741',
    care: 'Leave the door ajar after the last load. Clean the filter monthly.',
    purchase: { date: addDays(t, -800), price: 3100, vendorId: 'v-appl', ref: 'BL-70112' },
    warranty: { start: addDays(t, -800), end: addDays(t, -70), provider: 'Bosch', notes: 'Expired.' },
    service: { freqDays: 180, last: addDays(t, -200), next: addDays(t, -18), notes: 'Overdue. Drum bearing noise reported.', history: [] },
    replacement: { lifespanYears: 8, by: addDays(t, 2120), budget: 3600, notes: '' },
  }),
  A({
    name: 'Tumble Dryer', cat: 'Appliances', sub: 'Laundry', areaId: 'a-ut1', zone: 'household',
    brand: 'Bosch', model: 'WTX87EH9GB', serial: 'BS-4410-2213',
    care: 'Empty the lint filter after every cycle.',
    purchase: { date: addDays(t, -800), price: 2800, vendorId: 'v-appl', ref: 'BL-70113' },
    warranty: { start: addDays(t, -800), end: addDays(t, -70), provider: 'Bosch', notes: '' },
    service: { freqDays: 365, last: addDays(t, -200), next: addDays(t, 160), notes: '', history: [] },
    replacement: { lifespanYears: 8, by: addDays(t, 2120), budget: 3200, notes: '' },
  }),
  A({
    name: 'Dyson V15 Vacuum', cat: 'Cleaning equipment', sub: 'Vacuum', areaId: 'a-st2', zone: 'household',
    brand: 'Dyson', model: 'V15 Detect', serial: 'DY-15-99102',
    care: 'Wash the filter monthly and dry fully for 24 hours before refitting.',
    purchase: { date: addDays(t, -300), price: 2900, vendorId: 'v-appl', ref: 'DY-2201' },
    warranty: { start: addDays(t, -300), end: addDays(t, 430), provider: 'Dyson UAE', notes: '' },
    service: { freqDays: 0, last: '', next: '', notes: '', history: [] },
    replacement: { lifespanYears: 5, by: addDays(t, 1525), budget: 3200, notes: '' },
  }),
  A({
    name: 'Master Bedroom AC Unit', cat: 'Fixtures', sub: 'HVAC', areaId: 'a-br1', zone: 'household',
    brand: 'Daikin', model: 'FTXM50', serial: 'DK-50-7741',
    care: 'Filter cleaned monthly by the AC contract. Report any new noise immediately.',
    purchase: { date: addDays(t, -1400), price: 5200, ref: 'Developer fit-out' },
    warranty: { start: addDays(t, -1400), end: addDays(t, -670), provider: 'Daikin', notes: '' },
    service: { freqDays: 90, last: addDays(t, -75), next: addDays(t, 15), vendorId: 'v-ac', notes: '', history: [] },
    replacement: { lifespanYears: 12, by: addDays(t, 2980), budget: 6000, notes: '' },
  }),
  A({
    name: 'Dining Table & Eight Chairs', cat: 'Furniture', sub: 'Dining', areaId: 'a-lv2', zone: 'household',
    brand: 'Molteni&C', model: 'Old Ship', serial: '',
    care: 'Oiled walnut. Damp cloth only, dried immediately. Never a spray polish.',
    purchase: { date: addDays(t, -1100), price: 42000, ref: '' },
    warranty: { start: '', end: '', provider: '', notes: '' },
    service: { freqDays: 365, last: addDays(t, -300), next: addDays(t, 65), notes: 'Annual oiling.', history: [] },
    replacement: { by: '', notes: 'Not expected to be replaced.' },
  }),
  A({
    name: 'Family Living Sofa', cat: 'Soft furnishings', sub: 'Seating', areaId: 'a-lv1', zone: 'household',
    brand: 'Minotti', model: 'Freeman', serial: '',
    care: 'Vacuum weekly with the upholstery head. Professional clean twice a year.',
    purchase: { date: addDays(t, -1050), price: 58000, ref: '' },
    warranty: { start: '', end: '', provider: '', notes: '' },
    service: { freqDays: 180, last: addDays(t, -110), next: addDays(t, 70), vendorId: 'v-uph', notes: '', history: [] },
    replacement: { by: '', notes: '' },
  }),
  A({
    name: 'Terrace Furniture Set', cat: 'Outdoor', sub: 'Terrace', areaId: 'a-ot1', zone: 'household',
    brand: 'Dedon', model: 'Mbrace', serial: '',
    care: 'Cushions brought in before rain or a sandstorm. Frames rinsed monthly — salt and sand.',
    purchase: { date: addDays(t, -720), price: 34000, ref: '' },
    warranty: { start: addDays(t, -720), end: addDays(t, 10), provider: 'Dedon', notes: 'Expiring — inspect the frames before it lapses.' },
    service: { freqDays: 180, last: addDays(t, -95), next: addDays(t, 85), notes: '', history: [] },
    replacement: { lifespanYears: 8, by: addDays(t, 2200), budget: 38000, notes: '' },
  }),
];

export const SEED_VEHICLES: Vehicle[] = [
  {
    id: 'veh1', name: 'Family car', make: 'Lexus', model: 'RX 350', year: '2023',
    plate: 'Dubai N 41882', vin: 'JTJBZMCA10C012345', zone: 'household', assignedTo: 'p-marvin',
    colour: 'Graphite', odometer: 41200,
    registrationExpiry: addDays(t, 41), insuranceExpiry: addDays(t, 41),
    insuranceProvider: 'AXA Gulf', policyNo: 'AXA-MOT-99201',
    serviceFreqDays: 180, serviceFreqKm: 10000,
    serviceLast: addDays(t, -140), serviceLastKm: 35000, serviceNext: addDays(t, 40),
    notes: 'School run twice daily. Marvin is the only regular driver.',
    log: [
      { id: uid('vl'), date: addDays(t, -3), type: 'Fuel', odometer: 41180, cost: 240, notes: 'ENOC Al Wasl' },
      { id: uid('vl'), date: addDays(t, -10), type: 'Fuel', odometer: 40620, cost: 235, notes: '' },
      { id: uid('vl'), date: addDays(t, -16), type: 'Salik', cost: 96, notes: 'Monthly toll top-up' },
      { id: uid('vl'), date: addDays(t, -24), type: 'Fine', cost: 400, notes: 'Speed camera, Sheikh Zayed Rd. Paid.' },
      { id: uid('vl'), date: addDays(t, -140), type: 'Service', odometer: 35000, cost: 1850, vendorId: 'v-veh', notes: '35,000km service. Brake pads front replaced.' },
    ],
    documentIds: [], active: true,
  },
  {
    id: 'veh2', name: 'Errands car', make: 'Toyota', model: 'Corolla', year: '2021',
    plate: 'Dubai K 77410', vin: 'JTDBR32E30J098765', zone: 'household', assignedTo: 'p-marvin',
    colour: 'White', odometer: 78900,
    registrationExpiry: addDays(t, 118), insuranceExpiry: addDays(t, -6),
    insuranceProvider: 'Oman Insurance', policyNo: 'OI-MOT-33110',
    serviceFreqDays: 180, serviceFreqKm: 10000,
    serviceLast: addDays(t, -215), serviceLastKm: 71000, serviceNext: addDays(t, -35),
    notes: 'The grocery run, the daily milk run and airport drops. Insurance lapsed — do not drive it until it is renewed.',
    log: [
      { id: uid('vl'), date: addDays(t, -5), type: 'Fuel', odometer: 78800, cost: 165, notes: '' },
      { id: uid('vl'), date: addDays(t, -215), type: 'Service', odometer: 71000, cost: 720, vendorId: 'v-veh', notes: 'Oil, filters, tyre rotation.' },
    ],
    documentIds: [], active: true,
  },
];

export const SEED_CONTRACTS: ServiceContract[] = [
  { id: 'sc1', name: 'AC servicing — whole premises', cat: 'AC', vendorId: 'v-ac', zone: 'household', freqDays: 90, last: addDays(t, -75), next: addDays(t, 15), costPerVisit: 1200, contractStart: addDays(t, -400), contractEnd: addDays(t, 330), documentIds: [], notes: 'All eleven units. Filters cleaned, gas checked. The bedroom units first — they are the ones anyone notices.', active: true },
  { id: 'sc2', name: 'Water tank cleaning', cat: 'Water tank', vendorId: 'v-water', zone: 'household', freqDays: 180, last: addDays(t, -170), next: addDays(t, 10), costPerVisit: 800, contractStart: addDays(t, -540), contractEnd: addDays(t, 190), documentIds: [], notes: 'Municipality requirement. Certificate must be kept.', active: true },
  { id: 'sc3', name: 'Pest control', cat: 'Pest control', vendorId: 'v-pest', zone: 'household', freqDays: 90, last: addDays(t, -88), next: addDays(t, 2), costPerVisit: 450, contractStart: addDays(t, -450), contractEnd: addDays(t, 280), documentIds: [], notes: 'Kitchen, bathrooms and store. Out of hours, and everything food-related covered or moved first.', active: true },
  { id: 'sc4', name: 'Pool & terrace water', cat: 'Pool', vendorId: 'v-bldg', zone: 'household', freqDays: 14, last: addDays(t, -9), next: addDays(t, 5), costPerVisit: 0, contractStart: addDays(t, -900), contractEnd: '', documentIds: [], notes: 'Building management. Water only — terrace surfaces are ours.', active: true },
  { id: 'sc5', name: 'Fire safety inspection', cat: 'Fire safety', vendorId: 'v-bldg', zone: 'household', freqDays: 365, last: addDays(t, -300), next: addDays(t, 65), costPerVisit: 0, contractStart: addDays(t, -1000), contractEnd: '', documentIds: [], notes: 'Building-wide. Extinguishers and detectors in both zones.', active: true },
  { id: 'sc6', name: 'Window & facade cleaning', cat: 'Windows', vendorId: 'v-window', zone: 'household', freqDays: 60, last: addDays(t, -52), next: addDays(t, 8), costPerVisit: 950, contractStart: addDays(t, -380), contractEnd: addDays(t, 350), documentIds: [], notes: 'External only. Access via building. Terrace glass included.', active: true },
];

export const SEED_PLANTS: Plant[] = [
  { id: 'pl1', name: 'Fiddle leaf fig', species: 'Ficus lyrata', areaId: 'a-lv1', zone: 'household', waterFreqDays: 7, waterLast: addDays(t, -6), feedFreqDays: 30, feedLast: addDays(t, -26), light: 'Bright indirect. Away from the AC draught.', care: 'Let the top 3cm dry between waterings. Turn a quarter turn weekly.', active: true },
  { id: 'pl2', name: 'Bird of paradise', species: 'Strelitzia nicolai', areaId: 'a-lv2', zone: 'household', waterFreqDays: 7, waterLast: addDays(t, -8), feedFreqDays: 30, feedLast: addDays(t, -31), light: 'Direct morning sun.', care: 'Wipe the leaves monthly — they show dust badly.', active: true },
  { id: 'pl3', name: 'Terrace olive tree', species: 'Olea europaea', areaId: 'a-ot1', zone: 'household', waterFreqDays: 3, waterLast: addDays(t, -3), feedFreqDays: 60, feedLast: addDays(t, -40), light: 'Full sun.', care: 'Every three days in summer, weekly in winter. Check for scale on the underside.', active: true },
  { id: 'pl4', name: 'Terrace bougainvillea', species: 'Bougainvillea glabra', areaId: 'a-ot1', zone: 'household', waterFreqDays: 3, waterLast: addDays(t, -2), feedFreqDays: 45, feedLast: addDays(t, -20), light: 'Full sun.', care: 'Sweep fallen bracts daily — they blow into the pool.', active: true },
];
