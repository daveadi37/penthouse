# Apartment 3808 — house operations

Goldcrest Views 1, Jumeirah Lakes Towers, Cluster V, Dubai.

Nine people, two of whom work here: Marvin drives, Rosie cooks and helps. Earl
manages. Shrien owns the home. It is also where Aditya works, so it is a home and
an office without being two things.

**What it is for:** stock. A buy list that builds itself, counted on a phone in
the store cupboard, shopped from at the till, and charged against a budget. Around
that sits everything else a household has to keep track of — the day's work,
issues, meals, the register, documents, money, people.

## Running it

```bash
npm install
npm run dev            # http://localhost:5273
```

With no Supabase project configured it opens on the seeded house, on this device,
with no sign-in. **That is a working state, not a broken one** — it is how you look
at the whole thing before a database exists, and how it is handed over.

```bash
npm run build && npm run serve    # serves on the network, for phones on the house wifi
npm run typecheck
npm run sql:check                 # cross-references the migrations — the handover gate
npm run sql:bundle                # regenerates supabase/deploy-all.sql
```

`npm run serve` binds to every interface, so phones reach it at
`http://<this-machine>:5273`. One caveat: service workers only run on HTTPS or
`localhost`, so over a plain network address there is no **Add to Home Screen** and
no offline shell. It works as a web page; it does not yet work as an installed app.

## Where things are

```
src/
  types/index.ts      Every entity. Mirrors the Postgres schema one for one.
  lib/
    access.ts         can(db, profile, capability) — the only thing that decides
    sync/             The data layer: registry, mappers, outbox, engine, realtime
    db.ts             The local cache. Not the database — see its header.
    schedule.ts       Recurrence and the day builder
    selectors.ts      Every derived read: what is low, what is due, what it cost
    router.ts         Hash router, fifty lines. Routes are flat: #/module/sub/id
  seed/               The seeded house, for looking around without a backend
  store.ts            One Zustand store. The mirror, and the mutations.
  components/ui.tsx   The component kit. Every screen is built from it.
  modules/            One file per area. Sheets live beside the screen they serve.
supabase/
  migrations/         17 files. Run in filename order, once.
  seed.sql            The real house's starting rows.
  deploy-all.sql      Generated. One paste for the dashboard route.
scripts/check-sql.mjs Cross-reference checker. Must exit 0 before handover.
../SETUP.md           Nothing to a working install. The only setup document.
docs/DEPLOY.md        What survived it: installing to a phone, costs, backups.
docs/OPERATIONS.md    How the house actually uses it.
```

## Three things to know before changing anything

**Roles are rows, not an enum.** A role is a name, a rank and a set of
capabilities in a table you can edit from inside the app. Nothing anywhere
compares against `'owner'`; everything asks `can(db, user, 'money.view')`. The
same capability is the RLS policy in Postgres, so hiding a menu is never the
security model.

**The store is a mirror, not the database.** Every screen reads `db.x`
synchronously and that must stay true. Writes leave as typed intents through
`src/lib/sync`, from the three generic mutators — `upsert`, `patch`, `remove` —
which already know the slice and the row. Adding a table to the sync is an entry
in `registry.ts`, not a change to a screen.

**Not everything is shared yet.** `isSynced(slice)` decides. Today that is
profiles and roles, stock, the buy list, the chat and issues. Everything else
saves to the device and works exactly as it does now. The sidebar says so
plainly rather than letting anyone assume.

## State

Typecheck and build are clean. All 21 routes render for every role with no console
errors. `npm run sql:check` exits 0 — 17 migrations, 62 tables, 236 policies at
runtime, 30 capabilities.

**The database has never been deployed.** The migrations are written,
cross-referenced and bundled, and have not yet been run anywhere. First run is
against the real project, following `docs/DEPLOY.md`, and until that happens the
sync layer is inert by design.

Push notifications do not work. Half of it is built — the sender, the queue, the
per-person preferences — and three pieces are missing: nothing subscribes a
device, there is no button to grant permission, and the cron that drains the queue
reads a setting nothing sets. A VAPID key pair alone would not fix it. The screens
that promised a push no longer do.
