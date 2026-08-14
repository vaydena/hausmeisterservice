import { describe, it, expect } from 'vitest';
import { changeEmailSchema } from '@/lib/auth/change-email-schema';

describe('changeEmailSchema', () => {
  it('accepts a normal email', () => {
    const r = changeEmailSchema.safeParse({ newEmail: 'user@example.com' });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.newEmail).toBe('user@example.com');
  });

  it('rejects a missing @ sign', () => {
    const r = changeEmailSchema.safeParse({ newEmail: 'not-an-email' });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0]?.path).toEqual(['newEmail']);
  });

  it('rejects an empty string', () => {
    const r = changeEmailSchema.safeParse({ newEmail: '' });
    expect(r.success).toBe(false);
  });

  it('rejects whitespace-only input', () => {
    const r = changeEmailSchema.safeParse({ newEmail: '   ' });
    expect(r.success).toBe(false);
  });

  it('trims surrounding whitespace before validation', () => {
    const r = changeEmailSchema.safeParse({ newEmail: '  user@example.com  ' });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.newEmail).toBe('user@example.com');
  });

  it('lowercases the local part (email-address matching is case-insensitive per RFC 5321 §2.4)', () => {
    const r = changeEmailSchema.safeParse({ newEmail: 'User@Example.COM' });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.newEmail).toBe('user@example.com');
  });

  it('rejects an email over 254 chars (SMTP-RFC 5321 §4.5.3.1.3 max address length)', () => {
    // "aaaa…@example.com" — pad local part so total > 254
    const oversized = `${'a'.repeat(250)}@ex.com`;
    expect(oversized.length).toBeGreaterThan(254);
    const r = changeEmailSchema.safeParse({ newEmail: oversized });
    expect(r.success).toBe(false);
  });

  it('rejects non-string input', () => {
    const r = changeEmailSchema.safeParse({ newEmail: 42 });
    expect(r.success).toBe(false);
  });

  it('rejects null input', () => {
    const r = changeEmailSchema.safeParse({ newEmail: null });
    expect(r.success).toBe(false);
  });

  it('rejects missing field', () => {
    const r = changeEmailSchema.safeParse({});
    expect(r.success).toBe(false);
  });
});
