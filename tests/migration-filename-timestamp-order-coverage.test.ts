import { describe, it, expect } from 'vitest';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';

const MIGRATIONS_DIR = join(process.cwd(), 'supabase', 'migrations');

/**
 * Every migration file must follow the `YYYYMMDDHHMMSS_<slug>.sql` shape:
 *  - exactly 14 leading digits (fixed width so lexicographic sort ===
 *    chronological sort, which is how Supabase CLI orders them);
 *  - an underscore separator;
 *  - a lowercase snake_case slug (Postgres/Supabase migration tooling is
 *    strict here — dashes, uppercase, or spaces would break tooling in
 *    subtle ways);
 *  - a `.sql` extension.
 */
const FILENAME_RE = /^(\d{14})_([a-z][a-z0-9_]*)\.sql$/;

interface Parsed {
  file: string;
  ts: string;
  slug: string;
}

const ALL_FILES: string[] = readdirSync(MIGRATIONS_DIR).filter((f) =>
  f.endsWith('.sql'),
);

const PARSED: Parsed[] = [];
const MALFORMED: string[] = [];
for (const f of ALL_FILES) {
  const m = f.match(FILENAME_RE);
  if (!m) {
    MALFORMED.push(f);
    continue;
  }
  PARSED.push({ file: f, ts: m[1]!, slug: m[2]! });
}

/**
 * Given a 14-digit timestamp, return an object with numeric components so
 * we can range-check them. Postgres will happily accept any string here,
 * but a nonsense timestamp (`20261301...`, `20260832...`, `20260801250000`)
 * signals a typo that lands a migration in an unexpected slot in the sort
 * order — silent, and hard to notice at PR-review time.
 */
function decompose(ts: string): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
} {
  return {
    year: Number(ts.slice(0, 4)),
    month: Number(ts.slice(4, 6)),
    day: Number(ts.slice(6, 8)),
    hour: Number(ts.slice(8, 10)),
    minute: Number(ts.slice(10, 12)),
    second: Number(ts.slice(12, 14)),
  };
}

