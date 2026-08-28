import React from 'react';
import {useStore, useUser} from '@/store';
import {DOW_SHORT, addDays, durationLabel, fmt, fmtShort, fmtTime12, fromMinutes, today as todayStr, toMinutes, weekStart} from '@/lib/date';
import {plural} from '@/lib/format';
import {isAbsent, isWorking, progress} from '@/lib/schedule';
import {staffList} from '@/lib/selectors';
import type { Appointment, ID, TaskInstance, Zone } from '@/types';
import {Avatar, Btn, Card, Chip, DateNav, Empty, Field, List, PageHead, Row, SectionHead, Select, Seg, Sheet, Text, ZoneChip, cx} from '@/components/ui';

/* ============================================================
   The daily planner.

   Tasks stop being a list for today and become blocks at a time.
   Two fields carry the whole module: `scheduledAt` on the instance
   and `estMinutes` from the library.
   ============================================================ */

const PX_PER_MIN = 1.0;

type Block =
  | { kind: 'task'; id: ID; start: number; mins: number; title: string; zone: Zone; done: boolean; task: TaskInstance }
  | { kind: 'appt'; id: ID; start: number; mins: number; title: string; zone: Zone; appt: Appointment };

export function Planner() {
  const user = useUser();
  const db = useStore((s) => s.db);
  const date = useStore((s) => s.date);
  const setDate = useStore((s) => s.setDate);
  const ensureDay = useStore((s) => s.ensureDay);
  const [mode, setMode] = React.useState<'day' | 'week'>('day');

  React.useEffect(() => {
    ensureDay(date);
  }, [date, ensureDay]);

  const isStaff = user.role === 'staff';

  return (
    <>
      <PageHead
        eyebrow="Daily planner"
        title={mode === 'day' ? fmt(date) : `Week of ${fmtShort(weekStart(date))}`}
        sub={
          isStaff
            ? 'Your day, in order. Tick as you go.'
            : 'Every person, every block. Drag a block to move it, or hand it to someone else.'
        }
        tools={
          <>
            <DateNav date={date} onChange={setDate} label={mode === 'day' ? fmt(date) : `w/c ${fmtShort(weekStart(date))}`} />
            <Btn size="sm" variant="ghost" onClick={() => setDate(todayStr())}>
              Today
            </Btn>
            <Seg
              value={mode}
              onChange={setMode}
              options={[
                { value: 'day', label: 'Day' },
                { value: 'week', label: 'Week' },
              ]}
            />
          </>
        }
      />
      {mode === 'day' ? <DayBoard /> : <WeekBoard />}
      {db.days[date] === undefined && <Empty title="Building the day…" />}
    </>
  );
}

/* ---------- the day board ---------- */

