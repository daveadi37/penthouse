import React from 'react';
import {useStore, useUser} from '@/store';
import {detailId, navigate, useRoute} from '@/lib/router';
import {DOW, addDays, daysUntil, diffDays, fmt, fmtMedium, fmtShort, today as todayStr} from '@/lib/date';
import {money, plural} from '@/lib/format';
import {isAbsent, isWorking, progress} from '@/lib/schedule';
import {profileName, staffList} from '@/lib/selectors';
import type { Absence, StaffDetails } from '@/types';
import {Avatar, Bar, Btn, Card, Chip, Empty, Field, KV, List, PageHead, Row, SectionHead, Seg, Select, Sheet, Stat, Text} from '@/components/ui';

export function Staff() {
  const route = useRoute();
  const user = useUser();
  if (user.role === 'staff') return <MyRecord id={user.id} />;
  const id = detailId(route);
  if (id) return <StaffDetail id={id} />;
  return <StaffOverview />;
}

function StaffOverview() {
  const user = useUser();
  const db = useStore((s) => s.db);
  const openSheet = useStore((s) => s.openSheet);
  const patch = useStore((s) => s.patch);
  const [tab, setTab] = React.useState<'people' | 'rota' | 'leave' | 'attendance'>('people');

  const isOwner = user.role === 'owner';
  const staff = staffList(db);
  const pendingLeave = db.leave.filter((l) => l.status === 'requested');
  const expiringSoon = db.staffDetails.filter(
    (s) => Math.min(daysUntil(s.visaExpiry), daysUntil(s.passportExpiry), daysUntil(s.medicalExpiry)) < 60,
  );

  return (
    <>
      <PageHead
        eyebrow="Staff"
        title={`${plural(staff.length, 'person', 'people')} who work here`}
        sub={isOwner ? 'Contracts, expiries, leave and pay.' : 'Rota, leave and attendance. Pay and contracts are owner-only.'}
        tools={<Btn size="sm" variant="ghost" onClick={() => openSheet('absence-new')}>Record an absence</Btn>}
      />

      <div className="grid four" style={{ marginBottom: 16 }}>
        <Stat label="On today" value={staff.filter((p) => isWorking(p.id, todayStr(), db.shifts, db.absences)).length} foot={<span className="muted" style={{ fontSize: 12.5 }}>of {staff.length}</span>} />
        <Stat label="Leave awaiting approval" value={pendingLeave.length} tone={pendingLeave.length ? 'warn' : undefined} onClick={() => setTab('leave')} />
        <Stat label="Expiring within 60 days" value={expiringSoon.length} tone={expiringSoon.length ? 'crit' : undefined} />
        <Stat
          label="Hours last 3 weeks"
          value={Math.round(db.attendance.reduce((s, a) => s + (a.hours ?? 0), 0))}
          foot={<span className="muted" style={{ fontSize: 12.5 }}>across all staff</span>}
          onClick={() => setTab('attendance')}
        />
      </div>

      <div className="row wrap" style={{ gap: 8, marginBottom: 14 }}>
        <Seg
          value={tab}
          onChange={setTab}
          options={[
            { value: 'people', label: 'People' },
            { value: 'rota', label: 'Rota' },
            { value: 'leave', label: 'Leave', count: pendingLeave.length },
            { value: 'attendance', label: 'Attendance' },
          ]}
        />
      </div>

      {tab === 'people' && (
        <List>
          {staff.map((p) => {
            const d = db.staffDetails.find((s) => s.profileId === p.id);
            const absent = isAbsent(p.id, todayStr(), db.absences);
            const worst = d ? Math.min(daysUntil(d.visaExpiry), daysUntil(d.passportExpiry), daysUntil(d.medicalExpiry), daysUntil(d.contractEnd)) : 999;
            return (
              <Row
                key={p.id}
                left={<Avatar name={p.name} initials={p.initials} size="lg" />}
                title={p.name}
                sub={`${d?.roleTitle ?? p.staffRoles.join(', ')} · day off ${DOW[db.shifts.find((s) => s.staffId === p.id)?.dayOff ?? 0]}${d?.livesIn ? ' · lives in' : ''}${isOwner && d?.salary ? ` · ${money(d.salary, db.settings.currency)}` : ''}`}
                right={
                  <>
                    {absent && <Chip tone="bronze">{absent.type}</Chip>}
                    <Chip tone={worst < 30 ? 'urgent' : worst < 90 ? 'low' : 'ok'}>
                      {worst < 0 ? 'Something expired' : `${worst}d to next expiry`}
                    </Chip>
                  </>
                }
                onClick={() => navigate('staff', undefined, p.id)}
              />
            );
          })}
        </List>
      )}

      {tab === 'rota' && <Rota />}

      {tab === 'leave' && (
        <>
          <SectionHead title="Requests" sub="Against an accruing entitlement of 30 days a year." />
          <List>
            {db.leave
              .slice()
              .sort((a, b) => b.requestedAt - a.requestedAt)
              .map((l) => {
                const d = db.staffDetails.find((s) => s.profileId === l.staffId);
                const taken = db.leave.filter((x) => x.staffId === l.staffId && (x.status === 'approved' || x.status === 'taken')).reduce((s, x) => s + x.days, 0);
                return (
                  <Row
                    key={l.id}
                    title={`${profileName(db, l.staffId)} · ${plural(l.days, 'day')} ${l.type.toLowerCase()}`}
                    sub={`${fmt(l.from)} → ${fmt(l.to)} · ${taken} of ${d?.leaveEntitlementDays ?? 30} days used${l.notes ? ` · ${l.notes}` : ''}`}
                    right={
                      l.status === 'requested' ? (
                        <>
                          <Btn size="xs" onClick={() => patch('leave', l.id, { status: 'approved', approvedBy: user.id }, 'Leave approved')}>Approve</Btn>
                          <Btn size="xs" variant="ghost" onClick={() => patch('leave', l.id, { status: 'declined' }, 'Leave declined')}>Decline</Btn>
                        </>
                      ) : (
                        <Chip tone={l.status === 'approved' || l.status === 'taken' ? 'ok' : 'urgent'}>{l.status}</Chip>
                      )
                    }
                    caret={false}
                  />
                );
              })}
            {!db.leave.length && <Row title="No leave recorded" />}
          </List>

          <SectionHead title="Absences on the calendar" />
          <List>
            {db.absences.map((a) => (
              <Row
                key={a.id}
                title={`${profileName(db, a.staffId)} · ${a.type}`}
                sub={`${fmt(a.from)} → ${fmt(a.to)} · ${plural(diffDays(a.from, a.to) + 1, 'day')}${a.notes ? ` · ${a.notes}` : ''}`}
                right={<Chip tone={daysUntil(a.from) <= 7 && daysUntil(a.to) >= 0 ? 'low' : 'plain'}>{daysUntil(a.from) > 0 ? `in ${daysUntil(a.from)}d` : daysUntil(a.to) >= 0 ? 'now' : 'past'}</Chip>}
                onClick={() => useStore.getState().openSheet('absence-edit', a.id)}
              />
            ))}
          </List>
        </>
      )}

      {tab === 'attendance' && <Attendance />}
    </>
  );
}

