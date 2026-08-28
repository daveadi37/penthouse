import React from 'react';
import { useStore, useUser } from '@/store';
import { can } from '@/lib/access';
import { breachSentence, foodRuleBreaches, underFoodRule } from '@/lib/foodrule';
import { detailId, useRoute, navigate } from '@/lib/router';
import { addDays, fmt, fmtShort, fmtTime12, timeAgo, today as todayStr, weekStart, DOW_SHORT, pd } from '@/lib/date';
import { money, plural } from '@/lib/format';
import { awaitingApproval, ingredientStatus, mealsOn } from '@/lib/selectors';
import { MEAL_STATUSES, MEAL_TYPES } from '@/types';
import type { Meal, MealIngredient, MealStatus } from '@/types';
import {
  Btn,
  Card,
  Chip,
  Empty,
  Field,
  IconBtn,
  List,
  PageHead,
  Row,
  SectionHead,
  Seg,
  Select,
  Sheet,
  Stat,
  Text,
  ZoneChip,
  cx,
} from '@/components/ui';

function statusTone(s: MealStatus) {
  return s === 'Submitted' ? 'low' : s === 'Changes requested' ? 'urgent' : s === 'Approved' ? 'info' : s === 'Completed' || s === 'Prepared' ? 'ok' : 'plain';
}

export function Cooking() {
  const route = useRoute();
  const id = detailId(route);
  if (id) return <MealDetail id={id} />;
  return <Planner />;
}

