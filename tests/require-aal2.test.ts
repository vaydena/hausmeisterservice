import { describe, it, expect, vi, beforeEach } from 'vitest';

// Wir mocken `next/navigation`, damit `redirect()` nicht wirft, sondern
// eine identifizierbare Exception produziert, die wir im Test einfangen
// koennen. Das reflektiert das echte Verhalten: `redirect` throwt eine
// spezielle Next-Error-Klasse, die vom Server-Action-Runner behandelt
// wird — wir simulieren das mit einem simplen Error-Wurf.
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));

import { requireAal2WhenEnrolled } from '@/lib/auth/require-aal2';

interface FakeSupabase {
  auth: {
    mfa: {
      getAuthenticatorAssuranceLevel: () => Promise<{
        data: { currentLevel: string; nextLevel: string } | null;
      }>;
    };
  };
}

function makeSupabase(aal: { currentLevel: string; nextLevel: string } | null): FakeSupabase {
  return {
    auth: {
      mfa: {
        getAuthenticatorAssuranceLevel: () => Promise.resolve({ data: aal }),
      },
    },
  };
}

describe('requireAal2WhenEnrolled', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('no-ops when user is already aal2', async () => {
    const supabase = makeSupabase({ currentLevel: 'aal2', nextLevel: 'aal2' });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await expect(requireAal2WhenEnrolled(supabase as any, '/settings/account')).resolves.toBeUndefined();
  });

  it('no-ops when user has no MFA factor (nextLevel=aal1)', async () => {
    const supabase = makeSupabase({ currentLevel: 'aal1', nextLevel: 'aal1' });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await expect(requireAal2WhenEnrolled(supabase as any, '/settings/account')).resolves.toBeUndefined();
  });

  it('no-ops when getAuthenticatorAssuranceLevel returns null data', async () => {
    const supabase = makeSupabase(null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await expect(requireAal2WhenEnrolled(supabase as any, '/settings/account')).resolves.toBeUndefined();
  });

  it('redirects to /login/mfa when user is aal1 with enrolled factor (nextLevel=aal2)', async () => {
    const supabase = makeSupabase({ currentLevel: 'aal1', nextLevel: 'aal2' });
    await expect(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      requireAal2WhenEnrolled(supabase as any, '/settings/account'),
    ).rejects.toThrow('REDIRECT:/login/mfa?next=%2Fsettings%2Faccount');
  });

  it('url-encodes the nextPath parameter', async () => {
    const supabase = makeSupabase({ currentLevel: 'aal1', nextLevel: 'aal2' });
    await expect(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      requireAal2WhenEnrolled(supabase as any, '/settings/account?tab=security'),
    ).rejects.toThrow('REDIRECT:/login/mfa?next=%2Fsettings%2Faccount%3Ftab%3Dsecurity');
  });
});
