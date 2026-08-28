-- ============================================================
-- The daily prayer running sheet. The spine of the product.
--
-- One printed page per date, posted to the 3808 Home WhatsApp group by
-- 09:00. It carries six sections — who is working, the order of the day,
-- the menu, the shopping list, the guests, and thirty-one checks in four
-- groups — plus what happens while the prayers run: the breaks where
-- water goes round, the guest toilet every twenty minutes, and the two
-- photographs that go on the group at the end of the night.
--
-- The six repeating sections are child tables, not jsonb. They are edited
-- row by row by different people during the day, they are ticked
-- individually with a name and a time against each tick, and the whole
-- point of the sheet is that you can ask who did what. None of that
-- survives being a blob.
--
-- The one constraint that matters most is at the bottom of the
-- running_sheets definition. The documents state it more emphatically
-- than anything else on the page:
--
--   "Never send this sheet out with the prayer start time or the number
--    of meals left blank."
--
-- So the database refuses it, not just the form.
-- ============================================================


-- ---------- the sheet ----------

create table running_sheets (
  id uuid primary key default gen_random_uuid(),
  -- Unique. There is one sheet per day and the app stores them keyed by
  -- date; two sheets for the same date would mean two different answers
  -- to what is happening today.
  date date not null unique,
  -- The header line as printed — '9th day of the Prayer'.
  occasion text not null default '',
  -- Which day of the observance this is, where one is running.
  occasion_day_no smallint,
  -- Number of meals to lay. Blank blocks posting.
  meals smallint,
  guests smallint,
  -- Blank blocks posting.
  prayers_start time,
  -- Planned finish, as printed on the sheet.
  prayers_end time,
  -- When they actually finished. This is the figure Marvin needs so the
  -- breads are timed right, and it is not the same as the planned end.
  actual_prayers_end time,
  -- 'Dinner' on the 21 August sheet; the blank template says only 'Menu'.
  sitting text not null default '',
  status sheet_status not null default 'draft',
  -- Names, not profile ids. These two are printed lines on the page, and
  -- the person who prepared it is sometimes not an account holder.
  prepared_by text,
  prepared_at timestamptz,
  checked_by text,
  checked_at timestamptz,
  posted_at timestamptz,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- The footer rule, enforced. A sheet cannot reach 'posted' with the
  -- prayer start time or the meals count blank. Meals must also be above
  -- zero: the app treats 0 as blank, and a sheet claiming no meals on a
  -- prayer day is a data-entry slip, not a fact.
  constraint running_sheets_posted_needs_start_and_meals check (
    status <> 'posted'
    or (prayers_start is not null and meals is not null and meals > 0)
  ),
  -- A posted sheet has to say who prepared it. R23.
  constraint running_sheets_posted_needs_preparer check (
    status <> 'posted' or coalesce(prepared_by, '') <> ''
  ),
  constraint running_sheets_meals_sane check (meals is null or meals >= 0),
  constraint running_sheets_guests_sane check (guests is null or guests >= 0),
  constraint running_sheets_day_no_sane check (occasion_day_no is null or occasion_day_no > 0)
);

comment on table running_sheets is 'One running sheet per date. The header bar, the status, and the prepared-by and checked-by lines. Its six sections are the child tables below.';
comment on column running_sheets.date is 'Unique. One sheet per day, keyed by date exactly as the app stores it.';
comment on column running_sheets.occasion is 'The printed occasion line, e.g. ''9th day of the Prayer''.';
comment on column running_sheets.occasion_day_no is 'Day number within a multi-day observance. Null outside one.';
comment on column running_sheets.meals is 'Meals to lay. Null blocks posting — see running_sheets_posted_needs_start_and_meals.';
comment on column running_sheets.prayers_start is 'Null blocks posting. The documents are emphatic about this one.';
comment on column running_sheets.actual_prayers_end is 'When the prayers really finished, passed to Marvin so the breads are timed right. R22.';
comment on column running_sheets.sitting is 'Which sitting the menu is for — ''Dinner'' on the completed example.';
comment on column running_sheets.prepared_by is 'A name, not a profile id. It is a printed line, and whoever prepared it may not hold an account.';
comment on column running_sheets.checked_by is 'A name, not a profile id. Earl Tiongco on every sheet.';

create index running_sheets_date_idx on running_sheets (date);
create index running_sheets_status_idx on running_sheets (status);
create index running_sheets_unposted_idx on running_sheets (date) where status <> 'posted';

create trigger running_sheets_touch before update on running_sheets
  for each row execute function touch_updated_at();


-- ---------- section 1: who is working today ----------

