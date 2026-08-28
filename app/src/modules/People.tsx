import React from 'react';
import {useStore, useUser} from '@/store';
import {navigate, useRoute} from '@/lib/router';
import {daysUntil, fmt, fmtMedium, fmtShort, fmtTime12, today as todayStr} from '@/lib/date';
import {plural} from '@/lib/format';
import {codesNeedingChange, credentialsOutstanding, openVisitorEntries, profileName, staleDeliveries, uncollected, visitorsOnSite} from '@/lib/selectors';
import {CONTACT_CATS, VENDOR_CATS} from '@/types';
import type { AccessCredential, Contact, Delivery, Vendor, Visitor } from '@/types';
import {Avatar, Btn, Card, Chip, Field, KV, List, PageHead, Row, SectionHead, Seg, Select, Sheet, Stat, Text} from '@/components/ui';
import {Incidents} from './Issues';

type Tab = 'visitors' | 'deliveries' | 'contractors' | 'contacts' | 'vendors' | 'access' | 'incidents';

export function People() {
  const route = useRoute();
  const tab = (route.sub as Tab) ?? 'visitors';
  const db = useStore((s) => s.db);
  const openSheet = useStore((s) => s.openSheet);

  return (
    <>
      <PageHead
        eyebrow="People &amp; access"
        title="Traffic"
        sub="Visitors, deliveries and contractors — the highest-volume records in the building, and the ones that used to have nowhere to live."
        tools={
          <>
            {tab === 'visitors' && <Btn size="sm" onClick={() => openSheet('visitor-new')}>Sign someone in</Btn>}
            {tab === 'deliveries' && <Btn size="sm" onClick={() => openSheet('delivery-new')}>Log a delivery</Btn>}
            {tab === 'contractors' && <Btn size="sm" onClick={() => openSheet('contractor-new')}>Book a contractor</Btn>}
            {tab === 'contacts' && <Btn size="sm" onClick={() => openSheet('contact-new')}>Add a contact</Btn>}
            {tab === 'vendors' && <Btn size="sm" onClick={() => openSheet('vendor-new')}>Add a vendor</Btn>}
            {tab === 'access' && <Btn size="sm" onClick={() => openSheet('cred-new')}>Record a key or code</Btn>}
          </>
        }
      />

      <div className="grid four" style={{ marginBottom: 16 }}>
        <Stat label="On site now" value={visitorsOnSite(db).length} foot={<span className="muted" style={{ fontSize: 12.5 }}>signed in, not out</span>} onClick={() => navigate('people', 'visitors')} />
        <Stat label="Parcels waiting" value={uncollected(db).length} tone={staleDeliveries(db).length ? 'warn' : undefined} foot={staleDeliveries(db).length ? <Chip tone="low">{staleDeliveries(db).length} over 3 days</Chip> : <Chip tone="ok">All recent</Chip>} onClick={() => navigate('people', 'deliveries')} />
        <Stat label="Keys out" value={credentialsOutstanding(db).length} onClick={() => navigate('people', 'access')} />
        <Stat label="Codes overdue a change" value={codesNeedingChange(db).length} tone={codesNeedingChange(db).length ? 'warn' : undefined} onClick={() => navigate('people', 'access')} />
      </div>

      <div className="row wrap" style={{ gap: 8, marginBottom: 14 }}>
        <Seg
          value={tab}
          onChange={(v) => navigate('people', v)}
          options={[
            { value: 'visitors', label: 'Visitors' },
            { value: 'deliveries', label: 'Deliveries', count: uncollected(db).length },
            { value: 'contractors', label: 'Contractors' },
            { value: 'access', label: 'Keys & codes' },
            { value: 'contacts', label: 'Contacts' },
            { value: 'vendors', label: 'Vendors' },
            { value: 'incidents', label: 'Incidents' },
          ]}
        />
      </div>

      {tab === 'visitors' && <VisitorLog />}
      {tab === 'deliveries' && <DeliveryLog />}
      {tab === 'contractors' && <ContractorLog />}
      {tab === 'access' && <AccessLog />}
      {tab === 'contacts' && <Contacts />}
      {tab === 'vendors' && <Vendors />}
      {tab === 'incidents' && <Incidents />}
    </>
  );
}

/* ---------- visitors ---------- */

