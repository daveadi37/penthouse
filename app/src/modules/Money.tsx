import React from 'react';
import {useStore, useUser} from '@/store';
import { can } from '@/lib/access';
import {navigate, useRoute} from '@/lib/router';
import {addDays, addMonths, daysUntil, fmtMedium, monthKey, monthLabel, today as todayStr} from '@/lib/date';
import {money, plural} from '@/lib/format';
import {billsDue, budgetLines, catName, pettyBalance, profileName, spendByZone, staffList, vendorName, visibleRecurring, visibleTransactions} from '@/lib/selectors';
import type { PettyCashEntry, RecurringCharge, Transaction } from '@/types';
import {Bar, Btn, Card, Chip, Field, IconBtn, List, PageHead, Row, SectionHead, Seg, Select, Sheet, Stat, Text, ZoneChip} from '@/components/ui';
import {ZoneFilterBar} from '@/components/Shell';

type Tab = 'overview' | 'transactions' | 'recurring' | 'petty';

export function Money() {
  const user = useUser();
  const route = useRoute();
  const db = useStore((s) => s.db);
  const openSheet = useStore((s) => s.openSheet);
  const tab = (route.sub as Tab) ?? 'overview';

  const seeOwner = can(db, user, 'money.viewOwner');
  const [month, setMonth] = React.useState(monthKey(todayStr()));

  const spend = spendByZone(db, month, seeOwner);
  const total = Object.values(spend).reduce((a, b) => a + b, 0);
  const lines = budgetLines(db, month, seeOwner);
  const budgetTotal = lines.reduce((s, l) => s + l.budget, 0);
  const hidden = db.transactions.filter((t) => t.visibility === 'owner').length;

  return (
    <>
      <PageHead
        eyebrow="Money"
        title={monthLabel(month)}
        sub={
          seeOwner
            ? 'Everything, including staff pay and household spend.'
            : 'Operational spend. Staff pay and private household spend are not in this view.'
        }
        tools={
          <>
            <div className="row" style={{ gap: 6 }}>
              <IconBtn label="Previous month" onClick={() => setMonth(monthKey(addMonths(month + '-01', -1)))}>‹</IconBtn>
              <IconBtn label="Next month" onClick={() => setMonth(monthKey(addMonths(month + '-01', 1)))}>›</IconBtn>
            </div>
            <Btn size="sm" variant="ghost" onClick={() => setMonth(monthKey(todayStr()))}>This month</Btn>
            <Btn size="sm" onClick={() => openSheet('tx-new')}>Record spend</Btn>
          </>
        }
      />

      {!seeOwner && hidden > 0 && (
        <div style={{ marginBottom: 14 }}>
          <Card className="callout" pad={false} style={{ padding: '13px 16px' }}>
            <div className="muted" style={{ fontSize: 13.5, lineHeight: 1.45 }}>
              {plural(hidden, 'transaction')} marked owner-only are not shown here. In production this is a
              row-level security policy, not a hidden menu — the rows simply do not come back.
            </div>
          </Card>
        </div>
      )}

      <div className="grid four" style={{ marginBottom: 16 }}>
        <Stat label="Spent this month" value={money(total, db.settings.currency)} foot={<span className="muted" style={{ fontSize: 12.5 }}>of {money(budgetTotal, db.settings.currency)} budgeted</span>} />
        <Stat label="Over budget" value={lines.filter((l) => l.pct > 100).length} tone={lines.some((l) => l.pct > 100) ? 'warn' : undefined} foot={<span className="muted" style={{ fontSize: 12.5 }}>{lines.filter((l) => l.pct > 100)[0]?.name ?? 'nothing'}</span>} />
        <Stat label="Bills due in 14 days" value={billsDue(db, 14, seeOwner).length} foot={<span className="muted" style={{ fontSize: 12.5 }}>{money(billsDue(db, 14, seeOwner).reduce((s, b) => s + b.amount, 0), db.settings.currency)}</span>} onClick={() => navigate('money', 'recurring')} />
        <Stat
          label="Petty cash out"
          value={money(staffList(db).reduce((s, p) => s + pettyBalance(db, p.id), 0), db.settings.currency)}
          foot={<span className="muted" style={{ fontSize: 12.5 }}>held by staff</span>}
          onClick={() => navigate('money', 'petty')}
        />
      </div>

      <div className="row wrap" style={{ gap: 8, marginBottom: 14 }}>
        <Seg
          value={tab}
          onChange={(v) => navigate('money', v)}
          options={[
            { value: 'overview', label: 'Budgets' },
            { value: 'transactions', label: 'Transactions' },
            { value: 'recurring', label: 'Bills & subscriptions', count: billsDue(db, 7, seeOwner).length },
            { value: 'petty', label: 'Petty cash' },
          ]}
        />
        <ZoneFilterBar />
      </div>

      {tab === 'overview' && <Overview month={month} seeOwner={seeOwner} />}
      {tab === 'transactions' && <Transactions month={month} seeOwner={seeOwner} />}
      {tab === 'recurring' && <Recurring seeOwner={seeOwner} />}
      {tab === 'petty' && <Petty />}
    </>
  );
}

