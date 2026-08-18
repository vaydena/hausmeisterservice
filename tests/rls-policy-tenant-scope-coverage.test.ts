import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const MIGRATIONS_DIR = join(process.cwd(), 'supabase', 'migrations');

/**
 * Matches a `CREATE POLICY` statement up to its terminating semicolon.
 * Captures the policy name, target table, and full body (everything between
 * the table name and the trailing `;`). Uses /gi so both `CREATE POLICY`
 * and `create policy` are found and case-insensitively.
 *
 * Assumption: no policy body in this codebase contains a semicolon inside
 * a string literal. Verified via the feasibility check — all 177 policies
 * extract with sensible name/table/body groups. If a future policy ever
 * embeds `;` in a string constant, tighten the terminator to match `;` at
 * a line boundary instead.
 */
const POLICY_RE = /create\s+policy\s+["']?([^"'\s]+)["']?\s+on\s+([a-zA-Z_.]+)([\s\S]*?);/gi;

/**
 * Auth-scoping helpers that anchor a policy to a specific tenant or resident.
 *  - app_auth.current_tenant_id(): the caller's tenant, extracted from JWT.
 *  - app_auth.is_tenant_member(...): membership check for a given tenant.
 *  - app_auth.has_permission(...): permission gate (implicitly tenant-scoped).
 *  - app_auth.is_resident_of_tenant / is_resident_of_tenant: portal-side
 *    resident membership check.
 *  - app_auth.is_platform_admin(): caller has a row in platform.admins;
 *    strictly narrower than "any authenticated" and cannot be obtained via
 *    the self-signup flow, so a policy gated on it is not tenant-scoped in
 *    the usual sense but is auth-scoped to a small, hand-maintained set of
 *    operator accounts — which is the point (cross-tenant admin tooling).
 *  - auth.uid(): the caller's user id — used as an ownership fallback when
 *    the row is user-scoped rather than tenant-scoped (e.g. push_subscriptions).
 *  - app_auth.is_property_owner_of_tenant / property_owner_owns_property /
 *    current_property_owner_id: portal-side PROPERTY-owner scoping
 *    (Eigentümerportal, 20260817130000_owner_portal.sql). Spiegel der
 *    resident-Helfer: is_property_owner_of_tenant prueft, dass der Aufrufer
 *    einen aktiven owners-Datensatz im Mandanten hat; property_owner_owns_
 *    property prueft die M:N-Verknuepfung owner_properties zu genau einem
 *    Objekt; current_property_owner_id loest die owners.id des Aufrufers auf
 *    (fuer invoices.owner_id). Alle drei sind SECURITY-DEFINER-Funktionen ueber
 *    owners/owner_properties, gekeyed auf auth.uid() — also echte Auth-Scopes,
 *    nicht "any authenticated".
 *
 * A policy that references NONE of these is effectively public — anyone with
 * a session (or in the case of `to public`, anyone at all) can hit the row.
 * That is almost always a bug: it means the policy silently opens the table
 * to the entire authenticated surface, defeating tenant isolation.
 */
const AUTH_FN_RE =
  /app_auth\.current_tenant_id|app_auth\.is_tenant_member|app_auth\.has_permission|app_auth\.is_resident_of_tenant|app_auth\.is_platform_admin|app_auth\.is_property_owner_of_tenant|app_auth\.property_owner_owns_property|app_auth\.current_property_owner_id|is_resident_of_tenant|auth\.uid/i;

interface Policy {
  file: string; // migration filename
  name: string; // policy name
  table: string; // schema-qualified table
  body: string; // everything between the table name and `;`
  hasAuthFn: boolean;
}

function extractPolicies(): Policy[] {
  const out: Policy[] = [];
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();
  for (const file of files) {
    const source = readFileSync(join(MIGRATIONS_DIR, file), 'utf8');
    for (const m of source.matchAll(POLICY_RE)) {
      const name = m[1];
      const table = m[2];
      const body = m[3];
      if (!name || !table || body === undefined) continue;
      out.push({
        file,
        name,
        table,
        body: body.trim(),
        hasAuthFn: AUTH_FN_RE.test(body),
      });
    }
  }
  return out;
}

const POLICIES = extractPolicies();

/**
 * Policies that intentionally have NO auth-fn reference in their body.
 * Each entry must justify why "no auth scoping" is the correct semantics —
 * otherwise the fix is to add scoping, not to add an allowlist entry.
 *
 * Key format: `${file}::${name}::${table}` (file first because the same
 * policy name might appear on different tables in different migrations).
 *
 *  - 20260801000000_init.sql::tenants_insert::public.tenants
 *    `for insert with check (false)` — hard lockdown. RLS-visible inserts
 *    into the `tenants` table are forbidden entirely; new tenants are
 *    provisioned exclusively by the service-role client during onboarding
 *    (which bypasses RLS by design). A `false` WITH CHECK is strictly
 *    stronger than any auth-fn check — it denies everything.
 *
 *  - 20260801000000_init.sql::permissions_select::public.permissions
 *    `for select to authenticated using (true)` — the `permissions` table
 *    is the global permission-key REGISTRY (e.g. `work_orders.create`),
 *    not tenant-scoped data. Every authenticated user reads it to render
 *    permission-picker UIs and role editors. There is no per-tenant
 *    variation, so tenant-scoping would be nonsensical.
 *
 * The test asserts entries stay stale-relevant: once a policy in this list
 * gains an auth-fn reference, the allowlist entry becomes an error and
 * forces removal. That is important because both current exceptions are
 * fundamentally load-bearing — a future edit that adds `where tenant_id = …`
 * to `permissions_select` (say, for a hypothetical per-tenant permission set)
 * must fail this guard so the exception is re-reviewed.
 */
