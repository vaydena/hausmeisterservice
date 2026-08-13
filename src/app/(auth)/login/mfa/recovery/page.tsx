import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { LoginMfaRecoveryForm } from './recovery-form';

export const metadata: Metadata = { title: 'Recovery-Code einloesen' };

export default async function LoginMfaRecoveryPage() {
  const supabase = await createSupabaseServerClient();

  // Ohne aal1-Session hier gar nichts erlauben — der User muss zuerst
  // Passwort-Login machen. Er landet dann auf /login/mfa, von dort
  // aus fuehrt der Link "Handy verloren?" hier her.
  const { data: userData } = await supabase.auth.getUser();
  if (!userData?.user) redirect('/login');

  // Wenn der User bereits aal2 hat oder gar keine MFA-Faktoren registriert
  // sind, ist die Seite obsolet — direkt weiter ins Dashboard.
  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aal?.currentLevel === 'aal2' || aal?.nextLevel !== 'aal2') {
    redirect('/dashboard');
  }

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
      <LoginMfaRecoveryForm />
      <p className="text-sm">
        <Link
          href="/login/mfa"
          className="text-[var(--color-primary)] underline underline-offset-4 hover:opacity-80"
        >
          ← Zurueck zur Code-Eingabe aus der App
        </Link>
      </p>
    </div>
  );
}
