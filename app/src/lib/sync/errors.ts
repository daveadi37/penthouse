/* ============================================================
   What a failed write actually means, and what to do about it.

   Three outcomes matter and they are treated completely differently.
   A dropped connection is not a failure — the write stays queued and
   goes again later. A refusal from row-level security is final, and
   retrying it forever is how a queue fills with writes that will
   never land. An expired session is neither: the queue is correct
   and only the token is stale, so it pauses rather than empties.

   Getting this wrong in either direction is bad in a way somebody
   notices. Retry a refusal and the app looks broken. Discard a
   dropped connection and Rosie's morning of stock counts is gone.
   ============================================================ */

export type FaultKind =
  /** The network, not the server. Stay queued, back off, try again. */
  | 'offline'
  /** The database said no and will say no again. Never retry. */
  | 'refused'
  /** The session, not the write. Refresh once, then pause the queue. */
  | 'auth'
  /** Something unclassified. Retried a few times, then given up on. */
  | 'unknown';

export interface Fault {
  kind: FaultKind;
  /** The Postgres SQLSTATE or PostgREST code, where there was one. */
  code: string;
  /** The raw message, for the diagnostics panel — not for the person. */
  message: string;
}

/* Row-level security refused it. The single most important code here:
   it is what every policy in 20260828001400_rls.sql raises. */
const RLS_REFUSED = '42501';

/* Constraint violations. Same treatment as a refusal — the row is
   wrong, and sending it again does not make it right.
     23505  unique violation
     23503  foreign key violation
     23514  check constraint violation
     22P02  invalid text representation, which is what a non-uuid id
            lands as, and the reason newId() exists at all */
const CONSTRAINT = new Set(['23505', '23503', '23514', '22P02']);

/** Not signed in, or signed in with a token that has expired. */
const AUTH_CODES = new Set(['PGRST301', 'PGRST302', '42501.jwt']);

function read(err: unknown, key: string): string {
  if (!err || typeof err !== 'object') return '';
  const v = (err as Record<string, unknown>)[key];
  return typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '';
}

export function classify(err: unknown): Fault {
  const code = read(err, 'code');
  const message = read(err, 'message') || String(err ?? 'Unknown error');
  const status = Number(read(err, 'status') || read(err, 'statusCode') || 0);

  // The browser could not reach the server at all. supabase-js surfaces
  // this as a TypeError from fetch, and PostgREST never gets a look in,
  // so there is no code to match on — only the shape of the failure.
  const looksNetwork =
    err instanceof TypeError ||
    status === 0 ||
    /failed to fetch|networkerror|network request failed|load failed|timeout|aborted/i.test(message);

  if (status === 401 || AUTH_CODES.has(code)) return { kind: 'auth', code, message };
  if (code === RLS_REFUSED || status === 403) return { kind: 'refused', code: code || '42501', message };
  if (CONSTRAINT.has(code)) return { kind: 'refused', code, message };

  // Order matters: a 401 or a 42501 arriving alongside a flaky
  // connection is still the server's answer, not the network's.
  if (looksNetwork) return { kind: 'offline', code: code || '0', message };

  // 5xx is the server having a bad minute rather than a verdict on
  // this row, so it is worth going again.
  if (status >= 500) return { kind: 'offline', code: String(status), message };

  return { kind: 'unknown', code, message };
}

/**
 * An update or a delete that matched no rows.
 *
 * PostgREST returns success with an empty body for this, because from
 * its point of view nothing went wrong. From ours it is the loudest
 * signal there is: the row exists — it was read a moment ago — so a
 * policy filtered it out of the `using` clause. Treating it as a
 * success would leave the mirror showing a change the database never
 * accepted, which is the one outcome worse than an error.
 */
export function zeroRowsFault(): Fault {
  return {
    kind: 'refused',
    code: '42501',
    message: 'The update matched no rows — row-level security filtered it out.',
  };
}

/* ---------- what the person reads ---------- */

/**
 * Plain, specific, and honest about the outcome. The last sentence is
 * the one that matters: somebody who has just typed something needs to
 * know whether to type it again.
 */
export function explain(fault: Fault, noun: string): string {
  switch (fault.kind) {
    case 'refused':
      if (fault.code === '23505') {
        return `That ${noun} is already there — it was not saved a second time.`;
      }
      if (fault.code === '23503') {
        return `That change refers to something that is no longer in the house records. Nothing has been saved.`;
      }
      if (fault.code === '23514' || fault.code === '22P02') {
        return `That change was not in a form the house records accept. Nothing has been saved.`;
      }
      return `That change was not allowed — your role cannot edit the ${noun}. Nothing has been saved.`;
    case 'auth':
      return 'Your session has expired. Sign in again — nothing has been lost, and the queued changes will go up once you do.';
    case 'offline':
      return 'Waiting for a connection. The change is saved on this device and will go up on its own.';
    default:
      return `That ${noun} could not be saved: ${fault.message}`;
  }
}
