import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const MIGRATIONS_DIR = join(process.cwd(), 'supabase', 'migrations');

/**
 * Matches the HEADER of a `CREATE POLICY` statement — everything from
 * `create policy` up to (but not including) the first `using`, `with check`,
 * or `;`. That header is the only place a `for <op>` clause can appear;
 * we deliberately do NOT include the body so a `for update` reference
 * inside a `with check` predicate (unlikely but possible) doesn't fool us.
 */
const POLICY_HEAD_RE =
  /create\s+policy\s+["']?([^"'\s]+)["']?\s+on\s+([a-zA-Z_.]+)([\s\S]*?)(?=\busing\b|\bwith\s+check\b|;)/gi;

/**
 * Postgres accepts any of these five operators. Omitting the `for` clause
 * altogether is legal — it defaults to `FOR ALL`, meaning the policy binds
 * SELECT, INSERT, UPDATE, AND DELETE at once. That is almost always a
 * mistake: the author wanted a scoped read policy but silently opened
 * write access too. This guard forces every policy to state the op set
 * out loud.
 */
type ForOp = 'select' | 'insert' | 'update' | 'delete' | 'all';
const FOR_OP_RE = /\bfor\s+(select|insert|update|delete|all)\b/i;

interface Policy {
  file: string;
  name: string;
  table: string;
  forOp: ForOp | null;
}

function extractPolicies(): Policy[] {
  const out: Policy[] = [];
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();
  for (const file of files) {
    const source = readFileSync(join(MIGRATIONS_DIR, file), 'utf8');
    for (const m of source.matchAll(POLICY_HEAD_RE)) {
      const name = m[1];
      const table = m[2];
      const head = m[3];
      if (!name || !table || head === undefined) continue;
      const opMatch = head.match(FOR_OP_RE);
      const forOp = (opMatch?.[1]?.toLowerCase() ?? null) as ForOp | null;
      out.push({ file, name, table, forOp });
    }
  }
  return out;
}

const POLICIES = extractPolicies();

function keyOf(p: Policy): string {
  return `${p.file}::${p.name}::${p.table}`;
}

/**
 * Policies that legitimately use `FOR ALL` — the caller really means
 * "same predicate for SELECT + INSERT + UPDATE + DELETE". Each entry
 * must justify WHY collapsing all four ops into one policy is correct
 * (usually: admin-config table where "you can edit at all" implies you
 * can also delete, and there's a separate `<name>_select` policy with a
 * looser predicate covering read).
 *
 * Key format: `${file}::${name}::${table}`.
 *
 * All seven current exceptions are tenant-config write policies in
 * 20260801000000_init.sql. They share the same shape:
 *   `for all using (is_tenant_member(tenant_id) and has_permission('core.*.manage'|'.edit'))`
 * paired with a wider `<name>_select` policy that only checks
 * `is_tenant_member`. That split matches the intent: any tenant member
 * can READ the config (so the shell renders), but only holders of the
 * management permission can WRITE (any of C/U/D). Rolling them into
 * three separate FOR INSERT/UPDATE/DELETE clauses would be pure
 * duplication with no security benefit.
 *
 *  - tenant_modules_write:      manage which modules the tenant enables
 *  - memberships_write:         invite / remove / suspend members
 *  - roles_write:               rename / delete tenant roles
 *  - role_permissions_write:    change which perms attach to a role
 *  - user_roles_write:          assign / revoke a user's role
 *  - user_groups_write:         create / delete user groups
 *  - user_group_members_write:  add / remove users from a group
 *
 * The test asserts entries stay stale-relevant: if any of these policies
 * ever gains a specific FOR op (e.g. someone splits it into
 * `roles_insert`, `roles_update`, `roles_delete`), the allowlist entry
 * becomes an error and forces removal.
 */
