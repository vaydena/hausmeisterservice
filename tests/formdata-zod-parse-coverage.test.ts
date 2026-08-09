import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';

const SRC_DIR = join(process.cwd(), 'src');

function walkTs(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const abs = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...walkTs(abs));
    } else if (entry.isFile() && entry.name.endsWith('.ts')) {
      out.push(abs);
    }
  }
  return out;
}

const FORMDATA_GET_RE = /\bformData\.get\(/;

/**
 * Zod exposes both `.parse()` (throwing) and `.safeParse()` (result-returning).
 * Every current usage in the codebase uses `.safeParse()` (verified via the
 * feasibility-check script). Restricting the pattern to `.safeParse(` avoids
 * false positives from unrelated `.parse(` calls (`JSON.parse`, `Date.parse`,
 * URL parsers, csv parsers). If a future file ever legitimately reaches for
 * `Schema.parse()` (throwing variant) instead, extend this regex — do not
 * fall back to a bare `.parse(` match.
 */
const ZOD_PARSE_RE = /\.safeParse\(/;

interface ActionFile {
  file: string;
  hasFormData: boolean;
  hasZodParse: boolean;
}

const FORMDATA_FILES: ActionFile[] = walkTs(SRC_DIR)
  .map((abs) => {
    const source = readFileSync(abs, 'utf8');
    return {
      file: relative(process.cwd(), abs).replace(/\\/g, '/'),
      hasFormData: FORMDATA_GET_RE.test(source),
      hasZodParse: ZOD_PARSE_RE.test(source),
    };
  })
  .filter((f) => f.hasFormData)
  .sort((a, b) => a.file.localeCompare(b.file));

/**
 * Files that read FormData but do NOT run any Zod schema against the input.
 * Every entry must justify why the manual validation is at least as rigorous
 * as a Zod schema would be — otherwise the fix is to add a Zod schema, not
 * to add an allowlist entry.
 *
 *  - src/app/(app)/checklist-runs/actions.ts: every FormData value is either
 *    a UUID that is immediately fed into a `.eq('id', X).single()` lookup
 *    (invalid UUID → 22P02 error surfaced as "Vorlage/Run nicht gefunden"),
 *    a hard-coded discriminator (`kind` explicitly compared against literals
 *    'check' | 'text' | 'photo' | 'number', throws "Unbekannter Item-Typ"
 *    otherwise), a boolean discriminator (`value_bool` compared against the
 *    literals 'true' | 'false'), a numeric value validated via `Number()` +
 *    `Number.isNaN`, or a free-text field trimmed and `.slice(0, 2000)`d
 *    before insertion. No raw FormData string reaches Postgres unvalidated.
 *    Marked TODO — should be refactored to use a Zod schema for consistency
 *    with the other 29 action modules, but semantically equivalent today.
 *
 * The test asserts entries stay stale-relevant: once a file starts calling
 * `.safeParse()`, its allowlist entry becomes an error, forcing removal.
 */
const INTENTIONALLY_MANUALLY_VALIDATED = new Set<string>([
  'src/app/(app)/checklist-runs/actions.ts',
]);

describe('FormData ↔ Zod parse coverage', () => {
  describe('sanity: extractor found something', () => {
    it('scanner discovered at least one file that reads FormData', () => {
      expect(FORMDATA_FILES.length).toBeGreaterThan(0);
    });
    it('at least one FormData-reading file calls .safeParse()', () => {
      expect(FORMDATA_FILES.some((f) => f.hasZodParse)).toBe(true);
    });
  });

  describe('every FormData-reading file runs a Zod safeParse (or is a whitelisted manual-validator)', () => {
    for (const f of FORMDATA_FILES) {
      it(`${f.file} calls .safeParse() or is in INTENTIONALLY_MANUALLY_VALIDATED`, () => {
        if (INTENTIONALLY_MANUALLY_VALIDATED.has(f.file)) {
          expect(
            f.hasZodParse,
            `${f.file} is in INTENTIONALLY_MANUALLY_VALIDATED but now calls .safeParse(). Remove the allowlist entry so this file is guarded like any other FormData reader.`,
          ).toBe(false);
          return;
        }
        expect(
          f.hasZodParse,
          `${f.file} reads formData.get(...) but never calls .safeParse(...). Raw FormData values are attacker-controlled strings (or File | null) from the client — routing them into supabase .insert/.update/.eq without a Zod schema means unvalidated user input reaches Postgres directly. Wrap the extracted fields in a Zod schema (see src/lib/schemas/* for existing examples) and call schema.safeParse({ …formData.get… }). Only if every field is validated manually with equivalent rigor (enum/whitelist for discriminators, Number/Date parsing for numerics, .slice(N) for free text, UUID-via-.single() for foreign keys) may "${f.file}" be added to INTENTIONALLY_MANUALLY_VALIDATED with a per-field rationale.`,
        ).toBe(true);
      });
    }
  });
});
