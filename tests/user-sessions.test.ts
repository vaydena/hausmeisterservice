import { describe, it, expect } from 'vitest';
import { parseUserSessions } from '@/lib/auth/user-sessions';

// Repraesentatives Payload wie list_user_sessions es zurueckliefert.
const OK_ROW = {
  id: '4c3f7ed4-6d5e-4dee-9f8a-1b2c3d4e5f60',
  created_at: '2026-08-14T09:00:00.000Z',
  updated_at: '2026-08-14T10:00:00.000Z',
  refreshed_at: '2026-08-14T10:15:00.000Z',
  not_after: '2026-08-21T09:00:00.000Z',
  user_agent: 'Mozilla/5.0 ...',
  ip: '203.0.113.42',
  aal: 'aal2',
  factor_id: '11111111-2222-3333-4444-555555555555',
};

describe('parseUserSessions', () => {
  it('returns [] for null', () => {
    expect(parseUserSessions(null)).toEqual([]);
  });

  it('returns [] for undefined', () => {
    expect(parseUserSessions(undefined)).toEqual([]);
  });

  it('returns [] for a non-array JSON value', () => {
    expect(parseUserSessions({ nope: true })).toEqual([]);
    expect(parseUserSessions('string')).toEqual([]);
    expect(parseUserSessions(42)).toEqual([]);
  });

  it('parses a single well-formed row', () => {
    const out = parseUserSessions([OK_ROW]);
    expect(out).toHaveLength(1);
    expect(out[0]).toEqual({
      id: OK_ROW.id,
      createdAt: OK_ROW.created_at,
      updatedAt: OK_ROW.updated_at,
      refreshedAt: OK_ROW.refreshed_at,
      notAfter: OK_ROW.not_after,
      userAgent: OK_ROW.user_agent,
      ip: OK_ROW.ip,
      aal: 'aal2',
      factorId: OK_ROW.factor_id,
    });
  });

  it('skips rows without id or created_at (partial-data resilience)', () => {
    // Wir wollen NICHT crashen, wenn Supabase eines Tages die auth.sessions-
    // Spalten umbenennt — statt dessen die betroffenen Rows still
    // verwerfen. Der Coverage-Test hier fixiert das Verhalten.
    const bad = [
      { ...OK_ROW, id: null },
      { ...OK_ROW, id: OK_ROW.id, created_at: null },
      null,
      42,
    ];
    expect(parseUserSessions(bad)).toEqual([]);
  });

  it('coerces missing optional fields to null and aal to "aal1"', () => {
    const partial = { id: OK_ROW.id, created_at: OK_ROW.created_at };
    const out = parseUserSessions([partial]);
    expect(out).toHaveLength(1);
    expect(out[0]).toEqual({
      id: OK_ROW.id,
      createdAt: OK_ROW.created_at,
      updatedAt: null,
      refreshedAt: null,
      notAfter: null,
      userAgent: null,
      ip: null,
      aal: 'aal1',
      factorId: null,
    });
  });

  it('preserves array order (list_user_sessions sorts server-side)', () => {
    const a = { ...OK_ROW, id: '00000000-0000-0000-0000-000000000001' };
    const b = { ...OK_ROW, id: '00000000-0000-0000-0000-000000000002' };
    const out = parseUserSessions([a, b]);
    expect(out.map((s) => s.id)).toEqual([a.id, b.id]);
  });
});
