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
  'sheet.view', 'sheet.edit', 'sheet.check', 'sheet.post',
  'issue.raise', 'issue.viewAll', 'issue.manage',
  'inventory.view', 'inventory.edit',
  'cooking.view', 'cooking.edit', 'cooking.approve',
  'money.view', 'money.viewOwner',
  'property.view', 'property.edit',
  'register.view', 'register.edit',
  'people.view', 'people.manage',
  'occasions.view', 'occasions.edit',
  'shrine.view', 'shrine.log',
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
      'In charge of the day. Checks the running sheet before it goes out, assigns the work, closes issues. Sees household spending but not the owner’s.',
    capabilities: [
      'day.view', 'day.tick', 'day.assign', 'library.edit',
      'sheet.view', 'sheet.edit', 'sheet.check', 'sheet.post',
      'issue.raise', 'issue.viewAll', 'issue.manage',
      'inventory.view', 'inventory.edit',
      'cooking.view', 'cooking.edit', 'cooking.approve',
      'money.view',
      'property.view', 'property.edit',
      'register.view', 'register.edit',
      'people.view', 'people.manage',
      'occasions.view', 'occasions.edit',
      'shrine.view', 'shrine.log',
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
      'Lives the day. Ticks the work off, fills the sheet in, counts the stock, logs the divo, reports anything broken.',
    capabilities: [
      'day.view', 'day.tick',
      'sheet.view', 'sheet.edit', 'sheet.post',
      'issue.raise', 'issue.viewAll',
      'inventory.view', 'inventory.edit',
      'cooking.view', 'cooking.edit',
      'register.view', 'register.edit',
      'occasions.view',
      'shrine.view', 'shrine.log',
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
      'Paid by the hour or on site for a session — the cooks, and anyone brought in for an occasion. Sees the day and the sheet, ticks their own work, can say something is wrong.',
    capabilities: [
      'day.view', 'day.tick',
      'sheet.view',
      'issue.raise',
      'inventory.view',
      'cooking.view',
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
      'Lives here and is not staff. Reads the sheet, sees what is happening, can say something is broken. No staff records, no money.',
    capabilities: [
      'day.view',
      'sheet.view',
      'issue.raise',
      'cooking.view',
      'occasions.view',
      'shrine.view',
    ],
    system: true,
    active: true,
  },
];
