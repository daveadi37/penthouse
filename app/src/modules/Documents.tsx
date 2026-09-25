import React from 'react';
import {useStore, useUser} from '@/store';
import {detailId, navigate, useRoute} from '@/lib/router';
import {daysUntil, fmtMedium} from '@/lib/date';
import {plural} from '@/lib/format';
import {profileName} from '@/lib/selectors';
import {DOC_CATS} from '@/types';
import type { DocumentRec } from '@/types';
import {Btn, Card, Chip, Empty, Field, KV, List, PageHead, Row, Seg, Select, Sheet, Stat, Text, ZoneChip} from '@/components/ui';

export function Documents() {
  const route = useRoute();
  const id = detailId(route);
  if (id) return <DocDetail id={id} />;
  return <DocList />;
}

function DocList() {
  const user = useUser();
  const db = useStore((s) => s.db);
  const openSheet = useStore((s) => s.openSheet);
  const [tab, setTab] = React.useState<'expiring' | 'all'>('expiring');
  const [cat, setCat] = React.useState('all');
  const [q, setQ] = React.useState('');

  const isOwner = user.role === 'owner';
  let list = db.documents.filter((d) => isOwner || d.visibility === 'manager');
  if (cat !== 'all') list = list.filter((d) => d.cat === cat);
  if (q) list = list.filter((d) => (d.title + d.filename + d.notes).toLowerCase().includes(q.toLowerCase()));

  const withExpiry = list.filter((d) => d.expiryDate);
  const expiring = withExpiry
    .filter((d) => daysUntil(d.expiryDate) <= 120)
    .sort((a, b) => a.expiryDate.localeCompare(b.expiryDate));
  const expired = withExpiry.filter((d) => daysUntil(d.expiryDate) < 0);
  const hidden = db.documents.filter((d) => d.visibility === 'owner').length;

  const shown = tab === 'expiring' ? expiring : list.slice().sort((a, b) => a.title.localeCompare(b.title));

  return (
    <>
      <PageHead
        eyebrow="Documents"
        title="The vault"
        sub="Tenancy, insurance, permits, visas, warranties — every one with an expiry date and its own reminder lead."
        tools={<Btn size="sm" onClick={() => openSheet('doc-new')}>Add a document</Btn>}
      />

      <div className="grid four" style={{ marginBottom: 16 }}>
        <Stat label="Documents" value={list.length} />
        <Stat label="With an expiry" value={withExpiry.length} />
        <Stat label="Expiring in 120 days" value={expiring.length} tone={expiring.length ? 'warn' : undefined} />
        <Stat label="Already expired" value={expired.length} tone={expired.length ? 'crit' : undefined} />
      </div>

      {!isOwner && hidden > 0 && (
        <div style={{ marginBottom: 14 }}>
          <Card className="callout" pad={false} style={{ padding: '13px 16px' }}>
            <div className="muted" style={{ fontSize: 13.5 }}>
              {plural(hidden, 'document')} marked owner-only — visas, passports, contracts and pay — are not in
              this view.
            </div>
          </Card>
        </div>
      )}

      <div className="row wrap" style={{ gap: 8, marginBottom: 14 }}>
        <Seg
          value={tab}
          onChange={setTab}
          options={[
            { value: 'expiring', label: 'Expiring', count: expiring.length },
            { value: 'all', label: 'Everything', count: list.length },
          ]}
        />
      </div>

      <div className="row wrap" style={{ gap: 8, marginBottom: 14 }}>
        <input className="in" style={{ width: 'auto', minHeight: 36, flex: '1 1 220px' }} placeholder="Search documents" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="in" style={{ width: 'auto', minHeight: 36 }} value={cat} onChange={(e) => setCat(e.target.value)}>
          <option value="all">Every category</option>
          {DOC_CATS.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </div>

      {shown.length ? (
        <List>
          {shown.map((d) => {
            const days = d.expiryDate ? daysUntil(d.expiryDate) : null;
            return (
              <Row
                key={d.id}
                title={d.title}
                sub={`${d.cat} · ${d.filename} · ${d.sizeKb}KB${d.notes ? ` · ${d.notes}` : ''}`}
                zone={d.zone}
                right={
                  <>
                    {d.visibility === 'owner' && <Chip tone="bronze">Owner only</Chip>}
                    {days != null && (
                      <Chip tone={days < 0 ? 'urgent' : days <= d.reminderDays ? 'low' : 'ok'}>
                        {days < 0 ? `Expired ${Math.abs(days)}d ago` : `${days} days`}
                      </Chip>
                    )}
                  </>
                }
                onClick={() => navigate('documents', undefined, d.id)}
              />
            );
          })}
        </List>
      ) : (
        <Empty title="Nothing here">
          {tab === 'expiring' ? 'Nothing expires within four months.' : 'No documents match this filter.'}
        </Empty>
      )}
    </>
  );
}

function DocDetail({ id }: { id: string }) {
  const user = useUser();
  const db = useStore((s) => s.db);
  const openSheet = useStore((s) => s.openSheet);
  const d = db.documents.find((x) => x.id === id);
  if (!d) return <Empty title="That document no longer exists" />;
  if (d.visibility === 'owner' && user.role !== 'owner') return <Empty title="Not available">This document is owner-only.</Empty>;

  const days = d.expiryDate ? daysUntil(d.expiryDate) : null;
  const linked =
    d.linkedType === 'asset' ? db.assets.find((a) => a.id === d.linkedId)?.name
    : d.linkedType === 'vehicle' ? db.vehicles.find((v) => v.id === d.linkedId)?.name
    : d.linkedType === 'contract' ? db.contracts.find((c) => c.id === d.linkedId)?.name
    : d.linkedType === 'staff' ? profileName(db, d.linkedId)
    : undefined;

  return (
    <>
      <PageHead
        eyebrow={d.cat}
        title={d.title}
        sub={`${d.filename} · ${d.sizeKb}KB`}
        tools={
          <>
            <Btn size="sm" variant="ghost" onClick={() => navigate('documents')}>‹ Documents</Btn>
            <Btn size="sm" variant="ghost" onClick={() => openSheet('doc-edit', d.id)}>Edit</Btn>
          </>
        }
      />

      <div className="row wrap" style={{ gap: 7, marginBottom: 16 }}>
        <ZoneChip zone={d.zone} full />
        {d.visibility === 'owner' && <Chip tone="bronze">Owner only</Chip>}
        {days != null && (
          <Chip tone={days < 0 ? 'urgent' : days <= d.reminderDays ? 'low' : 'ok'}>
            {days < 0 ? `Expired ${Math.abs(days)} days ago` : `Expires in ${days} days`}
          </Chip>
        )}
      </div>

      <div className="grid two">
        <Card>
          <KV
            rows={[
              ['Category', d.cat],
              ['Issued', d.issueDate ? fmtMedium(d.issueDate) : '—'],
              ['Expires', d.expiryDate ? fmtMedium(d.expiryDate) : 'No expiry'],
              ['Reminder', d.reminderDays ? `${d.reminderDays} days before` : 'None'],
              ['Linked to', linked ? `${d.linkedType}: ${linked}` : '—'],
              ['Uploaded by', profileName(db, d.uploadedBy)],
              ['Uploaded', new Date(d.uploadedAt).toLocaleDateString('en-GB')],
            ]}
          />
        </Card>
        <Card>
          <div className="eyebrow">Notes</div>
          <div style={{ marginTop: 6, fontSize: 15, lineHeight: 1.5 }}>{d.notes || '—'}</div>
          {d.path ? (
            <a className="btn ghost sm" href={d.path} target="_blank" rel="noreferrer" style={{ marginTop: 14 }}>
              Open the file
            </a>
          ) : (
            <div className="muted" style={{ fontSize: 13, marginTop: 14 }}>
              No file attached in this build — records only. Once Supabase Storage is wired the file is fetched
              through a short-lived signed URL.
            </div>
          )}
        </Card>
      </div>
    </>
  );
}

export function DocSheet({ id }: { id?: string }) {
  const user = useUser();
  const db = useStore((s) => s.db);
  const closeSheet = useStore((s) => s.closeSheet);
  const upsert = useStore((s) => s.upsert);
  const remove = useStore((s) => s.remove);
  const existing = id ? db.documents.find((d) => d.id === id) : undefined;
  const [f, setF] = React.useState<DocumentRec>(
    existing ?? {
      id: '', title: '', cat: 'Other', filename: '', mime: 'application/pdf', sizeKb: 0,
      zone: 'household', issueDate: '', expiryDate: '', reminderDays: 30,
      visibility: 'manager', uploadedBy: user.id, uploadedAt: Date.now(), notes: '',
    } as DocumentRec,
  );
  const set = (k: keyof DocumentRec, v: unknown) => setF((p) => ({ ...p, [k]: v }));

  const onFile = (file: File | null) => {
    if (!file) return;
    const fr = new FileReader();
    fr.onload = () =>
      setF((p) => ({
        ...p,
        filename: file.name,
        mime: file.type,
        sizeKb: Math.round(file.size / 1024),
        path: String(fr.result),
        title: p.title || file.name.replace(/\.[^.]+$/, ''),
      }));
    fr.readAsDataURL(file);
  };

  return (
    <Sheet
      title={existing ? existing.title : 'Add a document'}
      sub="An expiry date and a reminder lead is what turns a folder into something that tells you before it lapses."
      onClose={closeSheet}
      footer={
        <>
          <Btn className="grow" disabled={!f.title} onClick={() => { upsert('documents', f, 'Document saved'); closeSheet(); }}>Save</Btn>
          {existing && <Btn variant="danger" size="sm" onClick={() => { remove('documents', existing.id, 'Deleted'); closeSheet(); }}>Delete</Btn>}
          <Btn variant="ghost" onClick={closeSheet}>Cancel</Btn>
        </>
      }
    >
      <Field label="File" hint="Stored on this device in this build; Supabase Storage once the backend is wired.">
        <input className="in" type="file" onChange={(e) => onFile(e.target.files?.[0] ?? null)} />
      </Field>
      <Field label="Title"><Text value={f.title} onChange={(v) => set('title', v)} /></Field>
      <div className="three-col">
        <Field label="Category">
          <Select value={f.cat} onChange={(v) => set('cat', v)} options={DOC_CATS.map((c) => ({ value: c, label: c }))} />
        </Field>
        <Field label="Who can see it">
          <Select
            value={f.visibility}
            onChange={(v) => set('visibility', v)}
            options={[{ value: 'manager', label: 'Manager and owner' }, { value: 'owner', label: 'Owner only' }]}
          />
        </Field>
      </div>
      <div className="three-col">
        <Field label="Issued"><Text type="date" value={f.issueDate} onChange={(v) => set('issueDate', v)} /></Field>
        <Field label="Expires"><Text type="date" value={f.expiryDate} onChange={(v) => set('expiryDate', v)} /></Field>
        <Field label="Remind, days before"><Text type="number" value={String(f.reminderDays)} onChange={(v) => set('reminderDays', Number(v))} /></Field>
      </div>
      <div className="two">
        <Field label="Attach to">
          <Select
            value={f.linkedType ?? ''}
            onChange={(v) => setF((p) => ({ ...p, linkedType: (v || undefined) as DocumentRec['linkedType'], linkedId: undefined }))}
            options={[
              { value: '', label: 'Nothing' },
              { value: 'asset', label: 'An asset' },
              { value: 'vehicle', label: 'A vehicle' },
              { value: 'contract', label: 'A contract' },
              { value: 'staff', label: 'A staff member' },
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
                ...(f.linkedType === 'asset' ? db.assets.map((a) => ({ value: a.id, label: a.name }))
                  : f.linkedType === 'vehicle' ? db.vehicles.map((v) => ({ value: v.id, label: v.name }))
                  : f.linkedType === 'contract' ? db.contracts.map((c) => ({ value: c.id, label: c.name }))
                  : db.profiles.filter((p) => p.role === 'staff').map((p) => ({ value: p.id, label: p.name }))),
              ]}
            />
          </Field>
        )}
      </div>
      <Field label="Notes"><textarea className="in" rows={3} value={f.notes} onChange={(e) => set('notes', e.target.value)} /></Field>
    </Sheet>
  );
}
