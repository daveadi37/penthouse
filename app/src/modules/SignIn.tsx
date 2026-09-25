import React from 'react';
import { useStore } from '@/store';
import { signIn } from '@/lib/auth';
import { backendConfigured, describeBackend } from '@/lib/supabase';
import { Avatar, Btn, Card, Field, Text } from '@/components/ui';

/* ============================================================
   The way in.

   Email and password, because Aditya creates every account and sets
   every password. There is no "forgot password" link and that is not an
   omission — nobody chooses their own, so there is nothing to forget
   back to. When somebody leaves, the login is deleted and their access
   ends completely, with no reset email sitting in an old inbox.

   With no backend configured this screen says so plainly and offers the
   seeded house instead, rather than pretending to authenticate. The
   whole app can be walked through before a Supabase project exists,
   which is the point of building it that way round.
   ============================================================ */

export function SignIn({ onDemo }: { onDemo: () => void }) {
  const db = useStore((s) => s.db);
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [problem, setProblem] = React.useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setProblem('');
    const res = await signIn(email, password);
    setBusy(false);
    if (!res.ok) setProblem(res.message);
    // On success the auth listener in App.tsx takes over.
  };

  return (
    <div className="signin">
      <Card style={{ maxWidth: 420, width: '100%' }}>
        <div className="center" style={{ marginBottom: 22 }}>
          <Avatar name={db.settings.house} initials="38" size="lg" />
          <div className="serif" style={{ fontSize: 25, marginTop: 12 }}>{db.settings.house}</div>
          <div className="muted" style={{ fontSize: 13.5, marginTop: 4 }}>{db.settings.address}</div>
        </div>

        {backendConfigured ? (
          <form onSubmit={submit}>
            <Field label="Email">
              <Text
                type="email"
                value={email}
                onChange={setEmail}
                autoComplete="username"
                autoFocus
                placeholder="you@example.com"
              />
            </Field>
            <Field label="Password">
              <Text type="password" value={password} onChange={setPassword} autoComplete="current-password" />
            </Field>

            {problem && (
              <div className="callout crit" style={{ padding: '11px 14px', margin: '4px 0 12px', borderRadius: 8 }}>
                <div style={{ fontSize: 13.5, lineHeight: 1.45 }}>{problem}</div>
              </div>
            )}

            <Btn type="submit" block disabled={busy || !email || !password}>
              {busy ? 'Signing in…' : 'Sign in'}
            </Btn>

            <div className="muted center" style={{ fontSize: 12.5, marginTop: 14, lineHeight: 1.5 }}>
              There is no password reset. Aditya sets every password — ask him and he will set a new one.
            </div>

            {/*
              A way past the door, in development only. Between wiring the
              keys up and running the migrations there is a window where a
              backend is configured but has no tables and no accounts in
              it — and without this, that window locks you out of your own
              app on your own machine.

              import.meta.env.DEV is compiled to a literal false in a
              production build, so this block is removed entirely by the
              bundler. It cannot appear on the iPad.
            */}
            {import.meta.env.DEV && (
              <div style={{ marginTop: 18, paddingTop: 14, borderTop: '1px solid var(--line)' }}>
                <Btn variant="ghost" block onClick={onDemo}>
                  Look at the seeded house instead
                </Btn>
                <div className="faint center" style={{ fontSize: 11.5, marginTop: 8, lineHeight: 1.45 }}>
                  Development builds only. Never present in a deployed bundle.
                </div>
              </div>
            )}
          </form>
        ) : (
          <>
            {/*
              The seeded house is a development convenience and nothing
              else. It is a real household — real names, the real
              address, who works here — and the button below signs you
              in as the owner without a password.

              On a deployed site with the keys not yet set, that is the
              whole app handed to anybody who finds the URL, in exactly
              the window between creating the Vercel project and pasting
              the two variables in. The DEV guard further up this file
              protects the branch beside this one and gave every
              impression this branch was covered too. It was not.
            */}
            {import.meta.env.DEV ? (
              <>
                <div className="callout" style={{ padding: '13px 16px', borderRadius: 8, marginBottom: 14 }}>
                  <div className="eyebrow">No backend connected</div>
                  <div className="muted" style={{ fontSize: 13.5, marginTop: 5, lineHeight: 1.5 }}>
                    This build has no Supabase project behind it, so there is nothing to sign in to.
                    Everything below runs on the seeded house, on this device only — nothing leaves it and
                    nothing is shared.
                  </div>
                </div>
                <Btn block onClick={onDemo}>Open the seeded house</Btn>
                <div className="muted center" style={{ fontSize: 12.5, marginTop: 14, lineHeight: 1.5 }}>
                  To connect it: <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> in{' '}
                  <code>app/.env</code>, then build again. See <code>SETUP.md</code>.
                </div>
              </>
            ) : (
              <>
                <div className="callout" style={{ padding: '13px 16px', borderRadius: 8, marginBottom: 14 }}>
                  <div className="eyebrow">Not set up yet</div>
                  <div className="muted" style={{ fontSize: 13.5, marginTop: 5, lineHeight: 1.5 }}>
                    This site has no database behind it, so there is nothing to sign in to and nothing to
                    show.
                  </div>
                </div>
                <div className="muted center" style={{ fontSize: 12.5, marginTop: 14, lineHeight: 1.5 }}>
                  Whoever set this up needs to add <code>VITE_SUPABASE_URL</code> and{' '}
                  <code>VITE_SUPABASE_ANON_KEY</code> to the hosting project and deploy it again — the
                  values are read when the site is built, not when it is opened. Step 6 of{' '}
                  <code>SETUP.md</code>.
                </div>
              </>
            )}
          </>
        )}

        <div className="faint center" style={{ fontSize: 11.5, marginTop: 18 }}>
          {describeBackend()}
        </div>
      </Card>
    </div>
  );
}