function Overview({ month, seeOwner }: { month: string; seeOwner: boolean }) {
  const db = useStore((s) => s.db);
  const lines = budgetLines(db, month, seeOwner);

  return (
    <>
      <SectionHead title="By category" sub="Sorted by how far through the budget each one is." />
      <div className="tblwrap">
        <table className="tbl">
          <thead>
            <tr>
              <th>Category</th>
              <th>Zone</th>
              <th className="num">Budget</th>
              <th className="num">Spent</th>
              <th className="num">Left</th>
              <th style={{ width: 150 }}>Used</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => (
              <tr key={l.categoryId}>
                <td>{l.name}</td>
                <td><ZoneChip zone={l.zone} /></td>
                <td className="num">{money(l.budget, db.settings.currency)}</td>
                <td className="num">{money(l.spent, db.settings.currency)}</td>
                <td className="num" style={{ color: l.budget - l.spent < 0 ? 'var(--rust)' : undefined }}>
                  {money(l.budget - l.spent, db.settings.currency)}
                </td>
                <td>
                  <div className="row" style={{ gap: 8 }}>
                    <div className="grow"><Bar pct={l.pct} tone={l.pct > 100 ? 'over' : l.pct > 85 ? 'warn' : 'ok'} /></div>
                    <span className="tnum" style={{ fontSize: 12.5, minWidth: 38, textAlign: 'right' }}>{l.pct}%</span>
                  </div>
                </td>
              </tr>
            ))}
            {!lines.length && (
              <tr><td colSpan={6}><div className="muted" style={{ padding: 12 }}>No budgets set for this month.</div></td></tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}

function Transactions({ month, seeOwner }: { month: string; seeOwner: boolean }) {
  const db = useStore((s) => s.db);
  const zoneFilter = useStore((s) => s.zoneFilter);
  const openSheet = useStore((s) => s.openSheet);
  const [q, setQ] = React.useState('');

  let list = visibleTransactions(db, seeOwner).filter((t) => monthKey(t.date) === month);
  if (zoneFilter !== 'all') list = list.filter((t) => t.zone === zoneFilter);
  if (q) list = list.filter((t) => (t.description + catName(db, t.categoryId)).toLowerCase().includes(q.toLowerCase()));
  const sorted = list.slice().sort((a, b) => b.date.localeCompare(a.date));
  const total = sorted.reduce((s, t) => s + t.amount, 0);

  return (
    <>
      <div className="row wrap" style={{ gap: 8, marginBottom: 14 }}>
        <input className="in" style={{ width: 'auto', minHeight: 36, flex: '1 1 220px' }} placeholder="Search transactions" value={q} onChange={(e) => setQ(e.target.value)} />
        <Chip tone="plain">{plural(sorted.length, 'entry', 'entries')} · {money(total, db.settings.currency)}</Chip>
      </div>

      <div className="tblwrap">
        <table className="tbl">
          <thead>
            <tr>
              <th>Date</th>
              <th>Description</th>
              <th>Category</th>
              <th>Zone</th>
              <th>Method</th>
              <th className="num">Amount</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {sorted.map((t) => (
              <tr key={t.id} className="clickable" onClick={() => openSheet('tx-edit', t.id)}>
                <td className="nowrap">{fmtMedium(t.date)}</td>
                <td>
                  {t.description}
                  {t.vendorId && <div className="faint" style={{ fontSize: 12 }}>{vendorName(db, t.vendorId)}</div>}
                </td>
                <td>{catName(db, t.categoryId)}</td>
                <td><ZoneChip zone={t.zone} /></td>
                <td className="nowrap">{t.method}</td>
                <td className="num">{money(t.amount, db.settings.currency)}</td>
                <td>{t.visibility === 'owner' && <Chip tone="bronze">Owner</Chip>}</td>
              </tr>
            ))}
            {!sorted.length && (
              <tr><td colSpan={7}><div className="muted" style={{ padding: 12 }}>Nothing this month.</div></td></tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}

function Recurring({ seeOwner }: { seeOwner: boolean }) {
  const db = useStore((s) => s.db);
  const zoneFilter = useStore((s) => s.zoneFilter);
  const openSheet = useStore((s) => s.openSheet);
  const patch = useStore((s) => s.patch);

  let list = visibleRecurring(db, seeOwner).filter((r) => r.active);
  if (zoneFilter !== 'all') list = list.filter((r) => r.zone === zoneFilter);
  const sorted = list.slice().sort((a, b) => (a.nextDue || '9999').localeCompare(b.nextDue || '9999'));
  const monthlyEquivalent = list.reduce((s, r) => {
    const per = r.cadence === 'weekly' ? 4.33 : r.cadence === 'monthly' ? 1 : r.cadence === 'quarterly' ? 1 / 3 : r.cadence === 'biannual' ? 1 / 6 : 1 / 12;
    return s + r.amount * per;
  }, 0);

  const advance = (r: RecurringCharge) => {
    const next =
      r.cadence === 'weekly' ? addDays(r.nextDue, 7)
      : r.cadence === 'monthly' ? monthKey(addMonths(r.nextDue, 1)) + r.nextDue.slice(7)
      : r.cadence === 'quarterly' ? addMonths(r.nextDue, 3)
      : r.cadence === 'biannual' ? addMonths(r.nextDue, 6)
      : addMonths(r.nextDue, 12);
    patch('recurring', r.id, { nextDue: next }, `${r.name} marked paid`);
  };

  return (
    <>
      <SectionHead
        title="Everything that comes back"
        sub={`About ${money(monthlyEquivalent, db.settings.currency)} a month, all cadences levelled. A subscription is a bill that arrives by card, so they live in one table.`}
        action={<Btn size="xs" variant="ghost" onClick={() => openSheet('rec-new')}>Add</Btn>}
      />
      <List>
        {sorted.map((r) => {
          const d = daysUntil(r.nextDue);
          return (
            <Row
              key={r.id}
              title={r.name}
              sub={`${r.kind} · ${r.cadence} · ${catName(db, r.categoryId)}${r.accountRef ? ` · ${r.accountRef}` : ''}${r.notes ? ` · ${r.notes}` : ''}`}
              zone={r.zone}
              right={
                <>
                  <span className="tnum" style={{ fontWeight: 650, fontSize: 14.5 }}>{money(r.amount, db.settings.currency)}</span>
                  <Chip tone={d < 0 ? 'urgent' : d <= 7 ? 'low' : 'plain'}>
                    {d < 0 ? `${Math.abs(d)}d overdue` : d === 0 ? 'Today' : `${d}d`}
                  </Chip>
                  <Chip tone={r.autopay ? 'ok' : 'plain'}>{r.autopay ? 'Autopay' : 'Manual'}</Chip>
                  <Btn size="xs" variant="ghost" onClick={() => advance(r)}>Paid</Btn>
                </>
              }
              onClick={() => openSheet('rec-edit', r.id)}
            />
          );
        })}
        {!sorted.length && <Row title="Nothing recurring" />}
      </List>
    </>
  );
}

function Petty() {
  const db = useStore((s) => s.db);
  const openSheet = useStore((s) => s.openSheet);
  const holders = staffList(db);

  return (
    <>
      <SectionHead
        title="Floats held by staff"
        sub="A float goes out, spend comes off it, the balance is what they are holding."
        action={<Btn size="xs" variant="ghost" onClick={() => openSheet('petty-new')}>Record an entry</Btn>}
      />
      <div className="grid three" style={{ marginBottom: 18 }}>
        {holders.map((p) => {
          const bal = pettyBalance(db, p.id);
          const spent = db.pettyCash.filter((x) => x.holderId === p.id && x.direction === 'spend').reduce((s, x) => s + x.amount, 0);
          return (
            <Card key={p.id}>
              <div className="eyebrow">{p.name}</div>
              <div className="serif" style={{ fontSize: 26, marginTop: 6, color: bal < 0 ? 'var(--rust)' : undefined }}>
                {money(bal, db.settings.currency)}
              </div>
              <div className="muted" style={{ fontSize: 13 }}>in hand · {money(spent, db.settings.currency)} spent all time</div>
            </Card>
          );
        })}
      </div>

      <SectionHead title="Entries" />
      <List>
        {db.pettyCash
          .slice()
          .sort((a, b) => b.date.localeCompare(a.date))
          .map((e) => (
            <Row
              key={e.id}
              title={e.purpose}
              sub={`${fmtMedium(e.date)} · ${profileName(db, e.holderId)}${e.categoryId ? ` · ${catName(db, e.categoryId)}` : ''}${e.notes ? ` · ${e.notes}` : ''}`}
              zone={e.zone}
              right={
                <Chip tone={e.direction === 'float' ? 'info' : e.direction === 'return' ? 'ok' : 'plain'}>
                  {e.direction === 'float' ? '+' : '−'}
                  {money(e.amount, db.settings.currency)}
                </Chip>
              }
              caret={false}
            />
          ))}
      </List>
    </>
  );
}

/* ============================================================
   Sheets
   ============================================================ */

export function TxSheet({ id }: { id?: string }) {
  const user = useUser();
  const db = useStore((s) => s.db);
  const closeSheet = useStore((s) => s.closeSheet);
  const upsert = useStore((s) => s.upsert);
  const remove = useStore((s) => s.remove);
  const existing = id ? db.transactions.find((t) => t.id === id) : undefined;
  const isOwner = user.role === 'owner';

  const [f, setF] = React.useState<Transaction>(
    existing ?? {
      id: '', date: todayStr(), description: '', amount: 0, categoryId: db.expenseCategories[0]!.id,
      zone: 'household', method: 'Card', ref: '', enteredBy: user.id, visibility: 'manager', notes: '',
    } as Transaction,
  );
  const set = (k: keyof Transaction, v: unknown) => setF((p) => ({ ...p, [k]: v }));

  return (
    <Sheet
      title={existing ? 'Edit transaction' : 'Record spend'}
      sub="Link it to what caused it — an issue, an asset, a vehicle, a shopping trip — and the cost follows the thing."
      onClose={closeSheet}
      footer={
        <>
          <Btn className="grow" disabled={!f.description || !f.amount} onClick={() => { upsert('transactions', f, 'Transaction saved'); closeSheet(); }}>Save</Btn>
          {existing && <Btn variant="danger" size="sm" onClick={() => { remove('transactions', existing.id, 'Deleted'); closeSheet(); }}>Delete</Btn>}
          <Btn variant="ghost" onClick={closeSheet}>Cancel</Btn>
        </>
      }
    >
      <Field label="What was it for"><Text value={f.description} onChange={(v) => set('description', v)} autoFocus /></Field>
      <div className="three-col">
        <Field label="Date"><Text type="date" value={f.date} onChange={(v) => set('date', v)} /></Field>
        <Field label={`Amount, ${db.settings.currency}`}><Text type="number" value={String(f.amount || '')} onChange={(v) => set('amount', Number(v))} /></Field>
        <Field label="Method">
          <Select value={f.method} onChange={(v) => set('method', v)} options={['Card', 'Bank transfer', 'Cash', 'Petty cash', 'Direct debit', 'Cheque'].map((m) => ({ value: m, label: m }))} />
        </Field>
      </div>
      <div className="two">
        <Field label="Category">
          <Select
            value={f.categoryId}
            onChange={(v) => { const c = db.expenseCategories.find((x) => x.id === v); setF((p) => ({ ...p, categoryId: v, zone: c?.zone ?? p.zone })); }}
            options={db.expenseCategories.filter((c) => c.active).map((c) => ({ value: c.id, label: `${c.name} · ${c.zone}` }))}
          />
        </Field>
      </div>
      <div className="two">
        <Field label="Vendor">
          <Select value={f.vendorId ?? ''} onChange={(v) => set('vendorId', v || undefined)} options={[{ value: '', label: '—' }, ...db.vendors.map((v) => ({ value: v.id, label: v.name }))]} />
        </Field>
        <Field label="Reference"><Text value={f.ref} onChange={(v) => set('ref', v)} /></Field>
      </div>
      <div className="two">
        <Field label="Linked to">
          <Select
            value={f.linkedType ?? ''}
            onChange={(v) => setF((p) => ({ ...p, linkedType: (v || undefined) as Transaction['linkedType'], linkedId: undefined }))}
            options={[
              { value: '', label: 'Nothing' },
              { value: 'issue', label: 'An issue' },
              { value: 'asset', label: 'An asset' },
              { value: 'vehicle', label: 'A vehicle' },
              { value: 'contract', label: 'A contract' },
            ]}
          />
        </Field>
        {f.linkedType && (
          <Field label="Which one">
            <Select
              value={f.linkedId ?? ''}
              onChange={(v) => set('linkedId', v || undefined)}
              options={[
                { value: '', label: '—' },
                ...(f.linkedType === 'issue' ? db.issues.map((i) => ({ value: i.id, label: i.title }))
                  : f.linkedType === 'asset' ? db.assets.map((a) => ({ value: a.id, label: a.name }))
                  : f.linkedType === 'vehicle' ? db.vehicles.map((v) => ({ value: v.id, label: v.name }))
                  : db.contracts.map((c) => ({ value: c.id, label: c.name }))),
              ]}
            />
          </Field>
        )}
      </div>
      {isOwner && (
        <Field label="Who can see it" hint="Owner-only rows do not come back for the manager at all.">
          <Select
            value={f.visibility}
            onChange={(v) => set('visibility', v)}
            options={[
              { value: 'manager', label: 'Manager and owner — operational' },
              { value: 'owner', label: 'Owner only — pay, private household spend' },
            ]}
          />
        </Field>
      )}
      <Field label="Notes"><textarea className="in" rows={2} value={f.notes} onChange={(e) => set('notes', e.target.value)} /></Field>
    </Sheet>
  );
}

export function RecSheet({ id }: { id?: string }) {
  const user = useUser();
  const db = useStore((s) => s.db);
  const closeSheet = useStore((s) => s.closeSheet);
  const upsert = useStore((s) => s.upsert);
  const remove = useStore((s) => s.remove);
  const existing = id ? db.recurring.find((r) => r.id === id) : undefined;
  const [f, setF] = React.useState<RecurringCharge>(
    existing ?? {
      id: '', name: '', kind: 'bill', categoryId: db.expenseCategories[0]!.id, zone: 'household',
      amount: 0, cadence: 'monthly', nextDue: todayStr(), autopay: false, accountRef: '',
      visibility: 'manager', notes: '', active: true,
    } as RecurringCharge,
  );
  const set = (k: keyof RecurringCharge, v: unknown) => setF((p) => ({ ...p, [k]: v }));

  return (
    <Sheet
      title={existing ? existing.name : 'New bill or subscription'}
      onClose={closeSheet}
      footer={
        <>
          <Btn className="grow" disabled={!f.name} onClick={() => { upsert('recurring', f, 'Saved'); closeSheet(); }}>Save</Btn>
          {existing && <Btn variant="danger" size="sm" onClick={() => { remove('recurring', existing.id, 'Deleted'); closeSheet(); }}>Delete</Btn>}
          <Btn variant="ghost" onClick={closeSheet}>Cancel</Btn>
        </>
      }
    >
      <Field label="Name"><Text value={f.name} onChange={(v) => set('name', v)} autoFocus /></Field>
      <div className="three-col">
        <Field label="Kind">
          <Select value={f.kind} onChange={(v) => set('kind', v)} options={[{ value: 'bill', label: 'Bill' }, { value: 'subscription', label: 'Subscription' }]} />
        </Field>
        <Field label={`Amount, ${db.settings.currency}`}><Text type="number" value={String(f.amount || '')} onChange={(v) => set('amount', Number(v))} /></Field>
        <Field label="How often">
          <Select
            value={f.cadence}
            onChange={(v) => set('cadence', v)}
            options={[
              { value: 'weekly', label: 'Weekly' },
              { value: 'monthly', label: 'Monthly' },
              { value: 'quarterly', label: 'Quarterly' },
              { value: 'biannual', label: 'Twice a year' },
              { value: 'annual', label: 'Annually' },
            ]}
          />
        </Field>
      </div>
      <div className="three-col">
        <Field label="Next due"><Text type="date" value={f.nextDue} onChange={(v) => set('nextDue', v)} /></Field>
        <Field label="Category">
          <Select value={f.categoryId} onChange={(v) => set('categoryId', v)} options={db.expenseCategories.map((c) => ({ value: c.id, label: c.name }))} />
        </Field>
      </div>
      <Field label="Account reference"><Text value={f.accountRef} onChange={(v) => set('accountRef', v)} /></Field>
      <label className="check">
        <input type="checkbox" checked={f.autopay} onChange={(e) => set('autopay', e.target.checked)} />
        <span>On autopay — no action needed when it falls due</span>
      </label>
      {user.role === 'owner' && (
        <Field label="Who can see it">
          <Select value={f.visibility} onChange={(v) => set('visibility', v)} options={[{ value: 'manager', label: 'Manager and owner' }, { value: 'owner', label: 'Owner only' }]} />
        </Field>
      )}
      <Field label="Notes"><textarea className="in" rows={2} value={f.notes} onChange={(e) => set('notes', e.target.value)} /></Field>
    </Sheet>
  );
}

export function PettySheet() {
  const user = useUser();
  const db = useStore((s) => s.db);
  const closeSheet = useStore((s) => s.closeSheet);
  const upsert = useStore((s) => s.upsert);
  const [f, setF] = React.useState<PettyCashEntry>({
    id: '', date: todayStr(), direction: 'spend', amount: 0, holderId: staffList(db)[0]?.id ?? '',
    purpose: '', zone: 'household', notes: '',
  } as PettyCashEntry);
  const set = (k: keyof PettyCashEntry, v: unknown) => setF((p) => ({ ...p, [k]: v }));

  return (
    <Sheet
      title="Petty cash entry"
      onClose={closeSheet}
      footer={
        <>
          <Btn className="grow" disabled={!f.purpose || !f.amount} onClick={() => { upsert('pettyCash', { ...f, approvedBy: user.id }, 'Entry recorded'); closeSheet(); }}>Save</Btn>
          <Btn variant="ghost" onClick={closeSheet}>Cancel</Btn>
        </>
      }
    >
      <div className="three-col">
        <Field label="Direction">
          <Select
            value={f.direction}
            onChange={(v) => set('direction', v)}
            options={[
              { value: 'float', label: 'Float out to them' },
              { value: 'spend', label: 'They spent it' },
              { value: 'return', label: 'They returned it' },
            ]}
          />
        </Field>
        <Field label="Date"><Text type="date" value={f.date} onChange={(v) => set('date', v)} /></Field>
        <Field label={`Amount, ${db.settings.currency}`}><Text type="number" value={String(f.amount || '')} onChange={(v) => set('amount', Number(v))} /></Field>
      </div>
      <div className="two">
        <Field label="Who holds it">
          <Select value={f.holderId} onChange={(v) => set('holderId', v)} options={staffList(db).map((p) => ({ value: p.id, label: p.name }))} />
        </Field>
      </div>
      <Field label="What for"><Text value={f.purpose} onChange={(v) => set('purpose', v)} /></Field>
      <Field label="Category">
        <Select value={f.categoryId ?? ''} onChange={(v) => set('categoryId', v || undefined)} options={[{ value: '', label: '—' }, ...db.expenseCategories.map((c) => ({ value: c.id, label: c.name }))]} />
      </Field>
      <Field label="Notes"><Text value={f.notes} onChange={(v) => set('notes', v)} /></Field>
    </Sheet>
  );
}
