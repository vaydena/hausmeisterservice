import { describe, it, expect } from 'vitest';
import { signupSchema, slugify, RESERVED_SLUGS } from '@/lib/auth/signup-schema';

// Wir bauen jedes Mal ein "gültiges" Basisobjekt und übersteuern gezielt das
// Feld, das der Test brechen soll — so bleibt sichtbar was der einzelne Fall
// tatsächlich prüft, ohne die anderen Felder mit anzugeben.
function base(overrides: Record<string, unknown> = {}) {
  return {
    companyName: 'Muster Hausmeisterservice GmbH',
    slug: 'muster-hausmeister',
    email: 'inhaber@example.com',
    password: 'geheim-1234-abc',
    passwordConfirm: 'geheim-1234-abc',
    termsAccepted: 'on',
    privacyAccepted: 'on',
    ...overrides,
  };
}

describe('signupSchema', () => {
  it('accepts a valid signup payload', () => {
    const result = signupSchema.safeParse(base());
    expect(result.success).toBe(true);
  });

  it('rejects a company name shorter than 2 characters', () => {
    const result = signupSchema.safeParse(base({ companyName: 'A' }));
    expect(result.success).toBe(false);
  });

  it('rejects an invalid slug pattern (leading dash)', () => {
    const result = signupSchema.safeParse(base({ slug: '-invalid' }));
    expect(result.success).toBe(false);
  });

  it('rejects an invalid slug pattern (special characters)', () => {
    const result = signupSchema.safeParse(base({ slug: 'has_underscore' }));
    expect(result.success).toBe(false);
  });

  it('rejects a reserved slug like "admin"', () => {
    const result = signupSchema.safeParse(base({ slug: 'admin' }));
    expect(result.success).toBe(false);
  });

  it('rejects each reserved slug in the list', () => {
    for (const reserved of RESERVED_SLUGS) {
      const result = signupSchema.safeParse(base({ slug: reserved }));
      expect(result.success, `slug "${reserved}" should be rejected`).toBe(false);
    }
  });

  it('rejects a password shorter than 10 characters', () => {
    const result = signupSchema.safeParse(base({ password: 'kurz', passwordConfirm: 'kurz' }));
    expect(result.success).toBe(false);
  });

  it('rejects when password and confirm do not match', () => {
    const result = signupSchema.safeParse(
      base({ password: 'geheim-1234-abc', passwordConfirm: 'anderes-1234-abc' }),
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues.find((i) => i.path[0] === 'passwordConfirm');
      expect(issue?.message).toContain('stimmen nicht überein');
    }
  });

  it('rejects an invalid email address', () => {
    const result = signupSchema.safeParse(base({ email: 'kein-at-zeichen' }));
    expect(result.success).toBe(false);
  });

  it('rejects when the terms checkbox is missing', () => {
    const result = signupSchema.safeParse(base({ termsAccepted: null }));
    expect(result.success).toBe(false);
  });

  it('rejects when the privacy checkbox is missing', () => {
    const result = signupSchema.safeParse(base({ privacyAccepted: null }));
    expect(result.success).toBe(false);
  });

  it('normalises the email to lower case', () => {
    const result = signupSchema.safeParse(base({ email: 'MIXED@Example.COM' }));
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.email).toBe('mixed@example.com');
    }
  });

  it('trims and lowercases the slug', () => {
    const result = signupSchema.safeParse(base({ slug: '  Muster-Hausmeister  ' }));
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.slug).toBe('muster-hausmeister');
    }
  });
});

describe('slugify', () => {
  it('converts umlauts and spaces to a URL-safe slug', () => {
    expect(slugify('Bauer & Söhne GmbH')).toBe('bauer-soehne-gmbh');
  });

  it('collapses multiple non-alphanumeric characters into single dashes', () => {
    expect(slugify('a__b--c   d')).toBe('a-b-c-d');
  });

  it('trims leading and trailing dashes', () => {
    expect(slugify('---hello---')).toBe('hello');
  });

  it('caps the slug at 32 characters', () => {
    const long = 'x'.repeat(100);
    expect(slugify(long).length).toBeLessThanOrEqual(32);
  });

  it('produces an empty string for input without any alphanumerics', () => {
    expect(slugify('!!! ??? ---')).toBe('');
  });
});
