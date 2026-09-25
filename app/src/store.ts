import { create } from 'zustand';
import type {
  ChatMessage,
  DB,
  DateStr,
  ID,
  Issue,
  Notification,
  Profile,
  Role,
  RoleDef,
  TaskInstance,
  Zone,
} from '@/types';
import { adapter } from '@/lib/db';
import { createLogin, setPassword, type AuthResult } from '@/lib/auth';
import { DB_VERSION, emptyDB, seedDB } from '@/seed';
import { buildDay, rebuildDay, type BuildInput, type RoutingContext } from '@/lib/schedule';
import { addDays, today } from '@/lib/date';
import { newId, uid } from '@/lib/id';
import { backendConfigured, supabase } from '@/lib/supabase';
import {
  attachMirror,
  drain,
  loadTier1,
  loadTier2,
  startSync,
  type Mirror,
} from '@/lib/sync/engine';
import { startRealtime } from '@/lib/sync/realtime';
import * as outbox from '@/lib/sync/outbox';
import { idKindFor, isSynced, specFor, type WriteTarget } from '@/lib/sync/registry';

interface UI {
  ready: boolean;
  /** Who is signed in. Empty until the sign-in screen says otherwise. */
  userId: ID;
  date: DateStr;
  toast: string;
  /** Which record sheet is open, if any. */
  sheet: { kind: string; id?: string } | null;
  /**
   * Set when a configured backend could not be read on boot. The app
   * shows a plain screen rather than the seeded house, because falling
   * back to the seed against a real project is how somebody spends a
   * morning entering stock into a database that was never reached.
   */
  bootError: string;
}

interface Store extends UI {
  db: DB;

  /* lifecycle */
  init: () => Promise<void>;
  /** Flush the mirror to the local cache. Nothing leaves the device. */
  persist: () => void;
  resetAll: () => Promise<void>;

  /* ui */
  setUser: (id: ID) => void;
  setDate: (d: DateStr) => void;
  openSheet: (kind: string, id?: string) => void;
  closeSheet: () => void;
  showToast: (msg: string) => void;

  /* the day */
  ensureDay: (d: DateStr) => TaskInstance[];
  toggleTask: (taskId: ID) => void;
  setTaskNote: (taskId: ID, note: string) => void;
  assignTask: (taskId: ID, staffId: ID | undefined) => void;
  scheduleTask: (taskId: ID, time: string | undefined) => void;
  addAdhocTask: (t: Partial<TaskInstance> & { title: string }) => void;
  removeTask: (taskId: ID) => void;
  markAllInGroup: (group: string, done: boolean) => void;
  regenerateDay: () => void;

  /* the house chat */
  postChat: (text: string, photo?: string) => void;
  togglePinMessage: (id: ID) => void;

  /* generic record editing — every module uses these three */
  upsert: <K extends keyof DB>(slice: K, record: unknown, label?: string) => void;
  remove: <K extends keyof DB>(slice: K, id: ID, label?: string) => void;
  patch: <K extends keyof DB>(slice: K, id: ID, changes: Record<string, unknown>, label?: string) => void;

  /**
   * Send one change to the database.
   *
   * The single door out. `fields` is a column mask naming the app
   * fields this write claims — an update that sends a whole row lets
   * a rename overwrite a stock count somebody took thirty seconds
   * ago, so only inserts go whole.
   */
  write: (
    slice: WriteTarget,
    op: outbox.WriteOp,
    rowId: ID,
    record: Record<string, unknown>,
    fields: string[],
    summary: string,
  ) => void;

  /* things with real behaviour beyond a field write */
  raiseIssue: (i: Partial<Issue> & { title: string; zone: Zone }) => ID;
  advanceIssue: (id: ID, status: Issue['status']) => void;
  commentOnIssue: (id: ID, text: string) => void;
  adjustStock: (itemId: ID, delta: number, reason: 'used' | 'purchased' | 'count' | 'wasted') => void;
  notify: (n: Omit<Notification, 'id' | 'createdAt' | 'sentAt'>) => void;
  markNotificationsRead: (profileId: ID) => void;

