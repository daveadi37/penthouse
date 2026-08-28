import React from 'react';
import { useStore, useUser } from '@/store';
import { navigate, useRoute } from '@/lib/router';
import { addDays, daysUntil, fmt, fmtShort, fmtTime12, today as todayStr } from '@/lib/date';
import { plural } from '@/lib/format';
import { dueDateFor, offsetLabel, sortByOffset } from '@/lib/schedule';
import { activeVacation, areaName, occasionPct, profileName } from '@/lib/selectors';
import { STAFF_ROLES } from '@/types';
import type { Guest, HouseEvent, OccasionTask, TaskOffset } from '@/types';
import {
  Bar,
  Btn,
  Card,
  Chip,
  Empty,
  Field,
  Group,
  IconBtn,
  List,
  PageHead,
  Row,
  SectionHead,
  Seg,
  Select,
  Sheet,
  Stat,
  Text,
  ZoneChip,
  cx,
} from '@/components/ui';

type Tab = 'guests' | 'events' | 'vacation' | 'templates';

export function Occasions() {
  const route = useRoute();
  const tab = (route.sub as Tab) ?? 'guests';
  const db = useStore((s) => s.db);
  const openSheet = useStore((s) => s.openSheet);

  if (route.id && tab === 'guests') return <GuestDetail id={route.id} />;
  if (route.id && tab === 'events') return <EventDetail id={route.id} />;

  return (
    <>
      <PageHead
        eyebrow="Guests &amp; events"
        title="Occasions"
        sub="Every guest and every event owns its own task list, scheduled on real offsets — two days before arrival, thirty minutes before service."
        tools={
          <>
            {tab === 'guests' && <Btn size="sm" onClick={() => openSheet('guest-new')}>New guest</Btn>}
            {tab === 'events' && <Btn size="sm" onClick={() => openSheet('event-new')}>New event</Btn>}
          </>
        }
      />

      <div className="grid four" style={{ marginBottom: 16 }}>
        <Stat label="Guests coming" value={db.guests.filter((g) => g.departure >= todayStr() && g.status !== 'cancelled').length} />
        <Stat label="Events booked" value={db.events.filter((e) => e.date >= todayStr() && e.status !== 'cancelled').length} />
        <Stat label="Vacation planned" value={activeVacation(db) ? `${daysUntil(activeVacation(db)!.depart)}d` : '—'} foot={<span className="muted" style={{ fontSize: 12.5 }}>until departure</span>} onClick={() => navigate('occasions', 'vacation')} />
        <Stat label="Templates" value={db.templates.length} onClick={() => navigate('occasions', 'templates')} />
      </div>

      <div className="row wrap" style={{ gap: 8, marginBottom: 14 }}>
        <Seg
          value={tab}
          onChange={(v) => navigate('occasions', v)}
          options={[
            { value: 'guests', label: 'Guests' },
            { value: 'events', label: 'Events' },
            { value: 'vacation', label: 'Vacation mode' },
            { value: 'templates', label: 'Templates' },
          ]}
        />
      </div>

      {tab === 'guests' && <GuestList />}
      {tab === 'events' && <EventList />}
      {tab === 'vacation' && <VacationMode />}
      {tab === 'templates' && <Templates />}
    </>
  );
}

function GuestList() {
  const db = useStore((s) => s.db);
  const list = db.guests.slice().sort((a, b) => a.arrival.localeCompare(b.arrival));
  return (
    <List>
      {list.map((g) => {
        const pct = occasionPct(g.tasks);
        const d = daysUntil(g.arrival);
        return (
          <Row
            key={g.id}
            title={g.name}
            sub={`${fmt(g.arrival)} at ${fmtTime12(g.arrivalTime)} → ${fmtShort(g.departure)} · ${areaName(db, g.areaId)}${g.dietary ? ` · ${g.dietary}` : ''}`}
            zone="household"
            right={
              <>
                <Chip tone={d < 0 ? 'plain' : d <= 2 ? 'low' : 'info'}>
                  {d < 0 ? 'Past' : d === 0 ? 'Today' : `in ${d}d`}
                </Chip>
                <Chip tone={pct >= 80 ? 'ok' : pct >= 40 ? 'low' : 'urgent'}>{pct}% ready</Chip>
              </>
            }
            onClick={() => navigate('occasions', 'guests', g.id)}
          />
        );
      })}
      {!list.length && <Row title="No guests" />}
    </List>
  );
}

