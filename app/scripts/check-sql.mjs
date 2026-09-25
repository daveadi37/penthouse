import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

/* ============================================================
   Cross-references the migrations against each other without a
   database, because the expensive mistakes here are not syntax — they
   are a name in one file that no longer exists in another.

   Removing a domain is exactly when that happens. Take six members out
   of the capability enum and the seed still grants them, a policy still
   asks for them, and the paste dies two hundred lines in with
   "invalid input value for enum capability". Postgres will tell you,
   but only once, only at the far end, and only after somebody has
   already pasted it into a real project.

   This catches that class in about a second, and it is the same class
   that a local Postgres harness caught four of last time.

       node scripts/check-sql.mjs      (or: npm run sql:check)

   Exit code is 1 if anything failed, so it can gate a commit.
   ============================================================ */

const here = dirname(fileURLToPath(import.meta.url));
const sqlDir = join(here, '..', 'supabase');
const migrationsDir = join(sqlDir, 'migrations');

const files = readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort();
const seedPath = join(sqlDir, 'seed.sql');
const bundlePath = join(sqlDir, 'deploy-all.sql');

/* Read everything once. Order matters: a reference may only point at
   something an earlier file created, so the index of a file in this
   array is its position in time. */
const docs = files.map((f) => ({
  name: f,
  order: files.indexOf(f),
  sql: readFileSync(join(migrationsDir, f), 'utf8'),
}));
const seed = { name: 'seed.sql', order: files.length, sql: readFileSync(seedPath, 'utf8') };
const all = [...docs, seed];

/* Comments are stripped before matching, so a table name mentioned in a
   header block is never mistaken for a definition, and a capability
   quoted in prose is never mistaken for a grant. */
const strip = (sql) =>
  sql
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/--[^\n]*/g, ' ');

const problems = [];
const notes = [];
const fail = (file, msg) => problems.push({ file, msg });
const note = (file, msg) => notes.push({ file, msg });

/* ---------- what exists ---------- */

const enums = new Map(); // name -> { members:Set, file }
const tables = new Map(); // name -> { file, order }
const functions = new Set();

for (const d of all) {
  const sql = strip(d.sql);

  for (const m of sql.matchAll(/create\s+type\s+(?:public\.)?"?(\w+)"?\s+as\s+enum\s*\(([\s\S]*?)\)\s*;/gi)) {
    const members = new Set([...m[2].matchAll(/'([^']*)'/g)].map((x) => x[1]));
    enums.set(m[1], { members, file: d.name });
  }

  for (const m of sql.matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?"?(\w+)"?/gi)) {
    if (tables.has(m[1])) fail(d.name, `table "${m[1]}" is created twice — also in ${tables.get(m[1]).file}`);
    tables.set(m[1], { file: d.name, order: d.order });
  }

  for (const m of sql.matchAll(/create\s+(?:or\s+replace\s+)?function\s+(?:public\.)?"?(\w+)"?/gi)) {
    functions.add(m[1]);
  }
}

const capEnum = enums.get('capability');

/* ---------- every capability named anywhere must exist ---------- */

if (!capEnum) {
  fail('enums', 'no "capability" enum found — the whole permission model hangs off it');
} else {
  for (const d of all) {
    const sql = strip(d.sql);
    const seen = new Set();

    for (const m of sql.matchAll(/has_capability\s*\(\s*'([^']+)'/gi)) seen.add(m[1]);
    for (const m of sql.matchAll(/grant_table\s*\(\s*'[^']+'\s*,\s*'([^']+)'\s*,\s*'([^']+)'/gi)) {
      seen.add(m[1]);
      seen.add(m[2]);
    }
    /* seed.sql grants capabilities as array literals. */
    for (const m of sql.matchAll(/'([a-z]+(?:\.[a-zA-Z]+))'\s*(?=[,\]\)])/g)) {
      if (m[1].includes('.') && /^[a-z]+\.[a-zA-Z]+$/.test(m[1])) seen.add(m[1]);
    }

    for (const cap of seen) {
      /* Only complain about things shaped like a capability, so a MIME
         type or a file extension in the storage policies is left alone. */
      if (!/^[a-z]+\.[a-zA-Z]+$/.test(cap)) continue;
      if (cap.startsWith('pg_') || cap.includes('/')) continue;
      if (!capEnum.members.has(cap)) {
        fail(d.name, `capability '${cap}' is used but is not a member of the capability enum`);
      }
    }
  }
}

/* ---------- grant_table and references must name real tables ---------- */

