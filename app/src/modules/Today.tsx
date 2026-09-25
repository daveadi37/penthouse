import React from 'react';
import { useStore, useUser } from '@/store';
import { can, canAny, roleOf } from '@/lib/access';
import { navigate } from '@/lib/router';
import { fmt, fmtShort, fmtTime12, greeting, today as todayStr, daysUntil, toMinutes } from '@/lib/date';
import { money, plural, qty as qtyLabel } from '@/lib/format';
import { progress, coverageGaps, isWorking, isAbsent } from '@/lib/schedule';
import type { DB, InventoryItem, ShoppingItem } from '@/types';
import {
  activeGuest,
  allAlerts,
  atZero,
  awaitingApproval,
  belowMin,
  budgetLines,
  billsDue,
  daysOfCover,
  issuesFor,
  mealsOn,
  openIssues,
  assignedIssues,
  shoppingOpen,
  spendByZone,
  staffList,
  uncollected,
  upcomingEvents,
  urgentIssues,
  visitorsOnSite,
  occasionPct,
} from '@/lib/selectors';
import {
  Avatar,
  Btn,
  Callout,
  Card,
  Chip,
  Meter,
  PageHead,
  Ring,
  Row,
  SectionHead,
  Stat,
  Tile,
  ZoneChip,
  List,
  Empty,
} from '@/components/ui';

/**
 * Which dashboard somebody gets is decided by what they may do, never by
 * the name of their role. A house that invents a 'night cover' role gets
 * the right screen on the first day rather than after a release, and the
 * two roles that used to fall through the bottom of a role switch —
 * admin and helper — now land somewhere that makes sense.
 */
export function Today() {
  const db = useStore((s) => s.db);
  const user = useUser();
  if (canAny(db, user, 'money.viewOwner', 'settings.edit')) return <OwnerToday />;
  if (can(db, user, 'day.assign')) return <ManagerToday />;
  if (roleOf(db, user.role)?.works) return <StaffToday />;
  return <FamilyToday />;
}

function useDay() {
  const db = useStore((s) => s.db);
  const date = useStore((s) => s.date);
  const ensureDay = useStore((s) => s.ensureDay);
  React.useEffect(() => {
    ensureDay(date);
  }, [date, ensureDay]);
  return { db, date, tasks: db.days[date] ?? [] };
}

/* ============================================================
   The buy list, at the top of every dashboard.

   It is the thing the house actually runs out of. Everything below it
   on these screens is a report; this is the one card somebody acts on
   before they leave the building, so it leads and the tiles follow.

   The same card in three postures: the manager gets the buttons, the
   owner gets the number without them, and whoever is doing the shopping
   gets it as a list they can tap through in a shop with one hand.
   ============================================================ */

/** What to buy of something that has fallen below its minimum. */
const suggest = (i: InventoryItem): number => Math.max(i.min * 2 - i.qty, i.min);

interface BuyList {
  list: ShoppingItem[];
  open: ShoppingItem[];
  bought: number;
  low: InventoryItem[];
  /** Below minimum and not already on the list — the gap that bites. */
  missing: InventoryItem[];
}

function buyList(db: DB): BuyList {
  const list = db.shopping;
  const open = shoppingOpen(db);
  const low = belowMin(db);
  const missing = low.filter(
    (i) => !list.some((s) => s.name === i.name && s.status !== 'purchased'),
  );
  return { list, open, bought: list.length - open.length, low, missing };
}

/** The list as one message, ready to paste into the house group. */
function buyListText(db: DB): string {
  const { open, missing } = buyList(db);
  const out: string[] = [`Buy list — ${fmt(todayStr())}`, `Apartment 3808`, ''];

  open.forEach((s) =>
    out.push(`${s.name} — ${qtyLabel(s.qty, s.unit)}${s.notes ? ` · ${s.notes}` : ''}`),
  );

  if (missing.length) {
    out.push('', 'Below minimum, not on the list yet');
    missing.forEach((i) => {
      const cover = daysOfCover(db, i);
      out.push(
        `${i.name} — suggest ${qtyLabel(suggest(i), i.unit)} (${i.qty} of ${i.min} left${
          cover == null ? '' : `, about ${cover} days`
        })`,
      );
    });
  }

  if (!open.length && !missing.length) out.push('Nothing outstanding.');
  return out.join('\n');
}

