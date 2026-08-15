import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Sprint 104: Verhalten der Guard-Schicht bei fehlgeschlagenen Queries.
 *
 * Diese Tests pruefen genau den Zweig, der sich im Browser NICHT vorfuehren
 * laesst: gegen eine gesunde Datenbank kann man einen Query-Fehler nicht
 * erzeugen. Ein Klick-Durchlauf beweist hier nur, dass der Normalfall noch
 * geht — und der war nie das Problem.
 *
 * Jeder Guard wird deshalb gegen beide Ergebnisse gefahren:
 *
 *   1. `{ data: null, error }`  — Stoerung, muss sichtbar werden
 *   2. `{ data: [] , error: null }` bzw. `{ data: null, error: null }`
 *      — legitimer Leerzustand, muss unveraendert durchlaufen
 *
 * Punkt 2 ist der wichtigere Test. Ein Helper, der bei jeder leeren Liste
 * eine Fehlerseite wirft, waere schlimmer als das Problem, das er loest.
 */

vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));

const captureException = vi.fn();
vi.mock('@sentry/nextjs', () => ({
  captureException: (...args: unknown[]) => captureException(...args),
}));

/** Der Fehler, an dem der ganze Faden haengt — echte Form aus dem Live-Vorfall. */
const RECURSION_ERROR = {
  code: '42P17',
  message: 'infinite recursion detected in policy for relation "memberships"',
  details: null,
  hint: null,
};

/**
 * Kettenfaehiger Supabase-Stub: jeder Methodenaufruf (.from/.select/.eq/
 * .order/.limit/.in/.maybeSingle/.update) liefert wieder die Kette, und ein
 * `await` auf die Kette loest zum konfigurierten Result auf. Damit muss der
 * Test die konkrete Aufrufreihenfolge der jeweiligen Query nicht nachbauen.
 */
function makeChain(result: unknown) {
  const chain: Record<string | symbol, unknown> = new Proxy(
    {},
    {
      get(_target, prop) {
        if (prop === 'then') {
          return (resolve: (v: unknown) => void) => resolve(result);
        }
        return () => chain;
      },
    },
  );
  return chain;
}

/** Client, dessen Queries der Reihe nach die uebergebenen Results liefern. */
function makeClient(results: unknown[], user: { id: string; email?: string } | null = { id: 'u1' }) {
  let i = 0;
  return {
    auth: {
      getUser: () => Promise.resolve({ data: { user }, error: null }),
    },
    from: () => makeChain(results[Math.min(i++, results.length - 1)]),
    rpc: () => makeChain(results[Math.min(i++, results.length - 1)]),
  };
}

const serverClient = vi.fn();
const serviceClient = vi.fn();
const platformClient = vi.fn();

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: () => Promise.resolve(serverClient()),
}));
vi.mock('@/lib/supabase/service', () => ({
  createSupabaseServiceClient: () => serviceClient(),
}));
vi.mock('@/lib/supabase/platform', () => ({
  createPlatformServiceClient: () => platformClient(),
}));

import { getEffectivePermissions } from '@/lib/permissions/effective';
import { getTenantContext } from '@/lib/tenant/current';
import { getEnabledModules } from '@/lib/modules/enabled';
import { evaluateSubscriptionAccess } from '@/lib/tenant/subscription-guard';
import { getEnabledFeatures } from '@/lib/tenant/features';
import { ensureTenantForUser } from '@/lib/auth/ensure-tenant';
import { SupabaseQueryError } from '@/lib/supabase/unwrap';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('getEffectivePermissions', () => {
  it('wirft, wenn die Rollenzuweisungen nicht geladen werden koennen', async () => {
    serverClient.mockReturnValue(makeClient([{ data: null, error: RECURSION_ERROR }]));
    // Ohne das hier bekaeme der Mitarbeiter ein leeres Rechte-Set und damit
    // eine Oberflaeche, die aussieht, als haette man ihm alles entzogen.
    await expect(getEffectivePermissions('u1', 't1')).rejects.toBeInstanceOf(SupabaseQueryError);
  });

  it('wirft, wenn die Rechte der Rollen nicht geladen werden koennen', async () => {
    serverClient.mockReturnValue(
      makeClient([
        { data: [{ role_id: 'r1' }], error: null },
        { data: null, error: RECURSION_ERROR },
      ]),
    );
    await expect(getEffectivePermissions('u1', 't1')).rejects.toBeInstanceOf(SupabaseQueryError);
  });

  it('liefert ein leeres Set, wenn der User schlicht keine Rolle hat', async () => {
    serverClient.mockReturnValue(makeClient([{ data: [], error: null }]));
    await expect(getEffectivePermissions('u1', 't1')).resolves.toEqual(new Set());
  });

  it('liefert die Permissions im Normalfall', async () => {
    serverClient.mockReturnValue(
      makeClient([
        { data: [{ role_id: 'r1' }], error: null },
        { data: [{ permission_key: 'work_orders.read' }], error: null },
      ]),
    );
    await expect(getEffectivePermissions('u1', 't1')).resolves.toEqual(
      new Set(['work_orders.read']),
    );
  });
});