  /* accounts — the only two calls that reach the service role, and they
     do it through an Edge Function rather than from the browser */
  setAccountPassword: (profileId: ID, password: string) => Promise<AuthResult>;

  /**
   * Save a role and its capability grid.
   *
   * Not `upsert('roles', …)`. The grid is a join table with a composite
   * key and the sync layer writes whole rows keyed on `id`, so the
   * capabilities were dropped on the floor — the screen said the role
   * was saved and the next boot restored the database's grid.
   */
  saveRole: (rec: RoleDef) => Promise<void>;
}

let saveTimer: number | undefined;

export const useStore = create<Store>((set, get) => ({
  ready: false,
  /* Nobody, until the sign-in screen names somebody. Defaulting to a real
     person handed whoever opened the app that person's view of the house. */
  userId: '',
  date: today(),
  toast: '',
  sheet: null,
  bootError: '',
  db: seedDB(),

  /* ---------- lifecycle ---------- */

  init: async () => {
    const saved = await adapter.load();
    const cached = saved && saved.version === DB_VERSION ? saved : null;

    /* No backend: exactly the app it has always been. The seeded house,
       on this device, with no sign-in and nothing to reach. */
    if (!backendConfigured) {
      const db = cached ?? seedDB();
      if (!cached) seedHistory(db);
      set({ db, ready: true });
      // Materialise today so the app opens on a real day, not an empty one.
      get().ensureDay(get().date);
      return;
    }

    /* A real project. The cache is a head start so the screen is not
       blank while tier 1 lands — never the truth, and never the seed:
       seedHistory() fabricates three weeks of finished days, and those
       would be scored as real work in Reports. */
    set({ db: cached ?? emptyDB() });
    attachMirror(storeMirror(set, get));

    const boot = await loadTier1();
    if (!boot.ok) {
      set({ ready: true, bootError: boot.message || 'The database could not be reached.' });
      return;
    }
    if (boot.profiles === 0) {
      set({ ready: true, bootError: 'no-profiles' });
      return;
    }

    set({ ready: true, bootError: '' });
    get().ensureDay(get().date);

    // After first paint: the four things the house actually touches,
    // then the queue and the channels.
    void loadTier2();
    startSync();
    startRealtime();
  },

  persist: () => {
    window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(() => {
      void adapter.save(get().db);
    }, 350);
  },

  resetAll: async () => {
    await adapter.reset();
    if (backendConfigured) {
      // Against a real project this clears the cache, not the house.
      set({ sheet: null, date: today(), db: emptyDB() });
      await loadTier1();
      void loadTier2();
      get().showToast('Local copy cleared — reloaded from the house records');
      return;
    }
    const db = seedDB();
    set({ db, sheet: null, date: today() });
    get().ensureDay(today());
    get().showToast('Everything reset to the seeded example data');
  },

  /* ---------- ui ---------- */

  setUser: (id) => {
    set({ userId: id, sheet: null });
    const p = get().db.profiles.find((x) => x.id === id);
    if (p) get().showToast(`Now viewing as ${p.name} · ${roleLabel(get().db, p.role)}`);
  },
  setDate: (d) => {
    set({ date: d });
    get().ensureDay(d);
  },
  openSheet: (kind, id) => set({ sheet: { kind, id } }),
  closeSheet: () => set({ sheet: null }),
  showToast: (msg) => {
    set({ toast: msg });
    window.setTimeout(() => {
      if (get().toast === msg) set({ toast: '' });
    }, 2600);
  },

  /* ---------- the day ---------- */

  ensureDay: (d) => {
    const { db } = get();
    if (db.days[d]?.length) return db.days[d];
    const tasks = buildDay(buildInputFor(db, d));
    set((s) => ({ db: { ...s.db, days: { ...s.db.days, [d]: tasks } } }));
    get().persist();
    return tasks;
  },

  regenerateDay: () => {
    const { db, date } = get();
    const tasks = rebuildDay(db.days[date] ?? [], buildInputFor(db, date));
    set((s) => ({ db: { ...s.db, days: { ...s.db.days, [date]: tasks } } }));
    get().persist();
    get().showToast('Day rebuilt — ticks and notes kept');
  },

  toggleTask: (taskId) => {
    const { date, userId } = get();
    mutateDay(set, get, date, (t) =>
      t.id === taskId
        ? { ...t, done: !t.done, doneBy: !t.done ? userId : undefined, doneAt: !t.done ? Date.now() : undefined }
        : t,
    );
    get().persist();
  },

  setTaskNote: (taskId, note) => {
    mutateDay(set, get, get().date, (t) => (t.id === taskId ? { ...t, note } : t));
    get().persist();
  },

  assignTask: (taskId, staffId) => {
    mutateDay(set, get, get().date, (t) => (t.id === taskId ? { ...t, assignedTo: staffId } : t));
    get().persist();
    const p = get().db.profiles.find((x) => x.id === staffId);
    if (p) {
      get().notify({
        profileId: p.id, kind: 'task_assigned',
        title: 'A task was assigned to you',
        body: get().db.days[get().date]?.find((t) => t.id === taskId)?.title ?? '',
        url: '#/planner', priority: 'normal',
      });
      get().showToast(`Assigned to ${p.name}`);
    }
  },

  scheduleTask: (taskId, time) => {
    mutateDay(set, get, get().date, (t) => (t.id === taskId ? { ...t, scheduledAt: time } : t));
    get().persist();
  },

  addAdhocTask: (t) => {
    const { date } = get();
    const task: TaskInstance = {
      id: uid('ti'), date, categoryId: 'c-household', zone: 'household',
      role: 'any', estMinutes: 15, done: false, source: 'adhoc', order: 99000, ...t,
    };
    set((s) => ({ db: { ...s.db, days: { ...s.db.days, [date]: [...(s.db.days[date] ?? []), task] } } }));
    get().persist();
    get().showToast('Added to today');
  },

  removeTask: (taskId) => {
    const { date } = get();
    set((s) => ({
      db: { ...s.db, days: { ...s.db.days, [date]: (s.db.days[date] ?? []).filter((t) => t.id !== taskId) } },
    }));
    get().persist();
  },

  markAllInGroup: (group, done) => {
    const { date, userId } = get();
    mutateDay(set, get, date, (t) =>
      (t.groupAs || '') === group && !t.off
        ? { ...t, done, doneBy: done ? userId : undefined, doneAt: done ? Date.now() : undefined }
        : t,
    );
    get().persist();
  },

  /* ============================================================
     The house chat.

     One thread, and everybody is in it. A message is how Earl tells
     Marvin the school run has moved, and how Rosie says the oven is
     playing up before it becomes a fault report. So posting pushes to
     everyone else who is active rather than only to whoever somebody
     remembered to name.
     ============================================================ */

  postChat: (text, photo) => {
    const body = text.trim();
    if (!body && !photo) return;
    const { userId, db } = get();
    // chat_messages.id is a uuid column, like every other posted row.
    const msg: ChatMessage = { id: newId(), by: userId, at: Date.now(), text: body, photo };
    set((s) => ({ db: { ...s.db, chat: [...s.db.chat, msg] } }));
    if (isSynced('chat')) {
      get().write('chat', 'insert', msg.id, msg as unknown as Record<string, unknown>, [], 'Message posted');
    } else {
      get().persist();
    }

    const from = nameOf(db.profiles, userId);
    db.profiles
      .filter((p) => p.active && p.id !== userId)
      .forEach((p) =>
        get().notify({
          profileId: p.id,
          kind: 'chat',
          title: `${from} posted to the house chat`,
          body: body.slice(0, 120) || 'Sent a photo',
          url: '#/chat',
          priority: 'normal',
        }),
      );
  },

  /* A pin is how a standing instruction stays at the top of the thread
     instead of being retyped every week.

     The only field on a posted message that may change — the body is
     immutable by trigger — so this is a two-column update and never a
     rewrite of the message. */
  togglePinMessage: (id) => {
    const { userId } = get();
    let pinned: ChatMessage | undefined;
    set((s) => ({
      db: {
        ...s.db,
        chat: s.db.chat.map((m) => {
          if (m.id !== id) return m;
          pinned = { ...m, pinned: !m.pinned, pinnedBy: !m.pinned ? userId : undefined };
          return pinned;
        }),
      },
    }));
    if (!pinned) return;
    if (isSynced('chat')) {
      get().write(
        'chat',
        'update',
        id,
        pinned as unknown as Record<string, unknown>,
        ['pinned', 'pinnedBy'],
        'Message pinned',
      );
    } else {
      get().persist();
    }
  },

  /* ---------- accounts ---------- */

  setAccountPassword: async (profileId, password) => {
    const p = get().db.profiles.find((x) => x.id === profileId);
    if (!p) return { ok: false, message: 'No such person.' };
    // A profile with no auth user yet needs creating rather than updating.
    const res = p.authId ? await setPassword(profileId, password) : await createLogin(p, password);
    if (res.ok) {
      get().patch('profiles', profileId, { canSignIn: true }, 'Login created');
    }
    get().persist();
    return res;
  },

  saveRole: async (rec) => {
    /* The mirror first, so the screen is right immediately. */
    set((s) => {
      const roles = s.db.roles.some((r) => r.id === rec.id)
        ? s.db.roles.map((r) => (r.id === rec.id ? { ...r, ...rec } : r))
        : [...s.db.roles, rec];
      return { db: { ...s.db, roles } };
    });
    get().persist();

    if (!backendConfigured || !supabase) {
      get().showToast(`Role “${rec.name}” saved`);
      return;
    }

    /* One call, one transaction. The row and the grid cannot be saved
       separately: a new role's row would still be sitting in the outbox
       when the capabilities arrived, and they would fail the foreign
       key. The function runs as the caller, so the policies still
       refuse a rank above your own or a capability you do not hold —
       the check in the sheet is a courtesy, this is the enforcement. */
    const { error } = await supabase.rpc('save_role', {
      p_id: rec.id,
      p_name: rec.name,
      p_rank: rec.rank,
      p_description: rec.description ?? '',
      p_works: rec.works ?? false,
      p_caps: rec.capabilities,
    });

    if (error) {
      get().showToast(`“${rec.name}” was not saved — ${error.message}`);
      return;
    }
    get().showToast(`Role “${rec.name}” saved`);
  },

  /* ---------- generic record editing ---------- */

  upsert: (slice, record, label) => {
    const rec = record as { id?: ID };
    // The uuid tables reject anything else with 22P02, and a new row
    // needs its id the instant it is drawn, not when the insert lands.
    if (!rec.id) rec.id = idKindFor(slice) === 'uuid' ? newId() : uid();
    let existed = false;
    set((s) => {
      const list = (s.db[slice] as unknown as { id: ID }[]) ?? [];
      existed = list.some((x) => x.id === rec.id);
      const next = existed ? list.map((x) => (x.id === rec.id ? (rec as { id: ID }) : x)) : [...list, rec as { id: ID }];
      return { db: { ...s.db, [slice]: next } as DB };
    });

    if (isSynced(slice)) {
      /* A form's Save button: the person had every field in front of
         them, so an edit claims all of them. A new row goes as an
         upsert on id, which is what makes a retry after a timeout
         whose answer never arrived safe to send again. */
      const fields = existed ? Object.keys(specFor(slice)?.map ?? {}) : [];
      get().write(
        slice,
        existed ? 'update' : 'insert',
        rec.id,
        rec as Record<string, unknown>,
        fields,
        label ?? 'Saved',
      );
    } else {
      get().persist();
    }
    get().showToast(label ?? 'Saved');
  },

  remove: (slice, id, label) => {
    // Kept for the delete intent: the queue holds what was removed, so
    // a refusal can be explained in terms of the thing and not the id.
    const current = get().db[slice];
    const before = Array.isArray(current)
      ? (current as { id: ID }[]).find((x) => x.id === id)
      : undefined;
    set((s) => {
      const list = (s.db[slice] as unknown as { id: ID }[]) ?? [];
      return { db: { ...s.db, [slice]: list.filter((x) => x.id !== id) } as DB };
    });
    if (isSynced(slice)) {
      get().write(slice, 'delete', id, (before ?? { id }) as Record<string, unknown>, [], label ?? 'Deleted');
    } else {
      get().persist();
    }
    get().showToast(label ?? 'Deleted');
  },

  patch: (slice, id, changes, label) => {
    let merged: Record<string, unknown> | undefined;
    set((s) => {
      const list = (s.db[slice] as unknown as { id: ID }[]) ?? [];
      return {
        db: {
          ...s.db,
          [slice]: list.map((x) => {
            if (x.id !== id) return x;
            merged = { ...x, ...changes };
            return merged as { id: ID };
          }),
        } as DB,
      };
    });
    if (!merged) return;

    if (isSynced(slice)) {
      /* The column mask, and the reason it exists: a patch that sent
         the whole row would carry every other field as it stood when
         this screen loaded, so renaming a product would overwrite a
         stock count somebody took thirty seconds ago. Only the keys
         that actually changed go up. */
      get().write(slice, 'update', id, merged, Object.keys(changes), label ?? 'Updated');
    } else {
      get().persist();
    }
  },

  /* ============================================================
     The one door out.

     Everything above that changes a synced slice arrives here, and
     nothing else in the app talks to the database at all. The intent
     is queued first and the cache flushed second, so a tab closed
     between the two still has the write.
     ============================================================ */

  write: (slice, op, rowId, record, fields, summary) => {
    const res = outbox.enqueue({ at: Date.now(), slice, op, rowId, record, fields, summary });
    if (!res.ok) {
      // Five hundred deep and still not sent. Refusing the write and
      // saying so beats accepting it into a queue that is already
      // holding more than anyone can account for.
      get().showToast('Too much is waiting to be saved — reconnect before making more changes.');
    }
    get().persist();
    void drain();
  },

  /* ---------- behaviour ---------- */

  raiseIssue: (i) => {
    // issues.id is a uuid column, so the report is born with one.
    const id = newId();
    const issue: Issue = {
      id, kind: 'fault', detail: '',
      priority: 'normal', status: 'reported',
      reportedBy: get().userId, reportedAt: Date.now(),
      photos: [], comments: [], ...i,
    };
    set((s) => ({ db: { ...s.db, issues: [issue, ...s.db.issues] } }));
    if (isSynced('issues')) {
      // photos and comments are rows of their own tables; the mapper
      // carries neither, so the insert is the issue alone.
      get().write('issues', 'insert', id, issue as unknown as Record<string, unknown>, [], 'Issue raised');
    } else {
      get().persist();
    }

    // Escalation push: Earl always, the owner if urgent.
    get().notify({
      profileId: 'p-earl', kind: 'issue_raised',
      title: (issue.priority === 'urgent' ? 'Urgent: ' : '') + issue.title,
      body: `Reported by ${nameOf(get().db.profiles, issue.reportedBy)}.`,
      url: `#/issues/${id}`, priority: issue.priority,
    });
    if (issue.priority === 'urgent') {
      get().notify({
        profileId: 'p-shrien', kind: 'issue_raised',
        title: 'Urgent: ' + issue.title,
        body: `Reported by ${nameOf(get().db.profiles, issue.reportedBy)}.`,
        url: `#/issues/${id}`, priority: 'urgent',
      });
    }
    get().showToast('Reported — raised for the manager');
    return id;
  },

  advanceIssue: (id, status) => {
    const issue = get().db.issues.find((x) => x.id === id);
    if (!issue) return;
    const changes: Partial<Issue> = { status };
    if (status === 'resolved') changes.resolvedAt = Date.now();
    get().patch('issues', id, changes as Record<string, unknown>, 'Issue updated');

    // Response push back to whoever raised it.
    if (status === 'acknowledged' || status === 'resolved') {
      get().notify({
        profileId: issue.reportedBy, kind: 'issue_update',
        title: status === 'resolved' ? 'Your report has been resolved' : 'Your report has been picked up',
        body: issue.title,
        url: `#/issues/${id}`, priority: 'normal',
      });
    }
    get().showToast(`Moved to ${status.replace('_', ' ')}`);
  },

  /* A comment is a row in issue_comments, not a field of the issue.
     It is nested in the mirror because that is how every screen reads
     it, and written to its own table because that is where it lives —
     sending the parent issue instead would rewrite the whole report
     to add one line to the thread. */
  commentOnIssue: (id, text) => {
    const { userId } = get();
    const comment = { id: newId(), by: userId, at: Date.now(), text };
    set((s) => ({
      db: {
        ...s.db,
        issues: s.db.issues.map((i) =>
          i.id === id ? { ...i, comments: [...i.comments, comment] } : i,
        ),
      },
    }));
    if (isSynced('issueComments')) {
      get().write('issueComments', 'insert', comment.id, { ...comment, issueId: id }, [], 'Comment added');
    } else {
      get().persist();
    }
    const issue = get().db.issues.find((x) => x.id === id);
    if (issue && issue.reportedBy !== userId) {
      get().notify({
        profileId: issue.reportedBy, kind: 'issue_update',
        title: 'New comment on your report', body: text.slice(0, 90),
        url: `#/issues/${id}`, priority: 'normal',
      });
    }
  },

  /* ============================================================
     Stock, which moves rather than being set.

     What goes up is the movement and never the quantity. An
     apply_movement() trigger adds the delta to inventory_items.qty
     server-side, so sending the new qty as well would land the same
     change twice — Rosie takes two bottles out and four disappear.

     The local qty below is optimistic, so the number on the shelf
     card changes under her thumb. It is corrected by the realtime
     UPDATE on inventory_items that the trigger itself causes.
     ============================================================ */
  adjustStock: (itemId, delta, reason) => {
    const { userId, db } = get();
    const item = db.inventory.find((i) => i.id === itemId);
    if (!item) return;
    const nextQty = Math.max(0, Math.round((item.qty + delta) * 100) / 100);
    const movement = { id: newId(), itemId, delta, reason, by: userId, at: Date.now() };
    set((s) => ({
      db: {
        ...s.db,
        inventory: s.db.inventory.map((i) => (i.id === itemId ? { ...i, qty: nextQty } : i)),
        movements: [...s.db.movements, movement],
      },
    }));
    if (isSynced('movements')) {
      get().write(
        'movements',
        'insert',
        movement.id,
        movement,
        [],
        `${item.name} ${delta > 0 ? '+' : ''}${delta}`,
      );
    } else {
      get().persist();
    }

    // Crossing the minimum is the escalation, not sitting below it.
    if (item.qty >= item.min && nextQty < item.min) {
      get().notify({
        profileId: 'p-earl', kind: 'stock_low',
        title: `${item.name} is below minimum`,
        body: `${nextQty} ${item.unit} left, minimum ${item.min}.`,
        url: '#/inventory', priority: nextQty === 0 ? 'high' : 'normal',
      });
    }
  },

  notify: (n) => {
    const pref = get().db.notifPrefs.find((p) => p.profileId === n.profileId);
    const cls = NOTIF_CLASS[n.kind];
    if (pref && cls && !pref.classes[cls]) return; // muted by preference
    const rec: Notification = { ...n, id: uid('nt'), createdAt: Date.now(), sentAt: Date.now() };
    set((s) => ({ db: { ...s.db, notifications: [rec, ...s.db.notifications] } }));
    get().persist();
  },

  markNotificationsRead: (profileId) => {
    set((s) => ({
      db: {
        ...s.db,
        notifications: s.db.notifications.map((n) =>
          n.profileId === profileId && !n.readAt ? { ...n, readAt: Date.now() } : n,
        ),
      },
    }));
    get().persist();
  },
}));