function BuyListLead({ variant }: { variant: 'run' | 'watch' | 'mine' }) {
  const db = useStore((s) => s.db);
  const user = useUser();
  const upsert = useStore((s) => s.upsert);
  const patch = useStore((s) => s.patch);
  const showToast = useStore((s) => s.showToast);

  if (!can(db, user, 'inventory.view')) return null;
  const mayEdit = can(db, user, 'inventory.edit');
  const { list, open, bought, low, missing } = buyList(db);
  const out = atZero(db);
  const toBuy = open.length + missing.length;

  const addAllBelowMin = () => {
    missing.forEach((i) =>
      upsert(
        'shopping',
        {
          itemId: i.id,
          name: i.name,
          zone: i.zone,
          qty: suggest(i),
          unit: i.unit,
          status: 'needed',
          addedBy: user.id,
          addedAt: Date.now(),
          notes: i.notes,
        },
        'Added to the buy list',
      ),
    );
    showToast(
      missing.length
        ? `${plural(missing.length, 'item')} added — the list is complete`
        : 'Everything below minimum is already on the list',
    );
  };

  const copy = () => {
    if (!navigator.clipboard) {
      showToast('This browser will not let the app copy. Open Inventory and copy it from there.');
      return;
    }
    void navigator.clipboard.writeText(buyListText(db)).then(
      () => showToast('Copied — paste it into the house group'),
      () => showToast('Could not copy it. Open Inventory and copy it from there.'),
    );
  };

  if (!toBuy) {
    return (
      <div style={{ marginBottom: 16 }}>
        <Callout
          tone="ok"
          title="Nothing below minimum, the list is clear"
          action={
            <Btn size="xs" variant="ghost" onClick={() => navigate('inventory')}>
              Open stock
            </Btn>
          }
        >
          Everything tracked is above its level and nothing is waiting to be bought.
        </Callout>
      </div>
    );
  }

  /* Whoever is doing the shopping gets rows, not meters. One tap marks a
     line bought, because the other hand is holding a basket. */
  if (variant === 'mine') {
    const mine = open.filter((s) => s.addedBy === user.id).length;
    return (
      <div style={{ marginBottom: 14 }}>
        <Card>
          <div className="between wrap">
            <div className="grow">
              <div className="eyebrow">The buy list</div>
              <div className="serif" style={{ fontSize: 21, marginTop: 4 }}>
                {plural(toBuy, 'thing')} to buy
              </div>
              <div className="muted" style={{ fontSize: 13.5, marginTop: 4 }}>
                Tap a line once you have it. {mine ? `${mine} of them you added.` : 'Added by the house.'}
              </div>
            </div>
            <Chip tone={out.length ? 'urgent' : 'low'}>
              {out.length ? `${plural(out.length, 'item')} out` : `${bought} bought`}
            </Chip>
          </div>

          <div className="list flat" style={{ marginTop: 13 }}>
            {open.map((s) => (
              <button
                key={s.id}
                type="button"
                className="task"
                disabled={!mayEdit}
                onClick={() =>
                  patch(
                    'shopping',
                    s.id,
                    { status: 'purchased', purchasedAt: Date.now() },
                    `${s.name} bought`,
                  )
                }
              >
                <span className="box">✓</span>
                <span className="tx">
                  {s.name}
                  <span className="meta">
                    <b className="tnum">{qtyLabel(s.qty, s.unit)}</b>
                    {s.notes && <span>{s.notes}</span>}
                  </span>
                </span>
              </button>
            ))}
            {missing.map((i) => (
              <div key={i.id} className="task">
                <span className="box">·</span>
                <span className="tx">
                  {i.name}
                  <span className="meta">
                    <b className="tnum">suggest {qtyLabel(suggest(i), i.unit)}</b>
                    <span>not on the list yet</span>
                  </span>
                </span>
              </div>
            ))}
          </div>
        </Card>
      </div>
    );
  }

  const listPct = list.length ? Math.round((bought / list.length) * 100) : 100;
  const coverPct = low.length ? Math.round(((low.length - missing.length) / low.length) * 100) : 100;
  const spend = spendByZone(db, undefined, can(db, user, 'money.viewOwner'));

  return (
    <div style={{ marginBottom: 16 }}>
      <Card>
        <div className="between wrap">
          <div className="grow">
            <div className="eyebrow">The buy list</div>
            <div className="serif" style={{ fontSize: 23, marginTop: 4 }}>
              {plural(toBuy, 'thing')} to buy
            </div>
            <div className="muted" style={{ fontSize: 13.5, marginTop: 4 }}>
              {missing.length
                ? `${plural(missing.length, 'item')} below minimum and not on the list yet.`
                : 'Everything below minimum is on the list.'}
            </div>
          </div>
          <Chip tone={out.length ? 'urgent' : missing.length ? 'low' : 'ok'}>
            {out.length ? `${plural(out.length, 'item')} out completely` : 'Nothing out'}
          </Chip>
        </div>

        <div className="grid two" style={{ marginTop: 14 }}>
          <div>
            <div className="eyebrow" style={{ marginBottom: 8 }}>On the list</div>
            <Meter pct={listPct} left={`${bought} of ${list.length} bought`} />
          </div>
          <div>
            <div className="eyebrow" style={{ marginBottom: 8 }}>Below minimum, covered</div>
            <Meter pct={coverPct} left={`${low.length - missing.length} of ${low.length} on the list`} />
          </div>
        </div>

        {variant === 'run' && mayEdit && (
          <div className="row wrap" style={{ gap: 8, marginTop: 14 }}>
            <Btn onClick={addAllBelowMin} disabled={!missing.length}>
              Add everything below minimum
            </Btn>
            <Btn variant="ghost" onClick={copy}>Copy for WhatsApp</Btn>
            <Btn variant="ghost" onClick={() => navigate('inventory')}>Open stock</Btn>
          </div>
        )}

        {variant === 'watch' && (
          <>
            <hr className="hair" style={{ margin: '15px 0' }} />
            <div className="muted" style={{ fontSize: 13.5 }}>
              {money(spend.household, db.settings.currency)} spent across the house this month.
            </div>
          </>
        )}
      </Card>

      {out.length > 0 && (
        <div style={{ marginTop: 10 }}>
          <Callout
            tone="crit"
            title={`${plural(out.length, 'thing')} at zero`}
            action={
              <Btn size="xs" variant="ghost" onClick={() => navigate('inventory')}>
                Open stock
              </Btn>
            }
          >
            {out.map((i) => i.name).join(', ')} — none left at all, not merely low.
          </Callout>
        </div>
      )}
    </div>
  );
}

