/**
 * Permission-Sync — spiegelt die Code-Registry (src/lib/permissions/registry.ts)
 * in die Supabase-Tabelle `public.permissions`. Idempotenter Upsert.
 *
 * Run:  pnpm tsx supabase/seed/permissions.ts
 *
 * Bedingt SUPABASE_SERVICE_ROLE_KEY in .env.local — Roh-INSERT ins Permissions-
 * Register wird via RLS für authenticated blockiert (nur Service-Role darf schreiben).
 */

import { createClient } from '@supabase/supabase-js';
import { config as loadEnv } from 'dotenv';
import { resolve } from 'node:path';
import { PERMISSIONS } from '../../src/lib/permissions/registry';

loadEnv({ path: resolve(process.cwd(), '.env.local') });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey || serviceKey.startsWith('PASTE_')) {
  console.error(
    'Fehlende Env-Variablen: NEXT_PUBLIC_SUPABASE_URL und/oder SUPABASE_SERVICE_ROLE_KEY nicht gesetzt in .env.local',
  );
  process.exit(1);
}

const supabase = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function main() {
  const rows = PERMISSIONS.map((p) => ({
    key: p.key,
    module_key: p.module,
    action: p.action,
    label_de: p.labelDe,
    description: p.description,
    scopable: p.scopable,
  }));

  console.log(`Sync ${rows.length} Permissions in public.permissions ...`);

  const { error } = await supabase.from('permissions').upsert(rows, { onConflict: 'key' });
  if (error) {
    console.error('Upsert fehlgeschlagen:', error);
    process.exit(1);
  }

  const { data: dbKeys, error: fetchError } = await supabase
    .from('permissions')
    .select('key');
  if (fetchError) {
    console.error('Lesen fehlgeschlagen:', fetchError);
    process.exit(1);
  }

  const dbSet = new Set(dbKeys?.map((r) => r.key) ?? []);
  const codeSet = new Set(rows.map((r) => r.key));

  const stale = [...dbSet].filter((k) => !codeSet.has(k));
  if (stale.length > 0) {
    console.warn(
      `WARN: ${stale.length} Permissions existieren nur in der DB, nicht mehr im Code:\n  - ${stale.join('\n  - ')}\nDiese werden NICHT automatisch gelöscht (wegen Referenzen aus role_permissions).`,
    );
  }

  console.log(`Fertig. ${rows.length} Permissions synchron.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
