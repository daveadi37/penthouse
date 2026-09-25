# The throwaway Postgres harness

Runs the whole schema against a real database before it goes near a real
project, and then proves the policies refuse what they claim to.

`npm run sql:check` reads the migrations without a database and catches the
cross-file mistakes — a capability that is not in the enum, a table used before
it is created, a function called after it is dropped. It cannot catch anything
that only shows up when Postgres executes it, and it cannot count what
`grant_table()` actually produces. That is what this is for.

```bash
npm run sql:harness          # linux / mac, or inside WSL
```

From Windows:

```bash
wsl -d Ubuntu -- bash -c 'cd "/mnt/d/Projects/Penthouse Dashboard" && bash app/scripts/pg-harness/run.sh'
```

First time only:

```bash
sudo apt-get install -y postgresql
sudo -u postgres createuser -s "$(whoami)"
```

## What each file is

| | |
|---|---|
| `prelude.sql` | Everything Supabase supplies that plain Postgres does not — `auth.uid()`, `cron.schedule()`, `net.http_post()`, the storage schema and its path helpers, the three roles. |
| `run.sh` | Creates a throwaway database, loads the prelude, runs `deploy-all.sql` with `ON_ERROR_STOP`, counts what was built, runs the policy tests, drops the database. |
| `policy-test.sql` | Impersonates all nine accounts and prints who can read what. |
| `inspect.sh` | Builds the schema and runs one ad-hoc SQL file against it. `bash inspect.sh grid.sql` |
| `grid.sql`, `baseline.sql`, `policies.sql` | Ad-hoc queries for `inspect.sh`. |

## Two traps that make a broken policy look like a working one

**A superuser bypasses RLS even under `force row level security`.** Every
policy check runs as `harness_user`, which is not a superuser and is a member of
`authenticated` — who the policies are written `to`. Test as the owner and
everything passes, including the things that should not.

**`set local` outside an explicit transaction is a silent no-op.** Each
impersonation sits in its own `begin`/`commit`, or the uid never changes and
every row in the grid is the same person.

And a third, learned here: **a probe row that fails to insert reads as a
refusal.** `inspect.sh` runs with `ON_ERROR_STOP=1` because two probe inserts
failed on bad enum values and the grid showed owners locked out of their own
money — a bug that was not there.

## What it has caught

- `grant_table()` dropped at the foot of `20260828001400_rls.sql` and called in
  `20260828001700_chat.sql` — `42883`, 3841 lines into a 4315-line paste, after
  16 of 17 migrations.
- `profiles_read` was `using (true)`, so any authenticated account — including
  one with no profile in this house — could read all nine names, emails, phone
  numbers and dietary notes.
- `check-sql.mjs` reporting 236 policies where Postgres produces 220, because it
  counted the `create policy` templates inside `grant_table()`'s own body and
  then added `grant_table × 4` on top.
- Earlier: an enum compared against a cast text value, two plpgsql locals
  shadowing columns of the same name, and `office` left in two enums after the
  office side was dropped.
