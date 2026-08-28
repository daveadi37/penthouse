import React from 'react';
import { useStore, useUser } from '@/store';
import { can, canGrant, grantableRoles, rankOf, roleLabel } from '@/lib/access';
import { plural } from '@/lib/format';
import { CAPABILITIES, CAPABILITY_LABELS, STAFF_ROLES } from '@/types';
import type { Capability, Profile, RoleDef, StaffRole } from '@/types';
import {
  Avatar, Btn, Card, Check, Chip, Empty, Field, List, Num, PageHead, Row,
  SectionHead, Seg, Select, Sheet, Stat, Text,
} from '@/components/ui';

/* ============================================================
   Roles & Logins.

   The hierarchy is editable here, and that is the whole point: the
   house adds a role when it takes someone on, rather than waiting for
   a release. Two things keep that from becoming a hole.

   First, capabilities are a fixed list. A role is composed from them;
   it cannot invent a new power, because a power is something the code
   and Postgres both have to know how to enforce.

   Second, rank. You cannot create, edit or grant a role that outranks
   you, and you cannot edit your own role at all. Without those two
   rules whoever holds `roles.manage` is already an owner and simply
   has not noticed yet.
   ============================================================ */

type Tab = 'people' | 'roles';

export function RolesAndLogins() {
  const db = useStore((s) => s.db);
  const user = useUser();
  const openSheet = useStore((s) => s.openSheet);
  const [tab, setTab] = React.useState<Tab>('people');

  const withLogins = db.profiles.filter((p) => p.active && p.canSignIn);
  const withoutLogins = db.profiles.filter((p) => p.active && !p.canSignIn);
  const pending = db.profiles.filter((p) => p.canSignIn && !p.authId);

  return (
    <>
      <PageHead
        eyebrow="Administration"
        title="Roles &amp; Logins"
        sub="Who can get in, and what each kind of person is allowed to do. Every rule on this screen is also a row-level security policy in the database, so a role with no money capability is refused the rows, not merely shown a smaller menu."
        tools={
          <Seg
            value={tab}
            onChange={setTab}
            options={[
              { value: 'people', label: 'People & logins', count: withLogins.length },
              { value: 'roles', label: 'Roles', count: db.roles.filter((r) => r.active).length },
            ]}
          />
        }
      />

      <div className="grid four" style={{ marginBottom: 16 }}>
        <Stat label="Logins" value={withLogins.length} foot={<span className="muted" style={{ fontSize: 12.5 }}>of {db.profiles.filter((p) => p.active).length} people</span>} />
        <Stat label="Awaiting a password" value={pending.length} tone={pending.length ? 'warn' : undefined} foot={<span className="muted" style={{ fontSize: 12.5 }}>you set it, they never choose one</span>} />
        <Stat label="On the sheet, no login" value={withoutLogins.length} foot={<span className="muted" style={{ fontSize: 12.5 }}>the cooks and the priests</span>} />
        <Stat label="Roles" value={db.roles.filter((r) => r.active).length} foot={<span className="muted" style={{ fontSize: 12.5 }}>{plural(CAPABILITIES.length, 'capability', 'capabilities')} to compose from</span>} />
      </div>

      {tab === 'people' ? <People /> : <Roles />}

      {tab === 'roles' && can(db, user, 'roles.manage') && (
        <div style={{ marginTop: 14 }}>
          <Btn variant="soft" onClick={() => openSheet('role-new')}>Create a role</Btn>
        </div>
      )}
    </>
  );
}

/* ---------- people ---------- */

function People() {
  const db = useStore((s) => s.db);
  const user = useUser();
  const openSheet = useStore((s) => s.openSheet);

  const byRole = db.roles
    .filter((r) => r.active)
    .sort((a, b) => b.rank - a.rank)
    .map((r) => ({ role: r, people: db.profiles.filter((p) => p.active && p.role === r.id) }))
    .filter((g) => g.people.length > 0);

  return (
    <>
      <SectionHead
        title="Everybody in the house"
        sub="Grouped by role, highest first. A person with no login still appears on the running sheet and in the rota — they simply never open the app."
        action={
          can(db, user, 'accounts.manage') ? (
            <Btn size="xs" variant="ghost" onClick={() => openSheet('person-new')}>Add a person</Btn>
          ) : undefined
        }
      />

      {byRole.map(({ role, people }) => (
        <div key={role.id} style={{ marginBottom: 16 }}>
          <div className="row wrap" style={{ gap: 8, marginBottom: 8, alignItems: 'baseline' }}>
            <div className="eyebrow">{role.name}</div>
            <span className="faint" style={{ fontSize: 12 }}>rank {role.rank}</span>
            <Chip tone="plain">{plural(role.capabilities.length, 'capability', 'capabilities')}</Chip>
          </div>
          <List>
            {people.map((p) => (
              <Row
                key={p.id}
                left={<Avatar name={p.name} initials={p.initials} size="sm" />}
                title={p.name}
                sub={
                  p.canSignIn
                    ? `${p.email || 'no email on file'}${p.authId ? '' : ' · no password set yet'}`
                    : `${p.phone || 'no phone'} · no login`
                }
                right={
                  <>
                    {p.staffRoles.length > 0 && <Chip tone="plain">{p.staffRoles.join(', ')}</Chip>}
                    {p.canSignIn ? (
                      p.authId ? <Chip tone="ok">Can sign in</Chip> : <Chip tone="warn">Password needed</Chip>
                    ) : (
                      <Chip tone="plain">No login</Chip>
                    )}
                  </>
                }
                onClick={can(db, user, 'accounts.manage') ? () => openSheet('person-edit', p.id) : undefined}
              />
            ))}
          </List>
        </div>
      ))}
    </>
  );
}

