/**
 * Onboarding-Seed — legt einen Demo-Tenant "Hausmeisterservice", System-Rollen
 * (aus Code-Registry), Owner-Membership und ein Set aktiver Module an.
 *
 * Voraussetzungen:
 *  - Permissions sind synchronisiert (`pnpm tsx supabase/seed/permissions.ts`)
 *  - .env.local mit SUPABASE_SERVICE_ROLE_KEY, SEED_ADMIN_EMAIL, SEED_ADMIN_PASSWORD
 *
 * Run:  pnpm tsx supabase/seed/onboarding.ts
 *
 * Idempotent: mehrfach ausführbar, kein Overwrite bereits konfigurierter Rollen.
 */

import { createClient } from '@supabase/supabase-js';
import { config as loadEnv } from 'dotenv';
import { resolve } from 'node:path';
import { SYSTEM_ROLE_TEMPLATES, PERMISSIONS } from '../../src/lib/permissions/registry';
import { CORE_MODULE_KEYS } from '../../src/lib/modules/registry';

loadEnv({ path: resolve(process.cwd(), '.env.local') });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const seedEmail = process.env.SEED_ADMIN_EMAIL;
const seedPassword = process.env.SEED_ADMIN_PASSWORD;

if (!url || !serviceKey || serviceKey.startsWith('PASTE_')) {
  console.error('SUPABASE_SERVICE_ROLE_KEY oder NEXT_PUBLIC_SUPABASE_URL fehlen in .env.local');
  process.exit(1);
}
if (!seedEmail || !seedPassword) {
  console.error(
    'SEED_ADMIN_EMAIL und SEED_ADMIN_PASSWORD müssen in .env.local gesetzt sein (siehe .env.example).',
  );
  process.exit(1);
}

const ownerEmail: string = seedEmail;
const ownerPassword: string = seedPassword;

const supabase = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const TENANT_NAME = 'Hausmeisterservice';
const TENANT_SLUG = 'hausmeisterservice';
const ACTIVE_MODULES = new Set<string>([...CORE_MODULE_KEYS]);

async function main() {
  console.log('1/6  Owner-User sicherstellen ...');
  const userId = await ensureOwnerUser();
  console.log(`    → user_id = ${userId}`);

  console.log('2/6  Tenant "Hausmeisterservice" sicherstellen ...');
  const tenantId = await ensureTenant();
  console.log(`    → tenant_id = ${tenantId}`);

  console.log('3/6  Membership + Profil sicherstellen ...');
  await ensureMembership(userId, tenantId);

  console.log('4/6  System-Rollen anlegen (idempotent) ...');
  const roleIdByKey = await ensureSystemRoles(tenantId);

  console.log('5/6  Owner-User erhält "admin"-Rolle ...');
  const adminRoleId = roleIdByKey.admin;
  if (!adminRoleId) throw new Error('System-Rolle "admin" konnte nicht angelegt werden.');
  await assignRole(userId, tenantId, adminRoleId);

  console.log('6/6  Core-Module aktivieren ...');
  await enableCoreModules(tenantId);

  console.log('\nFertig. Login:');
  console.log(`   URL:      ${process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'}/login`);
  console.log(`   E-Mail:   ${seedEmail}`);
  console.log(`   Passwort: (aus SEED_ADMIN_PASSWORD in .env.local)`);
}

async function ensureOwnerUser(): Promise<string> {
  const existing = await supabase.auth.admin.listUsers({ perPage: 200 });
  if (existing.error) throw existing.error;

  const found = existing.data.users.find((u) => u.email?.toLowerCase() === ownerEmail.toLowerCase());
  if (found) return found.id;

  const created = await supabase.auth.admin.createUser({
    email: ownerEmail,
    password: ownerPassword,
    email_confirm: true,
    user_metadata: { display_name: 'Administrator' },
  });
  if (created.error) throw created.error;
  return created.data.user!.id;
}

async function ensureTenant(): Promise<string> {
  const existing = await supabase.from('tenants').select('id').eq('slug', TENANT_SLUG).maybeSingle();
  if (existing.data) return existing.data.id;

  const created = await supabase
    .from('tenants')
    .insert({ name: TENANT_NAME, slug: TENANT_SLUG })
    .select('id')
    .single();
  if (created.error) throw created.error;
  return created.data.id;
}

async function ensureMembership(userId: string, tenantId: string) {
  await supabase
    .from('users')
    .upsert({ id: userId, display_name: 'Administrator' }, { onConflict: 'id' });

  const existing = await supabase
    .from('memberships')
    .select('id, is_owner')
    .eq('user_id', userId)
    .eq('tenant_id', tenantId)
    .maybeSingle();

  if (existing.data) {
    if (!existing.data.is_owner) {
      await supabase.from('memberships').update({ is_owner: true }).eq('id', existing.data.id);
    }
    return;
  }

  const { error } = await supabase.from('memberships').insert({
    user_id: userId,
    tenant_id: tenantId,
    status: 'active',
    is_owner: true,
  });
  if (error) throw error;
}

async function ensureSystemRoles(tenantId: string): Promise<Record<string, string>> {
  const map: Record<string, string> = {};
  const knownPermKeys = new Set(PERMISSIONS.map((p) => p.key));

  for (const tpl of SYSTEM_ROLE_TEMPLATES) {
    const existing = await supabase
      .from('roles')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('key', tpl.key)
      .maybeSingle();

    let roleId = existing.data?.id;
    if (!roleId) {
      const inserted = await supabase
        .from('roles')
        .insert({
          tenant_id: tenantId,
          key: tpl.key,
          name: tpl.nameDe,
          description: tpl.description,
          is_system: true,
        })
        .select('id')
        .single();
      if (inserted.error) throw inserted.error;
      roleId = inserted.data.id;
    }
    map[tpl.key] = roleId;

    const desired = tpl.permissions === '*' ? [...knownPermKeys] : tpl.permissions;
    const valid = desired.filter((key) => knownPermKeys.has(key));

    if (valid.length > 0) {
      const rows = valid.map((permission_key) => ({ role_id: roleId!, permission_key }));
      const { error } = await supabase
        .from('role_permissions')
        .upsert(rows, { onConflict: 'role_id,permission_key' });
      if (error) throw error;
    }
  }

  return map;
}

async function assignRole(userId: string, tenantId: string, roleId: string) {
  const existing = await supabase
    .from('user_roles')
    .select('id')
    .eq('user_id', userId)
    .eq('tenant_id', tenantId)
    .eq('role_id', roleId)
    .is('scope_type', null)
    .maybeSingle();

  if (existing.data) return;

  const { error } = await supabase.from('user_roles').insert({
    user_id: userId,
    tenant_id: tenantId,
    role_id: roleId,
    scope_type: null,
    scope_id: null,
  });
  if (error) throw error;
}

async function enableCoreModules(tenantId: string) {
  const rows = [...ACTIVE_MODULES].map((module_key) => ({
    tenant_id: tenantId,
    module_key,
    enabled: true,
  }));
  const { error } = await supabase
    .from('tenant_modules')
    .upsert(rows, { onConflict: 'tenant_id,module_key' });
  if (error) throw error;
}

main().catch((err) => {
  console.error('\nOnboarding-Seed fehlgeschlagen:', err);
  process.exit(1);
});
