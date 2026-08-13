import { describe, it, expect } from 'vitest';
import { changePasswordSchema } from '@/lib/auth/change-password-schema';

describe('changePasswordSchema', () => {
  const validBase = {
    currentPassword: 'altesPasswort',
    newPassword: 'einNeuesPasswort1',
    newPasswordConfirm: 'einNeuesPasswort1',
  };

  it('accepts a valid change (10+ chars, matching confirm, new differs from current)', () => {
    const r = changePasswordSchema.safeParse(validBase);
    expect(r.success).toBe(true);
  });

  it('rejects empty current password', () => {
    const r = changePasswordSchema.safeParse({ ...validBase, currentPassword: '' });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0]?.path).toEqual(['currentPassword']);
  });

  it('rejects new password shorter than 10 chars', () => {
    const r = changePasswordSchema.safeParse({
      ...validBase,
      newPassword: 'kurz',
      newPasswordConfirm: 'kurz',
    });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0]?.path).toEqual(['newPassword']);
  });

  it('rejects new password longer than 128 chars', () => {
    const long = 'a'.repeat(129);
    const r = changePasswordSchema.safeParse({
      ...validBase,
      newPassword: long,
      newPasswordConfirm: long,
    });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0]?.path).toEqual(['newPassword']);
  });

  it('rejects when new and confirm differ', () => {
    const r = changePasswordSchema.safeParse({
      ...validBase,
      newPasswordConfirm: 'einAnderesPasswort2',
    });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0]?.path).toEqual(['newPasswordConfirm']);
  });

  it('rejects when new password equals current password (prevents no-op change)', () => {
    const same = 'gleichesPasswort1';
    const r = changePasswordSchema.safeParse({
      currentPassword: same,
      newPassword: same,
      newPasswordConfirm: same,
    });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0]?.path).toEqual(['newPassword']);
  });

  it('accepts exactly 10 chars new password (boundary)', () => {
    const r = changePasswordSchema.safeParse({
      currentPassword: 'irgendwas1',
      newPassword: '1234567890',
      newPasswordConfirm: '1234567890',
    });
    expect(r.success).toBe(true);
  });

  it('accepts exactly 128 chars new password (boundary)', () => {
    const p = 'a'.repeat(128);
    const r = changePasswordSchema.safeParse({
      currentPassword: 'irgendwas1',
      newPassword: p,
      newPasswordConfirm: p,
    });
    expect(r.success).toBe(true);
  });
});
