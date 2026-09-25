import React from 'react';
import { useStore, useUser } from '@/store';
import { can } from '@/lib/access';
import { newId } from '@/lib/id';
import { navigate, useRoute } from '@/lib/router';
import { fmtMedium, timeAgo, today } from '@/lib/date';
import { money, plural, qty } from '@/lib/format';
import {
  atZero,
  belowMin,
  budgetForItem,
  burnRate,
  catName,
  CONSUMING,
  daysOfCover,
  lineItem,
  matchInventory,
  notOnList,
  parseList,
  shopGroups,
  shoppingOpen,
  suggestQty,
  supplySpend,
  tripLines,
  tripSpend,
  vendorName,
} from '@/lib/selectors';
import { shrink } from '@/modules/Issues';
import type {
  DocumentRec,
  ID,
  InventoryItem,
  PaymentMethod,
  ShoppingItem,
  Transaction,
} from '@/types';
import {
  Bar,
  Btn,
  Callout,
  Card,
  Check,
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
  Spark,
  Stat,
  Text,
  ZoneChip,
  cx,
} from '@/components/ui';

/* ============================================================
   Stock, the buy list and the shop.

   Four screens rather than one, because three different people open
   this module for three different reasons: Rosie counts the cupboard,
   Marvin walks a shop, Earl wants to know whether the month is over
   budget. Each gets its own address — #/inventory/count is the
   counting screen on its own — so a screen can be bookmarked on a
   phone and opened with one tap at the shelf.
   ============================================================ */

const TABS = ['buy', 'count', 'stock', 'burn'] as const;
type Tab = (typeof TABS)[number];
const isTab = (s?: string): s is Tab => !!s && (TABS as readonly string[]).includes(s);

/** A buy list line for something that has fallen under its level. */
const lineFor = (i: InventoryItem, by: ID): ShoppingItem => ({
  id: newId(),
  itemId: i.id,
  name: i.name,
  zone: i.zone,
  qty: suggestQty(i),
  unit: i.unit,
  status: 'needed',
  addedBy: by,
  addedAt: Date.now(),
  notes: i.notes,
});

/**
 * Put everything under its minimum on the list. The same action the
 * dashboard card runs, shared so the two can never mean different
 * things — and so it can sit at the bottom of the counting screen,
 * which is where the reason to press it is discovered.
 */
function useAddBelowMin(): () => void {
  const db = useStore((s) => s.db);
  const user = useUser();
  const upsert = useStore((s) => s.upsert);
  const showToast = useStore((s) => s.showToast);

  return () => {
    const missing = notOnList(db);
    if (!missing.length) {
      showToast('Everything below minimum is already on the list');
      return;
    }
    missing.forEach((i) => upsert('shopping', lineFor(i, user.id), 'Added to the buy list'));
    showToast(`${plural(missing.length, 'thing')} added to the buy list`);
  };
}

export function Inventory() {
  const route = useRoute();
  const db = useStore((s) => s.db);
  const user = useUser();
  const openSheet = useStore((s) => s.openSheet);

  /* The buy list is what the house opens this module for, so it is what
     the module opens on. Stock is one tap away. */
  const tab: Tab = isTab(route.sub) ? route.sub : 'buy';
  const setTab = (t: Tab) => navigate('inventory', t);

  const canEdit = can(db, user, 'inventory.edit');
  const low = belowMin(db);
  const out = atZero(db);
  const open = shoppingOpen(db);

  return (
    <>
      <PageHead
        eyebrow="Inventory"
        title="Stock and the buy list"
        sub="Anything below its minimum goes onto the buy list without anybody adding it. The minimums are set at roughly a week's use, because the grocery run is weekly."
        tools={
          <>
            {canEdit && <Btn size="sm" onClick={() => setTab('count')}>Count the cupboard</Btn>}
            {canEdit && <Btn size="sm" variant="soft" onClick={() => openSheet('inv-new')}>Add a product</Btn>}
          </>
        }
      />

      <div className="grid four" style={{ marginBottom: 16 }}>
        <Stat label="To buy" value={open.length} onClick={() => setTab('buy')} />
        <Stat
          label="Below minimum"
          value={low.length}
          tone={low.length ? 'warn' : undefined}
          onClick={() => setTab('count')}
        />
        <Stat label="Out completely" value={out.length} tone={out.length ? 'crit' : undefined} onClick={() => setTab('count')} />
        <Stat label="Tracked" value={db.inventory.filter((i) => i.active).length} onClick={() => setTab('stock')} />
      </div>

      <div className="row wrap" style={{ gap: 8, marginBottom: 14 }}>
        <Seg
          value={tab}
          onChange={setTab}
          options={[
            { value: 'buy', label: 'Buy list', count: open.length },
            { value: 'count', label: 'Count' },
            { value: 'stock', label: 'Stock' },
            { value: 'burn', label: 'How fast it goes' },
          ]}
        />
      </div>

      {tab === 'buy' && <BuyList />}
      {tab === 'count' && <Counting />}
      {tab === 'stock' && <StockList />}
      {tab === 'burn' && <BurnRates />}
    </>
  );
}

/* ============================================================
   1. Counting.

   Rosie counts standing in the store cupboard with one hand on the
   shelf. So: one tight list, a number big enough to read at arm's
   length, and a minus and a plus the size of a thumb. No sheet opens,
   no menu appears, nothing needs saving — every press is already in
   the movement log. Typing over the number is there for the case that
   matters most, which is finding seven of something the app thought
   there were two of.
   ============================================================ */

