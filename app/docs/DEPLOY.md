# Deployment — from nothing to a working install

Eight steps. About an hour the first time, most of it waiting. Nothing to
maintain afterwards and nothing to pay for at this size.

**What you end up with:** the dashboard at its own web address, installed on
Earl's iPhone and Rosie's iPad like a normal app, with the daily prayer running
sheet on the front of it. All the data in a proper database, and photographs,
receipts, warranties and manuals in real file storage. It keeps working when
the wifi drops in the lift and catches up when it comes back.

You will need: an email address, a laptop, and the real email addresses of the
people who are getting accounts.

---

## Step 1 — The Supabase project

**Already done.** The project is `uyasnfutcowdhdpkfhhg`, live at
`https://uyasnfutcowdhdpkfhhg.supabase.co`, and the app is configured against
it. Skip to step 2.

<details>
<summary>If a project ever has to be made again, from nothing</summary>

### Creating the Supabase project

1. Go to **supabase.com**, sign up, and create a new project.
2. Name it **goldcrest-3808**.
3. Pick the region closest to Dubai. **Mumbai** (`ap-south-1`) is the nearest
   of the ones offered. **Frankfurt** is the next best if Mumbai is not
   available to you. Do not pick a US region — every tap in the app would go
   halfway round the world and back.
4. Choose a strong database password and put it somewhere safe. You will not
   need it day to day, and there is no way to recover it.
5. Wait about two minutes while the project is built.

</details>

## Step 2 — Build the database

The SQL is in the `supabase/migrations` folder. There are two ways to run it
and both are written out in **`supabase/README.md`** — read that file and
follow one of them.

Without the CLI it is one paste: enable **pg_cron** and **pg_net** under
Database → Extensions, then run **`supabase/deploy-all.sql`** in the SQL
editor. That file is all sixteen migrations and the seed, concatenated in
order.

The short version: sixteen migrations then `seed.sql`, run once, in filename
order, top to bottom. Order matters. If a file fails, stop and read the error
rather than carrying on.

When it is finished, Dashboard → **Table Editor** should show seventy-five
tables, including `roles`, `role_capabilities`, `profiles`, `areas`,
`running_sheets`, `sheet_check_items` and `divo_log`.

## Step 3 — Create the accounts

`seed.sql` has already created a row in `profiles` for everybody in the house
and given each of them a role. **A profile is not a login.** Nobody can sign in
until somebody sets them a password, and that is done from inside the app
rather than from the Supabase dashboard.

So there is a chicken and egg to break first: the first account has to be made
by hand, and after that every other account is made from the app.

### 3a. Make your own login, once, by hand

1. Dashboard → **Authentication** → **Users** → **Add user** → *Create new
   user*.
2. Use your real email address, set a password, and tick **Auto Confirm User**
   so no confirmation email is needed.
3. Copy the **User UID** it shows you.
4. Dashboard → **SQL Editor**, and run this with your UID pasted in:

   ```sql
   update profiles
      set auth_user_id = 'PASTE-THE-UID-HERE',
          can_sign_in  = true,
          email        = 'your.real@address'
    where id = 'p-aditya';
   ```

That is the only account ever made this way.

### 3b. Every other account, from the app

Sign in, open **Roles & Logins** in the sidebar, and for each person: tap their
name, put in a real email address, set a password, save. The app calls the
`admin-users` Edge Function, which creates the login and links it to the
profile in one step.

The people, and the role each one starts with:

| Person | Who they are | Role |
|---|---|---|
| Shrien | Owns the home. | `owner` |
| Aditya | Looks after the priests. Agrees the menu with the cooks. | `owner` |
| Salyna | Runs the household side. | `owner` |
| Earl Tiongco | In charge overall. Checks the sheet before it goes out. | `manager` |
| Rosie | House staff — in charge of the kitchen. | `staff` |
| Reza | Helper, paid hourly. Kitchen, then outside from 17:00. | `staff` |
| Marvin | House staff. Driving, shopping, deliveries. | `staff` |
| Jagdishbhai | Cook — afternoon. No email, so no login. | `helper` |
| Hiteshbhai | Cook — evening. No email, so no login. | `helper` |
| Charlie, Aria, Noor | The household. | `family` |
| Priests | On every sheet, never sign in. | `family` |

Eight logins, and five people who appear throughout the app without one.

**The roles themselves are editable.** Roles & Logins → **Roles** lets an owner
change what each role may do, and create new ones — a night cover, a second
driver, whatever the house turns out to need. Two rules hold it together: you
cannot create or grant a role that outranks your own, and you cannot grant a
capability you do not hold yourself. Both are enforced by the database, not by
the screen.

## Step 4 — Passwords, and why there is no reset

