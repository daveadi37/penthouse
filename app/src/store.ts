import { create } from 'zustand';
import type {
  DB,
  DateStr,
  DivoLog,
  ID,
  Issue,
  Notification,
  Profile,
  Role,
  RunningSheet,
  TaskInstance,
  Zone,
} from '@/types';
import { adapter, pushOutbox } from '@/lib/db';
import { createLogin, setPassword, type AuthResult } from '@/lib/auth';
import { seedDB } from '@/seed';
import { blankSheet, observanceDayNo, occasionFor } from '@/seed/prayer';
import { buildDay, rebuildDay, type BuildInput, type RoutingContext } from '@/lib/schedule';
import { addDays, today } from '@/lib/date';
import { uid } from '@/lib/id';

export type ZoneFilter = Zone | 'all';

/** The five editable tables on the running sheet. */
export type SheetSection = 'roster' | 'order' | 'menu' | 'shopping' | 'sheetGuests';

interface UI {
  ready: boolean;
  /** Who is signed in. The role switcher stands in for real auth. */
  userId: ID;
  date: DateStr;
  zoneFilter: ZoneFilter;
  toast: string;
  /** Which record sheet is open, if any. */
  sheet: { kind: string; id?: string } | null;
}

interface Store extends UI {
  db: DB;

  /* lifecycle */
  init: () => Promise<void>;
  persist: (entity: string, summary: string) => void;
  resetAll: () => Promise<void>;

  /* ui */
  setUser: (id: ID) => void;
  setDate: (d: DateStr) => void;
  setZoneFilter: (z: ZoneFilter) => void;
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

  /* the running sheet */
  ensureSheet: (date: DateStr) => RunningSheet;
  patchSheet: (date: DateStr, changes: Partial<RunningSheet>) => void;
  tickCheck: (date: DateStr, groupId: ID, itemId: ID) => void;
  upsertSheetRow: (date: DateStr, section: SheetSection, row: unknown) => void;
  removeSheetRow: (date: DateStr, section: SheetSection, rowId: ID) => void;
  toggleOrderRow: (date: DateStr, rowId: ID) => void;
  startBreak: (date: DateStr) => void;
  endBreak: (date: DateStr, breakId: ID, waterServed: boolean) => void;
  logToiletCheck: (date: DateStr, clean: boolean, restocked: boolean, notes?: string) => void;
  logDivo: (action: DivoLog['action'], oilLevel?: DivoLog['oilLevel'], notes?: string) => void;
  postSheet: (date: DateStr, preparedBy: string) => { ok: boolean; problems: string[] };
  checkSheet: (date: DateStr, by: ID) => void;

  /* generic record editing — every module uses these three */
  upsert: <K extends keyof DB>(slice: K, record: unknown, label?: string) => void;
  remove: <K extends keyof DB>(slice: K, id: ID, label?: string) => void;
  patch: <K extends keyof DB>(slice: K, id: ID, changes: Record<string, unknown>, label?: string) => void;

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
}

let saveTimer: number | undefined;

