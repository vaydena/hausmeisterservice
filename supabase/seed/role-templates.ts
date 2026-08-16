/**
 * Rollenvorlagen-Sync — spiegelt SYSTEM_ROLE_TEMPLATES aus
 * src/lib/permissions/registry.ts in `public.role_templates` +
 * `public.role_template_permissions`. Idempotenter Upsert.
 *
 * Run:  pnpm tsx supabase/seed/role-templates.ts
 *
 * Warum ueberhaupt in die DB: `app_auth.provision_signup_tenant` legt beim
 * Signup die Startrollen des neuen Mandanten an und laeuft in Postgres. Eine
 * TypeScript-Konstante kann sie dort nicht lesen. Derselbe Weg wie bei den
 * Permissions (supabase/seed/permissions.ts): Code ist die Wahrheit, die
 * Tabelle ist ihr Spiegel.
 *
 * Reihenfolge: NACH permissions.ts ausfuehren —
 * role_template_permissions.permission_key hat einen FK auf permissions.key.
 *
 * Bedingt SUPABASE_SERVICE_ROLE_KEY in .env.local (RLS erlaubt authenticated
 * ausdruecklich kein Schreiben).
 */

import { createClient } from '@supabase/supabase-js';
import { config as loadEnv } from 'dotenv';
import { resolve } from 'node:path';
import { PERMISSIONS, SYSTEM_ROLE_TEMPLATES } from '../../src/lib/permissions/registry';

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

const ALL_PERMISSION_KEYS = new Set(PERMISSIONS.map((p) => p.key));

/**
 * "Alle Rechte" heisst: die Vorlage deckt jede registrierte Permission ab —
 * entweder als `'*'` (superadmin) oder als vollstaendige Liste (admin).
 * Bewusst nicht ueber die reine Laenge entschieden: eine Vorlage mit
 * genauso vielen, aber anderen Keys ist nicht dasselbe.
 */
function coversEverything(permissions: readonly string[] | '*'): boolean {
  if (permissions === '*') return true;
  const unique = new Set(permissions);
  return unique.size === ALL_PERMISSION_KEYS.size && [...unique].every((k) => ALL_PERMISSION_KEYS.has(k));
}

async function main() {
  // Tippfehler in der Registry wuerden sonst als FK-Verletzung beim Insert
  // auflaufen — mit einer Meldung, die nicht sagt, welche Vorlage schuld ist.
  const unknown: string[] = [];
  for (const tpl of SYSTEM_ROLE_TEMPLATES) {
    if (tpl.permissions === '*') continue;
    for (const key of tpl.permissions) {
      if (!ALL_PERMISSION_KEYS.has(key)) unknown.push(`${tpl.key} → ${key}`);
    }
  }
  if (unknown.length > 0) {
    console.error(
      `Unbekannte Permission-Keys in SYSTEM_ROLE_TEMPLATES:\n  - ${unknown.join('\n  - ')}`,
    );
    process.exit(1);
  }

  const templateRows = SYSTEM_ROLE_TEMPLATES.map((tpl, index) => ({
    key: tpl.key,
    name_de: tpl.nameDe,
    description: tpl.description,
    editable: tpl.editable,
    all_permissions: coversEverything(tpl.permissions),
    sort_order: index,
  }));

  console.log(`Sync ${templateRows.length} Rollenvorlagen in public.role_templates ...`);

  const upsert = await supabase.from('role_templates').upsert(templateRows, { onConflict: 'key' });
  if (upsert.error) {
    console.error('Upsert role_templates fehlgeschlagen:', upsert.error);
    process.exit(1);
  }

  // Vorlagen, die es im Code nicht mehr gibt, verschwinden auch in der DB.
  // Anders als bei Permissions ist das gefahrlos: bereits angelegte Rollen
  // eines Mandanten sind Kopien, keine Verweise — sie bleiben unberuehrt.
  const existing = await supabase.from('role_templates').select('key');
  if (existing.error) {
    console.error('Lesen role_templates fehlgeschlagen:', existing.error);
    process.exit(1);
  }
  const codeKeys = new Set(templateRows.map((r) => r.key));
  const stale = (existing.data ?? []).map((r) => r.key).filter((k) => !codeKeys.has(k));
  if (stale.length > 0) {
    const del = await supabase.from('role_templates').delete().in('key', stale);
    if (del.error) {
      console.error('Loeschen veralteter Vorlagen fehlgeschlagen:', del.error);
      process.exit(1);
    }
    console.log(`${stale.length} veraltete Vorlage(n) entfernt: ${stale.join(', ')}`);
  }

  // Rechte pro Vorlage vollstaendig neu setzen. Ein Upsert allein wuerde
  // entfernte Rechte stehen lassen — die Vorlage wuerde mehr vergeben, als
  // im Code steht, und genau das faellt niemandem auf.
  let permissionRowCount = 0;
  for (const tpl of SYSTEM_ROLE_TEMPLATES) {
    const wipe = await supabase
      .from('role_template_permissions')
      .delete()
      .eq('template_key', tpl.key);
    if (wipe.error) {
      console.error(`Aufraeumen der Rechte von "${tpl.key}" fehlgeschlagen:`, wipe.error);
      process.exit(1);
    }

    // all_permissions loest die Provisionierung zur Laufzeit gegen
    // public.permissions auf — hier waeren die Zeilen nur Ballast, der beim
    // naechsten neuen Recht sofort veraltet.
    if (coversEverything(tpl.permissions)) continue;

    const rows = [...new Set(tpl.permissions)].map((permission_key) => ({
      template_key: tpl.key,
      permission_key,
    }));
    if (rows.length === 0) continue;

    const insert = await supabase.from('role_template_permissions').insert(rows);
    if (insert.error) {
      console.error(`Rechte von "${tpl.key}" schreiben fehlgeschlagen:`, insert.error);
      process.exit(1);
    }
    permissionRowCount += rows.length;
  }

  const allCount = templateRows.filter((r) => r.all_permissions).length;
  console.log(
    `Fertig. ${templateRows.length} Vorlagen synchron (${allCount} mit allen Rechten, ${permissionRowCount} einzelne Rechte-Zuordnungen).`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
