import React from 'react';
import { useStore, useUser } from '@/store';
import { timeAgo } from '@/lib/date';
import { money, plural, qty } from '@/lib/format';
import { belowMin, burnRate, daysOfCover, shoppingOpen, vendorName } from '@/lib/selectors';
import type { InventoryItem } from '@/types';
import {
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
  Spark,
  Stat,
  Text,
  ZoneChip,
  cx,
} from '@/components/ui';
import { ZoneFilterBar } from '@/components/Shell';

export function Inventory() {
  const user = useUser();
  const db = useStore((s) => s.db);
  const zoneFilter = useStore((s) => s.zoneFilter);
  const openSheet = useStore((s) => s.openSheet);
  const adjustStock = useStore((s) => s.adjustStock);
  const [tab, setTab] = React.useState<'stock' | 'shopping' | 'burn'>('stock');
  const [q, setQ] = React.useState('');
  const [onlyLow, setOnlyLow] = React.useState(false);

  const canEdit = user.role === 'owner' || user.role === 'manager';

  let items = db.inventory.filter((i) => i.active);
  if (zoneFilter !== 'all') items = items.filter((i) => i.zone === zoneFilter);
  if (q) items = items.filter((i) => i.name.toLowerCase().includes(q.toLowerCase()));
  if (onlyLow) items = items.filter((i) => i.qty < i.min);

  const low = belowMin(db);
  const cats = db.inventoryCategories
    .filter((c) => c.active && items.some((i) => i.categoryId === c.id))
    .sort((a, b) => a.order - b.order);

  return (
    <>
      <PageHead
        eyebrow="Inventory"
        title="Stock"
        sub="Prayer stock is counted apart from the kitchen. Divo oil is kept two spare, always — the divo burns down over about three days and one spare is already a problem."
        tools={
          <>
            {canEdit && <Btn size="sm" onClick={() => openSheet('inv-new')}>Add a product</Btn>}
            <Btn size="sm" variant="ghost" onClick={() => openSheet('shop-new')}>Add to shopping list</Btn>
          </>
        }
      />

      <div className="grid four" style={{ marginBottom: 16 }}>
        <Stat label="Tracked" value={db.inventory.filter((i) => i.active).length} />
        <Stat label="Below minimum" value={low.length} tone={low.length ? 'warn' : undefined} onClick={() => { setTab('stock'); setOnlyLow(true); }} />
        <Stat label="Out completely" value={db.inventory.filter((i) => i.active && i.qty <= 0).length} tone={db.inventory.some((i) => i.active && i.qty <= 0) ? 'crit' : undefined} />
        <Stat label="On the list" value={shoppingOpen(db).length} onClick={() => setTab('shopping')} />
      </div>

      <div className="row wrap" style={{ gap: 8, marginBottom: 14 }}>
        <Seg
          value={tab}
          onChange={setTab}
          options={[
            { value: 'stock', label: 'Stock' },
            { value: 'shopping', label: 'Shopping list', count: shoppingOpen(db).length },
            { value: 'burn', label: 'How fast it goes' },
          ]}
        />
        <ZoneFilterBar />
      </div>

      {tab === 'stock' && (
        <>
          <div className="row wrap" style={{ gap: 8, marginBottom: 14 }}>
            <input className="in" style={{ width: 'auto', minHeight: 36, flex: '1 1 220px' }} placeholder="Search stock" value={q} onChange={(e) => setQ(e.target.value)} />
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
                meta={`${plural(list.length, 'item')}`}
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
                    <span className="row" style={{ gap: 5, flex: 'none' }}>
                      <IconBtn label="Use one" onClick={() => adjustStock(i.id, -1, 'used')}>−</IconBtn>
                      <span className="tnum" style={{ minWidth: 62, textAlign: 'center', fontWeight: 650, fontSize: 15, color: i.qty <= 0 ? 'var(--rust)' : i.qty < i.min ? 'var(--amber)' : undefined }}>
                        {i.qty}
                        <span className="faint" style={{ fontWeight: 400, fontSize: 11.5 }}> {i.unit}</span>
                      </span>
                      <IconBtn label="Add one" onClick={() => adjustStock(i.id, 1, 'purchased')}>+</IconBtn>
                    </span>
                  </div>
                ))}
              </Group>
            );
          })}
          {!cats.length && <Empty title="Nothing matches">Try clearing the search or the zone filter.</Empty>}
        </>
      )}

      {tab === 'shopping' && <ShoppingList />}
      {tab === 'burn' && <BurnRates items={items} />}
    </>
  );
}