/* ============================================================
   The mirror the sync engine writes into.

   Handed over once, in init(), and it is the only way anything in
   src/lib/sync reaches the store. Passing it in rather than letting
   the engine import useStore is what keeps the two out of a cycle,
   and it is also the seam: all eighteen screens go on reading db.x
   synchronously and none of them knows a row arrived over a socket.
   ============================================================ */

type Row = Record<string, unknown>;

/**
 * A row from the database carries its own columns and nothing else.
 * An issue's thread and its photographs are separate tables, and
 * every screen reads them as arrays — so a report that arrives before
 * its thread is hydrated still has to have an empty one, or the first
 * render of Issues throws on undefined.
 */
function normalise(slice: WriteTarget, record: Row): Row {
  switch (slice) {
    case 'issues':
      return { photos: [], comments: [], ...record };
    case 'incidents':
      return { photos: [], ...record };
    case 'meals':
      return { ingredients: [], ...record };
    default:
      return record;
  }
}

function storeMirror(
  set: (fn: (s: Store) => Partial<Store>) => void,
  get: () => Store,
): Mirror {
  const listOf = (slice: WriteTarget): { id: ID }[] | null => {
    if (slice === 'issueComments') return null;
    const v = get().db[slice as keyof DB];
    return Array.isArray(v) ? (v as { id: ID }[]) : null;
  };

  return {
    replaceSlice(slice, rows) {
      if (slice === 'issueComments') return;
      const list = rows.map((r) => normalise(slice, r));
      set((s) => ({ db: { ...s.db, [slice]: list } as DB }));
      get().persist();
    },

    applyRow(slice, record) {
      if (slice === 'issueComments') return;
      const id = String(record.id ?? '');
      if (!id) return;
      set((s) => {
        const list = (s.db[slice as keyof DB] as unknown as { id: ID }[]) ?? [];
        const exists = list.some((x) => x.id === id);
        const row = normalise(slice, record) as unknown as { id: ID };
        /* A row nobody has seen lands where a local one would. Only
           raiseIssue puts a new record at the front; upsert appends.
           Matching that here is what stops a buy-list line typed on
           Marvin's phone appearing at the top of Rosie's list while
           the one she just added sits at the bottom. */
        const next = exists
          ? list.map((x) => (x.id === id ? { ...x, ...row } : x))
          : slice === 'issues'
            ? [row, ...list]
            : [...list, row];
        return { db: { ...s.db, [slice]: next } as DB };
      });
      get().persist();
    },

    dropRow(slice, rowId) {
      if (slice === 'issueComments') {
        // A refused comment comes out of whichever thread holds it.
        set((s) => ({
          db: {
            ...s.db,
            issues: s.db.issues.map((i) =>
              i.comments.some((c) => c.id === rowId)
                ? { ...i, comments: i.comments.filter((c) => c.id !== rowId) }
                : i,
            ),
          },
        }));
        get().persist();
        return;
      }
      set((s) => {
        const list = (s.db[slice as keyof DB] as unknown as { id: ID }[]) ?? [];
        return { db: { ...s.db, [slice]: list.filter((x) => x.id !== rowId) } as DB };
      });
      get().persist();
    },

    getRow(slice, rowId) {
      const list = listOf(slice);
      return (list?.find((x) => x.id === rowId) as unknown as Row) ?? undefined;
    },

    setSettings(patch) {
      set((s) => ({ db: { ...s.db, settings: { ...s.db.settings, ...patch } } as DB }));
      get().persist();
    },

    say(message) {
      get().showToast(message);
    },
  };
}

