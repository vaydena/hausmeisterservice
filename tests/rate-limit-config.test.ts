import { describe, it, expect } from 'vitest';
import { AUTH_RATE_LIMITS, formatRateLimitError } from '@/lib/security/rate-limit-config';

describe('AUTH_RATE_LIMITS config', () => {
  it('covers exactly the expected endpoints', () => {
    expect(Object.keys(AUTH_RATE_LIMITS).sort()).toEqual([
      'email-change',
      'login',
      'mfa-recovery',
      'mfa-verify',
      'owner-login',
      'password-change',
      'portal-login',
      'public-report-ip',
      'public-report-link',
      'reset-password',
      'signup',
    ]);
  });

  it('login and portal-login share the same policy (staff + resident auth are equivalent brute-force surfaces)', () => {
    expect(AUTH_RATE_LIMITS.login).toEqual(AUTH_RATE_LIMITS['portal-login']);
  });

  it('owner-login shares the login policy (owner auth is the same brute-force surface as staff/resident login)', () => {
    expect(AUTH_RATE_LIMITS['owner-login']).toEqual(AUTH_RATE_LIMITS.login);
  });

  it('signup and reset-password share the same policy (both are e-mail enumeration vectors)', () => {
    expect(AUTH_RATE_LIMITS.signup).toEqual(AUTH_RATE_LIMITS['reset-password']);
  });

  it('login policy is 5 attempts per 15 min, block for 15 min', () => {
    expect(AUTH_RATE_LIMITS.login).toEqual({
      limit: 5,
      windowSec: 900,
      blockSec: 900,
    });
  });

  it('signup policy is 3 attempts per hour, block for 1 hour', () => {
    expect(AUTH_RATE_LIMITS.signup).toEqual({
      limit: 3,
      windowSec: 3600,
      blockSec: 3600,
    });
  });

  it('password-change matches login policy (5 attempts per 15 min, 15 min block) — same brute-force surface, applied per-account instead of per-IP', () => {
    expect(AUTH_RATE_LIMITS['password-change']).toEqual(AUTH_RATE_LIMITS.login);
  });

  it('mfa-verify matches login policy (5 attempts per 15 min, 15 min block) — 6-digit TOTP would be trivially brute-forceable without a rate limit', () => {
    expect(AUTH_RATE_LIMITS['mfa-verify']).toEqual(AUTH_RATE_LIMITS.login);
  });

  it('mfa-recovery matches login policy (5 attempts per 15 min, 15 min block) — recovery-code space is huge (32^10) but rate-limit is the front-line defence', () => {
    expect(AUTH_RATE_LIMITS['mfa-recovery']).toEqual(AUTH_RATE_LIMITS.login);
  });

  it('email-change matches signup policy (3 per hour) — same enumeration/mail-bombing surface as signup, applied per-account', () => {
    expect(AUTH_RATE_LIMITS['email-change']).toEqual(AUTH_RATE_LIMITS.signup);
  });

  /**
   * Sprint 124: Die beiden Melde-Deckel sind keine Auth-Endpunkte, teilen
   * sich aber Tabelle und Mechanismus (siehe Kommentar in
   * rate-limit-config.ts). Sie sind die einzige Bremse vor dem einzigen
   * Schreibpfad, den jemand ohne Konto erreicht — deshalb stehen ihre
   * Werte hier fest und nicht nur im Kommentar.
   */
  it('public-report-ip erlaubt 5 Meldungen pro Stunde und sperrt eine Stunde', () => {
    expect(AUTH_RATE_LIMITS['public-report-ip']).toEqual({
      limit: 5,
      windowSec: 3600,
      blockSec: 3600,
    });
  });

  it('public-report-link ist grosszuegiger als der IP-Deckel — ein grosses Haus darf mehrere Melder haben', () => {
    expect(AUTH_RATE_LIMITS['public-report-link'].limit).toBeGreaterThan(
      AUTH_RATE_LIMITS['public-report-ip'].limit,
    );
    expect(AUTH_RATE_LIMITS['public-report-link'].windowSec).toBe(
      AUTH_RATE_LIMITS['public-report-ip'].windowSec,
    );
  });

  it('all configs use positive integers', () => {
    for (const [name, cfg] of Object.entries(AUTH_RATE_LIMITS)) {
      expect(cfg.limit, `${name}.limit`).toBeGreaterThan(0);
      expect(cfg.windowSec, `${name}.windowSec`).toBeGreaterThan(0);
      expect(cfg.blockSec, `${name}.blockSec`).toBeGreaterThan(0);
      expect(Number.isInteger(cfg.limit), `${name}.limit integer`).toBe(true);
      expect(Number.isInteger(cfg.windowSec), `${name}.windowSec integer`).toBe(true);
      expect(Number.isInteger(cfg.blockSec), `${name}.blockSec integer`).toBe(true);
    }
  });
});

describe('formatRateLimitError', () => {
  it('rounds up to at least 1 minute for very short retry windows', () => {
    expect(formatRateLimitError(30)).toBe('Zu viele Versuche. Bitte in 1 Minute erneut versuchen.');
    expect(formatRateLimitError(1)).toBe('Zu viele Versuche. Bitte in 1 Minute erneut versuchen.');
    expect(formatRateLimitError(0)).toBe('Zu viele Versuche. Bitte in 1 Minute erneut versuchen.');
  });

  it('uses singular "Minute" for exactly 1 minute', () => {
    expect(formatRateLimitError(60)).toBe('Zu viele Versuche. Bitte in 1 Minute erneut versuchen.');
  });

  it('uses plural "Minuten" for 2+ minutes', () => {
    expect(formatRateLimitError(120)).toBe(
      'Zu viele Versuche. Bitte in 2 Minuten erneut versuchen.',
    );
    expect(formatRateLimitError(900)).toBe(
      'Zu viele Versuche. Bitte in 15 Minuten erneut versuchen.',
    );
  });

  it('rounds up partial minutes (61s -> 2 min, not 1)', () => {
    expect(formatRateLimitError(61)).toBe(
      'Zu viele Versuche. Bitte in 2 Minuten erneut versuchen.',
    );
  });
});