/* ============================================================
   MANAGER — the operational cockpit
   ============================================================ */

function ManagerToday() {
  const user = useUser();
  const { db, date, tasks } = useDay();
  const o = progress(tasks);
  const alerts = allAlerts(db, { money: can(db, user, 'money.view'), ownerOnly: can(db, user, 'money.viewOwner') });
  const gaps = coverageGaps(tasks);
  const meals = mealsOn(db, date);
  const guest = activeGuest(db);
  const events = upcomingEvents(db);
  const parcels = uncollected(db);
  const onSite = visitorsOnSite(db);

  /* With one zone left, a by-zone grid answers nothing. What a manager
     actually needs before 15:45 is which part of the day is slipping,
     so this groups by category instead and shows the four worst. */
  const byCategory = db.taskCategories
    .map((c) => ({ cat: c, ...progress(tasks.filter((t) => t.categoryId === c.id)) }))
    .filter((c) => c.total > 0)
    .sort((a, b) => a.pct - b.pct)
    .slice(0, 4);

  return (
    <>
      <PageHead
        eyebrow="In charge overall"
        title={`${greeting()}, ${user.name.split(' ')[0]}`}
        sub={fmt(date)}
      />

      <BuyListLead variant="run" />

      <div className="grid four" style={{ marginBottom: 16 }}>
        <Stat label="Today" value={`${o.pct}%`} foot={<span className="muted" style={{ fontSize: 12.5 }}>{o.done} of {o.total} done</span>} />
        <Stat label="Open issues" value={openIssues(db).length} tone={urgentIssues(db).length ? 'crit' : undefined} foot={urgentIssues(db).length ? <Chip tone="urgent">{plural(urgentIssues(db).length, 'urgent')}</Chip> : <Chip tone="ok">None urgent</Chip>} onClick={() => navigate('issues')} />
        <Stat label="Below minimum" value={belowMin(db).length} foot={<Chip tone={belowMin(db).length ? 'low' : 'ok'}>Buy list</Chip>} onClick={() => navigate('inventory')} />
        <Stat label="Awaiting you" value={awaitingApproval(db).length} foot={<span className="muted" style={{ fontSize: 12.5 }}>meal approvals</span>} onClick={() => navigate('cooking')} />
      </div>

      {alerts.filter((a) => a.priority === 'urgent').slice(0, 3).map((a) => (
        <div key={a.id} style={{ marginBottom: 10 }}>
          <Callout
            tone="crit"
            title={a.title}
            action={<Btn size="xs" variant="ghost" onClick={() => (window.location.hash = a.url.slice(1))}>Open</Btn>}
          >
            {a.kind} · {a.detail}
          </Callout>
        </div>
      ))}

      {gaps.length > 0 && (
        <div style={{ marginBottom: 10 }}>
          <Callout tone="warn" title={`${gaps.reduce((s, g) => s + g.count, 0)} tasks have nobody assigned`}>
            {gaps.map((g) => `${g.count} × ${g.role} in ${g.zone}`).join(' · ')} — nobody holding that role is
            working today.
          </Callout>
        </div>
      )}

      <SectionHead title="What is furthest behind" sub="The four categories with the least done. In that order, because that is the order to walk the house in." />
      <div className="grid four" style={{ marginBottom: 18 }}>
        {byCategory.map((z) => (
          <Card key={z.cat.id}>
            <div className="between">
              <div>
                <div className="eyebrow">{z.cat.icon} {z.cat.name}</div>
                <div className="serif" style={{ fontSize: 25, marginTop: 8 }}>{z.pct}%</div>
                <div className="muted" style={{ fontSize: 13 }}>{z.done} of {z.total} tasks</div>
              </div>
              <Ring pct={z.pct} />
            </div>
          </Card>
        ))}
      </div>

      <SectionHead title="Who is on today" action={<Btn size="xs" variant="ghost" onClick={() => navigate('planner')}>Open the planner</Btn>} />
      <List>
        {staffList(db).map((p) => {
          const mine = tasks.filter((t) => t.assignedTo === p.id);
          const mo = progress(mine);
          const absent = isAbsent(p.id, date, db.absences);
          const working = isWorking(p.id, date, db.shifts, db.absences);
          const shift = db.shifts.find((s) => s.staffId === p.id);
          return (
            <Row
              key={p.id}
              left={<Avatar name={p.name} initials={p.initials} />}
              title={p.name}
              sub={
                absent ? `${absent.type} — ${absent.notes || 'not working'}`
                : !working ? 'Day off'
                : `${p.staffRoles.join(', ')} · ${shift?.start}–${shift?.end}`
              }
              right={
                absent || !working ? (
                  <Chip tone="bronze">{absent ? absent.type : 'Day off'}</Chip>
                ) : (
                  <>
                    <span className="muted tnum" style={{ fontSize: 13 }}>{mo.done}/{mo.total}</span>
                    <Ring pct={mo.pct} size={34} />
                  </>
                )
              }
              onClick={() => navigate('planner')}
            />
          );
        })}
      </List>

      <SectionHead title="Meals today" action={<Btn size="xs" variant="ghost" onClick={() => navigate('cooking')}>Planner</Btn>} />
      {meals.length ? (
        <List>
          {meals.map((m) => (
            <Row
              key={m.id}
              title={`${m.type} · ${m.name}`}
              sub={`${fmtTime12(m.serveAt)} · ${plural(m.portions, 'portion')}${m.diet ? ` · ${m.diet}` : ''}`}
              zone={m.zone}
              right={<Chip tone={m.status === 'Submitted' ? 'low' : m.status === 'Changes requested' ? 'urgent' : m.status === 'Completed' ? 'ok' : 'info'}>{m.status}</Chip>}
              onClick={() => navigate('cooking', undefined, m.id)}
            />
          ))}
        </List>
      ) : (
        <Empty title="No meals planned for today">Nothing has been proposed. The planner is where Rosie submits a week at a time.</Empty>
      )}

      <SectionHead title="Coming up" />
      <div className="grid auto">
        {guest && (
          <Tile
            eyebrow="Guest"
            title={guest.name}
            sub={`${fmt(guest.arrival)} at ${fmtTime12(guest.arrivalTime)}`}
            foot={<Chip tone={occasionPct(guest.tasks) >= 80 ? 'ok' : 'bronze'}>{occasionPct(guest.tasks)}% prepared</Chip>}
            onClick={() => navigate('occasions', 'guests', guest.id)}
          />
        )}
        {events.slice(0, 2).map((e) => (
          <Tile
            key={e.id}
            eyebrow="Event"
            title={e.name}
            sub={`${fmtShort(e.date)} · ${fmtTime12(e.start)} · ${plural(e.headcount, 'person', 'people')}`}
            foot={<Chip tone={occasionPct(e.tasks) >= 80 ? 'ok' : 'bronze'}>{occasionPct(e.tasks)}% prepared</Chip>}
            onClick={() => navigate('occasions', 'events', e.id)}
          />
        ))}
        <Tile
          eyebrow="Reception"
          title={`${onSite.length} on site`}
          sub={onSite.length ? onSite.map((v) => v.name).join(', ') : 'No visitors signed in'}
          foot={<Chip tone={parcels.length ? 'low' : 'ok'}>{plural(parcels.length, 'parcel')} waiting</Chip>}
          onClick={() => navigate('people', 'visitors')}
        />
        <Tile
          eyebrow="This month"
          title={money(Object.values(spendByZone(db, undefined, can(db, user, 'money.viewOwner'))).reduce((a, b) => a + b, 0))}
          sub={`${billsDue(db, 14, can(db, user, 'money.viewOwner')).length} bills due in the next fortnight`}
          foot={
            budgetLines(db, undefined, can(db, user, 'money.viewOwner')).some((l) => l.pct > 100) ? (
              <Chip tone="urgent">Over on {budgetLines(db, undefined, can(db, user, 'money.viewOwner')).filter((l) => l.pct > 100).length}</Chip>
            ) : (
              <Chip tone="ok">Within budget</Chip>
            )
          }
          onClick={() => navigate('money')}
        />
      </div>
    </>
  );
}

