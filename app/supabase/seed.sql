-- ============================================================
-- The house's starting rows. Run once, after every migration.
--
-- This is not example data. It is apartment 3808 as it actually is on
-- the 28th of August 2026: the people, the rooms, the hierarchy, the
-- observance that runs to the 11th of September, the standing shopping
-- rows printed on every sheet, and the thirty-one daily checks.
--
-- Two things it deliberately does not do:
--
--   It does not create logins. A row in profiles is not a way to sign
--   in. Passwords are set from inside the app, by an owner, through the
--   admin-users Edge Function — see docs/DEPLOY.md step 3.
--
--   It does not invent a history. There are no fabricated ticks, no
--   made-up spending and no seeded issues, because a fabricated record
--   of who cleaned the shrine last Tuesday is worse than an empty one.
--   The first real day is the first day somebody uses it.
--
-- Safe to re-run: every insert is ON CONFLICT DO NOTHING or an upsert.
-- ============================================================

begin;

-- ---------- the hierarchy ----------

insert into roles (id, name, rank, description, works, is_system) values
  ('owner',   'Owner',         100, 'The family principals. Everything, including owner-only spending and documents, and the power to create logins.', false, true),
  ('admin',   'Admin',          90, 'Runs the app on the household''s behalf. Everything an owner can do except see owner-only money and documents.', false, true),
  ('manager', 'House manager',  70, 'In charge of the day. Checks the running sheet before it goes out, assigns the work, closes issues. Sees household spending but not the owner''s.', false, true),
  ('staff',   'Staff',          50, 'Lives the day. Ticks the work off, fills the sheet in, counts the stock, logs the divo, reports anything broken.', true, true),
  ('helper',  'Helper',         30, 'Paid by the hour or on site for a session — the cooks, and anyone brought in for an occasion.', true, true),
  ('family',  'Family',         20, 'Lives here and is not staff. Reads the sheet, sees what is happening, can say something is broken.', false, true)
on conflict (id) do nothing;


-- The capability grid. Written as a cross join against a list rather
-- than sixty INSERT lines, so a reader can see the shape of each role
-- in one place instead of counting rows.
insert into role_capabilities (role_id, capability)
select 'owner', c from unnest(enum_range(null::capability)) c
on conflict do nothing;

insert into role_capabilities (role_id, capability)
select 'admin', c from unnest(enum_range(null::capability)) c
where c not in ('money.viewOwner', 'documents.viewOwner')
on conflict do nothing;

insert into role_capabilities (role_id, capability)
select 'manager', c from unnest(array[
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
  'audit.view'
]::capability[]) c
on conflict do nothing;

insert into role_capabilities (role_id, capability)
select 'staff', c from unnest(array[
  'day.view', 'day.tick',
  'sheet.view', 'sheet.edit', 'sheet.post',
  'issue.raise', 'issue.viewAll',
  'inventory.view', 'inventory.edit',
  'cooking.view', 'cooking.edit',
  'register.view', 'register.edit',
  'occasions.view',
  'shrine.view', 'shrine.log',
  'documents.view'
]::capability[]) c
on conflict do nothing;

insert into role_capabilities (role_id, capability)
select 'helper', c from unnest(array[
  'day.view', 'day.tick', 'sheet.view', 'issue.raise', 'inventory.view', 'cooking.view'
]::capability[]) c
on conflict do nothing;

insert into role_capabilities (role_id, capability)
select 'family', c from unnest(array[
  'day.view', 'sheet.view', 'issue.raise', 'cooking.view', 'occasions.view', 'shrine.view'
]::capability[]) c
on conflict do nothing;


-- ---------- the people ----------

