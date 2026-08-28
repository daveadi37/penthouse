import React from 'react';
import {useStore, useUser} from '@/store';
import {detailId, navigate, useRoute} from '@/lib/router';
import {fmt, fmtShort, timeAgo} from '@/lib/date';
import {money, plural} from '@/lib/format';
import {areaName, byPriority, issuesFor, OPEN_STATUSES, profileName, staffList} from '@/lib/selectors';
import {ISSUE_STATUS_FLOW} from '@/types';
import type { IssueKind, IssuePriority, IssueStatus, Zone } from '@/types';
import {Avatar, Btn, Card, Chip, Empty, Field, List, PageHead, Row, SectionHead, Seg, Select, Sheet, Stat, Text, ZoneChip} from '@/components/ui';
import {ZoneFilterBar} from '@/components/Shell';

const KIND_LABEL: Record<IssueKind, string> = {
  fault: 'Fault',
  condition: 'Condition',
  request: 'Request',
  supply: 'Supplies',
};

const STATUS_LABEL: Record<IssueStatus, string> = {
  reported: 'Reported',
  acknowledged: 'Acknowledged',
  assigned: 'Assigned',
  in_progress: 'In progress',
  awaiting_vendor: 'Awaiting vendor',
  resolved: 'Resolved',
  closed: 'Closed',
};

function priorityTone(p: IssuePriority) {
  return p === 'urgent' ? 'urgent' : p === 'high' ? 'low' : p === 'low' ? 'plain' : 'info';
}

export function Issues() {
  const route = useRoute();
  const id = detailId(route);
  if (id) return <IssueDetail id={id} />;
  return <IssueList />;
}

function IssueList() {
  const user = useUser();
  const db = useStore((s) => s.db);
  const zoneFilter = useStore((s) => s.zoneFilter);
  const openSheet = useStore((s) => s.openSheet);
  const [tab, setTab] = React.useState<'open' | 'mine' | 'resolved' | 'all'>('open');
  const [kind, setKind] = React.useState<IssueKind | 'all'>('all');
  const [q, setQ] = React.useState('');

  const isRequester = user.role === 'requester' || user.role === 'family';

  let list = isRequester ? issuesFor(db, user.id) : db.issues;
  if (zoneFilter !== 'all') list = list.filter((i) => i.zone === zoneFilter);
  if (kind !== 'all') list = list.filter((i) => i.kind === kind);
  if (q) {
    const s = q.toLowerCase();
    list = list.filter((i) => (i.title + i.detail).toLowerCase().includes(s));
  }

  const shown =
    tab === 'open' ? list.filter((i) => OPEN_STATUSES.includes(i.status))
    : tab === 'mine' ? list.filter((i) => i.assignedTo === user.id && OPEN_STATUSES.includes(i.status))
    : tab === 'resolved' ? list.filter((i) => !OPEN_STATUSES.includes(i.status))
    : list;

  const sorted = shown.slice().sort(byPriority);
  const open = db.issues.filter((i) => OPEN_STATUSES.includes(i.status));

  return (
    <>
      <PageHead
        eyebrow="Issues & requests"
        title={isRequester ? 'What you have reported' : 'One inbox'}
        sub={
          isRequester
            ? 'Everything you have raised, and where it got to.'
            : 'Faults, condition flags, requests and supply requests are one object with one status flow.'
        }
        tools={<Btn onClick={() => openSheet('issue-new')}>Report or request</Btn>}
      />

      {!isRequester && (
        <div className="grid four" style={{ marginBottom: 16 }}>
          <Stat label="Open" value={open.length} />
          <Stat label="Urgent" value={open.filter((i) => i.priority === 'urgent').length} tone={open.some((i) => i.priority === 'urgent') ? 'crit' : undefined} />
          <Stat label="Nobody assigned" value={open.filter((i) => i.status === 'reported').length} tone={open.some((i) => i.status === 'reported') ? 'warn' : undefined} />
          <Stat label="Raised today" value={db.issues.filter((i) => new Date(i.reportedAt).toDateString() === new Date().toDateString()).length} foot={<span className="muted" style={{ fontSize: 12.5 }}>all time {db.issues.length}</span>} />
        </div>
      )}

      <div className="row wrap" style={{ gap: 8, marginBottom: 12 }}>
        <Seg
          value={tab}
          onChange={setTab}
          options={[
            { value: 'open', label: 'Open', count: list.filter((i) => OPEN_STATUSES.includes(i.status)).length },
            ...(user.role === 'staff' || user.role === 'manager'
              ? [{ value: 'mine' as const, label: 'Mine', count: list.filter((i) => i.assignedTo === user.id && OPEN_STATUSES.includes(i.status)).length }]
              : []),
            { value: 'resolved', label: 'Resolved' },
            { value: 'all', label: 'All' },
          ]}
        />
        {!isRequester && <ZoneFilterBar />}
      </div>

      <div className="row wrap" style={{ gap: 8, marginBottom: 14 }}>
        <Seg
          value={kind}
          onChange={setKind}
          options={[
            { value: 'all', label: 'Every kind' },
            { value: 'fault', label: 'Faults' },
            { value: 'request', label: 'Requests' },
            { value: 'supply', label: 'Supplies' },
            { value: 'condition', label: 'Condition' },
          ]}
        />
        <input className="in" style={{ width: 'auto', minHeight: 36, flex: '1 1 200px' }} placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      {sorted.length ? (
        <List>
          {sorted.map((i) => (
            <Row
              key={i.id}
              title={
                <span className="row wrap" style={{ gap: 7 }}>
                  {i.title}
                  {i.photos.length > 0 && <Chip tone="plain">{i.photos.length} 📷</Chip>}
                  {i.comments.length > 0 && <Chip tone="plain">{i.comments.length} 💬</Chip>}
                </span>
              }
              sub={`${KIND_LABEL[i.kind]} · ${areaName(db, i.areaId)} · ${profileName(db, i.reportedBy)} · ${timeAgo(i.reportedAt)}`}
              zone={i.zone}
              right={
                <>
                  <Chip tone={priorityTone(i.priority)}>{i.priority}</Chip>
                  <Chip tone={OPEN_STATUSES.includes(i.status) ? 'plain' : 'ok'}>{STATUS_LABEL[i.status]}</Chip>
                  {i.assignedTo && <Avatar name={profileName(db, i.assignedTo)} size="sm" />}
                </>
              }
              onClick={() => navigate('issues', undefined, i.id)}
            />
          ))}
        </List>
      ) : (
        <Empty title="Nothing here">
          {tab === 'open' ? 'No open issues match this filter.' : 'Nothing matches this filter.'}
        </Empty>
      )}
    </>
  );
}