function VisitorLog() {
  const db = useStore((s) => s.db);
  const patch = useStore((s) => s.patch);
  const openSheet = useStore((s) => s.openSheet);
  const onSite = visitorsOnSite(db);
  const stale = openVisitorEntries(db);
  const recent = db.visitors
    .slice()
    .sort((a, b) => b.date.localeCompare(a.date) || b.arrived.localeCompare(a.arrived));

  const signOut = (v: Visitor) =>
    patch('visitors', v.id, { departed: new Date().toTimeString().slice(0, 5) }, `${v.name} signed out`);

  return (
    <>
      {stale.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          <Card className="callout warn" pad={false} style={{ padding: '14px 17px' }}>
            <div className="eyebrow">Never signed out</div>
            <div style={{ marginTop: 5, fontSize: 15 }}>
              {stale.map((v) => `${v.name} (${fmtShort(v.date)})`).join(' · ')}
            </div>
            <div className="muted" style={{ fontSize: 13, marginTop: 5 }}>
              An unclosed arrival is chased, not assumed. Close them below.
            </div>
          </Card>
        </div>
      )}

      <SectionHead title={`On site now · ${onSite.length}`} />
      {onSite.length ? (
        <List>
          {onSite.map((v) => (
            <Row
              key={v.id}
              left={<Avatar name={v.name} />}
              title={v.name}
              sub={`${v.org} · visiting ${v.visiting} · ${v.purpose} · arrived ${fmtTime12(v.arrived)}`}
              zone={v.zone}
              right={
                <>
                  {v.badge && <Chip tone="plain">{v.badge}</Chip>}
                  <Btn size="xs" variant="ghost" onClick={() => signOut(v)}>Sign out</Btn>
                </>
              }
              caret={false}
            />
          ))}
        </List>
      ) : (
        <Card pad="sm"><div className="muted" style={{ fontSize: 14 }}>Nobody signed in.</div></Card>
      )}

      <SectionHead title="Recent" />
      <List>
        {recent.slice(0, 25).map((v) => (
          <Row
            key={v.id}
            title={v.name}
            sub={`${v.org || '—'} · ${fmt(v.date)} · ${fmtTime12(v.arrived)}${v.departed ? `–${fmtTime12(v.departed)}` : ' · still here'} · logged by ${profileName(db, v.loggedBy)}`}
            zone={v.zone}
            right={v.departed ? <Chip tone="ok">Out</Chip> : <Btn size="xs" variant="ghost" onClick={() => signOut(v)}>Sign out</Btn>}
            onClick={() => openSheet('visitor', v.id)}
          />
        ))}
        {!recent.length && <Row title="No visitors logged" />}
      </List>
    </>
  );
}

/* ---------- deliveries ---------- */

function DeliveryLog() {
  const db = useStore((s) => s.db);
  const patch = useStore((s) => s.patch);
  const notify = useStore((s) => s.notify);
  const waiting = uncollected(db);
  const collected = db.deliveries.filter((d) => d.status !== 'received').slice().sort((a, b) => b.date.localeCompare(a.date));

  const collect = (d: Delivery) => {
    patch('deliveries', d.id, { status: 'collected', collectedAt: Date.now(), collectedBy: d.forWhom }, 'Marked collected');
  };

  return (
    <>
      <SectionHead
        title={`Waiting · ${waiting.length}`}
        sub="Left in the store by the door, never in the hallway. Recipients are pushed automatically, and Marvin posts them on the group."
      />
      {waiting.length ? (
        <List>
          {waiting.map((d) => {
            const age = Math.abs(daysUntil(d.date));
            return (
              <Row
                key={d.id}
                title={d.description}
                sub={`${d.courier}${d.tracking ? ` · ${d.tracking}` : ''} · for ${d.forWhom} · ${fmt(d.date)} at ${fmtTime12(d.arrived)}${d.notes ? ` · ${d.notes}` : ''}`}
                zone={d.zone}
                right={
                  <>
                    <Chip tone={age >= 3 ? 'urgent' : age >= 1 ? 'low' : 'plain'}>
                      {age === 0 ? 'Today' : plural(age, 'day')}
                    </Chip>
                    {d.forProfileId && (
                      <Btn
                        size="xs"
                        variant="ghost"
                        onClick={() =>
                          notify({
                            profileId: d.forProfileId!,
                            kind: 'delivery',
                            title: 'A parcel is waiting for you',
                            body: `${d.description} · ${d.courier} · in the store`,
                            url: '#/people/deliveries',
                            priority: 'normal',
                          })
                        }
                      >
                        Remind
                      </Btn>
                    )}
                    <Btn size="xs" onClick={() => collect(d)}>Collected</Btn>
                  </>
                }
                caret={false}
              />
            );
          })}
        </List>
      ) : (
        <Card pad="sm"><div className="muted" style={{ fontSize: 14 }}>Nothing waiting to be collected.</div></Card>
      )}

      <SectionHead title="Collected" />
      <List>
        {collected.slice(0, 20).map((d) => (
          <Row
            key={d.id}
            title={d.description}
            sub={`${d.courier} · for ${d.forWhom} · arrived ${fmtShort(d.date)}${d.collectedBy ? ` · taken by ${d.collectedBy}` : ''}`}
            zone={d.zone}
            right={<Chip tone="ok">{d.status}</Chip>}
            caret={false}
          />
        ))}
        {!collected.length && <Row title="Nothing collected yet" />}
      </List>
    </>
  );
}