-- Real email addresses are needed for the accounts that will exist.
-- The @3808.local ones below are placeholders and must be replaced
-- before the logins are created — an account cannot be made against an
-- address that does not resolve.
insert into profiles (id, name, role, staff_roles, email, phone, initials, active, can_sign_in, is_household_member) values
  ('p-shrien',  'Shrien',        'owner',   '{}',                              'shrien@3808.local',                    '+971 50 000 0001', 'SH', true,  true,  true),
  ('p-aditya',  'Aditya Dave',   'owner',   '{priestcare}',                    'aditya.dave@evolvecaregroup.com',      '+971 50 000 0002', 'AD', true,  true,  true),
  ('p-salyna',  'Salyna',        'owner',   '{}',                              'salyna@3808.local',                    '+971 50 000 0021', 'SA', true,  true,  true),
  ('p-earl',    'Earl Tiongco',  'manager', '{}',                              'earl@3808.local',                      '+971 50 000 0003', 'ET', true,  true,  false),
  ('p-rosie',   'Rosie',         'staff',   '{housekeeping,cooking}',          'rosie@3808.local',                     '+971 50 000 0011', 'RO', true,  true,  false),
  ('p-reza',    'Reza',          'staff',   '{cooking,housekeeping}',          'reza@3808.local',                      '+971 50 000 0012', 'RE', true,  true,  false),
  ('p-marvin',  'Marvin',        'staff',   '{driver,housekeeping}',           'marvin@3808.local',                    '+971 50 000 0013', 'MA', true,  true,  false),
  ('p-jagdish', 'Jagdishbhai',   'helper',  '{cook}',                          '',                                     '+971 50 000 0014', 'JB', true,  false, false),
  ('p-hitesh',  'Hiteshbhai',    'helper',  '{cook}',                          '',                                     '+971 50 000 0015', 'HB', true,  false, false),
  ('p-priests', 'Priests',       'family',  '{}',                              '',                                     '',                 'PR', true,  false, false),
  ('p-charlie', 'Charlie',       'family',  '{}',                              'charlie@3808.local',                   '+971 50 000 0022', 'CH', true,  true,  true),
  ('p-aria',    'Aria',          'family',  '{}',                              '',                                     '',                 'AR', true,  false, true),
  ('p-noor',    'Noor',          'family',  '{}',                              '',                                     '',                 'NO', true,  false, true)
on conflict (id) do nothing;


-- Shifts. Straight off the running sheet: Rosie lives in and is on
-- until close-down, Reza comes at 14:00 for the prayers, the cooks are
-- on site for their session only. Each has one day off, which is what
-- makes the coverage rules below do real work.
insert into shifts (id, staff_id, days, start_time, end_time, day_off) values
  (gen_random_uuid(), 'p-rosie',   '{0,2,3,4,5,6}', '07:00', '22:00', 1),
  (gen_random_uuid(), 'p-reza',    '{0,1,3,4,5,6}', '14:00', '22:00', 2),
  (gen_random_uuid(), 'p-marvin',  '{0,1,2,4,5,6}', '09:00', '18:00', 3),
  (gen_random_uuid(), 'p-jagdish', '{0,1,2,3,4,5}', '15:00', '17:00', 6),
  (gen_random_uuid(), 'p-hitesh',  '{0,1,2,4,5,6}', '19:00', '21:00', 3)
on conflict do nothing;

insert into coverage_rules (id, role, zone, cover_staff_id, notes) values
  (gen_random_uuid(), 'driver',       'household', 'p-reza',   'Reza holds a licence and picks up the regular items.'),
  (gen_random_uuid(), 'housekeeping', 'household', 'p-reza',   'Essential household tasks only, on Rosie''s day off.'),
  (gen_random_uuid(), 'maintenance',  'household', 'p-marvin', 'Small repairs and anything that needs carrying. Anything electrical or plumbed goes to a vendor.'),
  (gen_random_uuid(), 'cooking',      'household', 'p-reza',   'Simple meals only — otherwise the household orders in.'),
  (gen_random_uuid(), 'cook',         'household', 'p-rosie',  'On the cooks'' days off Rosie reheats and makes the breads. Aditya is told the day before.'),
  (gen_random_uuid(), 'priestcare',   'household', 'p-earl',   'Earl stays with the priests if Aditya is away. Nothing about the shrine is decided without Aditya.')
