import React from 'react';
import { useStore, useUser } from '@/store';
import { can } from '@/lib/access';
import { currentSession, onAuthChange, type Session } from '@/lib/auth';
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
import { PersonSheet, RolesAndLogins, RoleSheet } from '@/modules/Access';
import { Empty } from '@/components/ui';

export default function App() {
  const ready = useStore((s) => s.ready);
  const init = useStore((s) => s.init);
  const db = useStore((s) => s.db);

  /* Who is signed in, and therefore whether anything below renders at
     all. With no backend configured there is nothing to authenticate
     against, so the sign-in screen offers the seeded house instead —
     see src/modules/SignIn.tsx. */
  const [session, setSession] = React.useState<Session | null>(null);
  const [checkedSession, setCheckedSession] = React.useState(!backendConfigured);
  const [demo, setDemo] = React.useState(false);
  const setUser = useStore((s) => s.setUser);

  React.useEffect(() => {
    void init();
  }, [init]);

  React.useEffect(() => {
    if (!backendConfigured) return;
    void currentSession().then((s) => {
      setSession(s);
      setCheckedSession(true);
    });
    return onAuthChange((s) => setSession(s));
  }, []);

  /* Match the signed-in account to a profile. The email is the join,
     because auth_user_id is written by the Edge Function and this build
     may be reading a database it did not create. */
  React.useEffect(() => {
    if (!session) return;
    const p = db.profiles.find(
      (x) => x.authId === session.authId || x.email.toLowerCase() === session.email.toLowerCase(),
    );
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
    return <SignIn onDemo={() => setDemo(true)} />;
  }

  if (!ready) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="center">
          <div className="serif" style={{ fontSize: 26 }}>{db.settings.house}</div>
          <div className="muted" style={{ marginTop: 6 }}>Building today&rsquo;s work&hellip;</div>
        </div>
      </div>
    );
  }

  return (
    <Shell>
      <Page />
      <SheetHost />
    </Shell>
  );
}

function Page() {
  const route = useRoute();
  const user = useUser();

  const db = useStore((s) => s.db);

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
      return <Today />;
    case 'planner':
      return only('day.tick', <Planner />);
    case 'checklist':
      return only('day.tick', <Checklist />);
    case 'calendar':
      return only('day.view', <Calendar />);
    case 'issues':
      return <Issues />;
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
    case 'notifications':
      return <Notifications />;
    case 'roles':
      return only('roles.manage', <RolesAndLogins />);
    case 'admin':
      return only('settings.edit', <Admin />);
    case 'more':
      return <Today />;
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
