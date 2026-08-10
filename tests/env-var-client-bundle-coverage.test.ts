import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';

const SRC_DIR = join(process.cwd(), 'src');

function walkTsx(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const abs = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...walkTsx(abs));
    } else if (
      entry.isFile() &&
      (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx'))
    ) {
      out.push(abs);
    }
  }
  return out;
}

/**
 * Matches property access `process.env.<NAME>`. NAME must be an SHOUTY_SNAKE
 * identifier — Next.js only substitutes bare property access, not bracket
 * notation. `process.env[dynamicKey]` deliberately falls through this
 * extractor because it can't be statically resolved anyway, and the value
 * is undefined at runtime in the browser bundle.
 */
const ENV_ACCESS_RE = /\bprocess\.env\.([A-Z_][A-Z0-9_]*)\b/g;

/**
 * Any of these three markers makes a file safe to reference a non-public
 * env var (see server-secret-leak-coverage.test.ts for the same list —
 * this guard is that guard's structural generalization to ALL non-public
 * env access, not just five named secrets):
 *  - `'use server'` at file scope: Server Actions module, only ever runs
 *    server-side.
 *  - `import 'server-only'`: Next.js bundle-time trip-wire; any client
 *    component import throws at build time.
 *  - path under `src/app/api/**`: Route Handler, server-only by routing
 *    convention.
 *
 * `'use client'` is tracked separately and is a hard failure regardless
 * of whether the file is otherwise "guarded" — the two are mutually
 * exclusive by Next.js semantics but a stray directive on the wrong file
 * is the fastest way to accidentally ship a value.
 */
const USE_SERVER_RE = /^\s*['"]use server['"];?\s*$/m;
const SERVER_ONLY_IMPORT_RE = /^import\s+['"]server-only['"]/m;
const USE_CLIENT_RE = /^\s*['"]use client['"];?\s*$/m;

interface EnvFile {
  file: string;
  envs: string[];
  privateEnvs: string[];
  isApiRoute: boolean;
  hasUseServer: boolean;
  hasServerOnly: boolean;
  hasUseClient: boolean;
}

const ALL_ENV_FILES: EnvFile[] = walkTsx(SRC_DIR)
  .map((abs) => {
    const source = readFileSync(abs, 'utf8');
    const envs = new Set<string>();
    for (const m of source.matchAll(ENV_ACCESS_RE)) {
      const name = m[1];
      if (name !== undefined) envs.add(name);
    }
    return { abs, source, envs };
  })
  .filter((x) => x.envs.size > 0)
  .map((x) => {
    const file = relative(process.cwd(), x.abs).replace(/\\/g, '/');
    const envs = [...x.envs].sort();
    return {
      file,
      envs,
      privateEnvs: envs.filter((n) => !n.startsWith('NEXT_PUBLIC_')),
      isApiRoute: /^src\/app\/api\//.test(file),
      hasUseServer: USE_SERVER_RE.test(x.source),
      hasServerOnly: SERVER_ONLY_IMPORT_RE.test(x.source),
      hasUseClient: USE_CLIENT_RE.test(x.source),
    };
  })
  .sort((a, b) => a.file.localeCompare(b.file));

const PRIVATE_ENV_FILES = ALL_ENV_FILES.filter((f) => f.privateEnvs.length > 0);

/**
 * Files that read a non-public env var but have NO server-only marker.
 * Same rationale as INTENTIONALLY_UNGUARDED_SECRET_FILES in
 * server-secret-leak-coverage.test.ts:
 *
 *  - src/lib/env.ts: the Zod schema itself. It also exports `clientEnv`
 *    (for NEXT_PUBLIC_* keys) which client components legitimately
 *    import, so an `import 'server-only'` marker would break the
 *    codebase. The `serverEnv()` function inside guards itself at
 *    runtime by throwing when `typeof window !== 'undefined'`.
 *
 * The test asserts entries stay stale-relevant: if env.ts ever gains a
 * server-only marker or the private envs move out to a dedicated
 * server-only file, the allowlist entry becomes an error and forces a
 * re-review.
 */
const INTENTIONALLY_UNGUARDED_ENV_FILES = new Set<string>([
  'src/lib/env.ts',
]);

describe('Env-var client-bundle coverage', () => {
  describe('sanity: extractor found something', () => {
    it('scanner discovered at least one file with process.env access', () => {
      expect(ALL_ENV_FILES.length).toBeGreaterThan(0);
    });
    it('at least one file reads a non-NEXT_PUBLIC_ env var', () => {
      // If this collapses to 0, either the codebase legitimately dropped
      // every private env (in which case the whole guard is dead code —
      // notice and delete it), or the extractor regex broke. Either way
      // this catches it before per-file assertions look green trivially.
      expect(PRIVATE_ENV_FILES.length).toBeGreaterThan(0);
    });
  });

  describe('every non-public env consumer is bundler-forced to server-only', () => {
    for (const f of PRIVATE_ENV_FILES) {
      it(`${f.file} is under /api, has "use server", or imports 'server-only' (or is a whitelisted schema file)`, () => {
        const guarded = f.isApiRoute || f.hasUseServer || f.hasServerOnly;
        if (INTENTIONALLY_UNGUARDED_ENV_FILES.has(f.file)) {
          expect(
            guarded,
            `${f.file} is in INTENTIONALLY_UNGUARDED_ENV_FILES but now carries a server-only marker (use-server / server-only / api-route). Remove the allowlist entry so this file is guarded like any other private-env consumer.`,
          ).toBe(false);
          return;
        }
        expect(
          guarded,
          `${f.file} reads non-public env var(s) [${f.privateEnvs.join(', ')}] but has no bundler-enforced server-only marker. Any of these three fixes works: (1) add "import 'server-only';" as the first statement (Next.js will throw at build time if this file is ever imported by a client component), (2) add "'use server';" at file scope if every export is a Server Action, or (3) move the file under src/app/api/**/route.ts. Without one of these, a stray import from a client component silently ships the env-var NAME into the browser bundle — Next.js only inlines VALUES for NEXT_PUBLIC_* keys, so the value resolves to undefined client-side, but that's exactly the failure mode this guard prevents from becoming permanent: a developer notices "hey, X is undefined on the client" and "fixes" it by renaming to NEXT_PUBLIC_X, at which point the value ships too. If this is the shared env-schema file (like env.ts), add it to INTENTIONALLY_UNGUARDED_ENV_FILES with a written rationale.`,
        ).toBe(true);
      });
    }
  });

  describe('no non-public env consumer is a client component', () => {
    for (const f of PRIVATE_ENV_FILES) {
      it(`${f.file} does not have "use client"`, () => {
        expect(
          f.hasUseClient,
          `${f.file} reads non-public env var(s) [${f.privateEnvs.join(', ')}] AND has "'use client'" at file scope. That combination directly ships every non-public env name into the browser bundle. Remove the "'use client'" directive and refactor the file into a Server Component or Server Action; if the client legitimately needs a subset of this data, expose only the non-secret parts through a Server Action return value or a NEXT_PUBLIC_ variable.`,
        ).toBe(false);
      });
    }
  });
});
