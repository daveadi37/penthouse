# Goldcrest 3808 — House Operations

The operations app for apartment 3808, Goldcrest Views 1, Jumeirah Lakes
Towers, Dubai. It runs the household day: the daily prayer running sheet, the
work that has to happen, the stock, the kitchen, the people, and everything
with a date on it that somebody would otherwise forget.

The front of it is the **daily prayer running sheet**, which goes to the
**3808 Home** WhatsApp group by **09:00** every morning. That sheet is the
day; everything else in the app is a record of it.

---

## Where things are

| | |
|---|---|
| `app/src` | The application. React, TypeScript, Zustand, Vite. |
| `app/supabase/migrations` | The database. Sixteen files, run in filename order. |
| `app/supabase/seed.sql` | The starting rows — people, rooms, roles, the observance, the 31 checks. |
| `app/supabase/functions` | Two Edge Functions: creating logins, and delivering push. |
| `app/docs/DEPLOY.md` | Nothing to a working install, in eight steps. |
| `app/docs/OPERATIONS.md` | The day, written down. For Earl and Rosie, not for developers. |
| `app/docs/RUNNING-SHEET-SPEC.md` | The sheet, transcribed from the source documents. Authoritative. |
| `app/supabase/README.md` | How to build the database, and what each migration is for. |

---

## Running it

```bash
cd app && npm install && npm run dev
```

It opens at `http://localhost:5273`. With no `.env` it runs entirely on the
device against a seeded copy of the house — the sign-in screen says so and
offers it. That is deliberate: the whole app can be walked through before a
Supabase project exists.

To connect the real backend, copy `app/.env.example` to `app/.env`, fill in
the three values, and build again. The values are baked in at build time.

---

## Two things worth knowing before changing anything

**Roles are rows, not an enum.** Owners and admins create and edit the
hierarchy from inside the app, so no policy anywhere names a role. Every one
of them asks `has_capability()` instead, which means a role invented next
month works everywhere the moment its capability rows exist. Two rules keep
that safe, and both are enforced by Postgres rather than by the screen: you
cannot create or grant a role that outranks your own, and you cannot grant a
capability you do not hold yourself.

**The food rule is enforced, not merely printed.** For the whole observance
all food is vegetarian — no meat, no fish, no eggs. The app refuses to approve
a menu that breaks it, and so does a database trigger, because a rule that
lives only in the interface is a rule that lasts until somebody uses the API.

---

## Verifying a change

```bash
cd app && npx tsc --noEmit && npm run build
```

The migrations can be run against a throwaway Postgres before they go
anywhere near the real project — see `app/supabase/README.md`. Doing that
caught four bugs that reading the SQL did not.