You set every password. Nobody chooses their own, and there is no
"forgot password" link anywhere in the app.

That is a trade, made deliberately:

- It costs you a phone call when somebody forgets. Open Roles & Logins, tap
  their name, set a new one, read it to them.
- It buys a house where deleting a login ends that person's access completely
  and immediately. There is no reset email sitting in an old inbox, and no
  password reused from another site.

Ten characters minimum, enforced in both the app and the Edge Function. Read it
to them once. If a password needs to reach somebody who is not in the room,
send it by a different channel from the one carrying the web address.

## Step 5 — Connect the app to the project

Three values. In the `app` folder, next to `package.json`, create a file called
exactly **`.env`**:

```
VITE_SUPABASE_URL=https://uyasnfutcowdhdpkfhhg.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOi...
VITE_VAPID_PUBLIC_KEY=BJ...
```

Where each comes from:

- **`VITE_SUPABASE_URL`** — already known for this house:
  `https://uyasnfutcowdhdpkfhhg.supabase.co`. It is filled in for you in
  `app/.env`.
- **`VITE_SUPABASE_ANON_KEY`** — Dashboard → **Project Settings** → **API**,
  the *anon public* key. Take the whole thing; it is long and runs to one
  line. This is the only value still missing.
- **`VITE_VAPID_PUBLIC_KEY`** — the public half of a key pair used to sign push
  notifications. Generate the pair once, on your laptop:

  ```bash
  npx web-push generate-vapid-keys
  ```

  Put the **public** key in the file above. The **private** key goes into
  Supabase → **Project Settings** → **Edge Functions** → **Secrets**, as
  `VAPID_PRIVATE_KEY`, along with `VAPID_PUBLIC_KEY`. The private half must
  never go anywhere near the app folder.

Then deploy the two Edge Functions, which is what makes account creation and
push work at all:

```bash
supabase functions deploy admin-users
supabase functions deploy push-send
```

`admin-users` is the only thing in this system that holds the service-role key.
That key can read and write every row in the database, ignoring every security
policy, which is exactly why it lives in a function that checks who is asking
before it does anything — and never in the browser bundle.

Two things to know:

> The anon key is safe to put in this file, and safe in the deployed bundle. It
> grants nothing on its own — every table is gated behind the accounts you
> created in step 3.

> These values are baked into the bundle when it is built, not read when the
> app runs. **Change one and you must build and deploy again**, or the app
> keeps using the old value.

Two more things in the dashboard while you are there:

- **Authentication** → **Providers** → **Email**: turn **Enable email signups**
  OFF. **This is currently ON**, checked 2026-08-28, which means anybody who
  finds the address can make themselves an account and be a signed-in user of
  this house. Row-level security still refuses them every row, because they
  would have no `profiles` row and so no capabilities — but an account that
  should not exist is not something to leave standing on the strength of a
  second line of defence. Turn it off before the address is given to anyone.

  Accounts are created by you, from the app, and no other way.
- **Authentication** → **URL Configuration**: set the **Site URL** to the real
  address from step 6.

## Step 6 — Build and put it online

```bash
npm install
npm run build
```

That checks the types and writes the finished app into a folder called
**`dist`**. It is plain files — no server, nothing to run.

Then:

1. Go to **netlify.com** and sign up.
2. **Add new site** → **Deploy manually**.
3. Drag the whole **`dist`** folder onto the page.
4. Netlify gives you an address like `radiant-otter-1a2b3c.netlify.app`. Under
   **Site configuration** → **Change site name** make it something you can read
   out over the phone, such as `goldcrest-3808.netlify.app`.

Cloudflare Pages and Vercel work the same way if you prefer them. Whichever you
use, go back and finish step 5's redirect URLs with the address you were given.

To deploy a change later: `npm run build` again, drag `dist` again. It replaces
what is there.

## Step 7 — Put it on the iPad and the iPhone

1. Open the address in **Safari**. This must be Safari — on iOS, Chrome cannot
   install a web app.
2. Tap the **Share** button, then **Add to Home Screen**.
3. It now opens full screen with no browser bars, like a normal app.
4. Sign in once, with the email and password you set for them. The device
   stays signed in.

Do Earl's iPhone and Rosie's iPad first. Those are the two that matter — the
sheet is prepared on one and checked on the other.

## Step 8 — Turn on notifications

**Do this from the icon on the home screen, not from Safari.** On iPhone and
iPad, a web app can only ask for notification permission once it has been
installed to the home screen. Asked from a Safari tab, the request is refused
before anyone sees it, and it looks like the app is broken.

So: close Safari. Open the app from the home screen icon. Go to
**Settings** → **Notifications** and tap the button to turn them on. iOS shows
its own permission box. Tap **Allow**.