for (const d of all) {
  const sql = strip(d.sql);

  /* Order matters as much as existence. A grant_table call, an RLS
     enable or a policy that runs before its table is created dies with
     42P01 — and because these sit inside DO blocks with no handler, the
     paste stops there and every file after it is lost. Checking only
     that the table exists somewhere is what let exactly that through. */
  const earlyRefs = [
    [/grant_table\s*\(\s*'(\w+)'/gi, (t) => `grant_table('${t}', …)`],
    [/alter\s+table\s+(?:public\.)?"?(\w+)"?[\s\S]{0,120}?row\s+level\s+security/gi, (t) => `row-level security on "${t}"`],
    [/create\s+policy\s+\w+\s+on\s+(?:public\.)?"?(\w+)"?/gi, (t) => `a policy on "${t}"`],
    [/create\s+trigger\s+\w+[\s\S]{0,80}?\bon\s+(?:public\.)?"?(\w+)"?/gi, (t) => `a trigger on "${t}"`],
    [/create\s+(?:unique\s+)?index\s+(?:if\s+not\s+exists\s+)?\w+\s+on\s+(?:public\.)?"?(\w+)"?/gi, (t) => `an index on "${t}"`],
    [/alter\s+publication\s+\w+\s+add\s+table\s+([\w\s,]+)/gi, (t) => `publishing "${t}"`],
  ];

  for (const [re, describe] of earlyRefs) {
    for (const m of sql.matchAll(re)) {
      for (const raw of m[1].split(',')) {
        const t = raw.trim();
        if (!t || !tables.has(t)) {
          if (re.source.startsWith('grant_table')) {
            fail(d.name, `grant_table('${t}', …) names a table that is never created`);
          }
          continue;
        }
        if (tables.get(t).order > d.order) {
          fail(
            d.name,
            `${describe(t)} runs before ${tables.get(t).file} creates it — 42P01, and the paste stops there`,
          );
        }
      }
    }
  }

  for (const m of sql.matchAll(/references\s+(?:(\w+)\.)?"?(\w+)"?\s*\(/gi)) {
    const schema = m[1];
    const target = m[2];
    /* auth.users and storage.objects are Supabase's, not ours. */
    if (schema && schema !== 'public') continue;
    if (!tables.has(target)) {
      fail(d.name, `references "${target}" but no migration creates it`);
    } else if (tables.get(target).order > d.order) {
      fail(d.name, `references "${target}", which is created later in ${tables.get(target).file} — the paste will fail`);
    }
  }
}

/* ---------- a helper must be alive when it is called ---------- */

/* A table's lifetime is a create and nothing else. A function's has two
   ends, and the second one is easy to forget: grant_table() is dropped
   on purpose the moment it has done its work, because anything that can
   write a policy is a way to write yourself one.

   Move a call past that drop and the paste dies with 42883 rather than
   42P01 — same failure, different error code, and the table-ordering
   check above sails straight over it. That is exactly what happened:
   the chat_messages call moved out of the RLS file to fix a 42P01 and
   landed after the drop at the foot of it.

   Bodies are excluded deliberately. Postgres does not resolve the
   inside of a function until it runs, so a plpgsql body may name a
   function created later and that is legal. Only executable statements
   are checked. */

const stripBodies = (sql) => sql.replace(/\$(\w*)\$[\s\S]*?\$\1\$/g, ' ');

/* Composite position: which file, then how far into it. */
const at = (d, index) => d.order * 1e9 + index;

const life = new Map(); // name -> { born, died, bornFile, diedFile }

for (const d of all) {
  const sql = stripBodies(strip(d.sql));

  for (const m of sql.matchAll(/create\s+(?:or\s+replace\s+)?function\s+(?:public\.)?"?(\w+)"?/gi)) {
    const rec = life.get(m[1]);
    if (!rec) life.set(m[1], { born: at(d, m.index), died: null, bornFile: d.name, diedFile: null });
  }
  for (const m of sql.matchAll(/drop\s+function\s+(?:if\s+exists\s+)?(?:public\.)?"?(\w+)"?/gi)) {
    const rec = life.get(m[1]);
    if (rec && rec.died === null) {
      rec.died = at(d, m.index);
      rec.diedFile = d.name;
    }
  }
}

for (const d of all) {
  const sql = stripBodies(strip(d.sql));

  for (const [name, rec] of life) {
    /* Only worth checking the ones that are deliberately retired —
       everything else is created once and lives to the end. */
    if (rec.died === null) continue;

    for (const m of sql.matchAll(new RegExp(`\\b${name}\\s*\\(`, 'gi'))) {
      const pos = at(d, m.index);
      /* The create and the drop both mention the name. Skip them. */
      const before = sql.slice(Math.max(0, m.index - 40), m.index);
      if (/\b(create|drop|comment)\s+(or\s+replace\s+)?(function|on\s+function)\s*$/i.test(before)) continue;

      if (pos < rec.born) {
        fail(d.name, `${name}() is called before ${rec.bornFile} defines it — 42883, and the paste stops there`);
      } else if (pos > rec.died) {
        fail(
          d.name,
          `${name}() is called after ${rec.diedFile} drops it — 42883, and the paste stops there`,
        );
      }
    }
  }
}

/* ---------- every table should be reachable ---------- */

const rlsEnabled = new Set();
const policied = new Set();
for (const d of all) {
  const sql = strip(d.sql);
  for (const m of sql.matchAll(/alter\s+table\s+(?:public\.)?"?(\w+)"?[\s\S]{0,80}?enable\s+row\s+level\s+security/gi)) {
    rlsEnabled.add(m[1]);
  }
  /* The RLS file enables in a loop over an array of names. */
  for (const m of sql.matchAll(/'(\w+)'/g)) {
    if (tables.has(m[1]) && /foreach|array\[|loop/i.test(sql)) rlsEnabled.add(m[1]);
  }
  for (const m of sql.matchAll(/create\s+policy\s+\w+\s+on\s+(?:public\.)?"?(\w+)"?/gi)) policied.add(m[1]);
  for (const m of sql.matchAll(/grant_table\s*\(\s*'(\w+)'/gi)) policied.add(m[1]);
}

for (const t of tables.keys()) {
  if (!policied.has(t)) {
    note('rls', `table "${t}" has no policy and no grant_table call — it will be readable by nobody`);
  }
}

/* ---------- residue from a removed domain ---------- */

const RESIDUE = [
  ['prayer', /\bprayer/i],
  ['shrine', /\bshrine/i],
  ['divo', /\bdivo/i],
  ['running sheet', /running_sheet|sheet_check|sheet_order|sheet_roster/i],
  ['observance', /observance/i],
  ['office zone', /'office'/i],
];

for (const d of all) {
  const sql = strip(d.sql);
  for (const [label, re] of RESIDUE) {
    const hits = (sql.match(new RegExp(re.source, 'gi')) ?? []).length;
    if (hits) note('residue', `${d.name}: ${hits} × ${label}`);
  }
}

/* ---------- the bundle must be newer than everything in it ---------- */

let bundleAge = null;
try {
  const bundleMtime = statSync(bundlePath).mtimeMs;
  const newestInput = Math.max(
    ...files.map((f) => statSync(join(migrationsDir, f)).mtimeMs),
    statSync(seedPath).mtimeMs,
  );
  bundleAge = bundleMtime - newestInput;
  if (bundleAge < 0) {
    fail(
      'deploy-all.sql',
      `is OLDER than its inputs by ${Math.round(-bundleAge / 1000)}s — run "npm run sql:bundle" or the house pastes the previous schema`,
    );
  }
  const bundle = readFileSync(bundlePath, 'utf8');
  const bundleTables = (strip(bundle).match(/create\s+table/gi) ?? []).length;
  if (bundleTables !== tables.size) {
    fail('deploy-all.sql', `contains ${bundleTables} tables but the migrations define ${tables.size} — it is stale`);
  }
} catch {
  fail('deploy-all.sql', 'is missing — run "npm run sql:bundle"');
}

/* ---------- report ---------- */

const count = (re) => all.reduce((n, d) => n + (strip(d.sql).match(re) ?? []).length, 0);
const grantTables = count(/grant_table\s*\(/gi);

/* Bodies are stripped before counting, because grant_table() builds its
   policies with execute format('create policy …') and those 16 template
   strings are not policies — they are one policy each, 46 times over.
   Counting them and then adding grant_table × 4 on top reported 236
   where a real Postgres produces 220. A throwaway database caught that;
   reading the file for the fourth time did not. */
const literalPolicies = all.reduce(
  (n, d) => n + (stripBodies(strip(d.sql)).match(/create\s+policy/gi) ?? []).length,
  0,
);

console.log('');
console.log(`  ${files.length} migrations + seed.sql`);
console.log(`  ${tables.size} tables · ${enums.size} enums · ${functions.size} functions`);
/* No multiplication here any more. grant_table() branches on what it is
   given, so how many policies a call produces is only knowable by
   running it — the old "× 4" printed 236 against a real Postgres's 220,
   and a confident wrong number in a gate is worse than no number.
   scripts/pg-harness/run.sh counts the ones that actually exist. */
console.log(`  ${literalPolicies} written policies · ${grantTables} grant_table calls`);
if (capEnum) console.log(`  ${capEnum.members.size} capabilities`);
if (bundleAge !== null && bundleAge >= 0) console.log(`  bundle is ${Math.round(bundleAge / 1000)}s newer than its inputs`);
console.log('');

if (notes.length) {
  console.log('  Worth a look:');
  for (const n of notes) console.log(`    · ${n.file} — ${n.msg}`);
  console.log('');
}

if (problems.length) {
  console.log(`  ${problems.length} problem${problems.length === 1 ? '' : 's'} that would fail the paste:`);
  for (const p of problems) console.log(`    ✗ ${p.file} — ${p.msg}`);
  console.log('');
  process.exit(1);
}

console.log('  Nothing that would fail the paste.');
console.log('');
