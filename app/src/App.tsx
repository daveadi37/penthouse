import React from 'react';
import { useStore, useUser } from '@/store';
import { can } from '@/lib/access';
import { currentSession, onAuthChange, signOut, type Session } from '@/lib/auth';
import { ensureLoaded } from '@/lib/sync/engine';
import { backendConfigured } from '@/lib/supabase';
import { SignIn } from '@/modules/SignIn';
import type { Capability } from '@/types';
import { useRoute } from '@/lib/router';
import { Shell } from '@/components/Shell';
import { Today } from '@/modules/Today';
import { Planner, PlanTaskSheet, ApptSheet, ApptNewSheet } from '@/modules/Planner';
import { Checklist, AdhocSheet } from '@/modules/Checklist';
import { Calendar } from '@/modules/Calendar';
import {
  Issues,
  IssueNewSheet,
  IssuePhotoSheet,
  IncidentSheet,
  IncidentNewSheet,
} from '@/modules/Issues';
import { Inventory, InvSheet, ShopNewSheet } from '@/modules/Inventory';
import { Cooking, Laundry, MealSheet, WasteSheet } from '@/modules/Cooking';
import {
  Register,
  AssetSheet,
  VehicleSheet,
  VehicleLogSheet,
  ContractSheet,
  PlantSheet,
} from '@/modules/Register';
import {
  People,
  VisitorNewSheet,
  VisitorSheet,
  DeliveryNewSheet,
  ContractorNewSheet,
  CredSheet,
  ContactSheet,
  VendorSheet,
} from '@/modules/People';
import { Money, TxSheet, RecSheet, PettySheet } from '@/modules/Money';
import { Staff, AbsenceSheet, StaffEditSheet, AttendanceSheet } from '@/modules/Staff';
import { Documents, DocSheet } from '@/modules/Documents';
import {
  Occasions,
  GuestSheet,
  EventSheet,
  OccasionTaskSheet,
} from '@/modules/Occasions';
import { Admin, Alerts, AreaSheet, ExportSheet, LibSheet, Manual, Notifications, Reports } from '@/modules/Misc';
import { Chat } from '@/modules/Chat';
import { PersonSheet, RolesAndLogins, RoleSheet } from '@/modules/Access';
import { Empty } from '@/components/ui';

export default function App() {
  const ready = useStore((s) => s.ready);
  const init = useStore((s) => s.init);
  const db = useStore((s) => s.db);
  const bootError = useStore((s) => s.bootError);

  /* Who is signed in, and therefore whether anything below renders at
     all. With no backend configured there is nothing to authenticate
     against, so the sign-in screen offers the seeded house instead —
     see src/modules/SignIn.tsx. */
  const [session, setSession] = React.useState<Session | null>(null);
  const [checkedSession, setCheckedSession] = React.useState(!backendConfigured);
  const [demo, setDemo] = React.useState(false);
  const setUser = useStore((s) => s.setUser);

  /* Wait for somebody to read the house as.

     Every read policy is `to authenticated`, so tier 1 run before
     sign-in returns no rows and no error — nothing at all to say why.
     Booting at mount therefore read the house as nobody, found zero
     profiles and set bootError; the sign-in that followed could not
     clear it, because the bootError check below fires before anything
     else renders. The first thing every new user saw was "The house
     records are empty", and only a reload got past it.

     init() is safe to run again — attachMirror assigns, startSync and
     startRealtime both return early if they are already going. With no
     backend there is nobody to wait for, so it runs at once. */
  React.useEffect(() => {
    if (backendConfigured && !session) return;
    void init();
  }, [init, session?.authId]);

  React.useEffect(() => {
    if (!backendConfigured) return;
    void currentSession()
      .then((s) => setSession(s))
      /* A rejected getSession — a corrupted token, or Safari in private
         mode throwing on localStorage — used to leave checkedSession
         false for ever, and the app sat on "Checking your session…"
         with no timeout and no way out. Treat it as nobody signed in;
         the sign-in screen is a far better dead end than a spinner. */
      .catch(() => setSession(null))
      .finally(() => setCheckedSession(true));
    return onAuthChange((s) => setSession(s));
  }, []);

  /* Match the signed-in account to a profile, by auth_user_id and
     nothing else.

     There was an email fallback here and it had to go. A device
     holding a stale cached seed has shrien@3808.local sitting in
     db.profiles; anyone who signs up with that address matches it and
     is handed the owner's view of the house before a single row is
     read. auth_user_id is written by the Edge Function, which checks a
     capability first, and it is the only claim worth trusting. */
  React.useEffect(() => {
    if (!session || !backendConfigured) return;
    const p = db.profiles.find((x) => x.authId && x.authId === session.authId);
    if (p) setUser(p.id);
  }, [session, db.profiles, setUser]);

  if (!checkedSession) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="center">
          <div className="muted">Checking your session&hellip;</div>
        </div>
      </div>
    );
  }

  if (!session && !demo) {
    /* Looking around the seeded house needs somebody to look around it as.
       Nobody is signed in, and useUser() now fails closed to an inactive
       profile with no capabilities — which is right when a stranger reaches
       a real database, and wrong here, where it would refuse every screen.
       Start as the owner; the account switcher in the sidebar changes it. */
    return (
      <SignIn
        onDemo={() => {
          setUser('p-aditya');
          setDemo(true);
        }}
      />
    );
  }

  if (!ready) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="center">
          <div className="serif" style={{ fontSize: 26 }}>{db.settings.house || 'Apartment 3808'}</div>
          <div className="muted" style={{ marginTop: 6 }}>
            {backendConfigured ? 'Opening the house records…' : 'Building today’s work…'}
          </div>
        </div>
      </div>
    );
  }

  /* A session with nobody behind it. The account is real and the house
     does not know it, which is exactly the case that must not be
     allowed to guess — so nothing below this line mounts.

     Checked before bootError, and that order matters. profiles_read now
     requires a profile of your own, so a stranger reads zero rows —
     which is indistinguishable, from here, from a database with nothing
     in it. Both used to land on "The house records are empty", which
     tells the one person it is actually about the wrong thing. If there
     is a session and no profile behind it, that is the answer. */
  if (session && !db.profiles.some((p) => p.authId && p.authId === session.authId)) {
    return <NoProfile email={session.email} />;
  }

  if (bootError) return <BootTrouble detail={bootError} />;

  return (
    <Shell>
      <Page />
      <SheetHost />
    </Shell>
  );
}

