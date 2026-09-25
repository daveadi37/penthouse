import type { Guest, HouseEvent, OccasionTask, OccasionTemplate, Vacation } from '@/types';
import { addDays, today } from '@/lib/date';
import { uid } from '@/lib/id';

const t = today();

type Spec = [text: string, n: number, unit: 'days' | 'hours' | 'minutes', dir: 'before' | 'after', mins?: number, role?: OccasionTask['role']];

function tasks(specs: Spec[], doneUpTo = 0): OccasionTask[] {
  return specs.map(([text, n, unit, dir, mins, role], i) => ({
    id: uid('ot'),
    text,
    offset: { n, unit, dir },
    role: role ?? 'housekeeping',
    estMinutes: mins ?? 15,
    done: i < doneUpTo,
    doneBy: i < doneUpTo ? 'p-rosie' : undefined,
    doneAt: i < doneUpTo ? Date.now() - (doneUpTo - i) * 36e5 : undefined,
    order: i,
  }));
}

const GUEST_SPEC: Spec[] = [
  ['Guest bedroom deep clean', 2, 'days', 'before', 45],
  ['Guest bathroom deep clean', 2, 'days', 'before', 40],
  ['Clear wardrobe and drawer space, eight hangers out', 2, 'days', 'before', 15],
  ['Remove personal and household belongings from the room', 2, 'days', 'before', 15],
  ['Check room condition — lights, sockets, AC, blinds', 2, 'days', 'before', 10],
  ['Air the room thoroughly', 1, 'days', 'before', 10],
  ['Fresh bedding', 0, 'days', 'before', 15],
  ['Fresh towels', 0, 'days', 'before', 10],
  ['Final bedroom clean', 0, 'days', 'before', 20],
  ['Bathroom inspection', 0, 'days', 'before', 10],
  ['Guest toiletry set placed', 0, 'days', 'before', 5],
  ['Water carafe and glasses placed', 0, 'days', 'before', 5],
  ['Bin emptied', 0, 'days', 'before', 3],
  ['Common areas reset', 4, 'hours', 'before', 20],
  ['Terrace tidy', 4, 'hours', 'before', 15],
  ['Kitchen clean', 3, 'hours', 'before', 20],
  ['Final presentation check from the doorway, lights on', 1, 'hours', 'before', 5],
  ['Strip the room and start the laundry', 0, 'days', 'after', 30],
];

const EVENT_SPEC: Spec[] = [
  ['Confirm headcount and dietary requirements', 3, 'days', 'before', 15],
  ['Order anything not in stock', 2, 'days', 'before', 20],
  ['Deep clean the event space', 1, 'days', 'before', 60],
  ['Polish glassware', 1, 'days', 'before', 30],
  ['Guest bathroom prepared', 1, 'days', 'before', 25],
  ['Living areas reset', 0, 'days', 'before', 25],
  ['Dining room laid', 3, 'hours', 'before', 30],
  ['Terrace prepared', 3, 'hours', 'before', 20],
  ['Kitchen deep cleaned', 2, 'hours', 'before', 30],
  ['Fresh towels out', 2, 'hours', 'before', 10],
  ['Food preparation complete', 1, 'hours', 'before', 60, 'cooking'],
  ['Final inspection', 30, 'minutes', 'before', 10],
  ['Clear and reset', 0, 'days', 'after', 60],
];


export const SEED_GUESTS: Guest[] = [
  {
    id: 'g1', name: 'Mrs Devi Raman', arrival: addDays(t, 1), arrivalTime: '18:40', departure: addDays(t, 5),
    areaId: 'a-br3', notes: 'Salyna’s mother. Prefers the room cool and the blinds down. Landing at 18:40, home by 19:30.',
    dietary: 'Vegetarian. No onion or garlic on the first night.', status: 'active', tasks: tasks(GUEST_SPEC, 8),
  },
  {
    id: 'g2', name: 'Jonah & Tess Whitfield', arrival: addDays(t, 16), arrivalTime: '14:00', departure: addDays(t, 19),
    areaId: 'a-br3', notes: 'Old friends from London. The guest room is free by then — Mrs Raman leaves on the 5th.',
    dietary: 'No shellfish.', status: 'planned', tasks: tasks(GUEST_SPEC),
  },
];