on conflict do nothing;


-- ---------- the house ----------

insert into settings (
  id, house, address, whatsapp_group, sheet_post_by, checked_by_name,
  currency, locale, meal_times, portion_default,
  working_days, working_start, working_end,
  observance_from, observance_to,
  alert_lead_days, laundry_stages, unused_dows, plan_start, plan_end, parity_epoch
) values (
  true,
  'Goldcrest Views 3808',
  'Goldcrest Views 1, Jumeirah Lakes Towers, Cluster V, Dubai',
  '3808 Home',
  '09:00',
  'Earl Tiongco',
  'AED',
  'en-AE',
  '{"Breakfast": "08:00", "Lunch": "13:30", "Dinner": "19:30"}'::jsonb,
  4,
  '{0,1,2,3,4}', '09:00', '18:00',
  '2026-08-13', '2026-09-11',
  30,
  '{Wash,Dry,Fold,Iron,"Put away"}',
  '{1,5}',
  '06:00', '22:00',
  '2026-08-24'
)
on conflict (id) do nothing;


insert into areas (id, name, type, zone, floor, status, deep_freq, deep_dow, parity, use_level, standard) values
  ('a-sh1', 'Shrine',              'shrine',      'household', '38', 'active',    7, 1, 0, null,   'Dusted with the shrine cloth only — no sprays, no chemicals. Statues not moved. Used matchsticks and ash cleared. Divo lit and topped up with the correct oil.'),
  ('a-pr1', 'Prayer Area',         'prayer',      'household', '38', 'active',    7, 6, 0, null,   'Mats and seating square and laid out for the number expected. Mics tested. Cleared and put back after every sitting. Ken never in here.'),
  ('a-lv1', 'Lounge',              'living',      'household', '38', 'active',   14, 3, 0, null,   'Cushions plumped, surfaces clear, no cooking smell, lights set warm for the evening.'),
  ('a-lv2', 'Dining Room',         'living',      'household', '38', 'active',   14, 3, 1, null,   'Table laid to standard, chairs aligned and evenly spaced.'),
  ('a-kt1', 'Kitchen',             'kitchen',     'household', '38', 'active',    7, 4, 0, null,   'Empty countertops, dry sink, polished tap. No meat in here during the observance. Shrine items washed with the shrine sponge only.'),
  ('a-ba3', 'Guest Toilet',        'bathroom',    'household', '38', 'active',    7, 2, 0, 'high', 'Spotless and stocked. Checked and toilet paper restocked every 20 minutes while the prayers run.'),
  ('a-br1', 'Master Bedroom',      'bedroom',     'household', '38', 'occupied', 14, 1, 0, null,   'Symmetrical, calm, no personal clutter visible from the doorway.'),
  ('a-br2', 'Bedroom 2',           'bedroom',     'household', '38', 'occupied', 14, 2, 0, null,   'Symmetrical, calm, no personal clutter visible from the doorway.'),
  ('a-br3', 'Bedroom 3 — Guest',   'bedroom',     'household', '38', 'guest',    14, 3, 1, null,   'Kept permanently guest-ready. Used by the priests when they stay.'),
  ('a-ot1', 'Balcony — main',      'outdoor',     'household', '38', 'active',   14, 6, 0, null,   'No sand or leaf litter, furniture square, glass clear. Reza from 17:00.'),
  ('a-ot2', 'Balcony — second',    'outdoor',     'household', '38', 'active',   14, 6, 1, null,   'Swept and clear. The door is the draught that puts the divo out — keep it shut during prayers.'),
  ('a-cr1', 'Entrance & Hallway',  'circulation', 'household', '38', 'active',    7, 5, 0, null,   'First thing a guest sees. Shoes off here. Floor dry, glass clear, nothing stored here.'),
  ('a-ut1', 'Laundry & Utility',   'utility',     'household', '38', 'active',   14, 6, 0, null,   'Machines wiped, filters clear, floor dry, nothing left in a drum overnight.'),
  ('a-st2', 'Store',               'storage',     'household', '38', 'active',   30, 6, 0, null,   'Stock visible and countable from the door. Divo oil, wicks and matches always two deep.')