/* ============================================================
   The two screens that are not the house.

   Both of them deliberately offer nothing to press. A browser that
   can link itself to a profile is a browser that can claim the
   owner, and an app that falls back to the seeded house when the
   database is unreachable is an app somebody spends a morning
   entering real stock into for nothing.
   ============================================================ */

function NoProfile({ email }: { email: string }) {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div className="center" style={{ maxWidth: 420 }}>
        <div className="serif" style={{ fontSize: 24 }}>Not linked yet</div>
        <div className="muted" style={{ marginTop: 10, lineHeight: 1.6 }}>
          Your account is not linked to anyone in this house yet. Ask Aditya.
        </div>
        <div className="muted" style={{ marginTop: 14, fontSize: 12.5 }}>
          Signed in as {email || 'an account with no email address'}.
        </div>
        <button type="button" className="btn ghost" style={{ marginTop: 18 }} onClick={() => void signOut()}>
          Sign out
        </button>
      </div>
    </div>
  );
}

function BootTrouble({ detail }: { detail: string }) {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div className="center" style={{ maxWidth: 460 }}>
        <div className="serif" style={{ fontSize: 24 }}>The house records are empty</div>
        <div className="muted" style={{ marginTop: 10, lineHeight: 1.6, textAlign: 'left' }}>
          Nothing came back from the database. There are two things to check, and it is almost
          always the first:
          <ol style={{ margin: '12px 0 0', paddingLeft: 20 }}>
            <li style={{ marginBottom: 6 }}>The migrations were never run against this project.</li>
            <li>They were, and row-level security refused everything — the signed-in account holds no role.</li>
          </ol>
        </div>
        {detail !== 'no-profiles' && (
          <div className="muted" style={{ marginTop: 14, fontSize: 12.5, textAlign: 'left' }}>
            {detail}
          </div>
        )}
        <button type="button" className="btn ghost" style={{ marginTop: 18 }} onClick={() => window.location.reload()}>
          Try again
        </button>
      </div>
    </div>
  );
}

function Page() {
  const route = useRoute();
  const user = useUser();

  const db = useStore((s) => s.db);

  /* Tier 3, and the only place it is asked for.
     One effect covers all eighteen screens: the registry says which
     slices a module needs, the engine fetches each one once and keeps
     it, and a module that needs nothing beyond tiers 1 and 2 — which
     is most of them — costs a lookup and no request at all. */
  React.useEffect(() => {
    void ensureLoaded(route.module);
  }, [route.module]);

  /* Capability gate. In production the same capability is also a
     row-level security policy, so a hidden screen is not the security
     model — it is only the courtesy of not offering a locked door. */
  const denied = (
    <Empty title="Not available to you">
      This screen needs a capability your role does not have. Use the account switcher at the bottom of the
      sidebar to see it as someone who does, or change the role under Roles &amp; Logins.
    </Empty>
  );
  const only = (cap: Capability, node: React.ReactNode) => (can(db, user, cap) ? node : denied);

  switch (route.module) {
    case 'today':
      return only('day.view', <Today />);
    case 'chat':
      return only('chat.view', <Chat />);
    case 'planner':
      return only('day.tick', <Planner />);
    case 'checklist':
      return only('day.tick', <Checklist />);
    case 'calendar':
      return only('day.view', <Calendar />);
    case 'issues':
      return only('issue.raise', <Issues />);
    case 'inventory':
      return only('inventory.view', <Inventory />);
    case 'cooking':
      return only('cooking.view', <Cooking />);
    case 'laundry':
      return only('day.tick', <Laundry />);
    case 'occasions':
      return only('occasions.view', <Occasions />);
    case 'register':
      return only('register.view', <Register />);
    case 'documents':
      return only('documents.view', <Documents />);
    case 'people':
      return only('register.view', <People />);
    case 'money':
      return only('money.view', <Money />);
    case 'staff':
      return only('people.view', <Staff />);
    case 'reports':
      return only('audit.view', <Reports />);
    case 'alerts':
      return only('issue.manage', <Alerts />);
    case 'manual':
      return only('day.view', <Manual />);
    /* Deliberately ungated: this is the person's own inbox, and gating it
       would lock out anyone whose only capability is issue.raise. */
    case 'notifications':
      return <Notifications />;
    case 'roles':
      return only('roles.manage', <RolesAndLogins />);
    case 'admin':
      return only('settings.edit', <Admin />);
    default:
      return <Today />;
  }
}