/* ---------- roles ---------- */

function Roles() {
  const db = useStore((s) => s.db);
  const user = useUser();
  const openSheet = useStore((s) => s.openSheet);
  const myRank = rankOf(db, user);

  return (
    <>
      <SectionHead
        title="The hierarchy"
        sub="Rank is what makes it a hierarchy rather than a list. You cannot edit, grant or delete a role that outranks you, and you cannot edit your own."
      />
      <List>
        {db.roles
          .slice()
          .sort((a, b) => b.rank - a.rank)
          .map((r) => {
            const held = db.profiles.filter((p) => p.active && p.role === r.id).length;
            const editable = can(db, user, 'roles.manage') && r.rank <= myRank && r.id !== user.role;
            return (
              <Row
                key={r.id}
                title={
                  <>
                    {r.name}
                    <span className="faint tnum" style={{ marginLeft: 8, fontSize: 12 }}>rank {r.rank}</span>
                  </>
                }
                sub={r.description}
                right={
                  <>
                    <Chip tone="plain">{plural(r.capabilities.length, 'capability', 'capabilities')}</Chip>
                    <Chip tone={held ? 'ok' : 'plain'}>{plural(held, 'person', 'people')}</Chip>
                    {r.works && <Chip tone="plain">Does the work</Chip>}
                    {!r.active && <Chip tone="warn">Retired</Chip>}
                  </>
                }
                onClick={editable ? () => openSheet('role-edit', r.id) : undefined}
                caret={editable}
              />
            );
          })}
      </List>
      {!can(db, user, 'roles.manage') && (
        <div style={{ marginTop: 12 }}>
          <Empty title="You can see the hierarchy but not change it">
            Editing roles needs the <strong>roles.manage</strong> capability. Ask an owner.
          </Empty>
        </div>
      )}
    </>
  );
}

/* ---------- the role editor ---------- */

const CAP_GROUPS: [string, Capability[]][] = [
  ['The day', ['day.view', 'day.tick', 'day.assign', 'library.edit']],
  ['The running sheet', ['sheet.view', 'sheet.edit', 'sheet.check', 'sheet.post']],
  ['Issues', ['issue.raise', 'issue.viewAll', 'issue.manage']],
  ['Kitchen & stock', ['inventory.view', 'inventory.edit', 'cooking.view', 'cooking.edit', 'cooking.approve']],
  ['Money & documents', ['money.view', 'money.viewOwner', 'documents.view', 'documents.viewOwner']],
  ['The house', ['property.view', 'property.edit', 'register.view', 'register.edit', 'occasions.view', 'occasions.edit', 'shrine.view', 'shrine.log']],
  ['People', ['people.view', 'people.manage']],
  ['Administration', ['settings.edit', 'roles.manage', 'accounts.manage', 'audit.view']],
];