on conflict (id) do nothing;


-- ---------- the observance ----------

-- Thirty days, 13 August to 11 September 2026, both confirmed. Day one
-- was first worked out from the source document — the sheet dated Friday
-- 21 August is headed '9th day of the Prayer' — and that reading was
-- right. These two dates drive the occasion line on every sheet and the
-- window enforce_food_rule() refuses meat in.
insert into observances (id, name, start_date, end_date, day_count, notes, active) values (
  'ob-prayer', 'The Prayer', '2026-08-13', '2026-09-11', 30,
  'The priests lead every afternoon from 16:00 and the meal follows the aarti. The ninth day was the large sitting. All food is vegetarian for the whole thirty days.',
  true
)
on conflict (id) do nothing;


-- ---------- how the work is grouped ----------

insert into task_categories (id, name, icon, sort_order, zone, system, active) values
  ('c-shrine',   'Shrine & Prayers',   '🪔',  1, 'household', null,        true),
  ('c-open',     'Opening up',         '🌅',  2, 'household', null,        true),
  ('c-kitchen',  'Kitchen',            '🍳',  3, 'household', null,        true),
  ('c-bath',     'Bathrooms',          '🛁',  4, 'household', null,        true),
  ('c-bed',      'Bedrooms',           '🛏',  5, 'household', null,        true),
  ('c-living',   'Living areas',       '🛋',  6, 'household', null,        true),
  ('c-outdoor',  'Outside',            '🌿',  7, 'household', null,        true),
  ('c-cat',      'Cat care',           '🐱',  8, 'household', null,        true),
  ('c-close',    'Close-down',         '🌙',  9, 'household', null,        true),
  ('c-laundry',  'Laundry',            '🧺', 10, 'household', 'laundry',   true),
  ('c-cooking',  'Cooking',            '👨‍🍳', 11, 'household', 'cooking',   true),
  ('c-occasion', 'Occasions',          '✦',  12, 'household', 'occasion',  true),
  ('c-plants',   'Plants',             '🪴', 13, 'household', 'plants',    true),
  ('c-contract', 'Contracts & visits', '🔧', 14, 'household', 'contracts', true)
on conflict (id) do nothing;