/* ---------- helpers ---------- */

function mutateDay(
  set: (fn: (s: Store) => Partial<Store>) => void,
  get: () => Store,
  date: DateStr,
  fn: (t: TaskInstance) => TaskInstance,
) {
  const existing = get().db.days[date] ?? [];
  set((s) => ({ db: { ...s.db, days: { ...s.db.days, [date]: existing.map(fn) } } }));
}

export function buildInputFor(db: DB, date: DateStr): BuildInput {
  const routing: RoutingContext = {
    profiles: db.profiles,
    roles: db.roles,
    shifts: db.shifts,
    absences: db.absences,
    coverage: db.coverage,
  };
  return {
    date,
    settings: db.settings,
    areas: db.areas,
    categories: db.taskCategories,
    library: db.library,
    meals: db.meals,
    guests: db.guests,
    events: db.events,
    vacations: db.vacations,
    plants: db.plants,
    contracts: db.contracts,
    routing,
  };
}

const NOTIF_CLASS: Record<string, 'assigned' | 'reminder' | 'escalation' | 'response'> = {
  day_ready: 'assigned',
  task_assigned: 'assigned',
  task_reminder: 'reminder',
  issue_raised: 'escalation',
  issue_update: 'response',
  meal_approval: 'escalation',
  stock_low: 'escalation',
  bill_due: 'escalation',
  expiry: 'escalation',
  coverage_gap: 'escalation',
  delivery: 'response',
  incident: 'escalation',
  chat: 'response',
};