export function RoleSheet({ id }: { id?: string }) {
  const db = useStore((s) => s.db);
  const user = useUser();
  const closeSheet = useStore((s) => s.closeSheet);
  const upsert = useStore((s) => s.upsert);
  const patch = useStore((s) => s.patch);
  const showToast = useStore((s) => s.showToast);
  const myRank = rankOf(db, user);

  const existing = id ? db.roles.find((r) => r.id === id) : undefined;
  const [f, setF] = React.useState<RoleDef>(
    existing ?? {
      id: '',
      name: '',
      rank: Math.max(10, Math.min(myRank - 10, 40)),
      description: '',
      capabilities: ['day.view', 'sheet.view', 'issue.raise'],
      works: true,
      active: true,
    },
  );
  const set = (k: keyof RoleDef, v: unknown) => setF((p) => ({ ...p, [k]: v }));

  const toggle = (c: Capability) =>
    setF((p) => ({
      ...p,
      capabilities: p.capabilities.includes(c)
        ? p.capabilities.filter((x) => x !== c)
        : [...p.capabilities, c],
    }));

  /* You cannot mint a role that outranks you, or hand out a capability
     you do not hold yourself. Both are the same rule: nobody promotes
     themselves sideways. */
  const myCaps = db.roles.find((r) => r.id === user.role)?.capabilities ?? [];
  const held = db.profiles.filter((p) => p.active && p.role === existing?.id).length;
  const tooHigh = f.rank > myRank;
  const problems: string[] = [];
  if (!f.name.trim()) problems.push('It needs a name.');
  if (tooHigh) problems.push(`Rank cannot be above your own, which is ${myRank}.`);
  const overreach = f.capabilities.filter((c) => !myCaps.includes(c));
  if (overreach.length) problems.push(`You do not hold ${overreach.map((c) => CAPABILITY_LABELS[c].toLowerCase()).join(', ')}, so you cannot grant ${overreach.length === 1 ? 'it' : 'them'}.`);

  const save = () => {
    const rec: RoleDef = {
      ...f,
      id: f.id || f.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
    };
    upsert('roles', rec, `Role “${rec.name}” saved`);
    closeSheet();
  };

  return (
    <Sheet
      title={existing ? `Edit ${existing.name}` : 'Create a role'}
      sub={
        existing?.system
          ? 'A seeded role. Its capabilities are yours to change; it cannot be deleted, because the starting data and the database policies both name it.'
          : 'Composed from the fixed capability list. Rank decides who may grant it.'
      }
      onClose={closeSheet}
      wide
      footer={
        <>
          <Btn className="grow" disabled={problems.length > 0} onClick={save}>
            {existing ? 'Save the role' : 'Create the role'}
          </Btn>
          {existing && !existing.system && (
            <Btn
              variant="danger"
              size="sm"
              onClick={() => {
                if (held > 0) {
                  showToast(`${plural(held, 'person', 'people')} still hold this role — move them first`);
                  return;
                }
                patch('roles', existing.id, { active: false }, 'Role retired');
                closeSheet();
              }}
            >
              Retire
            </Btn>
          )}
          <Btn variant="ghost" onClick={closeSheet}>Cancel</Btn>
        </>
      }
    >
      {problems.length > 0 && (
        <Card className="callout" style={{ marginBottom: 14 }}>
          <div className="eyebrow">Not saveable yet</div>
          <ul style={{ margin: '6px 0 0 16px', fontSize: 13.5, lineHeight: 1.5 }}>
            {problems.map((p) => <li key={p}>{p}</li>)}
          </ul>
        </Card>
      )}

      <div className="two">
        <Field label="Name"><Text value={f.name} onChange={(v) => set('name', v)} autoFocus placeholder="Night cover" /></Field>
        <Field label="Rank" hint={`Higher outranks lower. Yours is ${myRank}.`}>
          <Num value={f.rank} onChange={(v) => set('rank', v)} min={1} max={myRank} />
        </Field>
      </div>
      <Field label="What this role is for" hint="Written for whoever has to decide, six months from now, whether somebody belongs in it.">
        <Text value={f.description} onChange={(v) => set('description', v)} />
      </Field>
      <Check
        checked={!!f.works}
        onChange={(v) => set('works', v)}
        label="People in this role do the work — tasks route to them and they appear on the rota"
      />

      <SectionHead
        title="What they may do"
        sub={`${f.capabilities.length} of ${CAPABILITIES.length} capabilities. Anything unticked is refused by the database, not merely hidden.`}
      />
      {CAP_GROUPS.map(([group, caps]) => (
        <div key={group} style={{ marginBottom: 12 }}>
          <div className="eyebrow" style={{ marginBottom: 5 }}>{group}</div>
          <Card pad="sm">
            {caps.map((c) => (
              <div key={c} style={{ padding: '3px 0' }}>
                <Check
                  checked={f.capabilities.includes(c)}
                  onChange={() => toggle(c)}
                  label={
                    <>
                      {CAPABILITY_LABELS[c]}
                      <span className="faint" style={{ marginLeft: 7, fontSize: 11.5 }}>{c}</span>
                      {!myCaps.includes(c) && <Chip tone="warn">you do not hold this</Chip>}
                    </>
                  }
                />
              </div>
            ))}
          </Card>
        </div>
      ))}
    </Sheet>
  );
}

/* ---------- the person / login editor ---------- */

