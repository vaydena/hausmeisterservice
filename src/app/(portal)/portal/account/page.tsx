import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseServiceClient } from '@/lib/supabase/service';
import { getResidentContext } from '@/lib/portal/current';
import { getCurrentSessionId } from '@/lib/auth/current-session-id';
import { parseUserSessions } from '@/lib/auth/user-sessions';
import { ChangePortalEmailForm } from './change-email-form';
import { ChangePortalPasswordForm } from './change-password-form';
import { LoginEventsList } from '@/app/(app)/settings/account/login-events-list';
import { PortalMfaForm } from './mfa-form';
import { PortalRecoveryCodesForm } from './recovery-codes-form';
import { PortalSessionsList } from './sessions-list';
import { PortalRevokeSessionsForm } from './revoke-sessions-form';
import { PortalExportButton } from './portal-export-button';

export const metadata: Metadata = { title: 'Konto — Bewohner-Portal' };

/**
 * Konto-Seite fuer Portal-Residents. Sprint 32 → MFA, Sprint 33 →
 * Passwort-Aenderung, Sprint 34 → Session-Uebersicht, Sprint 35 →
 * MFA-Recovery-Codes, Sprint 37 → Anmeldeverlauf, Sprint 38 → E-Mail-
 * Aenderung. Alle Bloecke sind Selbstbedienung und parallel zu den
 * Staff-Sektionen unter /settings/account gebaut.
 */