function ShoppingList() {
  const db = useStore((s) => s.db);
  const patch = useStore((s) => s.patch);
  const remove = useStore((s) => s.remove);
  const openSheet = useStore((s) => s.openSheet);
  const showToast = useStore((s) => s.showToast);
  const list = db.shopping.slice().sort((a, b) => a.status.localeCompare(b.status) || a.zone.localeCompare(b.zone));
  const auto = belowMin(db).filter((i) => !db.shopping.some((s) => s.name === i.name && s.status !== 'purchased'));

  const copy = () => {
    const text = [
      ...auto.map((i) => `${i.name} — ${Math.max(i.min * 2 - i.qty, i.min)} ${i.unit} (${i.zone})`),
      ...list.filter((s) => s.status !== 'purchased').map((s) => `${s.name} — ${s.qty} ${s.unit} (${s.zone})`),
    ].join('\n');
    navigator.clipboard?.writeText(text).then(
      () => showToast('Shopping list copied'),
      () => showToast('Could not copy on this device'),
    );
  };

  return (
    <>
      <SectionHead
        title="Automatic — below minimum"
        sub="Anything under its level appears here without anybody adding it."
        action={<Btn size="xs" variant="ghost" onClick={copy}>Copy the whole list</Btn>}
      />
      {auto.length ? (
        <List>
          {auto.map((i) => (
            <Row
              key={i.id}
              title={i.name}
              sub={`${i.qty} of ${i.min} ${i.unit} · suggest ${Math.max(i.min * 2 - i.qty, i.min)} ${i.unit}`}
              zone={i.zone}
              right={<Chip tone={i.qty <= 0 ? 'urgent' : 'low'}>{i.qty <= 0 ? 'Out' : 'Low'}</Chip>}
              onClick={() => openSheet('inv', i.id)}
            />
          ))}
        </List>
      ) : (
        <Card pad="sm"><div className="muted" style={{ fontSize: 14 }}>Nothing below its minimum.</div></Card>
      )}

      <SectionHead title="Added by hand" action={<Btn size="xs" variant="ghost" onClick={() => openSheet('shop-new')}>Add</Btn>} />
      {list.length ? (
        <List>
          {list.map((s) => (
            <div key={s.id} className="item">
              <span className="grow">
                <span className="t" style={{ display: 'block' }}>{s.name}</span>
                <span className="s" style={{ display: 'block' }}>
                  {qty(s.qty, s.unit)} · added by {db.profiles.find((p) => p.id === s.addedBy)?.name} {timeAgo(s.addedAt)}
                  {s.cost ? ` · ${money(s.cost, db.settings.currency)}` : ''}
                  {s.notes ? ` · ${s.notes}` : ''}
                </span>
              </span>
              <ZoneChip zone={s.zone} />
              <Select
                value={s.status}
                onChange={(v) => patch('shopping', s.id, { status: v, purchasedAt: v === 'purchased' ? Date.now() : undefined }, 'Updated')}
                options={[
                  { value: 'needed', label: 'Needed' },
                  { value: 'ordered', label: 'Ordered' },
                  { value: 'purchased', label: 'Bought' },
                ]}
              />
              <IconBtn label="Remove" onClick={() => remove('shopping', s.id, 'Removed from the list')}>✕</IconBtn>
            </div>
          ))}
        </List>
      ) : (
        <Empty title="Nothing added by hand" />
      )}
    </>
  );
}

function BurnRates({ items }: { items: InventoryItem[] }) {
  const db = useStore((s) => s.db);
  const rows = items
    .map((i) => ({ item: i, weekly: burnRate(db, i.id), cover: daysOfCover(db, i) }))
    .filter((r) => r.weekly > 0)
    .sort((a, b) => (a.cover ?? 999) - (b.cover ?? 999));

  return (
    <>
      <SectionHead
        title="Real consumption"
        sub="From the movement log, not a guess. This is the number that tells you a minimum level is set wrong."
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
                    .filter((m) => m.itemId === item.id && m.at >= from && m.at < to && m.delta < 0)
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
          Consumption is computed from every increase and decrease. Use the − and + buttons on the stock
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
  const canEdit = user.role === 'owner' || user.role === 'manager';

  const [f, setF] = React.useState<Partial<InventoryItem>>(
    existing ?? { name: '', categoryId: db.inventoryCategories[0]!.id, zone: 'household', qty: 0, min: 1, unit: 'units', recurring: true, notes: '', active: true },
  );
  const set = (k: keyof InventoryItem, v: unknown) => setF((p) => ({ ...p, [k]: v }));

  const moves = existing ? db.movements.filter((m) => m.itemId === existing.id).sort((a, b) => b.at - a.at).slice(0, 12) : [];

  return (
    <Sheet
      title={existing ? existing.name : 'New product'}
      sub={existing ? `${existing.qty} ${existing.unit} in stock · minimum ${existing.min}` : 'Prayer items are marked and never used for consumption.'}
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

  return (
    <Sheet
      title="Add to the shopping list"
      sub="For anything not tracked as stock, or a one-off."
      onClose={closeSheet}
      footer={
        <>
          <Btn
            className="grow"
            disabled={!f.name}
            onClick={() => {
              upsert('shopping', { ...f, status: 'needed', addedBy: user.id, addedAt: Date.now() }, 'Added to the list');
              closeSheet();
            }}
          >
            Add
          </Btn>
          <Btn variant="ghost" onClick={closeSheet}>Cancel</Btn>
        </>
      }
    >
      <Field label="What to buy">
        <Text value={f.name} onChange={(v) => setF({ ...f, name: v })} placeholder="Replacement bath towels" list="inv-names" />
      </Field>
      <datalist id="inv-names">
        {db.inventory.map((i) => (
          <option key={i.id} value={i.name} />
        ))}
      </datalist>
      <div className="three-col">
        <Field label="How many"><Text type="number" value={String(f.qty)} onChange={(v) => setF({ ...f, qty: Number(v) })} /></Field>
        <Field label="Unit"><Text value={f.unit} onChange={(v) => setF({ ...f, unit: v })} /></Field>
      </div>
      <Field label="Notes"><Text value={f.notes} onChange={(v) => setF({ ...f, notes: v })} /></Field>
    </Sheet>
  );
}