-- The starting task library. Small on purpose. Everything here is
-- something the running sheet or the house standards already say out
-- loud; anything else is for Earl and Rosie to add from the app, where
-- adding a task and having it appear every day from then on is a
-- two-minute job rather than a code change.
insert into library_tasks (id, category_id, text, apply, area_type, area_id, zone, freq, dow, parity, instructions, role, default_time, est_minutes, group_as, light, sort_order) values
  ('lt-divo-am',   'c-shrine',  'Divo lit and topped up — correct oil only',              'area',     null,       'a-sh1', 'household', 'daily',    0, 0, 'Correct oil only. If the level is low or empty, log it — Earl is told automatically.', 'housekeeping', '07:15', 5,  'Shrine',        false, 0),
  ('lt-shrine-dust','c-shrine', 'Dust the shrine with the shrine cloth',                  'area',     null,       'a-sh1', 'household', 'daily',    0, 0, 'The shrine cloth only. No sprays, no chemicals. Statues are not moved — not to dust behind, not to make room.', 'housekeeping', '07:20', 10, 'Shrine',        false, 1),
  ('lt-shrine-ash','c-shrine',  'Clear used matchsticks and ash',                         'area',     null,       'a-sh1', 'household', 'daily',    0, 0, '', 'housekeeping', '07:30', 5,  'Shrine',        false, 2),
  ('lt-shrine-stock','c-shrine','Check matches, wicks and two spare bottles of divo oil', 'area',     null,       'a-sh1', 'household', 'daily',    0, 0, 'Two spare. Not one — the divo burns down over about three days and Marvin buys the oil first thing.', 'housekeeping', '07:35', 5, 'Shrine', false, 3),
  ('lt-prayer-set','c-shrine',  'Prayer set-up — mats, mics, flowers, incense, prasad',   'area',     null,       'a-pr1', 'household', 'daily',    0, 0, 'Finished by 15:45. Mics on and tested. Drinking water and clean glasses ready for the breaks.', 'housekeeping', '14:30', 45, 'Prayer area',  false, 4),
  ('lt-prayer-reset','c-shrine','Clear the prayer area and put it back',                  'area',     null,       'a-pr1', 'household', 'daily',    0, 0, 'After the meal. Shrine items washed with the shrine sponge only.', 'housekeeping', '21:30', 25, 'Close-down',  false, 5),

  ('lt-open-house','c-open',    'Open up — blinds, air the rooms, first pass of the hall','global',   null,       null,    'household', 'daily',    0, 0, 'No cooking smell in the lounge. Shoes off at the entrance.', 'housekeeping', '07:00', 15, 'Opening up', false, 0),
  ('lt-shopping-list','c-open', 'Write today''s list of anything needed',                 'global',   null,       null,    'household', 'daily',    0, 0, 'By 09:00, so Marvin has it for the morning run. Milk and yoghurt daily — only buy the yoghurt if it is finished or nearly.', 'housekeeping', '09:00', 10, 'Opening up', false, 1),

  ('lt-kitchen-reset','c-kitchen','Kitchen reset — counters, sink, tap',                  'area',     null,       'a-kt1', 'household', 'daily',    0, 0, 'Empty countertops, dry sink, polished tap. No meat in here during the observance.', 'cooking', '10:00', 20, 'Kitchen', false, 0),
  ('lt-kitchen-close','c-kitchen','Kitchen back to normal after the meal',                'area',     null,       'a-kt1', 'household', 'daily',    0, 0, 'Leftovers covered, labelled and dated. Shrine items washed with the shrine sponge only.', 'cooking', '21:45', 25, 'Close-down', false, 1),

  ('lt-guest-wc',  'c-bath',    'Guest toilet — clean and restock',                       'area',     null,       'a-ba3', 'household', 'daily',    0, 0, 'Spotless and stocked. During the prayers this is every twenty minutes, logged on the sheet.', 'housekeeping', '13:00', 10, 'Bathrooms', false, 0),
  ('lt-bath-daily','c-bath',    'Bathroom — surfaces, mirror, floor',                     'areaType', 'bathroom', null,    'household', 'daily',    0, 0, '', 'housekeeping', '11:00', 12, 'Bathrooms', true,  1),

  ('lt-bed-daily', 'c-bed',     'Make the bed and clear surfaces',                        'areaType', 'bedroom',  null,    'household', 'daily',    0, 0, 'Symmetrical, calm, nothing personal visible from the doorway.', 'housekeeping', '10:30', 12, 'Bedrooms', true, 0),
  ('lt-bed-deep',  'c-bed',     'Deep clean the room',                                    'areaType', 'bedroom',  null,    'household', 'areaDeep', 0, 0, '', 'housekeeping', null,   45, 'Bedrooms', false, 1),

  ('lt-living',    'c-living',  'Living area — cushions, surfaces, floor',                'areaType', 'living',   null,    'household', 'daily',    0, 0, 'Dining room, lounge and balcony clear and tidy before the first guest arrives. No cat bowls or cleaning things on show.', 'housekeeping', '11:30', 15, 'Living areas', false, 0),
  ('lt-hall',      'c-living',  'Entrance and hallway',                                   'area',     null,       'a-cr1', 'household', 'daily',    0, 0, 'The first thing a guest sees. Floor dry, glass clear, nothing stored here.', 'housekeeping', '11:45', 10, 'Living areas', false, 1),

  ('lt-balcony',   'c-outdoor', 'Balcony — sweep and square the furniture',               'areaType', 'outdoor',  null,    'household', 'daily',    0, 0, 'Reza from 17:00. Keep the second balcony door shut during prayers — it is the draught that puts the divo out.', 'housekeeping', '17:00', 15, 'Outside', false, 0),

  ('lt-ken-feed',  'c-cat',     'Feed Ken and refresh his water',                         'global',   null,       null,    'household', 'daily',    0, 0, '', 'housekeeping', '07:45', 5, 'Ken', false, 0),
  ('lt-ken-tray',  'c-cat',     'Ken''s tray',                                            'global',   null,       null,    'household', 'daily',    0, 0, '', 'housekeeping', '08:00', 5, 'Ken', false, 1),
  ('lt-ken-away',  'c-cat',     'Ken shut away from the prayer area and the open doors',  'global',   null,       null,    'household', 'daily',    0, 0, 'Before the first guest arrives, and checked again during the prayers.', 'housekeeping', '15:00', 5, 'Ken', false, 2),

  ('lt-bins',      'c-close',   'Empty every bin',                                        'global',   null,       null,    'household', 'daily',    0, 0, '', 'housekeeping', '21:50', 10, 'Close-down', false, 0),
  ('lt-divo-pm',   'c-close',   'Check the divo and top it up before bed',                'area',     null,       'a-sh1', 'household', 'daily',    0, 0, 'The last thing on the list, and it is on the list for a reason.', 'housekeeping', '22:00', 5, 'Close-down', false, 1),
  ('lt-photos',    'c-close',   'Post the set-up and clear-up photographs on the group',  'global',   null,       null,    'household', 'daily',    0, 0, 'R18. The photograph existing is not the point — it being on the 3808 Home group is the point.', 'housekeeping', '22:05', 5, 'Close-down', false, 2),
  ('lt-cash',      'c-close',   'Log any cash spent, with receipts',                      'global',   null,       null,    'household', 'daily',    0, 0, 'R19. Photograph the receipt as you log it, not later.', 'housekeeping', '22:10', 5, 'Close-down', false, 3),
  ('lt-tell-earl', 'c-close',   'Anything broken, missing or missed — tell Earl',         'global',   null,       null,    'household', 'daily',    0, 0, 'R20. The same day. Not tomorrow.', 'housekeeping', '22:15', 5, 'Close-down', false, 4),

  ('lt-store',     'c-close',   'Store — stock visible and countable from the door',      'area',     null,       'a-st2', 'household', 'weekly',   6, 0, 'Divo oil, wicks and matches always two deep.', 'housekeeping', null, 20, 'Store', false, 5)
