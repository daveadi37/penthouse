import { readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

/* ============================================================
   Concatenates the migrations and the seed into one file, so the
   database can be built with a single paste into the Supabase SQL
   editor rather than one file at a time.

   The migrations remain the source of truth. This output is generated,
   is never edited by hand, and exists only for the dashboard route —
   anybody with the CLI should use `supabase db push`, which records
   what it has run. This file does not.

       node scripts/bundle-sql.mjs      (or: npm run sql:bundle)
   ============================================================ */

const here = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(here, '..', 'supabase', 'migrations');
const seedFile = join(here, '..', 'supabase', 'seed.sql');
const outFile = join(here, '..', 'supabase', 'deploy-all.sql');

const files = readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort();

const header = `-- ============================================================
--  GENERATED FILE — DO NOT EDIT.
--
--  ${files.length} migrations and seed.sql, concatenated in filename order, so
--  the database can be built with one paste into the Supabase SQL
--  editor instead of one file at a time.
--
--  Regenerate with:  npm run sql:bundle
--  Source of truth:  supabase/migrations/ and supabase/seed.sql
--
--  If you have the Supabase CLI, do not use this file. Use
--  \`supabase db push\`, which records what it has already run. This
--  file does not, so running it twice is not the same as running it
--  once — see the note on re-runs below.
--
--  BEFORE RUNNING THIS, in the dashboard:
--    Database → Extensions → enable **pg_cron** and **pg_net**.
--  The first migration creates them, but on a hosted project they may
--  need enabling from the dashboard first. If it fails on either, that
--  is why.
--
--  Re-runs: the migrations are written to be run once. seed.sql is
--  safe to re-run on its own — every insert is ON CONFLICT DO NOTHING.
--  The migrations are not: a second run fails on the first CREATE TYPE
--  that already exists. That failure is loud and harmless.
-- ============================================================

`;

let out = header;
for (const f of files) {
  out += `\n-- ============================================================\n`;
  out += `-- ${f}\n`;
  out += `-- ============================================================\n\n`;
  out += readFileSync(join(migrationsDir, f), 'utf8').trimEnd() + '\n';
}

out += `\n-- ============================================================\n`;
out += `-- seed.sql — the house's starting rows. Runs last.\n`;
out += `-- ============================================================\n\n`;
out += readFileSync(seedFile, 'utf8').trimEnd() + '\n';

mkdirSync(dirname(outFile), { recursive: true });
writeFileSync(outFile, out, 'utf8');

const lines = out.split('\n').length;
console.log(`supabase/deploy-all.sql — ${files.length} migrations + seed, ${lines} lines`);
