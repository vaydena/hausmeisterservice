'use client';

import { useActionState } from 'react';
import { summarizeUserAgent } from '@/lib/ua/summarize';
import type { UserSession } from '@/lib/auth/user-sessions';
import { revokePortalSessionAction, type PortalAccountActionState } from './actions';

const INITIAL: PortalAccountActionState = {};

function formatWhen(iso: string | null): string {
  if (!iso) return '–';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '–';
  return d.toLocaleString('de-DE');
}

function relativeLastSeen(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const diffMs = Date.now() - d.getTime();
  if (!Number.isFinite(diffMs) || diffMs < 0) return '';
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return 'gerade eben';
  if (min < 60) return `vor ${min} Min.`;
  const hrs = Math.floor(min / 60);
  if (hrs < 24) return `vor ${hrs} Std.`;
  const days = Math.floor(hrs / 24);
  return `vor ${days} Tag${days === 1 ? '' : 'en'}`;
}

export function PortalSessionsList({
  sessions,
  currentSessionId,
}: {
  sessions: UserSession[];
  currentSessionId: string | null;
}) {
  const [state, formAction, pending] = useActionState(revokePortalSessionAction, INITIAL);

  if (sessions.length === 0) {
    return (
      <p className="text-sm text-[var(--color-muted-foreground)]">
        Keine aktiven Sitzungen gefunden.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {state.error && (
        <p role="alert" className="text-sm text-[var(--color-destructive)]">
          {state.error}
        </p>
      )}
      {state.success && (
        <p role="status" className="text-sm text-[var(--color-success)]">
          {state.success}
        </p>
      )}

      <ul className="flex flex-col gap-3">
        {sessions.map((s) => {
          const isCurrent = currentSessionId != null && s.id === currentSessionId;
          const lastSeen = s.refreshedAt ?? s.updatedAt ?? s.createdAt;
          return (
            <li
              key={s.id}
              className="flex flex-col gap-3 rounded-lg border border-[var(--color-border)] p-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="flex flex-col gap-1 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{summarizeUserAgent(s.userAgent)}</span>
                  {isCurrent && (
                    <span className="rounded-full bg-[var(--color-primary)]/15 px-2 py-0.5 text-xs font-medium text-[var(--color-primary)]">
                      Aktuelle Sitzung
                    </span>
                  )}
                  {s.aal === 'aal2' && (
                    <span
                      className="rounded-full bg-[var(--color-success)]/15 px-2 py-0.5 text-xs font-medium text-[var(--color-success)]"
                      title="Diese Sitzung ist durch Zwei-Faktor-Authentifizierung geschuetzt."
                    >
                      2FA
                    </span>
                  )}
                </div>
                <div className="text-xs text-[var(--color-muted-foreground)]">
                  <span className="font-mono">{s.ip ?? '–'}</span>
                  <span className="mx-1">·</span>
                  <span>Zuletzt aktiv: {relativeLastSeen(lastSeen)}</span>
                  <span className="mx-1">·</span>
                  <span>Angemeldet: {formatWhen(s.createdAt)}</span>
                </div>
              </div>
              {!isCurrent && (
                <form action={formAction}>
                  <input type="hidden" name="sessionId" value={s.id} />
                  <button
                    type="submit"
                    disabled={pending}
                    className="inline-flex h-9 items-center justify-center rounded-md border border-[var(--color-border)] px-3 text-xs font-medium transition hover:bg-[var(--color-muted)]/50 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {pending ? 'Beende …' : 'Sitzung beenden'}
                  </button>
                </form>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
