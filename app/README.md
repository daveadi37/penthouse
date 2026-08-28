# The Penthouse — House & Office Operations

The rebuild. Vite + React + TypeScript, replacing the single 3,960-line
`index.html` in the parent folder (which is left untouched as a reference until
this reaches parity in use).

## Running it

```bash
npm install
npm run dev
```

Then open http://localhost:5273. There is no sign-in: the account switcher at the
bottom of the sidebar stands in for real auth so every role can be inspected
without five sets of credentials.

```bash
npm run build      # typecheck + production bundle into dist/
npm run typecheck  # types only
npm run preview    # serve the built bundle
```

## What state this is in

**The whole front end is built and populated.** Twenty-four modules, five roles,
thirty-nine routes, all running on a seeded dataset that looks like a real
premises: a household of four, ten office workers, three staff, three weeks of
completion history, live issues with comment threads, a month of transactions,
real expiry dates.

**The backend is not wired.** Everything persists to `localStorage` behind an
adapter (`src/lib/db.ts`) shaped exactly like the Supabase one that replaces it.
Swapping it is a transport change, not a modelling change — the types in
`src/types/index.ts` are the Postgres schema.

What that means in practice: it is one device, one browser. Two people cannot yet
see each other's ticks, and push notifications are queued into a table rather
than sent. Everything else behaves as it will.

## How it is put together

```
src/
  types/index.ts      Every entity in the system. Mirrors the Postgres schema 1:1.
  lib/
    db.ts             Storage adapter + write outbox + the three conflict rules.
    schedule.ts       Recurrence engine, role routing, the day builder.
    selectors.ts      Every derived read — alerts, expiries, budgets, burn rates.
    date.ts           Dates as `YYYY-MM-DD` strings throughout, never Date objects.
    router.ts         Hash router, fifty lines. Routes are flat: #/module/sub/id.
  seed/               The example premises, split by domain.
  store.ts            One Zustand store. Mutations, and the capability model.
  components/
    ui.tsx            The component kit. Every screen is built from these.
    Shell.tsx         Navigation, role switcher, zone filter.
  modules/            One file per area. Sheets live beside the screen they serve.
  styles/             Tokens carried over from the original build, unchanged.
```

Three things are worth knowing before changing anything:

**The day builder is pure.** `buildDay()` takes a date and the database and
returns task instances. Same inputs, same day, wherever it runs — which is what
lets it move into a Postgres function on `pg_cron` later without changing
behaviour. It crosses the task library with the area list, then adds meals,
laundry, guest and event tasks on their offsets, plant care, and service visits.

**Zone is the spine.** Every area, task, item, asset, document, issue and
transaction carries `household | office | shared`. `effectiveRole()` in
`schedule.ts` is the rule that stops one person inheriting both zones: office
cleaning routes to whoever holds the office role, not to housekeeping.

**Sheets are mounted from one place.** `SheetHost` in `App.tsx` maps a string in
the store to a component. Adding a form means adding a case there and a component
next to its screen.

## What to look at first

- **Today** as each role — the five dashboards are genuinely different, not the
  same screen with things hidden.
- **Daily Planner** — the new module. Per-person columns, zone by colour, overlap
  and overload flagged, an unscheduled tray at the top.
- **Issues** — one inbox for faults, condition flags, office requests and supply
  requests. Switch to Meera Raghavan and report something to see the requester
  flow: photo first, area, one line.
- **Reports** — refuses to score a day that has not finished, and splits by zone.
- **Inventory → How fast it goes** — real consumption from the movement log. It
  is what tells you a minimum level is set wrong, and several are.

## Known rough edges

- **Storage size.** Three weeks of materialised days is about 1.5MB of the ~5MB
  `localStorage` budget. The adapter drops the oldest days on quota failure. Real
  tables remove the problem.
- **Bundle is one 550KB chunk.** No code splitting yet; fine over a warm cache,
  worth splitting before launch.
- **The planner does not drag yet.** Blocks open a sheet where time and assignee
  are changed. Drag-and-drop is the next increment.
- **No tests.** The row-level security suite in the plan is the one that matters,
  and it needs the real backend to test against.
- **Task volume is high** — about 145 a day across both zones. That is a real
  question about granularity, not a bug: see the note in the handover.

## The seeded example

`src/seed/` is deliberately specific rather than generic — Dubai vendors, AED,
a lapsed insurance policy, a passport expiring in 25 days, an office fridge
nobody has cleared. Every number in it is meant to be replaced, and the floor
plan in `seed/premises.ts` is the first thing to correct.

`Settings → Data → Reset to seed data` puts it all back.
