import React from 'react';
import { useStore, useUser } from '@/store';
import { can } from '@/lib/access';
import { navigate } from '@/lib/router';
import { fmt, fmtShort, fmtTime12, greeting, hhmm, today as todayStr, daysUntil, toMinutes } from '@/lib/date';
import { money, plural, titleCase } from '@/lib/format';
import { progress, coverageGaps, isWorking, isAbsent } from '@/lib/schedule';
import {
  FOOD_RULE,
  FOOD_RULE_HEADING,
  FOOTER_RULES,
  PRAYER_ITEM_RULE,
  PRAYER_ITEM_RULE_HEADING,
  SHEET_META,
} from '@/seed/prayer';
import type { DB, RunningSheet, StockState } from '@/types';
import {
  activeGuest,
  allAlerts,
  awaitingApproval,
  belowMin,
  budgetLines,
  billsDue,
  issuesFor,
  mealsOn,
  openIssues,
  assignedIssues,
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
  KV,
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
  cx,
} from '@/components/ui';

export function Today() {
  const user = useUser();
  switch (user.role) {
    case 'owner':
      return <OwnerToday />;
    case 'manager':
      return <ManagerToday />;
    case 'staff':
      return <StaffToday />;
    case 'family':
      return <FamilyToday />;
    default:
      return <RequesterToday />;
  }
}

function useDay() {
  const db = useStore((s) => s.db);
  const date = useStore((s) => s.date);
  const ensureDay = useStore((s) => s.ensureDay);
  const ensureSheet = useStore((s) => s.ensureSheet);
  React.useEffect(() => {
    ensureDay(date);
    ensureSheet(date);
  }, [date, ensureDay, ensureSheet]);
  return { db, date, tasks: db.days[date] ?? [], sheet: db.sheets[date] };
}

/* ============================================================
   The running sheet, at the top of every dashboard.

   It is the day's actual deliverable — one page, posted to the
   3808 Home group by 09:00 — so it leads and the zone, issue and
   stock tiles follow it. Everything below reads off the sheet
   rather than off the task library, because the sheet is what the
   house runs to.
   ============================================================ */

const STOCK_WORD: Record<StockState, string> = {
  yes: 'yes',
  no: 'no',
  partial: 'some',
  unknown: 'not checked yet',
};

/** The sheet as one message, ready to paste into the group (R3). */
function sheetText(db: DB, sheet: RunningSheet): string {
  const out: string[] = [];
  const box = (r: { done: boolean }) => (r.done ? '[x]' : '[ ]');

  out.push(SHEET_META.title);
  out.push(`Apartment ${SHEET_META.apartment} · ${db.settings.address}`);
  out.push(fmt(sheet.date) + (sheet.occasion ? ` · ${sheet.occasion}` : ''));
  out.push(
    [
      sheet.prayersStart
        ? `Prayers ${sheet.prayersStart}${sheet.prayersEnd ? `–${sheet.prayersEnd}` : ''}`
        : 'PRAYER START TIME NOT SET',
      sheet.meals == null ? 'NUMBER OF MEALS NOT SET' : plural(sheet.meals, 'meal'),
      plural(sheet.guests ?? 0, 'guest'),
    ].join(' · '),
  );

  out.push('', FOOD_RULE_HEADING, FOOD_RULE);
  out.push('', PRAYER_ITEM_RULE_HEADING, PRAYER_ITEM_RULE);

  out.push('', 'WHO IS WORKING TODAY');
  sheet.roster.forEach((r) => out.push(`${r.who} — ${r.job} · ${r.hours}`));

  out.push('', 'ORDER OF THE DAY');
  sheet.order.forEach((r) => out.push(`${box(r)} ${r.timeLabel} — ${r.what} (${r.who})`));

  const menu = sheet.menu.filter((m) => m.dish.trim());
  if (menu.length) {
    out.push('', `MENU${sheet.sitting ? ` (${sheet.sitting.toUpperCase()})` : ''}`);
    menu.forEach((m) => out.push([m.dish, m.whoMakes, m.howMany, m.notes].filter(Boolean).join(' — ')));
  }

  if (sheet.shopping.length) {
    out.push('', 'SHOPPING LIST');
    sheet.shopping.forEach((s) =>
      out.push(
        [s.item, s.howMuch.replace(/\n/g, ', '), `in stock: ${STOCK_WORD[s.inStock]}`, s.whoBuys]
          .filter(Boolean)
          .join(' — '),
      ),
    );
  }

  if (sheet.sheetGuests.length) {
    out.push('', 'GUESTS');
    sheet.sheetGuests.forEach((g) => out.push([g.name, g.arriving, g.notes].filter(Boolean).join(' — ')));
  }

  out.push('', 'DAILY CHECKS');
  sheet.checks.forEach((g) => {
    out.push('', `${g.title} — ${g.items.filter((i) => i.done).length} of ${g.items.length}`);
    g.items.forEach((i) => out.push(`${box(i)} ${i.text}`));
  });

  out.push('', ...FOOTER_RULES);
  out.push(
    '',
    `Prepared by ${sheet.preparedBy || '—'} · Checked by ${sheet.checkedBy || db.settings.checkedByName}`,
  );
  return out.join('\n');
}