export default async function PortalAccountPage({
  searchParams,
}: {
  searchParams: Promise<{ info?: string }>;
}) {
  const ctx = await getResidentContext();
  if (!ctx) redirect('/portal/login');
  const { info } = await searchParams;

  const supabase = await createSupabaseServerClient();
  const { data: factorsData } = await supabase.auth.mfa.listFactors();
  const factors = (factorsData?.totp ?? [])
    .filter((f) => f.status === 'verified')
    .map((f) => ({
      id: f.id,
      friendlyName: f.friendly_name ?? null,
      createdAt: f.created_at,
    }));

  // Sprint 34: Aktive Sessions. Load via service_role, weil auth.sessions
  // aus authenticated-Kontext nicht lesbar ist; die SECURITY-DEFINER-Function
  // list_user_sessions scoped selbst auf p_user_id = ctx.userId.
  const service = createSupabaseServiceClient();
  const { data: sessionsRaw } = await service.rpc('list_user_sessions', {
    p_user_id: ctx.userId,
  });
  const sessions = parseUserSessions(sessionsRaw);
  const currentSessionId = await getCurrentSessionId(supabase);

  // Sprint 35: Recovery-Codes-Zaehler. Function ist SECURITY DEFINER mit
  // execute-Grant nur auf service_role (Sprint 21 Lockdown).
  const { data: unusedCountData } = await service.rpc(
    'count_unused_mfa_recovery_codes',
    { p_user_id: ctx.userId },
  );
  const unusedRecoveryCodes = typeof unusedCountData === 'number' ? unusedCountData : 0;

  // Sprint 37: Anmeldeverlauf. RLS erlaubt dem User SELECT auf seine
  // eigenen Rows in auth_login_events — daher anon Server-Client, kein
  // service_role noetig. Portal-Logins landen dort seit Sprint 29 mit
  // endpoint = 'portal-login'; die List-Komponente formatiert das lesbar.
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

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Konto</h1>
        <p className="text-sm text-[var(--color-muted-foreground)]">
          Persoenliche Anmeldedaten fuer das Bewohner-Portal.
        </p>
      </header>

      {info === 'mfa-lost' && (
        <div
          role="status"
          className="rounded-md border border-[var(--color-primary)]/40 bg-[var(--color-primary)]/5 p-4 text-sm"
        >
          <p className="font-medium">Recovery-Code eingeloest.</p>
          <p className="mt-1 text-[var(--color-muted-foreground)]">
            Alle bisherigen MFA-Faktoren wurden entfernt. Bitte richten Sie
            die Zwei-Faktor-Authentifizierung jetzt direkt neu ein.
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
            Ihre neue Adresse ist jetzt aktiv. Beim naechsten Login verwenden
            Sie bitte die neue E-Mail.
          </p>
        </div>
      )}

      <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] p-5">
        <div className="mb-4">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--color-muted-foreground)]">
            Angemeldet als
          </h2>
          <p className="mt-1 text-sm">
            <span className="font-medium">{ctx.displayName}</span>
            {ctx.email && (
              <span className="text-[var(--color-muted-foreground)]"> · {ctx.email}</span>
            )}
          </p>
          {ctx.propertyName && (
            <p className="text-xs text-[var(--color-muted-foreground)]">
              {ctx.propertyName}
              {ctx.unitCode ? `, Einheit ${ctx.unitCode}` : ''}
            </p>
          )}
        </div>
      </section>

      <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] p-5">
        <div className="mb-4">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--color-muted-foreground)]">
            E-Mail-Adresse aendern
          </h2>
          <p className="mt-1 text-sm text-[var(--color-muted-foreground)]">
            Ihre E-Mail ist gleichzeitig Ihr Login-Name. Ein Wechsel wird
            per Bestaetigungs-Link an die neue Adresse abgesichert und
            wirkt sich erst nach Klick auf den Link aus.
          </p>
        </div>
        <ChangePortalEmailForm currentEmail={ctx.email ?? ''} />
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
        <ChangePortalPasswordForm />
      </section>

      <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] p-5">
        <div className="mb-4">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--color-muted-foreground)]">
            Zwei-Faktor-Authentifizierung
          </h2>
          <p className="mt-1 text-sm text-[var(--color-muted-foreground)]">
            Zusaetzlicher Schutz beim Login: Nach Passwort-Eingabe wird ein
            6-stelliger Code aus einer Authenticator-App (Google Authenticator,
            1Password, Bitwarden, …) abgefragt. Empfohlen, wenn Sie ueber das
            Portal sensible Nachrichten mit der Hausverwaltung austauschen.
          </p>
          <p className="mt-2 text-xs text-[var(--color-muted-foreground)]">
            Sollten Sie das Geraet mit der Authenticator-App verlieren,
            koennen Sie einen Recovery-Code verwenden (siehe unten) oder Ihre
            Hausverwaltung kontaktieren.
          </p>
        </div>
        <PortalMfaForm factors={factors} />

        {factors.length > 0 && (
          <div className="mt-6 border-t border-[var(--color-border)] pt-5">
            <div className="mb-3">
              <h3 className="text-sm font-semibold">Recovery-Codes</h3>
              <p className="mt-1 text-xs text-[var(--color-muted-foreground)]">
                Einmalige Ersatz-Codes fuer den Fall, dass Sie Ihr Authenticator-
                Geraet verlieren. Jeder Code kann genau einmal beim Login
                verwendet werden und entfernt danach den TOTP-Faktor —
                anschliessend richten Sie die Zwei-Faktor-Authentifizierung
                direkt neu ein.
              </p>
            </div>
            <PortalRecoveryCodesForm unusedCount={unusedRecoveryCodes} />
          </div>
        )}
      </section>

      <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] p-5">
        <div className="mb-4">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--color-muted-foreground)]">
            Aktive Sitzungen
          </h2>
          <p className="mt-1 text-sm text-[var(--color-muted-foreground)]">
            Alle Geraete, auf denen Sie gerade im Bewohner-Portal eingeloggt sind.
            Beenden Sie einzelne Sitzungen, wenn Sie ein Geraet nicht wiedererkennen —
            Ihre aktuelle Sitzung hier bleibt davon unberuehrt.
          </p>
        </div>

        <PortalSessionsList sessions={sessions} currentSessionId={currentSessionId} />

        {sessions.length > 1 && (
          <div className="mt-5 border-t border-[var(--color-border)] pt-4">
            <p className="mb-3 text-xs text-[var(--color-muted-foreground)]">
              Alle anderen Sitzungen auf einmal beenden:
            </p>
            <PortalRevokeSessionsForm />
          </div>
        )}
      </section>

      <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] p-5">
        <div className="mb-4">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--color-muted-foreground)]">
            Anmeldeverlauf
          </h2>
          <p className="mt-1 text-sm text-[var(--color-muted-foreground)]">
            Ihre letzten 20 erfolgreichen Anmeldungen im Bewohner-Portal.
            Pruefen Sie diese Liste gelegentlich — eine unbekannte IP oder
            ein fremder Browser kann ein Hinweis darauf sein, dass Ihr
            Passwort in fremde Haende geraten ist.
          </p>
        </div>
        <LoginEventsList events={loginEvents} />
      </section>

      <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] p-5">
        <div className="mb-4">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--color-muted-foreground)]">
            Datenauskunft &amp; Loeschung
          </h2>
          <p className="mt-1 text-sm text-[var(--color-muted-foreground)]">
            Nach Art. 15 DSGVO haben Sie das Recht auf Auskunft ueber alle
            personenbezogenen Daten, die zu Ihrem Bewohner-Konto gespeichert
            sind. Ueber den Button unten laden Sie diese Daten als
            maschinenlesbare JSON-Datei herunter.
          </p>
        </div>
        <PortalExportButton />
        <div className="mt-6 border-t border-[var(--color-border)] pt-4">
          <h3 className="text-sm font-semibold">Loeschung Ihrer Daten</h3>
          <p className="mt-2 text-sm text-[var(--color-muted-foreground)]">
            Ihr Bewohner-Datensatz (Name, Anschrift, Wohnungszuordnung)
            wird von Ihrer Hausverwaltung gepflegt und ist Teil eines
            bestehenden Vertragsverhaeltnisses zwischen Ihnen und der
            Hausverwaltung. Fuer Loeschung oder Berichtigung wenden Sie
            sich daher bitte direkt an Ihre Hausverwaltung — sie kann
            Ihren Zugang beenden und den Datensatz nach Ablauf der
            gesetzlichen Aufbewahrungsfristen entfernen.
          </p>
          <p className="mt-2 text-xs text-[var(--color-muted-foreground)]">
            Am schnellsten geht das ueber eine{' '}
            <a
              href="/portal/defects/new"
              className="text-[var(--color-primary)] hover:underline"
            >
              neue Meldung
            </a>{' '}
            im Portal.
          </p>
        </div>
      </section>
    </div>
  );
}
