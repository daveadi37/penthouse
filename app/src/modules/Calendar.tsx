import React from 'react';
import {useStore, useUser} from '@/store';
import { can } from '@/lib/access';
import {DOW_SHORT, addDays, addMonths, daysUntil, fmt, fmtShort, fmtTime12, monthStart, MON, pd, today as todayStr, weekStart} from '@/lib/date';
import {money} from '@/lib/format';
import {allExpiries, staffList, visibleRecurring} from '@/lib/selectors';
import type { DateStr, Zone } from '@/types';
import {Btn, Card, Chip, Empty, IconBtn, List, PageHead, Row, SectionHead, Seg, cx} from '@/components/ui';
import {ZoneFilterBar} from '@/components/Shell';

/* Everything that has a date gets on the calendar. That is the
   difference between one the manager reads every morning and one
   nobody opens twice. */

type Layer =
  | 'tasks'
  | 'appointments'
  | 'occasions'
  | 'vendors'
  | 'staff'
  | 'money'
  | 'expiries';

const LAYERS: { key: Layer; label: string }[] = [
  { key: 'appointments', label: 'Appointments' },
  { key: 'occasions', label: 'Guests & events' },
  { key: 'vendors', label: 'Vendor visits' },
  { key: 'staff', label: 'Days off & leave' },
  { key: 'money', label: 'Bills due' },
  { key: 'expiries', label: 'Expiries' },
  { key: 'tasks', label: 'Task load' },
];

interface CalEntry {
  date: DateStr;
  label: string;
  tone?: 'crit' | 'warn';
  zone?: Zone;
  url?: string;
  layer: Layer;
}

export function Calendar() {
  const user = useUser();
  const db = useStore((s) => s.db);
  const date = useStore((s) => s.date);
  const setDate = useStore((s) => s.setDate);
  const zoneFilter = useStore((s) => s.zoneFilter);
  const [mode, setMode] = React.useState<'month' | 'week'>('month');
  const [ref, setRef] = React.useState(monthStart(date));
  const [active, setActive] = React.useState<Layer[]>([
    'appointments',
    'occasions',
    'vendors',
    'staff',
    'money',
    'expiries',
  ]);

  const canSeeMoney = can(db, user, 'money.view');
  const entries = React.useMemo(
    () => collect(db, canSeeMoney, can(db, user, 'money.viewOwner')),
    [db, canSeeMoney, user],
  );

  const filtered = entries.filter(
    (e) => active.includes(e.layer) && (zoneFilter === 'all' || !e.zone || e.zone === zoneFilter),
  );

  const monthLabel = `${MON[pd(ref).getMonth()]} ${pd(ref).getFullYear()}`;

  return (
    <>
      <PageHead
        eyebrow="Calendar"
        title={mode === 'month' ? monthLabel : `Week of ${fmtShort(weekStart(date))}`}
        sub="Appointments, guests, vendors, leave, bills and every expiry — one view."
        tools={
          <>
            <div className="row" style={{ gap: 6 }}>
              <IconBtn label="Previous" onClick={() => (mode === 'month' ? setRef(addMonths(ref, -1)) : setDate(addDays(date, -7)))}>‹</IconBtn>
              <IconBtn label="Next" onClick={() => (mode === 'month' ? setRef(addMonths(ref, 1)) : setDate(addDays(date, 7)))}>›</IconBtn>
            </div>
            <Btn size="sm" variant="ghost" onClick={() => { setRef(monthStart(todayStr())); setDate(todayStr()); }}>Today</Btn>
            <Seg value={mode} onChange={setMode} options={[{ value: 'month', label: 'Month' }, { value: 'week', label: 'Week' }]} />
          </>
        }
      />

      <div className="row wrap" style={{ gap: 8, marginBottom: 12 }}>
        <ZoneFilterBar />
      </div>

      <div className="row wrap" style={{ gap: 6, marginBottom: 14 }}>
        {LAYERS.filter((l) => l.key !== 'money' || canSeeMoney).map((l) => (
          <button
            key={l.key}
            type="button"
            className={cx('chip', active.includes(l.key) && 'info')}
            onClick={() =>
              setActive((a) => (a.includes(l.key) ? a.filter((x) => x !== l.key) : [...a, l.key]))
            }
          >
            {l.label}
          </button>
        ))}
      </div>

      {mode === 'month' ? (
        <MonthGrid ref_={ref} entries={filtered} onPick={(d) => setDate(d)} />
      ) : (
        <WeekList entries={filtered} />
      )}

      <SectionHead title={`On ${fmt(date)}`} action={<Btn size="xs" variant="ghost" onClick={() => (window.location.hash = '/planner')}>Open the planner</Btn>} />
      <DayDetail entries={filtered.filter((e) => e.date === date)} />
    </>
  );
}