export const useStore = create<Store>((set, get) => ({
  ready: false,
  // Earl is in charge overall and checks the sheet, so his view is the default.
  userId: 'p-earl',
  date: today(),
  zoneFilter: 'all',
  toast: '',
  sheet: null,
  db: seedDB(),

  /* ---------- lifecycle ---------- */

  init: async () => {
    const saved = await adapter.load();
    const fresh = !saved || saved.version !== seedDB().version;
    const db = fresh ? seedDB() : saved!;
    if (fresh) seedHistory(db);
    set({ db, ready: true });
    // Materialise today so the app opens on a real day, not an empty one.
    get().ensureDay(get().date);
    get().ensureSheet(get().date);
  },

  persist: (entity, summary) => {
    pushOutbox(entity, summary);
    window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(() => {
      void adapter.save(get().db);
    }, 350);
  },

  resetAll: async () => {
    await adapter.reset();
    const db = seedDB();
    set({ db, sheet: null, date: today() });
    get().ensureDay(today());
    get().ensureSheet(today());
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
    get().ensureSheet(d);
  },
  setZoneFilter: (z) => set({ zoneFilter: z }),
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
    get().persist('days', `Built ${d}`);
    return tasks;
  },

  regenerateDay: () => {
    const { db, date } = get();
    const tasks = rebuildDay(db.days[date] ?? [], buildInputFor(db, date));
    set((s) => ({ db: { ...s.db, days: { ...s.db.days, [date]: tasks } } }));
    get().persist('days', `Rebuilt ${date}`);
    get().showToast('Day rebuilt — ticks and notes kept');
  },

  toggleTask: (taskId) => {
    const { date, userId } = get();
    mutateDay(set, get, date, (t) =>
      t.id === taskId
        ? { ...t, done: !t.done, doneBy: !t.done ? userId : undefined, doneAt: !t.done ? Date.now() : undefined }
        : t,
    );
    get().persist('days', 'Task ticked');
  },

  setTaskNote: (taskId, note) => {
    mutateDay(set, get, get().date, (t) => (t.id === taskId ? { ...t, note } : t));
    get().persist('days', 'Task note');
  },

  assignTask: (taskId, staffId) => {
    mutateDay(set, get, get().date, (t) => (t.id === taskId ? { ...t, assignedTo: staffId } : t));
    get().persist('days', 'Task reassigned');
    const p = get().db.profiles.find((x) => x.id === staffId);
    if (p) {
      get().notify({
        profileId: p.id, kind: 'task_assigned',
        title: 'A task was assigned to you',
        body: get().db.days[get().date]?.find((t) => t.id === taskId)?.title ?? '',
        url: '#/planner', priority: 'normal',
      });
      get().showToast(`Assigned to ${p.name} — push sent`);
    }
  },

  scheduleTask: (taskId, time) => {
    mutateDay(set, get, get().date, (t) => (t.id === taskId ? { ...t, scheduledAt: time } : t));
    get().persist('days', 'Task rescheduled');
  },

  addAdhocTask: (t) => {
    const { date } = get();
    const task: TaskInstance = {
      id: uid('ti'), date, categoryId: 'c-household', zone: 'household',
      role: 'any', estMinutes: 15, done: false, source: 'adhoc', order: 99000, ...t,
    };
    set((s) => ({ db: { ...s.db, days: { ...s.db.days, [date]: [...(s.db.days[date] ?? []), task] } } }));
    get().persist('days', 'Ad-hoc task added');
    get().showToast('Added to today');
  },

  removeTask: (taskId) => {
    const { date } = get();
    set((s) => ({
      db: { ...s.db, days: { ...s.db.days, [date]: (s.db.days[date] ?? []).filter((t) => t.id !== taskId) } },
    }));
    get().persist('days', 'Task removed');
  },

  markAllInGroup: (group, done) => {
    const { date, userId } = get();
    mutateDay(set, get, date, (t) =>
      (t.groupAs || '') === group && !t.off
        ? { ...t, done, doneBy: done ? userId : undefined, doneAt: done ? Date.now() : undefined }
        : t,
    );
    get().persist('days', 'Group ticked');
  },

  /* ============================================================
     The running sheet.

     One sheet per date, edited in place. Nothing here throws: the
     sheet is filled in on a phone in a busy kitchen, so a missing
     row or a stale id is a no-op, and the one rule that really
     matters — never post it with the prayer time or the meals count
     blank — hands back the problems instead of refusing silently.
     ============================================================ */

  ensureSheet: (date) => {
    const existing = get().db.sheets[date];
    if (existing) return existing;
    const sheet = newSheetFor(get().db, date);
    set((s) => ({ db: { ...s.db, sheets: { ...s.db.sheets, [date]: sheet } } }));
    get().persist('sheets', `Started the sheet for ${date}`);
    return sheet;
  },

  patchSheet: (date, changes) => {
    writeSheet(set, get, date, (sheet) => ({ ...sheet, ...changes }));
    get().persist('sheets', 'Sheet updated');
  },

  tickCheck: (date, groupId, itemId) => {
    const { userId } = get();
    writeSheet(set, get, date, (sheet) => ({
      ...sheet,
      checks: sheet.checks.map((g) =>
        g.id !== groupId
          ? g
          : {
              ...g,
              items: g.items.map((i) =>
                i.id !== itemId
                  ? i
                  : {
                      ...i,
                      done: !i.done,
                      doneBy: !i.done ? userId : undefined,
                      doneAt: !i.done ? Date.now() : undefined,
                    },
              ),
            },
      ),
    }));
    get().persist('sheets', 'Check ticked');
  },

  upsertSheetRow: (date, section, row) => {
    const rec = row as { id?: ID; order?: number };
    const existing = get().db.sheets[date];
    const isNew =
      !rec.id || !sectionRows(existing ?? newSheetFor(get().db, date), section).some((r) => r.id === rec.id);
    if (!rec.id) rec.id = uid('sr');
    writeSheet(set, get, date, (sheet) => {
      const list = sectionRows(sheet, section);
      if (list.some((r) => r.id === rec.id)) {
        const edited = list.map((r) => (r.id === rec.id ? (rec as { id: ID; order: number }) : r));
        return withSection(sheet, section, edited);
      }
      // A new row goes on the end unless the caller placed it.
      const added = { ...(rec as { id: ID; order?: number }) };
      if (added.order == null) added.order = list.length + 1;
      return withSection(sheet, section, [...list, added as { id: ID; order: number }]);
    });
    get().persist('sheets', 'Sheet row saved');
    // Only a new row is worth interrupting for — editing one is not.
    if (isNew) get().showToast('Row added');
  },

  removeSheetRow: (date, section, rowId) => {
    writeSheet(set, get, date, (sheet) =>
      withSection(sheet, section, sectionRows(sheet, section).filter((r) => r.id !== rowId)),
    );
    get().persist('sheets', 'Sheet row removed');
    get().showToast('Row removed');
  },

  toggleOrderRow: (date, rowId) => {
    const { userId } = get();
    writeSheet(set, get, date, (sheet) => ({
      ...sheet,
      order: sheet.order.map((r) =>
        r.id !== rowId
          ? r
          : {
              ...r,
              done: !r.done,
              doneBy: !r.done ? userId : undefined,
              doneAt: !r.done ? Date.now() : undefined,
            },
      ),
    }));
    get().persist('sheets', 'Order of the day ticked');
  },

  startBreak: (date) => {
    writeSheet(set, get, date, (sheet) => ({
      ...sheet,
      breaks: [...sheet.breaks, { id: uid('br'), startedAt: Date.now(), waterServed: false }],
    }));
    get().persist('sheets', 'Break started');
    get().showToast('Break started — water round to everyone');
  },

  endBreak: (date, breakId, waterServed) => {
    const { userId } = get();
    writeSheet(set, get, date, (sheet) => ({
      ...sheet,
      breaks: sheet.breaks.map((b) =>
        b.id !== breakId
          ? b
          : { ...b, endedAt: Date.now(), waterServed, servedBy: waterServed ? userId : b.servedBy },
      ),
    }));
    get().persist('sheets', 'Break ended');
    get().showToast(
      waterServed ? 'Break ended — water served' : 'Break ended, water not served. Tell Earl.',
    );
  },

  logToiletCheck: (date, clean, restocked, notes) => {
    const { userId } = get();
    writeSheet(set, get, date, (sheet) => ({
      ...sheet,
      toiletChecks: [
        ...sheet.toiletChecks,
        { id: uid('tc'), at: Date.now(), by: userId, clean, restocked, notes },
      ],
    }));
    get().persist('sheets', 'Guest toilet checked');
    get().showToast(clean ? 'Logged — next check in 20 minutes' : 'Logged as not clean — sort it now');
  },

  logDivo: (action, oilLevel, notes) => {
    const { userId } = get();
    const entry: DivoLog = { id: uid('dv'), at: Date.now(), by: userId, action, oilLevel, notes };
    set((s) => ({ db: { ...s.db, divoLog: [entry, ...s.db.divoLog] } }));
    get().persist('divoLog', `Divo ${action}`);
    get().showToast(`Divo ${action}`);

    // Low or empty is the whole reason the shopping list keeps two spare.
    if (oilLevel === 'low' || oilLevel === 'empty') {
      get().notify({
        profileId: 'p-earl', kind: 'stock_low',
        title: `Divo oil is ${oilLevel}`,
        body: 'Keep 2 spare bottles. Marvin buys it first thing.',
        url: '#/shrine', priority: oilLevel === 'empty' ? 'high' : 'normal',
      });
    }
  },

  postSheet: (date, preparedBy) => {
    const sheet = get().db.sheets[date];
    const problems: string[] = [];
    if (!sheet) {
      problems.push('There is no sheet for this day yet.');
    } else {
      if (!sheet.prayersStart) problems.push('The prayer start time is blank.');
      if (sheet.meals == null || sheet.meals <= 0) problems.push('The number of meals is blank.');
    }
    if (!preparedBy.trim()) problems.push('Nobody is named as having prepared it.');
    if (problems.length) {
      get().showToast(`Not sent — ${problems[0]}`);
      return { ok: false, problems };
    }

    const now = Date.now();
    const checkedBy = get().db.settings.checkedByName;
    writeSheet(set, get, date, (s) => ({
      ...s,
      status: 'posted',
      preparedBy: preparedBy.trim(),
      preparedAt: s.preparedAt ?? now,
      checkedBy: s.checkedBy ?? checkedBy,
      checkedAt: s.checkedAt ?? now,
      postedAt: now,
    }));
    get().persist('sheets', `Sheet posted for ${date}`);
    get().showToast(`Posted to the ${get().db.settings.whatsappGroup} group`);
    return { ok: true, problems: [] };
  },

  checkSheet: (date, by) => {
    const name = nameOf(get().db.profiles, by);
    writeSheet(set, get, date, (s) =>
      s.status === 'draft' ? { ...s, status: 'checked', checkedBy: name, checkedAt: Date.now() } : s,
    );
    get().persist('sheets', 'Sheet checked');
    get().showToast(`Checked by ${name}`);
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
    get().persist('profiles', 'Password set');
    return res;
  },

  /* ---------- generic record editing ---------- */

  upsert: (slice, record, label) => {
    const rec = record as { id?: ID };
    if (!rec.id) rec.id = uid();
    set((s) => {
      const list = (s.db[slice] as unknown as { id: ID }[]) ?? [];
      const exists = list.some((x) => x.id === rec.id);
      const next = exists ? list.map((x) => (x.id === rec.id ? (rec as { id: ID }) : x)) : [...list, rec as { id: ID }];
      return { db: { ...s.db, [slice]: next } as DB };
    });
    get().persist(String(slice), label ?? 'Saved');
    get().showToast(label ?? 'Saved');
  },

  remove: (slice, id, label) => {
    set((s) => {
      const list = (s.db[slice] as unknown as { id: ID }[]) ?? [];
      return { db: { ...s.db, [slice]: list.filter((x) => x.id !== id) } as DB };
    });
    get().persist(String(slice), label ?? 'Deleted');
    get().showToast(label ?? 'Deleted');
  },

  patch: (slice, id, changes, label) => {
    set((s) => {
      const list = (s.db[slice] as unknown as { id: ID }[]) ?? [];
      return {
        db: { ...s.db, [slice]: list.map((x) => (x.id === id ? { ...x, ...changes } : x)) } as DB,
      };
    });
    get().persist(String(slice), label ?? 'Updated');
  },

  /* ---------- behaviour ---------- */

  raiseIssue: (i) => {
    const id = uid('is');
    const issue: Issue = {
      id, kind: 'fault', detail: '',
      priority: 'normal', status: 'reported',
      reportedBy: get().userId, reportedAt: Date.now(),
      photos: [], comments: [], ...i,
    };
    set((s) => ({ db: { ...s.db, issues: [issue, ...s.db.issues] } }));
    get().persist('issues', 'Issue raised');

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
    get().showToast('Reported — the manager has been notified');
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

  commentOnIssue: (id, text) => {
    const { userId } = get();
    set((s) => ({
      db: {
        ...s.db,
        issues: s.db.issues.map((i) =>
          i.id === id ? { ...i, comments: [...i.comments, { id: uid('ic'), by: userId, at: Date.now(), text }] } : i,
        ),
      },
    }));
    get().persist('issues', 'Comment added');
    const issue = get().db.issues.find((x) => x.id === id);
    if (issue && issue.reportedBy !== userId) {
      get().notify({
        profileId: issue.reportedBy, kind: 'issue_update',
        title: 'New comment on your report', body: text.slice(0, 90),
        url: `#/issues/${id}`, priority: 'normal',
      });
    }
  },

  adjustStock: (itemId, delta, reason) => {
    const { userId, db } = get();
    const item = db.inventory.find((i) => i.id === itemId);
    if (!item) return;
    const nextQty = Math.max(0, Math.round((item.qty + delta) * 100) / 100);
    set((s) => ({
      db: {
        ...s.db,
        inventory: s.db.inventory.map((i) => (i.id === itemId ? { ...i, qty: nextQty } : i)),
        movements: [
          ...s.db.movements,
          { id: uid('mv'), itemId, delta, reason, by: userId, at: Date.now() },
        ],
      },
    }));
    get().persist('inventory', `${item.name} ${delta > 0 ? '+' : ''}${delta}`);

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
    get().persist('notifications', 'Push queued');
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
    get().persist('notifications', 'Marked read');
  },
}));

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