/* Every sheet in the app is mounted from one place, keyed by a
   string in the store. Deep links and back-navigation stay simple. */
function SheetHost() {
  const sheet = useStore((s) => s.sheet);
  if (!sheet) return null;
  const { kind, id } = sheet;

  switch (kind) {
    /* day and planner */
    case 'plan-task':
      return <PlanTaskSheet taskId={id!} />;
    case 'appt':
      return <ApptSheet id={id!} />;
    case 'appt-new':
      return <ApptNewSheet />;
    case 'task-adhoc':
      return <AdhocSheet />;

    /* issues */
    case 'issue-new':
      return <IssueNewSheet />;
    case 'issue-photo':
      return <IssuePhotoSheet id={id!} />;
    case 'incident':
      return <IncidentSheet id={id!} />;
    case 'incident-new':
      return <IncidentNewSheet />;

    /* supplies */
    case 'inv':
    case 'inv-edit':
      return <InvSheet id={id!} />;
    case 'inv-new':
      return <InvSheet id={undefined as unknown as string} />;
    case 'shop-new':
      return <ShopNewSheet />;

    /* kitchen */
    case 'meal-new':
      return <MealSheet />;
    case 'meal-edit':
      return <MealSheet id={id} />;
    case 'waste-new':
      return <WasteSheet />;

    /* register */
    case 'asset-new':
      return <AssetSheet />;
    case 'asset-edit':
      return <AssetSheet id={id} />;
    case 'vehicle-new':
      return <VehicleSheet />;
    case 'vehicle-edit':
      return <VehicleSheet id={id} />;
    case 'vehicle-log':
      return <VehicleLogSheet id={id!} />;
    case 'contract-new':
      return <ContractSheet />;
    case 'contract-edit':
      return <ContractSheet id={id} />;
    case 'plant-new':
      return <PlantSheet />;
    case 'plant-edit':
      return <PlantSheet id={id} />;

    /* people and access */
    case 'visitor-new':
      return <VisitorNewSheet />;
    case 'visitor':
      return <VisitorSheet id={id!} />;
    case 'delivery-new':
      return <DeliveryNewSheet />;
    case 'contractor-new':
      return <ContractorNewSheet />;
    case 'cred-new':
      return <CredSheet />;
    case 'cred':
      return <CredSheet id={id} />;
    case 'contact-new':
      return <ContactSheet />;
    case 'contact':
      return <ContactSheet id={id} />;
    case 'vendor-new':
      return <VendorSheet />;
    case 'vendor':
      return <VendorSheet id={id} />;

    /* money */
    case 'tx-new':
      return <TxSheet />;
    case 'tx-edit':
      return <TxSheet id={id} />;
    case 'rec-new':
      return <RecSheet />;
    case 'rec-edit':
      return <RecSheet id={id} />;
    case 'petty-new':
      return <PettySheet />;

    /* staff */
    case 'absence-new':
      return <AbsenceSheet />;
    case 'absence-edit':
      return <AbsenceSheet id={id} />;
    case 'staff-edit':
      return <StaffEditSheet id={id!} />;
    case 'attendance-new':
      return <AttendanceSheet />;

    /* documents */
    case 'doc-new':
      return <DocSheet />;
    case 'doc-edit':
      return <DocSheet id={id} />;

    /* occasions */
    case 'guest-new':
      return <GuestSheet />;
    case 'guest-edit':
      return <GuestSheet id={id} />;
    case 'event-new':
      return <EventSheet />;
    case 'event-edit':
      return <EventSheet id={id} />;
    case 'otask-new':
      return <OccasionTaskSheet ref_={id!} />;

    /* settings */
    case 'role-new':
      return <RoleSheet />;
    case 'role-edit':
      return <RoleSheet id={id} />;
    case 'person-new':
      return <PersonSheet />;
    case 'person-edit':
      return <PersonSheet id={id} />;
    case 'lib-new':
      return <LibSheet />;
    case 'lib-edit':
      return <LibSheet id={id} />;
    case 'area-new':
      return <AreaSheet />;
    case 'area-edit':
      return <AreaSheet id={id} />;
    case 'export':
      return <ExportSheet />;

    default:
      return null;
  }
}
