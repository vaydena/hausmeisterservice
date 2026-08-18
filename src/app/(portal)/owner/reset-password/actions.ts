'use server';

import { headers } from 'next/headers';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { clientEnv } from '@/lib/env';
import { getClientIp } from '@/lib/security/client-ip';
import { checkAuthRateLimit, formatRateLimitError } from '@/lib/security/rate-limit';

const schema = z.object({
  email: z.string().email('Bitte geben Sie eine gueltige E-Mail-Adresse ein.'),
});

export type OwnerResetState = { info?: string; error?: string };

/**
 * Eigentuemer-Variante der Passwort-Reset-Anforderung. Ruft dieselbe
 * Supabase-Funktion wie Staff/Bewohner, haengt aber ?owner=1 an redirectTo,
 * damit /reset-password/confirm und /reset-password/new den Rueckweg auf
 * /owner/login setzen. Rate-Limit-Bucket 'reset-password' bleibt geteilt
 * (Identifier ist die IP; die Enumeration-Oberflaeche ist identisch).
 */
export async function requestOwnerPasswordResetAction(
  _prev: OwnerResetState,
  formData: FormData,
): Promise<OwnerResetState> {
  const ip = getClientIp(await headers());
  const rl = await checkAuthRateLimit(ip, 'reset-password');
  if (!rl.allowed) {
    return { error: formatRateLimitError(rl.retryAfterSec) };
  }

  const parsed = schema.safeParse({ email: formData.get('email') });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Ungueltige Eingaben.' };
  }

  const supabase = await createSupabaseServerClient();
  const redirectUrl = new URL('/reset-password/confirm', clientEnv.NEXT_PUBLIC_APP_URL);
  redirectUrl.searchParams.set('owner', '1');
  await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: redirectUrl.toString(),
  });

  return {
    info: 'Falls ein Konto mit dieser E-Mail existiert, wurde ein Link versandt.',
  };
}
