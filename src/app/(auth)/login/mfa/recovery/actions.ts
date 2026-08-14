'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseServiceClient } from '@/lib/supabase/service';
import { getClientIp } from '@/lib/security/client-ip';
import { checkAuthRateLimit, formatRateLimitError } from '@/lib/security/rate-limit';
import { recoveryCodeSchema } from '@/lib/auth/recovery-code-schema';
import { normalizeRecoveryCode, RECOVERY_CODE_LENGTH } from '@/lib/auth/mfa-recovery';

export type RecoveryLoginState = { error?: string };

/**
 * Loest einen MFA-Recovery-Code beim Login ein (Sprint 26). Voraussetzung:
 * der User hat gerade Passwort-Login gemacht (aal1-Session), landet auf
 * /login/mfa und klickt "Ich habe mein Handy verloren" -> /login/mfa/recovery.
 *
 * Ablauf:
 *   1. Rate-Limit IP-basiert (mfa-recovery, 5/15min).
 *   2. Zod-Validierung + Normalisierung (Bindestrich/Whitespace weg).
 *   3. RPC consume_mfa_recovery_code: bcrypt-Match + used_at setzen.
 *   4. Bei true: alle MFA-Faktoren des Users via admin API loeschen —
 *      damit faellt aal2-Requirement weg und der User kann direkt weiter
 *      (ohne dass wir seine aal1-Session synthetisch auf aal2 heben
 *      muessten).
 *   5. Redirect nach /settings/account?info=mfa-lost, damit der User
 *      unmittelbar einen frischen MFA-Faktor einrichten kann.
 */
export async function useMfaRecoveryCodeAction(
  _prev: RecoveryLoginState,
  formData: FormData,
): Promise<RecoveryLoginState> {
  const ip = getClientIp(await headers());
  const rl = await checkAuthRateLimit(ip, 'mfa-recovery');
  if (!rl.allowed) {
    return { error: formatRateLimitError(rl.retryAfterSec) };
  }

  const parsed = recoveryCodeSchema.safeParse({ code: formData.get('code') });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Ungueltige Eingaben.' };
  }

  const normalized = normalizeRecoveryCode(parsed.data.code);
  if (normalized.length !== RECOVERY_CODE_LENGTH) {
    return { error: 'Der Recovery-Code hat die falsche Laenge.' };
  }

  const supabase = await createSupabaseServerClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData?.user) {
    return { error: 'Bitte zuerst mit Passwort anmelden.' };
  }
  const userId = userData.user.id;

  const service = createSupabaseServiceClient();
  const { data: matched, error: consumeError } = await service.rpc(
    'consume_mfa_recovery_code',
    {
      p_user_id: userId,
      p_plaintext: normalized,
      p_used_ip: ip,
    },
  );
  if (consumeError) {
    return { error: 'Recovery-Code konnte nicht geprueft werden. Bitte spaeter erneut.' };
  }
  if (matched !== true) {
    return {
      error:
        'Recovery-Code ungueltig oder bereits verwendet. Bitte einen anderen Code eingeben.',
    };
  }

  // Alle MFA-Faktoren des Users entfernen, damit aal2 nicht mehr verlangt
  // wird. listFactors nutzt die aal1-Session (User sieht eigene Faktoren);
  // admin.mfa.deleteFactor benoetigt service_role.
  const { data: factorsData } = await supabase.auth.mfa.listFactors();
  const all = factorsData?.all ?? [];
  for (const f of all) {
    await service.auth.admin.mfa.deleteFactor({ id: f.id, userId });
  }

  // Sprint 32: Redirect-Ziel richtet sich nach dem urspruenglichen next-
  // Kontext des Login-Flows. Portal-Residents (next=/portal/*) landen auf
  // /portal/account und koennen dort MFA neu einrichten; Staff/Owner
  // landen weiterhin auf /settings/account. Beide Pfade zeigen einen
  // "MFA verloren"-Banner und die Neu-Enroll-Sektion.
  const nextRaw = String(formData.get('next') ?? '');
  const target = nextRaw.startsWith('/portal/')
    ? '/portal/account?info=mfa-lost'
    : '/settings/account?info=mfa-lost';
  redirect(target);
}
