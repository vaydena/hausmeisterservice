import { describe, it, expect } from 'vitest';
import {
  mfaEnrollSchema,
  mfaUnenrollSchema,
  mfaVerifySchema,
} from '@/lib/auth/mfa-verify-schema';

const VALID_UUID = '11111111-2222-3333-4444-555555555555';

describe('mfaVerifySchema', () => {
  it('accepts a well-formed 6-digit code with valid factorId', () => {
    const r = mfaVerifySchema.safeParse({ factorId: VALID_UUID, code: '123456' });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.code).toBe('123456');
  });

  it('trims whitespace around the code before regex check', () => {
    const r = mfaVerifySchema.safeParse({ factorId: VALID_UUID, code: '  654321  ' });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.code).toBe('654321');
  });

  it('rejects a 5-digit code', () => {
    const r = mfaVerifySchema.safeParse({ factorId: VALID_UUID, code: '12345' });
    expect(r.success).toBe(false);
  });

  it('rejects a 7-digit code', () => {
    const r = mfaVerifySchema.safeParse({ factorId: VALID_UUID, code: '1234567' });
    expect(r.success).toBe(false);
  });

  it('rejects a code with non-digit characters', () => {
    const r = mfaVerifySchema.safeParse({ factorId: VALID_UUID, code: '12345a' });
    expect(r.success).toBe(false);
  });

  it('rejects an invalid factorId (not a UUID)', () => {
    const r = mfaVerifySchema.safeParse({ factorId: 'not-a-uuid', code: '123456' });
    expect(r.success).toBe(false);
  });
});

describe('mfaEnrollSchema', () => {
  it('accepts a normal friendlyName', () => {
    const r = mfaEnrollSchema.safeParse({ friendlyName: 'iPhone' });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.friendlyName).toBe('iPhone');
  });

  it('trims surrounding whitespace', () => {
    const r = mfaEnrollSchema.safeParse({ friendlyName: '  Work Laptop  ' });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.friendlyName).toBe('Work Laptop');
  });

  it('rejects empty string after trim', () => {
    const r = mfaEnrollSchema.safeParse({ friendlyName: '   ' });
    expect(r.success).toBe(false);
  });

  it('rejects 41-char name (over boundary)', () => {
    const r = mfaEnrollSchema.safeParse({ friendlyName: 'a'.repeat(41) });
    expect(r.success).toBe(false);
  });

  it('accepts exactly 40-char name (boundary)', () => {
    const r = mfaEnrollSchema.safeParse({ friendlyName: 'a'.repeat(40) });
    expect(r.success).toBe(true);
  });
});

describe('mfaUnenrollSchema', () => {
  it('accepts a valid UUID factorId', () => {
    const r = mfaUnenrollSchema.safeParse({ factorId: VALID_UUID });
    expect(r.success).toBe(true);
  });

  it('rejects a non-UUID factorId', () => {
    const r = mfaUnenrollSchema.safeParse({ factorId: 'nope' });
    expect(r.success).toBe(false);
  });
});