describe('Migration filename timestamp order coverage', () => {
  describe('sanity: extractor found something', () => {
    it('scanner discovered many .sql migration files', () => {
      expect(ALL_FILES.length).toBeGreaterThan(10);
    });
    it('extractor is not silently dropping files (parsed + malformed === total)', () => {
      // Guards against a regex refactor that accidentally excludes every
      // file — otherwise per-file tests would look green trivially by
      // being absent from the iteration.
      expect(PARSED.length + MALFORMED.length).toBe(ALL_FILES.length);
    });
  });

  describe('every migration filename matches YYYYMMDDHHMMSS_<slug>.sql', () => {
    for (const f of ALL_FILES.slice().sort()) {
      it(`${f} matches the migration filename format`, () => {
        expect(
          FILENAME_RE.test(f),
          `Migration filename "${f}" does not match /^\\d{14}_[a-z][a-z0-9_]*\\.sql$/. Supabase CLI applies migrations in lexicographic filename order, which only equals chronological order when every filename has a fixed-width 14-digit prefix and a lowercase snake_case slug. A filename like "2026-08-01_foo.sql" or "20260801_foo.sql" (short prefix) or "20260801000000_MyMigration.sql" (uppercase slug) will either sort out of order (short prefix comes AFTER any 14-digit prefix in the same day) or trip tooling that expects lowercase slugs. Rename the file to "YYYYMMDDHHMMSS_lower_snake_slug.sql" using the current UTC time; if you're generating it manually, run \`date -u +%Y%m%d%H%M%S\` for the prefix.`,
        ).toBe(true);
      });
    }
  });

  describe('every migration timestamp is a plausible calendar moment', () => {
    for (const p of PARSED.slice().sort((a, b) => a.file.localeCompare(b.file))) {
      it(`${p.file} has a plausible timestamp`, () => {
        const { year, month, day, hour, minute, second } = decompose(p.ts);
        expect(
          year >= 2020 && year <= 2100,
          `Timestamp year in ${p.file} is ${year} — outside the plausible 2020-2100 range. Most likely a typo in the prefix (e.g. dropping a digit or transposing).`,
        ).toBe(true);
        expect(
          month >= 1 && month <= 12,
          `Timestamp month in ${p.file} is ${month} — must be 01-12. A month of 13+ or 00 is a typo (Postgres will still apply the migration but it lands in a bogus sort slot).`,
        ).toBe(true);
        expect(
          day >= 1 && day <= 31,
          `Timestamp day in ${p.file} is ${day} — must be 01-31. Same reasoning as month: silently accepted, wrong sort slot.`,
        ).toBe(true);
        expect(
          hour >= 0 && hour <= 23,
          `Timestamp hour in ${p.file} is ${hour} — must be 00-23.`,
        ).toBe(true);
        expect(
          minute >= 0 && minute <= 59,
          `Timestamp minute in ${p.file} is ${minute} — must be 00-59.`,
        ).toBe(true);
        expect(
          second >= 0 && second <= 59,
          `Timestamp second in ${p.file} is ${second} — must be 00-59.`,
        ).toBe(true);
      });
    }
  });

  describe('no two migrations share the same 14-digit timestamp', () => {
    it('every timestamp prefix is unique across supabase/migrations/', () => {
      const seen = new Map<string, string>();
      const collisions: Array<{ ts: string; a: string; b: string }> = [];
      for (const p of PARSED) {
        const prior = seen.get(p.ts);
        if (prior !== undefined) {
          collisions.push({ ts: p.ts, a: prior, b: p.file });
        } else {
          seen.set(p.ts, p.file);
        }
      }
      expect(
        collisions,
        collisions.length > 0
          ? `Two migrations share a timestamp prefix, so lexicographic sort order is undefined between them:\n${collisions
              .map((c) => `  ${c.ts}: ${c.a}  &  ${c.b}`)
              .join(
                '\n',
              )}\nThis happens when two devs branch off the same base and both generate a migration at the same second, or when a hand-typed prefix accidentally duplicates. Bump the later migration's prefix by one second (or more, if there are multiple) so ordering is deterministic on every fresh \`supabase db reset\` and matches whatever remote already applied.`
          : 'unexpected — extractor produced collisions when none should exist',
      ).toEqual([]);
    });
  });

  describe('lexicographic filename order === chronological timestamp order', () => {
    it('the two sort orders agree on every position', () => {
      // With a fixed-width 14-digit numeric prefix and unique timestamps,
      // this is trivially true — but if someone introduces a filename
      // format variant (say, 10-digit unix epoch alongside 14-digit
      // YYYYMMDDHHMMSS), the two sorts would diverge silently and
      // Supabase CLI would apply migrations in a different order than a
      // dev reading the directory listing expects. This test locks that
      // invariant in.
      const byName = [...PARSED].sort((a, b) => a.file.localeCompare(b.file));
      const byTs = [...PARSED].sort((a, b) => a.ts.localeCompare(b.ts));
      const disagreements: Array<{ i: number; byName: string; byTs: string }> = [];
      for (let i = 0; i < byName.length; i++) {
        if (byName[i]!.file !== byTs[i]!.file) {
          disagreements.push({
            i,
            byName: byName[i]!.file,
            byTs: byTs[i]!.file,
          });
        }
      }
      expect(
        disagreements,
        disagreements.length > 0
          ? `Filename-lexicographic sort and timestamp-numeric sort disagree at these positions:\n${disagreements
              .map((d) => `  #${d.i}: byName=${d.byName}  byTs=${d.byTs}`)
              .join(
                '\n',
              )}\nSupabase CLI orders migrations by filename. If a new filename format was introduced that doesn't use fixed-width 14-digit YYYYMMDDHHMMSS prefixes, remove the odd format or rename it back to fit.`
          : 'unexpected — sort orders should agree when all filenames are 14-digit prefixed',
      ).toEqual([]);
    });
  });
});