function EventList() {
  const db = useStore((s) => s.db);
  const list = db.events.slice().sort((a, b) => a.date.localeCompare(b.date));
  return (
    <List>
      {list.map((e) => {
        const pct = occasionPct(e.tasks);
        const d = daysUntil(e.date);
        return (
          <Row
            key={e.id}
            title={e.name}
            sub={`${fmt(e.date)} · ${fmtTime12(e.start)}–${fmtTime12(e.end)} · ${areaName(db, e.areaId)} · ${plural(e.headcount, 'person', 'people')}`}
            zone={e.zone}
            right={
              <>
                <Chip tone={d < 0 ? 'plain' : d <= 2 ? 'low' : 'info'}>{d < 0 ? 'Past' : d === 0 ? 'Today' : `in ${d}d`}</Chip>
                <Chip tone={pct >= 80 ? 'ok' : pct >= 40 ? 'low' : 'urgent'}>{pct}% ready</Chip>
              </>
            }
            onClick={() => navigate('occasions', 'events', e.id)}
          />
        );
      })}
      {!list.length && <Row title="No events" />}
    </List>
  );
}

/* ---------- shared task list renderer ---------- */

function OccasionTasks({
  tasks,
  anchor,
  onToggle,
  onEdit,
  onDelete,
  onAdd,
}: {
  tasks: OccasionTask[];
  anchor: string;
  onToggle: (id: string) => void;
  onEdit?: (id: string) => void;
  onDelete?: (id: string) => void;
  onAdd?: () => void;
}) {
  const user = useUser();
  const canEdit = user.role === 'owner' || user.role === 'manager';
  const sorted = sortByOffset(tasks);
  const byDate = new Map<string, OccasionTask[]>();
  sorted.forEach((t) => {
    const d = dueDateFor(t.offset, anchor);
    const arr = byDate.get(d) ?? [];
    arr.push(t);
    byDate.set(d, arr);
  });

  return (
    <>
      <SectionHead
        title={`Task list · ${tasks.filter((t) => t.done).length} of ${tasks.length} done`}
        sub="Each one lands on the day its offset falls due, and appears in that day's checklist automatically."
        action={canEdit && onAdd ? <Btn size="xs" variant="ghost" onClick={onAdd}>Add a task</Btn> : undefined}
      />
      {[...byDate.entries()].map(([date, list]) => (
        <Group
          key={date}
          name={fmt(date)}
          meta={date === todayStr() ? 'Today' : daysUntil(date) < 0 ? `${Math.abs(daysUntil(date))} days ago` : `in ${daysUntil(date)} days`}
          count={<Chip tone={list.every((t) => t.done) ? 'ok' : 'plain'}>{list.filter((t) => t.done).length}/{list.length}</Chip>}
          defaultOpen={date === todayStr() || daysUntil(date) <= 2}
        >
          {list.map((t) => (
            <div key={t.id} className={cx('task', t.done && 'done')}>
              <button type="button" className="box" onClick={() => onToggle(t.id)} aria-label="Toggle">✓</button>
              <span className="tx">
                {t.text}
                <span className="meta">
                  <span>{offsetLabel(t.offset)}</span>
                  <span>{t.estMinutes}m</span>
                  <Chip tone="plain">{t.role}</Chip>
                  {t.done && t.doneBy && <Chip tone="ok">by {profileName(useStore.getState().db, t.doneBy)}</Chip>}
                </span>
              </span>
              {canEdit && onEdit && <IconBtn label="Edit" onClick={() => onEdit(t.id)}>✎</IconBtn>}
              {canEdit && onDelete && <IconBtn label="Delete" onClick={() => onDelete(t.id)}>✕</IconBtn>}
            </div>
          ))}
        </Group>
      ))}
      {!tasks.length && <Empty title="No tasks yet">Apply a template, or add them one at a time.</Empty>}
    </>
  );
}

