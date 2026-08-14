'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';
import { dismissPortalOnboardingAction } from './portal-onboarding-actions';

interface Step {
  title: string;
  body: string;
  href?: string;
  cta?: string;
}

const STEPS: Step[] = [
  {
    title: '1. Ankündigungen der Hausverwaltung lesen',
    body: 'Hier sehen Sie Neuigkeiten, Hinweise und wichtige Mitteilungen zu Ihrem Objekt. Ankündigungen, die eine Kenntnisnahme brauchen, sind markiert.',
    href: '/portal/announcements',
    cta: 'Zu den Ankündigungen',
  },
  {
    title: '2. Mängel oder Anliegen melden',
    body: 'Ein tropfender Wasserhahn, ein defektes Treppenlicht, ein Anliegen im Hausflur? Melden Sie es direkt hier — die Hausverwaltung bekommt es automatisch übermittelt.',
    href: '/portal/defects/new',
    cta: 'Meldung erstellen',
  },
  {
    title: '3. Direkte Nachricht schreiben',
    body: 'Für persönliche Rückfragen oder Themen, die nicht in eine Mängelmeldung passen, können Sie hier eine Nachricht an Ihre Hausverwaltung schicken.',
    href: '/portal/messages',
    cta: 'Nachricht senden',
  },
  {
    title: '4. Ihr Konto absichern',
    body: 'Aktivieren Sie die Zwei-Faktor-Authentifizierung mit Ihrem Smartphone — der wichtigste Schutz gegen unbefugte Zugriffe auf Ihre Portal-Daten.',
    href: '/portal/account',
    cta: 'Konto einrichten',
  },
];

export function PortalWelcomeOverlay({ firstName }: { firstName: string }) {
  const [open, setOpen] = useState(true);
  const [pending, startTransition] = useTransition();

  if (!open) return null;

  const dismiss = () => {
    setOpen(false);
    startTransition(async () => {
      try {
        await dismissPortalOnboardingAction();
      } catch {
        setOpen(true);
      }
    });
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="portal-welcome-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
    >
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-[var(--color-background)] p-6 shadow-2xl md:p-8">
        <header className="flex items-start justify-between gap-4">
          <div>
            <h2 id="portal-welcome-title" className="text-2xl font-semibold tracking-tight">
              Willkommen im Bewohner-Portal, {firstName}!
            </h2>
            <p className="mt-2 text-sm text-[var(--color-muted-foreground)]">
              Hier sind die wichtigsten Bereiche kurz erklärt. Sie können diese
              Übersicht jederzeit schließen — sie erscheint danach nicht mehr.
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
          {STEPS.map((step) => (
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
            Bei Fragen wenden Sie sich jederzeit an Ihre Hausverwaltung.
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