function Counting() {
  const db = useStore((s) => s.db);
  const user = useUser();
  const addBelowMin = useAddBelowMin();
  const [cat, setCat] = React.useState<ID>('');
  const [q, setQ] = React.useState('');

  const canEdit = can(db, user, 'inventory.edit');
  const cats = db.inventoryCategories.filter((c) => c.active).sort((a, b) => a.order - b.order);

  let items = db.inventory.filter((i) => i.active);
  if (cat) items = items.filter((i) => i.categoryId === cat);
  if (q) items = items.filter((i) => i.name.toLowerCase().includes(q.toLowerCase()));

  /* Below its level first, then empty-handed alphabetical. The reason
     for counting and the counting itself are the same screen. */
  const rows = items.slice().sort((a, b) => {
    const rank = (i: InventoryItem) => (i.qty <= 0 ? 0 : i.qty < i.min ? 1 : 2);
    return rank(a) - rank(b) || a.name.localeCompare(b.name);
  });
  const low = rows.filter((i) => i.qty < i.min);

  if (!canEdit) {
    return <Empty title="Counting is for the people who look after the cupboard">Ask Earl to give you stock editing.</Empty>;
  }

  return (
    <>
      <div className="row wrap" style={{ gap: 8, marginBottom: 12 }}>
        <input
          className="in"
          style={{ width: 'auto', minHeight: 44, flex: '1 1 200px' }}
          placeholder="Find something"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <div style={{ flex: '1 1 160px' }}>
          <Select
            value={cat}
            onChange={setCat}
            options={[{ value: '', label: 'Everywhere' }, ...cats.map((c) => ({ value: c.id, label: c.name }))]}
          />
        </div>
      </div>

      {low.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <Callout
            tone={rows.some((i) => i.qty <= 0) ? 'crit' : 'warn'}
            title={`${plural(low.length, 'thing')} below the level here`}
            action={<Btn size="xs" onClick={addBelowMin}>Add them all</Btn>}
          >
            {low.slice(0, 5).map((i) => i.name).join(', ')}
            {low.length > 5 ? ` and ${low.length - 5} more` : ''}.
          </Callout>
        </div>
      )}

      {rows.length ? (
        <List>
          {rows.map((i) => (
            <CountRow key={i.id} item={i} />
          ))}
        </List>
      ) : (
        <Empty title="Nothing here">Try another shelf, or clear the search.</Empty>
      )}

      <div className="row wrap" style={{ gap: 8, marginTop: 14 }}>
        <Btn variant="soft" onClick={addBelowMin}>Add everything below minimum to the buy list</Btn>
        <Btn variant="soft" onClick={() => navigate('inventory', 'buy')}>Open the buy list</Btn>
      </div>
    </>
  );
}

function CountRow({ item }: { item: InventoryItem }) {
  const adjustStock = useStore((s) => s.adjustStock);
  const openSheet = useStore((s) => s.openSheet);
  const [draft, setDraft] = React.useState<string | null>(null);

  /* A count correction is not consumption, so both buttons and the typed
     number log 'count'. Marking them 'used' would turn the first proper
     stocktake of the year into a week of enormous consumption and raise
     every minimum in the house. */
  const step = (n: number) => adjustStock(item.id, n, 'count');

  const commit = () => {
    if (draft === null) return;
    const counted = Number(draft);
    setDraft(null);
    if (draft.trim() === '' || !Number.isFinite(counted) || counted === item.qty) return;
    adjustStock(item.id, counted - item.qty, 'count');
  };

  const out = item.qty <= 0;
  const low = item.qty < item.min;

  /* The name takes what is left and the stepper drops to its own line
     when a phone cannot give it 170px — otherwise "Dishwasher tablets —
     household" is four words stacked one per line beside the buttons. */
  return (
    <div className="item" style={{ gap: 10, flexWrap: 'wrap', rowGap: 8 }}>
      <span style={{ flex: '1 1 170px', minWidth: 0 }}>
        <button type="button" onClick={() => openSheet('inv', item.id)} style={{ display: 'block', width: '100%' }}>
          <span className="t" style={{ display: 'block', fontSize: 15.5 }}>{item.name}</span>
          <span className="s" style={{ display: 'block' }}>
            minimum {item.min} {item.unit}
            {out ? ' · none left' : low ? ' · below the level' : ''}
          </span>
        </button>
      </span>
      <span className="row" style={{ gap: 6, flex: 'none', marginLeft: 'auto' }}>
        <Btn
          variant="soft"
          aria-label={`One fewer ${item.name}`}
          onClick={() => step(-1)}
          style={{ width: 52, height: 52, padding: 0, fontSize: 24, lineHeight: 1 }}
        >
          −
        </Btn>
        <input
          className="in tnum"
          type="number"
          inputMode="decimal"
          aria-label={`How many ${item.name}`}
          value={draft ?? String(item.qty)}
          onChange={(e) => setDraft(e.target.value)}
          onFocus={(e) => e.target.select()}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur();
          }}
          style={{
            width: 76,
            height: 52,
            padding: 0,
            textAlign: 'center',
            fontSize: 24,
            fontWeight: 650,
            color: out ? 'var(--rust)' : low ? 'var(--amber)' : undefined,
          }}
        />
        <Btn
          variant="soft"
          aria-label={`One more ${item.name}`}
          onClick={() => step(1)}
          style={{ width: 52, height: 52, padding: 0, fontSize: 24, lineHeight: 1 }}
        >
          +
        </Btn>
      </span>
    </div>
  );
}

/* ============================================================
   2 to 5. The buy list, and the shop.

   Two states of the same screen. At home it is a list being built —
   what is short, what somebody added, how the month is going against
   its budget. In the shop it is a route through the aisles with a
   running total. The switch between them is one button, because it is
   the same trip either side of the front door.
   ============================================================ */

