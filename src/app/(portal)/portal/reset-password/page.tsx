import type { Metadata } from 'next';
import Link from 'next/link';
import { PortalResetForm } from './portal-reset-form';

export const metadata: Metadata = {
  title: 'Passwort zuruecksetzen — Bewohner-Portal',
};

/**
 * Sprint 39: Einstiegsseite fuer Bewohner, die ihr Portal-Passwort
 * vergessen haben. Bewusst als eigene Route (nicht ?portal=1 auf der
 * Staff-Seite) — der Proxy kennt /portal/reset-password schon als
 * PORTAL_PUBLIC_ROUTES, das Wording ist bewohnerfreundlich, und der
 * Back-Link fuehrt zurueck ins Portal statt zur Mitarbeiter-Anmeldung.
 * Der Rest des Flows (/reset-password/confirm → /new) bleibt geteilt,
 * ein ?portal=1-Flag wandert mit und steuert den finalen Redirect
 * auf /portal/login nach erfolgreichem Reset.
 */
export default function PortalResetPasswordPage() {
  return (
    <div className="mx-auto max-w-md">
      <div className="mb-6 flex flex-col gap-1 text-center">
        <h1 className="text-xl font-semibold">Passwort zuruecksetzen</h1>
        <p className="text-sm text-[var(--color-muted-foreground)]">
          Wir senden Ihnen einen Link, mit dem Sie ein neues Passwort fuer
          Ihr Bewohner-Portal festlegen koennen.
        </p>
      </div>
      <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)] p-6 shadow-sm">
        <PortalResetForm />
        <div className="mt-4 text-center">
          <Link
            href="/portal/login"
            className="text-sm text-[var(--color-primary)] hover:underline"
          >
            Zurueck zur Anmeldung
          </Link>
        </div>
      </div>
    </div>
  );
}
