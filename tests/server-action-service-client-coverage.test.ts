import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';

const SRC_DIR = join(process.cwd(), 'src');

function walkTsx(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const abs = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...walkTsx(abs));
    } else if (
      entry.isFile() &&
      (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx'))
    ) {
      out.push(abs);
    }
  }
  return out;
}

/**
 * A file is a Server-Actions module iff `'use server'` sits at file scope.
 * Every export in such a file becomes a Server Action callable from any
 * client component, so the Supabase client it picks matters a lot: the
 * anon/cookie-backed `createSupabaseServerClient` enforces the caller's
 * RLS scope, while `createSupabaseServiceClient` bypasses RLS entirely
 * (service-role JWT). Mixing the wrong one gives every client caller
 * root DB access for the duration of that action's body.
 */
const USE_SERVER_RE = /^\s*['"]use server['"];?\s*$/m;

/**
 * Static import of the service-client factory from `@/lib/supabase/service`.
 * Handles both named-import (`import { createSupabaseServiceClient }`) and
 * default-import shapes, because either would pull the RLS-bypassing
 * factory into scope.
 */
const SERVICE_IMPORT_RE =
  /\bimport\s+(?:\{[^}]*\bcreateSupabaseServiceClient\b[^}]*\}|createSupabaseServiceClient)\s+from\s+['"][^'"]*supabase\/service['"]/;

/**
 * A direct call to the factory. Imports without calls (e.g. type-only
 * usage) would also be caught by the import regex, but we track calls
 * separately so the diagnostic can point at the concrete failure.
 */
