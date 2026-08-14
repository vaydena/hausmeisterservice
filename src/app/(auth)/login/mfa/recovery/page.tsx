import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { LoginMfaRecoveryForm } from './recovery-form';

export const metadata: Metadata = { title: 'Recovery-Code einloesen' };

export default async function LoginMfaRecoveryPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next: nextParam } = await searchParams;
  const next = nextParam && nextParam.startsWith('/') ? nextParam : '/dashboard';

  const supabase = await createSupabaseServerClient();

  // Ohne aal1-Session hier gar nichts erlauben — der User muss zuerst
  // Passwort-Login machen. Er landet dann auf /login/mfa, von dort
  // aus fuehrt der Link "Handy verloren?" hier her.
  const { data: userData } = await supabase.auth.getUser();
  if (!userData?.user) redirect('/login');

  // Wenn der User bereits aal2 hat oder gar keine MFA-Faktoren registriert
  // sind, ist die Seite obsolet — direkt weiter zum next-Ziel (bzw.
  // /dashboard als sicherer Fallback).
  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aal?.currentLevel === 'aal2' || aal?.nextLevel !== 'aal2') {
    redirect(next);
  }

  // Der "Zurueck"-Link soll das next zurueckgeben, damit die MFA-Verify-
  // Seite den Portal-Kontext nicht verliert.
  const backHref = `/login/mfa?next=${encodeURIComponent(next)}`;

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Handy verloren?</h1>
        <p className="mt-1 text-sm text-[var(--color-muted-foreground)]">
          Geben Sie einen Ihrer Recovery-Codes ein. Der Code wird eingeloest und
          entfernt danach alle registrierten MFA-Faktoren — Sie richten die
          Zwei-Faktor-Authentifizierung direkt anschliessend neu ein.
        </p>
      </header>
      <LoginMfaRecoveryForm next={next} />
      <p className="text-sm">
        <Link
          href={backHref}
          className="text-[var(--color-primary)] underline underline-offset-4 hover:opacity-80"
        >
          ← Zurueck zur Code-Eingabe aus der App
        </Link>
      </p>
    </div>
  );
}