const INTENTIONALLY_FOR_ALL_POLICIES = new Set<string>([
  '20260801000000_init.sql::tenant_modules_write::public.tenant_modules',
  '20260801000000_init.sql::memberships_write::public.memberships',
  '20260801000000_init.sql::roles_write::public.roles',
  '20260801000000_init.sql::role_permissions_write::public.role_permissions',
  '20260801000000_init.sql::user_roles_write::public.user_roles',
  '20260801000000_init.sql::user_groups_write::public.user_groups',
  '20260801000000_init.sql::user_group_members_write::public.user_group_members',
  // 20260812081218_platform_layer_and_subscriptions.sql::plans_admin_all::platform.subscription_plans
  //   Nur Plattform-Admins (app_auth.is_platform_admin()) duerfen Plaene
  //   anlegen/aendern/loeschen. Der SELECT-Weg fuer Nicht-Admins laeuft
  //   ueber die separate plans_public_select-Policy (is_public=true). Das
  //   `for all` deckt hier bewusst INSERT+UPDATE+DELETE ab, weil der
  //   Admin-Gate fuer alle drei identisch ist.
  '20260812081218_platform_layer_and_subscriptions.sql::plans_admin_all::platform.subscription_plans',
  // 20260812081218_platform_layer_and_subscriptions.sql::invoices_admin_all::platform.invoices
  //   Analog: Plattform-Admins duerfen alles auf Betreiber-Rechnungen. Der
  //   Tenant-Owner-SELECT/INSERT-Weg laeuft ueber separate Policies
  //   (invoices_tenant_or_admin_select + invoices_tenant_insert). Das
  //   `for all` deckt hier den Admin-Weg fuer alle vier Operationen ab.
  '20260812081218_platform_layer_and_subscriptions.sql::invoices_admin_all::platform.invoices',
]);

describe('RLS policy explicit FOR-op coverage', () => {
  describe('sanity: extractor found something', () => {
    it('scanner discovered many policies', () => {
      expect(POLICIES.length).toBeGreaterThan(100);
    });
    it('at least one policy declares each of the four specific ops', () => {
      const ops = new Set(POLICIES.map((p) => p.forOp));
      // "all" is intentionally excluded here — we want proof that the
      // codebase actually uses fine-grained ops, not just FOR ALL.
      for (const needed of ['select', 'insert', 'update', 'delete'] as const) {
        expect(
          ops.has(needed),
          `Expected at least one policy with FOR ${needed.toUpperCase()}. If the extractor regex broke, every policy would fall through to forOp=null and this sanity check catches it before the per-policy tests do.`,
        ).toBe(true);
      }
    });
  });

  describe('every policy declares its FOR-op explicitly', () => {
    for (const p of POLICIES) {
      it(`${p.file} :: ${p.name} on ${p.table} has an explicit "for <op>" clause`, () => {
        expect(
          p.forOp,
          `Policy ${p.name} on ${p.table} (${p.file}) has no "for <op>" clause in its header. Postgres treats a missing clause as "for all", meaning the same predicate now gates SELECT, INSERT, UPDATE, AND DELETE — almost never what the author actually wanted. Fix: add an explicit "for select" / "for insert" / "for update" / "for delete" (or "for all" if you really do want a single predicate covering all four ops, in which case also add the key "${keyOf(p)}" to INTENTIONALLY_FOR_ALL_POLICIES with a written rationale).`,
        ).not.toBeNull();
      });
    }
  });

  describe('every "for all" policy is on the explicit allowlist', () => {
    for (const p of POLICIES.filter((x) => x.forOp === 'all')) {
      it(`${p.file} :: ${p.name} on ${p.table} is in INTENTIONALLY_FOR_ALL_POLICIES`, () => {
        expect(
          INTENTIONALLY_FOR_ALL_POLICIES.has(keyOf(p)),
          `Policy ${p.name} on ${p.table} (${p.file}) declares "for all", collapsing SELECT + INSERT + UPDATE + DELETE into a single predicate. That is a strong claim — the same auth check must be correct for reading AND for destructive writes. If that really is the intent (usually only true for admin-config tables where "if you can edit at all, you can also delete"), add the key "${keyOf(p)}" to INTENTIONALLY_FOR_ALL_POLICIES with a rationale explaining the semantics. If it isn't, split the policy into narrower FOR clauses (typically a "<name>_select" for reads plus separate write policies).`,
        ).toBe(true);
      });
    }
    for (const key of INTENTIONALLY_FOR_ALL_POLICIES) {
      it(`allowlist entry "${key}" is still a "for all" policy in the migrations`, () => {
        const hit = POLICIES.find((p) => keyOf(p) === key);
        expect(
          hit,
          `INTENTIONALLY_FOR_ALL_POLICIES contains "${key}" but no policy with that file/name/table exists in supabase/migrations/. Either the policy was renamed / removed (in which case delete the allowlist entry) or the file was renamed (update the key).`,
        ).toBeDefined();
        expect(
          hit?.forOp,
          `Allowlist entry "${key}" was added because the policy uses "for all", but its current forOp is "${hit?.forOp}". Remove the allowlist entry so the policy is guarded like any other narrow-op policy.`,
        ).toBe('all');
      });
    }
  });
});
