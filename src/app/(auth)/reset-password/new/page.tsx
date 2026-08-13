import type { Metadata } from 'next';
import Link from 'next/link';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { UpdatePasswordForm } from './update-form';

export const metadata: Metadata = {
  title: 'Neues Passwort festlegen',
};

// Cookie-Zugriff auf die Recovery-Session laesst Next die Page nicht
// statisch vorproduzieren. Explizites force-dynamic haelt Turbopack
// davon ab, den Prerender-Pfad zu versuchen.
export const dynamic = 'force-dynamic';

export default async function NewPasswordPage() {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getUser();

  // Ohne aktive Recovery-Session (direkter Aufruf, oder Session
  // zwischenzeitlich abgelaufen): keine Formular-Anzeige. Sonst wuerde
  // updateUser() spaeter mit "Auth session missing" scheitern und der
  // User sieht eine sperrige Fehlermeldung, obwohl der eigentliche
  // Fehler ist: der Link ist nicht mehr gueltig.
  if (!data.user) {
    return (
      <div className="flex flex-col gap-6">
        <div>
          <h2 className="text-lg font-semibold">Link nicht mehr gueltig</h2>
          <p className="text-sm text-[var(--color-muted-foreground)]">
            Der Reset-Link ist abgelaufen oder wurde bereits verwendet. Fordern Sie einen neuen an.
          </p>
        </div>
        <Link
          href="/reset-password"
          className="mt-2 inline-flex h-10 items-center justify-center rounded-md bg-[var(--color-primary)] px-4 text-sm font-medium text-[var(--color-primary-foreground)] transition hover:opacity-90"
        >
          Neuen Reset-Link anfordern
        </Link>
        <Link
          href="/login"
          className="text-sm text-[var(--color-primary)] hover:underline text-center"
        >
          Zurück zur Anmeldung
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-lg font-semibold">Neues Passwort festlegen</h2>
        <p className="text-sm text-[var(--color-muted-foreground)]">
          Wählen Sie ein neues Passwort für Ihr Konto.
        </p>
      </div>
      <UpdatePasswordForm />
    </div>
  );
}
