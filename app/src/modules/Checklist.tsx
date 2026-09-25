import React from 'react';
import {useStore, useUser} from '@/store';
import {fmt, fmtTime12, today as todayStr} from '@/lib/date';
import {plural} from '@/lib/format';
import {progress} from '@/lib/schedule';
import {staffList} from '@/lib/selectors';
import type { TaskInstance } from '@/types';
import {Avatar, Btn, Card, Chip, DateNav, Empty, Field, Group, Meter, PageHead, Seg, Select, Sheet, Text, ZoneChip, cx} from '@/components/ui';

export function Checklist() {
  const user = useUser();
  const db = useStore((s) => s.db);
  const date = useStore((s) => s.date);
  const setDate = useStore((s) => s.setDate);
  const ensureDay = useStore((s) => s.ensureDay);
  const toggleTask = useStore((s) => s.toggleTask);
  const markAllInGroup = useStore((s) => s.markAllInGroup);
  const openSheet = useStore((s) => s.openSheet);
  const regenerateDay = useStore((s) => s.regenerateDay);

  const [who, setWho] = React.useState<string>('all');
  const [show, setShow] = React.useState<'todo' | 'all'>('todo');

  React.useEffect(() => {
    ensureDay(date);
  }, [date, ensureDay]);

  const all = db.days[date] ?? [];
  const isStaff = user.role === 'staff';
  const effectiveWho = isStaff ? user.id : who;

  let tasks = all;
  if (effectiveWho !== 'all') tasks = tasks.filter((t) => t.assignedTo === effectiveWho);
  const visible = show === 'todo' ? tasks.filter((t) => !t.done) : tasks;

  const o = progress(tasks);

  /* group by category, then by the library's groupAs */
  const byCat = new Map<string, TaskInstance[]>();
  visible.forEach((t) => {
    const arr = byCat.get(t.categoryId) ?? [];
    arr.push(t);
    byCat.set(t.categoryId, arr);
  });
  const cats = db.taskCategories
    .filter((c) => byCat.has(c.id))
    .sort((a, b) => a.order - b.order);

  return (
    <>
      <PageHead
        eyebrow="Checklist"
        title={fmt(date)}
        sub={`${plural(o.total, 'task')} · generated from the library, the rota, guests, plants and service contracts`}
        tools={
          <>
            <DateNav date={date} onChange={setDate} label={fmt(date)} />
            <Btn size="sm" variant="ghost" onClick={() => setDate(todayStr())}>Today</Btn>
            {!isStaff && (
              <>
                <Btn size="sm" variant="ghost" onClick={() => openSheet('task-adhoc')}>Add a one-off</Btn>
                <Btn size="sm" variant="ghost" onClick={regenerateDay}>Rebuild</Btn>
              </>
            )}
          </>
        }
      />

      <div className="row wrap" style={{ gap: 8, marginBottom: 14 }}>
        <Seg
          value={show}
          onChange={setShow}
          options={[
            { value: 'todo', label: 'To do', count: tasks.filter((t) => !t.done).length },
            { value: 'all', label: 'Everything', count: tasks.length },
          ]}
        />
        {!isStaff && (
          <select className="in" style={{ width: 'auto', minHeight: 36 }} value={who} onChange={(e) => setWho(e.target.value)}>
            <option value="all">Everyone</option>
            {staffList(db).map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        )}
      </div>

      <Card style={{ marginBottom: 16 }}>
        <Meter pct={o.pct} left={`${o.done} of ${o.total} done`} right={`${o.total - o.done} remaining`} />
      </Card>

      {!cats.length && (
        <Empty title={show === 'todo' ? 'Everything is done' : 'Nothing scheduled'}>
          {show === 'todo'
            ? 'Switch to Everything to see what was completed today.'
            : 'No tasks match this filter. Check the zone or the person.'}
        </Empty>
      )}

      {cats.map((c) => {
        const list = byCat.get(c.id)!;
        const groups = new Map<string, TaskInstance[]>();
        list.forEach((t) => {
          const g = t.groupAs || '—';
          const arr = groups.get(g) ?? [];
          arr.push(t);
          groups.set(g, arr);
        });
        const catProgress = progress(tasks.filter((t) => t.categoryId === c.id));

        return (
          <Group
            key={c.id}
            name={
              <span className="row" style={{ gap: 9 }}>
                <span style={{ fontSize: 17 }}>{c.icon}</span>
                {c.name}
              </span>
            }
            meta={`${catProgress.done} of ${catProgress.total} done`}
            count={<Chip tone={catProgress.pct === 100 ? 'ok' : 'plain'}>{catProgress.pct}%</Chip>}
            defaultOpen={cats.length <= 4 || list.length <= 8}
          >
            {[...groups.entries()].map(([g, gt]) => (
              <React.Fragment key={g}>
                {g !== '—' && (
                  <div
                    className="between"
                    style={{ padding: '9px 16px 5px', background: 'var(--card-2)' }}
                  >
                    <span className="eyebrow">{g}</span>
                    {!isStaff && (
                      <button
                        type="button"
                        className="chip"
                        onClick={() => markAllInGroup(g, !gt.every((t) => t.done))}
                      >
                        {gt.every((t) => t.done) ? 'Untick all' : 'Tick all'}
                      </button>
                    )}
                  </div>
                )}
                {gt.map((t) => (
                  <div key={t.id} className={cx('task', t.done && 'done', t.off && 'off')}>
                    <button
                      type="button"
                      className="box"
                      onClick={() => toggleTask(t.id)}
                      aria-label={t.done ? 'Mark not done' : 'Mark done'}
                    >
                      ✓
                    </button>
                    <button type="button" className="tx" onClick={() => openSheet('plan-task', t.id)}>
                      {t.title}
                      <span className="meta">
                        <ZoneChip zone={t.zone} />
                        {t.scheduledAt && <b className="tnum">{fmtTime12(t.scheduledAt)}</b>}
                        <span>{t.estMinutes}m</span>
                        {t.assignedTo ? (
                          <span className="row" style={{ gap: 4 }}>
                            <Avatar name={db.profiles.find((p) => p.id === t.assignedTo)?.name} size="sm" />
                          </span>
                        ) : (
                          <Chip tone="urgent">Nobody</Chip>
                        )}
                        {t.off && <Chip tone="bronze">Day off — not counted</Chip>}
                        {t.note && <Chip tone="info">Note</Chip>}
                      </span>
                    </button>
                  </div>
                ))}
              </React.Fragment>
            ))}
          </Group>
        );
      })}
    </>
  );
}

export function AdhocSheet() {
  const db = useStore((s) => s.db);
  const closeSheet = useStore((s) => s.closeSheet);
  const addAdhocTask = useStore((s) => s.addAdhocTask);
  const [f, setF] = React.useState({
    title: '',
    zone: 'household' as const,
    assignedTo: '',
    scheduledAt: '',
    estMinutes: 15,
    instructions: '',
  });

  return (
    <Sheet
      title="One-off task"
      sub="Something for today only. It will not come back tomorrow — for that, add it to the library in Settings."
      onClose={closeSheet}
      footer={
        <>
          <Btn
            className="grow"
            disabled={!f.title}
            onClick={() => {
              addAdhocTask({
                title: f.title,
                zone: 'household',
                assignedTo: f.assignedTo || undefined,
                scheduledAt: f.scheduledAt || undefined,
                estMinutes: Number(f.estMinutes) || 15,
                instructions: f.instructions,
              });
              closeSheet();
            }}
          >
            Add to today
          </Btn>
          <Btn variant="ghost" onClick={closeSheet}>Cancel</Btn>
        </>
      }
    >
      <Field label="What needs doing">
        <Text value={f.title} onChange={(v) => setF({ ...f, title: v })} placeholder="Move the terrace cushions in before the wind" />
      </Field>
      <div className="two">
        <Field label="Assign to">
          <Select
            value={f.assignedTo}
            onChange={(v) => setF({ ...f, assignedTo: v })}
            options={[{ value: '', label: 'Nobody' }, ...staffList(db).map((p) => ({ value: p.id, label: p.name }))]}
          />
        </Field>
      </div>
      <div className="two">
        <Field label="Time" hint="Optional — leave blank for anytime.">
          <Text type="time" value={f.scheduledAt} onChange={(v) => setF({ ...f, scheduledAt: v })} />
        </Field>
        <Field label="How long, in minutes">
          <Text type="number" value={String(f.estMinutes)} onChange={(v) => setF({ ...f, estMinutes: Number(v) })} />
        </Field>
      </div>
      <Field label="Anything they should know">
        <textarea className="in" rows={2} value={f.instructions} onChange={(e) => setF({ ...f, instructions: e.target.value })} />
      </Field>
    </Sheet>
  );
}