function BuyList() {
  const db = useStore((s) => s.db);
  const user = useUser();
  const openSheet = useStore((s) => s.openSheet);
  const showToast = useStore((s) => s.showToast);
  const remove = useStore((s) => s.remove);
  const patch = useStore((s) => s.patch);
  const addBelowMin = useAddBelowMin();

  const [mode, setMode] = React.useState<'list' | 'shop'>('list');
  const [pasting, setPasting] = React.useState(false);

  const canEdit = can(db, user, 'inventory.edit');
  const open = shoppingOpen(db);
  const missing = notOnList(db);

  const copy = () => {
    const text = [
      `Buy list — ${fmtMedium(today())}`,
      'Apartment 3808',
      '',
      ...open.map((s) => `${s.name} — ${qty(s.qty, s.unit)}${s.notes ? ` · ${s.notes}` : ''}`),
      ...(missing.length ? ['', 'Below minimum, not on the list yet'] : []),
      ...missing.map((i) => `${i.name} — suggest ${qty(suggestQty(i), i.unit)} (${i.qty} of ${i.min} left)`),
    ].join('\n');

    if (!navigator.clipboard) {
      showToast('This browser will not let the app copy. Select the list and copy it by hand.');
      return;
    }
    void navigator.clipboard.writeText(text).then(
      () => showToast('Copied — paste it into the house group'),
      () => showToast('Could not copy it on this device'),
    );
  };

  if (mode === 'shop') return <Shop onClose={() => setMode('list')} />;

  return (
    <>
      {pasting && <PasteList onClose={() => setPasting(false)} />}

      <SpendPanel />

      {missing.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <Callout
            tone={missing.some((i) => i.qty <= 0) ? 'crit' : 'warn'}
            title={`${plural(missing.length, 'thing')} below minimum and not on the list`}
            action={canEdit ? <Btn size="xs" onClick={addBelowMin}>Add them all</Btn> : undefined}
          >
            {missing.slice(0, 6).map((i) => i.name).join(', ')}
            {missing.length > 6 ? ` and ${missing.length - 6} more` : ''}.
          </Callout>
        </div>
      )}

      <SectionHead
        title="What to buy"
        sub={open.length ? 'Tap start when you set off, and tick things as they go in the trolley.' : undefined}
        action={
          <div className="row wrap" style={{ gap: 6 }}>
            {canEdit && <Btn size="xs" variant="soft" onClick={() => setPasting(true)}>Paste a list</Btn>}
            {canEdit && <Btn size="xs" variant="soft" onClick={() => openSheet('shop-new')}>Add one thing</Btn>}
            <Btn size="xs" variant="soft" onClick={copy}>Copy the list</Btn>
          </div>
        }
      />

      {open.length ? (
        <>
          <div style={{ marginBottom: 12 }}>
            <Btn block onClick={() => setMode('shop')} disabled={!canEdit}>
              Start the shop — {plural(open.length, 'thing')}
            </Btn>
          </div>
          <List>
            {open.map((s) => {
              const item = lineItem(db, s);
              return (
                <div key={s.id} className="item" style={{ flexWrap: 'wrap', rowGap: 8 }}>
                  <span style={{ flex: '1 1 180px', minWidth: 0 }}>
                    <span className="t" style={{ display: 'block' }}>{s.name}</span>
                    <span className="s" style={{ display: 'block' }}>
                      {qty(s.qty, s.unit)} · added by {db.profiles.find((p) => p.id === s.addedBy)?.name ?? 'someone'} {timeAgo(s.addedAt)}
                      {item ? ` · ${item.qty} in stock` : ' · not tracked in stock'}
                      {s.notes ? ` · ${s.notes}` : ''}
                    </span>
                  </span>
                  <ZoneChip zone={s.zone} />
                  {canEdit && (
                    /* Fixed, and pushed right: a full-width select as a flex
                       child squeezes a name like "Daily items — milk and
                       yoghurt" down to one word a line on a phone. */
                    <span style={{ flex: 'none', width: 132, marginLeft: 'auto' }}>
                      <Select
                        value={s.status}
                        onChange={(v) =>
                          patch('shopping', s.id, { status: v, purchasedAt: v === 'purchased' ? Date.now() : undefined }, 'Buy list updated')
                        }
                        options={[
                          { value: 'needed', label: 'Needed' },
                          { value: 'ordered', label: 'Ordered' },
                          { value: 'purchased', label: 'Bought' },
                        ]}
                      />
                    </span>
                  )}
                  {canEdit && <IconBtn label={`Take ${s.name} off the list`} onClick={() => remove('shopping', s.id, 'Taken off the list')}>✕</IconBtn>}
                </div>
              );
            })}
          </List>
        </>
      ) : (
        <Empty title="Nothing to buy">
          Everything tracked is above its level. Anything that drops below it appears here on its own.
        </Empty>
      )}

      <BoughtRecently />
    </>
  );
}

/* ============================================================
   4. Spend against budget.

   "Are we over?" is asked in the shop, not in the money module, so the
   answer lives beside the thing being bought. Only for people who are
   allowed to see household spending — Marvin is not one of them, and
   he does not need to be to do the shopping.
   ============================================================ */

function SpendPanel() {
  const db = useStore((s) => s.db);
  const user = useUser();
  if (!can(db, user, 'money.view')) return null;

  const s = supplySpend(db, undefined, can(db, user, 'money.viewOwner'));
  if (!s.budget) return null;

  const left = s.budget - s.spent;
  const tone = s.pct > 100 ? 'over' : s.pct > 85 ? 'warn' : 'ok';

  return (
    <Card style={{ marginBottom: 14 }}>
      <div className="between wrap">
        <div className="grow">
          <div className="eyebrow">Shopping budgets this month</div>
          <div className="serif" style={{ fontSize: 21, marginTop: 4 }}>
            {money(s.spent, db.settings.currency)} of {money(s.budget, db.settings.currency)}
          </div>
          <div className="muted" style={{ fontSize: 13.5, marginTop: 4 }}>
            {left >= 0
              ? `${money(left, db.settings.currency)} left for the rest of the month.`
              : `${money(-left, db.settings.currency)} over already.`}
          </div>
        </div>
        <Chip tone={s.pct > 100 ? 'urgent' : s.pct > 85 ? 'low' : 'ok'}>{s.pct}%</Chip>
      </div>

      <div style={{ marginTop: 12 }}>
        <Bar pct={s.pct} tone={tone} />
      </div>

      <div className="list flat" style={{ marginTop: 10 }}>
        {s.lines.map((l) => (
          <div key={l.categoryId} className="item">
            <span className="grow">
              <span className="t" style={{ display: 'block', fontSize: 14 }}>{l.name}</span>
              <span className="s" style={{ display: 'block' }}>
                {money(l.spent, db.settings.currency)} of {money(l.budget, db.settings.currency)}
              </span>
            </span>
            <span style={{ width: 96, flex: 'none' }}>
              <Bar pct={l.pct} tone={l.pct > 100 ? 'over' : l.pct > 85 ? 'warn' : 'ok'} />
            </span>
          </div>
        ))}
      </div>
    </Card>
  );
}

/** What the last trips cost, so the costs entered in a shop are visible
    afterwards rather than disappearing into the money module. */
function BoughtRecently() {
  const db = useStore((s) => s.db);
  const user = useUser();
  const bought = db.shopping
    .filter((s) => s.status === 'purchased')
    .sort((a, b) => (b.purchasedAt ?? 0) - (a.purchasedAt ?? 0))
    .slice(0, 12);

  if (!bought.length) return null;
  const spent = tripSpend(bought);

  return (
    <div style={{ marginTop: 16 }}>
      <Group
        name="Bought recently"
        meta={plural(bought.length, 'thing')}
        count={spent > 0 && can(db, user, 'money.view') ? <Chip tone="plain">{money(spent, db.settings.currency)}</Chip> : undefined}
      >
        {bought.map((s) => (
          <Row
            key={s.id}
            title={s.name}
            sub={`${qty(s.qty, s.unit)} · ${s.purchasedAt ? timeAgo(s.purchasedAt) : 'bought'}${
              s.cost && can(db, user, 'money.view') ? ` · ${money(s.cost, db.settings.currency)}` : ''
            }`}
          />
        ))}
      </Group>
    </div>
  );
}

/* ============================================================
   5. The trip.

   Grouped by the shelf a thing lives on, so one pass of the shop
   clears the list. Ticking a line puts it into stock and takes it off
   the buy list in the same press — the cupboard is right by the time
   the bags are through the door, without anybody doing a second pass.

   The total is the trip's, not the item's. Standing at a shelf the
   useful question is how much has gone in so far, never what the last
   thing cost.
   ============================================================ */

