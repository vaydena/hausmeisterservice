import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const MIGRATIONS_DIR = join(process.cwd(), 'supabase', 'migrations');

/** Strip -- line comments and block comments so regex only hits real SQL. */
function stripSqlComments(sql: string): string {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map((l) => l.replace(/--.*$/, ''))
    .join('\n');
}

function loadMigrations(): Array<{ file: string; sql: string }> {
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .map((f) => ({
      file: f,
      sql: stripSqlComments(readFileSync(join(MIGRATIONS_DIR, f), 'utf8')),
    }));
}

const MIGRATIONS = loadMigrations();

/**
 * Split a tuple body on commas at depth zero (ignoring commas inside nested
 * `(...)`, `[...]` or single-quoted string literals). Needed because bucket
 * tuples contain array literals like `array['image/jpeg', 'image/png', ...]`.
 */
function splitTopLevelCommas(s: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  let inString = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inString) {
      if (c === "'" && s[i - 1] !== '\\') inString = false;
      continue;
    }
    if (c === "'") {
      inString = true;
      continue;
    }
    if (c === '(' || c === '[') depth++;
    else if (c === ')' || c === ']') depth--;
    else if (c === ',' && depth === 0) {
      parts.push(s.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(s.slice(start));
  return parts;
}

interface Bucket {
  id: string;
  isPublic: boolean;
  file: string;
}

const BUCKET_INSERT_RE =
  /insert\s+into\s+storage\.buckets\s*\(([^)]+)\)\s*values\s*\(([\s\S]*?)\)\s*(?:on\s+conflict|;)/gi;

const BUCKETS: Bucket[] = [];
for (const { file, sql } of MIGRATIONS) {
  for (const m of sql.matchAll(BUCKET_INSERT_RE)) {
    const columns = splitTopLevelCommas(m[1]!).map((c) => c.trim().toLowerCase());
    const values = splitTopLevelCommas(m[2]!);
    const idIdx = columns.indexOf('id');
    const publicIdx = columns.indexOf('public');
    if (idIdx === -1 || publicIdx === -1) continue;
    const idRaw = values[idIdx]!.trim();
    const idMatch = idRaw.match(/^'([^']+)'$/);
    if (!idMatch) continue;
    const publicRaw = values[publicIdx]!.trim().toLowerCase();
    BUCKETS.push({
      id: idMatch[1]!,
      isPublic: publicRaw === 'true',
      file,
    });
  }
}

interface StoragePolicy {
  name: string;
  action: string;
  roles: string[];
  body: string;
  file: string;
}

const STORAGE_POLICY_RE =
  /create\s+policy\s+"([^"]+)"\s+on\s+storage\.objects\s+([\s\S]*?);/gi;

const STORAGE_POLICIES: StoragePolicy[] = [];
for (const { file, sql } of MIGRATIONS) {
  for (const m of sql.matchAll(STORAGE_POLICY_RE)) {
    const name = m[1]!;
    const rest = m[2]!;
    const header = rest.match(/for\s+([a-z]+)\s+to\s+([\s\S]*?)\s+(using|with\s+check)/i);
    if (!header) continue;
    const roles = header[2]!.split(',').map((r) => r.trim().toLowerCase()).filter(Boolean);
    STORAGE_POLICIES.push({
      name,
      action: header[1]!.toLowerCase(),
      roles,
      body: rest,
      file,
    });
  }
}

function bucketFromPolicy(body: string): string | null {
  const m = body.match(/bucket_id\s*=\s*'([^']+)'/);
  return m ? m[1]! : null;
}

describe('Storage bucket & policy coverage', () => {
  describe('sanity: extractors found something', () => {
    it('found at least one storage.buckets declaration', () => {
      expect(BUCKETS.length).toBeGreaterThan(0);
    });
    it('found at least one storage.objects policy', () => {
      expect(STORAGE_POLICIES.length).toBeGreaterThan(0);
    });
  });

  describe('buckets are private (public=false)', () => {
    for (const b of BUCKETS) {
      it(`bucket "${b.id}" (declared in ${b.file}) is private`, () => {
        expect(
          b.isPublic,
          `Bucket "${b.id}" was created with public=true — every object in it is world-readable without authentication, RLS does not apply. Change to public=false.`,
        ).toBe(false);
      });
    }
  });

  describe('each declared bucket has SELECT and INSERT policies', () => {
    for (const b of BUCKETS) {
      const policies = STORAGE_POLICIES.filter((p) => bucketFromPolicy(p.body) === b.id);
      it(`bucket "${b.id}" has a SELECT policy on storage.objects`, () => {
        const found = policies.some((p) => p.action === 'select' || p.action === 'all');
        expect(
          found,
          `No SELECT policy on storage.objects for bucket_id = '${b.id}'. Downloads will 403 for every user.`,
        ).toBe(true);
      });
      it(`bucket "${b.id}" has an INSERT policy on storage.objects`, () => {
        const found = policies.some((p) => p.action === 'insert' || p.action === 'all');
        expect(
          found,
          `No INSERT policy on storage.objects for bucket_id = '${b.id}'. Uploads will 403 for every user.`,
        ).toBe(true);
      });
    }
  });

  describe('each storage.objects policy is safe', () => {
    for (const p of STORAGE_POLICIES) {
      it(`"${p.name}" (${p.file}) is not granted to public/anon`, () => {
        const forbidden = p.roles.filter((r) => r === 'public' || r === 'anon');
        expect(
          forbidden,
          `Storage policy "${p.name}" is granted to ${forbidden.join(', ')} — any unauthenticated visitor can invoke this policy. Restrict to authenticated (and optionally service_role).`,
        ).toEqual([]);
      });

      it(`"${p.name}" (${p.file}, ${p.action}) filters by bucket_id`, () => {
        const bucket = bucketFromPolicy(p.body);
        expect(
          bucket,
          `Storage policy "${p.name}" has no "bucket_id = '…'" clause in its body. Without it, the policy applies to EVERY bucket — cross-bucket leak.`,
        ).not.toBeNull();
      });

      it(`"${p.name}" (${p.file}, ${p.action}) enforces tenant scope`, () => {
        // is_resident_of_tenant erfuellt semantisch dieselbe Sicherheitseigenschaft
        // wie is_tenant_member (Sprint 55): der Bewohner ist auf seinen eigenen
        // Tenant gescoped via residents.tenant_id-Match. Beide Helper sind der
        // korrekte Weg, cross-tenant-Zugriff auf storage.objects zu verhindern.
        const hasTenantHelper =
          /app_auth\.is_tenant_member\s*\(/.test(p.body) ||
          /app_auth\.current_tenant_id\s*\(/.test(p.body) ||
          /app_auth\.is_resident_of_tenant\s*\(/.test(p.body);
        expect(
          hasTenantHelper,
          `Storage policy "${p.name}" does not call app_auth.is_tenant_member(...), app_auth.current_tenant_id(), or app_auth.is_resident_of_tenant(...) in its body. Without a tenant check any authenticated user of ANY tenant can access these files — cross-tenant leak.`,
        ).toBe(true);
      });

      it(`"${p.name}" (${p.file}, ${p.action}) references a declared bucket`, () => {
        const bucket = bucketFromPolicy(p.body);
        if (!bucket) return;
        const known = BUCKETS.some((b) => b.id === bucket);
        expect(
          known,
          `Storage policy "${p.name}" filters by bucket_id = '${bucket}' but no matching "insert into storage.buckets" declares that bucket. Typo, or bucket was removed without dropping the policy?`,
        ).toBe(true);
      });
    }
  });
});
