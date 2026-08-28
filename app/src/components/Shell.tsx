import React from 'react';
import { useStore, useUser } from '@/store';
import { navigate, useRoute } from '@/lib/router';
import { allAlerts, awaitingApproval, belowMin, openIssues, uncollected, unreadFor } from '@/lib/selectors';
import { can, roleLabel } from '@/lib/access';
import { signOut } from '@/lib/auth';
import { backendConfigured } from '@/lib/supabase';
import { Avatar, cx, IconBtn, Seg } from './ui';
import type { Capability } from '@/types';

interface NavItem {
  key: string;
  label: string;
  icon: string;
  /** The one capability that opens this screen. */
  cap: Capability;
  group: string;
}

/* One list, filtered by capability rather than by role name. A role the
   house invents next month gets exactly the screens its capabilities
   allow, with nothing to remember to add here — and the database
   refuses the data as well, which is the part that actually matters. */
const NAV: NavItem[] = [
  { key: 'today', label: 'Today', icon: '◇', cap: 'day.view', group: 'Day' },
  { key: 'planner', label: 'Daily Planner', icon: '▤', cap: 'day.tick', group: 'Day' },
  { key: 'checklist', label: 'Checklist', icon: '✓', cap: 'day.tick', group: 'Day' },
  { key: 'calendar', label: 'Calendar', icon: '▦', cap: 'day.view', group: 'Day' },

  { key: 'issues', label: 'Issues & Requests', icon: '⚠', cap: 'issue.raise', group: 'Operations' },
  { key: 'inventory', label: 'Inventory', icon: '▣', cap: 'inventory.view', group: 'Operations' },
  { key: 'cooking', label: 'Cooking', icon: '◔', cap: 'cooking.view', group: 'Operations' },
  { key: 'laundry', label: 'Laundry', icon: '◎', cap: 'day.tick', group: 'Operations' },
  { key: 'occasions', label: 'Guests & Events', icon: '✦', cap: 'occasions.view', group: 'Operations' },

  { key: 'register', label: 'Register', icon: '▥', cap: 'register.view', group: 'Property' },
  { key: 'documents', label: 'Documents', icon: '▤', cap: 'documents.view', group: 'Property' },
  { key: 'people', label: 'People & Access', icon: '◫', cap: 'register.view', group: 'Property' },

  { key: 'money', label: 'Money', icon: '◈', cap: 'money.view', group: 'Admin' },
  { key: 'staff', label: 'Staff', icon: '◉', cap: 'people.view', group: 'Admin' },
  { key: 'reports', label: 'Reports', icon: '◰', cap: 'audit.view', group: 'Admin' },
  { key: 'alerts', label: 'Alerts', icon: '◉', cap: 'issue.manage', group: 'Admin' },
  { key: 'manual', label: 'House Manual', icon: '▨', cap: 'day.view', group: 'Admin' },
  { key: 'roles', label: 'Roles & Logins', icon: '⚿', cap: 'roles.manage', group: 'Admin' },
  { key: 'admin', label: 'Settings', icon: '⚙', cap: 'settings.edit', group: 'Admin' },
];

const GROUPS = ['Day', 'Operations', 'Property', 'Admin'];

