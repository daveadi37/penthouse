-- ============================================================
-- The fixed vocabularies.
--
-- Every closed union in src/types/index.ts and src/types/prayer.ts
-- becomes a Postgres enum here. The point is that the database refuses
-- a value the app could never have produced — a sheet cannot be
-- 'sent', an issue cannot be 'pending', a break is served or it is not.
--
-- Two conventions, both deliberate:
--
--   The type names are snake_case with no prefix. app_role rather than
--   role, because role collides with Postgres's own vocabulary.
--
--   The VALUES are the TypeScript string literals character for
--   character — 'areaDeep', 'Changes requested', 'in_progress'. They
--   are not tidied into snake_case. The adapter
--   that replaces the local store reads and writes these strings
--   directly, so a rename here would mean a translation layer in the
--   app, and a translation layer is where drift starts.
-- ============================================================

-- ---------- the spine ----------

-- One zone. The office side was dropped on 2026-08-28. It stays an enum
-- of one rather than disappearing, because thirty tables carry the
-- column and a second premises would otherwise be a thirty-table
-- migration instead of one ALTER TYPE.
create type zone as enum ('household');

-- There is deliberately no app_role enum. Roles are rows in the roles
-- table, because admins and owners create and edit the hierarchy at
-- runtime, and a role you can invent on a Tuesday cannot be a type that
-- only changes on a deployment. What is fixed is the capability list —
-- see the capability enum below, and has_capability() in
-- 20260828000300_identity_premises.sql.

create type staff_role as enum (
  'housekeeping',
  'cooking',
  'cook',
  'priestcare',
  'driver',
  'maintenance',
  'any'
);

-- The fixed vocabulary of powers. A role is composed from these; it
-- cannot invent one, because every value here corresponds to a policy
-- that has been written. Adding a capability is a migration and a code
-- change together, which is the correct amount of friction.
create type capability as enum (
  'day.view',
  'day.tick',
  'day.assign',
  'library.edit',
  'sheet.view',
  'sheet.edit',
  'sheet.check',
  'sheet.post',
  'issue.raise',
  'issue.viewAll',
  'issue.manage',
  'inventory.view',
  'inventory.edit',
  'cooking.view',
  'cooking.edit',
  'cooking.approve',
  'money.view',
  'money.viewOwner',
  'property.view',
  'property.edit',
  'register.view',
  'register.edit',
  'people.view',
  'people.manage',
  'occasions.view',
  'occasions.edit',
  'shrine.view',
  'shrine.log',
  'documents.view',
  'documents.viewOwner',
  'settings.edit',
  'roles.manage',
  'accounts.manage',
  'audit.view'
);

-- ---------- premises ----------

create type area_type as enum (
  'bedroom',
  'bathroom',
  'kitchen',
  'living',
  'shrine',
  'prayer',
  'utility',
  'storage',
  'outdoor',
  'circulation'
);

create type area_status as enum ('occupied', 'guest', 'unused', 'active');

-- High-use bathrooms get an extra midday pass; low-use rooms do not.
create type area_use as enum ('high', 'low');

-- ---------- work ----------

create type freq as enum (
  'daily',
  'weekly',
  'fortnightly',
  'monthly',
  'areaDeep',
  'weekdays'
);

create type apply_scope as enum ('global', 'areaType', 'area', 'zone');

-- Generated categories. A category with one of these is filled by the
-- system rather than hand-listed in the library.
create type category_system as enum ('laundry', 'cooking', 'occasion', 'plants', 'contracts');

create type task_source as enum (
  'library',
  'adhoc',
  'occasion',
  'plant',
  'contract',
  'meal',
  'laundry'
);

-- ---------- schedule ----------

create type appointment_kind as enum (
  'vendor',
  'meeting',
  'personal',
  'school',
  'delivery',
  'medical',
  'other'
);

create type absence_type as enum (
  'Day off',
  'Annual leave',
  'Sick',
  'Unpaid',
  'Public holiday'
);

-- ---------- issues and incidents ----------

create type issue_kind as enum ('fault', 'condition', 'request', 'supply');

create type issue_priority as enum ('urgent', 'high', 'normal', 'low');

-- The order below is the order the app walks the issue through.
create type issue_status as enum (
  'reported',
  'acknowledged',
  'assigned',
  'in_progress',
  'awaiting_vendor',
  'resolved',
  'closed'
);

create type incident_type as enum (
  'Damage',
  'Injury',
  'Security',
  'Water',
  'Electrical',
  'Fire',
  'Other'
);

-- ---------- supplies ----------

create type movement_reason as enum (
  'count',
  'used',
  'purchased',
  'wasted',
  'transferred',
  'adjustment'
);

create type shopping_status as enum ('needed', 'ordered', 'purchased');

-- ---------- kitchen ----------

create type meal_type as enum ('Breakfast', 'Lunch', 'Dinner');

create type meal_status as enum (
  'Draft',
  'Submitted',
  'Changes requested',
  'Approved',
  'Prepared',
  'Completed'
);

