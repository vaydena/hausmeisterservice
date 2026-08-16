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

/**
 * Eine vom Kunden selbst angeforderte, noch offene Rechnung.
 *
 * Sie ist der Beleg, auf den der Kunde ueberwiesen hat: Betrag, Zeitraum und
 * Verwendungszweck stehen darin. Der Betreiber muss sie beim Freischalten
 * sehen, sonst quittiert er eine Zahlung, die er gar nicht zuordnen kann.
 */
export interface OpenInvoice {
  id: string;
  invoiceNumber: string;
  totalCents: number;
  planId: string | null;
  interval: PlanInterval | null;
  issuedAt: string;
  dueAt: string | null;
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
  /** Juengste offene Rechnung des Mandanten, falls er eine angefordert hat. */
  openInvoice: OpenInvoice | null;
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

/** Woher die Vorauswahl im Freischalt-Formular stammt. */
export type PlanSelectionSource = 'open_invoice' | 'tenant' | 'signup' | 'fallback' | 'none';

export interface PlanSelection {
  planId: string;
  interval: PlanInterval;
  source: PlanSelectionSource;
}

/**
 * Welcher Tarif steht im Freischalt-Formular vorausgewaehlt?
 *
 * Die Rangfolge geht von der konkretesten Willensaeusserung zur vagesten:
 *
 *  1. offene Rechnung — der Kunde hat sich fuer genau diesen Tarif einen
 *     Beleg ausstellen lassen und darauf ueberwiesen. Naeher am
 *     Zahlungseingang kommt keine Quelle heran.
 *  2. Mandant — was in Einstellungen→Abo steht. Aktueller Stand, denn wer
 *     nach der Registrierung wechselt, aendert genau dieses Feld.
 *  3. Registrierung — der Wunsch aus dem Signup. Nur Rueckfall: er ist der
 *     aelteste Wert und verliert gegen einen spaeteren Wechsel. Er steht
 *     ueberhaupt hier, weil er im Sprint-137-Befund die einzige erhaltene
 *     Quelle war (siehe `loadPlatformRegistrations`).
 *  4. erster Tarif — damit das Formular nicht leer startet.
 *
 * Jeder Kandidat wird gegen die Tarifliste geprueft. Ein Tarif, den es nicht
 * mehr gibt, wuerde als `defaultValue` eines `<select>` stillschweigend zur
 * ersten Option — der Betreiber saehe "Starter" und schaltete "Business"
 * frei, ohne dass irgendwo ein Fehler auftaucht.
 */
export function pickPlanSelection(
  registration: TenantRegistration,
  plans: PlatformPlanOption[],
): PlanSelection {
  const byId = (id: string | null | undefined) =>
    id ? plans.find((p) => p.id === id) : undefined;
  const byCode = (code: string | null | undefined) =>
    code ? plans.find((p) => p.code === code) : undefined;

  const invoicePlan = byId(registration.openInvoice?.planId);
  if (invoicePlan) {
    return {
      planId: invoicePlan.id,
      interval: registration.openInvoice?.interval ?? 'monthly',
      source: 'open_invoice',
    };
  }

  const tenantPlan = byId(registration.assignedPlanId);
  if (tenantPlan) {
    return {
      planId: tenantPlan.id,
      interval: registration.assignedInterval ?? 'monthly',
      source: 'tenant',
    };
  }

  const signupPlan = byCode(registration.requestedPlanCode);
  if (signupPlan) {
    return {
      planId: signupPlan.id,
      interval: registration.requestedInterval ?? 'monthly',
      source: 'signup',
    };
  }

  const first = plans[0];
  if (first) return { planId: first.id, interval: 'monthly', source: 'fallback' };
  return { planId: '', interval: 'monthly', source: 'none' };
}