function GuestDetail({ id }: { id: string }) {
  const db = useStore((s) => s.db);
  const user = useUser();
  const patch = useStore((s) => s.patch);
  const remove = useStore((s) => s.remove);
  const openSheet = useStore((s) => s.openSheet);
  const g = db.guests.find((x) => x.id === id);
  if (!g) return <Empty title="No such guest" />;
  const canEdit = user.role === 'owner' || user.role === 'manager';

  const toggle = (tid: string) =>
    patch('guests', g.id, {
      tasks: g.tasks.map((t) => (t.id === tid ? { ...t, done: !t.done, doneBy: !t.done ? user.id : undefined, doneAt: !t.done ? Date.now() : undefined } : t)),
    }, 'Task updated');

  return (
    <>
      <PageHead
        eyebrow={`Guest · arriving ${fmt(g.arrival)}`}
        title={g.name}
        sub={`${areaName(db, g.areaId)} · ${fmtTime12(g.arrivalTime)} → ${fmt(g.departure)}`}
        tools={
          <>
            <Btn size="sm" variant="ghost" onClick={() => navigate('occasions', 'guests')}>‹ Guests</Btn>
            {canEdit && <Btn size="sm" variant="ghost" onClick={() => openSheet('guest-edit', g.id)}>Edit</Btn>}
            {canEdit && <Btn size="sm" variant="danger" onClick={() => { remove('guests', g.id, 'Guest removed'); navigate('occasions', 'guests'); }}>Delete</Btn>}
          </>
        }
      />

      <div className="row wrap" style={{ gap: 7, marginBottom: 14 }}>
        <ZoneChip zone="household" full />
        <Chip tone={g.status === 'active' ? 'info' : 'plain'}>{g.status}</Chip>
        <Chip tone={occasionPct(g.tasks) >= 80 ? 'ok' : 'low'}>{occasionPct(g.tasks)}% prepared</Chip>
      </div>

      <Card style={{ marginBottom: 16 }}>
        <div className="between wrap" style={{ marginBottom: 10 }}>
          <div className="eyebrow">Preparation</div>
          <span className="tnum muted" style={{ fontSize: 13 }}>
            {g.tasks.filter((t) => t.done).length} of {g.tasks.length}
          </span>
        </div>
        <Bar pct={occasionPct(g.tasks)} tone={occasionPct(g.tasks) >= 80 ? 'ok' : undefined} />
        {(g.notes || g.dietary) && (
          <div style={{ marginTop: 14 }}>
            {g.notes && (
              <>
                <div className="eyebrow">Notes</div>
                <div style={{ fontSize: 14.5, marginTop: 3 }}>{g.notes}</div>
              </>
            )}
            {g.dietary && (
              <div style={{ marginTop: 10 }}>
                <div className="eyebrow">Dietary</div>
                <div style={{ fontSize: 14.5, marginTop: 3 }}>{g.dietary}</div>
              </div>
            )}
          </div>
        )}
      </Card>

      <OccasionTasks
        tasks={g.tasks}
        anchor={g.arrival}
        onToggle={toggle}
        onAdd={canEdit ? () => openSheet('otask-new', `guest:${g.id}`) : undefined}
        onDelete={canEdit ? (tid) => patch('guests', g.id, { tasks: g.tasks.filter((t) => t.id !== tid) }, 'Task removed') : undefined}
      />
    </>
  );
}

