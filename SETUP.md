# Apartment 3808 — setup

Do these in order. Steps 1–5 build the database, 6–7 put it online.
About 45 minutes. Three free accounts needed: **Supabase**, **GitHub**, **Vercel**.

Do not rename the `app` folder. Vercel is told to look for it by name.

---

## 1. Create the Supabase project

- supabase.com → **New project**
- Region: **Mumbai (ap-south-1)** — nearest to Dubai. Frankfurt if Mumbai is not offered. **Not a US region.**
- Set a database password and save it somewhere. There is no way to recover it.
- Wait ~2 minutes for it to build.

## 2. Enable two extensions — before running any SQL

- **Database → Extensions**
- Enable **`pg_cron`** and **`pg_net`**
- Skipping this fails the script on its 50th line and creates nothing.

## 3. Check one thing first

**SQL Editor** → run:

```sql
select current_user, rolbypassrls from pg_roles where rolname = current_user;
```

- `rolbypassrls = true` → carry on.
- `rolbypassrls = false` → **stop.** The example data will not load. Send that result to Aditya.

## 4. Run the database script

- **SQL Editor → New query**
- Open `app/supabase/deploy-all.sql`, select all of it, paste, **Run**
- Takes ~20 seconds

**It is all-or-nothing.** If it errors, nothing at all was created — no half-built database. Fix the cause and paste the whole file again. You cannot paste it twice on top of itself; the second run stops at `type "zone" already exists`, which is harmless and means the first run already worked.

**Verify:** Table Editor lists **62 tables**, including `roles`, `profiles`, `inventory_items`, `shopping_items`, `chat_messages`.

## 5. Make your first login

The script creates a *profile* for everyone in the house. A profile is not a login. Nobody can sign in until an account is attached to one.

- **Authentication → Users → Add user → Create new user**
- Your real email, a password, tick **Auto Confirm User**
- Copy the **User UID**
- **SQL Editor**:

```sql
update profiles
   set auth_user_id = 'PASTE-THE-UID-HERE',
       can_sign_in  = true,
       email        = 'your.real@address'
 where id = 'p-aditya';
```

The nine profile ids are `p-shrien`, `p-aditya`, `p-earl`, `p-rosie`, `p-marvin`, `p-salyna`, `p-charlie`, `p-aria`, `p-noor`.

To add the rest the same way — create the user in the dashboard, then run the same `update` with their UID and profile id. Do this for anyone who needs to sign in.

## 6. Put it online

Vercel cannot take a zip. It deploys from GitHub, so the folder goes there first.

**Upload to GitHub**
- github.com → **New repository** → **Private** → Create
- On the empty repo page: **"uploading an existing file"**
- Drag the whole unzipped folder in → **Commit changes**

**Import to Vercel**
- vercel.com → **Add New → Project** → import that repository
- **Root Directory: `app`** ← the single most common mistake. Without it the build fails with "no package.json found".
- **Environment Variables** — add both, from Supabase **Project Settings → API**:

| Name | Value |
|---|---|
| `VITE_SUPABASE_URL` | Project URL |
| `VITE_SUPABASE_ANON_KEY` | the publishable / anon key |

- **Deploy**

Both values are baked in when the site is built, not read while it runs. **Change either one later and you must redeploy**, or the live site keeps using the old value.

## 7. Lock the door

- **Authentication → Providers → Email** → turn **Enable email signups** OFF. On by default; leaving it on lets anyone who finds the address create themselves an account.
- **Authentication → URL Configuration** → set **Site URL** to the Vercel address.

---

## When something goes wrong

| What you see | What it means | Fix |
|---|---|---|
| `42883 function ... does not exist` | Files were run out of order, or only some were run | Paste the whole of `deploy-all.sql`, once, top to bottom |
| `42P01 relation ... does not exist` | Same | Same |
| `schema "cron" does not exist` | `pg_cron` was enabled into the wrong schema | Extensions → remove it → re-enable, leaving the schema as `cron` |
| `type "zone" already exists` on line ~112 | The script already ran successfully | Nothing to do |
| `new row violates row-level security policy` during the script | The SQL Editor role lacks `BYPASSRLS` (step 3) | Stop; send the step-3 result to Aditya |
| Build fails, "no package.json found" | Vercel Root Directory not set | Project Settings → General → Root Directory = `app` |
| Site loads but shows a seeded example house | One or both env vars missing or misspelled | Fix them, then **Redeploy** — not just save |
| `Invalid login credentials` | Wrong password, or no account exists | Authentication → Users. Supabase says the same thing for both on purpose |
| "Your account is not linked to anyone in this house yet" | The account is real; no profile points at it (step 5) | Run the `update profiles` again with the right UID |
| Signed in, but every screen is empty | Same — `auth_user_id` not linked | As above |

---

## What is not built

Do not spend time debugging these. They are not broken; they were not finished.

- **Push notifications.** Nothing subscribes a device, there is no button to enable them, and the sender is never invoked. Several screens say a push was sent. None is.
- **File uploads.** Photographs attach and display, but are stored in the database as data, not in file storage. The storage bucket exists and is unused.
- **Shared data is partial.** These sync between devices: stock, the buy list, the house chat, issues, people and roles, the day's tasks, meals, shifts. **Everything else saves to one device only** — the register, vehicles, documents, money, guests, staff records, contacts. They work; two people just will not see each other's entries.

---

## Notes for Claude Code

Point Claude Code at this repo and it can work on the app directly. Context it will need:

- **Stack** — Vite + React 18 + TypeScript + Zustand. `app/` is the root. `npm run dev` serves on port 5273. Hash router: `#/module/sub/id`.
- **`npm run sql:check`** cross-references the migrations without a database and must exit 0. It checks that every capability named in a policy exists in the enum, that every table and function is created before it is used and not dropped before its last call, and that `deploy-all.sql` is newer than its inputs.
- **`npm run sql:bundle`** regenerates `deploy-all.sql`. Run it after editing any migration, or the pasted schema is the old one.
- **`npm run sql:harness`** runs the whole schema against a throwaway local Postgres and then impersonates all nine accounts to prove the policies refuse what they claim to. Needs a local Postgres; see `app/scripts/pg-harness/README.md`. The static checker cannot catch anything that only appears when Postgres executes it, and this is what does. Every migration in this repo has been run this way.
- **Permissions are data, not code.** A role is a row in `roles` with a grid of capabilities in `role_capabilities`. Nothing compares against `'owner'`; everything asks `can(db, user, 'money.view')`, and the same capability name is the RLS policy in Postgres. Hiding a menu is never the security model.
- **The store is a mirror of Postgres, not the database.** Screens read `db.x` synchronously. Writes leave as typed intents through `app/src/lib/sync/`, from three mutators — `upsert`, `patch`, `remove`. Adding a table to the sync is an entry in `registry.ts`, not a change to a screen.
- **`isSynced(slice)`** decides what is shared. A slice missing from `REGISTRY` in `app/src/lib/sync/registry.ts` saves to the device only — that is the cause of most "my change vanished" reports.
- **Every table has `force row level security`**, so a superuser SQL-editor session does not silently bypass policies. A policy that returns nothing usually means the signed-in account has no `profiles` row linked to it.
- **Migrations are numbered and run once, in filename order.** They have never been run anywhere but a test database, so treat a first-run error as a real bug and read the file rather than working around it.