export function Shell({ children }: { children: React.ReactNode }) {
  const user = useUser();
  const route = useRoute();
  const db = useStore((s) => s.db);
  const toast = useStore((s) => s.toast);

  const seesAllIssues = can(db, user, 'issue.viewAll');
  const sees = { money: can(db, user, 'money.view'), ownerOnly: can(db, user, 'money.viewOwner') };

  const items = NAV.filter((n) => can(db, user, n.cap));

  const badges: Record<string, { n: number; tone?: string }> = {
    issues: { n: openIssues(db).filter((i) => (seesAllIssues ? true : i.reportedBy === user.id)).length },
    inventory: { n: belowMin(db).length, tone: 'amber' },
    cooking: { n: can(db, user, 'cooking.approve') ? awaitingApproval(db).length : 0, tone: 'amber' },
    alerts: { n: allAlerts(db, sees).filter((a) => a.priority === 'urgent').length },
    people: { n: uncollected(db).length, tone: 'quiet' },
  };

  const unread = unreadFor(db, user.id).length;

  const tabs = mobileTabs(items);

  return (
    <div className="shell">
      <aside className="nav">
        <div className="brandmark">
          <div className="eyebrow">Private residence</div>
          <div className="n">{db.settings.house}</div>
        </div>

        {GROUPS.map((g) => {
          const inGroup = items.filter((n) => n.group === g);
          if (!inGroup.length) return null;
          return (
            <React.Fragment key={g}>
              <div className="navgroup">{g}</div>
              {inGroup.map((n) => {
                const b = badges[n.key];
                return (
                  <button
                    key={n.key}
                    type="button"
                    className={cx('navbtn', route.module === n.key && 'on')}
                    onClick={() => navigate(n.key)}
                  >
                    <span className="ic">{n.icon}</span>
                    <span className="grow">{n.label}</span>
                    {b && b.n > 0 && <span className={cx('badge', b.tone)}>{b.n}</span>}
                  </button>
                );
              })}
            </React.Fragment>
          );
        })}

        <div style={{ marginTop: 'auto', paddingTop: 16 }}>
          <hr className="hair" style={{ margin: '0 10px 12px' }} />
          <SyncRow />
          <button
            type="button"
            className={cx('navbtn', route.module === 'notifications' && 'on')}
            onClick={() => navigate('notifications')}
          >
            <span className="ic">◔</span>
            <span className="grow">Notifications</span>
            {unread > 0 && <span className="badge">{unread}</span>}
          </button>
          <RoleSwitcher />
        </div>
      </aside>

      <main className="main anim" key={route.module}>
        {children}
      </main>

      <nav className="tabbar">
        {tabs.map((t) => {
          const b = badges[t.key];
          return (
            <button
              key={t.key}
              type="button"
              className={cx('tabbtn', route.module === t.key && 'on')}
              onClick={() => navigate(t.key)}
            >
              {b && b.n > 0 && <span className="dot" />}
              <span className="ic">{t.icon}</span>
              {t.label}
            </button>
          );
        })}
      </nav>

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

/**
 * Five tabs at the bottom of a phone. Taken in preference order from
 * whatever this person can actually open, so nobody gets a tab that
 * lands them on a refusal.
 */
function mobileTabs(available: NavItem[]): NavItem[] {
  const order = ['today', 'planner', 'checklist', 'issues', 'inventory', 'cooking', 'money', 'alerts', 'calendar'];
  const have = new Set(available.map((n) => n.key));
  return order.filter((k) => have.has(k)).slice(0, 5).map((k) => NAV.find((n) => n.key === k)!);
}

function SyncRow() {
  const [state] = React.useState<'ok' | 'offline'>(navigator.onLine ? 'ok' : 'offline');
  return (
    <div className="navbtn" style={{ cursor: 'default', gap: 10 }}>
      <span className={cx('syncdot', state !== 'ok' && state)} />
      <span style={{ fontSize: 12.5 }}>
        {state === 'ok' ? 'All changes saved' : 'Offline — changes queued'}
      </span>
    </div>
  );
}

/* Two different things wearing the same button.

   With a backend connected this is the signed-in account, and tapping
   it signs out — a deliberate act, because a device stays signed in
   otherwise and Rosie's iPad is not somewhere anyone should have to
   re-enter a password every morning.

   Without one it is a role switcher, so every screen can be inspected
   as every kind of person without five accounts existing yet. */
export function RoleSwitcher() {
  const db = useStore((s) => s.db);
  const userId = useStore((s) => s.userId);
  const setUser = useStore((s) => s.setUser);
  const user = useUser();
  const [open, setOpen] = React.useState(false);

  const byRole: Record<string, typeof db.profiles> = {};
  db.profiles
    .filter((p) => p.active)
    .forEach((p) => {
      (byRole[p.role] ??= []).push(p);
    });

  return (
    <>
      <button
        type="button"
        className="navbtn"
        onClick={() => {
          if (backendConfigured) {
            // Warned about, not silent: signing out on a device with
            // queued work would strand it.
            if (window.confirm(`Sign out of ${db.settings.house} on this device?`)) void signOut();
          } else {
            setOpen(true);
          }
        }}
        style={{ gap: 10 }}
      >
        <Avatar name={user.name} initials={user.initials} size="sm" />
        <span className="grow">
          <span style={{ display: 'block', fontSize: 13.5, fontWeight: 600, color: 'var(--ink)' }}>
            {user.name}
          </span>
          <span style={{ display: 'block', fontSize: 11.5 }}>{roleLabel(db, user.role)}</span>
        </span>
        <span className="faint" style={{ fontSize: 11 }}>
          {backendConfigured ? 'sign out' : 'switch'}
        </span>
      </button>

      {open && (
        <div
          className="sheetwrap"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <div className="sheet" role="dialog" aria-modal="true">
            <header>
              <div className="grow">
                <h2>View as</h2>
                <div className="sub">
                  No backend is connected, so this stands in for signing in. Each of these is a real account
                  with a password once the project is live, and this switcher disappears.
                </div>
              </div>
              <IconBtn label="Close" onClick={() => setOpen(false)}>
                ✕
              </IconBtn>
            </header>
            <div className="body">
              {db.roles.filter((r0) => r0.active).sort((a, b) => b.rank - a.rank).map(({ id: r }) => (
                <div key={r} style={{ marginBottom: 18 }}>
                  <div className="eyebrow" style={{ marginBottom: 7 }}>
                    {roleLabel(db, r)}
                    
                  </div>
                  <div className="list flat">
                    {(byRole[r] ?? []).map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        className="item"
                        onClick={() => {
                          setUser(p.id);
                          setOpen(false);
                          navigate('today');
                        }}
                      >
                        <Avatar name={p.name} initials={p.initials} />
                        <span className="grow">
                          <span className="t" style={{ display: 'block' }}>
                            {p.name}
                          </span>
                          <span className="s" style={{ display: 'block' }}>
                            {p.staffRoles.length ? p.staffRoles.join(', ') : p.email || '—'}
                          </span>
                        </span>
                        {p.id === userId && <span className="chip ok">Current</span>}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/* Zone filter, used by most operational screens. */
export function ZoneFilterBar() {
  const zoneFilter = useStore((s) => s.zoneFilter);
  const setZoneFilter = useStore((s) => s.setZoneFilter);
  return (
    <Seg
      value={zoneFilter}
      onChange={setZoneFilter}
      options={[
        { value: 'all', label: 'Everything' },
        { value: 'household', label: 'Household' },
      ]}
    />
  );
}
