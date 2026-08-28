import React from 'react';
import {useStore, useUser} from '@/store';
import { can, roleLabel } from '@/lib/access';
import {detailId, navigate, useRoute} from '@/lib/router';
import {addDays, fmtMedium, fmtShort, timeAgo, today as todayStr, weekStart, DOW} from '@/lib/date';
import {money, plural} from '@/lib/format';
import {freqLabel} from '@/lib/schedule';
import {allAlerts, areaName, buildReport, burnRate, profileName, quietDevices, staffList, unreadFor} from '@/lib/selectors';
import type { Alert } from '@/lib/selectors';
import { STAFF_ROLES } from '@/types';
import type { IssuePriority, LibraryTask } from '@/types';
import {Avatar, Bar, Btn, Callout, Card, Chip, Empty, Field, Group, KV, List, PageHead, Ring, Row, SectionHead, Seg, Select, Sheet, Stat, Text, ZoneChip, cx} from '@/components/ui';
import {ZoneFilterBar} from '@/components/Shell';

/* ============================================================
   HOUSE MANUAL
   ============================================================ */

export function Manual() {
  const route = useRoute();
  const db = useStore((s) => s.db);
  const zoneFilter = useStore((s) => s.zoneFilter);
  const [q, setQ] = React.useState('');

  const procId = detailId(route);
  if (procId) {
    const p = db.procedures.find((x) => x.id === procId);
    if (!p) return <Empty title="No such procedure" />;
    return (
      <>
        <PageHead
          eyebrow={`${p.category} · version ${p.version}`}
          title={p.title}
          sub={p.frequency}
          tools={<Btn size="sm" variant="ghost" onClick={() => navigate('manual')}>‹ All procedures</Btn>}
        />
        <div className="row wrap" style={{ gap: 7, marginBottom: 16 }}>
          {p.zone !== 'any' && <ZoneChip zone={p.zone} full />}
          <Chip tone="plain">{p.role}</Chip>
          <Chip tone="plain">Updated {timeAgo(p.updatedAt)}</Chip>
        </div>

        <div className="grid two">
          <div>
            <Card style={{ marginBottom: 12 }}>
              <div className="eyebrow">Why it matters</div>
              <div style={{ marginTop: 6, fontSize: 15.5, lineHeight: 1.5 }}>{p.purpose}</div>
            </Card>
            <SectionHead title="Steps" sub="In order. The order is part of the method." />
            <List>
              {p.steps.map((s, i) => (
                <div key={i} className="item" style={{ alignItems: 'flex-start' }}>
                  <span className="av sm" style={{ background: 'var(--card-2)', color: 'var(--muted)' }}>{i + 1}</span>
                  <span className="grow" style={{ fontSize: 15, lineHeight: 1.45 }}>{s}</span>
                </div>
              ))}
            </List>
          </div>
          <div>
            <SectionHead title="What good looks like" />
            <Card className="callout ok" pad={false} style={{ padding: '14px 17px', marginBottom: 12 }}>
              <div style={{ fontSize: 15, lineHeight: 1.5 }}>{p.standard}</div>
            </Card>
            <SectionHead title="What to watch for" />
            <Card className="callout warn" pad={false} style={{ padding: '14px 17px', marginBottom: 12 }}>
              <div style={{ fontSize: 15, lineHeight: 1.5 }}>{p.watchFor}</div>
            </Card>
            <SectionHead title="Supplies" />
            <Card><div style={{ fontSize: 14.5, lineHeight: 1.5 }}>{p.supplies}</div></Card>
          </div>
        </div>
      </>
    );
  }

  let list = db.procedures;
  if (zoneFilter !== 'all') list = list.filter((p) => p.zone === zoneFilter || p.zone === 'any');
  if (q) list = list.filter((p) => (p.title + p.purpose + p.standard + p.watchFor).toLowerCase().includes(q.toLowerCase()));

  const cats = [...new Set(list.map((p) => p.category))];

  return (
    <>
      <PageHead
        eyebrow="House manual"
        title="How things are done here"
        sub="The standard, the method, and what to watch for. Written once, followed by everyone."
      />
      <div className="row wrap" style={{ gap: 8, marginBottom: 14 }}>
        <ZoneFilterBar />
        <input className="in" style={{ width: 'auto', minHeight: 36, flex: '1 1 220px' }} placeholder="Search procedures" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      {cats.map((c) => (
        <Group key={c} name={c} meta={plural(list.filter((p) => p.category === c).length, 'procedure')} defaultOpen={cats.length <= 4}>
          {list
            .filter((p) => p.category === c)
            .map((p) => (
              <Row
                key={p.id}
                title={p.title}
                sub={p.frequency}
                right={p.zone !== 'any' ? <ZoneChip zone={p.zone} /> : undefined}
                onClick={() => navigate('manual', undefined, p.id)}
              />
            ))}
        </Group>
      ))}
      {!list.length && <Empty title="Nothing matches" />}
    </>
  );
}

/* ============================================================
   REPORTS
   ============================================================ */

