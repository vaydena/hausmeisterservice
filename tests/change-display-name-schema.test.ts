import { describe, it, expect } from 'vitest';
import { changeDisplayNameSchema } from '@/lib/auth/change-display-name-schema';

describe('changeDisplayNameSchema', () => {
  it('accepts a normal name', () => {
    const r = changeDisplayNameSchema.safeParse({ displayName: 'Max Mustermann' });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.displayName).toBe('Max Mustermann');
  });

  it('rejects a name shorter than 2 chars', () => {
    const r = changeDisplayNameSchema.safeParse({ displayName: 'A' });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0]?.path).toEqual(['displayName']);
  });

  it('accepts exactly 2 chars (boundary)', () => {
    const r = changeDisplayNameSchema.safeParse({ displayName: 'Ab' });
    expect(r.success).toBe(true);
  });

  it('accepts exactly 60 chars (boundary)', () => {
    const r = changeDisplayNameSchema.safeParse({ displayName: 'a'.repeat(60) });
    expect(r.success).toBe(true);
  });

  it('rejects 61 chars (over boundary)', () => {
    const r = changeDisplayNameSchema.safeParse({ displayName: 'a'.repeat(61) });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0]?.path).toEqual(['displayName']);
  });

  it('trims surrounding whitespace before length check', () => {
    const r = changeDisplayNameSchema.safeParse({ displayName: '  Max  ' });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.displayName).toBe('Max');
  });

  it('rejects whitespace-only input (after trim becomes empty)', () => {
    const r = changeDisplayNameSchema.safeParse({ displayName: '   ' });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0]?.path).toEqual(['displayName']);
  });

  it('rejects non-string input', () => {
    const r = changeDisplayNameSchema.safeParse({ displayName: 42 });
    expect(r.success).toBe(false);
  });
});