function MonthGrid({
  ref_,
  entries,
  onPick,
}: {
  ref_: DateStr;
  entries: CalEntry[];
  onPick: (d: DateStr) => void;
}) {
  const db = useStore((s) => s.db);
  const selected = useStore((s) => s.date);
  const first = pd(ref_);
  const startPad = (first.getDay() + 6) % 7; // Monday-anchored
  const gridStart = addDays(ref_, -startPad);
  const days = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
  const month = pd(ref_).getMonth();
  const t = todayStr();

  const byDate = new Map<DateStr, CalEntry[]>();
  entries.forEach((e) => {
    const arr = byDate.get(e.date) ?? [];
    arr.push(e);
    byDate.set(e.date, arr);
  });

  return (
    <div className="cal">
      <div className="calhead">
        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
          <div key={d}>{d}</div>
        ))}
      </div>
      <div className="calgrid">
        {days.map((d) => {
          const list = byDate.get(d) ?? [];
          const taskCount = db.days[d]?.filter((x) => !x.off).length ?? 0;
          return (
            <button
              key={d}
              type="button"
              className={cx('calday', pd(d).getMonth() !== month && 'out', d === t && 'today', d === selected && 'sel')}
              onClick={() => onPick(d)}
              style={d === selected && d !== t ? { boxShadow: 'inset 0 0 0 2px var(--accent)' } : undefined}
            >
              <div className="between">
                <span className="dn">{pd(d).getDate()}</span>
                {taskCount > 0 && (
                  <span className="faint tnum" style={{ fontSize: 10 }}>{taskCount}</span>
                )}
              </div>
              {list.slice(0, 3).map((e, i) => (
                <span key={i} className={cx('calev', e.tone ?? e.zone)}>
                  {e.label}
                </span>
              ))}
              {list.length > 3 && (
                <span className="faint" style={{ fontSize: 10 }}>+{list.length - 3} more</span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function WeekList({ entries }: { entries: CalEntry[] }) {
  const db = useStore((s) => s.db);
  const date = useStore((s) => s.date);
  const setDate = useStore((s) => s.setDate);
  const ws = weekStart(date);
  const days = Array.from({ length: 7 }, (_, i) => addDays(ws, i));

  return (
    <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))' }}>
      {days.map((d) => {
        const list = entries.filter((e) => e.date === d);
        const taskCount = db.days[d]?.filter((x) => !x.off).length ?? 0;
        return (
          <Card key={d} pad="sm" className={d === todayStr() ? 'flat' : undefined} style={d === todayStr() ? { boxShadow: 'inset 0 0 0 2px var(--accent)' } : undefined}>
            <button type="button" onClick={() => setDate(d)} style={{ width: '100%' }}>
              <div className="between">
                <span style={{ fontWeight: 650, fontSize: 14 }}>{DOW_SHORT[pd(d).getDay()]} {pd(d).getDate()}</span>
                {taskCount > 0 && <span className="chip" style={{ fontSize: 10 }}>{taskCount}</span>}
              </div>
            </button>
            <div className="stack-sm" style={{ marginTop: 8 }}>
              {list.length ? (
                list.map((e, i) => (
                  <div key={i} className={cx('calev', e.tone ?? e.zone)} style={{ whiteSpace: 'normal', fontSize: 11.5, padding: '4px 7px' }}>
                    {e.label}
                  </div>
                ))
              ) : (
                <div className="faint" style={{ fontSize: 12 }}>—</div>
              )}
            </div>
          </Card>
        );
      })}
    </div>
  );
}

function DayDetail({ entries }: { entries: CalEntry[] }) {
  if (!entries.length) return <Empty title="Nothing on this day" />;
  return (
    <List>
      {entries.map((e, i) => (
        <Row
          key={i}
          title={e.label}
          sub={e.layer}
          zone={e.zone}
          right={e.tone ? <Chip tone={e.tone === 'crit' ? 'urgent' : 'low'}>{e.tone === 'crit' ? 'Overdue' : 'Soon'}</Chip> : undefined}
          onClick={e.url ? () => (window.location.hash = e.url!.slice(1)) : undefined}
        />
      ))}
    </List>
  );
}

/* ---------- everything with a date ---------- */

function collect(db: ReturnType<typeof useStore.getState>['db'], canSeeMoney: boolean, isOwner: boolean): CalEntry[] {
  const out: CalEntry[] = [];

  db.appointments.forEach((a) =>
    out.push({ date: a.date, label: `${fmtTime12(a.start)} ${a.title}`, zone: a.zone, layer: a.kind === 'vendor' ? 'vendors' : 'appointments', url: '#/planner' }),
  );

  db.guests.forEach((g) => {
    out.push({ date: g.arrival, label: `Guest arrives · ${g.name}`, zone: 'household', layer: 'occasions', url: `#/occasions/guests/${g.id}` });
    if (g.departure) out.push({ date: g.departure, label: `Guest departs · ${g.name}`, zone: 'household', layer: 'occasions', url: `#/occasions/guests/${g.id}` });
  });

  db.events.forEach((e) =>
    out.push({ date: e.date, label: `${fmtTime12(e.start)} ${e.name}`, zone: e.zone, layer: 'occasions', url: `#/occasions/events/${e.id}` }),
  );

  db.vacations.forEach((v) => {
    out.push({ date: v.depart, label: 'Family away — departs', zone: 'household', layer: 'occasions', url: '#/occasions/vacation' });
    out.push({ date: v.return, label: 'Family returns', zone: 'household', layer: 'occasions', url: '#/occasions/vacation' });
  });

  db.contractorVisits.forEach((c) =>
    out.push({ date: c.date, label: `${fmtTime12(c.scheduled)} ${c.vendorName}`, zone: c.zone, layer: 'vendors', url: '#/people/contractors' }),
  );

  db.contracts
    .filter((c) => c.active && c.next)
    .forEach((c) =>
      out.push({ date: c.next, label: `${c.name} due`, zone: c.zone, layer: 'vendors', url: `#/register/contracts/${c.id}` }),
    );

  db.absences.forEach((a) => {
    const name = db.profiles.find((p) => p.id === a.staffId)?.name ?? '';
    let d = a.from;
    while (d <= a.to) {
      out.push({ date: d, label: `${name} — ${a.type}`, layer: 'staff', url: '#/staff' });
      d = addDays(d, 1);
    }
  });

  staffList(db).forEach((p) => {
    const shift = db.shifts.find((s) => s.staffId === p.id);
    if (!shift) return;
    // Regular days off across the visible window.
    for (let i = -40; i < 70; i++) {
      const d = addDays(todayStr(), i);
      if (pd(d).getDay() === shift.dayOff) {
        out.push({ date: d, label: `${p.name} — day off`, layer: 'staff', url: '#/staff' });
      }
    }
  });

  if (canSeeMoney) {
    visibleRecurring(db, isOwner)
      .filter((r) => r.active && r.nextDue)
      .forEach((r) =>
        out.push({
          date: r.nextDue,
          label: `${r.name} · ${money(r.amount, db.settings.currency)}`,
          zone: r.zone,
          tone: daysUntil(r.nextDue) < 0 ? 'crit' : undefined,
          layer: 'money',
          url: '#/money/recurring',
        }),
      );
  }

  allExpiries(db)
    .filter((e) => !e.ownerOnly || isOwner)
    .forEach((e) =>
      out.push({
        date: e.date,
        label: e.label,
        zone: e.zone,
        tone: e.days < 0 ? 'crit' : e.days <= 30 ? 'warn' : undefined,
        layer: 'expiries',
        url: e.url,
      }),
    );

  return out;
}
