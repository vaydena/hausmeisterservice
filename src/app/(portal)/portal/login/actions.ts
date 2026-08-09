'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';

const schema = z.object({
  email: z.string().email('Bitte geben Sie eine gültige E-Mail-Adresse ein.'),
  password: z.string().min(1, 'Bitte geben Sie Ihr Passwort ein.'),
});

export type PortalLoginState = { error?: string };

export async function portalSignInAction(
  _prev: PortalLoginState,
  formData: FormData,
): Promise<PortalLoginState> {
  const parsed = schema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Ungültige Eingaben.' };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });

  if (error || !data.user) {
    return { error: 'Anmeldung fehlgeschlagen. Bitte prüfen Sie E-Mail und Passwort.' };
  }

  // Prüfen, dass wirklich ein aktiver Resident-Record existiert
  const { data: resident } = await supabase
    .from('residents')
    .select('id, tenant_id, portal_activated_at')
    .eq('user_id', data.user.id)
    .is('deleted_at', null)
    .limit(1)
    .maybeSingle();

  if (!resident) {
    await supabase.auth.signOut();
    return {
      error:
        'Für dieses Konto ist kein Bewohner-Portal-Zugang hinterlegt. Bitte kontaktieren Sie Ihre Verwaltung.',
    };
  }

  // Beim ersten Login: portal_activated_at setzen (best-effort, verletzt nicht Login-Flow)
  if (!resident.portal_activated_at) {
    await supabase
      .from('residents')
      .update({ portal_activated_at: new Date().toISOString() })
      .eq('id', resident.id);
  }

  redirect('/portal/dashboard');
}
