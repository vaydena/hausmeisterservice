import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const MIGRATIONS_DIR = join(process.cwd(), 'supabase', 'migrations');

function stripSqlComments(sql: string): string {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map((l) => l.replace(/--.*$/, ''))
    .join('\n');
}

/**
 * Walk each `create [or replace] function ...` from its start through the
 * matching dollar-quoted body terminator `$$;` (or a tagged variant like
 * `$fn$...$fn$;`). We need to bound the statement precisely so a `security
 * definer` string inside a function body (comment, or a nested CREATE
 * FUNCTION generated via EXECUTE) doesn't bleed into the enclosing
 * function's classification.
 */
function extractFunctionStatements(sql: string): string[] {
  const out: string[] = [];
  const re = /create\s+(?:or\s+replace\s+)?function\s+/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(sql)) !== null) {
    const start = m.index;
    const rest = sql.slice(start);
    const dollarTag = rest.match(/\$([a-z_]*)\$/i);
    let end = -1;
    if (dollarTag) {
      const tag = dollarTag[0];
      const openIdx = rest.indexOf(tag);
      const closeIdx = rest.indexOf(tag, openIdx + tag.length);
      if (closeIdx !== -1) {
        const semiIdx = rest.indexOf(';', closeIdx);
        if (semiIdx !== -1) end = start + semiIdx;
      }
    }
    if (end === -1) {
      const semiIdx = rest.indexOf(';');
      if (semiIdx !== -1) end = start + semiIdx;
    }
    if (end !== -1) out.push(sql.slice(start, end + 1));
  }
  return out;
}

