import React from 'react';
import { nameOf, useCan, useStore } from '@/store';
import { addDays, diffDays, fmt, hhmm, timeAgo, today } from '@/lib/date';
import { plural, titleCase } from '@/lib/format';
import type { DivoLog, InventoryItem, Observance } from '@/types';
import {
  PRAYER_ITEM_RULE,
  PRAYER_ITEM_RULE_HEADING,
  observanceDayNo,
  ordinalDay,
} from '@/seed/prayer';
import {
  Btn,
  Callout,
  Card,
  Chip,
  Empty,
  Field,
  List,
  Num,
  PageHead,
  Row,
  SectionHead,
  Select,
  Stat,
  Table,
  Text,
  cx,
} from '@/components/ui';

/* ============================================================
   The shrine.

   The divo is the reason this screen exists as its own page rather
   than a block on the running sheet: it burns all evening, it is
   checked and topped before anyone goes to bed, and whoever is on
   duty needs one place that says whether it is lit and how much oil
   is left. Everything else here is reference — the rules and the
   separate equipment — kept beside it so nobody has to remember
   which sponge is which.
   ============================================================ */

type OilLevel = NonNullable<DivoLog['oilLevel']>;

const OIL_OPTIONS: { value: OilLevel; label: string }[] = [
  { value: 'full', label: 'Full' },
  { value: 'half', label: 'Half' },
  { value: 'low', label: 'Low' },
  { value: 'empty', label: 'Empty' },
];

const ACTION_LABEL: Record<DivoLog['action'], string> = {
  lit: 'Divo lit',
  topped: 'Topped up',
  checked: 'Checked — still burning',
  extinguished: 'Extinguished',
};

/* Quoted from the spec. The fourth line carries the second half of the
   food rule, because the sponge and the meat are the same sentence there
   and splitting them is how the sponge ends up in the washing-up bowl. */
const SHRINE_RULES = [
  'Shoes off before going near the shrine',
  'Dusted with the shrine cloth — no sprays, no chemicals',
  'Statues not moved',
  'Shrine items washed with the shrine sponge only — that sponge never touches meat or normal washing-up',
  'Used matchsticks and ash cleared away',
  'Area around the shrine clear',
];

/** Divo oil is kept at two spare bottles, which is the shopping list's own rule. */
const OIL_SPARES = 2;

/* The standing footer rule from the sheet, written out here rather than
   read from the seed so it cannot go missing from the page. */
const ASK_ADITYA =
  'IF YOU ARE NOT SURE ABOUT THE SHRINE OR THE PRAYERS — STOP AND ASK ADITYA BEFORE YOU DO ANYTHING.';

