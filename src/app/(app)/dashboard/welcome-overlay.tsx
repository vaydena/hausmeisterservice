'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { dismissOnboardingAction } from './onboarding-actions';
import type { OnboardingStep } from './onboarding-steps';

/**
 * Erste-Schritte-Assistent: die Checkliste der vier Start-Schritte.
 *
 * Eine Komponente, zwei Rollen:
 *  1. **Erstes Mal** (`autoShow`): Beim allerersten Login eines Owners geht der
 *     Assistent von selbst auf und merkt sich das Schließen serverseitig
 *     (`onboarding_completed_at` via {@link dismissOnboardingAction}) — danach
 *     nie wieder von allein.
 *  2. **Danach dauerhaft als Hilfe:** Der Knopf „Erste Schritte" bleibt bestehen;
 *     der Owner kann die Liste jederzeit wieder öffnen — direkt hier oder per Link
 *     aus /hilfe (`/dashboard?willkommen=1`, `openViaLink`). Ein erneutes Schließen
 *     schreibt nichts mehr.
 *
 * `steps` kommt vom Server (zwei Ziele liegen in abschaltbaren Modulen — siehe
 * `onboarding-steps.ts`).
 */
export function WelcomeGuide({
  tenantName,
  steps,
  autoShow,
  openViaLink,
}: {
  tenantName: string;
  steps: OnboardingStep[];
  autoShow: boolean;
  openViaLink: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(autoShow || openViaLink);
  // Nur der allererste Abschluss wird persistiert. Danach ist der Assistent
  // reine Hilfe — Schließen schreibt nichts mehr.
  const [persist, setPersist] = useState(autoShow);
  const [pending, startTransition] = useTransition();

  const persistIfNeeded = () => {
    if (!persist) return;
    setPersist(false);
    startTransition(async () => {
      try {
        await dismissOnboardingAction();
      } catch {
        // Fehlgeschlagen: beim nächsten Schließen erneut versuchen.
        setPersist(true);
      }
    });
  };

  // Schließen über X / „Schließen": Fenster zu, ggf. persistieren, und einen
  // per Link gesetzten Query-Parameter entfernen (sonst öffnet ein Reload das
  // Fenster erneut).
  const close = () => {
    setOpen(false);
    if (openViaLink) router.replace('/dashboard');
    persistIfNeeded();
  };

  // Klick auf einen Schritt-Knopf: Fenster zu + ggf. persistieren, aber KEIN
  // router.replace — die Navigation zum Ziel räumt die URL ohnehin ab und würde
  // sonst mit dem replace konkurrieren.
  const closeForNavigation = () => {
    setOpen(false);
    persistIfNeeded();
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md border border-[var(--color-border)] px-3 text-sm font-medium hover:bg-[var(--color-muted)]/50"
      >
        <svg width="16" height="16" viewBox="0 0 20 20" fill="none" aria-hidden="true">
          <path
            d="M4 5h12M4 10h12M4 15h7"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
        Erste Schritte
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="welcome-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
        >
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-[var(--color-background)] p-6 shadow-2xl md:p-8">
            <header className="flex items-start justify-between gap-4">
              <div>
                <h2 id="welcome-title" className="text-2xl font-semibold tracking-tight">
                  Willkommen bei Hausmeisterservice, {tenantName}.
                </h2>
                <p className="mt-2 text-sm text-[var(--color-muted-foreground)]">
                  Diese kurze Liste zeigt die vier Schritte, mit denen die meisten Betriebe
                  starten — in empfohlener Reihenfolge. Alles kann später jederzeit ergänzt
                  werden.
                </p>
              </div>
              <button
                type="button"
                onClick={close}
                disabled={pending}
                aria-label="Assistent schließen"
                className="rounded-md p-1 text-[var(--color-muted-foreground)] hover:bg-[var(--color-muted)] hover:text-[var(--color-foreground)] disabled:opacity-50"
              >
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                  <path
                    d="M5 5l10 10M15 5L5 15"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
            </header>

            <ol className="mt-6 space-y-4">
              {steps.map((step) => (
                <li
                  key={step.title}
                  className="rounded-xl border border-[var(--color-border)] p-4"
                >
                  <div className="text-base font-medium">{step.title}</div>
                  <p className="mt-1 text-sm text-[var(--color-muted-foreground)]">
                    {step.body}
                  </p>
                  {step.href && step.cta && (
                    <Link
                      href={step.href}
                      onClick={closeForNavigation}
                      className="mt-3 inline-flex h-9 items-center rounded-md bg-[var(--color-primary)] px-3 text-xs font-medium text-[var(--color-primary-foreground)] transition hover:opacity-90"
                    >
                      {step.cta} →
                    </Link>
                  )}
                </li>
              ))}
            </ol>

            <div className="mt-6 flex items-center justify-between gap-4 border-t border-[var(--color-border)] pt-4">
              <p className="text-xs text-[var(--color-muted-foreground)]">
                Diesen Assistenten öffnen Sie jederzeit wieder über „Erste Schritte" auf dem
                Dashboard oder unter Hilfe &amp; Kontakt.
              </p>
              <button
                type="button"
                onClick={close}
                disabled={pending}
                className="inline-flex h-9 shrink-0 items-center rounded-md border border-[var(--color-border)] px-4 text-sm font-medium hover:bg-[var(--color-muted)]/50 disabled:opacity-50"
              >
                {pending ? 'Speichern…' : 'Schließen'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
