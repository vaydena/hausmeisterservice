import { describe, it, expect } from 'vitest';
import { recoveryCodeSchema } from '@/lib/auth/recovery-code-schema';

describe('recoveryCodeSchema', () => {
  it('accepts XXXX-XXXX format', () => {
    const r = recoveryCodeSchema.safeParse({ code: 'ABCD-EFGH' });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.code).toBe('ABCD-EFGH');
  });

  it('accepts 8 chars without dash', () => {
    const r = recoveryCodeSchema.safeParse({ code: 'ABCDEFGH' });
    expect(r.success).toBe(true);
  });

  it('accepts spaces (whitespace is stripped by normalize later)', () => {
    const r = recoveryCodeSchema.safeParse({ code: 'ABCD EFGH' });
    expect(r.success).toBe(true);
  });

  it('accepts lower-case (upper-cased by normalize later)', () => {
    const r = recoveryCodeSchema.safeParse({ code: 'abcd-efgh' });
    expect(r.success).toBe(true);
  });

  it('trims surrounding whitespace before parse', () => {
    const r = recoveryCodeSchema.safeParse({ code: '  ABCD-EFGH  ' });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.code).toBe('ABCD-EFGH');
  });

  it('rejects characters outside the allowed set', () => {
    const r = recoveryCodeSchema.safeParse({ code: 'ABCD*EFGH' });
    expect(r.success).toBe(false);
  });

  it('rejects punctuation other than dash', () => {
    const r = recoveryCodeSchema.safeParse({ code: 'ABCD.EFGH' });
    expect(r.success).toBe(false);
  });

  it('rejects empty string', () => {
    const r = recoveryCodeSchema.safeParse({ code: '' });
    expect(r.success).toBe(false);
  });

  it('rejects strings longer than 20 chars (before normalize)', () => {
    const r = recoveryCodeSchema.safeParse({ code: 'A'.repeat(21) });
    expect(r.success).toBe(false);
  });

  it('rejects null and undefined', () => {
    expect(recoveryCodeSchema.safeParse({ code: null }).success).toBe(false);
    expect(recoveryCodeSchema.safeParse({ code: undefined }).success).toBe(false);
  });
});