create type leftovers as enum ('None', 'Small amount', 'Planned leftovers');

-- ---------- property ----------

create type asset_cat as enum (
  'Appliances',
  'Electronics',
  'Furniture',
  'Outdoor',
  'Lighting',
  'Soft furnishings',
  'Artwork',
  'Kitchen equipment',
  'Cleaning equipment',
  'Fixtures',
  'Other'
);

-- Salik is the Dubai road toll. It is its own line because it arrives
-- as its own statement.
create type vehicle_log_type as enum (
  'Fuel',
  'Service',
  'Repair',
  'Fine',
  'Toll',
  'Salik',
  'Other'
);

create type contract_cat as enum (
  'AC',
  'Water tank',
  'Pest control',
  'Pool',
  'Lift',
  'Fire safety',
  'Generator',
  'Cleaning',
  'Windows',
  'IT',
  'Other'
);

-- ---------- people and access ----------

create type contact_cat as enum (
  'Emergency',
  'Building',
  'Medical',
  'Family',
  'School',
  'Vet',
  'Government',
  'Other'
);

create type vendor_cat as enum (
  'Cleaning',
  'Rugs',
  'Upholstery',
  'Pest control',
  'AC',
  'Plumbing',
  'Electrical',
  'Pool',
  'Handyman',
  'Appliances',
  'IT',
  'Stationery',
  'Grocery',
  'Laundry',
  'Vehicle',
  'Other'
);

create type delivery_status as enum ('received', 'collected', 'returned');

create type credential_kind as enum ('Key', 'Fob', 'Code', 'Remote', 'Card');

-- ---------- money ----------

create type expense_kind as enum (
  'household',
  'staff',
  'vehicle',
  'maintenance',
  'supplies',
  'utilities',
  'other'
);

-- Who may read a figure. 'manager' means everyone from manager upward;
-- 'owner' means Shrien and Aditya only.
create type visibility as enum ('owner', 'manager');

create type payment_method as enum (
  'Card',
  'Bank transfer',
  'Cash',
  'Petty cash',
  'Direct debit',
  'Cheque'
);

-- What a transaction can be pinned to. Deliberately narrower than
-- document_link_type — you cannot bill a transaction to a transaction.
create type transaction_link_type as enum (
  'issue',
  'asset',
  'vehicle',
  'contract',
  'shopping',
  'staff'
);

create type charge_kind as enum ('bill', 'subscription');

create type charge_cadence as enum ('monthly', 'quarterly', 'biannual', 'annual', 'weekly');

-- 'float' is money handed out, 'spend' is money used, 'return' is what
-- came back. The three together have to reconcile.
create type petty_direction as enum ('float', 'spend', 'return');

create type doc_cat as enum (
  'Tenancy',
  'Insurance',
  'Warranty',
  'Permit',
  'Visa',
  'Passport',
  'Contract',
  'Manual',
  'Invoice',
  'Receipt',
  'Certificate',
  'Payslip',
  'Other'
);

create type document_link_type as enum (
  'asset',
  'vehicle',
  'contract',
  'staff',
  'issue',
  'transaction'
);

-- ---------- employment ----------

-- 'derived' means the hours came from the shift pattern rather than
-- from someone clocking in, and should be treated as an assumption.
create type attendance_source as enum ('manual', 'derived');

create type leave_status as enum ('requested', 'approved', 'declined', 'taken');

-- ---------- occasions ----------

create type offset_unit as enum ('days', 'hours', 'minutes');

create type offset_direction as enum ('before', 'after');

create type occasion_status as enum ('planned', 'active', 'complete', 'cancelled');

create type occasion_kind as enum ('guest', 'event');

-- A vacation task belongs to one of three runs: before leaving, while
-- away, after coming back.
create type vacation_phase as enum ('pre', 'during', 'post');

-- ---------- notifications ----------

create type notif_kind as enum (
  'day_ready',
  'task_assigned',
  'task_reminder',
  'issue_raised',
  'issue_update',
  'meal_approval',
  'stock_low',
  'bill_due',
  'expiry',
  'coverage_gap',
  'delivery',
  'incident'
);

-- The class is what a person switches off. Nobody mutes 'assigned'
-- work in practice, but they do mute reminders.
create type notif_class as enum ('assigned', 'reminder', 'escalation', 'response');

-- ---------- the running sheet ----------

-- 'draft' while it is being filled in, 'checked' once Earl has read
-- it, 'posted' once it has gone to the group. The step from checked to
-- posted is the one the footer rule guards.
create type sheet_status as enum ('draft', 'checked', 'posted');

-- The shopping list's in-stock column. 'unknown' is the honest default
-- — nobody has looked yet — and is not the same as 'no'.
create type stock_state as enum ('yes', 'no', 'partial', 'unknown');

create type divo_action as enum ('lit', 'topped', 'checked', 'extinguished');

create type oil_level as enum ('full', 'half', 'low', 'empty');

-- The two photographs that go on the group each night.
create type sheet_photo_kind as enum ('setup', 'clearup');
