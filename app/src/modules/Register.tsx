import React from 'react';
import {useStore, useUser} from '@/store';
import {navigate, useRoute} from '@/lib/router';
import {addDays, daysUntil, fmtMedium, fmtShort, today as todayStr} from '@/lib/date';
import {money, plural} from '@/lib/format';
import {areaName, contractState, plantsDue, serviceState, vehicleState, vendorName, warrantyState, staffList} from '@/lib/selectors';
import {ASSET_CATS} from '@/types';
import type { Asset, Plant, ServiceContract, Vehicle } from '@/types';
import {Btn, Card, Chip, Empty, Field, KV, List, PageHead, Row, SectionHead, Seg, Select, Sheet, Stat, Text, ZoneChip, cx} from '@/components/ui';
import {ZoneFilterBar} from '@/components/Shell';

type Tab = 'assets' | 'vehicles' | 'contracts' | 'plants';

export function Register() {
  const route = useRoute();
  const tab = (route.sub as Tab) ?? 'assets';

  if (route.id) {
    if (tab === 'assets') return <AssetDetail id={route.id} />;
    if (tab === 'vehicles') return <VehicleDetail id={route.id} />;
    if (tab === 'contracts') return <ContractDetail id={route.id} />;
  }

  return (
    <>
      <RegisterHead tab={tab} />
      {tab === 'assets' && <AssetList />}
      {tab === 'vehicles' && <VehicleList />}
      {tab === 'contracts' && <ContractList />}
      {tab === 'plants' && <PlantList />}
    </>
  );
}

function RegisterHead({ tab }: { tab: Tab }) {
  const db = useStore((s) => s.db);
  const openSheet = useStore((s) => s.openSheet);
  const user = useUser();
  const canEdit = user.role === 'owner' || user.role === 'manager';

  const overdueService = db.assets.filter((a) => a.active && serviceState(a).state === 'overdue').length;
  const expiredWarranty = db.assets.filter((a) => a.active && warrantyState(a).state === 'expired').length;
  const contractsDue = db.contracts.filter((c) => c.active && contractState(c).state !== 'ok').length;
  const vehIssues = db.vehicles.filter((v) => v.active && vehicleState(v).some((s) => s.state === 'overdue')).length;

  return (
    <>
      <PageHead
        eyebrow="Household register"
        title="Everything the house owns"
        sub="Purchase, warranty, servicing, replacement — on one expiry engine, across both zones."
        tools={
          canEdit ? (
            <>
              {tab === 'assets' && <Btn size="sm" onClick={() => openSheet('asset-new')}>Add an asset</Btn>}
              {tab === 'vehicles' && <Btn size="sm" onClick={() => openSheet('vehicle-new')}>Add a vehicle</Btn>}
              {tab === 'contracts' && <Btn size="sm" onClick={() => openSheet('contract-new')}>Add a contract</Btn>}
              {tab === 'plants' && <Btn size="sm" onClick={() => openSheet('plant-new')}>Add a plant</Btn>}
            </>
          ) : undefined
        }
      />

      <div className="grid four" style={{ marginBottom: 16 }}>
        <Stat label="Assets" value={db.assets.filter((a) => a.active).length} foot={overdueService ? <Chip tone="urgent">{overdueService} service overdue</Chip> : <Chip tone="ok">Servicing on track</Chip>} />
        <Stat label="Warranties expired" value={expiredWarranty} tone={expiredWarranty ? 'warn' : undefined} />
        <Stat label="Contracts" value={db.contracts.filter((c) => c.active).length} foot={contractsDue ? <Chip tone="low">{contractsDue} due soon</Chip> : <Chip tone="ok">None due</Chip>} />
        <Stat label="Vehicles" value={db.vehicles.filter((v) => v.active).length} foot={vehIssues ? <Chip tone="urgent">{vehIssues} needs attention</Chip> : <Chip tone="ok">Both legal</Chip>} />
      </div>

      <div className="row wrap" style={{ gap: 8, marginBottom: 14 }}>
        <Seg
          value={tab}
          onChange={(v) => navigate('register', v)}
          options={[
            { value: 'assets', label: 'Assets' },
            { value: 'vehicles', label: 'Vehicles' },
            { value: 'contracts', label: 'Service contracts' },
            { value: 'plants', label: 'Plants' },
          ]}
        />
        <ZoneFilterBar />
      </div>
    </>
  );
}

/* ---------- assets ---------- */

