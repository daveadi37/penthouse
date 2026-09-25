# Deployment

**Setup has moved to [`SETUP.md`](../../SETUP.md) at the top of the repository.**

What used to be here was written in August, for a different household and a
different Supabase project, and by September it disagreed with the app on almost
every point that mattered: it named a project on somebody else's account and told
the reader to skip creating their own, listed four people who no longer exist and
one whose role had changed, walked through a notifications screen that was never
built, and deployed to Netlify. Following it would not have produced a working
install. It is kept in git history rather than here.

The rest of this file is the part that was still true, and is not setup.

---

## Putting it on the iPad and the iPhone

1. Open the address in **Safari**. It must be Safari — on iOS, Chrome cannot
   install a web app.
2. **Share** → **Add to Home Screen**.
3. It opens full screen, like a normal app.
4. Sign in once. The device stays signed in.

Earl's iPhone and Rosie's iPad are the two that matter.

> Service workers need HTTPS or `localhost`. Over a plain network address —
> `http://192.168.x.x`, the way `npm run serve` exposes it on the house wifi —
> there is no **Add to Home Screen** and no offline shell. It works as a web page.
> A deployed HTTPS address is what makes it installable.

## Passwords, and why there is no reset

Passwords are set from **Roles & Logins**, by an owner. Nobody chooses their own
and there is no "forgot password" link. That is a trade made deliberately:

- It costs a phone call when somebody forgets. Open Roles & Logins, tap their
  name, set a new one, read it to them.
- It buys a house where deleting a login ends that person's access completely and
  immediately — no reset email sitting in an old inbox, no password reused from
  another site.

Ten characters minimum, enforced in the app and in the Edge Function. If a
password has to reach somebody who is not in the room, send it by a different
channel from the one carrying the web address.

## What it costs

The Supabase free tier covers 500MB of database and 1GB of files. This household
will use a few megabytes of data a year, so the practical limit is photographs and
documents — about 1GB is roughly 2,000 of them. Vercel's free tier is far beyond
anything this needs.

One thing to know: **a Supabase project pauses after a week with no activity** on
the free tier. Daily use prevents it, and this is used daily. If it ever does
pause, one click in the dashboard restores it with no data loss.

## Backups

Supabase keeps its own daily backups. For your own copy, **Database → Backups**
downloads a full snapshot whenever you want one. The House Report also exports
to CSV.