on conflict (id) do nothing;


-- ---------- stock ----------

insert into inventory_categories (id, name, zone, sort_order) values
  ('ic-prayer',  'Prayer & shrine',   'household', 1),
  ('ic-kitchen', 'Kitchen & pantry',  'household', 2),
  ('ic-clean',   'Cleaning',          'household', 3),
  ('ic-laundry', 'Laundry',           'household', 4),
  ('ic-bath',    'Bathroom',          'household', 5),
  ('ic-cat',     'Ken',               'household', 6)
on conflict (id) do nothing;

-- The prayer and shrine rows carry the two flags that exist nowhere
-- else in the schema, and they are the reason this section is seeded at
-- all rather than left to whoever first opens Inventory.
insert into inventory_items (name, category_id, zone, qty, min_qty, unit, recurring, notes, prayer_item, shrine_only) values
  ('Divo oil',                'ic-prayer',  'household', 2,  2, 'bottles', true,  'Two spare, always. It burns down over about three days and Marvin buys it first thing.', false, false),
  ('Wicks',                   'ic-prayer',  'household', 40, 20, 'units',  true,  '', false, false),
  ('Matches',                 'ic-prayer',  'household', 4,  2, 'boxes',   true,  '', false, false),
  ('Incense',                 'ic-prayer',  'household', 6,  3, 'packs',   true,  '', false, false),
  ('Fresh flowers',           'ic-prayer',  'household', 1,  1, 'sets',    true,  'For the set-up. Marvin, first thing.', false, false),
  ('Shrine cloth',            'ic-prayer',  'household', 2,  1, 'units',   false, 'Shrine only. Never a spray, never a chemical. If it cannot be found, say so and wait — do not substitute.', false, true),
  ('Shrine sponge',           'ic-prayer',  'household', 2,  1, 'units',   false, 'Shrine only. Never meat, never the normal washing-up.', false, true),
  ('Milk — prayer marked',    'ic-prayer',  'household', 0,  0, 'litres',  false, 'Brought for prayer. Marked on the lid and never used for consumption. If a container is not marked, treat it as prayer stock and ask.', true,  false),
  ('Yoghurt — prayer marked', 'ic-prayer',  'household', 0,  0, 'kg',      false, 'Brought for prayer. Marked and set aside.', true,  false),
  ('Fresh milk',              'ic-kitchen', 'household', 2,  2, 'litres',  true,  'Low fat. Bought daily by Marvin.', false, false),
  ('Yoghurt',                 'ic-kitchen', 'household', 1,  1, 'kg',      true,  'Checked daily — only buy if finished or nearly finished.', false, false),
  ('Basmati rice',            'ic-kitchen', 'household', 5,  2, 'kg',      false, '', false, false),
  ('Toilet paper',            'ic-bath',    'household', 24, 12, 'rolls',  true,  'The guest toilet goes through it during the prayers.', false, false),
  ('Bin bags',                'ic-clean',   'household', 60, 30, 'units',  true,  '', false, false),
  ('Laundry detergent',       'ic-laundry', 'household', 3,  2, 'bottles', true,  '', false, false),
  ('Cat litter',              'ic-cat',     'household', 3,  2, 'bags',    true,  'Same brand — Ken will not use the other one.', false, false)