function AssetList() {
  const db = useStore((s) => s.db);
  const zoneFilter = useStore((s) => s.zoneFilter);
  const [q, setQ] = React.useState('');
  const [cat, setCat] = React.useState<string>('all');

  let list = db.assets.filter((a) => a.active);
  if (zoneFilter !== 'all') list = list.filter((a) => a.zone === zoneFilter);
  if (cat !== 'all') list = list.filter((a) => a.cat === cat);
  if (q) list = list.filter((a) => (a.name + a.brand + a.model + a.serial).toLowerCase().includes(q.toLowerCase()));

  const sorted = list.slice().sort((a, b) => {
    const sa = serviceState(a);
    const sb = serviceState(b);
    const rank = (s: string) => (s === 'overdue' ? 0 : s === 'due' ? 1 : 2);
    return rank(sa.state) - rank(sb.state) || a.name.localeCompare(b.name);
  });

  return (
    <>
      <div className="row wrap" style={{ gap: 8, marginBottom: 14 }}>
        <input className="in" style={{ width: 'auto', minHeight: 36, flex: '1 1 220px' }} placeholder="Search by name, brand, model or serial" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="in" style={{ width: 'auto', minHeight: 36 }} value={cat} onChange={(e) => setCat(e.target.value)}>
          <option value="all">Every category</option>
          {ASSET_CATS.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </div>

      {sorted.length ? (
        <List>
          {sorted.map((a) => {
            const sv = serviceState(a);
            const wa = warrantyState(a);
            return (
              <Row
                key={a.id}
                title={a.name}
                sub={`${[a.brand, a.model].filter(Boolean).join(' ')}${a.areaId ? ` · ${areaName(db, a.areaId)}` : ''}${a.qty > 1 ? ` · ×${a.qty}` : ''}`}
                zone={a.zone}
                right={
                  <>
                    <Chip tone={sv.state === 'overdue' ? 'urgent' : sv.state === 'due' ? 'low' : sv.state === 'none' ? 'plain' : 'ok'}>{sv.label}</Chip>
                    <Chip tone={wa.state === 'expired' ? 'urgent' : wa.state === 'soon' ? 'low' : wa.state === 'none' ? 'plain' : 'ok'}>
                      {wa.state === 'none' ? 'No warranty' : `Warranty ${wa.label}`}
                    </Chip>
                  </>
                }
                onClick={() => navigate('register', 'assets', a.id)}
              />
            );
          })}
        </List>
      ) : (
        <Empty title="Nothing matches" />
      )}
    </>
  );
}

function AssetDetail({ id }: { id: string }) {
  const db = useStore((s) => s.db);
  const user = useUser();
  const openSheet = useStore((s) => s.openSheet);
  const patch = useStore((s) => s.patch);
  const a = db.assets.find((x) => x.id === id);
  if (!a) return <Empty title="That asset no longer exists" />;
  const canEdit = user.role === 'owner' || user.role === 'manager';
  const sv = serviceState(a);
  const wa = warrantyState(a);
  const docs = db.documents.filter((d) => d.linkedType === 'asset' && d.linkedId === a.id);

  return (
    <>
      <PageHead
        eyebrow={`${a.cat}${a.sub ? ` · ${a.sub}` : ''}`}
        title={a.name}
        sub={[a.brand, a.model, a.serial].filter(Boolean).join(' · ')}
        tools={
          <>
            <Btn size="sm" variant="ghost" onClick={() => navigate('register', 'assets')}>‹ Assets</Btn>
            {canEdit && <Btn size="sm" variant="ghost" onClick={() => openSheet('asset-edit', a.id)}>Edit</Btn>}
            {canEdit && a.service.freqDays > 0 && (
              <Btn
                size="sm"
                onClick={() =>
                  patch(
                    'assets',
                    a.id,
                    {
                      service: {
                        ...a.service,
                        last: todayStr(),
                        next: addDays(todayStr(), a.service.freqDays),
                        history: [
                          { id: `sl${Date.now()}`, date: todayStr(), vendorId: a.service.vendorId, notes: 'Logged from the register' },
                          ...a.service.history,
                        ],
                      },
                    },
                    'Service logged',
                  )
                }
              >
                Log a service today
              </Btn>
            )}
          </>
        }
      />

      <div className="row wrap" style={{ gap: 7, marginBottom: 16 }}>
        <ZoneChip zone={a.zone} full />
        <Chip tone={sv.state === 'overdue' ? 'urgent' : sv.state === 'due' ? 'low' : 'ok'}>Service: {sv.label}</Chip>
        <Chip tone={wa.state === 'expired' ? 'urgent' : wa.state === 'soon' ? 'low' : 'ok'}>Warranty: {wa.label}</Chip>
        {a.areaId && <Chip>{areaName(db, a.areaId)}</Chip>}
        {a.assignedTo && <Chip tone="info">{db.profiles.find((p) => p.id === a.assignedTo)?.name}</Chip>}
      </div>

      {a.care && (
        <div style={{ marginBottom: 16 }}>
          <Card className="callout" pad={false} style={{ padding: '14px 17px' }}>
            <div className="eyebrow">How to look after it</div>
            <div style={{ marginTop: 5, fontSize: 15 }}>{a.care}</div>
          </Card>
        </div>
      )}

      <div className="grid two">
        <div>
          <SectionHead title="Purchase" />
          <Card style={{ marginBottom: 12 }}>
            <KV
              rows={[
                ['Bought', a.purchase.date ? fmtMedium(a.purchase.date) : '—'],
                ['Price', a.purchase.price ? money(a.purchase.price, db.settings.currency) : '—'],
                ['From', vendorName(db, a.purchase.vendorId)],
                ['Reference', a.purchase.ref],
                ['Quantity', a.qty > 1 ? `×${a.qty}` : '1'],
              ]}
            />
          </Card>

          <SectionHead title="Warranty" />
          <Card style={{ marginBottom: 12 }}>
            <KV
              rows={[
                ['Starts', a.warranty.start ? fmtMedium(a.warranty.start) : '—'],
                ['Ends', a.warranty.end ? fmtMedium(a.warranty.end) : '—'],
                ['Provider', a.warranty.provider],
                ['Notes', a.warranty.notes],
              ]}
            />
          </Card>

          <SectionHead title="Replacement" sub="So a failure is a decision, not a surprise." />
          <Card>
            <KV
              rows={[
                ['Expected life', a.replacement.lifespanYears ? `${a.replacement.lifespanYears} years` : '—'],
                ['Replace by', a.replacement.by ? fmtMedium(a.replacement.by) : '—'],
                ['Budget', a.replacement.budget ? money(a.replacement.budget, db.settings.currency) : '—'],
                ['Notes', a.replacement.notes],
              ]}
            />
          </Card>
        </div>

        <div>
          <SectionHead title="Servicing" />
          <Card style={{ marginBottom: 12 }}>
            <KV
              rows={[
                ['Frequency', a.service.freqDays ? `Every ${a.service.freqDays} days` : 'Not serviced'],
                ['Last', a.service.last ? fmtMedium(a.service.last) : '—'],
                ['Next', a.service.next ? fmtMedium(a.service.next) : '—'],
                ['Provider', vendorName(db, a.service.vendorId)],
                ['Notes', a.service.notes],
              ]}
            />
          </Card>

          <SectionHead title={`Service history · ${a.service.history.length}`} />
          {a.service.history.length ? (
            <List>
              {a.service.history.map((h) => (
                <Row
                  key={h.id}
                  title={fmtMedium(h.date)}
                  sub={`${vendorName(db, h.vendorId)}${h.notes ? ` · ${h.notes}` : ''}`}
                  right={h.cost ? <Chip>{money(h.cost, db.settings.currency)}</Chip> : undefined}
                  caret={false}
                />
              ))}
            </List>
          ) : (
            <Card pad="sm"><div className="muted" style={{ fontSize: 13.5 }}>No services logged yet.</div></Card>
          )}

          <SectionHead title={`Documents · ${docs.length}`} />
          {docs.length ? (
            <List>
              {docs.map((d) => (
                <Row key={d.id} title={d.title} sub={`${d.cat} · ${d.filename}`} onClick={() => navigate('documents', undefined, d.id)} />
              ))}
            </List>
          ) : (
            <Card pad="sm"><div className="muted" style={{ fontSize: 13.5 }}>Nothing attached.</div></Card>
          )}
        </div>
      </div>
    </>
  );
}

/* ---------- vehicles ---------- */

function VehicleList() {
  const db = useStore((s) => s.db);
  const zoneFilter = useStore((s) => s.zoneFilter);
  let list = db.vehicles.filter((v) => v.active);
  if (zoneFilter !== 'all') list = list.filter((v) => v.zone === zoneFilter);

  return (
    <div className="grid auto-lg">
      {list.map((v) => {
        const states = vehicleState(v);
        const worst = states.some((s) => s.state === 'overdue') ? 'crit' : states.some((s) => s.state === 'due') ? 'warn' : undefined;
        return (
          <Card key={v.id} className={cx('zedge', v.zone)}>
            <div className="between wrap">
              <div className="grow">
                <div className="eyebrow">{v.make} {v.model} · {v.year}</div>
                <div className="serif" style={{ fontSize: 21, marginTop: 4 }}>{v.name}</div>
                <div className="muted" style={{ fontSize: 13.5, marginTop: 2 }}>
                  {v.plate} · {v.odometer.toLocaleString()} km · {db.profiles.find((p) => p.id === v.assignedTo)?.name ?? 'nobody'}
                </div>
              </div>
              <ZoneChip zone={v.zone} />
            </div>

            <div className="row wrap" style={{ gap: 6, marginTop: 12 }}>
              {states.map((s, i) => (
                <Chip key={i} tone={s.state === 'overdue' ? 'urgent' : s.state === 'due' ? 'low' : 'ok'}>{s.label}</Chip>
              ))}
            </div>

            {worst === 'crit' && (
              <div className="callout crit" style={{ marginTop: 12, padding: '11px 14px' }}>
                <div className="ct" style={{ fontSize: 14 }}>
                  {states.find((s) => s.label.includes('LAPSED')) ? 'Insurance has lapsed — this car must not be driven.' : 'Something on this vehicle is overdue.'}
                </div>
              </div>
            )}

            <div className="row wrap" style={{ gap: 7, marginTop: 12 }}>
              <Btn size="xs" variant="ghost" onClick={() => navigate('register', 'vehicles', v.id)}>Open</Btn>
              <span className="muted" style={{ fontSize: 12.5 }}>{plural(v.log.length, 'log entry', 'log entries')}</span>
            </div>
          </Card>
        );
      })}
      {!list.length && <Empty title="No vehicles" />}
    </div>
  );
}

function VehicleDetail({ id }: { id: string }) {
  const db = useStore((s) => s.db);
  const user = useUser();
  const openSheet = useStore((s) => s.openSheet);
  const v = db.vehicles.find((x) => x.id === id);
  if (!v) return <Empty title="That vehicle no longer exists" />;
  const canEdit = user.role === 'owner' || user.role === 'manager';
  const spend28 = v.log.filter((l) => l.date >= addDays(todayStr(), -28)).reduce((s, l) => s + (l.cost ?? 0), 0);

  return (
    <>
      <PageHead
        eyebrow={`${v.make} ${v.model} · ${v.year}`}
        title={v.name}
        sub={`${v.plate} · ${v.colour} · ${v.odometer.toLocaleString()} km`}
        tools={
          <>
            <Btn size="sm" variant="ghost" onClick={() => navigate('register', 'vehicles')}>‹ Vehicles</Btn>
            {canEdit && <Btn size="sm" variant="ghost" onClick={() => openSheet('vehicle-edit', v.id)}>Edit</Btn>}
            {canEdit && <Btn size="sm" onClick={() => openSheet('vehicle-log', v.id)}>Add a log entry</Btn>}
          </>
        }
      />

      <div className="row wrap" style={{ gap: 7, marginBottom: 16 }}>
        <ZoneChip zone={v.zone} full />
        {vehicleState(v).map((s, i) => (
          <Chip key={i} tone={s.state === 'overdue' ? 'urgent' : s.state === 'due' ? 'low' : 'ok'}>{s.label}</Chip>
        ))}
      </div>

      <div className="grid two">
        <div>
          <SectionHead title="Legal" />
          <Card style={{ marginBottom: 12 }}>
            <KV
              rows={[
                ['Registration expires', `${fmtMedium(v.registrationExpiry)} · ${daysUntil(v.registrationExpiry)} days`],
                ['Insurance expires', `${fmtMedium(v.insuranceExpiry)} · ${daysUntil(v.insuranceExpiry)} days`],
                ['Insurer', v.insuranceProvider],
                ['Policy', v.policyNo],
                ['VIN', v.vin],
              ]}
            />
          </Card>

          <SectionHead title="Servicing" />
          <Card>
            <KV
              rows={[
                ['Interval', `Every ${v.serviceFreqDays} days or ${v.serviceFreqKm.toLocaleString()} km`],
                ['Last', `${fmtMedium(v.serviceLast)} at ${v.serviceLastKm.toLocaleString()} km`],
                ['Next due', `${fmtMedium(v.serviceNext)} or ${(v.serviceLastKm + v.serviceFreqKm).toLocaleString()} km`],
                ['Now on', `${v.odometer.toLocaleString()} km`],
                ['Notes', v.notes],
              ]}
            />
          </Card>
        </div>

        <div>
          <SectionHead title="Running cost" sub={`${money(spend28, db.settings.currency)} in the last four weeks`} />
          <List>
            {v.log
              .slice()
              .sort((a, b) => b.date.localeCompare(a.date))
              .map((l) => (
                <Row
                  key={l.id}
                  title={l.type}
                  sub={`${fmtMedium(l.date)}${l.odometer ? ` · ${l.odometer.toLocaleString()} km` : ''}${l.notes ? ` · ${l.notes}` : ''}`}
                  right={l.cost ? <Chip tone={l.type === 'Fine' ? 'urgent' : 'plain'}>{money(l.cost, db.settings.currency)}</Chip> : undefined}
                  caret={false}
                />
              ))}
            {!v.log.length && <Row title="Nothing logged yet" />}
          </List>
        </div>
      </div>
    </>
  );
}

/* ---------- service contracts ---------- */

function ContractList() {
  const db = useStore((s) => s.db);
  const zoneFilter = useStore((s) => s.zoneFilter);
  let list = db.contracts.filter((c) => c.active);
  if (zoneFilter !== 'all') list = list.filter((c) => c.zone === zoneFilter);
  const sorted = list.slice().sort((a, b) => (a.next || '9999').localeCompare(b.next || '9999'));

  return (
    <List>
      {sorted.map((c) => {
        const st = contractState(c);
        return (
          <Row
            key={c.id}
            title={c.name}
            sub={`${c.cat} · ${vendorName(db, c.vendorId)} · every ${c.freqDays} days${c.costPerVisit ? ` · ${money(c.costPerVisit, db.settings.currency)} a visit` : ''}`}
            zone={c.zone}
            right={
              <>
                <Chip tone={st.state === 'overdue' ? 'urgent' : st.state === 'due' ? 'low' : 'ok'}>{st.label}</Chip>
                {c.contractEnd && daysUntil(c.contractEnd) < 90 && (
                  <Chip tone="low">Contract ends {fmtShort(c.contractEnd)}</Chip>
                )}
              </>
            }
            onClick={() => navigate('register', 'contracts', c.id)}
          />
        );
      })}
      {!sorted.length && <Row title="No contracts" />}
    </List>
  );
}

function ContractDetail({ id }: { id: string }) {
  const db = useStore((s) => s.db);
  const user = useUser();
  const patch = useStore((s) => s.patch);
  const openSheet = useStore((s) => s.openSheet);
  const c = db.contracts.find((x) => x.id === id);
  if (!c) return <Empty title="That contract no longer exists" />;
  const canEdit = user.role === 'owner' || user.role === 'manager';
  const visits = db.contractorVisits.filter((v) => v.contractId === c.id);

  return (
    <>
      <PageHead
        eyebrow={`Service contract · ${c.cat}`}
        title={c.name}
        sub={vendorName(db, c.vendorId)}
        tools={
          <>
            <Btn size="sm" variant="ghost" onClick={() => navigate('register', 'contracts')}>‹ Contracts</Btn>
            {canEdit && <Btn size="sm" variant="ghost" onClick={() => openSheet('contract-edit', c.id)}>Edit</Btn>}
            {canEdit && (
              <Btn
                size="sm"
                onClick={() => patch('contracts', c.id, { last: todayStr(), next: addDays(todayStr(), c.freqDays) }, 'Visit logged')}
              >
                Log today&apos;s visit
              </Btn>
            )}
          </>
        }
      />

      <div className="row wrap" style={{ gap: 7, marginBottom: 16 }}>
        <ZoneChip zone={c.zone} full />
        <Chip tone={contractState(c).state === 'overdue' ? 'urgent' : contractState(c).state === 'due' ? 'low' : 'ok'}>
          Next visit {contractState(c).label}
        </Chip>
      </div>

      <div className="grid two">
        <Card>
          <KV
            rows={[
              ['Vendor', vendorName(db, c.vendorId)],
              ['Frequency', `Every ${c.freqDays} days`],
              ['Last visit', c.last ? fmtMedium(c.last) : '—'],
              ['Next visit', c.next ? fmtMedium(c.next) : '—'],
              ['Cost per visit', c.costPerVisit ? money(c.costPerVisit, db.settings.currency) : 'Included'],
              ['Contract runs', c.contractStart ? `${fmtMedium(c.contractStart)} → ${c.contractEnd ? fmtMedium(c.contractEnd) : 'open'}` : '—'],
              ['Area', c.areaId ? areaName(db, c.areaId) : 'Whole zone'],
              ['Notes', c.notes],
            ]}
          />
        </Card>

        <div>
          <SectionHead title={`Visits logged · ${visits.length}`} />
          <List>
            {visits
              .slice()
              .sort((a, b) => b.date.localeCompare(a.date))
              .map((v) => (
                <Row
                  key={v.id}
                  title={fmtMedium(v.date)}
                  sub={`${v.purpose}${v.arrived ? ` · arrived ${v.arrived}` : ' · not yet arrived'}${v.escortedBy ? ` · escorted by ${db.profiles.find((p) => p.id === v.escortedBy)?.name}` : ''}`}
                  caret={false}
                />
              ))}
            {!visits.length && <Row title="No visits recorded against this contract" />}
          </List>
        </div>
      </div>
    </>
  );
}

/* ---------- plants ---------- */

function PlantList() {
  const db = useStore((s) => s.db);
  const zoneFilter = useStore((s) => s.zoneFilter);
  const patch = useStore((s) => s.patch);
  const openSheet = useStore((s) => s.openSheet);
  const due = plantsDue(db);
  let list = db.plants.filter((p) => p.active);
  if (zoneFilter !== 'all') list = list.filter((p) => p.zone === zoneFilter);

  return (
    <>
      {due.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          <Card className="callout" pad={false} style={{ padding: '14px 17px' }}>
            <div className="eyebrow">Due today</div>
            <div style={{ marginTop: 5, fontSize: 15 }}>
              {due.map((d) => `${d.plant.name} — ${[d.waterDue && 'water', d.feedDue && 'feed'].filter(Boolean).join(' and ')}`).join(' · ')}
            </div>
            <div className="muted" style={{ fontSize: 13, marginTop: 5 }}>
              These generate tasks on the day automatically — no need to remember them.
            </div>
          </Card>
        </div>
      )}

      <List>
        {list.map((p) => {
          const d = due.find((x) => x.plant.id === p.id);
          return (
            <Row
              key={p.id}
              title={p.name}
              sub={`${p.species} · ${areaName(db, p.areaId)} · water every ${p.waterFreqDays}d, feed every ${p.feedFreqDays}d`}
              zone={p.zone}
              right={
                <>
                  {d?.waterDue && (
                    <button type="button" className="chip low" onClick={() => patch('plants', p.id, { waterLast: todayStr() }, `${p.name} watered`)}>
                      Water now
                    </button>
                  )}
                  {d?.feedDue && (
                    <button type="button" className="chip low" onClick={() => patch('plants', p.id, { feedLast: todayStr() }, `${p.name} fed`)}>
                      Feed now
                    </button>
                  )}
                  {!d && <Chip tone="ok">Fine</Chip>}
                </>
              }
              onClick={() => openSheet('plant-edit', p.id)}
            />
          );
        })}
        {!list.length && <Row title="No plants recorded" />}
      </List>
    </>
  );
}

