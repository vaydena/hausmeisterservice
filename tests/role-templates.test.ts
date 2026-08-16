import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { PERMISSIONS, SYSTEM_ROLE_TEMPLATES } from '../src/lib/permissions/registry';
import { formatUserRoleLabel } from '../src/lib/permissions/user-role-label';

const MIGRATIONS_DIR = join(process.cwd(), 'supabase', 'migrations');

function stripSqlComments(sql: string): string {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map((l) => l.replace(/--.*$/, ''))
    .join('\n');
}

const MIGRATIONS = readdirSync(MIGRATIONS_DIR)
  .filter((f) => f.endsWith('.sql'))
  .sort()
  .map((f) => ({ file: f, sql: stripSqlComments(readFileSync(join(MIGRATIONS_DIR, f), 'utf8')) }));

/**
 * `create or replace function` heisst: die zuletzt ausgefuehrte Definition
 * gewinnt. Migrationen laufen in Dateinamens-Reihenfolge, also ist die
 * letzte Datei mit dieser Definition der Ist-Zustand der Datenbank. Gegen
 * eine frueher Version zu pruefen wuerde eine Regression durchwinken.
 */
function latestDefinitionOf(fnName: string): { file: string; sql: string } {
  const matches = MIGRATIONS.filter((m) =>
    new RegExp(`create\\s+or\\s+replace\\s+function\\s+[\\w.]*${fnName}\\s*\\(`, 'i').test(m.sql),
  );
  const last = matches[matches.length - 1];
  if (!last) throw new Error(`Keine Definition von ${fnName} in den Migrationen gefunden.`);
  return last;
}

describe('Rollenvorlagen: Code-Registry', () => {
  const permissionKeys = new Set(PERMISSIONS.map((p) => p.key));

  it('verweist ausschliesslich auf registrierte Permission-Keys', () => {
    // Ein Tippfehler hier wuerde erst beim Signup eines echten Kunden als
    // FK-Verletzung auffallen — im Zweifel nachts, ohne jemanden davor.
    const unknown: string[] = [];
    for (const tpl of SYSTEM_ROLE_TEMPLATES) {
      if (tpl.permissions === '*') continue;
      for (const key of tpl.permissions) {
        if (!permissionKeys.has(key)) unknown.push(`${tpl.key} → ${key}`);
      }
    }
    expect(unknown).toEqual([]);
  });

  it('hat je Rollen-Key genau eine Vorlage', () => {
    const keys = SYSTEM_ROLE_TEMPLATES.map((t) => t.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('sperrt genau eine Vorlage gegen Aenderung: superadmin', () => {
    // `editable: false` wird beim Anlegen zu roles.is_system = true, und das
    // sperrt das Loeschen. Waeren mehr Vorlagen gesperrt, saesse ein Betrieb
    // ohne Winterdienst dauerhaft auf einer Rolle "Winterdienst-Mitarbeiter",
    // die er nicht loswird — das Gegenteil von "frei definierbar".
    const locked = SYSTEM_ROLE_TEMPLATES.filter((t) => !t.editable).map((t) => t.key);
    expect(locked).toEqual(['superadmin']);
  });

  it('gibt superadmin und admin die vollen Rechte', () => {
    const superadmin = SYSTEM_ROLE_TEMPLATES.find((t) => t.key === 'superadmin');
    expect(superadmin?.permissions).toBe('*');

    const admin = SYSTEM_ROLE_TEMPLATES.find((t) => t.key === 'admin');
    expect(admin?.permissions).not.toBe('*');
    expect(new Set(admin?.permissions as readonly string[]).size).toBe(permissionKeys.size);
  });

  it('gibt jeder uebrigen Vorlage mindestens ein Recht', () => {
    // Eine Rolle ohne Rechte ist eine Rolle, deren Traeger eine leere
    // Oberflaeche sieht. Als Startvorlage ist das nie gewollt.
    const empty = SYSTEM_ROLE_TEMPLATES.filter(
      (t) => t.permissions !== '*' && (t.permissions as readonly string[]).length === 0,
    ).map((t) => t.key);
    expect(empty).toEqual([]);
  });
});

describe('Rollenvorlagen: Signup-Provisionierung', () => {
  const provision = latestDefinitionOf('provision_signup_tenant');

  it('legt die Rollen aus public.role_templates an', () => {
    // Sprint 122: vorher stand hier eine einzige hartkodierte Admin-Rolle.
    // Die 15 Vorlagen erreichten nur den lokalen Demo-Seed, nie einen Kunden.
    expect(provision.sql).toMatch(/from\s+public\.role_templates/i);
    expect(provision.sql).toMatch(/insert\s+into\s+public\.roles/i);
  });

  it('uebernimmt die Rechte der Vorlage', () => {
    expect(provision.sql).toMatch(/public\.role_template_permissions/i);
  });

  it('leitet is_system aus editable ab statt es hart zu setzen', () => {
    expect(provision.sql).toMatch(/not\s+v_tpl\.editable/i);
  });

  it('legt auch ohne synchronisierte Vorlagen eine Admin-Rolle an', () => {
    // Der Notausgang. Ohne ihn erzeugt ein vergessener Seed-Lauf einen
    // Mandanten ganz ohne Rollen: der Inhaber kommt rein, sieht nichts und
    // haelt die Anwendung fuer kaputt. Genau die Sorte stiller Fehler, die
    // dieses Repo wiederholt teuer bezahlt hat.
    expect(provision.sql).toMatch(/if\s+v_admin_role_id\s+is\s+null\s+then/i);
  });

  it('weist dem Inhaber eine Rolle zu', () => {
    expect(provision.sql).toMatch(/insert\s+into\s+public\.user_roles/i);
  });
});

describe('formatUserRoleLabel', () => {
  it('nennt den Inhaber Inhaber', () => {
    expect(formatUserRoleLabel({ userClass: 'staff', isOwner: true, roleNames: ['Administrator'] })).toBe(
      'Inhaber · Administrator',
    );
  });

  it('nennt Mitarbeiter mit ihrer Rolle', () => {
    expect(formatUserRoleLabel({ userClass: 'staff', roleNames: ['Gärtner'] })).toBe(
      'Mitarbeiter · Gärtner',
    );
  });

  it('listet mehrere Rollen auf', () => {
    expect(
      formatUserRoleLabel({ userClass: 'staff', roleNames: ['Disponent', 'Buchhaltung'] }),
    ).toBe('Mitarbeiter · Disponent, Buchhaltung');
  });

  it('benennt den rollenlosen Zustand ausdruecklich', () => {
    expect(formatUserRoleLabel({ userClass: 'staff', roleNames: [] })).toBe(
      'Mitarbeiter · keine Rolle zugewiesen',
    );
  });

  it('haengt Bewohnern und Eigentuemern keine Rolle an', () => {
    // Deren Zugang haengt am Datensatz (residents.user_id bzw. owners), nicht
    // an user_roles. Ein zweiter Teil waere eine Behauptung ohne Deckung.
    expect(formatUserRoleLabel({ userClass: 'resident' })).toBe('Bewohner');
    expect(formatUserRoleLabel({ userClass: 'resident', roleNames: ['Egal'] })).toBe('Bewohner');
    expect(formatUserRoleLabel({ userClass: 'owner' })).toBe('Eigentümer');
  });

  it('ignoriert leere Rollennamen', () => {
    expect(formatUserRoleLabel({ userClass: 'staff', roleNames: ['  ', ''] })).toBe(
      'Mitarbeiter · keine Rolle zugewiesen',
    );
  });
});