function IssueDetail({ id }: { id: string }) {
  const user = useUser();
  const db = useStore((s) => s.db);
  const advanceIssue = useStore((s) => s.advanceIssue);
  const commentOnIssue = useStore((s) => s.commentOnIssue);
  const patch = useStore((s) => s.patch);
  const openSheet = useStore((s) => s.openSheet);
  const [comment, setComment] = React.useState('');

  const i = db.issues.find((x) => x.id === id);
  if (!i) return <Empty title="That issue no longer exists" />;

  const canManage = user.role === 'owner' || user.role === 'manager';
  const canWork = canManage || user.role === 'staff';
  const nextStatus = ISSUE_STATUS_FLOW[ISSUE_STATUS_FLOW.indexOf(i.status) + 1];

  return (
    <>
      <PageHead
        eyebrow={`${KIND_LABEL[i.kind]} · ${STATUS_LABEL[i.status]}`}
        title={i.title}
        sub={`Reported by ${profileName(db, i.reportedBy)} · ${timeAgo(i.reportedAt)}`}
        tools={
          <>
            <Btn size="sm" variant="ghost" onClick={() => navigate('issues')}>‹ All issues</Btn>
            {canWork && nextStatus && (
              <Btn size="sm" onClick={() => advanceIssue(i.id, nextStatus)}>
                Move to {STATUS_LABEL[nextStatus].toLowerCase()}
              </Btn>
            )}
            {canWork && i.status !== 'resolved' && i.status !== 'closed' && (
              <Btn size="sm" variant="soft" onClick={() => advanceIssue(i.id, 'resolved')}>Mark resolved</Btn>
            )}
          </>
        }
      />

      <div className="row wrap" style={{ gap: 7, marginBottom: 16 }}>
        <ZoneChip zone={i.zone} full />
        <Chip tone={priorityTone(i.priority)}>{i.priority}</Chip>
        <Chip>{areaName(db, i.areaId)}</Chip>
        {i.assignedTo && (
          <Chip tone="info">
            <Avatar name={profileName(db, i.assignedTo)} size="sm" /> {profileName(db, i.assignedTo)}
          </Chip>
        )}
        {i.vendorId && <Chip tone="bronze">{db.vendors.find((v) => v.id === i.vendorId)?.name}</Chip>}
        {i.cost != null && <Chip>{money(i.cost, db.settings.currency)}</Chip>}
      </div>

      <div className="grid two">
        <div>
          <Card style={{ marginBottom: 12 }}>
            <div className="eyebrow">What was reported</div>
            <div style={{ marginTop: 7, fontSize: 15.5, lineHeight: 1.5 }}>{i.detail || '—'}</div>
          </Card>

          <SectionHead
            title={`Photos · ${i.photos.length}`}
            sub="Taken at any point in the issue's life, not only at the start."
            action={canWork ? <Btn size="xs" variant="ghost" onClick={() => openSheet('issue-photo', i.id)}>Add a photo</Btn> : undefined}
          />
          {i.photos.length ? (
            <div className="photogrid" style={{ marginBottom: 14 }}>
              {i.photos.map((p) => (
                <div key={p.id} className="thumb">
                  <img src={p.path} alt={p.caption ?? 'Issue photo'} />
                </div>
              ))}
            </div>
          ) : (
            <Card pad="sm" style={{ marginBottom: 14 }}>
              <div className="muted" style={{ fontSize: 13.5 }}>
                No photos. One clear picture saves a long explanation.
              </div>
            </Card>
          )}

          <SectionHead title={`Thread · ${i.comments.length}`} />
          <List>
            {i.comments.length ? (
              i.comments.map((c) => (
                <div key={c.id} className="item" style={{ alignItems: 'flex-start' }}>
                  <Avatar name={profileName(db, c.by)} />
                  <span className="grow">
                    <span className="row wrap" style={{ gap: 7 }}>
                      <b style={{ fontSize: 14 }}>{profileName(db, c.by)}</b>
                      <span className="faint" style={{ fontSize: 12 }}>{timeAgo(c.at)}</span>
                    </span>
                    <span style={{ display: 'block', fontSize: 14.5, marginTop: 3, lineHeight: 1.45 }}>{c.text}</span>
                  </span>
                </div>
              ))
            ) : (
              <Row title="Nothing said yet" />
            )}
          </List>

          <Card style={{ marginTop: 12 }}>
            <Field label="Add to the thread" hint="The person who reported it gets a push.">
              <textarea className="in" rows={3} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="What you found, what you have done, what happens next" />
            </Field>
            <Btn
              size="sm"
              disabled={!comment.trim()}
              onClick={() => {
                commentOnIssue(i.id, comment.trim());
                setComment('');
              }}
            >
              Post
            </Btn>
          </Card>
        </div>

        <div>
          {canWork && (
            <Card style={{ marginBottom: 12 }}>
              <div className="eyebrow" style={{ marginBottom: 10 }}>Manage</div>
              <Field label="Status">
                <Select
                  value={i.status}
                  onChange={(v) => advanceIssue(i.id, v as IssueStatus)}
                  options={ISSUE_STATUS_FLOW.map((s) => ({ value: s, label: STATUS_LABEL[s] }))}
                />
              </Field>
              <Field label="Priority">
                <Select
                  value={i.priority}
                  onChange={(v) => patch('issues', i.id, { priority: v }, 'Priority changed')}
                  options={[
                    { value: 'urgent', label: 'Urgent — water, power, safety, the cat' },
                    { value: 'high', label: 'High — stops someone working' },
                    { value: 'normal', label: 'Normal' },
                    { value: 'low', label: 'Low — when convenient' },
                  ]}
                />
              </Field>
              <Field label="Assigned to">
                <Select
                  value={i.assignedTo ?? ''}
                  onChange={(v) => patch('issues', i.id, { assignedTo: v || undefined, status: v && i.status === 'reported' ? 'assigned' : i.status }, 'Reassigned')}
                  options={[
                    { value: '', label: 'Nobody' },
                    ...staffList(db).map((p) => ({ value: p.id, label: p.name })),
                    { value: 'p-mgr', label: 'Priya Menon (manager)' },
                  ]}
                />
              </Field>
              {canManage && (
                <>
                  <Field label="Vendor" hint="Links the visit to this job in the contractor log.">
                    <Select
                      value={i.vendorId ?? ''}
                      onChange={(v) => patch('issues', i.id, { vendorId: v || undefined }, 'Vendor set')}
                      options={[{ value: '', label: 'None' }, ...db.vendors.filter((v) => v.active).map((v) => ({ value: v.id, label: `${v.name} · ${v.cat}` }))]}
                    />
                  </Field>
                  <Field label="Cost" hint="Feeds the maintenance budget for this zone.">
                    <Text type="number" value={String(i.cost ?? '')} onChange={(v) => patch('issues', i.id, { cost: v ? Number(v) : undefined }, 'Cost recorded')} />
                  </Field>
                </>
              )}
              <Field label="Resolution" hint="What was actually done. This is what the reporter sees.">
                <textarea
                  className="in"
                  rows={3}
                  defaultValue={i.resolution ?? ''}
                  onBlur={(e) => patch('issues', i.id, { resolution: e.target.value }, 'Resolution saved')}
                />
              </Field>
            </Card>
          )}

          <Card>
            <div className="eyebrow" style={{ marginBottom: 8 }}>History</div>
            <dl className="kv">
              <dt>Reported</dt>
              <dd>{new Date(i.reportedAt).toLocaleString('en-GB')}</dd>
              <dt>By</dt>
              <dd>{profileName(db, i.reportedBy)}</dd>
              {i.resolvedAt && (
                <>
                  <dt>Resolved</dt>
                  <dd>{new Date(i.resolvedAt).toLocaleString('en-GB')}</dd>
                </>
              )}
            </dl>
          </Card>
        </div>
      </div>
    </>
  );
}