export function Shrine() {
  const db = useStore((s) => s.db);
  const date = useStore((s) => s.date);
  const ensureSheet = useStore((s) => s.ensureSheet);
  const tickCheck = useStore((s) => s.tickCheck);
  const logDivo = useStore((s) => s.logDivo);

  React.useEffect(() => {
    ensureSheet(date);
  }, [date, ensureSheet]);

  /* logDivo prepends and the seed runs oldest-first, so the log is only
     partly ordered. Sort before reading anything off the front of it. */
  const log = React.useMemo(() => db.divoLog.slice().sort((a, b) => b.at - a.at), [db.divoLog]);
  const last = log[0];
  const oilLevel = log.find((e) => e.oilLevel)?.oilLevel;
  const burning = last ? last.action !== 'extinguished' : false;
  const stale = !last || Date.now() - last.at > 6 * 36e5;
  const lowOil = oilLevel === 'low' || oilLevel === 'empty';

  const [pick, setPick] = React.useState<OilLevel>(oilLevel ?? 'full');

  const sheet = db.sheets[date];
  const shrineGroup = sheet?.checks.find((g) => g.title.startsWith('SHRINE'));
  const shrineDone = shrineGroup?.items.filter((i) => i.done).length ?? 0;

  const inv = db.inventory.filter((i) => i.active);
  const oilItem = inv.find((i) => /(divo|shrine|lamp)/i.test(i.name) && /oil/i.test(i.name));
  const matchItem = inv.find((i) => /match/i.test(i.name));
  const wickItem = inv.find((i) => /wick/i.test(i.name));
  const shrineOnly = inv.filter((i) => i.shrineOnly);
  const prayerItems = inv.filter((i) => i.prayerItem);

  const obs = db.observances.find((o) => o.active) ?? db.observances[0];

  return (
    <>
      <PageHead
        eyebrow="Shrine"
        title="The shrine and the divo"
        sub="The divo, the shrine equipment and the prayer items. Rosie dusts the shrine and tops the divo; anything you are unsure about goes to Aditya first."
      />

      <div style={{ marginBottom: 18 }}>
        <Callout tone="crit" title={ASK_ADITYA}>
          This applies to everything on this page. Asking costs a minute. Guessing costs the prayers.
        </Callout>
      </div>

      {/* ---------- 1. the divo ---------- */}

      <SectionHead
        title="The divo"
        sub="Its state is whatever was last logged. Log it every time you touch it, so the person on the late shift is not guessing."
      />

      {(stale || lowOil) && (
        <div style={{ marginBottom: 14 }}>
          <Callout
            tone="crit"
            title={
              !last
                ? 'Nobody has logged the divo yet'
                : lowOil
                  ? `Divo oil is ${oilLevel}`
                  : `The divo was last logged ${timeAgo(last.at)}`
            }
          >
            The divo is checked and topped up before anyone goes to bed. Keep {OIL_SPARES} spare bottles of
            oil — Marvin buys it first thing.
          </Callout>
        </div>
      )}

      <div className="grid three" style={{ marginBottom: 14 }}>
        <Stat
          label="Right now"
          value={last ? (burning ? 'Burning' : 'Out') : '—'}
          tone={last ? (burning ? 'ok' : 'crit') : undefined}
          foot={last ? ACTION_LABEL[last.action] : 'Nothing logged'}
        />
        <Stat
          label="Oil level"
          value={oilLevel ? titleCase(oilLevel) : '—'}
          tone={lowOil ? 'crit' : oilLevel === 'half' ? 'warn' : oilLevel ? 'ok' : undefined}
          foot={`Keep ${OIL_SPARES} spare bottles`}
        />
        <Stat
          label="Last touched"
          value={last ? timeAgo(last.at) : '—'}
          tone={stale ? 'warn' : undefined}
          foot={last ? `${nameOf(db.profiles, last.by)} · ${hhmm(last.at)}` : undefined}
        />
      </div>

      <Card style={{ marginBottom: 20 }}>
        <div className="row wrap" style={{ gap: 10, alignItems: 'flex-end' }}>
          <div style={{ flex: '1 1 160px', maxWidth: 220 }}>
            <Field label="Oil level now" hint="Recorded with whichever button you press.">
              <Select value={pick} onChange={setPick} options={OIL_OPTIONS} />
            </Field>
          </div>
          <div className="row wrap grow" style={{ gap: 8 }}>
            <Btn size="sm" onClick={() => logDivo('lit', pick)}>
              Divo lit
            </Btn>
            <Btn size="sm" onClick={() => logDivo('topped', pick)}>
              Topped up
            </Btn>
            <Btn size="sm" variant="soft" onClick={() => logDivo('checked', pick)}>
              Checked — still burning
            </Btn>
            <Btn size="sm" variant="ghost" onClick={() => logDivo('extinguished', pick)}>
              Extinguished
            </Btn>
          </div>
        </div>
      </Card>

      {/* ---------- 2. oil, matches and wicks ---------- */}

      <SectionHead
        title="Oil, matches and wicks"
        sub="The shrine check asks for matches, wicks and two spare bottles of divo oil in stock. These are the live counts."
        action={
          <a className="btn ghost xs" href="#/inventory">
            Open Inventory
          </a>
        }
      />
      <div style={{ marginBottom: 20 }}>
        <Table
          head={
            <tr>
              <th>Item</th>
              <th className="num">In stock</th>
              <th className="num">Keep</th>
              <th>State</th>
            </tr>
          }
        >
          <StockLine item={oilItem} name="Oil for the divo" keep={OIL_SPARES} unit="bottles" />
          <StockLine item={matchItem} name="Matches" unit="boxes" />
          <StockLine item={wickItem} name="Wicks" unit="packs" />
        </Table>
      </div>

      {/* ---------- 3. the rules ---------- */}

      <SectionHead title="The rules at the shrine" sub="Word for word from the running sheet." />
      <Card style={{ marginBottom: 20 }}>
        <ol style={{ margin: 0, paddingLeft: 22, fontSize: 15, lineHeight: 1.55 }}>
          {SHRINE_RULES.map((r) => (
            <li key={r} style={{ marginBottom: 6 }}>
              {r}
            </li>
          ))}
        </ol>
      </Card>

      {/* ---------- 4. shrine-only equipment ---------- */}

      <SectionHead
        title="Shrine-only equipment"
        sub="The shrine cloth and the shrine sponge. They never touch meat and they never touch chemicals — that is the whole reason they are separate items."
      />
      {shrineOnly.length ? (
        <List>
          {shrineOnly.map((i) => (
            <Row
              key={i.id}
              title={i.name}
              sub={i.notes || 'Shrine use only. Kept apart from the normal washing-up.'}
              right={
                <span className="row" style={{ gap: 6 }}>
                  <Chip tone="bronze">Shrine only</Chip>
                  <span className="tnum" style={{ fontSize: 14, fontWeight: 650 }}>
                    {i.qty} <span className="faint" style={{ fontWeight: 400, fontSize: 11.5 }}>{i.unit}</span>
                  </span>
                </span>
              }
            />
          ))}
        </List>
      ) : (
        <Card pad="sm">
          <div className="muted" style={{ fontSize: 14 }}>
            Nothing in stock is marked shrine only yet. The shrine cloth and the shrine sponge belong here —
            add them in <a href="#/inventory">Inventory</a> and mark them shrine only.
          </div>
        </Card>
      )}

      {/* ---------- 5. prayer items ---------- */}

      <SectionHead
        title="Prayer items"
        sub="Brought for the prayers, marked, and kept off the table."
      />
      <Card
        className="flat"
        style={{ marginBottom: 12, background: 'var(--rust-soft)', borderColor: 'var(--rust)' }}
      >
        <div className="eyebrow" style={{ color: 'var(--rust)' }}>
          {PRAYER_ITEM_RULE_HEADING}
        </div>
        <div style={{ fontSize: 15, marginTop: 6, lineHeight: 1.5 }}>{PRAYER_ITEM_RULE}</div>
      </Card>
      {prayerItems.length ? (
        <List>
          {prayerItems.map((i) => (
            <Row
              key={i.id}
              title={i.name}
              sub={i.notes || 'Marked and set aside. Not for consumption.'}
              right={
                <span className="row" style={{ gap: 6 }}>
                  <Chip tone="info">Prayer item</Chip>
                  <span className="tnum" style={{ fontSize: 14, fontWeight: 650 }}>
                    {i.qty} <span className="faint" style={{ fontWeight: 400, fontSize: 11.5 }}>{i.unit}</span>
                  </span>
                </span>
              }
            />
          ))}
        </List>
      ) : (
        <Card pad="sm">
          <div className="muted" style={{ fontSize: 14 }}>
            Nothing in stock is marked as a prayer item yet. Milk, yoghurt, juices and fruit brought for the
            prayers go in <a href="#/inventory">Inventory</a> marked as prayer items, so nobody pours the
            prayer milk into the tea.
          </div>
        </Card>
      )}

      {/* ---------- 6. today's shrine check ---------- */}

      <SectionHead
        title="The shrine check"
        sub={`${fmt(date)}${date === today() ? '' : ' — not today'}. These are the same seven ticks as section 6 of the running sheet; ticking here ticks there.`}
        action={
          shrineGroup ? (
            <Chip tone={shrineDone === shrineGroup.items.length ? 'ok' : 'plain'}>
              {shrineDone} of {shrineGroup.items.length} done
            </Chip>
          ) : undefined
        }
      />
      {shrineGroup ? (
        <div style={{ marginBottom: 20 }}>
          <List>
            {shrineGroup.items.map((item) => (
              <div key={item.id} className={cx('task', item.done && 'done')}>
                <button
                  type="button"
                  className="box"
                  onClick={() => tickCheck(date, shrineGroup.id, item.id)}
                  aria-label={item.done ? 'Mark not done' : 'Mark done'}
                >
                  ✓
                </button>
                <button
                  type="button"
                  className="tx"
                  onClick={() => tickCheck(date, shrineGroup.id, item.id)}
                >
                  {item.text}
                  {item.done && item.doneAt && (
                    <span className="meta">
                      <span>
                        {nameOf(db.profiles, item.doneBy)} · {hhmm(item.doneAt)}
                      </span>
                    </span>
                  )}
                </button>
              </div>
            ))}
          </List>
        </div>
      ) : (
        <Empty title="No sheet for this day yet">
          The seven shrine checks live on the day's running sheet. Move to a day that has one, or start it from
          the running sheet.
        </Empty>
      )}

      {/* ---------- 7. the observance ---------- */}

      {obs ? (
        <ObservanceCard obs={obs} date={date} />
      ) : (
        <>
          <SectionHead title="The observance" />
          <Card pad="sm">
            <div className="muted" style={{ fontSize: 14 }}>
              No observance is recorded, so the sheets carry no occasion line.
            </div>
          </Card>
        </>
      )}

      {/* ---------- 8. the divo log ---------- */}

      <SectionHead
        title="Divo log"
        sub={`${plural(log.length, 'entry', 'entries')} recorded. Newest first.`}
      />
      {log.length ? (
        <List>
          {log.slice(0, 20).map((e) => (
            <Row
              key={e.id}
              title={ACTION_LABEL[e.action]}
              sub={
                <>
                  {nameOf(db.profiles, e.by)} · {hhmm(e.at)} · {timeAgo(e.at)}
                  {e.notes ? ` · ${e.notes}` : ''}
                </>
              }
              right={
                e.oilLevel ? (
                  <Chip tone={e.oilLevel === 'low' || e.oilLevel === 'empty' ? 'urgent' : e.oilLevel === 'half' ? 'low' : 'ok'}>
                    {titleCase(e.oilLevel)}
                  </Chip>
                ) : undefined
              }
            />
          ))}
        </List>
      ) : (
        <Card pad="sm">
          <div className="muted" style={{ fontSize: 14 }}>
            Nothing logged yet. Use the buttons above every time the divo is lit, topped or checked.
          </div>
        </Card>
      )}
    </>
  );
}