function Shop({ onClose }: { onClose: () => void }) {
  const db = useStore((s) => s.db);
  const user = useUser();
  const patch = useStore((s) => s.patch);
  const adjustStock = useStore((s) => s.adjustStock);
  const [finishing, setFinishing] = React.useState(false);

  const lines = tripLines(db);
  const groups = shopGroups(db, lines);
  const picked = lines.filter((l) => l.status === 'purchased');
  const seesMoney = can(db, user, 'money.view');

  const toggle = (l: ShoppingItem) => {
    const got = l.status === 'purchased';
    patch(
      'shopping',
      l.id,
      got
        ? { status: 'needed', purchasedAt: undefined }
        : { status: 'purchased', purchasedAt: Date.now() },
      got ? `${l.name} back on the list` : `${l.name} in the trolley`,
    );
    const item = lineItem(db, l);
    if (item) adjustStock(item.id, got ? -l.qty : l.qty, 'purchased');
  };

  const setCost = (l: ShoppingItem, raw: string) => {
    const n = Number(raw);
    patch('shopping', l.id, { cost: raw.trim() === '' || !Number.isFinite(n) ? undefined : n }, 'Price noted');
  };

  return (
    <>
      {finishing && <FinishTrip lines={lines} onDone={onClose} onClose={() => setFinishing(false)} />}

      <Card style={{ marginBottom: 14 }}>
        <div className="between wrap">
          <div className="grow">
            <div className="eyebrow">At the shop</div>
            <div className="serif" style={{ fontSize: 26, marginTop: 4 }}>
              {money(tripSpend(picked), db.settings.currency)} so far
            </div>
            <div className="muted" style={{ fontSize: 13.5, marginTop: 4 }}>
              {picked.length} of {lines.length} picked up. Tick a line as it goes in the trolley — that also puts it into stock.
            </div>
          </div>
          <Chip tone={picked.length === lines.length ? 'ok' : 'plain'}>
            {lines.length - picked.length} left
          </Chip>
        </div>

        <div className="row wrap" style={{ gap: 8, marginTop: 13 }}>
          <Btn className="grow" onClick={() => setFinishing(true)} disabled={!picked.length}>
            Finish the trip
          </Btn>
          <Btn variant="soft" onClick={onClose}>Back to the list</Btn>
        </div>
      </Card>

      {!seesMoney && (
        <div style={{ marginBottom: 12 }}>
          <Callout tone="ok" title="Put the price in as you go">
            What you type here goes to Earl with the receipt. Nobody has to remember it at the end of the week.
          </Callout>
        </div>
      )}

      {groups.length ? (
        groups.map((g) => {
          const done = g.lines.filter((l) => l.status === 'purchased').length;
          return (
            <Group
              key={g.id}
              name={g.name}
              meta={plural(g.lines.length, 'thing')}
              count={done === g.lines.length ? <Chip tone="ok">Done</Chip> : <Chip tone="plain">{g.lines.length - done} left</Chip>}
              defaultOpen={done < g.lines.length}
            >
              {g.lines.map((l) => (
                <ShopRow key={l.id} line={l} onToggle={() => toggle(l)} onCost={(v) => setCost(l, v)} currency={db.settings.currency} />
              ))}
            </Group>
          );
        })
      ) : (
        <Empty title="The list is empty">There is nothing to go and get.</Empty>
      )}
    </>
  );
}

function ShopRow({
  line,
  onToggle,
  onCost,
  currency,
}: {
  line: ShoppingItem;
  onToggle: () => void;
  onCost: (v: string) => void;
  currency: string;
}) {
  const [cost, setCostDraft] = React.useState<string | null>(null);
  const got = line.status === 'purchased';

  return (
    <div className="item" style={{ gap: 10, flexWrap: 'wrap', rowGap: 8 }}>
      <Btn
        variant={got ? 'solid' : 'soft'}
        aria-label={got ? `Put ${line.name} back` : `${line.name} is in the trolley`}
        onClick={onToggle}
        style={{ width: 48, height: 48, padding: 0, fontSize: 19, lineHeight: 1, flex: 'none' }}
      >
        ✓
      </Btn>
      <span style={{ flex: '1 1 140px', minWidth: 0 }}>
        <span className="t" style={{ display: 'block', textDecoration: got ? 'line-through' : undefined }}>
          {line.name}
        </span>
        <span className="s" style={{ display: 'block' }}>
          {qty(line.qty, line.unit)}
          {line.notes ? ` · ${line.notes}` : ''}
        </span>
      </span>
      <input
        className="in tnum"
        type="number"
        inputMode="decimal"
        placeholder={currency}
        aria-label={`What did ${line.name} cost?`}
        value={cost ?? (line.cost != null ? String(line.cost) : '')}
        onChange={(e) => setCostDraft(e.target.value)}
        onFocus={(e) => e.target.select()}
        onBlur={() => {
          if (cost !== null) onCost(cost);
          setCostDraft(null);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
        }}
        style={{ width: 90, height: 48, flex: 'none', marginLeft: 'auto', textAlign: 'right', fontSize: 16 }}
      />
    </div>
  );
}

/* ============================================================
   Finishing a trip.

   One till receipt is one payment, so the money is written as one
   transaction per budget rather than one per line — a fortnight of
   fifteen-line trips would otherwise bury every other entry in the
   money module. The receipt photograph is filed once and every
   transaction from the trip points at it.

   Marvin can see none of this: staff hold inventory.edit but not
   money.view. So he finishes the trip, the prices stay on the lines
   with the receipt, and Earl files them. Writing money records as
   somebody who is not allowed to read them back would be the wrong
   way round.
   ============================================================ */

