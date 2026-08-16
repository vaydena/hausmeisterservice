'use client';

import { useActionState, useState } from 'react';
import {
  enrollMfaFactorAction,
  unenrollMfaFactorAction,
  verifyMfaEnrollmentAction,
  type AccountActionState,
  type MfaEnrollState,
} from './actions';
import { formatDate } from '@/lib/utils/format';

type Factor = {
  id: string;
  friendlyName: string | null;
  createdAt: string;
};

const INITIAL_ENROLL: MfaEnrollState = {};
const INITIAL_VERIFY: AccountActionState = {};
const INITIAL_UNENROLL: AccountActionState = {};

export function MfaForm({ factors }: { factors: Factor[] }) {
  const [enrollState, enrollAction, enrollPending] = useActionState(
    enrollMfaFactorAction,
    INITIAL_ENROLL,
  );
  const [verifyState, verifyAction, verifyPending] = useActionState(
    verifyMfaEnrollmentAction,
    INITIAL_VERIFY,
  );
  const [unenrollState, unenrollAction, unenrollPending] = useActionState(
    unenrollMfaFactorAction,
    INITIAL_UNENROLL,
  );

  // Nach erfolgreichem Verify (success gesetzt) blenden wir das QR-Panel aus
  // und zeigen die aktualisierte Faktor-Liste. Solange keine Success-Meldung
  // aus dem verifyState kommt, bleibt der aktive Enroll-Flow sichtbar.
  const activeEnrollment = verifyState.success ? undefined : enrollState.enrollment;
  const [showEnrollForm, setShowEnrollForm] = useState(false);

  return (
    <div className="flex flex-col gap-4">
      {factors.length > 0 && !activeEnrollment && (
        <ul className="flex flex-col gap-2">
          {factors.map((f) => (
            <li
              key={f.id}
              className="flex items-center justify-between gap-3 rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {f.friendlyName ?? 'Authenticator-App'}
                </p>
                <p className="text-xs text-[var(--color-muted-foreground)]">
                  Aktiv seit {formatDate(f.createdAt)}
                </p>
              </div>
              <form action={unenrollAction}>
                <input type="hidden" name="factorId" value={f.id} />
                <button
                  type="submit"
                  disabled={unenrollPending}
                  onClick={(e) => {
                    if (
                      !window.confirm(
                        'Diesen Faktor wirklich entfernen? Ohne einen zweiten Faktor kann Ihr Konto wieder allein per Passwort uebernommen werden.',
                      )
                    ) {
                      e.preventDefault();
                    }
                  }}
                  className="inline-flex h-8 items-center rounded-md border border-[var(--color-border)] px-3 text-xs font-medium transition hover:bg-[var(--color-muted)]/50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Entfernen
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}

      {unenrollState.error && (
        <p role="alert" className="text-sm text-[var(--color-destructive)]">
          {unenrollState.error}
        </p>
      )}
      {unenrollState.success && (
        <p role="status" className="text-sm text-[var(--color-success)]">
          {unenrollState.success}
        </p>
      )}
      {verifyState.success && (
        <p role="status" className="text-sm text-[var(--color-success)]">
          {verifyState.success}
        </p>
      )}

      {!activeEnrollment && (
        <div>
          {!showEnrollForm ? (
            <button
              type="button"
              onClick={() => setShowEnrollForm(true)}
              className="inline-flex h-10 items-center justify-center rounded-md border border-[var(--color-border)] px-4 text-sm font-medium transition hover:bg-[var(--color-muted)]/50"
            >
              {factors.length === 0
                ? 'Zwei-Faktor-Authentifizierung einrichten'
                : 'Weiteren Faktor hinzufuegen'}
            </button>
          ) : (
            <form action={enrollAction} className="flex flex-col gap-3">
              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-medium">Geraetename</span>
                <input
                  type="text"
                  name="friendlyName"
                  required
                  minLength={1}
                  maxLength={40}
                  placeholder="z. B. iPhone"
                  autoFocus
                  className="rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]/20"
                />
                <span className="text-xs text-[var(--color-muted-foreground)]">
                  Frei waehlbar. Wird nur Ihnen angezeigt.
                </span>
              </label>
              {enrollState.error && (
                <p role="alert" className="text-sm text-[var(--color-destructive)]">
                  {enrollState.error}
                </p>
              )}
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={enrollPending}
                  className="inline-flex h-10 items-center justify-center rounded-md bg-[var(--color-primary)] px-4 text-sm font-medium text-[var(--color-primary-foreground)] transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {enrollPending ? 'Erstelle …' : 'QR-Code erstellen'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowEnrollForm(false)}
                  className="inline-flex h-10 items-center justify-center rounded-md border border-[var(--color-border)] px-4 text-sm font-medium transition hover:bg-[var(--color-muted)]/50"
                >
                  Abbrechen
                </button>
              </div>
            </form>
          )}
        </div>
      )}

      {activeEnrollment && (
        <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-muted)]/30 p-4">
          <h3 className="mb-3 text-sm font-semibold">
            Schritt 1 · QR-Code in einer Authenticator-App scannen
          </h3>
          <p className="mb-3 text-xs text-[var(--color-muted-foreground)]">
            Empfohlen: Google Authenticator, Microsoft Authenticator, 1Password, Bitwarden.
          </p>
          <div className="mb-4 flex flex-col items-start gap-3 sm:flex-row">
            {/* qrCodeDataUri kommt als data:image/svg+xml;utf8,... aus Supabase. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={activeEnrollment.qrCodeDataUri}
              alt="QR-Code fuer TOTP-Enrollment"
              width={160}
              height={160}
              className="rounded-md border border-[var(--color-border)] bg-white p-2"
            />
            <details className="text-xs text-[var(--color-muted-foreground)]">
              <summary className="cursor-pointer font-medium text-[var(--color-foreground)]">
                Kein QR-Scan moeglich? Code manuell eingeben
              </summary>
              <p className="mt-2 break-all font-mono">{activeEnrollment.secret}</p>
            </details>
          </div>

          <form action={verifyAction} className="flex flex-col gap-3">
            <input type="hidden" name="factorId" value={activeEnrollment.factorId} />
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium">
                Schritt 2 · 6-stelligen Code aus der App eingeben
              </span>
              <input
                type="text"
                name="code"
                required
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]{6}"
                maxLength={6}
                autoFocus
                className="w-32 rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-center font-mono text-lg tracking-widest outline-none focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]/20"
              />
            </label>
            {verifyState.error && (
              <p role="alert" className="text-sm text-[var(--color-destructive)]">
                {verifyState.error}
              </p>
            )}
            <div>
              <button
                type="submit"
                disabled={verifyPending}
                className="inline-flex h-10 items-center justify-center rounded-md bg-[var(--color-primary)] px-4 text-sm font-medium text-[var(--color-primary-foreground)] transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {verifyPending ? 'Pruefe …' : 'Faktor aktivieren'}
              </button>
            </div>
          </form>
          {/* Abbrechen liegt bewusst AUSSERHALB des Verify-Forms — verschachtelte */}
          {/* <form>-Tags sind kein valides HTML und wuerden Client-side klapsen. */}
          <form action={unenrollAction} className="mt-3">
            <input type="hidden" name="factorId" value={activeEnrollment.factorId} />
            <button
              type="submit"
              disabled={unenrollPending}
              className="inline-flex h-10 items-center justify-center rounded-md border border-[var(--color-border)] px-4 text-sm font-medium transition hover:bg-[var(--color-muted)]/50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Enrollment abbrechen
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
