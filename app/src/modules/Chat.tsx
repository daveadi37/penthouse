import React from 'react';
import { useStore, useUser } from '@/store';
import { can } from '@/lib/access';
import { diffDays, ds, fmtMedium, timeAgo, today } from '@/lib/date';
import { profileName } from '@/lib/selectors';
import { shrink } from '@/modules/Issues';
import type { ChatMessage, DateStr, ID } from '@/types';
import { Avatar, Btn, Card, Chip, cx, Empty, List, PageHead, Row, SectionHead } from '@/components/ui';

/* ============================================================
   The house chat.

   One thread, everybody in it. Marvin and Rosie read the same messages
   as the family, because a message split into two rooms is a message
   half the house acted on. What keeps that usable is the pinned block:
   "Shrien is back on Tuesday" has to survive a day of chatter about
   deliveries, so it is lifted out of the flow rather than being retyped
   every morning.
   ============================================================ */

/** Messages closer together than this, from one person, share an avatar. */
const RUN_MS = 5 * 6e4;

/* ---------- read state ----------

   Which messages a person has seen is a property of the device in their
   hand, not of the house: Rosie reading the thread on the kitchen iPad
   should not clear the badge on her phone, and a table of read receipts
   for nine people is a lot of rows to store a fact nobody ever audits.
   So it is a localStorage stamp, keyed by person because these devices
   are shared and switching account must not mark everything read. */

const SEEN_PREFIX = 'p3808.chat.seen.';

/* localStorage does not tell React it changed, so whoever writes the
   stamp nudges the badge itself. */
const seenListeners = new Set<() => void>();

function lastSeen(profileId: ID): number {
  try {
    return Number(window.localStorage.getItem(SEEN_PREFIX + profileId)) || 0;
  } catch {
    // Private browsing, or storage refused. Everything reads as unseen.
    return 0;
  }
}

function markSeen(profileId: ID, at: number): void {
  if (!at || at <= lastSeen(profileId)) return;
  try {
    window.localStorage.setItem(SEEN_PREFIX + profileId, String(at));
  } catch {
    // Nothing to do — the badge simply stays until the page is reloaded.
  }
  seenListeners.forEach((fn) => fn());
}

/**
 * How many messages this person has not seen. The shell calls this for
 * the nav badge; your own messages never count against you.
 */
export function useChatUnread(profileId: ID): number {
  const chat = useStore((s) => s.db.chat);
  const [, bump] = React.useReducer((n: number) => n + 1, 0);
  React.useEffect(() => {
    seenListeners.add(bump);
    return () => {
      seenListeners.delete(bump);
    };
  }, []);
  if (!profileId) return 0;
  const seen = lastSeen(profileId);
  return chat.filter((m) => m.at > seen && m.by !== profileId).length;
}

/* ---------- the screen ---------- */

