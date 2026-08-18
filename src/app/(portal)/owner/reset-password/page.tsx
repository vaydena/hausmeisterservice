import type { Metadata } from 'next';
import Link from 'next/link';
import { OwnerResetForm } from './owner-reset-form';

export const metadata: Metadata = {
  title: 'Passwort zuruecksetzen — Eigentümer-Portal',
};

/**
 * Einstiegsseite fuer Eigentuemer, die ihr Portal-Passwort vergessen haben.
 * Eigene Route (nicht ?owner=1 auf der Staff-Seite) — der Proxy kennt
 * /owner/reset-password als PORTAL_PUBLIC_ROUTE, das Wording ist
 * eigentuemerfreundlich, und der Back-Link fuehrt zurueck ins Owner-Portal.
 * Der Rest des Flows (/reset-password/confirm → /new) bleibt geteilt; das
 * owner=1-Flag wandert mit und steuert den finalen Redirect auf /owner/login.
 */
export default function OwnerResetPasswordPage() {
  return (
    <div className="mx-auto max-w-md">
      <div className="mb-6 flex flex-col gap-1 text-center">
        <h1 className="text-xl font-semibold">Passwort zuruecksetzen</h1>
        <p className="text-sm text-[var(--color-muted-foreground)]">
          Wir senden Ihnen einen Link, mit dem Sie ein neues Passwort fuer
          Ihr Eigentümer-Portal festlegen koennen.
        </p>
      </div>
      <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)] p-6 shadow-sm">
        <OwnerResetForm />
        <div className="mt-4 text-center">
          <Link
            href="/owner/login"
            className="text-sm text-[var(--color-primary)] hover:underline"
          >
            Zurueck zur Anmeldung
          </Link>
        </div>
      </div>
    </div>
  );
}