/* ============================================================
   The report flow. Photo first, area, one line, done — because it
   is used in a corridor on a phone, and any friction sends people
   back to telling someone in passing.
   ============================================================ */

export function IssueNewSheet() {
  const user = useUser();
  const db = useStore((s) => s.db);
  const closeSheet = useStore((s) => s.closeSheet);
  const raiseIssue = useStore((s) => s.raiseIssue);
  const [photos, setPhotos] = React.useState<string[]>([]);
  const fileRef = React.useRef<HTMLInputElement>(null);

  const isRequester = false;
  const areas = db.areas.filter((a) => a.active);

  const [f, setF] = React.useState<{
    kind: IssueKind;
    title: string;
    detail: string;
    areaId: string;
    priority: IssuePriority;
  }>({
    kind: isRequester ? 'fault' : 'fault',
    title: '',
    detail: '',
    areaId: '',
    priority: 'normal',
  });

  const zoneOf = (areaId: string): Zone =>
    db.areas.find((a) => a.id === areaId)?.zone ?? 'household';

  const onFiles = async (files: FileList | null) => {
    if (!files) return;
    const out: string[] = [];
    for (const file of Array.from(files).slice(0, 4)) {
      out.push(await shrink(file));
    }
    setPhotos((p) => [...p, ...out].slice(0, 4));
  };

  return (
    <Sheet
      title={isRequester ? 'Report something' : 'New issue or request'}
      sub="A photo, where it is, one line. That is enough."
      onClose={closeSheet}
      footer={
        <>
          <Btn
            className="grow"
            disabled={!f.title.trim()}
            onClick={() => {
              raiseIssue({
                kind: f.kind,
                title: f.title.trim(),
                detail: f.detail,
                areaId: f.areaId || undefined,
                zone: zoneOf(f.areaId),
                priority: f.priority,
                photos: photos.map((p, n) => ({ id: `ph${n}${Date.now()}`, path: p, at: Date.now(), by: user.id })),
              });
              closeSheet();
            }}
          >
            Send it
          </Btn>
          <Btn variant="ghost" onClick={closeSheet}>Cancel</Btn>
        </>
      }
    >
      {/* photo first */}
      <div style={{ marginBottom: 16 }}>
        <div className="eyebrow" style={{ marginBottom: 7 }}>Photo</div>
        <div className="photogrid">
          {photos.map((p, n) => (
            <div key={n} className="thumb">
              <img src={p} alt="" />
              <button
                type="button"
                onClick={() => setPhotos((ps) => ps.filter((_, i) => i !== n))}
                style={{ position: 'absolute', top: 3, right: 3, background: 'rgba(0,0,0,.6)', color: '#fff', borderRadius: 999, width: 22, height: 22, textAlign: 'center', fontSize: 12 }}
              >
                ✕
              </button>
            </div>
          ))}
          {photos.length < 4 && (
            <button
              type="button"
              className="thumb"
              onClick={() => fileRef.current?.click()}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 4, color: 'var(--muted)' }}
            >
              <span style={{ fontSize: 22 }}>📷</span>
              <span style={{ fontSize: 11.5 }}>Add</span>
            </button>
          )}
        </div>
        <input ref={fileRef} type="file" accept="image/*" capture="environment" multiple hidden onChange={(e) => onFiles(e.target.files)} />
        <div className="muted" style={{ fontSize: 12.5, marginTop: 6 }}>
          Shrunk on the device before upload — a phone snap becomes about 150KB, not 4MB.
        </div>
      </div>

      <Field label="What is it">
        <Text
          value={f.title}
          onChange={(v) => setF({ ...f, title: v })}
          placeholder={isRequester ? 'Meeting room AC is rattling' : 'Bedroom 2 blind will not stay up'}
          autoFocus
        />
      </Field>

      <Field label="Where">
        <Select
          value={f.areaId}
          onChange={(v) => setF({ ...f, areaId: v })}
          options={[{ value: '', label: 'Not in one place' }, ...areas.map((a) => ({ value: a.id, label: `${a.name} · ${a.zone}` }))]}
        />
      </Field>

      <div className="two">
        <Field label="Kind">
          <Select
            value={f.kind}
            onChange={(v) => setF({ ...f, kind: v as IssueKind })}
            options={[
              { value: 'fault', label: 'Something is broken' },
              { value: 'supply', label: 'Something has run out' },
              { value: 'request', label: 'I need something done' },
              { value: 'condition', label: 'Something needs replacing' },
            ]}
          />
        </Field>
        <Field label="How urgent" hint="Urgent means water, electricity, safety or the cat.">
          <Select
            value={f.priority}
            onChange={(v) => setF({ ...f, priority: v as IssuePriority })}
            options={[
              { value: 'urgent', label: 'Urgent' },
              { value: 'high', label: 'High — stops me working' },
              { value: 'normal', label: 'Normal' },
              { value: 'low', label: 'Low — when convenient' },
            ]}
          />
        </Field>
      </div>

      <Field label="Anything else" hint="What happens, when it started, what you have already tried.">
        <textarea className="in" rows={3} value={f.detail} onChange={(e) => setF({ ...f, detail: e.target.value })} />
      </Field>
    </Sheet>
  );
}