const SERVICE_CALL_RE = /\bcreateSupabaseServiceClient\s*\(/;

interface ServerActionFile {
  file: string;
  hasServiceImport: boolean;
  hasServiceCall: boolean;
}

const ALL_SERVER_ACTION_FILES: ServerActionFile[] = walkTsx(SRC_DIR)
  .map((abs) => {
    const source = readFileSync(abs, 'utf8');
    return { abs, source };
  })
  .filter((x) => USE_SERVER_RE.test(x.source))
  .map((x) => {
    const file = relative(process.cwd(), x.abs).replace(/\\/g, '/');
    return {
      file,
      hasServiceImport: SERVICE_IMPORT_RE.test(x.source),
      hasServiceCall: SERVICE_CALL_RE.test(x.source),
    };
  })
  .sort((a, b) => a.file.localeCompare(b.file));

const SERVICE_CLIENT_USERS = ALL_SERVER_ACTION_FILES.filter(
  (f) => f.hasServiceImport || f.hasServiceCall,
);

/**
 * Server-Actions files that legitimately use the RLS-bypassing service
 * client. Each entry must justify WHY the action cannot use the normal
 * anon+cookie client, and every callsite in the file must be behind an
 * explicit permission check that lands BEFORE the service-client call.
 *
 *  - src/app/(app)/people/employees/actions.ts:
 *      Employee invite flow. Calls `auth.admin.inviteUserByEmail` and
 *      `auth.admin.listUsers`, both of which require the service-role JWT
 *      by Supabase Auth-Admin design. Gated by
 *      `perms.has('employees.create')` + `perms.has('core.users_roles.create')`
 *      before the service client is ever constructed.
 *
 *  - src/app/(app)/people/residents/actions.ts:
 *      Resident portal-invite flow. Same reason as above — Auth-Admin
 *      APIs need the service role. Gated by the resident-management
 *      permission check earlier in the function.
 *
 *  - src/app/(app)/settings/automations/actions.ts:
 *      Three service-client callsites: (1) DELETE on `automation_dispatches`,
 *      which has no user-facing DELETE policy because the table is engine-
 *      owned; (2) INSERT into `sent_emails`, which is only writable by the
 *      engine (service role); (3) invoking `runRule(service, ...)` for
 *      manual-trigger test-sends, since the engine expects a service
 *      client as its DB handle. All three are gated by the automations
 *      management permission plus a tenant-id match on the rule row
 *      fetched via the anon client first.
 *
 * The test asserts entries stay stale-relevant: if any of these files
 * ever stops importing/calling the service client, the allowlist entry
 * becomes an error and forces removal (so we don't accumulate dead
 * allowlist noise).
 */
const INTENTIONALLY_SERVICE_CLIENT_ACTIONS = new Set<string>([
  'src/app/(app)/people/employees/actions.ts',
  'src/app/(app)/people/residents/actions.ts',
  // src/app/(app)/people/owners/actions.ts:
  //   Eigentümer-Portal-Einladung (inviteOwnerToPortalAction). Ruft
  //   auth.admin.inviteUserByEmail + auth.admin.listUsers — Auth-Admin-APIs,
  //   die per Supabase-Design den Service-Role-JWT verlangen — und schreibt
  //   danach owners.user_id/portal_invited_at. Gleiche Bauart wie die
  //   residents-Variante darueber. Gegated durch requireTenantContext +
  //   permissions.has('owners.edit') VOR der Konstruktion des Service-Clients
  //   (der Client entsteht erst nach dem Permission-Check). Die zweite
  //   exportierte Action (revokeOwnerPortalAccessAction) nutzt bewusst den
  //   normalen anon+cookie-Client, nicht den Service-Client.
  'src/app/(app)/people/owners/actions.ts',
  'src/app/(app)/settings/automations/actions.ts',
  // src/app/(auth)/signup/actions.ts:
  //   Self-Signup läuft pre-session (siehe INTENTIONALLY_UNAUTHENTICATED in
  //   server-action-auth-coverage.test.ts). Der einzige Service-Role-Aufruf
  //   ist eine read-only Existenz-Prüfung auf tenants.slug — nötig, weil
  //   die tenants-SELECT-Policy für anonyme Anrufer immer NULL zurückgibt
  //   (kein is_tenant_member-Match) und damit den Duplicate-Check ins Leere
  //   laufen ließe. Kein Write mit Service-Role in dieser Action; die
  //   eigentliche Tenant-Anlage findet erst nach E-Mail-Verify im
  //   /auth/callback-Route-Handler statt (dort transaktional via SECURITY-
  //   DEFINER-RPC). Missbrauchsfläche = ein Slug-Existenz-Oracle, das
  //   ohnehin über den Public-Signup-Flow einsehbar ist.
  'src/app/(auth)/signup/actions.ts',
  // src/app/(app)/dashboard/onboarding-actions.ts:
  //   Onboarding-Overlay-Dismiss durch den Mandanten-Inhaber. Setzt
  //   tenants.onboarding_completed_at auf now() und nur, wenn das Feld
  //   noch NULL ist (Idempotenz). Tenant-Owner haben in der aktuellen
  //   RLS auf public.tenants zwar SELECT, aber kein UPDATE — der Owner
  //   soll seinen eigenen Mandanten nicht direkt mutieren koennen, das
  //   ganze Tenant-Setting-UI laeuft ueber Server-Actions mit
  //   Permission-Gates. Diese Action ist gegated durch requireTenantContext
  //   + ctx.isOwner-Check VOR dem Service-Client-Aufruf; die Update-Clause
  //   ist auf ctx.tenantId + is null gescopt und aendert genau ein Feld.
  'src/app/(app)/dashboard/onboarding-actions.ts',
  // src/app/(portal)/portal/dashboard/portal-onboarding-actions.ts:
  //   Sprint 40. Analog zum Staff-Onboarding-Dismiss (siehe darueber),
  //   nur pro Resident-Datensatz statt pro Tenant. Setzt
  //   residents.portal_onboarding_completed_at = now() und nur, wenn
  //   das Feld noch NULL ist (Idempotenz). Die aktuelle residents-RLS
  //   erlaubt Residents ausschliesslich SELECT auf ihren eigenen
  //   Datensatz — kein UPDATE, weil residents-Datensaetze sonst rein
  //   verwaltungs-seitig gepflegt werden (Vertragsdaten, Objektzuordnung
  //   usw.). Diese Action ist gegated durch requireResidentContext VOR
  //   dem Service-Client-Aufruf; die Update-Clause ist auf ctx.residentId
  //   + is null gescopt und aendert genau ein Feld (das UI-Onboarding-
  //   Flag), keine Vertragsdaten.
  'src/app/(portal)/portal/dashboard/portal-onboarding-actions.ts',
  // src/app/(app)/settings/subscription/actions.ts:
  //   Abo-Verwaltung durch den Mandanten-Inhaber (Plan waehlen, Zahlungsart
  //   umstellen, Rechnung anfordern). Schreibt public.tenants
  //   (subscription_plan_id, subscription_interval, payment_method) und
  //   platform.invoices (INSERT). Beide Ziele haben keine user-facing
  //   UPDATE/INSERT-Policy fuer Tenant-Owner: tenants darf ein Owner nicht
  //   direkt mutieren (siehe onboarding-actions oben), und platform.invoices
  //   ist Betreiber-eigen (nur Plattform-Admins duerfen INSERT). Alle drei
  //   Actions sind gegated durch requireTenantContext + ctx.isOwner-Check
  //   VOR dem Service-Client-Aufruf; jede Update-Clause ist auf ctx.tenantId
  //   gescopt, und Cross-Tenant-Zugriffe sind unmoeglich, weil ctx.tenantId
  //   die einzige tenantId-Quelle in der Action ist.
  'src/app/(app)/settings/subscription/actions.ts',
  // src/app/platform/payments/actions.ts stand hier bis Sprint 138. Die
  // Mandanten-Aktivierung ist seither in @/lib/platform/activate-tenant
  // gekapselt, die Datei nennt createSupabaseServiceClient nicht mehr — und
  // dieser Test verlangt dann zu Recht, den Eintrag zu loeschen.
  //
  // Achtung, damit das niemand als "ist jetzt ungefaehrlich" liest: die
  // Aktion schreibt weiterhin fremde public.tenants mit Service-Rolle, nur
  // eine Aufrufebene tiefer. Dieser Scanner sieht ausschliesslich DIREKTE
  // Importe; gemessen am 16.08.2026 erreichen 9 Server-Action-Dateien die
  // Service-Rolle indirekt ueber @/lib (rate-limit, ensure-tenant,
  // log-login-event, tenant/features, demo-data, platform/*). Acht davon
  // schon vor Sprint 138. Ob der Scanner eine Ebene tief folgen soll, ist
  // eine eigene Entscheidung — eine gekapselte, selbst gegatete Helferin ist
  // strukturell besser als ein inline aufgemachter Service-Client, ein
  // pauschales Transitiv-Verbot wuerde also die bessere Bauweise bestrafen.
  // src/app/platform/tenants/actions.ts:
  //   Plattform-Admin-Werkzeuge: Tenant-Status setzen, Trial verlaengern,
  //   Plan wechseln, Tenant loeschen inkl. Storage-Cascade. Muss zwangslaeufig
  //   cross-tenant arbeiten (schreibt beliebige public.tenants und ruft
  //   storage.objects.remove auf fremden Bucket-Prefixes auf), was der
  //   RLS-basierte Server-Client per Design nicht kann. Gegated durch
  //   requirePlatformAdmin VOR jedem Service-Client-Aufruf; die
  //   deleteTenantAction erzwingt zusaetzlich einen Text-Vergleich mit dem
  //   Tenant-Namen als "sind Sie sicher"-Bestaetigung.
  'src/app/platform/tenants/actions.ts',
  // src/app/platform/actions.ts:
  //   Sprint 137. activateTenantPlanAction — der einzige Weg von "hat
  //   ueberwiesen" zu "darf arbeiten". Schreibt platform.invoices (INSERT
  //   des Belegs) und public.tenants (Status, Tarif, Abrechnungszeitraum)
  //   eines FREMDEN Mandanten; genau das kann der RLS-basierte
  //   Server-Client per Design nicht, und platform.invoices erlaubt seit
  //   Sprint 116 ohnehin keinen Client-INSERT mehr. Gegated durch
  //   requirePlatformAdmin als erste Anweisung, vor jedem Service-Client-
  //   Aufruf; tenantId und planId kommen aus einer uuid-Zod-Pruefung und
  //   werden beide vor dem Schreiben gegen die Datenbank aufgeloest.
  'src/app/platform/actions.ts',
  // src/app/(app)/settings/account/actions.ts:
  //   Sprint 26 + Sprint 31. Enthaelt (a) generateMfaRecoveryCodesAction,
  //   die die drei Recovery-Codes-Functions (generate/consume/count)
  //   aufruft, und (b) revokeSessionAction, die revoke_user_session
  //   aufruft. Alle vier Functions sind SECURITY DEFINER mit REVOKE
  //   EXECUTE FROM anon/authenticated und GRANT nur an service_role
  //   (Sprint 21 Lockdown-Muster). Der anon+cookie Server-Client kann
  //   sie also nicht aufrufen, egal welche RLS-Regel man auf die
  //   auth_mfa_recovery_codes-Tabelle setzen wuerde (die ist ohnehin
  //   deny-all) bzw. wie auth.sessions per Default fuer authenticated
  //   verriegelt ist (Supabase-internes Schema). Beide Actions sind
  //   gegated durch requireTenantContext + requireAal2WhenEnrolled VOR
  //   dem Service-Client-Aufruf; p_user_id wird ausschliesslich aus
  //   ctx.userId gesetzt (nie aus der Formular-Payload). Fuer
  //   revoke_user_session ist zusaetzlich die p_session_id Zod-uuid-
  //   validiert und die Function-Body macht ihren eigenen Ownership-
  //   Check (WHERE id = p_session_id AND user_id = p_user_id) — ein
  //   Angreifer mit erratener fremder session_id kann keine fremde
  //   Session killen. Ebenso liest list_user_sessions (via
  //   page.tsx-Server-Component) nur die eigenen Sessions des Users.
  'src/app/(app)/settings/account/actions.ts',
  // src/app/(auth)/login/mfa/recovery/actions.ts:
  //   Sprint 26. Loest einen Recovery-Code beim MFA-Login-Prompt ein und
  //   entfernt danach alle MFA-Faktoren des Users via
  //   auth.admin.mfa.deleteFactor (Auth-Admin API benoetigt service_role).
  //   Zusaetzlich ruft die Action consume_mfa_recovery_code, dessen
  //   execute-Grant nur an service_role vergeben ist (Sprint 21 Lockdown).
  //   Gegated durch (a) IP-basierter Rate-Limit mfa-recovery, (b) explizite
  //   getUser()-Session-Pruefung VOR dem Service-Client-Aufruf, (c)
  //   userId kommt aus getUser() — nicht aus der Formular-Payload, ein
  //   Angreifer kann also keine Fremd-Codes einloesen. Der Anon-Client kann
  //   die RPC nicht aufrufen (Grant fehlt) und die Auth-Admin-API nicht
  //   nutzen (service_role only).
  'src/app/(auth)/login/mfa/recovery/actions.ts',
  // src/app/(portal)/portal/account/actions.ts:
  //   Sprint 34 + Sprint 35. Enthaelt (a) revokePortalSessionAction, die
  //   revoke_user_session ruft, und (b) generatePortalMfaRecoveryCodesAction,
  //   die generate_mfa_recovery_codes_for_user ruft. Beide Functions sind
  //   SECURITY DEFINER mit REVOKE EXECUTE FROM anon/authenticated und GRANT
  //   nur an service_role (Sprint 21 + Sprint 31 Lockdown-Muster). Der anon+
  //   cookie Server-Client kann sie also nicht aufrufen, egal welche RLS-
  //   Regel man auf die zugrundeliegenden Tabellen setzen wuerde (auth.sessions
  //   ist Supabase-internes Schema und per Default fuer authenticated
  //   verriegelt, auth_mfa_recovery_codes ist deny-all). Beide Actions sind
  //   gegated durch requireResidentContext + requireAal2WhenEnrolled VOR
  //   dem Service-Client-Aufruf; p_user_id wird ausschliesslich aus
  //   ctx.userId gesetzt (nie aus der Formular-Payload). Fuer
  //   revoke_user_session ist zusaetzlich die p_session_id Zod-uuid-
  //   validiert und die Function-Body macht ihren eigenen Ownership-Check
  //   (WHERE id = p_session_id AND user_id = p_user_id) — ein Angreifer mit
  //   erratener fremder session_id kann keine fremde Session killen. Die
  //   Portal-page.tsx-Server-Component ruft ebenfalls list_user_sessions
  //   und count_unused_mfa_recovery_codes (gleicher Lockdown) ueber einen
  //   eigenen service-Client-Aufruf — der lebt aber in der Server-Component,
  //   nicht in der Server-Actions-Datei, und wird von diesem Coverage-Test
  //   nicht erfasst.
  'src/app/(portal)/portal/account/actions.ts',
  // src/app/melden/[token]/actions.ts:
  //   Sprint 124. Oeffentliche Maengelmeldung ueber einen QR-Aufkleber.
  //   Der Aufrufer hat per Definition keine Session, also auch keine
  //   Tenant-Zugehoerigkeit — der anon+cookie-Client hat auf
  //   defect_reports, documents und dem attachments-Bucket exakt null
  //   Rechte, und eine anon-INSERT-Policy waere die schlechtere Loesung:
  //   sie waere fuer JEDEN anonymen Aufrufer offen, nicht nur fuer den
  //   mit einem gueltigen Token, und muesste die Token-Pruefung in SQL
  //   nachbauen.
  //
  //   Die Berechtigungspruefung ist hier kein Permission-Check (es gibt
  //   keinen Benutzer), sondern der Token: resolveReportLink laeuft VOR
  //   jedem Service-Client-Schreibzugriff und liefert tenant_id,
  //   property_id und building_id. Diese drei sind die einzigen Quellen
  //   fuer den Insert — aus der Formular-Payload kommt nichts, was den
  //   Mandanten oder das Objekt bestimmen koennte. Vorgelagert stehen
  //   Formatpruefung und zwei Rate-Limits (siehe die ausfuehrliche
  //   Begruendung in server-action-auth-coverage.test.ts).
  //
  //   Geschrieben wird ausschliesslich: eine defect_reports-Zeile mit
  //   `status = 'new'` (Vorstufe, kein Auftrag) und optional ein
  //   documents-Eintrag plus Storage-Blob unter dem Tenant-Prefix.
  //   Gelesen wird nichts ausser der eigenen frisch angelegten Zeile.
  'src/app/melden/[token]/actions.ts',
]);

describe('Server-Action service-client coverage', () => {
  describe('sanity: extractor found something', () => {
    it('scanner discovered many "use server" files', () => {
      expect(ALL_SERVER_ACTION_FILES.length).toBeGreaterThan(10);
    });
    it('at least one server-action file uses the service client', () => {
      // If this collapses to 0, either the codebase legitimately dropped
      // every service-client callsite (great — then also delete the whole
      // allowlist and this guard becomes trivially green forever) or the
      // extractor regex broke. Either way this sanity check catches it
      // before per-file assertions look green trivially.
      expect(SERVICE_CLIENT_USERS.length).toBeGreaterThan(0);
    });
  });

  describe('every service-client user is on the explicit allowlist', () => {
    for (const f of SERVICE_CLIENT_USERS) {
      it(`${f.file} is in INTENTIONALLY_SERVICE_CLIENT_ACTIONS`, () => {
        expect(
          INTENTIONALLY_SERVICE_CLIENT_ACTIONS.has(f.file),
          `${f.file} is a Server-Actions module ("'use server'" at file scope) and imports or calls createSupabaseServiceClient. That factory returns a client authenticated with SUPABASE_SERVICE_ROLE_KEY, which bypasses every RLS policy on every table. Any client component can call the exported Server Actions in this file, so effectively the whole file runs with root DB privileges for the duration of each action's body. Two ways forward: (1) if the action doesn't actually need to bypass RLS (most don't), replace the service client with createSupabaseServerClient() from @/lib/supabase/server so RLS enforces the caller's tenant scope; (2) if the action genuinely needs the service role (Auth-Admin APIs like auth.admin.inviteUserByEmail, or writing to engine-owned tables like sent_emails / automation_dispatches that have no user-facing write policy), add "${f.file}" to INTENTIONALLY_SERVICE_CLIENT_ACTIONS with a written rationale explaining WHY the anon client won't work AND confirming every callsite is behind a permission check.`,
        ).toBe(true);
      });
    }
    for (const entry of INTENTIONALLY_SERVICE_CLIENT_ACTIONS) {
      it(`allowlist entry "${entry}" still exists and still uses the service client`, () => {
        expect(
          existsSync(join(process.cwd(), entry)),
          `INTENTIONALLY_SERVICE_CLIENT_ACTIONS contains "${entry}" but that file no longer exists. Delete the allowlist entry.`,
        ).toBe(true);
        const hit = ALL_SERVER_ACTION_FILES.find((x) => x.file === entry);
        expect(
          hit,
          `INTENTIONALLY_SERVICE_CLIENT_ACTIONS contains "${entry}" but the file no longer has "'use server'" at file scope. Either it stopped being a Server-Actions module (delete the allowlist entry) or the directive was moved (find the new file and update the entry).`,
        ).toBeDefined();
        expect(
          hit?.hasServiceImport || hit?.hasServiceCall,
          `Allowlist entry "${entry}" was added because it imported/called createSupabaseServiceClient, but it no longer does. Delete the allowlist entry so this file is guarded like any other Server-Actions module.`,
        ).toBe(true);
      });
    }
  });
});
