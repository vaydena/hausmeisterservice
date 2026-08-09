import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { Constants } from '@/types/database';

const MIGRATIONS_DIR = join(process.cwd(), 'supabase', 'migrations');

/**
 * Matches `CREATE TYPE [public.]<name> AS ENUM ('a', 'b', 'c');`
 * Case-insensitive, /g so both `create` and `CREATE` variants are captured.
 * The body group covers everything between the parens; we then pull individual
 * quoted literals out of it separately.
 */
const CREATE_TYPE_RE =
  /create\s+type\s+(?:public\.)?([a-zA-Z_][a-zA-Z0-9_]*)\s+as\s+enum\s*\(([^)]*)\)\s*;/gi;

/**
 * Matches `ALTER TYPE [public.]<name> ADD VALUE [IF NOT EXISTS] '<value>'`.
 * Optional `if not exists` is common in migrations that need to be re-runnable.
 */
const ALTER_TYPE_ADD_VALUE_RE =
  /alter\s+type\s+(?:public\.)?([a-zA-Z_][a-zA-Z0-9_]*)\s+add\s+value\s+(?:if\s+not\s+exists\s+)?['"]([^'"]+)['"]/gi;

/** Pulls each quoted literal from a CREATE TYPE ... AS ENUM body. */
const VALUE_RE = /['"]([^'"]+)['"]/g;

function extractExpectedEnums(): Map<string, Set<string>> {
  const enums = new Map<string, Set<string>>();
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();
  for (const file of files) {
    const source = readFileSync(join(MIGRATIONS_DIR, file), 'utf8');
    for (const m of source.matchAll(CREATE_TYPE_RE)) {
      const name = m[1];
      const body = m[2];
      if (!name || body === undefined) continue;
      const values = new Set<string>();
      for (const vm of body.matchAll(VALUE_RE)) {
        const v = vm[1];
        if (v !== undefined) values.add(v);
      }
      enums.set(name, values);
    }
    for (const m of source.matchAll(ALTER_TYPE_ADD_VALUE_RE)) {
      const name = m[1];
      const value = m[2];
      if (!name || value === undefined) continue;
      const set = enums.get(name);
      // If a migration adds values to a type that was never CREATEd in-repo
      // (e.g. a type from an extension or an out-of-order file), just track
      // it — the test below only asserts things the migrations DO declare.
      if (!set) {
        enums.set(name, new Set([value]));
      } else {
        set.add(value);
      }
    }
  }
  return enums;
}

const EXPECTED = extractExpectedEnums();

/**
 * The Supabase type generator emits `Constants.public.Enums[<name>]` as a
 * const array of every value in the enum. That gives us a runtime handle for
 * comparison without parsing the TypeScript union types by hand.
 */
const ACTUAL: Record<string, readonly string[]> = Constants.public.Enums as Record<
  string,
  readonly string[]
>;

function sorted(values: Iterable<string>): string[] {
  return [...values].sort();
}

describe('Migration/database.ts enum consistency', () => {
  describe('sanity: extractors found something', () => {
    it('at least one CREATE TYPE ... AS ENUM was extracted from migrations', () => {
      expect(EXPECTED.size).toBeGreaterThan(0);
    });
    it('Constants.public.Enums exposes at least one enum in database.ts', () => {
      expect(Object.keys(ACTUAL).length).toBeGreaterThan(0);
    });
  });

  it('every Postgres enum in migrations has a matching entry in database.ts (and vice-versa)', () => {
    // Set equality on names — catches renames on either side, and any enum
    // that a migration added or removed without regenerating types.
    const expectedNames = sorted(EXPECTED.keys());
    const actualNames = sorted(Object.keys(ACTUAL));
    expect(
      actualNames,
      `Migration enums vs database.ts enums drifted. Migrations declare [${expectedNames.join(', ')}] but database.ts declares [${actualNames.join(', ')}]. Fix: run "pnpm gen:types" (or the equivalent Supabase type-generation command) to regenerate src/types/database.ts so it reflects the current schema.`,
    ).toEqual(expectedNames);
  });

  describe('every enum has identical values in migrations and database.ts', () => {
    for (const [name, values] of [...EXPECTED].sort((a, b) => a[0].localeCompare(b[0]))) {
      it(`enum "${name}" values match`, () => {
        const expected = sorted(values);
        const actual = ACTUAL[name];
        // The name-set test above already flags a missing entry here, so this
        // check is only interesting when both sides have the type but the
        // values drift.
        if (!actual) {
          throw new Error(
            `Enum "${name}" is declared in migrations but missing from Constants.public.Enums in src/types/database.ts. Run "pnpm gen:types" to regenerate.`,
          );
        }
        expect(
          sorted(actual),
          `Enum "${name}" drifted between Postgres and database.ts. Migrations define [${expected.join(', ')}] (including any ALTER TYPE ADD VALUE). Constants.public.Enums.${name} defines [${sorted(actual).join(', ')}]. Fix: run "pnpm gen:types" to regenerate src/types/database.ts so the client type union stays in sync — otherwise Supabase queries that filter or insert on this column will accept values the DB rejects (or reject values it now accepts), and TypeScript will silently pass the miscoded call.`,
        ).toEqual(expected);
      });
    }
  });
});