function EventDetail({ id }: { id: string }) {
  const db = useStore((s) => s.db);
  const user = useUser();
  const patch = useStore((s) => s.patch);
  const remove = useStore((s) => s.remove);
  const openSheet = useStore((s) => s.openSheet);
  const e = db.events.find((x) => x.id === id);
  if (!e) return <Empty title="No such event" />;
  const canEdit = user.role === 'owner' || user.role === 'manager';

  const toggle = (tid: string) =>
    patch('events', e.id, {
      tasks: e.tasks.map((t) => (t.id === tid ? { ...t, done: !t.done, doneBy: !t.done ? user.id : undefined, doneAt: !t.done ? Date.now() : undefined } : t)),
    }, 'Task updated');

  return (
    <>
      <PageHead
        eyebrow={`Event · ${fmt(e.date)}`}
        title={e.name}
        sub={`${fmtTime12(e.start)}–${fmtTime12(e.end)} · ${areaName(db, e.areaId)} · ${plural(e.headcount, 'person', 'people')}`}
        tools={
          <>
            <Btn size="sm" variant="ghost" onClick={() => navigate('occasions', 'events')}>‹ Events</Btn>
            {canEdit && <Btn size="sm" variant="ghost" onClick={() => openSheet('event-edit', e.id)}>Edit</Btn>}
            {canEdit && <Btn size="sm" variant="danger" onClick={() => { remove('events', e.id, 'Event removed'); navigate('occasions', 'events'); }}>Delete</Btn>}
          </>
        }
      />

      <div className="row wrap" style={{ gap: 7, marginBottom: 14 }}>
        <ZoneChip zone={e.zone} full />
        <Chip tone={e.status === 'active' ? 'info' : 'plain'}>{e.status}</Chip>
        <Chip tone={occasionPct(e.tasks) >= 80 ? 'ok' : 'low'}>{occasionPct(e.tasks)}% prepared</Chip>
      </div>

      <Card style={{ marginBottom: 16 }}>
        <Bar pct={occasionPct(e.tasks)} tone={occasionPct(e.tasks) >= 80 ? 'ok' : undefined} />
        {e.notes && (
          <div style={{ marginTop: 14 }}>
            <div className="eyebrow">Notes</div>
            <div style={{ fontSize: 14.5, marginTop: 3 }}>{e.notes}</div>
          </div>
        )}
      </Card>

      <OccasionTasks
        tasks={e.tasks}
        anchor={e.date}
        onToggle={toggle}
        onAdd={canEdit ? () => openSheet('otask-new', `event:${e.id}`) : undefined}
        onDelete={canEdit ? (tid) => patch('events', e.id, { tasks: e.tasks.filter((t) => t.id !== tid) }, 'Task removed') : undefined}
      />
    </>
  );
}

function VacationMode() {
  const db = useStore((s) => s.db);
  const user = useUser();
  const patch = useStore((s) => s.patch);
  const v = activeVacation(db);
  if (!v) return <Empty title="No vacation planned">Add one from Settings, or when a trip is booked.</Empty>;

  const phase = daysUntil(v.depart) > 0 ? 'before' : daysUntil(v.return) >= 0 ? 'during' : 'after';
  const toggle = (group: 'preTasks' | 'duringTasks' | 'postTasks', tid: string) =>
    patch('vacations', v.id, {
      [group]: v[group].map((t) => (t.id === tid ? { ...t, done: !t.done, doneBy: !t.done ? user.id : undefined, doneAt: !t.done ? Date.now() : undefined } : t)),
    }, 'Task updated');

  const sections: [string, 'preTasks' | 'duringTasks' | 'postTasks', string, string][] = [
    ['Before departure', 'preTasks', v.depart, 'The house is left secure and stable.'],
    ['While away', 'duringTasks', v.depart, 'Run on every visit. Closed rooms get stuffy — air them each time.'],
    ['Before return', 'postTasks', v.return, 'The house should feel lived-in again, not merely clean.'],
  ];

  return (
    <>
      <Card style={{ marginBottom: 16 }}>
        <div className="between wrap">
          <div className="grow">
            <div className="eyebrow">
              {phase === 'before' ? `Departing in ${daysUntil(v.depart)} days` : phase === 'during' ? 'Family away' : 'Returned'}
            </div>
            <div className="serif" style={{ fontSize: 22, marginTop: 4 }}>
              {fmt(v.depart)} → {fmt(v.return)}
            </div>
            <div className="muted" style={{ fontSize: 14, marginTop: 5 }}>{v.notes}</div>
          </div>
          <Chip tone={phase === 'during' ? 'info' : 'plain'}>{v.status}</Chip>
        </div>
      </Card>

      {sections.map(([label, key, anchor, sub]) => (
        <div key={key} style={{ marginBottom: 18 }}>
          <SectionHead title={label} sub={sub} />
          <List>
            {v[key].map((t) => (
              <div key={t.id} className={cx('task', t.done && 'done')}>
                <button type="button" className="box" onClick={() => toggle(key, t.id)} aria-label="Toggle">✓</button>
                <span className="tx">
                  {t.text}
                  <span className="meta">
                    <span>{key === 'duringTasks' ? 'Every visit' : `${offsetLabel(t.offset)} ${key === 'preTasks' ? 'departure' : 'return'}`}</span>
                    <span>{t.estMinutes}m</span>
                  </span>
                </span>
              </div>
            ))}
          </List>
          <div className="muted tnum" style={{ fontSize: 12.5, marginTop: 6 }}>
            {v[key].filter((t) => t.done).length} of {v[key].length} · anchored to {fmtShort(anchor)}
          </div>
        </div>
      ))}
    </>
  );
}

