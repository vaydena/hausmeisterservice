import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { LoginMfaVerifyForm } from './verify-form';

export const metadata: Metadata = { title: 'Zwei-Faktor-Authentifizierung' };

export default async function LoginMfaPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next: nextParam } = await searchParams;
  const next = nextParam && nextParam.startsWith('/') ? nextParam : '/dashboard';

  const supabase = await createSupabaseServerClient();

  // Ohne aktive Session (kein aal1) darf niemand hierher — der User muss
  // sich zuerst per Passwort anmelden.
  const { data: userData } = await supabase.auth.getUser();
  if (!userData?.user) redirect(`/login?next=${encodeURIComponent(next)}`);

  // Wenn der User bereits aal2 hat (frisch durch verify gekommen) oder
  // gar keine MFA-Faktoren registriert sind, darf er weiter — der
  // MFA-Prompt hier ist dann obsolet.
  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aal?.currentLevel === 'aal2' || aal?.nextLevel !== 'aal2') {
    redirect(next);
  }

  const { data: factorsData } = await supabase.auth.mfa.listFactors();
  const factors = (factorsData?.totp ?? [])
    .filter((f) => f.status === 'verified')
    .map((f) => ({ id: f.id, friendlyName: f.friendly_name ?? null }));

  // Sollte nie passieren (nextLevel=aal2 impliziert verified Faktoren),
  // aber wenn doch: sicherer Fallback nach /dashboard.
  if (factors.length === 0) redirect(next);

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Zwei-Faktor-Anmeldung</h1>
        <p className="mt-1 text-sm text-[var(--color-muted-foreground)]">
          Bitte den 6-stelligen Code aus Ihrer Authenticator-App eingeben.
        </p>
      </header>
      <LoginMfaVerifyForm factors={factors} next={next} />
    </div>
  );
}