export function Reports() {
  const db = useStore((s) => s.db);
  const [period, setPeriod] = React.useState<'this' | 'last' | 'month'>('this');

  const from =
    period === 'this' ? weekStart(todayStr())
    : period === 'last' ? addDays(weekStart(todayStr()), -7)
    : addDays(todayStr(), -30);
  const to = period === 'last' ? addDays(weekStart(todayStr()), -1) : todayStr();

  const rep = buildReport(db, from, to);
  const ensureDay = useStore((s) => s.ensureDay);

  React.useEffect(() => {
    // Materialise the window so the report has something to read.
    let c = from;
    while (c <= to) {
      ensureDay(c);
      c = addDays(c, 1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to]);

  const fast = db.inventory
    .filter((i) => i.active)
    .map((i) => ({ item: i, weekly: burnRate(db, i.id) }))
    .filter((x) => x.weekly > 0)
    .sort((a, b) => b.weekly - a.weekly)
    .slice(0, 6);

  const wasteTotal = db.waste.filter((w) => w.date >= from && w.date <= to).reduce((s, w) => s + (w.approxValue ?? 0), 0);
  const issuesRaised = db.issues.filter((i) => i.reportedAt >= new Date(from + 'T00:00:00').getTime());
  const resolved = issuesRaised.filter((i) => i.resolvedAt);
  const avgResolveHours = resolved.length
    ? Math.round(resolved.reduce((s, i) => s + (i.resolvedAt! - i.reportedAt) / 36e5, 0) / resolved.length)
    : null;

  return (
    <>
      <PageHead
        eyebrow="House report"
        title={`${fmtShort(from)} → ${fmtShort(to)}`}
        sub="A day is only scored once it has finished, so work still in progress is never counted as a failure."
        tools={
          <Seg
            value={period}
            onChange={setPeriod}
            options={[
              { value: 'this', label: 'This week' },
              { value: 'last', label: 'Last week' },
              { value: 'month', label: 'Last 30 days' },
            ]}
          />
        }
      />

      {rep.score == null ? (
        <div style={{ marginBottom: 18 }}>
          <Callout title="Not scored yet">
            A score is only calculated from days that have closed.{' '}
            {rep.recordedDays
              ? `This period has ${plural(rep.recordedDays, 'day')} recorded and ${rep.closedDays ? `${rep.closedDays} closed` : 'none closed yet'}.`
              : 'No days have been recorded in this period yet.'}
          </Callout>
        </div>
      ) : (
        <Card style={{ marginBottom: 18 }}>
          <div className="between wrap">
            <div>
              <div className="eyebrow">Overall house health</div>
              <div className="serif" style={{ fontSize: 44, lineHeight: 1.04, marginTop: 5 }}>
                {rep.score}% — {rep.band}
              </div>
              <div className="muted" style={{ fontSize: 14, marginTop: 4 }}>
                Across {plural(rep.closedDays, 'closed day')}.
              </div>
            </div>
            <Ring pct={rep.score} size={72} />
          </div>
        </Card>
      )}

      <div className="grid four" style={{ marginBottom: 18 }}>
        <Stat label="Issues raised" value={issuesRaised.length} foot={<span className="muted" style={{ fontSize: 12.5 }}>{resolved.length} resolved</span>} />
        <Stat label="Average time to resolve" value={avgResolveHours != null ? `${avgResolveHours}h` : '—'} />
        <Stat label="Food waste" value={money(wasteTotal, db.settings.currency)} tone={wasteTotal > 100 ? 'warn' : undefined} />
        <Stat label="Raised by the household" value={issuesRaised.filter((i) => !staffList(db).some((p) => p.id === i.reportedBy)).length} foot={<span className="muted" style={{ fontSize: 12.5 }}>not reported by staff</span>} />
      </div>

      {rep.rows.length > 0 && (
        <>
          <SectionHead title="Day by day" />
          <div className="tblwrap" style={{ marginBottom: 18 }}>
            <table className="tbl">
              <thead>
                <tr>
                  <th>Date</th>
                  <th className="num">Done</th>
                  <th className="num">Total</th>
                  <th style={{ width: 200 }}>Completion</th>
                </tr>
              </thead>
              <tbody>
                {rep.rows.map((r) => (
                  <tr key={r.date}>
                    <td className="nowrap">{fmtMedium(r.date)}</td>
                    <td className="num">{r.done}</td>
                    <td className="num">{r.total}</td>
                    <td>
                      <div className="row" style={{ gap: 8 }}>
                        <div className="grow"><Bar pct={r.pct} tone={r.pct >= 90 ? 'ok' : r.pct >= 80 ? 'warn' : 'over'} /></div>
                        <span className="tnum" style={{ fontSize: 12.5, minWidth: 38, textAlign: 'right' }}>{r.pct}%</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <SectionHead title="Per person" sub="Completion from real task data, not opinion." />
      <List>
        {staffList(db).map((p) => {
          let done = 0;
          let total = 0;
          let c = from;
          // Closed days only, matching the overall score — today is still in progress.
          while (c <= to) {
            if (c < todayStr()) {
              (db.days[c] ?? []).filter((t) => t.assignedTo === p.id && !t.off).forEach((t) => {
                total++;
                if (t.done) done++;
              });
            }
            c = addDays(c, 1);
          }
          const pct = total ? Math.round((done / total) * 100) : 0;
          return (
            <Row
              key={p.id}
              left={<Avatar name={p.name} initials={p.initials} />}
              title={p.name}
              sub={`${done} of ${total} tasks in this period`}
              right={<><span className="tnum muted" style={{ fontSize: 13 }}>{pct}%</span><Ring pct={pct} size={34} /></>}
              onClick={() => navigate('staff', undefined, p.id)}
            />
          );
        })}
      </List>

      <SectionHead title="What goes fastest" sub="Real consumption. This is the number that tells you a minimum level is set wrong." />
      <List>
        {fast.map(({ item, weekly }) => (
          <Row
            key={item.id}
            title={item.name}
            sub={`${weekly} ${item.unit} a week · minimum ${item.min} · ${item.qty} in stock`}
            zone={item.zone}
            right={
              <Chip tone={weekly > item.min ? 'urgent' : weekly > item.min * 0.5 ? 'low' : 'ok'}>
                {weekly > item.min ? 'Minimum too low' : 'Minimum looks right'}
              </Chip>
            }
            caret={false}
          />
        ))}
        {!fast.length && <Row title="Not enough movement history yet" />}
      </List>

      {db.waste.filter((w) => w.date >= from).length > 0 && (
        <>
          <SectionHead title="Waste in this period" sub="Patterns matter more than any single entry." />
          <List>
            {db.waste
              .filter((w) => w.date >= from && w.date <= to)
              .map((w) => (
                <Row key={w.id} title={w.description} sub={`${fmtMedium(w.date)} · ${w.reason}`} right={w.approxValue ? <Chip tone="low">{money(w.approxValue, db.settings.currency)}</Chip> : undefined} caret={false} />
              ))}
          </List>
        </>
      )}
    </>
  );
}

/* ============================================================
   ALERTS
   ============================================================ */

export function Alerts() {
  const user = useUser();
  const db = useStore((s) => s.db);
  const [filter, setFilter] = React.useState<IssuePriority | 'all'>('all');
  const list = allAlerts(db, { money: can(db, user, 'money.view'), ownerOnly: can(db, user, 'money.viewOwner') });
  const shown = filter === 'all' ? list : list.filter((a) => a.priority === filter);

  const counts = (p: IssuePriority) => list.filter((a) => a.priority === p).length;

  return (
    <>
      <PageHead
        eyebrow="Alert centre"
        title="Everything that wants attention"
        sub="One query over the same data that fires the push notifications — so what you see and what was sent cannot diverge."
      />

      <div className="grid four" style={{ marginBottom: 16 }}>
        <Stat label="Urgent" value={counts('urgent')} tone={counts('urgent') ? 'crit' : undefined} onClick={() => setFilter('urgent')} />
        <Stat label="High" value={counts('high')} tone={counts('high') ? 'warn' : undefined} onClick={() => setFilter('high')} />
        <Stat label="Normal" value={counts('normal')} onClick={() => setFilter('normal')} />
        <Stat label="Low" value={counts('low')} onClick={() => setFilter('low')} />
      </div>

      <div className="row wrap" style={{ gap: 8, marginBottom: 14 }}>
        <Seg
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'all', label: 'Everything', count: list.length },
            { value: 'urgent', label: 'Urgent' },
            { value: 'high', label: 'High' },
            { value: 'normal', label: 'Normal' },
            { value: 'low', label: 'Low' },
          ]}
        />
      </div>

      {shown.length ? (
        <div className="stack-sm">
          {shown.map((a: Alert) => (
            <Callout
              key={a.id}
              tone={a.priority === 'urgent' ? 'crit' : a.priority === 'high' ? 'warn' : undefined}
              title={
                <span className="row wrap" style={{ gap: 8 }}>
                  <Chip tone={a.priority === 'urgent' ? 'urgent' : a.priority === 'high' ? 'low' : 'plain'}>{a.kind}</Chip>
                  <span>{a.title}</span>
                  {a.zone && <ZoneChip zone={a.zone} />}
                  {a.ownerOnly && <Chip tone="bronze">Owner only</Chip>}
                </span>
              }
              action={<Btn size="xs" variant="ghost" onClick={() => (window.location.hash = a.url.slice(1))}>Open</Btn>}
            >
              {a.detail}
            </Callout>
          ))}
        </div>
      ) : (
        <Empty title="Nothing at this level">Everything at this priority is dealt with.</Empty>
      )}
    </>
  );
}

/* ============================================================
   NOTIFICATIONS
   ============================================================ */

export function Notifications() {
  const user = useUser();
  const db = useStore((s) => s.db);
  const markRead = useStore((s) => s.markNotificationsRead);
  const canManage = user.role === 'owner' || user.role === 'manager';
  const [tab, setTab] = React.useState<'mine' | 'health' | 'prefs'>('mine');

  const mine = db.notifications.filter((n) => n.profileId === user.id).sort((a, b) => b.createdAt - a.createdAt);
  const unread = unreadFor(db, user.id);
  const quiet = quietDevices(db);
  const pref = db.notifPrefs.find((p) => p.profileId === user.id);

  return (
    <>
      <PageHead
        eyebrow="Notifications"
        title="What was pushed"
        sub="Web push, no email. An iOS device only accepts push once the app is on the Home Screen and permission is granted from a tap inside it."
        tools={unread.length ? <Btn size="sm" variant="ghost" onClick={() => markRead(user.id)}>Mark all read</Btn> : undefined}
      />

      <div className="row wrap" style={{ gap: 8, marginBottom: 14 }}>
        <Seg
          value={tab}
          onChange={setTab}
          options={[
            { value: 'mine', label: 'Mine', count: unread.length },
            ...(canManage ? [{ value: 'health' as const, label: 'Delivery health', count: quiet.length }] : []),
            { value: 'prefs', label: 'What I receive' },
          ]}
        />
      </div>

      {tab === 'mine' && (
        mine.length ? (
          <List>
            {mine.map((n) => (
              <Row
                key={n.id}
                title={n.title}
                sub={`${n.body} · ${timeAgo(n.createdAt)}`}
                right={
                  <>
                    <Chip tone={n.priority === 'urgent' ? 'urgent' : n.priority === 'high' ? 'low' : 'plain'}>{n.kind.replace('_', ' ')}</Chip>
                    {!n.readAt && <Chip tone="info">New</Chip>}
                  </>
                }
                onClick={() => (window.location.hash = n.url.slice(1))}
              />
            ))}
          </List>
        ) : (
          <Empty title="Nothing yet">Anything sent to you appears here, whether or not the push arrived.</Empty>
        )
      )}

      {tab === 'health' && (
        <>
          {quiet.length > 0 && (
            <div style={{ marginBottom: 14 }}>
              <Callout tone="warn" title={`${plural(quiet.length, 'device')} has gone quiet`}>
                Without this screen an unread urgent issue looks identical to a phone that silently
                unsubscribed three weeks ago.
              </Callout>
            </div>
          )}
          <SectionHead title="Every device" sub="Last successful delivery per person per device." />
          <div className="tblwrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Person</th>
                  <th>Device</th>
                  <th>Last seen</th>
                  <th>Last delivery</th>
                  <th>State</th>
                </tr>
              </thead>
              <tbody>
                {db.pushSubs.map((s) => (
                  <tr key={s.id}>
                    <td>{profileName(db, s.profileId)}</td>
                    <td>{s.device}</td>
                    <td className="nowrap">{timeAgo(s.lastSeen)}</td>
                    <td className="nowrap">{s.lastDelivery ? timeAgo(s.lastDelivery) : 'never'}</td>
                    <td>
                      <Chip tone={s.active ? 'ok' : 'urgent'}>{s.active ? 'Subscribed' : 'Gone quiet'}</Chip>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {tab === 'prefs' && pref && (
        <>
          <SectionHead title="Which classes reach you" sub="Muted classes are never queued at all." />
          <List>
            {(['assigned', 'reminder', 'escalation', 'response'] as const).map((c) => (
              <Row
                key={c}
                title={
                  c === 'assigned' ? 'Assigned work'
                  : c === 'reminder' ? 'Timed reminders'
                  : c === 'escalation' ? 'Escalations'
                  : 'Replies to what I raised'
                }
                sub={
                  c === 'assigned' ? "Today's list is ready, a job is assigned, something is reassigned"
                  : c === 'reminder' ? 'Meal service, school run, a vendor arriving, a scheduled deep clean'
                  : c === 'escalation' ? 'Urgent issues, approvals, stock at zero, bills, expiries, coverage gaps'
                  : 'When an issue is picked up or resolved, a comment, a parcel'
                }
                right={
                  <button
                    type="button"
                    className={cx('chip', pref.classes[c] ? 'ok' : 'plain')}
                    onClick={() => {
                      const next = db.notifPrefs.map((p) =>
                        p.profileId === user.id ? { ...p, classes: { ...p.classes, [c]: !p.classes[c] } } : p,
                      );
                      useStore.setState((s) => ({ db: { ...s.db, notifPrefs: next } }));
                    }}
                  >
                    {pref.classes[c] ? 'On' : 'Off'}
                  </button>
                }
                caret={false}
              />
            ))}
          </List>
          <SectionHead title="Quiet hours" />
          <Card>
            <KV rows={[['From', pref.quietFrom], ['Until', pref.quietTo]]} />
            <div className="muted" style={{ fontSize: 13, marginTop: 8 }}>
              Anything not urgent is held until the morning.
            </div>
          </Card>
        </>
      )}
    </>
  );
}

/* ============================================================
   SETTINGS / ADMIN
   ============================================================ */

export function Admin() {
  const db = useStore((s) => s.db);
  const route = useRoute();
  const openSheet = useStore((s) => s.openSheet);
  const resetAll = useStore((s) => s.resetAll);
  const regenerateDay = useStore((s) => s.regenerateDay);
  const tab = route.sub ?? 'areas';

  return (
    <>
      <PageHead
        eyebrow="Settings"
        title="The structure"
        sub="Areas, the task library, categories and household configuration. Structural edits are manager and owner only, and are refused while offline."
      />

      <div className="row wrap" style={{ gap: 8, marginBottom: 14 }}>
        <Seg
          value={tab}
          onChange={(v) => navigate('admin', v)}
          options={[
            { value: 'areas', label: `Areas · ${db.areas.length}` },
            { value: 'library', label: `Task library · ${db.library.length}` },
            { value: 'categories', label: 'Categories' },
            { value: 'people', label: 'Accounts' },
            { value: 'house', label: 'House' },
            { value: 'data', label: 'Data' },
          ]}
        />
      </div>

      {tab === 'areas' && <Areas />}
      {tab === 'library' && <Library />}
      {tab === 'categories' && <Categories />}
      {tab === 'people' && <Accounts />}
      {tab === 'house' && <HouseSettings />}
      {tab === 'data' && (
        <>
          <SectionHead title="This build" sub="Everything is on this device, behind a storage adapter shaped like the real backend." />
          <Card style={{ marginBottom: 12 }}>
            <KV
              rows={[
                ['Storage', 'localStorage, via the adapter in lib/db.ts'],
                ['Materialised days', String(Object.keys(db.days).length)],
                ['Records', String(
                  db.issues.length + db.inventory.length + db.assets.length + db.transactions.length +
                  db.documents.length + db.visitors.length + db.deliveries.length,
                )],
                ['Conflict rules', 'Last write · append only · online only — declared in lib/db.ts'],
              ]}
            />
          </Card>
          <div className="row wrap" style={{ gap: 8 }}>
            <Btn variant="ghost" onClick={regenerateDay}>Rebuild today from the library</Btn>
            <Btn variant="danger" onClick={() => { if (confirm('Reset everything back to the seeded example data?')) void resetAll(); }}>
              Reset to seed data
            </Btn>
            <Btn variant="ghost" onClick={() => openSheet('export')}>Export as JSON</Btn>
          </div>
        </>
      )}
    </>
  );
}

function Areas() {
  const db = useStore((s) => s.db);
  const openSheet = useStore((s) => s.openSheet);
  const zoneFilter = useStore((s) => s.zoneFilter);
  let list = db.areas;
  if (zoneFilter !== 'all') list = list.filter((a) => a.zone === zoneFilter);

  return (
    <>
      <SectionHead
        title="The floor plan"
        sub="Every room carries a zone. This is the first thing to correct with the real layout."
        action={<Btn size="xs" variant="ghost" onClick={() => openSheet('area-new')}>Add an area</Btn>}
      />
      <div className="row wrap" style={{ gap: 8, marginBottom: 12 }}>
        <ZoneFilterBar />
      </div>
      <List>
        {list.map((a) => (
          <Row
            key={a.id}
            title={a.name}
            sub={`${a.type} · ${a.floor}${a.use ? ` · ${a.use} use` : ''} · deep clean ${a.deepFreq ? `every ${a.deepFreq} days on ${DOW[a.deepDow]}` : 'not scheduled'}`}
            zone={a.zone}
            right={
              <>
                {a.status !== 'active' && <Chip tone={a.status === 'guest' ? 'bronze' : a.status === 'unused' ? 'plain' : 'info'}>{a.status}</Chip>}
                {!a.active && <Chip tone="plain">Off</Chip>}
              </>
            }
            onClick={() => openSheet('area-edit', a.id)}
          />
        ))}
      </List>
    </>
  );
}

function Library() {
  const db = useStore((s) => s.db);
  const openSheet = useStore((s) => s.openSheet);
  const [cat, setCat] = React.useState('all');
  const [q, setQ] = React.useState('');
  let list = db.library;
  if (cat !== 'all') list = list.filter((t) => t.categoryId === cat);
  if (q) list = list.filter((t) => t.text.toLowerCase().includes(q.toLowerCase()));

  return (
    <>
      <SectionHead
        title="Where every task comes from"
        sub="Nothing in the checklist is hard-coded. Change a task here and it changes on every future day."
        action={<Btn size="xs" variant="ghost" onClick={() => openSheet('lib-new')}>Add a task</Btn>}
      />
      <div className="row wrap" style={{ gap: 8, marginBottom: 12 }}>
        <select className="in" style={{ width: 'auto', minHeight: 36 }} value={cat} onChange={(e) => setCat(e.target.value)}>
          <option value="all">Every category</option>
          {db.taskCategories.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        <input className="in" style={{ width: 'auto', minHeight: 36, flex: '1 1 200px' }} placeholder="Search the library" value={q} onChange={(e) => setQ(e.target.value)} />
        <Chip tone="plain">{plural(list.length, 'task')}</Chip>
      </div>
      <List>
        {list.map((t) => (
          <Row
            key={t.id}
            title={t.text}
            sub={`${freqLabel(t, DOW)} · ${t.apply === 'global' ? 'once' : t.apply === 'areaType' ? `every ${t.areaType}` : t.apply === 'area' ? areaName(db, t.areaId) : `every ${t.zone} area`} · ${t.role} · ${t.estMinutes}m${t.defaultTime ? ` · at ${t.defaultTime}` : ''}`}
            zone={t.zone === 'any' ? undefined : t.zone}
            right={<>{t.light && <Chip tone="plain">Light</Chip>}{!t.active && <Chip tone="plain">Off</Chip>}</>}
            onClick={() => openSheet('lib-edit', t.id)}
          />
        ))}
      </List>
    </>
  );
}

function Categories() {
  const db = useStore((s) => s.db);
  return (
    <>
      <SectionHead title="Task categories" sub="The grouping and order the checklist uses." />
      <List>
        {db.taskCategories.map((c) => (
          <Row
            key={c.id}
            left={<span style={{ fontSize: 18, width: 22, textAlign: 'center' }}>{c.icon}</span>}
            title={c.name}
            sub={`order ${c.order}${c.system ? ` · generated from ${c.system}` : ''} · ${db.library.filter((t) => t.categoryId === c.id).length} library tasks`}
            right={c.zone !== 'any' ? <ZoneChip zone={c.zone} /> : undefined}
            caret={false}
          />
        ))}
      </List>

      <SectionHead title="Inventory categories" />
      <List>
        {db.inventoryCategories.map((c) => (
          <Row key={c.id} title={c.name} sub={`${db.inventory.filter((i) => i.categoryId === c.id).length} items`} zone={c.zone} caret={false} />
        ))}
      </List>

      <SectionHead title="Expense categories" />
      <List>
        {db.expenseCategories.map((c) => (
          <Row key={c.id} title={c.name} sub={c.kind} zone={c.zone} caret={false} />
        ))}
      </List>
    </>
  );
}

function Accounts() {
  const db = useStore((s) => s.db);
  const byRole = ['owner', 'manager', 'staff', 'family', 'requester'] as const;
  return (
    <>
      <SectionHead
        title="Who has an account"
        sub="Five roles. In production each is a real Supabase account, and every rule below is a row-level security policy rather than a hidden menu."
      />
      {byRole.map((r) => (
        <Group
          key={r}
          name={roleLabel(db, r)}
          meta={plural(db.profiles.filter((p) => p.role === r).length, 'account')}
          defaultOpen={r !== 'requester'}
        >
          {db.profiles
            .filter((p) => p.role === r)
            .map((p) => (
              <Row
                key={p.id}
                left={<Avatar name={p.name} initials={p.initials} />}
                title={p.name}
                sub={`${p.email || 'no email'}${p.staffRoles.length ? ` · ${p.staffRoles.join(', ')}` : ''}`}
                right={!p.active ? <Chip tone="plain">Inactive</Chip> : undefined}
                caret={false}
              />
            ))}
        </Group>
      ))}
    </>
  );
}

function HouseSettings() {
  const db = useStore((s) => s.db);
  const showToast = useStore((s) => s.showToast);
  const [s, setS] = React.useState(db.settings);
  const save = () => {
    useStore.setState((st) => ({ db: { ...st.db, settings: s } }));
    showToast('Settings saved');
  };

  return (
    <>
      <SectionHead title="House" />
      <Card style={{ marginBottom: 12 }}>
        <div className="two">
          <Field label="House name"><Text value={s.house} onChange={(v) => setS({ ...s, house: v })} /></Field>
          <Field label="Currency"><Text value={s.currency} onChange={(v) => setS({ ...s, currency: v })} /></Field>
        </div>
        <div className="three-col">
          <Field label="Default portions"><Text type="number" value={String(s.portionDefault)} onChange={(v) => setS({ ...s, portionDefault: Number(v) })} /></Field>
          <Field label="Alert lead, days" hint="How far ahead expiries are flagged."><Text type="number" value={String(s.alertLeadDays)} onChange={(v) => setS({ ...s, alertLeadDays: Number(v) })} /></Field>
          <Field label="Parity epoch" hint="Fortnightly cycles are measured from here."><Text type="date" value={s.parityEpoch} onChange={(v) => setS({ ...s, parityEpoch: v })} /></Field>
        </div>
        <SectionHead title="Planner window" />
        <div className="two">
          <Field label="Day starts"><Text type="time" value={s.planStart} onChange={(v) => setS({ ...s, planStart: v })} /></Field>
          <Field label="Day ends"><Text type="time" value={s.planEnd} onChange={(v) => setS({ ...s, planEnd: v })} /></Field>
        </div>
        <SectionHead title="The working week" sub="Which days the cooks and the deliveries keep to, and what counts as out of hours in the visitor log. The prayers do not keep to it, which is why the sheet runs seven days a week." />
        <div className="two">
          <Field label="Day starts"><Text type="time" value={s.workingWeek.start} onChange={(v) => setS({ ...s, workingWeek: { ...s.workingWeek, start: v } })} /></Field>
          <Field label="Day ends"><Text type="time" value={s.workingWeek.end} onChange={(v) => setS({ ...s, workingWeek: { ...s.workingWeek, end: v } })} /></Field>
        </div>
        <SectionHead title="Meal times" />
        <div className="three-col">
          {Object.keys(s.mealTimes).map((k) => (
            <Field key={k} label={k}>
              <Text type="time" value={s.mealTimes[k]!} onChange={(v) => setS({ ...s, mealTimes: { ...s.mealTimes, [k]: v } })} />
            </Field>
          ))}
        </div>
        <Btn onClick={save} style={{ marginTop: 8 }}>Save settings</Btn>
      </Card>

      <SectionHead title="Laundry rota" sub="One person or category a day. Sunday is deliberately a catch-up day." />
      <List>
        {[1, 2, 3, 4, 5, 6, 0].map((d) => (
          <Row
            key={d}
            title={DOW[d]}
            sub={(db.settings.laundry[d] ?? []).map((x) => `${x.person} · ${x.type}`).join(' / ') || '—'}
            caret={false}
          />
        ))}
      </List>
    </>
  );
}

/* ---------- library and area sheets ---------- */

export function LibSheet({ id }: { id?: string }) {
  const db = useStore((s) => s.db);
  const closeSheet = useStore((s) => s.closeSheet);
  const upsert = useStore((s) => s.upsert);
  const remove = useStore((s) => s.remove);
  const regenerateDay = useStore((s) => s.regenerateDay);
  const existing = id ? db.library.find((t) => t.id === id) : undefined;
  const [f, setF] = React.useState<LibraryTask>(
    existing ?? {
      id: '', categoryId: db.taskCategories[0]!.id, text: '', apply: 'global', zone: 'any',
      freq: 'daily', dow: 1, parity: 0, instructions: '', role: 'housekeeping',
      estMinutes: 15, groupAs: '', light: false, order: 900, active: true,
    } as LibraryTask,
  );
  const set = (k: keyof LibraryTask, v: unknown) => setF((p) => ({ ...p, [k]: v }));

  return (
    <Sheet
      title={existing ? 'Edit library task' : 'New library task'}
      sub="Changes take effect on every future day. Rebuild today afterwards to see it now."
      onClose={closeSheet}
      wide
      footer={
        <>
          <Btn className="grow" disabled={!f.text} onClick={() => { upsert('library', f, 'Library task saved'); regenerateDay(); closeSheet(); }}>Save &amp; rebuild today</Btn>
          {existing && <Btn variant="danger" size="sm" onClick={() => { remove('library', existing.id, 'Task removed'); regenerateDay(); closeSheet(); }}>Delete</Btn>}
          <Btn variant="ghost" onClick={closeSheet}>Cancel</Btn>
        </>
      }
    >
      <Field label="What the task says"><Text value={f.text} onChange={(v) => set('text', v)} autoFocus /></Field>
      <div className="three-col">
        <Field label="Category">
          <Select value={f.categoryId} onChange={(v) => set('categoryId', v)} options={db.taskCategories.map((c) => ({ value: c.id, label: c.name }))} />
        </Field>
        <Field label="Which role does it" hint="Drives the automatic routing.">
          <Select value={f.role} onChange={(v) => set('role', v)} options={STAFF_ROLES.map((r) => ({ value: r, label: r }))} />
        </Field>
        <Field label="Minutes"><Text type="number" value={String(f.estMinutes)} onChange={(v) => set('estMinutes', Number(v))} /></Field>
      </div>

      <SectionHead title="Where it applies" />
      <div className="three-col">
        <Field label="Scope">
          <Select
            value={f.apply}
            onChange={(v) => set('apply', v)}
            options={[
              { value: 'global', label: 'Once a day, not per area' },
              { value: 'areaType', label: 'Every area of a type' },
              { value: 'area', label: 'One named area' },
            ]}
          />
        </Field>
        {f.apply === 'areaType' && (
          <Field label="Area type">
            <Select
              value={f.areaType ?? ''}
              onChange={(v) => set('areaType', v)}
              options={['bedroom', 'bathroom', 'kitchen', 'living', 'shrine', 'prayer', 'utility', 'storage', 'outdoor', 'circulation'].map((t) => ({ value: t, label: t }))}
            />
          </Field>
        )}
        {f.apply === 'area' && (
          <Field label="Which area">
            <Select value={f.areaId ?? ''} onChange={(v) => set('areaId', v)} options={db.areas.filter((a) => a.active).map((a) => ({ value: a.id, label: a.name }))} />
          </Field>
        )}
      </div>

      <SectionHead title="How often" />
      <div className="three-col">
        <Field label="Frequency">
          <Select
            value={f.freq}
            onChange={(v) => set('freq', v)}
            options={[
              { value: 'daily', label: 'Every day' },
              { value: 'weekdays', label: 'Working days only' },
              { value: 'weekly', label: 'Weekly' },
              { value: 'fortnightly', label: 'Fortnightly' },
              { value: 'monthly', label: 'Monthly, first of that day' },
              { value: 'areaDeep', label: "The area's deep-clean cycle" },
            ]}
          />
        </Field>
        {['weekly', 'fortnightly', 'monthly'].includes(f.freq) && (
          <Field label="Which day">
            <Select value={String(f.dow)} onChange={(v) => set('dow', Number(v))} options={DOW.map((d, i) => ({ value: String(i), label: d }))} />
          </Field>
        )}
        {f.freq === 'fortnightly' && (
          <Field label="Which week">
            <Select value={String(f.parity)} onChange={(v) => set('parity', Number(v))} options={[{ value: '0', label: 'Week A' }, { value: '1', label: 'Week B' }]} />
          </Field>
        )}
        <Field label="Time of day" hint="Optional. Sets where it lands on the planner.">
          <Text type="time" value={f.defaultTime ?? ''} onChange={(v) => set('defaultTime', v || undefined)} />
        </Field>
      </div>

      <Field label="Group under" hint="Groups related tasks in the checklist — Morning, Plants, that person's laundry.">
        <Text value={f.groupAs} onChange={(v) => set('groupAs', v)} />
      </Field>
      <Field label="Instructions" hint="What good looks like, and the thing people get wrong.">
        <textarea className="in" rows={3} value={f.instructions} onChange={(e) => set('instructions', e.target.value)} />
      </Field>
      <label className="check">
        <input type="checkbox" checked={f.light} onChange={(e) => set('light', e.target.checked)} />
        <span>Light task — still runs in unused rooms on their reduced schedule</span>
      </label>
      <label className="check">
        <input type="checkbox" checked={f.active} onChange={(e) => set('active', e.target.checked)} />
        <span>Active</span>
      </label>
    </Sheet>
  );
}

export function AreaSheet({ id }: { id?: string }) {
  const db = useStore((s) => s.db);
  const closeSheet = useStore((s) => s.closeSheet);
  const upsert = useStore((s) => s.upsert);
  const regenerateDay = useStore((s) => s.regenerateDay);
  const existing = id ? db.areas.find((a) => a.id === id) : undefined;
  const [f, setF] = React.useState(
    existing ?? {
      id: '', name: '', type: 'bedroom', zone: 'household', floor: 'Lower', status: 'active',
      deepFreq: 14, deepDow: 1, parity: 0, standard: '', active: true,
    } as (typeof db.areas)[number],
  );
  const set = (k: string, v: unknown) => setF((p) => ({ ...p, [k]: v }));

  return (
    <Sheet
      title={existing ? existing.name : 'New area'}
      sub="The zone is the important field — it decides which checklist, which inventory and which cost centre."
      onClose={closeSheet}
      footer={
        <>
          <Btn className="grow" disabled={!f.name} onClick={() => { upsert('areas', f, 'Area saved'); regenerateDay(); closeSheet(); }}>Save &amp; rebuild today</Btn>
          <Btn variant="ghost" onClick={closeSheet}>Cancel</Btn>
        </>
      }
    >
      <Field label="Name"><Text value={f.name} onChange={(v) => set('name', v)} autoFocus /></Field>
      <div className="three-col">
        <Field label="Type">
          <Select
            value={f.type}
            onChange={(v) => set('type', v)}
            options={['bedroom', 'bathroom', 'kitchen', 'living', 'shrine', 'prayer', 'utility', 'storage', 'outdoor', 'circulation'].map((t) => ({ value: t, label: t }))}
          />
        </Field>
        <Field label="Floor"><Text value={f.floor} onChange={(v) => set('floor', v)} /></Field>
      </div>
      <div className="three-col">
        <Field label="Status">
          <Select
            value={f.status}
            onChange={(v) => set('status', v)}
            options={[
              { value: 'active', label: 'In use' },
              { value: 'occupied', label: 'Occupied bedroom' },
              { value: 'guest', label: 'Kept guest-ready' },
              { value: 'unused', label: 'Unused — reduced schedule' },
            ]}
          />
        </Field>
        <Field label="Deep clean every">
          <Select
            value={String(f.deepFreq)}
            onChange={(v) => set('deepFreq', Number(v))}
            options={[
              { value: '0', label: 'Not scheduled' },
              { value: '7', label: '7 days' },
              { value: '14', label: '14 days' },
              { value: '30', label: 'Monthly' },
            ]}
          />
        </Field>
        <Field label="On which day">
          <Select value={String(f.deepDow)} onChange={(v) => set('deepDow', Number(v))} options={DOW.map((d, i) => ({ value: String(i), label: d }))} />
        </Field>
      </div>
      {f.type === 'bathroom' && (
        <Field label="Use level" hint="High-use bathrooms get an extra midday pass.">
          <Select value={f.use ?? 'low'} onChange={(v) => set('use', v)} options={[{ value: 'high', label: 'High' }, { value: 'low', label: 'Lower' }]} />
        </Field>
      )}
      <Field label="The standard" hint="What this room should look like when it is right.">
        <textarea className="in" rows={2} value={f.standard} onChange={(e) => set('standard', e.target.value)} />
      </Field>
      <label className="check">
        <input type="checkbox" checked={f.active} onChange={(e) => set('active', e.target.checked)} />
        <span>Active — include in the schedule</span>
      </label>
    </Sheet>
  );
}

export function ExportSheet() {
  const db = useStore((s) => s.db);
  const closeSheet = useStore((s) => s.closeSheet);
  const json = JSON.stringify(db, null, 2);
  return (
    <Sheet
      title="Export"
      sub={`${Math.round(json.length / 1024)}KB of JSON — the whole database as it stands.`}
      onClose={closeSheet}
      wide
      footer={
        <>
          <a
            className="btn grow"
            href={URL.createObjectURL(new Blob([json], { type: 'application/json' }))}
            download={`penthouse-${todayStr()}.json`}
          >
            Download
          </a>
          <Btn variant="ghost" onClick={closeSheet}>Close</Btn>
        </>
      }
    >
      <textarea className="in mono" rows={16} readOnly value={json.slice(0, 4000) + (json.length > 4000 ? '\n\n… truncated for display' : '')} style={{ fontSize: 11.5 }} />
    </Sheet>
  );
}