export const SEED_EVENTS: HouseEvent[] = [
  {
    id: 'e3', name: 'Salyna’s birthday dinner', date: addDays(t, 12), start: '19:30', end: '23:00',
    areaId: 'a-lv2', zone: 'household', headcount: 10,
    notes: 'Ten at the dining table plus drinks on the terrace first. Rosie cooking, not catered.',
    status: 'planned', tasks: tasks(EVENT_SPEC),
  },
];

export const SEED_VACATIONS: Vacation[] = [
  {
    id: 'vac1', depart: addDays(t, 34), return: addDays(t, 48),
    notes: 'Family away two weeks. Rosie has requested overlapping leave; that needs resolving before either is agreed with anyone.',
    status: 'planned',
    preTasks: tasks([
      ['Complete all laundry and put away', 2, 'days', 'before', 90],
      ['Empty all bins', 1, 'days', 'before', 15],
      ['Remove perishables from the family fridge', 1, 'days', 'before', 20],
      ['Clean the refrigerator', 1, 'days', 'before', 30],
      ['Clean the family kitchen', 1, 'days', 'before', 30],
      ['Clean all household bathrooms', 1, 'days', 'before', 45],
      ['Refresh bedding in all bedrooms', 1, 'days', 'before', 40],
      ['Check every window and door', 0, 'days', 'before', 15],
      ['Check all taps and under-sink areas', 0, 'days', 'before', 15],
      ['Confirm which appliances stay on', 0, 'days', 'before', 10],
      ['Water and check all plants', 0, 'days', 'before', 20],
      ['Confirm cat care arrangements for the full period plus three days', 0, 'days', 'before', 15],
      ['Confirm cat food and litter supplies', 0, 'days', 'before', 10],
    ]),
    duringTasks: tasks([
      ['Check for leaks under every sink', 0, 'days', 'before', 10],
      ['Check AC running in every room', 0, 'days', 'before', 10],
      ['Check electricity and lights', 0, 'days', 'before', 5],
      ['Check the terrace', 0, 'days', 'before', 10],
      ['Check on the cat and her wellbeing', 0, 'days', 'before', 15],
      ['Litter tray and bowls', 0, 'days', 'before', 10],
      ['Air the closed rooms', 0, 'days', 'before', 15],
      ['Check for unusual smells', 0, 'days', 'before', 5],
      ['Basic housekeeping pass', 0, 'days', 'before', 30],
    ]),
    postTasks: tasks([
      ['Clean all bedrooms', 1, 'days', 'before', 60],
      ['Fresh bedding throughout', 1, 'days', 'before', 45],
      ['Clean all bathrooms', 1, 'days', 'before', 45],
      ['Clean the kitchen', 1, 'days', 'before', 30],
      ['Vacuum and mop throughout', 1, 'days', 'before', 60],
      ['Dust throughout', 1, 'days', 'before', 40],
      ['Empty all bins', 1, 'days', 'before', 15],
      ['Fresh towels', 1, 'days', 'before', 20],
      ['Complete the requested grocery shopping', 1, 'days', 'before', 90, 'driver'],
      ['Cold water and fresh food in the fridge', 0, 'days', 'before', 20],
      ['Final house inspection', 0, 'days', 'before', 20],
    ]),
  },
];

export const SEED_TEMPLATES: OccasionTemplate[] = [
  {
    id: 'tpl-guest', kind: 'guest', name: 'Standard guest stay',
    tasks: GUEST_SPEC.map(([text, n, unit, dir, mins, role], i) => ({
      id: uid('tt'), text, offset: { n, unit, dir }, role: role ?? 'housekeeping', estMinutes: mins ?? 15, order: i,
    })),
  },
  {
    id: 'tpl-event', kind: 'event', name: 'Household dinner or party',
    tasks: EVENT_SPEC.map(([text, n, unit, dir, mins, role], i) => ({
      id: uid('tt'), text, offset: { n, unit, dir }, role: role ?? 'housekeeping', estMinutes: mins ?? 15, order: i,
    })),
  },
];