export function PersonSheet({ id }: { id?: string }) {
  const db = useStore((s) => s.db);
  const user = useUser();
  const closeSheet = useStore((s) => s.closeSheet);
  const upsert = useStore((s) => s.upsert);
  const setAccountPassword = useStore((s) => s.setAccountPassword);
  const showToast = useStore((s) => s.showToast);

  const existing = id ? db.profiles.find((p) => p.id === id) : undefined;
  const [f, setF] = React.useState<Profile>(
    existing ?? {
      id: '', name: '', role: 'staff', staffRoles: [], email: '', phone: '',
      initials: '', active: true, canSignIn: true,
    },
  );
  const [pw, setPw] = React.useState('');
  const [pw2, setPw2] = React.useState('');
  const set = (k: keyof Profile, v: unknown) => setF((p) => ({ ...p, [k]: v }));

  const roles = grantableRoles(db, user);
  const canSetThisRole = canGrant(db, user, f.role);

  const problems: string[] = [];
  if (!f.name.trim()) problems.push('It needs a name.');
  if (!canSetThisRole) problems.push(`You cannot grant ${roleLabel(db, f.role)} — it ranks at or above you.`);
  if (f.canSignIn && !f.email.trim()) problems.push('A login needs an email address. If they are never going to open the app, untick the login instead.');
  if (pw && pw.length < 10) problems.push('A password of fewer than ten characters is not worth setting.');
  if (pw && pw !== pw2) problems.push('The two passwords do not match.');

  const save = () => {
    const rec: Profile = {
      ...f,
      id: f.id || `p-${f.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
      initials: f.initials || f.name.trim().slice(0, 2).toUpperCase(),
    };
    upsert('profiles', rec, `${rec.name} saved`);
    if (pw) {
      void setAccountPassword(rec.id, pw).then((r) =>
        showToast(r.ok ? `Password set for ${rec.name}` : r.message),
      );
    }
    closeSheet();
  };

  return (
    <Sheet
      title={existing ? existing.name : 'Add a person'}
      sub={
        f.canSignIn
          ? 'You set the password. Nobody chooses their own, and there is no reset email to intercept — when someone leaves, deleting the login ends their access completely.'
          : 'Somebody who appears on the sheet and in the rota but never opens the app.'
      }
      onClose={closeSheet}
      wide
      footer={
        <>
          <Btn className="grow" disabled={problems.length > 0} onClick={save}>Save</Btn>
          {existing && existing.id !== user.id && (
            <Btn
              variant="danger"
              size="sm"
              onClick={() => {
                upsert('profiles', { ...existing, active: false, canSignIn: false }, `${existing.name} deactivated`);
                closeSheet();
              }}
            >
              Deactivate
            </Btn>
          )}
          <Btn variant="ghost" onClick={closeSheet}>Cancel</Btn>
        </>
      }
    >
      {problems.length > 0 && (
        <Card className="callout" style={{ marginBottom: 14 }}>
          <div className="eyebrow">Not saveable yet</div>
          <ul style={{ margin: '6px 0 0 16px', fontSize: 13.5, lineHeight: 1.5 }}>
            {problems.map((p) => <li key={p}>{p}</li>)}
          </ul>
        </Card>
      )}

      <div className="two">
        <Field label="Name"><Text value={f.name} onChange={(v) => set('name', v)} autoFocus /></Field>
        <Field label="Role" hint="Only roles below your own are offered.">
          <Select
            value={f.role}
            onChange={(v) => set('role', v)}
            options={roles.map((r) => ({ value: r.id, label: `${r.name} · rank ${r.rank}` }))}
          />
        </Field>
      </div>
      <div className="two">
        <Field label="Email" hint="The login. Also where anything they are sent goes.">
          <Text type="email" value={f.email} onChange={(v) => set('email', v)} />
        </Field>
        <Field label="Phone"><Text value={f.phone} onChange={(v) => set('phone', v)} /></Field>
      </div>

      <Check
        checked={!!f.canSignIn}
        onChange={(v) => set('canSignIn', v)}
        label="This person has a login"
      />

      {f.canSignIn && (
        <>
          <SectionHead
            title={existing?.authId ? 'Change the password' : 'Set the first password'}
            sub="Ten characters or more. Read it to them once and let them change nothing — there is no self-service reset by design."
          />
          <div className="two">
            <Field label="Password"><Text type="password" value={pw} onChange={setPw} autoComplete="new-password" /></Field>
            <Field label="And again"><Text type="password" value={pw2} onChange={setPw2} autoComplete="new-password" /></Field>
          </div>
        </>
      )}

      <SectionHead title="What they do" sub="Drives which generated tasks route to them. Leave empty for anyone who is not staff." />
      <Card pad="sm">
        {STAFF_ROLES.filter((r) => r !== 'any').map((r) => (
          <div key={r} style={{ padding: '3px 0' }}>
            <Check
              checked={f.staffRoles.includes(r)}
              onChange={() =>
                set(
                  'staffRoles',
                  f.staffRoles.includes(r)
                    ? f.staffRoles.filter((x) => x !== r)
                    : [...f.staffRoles, r as StaffRole],
                )
              }
              label={r}
            />
          </div>
        ))}
      </Card>
    </Sheet>
  );
}