/* ---------- contractors ---------- */

function ContractorLog() {
  const db = useStore((s) => s.db);
  const patch = useStore((s) => s.patch);
  const upcoming = db.contractorVisits.filter((v) => v.date >= todayStr()).sort((a, b) => a.date.localeCompare(b.date));
  const past = db.contractorVisits.filter((v) => v.date < todayStr()).sort((a, b) => b.date.localeCompare(a.date));

  return (
    <>
      <SectionHead
        title={`Booked · ${upcoming.length}`}
        sub="Escorted, always, and tied to the work they came for."
      />
      <List>
        {upcoming.map((v) => (
          <Row
            key={v.id}
            title={v.vendorName}
            sub={`${v.purpose} · ${fmt(v.date)} at ${fmtTime12(v.scheduled)}${v.escortedBy ? ` · escorted by ${profileName(db, v.escortedBy)}` : ' · NOBODY ESCORTING'}${v.notes ? ` · ${v.notes}` : ''}`}
            zone={v.zone}
            right={
              <>
                {!v.escortedBy && <Chip tone="urgent">No escort</Chip>}
                {!v.arrived && (
                  <Btn size="xs" variant="ghost" onClick={() => patch('contractorVisits', v.id, { arrived: new Date().toTimeString().slice(0, 5) }, 'Arrival logged')}>
                    Arrived
                  </Btn>
                )}
                {v.arrived && !v.departed && (
                  <Btn size="xs" variant="ghost" onClick={() => patch('contractorVisits', v.id, { departed: new Date().toTimeString().slice(0, 5) }, 'Departure logged')}>
                    Left
                  </Btn>
                )}
              </>
            }
            caret={false}
          />
        ))}
        {!upcoming.length && <Row title="Nothing booked" />}
      </List>

      <SectionHead title="Past visits" />
      <List>
        {past.slice(0, 20).map((v) => (
          <Row
            key={v.id}
            title={v.vendorName}
            sub={`${v.purpose} · ${fmt(v.date)}${v.arrived ? ` · ${fmtTime12(v.arrived)}${v.departed ? `–${fmtTime12(v.departed)}` : ''}` : ' · did not attend'}${v.notes ? ` · ${v.notes}` : ''}`}
            zone={v.zone}
            right={v.arrived ? <Chip tone="ok">Attended</Chip> : <Chip tone="low">No show</Chip>}
            caret={false}
          />
        ))}
      </List>
    </>
  );
}

/* ---------- keys, fobs, codes ---------- */

function AccessLog() {
  const db = useStore((s) => s.db);
  const openSheet = useStore((s) => s.openSheet);
  const patch = useStore((s) => s.patch);
  const out = credentialsOutstanding(db);
  const returned = db.credentials.filter((c) => !c.active || c.returnedAt);

  return (
    <>
      <div style={{ marginBottom: 14 }}>
        <Card className="callout" pad={false} style={{ padding: '14px 17px' }}>
          <div className="eyebrow">Codes are recorded, not stored</div>
          <div className="muted" style={{ fontSize: 14, marginTop: 5, lineHeight: 1.45 }}>
            This register knows a code exists, which door it opens, who holds it and when it last changed. It
            does not hold the digits. A door code in a database eleven non-family accounts can reach is a worse
            risk than the inconvenience it saves.
          </div>
        </Card>
      </div>

      <SectionHead title={`Issued and outstanding · ${out.length}`} />
      <List>
        {out.map((c) => {
          const since = Math.abs(daysUntil(c.lastChanged));
          const stale = c.kind === 'Code' && since > 90;
          return (
            <Row
              key={c.id}
              title={`${c.label} · ${c.kind}`}
              sub={`${c.issuedToName || 'unassigned'} · held ${c.heldWhere} · ${c.copies ? plural(c.copies, 'copy', 'copies') : 'no physical copies'} · last changed ${fmtMedium(c.lastChanged)}${c.notes ? ` · ${c.notes}` : ''}`}
              zone={c.zone}
              right={
                <>
                  {stale && <Chip tone="low">{since}d since change</Chip>}
                  <Btn size="xs" variant="ghost" onClick={() => patch('credentials', c.id, { returnedAt: todayStr() }, 'Marked returned')}>
                    Returned
                  </Btn>
                </>
              }
              onClick={() => openSheet('cred', c.id)}
            />
          );
        })}
        {!out.length && <Row title="Nothing outstanding" />}
      </List>

      <SectionHead title="Returned or retired" />
      <List>
        {returned.map((c) => (
          <Row
            key={c.id}
            title={`${c.label} · ${c.kind}`}
            sub={`${c.issuedToName} · returned ${c.returnedAt ? fmtMedium(c.returnedAt) : '—'}${c.notes ? ` · ${c.notes}` : ''}`}
            right={<Chip tone="ok">Closed</Chip>}
            caret={false}
          />
        ))}
        {!returned.length && <Row title="Nothing returned" />}
      </List>
    </>
  );
}