Then test it before you rely on it. There is a **Send a test notification**
button on the same screen. If it does not arrive within a few seconds, see the
last item in the troubleshooting list.

What arrives, and to whom, is per person under the same screen — the reminder
that the sheet is due before 09:00 goes to whoever prepares it and to Earl,
and nothing at all is sent inside anyone's quiet hours except an urgent issue.

---

## How it behaves day to day

**Signing in.** Email and password, once per device. After that the app opens
straight to the day, and stays signed in — signing out is a separate,
deliberate action at the bottom of the sidebar, and it asks first.

**The dot in the sidebar.** Green means everything is saved. Amber means the
device is offline and changes are being held safely. Red means a sync problem
and it is retrying. If someone taps sign-out with work still unsaved, it warns
them first.

**Offline.** The app opens and works normally with no connection — the running
sheet, the checks and everything else come from the copy held on the device.
Ticks and notes queue up and go across the moment the signal returns. If two
people tick the same day's checks while one is offline, both sets of ticks
survive; they are merged rather than one overwriting the other.

**Files.** Photographs are shrunk on the device before upload, so a camera snap
becomes roughly 150KB rather than 4MB. Documents up to 20MB. Nothing in the
bucket is publicly readable — the app requests a temporary link each time a
file is opened, and that link expires.

## What it costs

The Supabase free tier covers 500MB of database and 1GB of files. This
household will use a few megabytes of data a year, so the practical limit is
the photographs and documents. About 1GB is roughly 2,000 of them. Netlify's
free tier is far beyond anything this will need.

The one thing to know: **a Supabase project pauses after a week of no activity**
on the free tier. Daily use prevents it, and this is used daily. If it ever
does pause, one click in the dashboard restores it with no data loss.

## Backups

Supabase keeps its own daily backups. For your own copy, Dashboard →
**Database** → **Backups** downloads a full snapshot whenever you want one for
OneDrive. The House Report also exports to CSV.

---

## If something goes wrong

**Nothing loads — a blank screen, or "Backend not connected".**
The two Supabase values in step 5 are missing, mistyped, or were set after the
bundle was built. Check the `.env` file: no quotes, no spaces around the `=`,
the whole anon key on one line. Then `npm run build` again and deploy again.
The values are baked in at build time, so editing the file alone changes
nothing.

**"Invalid login credentials".**
Supabase says the same thing for a wrong password and an account that does not
exist, and that is on purpose — telling people which of the two it was is how
somebody works out who lives here. Check, in this order:
- Is the address listed under **Authentication** → **Users**? If not, the login
  was never created. Make it from Roles & Logins.
- Set them a new password from Roles & Logins and read it out.
- Is `can_sign_in` true and `auth_user_id` filled in on their `profiles` row?
  If the profile is not linked to the auth user, the app signs them in and then
  has no idea who they are.

**"Creating logins needs the accounts.manage capability."**
The signed-in account's role does not hold it. Only `owner` and `admin` do by
default. If you have locked yourself out of your own admin screen, fix it in
the SQL editor: `update profiles set role = 'owner' where id = 'p-aditya';`

**"You cannot manage a … account — it outranks yours."**
Working as intended. A manager cannot create an owner. Sign in as an owner.

**A file will not open, or an upload fails.**
The storage migration did not run. Dashboard → **Storage** — if there is no
bucket listed, run `20260828001600_storage.sql`. If the bucket is there but
opening a file gives an error, it is the policies in the same file: the app
asks for a temporary link and is being refused, which means the person's role
is not allowed that document. Check their `role` in the `profiles` table.

**The sheet will not post.**
This is the app doing its job, not a fault. A sheet cannot be posted with the
**prayer start time** or the **number of meals** blank — that is the standing
footer rule, and the app refuses rather than letting an incomplete sheet go to
the group. It tells you which of the two is missing. Fill it in and post again.
It will also refuse if nobody is named as having prepared it.

**Push notifications stopped arriving.**
In order:
- Was permission granted from the home-screen icon, or from a Safari tab? From
  a tab it never worked. Open the installed app and turn it on there.
- Was the app deleted from the home screen and reinstalled? That throws away
  the subscription. Turn notifications on again in the app.
- iOS quietly drops the subscription of an app that has not been opened for a
  long stretch. Opening the app re-registers it.
- Check the person's own settings — classes they have switched off, and quiet
  hours, both suppress delivery deliberately.
- If none of that, Dashboard → **Edge Functions** → **Logs**. A `401` from the
  push service means the `VAPID_PRIVATE_KEY` secret does not match the
  `VITE_VAPID_PUBLIC_KEY` that is in the deployed bundle — which happens if the
  key pair was regenerated and only one half was updated.
