'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';

const loginSchema = z.object({
  email: z.string().email('Bitte geben Sie eine gültige E-Mail-Adresse ein.'),
  password: z.string().min(1, 'Bitte geben Sie Ihr Passwort ein.'),
  next: z.string().startsWith('/').default('/dashboard'),
});

export type LoginState = { error?: string };

export async function signInAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = loginSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
    next: formData.get('next') ?? '/dashboard',
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Ungültige Eingaben.' };
  }

  const supabase = await createSupabaseServerClient();
  const { data: signInData, error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });

  if (error || !signInData.user) {
    // Freundliche, generische Meldung (keine Auskunft ob E-Mail existiert).
    return { error: 'Anmeldung fehlgeschlagen. Bitte prüfen Sie E-Mail und Passwort.' };
  }

  // Post-Login-Router: Staff → next (default /dashboard), reiner Resident → /portal/dashboard
  const { data: membership } = await supabase
    .from('memberships')
    .select('id')
    .eq('user_id', signInData.user.id)
    .eq('status', 'active')
    .limit(1)
    .maybeSingle();

  if (!membership) {
    const { data: resident } = await supabase
      .from('residents')
      .select('id')
      .eq('user_id', signInData.user.id)
      .is('deleted_at', null)
      .limit(1)
      .maybeSingle();
    if (resident) redirect('/portal/dashboard');
  }

  redirect(parsed.data.next);
}