/* ============================================================
   Sheets
   ============================================================ */

export function AssetSheet({ id }: { id?: string }) {
  const db = useStore((s) => s.db);
  const closeSheet = useStore((s) => s.closeSheet);
  const upsert = useStore((s) => s.upsert);
  const remove = useStore((s) => s.remove);
  const existing = id ? db.assets.find((a) => a.id === id) : undefined;

  const [f, setF] = React.useState<Asset>(
    existing ?? {
      id: '', name: '', cat: 'Appliances', sub: '', zone: 'household', brand: '', model: '', serial: '', qty: 1,
      description: '', care: '', purchase: { date: '', ref: '' }, warranty: { start: '', end: '', provider: '', notes: '' },
      service: { freqDays: 0, last: '', next: '', notes: '', history: [] },
      replacement: { by: '', notes: '' }, documentIds: [], active: true,
    } as Asset,
  );
  const set = (k: keyof Asset, v: unknown) => setF((p) => ({ ...p, [k]: v }));
  const setSub = <K extends 'purchase' | 'warranty' | 'service' | 'replacement'>(g: K, k: string, v: unknown) =>
    setF((p) => ({ ...p, [g]: { ...(p[g] as object), [k]: v } }));

  return (
    <Sheet
      title={existing ? existing.name : 'New asset'}
      sub="Durable property. Consumables belong in Inventory."
      onClose={closeSheet}
      wide
      footer={
        <>
          <Btn className="grow" disabled={!f.name} onClick={() => { upsert('assets', f, 'Asset saved'); closeSheet(); }}>Save</Btn>
          {existing && <Btn variant="danger" size="sm" onClick={() => { remove('assets', existing.id, 'Asset removed'); closeSheet(); }}>Delete</Btn>}
          <Btn variant="ghost" onClick={closeSheet}>Cancel</Btn>
        </>
      }
    >
      <Field label="Name"><Text value={f.name} onChange={(v) => set('name', v)} autoFocus /></Field>
      <div className="three-col">
        <Field label="Category"><Select value={f.cat} onChange={(v) => set('cat', v)} options={ASSET_CATS.map((c) => ({ value: c, label: c }))} /></Field>
        <Field label="Sub-type"><Text value={f.sub} onChange={(v) => set('sub', v)} placeholder="Kitchen, Laundry, AV…" /></Field>
        <Field label="Quantity"><Text type="number" value={String(f.qty)} onChange={(v) => set('qty', Number(v))} /></Field>
      </div>
      <div className="three-col">
        <Field label="Area">
          <Select value={f.areaId ?? ''} onChange={(v) => set('areaId', v || undefined)} options={[{ value: '', label: 'Not fixed' }, ...db.areas.filter((a) => a.active).map((a) => ({ value: a.id, label: a.name }))]} />
        </Field>
        <Field label="Assigned to">
          <Select value={f.assignedTo ?? ''} onChange={(v) => set('assignedTo', v || undefined)} options={[{ value: '', label: 'Nobody' }, ...db.profiles.filter((p) => p.active).map((p) => ({ value: p.id, label: p.name }))]} />
        </Field>
      </div>
      <div className="three-col">
        <Field label="Brand"><Text value={f.brand} onChange={(v) => set('brand', v)} /></Field>
        <Field label="Model"><Text value={f.model} onChange={(v) => set('model', v)} /></Field>
        <Field label="Serial"><Text value={f.serial} onChange={(v) => set('serial', v)} /></Field>
      </div>
      <Field label="How to look after it" hint="What staff see on the task and in the manual.">
        <textarea className="in" rows={2} value={f.care} onChange={(e) => set('care', e.target.value)} />
      </Field>

      <SectionHead title="Purchase" />
      <div className="three-col">
        <Field label="Date"><Text type="date" value={f.purchase.date} onChange={(v) => setSub('purchase', 'date', v)} /></Field>
        <Field label="Price"><Text type="number" value={String(f.purchase.price ?? '')} onChange={(v) => setSub('purchase', 'price', v ? Number(v) : undefined)} /></Field>
        <Field label="Reference"><Text value={f.purchase.ref} onChange={(v) => setSub('purchase', 'ref', v)} /></Field>
      </div>
      <Field label="Bought from">
        <Select value={f.purchase.vendorId ?? ''} onChange={(v) => setSub('purchase', 'vendorId', v || undefined)} options={[{ value: '', label: '—' }, ...db.vendors.map((v) => ({ value: v.id, label: v.name }))]} />
      </Field>

      <SectionHead title="Warranty" />
      <div className="three-col">
        <Field label="Starts"><Text type="date" value={f.warranty.start} onChange={(v) => setSub('warranty', 'start', v)} /></Field>
        <Field label="Ends"><Text type="date" value={f.warranty.end} onChange={(v) => setSub('warranty', 'end', v)} /></Field>
        <Field label="Provider"><Text value={f.warranty.provider} onChange={(v) => setSub('warranty', 'provider', v)} /></Field>
      </div>

      <SectionHead title="Servicing" />
      <div className="three-col">
        <Field label="Every">
          <Select
            value={String(f.service.freqDays)}
            onChange={(v) => setSub('service', 'freqDays', Number(v))}
            options={[
              { value: '0', label: 'Not serviced' },
              { value: '90', label: '3 months' },
              { value: '180', label: '6 months' },
              { value: '365', label: 'Annually' },
              { value: '730', label: '2 years' },
            ]}
          />
        </Field>
        <Field label="Last"><Text type="date" value={f.service.last} onChange={(v) => setSub('service', 'last', v)} /></Field>
        <Field label="Next"><Text type="date" value={f.service.next} onChange={(v) => setSub('service', 'next', v)} /></Field>
      </div>

      <SectionHead title="Replacement" />
      <div className="three-col">
        <Field label="Expected life, years"><Text type="number" value={String(f.replacement.lifespanYears ?? '')} onChange={(v) => setSub('replacement', 'lifespanYears', v ? Number(v) : undefined)} /></Field>
        <Field label="Replace by"><Text type="date" value={f.replacement.by} onChange={(v) => setSub('replacement', 'by', v)} /></Field>
        <Field label="Budget"><Text type="number" value={String(f.replacement.budget ?? '')} onChange={(v) => setSub('replacement', 'budget', v ? Number(v) : undefined)} /></Field>
      </div>
    </Sheet>
  );
}