function FinishTrip({ lines, onDone, onClose }: { lines: ShoppingItem[]; onDone: () => void; onClose: () => void }) {
  const db = useStore((s) => s.db);
  const user = useUser();
  const patch = useStore((s) => s.patch);
  const upsert = useStore((s) => s.upsert);
  const adjustStock = useStore((s) => s.adjustStock);
  const showToast = useStore((s) => s.showToast);

  const [method, setMethod] = React.useState<PaymentMethod>('Cash');
  const [receipt, setReceipt] = React.useState('');
  const [markRest, setMarkRest] = React.useState(false);
  const [override, setOverride] = React.useState<Record<string, ID>>({});

  const seesMoney = can(db, user, 'money.view');
  const picked = lines.filter((l) => l.status === 'purchased');
  const rest = lines.filter((l) => l.status !== 'purchased');
  const total = tripSpend(picked);
  const unpriced = picked.filter((l) => l.cost == null).length;

  /* Bundled by the budget each thing naturally falls to, from the shelf
     it came off. The override is keyed by that natural budget rather
     than by whatever it has been changed to, so changing a bundle twice
     does not leave the second change with nowhere to land. */
  const fallback = db.expenseCategories.find((c) => c.active)?.id ?? '';
  const bundles = new Map<ID, ShoppingItem[]>();
  picked.forEach((l) => {
    const key = budgetForItem(db, lineItem(db, l)) ?? fallback;
    const found = bundles.get(key);
    if (found) found.push(l);
    else bundles.set(key, [l]);
  });
  const budgetOf = (natural: ID): ID => override[natural] ?? natural;

  const finish = () => {
    if (markRest) {
      rest.forEach((l) => {
        patch('shopping', l.id, { status: 'purchased', purchasedAt: Date.now() }, `${l.name} bought`);
        const item = lineItem(db, l);
        if (item) adjustStock(item.id, l.qty, 'purchased');
      });
    }

    if (seesMoney) {
      const receiptId = receipt ? newId() : undefined;
      const written: ID[] = [];

      /* Two shelves can be sent to the same budget, and one payment to
         one budget is one entry, so they are merged before writing. */
      const merged = new Map<ID, ShoppingItem[]>();
      bundles.forEach((group, natural) => {
        const id = budgetOf(natural);
        merged.set(id, [...(merged.get(id) ?? []), ...group]);
      });

      merged.forEach((group, categoryId) => {
        const amount = tripSpend(group);
        if (!amount || !categoryId) return;
        const id = newId();
        const tx: Transaction = {
          id,
          date: today(),
          description: `Shopping — ${catName(db, categoryId)}`,
          amount,
          categoryId,
          zone: 'household',
          method,
          ref: '',
          receiptId,
          enteredBy: user.id,
          visibility: 'manager',
          /* No linkedId: one payment covers many lines, and pointing at
             any single one of them would be a lie about the rest. */
          linkedType: 'shopping',
          notes: group.map((l) => l.name).join(', '),
        };
        upsert('transactions', tx, 'Shopping recorded');
        written.push(id);
      });

      if (receiptId) {
        const doc: DocumentRec = {
          id: receiptId,
          title: `Shop receipt — ${fmtMedium(today())}`,
          cat: 'Receipt',
          path: receipt,
          filename: `receipt-${today()}.jpg`,
          mime: 'image/jpeg',
          sizeKb: Math.round((receipt.length * 0.75) / 1024),
          zone: 'household',
          linkedType: 'transaction',
          linkedId: written.length ? written[0] : undefined,
          issueDate: today(),
          expiryDate: '',
          reminderDays: 0,
          visibility: 'manager',
          uploadedBy: user.id,
          uploadedAt: Date.now(),
          notes: `${plural(picked.length, 'thing')} bought.`,
        };
        upsert('documents', doc, 'Receipt filed');
      }

      showToast(
        total ? `Trip finished — ${money(total, db.settings.currency)} recorded` : 'Trip finished',
      );
    } else {
      showToast('Trip finished — the prices and the receipt have gone to Earl');
    }

    onClose();
    onDone();
  };

  return (
    <Sheet
      title="Finish the trip"
      sub={`${plural(picked.length, 'thing')} in the trolley · ${money(total, db.settings.currency)}`}
      onClose={onClose}
      footer={
        <>
          <Btn className="grow" onClick={finish}>
            {seesMoney ? 'Finish and record the spend' : 'Finish the trip'}
          </Btn>
          <Btn variant="soft" onClick={onClose}>Not yet</Btn>
        </>
      }
    >
      {unpriced > 0 && (
        <div style={{ marginBottom: 12 }}>
          <Callout tone="warn" title={`${plural(unpriced, 'thing')} has no price on it`}>
            Go back and put the prices in if you have the receipt in your hand. It is much harder later.
          </Callout>
        </div>
      )}

      <SectionHead title="The receipt" sub="A photograph of the till slip, kept with the spending." />
      <div className="row wrap" style={{ gap: 10, marginBottom: 14 }}>
        <label className="btn soft" style={{ cursor: 'pointer' }}>
          {receipt ? 'Take another photograph' : 'Photograph the receipt'}
          <input
            type="file"
            accept="image/*"
            capture="environment"
            hidden
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (file) setReceipt(await shrink(file));
            }}
          />
        </label>
        {receipt && (
          <>
            <img src={receipt} alt="The till receipt" style={{ height: 66, borderRadius: 8, border: '1px solid var(--line)' }} />
            <Btn size="xs" variant="soft" onClick={() => setReceipt('')}>Remove it</Btn>
          </>
        )}
      </div>

      {rest.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          <Check
            checked={markRest}
            onChange={setMarkRest}
            label={`Mark the other ${plural(rest.length, 'thing')} as bought too`}
          />
          <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>
            Leave this alone and they stay on the list for next time.
          </div>
        </div>
      )}

      {seesMoney && (
        <>
          <SectionHead title="Where it goes" sub="One entry per budget. Change any of them if the shop was not what it looks like." />
          <Field label="How it was paid">
            <Select
              value={method}
              onChange={setMethod}
              options={(['Cash', 'Petty cash', 'Card', 'Bank transfer'] as PaymentMethod[]).map((m) => ({ value: m, label: m }))}
            />
          </Field>
          {[...bundles.entries()].map(([natural, group]) => (
            <div key={natural} className="two" style={{ alignItems: 'end' }}>
              <Field label={`${plural(group.length, 'thing')} · ${money(tripSpend(group), db.settings.currency)}`}>
                <Select
                  value={budgetOf(natural)}
                  onChange={(v) => setOverride((p) => ({ ...p, [natural]: v }))}
                  options={db.expenseCategories
                    .filter((c) => c.active)
                    .map((c) => ({ value: c.id, label: c.name }))}
                />
              </Field>
              <div className="muted" style={{ fontSize: 13, paddingBottom: 10 }}>
                {group.map((l) => l.name).join(', ')}
              </div>
            </div>
          ))}
        </>
      )}
    </Sheet>
  );
}

/* ============================================================
   3. A written list, pasted in.

   He arrives with a grocery list on paper or in a photograph. Typing
   forty things into forty forms is an hour nobody has, so: one box,
   one thing per line, written however people actually write them.
   Everything is guessed and then shown before a single row is saved —
   the guess is a first draft, not a decision.
   ============================================================ */

interface Draft {
  key: string;
  name: string;
  qty: string;
  unit: string;
  /** The tracked product this row is, or '' for something new. */
  itemId: ID;
}