describe('getTenantContext', () => {
  it('wirft, wenn die Membership-Query scheitert', async () => {
    serverClient.mockReturnValue(makeClient([{ data: null, error: RECURSION_ERROR }]));
    // Vorher: null -> /no-access. Eine Stoerung hat dem zahlenden Kunden
    // gemeldet, er gehoere zu keinem Mandanten.
    await expect(getTenantContext()).rejects.toBeInstanceOf(SupabaseQueryError);
  });

  it('liefert null, wenn es wirklich keine Membership gibt', async () => {
    serverClient.mockReturnValue(makeClient([{ data: null, error: null }]));
    await expect(getTenantContext()).resolves.toBeNull();
  });

  it('liefert null, wenn niemand eingeloggt ist', async () => {
    serverClient.mockReturnValue(makeClient([], null));
    await expect(getTenantContext()).resolves.toBeNull();
  });

  it('liefert den Kontext im Normalfall', async () => {
    serverClient.mockReturnValue(
      makeClient([
        { data: { id: 'm1', tenant_id: 't1', is_owner: true }, error: null },
        { data: { display_name: 'Chef' }, error: null },
      ]),
    );
    await expect(getTenantContext()).resolves.toMatchObject({
      tenantId: 't1',
      membershipId: 'm1',
      isOwner: true,
      displayName: 'Chef',
    });
  });
});

describe('getEnabledModules', () => {
  it('wirft, wenn tenant_modules nicht geladen werden kann', async () => {
    serverClient.mockReturnValue(makeClient([{ data: null, error: RECURSION_ERROR }]));
    await expect(getEnabledModules('t1')).rejects.toBeInstanceOf(SupabaseQueryError);
  });

  it('liefert die Core-Module, wenn der Mandant wirklich keine Zusatzmodule hat', async () => {
    serverClient.mockReturnValue(makeClient([{ data: [], error: null }]));
    const mods = await getEnabledModules('t1');
    expect(mods.size).toBeGreaterThan(0);
  });
});

describe('evaluateSubscriptionAccess', () => {
  it('wirft, statt einen DB-Fehler als "gesperrt" zu melden', async () => {
    serviceClient.mockReturnValue(makeClient([{ data: null, error: RECURSION_ERROR }]));
    // Der teuerste Fall: vorher fuehrte das zu blocked/suspended und damit
    // zur Sperrseite — ein Timeout sah aus wie eine Kontosperre.
    await expect(evaluateSubscriptionAccess('t1')).rejects.toBeInstanceOf(SupabaseQueryError);
  });

  it('meldet weiterhin "suspended", wenn es die Tenant-Zeile wirklich nicht gibt', async () => {
    serviceClient.mockReturnValue(makeClient([{ data: null, error: null }]));
    await expect(evaluateSubscriptionAccess('t1')).resolves.toEqual({
      access: 'blocked',
      reason: 'suspended',
    });
  });

  it('laesst einen aktiven Mandanten durch', async () => {
    serviceClient.mockReturnValue(
      makeClient([
        {
          data: { subscription_status: 'active', trial_ends_at: null, current_period_end: null },
          error: null,
        },
      ]),
    );
    await expect(evaluateSubscriptionAccess('t1')).resolves.toEqual({ access: 'allowed' });
  });
});

describe('getEnabledFeatures', () => {
  it('wirft, statt dem Kunden alle Features zu sperren', async () => {
    serviceClient.mockReturnValue(makeClient([{ data: null, error: RECURSION_ERROR }]));
    // Vorher: DEFAULT_FEATURES (alles false) -> requireFeature schickt auf
    // "bitte upgraden", obwohl der Plan die Funktion enthaelt.
    await expect(getEnabledFeatures('t1')).rejects.toBeInstanceOf(SupabaseQueryError);
  });

  it('zeigt im Trial weiterhin alles', async () => {
    serviceClient.mockReturnValue(
      makeClient([{ data: { subscription_status: 'trial', subscription_plan_id: null }, error: null }]),
    );
    await expect(getEnabledFeatures('t1')).resolves.toEqual({
      gps: true,
      portal: true,
      vehicles: true,
      automations: true,
      api: true,
    });
  });
});

describe('ensureTenantForUser', () => {
  const signupUser = {
    id: 'u1',
    user_metadata: {
      signup_slug: 'acme',
      signup_company_name: 'Acme GmbH',
      signup_plan_code: 'business',
    },
  };

  it('bricht NICHT ab, wenn der Tarif nicht aufloesbar ist — meldet ihn aber', async () => {
    // Bewusste Ausnahme von der throw-Regel: der Tenant ist zu diesem
    // Zeitpunkt schon angelegt. Eine Exception wuerde dem Kunden eine
    // Fehlerseite zeigen, obwohl sein Konto entstanden ist — und die
    // Tarifwahl beim Retry dauerhaft verlieren, weil created dann false ist.
    serviceClient.mockReturnValue(makeClient([{ data: { created: true, tenant_id: 't1' }, error: null }]));
    platformClient.mockReturnValue(makeClient([{ data: null, error: RECURSION_ERROR }]));

    await expect(ensureTenantForUser(signupUser as never)).resolves.toBe('provisioned');
    expect(captureException).toHaveBeenCalledTimes(1);
    expect(String(captureException.mock.calls[0]?.[0])).toContain('business');
  });

  it('meldet auch einen Plan-Code, den es gar nicht gibt', async () => {
    serviceClient.mockReturnValue(makeClient([{ data: { created: true, tenant_id: 't1' }, error: null }]));
    platformClient.mockReturnValue(makeClient([{ data: null, error: null }]));

    await expect(ensureTenantForUser(signupUser as never)).resolves.toBe('provisioned');
    expect(captureException).toHaveBeenCalledTimes(1);
  });

  it('meldet nichts, wenn alles glatt laeuft', async () => {
    serviceClient.mockReturnValue(
      makeClient([
        { data: { created: true, tenant_id: 't1' }, error: null },
        { error: null }, // das abschliessende UPDATE
      ]),
    );
    platformClient.mockReturnValue(makeClient([{ data: { id: 'plan-1' }, error: null }]));

    await expect(ensureTenantForUser(signupUser as never)).resolves.toBe('provisioned');
    expect(captureException).not.toHaveBeenCalled();
  });
});