/* ---------- contacts ---------- */

function Contacts() {
  const db = useStore((s) => s.db);
  const openSheet = useStore((s) => s.openSheet);
  const emergency = db.contacts.filter((c) => c.active && c.isEmergency).sort((a, b) => a.order - b.order);
  const rest = db.contacts.filter((c) => c.active && !c.isEmergency).sort((a, b) => a.order - b.order);

  return (
    <>
      <SectionHead title="Emergency" sub="Pinned. Read now, not when it happens." />
      <List>
        {emergency.map((c) => (
          <Row
            key={c.id}
            title={c.name}
            sub={`${c.org}${c.notes ? ` · ${c.notes}` : ''}`}
            right={
              <>
                <a className="chip info" href={`tel:${c.phone.replace(/\s/g, '')}`} onClick={(e) => e.stopPropagation()}>
                  {c.phone}
                </a>
              </>
            }
            onClick={() => openSheet('contact', c.id)}
          />
        ))}
      </List>

      <SectionHead title="Directory" />
      <List>
        {rest.map((c) => (
          <Row
            key={c.id}
            title={c.name}
            sub={`${c.cat} · ${c.org}${c.notes ? ` · ${c.notes}` : ''}`}
            right={<span className="muted" style={{ fontSize: 13 }}>{c.phone}</span>}
            onClick={() => openSheet('contact', c.id)}
          />
        ))}
      </List>
    </>
  );
}

/* ---------- vendors ---------- */

