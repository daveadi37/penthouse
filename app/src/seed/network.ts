import type {
  AccessCredential,
  Contact,
  ContractorVisit,
  Delivery,
  Incident,
  Visitor,
  Vendor,
} from '@/types';
import { addDays, today } from '@/lib/date';
import { uid } from '@/lib/id';

const t = today();

export const SEED_VENDORS: Vendor[] = [
  { id: 'v-ac', name: 'Cool Breeze Technical Services', cat: 'AC', contactName: 'Sameer', phone: '+971 4 200 0011', email: 'service@coolbreeze.example', web: '', cadence: 'Every 3 months', nextVisit: addDays(t, 15), rating: 4, accountRef: 'CB-PENT-01', notes: 'Reliable. Ask for Sameer’s team — the other crew leaves the filters loose.', active: true },
  { id: 'v-water', name: 'AquaPure Tank Cleaning', cat: 'Plumbing', contactName: 'Ravi', phone: '+971 4 200 0022', email: 'bookings@aquapure.example', web: '', cadence: 'Every 6 months', nextVisit: addDays(t, 10), rating: 4, accountRef: 'AP-4410', notes: 'Issues the municipality certificate on the day.', active: true },
  { id: 'v-pest', name: 'Gulf Pest Solutions', cat: 'Pest control', contactName: 'Ahmed', phone: '+971 4 200 0033', email: 'ops@gulfpest.example', web: '', cadence: 'Every 3 months', nextVisit: addDays(t, 2), rating: 5, accountRef: 'GPS-889', notes: 'Discreet, and out of hours if asked. Escorted throughout.', active: true },
  { id: 'v-bldg', name: 'Building Management', cat: 'Other', contactName: 'Reception', phone: 'Building reception, ext. 0', email: '', web: '', cadence: 'As needed', nextVisit: addDays(t, 5), rating: 3, accountRef: 'Unit 4102', notes: 'Pool water, fire safety, facade, lifts. Slow on anything not on their list.', active: true },
  { id: 'v-window', name: 'Skyline Facade Care', cat: 'Cleaning', contactName: 'Joseph', phone: '+971 4 200 0044', email: 'plan@skyline.example', web: '', cadence: 'Every 2 months', nextVisit: addDays(t, 8), rating: 4, accountRef: 'SF-2201', notes: 'Needs building access booked a week ahead.', active: true },
  { id: 'v-clean', name: 'Precision Deep Clean', cat: 'Cleaning', contactName: 'Lorena', phone: '+971 4 200 0055', email: 'jobs@precision.example', web: '', cadence: 'Quarterly', nextVisit: addDays(t, 60), rating: 5, accountRef: 'PDC-1180', notes: 'Carpets, rugs and upholstery. Works after 19:00, so book it for an evening the house is out.', active: true },
  { id: 'v-uph', name: 'Sofa Spa Dubai', cat: 'Upholstery', contactName: 'Maria', phone: '+971 4 200 0066', email: 'hello@sofaspa.example', web: '', cadence: 'Every 6 months', nextVisit: addDays(t, 70), rating: 4, accountRef: 'SS-3310', notes: 'Family living sofa and the dining chairs.', active: true },
  { id: 'v-rug', name: 'Emirates Carpet Care', cat: 'Rugs', contactName: 'Rashid', phone: '+971 4 200 0077', email: 'bookings@emiratescarpet.example', web: '', cadence: 'Every 6–12 months', nextVisit: '', rating: 4, accountRef: 'ECC-770', notes: 'All rugs — living, dining, master. Collect and return.', active: true },
  { id: 'v-appl', name: 'Better Life Appliances', cat: 'Appliances', contactName: 'Sales desk', phone: '+971 4 200 0088', email: 'service@betterlife.example', web: '', cadence: 'As needed', nextVisit: '', rating: 3, accountRef: 'BL-CORP-441', notes: 'Purchases and warranty service for most white goods.', active: true },
  { id: 'v-it', name: 'Nexa IT Services', cat: 'IT', contactName: 'Vikram', phone: '+971 4 200 0099', email: 'support@nexait.example', web: '', cadence: 'Monthly', nextVisit: addDays(t, 8), rating: 4, accountRef: 'NX-EVOLVE-01', notes: 'Monthly on-site plus remote. Twelve workstations, network, printers.', active: true },
  { id: 'v-groc', name: 'Kibsons', cat: 'Grocery', contactName: 'App order', phone: '+971 4 200 0121', email: '', web: 'kibsons.example', cadence: 'Weekly', nextVisit: addDays(t, 3), rating: 5, accountRef: 'KB-4410', notes: 'Fresh delivery Saturday morning. Slot booked the night before.', active: true },
  { id: 'v-veh', name: 'Al Futtaim Service Centre', cat: 'Vehicle', contactName: 'Service booking', phone: '+971 4 200 0132', email: 'service@afservice.example', web: '', cadence: 'Every 6 months', nextVisit: addDays(t, 40), rating: 4, accountRef: 'AF-N41882', notes: 'Both cars. Book two weeks ahead for a Saturday slot.', active: true },
  { id: 'v-plumb', name: 'Rapid Response Plumbing', cat: 'Plumbing', contactName: 'Dispatch', phone: '+971 4 200 0143', email: '', web: '', cadence: 'Emergency only', nextVisit: '', rating: 4, accountRef: '', notes: '24 hour. Used for the ensuite leak in March.', active: true },
  { id: 'v-elec', name: 'Watt Electrical', cat: 'Electrical', contactName: 'Bilal', phone: '+971 4 200 0154', email: 'bilal@watt.example', web: '', cadence: 'As needed', nextVisit: '', rating: 4, accountRef: '', notes: 'Knows the consumer unit layout. Did the balcony sockets.', active: true },
];