on conflict do nothing;


-- The three standing rows printed on every running sheet. They are on
-- the list every day whether or not anyone adds them, which is what
-- 'standing' means.
insert into shopping_items (name, zone, qty, unit, status, added_by, notes, standing) values
  ('Daily items — milk and yoghurt',   'household', 1, 'run',     'needed', 'p-rosie', '2L low-fat fresh milk, 1kg yoghurt. Marvin. Mark the containers so prayer items are not used for consumption. Check the yoghurt daily — only buy if finished or nearly finished.', true),
  ('Oil for the divo',                 'household', 2, 'bottles', 'needed', 'p-rosie', 'Keep 2 spare. Marvin, first thing. Correct oil only.', true),
  ('Flowers, incense, matches, wicks', 'household', 1, 'set',     'needed', 'p-rosie', 'Marvin. Fresh flowers for the set-up.', true)
on conflict do nothing;


-- ---------- how spending is grouped ----------

-- Seeded because transactions point at these with a RESTRICT foreign
-- key: without them the Money screen opens empty and the first payment
-- anybody tries to enter is refused.
insert into expense_categories (id, name, kind, zone, sort_order) values
  ('ec-groc',     'Groceries & food',       'household',   'household',  1),
  ('ec-prayer',   'Prayer & shrine',        'household',   'household',  2),
  ('ec-hclean',   'Cleaning & consumables', 'supplies',    'household',  3),
  ('ec-cat',      'Ken',                    'household',   'household',  4),
  ('ec-hmaint',   'Maintenance & repairs',  'maintenance', 'household',  5),
  ('ec-util',     'Utilities',              'utilities',   'household',  6),
  ('ec-veh',      'Vehicles',               'vehicle',     'household',  7),
  ('ec-staff',    'Staff costs',            'staff',       'household',  8),
  ('ec-contract', 'Service contracts',      'maintenance', 'household',  9),
  ('ec-guest',    'Guests & entertaining',  'household',   'household', 10),
  ('ec-other',    'Other',                  'other',       'household', 11)
on conflict (id) do nothing;


-- ---------- the laundry rota ----------

insert into laundry_slots (dow, person, load_type, sort_order) values
  (0, 'Household', 'Catch-up & anything outstanding', 0),
  (1, 'Salyna',    'Clothing',                        0),
  (2, 'Charlie',   'Clothing',                        0),
  (3, 'Aria',      'Clothing',                        0),
  (4, 'Noor',      'Clothing',                        0),
  (5, 'Household', 'Towels',                          0),
  (6, 'Household', 'Bedding',                         0)
