import type { Metadata } from 'next';
import { requireTenantContext } from '@/lib/tenant/current';
import { ChangeDisplayNameForm } from './change-display-name-form';
import { ChangePasswordForm } from './change-password-form';
import { RevokeSessionsForm } from './revoke-sessions-form';

export const metadata: Metadata = { title: 'Konto' };

export default async function AccountSettingsPage() {
  const ctx = await requireTenantContext();

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Konto</h1>
        <p className="text-sm text-[var(--color-muted-foreground)]">
          Persoenliche Anmeldedaten und aktive Sitzungen verwalten.
        </p>
      </header>

      <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] p-5">
        <div className="mb-4">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--color-muted-foreground)]">
            Anzeigename
          </h2>
          <p className="mt-1 text-sm text-[var(--color-muted-foreground)]">
            E-Mail: <span className="font-medium text-[var(--color-foreground)]">{ctx.email ?? '–'}</span>
            {' '}(nicht aenderbar)
          </p>
        </div>
        <ChangeDisplayNameForm currentDisplayName={ctx.displayName ?? ''} />
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
        <ChangePasswordForm />
      </section>

      <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] p-5">
        <div className="mb-4">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--color-muted-foreground)]">
            Aktive Sitzungen
          </h2>
          <p className="mt-1 text-sm text-[var(--color-muted-foreground)]">
            Meldet Sie auf allen anderen Geraeten ab (Handy, anderer Browser, alter Laptop). Diese
            Sitzung hier bleibt aktiv.
          </p>
        </div>
        <RevokeSessionsForm />
      </section>
    </div>
  );
}
