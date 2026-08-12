import 'server-only';
import type { User } from '@supabase/supabase-js';
import { createSupabaseServiceClient } from '@/lib/supabase/service';

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

  const created = (data as { created?: boolean } | null)?.created ?? false;
  return created ? 'provisioned' : 'existing';
}