function DayBoard() {
  const user = useUser();
  const db = useStore((s) => s.db);
  const date = useStore((s) => s.date);
  const openSheet = useStore((s) => s.openSheet);
  const regenerateDay = useStore((s) => s.regenerateDay);
  const tasks = db.days[date] ?? [];

  const startMin = toMinutes(db.settings.planStart);
  const endMin = toMinutes(db.settings.planEnd);
  const height = (endMin - startMin) * PX_PER_MIN;

  const people = user.role === 'staff' ? staffList(db).filter((p) => p.id === user.id) : staffList(db);
  const unscheduled = tasks.filter((t) => !t.scheduledAt && !t.done);

  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const showNow = date === todayStr() && nowMin >= startMin && nowMin <= endMin;

  return (
    <>
      {unscheduled.length > 0 && (
        <>
          <SectionHead
            title={`Unscheduled · ${unscheduled.length}`}
            sub="No time set. Fine for anytime work — give it a time if it has to happen at one."
            action={
              user.role !== 'staff' ? (
                <Btn size="xs" variant="ghost" onClick={regenerateDay}>
                  Rebuild day
                </Btn>
              ) : undefined
            }
          />
          <Card pad="sm" style={{ marginBottom: 16 }}>
            <div className="row wrap" style={{ gap: 6 }}>
              {unscheduled.slice(0, 24).map((t) => (
                <button
                  key={t.id}
                  type="button"
                  className={cx('planblock', t.zone)}
                  style={{ position: 'static', maxWidth: 230 }}
                  onClick={() => openSheet('plan-task', t.id)}
                >
                  <div className="bt truncate">{t.title}</div>
                  <div className="bm">
                    {t.estMinutes} min · {db.profiles.find((p) => p.id === t.assignedTo)?.name ?? 'nobody'}
                  </div>
                </button>
              ))}
              {unscheduled.length > 24 && (
                <span className="muted" style={{ fontSize: 13 }}>
                  +{unscheduled.length - 24} more
                </span>
              )}
            </div>
          </Card>
        </>
      )}

      <SectionHead
        title="Timeline"
        sub={`${db.settings.planStart} to ${db.settings.planEnd} · zone shown by colour`}
        action={
          user.role !== 'staff' ? (
            <Btn size="xs" variant="ghost" onClick={() => openSheet('appt-new')}>
              Add appointment
            </Btn>
          ) : undefined
        }
      />

      <div className="planner">
        <div className="timegutter" style={{ height: height + 46, paddingTop: 46 }}>
          <div style={{ position: 'relative', height }}>
            {hourMarks(startMin, endMin).map((m) => (
              <div key={m} className="hourlabel" style={{ top: (m - startMin) * PX_PER_MIN }}>
                {fmtTime12(fromMinutes(m))}
              </div>
            ))}
          </div>
        </div>

        {people.map((p) => {
          const absent = isAbsent(p.id, date, db.absences);
          const working = isWorking(p.id, date, db.shifts, db.absences);
          const shift = db.shifts.find((s) => s.staffId === p.id);
          const mine = tasks.filter((t) => t.assignedTo === p.id);
          const blocks = blocksFor(mine, db.appointments.filter((a) => a.date === date && a.assignedTo === p.id));
          const laidOut = layout(blocks);
          const scheduledMins = blocks.reduce((s, b) => s + b.mins, 0);
          const shiftMins = shift ? toMinutes(shift.end) - toMinutes(shift.start) : 0;
          const overloaded = shiftMins > 0 && scheduledMins > shiftMins;
          const o = progress(mine);

          return (
            <div key={p.id} className={cx('plancol', !working && 'away')}>
              <header>
                <div className="row" style={{ gap: 8 }}>
                  <Avatar name={p.name} initials={p.initials} size="sm" />
                  <div className="grow">
                    <div className="nm">{p.name}</div>
                    <div className="rl">
                      {absent ? absent.type : !working ? 'Day off' : `${shift?.start}–${shift?.end}`}
                    </div>
                  </div>
                  {working && (
                    <span className="chip tnum" style={{ fontSize: 10.5 }}>
                      {o.done}/{o.total}
                    </span>
                  )}
                </div>
                {working && (
                  <div className="row" style={{ marginTop: 6, gap: 6 }}>
                    <span className={cx('chip', overloaded ? 'urgent' : 'plain')} style={{ fontSize: 10 }}>
                      {durationLabel(scheduledMins)} scheduled
                    </span>
                    {overloaded && (
                      <span className="chip urgent" style={{ fontSize: 10 }}>
                        over shift
                      </span>
                    )}
                  </div>
                )}
              </header>

              <div className="planbody" style={{ height }}>
                <div className="hourgrid">
                  {hourMarks(startMin, endMin).map((m) => (
                    <div key={m} className="hourline" style={{ top: (m - startMin) * PX_PER_MIN }} />
                  ))}
                </div>

                {shift && working && (
                  <div
                    style={{
                      position: 'absolute',
                      left: 0,
                      right: 0,
                      top: (toMinutes(shift.start) - startMin) * PX_PER_MIN,
                      height: (toMinutes(shift.end) - toMinutes(shift.start)) * PX_PER_MIN,
                      background: 'var(--card-2)',
                    }}
                  />
                )}

                {showNow && <div className="nowline" style={{ top: (nowMin - startMin) * PX_PER_MIN }} />}

                {laidOut.map(({ block, clash }) => (
                  <button
                    key={block.id}
                    type="button"
                    className={cx(
                      'planblock',
                      block.kind === 'appt' ? 'appt' : block.zone,
                      block.kind === 'task' && block.done && 'done',
                      clash && 'clash',
                    )}
                    style={{
                      top: (block.start - startMin) * PX_PER_MIN,
                      height: Math.max(26, block.mins * PX_PER_MIN - 2),
                    }}
                    onClick={() =>
                      block.kind === 'task' ? openSheet('plan-task', block.id) : openSheet('appt', block.id)
                    }
                  >
                    <div className="bt truncate">
                      {block.kind === 'task' && block.done ? '✓ ' : ''}
                      {block.title}
                    </div>
                    <div className="bm">
                      {fmtTime12(fromMinutes(block.start))} · {block.mins}m
                    </div>
                  </button>
                ))}
              </div>
            </div>
          );
        })}

        {user.role !== 'staff' && <UnassignedColumn height={height} startMin={startMin} endMin={endMin} />}
      </div>
    </>
  );
}