/** The header bar of the printed sheet, in the same order it is printed. */
function SheetFacts({ sheet }: { sheet: RunningSheet }) {
  const blank = <span style={{ color: 'var(--rust)' }}>Not set — the sheet cannot go out</span>;
  return (
    <KV
      rows={[
        ['Occasion', sheet.occasion || 'No observance running'],
        [
          'Prayers',
          sheet.prayersStart ? (
            <>
              {sheet.prayersStart} – {sheet.prayersEnd ?? '?'}
              {sheet.actualPrayersEnd && (
                <span className="muted"> · finished {sheet.actualPrayersEnd}</span>
              )}
            </>
          ) : (
            blank
          ),
        ],
        ['Meals', sheet.meals == null ? blank : plural(sheet.meals, 'meal')],
        ['Guests', sheet.guests == null ? '—' : plural(sheet.guests, 'guest')],
        ['Sitting', sheet.sitting],
      ]}
    />
  );
}

/** Earl's and the owners' view: where the sheet has got to, and get it out. */
function SheetLead() {
  const { db, date, sheet } = useDay();
  const showToast = useStore((s) => s.showToast);
  if (!sheet) return null;

  const checks = sheet.checks.flatMap((g) => g.items);
  const checksDone = checks.filter((i) => i.done).length;
  const orderDone = sheet.order.filter((r) => r.done).length;
  const posted = sheet.status === 'posted';
  const nowMin = new Date().getHours() * 60 + new Date().getMinutes();
  const late = !posted && date === todayStr() && nowMin > toMinutes(db.settings.sheetPostBy);

  const copy = () => {
    if (!navigator.clipboard) {
      showToast('This browser will not let the app copy. Open the sheet and copy it from there.');
      return;
    }
    void navigator.clipboard.writeText(sheetText(db, sheet)).then(
      () => showToast(`Copied — paste it into the ${db.settings.whatsappGroup} group`),
      () => showToast('Could not copy it. Open the sheet and copy it from there.'),
    );
  };

  return (
    <div style={{ marginBottom: 16 }}>
      <Card>
        <div className="between wrap">
          <div className="grow">
            <div className="eyebrow">Today&rsquo;s running sheet</div>
            <div className="serif" style={{ fontSize: 23, marginTop: 4 }}>
              {sheet.occasion || fmt(sheet.date)}
            </div>
            <div className="muted" style={{ fontSize: 13.5, marginTop: 4 }}>
              Goes to the {db.settings.whatsappGroup} group by {db.settings.sheetPostBy}. Checked by{' '}
              {sheet.checkedBy || db.settings.checkedByName} before it goes out.
            </div>
          </div>
          <Chip tone={posted ? 'ok' : sheet.status === 'checked' ? 'info' : 'low'}>
            {posted
              ? `Posted${sheet.postedAt ? ` ${hhmm(sheet.postedAt)}` : ''}`
              : titleCase(sheet.status)}
          </Chip>
        </div>

        <div className="grid two" style={{ marginTop: 14 }}>
          <div>
            <div className="eyebrow" style={{ marginBottom: 8 }}>The 31 daily checks</div>
            <Meter pct={occasionPct(checks)} left={`${checksDone} of ${checks.length} ticked`} />
          </div>
          <div>
            <div className="eyebrow" style={{ marginBottom: 8 }}>Order of the day</div>
            <Meter pct={occasionPct(sheet.order)} left={`${orderDone} of ${sheet.order.length} done`} />
          </div>
        </div>

        <div className="row wrap" style={{ gap: 8, marginTop: 14 }}>
          <Btn onClick={() => navigate('sheet')}>Open the sheet</Btn>
          <Btn variant="ghost" onClick={copy}>Copy for WhatsApp</Btn>
        </div>

        <hr className="hair" style={{ margin: '15px 0' }} />
        <SheetFacts sheet={sheet} />
      </Card>

      {late && (
        <div style={{ marginTop: 10 }}>
          <Callout
            tone="crit"
            title={`Not posted, and it is past ${db.settings.sheetPostBy}`}
            action={<Btn size="xs" variant="ghost" onClick={() => navigate('sheet')}>Finish it</Btn>}
          >
            The group has not had today&rsquo;s sheet. Never send it out with the prayer start time or the
            number of meals left blank.
          </Callout>
        </div>
      )}
    </div>
  );
}

