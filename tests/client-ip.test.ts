import { describe, it, expect } from 'vitest';
import { getClientIp } from '@/lib/security/client-ip';

function h(headers: Record<string, string>) {
  const map = new Map(Object.entries(headers));
  return {
    get(name: string): string | null {
      return map.get(name.toLowerCase()) ?? map.get(name) ?? null;
    },
  };
}

describe('getClientIp', () => {
  it('returns single IP from x-forwarded-for', () => {
    expect(getClientIp(h({ 'x-forwarded-for': '203.0.113.42' }))).toBe('203.0.113.42');
  });

  it('returns first IP from comma-separated x-forwarded-for list', () => {
    expect(
      getClientIp(h({ 'x-forwarded-for': '203.0.113.42, 10.0.0.1, 10.0.0.2' })),
    ).toBe('203.0.113.42');
  });

  it('trims whitespace around the first x-forwarded-for entry', () => {
    expect(getClientIp(h({ 'x-forwarded-for': '  203.0.113.42  , 10.0.0.1' }))).toBe(
      '203.0.113.42',
    );
  });

  it('falls back to x-real-ip when x-forwarded-for is missing', () => {
    expect(getClientIp(h({ 'x-real-ip': '198.51.100.7' }))).toBe('198.51.100.7');
  });

  it('prefers x-forwarded-for over x-real-ip when both present', () => {
    expect(
      getClientIp(h({ 'x-forwarded-for': '203.0.113.42', 'x-real-ip': '198.51.100.7' })),
    ).toBe('203.0.113.42');
  });

  it('returns no-ip fallback when neither header is set', () => {
    expect(getClientIp(h({}))).toBe('no-ip');
  });

  it('returns no-ip when x-forwarded-for is empty string', () => {
    expect(getClientIp(h({ 'x-forwarded-for': '' }))).toBe('no-ip');
  });

  it('returns no-ip when x-forwarded-for is only commas/whitespace', () => {
    expect(getClientIp(h({ 'x-forwarded-for': ' , , ' }))).toBe('no-ip');
  });

  it('handles IPv6 addresses', () => {
    expect(getClientIp(h({ 'x-forwarded-for': '2001:db8::1, ::1' }))).toBe('2001:db8::1');
  });
});
