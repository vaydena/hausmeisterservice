import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  NOTIFICATION_KINDS,
  NOTIFICATION_ENTITY_TYPES,
} from '../src/lib/schemas/notifications';

const ENGINE_SRC = readFileSync(
  join(process.cwd(), 'src', 'lib', 'automations', 'engine.ts'),
  'utf8',
);

const MIGRATIONS_DIR = join(process.cwd(), 'supabase', 'migrations');

/**
 * Concatenate all migration files sorted by filename (timestamps sort
 * lexicographically) so that the LAST `add constraint …` block for a
 * given constraint name wins — mirroring what Postgres actually executes.
 */
function loadMigrationsChronologically(): string {
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();
  return files.map((f) => readFileSync(join(MIGRATIONS_DIR, f), 'utf8')).join('\n');
}

const ALL_MIGRATIONS = loadMigrationsChronologically();

function extractLastCheckList(constraintName: string, columnHint: string): Set<string> {
  const pattern = new RegExp(
    String.raw`add\s+constraint\s+${constraintName}\s+check\s*\(\s*${columnHint}[\s\S]*?in\s*\(([\s\S]*?)\)\s*\)`,
    'gi',
  );
  const matches = [...ALL_MIGRATIONS.matchAll(pattern)];
  if (matches.length === 0) {
    throw new Error(
      `No "add constraint ${constraintName} check (…)" block found in supabase/migrations/`,
    );
  }
  const lastBody = matches[matches.length - 1]![1]!;
  return new Set([...lastBody.matchAll(/'([^']+)'/g)].map((m) => m[1]!));
}

const DB_KIND_CHECK = extractLastCheckList('notifications_kind_check', 'kind');
const DB_ENTITY_CHECK = extractLastCheckList('notifications_entity_type_check', 'entity_type');

function extractLiteralField(field: string): Set<string> {
  const pattern = new RegExp(String.raw`${field}\s*:\s*'([^']+)'`, 'g');
  return new Set([...ENGINE_SRC.matchAll(pattern)].map((m) => m[1]!));
}

const ENGINE_KINDS = extractLiteralField('notification_kind');
const ENGINE_ENTITY_TYPES = extractLiteralField('entity_type');

describe('Notification kind & entity_type consistency', () => {
  describe('sanity: extractors found something', () => {
    it('engine.ts contains at least one notification_kind literal', () => {
      expect(ENGINE_KINDS.size).toBeGreaterThan(0);
    });
    it('engine.ts contains at least one entity_type literal', () => {
      expect(ENGINE_ENTITY_TYPES.size).toBeGreaterThan(0);
    });
    it('migrations contain a notifications_kind_check block', () => {
      expect(DB_KIND_CHECK.size).toBeGreaterThan(0);
    });
    it('migrations contain a notifications_entity_type_check block', () => {
      expect(DB_ENTITY_CHECK.size).toBeGreaterThan(0);
    });
  });

  describe('automations engine ↔ NOTIFICATION_KINDS', () => {
    for (const kind of [...ENGINE_KINDS].sort()) {
      it(`engine literal "${kind}" is declared in NOTIFICATION_KINDS`, () => {
        expect(
          (NOTIFICATION_KINDS as readonly string[]).includes(kind),
          `engine.ts writes notification_kind: '${kind}' but NOTIFICATION_KINDS does not list it. DB INSERT would fail the kind CHECK. Add it to NOTIFICATION_KINDS (schemas/notifications.ts) AND to a new migration.`,
        ).toBe(true);
      });
    }
  });

  describe('automations engine ↔ NOTIFICATION_ENTITY_TYPES', () => {
    for (const type of [...ENGINE_ENTITY_TYPES].sort()) {
      it(`engine literal "${type}" is declared in NOTIFICATION_ENTITY_TYPES`, () => {
        expect(
          (NOTIFICATION_ENTITY_TYPES as readonly string[]).includes(type),
          `engine.ts writes entity_type: '${type}' but NOTIFICATION_ENTITY_TYPES does not list it. Add it to schemas/notifications.ts (including notificationHref switch) AND to a new migration.`,
        ).toBe(true);
      });
    }
  });

  describe('NOTIFICATION_KINDS ↔ DB CHECK', () => {
    it('every code-side kind is allowed by the DB CHECK', () => {
      const missing = NOTIFICATION_KINDS.filter((k) => !DB_KIND_CHECK.has(k));
      expect(
        missing,
        `Kinds declared in NOTIFICATION_KINDS but missing from notifications_kind_check migration: ${missing.join(', ')}. Add a new migration that drops and re-adds the CHECK with the extended set.`,
      ).toEqual([]);
    });

    it('every DB-CHECK-allowed kind is declared in NOTIFICATION_KINDS', () => {
      const stray = [...DB_KIND_CHECK].filter(
        (k) => !(NOTIFICATION_KINDS as readonly string[]).includes(k),
      );
      expect(
        stray,
        `Kinds allowed by DB CHECK but not declared in NOTIFICATION_KINDS: ${stray.join(', ')}. Either add them to schemas/notifications.ts or shrink the CHECK.`,
      ).toEqual([]);
    });
  });

  describe('NOTIFICATION_ENTITY_TYPES ↔ DB CHECK', () => {
    it('every code-side entity_type is allowed by the DB CHECK', () => {
      const missing = NOTIFICATION_ENTITY_TYPES.filter((t) => !DB_ENTITY_CHECK.has(t));
      expect(
        missing,
        `Entity types declared in NOTIFICATION_ENTITY_TYPES but missing from notifications_entity_type_check migration: ${missing.join(', ')}.`,
      ).toEqual([]);
    });

    it('every DB-CHECK-allowed entity_type is declared in NOTIFICATION_ENTITY_TYPES', () => {
      const stray = [...DB_ENTITY_CHECK].filter(
        (t) => !(NOTIFICATION_ENTITY_TYPES as readonly string[]).includes(t),
      );
      expect(
        stray,
        `Entity types allowed by DB CHECK but not declared in NOTIFICATION_ENTITY_TYPES: ${stray.join(', ')}.`,
      ).toEqual([]);
    });
  });
});