/* The invented penthouse had a 'p-owner' and a 'p-mgr'. Seed records
   written against those ids are still in the database, so they resolve
   to the real people rather than printing 'Unknown' beside a real
   transaction or a real fault report. */
const LEGACY_IDS: Record<string, ID> = { 'p-owner': 'p-aditya', 'p-mgr': 'p-earl' };

export function nameOf(profiles: Profile[], id?: ID): string {
  if (!id) return 'Unassigned';
  const resolved = LEGACY_IDS[id] ?? id;
  return profiles.find((p) => p.id === resolved)?.name ?? 'Unknown';
}

/**
 * Roles are rows now, so their names come from the database. The
 * fallback is the id itself — a role that has been deleted while
 * somebody still holds it should read as odd, not as blank.
 */
export function roleLabel(db: DB, r: Role): string {
  return db.roles.find((x) => x.id === r)?.name ?? r;
}

/* ---------- the current user ---------- */

/**
 * Nobody. Returned when no profile matches the signed-in id, so an
 * unknown session fails closed rather than inheriting whoever happens to
 * be first in the list. can() in lib/access.ts already refuses an
 * inactive profile whose role resolves to no row, so every screen in the
 * app is shut without any of them needing to know about this case — and
 * the return type stays Profile, so none of them changes.
 */