export function VehicleSheet({ id }: { id?: string }) {
  const db = useStore((s) => s.db);
  const closeSheet = useStore((s) => s.closeSheet);
  const upsert = useStore((s) => s.upsert);
  const existing = id ? db.vehicles.find((v) => v.id === id) : undefined;
  const [f, setF] = React.useState<Vehicle>(
    existing ?? {
      id: '', name: '', make: '', model: '', year: '', plate: '', vin: '', zone: 'household', colour: '',
      odometer: 0, registrationExpiry: '', insuranceExpiry: '', insuranceProvider: '', policyNo: '',
      serviceFreqDays: 180, serviceFreqKm: 10000, serviceLast: '', serviceLastKm: 0, serviceNext: '',
      notes: '', log: [], documentIds: [], active: true,
    } as Vehicle,
  );
  const set = (k: keyof Vehicle, v: unknown) => setF((p) => ({ ...p, [k]: v }));

  return (
    <Sheet
      title={existing ? existing.name : 'New vehicle'}
      onClose={closeSheet}
      wide
      footer={
        <>
          <Btn className="grow" disabled={!f.name} onClick={() => { upsert('vehicles', f, 'Vehicle saved'); closeSheet(); }}>Save</Btn>
          <Btn variant="ghost" onClick={closeSheet}>Cancel</Btn>
        </>
      }
    >
      <Field label="Name"><Text value={f.name} onChange={(v) => set('name', v)} placeholder="Family car" /></Field>
      <div className="three-col">
        <Field label="Make"><Text value={f.make} onChange={(v) => set('make', v)} /></Field>
        <Field label="Model"><Text value={f.model} onChange={(v) => set('model', v)} /></Field>
        <Field label="Year"><Text value={f.year} onChange={(v) => set('year', v)} /></Field>
      </div>
      <div className="three-col">
        <Field label="Plate"><Text value={f.plate} onChange={(v) => set('plate', v)} /></Field>
        <Field label="Colour"><Text value={f.colour} onChange={(v) => set('colour', v)} /></Field>
        <Field label="Odometer, km"><Text type="number" value={String(f.odometer)} onChange={(v) => set('odometer', Number(v))} /></Field>
      </div>
      <Field label="Usual driver">
        <Select value={f.assignedTo ?? ''} onChange={(v) => set('assignedTo', v || undefined)} options={[{ value: '', label: 'Nobody' }, ...staffList(db).map((p) => ({ value: p.id, label: p.name }))]} />
      </Field>
      <div className="two">
        <Field label="Registration expires"><Text type="date" value={f.registrationExpiry} onChange={(v) => set('registrationExpiry', v)} /></Field>
        <Field label="Insurance expires"><Text type="date" value={f.insuranceExpiry} onChange={(v) => set('insuranceExpiry', v)} /></Field>
      </div>
      <div className="two">
        <Field label="Insurer"><Text value={f.insuranceProvider} onChange={(v) => set('insuranceProvider', v)} /></Field>
        <Field label="Policy number"><Text value={f.policyNo} onChange={(v) => set('policyNo', v)} /></Field>
      </div>
      <div className="two">
        <Field label="Service every, days"><Text type="number" value={String(f.serviceFreqDays)} onChange={(v) => set('serviceFreqDays', Number(v))} /></Field>
        <Field label="Or every, km"><Text type="number" value={String(f.serviceFreqKm)} onChange={(v) => set('serviceFreqKm', Number(v))} /></Field>
      </div>
      <div className="three-col">
        <Field label="Last serviced"><Text type="date" value={f.serviceLast} onChange={(v) => set('serviceLast', v)} /></Field>
        <Field label="At km"><Text type="number" value={String(f.serviceLastKm)} onChange={(v) => set('serviceLastKm', Number(v))} /></Field>
        <Field label="Next due"><Text type="date" value={f.serviceNext} onChange={(v) => set('serviceNext', v)} /></Field>
      </div>
      <Field label="Notes"><textarea className="in" rows={2} value={f.notes} onChange={(e) => set('notes', e.target.value)} /></Field>
    </Sheet>
  );
}