function Templates() {
  const db = useStore((s) => s.db);
  return (
    <>
      <SectionHead
        title="Reusable task sets"
        sub="Applied to a new guest or event so nobody rebuilds an eighteen-step list from memory."
      />
      {db.templates.map((t) => (
        <Group
          key={t.id}
          name={t.name}
          meta={`${t.kind} · ${plural(t.tasks.length, 'task')}`}
          count={<Chip tone="plain">{t.kind}</Chip>}
        >
          {sortByOffset(t.tasks as unknown as OccasionTask[]).map((x) => (
            <Row key={x.id} title={x.text} sub={`${offsetLabel(x.offset)} · ${x.estMinutes}m · ${x.role}`} caret={false} />
          ))}
        </Group>
      ))}
    </>
  );
}

/* ---------- sheets ---------- */

export function GuestSheet({ id }: { id?: string }) {
  const db = useStore((s) => s.db);
  const closeSheet = useStore((s) => s.closeSheet);
  const upsert = useStore((s) => s.upsert);
  const existing = id ? db.guests.find((g) => g.id === id) : undefined;
  const [templateId, setTemplateId] = React.useState(db.templates.find((t) => t.kind === 'guest')?.id ?? '');
  const [f, setF] = React.useState<Guest>(
    existing ?? {
      id: '', name: '', arrival: addDays(todayStr(), 7), arrivalTime: '18:00', departure: addDays(todayStr(), 10),
      areaId: db.areas.find((a) => a.status === 'guest')?.id, notes: '', dietary: '', status: 'planned', tasks: [],
    } as Guest,
  );
  const set = (k: keyof Guest, v: unknown) => setF((p) => ({ ...p, [k]: v }));

  return (
    <Sheet
      title={existing ? existing.name : 'New guest'}
      sub="Preparation begins 48 hours out. Applying a template sets the whole list on its offsets."
      onClose={closeSheet}
      footer={
        <>
          <Btn
            className="grow"
            disabled={!f.name}
            onClick={() => {
              let tasks = f.tasks;
              if (!existing && templateId) {
                const tpl = db.templates.find((t) => t.id === templateId);
                tasks = (tpl?.tasks ?? []).map((t) => ({ ...t, id: `${t.id}-${Date.now()}`, done: false }));
              }
              upsert('guests', { ...f, tasks }, 'Guest saved');
              closeSheet();
            }}
          >
            Save
          </Btn>
          <Btn variant="ghost" onClick={closeSheet}>Cancel</Btn>
        </>
      }
    >
      <Field label="Name"><Text value={f.name} onChange={(v) => set('name', v)} autoFocus /></Field>
      <div className="three-col">
        <Field label="Arrives"><Text type="date" value={f.arrival} onChange={(v) => set('arrival', v)} /></Field>
        <Field label="At"><Text type="time" value={f.arrivalTime} onChange={(v) => set('arrivalTime', v)} /></Field>
        <Field label="Departs"><Text type="date" value={f.departure} onChange={(v) => set('departure', v)} /></Field>
      </div>
      <div className="two">
        <Field label="Room">
          <Select value={f.areaId ?? ''} onChange={(v) => set('areaId', v || undefined)} options={[{ value: '', label: '—' }, ...db.areas.filter((a) => a.type === 'bedroom').map((a) => ({ value: a.id, label: a.name }))]} />
        </Field>
        <Field label="Status">
          <Select value={f.status} onChange={(v) => set('status', v)} options={[{ value: 'planned', label: 'Planned' }, { value: 'active', label: 'Active' }, { value: 'complete', label: 'Complete' }, { value: 'cancelled', label: 'Cancelled' }]} />
        </Field>
      </div>
      {!existing && (
        <Field label="Apply a template" hint="Sets the full offset-scheduled list in one step.">
          <Select
            value={templateId}
            onChange={setTemplateId}
            options={[{ value: '', label: 'Start empty' }, ...db.templates.filter((t) => t.kind === 'guest').map((t) => ({ value: t.id, label: `${t.name} · ${t.tasks.length} tasks` }))]}
          />
        </Field>
      )}
      <Field label="Notes" hint="Preferences, arrival details, anything the staff need to know.">
        <textarea className="in" rows={2} value={f.notes} onChange={(e) => set('notes', e.target.value)} />
      </Field>
      <Field label="Dietary"><Text value={f.dietary} onChange={(v) => set('dietary', v)} /></Field>
    </Sheet>
  );
}

