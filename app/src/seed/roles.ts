import type { Capability, RoleDef } from '@/types';

/* ============================================================
   The hierarchy, as rows.

   Six roles are seeded because six is what the house has today, not
   because six is the limit. Admins and owners add, rename and recompose
   them from the role editor; what they cannot do is invent a new
   capability, because a capability is a thing the code and the database
   both have to know how to enforce.

   Rank is the whole hierarchy. You may only grant a role that ranks
   below your own — which is what stops a manager quietly making
   themselves an owner.
   ============================================================ */

const ALL: Capability[] = [
  'day.view', 'day.tick', 'day.assign', 'library.edit',
  'issue.raise', 'issue.viewAll', 'issue.manage',
  'inventory.view', 'inventory.edit',
  'cooking.view', 'cooking.edit', 'cooking.approve',
  'money.view', 'money.viewOwner',
  'property.view', 'property.edit',
  'register.view', 'register.edit',
  'people.view', 'people.manage',
  'occasions.view', 'occasions.edit',
  'chat.view', 'chat.post',
  'documents.view', 'documents.viewOwner',
  'settings.edit', 'roles.manage', 'accounts.manage', 'audit.view',
];

export const SEED_ROLES: RoleDef[] = [
  {
    id: 'owner',
    name: 'Owner',
    rank: 100,
    description:
      'The family principals. Everything, including owner-only spending and documents, and the power to create logins.',
    capabilities: ALL,
    system: true,
    active: true,
  },
  {
    id: 'admin',
    name: 'Admin',
    rank: 90,
    description:
      'Runs the app on the household’s behalf. Everything an owner can do except see owner-only money and documents.',
    capabilities: ALL.filter((c) => c !== 'money.viewOwner' && c !== 'documents.viewOwner'),
    system: true,
    active: true,
  },
  {
    id: 'manager',
    name: 'House manager',
    rank: 70,
    description:
      'In charge of the day. Assigns the work, keeps the buy list honest, closes issues. Sees household spending but not the owner’s.',
    capabilities: [
      'day.view', 'day.tick', 'day.assign', 'library.edit',
      'issue.raise', 'issue.viewAll', 'issue.manage',
      'inventory.view', 'inventory.edit',
      'cooking.view', 'cooking.edit', 'cooking.approve',
      'money.view',
      'property.view', 'property.edit',
      'register.view', 'register.edit',
      'people.view', 'people.manage',
      'occasions.view', 'occasions.edit',
      'chat.view', 'chat.post',
      'documents.view',
      'audit.view',
    ],
    system: true,
    active: true,
  },
  {
    id: 'staff',
    name: 'Staff',
    rank: 50,
    description:
      'Lives the day. Marvin and Rosie. Ticks the work off, counts the stock and marks what has been bought, reports anything broken, and is in the house chat like everyone else.',
    capabilities: [
      'day.view', 'day.tick',
      'issue.raise', 'issue.viewAll',
      'inventory.view', 'inventory.edit',
      'cooking.view', 'cooking.edit',
      'register.view', 'register.edit',
      'occasions.view',
      'chat.view', 'chat.post',
      'documents.view',
    ],
    works: true,
    system: true,
    active: true,
  },
  {
    id: 'helper',
    name: 'Helper',
    rank: 30,
    description:
      'Paid by the hour or on site for a session — anyone brought in for an occasion. Sees the day, ticks their own work, can say something is wrong.',
    capabilities: [
      'day.view', 'day.tick',
      'issue.raise',
      'inventory.view',
      'cooking.view',
      'chat.view', 'chat.post',
    ],
    works: true,
    system: true,
    active: true,
  },
  {
    id: 'family',
    name: 'Family',
    rank: 20,
    description:
      'Lives here and is not staff. Sees what is happening, can say something is broken, and is in the house chat. No staff records, no money.',
    capabilities: [
      'day.view',
      'issue.raise',
      'cooking.view',
      'occasions.view',
      'chat.view', 'chat.post',
    ],
    system: true,
    active: true,
  },
];
