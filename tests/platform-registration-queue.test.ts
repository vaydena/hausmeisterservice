import { describe, it, expect } from 'vitest';
import {
  computeTrialDaysLeft,
  sortRegistrationQueue,
  type TenantRegistration,
} from '../src/lib/platform/registration-queue';

const NOW = new Date('2026-08-16T12:00:00.000Z');
const DAY = 24 * 60 * 60 * 1000;

function iso(offsetDays: number): string {
  return new Date(NOW.getTime() + offsetDays * DAY).toISOString();
}

function registration(over: Partial<TenantRegistration> = {}): TenantRegistration {
  return {
    tenantId: over.tenantId ?? '00000000-0000-0000-0000-000000000000',
    name: 'Testagentur',
    slug: 'testagentur',
    ownerEmail: 'inhaber@example.test',
    registeredAt: iso(-30),
    subscriptionStatus: 'trial',
    trialEndsAt: iso(10),
    currentPeriodEnd: null,
    assignedPlanId: null,
    assignedInterval: null,
    requestedPlanCode: null,
    requestedInterval: null,
    trialDaysLeft: 10,
    trialExpired: false,
    ...over,
  };
}

describe('computeTrialDaysLeft', () => {
  it('zaehlt angebrochene Tage aufwaerts — 10 Tage und 1 Stunde sind 11 Tage', () => {
    const result = computeTrialDaysLeft(new Date(NOW.getTime() + 10 * DAY + 3600_000).toISOString(), NOW);
    expect(result).toEqual({ daysLeft: 11, expired: false });
  });

  it('meldet 0 Tage und expired, sobald die Frist durch ist', () => {
    expect(computeTrialDaysLeft(iso(-0.5), NOW)).toEqual({ daysLeft: 0, expired: true });
    expect(computeTrialDaysLeft(iso(-40), NOW)).toEqual({ daysLeft: 0, expired: true });
  });

  it('wird nie negativ — "noch -3 Tage" ist keine Aussage, die jemand lesen will', () => {
    const { daysLeft } = computeTrialDaysLeft(iso(-3), NOW);
    expect(daysLeft).toBe(0);
  });

  it('ohne Trial-Datum gibt es weder Restlaufzeit noch Ablauf', () => {
    expect(computeTrialDaysLeft(null, NOW)).toEqual({ daysLeft: null, expired: false });
  });

  it('behandelt unlesbare Datumswerte wie "kein Datum" statt NaN durchzureichen', () => {
    expect(computeTrialDaysLeft('nicht-datum', NOW)).toEqual({ daysLeft: null, expired: false });
  });
});

describe('sortRegistrationQueue', () => {
  it('stellt die naechste Frist nach oben, nicht die aelteste Registrierung', () => {
    const spaeterRegistriertAberDringend = registration({
      tenantId: 'a',
      registeredAt: iso(-2),
      trialEndsAt: iso(1),
    });
    const laengstRegistriertAberZeit = registration({
      tenantId: 'b',
      registeredAt: iso(-90),
      trialEndsAt: iso(20),
    });

    const sorted = sortRegistrationQueue([laengstRegistriertAberZeit, spaeterRegistriertAberDringend]);
    expect(sorted.map((r) => r.tenantId)).toEqual(['a', 'b']);
  });

  it('abgelaufene Testphasen stehen ganz oben, weil der Kunde bereits ausgesperrt ist', () => {
    const abgelaufen = registration({ tenantId: 'abgelaufen', trialEndsAt: iso(-5) });
    const laeuftBald = registration({ tenantId: 'bald', trialEndsAt: iso(1) });
    const laeuftSpaeter = registration({ tenantId: 'spaeter', trialEndsAt: iso(20) });

    const sorted = sortRegistrationQueue([laeuftSpaeter, laeuftBald, abgelaufen]);
    expect(sorted.map((r) => r.tenantId)).toEqual(['abgelaufen', 'bald', 'spaeter']);
  });

  it('Mandanten ohne Trial-Datum koennen nicht ablaufen und stehen deshalb hinten', () => {
    const ohneFrist = registration({ tenantId: 'ohne', trialEndsAt: null });
    const mitFrist = registration({ tenantId: 'mit', trialEndsAt: iso(300) });

    const sorted = sortRegistrationQueue([ohneFrist, mitFrist]);
    expect(sorted.map((r) => r.tenantId)).toEqual(['mit', 'ohne']);
  });

  it('loest Gleichstand nach Registrierungsdatum auf, damit die Reihenfolge stabil bleibt', () => {
    const gleicheFrist = iso(5);
    const frueher = registration({ tenantId: 'frueher', registeredAt: iso(-40), trialEndsAt: gleicheFrist });
    const spaeter = registration({ tenantId: 'spaeter', registeredAt: iso(-2), trialEndsAt: gleicheFrist });

    const sorted = sortRegistrationQueue([spaeter, frueher]);
    expect(sorted.map((r) => r.tenantId)).toEqual(['frueher', 'spaeter']);
  });

  it('laesst die Eingabeliste unberuehrt', () => {
    const input = [
      registration({ tenantId: 'b', trialEndsAt: iso(20) }),
      registration({ tenantId: 'a', trialEndsAt: iso(1) }),
    ];
    sortRegistrationQueue(input);
    expect(input.map((r) => r.tenantId)).toEqual(['b', 'a']);
  });
});