export function EventSheet({ id }: { id?: string }) {
  const db = useStore((s) => s.db);
  const closeSheet = useStore((s) => s.closeSheet);
  const upsert = useStore((s) => s.upsert);
  const existing = id ? db.events.find((e) => e.id === id) : undefined;
  const [templateId, setTemplateId] = React.useState('');
  const [f, setF] = React.useState<HouseEvent>(
    existing ?? {
      id: '', name: '', date: addDays(todayStr(), 7), start: '19:00', end: '22:00',
      zone: 'household', headcount: 8, notes: '', status: 'planned', tasks: [],
    } as HouseEvent,
  );
  const set = (k: keyof HouseEvent, v: unknown) => setF((p) => ({ ...p, [k]: v }));

  return (
    <Sheet
      title={existing ? existing.name : 'New event'}
      sub="A dinner, a birthday or a day of the observance — the same offset engine runs all of them."
      onClose={closeSheet}
      footer={
        <>
          <Btn
            className="grow"
            disabled={!f.name}
            onClick={() => {
              let tasks = f.tasks;
              if (!existing && templateId) {
                const tpl = db.templates.find((t) => t.id === templateId);
                tasks = (tpl?.tasks ?? []).map((t) => ({ ...t, id: `${t.id}-${Date.now()}`, done: false }));
              }
              upsert('events', { ...f, tasks }, 'Event saved');
              closeSheet();
            }}
          >
            Save
          </Btn>
          <Btn variant="ghost" onClick={closeSheet}>Cancel</Btn>
        </>
      }
    >
      <Field label="Name"><Text value={f.name} onChange={(v) => set('name', v)} autoFocus /></Field>
      <div className="three-col">
        <Field label="Date"><Text type="date" value={f.date} onChange={(v) => set('date', v)} /></Field>
        <Field label="From"><Text type="time" value={f.start} onChange={(v) => set('start', v)} /></Field>
        <Field label="To"><Text type="time" value={f.end} onChange={(v) => set('end', v)} /></Field>
      </div>
      <div className="three-col">
        <Field label="Where">
          <Select value={f.areaId ?? ''} onChange={(v) => set('areaId', v || undefined)} options={[{ value: '', label: '—' }, ...db.areas.filter((a) => a.active).map((a) => ({ value: a.id, label: a.name }))]} />
        </Field>
        <Field label="How many"><Text type="number" value={String(f.headcount)} onChange={(v) => set('headcount', Number(v))} /></Field>
      </div>
      {!existing && (
        <Field label="Apply a template">
          <Select
            value={templateId}
            onChange={setTemplateId}
            options={[{ value: '', label: 'Start empty' }, ...db.templates.filter((t) => t.kind === 'event').map((t) => ({ value: t.id, label: `${t.name} · ${t.tasks.length} tasks` }))]}
          />
        </Field>
      )}
      <Field label="Notes"><textarea className="in" rows={3} value={f.notes} onChange={(e) => set('notes', e.target.value)} /></Field>
    </Sheet>
  );
}