/* ============================================================
   OWNER — the same operation, plus money and people
   ============================================================ */

function OwnerToday() {
  const user = useUser();
  const { db, date, tasks } = useDay();
  const o = progress(tasks);
  const alerts = allAlerts(db, { money: can(db, user, 'money.view'), ownerOnly: can(db, user, 'money.viewOwner') });
  const spend = spendByZone(db, undefined, can(db, user, 'money.viewOwner'));
  const total = Object.values(spend).reduce((a, b) => a + b, 0);
  const over = budgetLines(db, undefined, can(db, user, 'money.viewOwner')).filter((l) => l.pct > 100);

  return (
    <>
      <PageHead eyebrow="Owner" title={`${greeting()}, ${user.name.split(' ')[0]}`} sub={fmt(date)} />

      <BuyListLead variant="watch" />

      <div className="grid four" style={{ marginBottom: 16 }}>
        <Stat label="House today" value={`${o.pct}%`} foot={<span className="muted" style={{ fontSize: 12.5 }}>{o.done} of {o.total}</span>} />
        <Stat label="Spend this month" value={money(total)} foot={<span className="muted" style={{ fontSize: 12.5 }}>everything recorded</span>} onClick={() => navigate('money')} />
        <Stat label="Over budget" value={over.length} tone={over.length ? 'warn' : undefined} foot={<span className="muted" style={{ fontSize: 12.5 }}>{over.length ? over[0]!.name : 'nothing'}</span>} onClick={() => navigate('money')} />
        <Stat label="Needs you" value={alerts.filter((a) => a.priority === 'urgent').length} tone={alerts.filter((a) => a.priority === 'urgent').length ? 'crit' : undefined} foot={<Chip tone={alerts.filter((a) => a.priority === 'urgent').length ? 'urgent' : 'ok'}>urgent</Chip>} onClick={() => navigate('alerts')} />
      </div>

      <SectionHead title="Needs a decision" sub="Only what nobody else can settle." />
      {alerts.filter((a) => a.priority === 'urgent').length ? (
        <div className="stack-sm" style={{ marginBottom: 18 }}>
          {alerts.filter((a) => a.priority === 'urgent').map((a) => (
            <Callout
              key={a.id}
              tone="crit"
              title={a.title}
              action={<Btn size="xs" variant="ghost" onClick={() => (window.location.hash = a.url.slice(1))}>Open</Btn>}
            >
              {a.kind} · {a.detail}
            </Callout>
          ))}
        </div>
      ) : (
        <div style={{ marginBottom: 18 }}>
          <Callout tone="ok" title="Nothing urgent">Everything outstanding is with Earl.</Callout>
        </div>
      )}

      <SectionHead title="Money" action={<Btn size="xs" variant="ghost" onClick={() => navigate('money')}>Open</Btn>} />
      <div className="grid three" style={{ marginBottom: 18 }}>
        <Card>
          <div className="eyebrow">This month</div>
          <div className="serif" style={{ fontSize: 25, marginTop: 8 }}>{money(spend.household)}</div>
          <div className="muted" style={{ fontSize: 13 }}>household spending</div>
        </Card>
      </div>

      <SectionHead title="People" action={<Btn size="xs" variant="ghost" onClick={() => navigate('staff')}>Staff records</Btn>} />
      <List>
        {db.staffDetails.map((s) => {
          const p = db.profiles.find((x) => x.id === s.profileId);
          if (!p) return null;
          const worst = Math.min(daysUntil(s.visaExpiry), daysUntil(s.passportExpiry), daysUntil(s.contractEnd));
          return (
            <Row
              key={s.id}
              left={<Avatar name={p.name} initials={p.initials} />}
              title={p.name}
              sub={`${s.roleTitle} · ${money(s.salary)} · pay day ${s.payDay}`}
              right={<Chip tone={worst < 30 ? 'urgent' : worst < 90 ? 'low' : 'ok'}>{worst < 0 ? 'Expired' : `${worst}d to next expiry`}</Chip>}
              onClick={() => navigate('staff', undefined, p.id)}
            />
          );
        })}
      </List>
    </>
  );
}