function UnassignedColumn({ height, startMin, endMin }: { height: number; startMin: number; endMin: number }) {
  const db = useStore((s) => s.db);
  const date = useStore((s) => s.date);
  const openSheet = useStore((s) => s.openSheet);
  const tasks = (db.days[date] ?? []).filter((t) => !t.assignedTo && t.scheduledAt);
  if (!tasks.length) return null;
  const laidOut = layout(blocksFor(tasks, []));
  return (
    <div className="plancol">
      <header>
        <div className="nm" style={{ color: 'var(--rust)' }}>Nobody assigned</div>
        <div className="rl">{plural(tasks.length, 'timed task')} with no owner</div>
      </header>
      <div className="planbody" style={{ height }}>
        <div className="hourgrid">
          {hourMarks(startMin, endMin).map((m) => (
            <div key={m} className="hourline" style={{ top: (m - startMin) * PX_PER_MIN }} />
          ))}
        </div>
        {laidOut.map(({ block }) => (
          <button
            key={block.id}
            type="button"
            className={cx('planblock', block.zone, 'clash')}
            style={{ top: (block.start - startMin) * PX_PER_MIN, height: Math.max(26, block.mins * PX_PER_MIN - 2) }}
            onClick={() => openSheet('plan-task', block.id)}
          >
            <div className="bt truncate">{block.title}</div>
            <div className="bm">{fmtTime12(fromMinutes(block.start))}</div>
          </button>
        ))}
      </div>
    </div>
  );
}

/* ---------- the week board ---------- */