export function OccasionTaskSheet({ ref_ }: { ref_: string }) {
  const db = useStore((s) => s.db);
  const closeSheet = useStore((s) => s.closeSheet);
  const patch = useStore((s) => s.patch);
  const [kind, parentId] = ref_.split(':');
  const [f, setF] = React.useState<{ text: string; n: number; unit: TaskOffset['unit']; dir: TaskOffset['dir']; role: OccasionTask['role']; estMinutes: number }>({
    text: '', n: 0, unit: 'days', dir: 'before', role: 'housekeeping', estMinutes: 15,
  });

  const save = () => {
    const task: OccasionTask = {
      id: `ot${Date.now()}`,
      text: f.text,
      offset: { n: f.n, unit: f.unit, dir: f.dir },
      role: f.role,
      estMinutes: f.estMinutes,
      done: false,
      order: 999,
    };
    if (kind === 'guest') {
      const g = db.guests.find((x) => x.id === parentId);
      if (g) patch('guests', g.id, { tasks: [...g.tasks, task] }, 'Task added');
    } else {
      const e = db.events.find((x) => x.id === parentId);
      if (e) patch('events', e.id, { tasks: [...e.tasks, task] }, 'Task added');
    }
    closeSheet();
  };

  return (
    <Sheet
      title="Add a task"
      sub="Offsets are relative to the arrival or the start — the day builder places it for you."
      onClose={closeSheet}
      footer={
        <>
          <Btn className="grow" disabled={!f.text} onClick={save}>Add</Btn>
          <Btn variant="ghost" onClick={closeSheet}>Cancel</Btn>
        </>
      }
    >
      <Field label="What needs doing"><Text value={f.text} onChange={(v) => setF({ ...f, text: v })} autoFocus /></Field>
      <div className="three-col">
        <Field label="How long before or after"><Text type="number" value={String(f.n)} onChange={(v) => setF({ ...f, n: Number(v) })} /></Field>
        <Field label="Unit">
          <Select value={f.unit} onChange={(v) => setF({ ...f, unit: v })} options={[{ value: 'days', label: 'days' }, { value: 'hours', label: 'hours' }, { value: 'minutes', label: 'minutes' }]} />
        </Field>
        <Field label="Before or after">
          <Select value={f.dir} onChange={(v) => setF({ ...f, dir: v })} options={[{ value: 'before', label: 'before' }, { value: 'after', label: 'after' }]} />
        </Field>
      </div>
      <div className="two">
        <Field label="Which role">
          <Select
            value={f.role}
            onChange={(v) => setF({ ...f, role: v })}
            options={STAFF_ROLES.map((r) => ({ value: r, label: r }))}
          />
        </Field>
        <Field label="Minutes"><Text type="number" value={String(f.estMinutes)} onChange={(v) => setF({ ...f, estMinutes: Number(v) })} /></Field>
      </div>
      <div className="muted" style={{ fontSize: 13 }}>
        This will land {offsetLabel({ n: f.n, unit: f.unit, dir: f.dir }).toLowerCase()}.
      </div>
    </Sheet>
  );
}
