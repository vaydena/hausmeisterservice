'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';
import { dismissOnboardingAction } from './onboarding-actions';
import type { OnboardingStep } from './onboarding-steps';

/**
 * `steps` kommt vom Server, nicht aus einer Konstante hier: zwei der Ziele
 * liegen in abschaltbaren Modulen. Siehe `onboarding-steps.ts`.
 */
export function WelcomeOverlay({
  tenantName,
  steps,
}: {
  tenantName: string;
  steps: OnboardingStep[];
}) {
  const [open, setOpen] = useState(true);
  const [pending, startTransition] = useTransition();

  if (!open) return null;

  const dismiss = () => {
    setOpen(false);
    startTransition(async () => {
      try {
        await dismissOnboardingAction();
      } catch {
        // Bei Fehler: Overlay wieder öffnen, damit User es erneut versuchen kann.
        setOpen(true);
      }
    });
  };

  return (
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
              Sie haben 14 Tage kostenlos Zeit, alles auszuprobieren. Diese kurze Liste
              zeigt die vier Schritte, mit denen die meisten Betriebe starten. Alles kann
              später jederzeit ergänzt werden.
            </p>
          </div>
          <button
            type="button"
            onClick={dismiss}
            disabled={pending}
            aria-label="Willkommens-Overlay schließen"
            className="rounded-md p-1 text-[var(--color-muted-foreground)] hover:bg-[var(--color-muted)] hover:text-[var(--color-foreground)] disabled:opacity-50"
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 20 20"
              fill="none"
              aria-hidden="true"
            >
              <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
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
                  onClick={dismiss}
                  className="mt-3 inline-flex h-9 items-center rounded-md bg-[var(--color-primary)] px-3 text-xs font-medium text-[var(--color-primary-foreground)] transition hover:opacity-90"
                >
                  {step.cta} →
                </Link>
              )}
            </li>
          ))}
        </ol>

        <div className="mt-6 flex items-center justify-between border-t border-[var(--color-border)] pt-4">
          <p className="text-xs text-[var(--color-muted-foreground)]">
            Sie können diese Liste jederzeit schließen — sie erscheint nicht mehr.
          </p>
          <button
            type="button"
            onClick={dismiss}
            disabled={pending}
            className="inline-flex h-9 items-center rounded-md border border-[var(--color-border)] px-4 text-sm font-medium hover:bg-[var(--color-muted)]/50 disabled:opacity-50"
          >
            {pending ? 'Speichern…' : 'Später erledigen'}
          </button>
        </div>
      </div>
    </div>
  );
}