const NAME_RE = /create\s+(?:or\s+replace\s+)?function\s+([a-z_.][a-z0-9_.]*)\s*\(/i;
const SECURITY_DEFINER_RE = /\bsecurity\s+definer\b/i;

interface FnDef {
  file: string;
  qualifiedName: string;
  schema: string;
  hasDefiner: boolean;
}

const ALL_FUNCTIONS: FnDef[] = [];
for (const file of readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort()) {
  const sql = stripSqlComments(readFileSync(join(MIGRATIONS_DIR, file), 'utf8'));
  for (const stmt of extractFunctionStatements(sql)) {
    const nm = stmt.match(NAME_RE);
    if (!nm) continue;
    const qualifiedName = nm[1]!.toLowerCase();
    const schema = qualifiedName.includes('.') ? qualifiedName.split('.')[0]! : '<implicit>';
    ALL_FUNCTIONS.push({
      file,
      qualifiedName,
      schema,
      hasDefiner: SECURITY_DEFINER_RE.test(stmt),
    });
  }
}

const DEFINER_FUNCTIONS = ALL_FUNCTIONS.filter((f) => f.hasDefiner);

/**
 * Schema prefix(es) where `security definer` is the intended pattern. We
 * scope this narrowly to `app_auth.*` — that schema is our conventional
 * "privileged helper" namespace: it holds trigger-support functions,
 * code-generators, notification-enqueue helpers and other utilities that
 * legitimately need to bypass RLS because they run on behalf of the
 * whole app, not on behalf of a specific caller. It is NOT exposed via
 * PostgREST (the API-facing schema is `public`), which is what makes
 * `security definer` safe there — a definer function in `app_auth.*` can
 * only be reached via triggers, other functions, or explicit
 * `select app_auth.foo(...)` from server-side code with the service
 * role, never from an unauthenticated HTTP caller.
 */
const ALLOWED_DEFINER_SCHEMAS = new Set<string>(['app_auth']);

/**
 * Explicit exceptions: individual `<schema>.<function>` names that need
 * `security definer` outside of `app_auth.*`. Each entry must justify
 * why it can't live in `app_auth.*` (typically: it needs to be exposed
 * as a PostgREST-callable RPC, so it MUST be in the `public` schema)
 * AND confirm what protects it from misuse (typically: an auth-scoped
 * `where` predicate on `auth.uid()` inside the function body).
 *
 *  - (none currently)
 *
 * Adding an entry here is a security-review moment: `public.*` +
 * `security definer` is exposed to every authenticated caller via
 * PostgREST as an RPC, running with owner (typically `postgres`)
 * privileges. If the function body doesn't itself filter on
 * `auth.uid()` or a similar caller-derived predicate, it is a
 * cross-tenant data exposure primitive.
 */
const INTENTIONALLY_DEFINER_OUTSIDE_APP_AUTH = new Set<string>([
  // public.provision_signup_tenant:
  //   PostgREST-callable RPC-Wrapper zum Selfsignup. Muss im Schema `public`
  //   liegen, damit PostgREST ihn ueber die service_role finden kann;
  //   `app_auth` ist fuer service_role nicht per USAGE freigegeben, dorthin
  //   verschieben wuerde den Callback-Flow permanent brechen (siehe Sprint
  //   9, Migration 20260812063727 fuer den Root-Cause). Der Body ist ein
  //   reiner Delegations-Aufruf mit typisierten Parametern an die
  //   app_auth.provision_signup_tenant-Kernfunktion; keine SQL-Interpolation,
  //   kein Zugriff auf caller-abhaengige Werte. Ausfuehrungsrechte wurden
  //   explizit von public/anon/authenticated zurueckgezogen — nur service_role
  //   darf den Wrapper ueberhaupt aufrufen. Damit ist der Wrapper kein
  //   Cross-Tenant-Read-Primitive: der Aufrufer muss ohnehin service_role
  //   sein, um ihn zu erreichen.
  'public.provision_signup_tenant',
  // platform.generate_invoice_number:
  //   Interner Trigger-Helper (DEFAULT-Wert fuer platform.invoices.invoice_number).
  //   Wird nur beim INSERT durch service_role-Aufrufe ausgeloest und ruft nur
  //   nextval('platform.invoice_number_seq') plus String-Formatting auf. Kein
  //   Argument, kein caller-abhaengiger Zweig, kein Zugriff auf Tenant-Daten.
  //   Muss in `platform.*` bleiben, damit die Default-Expression zur
  //   Tabellen-Erzeugungs-Zeit resolvbar ist; execute-Right ist ausschliesslich
  //   an service_role gegrantet.
  'platform.generate_invoice_number',
  // public.check_and_consume_auth_rate_limit:
  //   Rate-Limit-Kern-Function fuer Auth-Endpoints (Sprint 20). Muss im
  //   Schema `public` liegen, weil sie ueber PostgREST-RPC vom Service-
  //   Client (src/lib/security/rate-limit.ts) aufgerufen wird — `app_auth`
  //   ist fuer service_role nicht per USAGE freigegeben. Der Body operiert
  //   nur auf public.auth_rate_limits (deren RLS auf deny-all steht) und
  //   liest/schreibt ausschliesslich Zaehler-Metadaten, keine Tenant-Daten.
  //   Ausfuehrungsrechte sind explizit von anon/authenticated zurueckgezogen;
  //   nur service_role kann sie ueberhaupt aufrufen — damit ist der
  //   `p_limit`/`p_window_sec`-Missbrauchsvektor geschlossen (ein Angreifer
  //   mit anon/authenticated bekommt `permission denied for function`).
  'public.check_and_consume_auth_rate_limit',
  // public.reset_auth_rate_limit:
  //   Loescht den Rate-Limit-Zaehler nach erfolgreichem Login. Zwei-Zeilen-
  //   Function ohne Parameter-Interpolation. Dieselbe Rationale wie
  //   check_and_consume_auth_rate_limit — muss in `public` fuer PostgREST-
  //   RPC, execute nur an service_role. Keine Tenant-Daten im Body.
  'public.reset_auth_rate_limit',
  // public.cleanup_expired_auth_rate_limits:
  //   Optionaler Wartungs-Job. Loescht Rate-Limit-Eintraege deren Fenster
  //   laenger als 1 Tag zurueckliegen. Kein Argument, kein caller-abhaengiger
  //   Zweig, laeuft nur auf public.auth_rate_limits. Dieselbe RPC-Rationale;
  //   execute nur an service_role.
  'public.cleanup_expired_auth_rate_limits',
  // public.generate_mfa_recovery_codes_for_user:
  //   Loescht alle MFA-Recovery-Codes eines Users und legt einen frischen
  //   Batch bcrypt-gehashter Codes an (Sprint 26). Muss in `public` liegen
  //   fuer PostgREST-RPC vom Service-Client (src/lib/auth/mfa-recovery.ts).
  //   Body arbeitet nur auf public.auth_mfa_recovery_codes (RLS deny-all)
  //   und nutzt keine caller-abhaengigen Werte. Execute-Right ausschliesslich
  //   an service_role — anon/authenticated bekommt `permission denied for
  //   function`. Die aufrufende Server-Action gated auf auth.getUser() und
  //   uebergibt nur die eigene user_id, sodass ein Angreifer selbst mit
  //   service_role-Kompromittierung nicht fremde Recovery-Codes ueberschreiben
  //   koennte ohne direkten DB-Zugang.
  'public.generate_mfa_recovery_codes_for_user',
  // public.consume_mfa_recovery_code:
  //   Verifiziert einen Klartext-Code gegen die bcrypt-Hashes des Users und
  //   markiert ihn bei Match als used. Muss in `public` fuer PostgREST-RPC.
  //   Body arbeitet nur auf public.auth_mfa_recovery_codes (RLS deny-all).
  //   Execute nur an service_role. Sicherheitseigenschaft: der Aufrufer
  //   (src/app/(auth)/login/mfa/recovery/actions.ts) rate-limitet zusaetzlich
  //   IP-basiert (mfa-recovery, 5/15min).
  'public.consume_mfa_recovery_code',
  // public.count_unused_mfa_recovery_codes:
  //   Read-Only-Zaehler. Rueckgabe: Anzahl unbenutzter Codes eines Users
  //   fuer die Konto-UI. Same-shape wie oben — PostgREST-RPC, service_role-
  //   only, keine caller-abhaengige Interpolation.
  'public.count_unused_mfa_recovery_codes',
  // public.log_login_event:
  //   Schreibt einen erfolgreichen Login als Zeile in public.auth_login_events
  //   (Sprint 29). Muss in `public` fuer PostgREST-RPC vom Service-Client
  //   (src/lib/auth/log-login-event.ts). Insert auf eine Tabelle mit RLS
  //   SELECT-only-Policy und keinerlei INSERT-Policy — SECURITY DEFINER ist
  //   der einzige Weg, dorthin zu schreiben. Execute-Right ausschliesslich
  //   an service_role, damit ein Angreifer keine Fake-Events fuer beliebige
  //   User erzeugen kann. Die aufrufende Server-Action stellt user_id aus
  //   signInData.user (nicht aus der Formular-Payload), sodass IDs nicht
  //   spoofbar sind.
  'public.log_login_event',
  // public.list_user_sessions:
  //   Sprint 31. Liest aktive Sessions eines Users aus auth.sessions als
  //   JSON-Array fuer die Konto-UI. Muss in `public` fuer PostgREST-RPC
  //   vom Service-Client (src/app/(app)/settings/account/page.tsx). auth.*
  //   ist Supabase-verwaltet und aus authenticated-Kontext nicht lesbar;
  //   SECURITY DEFINER ist der einzige Weg dorthin. Execute-Right
  //   ausschliesslich an service_role — anon/authenticated bekommt
  //   `permission denied for function`. Die aufrufende Server-Page fuellt
  //   p_user_id nur mit ctx.userId aus requireTenantContext (nie aus einer
  //   Query-String-Payload); die WHERE-Clause im Body scoped ausserdem
  //   selbst auf user_id = p_user_id, sodass die Function kein Cross-
  //   Tenant-Read-Primitive ist.
  'public.list_user_sessions',
  // public.revoke_user_session:
  //   Sprint 31. Loescht eine Session-Row aus auth.sessions (kaskadiert auf
  //   auth.refresh_tokens, invalidiert die zugehoerige Refresh-Kette). Muss
  //   in `public` fuer PostgREST-RPC vom Service-Client
  //   (src/app/(app)/settings/account/actions.ts revokeSessionAction).
  //   Execute-Right ausschliesslich an service_role. Ownership-Guard im
  //   Body: DELETE ... WHERE id = p_session_id AND user_id = p_user_id —
  //   ein Aufruf mit fremder session_id kann keine fremde Session killen.
  //   Die aufrufende Server-Action passt p_user_id nur als ctx.userId
  //   durch und nimmt p_session_id aus einer Zod-validierten Formular-
  //   Payload; aal2-Guard vorgeschaltet.
  'public.revoke_user_session',
  // public.create_portal_message_thread:
  //   Sprint 53. Portal-Bewohner startet einen neuen Message-Thread mit der
  //   Hausverwaltung. Muss in `public` fuer PostgREST-RPC vom Portal-Server-
  //   Client (src/app/(portal)/portal/messages/actions.ts createPortalThreadAction).
  //   SECURITY DEFINER ist noetig, weil (a) die RLS-Policy auf
  //   message_threads.insert has_permission('messaging.create') verlangt (Bewohner
  //   haben diese Permission nicht) und (b) die Policy auf
  //   message_thread_participants.insert erwartet, dass der Caller bereits
  //   Participant ist — Henne-Ei-Problem beim initialen Anlegen weiterer
  //   Empfaenger. Sicherheitseigenschaften: v_tenant_id wird aus dem aktiven
  //   residents-Record des Callers gelesen, nicht aus einem Parameter — kein
  //   Cross-Tenant-Missbrauch. Empfaenger werden ausschliesslich aus
  //   memberships im gleichen Tenant gewaehlt, weiter gefiltert auf
  //   messaging.create-Permission — kein Bewohner-zu-Bewohner-Threading. Kein
  //   dynamisches SQL, keine caller-abhaengige Interpolation. Execute-Right
  //   ist an authenticated freigegeben (nicht anon), weil auth.uid() im Body
  //   die eigentliche Gate ist.
  'public.create_portal_message_thread',
]);

describe('Function security-definer scope coverage', () => {
  describe('sanity: extractor found something', () => {
    it('scanner discovered many function definitions', () => {
      expect(ALL_FUNCTIONS.length).toBeGreaterThan(20);
    });
    it('scanner discovered many security-definer functions', () => {
      expect(DEFINER_FUNCTIONS.length).toBeGreaterThan(20);
    });
  });

  describe('every security-definer function lives in an allowed schema', () => {
    for (const fn of DEFINER_FUNCTIONS.slice().sort((a, b) =>
      a.qualifiedName.localeCompare(b.qualifiedName),
    )) {
      it(`${fn.qualifiedName} (defined in ${fn.file}) is in an allowed definer schema`, () => {
        if (INTENTIONALLY_DEFINER_OUTSIDE_APP_AUTH.has(fn.qualifiedName)) {
          expect(
            ALLOWED_DEFINER_SCHEMAS.has(fn.schema),
            `${fn.qualifiedName} is on INTENTIONALLY_DEFINER_OUTSIDE_APP_AUTH but its schema (${fn.schema}) is now in ALLOWED_DEFINER_SCHEMAS. The exception is redundant — delete the entry.`,
          ).toBe(false);
          return;
        }
        expect(
          ALLOWED_DEFINER_SCHEMAS.has(fn.schema),
          `Function ${fn.qualifiedName} (defined in ${fn.file}) uses \`security definer\` but lives in schema "${fn.schema}", not one of the allowed definer schemas {${[...ALLOWED_DEFINER_SCHEMAS].join(', ')}}. This is dangerous because \`security definer\` makes the function run with the owner's privileges (typically \`postgres\`, which bypasses every RLS policy on every table), and any function in the \`public\` schema is exposed via PostgREST as an RPC callable by every authenticated user. Two ways forward: (1) move the function to \`app_auth.*\` if it is an internal helper (trigger support, code generator, notification enqueue — anything that shouldn't be directly callable from the client) and update every caller. (2) If the function genuinely must be a PostgREST-callable RPC (rare — most cross-tenant queries belong in server actions, not RPCs), add "${fn.qualifiedName}" to INTENTIONALLY_DEFINER_OUTSIDE_APP_AUTH with a written rationale explaining WHY it must be RPC-exposed AND confirming the function body itself filters on \`auth.uid()\` or an equivalent caller-derived predicate so it can't be turned into a cross-tenant read primitive.`,
        ).toBe(true);
      });
    }
  });

  describe('INTENTIONALLY_DEFINER_OUTSIDE_APP_AUTH entries stay stale-relevant', () => {
    it('every entry still matches a definer function outside the allowed schemas', () => {
      // Kept as a single test (not a per-entry loop) so it still runs
      // when the allowlist is empty — vitest fails the whole suite if a
      // describe() block has zero `it()` calls.
      const errors: string[] = [];
      for (const name of INTENTIONALLY_DEFINER_OUTSIDE_APP_AUTH) {
        const hit = DEFINER_FUNCTIONS.find((f) => f.qualifiedName === name);
        if (!hit) {
          errors.push(
            `INTENTIONALLY_DEFINER_OUTSIDE_APP_AUTH contains "${name}" but no such definer function exists in supabase/migrations/ anymore. Either the function was renamed, moved to app_auth.*, or lost its \`security definer\` designation. Delete the allowlist entry.`,
          );
          continue;
        }
        if (ALLOWED_DEFINER_SCHEMAS.has(hit.schema)) {
          errors.push(
            `Allowlist entry "${name}" is now in schema "${hit.schema}" which IS on the allowed definer schemas — the exception is redundant. Delete the entry.`,
          );
        }
      }
      expect(errors, errors.join('\n')).toEqual([]);
    });
  });
});