/* ---------- one line of the oil, matches and wicks table ---------- */

/* `keep` overrides the item's own minimum, because the sheet fixes the
   divo oil at two spare bottles regardless of what Inventory holds. */
function StockLine({
  item,
  name,
  keep,
  unit,
}: {
  item?: InventoryItem;
  name: string;
  keep?: number;
  unit: string;
}) {
  if (!item) {
    return (
      <tr>
        <td>{name}</td>
        <td className="num">—</td>
        <td className="num">{keep ?? '—'}</td>
        <td>
          <Chip tone="warn">Not tracked in stock</Chip>
        </td>
      </tr>
    );
  }
  const level = keep ?? item.min;
  const short = item.qty < level;
  return (
    <tr>
      <td>{item.name}</td>
      <td className="num tnum">
        {item.qty} {item.unit || unit}
      </td>
      <td className="num tnum">{level}</td>
      <td>
        <Chip tone={item.qty <= 0 ? 'urgent' : short ? 'low' : 'ok'}>
          {item.qty <= 0 ? 'Out' : short ? `${level - item.qty} short` : 'In stock'}
        </Chip>
      </td>
    </tr>
  );
}

/* ---------- the observance ---------- */

function ObservanceCard({ obs, date }: { obs: Observance; date: string }) {
  const db = useStore((s) => s.db);
  const patch = useStore((s) => s.patch);
  const showToast = useStore((s) => s.showToast);
  const canEdit = useCan('editStructure');

  const [editing, setEditing] = React.useState(false);
  const [form, setForm] = React.useState({
    name: obs.name,
    startDate: obs.startDate,
    dayCount: obs.dayCount,
  });

  const dayNo = observanceDayNo(obs, date);
  const remaining = Math.max(0, diffDays(date, obs.endDate));
  const posted = Object.values(db.sheets)
    .filter((s) => s.status === 'posted' && s.date >= obs.startDate && s.date <= obs.endDate)
    .sort((a, b) => b.date.localeCompare(a.date));

  /* The end date is never typed in — it follows from the start and the
     day count, which is how the occasion line is counted on the sheet. */
  const save = () => {
    const days = Math.max(1, Math.round(form.dayCount));
    patch(
      'observances',
      obs.id,
      {
        name: form.name.trim() || obs.name,
        startDate: form.startDate,
        dayCount: days,
        endDate: addDays(form.startDate, days - 1),
      },
      'Observance updated',
    );
    setEditing(false);
    showToast('Observance updated — the occasion line follows it');
  };

  return (
    <>
      <SectionHead
        title="The observance"
        sub="What the occasion line on each sheet is counting."
        action={
          canEdit &&
          (editing ? (
            <span className="row" style={{ gap: 6 }}>
              <Btn size="xs" onClick={save}>
                Save
              </Btn>
              <Btn size="xs" variant="ghost" onClick={() => setEditing(false)}>
                Cancel
              </Btn>
            </span>
          ) : (
            <Btn size="xs" variant="ghost" onClick={() => setEditing(true)}>
              Edit
            </Btn>
          ))
        }
      />
      <Card style={{ marginBottom: 20 }}>
        {editing ? (
          <>
            <Field label="Name" hint="'The Prayer' reads as '9th day of the Prayer' on the sheet.">
              <Text value={form.name} onChange={(v) => setForm({ ...form, name: v })} />
            </Field>
            <div className="two">
              <Field label="First day">
                <Text
                  type="date"
                  value={form.startDate}
                  onChange={(v) => setForm({ ...form, startDate: v })}
                />
              </Field>
              <Field label="How many days" hint={`Ends ${addDays(form.startDate, Math.max(1, Math.round(form.dayCount)) - 1)}.`}>
                <Num value={form.dayCount} onChange={(v) => setForm({ ...form, dayCount: v })} min={1} />
              </Field>
            </div>
          </>
        ) : (
          <div className="grid three">
            <Stat label="Observance" value={obs.name} foot={`${obs.startDate} to ${obs.endDate}`} />
            <Stat
              label={date === today() ? 'Today' : fmt(date)}
              value={dayNo ? `${ordinalDay(dayNo)} day` : 'Outside it'}
              foot={dayNo ? `of ${obs.dayCount}` : 'No occasion line on this sheet'}
            />
            <Stat
              label="Left to run"
              value={plural(remaining, 'day')}
              foot={remaining ? `Last day ${obs.endDate}` : 'Finished'}
            />
          </div>
        )}
        {obs.notes && !editing && (
          <div className="muted" style={{ fontSize: 14, marginTop: 12 }}>
            {obs.notes}
          </div>
        )}
      </Card>

      <SectionHead
        title="Sheets already posted for it"
        sub={`${plural(posted.length, 'sheet')} out of ${obs.dayCount} days.`}
      />
      {posted.length ? (
        <List>
          {posted.map((s) => (
            <Row
              key={s.id}
              title={s.occasion || fmt(s.date)}
              sub={
                <>
                  {fmt(s.date)}
                  {s.meals ? ` · ${plural(s.meals, 'meal')}` : ''}
                  {s.prayersStart ? ` · prayers ${s.prayersStart}` : ''}
                  {s.preparedBy ? ` · prepared by ${s.preparedBy}` : ''}
                </>
              }
              right={<Chip tone="ok">Posted{s.postedAt ? ` ${hhmm(s.postedAt)}` : ''}</Chip>}
            />
          ))}
        </List>
      ) : (
        <Card pad="sm" style={{ marginBottom: 20 }}>
          <div className="muted" style={{ fontSize: 14 }}>
            No sheet has gone out for this observance yet.
          </div>
        </Card>
      )}
    </>
  );
}