export function IssuePhotoSheet({ id }: { id: string }) {
  const user = useUser();
  const db = useStore((s) => s.db);
  const closeSheet = useStore((s) => s.closeSheet);
  const patch = useStore((s) => s.patch);
  const [photos, setPhotos] = React.useState<string[]>([]);
  const fileRef = React.useRef<HTMLInputElement>(null);
  const issue = db.issues.find((x) => x.id === id);
  if (!issue) return null;

  return (
    <Sheet
      title="Add photos"
      sub={issue.title}
      onClose={closeSheet}
      footer={
        <>
          <Btn
            className="grow"
            disabled={!photos.length}
            onClick={() => {
              patch(
                'issues',
                id,
                {
                  photos: [
                    ...issue.photos,
                    ...photos.map((p, n) => ({ id: `ph${n}${Date.now()}`, path: p, at: Date.now(), by: user.id })),
                  ],
                },
                `${plural(photos.length, 'photo')} added`,
              );
              closeSheet();
            }}
          >
            Attach {photos.length || ''}
          </Btn>
          <Btn variant="ghost" onClick={closeSheet}>Cancel</Btn>
        </>
      }
    >
      <div className="photogrid">
        {photos.map((p, n) => (
          <div key={n} className="thumb">
            <img src={p} alt="" />
          </div>
        ))}
        <button
          type="button"
          className="thumb"
          onClick={() => fileRef.current?.click()}
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--muted)', fontSize: 22 }}
        >
          📷
        </button>
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        capture="environment"
        multiple
        hidden
        onChange={async (e) => {
          if (!e.target.files) return;
          const out: string[] = [];
          for (const file of Array.from(e.target.files)) out.push(await shrink(file));
          setPhotos((p) => [...p, ...out]);
        }}
      />
    </Sheet>
  );
}

