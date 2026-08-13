'use client';

import Link from 'next/link';
import { useState } from 'react';

/**
 * MFA-Empfehlungs-Banner (Sprint 28). Erscheint auf dem Dashboard fuer
 * Owner ohne verifizierten MFA-Faktor. Dismiss setzt einen Cookie
 * (mfa_reminder_dismissed_at=<unix-ms>), der serverseitig gelesen wird —
 * fuer 7 Tage bleibt der Banner dann stumm. Danach kommt er wieder,
 * weil Owner-Konten das sensibelste Ziel eines Angreifers sind und ein
 * dauerhaft-dismissbarer Nudge in der Praxis nie akzeptiert wird.
 *
 * Anzeige nur client-side ausgesteuert — das serverseitige Page wraps
 * das Banner in ein bedingtes JSX-Fragment, das die harten Kriterien
 * (isOwner, kein verified Faktor, Cookie nicht kuerzlich gesetzt)
 * bereits geprueft hat.
 */
export function MfaReminderBanner() {
  const [dismissed, setDismissed] = useState(false);

  function handleDismiss() {
    // 7 Tage Cooldown; SameSite=Lax + Path=/ damit alle Routen den
    // Wert sehen, kein Secure-Flag, damit http://localhost im Dev geht.
    const maxAge = 7 * 24 * 60 * 60; // seconds
    document.cookie = `mfa_reminder_dismissed_at=${Date.now()}; Path=/; Max-Age=${maxAge}; SameSite=Lax`;
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
          Owner-Konten sind das sensibelste Ziel — ein zweiter Faktor
          verhindert die Uebernahme selbst dann, wenn Ihr Passwort in
          fremde Haende geraet.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Link
          href="/settings/account"
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