export function VehicleLogSheet({ id }: { id: string }) {
  const db = useStore((s) => s.db);
  const closeSheet = useStore((s) => s.closeSheet);
  const patch = useStore((s) => s.patch);
  const v = db.vehicles.find((x) => x.id === id);
  const [f, setF] = React.useState({ date: todayStr(), type: 'Fuel', odometer: v?.odometer ?? 0, cost: 0, notes: '', vendorId: '' });
  if (!v) return null;

  return (
    <Sheet
      title="Log an entry"
      sub={`${v.name} · ${v.plate}`}
      onClose={closeSheet}
      footer={
        <>
          <Btn
            className="grow"
            onClick={() => {
              const entry = { id: `vl${Date.now()}`, ...f, vendorId: f.vendorId || undefined, type: f.type as Vehicle['log'][number]['type'] };
              patch('vehicles', v.id, {
                log: [entry, ...v.log],
                odometer: Math.max(v.odometer, f.odometer),
                ...(f.type === 'Service' ? { serviceLast: f.date, serviceLastKm: f.odometer, serviceNext: addDays(f.date, v.serviceFreqDays) } : {}),
              }, 'Entry logged');
              closeSheet();
            }}
          >
            Log it
          </Btn>
          <Btn variant="ghost" onClick={closeSheet}>Cancel</Btn>
        </>
      }
    >
      <div className="three-col">
        <Field label="Date"><Text type="date" value={f.date} onChange={(x) => setF({ ...f, date: x })} /></Field>
        <Field label="Type">
          <Select
            value={f.type}
            onChange={(x) => setF({ ...f, type: x })}
            options={['Fuel', 'Service', 'Repair', 'Fine', 'Toll', 'Salik', 'Other'].map((t) => ({ value: t, label: t }))}
          />
        </Field>
        <Field label="Cost"><Text type="number" value={String(f.cost)} onChange={(x) => setF({ ...f, cost: Number(x) })} /></Field>
      </div>
      <div className="two">
        <Field label="Odometer, km"><Text type="number" value={String(f.odometer)} onChange={(x) => setF({ ...f, odometer: Number(x) })} /></Field>
        <Field label="Vendor">
          <Select value={f.vendorId} onChange={(x) => setF({ ...f, vendorId: x })} options={[{ value: '', label: '—' }, ...db.vendors.map((x) => ({ value: x.id, label: x.name }))]} />
        </Field>
      </div>
      <Field label="Notes"><Text value={f.notes} onChange={(x) => setF({ ...f, notes: x })} /></Field>
    </Sheet>
  );
}