const INTENTIONALLY_UNSCOPED_POLICIES = new Set<string>([
  '20260801000000_init.sql::tenants_insert::public.tenants',
  '20260801000000_init.sql::permissions_select::public.permissions',
  // Sprint 49 · Explizite deny-all-Policies auf beiden service-only-Auth-
  // Tabellen. `using (false)` + `with check (false)` verweigert jedem
  // Client jeden Zugriff — eine Tenant-/User-Scoping-Referenz waere hier
  // sinnlos, weil das Praedikat ohnehin nie zutrifft. Der App-Layer nutzt
  // ausschliesslich SECURITY DEFINER-Functions (Sprint 20/21/26) und den
  // service_role (bypassrls). Die Policies existieren nur, damit der
  // Supabase-Advisor nicht mehr rls_enabled_no_policy meldet und die
  // Absicht "kein Client-Zugriff" im Schema lesbar ist statt implizit.
  '20260815110000_auth_service_only_tables_explicit_deny_all.sql::auth_rate_limits_deny_all_client::public.auth_rate_limits',
  '20260815110000_auth_service_only_tables_explicit_deny_all.sql::auth_mfa_recovery_codes_deny_all_client::public.auth_mfa_recovery_codes',
  // Sprint 122 · Rollenvorlagen. Dieselbe Bauart wie public.permissions
  // eine Zeile weiter oben: globale Referenzdaten ohne tenant_id. Die
  // Tabellen enthalten die 15 Startrollen und deren Rechte, aus denen die
  // Signup-Provisionierung die Rollen eines NEUEN Mandanten kopiert. Es
  // gibt nichts, wonach man hier scopen koennte — die Vorlagen sind fuer
  // alle Mandanten identisch, und nach dem Kopieren gehoert die Rolle dem
  // Mandanten (public.roles, dort greift die Tenant-Isolation).
  // Geschrieben wird ausschliesslich per service_role
  // (supabase/seed/role-templates.ts); die _no_write-Policies sperren
  // jeden Client-Schreibzugriff mit (false).
  '20260816120000_role_templates_and_signup_provisioning.sql::role_templates_select::public.role_templates',
  '20260816120000_role_templates_and_signup_provisioning.sql::role_templates_no_write::public.role_templates',
  '20260816120000_role_templates_and_signup_provisioning.sql::role_template_permissions_select::public.role_template_permissions',
  '20260816120000_role_templates_and_signup_provisioning.sql::role_template_permissions_no_write::public.role_template_permissions',
]);

function keyOf(p: Policy): string {
  return `${p.file}::${p.name}::${p.table}`;
}

describe('RLS policy tenant-scope coverage', () => {
  describe('sanity: extractor found something', () => {
    it('scanner discovered many policies', () => {
      // Floor is generous; today the count is 177. If the extractor ever
      // stops matching (bad regex, wrong dir), the count collapses and
      // this bound catches it before the per-policy assertions do.
      expect(POLICIES.length).toBeGreaterThan(100);
    });
    it('at least one policy references an auth helper', () => {
      expect(POLICIES.some((p) => p.hasAuthFn)).toBe(true);
    });
  });

  describe('every policy body references a tenant-/resident-/user-scope helper', () => {
    for (const p of POLICIES) {
      it(`${p.file} :: ${p.name} on ${p.table} references an auth helper (or is a whitelisted unscoped policy)`, () => {
        const key = keyOf(p);
        if (INTENTIONALLY_UNSCOPED_POLICIES.has(key)) {
          expect(
            p.hasAuthFn,
            `${key} is in INTENTIONALLY_UNSCOPED_POLICIES but its body now references an auth helper. Remove the allowlist entry so this policy is guarded like any other — or, if the auth-fn reference is spurious (e.g. a comment), adjust so the guard reads it correctly.`,
          ).toBe(false);
          return;
        }
        expect(
          p.hasAuthFn,
          `Policy ${p.name} on ${p.table} (${p.file}) has neither USING nor WITH CHECK reference to any tenant-scoping helper (app_auth.current_tenant_id / app_auth.is_tenant_member / app_auth.has_permission / is_resident_of_tenant / auth.uid). That makes the policy effectively public: anyone with a session — or in the case of "to public", anyone at all — can satisfy it, defeating the multi-tenant isolation that RLS is supposed to enforce. Body was: ${JSON.stringify(p.body.slice(0, 300))}. Fix: add "using (app_auth.is_tenant_member(<table>.tenant_id))" (or the equivalent scoping predicate for the row type), or — only if the table is legitimately global/public (e.g. a shared enum registry) — add the key "${key}" to INTENTIONALLY_UNSCOPED_POLICIES with a written rationale.`,
        ).toBe(true);
      });
    }
  });
});