const ANONYMOUS_PROFILE: Profile = {
  id: '',
  name: 'Not signed in',
  role: '',
  staffRoles: [],
  email: '',
  phone: '',
  initials: '',
  active: false,
};

export function useUser(): Profile {
  const userId = useStore((s) => s.userId);
  const profiles = useStore((s) => s.db.profiles);
  return profiles.find((p) => p.id === userId) ?? ANONYMOUS_PROFILE;
}

/* ============================================================
   Three weeks of finished days, so the report has something real to
   score and the trends are not flat. Completion varies by person and
   by day rather than being uniform — a flat 92% everywhere would be
   the one number nobody believes.
   ============================================================ */
function seedHistory(db: DB): void {
  const t = today();
  // A deterministic wobble, so a reseed produces the same history.
  const wobble = (n: number) => ((Math.sin(n * 12.9898) * 43758.5453) % 1 + 1) % 1;

  for (let back = 21; back >= 1; back--) {
    const date = addDays(t, -back);
    const tasks = buildDay(buildInputFor(db, date));
    if (!tasks.length) continue;

    // Rosie runs high; Marvin is out on the road, so his list is short and
    // he clears it. Anything unassigned drifts, which is the honest number.
    const rate = (staffId?: string, i = 0) => {
      const base = staffId === 'p-rosie' ? 0.95 : staffId === 'p-marvin' ? 0.98 : 0.7;
      return base - wobble(back * 100 + i) * 0.14;
    };

    tasks.forEach((task, i) => {
      if (task.off) return;
      if (wobble(back * 1000 + i) < rate(task.assignedTo, i)) {
        task.done = true;
        task.doneBy = task.assignedTo;
        const hour = 7 + Math.floor(wobble(i * 7 + back) * 12);
        task.doneAt = new Date(date + 'T' + String(hour).padStart(2, '0') + ':00:00').getTime();
      }
    });

    // A handful of honest notes, which is what makes History worth opening.
    const notes = [
      'Ran over — the guest room needed airing longer than expected.',
      'Bin liners ran out mid-round. Added to the list.',
      'Left the pantry check until after the delivery landed.',
      'Coffee machine flow slow again — descaled rather than waiting for Thursday.',
    ];
    if (back % 5 === 0) {
      const target = tasks.find((x) => !x.done && x.assignedTo);
      if (target) target.note = notes[back % notes.length]!;
    }

    db.days[date] = tasks;
  }
}