/* ---------- the running sheet ---------- */

/**
 * A fresh sheet for a date, with the occasion line already filled in
 * from whichever observance is running — that line is the first thing
 * anyone reads, and nobody should have to count the days by hand.
 */
function newSheetFor(db: DB, date: DateStr): RunningSheet {
  const obs = db.observances.find((o) => o.active && date >= o.startDate && date <= o.endDate);
  const sheet = blankSheet(date, obs ? occasionFor(obs, date) : '');
  return obs ? { ...sheet, occasionDayNo: observanceDayNo(obs, date) } : sheet;
}

/** Editing a day that has no sheet yet creates one rather than failing. */
function writeSheet(
  set: (fn: (s: Store) => Partial<Store>) => void,
  get: () => Store,
  date: DateStr,
  fn: (sheet: RunningSheet) => RunningSheet,
) {
  const current = get().db.sheets[date] ?? newSheetFor(get().db, date);
  const next = fn(current);
  set((s) => ({ db: { ...s.db, sheets: { ...s.db.sheets, [date]: next } } }));
}

/* The five editable tables all carry an id and an order, so the row
   editors are written once against that shape rather than five times. */

function sectionRows(sheet: RunningSheet, section: SheetSection): { id: ID; order: number }[] {
  return sheet[section] as unknown as { id: ID; order: number }[];
}

