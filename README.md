# Goldcrest 3808 — house operations

The operations app for apartment 3808, Goldcrest Views 1, Jumeirah Lakes Towers,
Dubai. It is a home and the office somebody works from, without being two things.

**What it is for: stock.** A buy list that builds itself from what has fallen
below its minimum, counted on a phone in the store cupboard, shopped from at the
till, and charged against a budget. Around that sits the rest of what a household
has to keep track of — the day's work, issues, meals, the register, documents,
money, people, and a thread everybody is in.

Nine people. Marvin drives, Rosie cooks and helps, Earl manages, Shrien owns it.

## Setting it up

**[SETUP.md](SETUP.md)** — from nothing to a working install. Supabase, then
GitHub, then Vercel. It is the only setup document; anything else you find is
older than it.

## Running it locally

```bash
cd app && npm install && npm run dev
```

Opens at `http://localhost:5273`. With no `.env` it runs on a seeded copy of the
house, on the device, with no sign-in — deliberate, so the whole app can be walked
through before a database exists. That path is development-only and is stripped
from a production build.

## Where things are

| | |
|---|---|
| `app/src` | The application. React, TypeScript, Zustand, Vite. |
| `app/src/lib/sync` | The data layer. Registry, mappers, outbox, engine, realtime. |
| `app/supabase/migrations` | The database. Seventeen files, run in filename order, once. |
| `app/supabase/deploy-all.sql` | Generated. All seventeen plus the seed, for one paste. |
| `app/supabase/functions` | Two Edge Functions: creating logins, and delivering push. |
| `app/docs/OPERATIONS.md` | The day, written down. For Earl and Rosie, not for developers. |
| `app/supabase/README.md` | What each migration is for. |
| `SETUP.md` | Installation, troubleshooting, and notes for Claude Code. |

## Two things worth knowing before changing anything

**Roles are rows, not an enum.** A role is a name, a rank and a set of
capabilities in a table you can edit from inside the app. No policy anywhere names
a role; every one asks `has_capability()`, so a role invented next month works
everywhere the moment its capability rows exist. Two rules keep that safe and both
are enforced by Postgres rather than by the screen: you cannot create or grant a
role that outranks your own, and you cannot grant a capability you do not hold.

**The store is a mirror of Postgres, not the database.** Screens read `db.x`
synchronously and that must stay true. Writes leave as typed intents through
`app/src/lib/sync`, from three mutators — `upsert`, `patch`, `remove`. Adding a
table to the sync is an entry in `registry.ts`, not a change to a screen. What is
not in that registry saves to one device only.

## Verifying a change

```bash
cd app && npm run typecheck && npm run build && npm run sql:check
```

`sql:check` cross-references the migrations without a database: every capability
named in a policy exists in the enum, every table and function is created before
it is used and not dropped before its last call, and `deploy-all.sql` is newer
than its inputs. It must exit 0.

The migrations can also be run against a throwaway Postgres before they go near a
real project — see `app/supabase/README.md`. Doing that has caught bugs that
reading the SQL did not, twice.
