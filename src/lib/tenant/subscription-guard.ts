import 'server-only';
import { createSupabaseServiceClient } from '@/lib/supabase/service';
import { unwrapMaybeRow } from '@/lib/supabase/unwrap';

export type SubscriptionAccess =
  | { access: 'allowed' }
  | { access: 'trial'; endsAt: string }
  | { access: 'blocked'; reason: 'trial_expired' | 'past_due' | 'suspended' | 'canceled' };

/**
 * Ist der Tenant für die App noch nutzbar?
 * Blocking → UI sollte den User auf /zahlung-erforderlich schicken (die Sperrseite
 * lässt aber nur /settings/subscription und Logout durch).
 */
export async function evaluateSubscriptionAccess(tenantId: string): Promise<SubscriptionAccess> {
  const service = createSupabaseServiceClient();
  // Sprint 104: Der teuerste verschluckte Fehler im ganzen Projekt. `!tenant`
  // fuehrt zu `blocked/suspended`, und das App-Layout schickt den Kunden
  // daraufhin auf /zahlung-erforderlich. Ein Timeout auf dieser Query hat
  // einem bezahlenden Mandanten also gemeldet, sein Konto sei gesperrt — und
  // ihn gleichzeitig aus der gesamten Anwendung ausgesperrt, weil die
  // Sperrseite nur noch Abo und Logout durchlaesst. Jetzt bleibt `suspended`
  // dem echten Fall vorbehalten, dass es die Tenant-Zeile nicht gibt.
  const tenant = unwrapMaybeRow(
    await service
      .from('tenants')
      .select('subscription_status, trial_ends_at, current_period_end')
      .eq('id', tenantId)
      .maybeSingle(),
    'Abo-Status des Mandanten',
  );
  if (!tenant) return { access: 'blocked', reason: 'suspended' };

  const now = Date.now();
  const trialEnds = tenant.trial_ends_at ? new Date(tenant.trial_ends_at).getTime() : null;
  const periodEnds = tenant.current_period_end ? new Date(tenant.current_period_end).getTime() : null;

  switch (tenant.subscription_status) {
    case 'active':
      // Bezahlt bis zum Periodenende; darüber hinaus fällt der Betreiber üblicherweise
      // auf 'past_due', erst dann sperren wir.
      return { access: 'allowed' };
    case 'trial':
      if (trialEnds && trialEnds < now) return { access: 'blocked', reason: 'trial_expired' };
      if (trialEnds) return { access: 'trial', endsAt: tenant.trial_ends_at! };
      return { access: 'allowed' };
    case 'past_due':
      return { access: 'blocked', reason: 'past_due' };
    case 'suspended':
      return { access: 'blocked', reason: 'suspended' };
    case 'canceled':
      // Nach Kündigung darf der Nutzer bis Periodenende weitermachen.
      if (periodEnds && periodEnds > now) return { access: 'allowed' };
      return { access: 'blocked', reason: 'canceled' };
    default:
      return { access: 'allowed' };
  }
}

const ALLOW_WHEN_BLOCKED = [
  '/settings/subscription',
  '/settings/privacy',
  '/api/privacy/',
  '/logout',
  '/api/platform/invoices/',
  '/api/auth/',
  '/impressum',
  '/datenschutz',
  '/agb',
  '/avv',
  '/hilfe',
];

export function isPathAllowedWhenBlocked(pathname: string): boolean {
  return ALLOW_WHEN_BLOCKED.some((p) => pathname === p || pathname.startsWith(`${p}/`) || pathname.startsWith(p));
}
