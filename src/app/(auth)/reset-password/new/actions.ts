'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';

const schema = z
  .object({
    password: z
      .string()
      .min(10, 'Passwort muss mindestens 10 Zeichen haben.')
      .max(128, 'Passwort darf hoechstens 128 Zeichen haben.'),
    passwordConfirm: z.string(),
  })
  .refine((v) => v.password === v.passwordConfirm, {
    path: ['passwordConfirm'],
    message: 'Die Passwoerter stimmen nicht ueberein.',
  });

export type UpdateState = { error?: string };

export async function updatePasswordAfterResetAction(
  _prev: UpdateState,
  formData: FormData,
): Promise<UpdateState> {
  const parsed = schema.safeParse({
    password: formData.get('password'),
    passwordConfirm: formData.get('passwordConfirm'),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Ungueltige Eingaben.' };
  }

  const supabase = await createSupabaseServerClient();

  // Recovery-Session wurde vom /reset-password/confirm-Handler ueber
  // exchangeCodeForSession gesetzt. Ohne Session (direkter Aufruf,
  // abgelaufene Session): Supabase antwortet mit "Auth session missing".
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });

  if (error) {
    const msg = error.message.toLowerCase();
    if (msg.includes('should be different')) {
      return { error: 'Das neue Passwort muss sich vom alten unterscheiden.' };
    }
    if (msg.includes('weak') || msg.includes('pwned') || msg.includes('leaked')) {
      return {
        error:
          'Dieses Passwort wurde in bekannten Datenlecks gefunden. Bitte waehlen Sie ein anderes.',
      };
    }
    if (msg.includes('session') || msg.includes('jwt')) {
      return {
        error: 'Der Reset-Link ist abgelaufen. Bitte fordern Sie einen neuen an.',
      };
    }
    return {
      error: 'Passwort konnte nicht geaendert werden. Bitte fordern Sie einen neuen Reset-Link an.',
    };
  }

  // Recovery-Session verwerfen, damit sich der User bewusst mit dem
  // neuen Passwort neu anmeldet (und alle anderen aktiven Sessions,
  // z.B. andere Geraete, dadurch invalidiert werden — Supabase revoked
  // alle Refresh-Tokens beim Passwort-Update).
  await supabase.auth.signOut();

  redirect(
    '/login?info=' +
      encodeURIComponent('Passwort aktualisiert. Bitte melden Sie sich mit dem neuen Passwort an.'),
  );
}