export const SEED_CONTACTS: Contact[] = [
  { id: 'ct1', name: 'Police / Ambulance / Fire', org: 'UAE Emergency', cat: 'Emergency', phone: '999 · 998 · 997', altPhone: '', email: '', notes: 'Police 999. Ambulance 998. Fire 997.', isEmergency: true, order: 1, active: true },
  { id: 'ct2', name: 'Building Security', org: 'Building Management', cat: 'Emergency', phone: 'Building reception, ext. 0', altPhone: '+971 4 300 0000', email: '', notes: 'First call for lift entrapment, fire alarm, water in a common area.', isEmergency: true, order: 2, active: true },
  { id: 'ct3', name: 'Aditya Dave', org: 'Owner', cat: 'Emergency', phone: '+971 50 000 0002', altPhone: '', email: 'aditya.dave@evolvecaregroup.com', notes: 'Anything involving a child, the cat, or money.', isEmergency: true, order: 3, active: true },
  { id: 'ct4', name: 'Earl Tiongco', org: 'House manager', cat: 'Emergency', phone: '+971 50 000 0003', altPhone: '', email: 'earl@3808.local', notes: 'First call for anything operational.', isEmergency: true, order: 4, active: true },
  { id: 'ct5', name: 'Dr Anita Sharma', org: 'Mediclinic City', cat: 'Medical', phone: '+971 4 400 0011', altPhone: '', email: '', notes: 'Family GP. Aria and Noor’s records are here.', isEmergency: true, order: 5, active: true },
  { id: 'ct6', name: 'DAMAC Veterinary Clinic', org: 'Vet', cat: 'Vet', phone: '+971 4 400 0022', altPhone: '+971 55 400 0022', email: '', notes: 'Out of hours on the mobile. The cat’s file is under "Penthouse 4102".', isEmergency: true, order: 6, active: true },
  { id: 'ct7', name: 'Rapid Response Plumbing', org: 'Emergency plumber', cat: 'Emergency', phone: '+971 4 200 0143', altPhone: '', email: '', notes: '24 hour. Main stopcock is in the utility room.', isEmergency: true, order: 7, active: true },
  { id: 'ct8', name: 'GEMS Wellington', org: 'School', cat: 'School', phone: '+971 4 500 0011', altPhone: '', email: 'office@school.example', notes: 'Aria Year 6, Noor Year 3. Pickup authorisation is in Marvin’s name.', isEmergency: false, order: 10, active: true },
  { id: 'ct9', name: 'DEWA', org: 'Utilities', cat: 'Government', phone: '991', altPhone: '', email: '', notes: 'Account 2044-8812-1. Power and water.', isEmergency: false, order: 11, active: true },
  { id: 'ct10', name: 'Building Facilities Desk', org: 'Building Management', cat: 'Building', phone: '+971 4 300 0001', altPhone: '', email: 'facilities@building.example', notes: 'Pool, facade, fire systems, lifts. Log a ticket, then chase.', isEmergency: false, order: 12, active: true },
];

export const SEED_VISITORS: Visitor[] = [
  { id: uid('vs'), name: 'Hassan Al Marri', org: 'Landlord', visiting: 'Earl Tiongco', purpose: 'Annual inspection', zone: 'household', date: addDays(t, -2), arrived: '11:00', departed: '11:45', badge: 'V-10', loggedBy: 'p-rosie', notes: 'Walked the whole flat. No issues raised.' },
  { id: uid('vs'), name: 'Yasmin Farouk', org: 'Personal — Salyna', visiting: 'Salyna', purpose: 'Social', zone: 'household', date: addDays(t, -3), arrived: '16:20', departed: '19:00', badge: '', loggedBy: 'p-rosie', notes: '' },
];