function Rota() {
  const db = useStore((s) => s.db);
  const staff = staffList(db);
  const days = Array.from({ length: 14 }, (_, i) => addDays(todayStr(), i));

  return (
    <>
      <SectionHead title="Next fortnight" sub="Coverage rules fill the gaps automatically — Earl drives on Marvin’s day off, and Marvin reheats what Rosie left on hers." />
      <div className="tblwrap">
        <table className="tbl">
          <thead>
            <tr>
              <th>Person</th>
              {days.map((d) => (
                <th key={d} style={{ textAlign: 'center' }}>
                  {DOW[new Date(d + 'T12:00:00').getDay()].slice(0, 1)}
                  <div className="faint" style={{ fontWeight: 400, fontSize: 10 }}>{new Date(d + 'T12:00:00').getDate()}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {staff.map((p) => (
              <tr key={p.id}>
                <td className="nowrap">
                  <div className="row" style={{ gap: 7 }}>
                    <Avatar name={p.name} initials={p.initials} size="sm" />
                    {p.name}
                  </div>
                </td>
                {days.map((d) => {
                  const absent = isAbsent(p.id, d, db.absences);
                  const working = isWorking(p.id, d, db.shifts, db.absences);
                  return (
                    <td key={d} style={{ textAlign: 'center', padding: '8px 4px' }}>
                      <span
                        title={absent ? absent.type : working ? 'Working' : 'Day off'}
                        style={{
                          display: 'inline-block', width: 16, height: 16, borderRadius: 4,
                          background: absent ? 'var(--bronze-soft)' : working ? 'var(--accent)' : 'var(--line)',
                          boxShadow: absent ? 'inset 0 0 0 1px var(--bronze)' : undefined,
                        }}
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <SectionHead title="Coverage rules" sub="Who picks up which role when the usual person is away." />
      <List>
        {db.coverage.map((c) => (
          <Row
            key={c.id}
            title={`${c.role} in ${c.zone}`}
            sub={`Covered by ${profileName(db, c.coverStaffId)}${c.notes ? ` · ${c.notes}` : ''}`}
            caret={false}
          />
        ))}
      </List>

      <SectionHead title="Shifts" />
      <List>
        {db.shifts.map((s) => (
          <Row
            key={s.id}
            title={profileName(db, s.staffId)}
            sub={`${s.start}–${s.end} · works ${s.days.map((d) => DOW[d].slice(0, 3)).join(', ')} · day off ${DOW[s.dayOff]}`}
            caret={false}
          />
        ))}
      </List>
    </>
  );
}

function Attendance() {
  const db = useStore((s) => s.db);
  const staff = staffList(db);
  const openSheet = useStore((s) => s.openSheet);

  return (
    <>
      <SectionHead title="Hours" sub="Recorded per day. Feeds the performance record rather than opinion." action={<Btn size="xs" variant="ghost" onClick={() => openSheet('attendance-new')}>Add an entry</Btn>} />
      <div className="grid three" style={{ marginBottom: 18 }}>
        {staff.map((p) => {
          const entries = db.attendance.filter((a) => a.staffId === p.id);
          const hours = entries.reduce((s, a) => s + (a.hours ?? 0), 0);
          const days = entries.length;
          return (
            <Card key={p.id}>
              <div className="eyebrow">{p.name}</div>
              <div className="serif" style={{ fontSize: 26, marginTop: 6 }}>{Math.round(hours)}h</div>
              <div className="muted" style={{ fontSize: 13 }}>
                over {plural(days, 'day')} · {days ? (hours / days).toFixed(1) : 0}h average
              </div>
            </Card>
          );
        })}
      </div>

      <div className="tblwrap">
        <table className="tbl">
          <thead>
            <tr>
              <th>Date</th>
              <th>Person</th>
              <th>In</th>
              <th>Out</th>
              <th className="num">Hours</th>
              <th>Notes</th>
            </tr>
          </thead>
          <tbody>
            {db.attendance
              .slice()
              .sort((a, b) => b.date.localeCompare(a.date))
              .slice(0, 60)
              .map((a) => (
                <tr key={a.id}>
                  <td className="nowrap">{fmtMedium(a.date)}</td>
                  <td>{profileName(db, a.staffId)}</td>
                  <td>{a.clockIn ?? '—'}</td>
                  <td>{a.clockOut ?? '—'}</td>
                  <td className="num">{a.hours ?? '—'}</td>
                  <td>{a.notes}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function StaffDetail({ id }: { id: string }) {
  const user = useUser();
  const db = useStore((s) => s.db);
  const openSheet = useStore((s) => s.openSheet);
  const p = db.profiles.find((x) => x.id === id);
  const d = db.staffDetails.find((s) => s.profileId === id);
  if (!p) return <Empty title="No such person" />;
  const isOwner = user.role === 'owner';

  const entries = db.attendance.filter((a) => a.staffId === id);
  const hours = entries.reduce((s, a) => s + (a.hours ?? 0), 0);
  const leaveTaken = db.leave.filter((l) => l.staffId === id && (l.status === 'approved' || l.status === 'taken')).reduce((s, l) => s + l.days, 0);
  const reviews = db.reviews.filter((r) => r.staffId === id);
  const docs = db.documents.filter((x) => x.linkedType === 'staff' && x.linkedId === id && (isOwner || x.visibility === 'manager'));

  const expiries: [string, string][] = d
    ? [
        ['Residence visa', d.visaExpiry],
        ['Passport', d.passportExpiry],
        ['Medical', d.medicalExpiry],
        ['Contract ends', d.contractEnd],
      ]
    : [];

  return (
    <>
      <PageHead
        eyebrow={d?.roleTitle ?? p.staffRoles.join(', ')}
        title={p.name}
        sub={`${p.phone}${d?.livesIn ? ' · lives in' : ''}`}
        tools={
          <>
            <Btn size="sm" variant="ghost" onClick={() => navigate('staff')}>‹ All staff</Btn>
            {isOwner && d && <Btn size="sm" variant="ghost" onClick={() => openSheet('staff-edit', d.id)}>Edit record</Btn>}
          </>
        }
      />

      <div className="grid four" style={{ marginBottom: 16 }}>
        <Stat label="Hours recorded" value={`${Math.round(hours)}h`} foot={<span className="muted" style={{ fontSize: 12.5 }}>{plural(entries.length, 'day')}</span>} />
        <Stat label="Leave used" value={`${leaveTaken}/${d?.leaveEntitlementDays ?? 30}`} foot={<Bar pct={d?.leaveEntitlementDays ? (leaveTaken / d.leaveEntitlementDays) * 100 : 0} />} />
        <Stat label="Completion" value={reviews[0]?.completionPct != null ? `${reviews[0].completionPct}%` : '—'} foot={<span className="muted" style={{ fontSize: 12.5 }}>last review period</span>} />
        {isOwner && d?.salary && <Stat label="Salary" value={money(d.salary, db.settings.currency)} foot={<span className="muted" style={{ fontSize: 12.5 }}>pay day {d.payDay}</span>} />}
      </div>

      <div className="grid two">
        <div>
          <SectionHead title="Expiries" sub="A visa renewal needs six months of passport validity — which is why the passport date matters more than it looks." />
          <List>
            {expiries.map(([label, date]) => {
              const days = daysUntil(date);
              return (
                <Row
                  key={label}
                  title={label}
                  sub={date ? fmtMedium(date) : '—'}
                  right={
                    <Chip tone={days < 0 ? 'urgent' : days < 30 ? 'urgent' : days < 90 ? 'low' : 'ok'}>
                      {days < 0 ? `${Math.abs(days)}d overdue` : `${days} days`}
                    </Chip>
                  }
                  caret={false}
                />
              );
            })}
            {!expiries.length && <Row title="No employment record" sub="Owner can add one." />}
          </List>

          {isOwner && d && (
            <>
              <SectionHead title="Employment" />
              <Card>
                <KV
                  rows={[
                    ['Role', d.roleTitle],
                    ['Contract', `${fmtMedium(d.contractStart)} → ${fmtMedium(d.contractEnd)}`],
                    ['Salary', money(d.salary, db.settings.currency)],
                    ['Pay day', `${d.payDay} of the month`],
                    ['Leave entitlement', `${d.leaveEntitlementDays} days`],
                    ['Lives in', d.livesIn ? 'Yes' : 'No'],
                    ['Emergency contact', `${d.emergencyContact} · ${d.emergencyPhone}`],
                    ['Notes', d.notes],
                  ]}
                />
              </Card>
            </>
          )}
        </div>

        <div>
          <SectionHead title={`Reviews · ${reviews.length}`} sub="Completion drawn from real task data." />
          {reviews.length ? (
            reviews.map((r) => (
              <Card key={r.id} style={{ marginBottom: 10 }}>
                <div className="between">
                  <div className="eyebrow">{fmtShort(r.periodStart)} → {fmtShort(r.periodEnd)}</div>
                  {r.completionPct != null && <Chip tone={r.completionPct >= 90 ? 'ok' : r.completionPct >= 80 ? 'low' : 'urgent'}>{r.completionPct}%</Chip>}
                </div>
                <div style={{ marginTop: 10 }}>
                  <div className="eyebrow">Strengths</div>
                  <div style={{ fontSize: 14.5, marginTop: 3 }}>{r.strengths}</div>
                </div>
                <div style={{ marginTop: 10 }}>
                  <div className="eyebrow">To work on</div>
                  <div style={{ fontSize: 14.5, marginTop: 3 }}>{r.development}</div>
                </div>
                {r.notes && (
                  <div style={{ marginTop: 10 }}>
                    <div className="eyebrow">Notes</div>
                    <div className="muted" style={{ fontSize: 14, marginTop: 3 }}>{r.notes}</div>
                  </div>
                )}
              </Card>
            ))
          ) : (
            <Empty title="No reviews yet" />
          )}

          <SectionHead title={`Documents · ${docs.length}`} />
          <List>
            {docs.map((x) => (
              <Row key={x.id} title={x.title} sub={`${x.cat} · expires ${x.expiryDate ? fmtMedium(x.expiryDate) : '—'}`} onClick={() => navigate('documents', undefined, x.id)} />
            ))}
            {!docs.length && <Row title="Nothing attached" />}
          </List>
        </div>
      </div>
    </>
  );
}

/* Staff see only their own record. */
function MyRecord({ id }: { id: string }) {
  const db = useStore((s) => s.db);
  const d = db.staffDetails.find((s) => s.profileId === id);
  const p = db.profiles.find((x) => x.id === id)!;
  const shift = db.shifts.find((s) => s.staffId === id);
  const days = Array.from({ length: 14 }, (_, i) => addDays(todayStr(), i));
  const entries = db.attendance.filter((a) => a.staffId === id);
  const hours = entries.reduce((s, a) => s + (a.hours ?? 0), 0);
  const leaveTaken = db.leave.filter((l) => l.staffId === id && (l.status === 'approved' || l.status === 'taken')).reduce((s, l) => s + l.days, 0);
  const myLeave = db.leave.filter((l) => l.staffId === id);

  return (
    <>
      <PageHead
        eyebrow="My record"
        title={p.name}
        sub={`${d?.roleTitle ?? ''} · regular day off ${DOW[shift?.dayOff ?? 0]}`}
      />

      <div className="grid three" style={{ marginBottom: 16 }}>
        <Stat label="Hours recorded" value={`${Math.round(hours)}h`} foot={<span className="muted" style={{ fontSize: 12.5 }}>{plural(entries.length, 'day')}</span>} />
        <Stat label="Leave used" value={`${leaveTaken} of ${d?.leaveEntitlementDays ?? 30}`} foot={<Bar pct={d?.leaveEntitlementDays ? (leaveTaken / d.leaveEntitlementDays) * 100 : 0} />} />
        <Stat label="Shift" value={shift ? `${shift.start}–${shift.end}` : '—'} />
      </div>

      <SectionHead title="Next fortnight" />
      <List>
        {days.map((dd, i) => {
          const absent = isAbsent(id, dd, db.absences);
          const working = isWorking(id, dd, db.shifts, db.absences);
          const tasks = (db.days[dd] ?? []).filter((t) => t.assignedTo === id);
          const o = progress(tasks);
          return (
            <Row
              key={dd}
              title={`${i === 0 ? 'Today' : DOW[new Date(dd + 'T12:00:00').getDay()]}`}
              sub={fmt(dd)}
              right={
                absent ? <Chip tone="bronze">{absent.type}</Chip>
                : !working ? <Chip tone="plain">Day off</Chip>
                : tasks.length ? <Chip tone={o.pct === 100 ? 'ok' : 'plain'}>{o.done}/{o.total} tasks</Chip>
                : <Chip tone="ok">Working</Chip>
              }
              caret={false}
            />
          );
        })}
      </List>

      <SectionHead title="My leave" />
      <List>
        {myLeave.map((l) => (
          <Row
            key={l.id}
            title={`${plural(l.days, 'day')} ${l.type.toLowerCase()}`}
            sub={`${fmt(l.from)} → ${fmt(l.to)}${l.notes ? ` · ${l.notes}` : ''}`}
            right={<Chip tone={l.status === 'approved' || l.status === 'taken' ? 'ok' : l.status === 'requested' ? 'low' : 'urgent'}>{l.status}</Chip>}
            caret={false}
          />
        ))}
        {!myLeave.length && <Row title="No leave recorded" />}
      </List>

      <div style={{ marginTop: 16 }}>
        <Card className="callout" pad={false} style={{ padding: '13px 16px' }}>
          <div className="muted" style={{ fontSize: 13.5 }}>
            Days off are set by the house manager. Nothing scheduled on your day off counts against the house.
          </div>
        </Card>
      </div>
    </>
  );
}

/* ---------- sheets ---------- */

export function AbsenceSheet({ id }: { id?: string }) {
  const db = useStore((s) => s.db);
  const closeSheet = useStore((s) => s.closeSheet);
  const upsert = useStore((s) => s.upsert);
  const remove = useStore((s) => s.remove);
  const existing = id ? db.absences.find((a) => a.id === id) : undefined;
  const [f, setF] = React.useState<Absence>(
    existing ?? { id: '', staffId: staffList(db)[0]?.id ?? '', from: todayStr(), to: todayStr(), type: 'Annual leave', notes: '' } as Absence,
  );
  const set = (k: keyof Absence, v: unknown) => setF((p) => ({ ...p, [k]: v }));

  return (
    <Sheet
      title={existing ? 'Edit absence' : 'Record an absence'}
      sub="Work routed to an absent person is marked off and not counted against the house."
      onClose={closeSheet}
      footer={
        <>
          <Btn className="grow" onClick={() => { upsert('absences', f, 'Absence saved'); closeSheet(); }}>Save</Btn>
          {existing && <Btn variant="danger" size="sm" onClick={() => { remove('absences', existing.id, 'Removed'); closeSheet(); }}>Delete</Btn>}
          <Btn variant="ghost" onClick={closeSheet}>Cancel</Btn>
        </>
      }
    >
      <Field label="Who">
        <Select value={f.staffId} onChange={(v) => set('staffId', v)} options={staffList(db).map((p) => ({ value: p.id, label: p.name }))} />
      </Field>
      <div className="three-col">
        <Field label="From"><Text type="date" value={f.from} onChange={(v) => set('from', v)} /></Field>
        <Field label="To"><Text type="date" value={f.to} onChange={(v) => set('to', v)} /></Field>
        <Field label="Type">
          <Select value={f.type} onChange={(v) => set('type', v)} options={['Day off', 'Annual leave', 'Sick', 'Unpaid', 'Public holiday'].map((t) => ({ value: t, label: t }))} />
        </Field>
      </div>
      <Field label="Notes" hint="Who is covering, and for what.">
        <textarea className="in" rows={2} value={f.notes} onChange={(e) => set('notes', e.target.value)} />
      </Field>
    </Sheet>
  );
}

export function StaffEditSheet({ id }: { id: string }) {
  const db = useStore((s) => s.db);
  const closeSheet = useStore((s) => s.closeSheet);
  const upsert = useStore((s) => s.upsert);
  const existing = db.staffDetails.find((s) => s.id === id);
  const [f, setF] = React.useState<StaffDetails>(existing!);
  if (!existing) return null;
  const set = (k: keyof StaffDetails, v: unknown) => setF((p) => ({ ...p, [k]: v }));

  return (
    <Sheet
      title={`${profileName(db, f.profileId)} — employment record`}
      sub="Owner only. Never visible to the manager or to other staff."
      onClose={closeSheet}
      wide
      footer={
        <>
          <Btn className="grow" onClick={() => { upsert('staffDetails', f, 'Record saved'); closeSheet(); }}>Save</Btn>
          <Btn variant="ghost" onClick={closeSheet}>Cancel</Btn>
        </>
      }
    >
      <Field label="Role title"><Text value={f.roleTitle} onChange={(v) => set('roleTitle', v)} /></Field>
      <div className="two">
        <Field label="Contract starts"><Text type="date" value={f.contractStart} onChange={(v) => set('contractStart', v)} /></Field>
        <Field label="Contract ends"><Text type="date" value={f.contractEnd} onChange={(v) => set('contractEnd', v)} /></Field>
      </div>
      <div className="three-col">
        <Field label="Visa expires"><Text type="date" value={f.visaExpiry} onChange={(v) => set('visaExpiry', v)} /></Field>
        <Field label="Passport expires"><Text type="date" value={f.passportExpiry} onChange={(v) => set('passportExpiry', v)} /></Field>
        <Field label="Medical expires"><Text type="date" value={f.medicalExpiry} onChange={(v) => set('medicalExpiry', v)} /></Field>
      </div>
      <div className="three-col">
        <Field label={`Salary, ${db.settings.currency}`}><Text type="number" value={String(f.salary ?? '')} onChange={(v) => set('salary', v ? Number(v) : undefined)} /></Field>
        <Field label="Pay day"><Text type="number" value={String(f.payDay)} onChange={(v) => set('payDay', Number(v))} /></Field>
        <Field label="Leave days a year"><Text type="number" value={String(f.leaveEntitlementDays)} onChange={(v) => set('leaveEntitlementDays', Number(v))} /></Field>
      </div>
      <label className="check">
        <input type="checkbox" checked={f.livesIn} onChange={(e) => set('livesIn', e.target.checked)} />
        <span>Lives in</span>
      </label>
      <div className="two">
        <Field label="Emergency contact"><Text value={f.emergencyContact} onChange={(v) => set('emergencyContact', v)} /></Field>
        <Field label="Their phone"><Text value={f.emergencyPhone} onChange={(v) => set('emergencyPhone', v)} /></Field>
      </div>
      <Field label="Notes"><textarea className="in" rows={3} value={f.notes} onChange={(e) => set('notes', e.target.value)} /></Field>
    </Sheet>
  );
}

export function AttendanceSheet() {
  const db = useStore((s) => s.db);
  const closeSheet = useStore((s) => s.closeSheet);
  const upsert = useStore((s) => s.upsert);
  const [f, setF] = React.useState({ staffId: staffList(db)[0]?.id ?? '', date: todayStr(), clockIn: '07:00', clockOut: '19:00', notes: '' });
  const hours = Math.round(((Number(f.clockOut.slice(0, 2)) * 60 + Number(f.clockOut.slice(3))) - (Number(f.clockIn.slice(0, 2)) * 60 + Number(f.clockIn.slice(3)))) / 6) / 10;

  return (
    <Sheet
      title="Record hours"
      onClose={closeSheet}
      footer={
        <>
          <Btn className="grow" onClick={() => { upsert('attendance', { ...f, hours, source: 'manual' }, 'Hours recorded'); closeSheet(); }}>Save</Btn>
          <Btn variant="ghost" onClick={closeSheet}>Cancel</Btn>
        </>
      }
    >
      <Field label="Who">
        <Select value={f.staffId} onChange={(v) => setF({ ...f, staffId: v })} options={staffList(db).map((p) => ({ value: p.id, label: p.name }))} />
      </Field>
      <div className="three-col">
        <Field label="Date"><Text type="date" value={f.date} onChange={(v) => setF({ ...f, date: v })} /></Field>
        <Field label="In"><Text type="time" value={f.clockIn} onChange={(v) => setF({ ...f, clockIn: v })} /></Field>
        <Field label="Out"><Text type="time" value={f.clockOut} onChange={(v) => setF({ ...f, clockOut: v })} /></Field>
      </div>
      <div className="row" style={{ marginBottom: 12 }}>
        <Chip tone="plain">{hours} hours</Chip>
      </div>
      <Field label="Notes"><Text value={f.notes} onChange={(v) => setF({ ...f, notes: v })} /></Field>
    </Sheet>
  );
}
