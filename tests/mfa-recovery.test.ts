import { describe, it, expect } from 'vitest';
import {
  formatForDisplay,
  generateRecoveryCodePlaintexts,
  normalizeRecoveryCode,
  RECOVERY_CODE_ALPHABET,
  RECOVERY_CODE_LENGTH,
} from '@/lib/auth/mfa-recovery';

describe('generateRecoveryCodePlaintexts', () => {
  it('returns exactly 10 codes', () => {
    const codes = generateRecoveryCodePlaintexts();
    expect(codes).toHaveLength(10);
  });

  it('all codes have XXXX-XXXX format (9 chars incl. dash)', () => {
    for (const c of generateRecoveryCodePlaintexts()) {
      expect(c).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/);
    }
  });

  it('all code characters come from the reduced alphabet (no 0/O/1/I/L/U/V)', () => {
    const codes = generateRecoveryCodePlaintexts();
    const raw = codes.join('').replace(/-/g, '');
    for (const ch of raw) {
      expect(RECOVERY_CODE_ALPHABET).toContain(ch);
    }
  });

  it('produces cryptographically random unique codes within one batch', () => {
    // 10 codes drawn from ~1.1e12 space — a collision would indicate a
    // broken RNG, not bad luck.
    const codes = generateRecoveryCodePlaintexts();
    const unique = new Set(codes);
    expect(unique.size).toBe(codes.length);
  });

  it('produces different batches across successive calls', () => {
    // Same argument: two calls should not return the same batch (again,
    // collision would be a broken RNG).
    const a = generateRecoveryCodePlaintexts().join(',');
    const b = generateRecoveryCodePlaintexts().join(',');
    expect(a).not.toBe(b);
  });

  it('reports the same length constant that the codes actually use', () => {
    const codes = generateRecoveryCodePlaintexts();
    for (const c of codes) {
      expect(c.replace(/-/g, '')).toHaveLength(RECOVERY_CODE_LENGTH);
    }
  });
});

describe('normalizeRecoveryCode', () => {
  it('strips the dash from XXXX-XXXX', () => {
    expect(normalizeRecoveryCode('ABCD-EFGH')).toBe('ABCDEFGH');
  });

  it('strips whitespace', () => {
    expect(normalizeRecoveryCode('ABCD EFGH')).toBe('ABCDEFGH');
    expect(normalizeRecoveryCode('AB CD EF GH')).toBe('ABCDEFGH');
    expect(normalizeRecoveryCode('  ABCDEFGH  ')).toBe('ABCDEFGH');
  });

  it('uppercases lowercase input', () => {
    expect(normalizeRecoveryCode('abcd-efgh')).toBe('ABCDEFGH');
    expect(normalizeRecoveryCode('AbCd-EfGh')).toBe('ABCDEFGH');
  });

  it('is idempotent (canonical form stays canonical)', () => {
    const canonical = 'ABCDEFGH';
    expect(normalizeRecoveryCode(canonical)).toBe(canonical);
    expect(normalizeRecoveryCode(normalizeRecoveryCode('abcd-EFGH'))).toBe(canonical);
  });
});

describe('formatForDisplay', () => {
  it('inserts a dash after 4 characters for 8-char input', () => {
    expect(formatForDisplay('ABCDEFGH')).toBe('ABCD-EFGH');
  });

  it('returns non-matching-length input unchanged', () => {
    expect(formatForDisplay('SHORT')).toBe('SHORT');
    expect(formatForDisplay('WAYTOOLONGCODE')).toBe('WAYTOOLONGCODE');
  });
});