/** Downscale before storing — same approach the original build used. */
export function shrink(file: File): Promise<string> {
  return new Promise((resolve) => {
    const fr = new FileReader();
    fr.onload = () => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, 1400 / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * scale);
        c.height = Math.round(img.height * scale);
        c.getContext('2d')?.drawImage(img, 0, 0, c.width, c.height);
        resolve(c.toDataURL('image/jpeg', 0.72));
      };
      img.onerror = () => resolve(String(fr.result));
      img.src = String(fr.result);
    };
    fr.onerror = () => resolve('');
    fr.readAsDataURL(file);
  });
}

/* Incidents live next door to issues — same shape, different purpose. */
export function Incidents() {
  const db = useStore((s) => s.db);
  const openSheet = useStore((s) => s.openSheet);
  return (
    <>
      <SectionHead
        title="Incident log"
        sub="Accidents, damage and security events. Logged the same day, with photographs."
        action={<Btn size="xs" variant="ghost" onClick={() => openSheet('incident-new')}>Log an incident</Btn>}
      />
      {db.incidents.length ? (
        <List>
          {db.incidents
            .slice()
            .sort((a, b) => b.date.localeCompare(a.date))
            .map((n) => (
              <Row
                key={n.id}
                title={`${n.type} · ${areaName(db, n.areaId)}`}
                sub={`${fmt(n.date)} ${n.time} · ${n.description}`}
                zone={n.zone}
                right={n.followUpIssueId ? <Chip tone="info">Linked issue</Chip> : undefined}
                onClick={() => openSheet('incident', n.id)}
              />
            ))}
        </List>
      ) : (
        <Empty title="No incidents logged" />
      )}
    </>
  );
}

