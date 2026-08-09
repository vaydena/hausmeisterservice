import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import {
  PERMISSIONS,
  PERMISSIONS_BY_KEY,
  SYSTEM_ROLE_TEMPLATES,
} from '../src/lib/permissions/registry';
import { NAV_GROUPS, MOBILE_NAV_ITEMS } from '../src/components/layout/nav-config';

const SRC_DIR = join(process.cwd(), 'src');

/** All permission keys the registry declares. */
const KNOWN = new Set(PERMISSIONS.map((p) => p.key));

/**
 * Match every `permissions.has('<key>')` literal invocation. The receiver
 * name `permissions` is our house convention — restricting on it avoids
 * false positives from unrelated Set/Map `.has(...)` calls.
 *
 * The key allows 2+ snake_case segments (e.g. `billing.view`,
 * `core.tenants.view`).
 */
const HAS_LITERAL_RE = /\bpermissions\.has\(\s*['"]([a-z_]+(?:\.[a-z_]+)+)['"]\s*\)/g;

/**
 * Match every `permission: '<key>'` object-literal field. Used by the
 * NavItem shape in `components/layout/nav-config.ts` — this keeps a nav
 * link from silently disappearing because a permission key was renamed
 * without updating the nav.
 */
const NAV_LITERAL_RE = /\bpermission\s*:\s*['"]([a-z_]+(?:\.[a-z_]+)+)['"]/g;

function walkTsFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const abs = join(dir, entry);
    const s = statSync(abs);
    if (s.isDirectory()) {
      if (entry === 'node_modules' || entry === '.next' || entry === 'dist') continue;
      walkTsFiles(abs, out);
    } else if (/\.(ts|tsx)$/.test(entry) && !entry.endsWith('.d.ts')) {
      out.push(abs);
    }
  }
  return out;
}

interface Ref {
  file: string;
  line: number;
  key: string;
}

function collectMatches(pattern: RegExp, files: string[]): Ref[] {
  const refs: Ref[] = [];
  for (const file of files) {
    const src = readFileSync(file, 'utf8');
    const localRe = new RegExp(pattern.source, pattern.flags);
    let m: RegExpExecArray | null;
    while ((m = localRe.exec(src))) {
      const before = src.slice(0, m.index);
      const line = before.split('\n').length;
      refs.push({ file: file.slice(SRC_DIR.length + 1), line, key: m[1]! });
    }
  }
  return refs;
}

const ALL_FILES = walkTsFiles(SRC_DIR);
const HAS_CALLS = collectMatches(HAS_LITERAL_RE, ALL_FILES);
const NAV_REFS = collectMatches(
  NAV_LITERAL_RE,
  ALL_FILES.filter((f) => f.endsWith('nav-config.ts')),
);

describe('Permission registry coverage', () => {
  describe('registry integrity', () => {
    it('PERMISSIONS has no duplicate keys', () => {
      const seen = new Set<string>();
      const dupes: string[] = [];
      for (const p of PERMISSIONS) {
        if (seen.has(p.key)) dupes.push(p.key);
        else seen.add(p.key);
      }
      expect(dupes, `Duplicate permission keys: ${dupes.join(', ')}`).toEqual([]);
    });

    it('PERMISSIONS_BY_KEY exposes every declared permission', () => {
      for (const p of PERMISSIONS) {
        const looked = PERMISSIONS_BY_KEY[p.key];
        expect(looked, `PERMISSIONS_BY_KEY missing ${p.key}`).toBeDefined();
        expect(looked?.key).toBe(p.key);
      }
    });

    it('every key follows `<module>.<action>` shape (2+ snake_case segments)', () => {
      const bad = PERMISSIONS.filter((p) => !/^[a-z_]+(\.[a-z_]+)+$/.test(p.key));
      expect(bad.map((p) => p.key), `Bad-shape keys: ${bad.map((p) => p.key).join(', ')}`).toEqual([]);
    });
  });

  describe('sanity: extractor saw call-sites', () => {
    it('found at least one permissions.has() literal in the tree', () => {
      expect(HAS_CALLS.length).toBeGreaterThan(0);
    });
    it('found NavItem permission literals in nav-config.ts', () => {
      expect(NAV_REFS.length).toBeGreaterThan(0);
    });
  });

  describe('permissions.has() call sites reference declared keys', () => {
    const unknown = HAS_CALLS.filter((r) => !KNOWN.has(r.key));
    it('no permissions.has() argument is missing from the registry', () => {
      const lines = unknown.map((r) => `  ${r.file}:${r.line} → "${r.key}"`);
      expect(
        unknown,
        `The following permissions.has(...) calls reference keys not in PERMISSIONS. Silent false → user is denied an action they should be allowed to.\n${lines.join('\n')}`,
      ).toEqual([]);
    });
  });

  describe('nav-config.ts permission fields reference declared keys', () => {
    const unknown = NAV_REFS.filter((r) => !KNOWN.has(r.key));
    it('no NavItem.permission literal is missing from the registry', () => {
      const lines = unknown.map((r) => `  ${r.file}:${r.line} → "${r.key}"`);
      expect(
        unknown,
        `Nav items reference unknown permission keys. Result: the nav link would never render.\n${lines.join('\n')}`,
      ).toEqual([]);
    });

    it('NAV_GROUPS/MOBILE_NAV_ITEMS in-memory match: every non-null permission is a real key', () => {
      const collected = new Set<string>();
      for (const group of NAV_GROUPS) {
        for (const item of group.items) {
          if (item.permission) collected.add(item.permission);
        }
      }
      for (const item of MOBILE_NAV_ITEMS) {
        if (item.permission) collected.add(item.permission);
      }
      const stray = [...collected].filter((k) => !KNOWN.has(k));
      expect(stray, `Nav references unknown permission keys: ${stray.join(', ')}`).toEqual([]);
    });
  });

  describe('SYSTEM_ROLE_TEMPLATES only reference declared keys', () => {
    for (const role of SYSTEM_ROLE_TEMPLATES) {
      it(`role "${role.key}" grants only registered permissions`, () => {
        const perms = role.permissions;
        if (perms === '*') return;
        const stray = perms.filter((k) => !KNOWN.has(k));
        expect(
          stray,
          `System role "${role.key}" grants unknown permissions: ${stray.join(', ')}. Onboarding would fail to seed them.`,
        ).toEqual([]);
      });
    }
  });
});
