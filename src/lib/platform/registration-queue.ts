import type { PlanInterval } from '@/lib/platform/billing';

/**
 * Sprint 137 · Die reine Logik der Registrierungs-Warteschlange.
 *
 * Bewusst ohne `server-only` und ohne Wert-Import: `registrations.ts` zieht
 * den Service-Client herein, und der prueft beim Laden die Env-Variablen —
 * ein Unit-Test dieser Rechnungen scheitert dann an fehlendem
 * NEXT_PUBLIC_SUPABASE_URL statt an der Rechnung selbst. Der Import oben ist
 * ein Typ-Import und verschwindet beim Uebersetzen.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

export interface PlatformPlanOption {
  id: string;
  code: string;
  name: string;
  monthlyCents: number;
  yearlyCents: number;
}

export interface TenantRegistration {
  tenantId: string;
  name: string;
  slug: string;
  ownerEmail: string | null;
  registeredAt: string;
  subscriptionStatus: string;
  trialEndsAt: string | null;
  currentPeriodEnd: string | null;
  /** Tarif, der am Mandanten haengt — nach der Freischaltung immer gesetzt. */
  assignedPlanId: string | null;
  assignedInterval: PlanInterval | null;
  /**
   * Der Tarif, den der Kunde bei der Registrierung angeklickt hat, gelesen
   * aus dem user_metadata des Inhabers. Siehe `loadPlatformRegistrations`,
   * warum diese zweite Quelle noetig ist.
   */
  requestedPlanCode: string | null;
  requestedInterval: PlanInterval | null;
  /** Verbleibende Tage der Testphase; 0 = keine mehr. Nie negativ. */
  trialDaysLeft: number | null;
  trialExpired: boolean;
}

/**
 * Verbleibende Tage der Testphase.
 *
 * Bewusst nie negativ: "noch -3 Tage" ist keine Aussage, die jemand lesen
 * will, und die Rundung auf angebrochene Tage wuerde sie im Rueckwaerts-Fall
 * auch noch verfaelschen. Ob die Frist durch ist, sagt `expired`.
 */
export function computeTrialDaysLeft(
  trialEndsAt: string | null,
  now: Date = new Date(),
): { daysLeft: number | null; expired: boolean } {
  if (!trialEndsAt) return { daysLeft: null, expired: false };
  const end = new Date(trialEndsAt).getTime();
  if (Number.isNaN(end)) return { daysLeft: null, expired: false };
  const diff = end - now.getTime();
  if (diff <= 0) return { daysLeft: 0, expired: true };
  return { daysLeft: Math.ceil(diff / DAY_MS), expired: false };
}

/**
 * Reihenfolge der Warteschlange: nach Frist, nicht nach Eingang.
 *
 * Der Betreiber arbeitet diese Liste von oben ab, und oben gehoert das hin,
 * wo ihm die Zeit davonlaeuft — eine abgelaufene Testphase sperrt den Kunden
 * aus der Anwendung aus (Proxy-Gate aus Sprint 10.8). Wer kein Trial-Datum
 * hat, kann nicht ablaufen und steht deshalb hinten. Gleichstand wird nach
 * Registrierungsdatum aufgeloest, damit die Sortierung stabil ist.
 */
export function sortRegistrationQueue(rows: TenantRegistration[]): TenantRegistration[] {
  return [...rows].sort((a, b) => {
    const aDeadline = a.trialEndsAt ? new Date(a.trialEndsAt).getTime() : Number.POSITIVE_INFINITY;
    const bDeadline = b.trialEndsAt ? new Date(b.trialEndsAt).getTime() : Number.POSITIVE_INFINITY;
    if (aDeadline !== bDeadline) return aDeadline - bDeadline;
    return new Date(a.registeredAt).getTime() - new Date(b.registeredAt).getTime();
  });
}

export function normalizePlanInterval(value: unknown): PlanInterval | null {
  if (value === 'yearly' || value === 'monthly') return value;
  return null;
}
