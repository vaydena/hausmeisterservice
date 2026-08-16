import 'server-only';
import type { User } from '@supabase/supabase-js';
import * as Sentry from '@sentry/nextjs';
import { createSupabaseServiceClient } from '@/lib/supabase/service';
import { createPlatformServiceClient } from '@/lib/supabase/platform';
import { SIGNUP_DEFAULT_MODULE_KEYS } from '@/lib/modules/registry';

/**
 * Provisioniert einen Tenant für einen bestätigten User anhand des im
 * user_metadata gespeicherten Signup-Kontexts. Idempotent: die RPC gibt
 * bei bereits existierender Membership `{ created: false }` zurück.
 *
 * Wird sowohl vom /auth/callback (Happy-Path direkt nach E-Mail-Confirm)
 * als auch von signInAction (Fallback für den Fall, dass der Callback
 * nie ausgeführt wurde oder das RPC still failed) benutzt. Doppelte
 * Absicherung, weil ein fehlender Tenant im Live-System zum
 * ERR_TOO_MANY_REDIRECTS-Loop zwischen /dashboard und /login führt.
 *
 * Return:
 *   'provisioned'         — neue Membership + Rolle wurden angelegt
 *   'existing'            — Membership war bereits da (idempotent-hit)
 *   'no-signup-metadata'  — kein Signup-Kontext im user_metadata
 *                           (regulärer Login eines Bestandsusers,
 *                           Reset-Password- oder Magic-Link-Callback)
 *   'error'               — RPC schlug fehl (Details in console.error)
 */
export async function ensureTenantForUser(
  user: User,
): Promise<'provisioned' | 'existing' | 'no-signup-metadata' | 'error'> {
  const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
  const slug = typeof meta.signup_slug === 'string' ? meta.signup_slug : null;
  const companyName =
    typeof meta.signup_company_name === 'string' ? meta.signup_company_name : null;
  const termsAcceptedAt =
    typeof meta.signup_terms_accepted_at === 'string' ? meta.signup_terms_accepted_at : null;
  const planCode = typeof meta.signup_plan_code === 'string' ? meta.signup_plan_code : null;
  const planInterval =
    meta.signup_plan_interval === 'yearly' ? 'yearly' : 'monthly';

  if (!slug || !companyName) return 'no-signup-metadata';

  const service = createSupabaseServiceClient();
  const { data, error } = await service.rpc('provision_signup_tenant', {
    p_user_id: user.id,
    p_slug: slug,
    p_company_name: companyName,
    p_terms_accepted_at: termsAcceptedAt ?? new Date().toISOString(),
  });

  if (error) {
    console.error('ensureTenantForUser: provision_signup_tenant failed', error);
    return 'error';
  }

  const result = data as { created?: boolean; tenant_id?: string } | null;
  const created = result?.created ?? false;

  // Sprint 123: Startmodule aktivieren. Ohne diesen Block bekommt der neue
  // Mandant KEINE tenant_modules-Zeile, und weil eine fehlende Zeile ein
  // AUS ist (siehe getEnabledModules), startet der Kunde in einer
  // Anwendung ohne Objekte, ohne Auftraege, ohne Mitarbeiter.
  //
  // Warum die Modul-Liste hier aus dem TS-Registry kommt und nicht in der
  // Provisionierungs-RPC steht: die Registry ist laut ihrem eigenen Kopf
  // die einzige Wahrheit ueber Module. Eine zweite Liste in SQL waere eine
  // Kopie, die beim naechsten neuen Modul lautlos veraltet — und der
  // Fehler faellt erst dem Kunden auf, der das Modul nie zu sehen bekommt.
  //
  // Bewusst KEIN throw, gleiche Begruendung wie beim Tarif-Block darunter:
  // der Mandant existiert an dieser Stelle schon. Eine Exception zeigt dem
  // Kunden eine Fehlerseite fuer ein Konto, das erfolgreich entstanden
  // ist — und beim zweiten Anlauf liefert die RPC `created: false`, dieser
  // Block wird uebersprungen und die Module fehlen dann dauerhaft. Ohne
  // Module kann der Inhaber sie unter Einstellungen → Mandant selbst
  // einschalten; das ist reparierbar, die Fehlerseite nicht.
  if (created && result?.tenant_id) {
    const { error: modulesError } = await service.from('tenant_modules').upsert(
      SIGNUP_DEFAULT_MODULE_KEYS.map((module_key) => ({
        tenant_id: result.tenant_id!,
        module_key,
        enabled: true,
      })),
      { onConflict: 'tenant_id,module_key' },
    );

    if (modulesError) {
      Sentry.captureException(
        new Error(`Signup: Startmodule konnten nicht aktiviert werden: ${modulesError.message}`),
        { extra: { tenantId: result.tenant_id, moduleCount: SIGNUP_DEFAULT_MODULE_KEYS.length } },
      );
    }
  }

  // Plan-Vorauswahl aus Signup nachziehen — provision_signup_tenant setzt nur
  // die Kern-Felder, das SaaS-Modell hängt dran.
  //
  // Sprint 104: Hier wird bewusst NICHT geworfen, anders als in der uebrigen
  // Guard-Schicht. Der Tenant ist an dieser Stelle bereits angelegt; eine
  // Exception wuerde dem Kunden eine Fehlerseite zeigen, obwohl sein Konto
  // erfolgreich entstanden ist. Schlimmer noch: beim naechsten Versuch
  // liefert die RPC `created: false`, dieser Block wird uebersprungen — die
  // Planwahl waere dann dauerhaft verloren UND der Kunde haette einen Fehler
  // gesehen. Ohne Plan landet er dagegen im Trial und kann den Tarif unter
  // Einstellungen→Abo selbst waehlen; das ist reparierbar.
  //
  // Sichtbar muss es trotzdem werden, denn der Kunde hat einen Tarif
  // ausgewaehlt und bekommt still einen anderen. console.error reicht dafuer
  // nicht: Sentry haengt nur an unbehandelten Exceptions, geloggte Zeilen
  // landen ausschliesslich im Server-Log, das niemand liest. Deshalb
  // captureException — Meldung ohne Abbruch.
  if (created && planCode && result?.tenant_id) {
    const { data: plan, error: planError } = await createPlatformServiceClient()
      .from('subscription_plans')
      .select('id')
      .eq('code', planCode)
      .maybeSingle();

    if (planError) {
      Sentry.captureException(
        new Error(`Signup: Tarif "${planCode}" konnte nicht aufgeloest werden: ${planError.message}`),
        { extra: { tenantId: result.tenant_id, planCode, planInterval } },
      );
    } else if (!plan) {
      // Kein Fehler, aber auch kein Treffer: der im Signup mitgegebene
      // Plan-Code existiert nicht (mehr). Das ist ein Datenfehler in der
      // Plan-Tabelle bzw. im Signup-Formular und faellt sonst niemandem auf.
      Sentry.captureException(
        new Error(`Signup: Tarif "${planCode}" existiert nicht in subscription_plans`),
        { extra: { tenantId: result.tenant_id, planCode } },
      );
    } else {
      const { error: updateError } = await service
        .from('tenants')
        .update({
          subscription_plan_id: plan.id,
          subscription_interval: planInterval,
        })
        .eq('id', result.tenant_id);

      if (updateError) {
        Sentry.captureException(
          new Error(`Signup: Tarif konnte dem Mandanten nicht zugewiesen werden: ${updateError.message}`),
          { extra: { tenantId: result.tenant_id, planCode, planInterval } },
        );
      }
    }
  }

  return created ? 'provisioned' : 'existing';
}