function WeekBoard() {
  const db = useStore((s) => s.db);
  const date = useStore((s) => s.date);
  const setDate = useStore((s) => s.setDate);
  const ensureDay = useStore((s) => s.ensureDay);
  const ws = weekStart(date);
  const days = Array.from({ length: 7 }, (_, i) => addDays(ws, i));

  React.useEffect(() => {
    days.forEach((d) => ensureDay(d));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ws]);

  const people = staffList(db);

  return (
    <>
      <SectionHead title="The week at a glance" sub="Load per person per day, with days off drawn out." />
      <div className="tblwrap">
        <table className="tbl">
          <thead>
            <tr>
              <th>Person</th>
              {days.map((d) => (
                <th key={d} className="num" style={{ textAlign: 'center' }}>
                  {DOW_SHORT[new Date(d + 'T12:00:00').getDay()]}
                  <div className="faint" style={{ fontWeight: 400, marginTop: 2 }}>{fmtShort(d)}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {people.map((p) => (
              <tr key={p.id}>
                <td>
                  <div className="row" style={{ gap: 8 }}>
                    <Avatar name={p.name} initials={p.initials} size="sm" />
                    <div>
                      <div style={{ fontWeight: 600 }}>{p.name}</div>
                      <div className="faint" style={{ fontSize: 12 }}>{p.staffRoles.join(', ')}</div>
                    </div>
                  </div>
                </td>
                {days.map((d) => {
                  const t = (db.days[d] ?? []).filter((x) => x.assignedTo === p.id);
                  const absent = isAbsent(p.id, d, db.absences);
                  const working = isWorking(p.id, d, db.shifts, db.absences);
                  const mins = t.reduce((s, x) => s + x.estMinutes, 0);
                  const shift = db.shifts.find((s) => s.staffId === p.id);
                  const shiftMins = shift ? toMinutes(shift.end) - toMinutes(shift.start) : 0;
                  const pctLoad = shiftMins ? Math.round((mins / shiftMins) * 100) : 0;
                  return (
                    <td key={d} style={{ textAlign: 'center', verticalAlign: 'top' }}>
                      {absent || !working ? (
                        <span className="chip bronze" style={{ fontSize: 10 }}>
                          {absent ? absent.type : 'Off'}
                        </span>
                      ) : (
                        <button type="button" onClick={() => setDate(d)} style={{ width: '100%' }}>
                          <div className="tnum" style={{ fontSize: 15, fontWeight: 600 }}>
                            {t.length}
                          </div>
                          <div className="faint" style={{ fontSize: 11 }}>{durationLabel(mins)}</div>
                          <div className="bar" style={{ marginTop: 4 }}>
                            <i className={pctLoad > 100 ? 'over' : pctLoad > 85 ? 'warn' : undefined} style={{ width: `${Math.min(100, pctLoad)}%` }} />
                          </div>
                        </button>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <SectionHead title="Appointments this week" />
      <List>
        {db.appointments
          .filter((a) => a.date >= ws && a.date <= addDays(ws, 6))
          .sort((a, b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start))
          .map((a) => (
            <Row
              key={a.id}
              title={a.title}
              sub={`${fmt(a.date)} · ${fmtTime12(a.start)}–${fmtTime12(a.end)}${a.attendees ? ` · ${a.attendees}` : ''}`}
              zone={a.zone}
              right={
                a.assignedTo ? (
                  <Avatar name={db.profiles.find((p) => p.id === a.assignedTo)?.name} size="sm" />
                ) : (
                  <Chip tone="low">Nobody</Chip>
                )
              }
            />
          ))}
        {!db.appointments.some((a) => a.date >= ws && a.date <= addDays(ws, 6)) && (
          <Row title="Nothing booked this week" />
        )}
      </List>
    </>
  );
}

/* ---------- the task sheet: retime, reassign, tick, note ---------- */

export function PlanTaskSheet({ taskId }: { taskId: ID }) {
  const db = useStore((s) => s.db);
  const date = useStore((s) => s.date);
  const closeSheet = useStore((s) => s.closeSheet);
  const toggleTask = useStore((s) => s.toggleTask);
  const assignTask = useStore((s) => s.assignTask);
  const scheduleTask = useStore((s) => s.scheduleTask);
  const setTaskNote = useStore((s) => s.setTaskNote);
  const removeTask = useStore((s) => s.removeTask);
  const user = useUser();

  const task = (db.days[date] ?? []).find((t) => t.id === taskId);
  const [note, setNote] = React.useState(task?.note ?? '');
  if (!task) return null;

  const canManage = user.role === 'owner' || user.role === 'manager';
  const proc = db.procedures.find((p) => task.title.toLowerCase().includes(p.title.toLowerCase().split(' ')[0]!));

  return (
    <Sheet
      title={task.title}
      sub={
        <span className="row wrap" style={{ gap: 7 }}>
          <ZoneChip zone={task.zone} />
          <span>{task.estMinutes} min</span>
          {task.areaName && <span>· {task.areaName}</span>}
          <Chip tone="plain">{task.source}</Chip>
        </span>
      }
      onClose={closeSheet}
      footer={
        <>
          <Btn className="grow" onClick={() => { toggleTask(task.id); closeSheet(); }}>
            {task.done ? 'Mark not done' : 'Mark done'}
          </Btn>
          <Btn variant="ghost" onClick={() => { setTaskNote(task.id, note); closeSheet(); }}>
            Save note
          </Btn>
          {canManage && task.source === 'adhoc' && (
            <Btn variant="danger" size="sm" onClick={() => { removeTask(task.id); closeSheet(); }}>
              Delete
            </Btn>
          )}
        </>
      }
    >
      {task.instructions && (
        <div className="callout" style={{ marginBottom: 16 }}>
          <div className="cs" style={{ marginTop: 0 }}>{task.instructions}</div>
        </div>
      )}

      {task.done && (
        <div style={{ marginBottom: 16 }}>
          <Chip tone="ok">
            Done by {db.profiles.find((p) => p.id === task.doneBy)?.name ?? '—'}
            {task.doneAt ? ` at ${new Date(task.doneAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}` : ''}
          </Chip>
        </div>
      )}

      <div className="two">
        <Field label="Time" hint="Leave empty for anytime work.">
          <Text
            type="time"
            value={task.scheduledAt ?? ''}
            onChange={(v) => scheduleTask(task.id, v || undefined)}
            disabled={!canManage && user.role !== 'staff'}
          />
        </Field>
        <Field label="Assigned to" hint={canManage ? 'Overrides the automatic routing for today only.' : 'Set by the manager.'}>
          <Select
            value={task.assignedTo ?? ''}
            onChange={(v) => assignTask(task.id, v || undefined)}
            options={[
              { value: '', label: 'Nobody' },
              ...staffList(db).map((p) => ({ value: p.id, label: `${p.name} · ${p.staffRoles.join(', ')}` })),
            ]}
          />
        </Field>
      </div>

      <Field label="Note" hint="Anything the manager should know — what you found, why it took longer, what needs following up.">
        <textarea className="in" rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>

      {proc && (
        <div style={{ marginTop: 8 }}>
          <SectionHead title="The procedure for this" />
          <Card pad="sm">
            <div style={{ fontWeight: 600, fontSize: 15 }}>{proc.title}</div>
            <div className="muted" style={{ fontSize: 13.5, marginTop: 4 }}>{proc.standard}</div>
            <Btn size="xs" variant="ghost" style={{ marginTop: 10 }} onClick={() => { closeSheet(); window.location.hash = `/manual/${proc.id}`; }}>
              Read the full procedure
            </Btn>
          </Card>
        </div>
      )}
    </Sheet>
  );
}

export function ApptSheet({ id }: { id: ID }) {
  const db = useStore((s) => s.db);
  const closeSheet = useStore((s) => s.closeSheet);
  const a = db.appointments.find((x) => x.id === id);
  if (!a) return null;
  return (
    <Sheet
      title={a.title}
      sub={`${fmt(a.date)} · ${fmtTime12(a.start)}–${fmtTime12(a.end)}`}
      onClose={closeSheet}
      footer={<Btn variant="ghost" onClick={closeSheet}>Close</Btn>}
    >
      <div className="row wrap" style={{ gap: 7, marginBottom: 16 }}>
        <ZoneChip zone={a.zone} />
        <Chip tone="plain">{a.kind}</Chip>
        {a.areaId && <Chip>{db.areas.find((x) => x.id === a.areaId)?.name}</Chip>}
      </div>
      <dl className="kv">
        <dt>Attendees</dt>
        <dd>{a.attendees || '—'}</dd>
        <dt>Looked after by</dt>
        <dd>{db.profiles.find((p) => p.id === a.assignedTo)?.name ?? 'Nobody assigned'}</dd>
        {a.vendorId && (
          <>
            <dt>Vendor</dt>
            <dd>{db.vendors.find((v) => v.id === a.vendorId)?.name}</dd>
          </>
        )}
        <dt>Notes</dt>
        <dd>{a.notes || '—'}</dd>
      </dl>
    </Sheet>
  );
}

export function ApptNewSheet() {
  const db = useStore((s) => s.db);
  const date = useStore((s) => s.date);
  const closeSheet = useStore((s) => s.closeSheet);
  const upsert = useStore((s) => s.upsert);
  const [f, setF] = React.useState<Partial<Appointment>>({
    date,
    start: '10:00',
    end: '11:00',
    title: '',
    kind: 'vendor',
    zone: 'household',
    attendees: '',
    notes: '',
  });
  const set = (k: keyof Appointment, v: unknown) => setF((p) => ({ ...p, [k]: v }));

  return (
    <Sheet
      title="New appointment"
      sub="Anything with a start and an end — a vendor, a meeting, a school run, a pickup."
      onClose={closeSheet}
      footer={
        <>
          <Btn
            className="grow"
            disabled={!f.title}
            onClick={() => {
              upsert('appointments', { ...f, attendees: f.attendees ?? '', notes: f.notes ?? '' }, 'Appointment added');
              closeSheet();
            }}
          >
            Add to the planner
          </Btn>
          <Btn variant="ghost" onClick={closeSheet}>Cancel</Btn>
        </>
      }
    >
      <Field label="What is it">
        <Text value={f.title ?? ''} onChange={(v) => set('title', v)} placeholder="Cool Breeze — meeting room AC" />
      </Field>
      <div className="three-col">
        <Field label="Date">
          <Text type="date" value={f.date ?? ''} onChange={(v) => set('date', v)} />
        </Field>
        <Field label="From">
          <Text type="time" value={f.start ?? ''} onChange={(v) => set('start', v)} />
        </Field>
        <Field label="To">
          <Text type="time" value={f.end ?? ''} onChange={(v) => set('end', v)} />
        </Field>
      </div>
      <div className="two">
        <Field label="Kind">
          <Select
            value={f.kind}
            onChange={(v) => set('kind', v)}
            options={['vendor', 'meeting', 'personal', 'school', 'delivery', 'medical', 'other'].map((k) => ({ value: k as string, label: k[0]!.toUpperCase() + k.slice(1) }))}
          />
        </Field>
        <Field label="Zone">
          <Select
            value={f.zone}
            onChange={(v) => set('zone', v)}
            options={[
              { value: 'household', label: 'Household' },
            ]}
          />
        </Field>
      </div>
      <div className="two">
        <Field label="Area">
          <Select
            value={f.areaId ?? ''}
            onChange={(v) => set('areaId', v || undefined)}
            options={[{ value: '', label: 'Anywhere' }, ...db.areas.filter((a) => a.active).map((a) => ({ value: a.id, label: a.name }))]}
          />
        </Field>
        <Field label="Who looks after it" hint="They get the reminder push.">
          <Select
            value={f.assignedTo ?? ''}
            onChange={(v) => set('assignedTo', v || undefined)}
            options={[{ value: '', label: 'Nobody' }, ...staffList(db).map((p) => ({ value: p.id, label: p.name }))]}
          />
        </Field>
      </div>
      <Field label="Attendees">
        <Text value={f.attendees ?? ''} onChange={(v) => set('attendees', v)} placeholder="Names, or how many" />
      </Field>
      <Field label="Notes">
        <textarea className="in" rows={2} value={f.notes ?? ''} onChange={(e) => set('notes', e.target.value)} />
      </Field>
    </Sheet>
  );
}

/* ---------- geometry ---------- */

function hourMarks(startMin: number, endMin: number): number[] {
  const out: number[] = [];
  for (let m = Math.ceil(startMin / 60) * 60; m <= endMin; m += 60) out.push(m);
  return out;
}

function blocksFor(tasks: TaskInstance[], appts: Appointment[]): Block[] {
  const out: Block[] = [];
  tasks
    .filter((t) => t.scheduledAt)
    .forEach((t) =>
      out.push({
        kind: 'task',
        id: t.id,
        start: toMinutes(t.scheduledAt!),
        mins: Math.max(10, t.estMinutes),
        title: t.title,
        zone: t.zone,
        done: t.done,
        task: t,
      }),
    );
  appts.forEach((a) =>
    out.push({
      kind: 'appt',
      id: a.id,
      start: toMinutes(a.start),
      mins: Math.max(15, toMinutes(a.end) - toMinutes(a.start)),
      title: a.title,
      zone: a.zone,
      appt: a,
    }),
  );
  return out.sort((a, b) => a.start - b.start);
}

/** Flags anything that overlaps something else in the same column. */
function layout(blocks: Block[]): { block: Block; clash: boolean }[] {
  return blocks.map((b) => ({
    block: b,
    clash: blocks.some(
      (o) => o.id !== b.id && b.start < o.start + o.mins && o.start < b.start + b.mins,
    ),
  }));
}
