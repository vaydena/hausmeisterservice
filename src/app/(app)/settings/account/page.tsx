import type { Metadata } from 'next';
import { requireTenantContext } from '@/lib/tenant/current';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseServiceClient } from '@/lib/supabase/service';
import { getCurrentSessionId } from '@/lib/auth/current-session-id';
import { parseUserSessions } from '@/lib/auth/user-sessions';
import { ChangeDisplayNameForm } from './change-display-name-form';
import { ChangeEmailForm } from './change-email-form';
import { ChangePasswordForm } from './change-password-form';
import { LoginEventsList } from './login-events-list';
import { MfaForm } from './mfa-form';
import { RecoveryCodesForm } from './recovery-codes-form';
import { RevokeSessionsForm } from './revoke-sessions-form';
import { SessionsList } from './sessions-list';

export const metadata: Metadata = { title: 'Konto' };

export default async function AccountSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ info?: string }>;
}) {
  const ctx = await requireTenantContext();
  const { info } = await searchParams;

  // Nur verified TOTP-Faktoren interessieren die UI. Unverified sind
  // Ueberbleibsel von abgebrochenen Enroll-Flows — enrollMfaFactorAction
  // raeumt sie beim naechsten Anlegen automatisch weg.
  const supabase = await createSupabaseServerClient();
  const { data: factorsData } = await supabase.auth.mfa.listFactors();
  const factors = (factorsData?.totp ?? [])
    .filter((f) => f.status === 'verified')
    .map((f) => ({
      id: f.id,
      friendlyName: f.friendly_name ?? null,
      createdAt: f.created_at,
    }));

  // Anzahl unbenutzter Recovery-Codes. Function ist SECURITY DEFINER mit
  // execute-Grant nur auf service_role (Sprint 21 Lockdown-Muster).
  const service = createSupabaseServiceClient();
  const { data: unusedCountData } = await service.rpc(
    'count_unused_mfa_recovery_codes',
    { p_user_id: ctx.userId },
  );
  const unusedCount = typeof unusedCountData === 'number' ? unusedCountData : 0;

  // Anmeldeverlauf (Sprint 29): letzte 20 erfolgreiche Logins. RLS erlaubt
  // dem User SELECT auf seine eigenen Rows — daher der anon Server-Client,
  // kein service_role noetig.
  const { data: loginEventsData } = await supabase
    .from('auth_login_events')
    .select('id, at, ip, user_agent, endpoint')
    .eq('user_id', ctx.userId)
    .order('at', { ascending: false })
    .limit(20);
  const loginEvents = (loginEventsData ?? []).map((e) => ({
    id: e.id,
    at: e.at,
    ip: e.ip,
    userAgent: e.user_agent,
    endpoint: e.endpoint,
  }));

  // Sprint 31: Aktive Sessions inkl. eigener session_id. Load via service_role,
  // weil auth.sessions aus authenticated-Kontext nicht lesbar ist; die
  // SECURITY-DEFINER-Function scoped selbst auf p_user_id = ctx.userId.
  const { data: sessionsRaw } = await service.rpc('list_user_sessions', {
    p_user_id: ctx.userId,
  });
  const sessions = parseUserSessions(sessionsRaw);
  const currentSessionId = await getCurrentSessionId(supabase);

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Konto</h1>
        <p className="text-sm text-[var(--color-muted-foreground)]">
          Persoenliche Anmeldedaten und aktive Sitzungen verwalten.
        </p>
      </header>

      {info === 'mfa-lost' && (
        <div
          role="status"
          className="rounded-md border border-[var(--color-primary)]/40 bg-[var(--color-primary)]/5 p-4 text-sm"
        >
          <p className="font-medium">Recovery-Code eingeloest.</p>
          <p className="mt-1 text-[var(--color-muted-foreground)]">
            Alle bisherigen MFA-Faktoren wurden entfernt. Bitte richten Sie die
            Zwei-Faktor-Authentifizierung jetzt direkt neu ein und generieren
            Sie anschliessend einen frischen Batch Recovery-Codes.
          </p>
        </div>
      )}

      {info === 'email-changed' && (
        <div
          role="status"
          className="rounded-md border border-[var(--color-success)]/40 bg-[var(--color-success)]/5 p-4 text-sm"
        >
          <p className="font-medium">E-Mail-Adresse erfolgreich geaendert.</p>
          <p className="mt-1 text-[var(--color-muted-foreground)]">
            Ihre neue Adresse ist jetzt aktiv. Falls Sie sich auf anderen Geraeten
            einloggen, verwenden Sie bitte die neue E-Mail.
          </p>
        </div>
      )}

      <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] p-5">
        <div className="mb-4">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--color-muted-foreground)]">
            Anzeigename
          </h2>
          <p className="mt-1 text-sm text-[var(--color-muted-foreground)]">
            Wird oben rechts, in Nachrichten und in Audit-Log-Eintraegen angezeigt.
          </p>
        </div>
        <ChangeDisplayNameForm currentDisplayName={ctx.displayName ?? ''} />
      </section>

      <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] p-5">
        <div className="mb-4">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--color-muted-foreground)]">
            E-Mail-Adresse
          </h2>
          <p className="mt-1 text-sm text-[var(--color-muted-foreground)]">
            Ihre E-Mail wird fuer Login, Benachrichtigungen und Passwort-Zuruecksetzung
            verwendet. Aus Sicherheitsgruenden ist die Aenderung nur mit Bestaetigungs-
            Link moeglich.
          </p>
        </div>
        <ChangeEmailForm currentEmail={ctx.email ?? '–'} />
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
            Zwei-Faktor-Authentifizierung
          </h2>
          <p className="mt-1 text-sm text-[var(--color-muted-foreground)]">
            Zusaetzlicher Schutz beim Login: Nach Passwort-Eingabe wird ein 6-stelliger
            Code aus einer Authenticator-App (Google Authenticator, 1Password, Bitwarden,
            …) abgefragt. Wir empfehlen die Aktivierung fuer alle Owner-Konten.
          </p>
        </div>
        <MfaForm factors={factors} />

        {factors.length > 0 && (
          <div className="mt-6 border-t border-[var(--color-border)] pt-5">
            <div className="mb-3">
              <h3 className="text-sm font-semibold">Recovery-Codes</h3>
              <p className="mt-1 text-xs text-[var(--color-muted-foreground)]">
                Einmalige Ersatz-Codes fuer den Fall, dass Sie Ihr Authenticator-
                Geraet verlieren. Jeder Code kann genau einmal beim Login
                verwendet werden und entfernt danach den TOTP-Faktor —
                anschliessend richten Sie MFA direkt neu ein.
              </p>
            </div>
            <RecoveryCodesForm unusedCount={unusedCount} />
          </div>
        )}
      </section>

      <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] p-5">
        <div className="mb-4">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--color-muted-foreground)]">
            Anmeldeverlauf
          </h2>
          <p className="mt-1 text-sm text-[var(--color-muted-foreground)]">
            Ihre letzten 20 erfolgreichen Anmeldungen. Prüfen Sie diese Liste
            regelmässig — eine unbekannte IP oder ein fremder Browser kann
            ein Hinweis auf eine kompromittierte Sitzung sein.
          </p>
        </div>
        <LoginEventsList events={loginEvents} />
      </section>

      <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] p-5">
        <div className="mb-4">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--color-muted-foreground)]">
            Aktive Sitzungen
          </h2>
          <p className="mt-1 text-sm text-[var(--color-muted-foreground)]">
            Alle Geraete, auf denen Sie gerade eingeloggt sind. Beenden Sie einzelne
            Sitzungen, wenn Sie ein Geraet nicht wiedererkennen — Ihre aktuelle Sitzung
            hier bleibt davon unberuehrt.
          </p>
        </div>

        <SessionsList sessions={sessions} currentSessionId={currentSessionId} />

        {sessions.length > 1 && (
          <div className="mt-5 border-t border-[var(--color-border)] pt-4">
            <p className="mb-3 text-xs text-[var(--color-muted-foreground)]">
              Alle anderen Sitzungen auf einmal beenden:
            </p>
            <RevokeSessionsForm />
          </div>
        )}
      </section>
    </div>
  );
}