function withSection(sheet: RunningSheet, section: SheetSection, rows: { id: ID; order: number }[]): RunningSheet {
  switch (section) {
    case 'roster':
      return { ...sheet, roster: rows as unknown as RunningSheet['roster'] };
    case 'order':
      return { ...sheet, order: rows as unknown as RunningSheet['order'] };
    case 'menu':
      return { ...sheet, menu: rows as unknown as RunningSheet['menu'] };
    case 'shopping':
      return { ...sheet, shopping: rows as unknown as RunningSheet['shopping'] };
    default:
      return { ...sheet, sheetGuests: rows as unknown as RunningSheet['sheetGuests'] };
  }
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

/* ---------- the current user, and what they may do ---------- */

export function useUser(): Profile {
  const userId = useStore((s) => s.userId);
  const profiles = useStore((s) => s.db.profiles);
  return profiles.find((p) => p.id === userId) ?? profiles[0]!;
}

export type Capability =
  | 'seeAll'
  | 'seeOperationalMoney'
  | 'seeAllMoney'
  | 'seeStaffRecords'
  | 'seeOwnStaffRecord'
  | 'editStructure'
  | 'doTasks'
  | 'approveMeals'
  | 'raiseIssues'
  | 'logTraffic'
  | 'seeCredentials'
  | 'seeReports'
  | 'seeAudit';

const CAPS: Record<Role, Capability[]> = {
  owner: ['seeAll', 'seeAllMoney', 'seeOperationalMoney', 'seeStaffRecords', 'editStructure', 'doTasks', 'approveMeals', 'raiseIssues', 'logTraffic', 'seeCredentials', 'seeReports', 'seeAudit'],
  manager: ['seeAll', 'seeOperationalMoney', 'editStructure', 'doTasks', 'approveMeals', 'raiseIssues', 'logTraffic', 'seeCredentials', 'seeReports', 'seeAudit'],
  staff: ['doTasks', 'raiseIssues', 'logTraffic', 'seeOwnStaffRecord'],
  family: ['raiseIssues'],
  requester: ['raiseIssues'],
};

export function can(role: Role, cap: Capability): boolean {
  return CAPS[role].includes(cap);
}

export function useCan(cap: Capability): boolean {
  const user = useUser();
  return can(user.role, cap);
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

    // Rosie runs high, Reza settles in over the period, Marvin is short-listed.
    const rate = (staffId?: string, i = 0) => {
      const base =
        staffId === 'p-rosie' ? 0.95
        : staffId === 'p-reza' ? 0.86 + Math.min(0.09, (21 - back) * 0.005)
        : staffId === 'p-marvin' ? 0.98
        : 0.7;
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