create table sheet_roster_rows (
  id uuid primary key default gen_random_uuid(),
  sheet_id uuid not null references running_sheets (id) on delete cascade,
  -- Set where the row is a real account. Blank for the Priests and for
  -- one-off helpers, which is why the name below is stored as well.
  person_id text references profiles (id) on delete set null,
  who text not null,
  job text not null default '',
  -- Free text, because the real sheet writes 'Lives in — on duty until
  -- close-down', 'As directed' and '—' as often as it writes clock hours.
  hours text not null default '',
  duties text not null default '',
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table sheet_roster_rows is 'Section 1. Who is working today, their job, their hours and what they do — in the words printed on the page.';
comment on column sheet_roster_rows.person_id is 'The account, where there is one. Null for the Priests and one-off helpers; `who` always carries the name.';
comment on column sheet_roster_rows.hours is 'Free text. ''Lives in — on duty until close-down'' is a valid value.';

create index sheet_roster_rows_sheet_idx on sheet_roster_rows (sheet_id, sort_order);
create index sheet_roster_rows_person_idx on sheet_roster_rows (person_id);

create trigger sheet_roster_rows_touch before update on sheet_roster_rows
  for each row execute function touch_updated_at();


-- ---------- section 2: order of the day ----------

create table sheet_order_rows (
  id uuid primary key default gen_random_uuid(),
  sheet_id uuid not null references running_sheets (id) on delete cascade,
  -- Often not a clock time at all. 'Morning', 'By 15:45', 'During
  -- prayers', 'Straight after aarti', 'After the meal' and 'Before bed'
  -- are all real values off the source document.
  time_label text not null,
  -- Optional clock time, used only to place the row on a timeline.
  sort_at time,
  what text not null,
  -- Free text. The sheet writes 'Reza / Aditya / Earl / Rosie'.
  who text not null default '',
  sort_order integer not null default 0,
  done boolean not null default false,
  done_by text references profiles (id) on delete set null,
  done_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sheet_order_rows_done_attributed check (
    done = false or (done_by is not null and done_at is not null)
  )
);

comment on table sheet_order_rows is 'Section 2. The order of the day, from Marvin''s morning shop to the divo check before bed.';
comment on column sheet_order_rows.time_label is 'What is printed in the Time column. Not always a clock time.';
comment on column sheet_order_rows.sort_at is 'Optional clock time for ordering only. Null for ''Morning'', ''During prayers'' and the like.';

create index sheet_order_rows_sheet_idx on sheet_order_rows (sheet_id, sort_order);
create index sheet_order_rows_done_by_idx on sheet_order_rows (done_by);

create trigger sheet_order_rows_touch before update on sheet_order_rows
  for each row execute function touch_updated_at();


-- ---------- section 3: menu ----------

create table sheet_menu_rows (
  id uuid primary key default gen_random_uuid(),
  sheet_id uuid not null references running_sheets (id) on delete cascade,
  dish text not null default '',
  who_makes text not null default '',
  -- Free text, and blank as often as not on the source sheet.
  how_many text not null default '',
  notes text not null default '',
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table sheet_menu_rows is 'Section 3. Dish, who makes it, how many, notes. The blank template lays six empty rows and they are real rows, so dish may be empty.';
comment on column sheet_menu_rows.how_many is 'Free text, not a number. The source sheet leaves it blank more often than it fills it.';

create index sheet_menu_rows_sheet_idx on sheet_menu_rows (sheet_id, sort_order);

create trigger sheet_menu_rows_touch before update on sheet_menu_rows
  for each row execute function touch_updated_at();


-- ---------- section 4: shopping list ----------

create table sheet_shopping_rows (
  id uuid primary key default gen_random_uuid(),
  sheet_id uuid not null references running_sheets (id) on delete cascade,
  item text not null default '',
  -- Multi-line on the real sheet — '2L low-fat fresh milk' on one line,
  -- '1kg yoghurt' on the next.
  how_much text not null default '',
  inStock stock_state not null default 'unknown',
  who_buys text not null default '',
  notes text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table sheet_shopping_rows is 'Section 4. The standing rows carry over every day: the daily milk and yoghurt, the divo oil kept two spare, and the flowers, incense, matches and wicks.';
comment on column sheet_shopping_rows.how_much is 'May contain newlines. The source cell holds two quantities on two lines.';
comment on column sheet_shopping_rows."instock" is 'Whether it is in stock. ''unknown'' means nobody has looked, which is not the same as ''no''.';

create index sheet_shopping_rows_sheet_idx on sheet_shopping_rows (sheet_id, sort_order);
create index sheet_shopping_rows_short_idx on sheet_shopping_rows (sheet_id) where inStock <> 'yes';

create trigger sheet_shopping_rows_touch before update on sheet_shopping_rows
  for each row execute function touch_updated_at();


-- ---------- section 5: guests ----------

create table sheet_guest_rows (
  id uuid primary key default gen_random_uuid(),
  sheet_id uuid not null references running_sheets (id) on delete cascade,
  name text not null default '',
  -- Free text. The source sheet uses '-' when nobody knows yet.
  arriving text not null default '',
  -- What they cannot eat, and where they sit.
  notes text not null default '',
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table sheet_guest_rows is 'Section 5. Who is coming, when, and what they cannot eat. Separate from the occasions `guests` table, which is for people staying in the house.';
comment on column sheet_guest_rows.arriving is 'Free text. ''-'' is what the source sheet writes when the time is not known.';
comment on column sheet_guest_rows.notes is 'Food they cannot eat, and seating. Mama prefers sugar-free tea.';

create index sheet_guest_rows_sheet_idx on sheet_guest_rows (sheet_id, sort_order);

create trigger sheet_guest_rows_touch before update on sheet_guest_rows
  for each row execute function touch_updated_at();


-- ---------- section 6: the thirty-one daily checks ----------

create table sheet_check_groups (
  id uuid primary key default gen_random_uuid(),
  sheet_id uuid not null references running_sheets (id) on delete cascade,
  title text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table sheet_check_groups is 'Four groups on every sheet: SHRINE before prayers, PRAYER SET-UP finished by 15:45, THE HOUSE before the first guest, AFTER THE MEAL close-down.';
comment on column sheet_check_groups.title is 'The heading as printed, including the timing clause after the dash.';

create index sheet_check_groups_sheet_idx on sheet_check_groups (sheet_id, sort_order);

create trigger sheet_check_groups_touch before update on sheet_check_groups
  for each row execute function touch_updated_at();


create table sheet_check_items (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references sheet_check_groups (id) on delete cascade,
  text text not null,
  done boolean not null default false,
  done_by text references profiles (id) on delete set null,
  done_at timestamptz,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- R14: tickable, with who ticked and when. A tick with no name against
  -- it tells nobody anything the morning after.
  constraint sheet_check_items_done_attributed check (
    done = false or (done_by is not null and done_at is not null)
  )
);

comment on table sheet_check_items is 'Seven shrine checks, eight prayer set-up, seven house, nine close-down. Thirty-one in all, in the exact order the documents give them.';
comment on column sheet_check_items.text is 'The check as written, e.g. ''Divo lit and topped up — correct oil only''.';
comment on column sheet_check_items.done_by is 'Who ticked it. Required once done is true.';

create index sheet_check_items_group_idx on sheet_check_items (group_id, sort_order);
create index sheet_check_items_done_by_idx on sheet_check_items (done_by);
create index sheet_check_items_outstanding_idx on sheet_check_items (group_id) where not done;

create trigger sheet_check_items_touch before update on sheet_check_items
  for each row execute function touch_updated_at();


-- ---------- what happens while the prayers run ----------

create table prayer_breaks (
  id uuid primary key default gen_random_uuid(),
  sheet_id uuid not null references running_sheets (id) on delete cascade,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  -- R15. Water goes round at every break, without exception, so this is
  -- recorded rather than assumed.
  water_served boolean not null default false,
  served_by text references profiles (id) on delete set null,
  notes text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint prayer_breaks_window check (ended_at is null or ended_at >= started_at)
);

comment on table prayer_breaks is 'Two or three each day. The prayers run 16:00 to about 19:30 and break in the middle; water is served to everyone at every break.';
comment on column prayer_breaks.water_served is 'R15. Recorded, not assumed — the documents make it a rule for every break.';
comment on column prayer_breaks.ended_at is 'Null while the break is still running.';

create index prayer_breaks_sheet_idx on prayer_breaks (sheet_id, started_at);
create index prayer_breaks_served_by_idx on prayer_breaks (served_by);

create trigger prayer_breaks_touch before update on prayer_breaks
  for each row execute function touch_updated_at();


-- Append-only: a reading taken at a moment, never revised. No
-- updated_at, and no trigger.
create table toilet_checks (
  id uuid primary key default gen_random_uuid(),
  sheet_id uuid not null references running_sheets (id) on delete cascade,
  at timestamptz not null default now(),
  -- Restrict: the value of the record is that it names who looked.
  by_id text not null references profiles (id) on delete restrict,
  clean boolean not null default true,
  restocked boolean not null default false,
  notes text,
  created_at timestamptz not null default now()
);

comment on table toilet_checks is 'R16. The guest toilet, checked and restocked every twenty minutes while the prayers run. Append-only — a reading is not revised.';
comment on column toilet_checks.by_id is 'Who looked. Restrict on delete, because an unattributed check is worthless.';
comment on column toilet_checks.restocked is 'Whether toilet paper was actually put out, as distinct from whether the room was clean.';

create index toilet_checks_sheet_idx on toilet_checks (sheet_id, at);
create index toilet_checks_by_idx on toilet_checks (by_id);


create table sheet_photos (
  id uuid primary key default gen_random_uuid(),
  sheet_id uuid not null references running_sheets (id) on delete cascade,
  kind sheet_photo_kind not null,
  -- Storage path in the files bucket. May be empty: on the seeded
  -- history the photographs only ever existed in the WhatsApp group.
  path text not null default '',
  at timestamptz not null default now(),
  by_id text not null references profiles (id) on delete restrict,
  -- R18. The photograph existing is not the point; it being on the group
  -- is the point.
  posted_to_group boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table sheet_photos is 'R18. The set-up and clear-up photographs that go on the 3808 Home group before bed.';
comment on column sheet_photos.path is 'Storage path. Empty where the photograph only ever lived in the WhatsApp group.';
comment on column sheet_photos.posted_to_group is 'Whether it actually reached the group. That is the requirement, not the file existing.';

create index sheet_photos_sheet_idx on sheet_photos (sheet_id, kind);
create index sheet_photos_by_idx on sheet_photos (by_id);

create trigger sheet_photos_touch before update on sheet_photos
  for each row execute function touch_updated_at();