export function ContractSheet({ id }: { id?: string }) {
  const db = useStore((s) => s.db);
  const closeSheet = useStore((s) => s.closeSheet);
  const upsert = useStore((s) => s.upsert);
  const existing = id ? db.contracts.find((c) => c.id === id) : undefined;
  const [f, setF] = React.useState<ServiceContract>(
    existing ?? {
      id: '', name: '', cat: 'AC', zone: 'household', freqDays: 90, last: '', next: '',
      contractStart: '', contractEnd: '', documentIds: [], notes: '', active: true,
    } as ServiceContract,
  );
  const set = (k: keyof ServiceContract, v: unknown) => setF((p) => ({ ...p, [k]: v }));

  return (
    <Sheet
      title={existing ? existing.name : 'New service contract'}
      sub="Recurring work by an outside party. Generates tasks and calendar entries automatically."
      onClose={closeSheet}
      footer={
        <>
          <Btn className="grow" disabled={!f.name} onClick={() => { upsert('contracts', f, 'Contract saved'); closeSheet(); }}>Save</Btn>
          <Btn variant="ghost" onClick={closeSheet}>Cancel</Btn>
        </>
      }
    >
      <Field label="Name"><Text value={f.name} onChange={(v) => set('name', v)} autoFocus /></Field>
      <div className="three-col">
        <Field label="Kind">
          <Select
            value={f.cat}
            onChange={(v) => set('cat', v)}
            options={['AC', 'Water tank', 'Pest control', 'Pool', 'Lift', 'Fire safety', 'Generator', 'Cleaning', 'Windows', 'IT', 'Other'].map((c) => ({ value: c, label: c }))}
          />
        </Field>
        <Field label="Every, days"><Text type="number" value={String(f.freqDays)} onChange={(v) => set('freqDays', Number(v))} /></Field>
      </div>
      <Field label="Vendor">
        <Select value={f.vendorId ?? ''} onChange={(v) => set('vendorId', v || undefined)} options={[{ value: '', label: '—' }, ...db.vendors.map((v) => ({ value: v.id, label: `${v.name} · ${v.cat}` }))]} />
      </Field>
      <div className="two">
        <Field label="Last visit"><Text type="date" value={f.last} onChange={(v) => set('last', v)} /></Field>
        <Field label="Next visit"><Text type="date" value={f.next} onChange={(v) => set('next', v)} /></Field>
      </div>
      <div className="three-col">
        <Field label="Contract starts"><Text type="date" value={f.contractStart} onChange={(v) => set('contractStart', v)} /></Field>
        <Field label="Contract ends"><Text type="date" value={f.contractEnd} onChange={(v) => set('contractEnd', v)} /></Field>
        <Field label="Cost per visit"><Text type="number" value={String(f.costPerVisit ?? '')} onChange={(v) => set('costPerVisit', v ? Number(v) : undefined)} /></Field>
      </div>
      <Field label="Notes"><textarea className="in" rows={2} value={f.notes} onChange={(e) => set('notes', e.target.value)} /></Field>
    </Sheet>
  );
}