export const SEED_CONTRACTOR_VISITS: ContractorVisit[] = [
  { id: uid('cv'), vendorId: 'v-pest', vendorName: 'Gulf Pest Solutions', purpose: 'Quarterly treatment — kitchens, pantry, bathrooms, stores', areaId: undefined, zone: 'household', date: addDays(t, 2), scheduled: '18:30', escortedBy: 'p-marvin', contractId: 'sc3', notes: 'After hours, so the flat is clear and nobody is sitting where they need to spray.' },
  { id: uid('cv'), vendorId: 'v-window', vendorName: 'Skyline Facade Care', purpose: 'Facade and terrace glass', zone: 'household', date: addDays(t, 8), scheduled: '07:00', escortedBy: 'p-marvin', contractId: 'sc6', notes: 'Building access booked. Terrace furniture to be moved in the night before.' },
  { id: uid('cv'), vendorId: 'v-ac', vendorName: 'Cool Breeze Technical Services', purpose: 'Quarterly AC service — all eleven units', zone: 'household', date: addDays(t, 15), scheduled: '09:00', escortedBy: 'p-marvin', contractId: 'sc1', notes: 'Eleven units, most of a day. Somebody has to be in every room with them, so book it when the house is quiet.' },
  { id: uid('cv'), vendorId: 'v-appl', vendorName: 'Better Life Appliances', purpose: 'Washing machine — bearing noise assessment', areaId: 'a-ut1', zone: 'household', date: addDays(t, -6), scheduled: '11:00', arrived: '11:45', departed: '12:30', escortedBy: 'p-rosie', notes: 'Out of warranty. Quote AED 1,400 for the bearing, or replace. Awaiting decision.' },
];

export const SEED_DELIVERIES: Delivery[] = [
  { id: uid('dl'), courier: 'DHL', tracking: 'DHL-77120034', forWhom: 'Aditya Dave', forProfileId: 'p-aditya', description: 'Small envelope, signature required', zone: 'household', date: t, arrived: '13:50', receivedBy: 'p-rosie', status: 'received', notes: 'Signed for. On the hall table.' },
  { id: uid('dl'), courier: 'Kibsons', tracking: 'KB-88201', forWhom: 'Household — groceries', description: 'Fresh order, 4 crates', zone: 'household', date: addDays(t, -1), arrived: '08:20', receivedBy: 'p-rosie', status: 'collected', collectedAt: Date.now() - 26 * 36e5, collectedBy: 'Rosie — put away', notes: 'Chilled items straight to the fridge.' },
];

export const SEED_CREDENTIALS: AccessCredential[] = [
  { id: 'ac1', kind: 'Key', label: 'Main entrance — front door', areaId: 'a-cr1', zone: 'household', heldWhere: 'Key safe, utility room', issuedTo: 'p-rosie', issuedToName: 'Rosie', issuedAt: addDays(t, -900), lastChanged: addDays(t, -900), copies: 4, notes: 'Four cut. One with Rosie, one with Earl, one in the safe, one with the owners.', active: true },
  { id: 'ac2', kind: 'Fob', label: 'Building access fob', zone: 'household', heldWhere: 'Carried', issuedTo: 'p-marvin', issuedToName: 'Marvin', issuedAt: addDays(t, -600), lastChanged: addDays(t, -600), copies: 5, notes: 'Building management issues these. Report a loss to reception same day.', active: true },
  { id: 'ac4', kind: 'Code', label: 'Key safe — utility room', areaId: 'a-ut1', zone: 'household', heldWhere: 'Owner’s password manager', issuedTo: 'p-earl', issuedToName: 'Earl Tiongco', issuedAt: addDays(t, -400), lastChanged: addDays(t, -400), copies: 0, notes: 'Rosie, Earl and the owners only. Overdue a change.', active: true },
  { id: 'ac5', kind: 'Remote', label: 'Parking barrier remote', zone: 'household', heldWhere: 'In the family car', issuedTo: 'p-marvin', issuedToName: 'Marvin', issuedAt: addDays(t, -600), lastChanged: addDays(t, -600), copies: 2, notes: 'One per car.', active: true },
  { id: 'ac6', kind: 'Remote', label: 'Parking barrier remote — second', zone: 'household', heldWhere: 'In the errands car', issuedTo: 'p-marvin', issuedToName: 'Marvin', issuedAt: addDays(t, -240), lastChanged: addDays(t, -240), copies: 2, notes: '', active: true },
  { id: 'ac9', kind: 'Key', label: 'Terrace store — returned', areaId: 'a-ot1', zone: 'household', heldWhere: 'Key safe, utility room', issuedToName: 'Former housekeeper', issuedAt: addDays(t, -1200), returnedAt: addDays(t, -910), lastChanged: addDays(t, -900), copies: 1, notes: 'Returned on departure. Lock changed afterwards.', active: false },
];

export const SEED_INCIDENTS: Incident[] = [
  { id: 'in2', date: addDays(t, -22), time: '08:15', type: 'Damage', zone: 'household', areaId: 'a-cr2', description: 'Corner of the hallway wall chipped, roughly 4cm, at about waist height. Consistent with a delivery trolley.', people: 'Rosie (found it)', actionTaken: 'Photographed and logged. Not repaired yet — grouped with other touch-up work.', reportedBy: 'p-rosie', photos: [] },
];