on conflict do nothing;


-- ---------- notification preferences ----------

-- Everybody gets everything, quiet from 22:00 to 06:30, until they say
-- otherwise. Defaulting people out of notifications means an app nobody
-- trusts to tell them anything.
insert into notification_prefs (profile_id)
select id from profiles where can_sign_in
on conflict (profile_id) do nothing;


-- ---------- today ----------

-- Build the current day and open its sheet, so the app opens on
-- something real rather than on an empty state that looks broken.
select build_day(current_date);
select ensure_sheet(current_date);
select build_day(current_date + 1);
select ensure_sheet(current_date + 1);


-- The thirty-one checks, on today's sheet. Exact items, exact order,
-- taken from section 6 of the running sheet. The 05:00 job copies them
-- forward to each new day.
do $$
declare
  s_id uuid;
  g_id uuid;
  items text[];
  i int;
begin
  select id into s_id from running_sheets where date = current_date;
  if s_id is null or exists (select 1 from sheet_check_groups where sheet_id = s_id) then
    return;
  end if;

  insert into sheet_check_groups (sheet_id, title, sort_order)
  values (s_id, 'SHRINE — before prayers', 0) returning id into g_id;
  items := array[
    'Divo lit and topped up — correct oil only',
    'Shoes off before going near the shrine',
    'Dusted with the shrine cloth — no sprays, no chemicals',
    'Used matchsticks and ash cleared away',
    'Statues not moved',
    'Area around the shrine clear',
    'Matches, wicks and 2 spare bottles of divo oil in stock'];
  for i in 1 .. array_length(items, 1) loop
    insert into sheet_check_items (group_id, text, sort_order) values (g_id, items[i], i - 1);
  end loop;

  insert into sheet_check_groups (sheet_id, title, sort_order)
  values (s_id, 'PRAYER SET-UP — finished by 15:45', 1) returning id into g_id;
  items := array[
    'Mats and seating laid out for the number expected',
    'Mics on and tested',
    'Fresh flowers',
    'Incense',
    'Prasad made and covered',
    'Thali and prayer items laid out',
    'Drinking water and clean glasses ready for the breaks',
    'Prayer books or sheets out, if being used'];
  for i in 1 .. array_length(items, 1) loop
    insert into sheet_check_items (group_id, text, sort_order) values (g_id, items[i], i - 1);
  end loop;

  insert into sheet_check_groups (sheet_id, title, sort_order)
  values (s_id, 'THE HOUSE — before the first guest arrives', 2) returning id into g_id;
  items := array[
    'Dining room, lounge and balcony clear and tidy',
    'No cat bowls or cleaning things on show',
    'Ken shut away from the prayer area and the open doors',
    'Guest toilet spotless and stocked',
    'Table laid to standard',
    'Rooms aired — no cooking smell in the lounge',
    'Lights set warm for the evening'];
  for i in 1 .. array_length(items, 1) loop
    insert into sheet_check_items (group_id, text, sort_order) values (g_id, items[i], i - 1);
  end loop;

  insert into sheet_check_groups (sheet_id, title, sort_order)
  values (s_id, 'AFTER THE MEAL — close-down', 3) returning id into g_id;
  items := array[
    'Prayer area cleared and put back',
    'Shrine items washed with the shrine sponge only',
    'Divo checked and topped up before anyone goes to bed',
    'Leftovers covered, labelled and dated',
    'All bins emptied',
    'Kitchen back to normal',
    'Photos of the set-up and clear-up posted on the 3808 Home group',
    'Any cash spent logged, with receipts',
    'Anything broken, missing or missed — tell Earl the same day'];
  for i in 1 .. array_length(items, 1) loop
    insert into sheet_check_items (group_id, text, sort_order) values (g_id, items[i], i - 1);
  end loop;
end;
$$;


commit;