export function PlantSheet({ id }: { id?: string }) {
  const db = useStore((s) => s.db);
  const closeSheet = useStore((s) => s.closeSheet);
  const upsert = useStore((s) => s.upsert);
  const remove = useStore((s) => s.remove);
  const existing = id ? db.plants.find((p) => p.id === id) : undefined;
  const [f, setF] = React.useState<Plant>(
    existing ?? {
      id: '', name: '', species: '', zone: 'household', waterFreqDays: 7, waterLast: todayStr(),
      feedFreqDays: 30, feedLast: todayStr(), light: '', care: '', active: true,
    } as Plant,
  );
  const set = (k: keyof Plant, v: unknown) => setF((p) => ({ ...p, [k]: v }));

  return (
    <Sheet
      title={existing ? existing.name : 'New plant'}
      sub="Watering and feeding intervals generate tasks on the day they fall due."
      onClose={closeSheet}
      footer={
        <>
          <Btn className="grow" disabled={!f.name} onClick={() => { upsert('plants', f, 'Plant saved'); closeSheet(); }}>Save</Btn>
          {existing && <Btn variant="danger" size="sm" onClick={() => { remove('plants', existing.id, 'Plant removed'); closeSheet(); }}>Delete</Btn>}
          <Btn variant="ghost" onClick={closeSheet}>Cancel</Btn>
        </>
      }
    >
      <div className="two">
        <Field label="Name"><Text value={f.name} onChange={(v) => set('name', v)} /></Field>
        <Field label="Species"><Text value={f.species} onChange={(v) => set('species', v)} /></Field>
      </div>
      <div className="two">
        <Field label="Where">
          <Select value={f.areaId ?? ''} onChange={(v) => { const a = db.areas.find((x) => x.id === v); setF((p) => ({ ...p, areaId: v || undefined, zone: a?.zone ?? p.zone })); }} options={[{ value: '', label: '—' }, ...db.areas.filter((a) => a.active).map((a) => ({ value: a.id, label: a.name }))]} />
        </Field>
      </div>
      <div className="two">
        <Field label="Water every, days"><Text type="number" value={String(f.waterFreqDays)} onChange={(v) => set('waterFreqDays', Number(v))} /></Field>
        <Field label="Last watered"><Text type="date" value={f.waterLast} onChange={(v) => set('waterLast', v)} /></Field>
      </div>
      <div className="two">
        <Field label="Feed every, days"><Text type="number" value={String(f.feedFreqDays)} onChange={(v) => set('feedFreqDays', Number(v))} /></Field>
        <Field label="Last fed"><Text type="date" value={f.feedLast} onChange={(v) => set('feedLast', v)} /></Field>
      </div>
      <Field label="Light"><Text value={f.light} onChange={(v) => set('light', v)} /></Field>
      <Field label="Care notes"><textarea className="in" rows={2} value={f.care} onChange={(e) => set('care', e.target.value)} /></Field>
    </Sheet>
  );
}