/* ============================================================
   STAFF — my day, on a phone
   ============================================================ */

function StaffToday() {
  const user = useUser();
  const { db, date, tasks } = useDay();
  const toggleTask = useStore((s) => s.toggleTask);

  const mine = tasks.filter((t) => t.assignedTo === user.id);
  const o = progress(mine);
  const absent = isAbsent(user.id, date, db.absences);
  const nowMin = new Date().getHours() * 60 + new Date().getMinutes();

  const timed = mine.filter((t) => t.scheduledAt && !t.done).sort((a, b) => toMinutes(a.scheduledAt!) - toMinutes(b.scheduledAt!));
  const nextUp = timed.find((t) => toMinutes(t.scheduledAt!) >= nowMin - 30) ?? timed[0];
  const untimed = mine.filter((t) => !t.scheduledAt && !t.done);
  const myIssues = assignedIssues(db, user.id);

  if (absent) {
    return (
      <>
        <PageHead eyebrow="My day" title={`${greeting()}, ${user.name}`} sub={fmt(date)} />
        <Callout tone="ok" title={`You are on ${absent.type.toLowerCase()} today`}>
          {absent.notes || 'Nothing scheduled counts against the house.'} Back on{' '}
          {fmt(absent.to)}.
        </Callout>
      </>
    );
  }

  return (
    <>
      <PageHead eyebrow="My day" title={`${greeting()}, ${user.name}`} sub={fmt(date)} />

      <BuyListLead variant="mine" />

      <Card style={{ marginBottom: 14 }}>
        <div className="eyebrow" style={{ marginBottom: 8 }}>Your jobs on the checklist</div>
        <Meter pct={o.pct} left={`${o.done} of ${o.total} done`} right={`${o.total - o.done} to go`} />
      </Card>

      {nextUp && (
        <div style={{ marginBottom: 14 }}>
          <Card>
            <div className="between wrap">
              <div className="grow">
                <div className="eyebrow">Next up · {fmtTime12(nextUp.scheduledAt!)}</div>
                <div className="serif" style={{ fontSize: 21, marginTop: 5 }}>{nextUp.title}</div>
                {nextUp.instructions && (
                  <div className="muted" style={{ fontSize: 13.5, marginTop: 5 }}>{nextUp.instructions}</div>
                )}
                <div className="row wrap" style={{ marginTop: 9, gap: 7 }}>
                  <ZoneChip zone={nextUp.zone} />
                  <Chip>{nextUp.estMinutes} min</Chip>
                </div>
              </div>
              <Btn onClick={() => toggleTask(nextUp.id)}>Mark done</Btn>
            </div>
          </Card>
        </div>
      )}

      {myIssues.length > 0 && (
        <>
          <SectionHead title="Jobs assigned to you" action={<Btn size="xs" variant="ghost" onClick={() => navigate('issues')}>All issues</Btn>} />
          <List>
            {myIssues.map((i) => (
              <Row
                key={i.id}
                title={i.title}
                sub={`${i.status.replace('_', ' ')} · reported by ${db.profiles.find((p) => p.id === i.reportedBy)?.name}`}
                zone={i.zone}
                right={<Chip tone={i.priority === 'urgent' ? 'urgent' : i.priority === 'high' ? 'low' : 'plain'}>{i.priority}</Chip>}
                onClick={() => navigate('issues', undefined, i.id)}
              />
            ))}
          </List>
        </>
      )}

      <SectionHead
        title="Scheduled"
        sub={timed.length ? undefined : 'Nothing left with a time on it.'}
        action={<Btn size="xs" variant="ghost" onClick={() => navigate('planner')}>Timeline</Btn>}
      />
      {timed.length > 0 && (
        <List>
          {timed.map((t) => (
            <button key={t.id} type="button" className="task" onClick={() => toggleTask(t.id)}>
              <span className="box">✓</span>
              <span className="tx">
                {t.title}
                <span className="meta">
                  <b className="tnum">{fmtTime12(t.scheduledAt!)}</b>
                  <ZoneChip zone={t.zone} />
                  <span>{t.estMinutes} min</span>
                </span>
              </span>
            </button>
          ))}
        </List>
      )}

      <SectionHead title={`Anytime today · ${untimed.length}`} action={<Btn size="xs" variant="ghost" onClick={() => navigate('checklist')}>Full checklist</Btn>} />
      {untimed.length ? (
        <List>
          {untimed.slice(0, 12).map((t) => (
            <button key={t.id} type="button" className="task" onClick={() => toggleTask(t.id)}>
              <span className="box">✓</span>
              <span className="tx">
                {t.title}
                <span className="meta">
                  <ZoneChip zone={t.zone} />
                  <span>{t.estMinutes} min</span>
                </span>
              </span>
            </button>
          ))}
          {untimed.length > 12 && (
            <Row title={`${untimed.length - 12} more`} onClick={() => navigate('checklist')} />
          )}
        </List>
      ) : (
        <Empty title="Everything untimed is done">Good work. Check the timeline for anything later.</Empty>
      )}
    </>
  );
}

