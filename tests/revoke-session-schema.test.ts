import { describe, it, expect } from 'vitest';
import { revokeSessionSchema } from '@/lib/auth/revoke-session-schema';

describe('revokeSessionSchema', () => {
  it('accepts a valid uuid', () => {
    const r = revokeSessionSchema.safeParse({
      sessionId: '4c3f7ed4-6d5e-4dee-9f8a-1b2c3d4e5f60',
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.sessionId).toBe('4c3f7ed4-6d5e-4dee-9f8a-1b2c3d4e5f60');
  });

  it('trims surrounding whitespace before validation', () => {
    const r = revokeSessionSchema.safeParse({
      sessionId: '  4c3f7ed4-6d5e-4dee-9f8a-1b2c3d4e5f60  ',
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.sessionId).toBe('4c3f7ed4-6d5e-4dee-9f8a-1b2c3d4e5f60');
  });

  it('rejects an empty string', () => {
    const r = revokeSessionSchema.safeParse({ sessionId: '' });
    expect(r.success).toBe(false);
  });

  it('rejects a non-uuid string', () => {
    const r = revokeSessionSchema.safeParse({ sessionId: 'not-a-uuid' });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0]?.path).toEqual(['sessionId']);
  });

  it('rejects a truncated uuid', () => {
    const r = revokeSessionSchema.safeParse({
      sessionId: '4c3f7ed4-6d5e-4dee-9f8a',
    });
    expect(r.success).toBe(false);
  });

  it('rejects non-string input', () => {
    const r = revokeSessionSchema.safeParse({ sessionId: 42 });
    expect(r.success).toBe(false);
  });

  it('rejects null input', () => {
    const r = revokeSessionSchema.safeParse({ sessionId: null });
    expect(r.success).toBe(false);
  });

  it('rejects missing field', () => {
    const r = revokeSessionSchema.safeParse({});
    expect(r.success).toBe(false);
  });
});
