-- ============================================================
-- Employment. Visas, attendance, leave and reviews.
--
-- Every table in this file is owner-and-manager only, and the policies
-- say so. A staff member reads their own row and nobody else's, which
-- is not a nicety — Rosie's salary, Reza's visa date and Marvin's
-- passport expiry are three of the most sensitive columns in the whole
-- database, and they sit beside a shopping list.
--
-- The three expiry dates are why this file exists at all. A residence
-- visa renewal takes about three weeks, a visa renewal needs six months
-- of passport validity, and a medical has to be done before the visa.
-- Missing any of them by a week is a real problem for a real person,
-- so all three are swept every morning and warned on well ahead.
-- ============================================================


-- ---------- the employment record ----------

create table staff_details (
  id uuid primary key default gen_random_uuid(),
  profile_id text not null unique references profiles (id) on delete cascade,
  role_title text not null default '',
  contract_start date,
  contract_end date,

  -- The three that stop somebody being legally able to work, in the
  -- order they depend on each other.
  visa_expiry date,
  passport_expiry date,
  medical_expiry date,

  leave_entitlement_days smallint not null default 30,
  pay_day smallint not null default 28,
  salary numeric(12, 2),
  lives_in boolean not null default false,
  emergency_contact text not null default '',
  emergency_phone text not null default '',
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint staff_pay_day_range check (pay_day between 1 and 31),
  constraint staff_salary_not_negative check (salary is null or salary >= 0),
  constraint staff_contract_order check (contract_end is null or contract_start is null or contract_end >= contract_start)
);

comment on table staff_details is 'The employment record. Owner and manager only — this table holds salaries and visa dates.';
comment on column staff_details.visa_expiry is 'Renewal takes about three weeks. Warned on well before, because the lead time is the whole problem.';
comment on column staff_details.passport_expiry is 'A visa renewal needs six months of passport validity, so this expiring is really the visa expiring early.';
comment on column staff_details.lives_in is 'Rosie lives in and is on until close-down. It changes what a day off actually means.';

create index staff_details_visa_idx on staff_details (visa_expiry);
create index staff_details_passport_idx on staff_details (passport_expiry);
create index staff_details_medical_idx on staff_details (medical_expiry);

create trigger staff_details_touch before update on staff_details
  for each row execute function touch_updated_at();


-- ---------- attendance ----------

-- Append-only. Reza is paid by the hour, so this table is the pay
-- record, and a row that can be edited quietly is a pay record nobody
-- can rely on. Corrections are a new row with a note, not an update.
create table attendance (
  id uuid primary key default gen_random_uuid(),
  staff_id text not null references profiles (id) on delete cascade,
  worked_on date not null,
  clock_in time,
  clock_out time,
  hours numeric(5, 2),
  source attendance_source not null default 'manual',
  notes text not null default '',
  created_at timestamptz not null default now(),
  constraint attendance_hours_sane check (hours is null or (hours >= 0 and hours <= 24)),
  constraint attendance_out_after_in check (clock_out is null or clock_in is null or clock_out >= clock_in)
);

comment on table attendance is 'Hours worked. Append-only, because for Reza this is the pay record and an editable pay record is not one.';
comment on column attendance.source is 'manual where somebody typed it, derived where it came from the shift pattern.';

create index attendance_staff_idx on attendance (staff_id, worked_on desc);
create index attendance_date_idx on attendance (worked_on desc);


-- ---------- leave ----------

create table leave_requests (
  id uuid primary key default gen_random_uuid(),
  staff_id text not null references profiles (id) on delete cascade,
  from_date date not null,
  to_date date not null,
  type absence_type not null,
  days numeric(4, 1) not null default 1,
  status leave_status not null default 'requested',
  requested_at timestamptz not null default now(),
  approved_by text references profiles (id) on delete set null,
  approved_at timestamptz,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint leave_dates_order check (to_date >= from_date),
  constraint leave_days_positive check (days > 0),
  -- Approved by somebody, or not approved. Silent approval is how a
  -- house ends up with nobody in it during a prayer week.
  constraint leave_approval_attributed
    check (status <> 'approved' or (approved_by is not null and approved_at is not null))
);

comment on table leave_requests is 'Time off, requested and answered. Approval is attributed by constraint — silent approval is how a prayer week ends up uncovered.';

create index leave_staff_idx on leave_requests (staff_id, from_date desc);
create index leave_pending_idx on leave_requests (status) where status = 'requested';
create index leave_window_idx on leave_requests (from_date, to_date) where status in ('approved', 'taken');

create trigger leave_requests_touch before update on leave_requests
  for each row execute function touch_updated_at();


-- ---------- reviews ----------

create table staff_reviews (
  id uuid primary key default gen_random_uuid(),
  staff_id text not null references profiles (id) on delete cascade,
  period_start date not null,
  period_end date not null,
  -- Taken from the checklist, not typed in. A review that argues with
  -- the record is a conversation worth having; one that invents the
  -- record is not.
  completion_pct smallint,
  strengths text not null default '',
  development text not null default '',
  notes text not null default '',
  reviewed_by text not null references profiles (id) on delete restrict,
  reviewed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint reviews_period_order check (period_end >= period_start),
  constraint reviews_pct_range check (completion_pct is null or completion_pct between 0 and 100)
);

comment on table staff_reviews is 'The periodic conversation, with the completion figure taken from the checklist rather than typed in.';
comment on column staff_reviews.completion_pct is 'Computed from the materialised days across the period. It is evidence, not an opinion.';

create index staff_reviews_staff_idx on staff_reviews (staff_id, period_end desc);

create trigger staff_reviews_touch before update on staff_reviews
  for each row execute function touch_updated_at();