export function Chat() {
  const db = useStore((s) => s.db);
  const user = useUser();
  const togglePin = useStore((s) => s.togglePinMessage);
  const canPost = can(db, user, 'chat.post');
  const canPin = can(db, user, 'issue.manage');
  const threadRef = React.useRef<HTMLDivElement>(null);

  const sorted = React.useMemo(() => db.chat.slice().sort((a, b) => a.at - b.at), [db.chat]);
  const pinned = sorted.filter((m) => m.pinned);
  const newest = sorted.length ? sorted[sorted.length - 1].at : 0;

  /* Opening the screen is the act of reading it, and a new message
     arriving while it is open has been read too. */
  React.useEffect(() => {
    markSeen(user.id, newest);
  }, [user.id, newest]);

  /* The bottom is where the conversation is, on open and after every
     new message — including your own, so sending shows you your message. */
  React.useEffect(() => {
    const el = threadRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [newest]);

  return (
    <div className="chat-pane">
      <PageHead
        eyebrow="House chat"
        title="One thread, everyone in it"
        sub="Anything the house needs to know. Everyone sees it next time they open the app."
      />

      {pinned.length > 0 && (
        <Card pad="sm">
          <SectionHead
            title="Pinned notices"
            sub="Held at the top until somebody takes them down."
          />
          <div className="chat-pinlist">
            <List className="flat">
              {pinned.map((m) => (
                <Row
                  key={m.id}
                  left={<Avatar name={profileName(db, m.by)} initials={initialsFor(db.profiles, m.by)} size="sm" />}
                  title={m.text || 'Photo'}
                  sub={
                    m.pinnedBy
                      ? `${profileName(db, m.by)} · pinned by ${profileName(db, m.pinnedBy)}`
                      : profileName(db, m.by)
                  }
                  right={
                    canPin ? (
                      <Btn size="xs" variant="ghost" onClick={() => togglePin(m.id)}>
                        Unpin
                      </Btn>
                    ) : undefined
                  }
                />
              ))}
            </List>
          </div>
        </Card>
      )}

      <div className="chat-thread" ref={threadRef}>
        {sorted.length === 0 ? (
          <Empty title="Nothing yet">
            This is where anything the house needs to know goes — what is running low, who is coming,
            what broke.
          </Empty>
        ) : (
          sorted.map((m, i) => {
            const prev = i > 0 ? sorted[i - 1] : undefined;
            const day = ds(new Date(m.at));
            const newDay = !prev || ds(new Date(prev.at)) !== day;
            /* A pinned message always breaks the run: it carries a name
               and a chip of its own, and hiding those under the message
               above it is how a notice stops looking like a notice. */
            const run =
              !newDay && !!prev && !m.pinned && prev.by === m.by && m.at - prev.at < RUN_MS;
            return (
              <React.Fragment key={m.id}>
                {newDay && (
                  <div className="chat-day">
                    <span>{dayLabel(day)}</span>
                  </div>
                )}
                <Message m={m} run={run} canPin={canPin} />
              </React.Fragment>
            );
          })
        )}
      </div>

      <Composer canPost={canPost} />

      <style>{CSS}</style>
    </div>
  );
}

function Message({ m, run, canPin }: { m: ChatMessage; run: boolean; canPin: boolean }) {
  const db = useStore((s) => s.db);
  const togglePin = useStore((s) => s.togglePinMessage);

  return (
    <div className={cx('chat-msg', run && 'run')}>
      <div className="chat-gutter">
        {!run && <Avatar name={profileName(db, m.by)} initials={initialsFor(db.profiles, m.by)} />}
      </div>
      <div className="grow" style={{ minWidth: 0 }}>
        {!run && (
          <div className="row wrap" style={{ gap: 7, marginBottom: 2 }}>
            <span className="chat-who">{profileName(db, m.by)}</span>
            <span className="faint" style={{ fontSize: 12 }}>{timeAgo(m.at)}</span>
            {m.pinned && <Chip tone="bronze">Pinned</Chip>}
          </div>
        )}
        {m.text && <div className="chat-text">{m.text}</div>}
        {m.photo && <img className="chat-photo" src={m.photo} alt="" />}
      </div>
      {canPin && (
        <Btn
          className="chat-pin"
          size="xs"
          variant="ghost"
          onClick={() => togglePin(m.id)}
          title={m.pinned ? 'Take this off the pinned notices' : 'Keep this at the top of the screen'}
        >
          {m.pinned ? 'Unpin' : 'Pin'}
        </Btn>
      )}
    </div>
  );
}

/* ---------- the composer ---------- */

function Composer({ canPost }: { canPost: boolean }) {
  const postChat = useStore((s) => s.postChat);
  const [text, setText] = React.useState('');
  const [photo, setPhoto] = React.useState('');
  const [reading, setReading] = React.useState(false);
  const areaRef = React.useRef<HTMLTextAreaElement>(null);
  const fileRef = React.useRef<HTMLInputElement>(null);

  /* Grow to the text and stop, rather than scrolling inside four lines
     while the thread above has room to spare. */
  const fit = () => {
    const el = areaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(150, el.scrollHeight)}px`;
  };

  const send = () => {
    if (!canPost || reading) return;
    if (!text.trim() && !photo) return;
    postChat(text, photo || undefined);
    setText('');
    setPhoto('');
    if (areaRef.current) areaRef.current.style.height = 'auto';
  };

  const pick = async (file: File) => {
    setReading(true);
    setPhoto(await shrink(file));
    setReading(false);
  };

  return (
    <Card pad="sm" className="chat-composer">
      {photo && (
        <div className="row" style={{ gap: 8, marginBottom: 8 }}>
          <span className="thumb" style={{ width: 62, height: 62 }}>
            <img src={photo} alt="" />
          </span>
          <Btn size="xs" variant="ghost" onClick={() => setPhoto('')}>
            Remove photo
          </Btn>
        </div>
      )}
      <div className="row" style={{ gap: 8, alignItems: 'flex-end' }}>
        <textarea
          ref={areaRef}
          className="in chat-area"
          rows={1}
          value={text}
          disabled={!canPost}
          placeholder={
            canPost
              ? 'Tell the house something'
              : 'You can read the house chat, but your role cannot post to it'
          }
          onChange={(e) => {
            setText(e.target.value);
            fit();
          }}
          onKeyDown={(e) => {
            /* Enter sends. Shift+Enter is the new line — the opposite
               way round turns every quick note into two taps. */
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
        />
        <Btn
          variant="ghost"
          disabled={!canPost || reading}
          onClick={() => fileRef.current?.click()}
          title="Add a photo"
        >
          {reading ? '…' : '▣'}
        </Btn>
        <Btn disabled={!canPost || reading || (!text.trim() && !photo)} onClick={send}>
          Send
        </Btn>
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hide"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file) void pick(file);
        }}
      />
    </Card>
  );
}

/* ---------- small helpers ---------- */

function initialsFor(profiles: { id: ID; initials: string }[], id: ID): string | undefined {
  return profiles.find((p) => p.id === id)?.initials;
}

function dayLabel(d: DateStr): string {
  const back = diffDays(d, today());
  if (back === 0) return 'Today';
  if (back === 1) return 'Yesterday';
  return fmtMedium(d);
}

/* The screen is a fixed-height column so the composer stays where the
   thumb expects it rather than being pushed off the bottom by a long
   thread. Everything here is scoped to this module — the global
   stylesheet is not this component's to change. */
const CSS = `
.chat-pane {
  display: flex;
  flex-direction: column;
  gap: 12px;
  height: calc(100vh - 86px - var(--safe-b));
  height: calc(100dvh - 86px - var(--safe-b));
  min-height: 420px;
}
.chat-pane .pagehead { padding-bottom: 4px; }
.chat-pinlist { max-height: 168px; overflow-y: auto; }
.chat-thread {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  background: var(--card);
  border-radius: var(--r);
  box-shadow: var(--shadow);
  padding: 10px 14px 14px;
}
.chat-day {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 16px 0 10px;
}
.chat-day::before,
.chat-day::after {
  content: '';
  flex: 1;
  height: 1px;
  background: var(--line);
}
.chat-day span {
  font-size: 11px;
  font-weight: 650;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--faint);
}
.chat-msg {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 6px 0;
}
.chat-msg.run { padding-top: 0; }
.chat-gutter { flex: none; width: 28px; }
.chat-who { font-size: 13.5px; font-weight: 650; color: var(--ink); }
.chat-text {
  font-size: 15px;
  line-height: 1.42;
  color: var(--ink-2);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.chat-photo {
  display: block;
  margin-top: 7px;
  max-width: 260px;
  width: 100%;
  border-radius: var(--r-sm);
  border: 1px solid var(--line);
}
.chat-pin { flex: none; opacity: 0.4; transition: opacity 0.12s; }
.chat-msg:hover .chat-pin,
.chat-pin:focus-visible { opacity: 1; }
@media (hover: none) { .chat-pin { opacity: 1; } }
.chat-composer { flex: none; }
.chat-area {
  flex: 1;
  min-width: 0;
  min-height: 42px;
  resize: none;
  line-height: 1.4;
}
@media (max-width: 960px) {
  .chat-pane { height: calc(100dvh - 122px - var(--safe-b)); min-height: 360px; }
  .chat-photo { max-width: 100%; }
}
`;
