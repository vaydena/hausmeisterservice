import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getResidentContext } from '@/lib/portal/current';
import { ChangePortalPasswordForm } from './change-password-form';
import { PortalMfaForm } from './mfa-form';

export const metadata: Metadata = { title: 'Konto — Bewohner-Portal' };

/**
 * Sprint 32: Konto-Seite fuer Portal-Residents. Erster Schritt: MFA-
 * Enrollment. Passwort-Aenderung und Session-Uebersicht kommen in
 * separaten Sprints, damit die einzelnen Aenderungen ueberschaubar
 * bleiben.
 */
export default async function PortalAccountPage({
  searchParams,
}: {
  searchParams: Promise<{ info?: string }>;
}) {
  const ctx = await getResidentContext();
  if (!ctx) redirect('/portal/login');
  const { info } = await searchParams;

  const supabase = await createSupabaseServerClient();
  const { data: factorsData } = await supabase.auth.mfa.listFactors();
  const factors = (factorsData?.totp ?? [])
    .filter((f) => f.status === 'verified')
    .map((f) => ({
      id: f.id,
      friendlyName: f.friendly_name ?? null,
      createdAt: f.created_at,
    }));

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Konto</h1>
        <p className="text-sm text-[var(--color-muted-foreground)]">
          Persoenliche Anmeldedaten fuer das Bewohner-Portal.
        </p>
      </header>

      {info === 'mfa-lost' && (
        <div
          role="status"
          className="rounded-md border border-[var(--color-primary)]/40 bg-[var(--color-primary)]/5 p-4 text-sm"
        >
          <p className="font-medium">Recovery-Code eingeloest.</p>
          <p className="mt-1 text-[var(--color-muted-foreground)]">
            Alle bisherigen MFA-Faktoren wurden entfernt. Bitte richten Sie
            die Zwei-Faktor-Authentifizierung jetzt direkt neu ein.
          </p>
        </div>
      )}

      <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] p-5">
        <div className="mb-4">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--color-muted-foreground)]">
            Angemeldet als
          </h2>
          <p className="mt-1 text-sm">
            <span className="font-medium">{ctx.displayName}</span>
            {ctx.email && (
              <span className="text-[var(--color-muted-foreground)]"> · {ctx.email}</span>
            )}
          </p>
          {ctx.propertyName && (
            <p className="text-xs text-[var(--color-muted-foreground)]">
              {ctx.propertyName}
              {ctx.unitCode ? `, Einheit ${ctx.unitCode}` : ''}
            </p>
          )}
        </div>
      </section>

      <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] p-5">
        <div className="mb-4">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--color-muted-foreground)]">
            Passwort aendern
          </h2>
          <p className="mt-1 text-sm text-[var(--color-muted-foreground)]">
            Zur Bestaetigung wird das aktuelle Passwort erneut abgefragt. Nach zu vielen
            Fehlversuchen wird die Aenderung fuer 15 Minuten gesperrt.
          </p>
        </div>
        <ChangePortalPasswordForm />
      </section>

      <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] p-5">
        <div className="mb-4">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--color-muted-foreground)]">
            Zwei-Faktor-Authentifizierung
          </h2>
          <p className="mt-1 text-sm text-[var(--color-muted-foreground)]">
            Zusaetzlicher Schutz beim Login: Nach Passwort-Eingabe wird ein
            6-stelliger Code aus einer Authenticator-App (Google Authenticator,
            1Password, Bitwarden, …) abgefragt. Empfohlen, wenn Sie ueber das
            Portal sensible Nachrichten mit der Hausverwaltung austauschen.
          </p>
          <p className="mt-2 text-xs text-[var(--color-muted-foreground)]">
            Sollten Sie das Geraet mit der Authenticator-App verlieren, wenden
            Sie sich an Ihre Hausverwaltung — sie kann die Zwei-Faktor-
            Anmeldung fuer Ihr Konto zuruecksetzen.
          </p>
        </div>
        <PortalMfaForm factors={factors} />
      </section>
    </div>
  );
}