function Vendors() {
  const db = useStore((s) => s.db);
  const openSheet = useStore((s) => s.openSheet);
  const [cat, setCat] = React.useState('all');
  let list = db.vendors.filter((v) => v.active);
  if (cat !== 'all') list = list.filter((v) => v.cat === cat);

  return (
    <>
      <div className="row wrap" style={{ gap: 8, marginBottom: 14 }}>
        <select className="in" style={{ width: 'auto', minHeight: 36 }} value={cat} onChange={(e) => setCat(e.target.value)}>
          <option value="all">Every category</option>
          {VENDOR_CATS.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </div>
      <List>
        {list.map((v) => (
          <Row
            key={v.id}
            title={v.name}
            sub={`${v.cat} · ${v.contactName || '—'} · ${v.phone}${v.cadence ? ` · ${v.cadence}` : ''}${v.notes ? ` · ${v.notes}` : ''}`}
            right={
              <>
                {v.rating > 0 && <Chip tone={v.rating >= 4 ? 'ok' : v.rating >= 3 ? 'plain' : 'low'}>{'★'.repeat(v.rating)}</Chip>}
                {v.nextVisit && <Chip tone="info">Next {fmtShort(v.nextVisit)}</Chip>}
              </>
            }
            onClick={() => openSheet('vendor', v.id)}
          />
        ))}
      </List>
    </>
  );
}

/* ============================================================
   Sheets — all of these have to be usable in fifteen seconds at a
   front door, which is the only reason they are this short.
   ============================================================ */

export function VisitorNewSheet() {
  const user = useUser();
  const db = useStore((s) => s.db);
  const closeSheet = useStore((s) => s.closeSheet);
  const upsert = useStore((s) => s.upsert);
  const [f, setF] = React.useState({
    name: '', org: '', visiting: '', purpose: '', zone: 'household' as Visitor['zone'],
    date: todayStr(), arrived: new Date().toTimeString().slice(0, 5), badge: '', notes: '',
  });

  return (
    <Sheet
      title="Sign a visitor in"
      sub="Fifteen seconds. Name, who they are seeing, why."
      onClose={closeSheet}
      footer={
        <>
          <Btn className="grow" disabled={!f.name} onClick={() => { upsert('visitors', { ...f, loggedBy: user.id }, `${f.name} signed in`); closeSheet(); }}>
            Sign in
          </Btn>
          <Btn variant="ghost" onClick={closeSheet}>Cancel</Btn>
        </>
      }
    >
      <Field label="Name"><Text value={f.name} onChange={(v) => setF({ ...f, name: v })} autoFocus /></Field>
      <div className="two">
        <Field label="Organisation"><Text value={f.org} onChange={(v) => setF({ ...f, org: v })} /></Field>
        <Field label="Here to see">
          <input className="in" value={f.visiting} onChange={(e) => setF({ ...f, visiting: e.target.value })} list="people-names" />
        </Field>
      </div>
      <datalist id="people-names">
        {db.profiles.filter((p) => p.active).map((p) => (
          <option key={p.id} value={p.name} />
        ))}
      </datalist>
      <Field label="Purpose"><Text value={f.purpose} onChange={(v) => setF({ ...f, purpose: v })} /></Field>
      <div className="three-col">
        <Field label="Arrived"><Text type="time" value={f.arrived} onChange={(v) => setF({ ...f, arrived: v })} /></Field>
        <Field label="Badge"><Text value={f.badge} onChange={(v) => setF({ ...f, badge: v })} placeholder="V-16" /></Field>
      </div>
      <Field label="Notes"><Text value={f.notes} onChange={(v) => setF({ ...f, notes: v })} /></Field>
    </Sheet>
  );
}

export function VisitorSheet({ id }: { id: string }) {
  const db = useStore((s) => s.db);
  const closeSheet = useStore((s) => s.closeSheet);
  const remove = useStore((s) => s.remove);
  const v = db.visitors.find((x) => x.id === id);
  if (!v) return null;
  return (
    <Sheet title={v.name} sub={`${v.org} · ${fmt(v.date)}`} onClose={closeSheet} footer={
      <>
        <Btn variant="ghost" className="grow" onClick={closeSheet}>Close</Btn>
        <Btn variant="danger" size="sm" onClick={() => { remove('visitors', v.id, 'Entry removed'); closeSheet(); }}>Delete</Btn>
      </>
    }>
      <KV
        rows={[
          ['Visiting', v.visiting],
          ['Purpose', v.purpose],
          ['Arrived', fmtTime12(v.arrived)],
          ['Departed', v.departed ? fmtTime12(v.departed) : 'Still on site'],
          ['Badge', v.badge],
          ['Zone', v.zone],
          ['Logged by', profileName(db, v.loggedBy)],
          ['Notes', v.notes],
        ]}
      />
    </Sheet>
  );
}

export function DeliveryNewSheet() {
  const user = useUser();
  const db = useStore((s) => s.db);
  const closeSheet = useStore((s) => s.closeSheet);
  const upsert = useStore((s) => s.upsert);
  const notify = useStore((s) => s.notify);
  const [f, setF] = React.useState({
    courier: '', tracking: '', forProfileId: '', forWhom: '', description: '',
    zone: 'household' as Delivery['zone'], date: todayStr(), arrived: new Date().toTimeString().slice(0, 5), notes: '',
  });

  return (
    <Sheet
      title="Log a delivery"
      sub="As it lands. The recipient is notified automatically — you do not need to find them."
      onClose={closeSheet}
      footer={
        <>
          <Btn
            className="grow"
            disabled={!f.description || !f.courier}
            onClick={() => {
              const forWhom = f.forProfileId ? profileName(db, f.forProfileId) : f.forWhom;
              upsert('deliveries', { ...f, forWhom, forProfileId: f.forProfileId || undefined, receivedBy: user.id, status: 'received' }, 'Delivery logged');
              if (f.forProfileId) {
                notify({
                  profileId: f.forProfileId, kind: 'delivery',
                  title: 'A parcel arrived for you',
                  body: `${f.description} · ${f.courier} · in the store`,
                  url: '#/people/deliveries', priority: 'normal',
                });
              }
              closeSheet();
            }}
          >
            Log it
          </Btn>
          <Btn variant="ghost" onClick={closeSheet}>Cancel</Btn>
        </>
      }
    >
      <div className="two">
        <Field label="Courier"><Text value={f.courier} onChange={(v) => setF({ ...f, courier: v })} placeholder="Aramex" autoFocus /></Field>
        <Field label="Tracking"><Text value={f.tracking} onChange={(v) => setF({ ...f, tracking: v })} /></Field>
      </div>
      <Field label="What is it"><Text value={f.description} onChange={(v) => setF({ ...f, description: v })} placeholder="Medium parcel, two document boxes…" /></Field>
      <Field label="Who is it for" hint="Pick a person and they get a push. Otherwise type a name.">
        <Select
          value={f.forProfileId}
          onChange={(v) => setF({ ...f, forProfileId: v })}
          options={[{ value: '', label: 'Type a name instead' }, ...db.profiles.filter((p) => p.active).map((p) => ({ value: p.id, label: p.name }))]}
        />
      </Field>
      {!f.forProfileId && (
        <Field label="Name"><Text value={f.forWhom} onChange={(v) => setF({ ...f, forWhom: v })} placeholder="Household — divo oil" /></Field>
      )}
      <div className="three-col">
        <Field label="Arrived"><Text type="time" value={f.arrived} onChange={(v) => setF({ ...f, arrived: v })} /></Field>
        <Field label="Date"><Text type="date" value={f.date} onChange={(v) => setF({ ...f, date: v })} /></Field>
      </div>
      <Field label="Notes" hint="Damage, cold chain, anything unusual. Photograph damage before accepting it.">
        <Text value={f.notes} onChange={(v) => setF({ ...f, notes: v })} />
      </Field>
    </Sheet>
  );
}

export function ContractorNewSheet() {
  const db = useStore((s) => s.db);
  const closeSheet = useStore((s) => s.closeSheet);
  const upsert = useStore((s) => s.upsert);
  const [f, setF] = React.useState({
    vendorId: '', vendorName: '', purpose: '', areaId: '', zone: 'shared' as Visitor['zone'],
    date: todayStr(), scheduled: '09:00', escortedBy: '', issueId: '', contractId: '', notes: '',
  });

  return (
    <Sheet
      title="Book a contractor visit"
      sub="Tied to the work they came for, and to whoever escorts them."
      onClose={closeSheet}
      footer={
        <>
          <Btn
            className="grow"
            disabled={!f.purpose || (!f.vendorId && !f.vendorName)}
            onClick={() => {
              upsert('contractorVisits', {
                ...f,
                vendorName: f.vendorId ? (db.vendors.find((v) => v.id === f.vendorId)?.name ?? f.vendorName) : f.vendorName,
                vendorId: f.vendorId || undefined,
                areaId: f.areaId || undefined,
                escortedBy: f.escortedBy || undefined,
                issueId: f.issueId || undefined,
                contractId: f.contractId || undefined,
              }, 'Visit booked');
              closeSheet();
            }}
          >
            Book it
          </Btn>
          <Btn variant="ghost" onClick={closeSheet}>Cancel</Btn>
        </>
      }
    >
      <Field label="Vendor">
        <Select value={f.vendorId} onChange={(v) => setF({ ...f, vendorId: v })} options={[{ value: '', label: 'Type a name instead' }, ...db.vendors.filter((v) => v.active).map((v) => ({ value: v.id, label: `${v.name} · ${v.cat}` }))]} />
      </Field>
      {!f.vendorId && <Field label="Name"><Text value={f.vendorName} onChange={(v) => setF({ ...f, vendorName: v })} /></Field>}
      <Field label="What they are coming for"><Text value={f.purpose} onChange={(v) => setF({ ...f, purpose: v })} /></Field>
      <div className="three-col">
        <Field label="Date"><Text type="date" value={f.date} onChange={(v) => setF({ ...f, date: v })} /></Field>
        <Field label="Time"><Text type="time" value={f.scheduled} onChange={(v) => setF({ ...f, scheduled: v })} /></Field>
      </div>
      <div className="two">
        <Field label="Area">
          <Select value={f.areaId} onChange={(v) => setF({ ...f, areaId: v })} options={[{ value: '', label: 'Whole zone' }, ...db.areas.filter((a) => a.active).map((a) => ({ value: a.id, label: a.name }))]} />
        </Field>
        <Field label="Escorted by" hint="Contractors are escorted, always.">
          <Select value={f.escortedBy} onChange={(v) => setF({ ...f, escortedBy: v })} options={[{ value: '', label: 'Nobody yet' }, ...db.profiles.filter((p) => p.role === 'staff').map((p) => ({ value: p.id, label: p.name }))]} />
        </Field>
      </div>
      <div className="two">
        <Field label="Against which issue">
          <Select value={f.issueId} onChange={(v) => setF({ ...f, issueId: v })} options={[{ value: '', label: 'None' }, ...db.issues.filter((i) => !['resolved', 'closed'].includes(i.status)).map((i) => ({ value: i.id, label: i.title }))]} />
        </Field>
        <Field label="Or which contract">
          <Select value={f.contractId} onChange={(v) => setF({ ...f, contractId: v })} options={[{ value: '', label: 'None' }, ...db.contracts.filter((c) => c.active).map((c) => ({ value: c.id, label: c.name }))]} />
        </Field>
      </div>
      <Field label="Notes"><textarea className="in" rows={2} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
    </Sheet>
  );
}

export function CredSheet({ id }: { id?: string }) {
  const db = useStore((s) => s.db);
  const closeSheet = useStore((s) => s.closeSheet);
  const upsert = useStore((s) => s.upsert);
  const remove = useStore((s) => s.remove);
  const existing = id ? db.credentials.find((c) => c.id === id) : undefined;
  const [f, setF] = React.useState<AccessCredential>(
    existing ?? {
      id: '', kind: 'Key', label: '', zone: 'household', heldWhere: '', issuedToName: '',
      issuedAt: todayStr(), lastChanged: todayStr(), copies: 1, notes: '', active: true,
    } as AccessCredential,
  );
  const set = (k: keyof AccessCredential, v: unknown) => setF((p) => ({ ...p, [k]: v }));

  return (
    <Sheet
      title={existing ? existing.label : 'Record a key, fob or code'}
      sub="Where the value is kept — never the value itself."
      onClose={closeSheet}
      footer={
        <>
          <Btn className="grow" disabled={!f.label} onClick={() => { upsert('credentials', f, 'Saved'); closeSheet(); }}>Save</Btn>
          {existing && <Btn variant="danger" size="sm" onClick={() => { remove('credentials', existing.id, 'Removed'); closeSheet(); }}>Delete</Btn>}
          <Btn variant="ghost" onClick={closeSheet}>Cancel</Btn>
        </>
      }
    >
      <div className="two">
        <Field label="What it opens"><Text value={f.label} onChange={(v) => set('label', v)} autoFocus /></Field>
        <Field label="Kind">
          <Select value={f.kind} onChange={(v) => set('kind', v)} options={['Key', 'Fob', 'Code', 'Remote', 'Card'].map((k) => ({ value: k, label: k }))} />
        </Field>
      </div>
      <div className="two">
        <Field label="Area">
          <Select value={f.areaId ?? ''} onChange={(v) => { const a = db.areas.find((x) => x.id === v); setF((p) => ({ ...p, areaId: v || undefined, zone: a?.zone ?? p.zone })); }} options={[{ value: '', label: '—' }, ...db.areas.map((a) => ({ value: a.id, label: a.name }))]} />
        </Field>
      </div>
      <Field label="Where the value is kept" hint="A password manager, a safe, carried. Not the code itself.">
        <Text value={f.heldWhere} onChange={(v) => set('heldWhere', v)} placeholder="Owner's password manager" />
      </Field>
      <div className="two">
        <Field label="Issued to">
          <Select
            value={f.issuedTo ?? ''}
            onChange={(v) => setF((p) => ({ ...p, issuedTo: v || undefined, issuedToName: v ? profileName(db, v) : p.issuedToName }))}
            options={[{ value: '', label: 'Type a name instead' }, ...db.profiles.filter((p) => p.active).map((p) => ({ value: p.id, label: p.name }))]}
          />
        </Field>
        <Field label="Name"><Text value={f.issuedToName} onChange={(v) => set('issuedToName', v)} /></Field>
      </div>
      <div className="three-col">
        <Field label="Issued"><Text type="date" value={f.issuedAt} onChange={(v) => set('issuedAt', v)} /></Field>
        <Field label="Last changed" hint="Codes over 90 days raise an alert."><Text type="date" value={f.lastChanged} onChange={(v) => set('lastChanged', v)} /></Field>
        <Field label="Copies"><Text type="number" value={String(f.copies)} onChange={(v) => set('copies', Number(v))} /></Field>
      </div>
      <Field label="Notes" hint="Who else knows it, and what happens if it is lost.">
        <textarea className="in" rows={2} value={f.notes} onChange={(e) => set('notes', e.target.value)} />
      </Field>
    </Sheet>
  );
}

export function ContactSheet({ id }: { id?: string }) {
  const db = useStore((s) => s.db);
  const closeSheet = useStore((s) => s.closeSheet);
  const upsert = useStore((s) => s.upsert);
  const remove = useStore((s) => s.remove);
  const existing = id ? db.contacts.find((c) => c.id === id) : undefined;
  const [f, setF] = React.useState<Contact>(
    existing ?? { id: '', name: '', org: '', cat: 'Other', phone: '', altPhone: '', email: '', notes: '', isEmergency: false, order: 50, active: true } as Contact,
  );
  const set = (k: keyof Contact, v: unknown) => setF((p) => ({ ...p, [k]: v }));

  return (
    <Sheet
      title={existing ? existing.name : 'New contact'}
      onClose={closeSheet}
      footer={
        <>
          <Btn className="grow" disabled={!f.name} onClick={() => { upsert('contacts', f, 'Contact saved'); closeSheet(); }}>Save</Btn>
          {existing && <Btn variant="danger" size="sm" onClick={() => { remove('contacts', existing.id, 'Removed'); closeSheet(); }}>Delete</Btn>}
          <Btn variant="ghost" onClick={closeSheet}>Cancel</Btn>
        </>
      }
    >
      <div className="two">
        <Field label="Name"><Text value={f.name} onChange={(v) => set('name', v)} autoFocus /></Field>
        <Field label="Organisation"><Text value={f.org} onChange={(v) => set('org', v)} /></Field>
      </div>
      <div className="two">
        <Field label="Category">
          <Select value={f.cat} onChange={(v) => set('cat', v)} options={CONTACT_CATS.map((c) => ({ value: c, label: c }))} />
        </Field>
        <Field label="Order" hint="Lower appears first.">
          <Text type="number" value={String(f.order)} onChange={(v) => set('order', Number(v))} />
        </Field>
      </div>
      <div className="two">
        <Field label="Phone"><Text value={f.phone} onChange={(v) => set('phone', v)} /></Field>
        <Field label="Alternative"><Text value={f.altPhone} onChange={(v) => set('altPhone', v)} /></Field>
      </div>
      <Field label="Email"><Text value={f.email} onChange={(v) => set('email', v)} /></Field>
      <label className="check">
        <input type="checkbox" checked={f.isEmergency} onChange={(e) => set('isEmergency', e.target.checked)} />
        <span>Pin to the emergency list</span>
      </label>
      <Field label="Notes"><textarea className="in" rows={2} value={f.notes} onChange={(e) => set('notes', e.target.value)} /></Field>
    </Sheet>
  );
}

export function VendorSheet({ id }: { id?: string }) {
  const db = useStore((s) => s.db);
  const closeSheet = useStore((s) => s.closeSheet);
  const upsert = useStore((s) => s.upsert);
  const remove = useStore((s) => s.remove);
  const existing = id ? db.vendors.find((v) => v.id === id) : undefined;
  const [f, setF] = React.useState<Vendor>(
    existing ?? { id: '', name: '', cat: 'Other', contactName: '', phone: '', email: '', web: '', cadence: '', nextVisit: '', rating: 0, accountRef: '', notes: '', active: true } as Vendor,
  );
  const set = (k: keyof Vendor, v: unknown) => setF((p) => ({ ...p, [k]: v }));

  return (
    <Sheet
      title={existing ? existing.name : 'New vendor'}
      onClose={closeSheet}
      footer={
        <>
          <Btn className="grow" disabled={!f.name} onClick={() => { upsert('vendors', f, 'Vendor saved'); closeSheet(); }}>Save</Btn>
          {existing && <Btn variant="danger" size="sm" onClick={() => { remove('vendors', existing.id, 'Removed'); closeSheet(); }}>Delete</Btn>}
          <Btn variant="ghost" onClick={closeSheet}>Cancel</Btn>
        </>
      }
    >
      <div className="two">
        <Field label="Name"><Text value={f.name} onChange={(v) => set('name', v)} autoFocus /></Field>
        <Field label="Category">
          <Select value={f.cat} onChange={(v) => set('cat', v)} options={VENDOR_CATS.map((c) => ({ value: c, label: c }))} />
        </Field>
      </div>
      <div className="two">
        <Field label="Contact"><Text value={f.contactName} onChange={(v) => set('contactName', v)} /></Field>
        <Field label="Phone"><Text value={f.phone} onChange={(v) => set('phone', v)} /></Field>
      </div>
      <div className="two">
        <Field label="Email"><Text value={f.email} onChange={(v) => set('email', v)} /></Field>
        <Field label="Account reference"><Text value={f.accountRef} onChange={(v) => set('accountRef', v)} /></Field>
      </div>
      <div className="three-col">
        <Field label="Visit cadence"><Text value={f.cadence} onChange={(v) => set('cadence', v)} placeholder="Every 3 months" /></Field>
        <Field label="Next visit"><Text type="date" value={f.nextVisit} onChange={(v) => set('nextVisit', v)} /></Field>
        <Field label="Rating, out of 5"><Text type="number" value={String(f.rating)} onChange={(v) => set('rating', Math.max(0, Math.min(5, Number(v))))} /></Field>
      </div>
      <Field label="Notes" hint="What to ask for, what to avoid, who to insist on.">
        <textarea className="in" rows={3} value={f.notes} onChange={(e) => set('notes', e.target.value)} />
      </Field>
    </Sheet>
  );
}