/**
 * The sheet writes its `who` column as free text — 'Reza / Aditya / Earl
 * / Rosie' — so a first-name match is the only join there is between a
 * person and a row. The five real first names do not collide.
 */
function namesMe(who: string, name: string): boolean {
  return who.toLowerCase().includes(name.split(' ')[0]!.toLowerCase());
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

      <SheetLead />

      <div className="grid four" style={{ marginBottom: 16 }}>
        <Stat label="Today" value={`${o.pct}%`} foot={<span className="muted" style={{ fontSize: 12.5 }}>{o.done} of {o.total} done</span>} />
        <Stat label="Open issues" value={openIssues(db).length} tone={urgentIssues(db).length ? 'crit' : undefined} foot={urgentIssues(db).length ? <Chip tone="urgent">{plural(urgentIssues(db).length, 'urgent')}</Chip> : <Chip tone="ok">None urgent</Chip>} onClick={() => navigate('issues')} />
        <Stat label="Below minimum" value={belowMin(db).length} foot={<Chip tone={belowMin(db).length ? 'low' : 'ok'}>Shopping list</Chip>} onClick={() => navigate('inventory')} />
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

      <SheetLead />

      <div className="grid four" style={{ marginBottom: 16 }}>
        <Stat label="House today" value={`${o.pct}%`} foot={<span className="muted" style={{ fontSize: 12.5 }}>{o.done} of {o.total}</span>} />
        <Stat label="Spend this month" value={money(total)} foot={<span className="muted" style={{ fontSize: 12.5 }}>all zones</span>} onClick={() => navigate('money')} />
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
          const p = db.profiles.find((x) => x.id === s.profileId)!;
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

/**
 * My day comes off the order of the day first. The task library is the
 * standing housework; the sheet is what today is, and a row that names
 * you is a job whether or not anyone made a task instance for it.
 */
function MySheetDay() {
  const user = useUser();
  const { db, date, sheet } = useDay();
  const toggleOrderRow = useStore((s) => s.toggleOrderRow);
  if (!sheet) return null;

  const mine = sheet.order.filter((r) => namesMe(r.who, user.name));
  if (!mine.length) return null;

  const nowMin = new Date().getHours() * 60 + new Date().getMinutes();
  const open = mine.filter((r) => !r.done);
  const next = open.find((r) => r.sortAt && toMinutes(r.sortAt) >= nowMin - 30) ?? open[0];

  /* The shift gives the clock; the roster line gives what the house
     actually says about those hours — 'Lives in — on duty until
     close-down' — so both go on unless they say the same thing. */
  const shift = db.shifts.find((s) => s.staffId === user.id);
  const clock = shift ? `${shift.start} – ${shift.end}` : '';
  const printed = sheet.roster.find((r) => r.personId === user.id)?.hours ?? '';
  const hours =
    [clock, clock && printed.includes(clock) ? '' : printed].filter(Boolean).join(' · ') ||
    'Hours not set';

  return (
    <div style={{ marginBottom: 14 }}>
      <Card>
        <div className="between wrap">
          <div className="grow">
            <div className="eyebrow">Next on the sheet</div>
            <div className="serif" style={{ fontSize: 21, marginTop: 4 }}>
              {next ? `${next.timeLabel} — ${next.what}` : 'Everything you are named in is done'}
            </div>
            <div className="muted" style={{ fontSize: 13.5, marginTop: 4 }}>
              {hours}
              {sheet.occasion && ` · ${sheet.occasion}`}
            </div>
          </div>
          <Chip tone={open.length ? 'low' : 'ok'}>
            {mine.length - open.length} of {mine.length} done
          </Chip>
        </div>

        <div className="list flat" style={{ marginTop: 13 }}>
          {mine.map((r) => (
            <button
              key={r.id}
              type="button"
              className={cx('task', r.done && 'done')}
              onClick={() => toggleOrderRow(date, r.id)}
            >
              <span className="box">✓</span>
              <span className="tx">
                {r.what}
                <span className="meta">
                  <b className="tnum">{r.timeLabel}</b>
                  <span>{r.who}</span>
                </span>
              </span>
            </button>
          ))}
        </div>
      </Card>
    </div>
  );
}

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

      <MySheetDay />

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

  return (
    <>
      <PageHead
        eyebrow="Family"
        title={`${greeting()}, ${user.name}`}
        sub={fmt(date)}
        tools={<Btn onClick={() => openSheet('issue-new')}>Ask for something</Btn>}
      />

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

/* ============================================================
   The narrowest view in the app: someone who can say something is
   wrong and see the answer, and nothing else.
   ============================================================ */

function RequesterToday() {
  const user = useUser();
  const db = useStore((s) => s.db);
  const openSheet = useStore((s) => s.openSheet);
  const mine = issuesFor(db, user.id);
  const openMine = mine.filter((i) => !['resolved', 'closed'].includes(i.status));
  const parcels = db.deliveries.filter((d) => d.forProfileId === user.id && d.status === 'received');

  return (
    <>
      <PageHead
        eyebrow="Household"
        title={`${greeting()}, ${user.name.split(' ')[0]}`}
        sub={fmt(todayStr())}
      />

      <div style={{ marginBottom: 16 }}>
        <Card>
          <div className="between wrap">
            <div className="grow">
              <div className="serif" style={{ fontSize: 20 }}>Something needs attention?</div>
              <div className="muted" style={{ fontSize: 14, marginTop: 4 }}>
                A photo, where it is, one line. Reza is usually on it within the hour.
              </div>
            </div>
            <Btn onClick={() => openSheet('issue-new')}>Report or request</Btn>
          </div>
        </Card>
      </div>

      {parcels.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          <Callout tone="warn" title={`${plural(parcels.length, 'parcel')} waiting for you`}>
            {parcels.map((p) => `${p.description} (${p.courier}, ${fmtShort(p.date)})`).join(' · ')} — in the
            the store by the door.
          </Callout>
        </div>
      )}

      <SectionHead title={`Open · ${openMine.length}`} />
      {openMine.length ? (
        <List>
          {openMine.map((i) => (
            <Row
              key={i.id}
              title={i.title}
              sub={`Reported ${fmtShort(new Date(i.reportedAt).toISOString().slice(0, 10))}${i.assignedTo ? ` · with ${db.profiles.find((p) => p.id === i.assignedTo)?.name}` : ''}`}
              right={
                <Chip tone={i.status === 'reported' ? 'plain' : i.status === 'awaiting_vendor' ? 'low' : 'info'}>
                  {i.status === 'reported' ? 'Not picked up yet' : i.status.replace('_', ' ')}
                </Chip>
              }
              onClick={() => navigate('issues', undefined, i.id)}
            />
          ))}
        </List>
      ) : (
        <Empty title="Nothing open">Anything you report shows here until it is resolved.</Empty>
      )}

      {mine.filter((i) => ['resolved', 'closed'].includes(i.status)).length > 0 && (
        <>
          <SectionHead title="Resolved" />
          <List>
            {mine
              .filter((i) => ['resolved', 'closed'].includes(i.status))
              .map((i) => (
                <Row
                  key={i.id}
                  title={i.title}
                  sub={i.resolution}
                  right={<Chip tone="ok">Resolved</Chip>}
                  onClick={() => navigate('issues', undefined, i.id)}
                />
              ))}
          </List>
        </>
      )}
    </>
  );
}