function Planner() {
  const user = useUser();
  const db = useStore((s) => s.db);
  const date = useStore((s) => s.date);
  const setDate = useStore((s) => s.setDate);
  const openSheet = useStore((s) => s.openSheet);
  const [tab, setTab] = React.useState<'week' | 'approvals' | 'waste'>('week');

  const canApprove = can(db, user, 'cooking.approve');
  const ws = weekStart(date);
  const days = Array.from({ length: 7 }, (_, i) => addDays(ws, i));
  const pending = awaitingApproval(db);

  return (
    <>
      <PageHead
        eyebrow="Cooking"
        title={`Week of ${fmtShort(ws)}`}
        sub="Proposed a week ahead, approved before anyone shops against it."
        tools={
          <>
            <div className="row" style={{ gap: 6 }}>
              <IconBtn label="Previous week" onClick={() => setDate(addDays(ws, -7))}>‹</IconBtn>
              <IconBtn label="Next week" onClick={() => setDate(addDays(ws, 7))}>›</IconBtn>
            </div>
            <Btn size="sm" variant="ghost" onClick={() => setDate(todayStr())}>This week</Btn>
            <Btn size="sm" onClick={() => openSheet('meal-new')}>Propose a meal</Btn>
          </>
        }
      />

      <div className="grid four" style={{ marginBottom: 16 }}>
        <Stat label="Planned this week" value={db.meals.filter((m) => m.date >= ws && m.date <= addDays(ws, 6)).length} />
        <Stat label="Awaiting approval" value={pending.length} tone={pending.length ? 'warn' : undefined} onClick={() => setTab('approvals')} />
        <Stat label="Changes requested" value={db.meals.filter((m) => m.status === 'Changes requested').length} />
        <Stat
          label="Waste logged"
          value={money(db.waste.filter((w) => w.date >= addDays(todayStr(), -28)).reduce((s, w) => s + (w.approxValue ?? 0), 0), db.settings.currency)}
          foot={<span className="muted" style={{ fontSize: 12.5 }}>last four weeks</span>}
          onClick={() => setTab('waste')}
        />
      </div>

      <div className="row wrap" style={{ gap: 8, marginBottom: 14 }}>
        <Seg
          value={tab}
          onChange={setTab}
          options={[
            { value: 'week', label: 'The week' },
            { value: 'approvals', label: 'Approvals', count: pending.length },
            { value: 'waste', label: 'Waste log' },
          ]}
        />
      </div>

      {tab === 'week' && (
        <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))' }}>
          {days.map((d) => {
            const meals = mealsOn(db, d);
            return (
              <Card key={d} pad="sm" style={d === todayStr() ? { boxShadow: 'inset 0 0 0 2px var(--accent)' } : undefined}>
                <div className="between" style={{ marginBottom: 8 }}>
                  <div>
                    <div className="eyebrow">{DOW_SHORT[pd(d).getDay()]}</div>
                    <div style={{ fontWeight: 650, fontSize: 15 }}>{fmtShort(d)}</div>
                  </div>
                  <IconBtn label="Add a meal" onClick={() => { setDate(d); openSheet('meal-new'); }}>+</IconBtn>
                </div>
                <div className="stack-sm">
                  {meals.length ? (
                    meals.map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        className="card flat"
                        style={{ padding: '9px 11px', width: '100%' }}
                        onClick={() => navigate('cooking', undefined, m.id)}
                      >
                        <div className="between" style={{ gap: 6 }}>
                          <span className="eyebrow">{m.type}</span>
                          <span className="faint tnum" style={{ fontSize: 11 }}>{fmtTime12(m.serveAt)}</span>
                        </div>
                        <div style={{ fontSize: 14, fontWeight: 550, marginTop: 3, lineHeight: 1.3 }}>{m.name}</div>
                        <div className="row wrap" style={{ gap: 5, marginTop: 6 }}>
                          <Chip tone={statusTone(m.status)}>{m.status}</Chip>
                          <Chip tone="plain">{m.portions}p</Chip>
                        </div>
                      </button>
                    ))
                  ) : (
                    <div className="faint" style={{ fontSize: 12.5 }}>Nothing planned</div>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {tab === 'approvals' && (
        <>
          <SectionHead
            title="Submitted for approval"
            sub={canApprove ? 'Approve, or say what needs changing — the note goes back to whoever proposed it.' : 'Waiting on the house manager.'}
          />
          {pending.length ? (
            <List>
              {pending.map((m) => (
                <Row
                  key={m.id}
                  title={`${m.type} · ${m.name}`}
                  sub={`${fmt(m.date)} at ${fmtTime12(m.serveAt)} · ${plural(m.portions, 'portion')} · submitted ${timeAgo(m.at)}`}
                  zone={m.zone}
                  right={<Btn size="xs" variant="ghost" onClick={() => navigate('cooking', undefined, m.id)}>Review</Btn>}
                />
              ))}
            </List>
          ) : (
            <Empty title="Nothing waiting">Every proposed meal has been dealt with.</Empty>
          )}

          {db.meals.filter((m) => m.status === 'Changes requested').length > 0 && (
            <>
              <SectionHead title="Changes requested" sub="Back with the kitchen." />
              <List>
                {db.meals
                  .filter((m) => m.status === 'Changes requested')
                  .map((m) => (
                    <Row
                      key={m.id}
                      title={`${m.type} · ${m.name}`}
                      sub={m.feedback}
                      zone={m.zone}
                      right={<Chip tone="urgent">Needs a change</Chip>}
                      onClick={() => navigate('cooking', undefined, m.id)}
                    />
                  ))}
              </List>
            </>
          )}
        </>
      )}

      {tab === 'waste' && <WasteLog />}
    </>
  );
}

function WasteLog() {
  const db = useStore((s) => s.db);
  const openSheet = useStore((s) => s.openSheet);
  const remove = useStore((s) => s.remove);
  const user = useUser();
  const canEdit = can(db, user, 'cooking.edit');

  return (
    <>
      <SectionHead
        title="Food waste"
        sub="Information, not blame — it is how portion counts get corrected."
        action={<Btn size="xs" variant="ghost" onClick={() => openSheet('waste-new')}>Log waste</Btn>}
      />
      {db.waste.length ? (
        <List>
          {db.waste
            .slice()
            .sort((a, b) => b.date.localeCompare(a.date))
            .map((w) => (
              <Row
                key={w.id}
                title={w.description}
                sub={`${fmt(w.date)} · ${w.reason}`}
                right={
                  <>
                    {w.approxValue ? <Chip tone="low">{money(w.approxValue, db.settings.currency)}</Chip> : null}
                    {canEdit && <IconBtn label="Delete" onClick={() => remove('waste', w.id, 'Entry removed')}>✕</IconBtn>}
                  </>
                }
                caret={false}
              />
            ))}
        </List>
      ) : (
        <Empty title="Nothing logged" />
      )}
    </>
  );
}

function MealDetail({ id }: { id: string }) {
  const user = useUser();
  const db = useStore((s) => s.db);
  const patch = useStore((s) => s.patch);
  const remove = useStore((s) => s.remove);
  const notify = useStore((s) => s.notify);
  const openSheet = useStore((s) => s.openSheet);
  const [feedback, setFeedback] = React.useState('');

  const m = db.meals.find((x) => x.id === id);
  if (!m) return <Empty title="That meal no longer exists" />;

  const canApprove = can(db, user, 'cooking.approve');
  const canEdit = can(db, user, 'cooking.edit');

  const advance = (status: MealStatus, extra: Record<string, unknown> = {}) => {
    patch('meals', m.id, { status, ...extra }, `Moved to ${status}`);
    if (status === 'Submitted') {
      notify({ profileId: 'p-mgr', kind: 'meal_approval', title: 'A meal needs approval', body: `${m.type}: ${m.name}`, url: `#/cooking/${m.id}`, priority: 'normal' });
    }
    if (status === 'Approved' || status === 'Changes requested') {
      notify({ profileId: m.by, kind: 'issue_update', title: status === 'Approved' ? 'Menu approved' : 'Changes requested', body: `${m.type}: ${m.name}`, url: `#/cooking/${m.id}`, priority: 'normal' });
    }
  };

  const missing = m.ingredients.filter((g) => ingredientStatus(db, g.name) === 'low');
  const unknown = m.ingredients.filter((g) => ingredientStatus(db, g.name) === 'unknown');

  /* THIS IS NOT OPTIONAL, says the sheet. So it is not optional here
     either: a meal that breaks the food rule cannot be approved while
     the observance is running. */
  const ruleApplies = underFoodRule(db.settings, m.date);
  const breaches = ruleApplies ? foodRuleBreaches(m) : [];
  const blocked = breaches.length > 0;

  return (
    <>
      <PageHead
        eyebrow={`${m.type} · ${fmt(m.date)} at ${fmtTime12(m.serveAt)}`}
        title={m.name}
        sub={`${plural(m.portions, 'portion')} · proposed by ${db.profiles.find((p) => p.id === m.by)?.name} ${timeAgo(m.at)}`}
        tools={
          <>
            <Btn size="sm" variant="ghost" onClick={() => navigate('cooking')}>‹ Planner</Btn>
            {canEdit && <Btn size="sm" variant="ghost" onClick={() => openSheet('meal-edit', m.id)}>Edit</Btn>}
            {m.status === 'Draft' && canEdit && <Btn size="sm" onClick={() => advance('Submitted')}>Submit for approval</Btn>}
            {m.status === 'Submitted' && canApprove && (
              <Btn size="sm" disabled={blocked} onClick={() => advance('Approved', { approvedBy: user.id, feedback: '' })}>
                {blocked ? 'Cannot be approved' : 'Approve'}
              </Btn>
            )}
            {m.status === 'Approved' && canEdit && <Btn size="sm" variant="soft" onClick={() => advance('Prepared')}>Mark prepared</Btn>}
            {m.status === 'Prepared' && canEdit && <Btn size="sm" variant="soft" onClick={() => advance('Completed')}>Mark served</Btn>}
          </>
        }
      />

      <div className="row wrap" style={{ gap: 7, marginBottom: 16 }}>
        <Chip tone={statusTone(m.status)}>{m.status}</Chip>
        <ZoneChip zone={m.zone} full />
        <Chip tone="plain">{m.leftovers}</Chip>
        {m.approvedBy && <Chip tone="ok">Approved by {db.profiles.find((p) => p.id === m.approvedBy)?.name}</Chip>}
      </div>

      {blocked && (
        <div style={{ marginBottom: 14 }}>
          <Card className="callout crit" pad={false} style={{ padding: '14px 17px' }}>
            <div className="eyebrow">Food rule — this is not optional</div>
            <div style={{ marginTop: 5, fontSize: 15, lineHeight: 1.45 }}>
              This menu has <strong>{breachSentence(breaches)}</strong>, and {fmt(m.date)} is inside the
              observance. All food is vegetarian until {fmt(db.settings.observanceWindow!.to)} — no meat, no
              fish, no eggs. Milk, cheese, yoghurt and butter are fine; onion and garlic are fine.
            </div>
            <div className="muted" style={{ marginTop: 7, fontSize: 13.5 }}>
              It cannot be approved as it stands. Change the dish, or ask Aditya before you do anything else.
            </div>
          </Card>
        </div>
      )}

      {m.status === 'Changes requested' && m.feedback && (
        <div style={{ marginBottom: 14 }}>
          <Card className="callout crit" pad={false} style={{ padding: '14px 17px' }}>
            <div className="eyebrow">Changes requested</div>
            <div style={{ marginTop: 5, fontSize: 15 }}>{m.feedback}</div>
            {canEdit && (
              <Btn size="xs" variant="ghost" style={{ marginTop: 10 }} onClick={() => advance('Submitted', { feedback: '' })}>
                Resubmit
              </Btn>
            )}
          </Card>
        </div>
      )}

      <div className="grid two">
        <div>
          <SectionHead title="Ingredients" sub="Checked against stock as the menu is written, not at the shop." />
          <List>
            {m.ingredients.length ? (
              m.ingredients.map((g) => {
                const st = ingredientStatus(db, g.name);
                return (
                  <Row
                    key={g.id}
                    title={g.name}
                    sub={`${g.qty} ${g.unit}`}
                    right={
                      <Chip tone={st === 'ok' ? 'ok' : st === 'low' ? 'low' : 'plain'}>
                        {st === 'ok' ? 'In stock' : st === 'low' ? 'Needs buying' : 'Not tracked'}
                      </Chip>
                    }
                    caret={false}
                  />
                );
              })
            ) : (
              <Row title="No ingredients listed" />
            )}
          </List>

          {(missing.length > 0 || unknown.length > 0) && (
            <Card style={{ marginTop: 12 }}>
              {missing.length > 0 && (
                <div style={{ marginBottom: unknown.length ? 10 : 0 }}>
                  <div className="eyebrow">Below minimum</div>
                  <div className="muted" style={{ fontSize: 14, marginTop: 4 }}>
                    {missing.map((g) => g.name).join(', ')} — already on the shopping list.
                  </div>
                </div>
              )}
              {unknown.length > 0 && (
                <div>
                  <div className="eyebrow">Not tracked as stock</div>
                  <div className="muted" style={{ fontSize: 14, marginTop: 4 }}>
                    {unknown.map((g) => g.name).join(', ')} — buy fresh, or add them to Inventory.
                  </div>
                </div>
              )}
            </Card>
          )}
        </div>

        <div>
          <SectionHead title="How to make it" />
          <Card>
            <dl className="kv">
              <dt>Prep</dt>
              <dd>{m.prep || '—'}</dd>
              <dt>Cooking</dt>
              <dd>{m.cook || '—'}</dd>
              <dt>Dietary</dt>
              <dd>{m.diet || '—'}</dd>
              <dt>Leftovers</dt>
              <dd>{m.leftovers}</dd>
            </dl>
          </Card>

          {canApprove && m.status === 'Submitted' && (
            <Card style={{ marginTop: 12 }}>
              <Field label="Request a change instead" hint="This goes straight back to the kitchen as a push.">
                <textarea
                  className="in"
                  rows={3}
                  value={feedback}
                  onChange={(e) => setFeedback(e.target.value)}
                  placeholder="Five portions is right with the guest, but move it to 20:00 — they land at 18:40."
                />
              </Field>
              <Btn
                size="sm"
                variant="ghost"
                disabled={!feedback.trim()}
                onClick={() => {
                  advance('Changes requested', { feedback: feedback.trim(), approvedBy: user.id });
                  setFeedback('');
                }}
              >
                Send back with changes
              </Btn>
            </Card>
          )}

          {canApprove && (
            <Btn
              variant="danger"
              size="sm"
              style={{ marginTop: 12 }}
              onClick={() => {
                remove('meals', m.id, 'Meal removed');
                navigate('cooking');
              }}
            >
              Delete this meal
            </Btn>
          )}
        </div>
      </div>
    </>
  );
}

/* ---------- sheets ---------- */

export function MealSheet({ id }: { id?: string }) {
  const user = useUser();
  const db = useStore((s) => s.db);
  const date = useStore((s) => s.date);
  const closeSheet = useStore((s) => s.closeSheet);
  const upsert = useStore((s) => s.upsert);
  const existing = id ? db.meals.find((m) => m.id === id) : undefined;

  const [f, setF] = React.useState<Partial<Meal>>(
    existing ?? {
      date,
      type: 'Lunch',
      name: '',
      portions: db.settings.portionDefault,
      serveAt: db.settings.mealTimes.Lunch ?? '13:30',
      zone: 'household',
      ingredients: [],
      prep: '',
      cook: '',
      diet: '',
      leftovers: 'None',
      status: 'Draft',
      by: user.id,
      at: Date.now(),
      feedback: '',
    },
  );
  const set = (k: keyof Meal, v: unknown) => setF((p) => ({ ...p, [k]: v }));

  const addIng = () =>
    set('ingredients', [...(f.ingredients ?? []), { id: `mi${Date.now()}`, name: '', qty: 1, unit: 'g' } as MealIngredient]);
  const setIng = (i: number, k: keyof MealIngredient, v: unknown) =>
    set('ingredients', (f.ingredients ?? []).map((g, n) => (n === i ? { ...g, [k]: v } : g)));
  const delIng = (i: number) => set('ingredients', (f.ingredients ?? []).filter((_, n) => n !== i));

  return (
    <Sheet
      title={existing ? 'Edit meal' : 'Propose a meal'}
      sub="Plan around what is already in the house — the ingredient list marks each one as in stock or needing buying."
      onClose={closeSheet}
      wide
      footer={
        <>
          <Btn className="grow" disabled={!f.name} onClick={() => { upsert('meals', { ...f, at: Date.now() }, 'Meal saved'); closeSheet(); }}>
            Save as {f.status ?? 'Draft'}
          </Btn>
          {!existing && (
            <Btn
              variant="soft"
              disabled={!f.name}
              onClick={() => { upsert('meals', { ...f, status: 'Submitted', at: Date.now() }, 'Submitted for approval'); closeSheet(); }}
            >
              Save &amp; submit
            </Btn>
          )}
          <Btn variant="ghost" onClick={closeSheet}>Cancel</Btn>
        </>
      }
    >
      <Field label="What is being cooked">
        <Text value={f.name ?? ''} onChange={(v) => set('name', v)} placeholder="Chicken curry, steamed rice & garden salad" autoFocus />
      </Field>
      <div className="three-col">
        <Field label="Date"><Text type="date" value={f.date ?? ''} onChange={(v) => set('date', v)} /></Field>
        <Field label="Sitting">
          <Select
            value={f.type}
            onChange={(v) => setF((p) => ({ ...p, type: v, serveAt: db.settings.mealTimes[v] ?? p.serveAt }))}
            options={MEAL_TYPES.map((t) => ({ value: t, label: t }))}
          />
        </Field>
        <Field label="Serving at"><Text type="time" value={f.serveAt ?? ''} onChange={(v) => set('serveAt', v)} /></Field>
      </div>
      <div className="three-col">
        <Field label="Portions" hint="Cooking for six when four eat is the commonest waste.">
          <Text type="number" value={String(f.portions ?? 4)} onChange={(v) => set('portions', Number(v))} />
        </Field>
        <Field label="Leftovers expected" hint="Recorded honestly before cooking.">
          <Select
            value={f.leftovers}
            onChange={(v) => set('leftovers', v)}
            options={[
              { value: 'None', label: 'None' },
              { value: 'Small amount', label: 'Small amount' },
              { value: 'Planned leftovers', label: 'Planned leftovers' },
            ]}
          />
        </Field>
        <Field label="Status">
          <Select value={f.status} onChange={(v) => set('status', v)} options={MEAL_STATUSES.map((s) => ({ value: s, label: s }))} />
        </Field>
      </div>

      <SectionHead title="Ingredients" action={<Btn size="xs" variant="ghost" onClick={addIng}>Add an ingredient</Btn>} />
      <div className="stack-sm" style={{ marginBottom: 16 }}>
        {(f.ingredients ?? []).map((g, i) => {
          const st = ingredientStatus(db, g.name);
          return (
            <div key={g.id} className="row" style={{ gap: 7 }}>
              <input
                className="in"
                style={{ flex: '2 1 140px' }}
                value={g.name}
                onChange={(e) => setIng(i, 'name', e.target.value)}
                placeholder="Ingredient"
                list="inv-names-cook"
              />
              <input className="in" style={{ width: 78 }} type="number" value={g.qty} onChange={(e) => setIng(i, 'qty', Number(e.target.value))} />
              <input className="in" style={{ width: 82 }} value={g.unit} onChange={(e) => setIng(i, 'unit', e.target.value)} />
              <span style={{ width: 92, flex: 'none' }}>
                {g.name && <Chip tone={st === 'ok' ? 'ok' : st === 'low' ? 'low' : 'plain'}>{st === 'ok' ? 'In stock' : st === 'low' ? 'Buy' : '—'}</Chip>}
              </span>
              <IconBtn label="Remove" onClick={() => delIng(i)}>✕</IconBtn>
            </div>
          );
        })}
        {!(f.ingredients ?? []).length && <div className="muted" style={{ fontSize: 13.5 }}>No ingredients yet.</div>}
      </div>
      <datalist id="inv-names-cook">
        {db.inventory.map((i) => (
          <option key={i.id} value={i.name} />
        ))}
      </datalist>

      <Field label="Prep the night before or in the morning">
        <textarea className="in" rows={2} value={f.prep ?? ''} onChange={(e) => set('prep', e.target.value)} />
      </Field>
      <Field label="Cooking notes">
        <textarea className="in" rows={2} value={f.cook ?? ''} onChange={(e) => set('cook', e.target.value)} />
      </Field>
      <Field label="Dietary" hint="These change. No pork in the house; Salyna avoids shellfish.">
        <textarea className="in" rows={2} value={f.diet ?? ''} onChange={(e) => set('diet', e.target.value)} />
      </Field>
    </Sheet>
  );
}

export function WasteSheet() {
  const user = useUser();
  const closeSheet = useStore((s) => s.closeSheet);
  const upsert = useStore((s) => s.upsert);
  const [f, setF] = React.useState({ date: todayStr(), description: '', reason: '', approxValue: 0 });
  return (
    <Sheet
      title="Log food waste"
      sub="This is how portion counts get corrected. Nobody is in trouble for recording it."
      onClose={closeSheet}
      footer={
        <>
          <Btn
            className="grow"
            disabled={!f.description}
            onClick={() => { upsert('waste', { ...f, by: user.id, at: Date.now() }, 'Waste logged'); closeSheet(); }}
          >
            Log it
          </Btn>
          <Btn variant="ghost" onClick={closeSheet}>Cancel</Btn>
        </>
      }
    >
      <Field label="Date"><Text type="date" value={f.date} onChange={(v) => setF({ ...f, date: v })} /></Field>
      <Field label="What was thrown away">
        <Text value={f.description} onChange={(v) => setF({ ...f, description: v })} placeholder="Half a tray of biryani" />
      </Field>
      <Field label="Why" hint="The reason is the useful part.">
        <textarea className="in" rows={2} value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} placeholder="Cooked for six, four ate. Second week running." />
      </Field>
      <Field label="Roughly what it was worth" hint="An estimate is fine.">
        <Text type="number" value={String(f.approxValue)} onChange={(v) => setF({ ...f, approxValue: Number(v) })} />
      </Field>
    </Sheet>
  );
}

/* ---------- laundry ---------- */

export function Laundry() {
  const db = useStore((s) => s.db);
  const date = useStore((s) => s.date);
  const dow = pd(date).getDay();
  const tasks = (db.days[date] ?? []).filter((t) => t.categoryId === 'c-laundry');
  const toggleTask = useStore((s) => s.toggleTask);

  return (
    <>
      <PageHead
        eyebrow="Laundry"
        title="The rota"
        sub="One person or category a day. Never two people in one load, even a small one."
      />

      <SectionHead title={`Today · ${DOW_SHORT[dow]}`} />
      {tasks.length ? (
        <List>
          {tasks.map((t) => (
            <div key={t.id} className={cx('task', t.done && 'done')}>
              <button type="button" className="box" onClick={() => toggleTask(t.id)} aria-label="Toggle">✓</button>
              <span className="tx">
                {t.title}
                <span className="meta">
                  <span>{t.estMinutes}m</span>
                  {t.done && <Chip tone="ok">Done</Chip>}
                </span>
              </span>
            </div>
          ))}
        </List>
      ) : (
        <Empty title="Nothing on the rota today" />
      )}

      <SectionHead title="The week" sub="Set in Settings. Sunday is deliberately a catch-up day." />
      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))' }}>
        {[1, 2, 3, 4, 5, 6, 0].map((d) => (
          <Card key={d} pad="sm" style={d === dow ? { boxShadow: 'inset 0 0 0 2px var(--accent)' } : undefined}>
            <div className="eyebrow">{DOW_SHORT[d]}</div>
            <div className="stack-sm" style={{ marginTop: 7 }}>
              {(db.settings.laundry[d] ?? []).map((slot, i) => (
                <div key={i}>
                  <div style={{ fontWeight: 600, fontSize: 14.5 }}>{slot.person}</div>
                  <div className="muted" style={{ fontSize: 12.5 }}>{slot.type}</div>
                </div>
              ))}
              {!(db.settings.laundry[d] ?? []).length && <div className="faint" style={{ fontSize: 12.5 }}>—</div>}
            </div>
          </Card>
        ))}
      </div>

      <SectionHead title="Stages" sub="Washed and folded is not finished. Only tick when it is put away." />
      <Card>
        <div className="row wrap" style={{ gap: 7 }}>
          {db.settings.laundryStages.map((s, i) => (
            <Chip key={s} tone="plain">
              {i + 1}. {s}
            </Chip>
          ))}
        </div>
      </Card>
    </>
  );
}
