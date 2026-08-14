'use client';

import Link from 'next/link';
import { useState } from 'react';

/**
 * Sprint 36: Portal-Variante des MFA-Empfehlungs-Banners aus Sprint 28.
 * Erscheint auf /portal/dashboard fuer Residents ohne verifizierten TOTP-
 * Faktor. Dismiss setzt einen eigenen Cookie
 * (portal_mfa_reminder_dismissed_at=<unix-ms>) — bewusst getrennt vom
 * Staff-Cookie, damit dieselbe Person, die im selben Browser Staff- UND
 * Portal-Konten hat, in beiden Rollen unabhaengig entscheiden kann.
 *
 * Duplikat statt Abstraktion zum Staff-Banner: Zielgruppe (Bewohner
 * vs. Owner), Anrede und der Recovery-Code-Hinweis unterscheiden sich —
 * und die Copy hier soll frei nachschaerfbar bleiben.
 */
export function PortalMfaReminderBanner() {
  const [dismissed, setDismissed] = useState(false);

  function handleDismiss() {
    const maxAge = 7 * 24 * 60 * 60;
    document.cookie = `portal_mfa_reminder_dismissed_at=${Date.now()}; Path=/; Max-Age=${maxAge}; SameSite=Lax`;
    setDismissed(true);
  }

  if (dismissed) return null;

  return (
    <div
      role="status"
      className="flex flex-col gap-3 rounded-xl border border-[var(--color-primary)]/40 bg-[var(--color-primary)]/5 p-4 sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="flex flex-col gap-1">
        <p className="text-sm font-medium">
          Zwei-Faktor-Authentifizierung noch nicht aktiv
        </p>
        <p className="text-xs text-[var(--color-muted-foreground)]">
          Mit einem zweiten Faktor schuetzen Sie Ihr Bewohner-Portal-Konto
          zusaetzlich — auch dann, wenn Ihr Passwort in fremde Haende geraet.
          Sie koennen die Einrichtung selbst in unter zwei Minuten
          abschliessen und danach Recovery-Codes fuer den Notfall speichern.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Link
          href="/portal/account"
          className="inline-flex h-9 items-center justify-center rounded-md bg-[var(--color-primary)] px-3 text-sm font-medium text-[var(--color-primary-foreground)] transition hover:opacity-90"
        >
          Jetzt einrichten
        </Link>
        <button
          type="button"
          onClick={handleDismiss}
          className="inline-flex h-9 items-center justify-center rounded-md border border-[var(--color-border)] px-3 text-sm font-medium transition hover:bg-[var(--color-muted)]/50"
        >
          Spaeter erinnern
        </button>
      </div>
    </div>
  );
}
