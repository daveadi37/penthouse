# The database — how to build it

Sixteen migrations and a seed file. They build the seventy-five tables behind
the dashboard: the hierarchy, the people, the premises, the daily prayer
running sheet, the work library, issues, supplies, property, money, employment,
the shrine records, notifications, the security rules, the scheduled jobs and
the file store.

**Order matters, and it is the filename order.** The files are numbered
`...000100` to `...001600` and each one leans on the ones before it:

- The extensions have to exist before anything can call `gen_random_uuid()`.
- The enum types have to exist before a column can be declared with one.
- `roles` has to exist before `profiles`, because a profile points at one.
- Every table has to exist before the security rules can name it in a policy.
- The tables and the policies both have to exist before the scheduled
  functions can read from them.
- Storage goes last so its policies can call `has_capability()`.

Run them once, top to bottom. Running them out of order does not half-work —
it fails on the first missing type or missing table, and leaves you with a
part-built database that is easier to delete than to repair.

---

## Route one — the Supabase CLI

The right route if you have a terminal and will be doing this more than once.

```bash
npm install -g supabase          # once, on this machine
supabase login                   # once, opens the browser
supabase link --project-ref <your-project-ref>
supabase db push
```

`--project-ref` is the string in your project's URL — the `abcdefghijklm` part
of `https://abcdefghijklm.supabase.co`. Dashboard → **Project Settings** →
**General** shows it as *Reference ID*.

`db push` applies every migration that has not been applied yet, in filename
order, and records what it did. Run it again after adding a migration and it
applies only the new one.

Then load the starting rows:

```bash
supabase db reset      # LOCAL ONLY — see the warning below
```

On the hosted project, load `seed.sql` through the dashboard SQL editor
instead (route two, step 3).

> **`supabase db reset` destroys the database it is pointed at.** Against the
> local stack that is exactly what you want — it drops everything, replays all
> the migrations from scratch and then runs `seed.sql`. Against a linked
> production project it would throw away the house's real data. Only ever run
> it while working locally.

To work locally at all:

```bash
supabase start         # brings up Postgres, the API, Studio and the mail catcher
supabase stop          # when you are done
```

Local Studio is at http://localhost:54323. The mail catcher at
http://localhost:54324 is where any mail Supabase sends lands instead of a real
inbox — this app sends none in normal use, since passwords are set by an owner
rather than emailed, but it is where a confirmation would appear if one were
ever switched on.

---

## Route two — the dashboard SQL editor

The right route if you would rather not install anything. It is more clicking
and there is no record of what has been run, so be methodical.

1. Dashboard → **SQL Editor** → **New query**.
2. Open the first migration file in a text editor, select all, copy, paste it
   into the editor, press **Run**. Wait for *Success. No rows returned*.
3. Clear the editor and do the same with the next file. Work down the list in
   the order printed below, without skipping any.
4. When all sixteen migrations have run, do the same with `seed.sql`.

If a file returns an error, stop. Do not carry on to the next one. Read the
error — it almost always names the thing that is missing, which means an
earlier file was skipped or only partly pasted.

Each file is written to be run once. Re-running one is not guaranteed to be
harmless, so if you lose track of where you got to, the safe repair is to
delete the project and start again rather than to guess.

---

## What each file is for

| File | What it creates |
|---|---|
| `20260828000100_extensions.sql` | The Postgres extensions everything else needs — UUID generation, cryptography, and the scheduler used by the 09:00 jobs. |
| `20260828000200_enums.sql` | The fixed vocabularies: zones, staff roles, **capabilities**, area types, issue statuses, meal statuses, stock states, running-sheet status and the rest. There is deliberately no role enum — roles are rows. |
| `20260828000300_identity_premises.sql` | Powers, people and place — the `roles` table and its capability grid, `has_capability()`, profiles, the areas of apartment 3808, and the single settings row carrying the address, the WhatsApp group, the 09:00 post-by time and the observance dates. |
| `20260828000400_work_schedule.sql` | The everyday work — task categories, the task library, the materialised day, procedures, appointments, shifts, absences and coverage rules. |
| `20260828000500_running_sheet.sql` | The daily prayer running sheet and its six sections — roster, order of the day, menu, shopping, guests and the thirty-one checks — plus prayer breaks, the guest-toilet rounds and the set-up and clear-up photographs. |
| `20260828000600_issues_incidents.sql` | Faults, condition flags, requests and supply requests in one table, with their photographs and comment threads, and the incident log. |
| `20260828000700_supplies_kitchen.sql` | Inventory and its movement history, the shopping list, meals and their ingredients, waste, and the laundry rota. Carries the prayer-item and shrine-only flags, and the trigger that refuses to approve a meal breaking the food rule during the observance. |
| `20260828000800_property.sql` | Assets with their warranty and service history, vehicles and their logs, service contracts, and plants. |
| `20260828000900_people_access.sql` | Contacts, vendors, visitors, contractor visits, deliveries, and the record of who holds which key, fob or code. |
| `20260828001000_money_documents.sql` | Expense categories, budgets, transactions, recurring charges, petty cash, and the document register. |
| `20260828001100_employment.sql` | Staff details with their visa, passport and medical expiries, attendance, leave requests and reviews. |
| `20260828001200_occasions_shrine.sql` | Guests, house events, occasion templates, vacations, the observance that names each sheet — 13 August to 11 September 2026 — the divo log and the daily shrine record. |
| `20260828001300_notifications_audit.sql` | The notification queue, per-person preferences, push subscriptions, and the audit trail of who changed what. |
| `20260828001400_rls.sql` | Row-level security. Turns it on for all seventy-five tables and writes every policy in terms of `has_capability()` — never a role name. That is what lets an owner invent a role from inside the app without a migration: the new role works everywhere the moment its capability rows exist. |
| `20260828001500_functions_cron.sql` | The scheduled work — building tomorrow's day, the reminder before 09:00 that the sheet is due, the late flag after it, and the expiry and low-stock sweeps. |
| `20260828001600_storage.sql` | The file bucket and its policies. Nothing in it is publicly readable; the app asks for a temporary link each time a file is opened. |
| `seed.sql` | The house's starting rows — the six roles and their capabilities, the thirteen people, the areas of apartment 3808, the shifts and coverage rules, the observance, the starting task library, the prayer and shrine stock with its two flags, the three standing shopping rows, and the thirty-one daily checks. It creates no logins and invents no history. Run last. |

---

## After the migrations

Two things are not done by SQL and are easy to forget:

- **The accounts.** Creating a row in `profiles` does not create a way to sign
  in. The first login is made by hand in **Authentication** → **Users** and
  linked to `p-aditya`; every one after it is made from inside the app. See
  `docs/DEPLOY.md`, step 3.

- **The two Edge Functions.** `supabase functions deploy admin-users` and
  `supabase functions deploy push-send`. Without the first, no login can be
  created from the app. Without the second, nothing is ever delivered — the
  notifications still queue, they simply sit there.
- **The three environment variables.** The app cannot reach any of this until
  `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are set and the bundle is
  rebuilt. See `docs/DEPLOY.md`, step 5.

## Changing the schema later

Never edit a migration that has already been run — the database has moved on
and the file is now a record of history rather than an instruction. Add a new
one:

```bash
supabase migration new whatever_you_are_changing
```

That writes an empty file with the next timestamp. Put the change in it and
`db push` again. If you are working on the dashboard route, create the file by
hand with a timestamp later than every existing one and run it in the SQL
editor.