function PasteList({ onClose }: { onClose: () => void }) {
  const db = useStore((s) => s.db);
  const user = useUser();
  const upsert = useStore((s) => s.upsert);
  const patch = useStore((s) => s.patch);
  const adjustStock = useStore((s) => s.adjustStock);
  const showToast = useStore((s) => s.showToast);

  const [dest, setDest] = React.useState<'buy' | 'stock'>('buy');
  const [text, setText] = React.useState('');
  const [rows, setRows] = React.useState<Draft[] | null>(null);
  const [newCat, setNewCat] = React.useState<ID>(db.inventoryCategories[0]?.id ?? '');

  const products = db.inventory.filter((i) => i.active).slice().sort((a, b) => a.name.localeCompare(b.name));

  const read = () => {
    const parsed = parseList(text).map((p, n) => {
      const item = matchInventory(db, p.name);
      return {
        key: `r${n}`,
        name: item?.name ?? p.name,
        qty: p.qty != null ? String(p.qty) : '',
        unit: p.unit ?? item?.unit ?? '',
        itemId: item?.id ?? '',
      };
    });
    setRows(parsed);
    if (!parsed.length) showToast('Nothing on those lines to read');
  };

  const edit = (key: string, changes: Partial<Draft>) =>
    setRows((p) => (p ?? []).map((r) => (r.key === key ? { ...r, ...changes } : r)));

  const drop = (key: string) => setRows((p) => (p ?? []).filter((r) => r.key !== key));

  const chosen = (rows ?? []).filter((r) => r.name.trim());
  const fresh = chosen.filter((r) => !r.itemId).length;

  /* A line already on the list is updated rather than added again. Three
     separate lines saying "Milk" is how a list stops being trusted. */
  const openLineFor = (r: Draft): ShoppingItem | undefined =>
    shoppingOpen(db).find((s) =>
      r.itemId ? s.itemId === r.itemId || s.name.toLowerCase() === r.name.trim().toLowerCase()
        : s.name.toLowerCase() === r.name.trim().toLowerCase(),
    );

  const commitToList = () => {
    chosen.forEach((r) => {
      const item = r.itemId ? db.inventory.find((i) => i.id === r.itemId) : undefined;
      const amount = Number(r.qty) || (item ? suggestQty(item) : 1);
      const unit = r.unit.trim() || item?.unit || 'units';
      const already = openLineFor(r);

      if (already) {
        patch('shopping', already.id, { qty: amount, unit }, 'Buy list updated');
        return;
      }
      const line: ShoppingItem = {
        id: newId(),
        itemId: item?.id,
        name: item?.name ?? r.name.trim(),
        zone: item?.zone ?? 'household',
        qty: amount,
        unit,
        status: 'needed',
        addedBy: user.id,
        addedAt: Date.now(),
        notes: '',
      };
      upsert('shopping', line, 'Added to the buy list');
    });
    showToast(`${plural(chosen.length, 'thing')} on the buy list`);
    onClose();
  };

  const commitToStock = () => {
    chosen.forEach((r) => {
      const counted = Number(r.qty);
      const valid = r.qty.trim() !== '' && Number.isFinite(counted);
      const item = r.itemId ? db.inventory.find((i) => i.id === r.itemId) : undefined;

      if (item) {
        if (valid && counted !== item.qty) adjustStock(item.id, counted - item.qty, 'count');
        return;
      }
      const product: InventoryItem = {
        id: newId(),
        name: r.name.trim(),
        categoryId: newCat,
        zone: db.inventoryCategories.find((c) => c.id === newCat)?.zone ?? 'household',
        qty: valid ? counted : 0,
        min: 1,
        unit: r.unit.trim() || 'units',
        recurring: true,
        notes: '',
        active: true,
      };
      upsert('inventory', product, 'Product added');
    });
    showToast(`${plural(chosen.length, 'thing')} counted`);
    onClose();
  };

  return (
    <Sheet
      title="Paste a list"
      sub="One thing on each line, written however it was written down."
      wide
      onClose={onClose}
      footer={
        rows ? (
          <>
            <Btn
              className="grow"
              disabled={!chosen.length}
              onClick={dest === 'buy' ? commitToList : commitToStock}
            >
              {dest === 'buy'
                ? `Add ${plural(chosen.length, 'thing')} to the buy list`
                : `Save the count for ${plural(chosen.length, 'thing')}`}
            </Btn>
            <Btn variant="soft" onClick={() => setRows(null)}>Back to the text</Btn>
          </>
        ) : (
          <>
            <Btn className="grow" disabled={!text.trim()} onClick={read}>Read the list</Btn>
            <Btn variant="soft" onClick={onClose}>Cancel</Btn>
          </>
        )
      }
    >
      <div style={{ marginBottom: 14 }}>
        <Seg
          value={dest}
          onChange={setDest}
          options={[
            { value: 'buy', label: 'Things to buy' },
            { value: 'stock', label: 'A count of what is there' },
          ]}
        />
      </div>

      {!rows ? (
        <>
          <Field
            label="The list"
            hint="Quantities are picked up where they are written — 5kg, 2 x, 12, and so on. Nothing is saved until you have looked at it."
          >
            <textarea
              className="in"
              rows={12}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={'Basmati rice 5kg\n5 x tinned tomatoes\n2kg atta\nmilk\nToilet roll - 12'}
            />
          </Field>
        </>
      ) : (
        <>
          <SectionHead
            title={`${plural(chosen.length, 'line')} read`}
            sub={
              fresh
                ? `${chosen.length - fresh} matched something the house already tracks, ${fresh} ${fresh === 1 ? 'is' : 'are'} new.`
                : 'Every line matched something the house already tracks.'
            }
          />

          {dest === 'stock' && fresh > 0 && (
            <Field label="Where the new ones live" hint="New products start with a minimum of 1 — set the real level on the product afterwards.">
              <Select
                value={newCat}
                onChange={setNewCat}
                options={db.inventoryCategories.filter((c) => c.active).map((c) => ({ value: c.id, label: c.name }))}
              />
            </Field>
          )}

          <List>
            {rows.map((r) => {
              const already = dest === 'buy' ? openLineFor(r) : undefined;
              return (
                <div key={r.key} className="item" style={{ flexWrap: 'wrap', gap: 8 }}>
                  <span className="grow" style={{ minWidth: 150 }}>
                    <Text value={r.name} onChange={(v) => edit(r.key, { name: v })} aria-label="What it is" />
                  </span>
                  <span style={{ flex: 'none', width: 74 }}>
                    <Text
                      value={r.qty}
                      onChange={(v) => edit(r.key, { qty: v })}
                      type="number"
                      inputMode="decimal"
                      placeholder="—"
                      aria-label="How many"
                    />
                  </span>
                  <span style={{ flex: 'none', width: 82 }}>
                    <Text value={r.unit} onChange={(v) => edit(r.key, { unit: v })} placeholder="unit" aria-label="Unit" />
                  </span>
                  <span style={{ flex: 'none', minWidth: 160 }}>
                    <Select
                      value={r.itemId}
                      onChange={(v) => {
                        const item = products.find((i) => i.id === v);
                        edit(r.key, { itemId: v, name: item?.name ?? r.name, unit: item?.unit ?? r.unit });
                      }}
                      options={[
                        { value: '', label: 'New — not tracked yet' },
                        ...products.map((i) => ({ value: i.id, label: i.name })),
                      ]}
                    />
                  </span>
                  <Chip tone={already ? 'warn' : r.itemId ? 'ok' : 'low'}>
                    {already ? 'Already on the list' : r.itemId ? 'Tracked' : 'New'}
                  </Chip>
                  <IconBtn label={`Leave ${r.name || 'this line'} out`} onClick={() => drop(r.key)}>✕</IconBtn>
                </div>
              );
            })}
          </List>
        </>
      )}
    </Sheet>
  );
}