/* ============================================================
   FAMILY — what is happening, and how to ask for something
   ============================================================ */

function FamilyToday() {
  const user = useUser();
  const { db, date } = useDay();
  const meals = mealsOn(db, date).filter((m) => m.zone === 'household');
  const appts = db.appointments.filter((a) => a.date === date).sort((a, b) => a.start.localeCompare(b.start));
  const guest = activeGuest(db);
  const events = upcomingEvents(db).slice(0, 3);
  const openSheet = useStore((s) => s.openSheet);
  const mine = issuesFor(db, user.id);
  const parcels = db.deliveries.filter((d) => d.forProfileId === user.id && d.status === 'received');

  return (
    <>
      <PageHead
        eyebrow="Household"
        title={`${greeting()}, ${user.name.split(' ')[0]}`}
        sub={fmt(date)}
        tools={<Btn onClick={() => openSheet('issue-new')}>Ask for something</Btn>}
      />

      <BuyListLead variant="watch" />

      {parcels.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          <Callout tone="warn" title={`${plural(parcels.length, 'parcel')} waiting for you`}>
            {parcels.map((p) => `${p.description} (${p.courier}, ${fmtShort(p.date)})`).join(' · ')} — in the
            store by the door.
          </Callout>
        </div>
      )}

      <SectionHead title="Eating today" />
      {meals.length ? (
        <List>
          {meals.map((m) => (
            <Row
              key={m.id}
              title={`${m.type} · ${m.name}`}
              sub={`${fmtTime12(m.serveAt)} · ${plural(m.portions, 'portion')}${m.diet ? ` · ${m.diet}` : ''}`}
              right={<Chip tone={m.status === 'Approved' || m.status === 'Completed' ? 'ok' : 'low'}>{m.status}</Chip>}
            />
          ))}
        </List>
      ) : (
        <Empty title="Nothing planned yet">The menu is usually up a few days ahead.</Empty>
      )}

      <SectionHead title="On today" />
      {appts.length ? (
        <List>
          {appts.map((a) => (
            <Row
              key={a.id}
              title={a.title}
              sub={`${fmtTime12(a.start)}–${fmtTime12(a.end)}${a.attendees ? ` · ${a.attendees}` : ''}`}
              zone={a.zone}
            />
          ))}
        </List>
      ) : (
        <Empty title="Nothing in the calendar" />
      )}

      <SectionHead title="Coming up" />
      <div className="grid auto">
        {guest && (
          <Tile
            eyebrow="Guest"
            title={guest.name}
            sub={`${fmt(guest.arrival)} at ${fmtTime12(guest.arrivalTime)} · ${guest.departure ? `until ${fmtShort(guest.departure)}` : ''}`}
            foot={<Chip tone="bronze">{occasionPct(guest.tasks)}% prepared</Chip>}
            onClick={() => navigate('occasions', 'guests', guest.id)}
          />
        )}
        {events.map((e) => (
          <Tile
            key={e.id}
            eyebrow="Event"
            title={e.name}
            sub={`${fmtShort(e.date)} · ${fmtTime12(e.start)}`}
            foot={<ZoneChip zone={e.zone} />}
            onClick={() => navigate('occasions', 'events', e.id)}
          />
        ))}
      </div>

      {mine.length > 0 && (
        <>
          <SectionHead title="Things you asked for" />
          <List>
            {mine.map((i) => (
              <Row
                key={i.id}
                title={i.title}
                sub={i.status.replace('_', ' ')}
                right={<Chip tone={i.status === 'resolved' || i.status === 'closed' ? 'ok' : 'low'}>{i.status === 'reported' ? 'Waiting' : i.status.replace('_', ' ')}</Chip>}
                onClick={() => navigate('issues', undefined, i.id)}
              />
            ))}
          </List>
        </>
      )}
    </>
  );
}