export function IncidentSheet({ id }: { id: string }) {
  const db = useStore((s) => s.db);
  const closeSheet = useStore((s) => s.closeSheet);
  const n = db.incidents.find((x) => x.id === id);
  if (!n) return null;
  return (
    <Sheet title={`${n.type} — ${fmtShort(n.date)}`} sub={`${areaName(db, n.areaId)} at ${n.time}`} onClose={closeSheet} footer={<Btn variant="ghost" onClick={closeSheet}>Close</Btn>}>
      <dl className="kv">
        <dt>What happened</dt>
        <dd>{n.description}</dd>
        <dt>People involved</dt>
        <dd>{n.people || '—'}</dd>
        <dt>Action taken</dt>
        <dd>{n.actionTaken || '—'}</dd>
        <dt>Reported by</dt>
        <dd>{profileName(db, n.reportedBy)}</dd>
      </dl>
      {n.followUpIssueId && (
        <Btn
          size="sm"
          variant="ghost"
          style={{ marginTop: 12 }}
          onClick={() => {
            closeSheet();
            navigate('issues', undefined, n.followUpIssueId);
          }}
        >
          Open the follow-up issue
        </Btn>
      )}
    </Sheet>
  );
}

export function IncidentNewSheet() {
  const user = useUser();
  const db = useStore((s) => s.db);
  const closeSheet = useStore((s) => s.closeSheet);
  const upsert = useStore((s) => s.upsert);
  const [f, setF] = React.useState({
    date: new Date().toISOString().slice(0, 10),
    time: new Date().toTimeString().slice(0, 5),
    type: 'Damage',
    areaId: '',
    description: '',
    people: '',
    actionTaken: '',
  });
  return (
    <Sheet
      title="Log an incident"
      sub="People first, property second, records third — but the records always get made."
      onClose={closeSheet}
      footer={
        <>
          <Btn
            className="grow"
            disabled={!f.description}
            onClick={() => {
              upsert(
                'incidents',
                {
                  ...f,
                  zone: db.areas.find((a) => a.id === f.areaId)?.zone ?? 'shared',
                  areaId: f.areaId || undefined,
                  reportedBy: user.id,
                  photos: [],
                },
                'Incident logged',
              );
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
        <Field label="Date"><Text type="date" value={f.date} onChange={(v) => setF({ ...f, date: v })} /></Field>
        <Field label="Time"><Text type="time" value={f.time} onChange={(v) => setF({ ...f, time: v })} /></Field>
        <Field label="Type">
          <Select
            value={f.type}
            onChange={(v) => setF({ ...f, type: v })}
            options={['Damage', 'Injury', 'Security', 'Water', 'Electrical', 'Fire', 'Other'].map((t) => ({ value: t, label: t }))}
          />
        </Field>
      </div>
      <Field label="Where">
        <Select
          value={f.areaId}
          onChange={(v) => setF({ ...f, areaId: v })}
          options={[{ value: '', label: 'Not in one place' }, ...db.areas.filter((a) => a.active).map((a) => ({ value: a.id, label: a.name }))]}
        />
      </Field>
      <Field label="What happened">
        <textarea className="in" rows={3} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
      </Field>
      <Field label="People involved">
        <Text value={f.people} onChange={(v) => setF({ ...f, people: v })} />
      </Field>
      <Field label="Action taken">
        <textarea className="in" rows={2} value={f.actionTaken} onChange={(e) => setF({ ...f, actionTaken: e.target.value })} />
      </Field>
    </Sheet>
  );
}