/* ============================================================
   The stock list and the consumption table. Unchanged in purpose:
   the whole cupboard, by shelf, and the number that tells you a
   minimum has been set wrong.
   ============================================================ */

function StockList() {
  const db = useStore((s) => s.db);
  const user = useUser();
  const openSheet = useStore((s) => s.openSheet);
  const adjustStock = useStore((s) => s.adjustStock);
  const [q, setQ] = React.useState('');
  const [onlyLow, setOnlyLow] = React.useState(false);

  const canEdit = can(db, user, 'inventory.edit');

  let items = db.inventory.filter((i) => i.active);
  if (q) items = items.filter((i) => i.name.toLowerCase().includes(q.toLowerCase()));
  if (onlyLow) items = items.filter((i) => i.qty < i.min);

  const cats = db.inventoryCategories
    .filter((c) => c.active && items.some((i) => i.categoryId === c.id))
    .sort((a, b) => a.order - b.order);

  return (
    <>
      <div className="row wrap" style={{ gap: 8, marginBottom: 14 }}>
        <input
          className="in"
          style={{ width: 'auto', minHeight: 36, flex: '1 1 220px' }}
          placeholder="Search stock"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <button type="button" className={cx('chip', onlyLow && 'low')} onClick={() => setOnlyLow(!onlyLow)}>
          Below minimum only
        </button>
      </div>

      {cats.map((c) => {
        const list = items.filter((i) => i.categoryId === c.id);
        const lowCount = list.filter((i) => i.qty < i.min).length;
        return (
          <Group
            key={c.id}
            name={c.name}
            meta={plural(list.length, 'item')}
            count={lowCount ? <Chip tone="low">{lowCount} low</Chip> : <Chip tone="ok">Stocked</Chip>}
            right={<ZoneChip zone={c.zone} />}
            defaultOpen={lowCount > 0 || cats.length <= 3}
          >
            {list.map((i) => (
              <div key={i.id} className="item">
                <span className="grow">
                  <button type="button" onClick={() => openSheet('inv', i.id)} style={{ display: 'block', width: '100%' }}>
                    <span className="t" style={{ display: 'block' }}>{i.name}</span>
                    <span className="s" style={{ display: 'block' }}>
                      min {i.min} {i.unit}
                      {i.vendorId ? ` · ${vendorName(db, i.vendorId)}` : ''}
                      {i.notes ? ` · ${i.notes}` : ''}
                    </span>
                  </button>
                </span>
                {canEdit && (
                  <span className="row" style={{ gap: 5, flex: 'none' }}>
                    <IconBtn label={`Used one ${i.name}`} onClick={() => adjustStock(i.id, -1, 'used')}>−</IconBtn>
                    <span
                      className="tnum"
                      style={{
                        minWidth: 62,
                        textAlign: 'center',
                        fontWeight: 650,
                        fontSize: 15,
                        color: i.qty <= 0 ? 'var(--rust)' : i.qty < i.min ? 'var(--amber)' : undefined,
                      }}
                    >
                      {i.qty}
                      <span className="faint" style={{ fontWeight: 400, fontSize: 11.5 }}> {i.unit}</span>
                    </span>
                    <IconBtn label={`Bought one ${i.name}`} onClick={() => adjustStock(i.id, 1, 'purchased')}>+</IconBtn>
                  </span>
                )}
              </div>
            ))}
          </Group>
        );
      })}
      {!cats.length && <Empty title="Nothing matches">Try clearing the search, or the below-minimum filter.</Empty>}
    </>
  );
}

function BurnRates() {
  const db = useStore((s) => s.db);
  const rows = db.inventory
    .filter((i) => i.active)
    .map((i) => ({ item: i, weekly: burnRate(db, i.id), cover: daysOfCover(db, i) }))
    .filter((r) => r.weekly > 0)
    .sort((a, b) => (a.cover ?? 999) - (b.cover ?? 999));

  return (
    <>
      <SectionHead
        title="Real consumption"
        sub="From the movement log, not a guess. Stocktake corrections are left out, so a count never reads as a week of heavy use. This is the number that tells you a minimum level is set wrong."
      />
      {rows.length ? (
        <div className="tblwrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>Item</th>
                <th>Zone</th>
                <th className="num">In stock</th>
                <th className="num">Minimum</th>
                <th className="num">Per week</th>
                <th className="num">Cover</th>
                <th>Last 4 weeks</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ item, weekly, cover }) => {
                const weeks = [3, 2, 1, 0].map((w) => {
                  const from = Date.now() - (w + 1) * 7 * 864e5;
                  const to = Date.now() - w * 7 * 864e5;
                  return db.movements
                    .filter(
                      (m) =>
                        m.itemId === item.id && m.at >= from && m.at < to && m.delta < 0 && CONSUMING.includes(m.reason),
                    )
                    .reduce((s, m) => s + Math.abs(m.delta), 0);
                });
                return (
                  <tr key={item.id}>
                    <td>{item.name}</td>
                    <td><ZoneChip zone={item.zone} /></td>
                    <td className="num">{item.qty}</td>
                    <td className="num">{item.min}</td>
                    <td className="num">{weekly}</td>
                    <td className="num">
                      {cover == null ? '—' : (
                        <span className={cover < 7 ? 'chip urgent' : cover < 14 ? 'chip low' : 'chip ok'}>
                          {cover}d
                        </span>
                      )}
                    </td>
                    <td style={{ width: 110 }}><Spark values={weeks} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty title="Not enough movement history yet">
          Consumption is computed from what leaves the cupboard. Use the − and + buttons on the stock
          list for a few days and this fills in.
        </Empty>
      )}
    </>
  );
}

