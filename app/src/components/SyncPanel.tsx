import React from 'react';
import { Btn, Callout, cx } from './ui';
import { QUEUE_LIMIT } from '@/lib/sync/outbox';
import { clearRefused, resumeSync, retryAll, subscribeStatus, syncStatus } from '@/lib/sync/engine';

/* ============================================================
   Whether the house has your work.

   The stub this replaces read navigator.onLine once and said "All
   changes saved" for the rest of the session, which is the wrong
   thing to be confident about: it was true of the device and said
   nothing about the database.

   Four states are worth distinguishing and the rest is noise. Saved.
   Saving. Waiting for a connection, with a count. And stopped, which
   is the only one that asks anything of the person.
   ============================================================ */

const count = (n: number, one: string, many: string): string =>
  `${n} ${n === 1 ? one : many}`;

export function SyncPanel() {
  const status = React.useSyncExternalStore(subscribeStatus, syncStatus);
  const { configured, phase, pending, failed, lastError, refused } = status;

  /* No backend on this build. Saying "all changes saved" would be a
     claim about a database that does not exist — this is a copy on one
     device, and the sidebar should say so plainly. */
  if (!configured) {
    return (
      <Row dot="offline" text="Saved on this device" title="No backend is connected on this build." />
    );
  }

  const full = pending >= QUEUE_LIMIT;

  if (full) {
    return (
      <>
        <Row dot="error" text={`${count(pending, 'change', 'changes')} not saved`} />
        <div style={{ padding: '0 10px 10px' }}>
          <Callout
            tone="crit"
            title="Nothing more can be saved"
            action={<Btn size="xs" onClick={retryAll}>Try now</Btn>}
          >
            {count(pending, 'change is', 'changes are')} waiting to reach the house records and
            nothing new can be added until they do. Find a connection, then try again. Nothing has
            been thrown away.
          </Callout>
        </div>
      </>
    );
  }

  if (phase === 'paused') {
    return (
      <>
        <Row dot="error" text="Signed out — nothing is saving" />
        <div style={{ padding: '0 10px 10px' }}>
          <Callout
            tone="crit"
            title="Sign in again"
            action={<Btn size="xs" onClick={resumeSync}>Retry</Btn>}
          >
            Your session has expired, so {count(pending, 'change is', 'changes are')} still waiting.
            They are kept on this device and will go up the moment you are back in.
          </Callout>
        </div>
      </>
    );
  }

  if (phase === 'blocked') {
    return (
      <>
        <Row dot="error" text="Cannot reach the house records" />
        <div style={{ padding: '0 10px 10px' }}>
          <Callout tone="crit" title="The database refused or could not be reached">
            {lastError || 'No detail was given.'}
          </Callout>
        </div>
      </>
    );
  }

  if (failed > 0) {
    return (
      <>
        <Row dot="error" text={`${count(failed, 'change', 'changes')} did not save`} />
        <div style={{ padding: '0 10px 10px' }}>
          <Callout
            tone="warn"
            title="Some changes were not saved"
            action={<Btn size="xs" onClick={retryAll}>Try again</Btn>}
          >
            {lastError || 'They are still on this device and can be sent again.'}
          </Callout>
        </div>
      </>
    );
  }

  if (phase === 'offline') {
    return (
      <Row
        dot="offline"
        text={pending ? `Offline — ${count(pending, 'change', 'changes')} waiting` : 'Offline'}
        title="Everything is kept on this device and goes up when the connection returns."
      />
    );
  }

  if (phase === 'loading') return <Row dot="offline" text="Opening the house records…" />;

  if (phase === 'sending' || pending > 0) {
    return <Row dot="offline" text={`Saving ${count(pending, 'change', 'changes')}…`} />;
  }

  /* Refused writes are not pending and not failed — they are gone, and
     the queue is empty again. Saying "all changes saved" at this point
     is the one thing the panel must never do, because it is precisely
     the case where something the person did was thrown away. */
  if (refused.length) {
    return (
      <>
        <Row dot="error" text={`${count(refused.length, 'change was', 'changes were')} not allowed`} />
        <div style={{ padding: '0 10px 10px' }}>
          <Callout
            tone="warn"
            title="Refused by the house records"
            action={<Btn size="xs" onClick={clearRefused}>Dismiss</Btn>}
          >
            <div style={{ marginBottom: 6 }}>
              These were not saved and will not be retried. Everything else is saved.
            </div>
            <ul style={{ margin: 0, paddingLeft: 16, lineHeight: 1.5 }}>
              {refused.slice(0, 5).map((r) => (
                <li key={r.at + r.summary}>
                  <strong>{r.summary}</strong> — {r.reason}
                </li>
              ))}
            </ul>
            {refused.length > 5 && (
              <div className="faint" style={{ marginTop: 6 }}>
                and {refused.length - 5} more
              </div>
            )}
          </Callout>
        </div>
      </>
    );
  }

  return <Row dot="ok" text="All changes saved" />;
}

function Row({ dot, text, title }: { dot: 'ok' | 'offline' | 'error'; text: string; title?: string }) {
  return (
    <div className="navbtn" style={{ cursor: 'default', gap: 10 }} title={title}>
      <span className={cx('syncdot', dot !== 'ok' && dot)} />
      <span style={{ fontSize: 12.5 }}>{text}</span>
    </div>
  );
}
