'use server';

import { headers } from 'next/headers';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { clientEnv } from '@/lib/env';
import { getClientIp } from '@/lib/security/client-ip';
import { checkAuthRateLimit, formatRateLimitError } from '@/lib/security/rate-limit';

const schema = z.object({
  email: z.string().email('Bitte geben Sie eine gültige E-Mail-Adresse ein.'),
});

export type ResetState = { info?: string; error?: string };

export async function requestPasswordResetAction(
  _prev: ResetState,
  formData: FormData,
): Promise<ResetState> {
  // Zuerst E-Mail-Format pruefen — eine formal ungueltige Adresse darf das
  // Rate-Limit nicht verbrauchen (sonst sperrt ein Tippfehler den Nutzer aus).
  const parsed = schema.safeParse({ email: formData.get('email') });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Ungültige Eingaben.' };
  }

  // Rate-Limit erst fuer formal gueltige Anfragen: Reset-Password ist ein
  // E-Mail-Enumeration-Vektor (Mail geht nur an registrierte Adressen) und
  // belastet das Supabase-E-Mail-Kontingent. 3/Stunde reichen fuer legitime
  // Vergesslichkeit, blockieren aber Massen-Enumeration. KEIN Reset auf
  // Erfolg — sonst waere der Enumeration-Schutz umgangen.
  const ip = getClientIp(await headers());
  const rl = await checkAuthRateLimit(ip, 'reset-password');
  if (!rl.allowed) {
    return { error: formatRateLimitError(rl.retryAfterSec) };
  }

  const supabase = await createSupabaseServerClient();
  await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${clientEnv.NEXT_PUBLIC_APP_URL}/reset-password/confirm`,
  });

  // Immer neutral antworten (keine Auskunft, ob E-Mail existiert).
  return {
    info: 'Falls ein Konto mit dieser E-Mail existiert, wurde ein Link versandt.',
  };
}