export function InvSheet({ id }: { id: string }) {
  const user = useUser();
  const db = useStore((s) => s.db);
  const closeSheet = useStore((s) => s.closeSheet);
  const upsert = useStore((s) => s.upsert);
  const remove = useStore((s) => s.remove);
  const adjustStock = useStore((s) => s.adjustStock);
  const existing = db.inventory.find((i) => i.id === id);
  const canEdit = can(db, user, 'inventory.edit');

  const [f, setF] = React.useState<Partial<InventoryItem>>(
    existing ?? { name: '', categoryId: db.inventoryCategories[0]!.id, zone: 'household', qty: 0, min: 1, unit: 'units', recurring: true, notes: '', active: true },
  );
  const set = (k: keyof InventoryItem, v: unknown) => setF((p) => ({ ...p, [k]: v }));

  const moves = existing ? db.movements.filter((m) => m.itemId === existing.id).sort((a, b) => b.at - a.at).slice(0, 12) : [];

  return (
    <Sheet
      title={existing ? existing.name : 'New product'}
      sub={existing ? `${existing.qty} ${existing.unit} in stock · minimum ${existing.min}` : 'The minimum is the number that puts it on the buy list. Set it at about a week’s use.'}
      onClose={closeSheet}
      footer={
        <>
          {canEdit && (
            <Btn className="grow" onClick={() => { upsert('inventory', { ...f }, 'Product saved'); closeSheet(); }}>
              Save
            </Btn>
          )}
          {existing && (
            <>
              <Btn variant="ghost" onClick={() => adjustStock(existing.id, -1, 'used')}>Used one</Btn>
              <Btn variant="ghost" onClick={() => adjustStock(existing.id, 1, 'purchased')}>Bought one</Btn>
            </>
          )}
          {existing && canEdit && (
            <Btn variant="danger" size="sm" onClick={() => { remove('inventory', existing.id, 'Product removed'); closeSheet(); }}>
              Delete
            </Btn>
          )}
        </>
      }
    >
      <Field label="Name"><Text value={f.name ?? ''} onChange={(v) => set('name', v)} disabled={!canEdit} /></Field>
      <div className="two">
        <Field label="Category">
          <Select
            value={f.categoryId}
            onChange={(v) => {
              const c = db.inventoryCategories.find((x) => x.id === v);
              setF((p) => ({ ...p, categoryId: v, zone: c?.zone ?? p.zone }));
            }}
            options={db.inventoryCategories.filter((c) => c.active).map((c) => ({ value: c.id, label: `${c.name} · ${c.zone}` }))}
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
      <div className="three-col">
        <Field label="In stock"><Text type="number" value={String(f.qty ?? 0)} onChange={(v) => set('qty', Number(v))} /></Field>
        <Field label="Minimum" hint="Below this goes on the list."><Text type="number" value={String(f.min ?? 0)} onChange={(v) => set('min', Number(v))} disabled={!canEdit} /></Field>
        <Field label="Unit"><Text value={f.unit ?? ''} onChange={(v) => set('unit', v)} disabled={!canEdit} /></Field>
      </div>
      <Field label="Preferred supplier">
        <Select
          value={f.vendorId ?? ''}
          onChange={(v) => set('vendorId', v || undefined)}
          options={[{ value: '', label: 'None' }, ...db.vendors.filter((v) => v.active).map((v) => ({ value: v.id, label: v.name }))]}
        />
      </Field>
      <Field label="Notes" hint="Specific brand, size, anything worth remembering at the shop.">
        <textarea className="in" rows={2} value={f.notes ?? ''} onChange={(e) => set('notes', e.target.value)} />
      </Field>

      {existing && (
        <>
          <SectionHead title="Recent movement" sub={`${burnRate(db, existing.id)} ${existing.unit} a week`} />
          {moves.length ? (
            <List className="flat">
              {moves.map((m) => (
                <Row
                  key={m.id}
                  title={`${m.delta > 0 ? '+' : ''}${m.delta} ${existing.unit}`}
                  sub={`${m.reason} · ${db.profiles.find((p) => p.id === m.by)?.name ?? '—'} · ${timeAgo(m.at)}`}
                />
              ))}
            </List>
          ) : (
            <Card pad="sm"><div className="muted" style={{ fontSize: 13.5 }}>No movement recorded yet.</div></Card>
          )}
        </>
      )}
    </Sheet>
  );
}

export function ShopNewSheet() {
  const user = useUser();
  const db = useStore((s) => s.db);
  const closeSheet = useStore((s) => s.closeSheet);
  const upsert = useStore((s) => s.upsert);
  const [f, setF] = React.useState({ name: '', zone: 'household' as const, qty: 1, unit: 'units', notes: '' });

  /* Typing the name of something the house already tracks links the line
     to it, so ticking it in the shop puts it into stock. */
  const match = matchInventory(db, f.name);

  return (
    <Sheet
      title="Add to the buy list"
      sub="For anything not tracked as stock, or a one-off."
      onClose={closeSheet}
      footer={
        <>
          <Btn
            className="grow"
            disabled={!f.name}
            onClick={() => {
              const line: ShoppingItem = {
                id: newId(),
                itemId: match?.id,
                name: match?.name ?? f.name.trim(),
                zone: match?.zone ?? f.zone,
                qty: f.qty,
                unit: match?.unit ?? f.unit,
                status: 'needed',
                addedBy: user.id,
                addedAt: Date.now(),
                notes: f.notes,
              };
              upsert('shopping', line, 'Added to the buy list');
              closeSheet();
            }}
          >
            Add
          </Btn>
          <Btn variant="ghost" onClick={closeSheet}>Cancel</Btn>
        </>
      }
    >
      <Field label="What to buy" hint={match ? `Tracked in stock — ${match.qty} ${match.unit} there now.` : undefined}>
        <Text value={f.name} onChange={(v) => setF({ ...f, name: v })} placeholder="Replacement bath towels" list="inv-names" />
      </Field>
      <datalist id="inv-names">
        {db.inventory.filter((i) => i.active).map((i) => (
          <option key={i.id} value={i.name} />
        ))}
      </datalist>
      <div className="three-col">
        <Field label="How many"><Text type="number" value={String(f.qty)} onChange={(v) => setF({ ...f, qty: Number(v) })} /></Field>
        <Field label="Unit"><Text value={match?.unit ?? f.unit} onChange={(v) => setF({ ...f, unit: v })} disabled={!!match} /></Field>
      </div>
      <Field label="Notes"><Text value={f.notes} onChange={(v) => setF({ ...f, notes: v })} /></Field>
    </Sheet>
  );
}
