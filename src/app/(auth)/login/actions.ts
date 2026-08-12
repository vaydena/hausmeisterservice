'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { ensureTenantForUser } from '@/lib/auth/ensure-tenant';

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
    return { error: 'Anmeldung fehlgeschlagen. Bitte prüfen Sie E-Mail und Passwort.' };
  }

  // Post-Login-Router:
  //   Staff-Membership vorhanden → next (default /dashboard)
  //   sonst Resident → /portal/dashboard
  //   sonst kein Zugriff → /no-access (bricht den Redirect-Loop
  //   zwischen /dashboard und /login, wenn der User zwar authentifiziert
  //   ist, aber weder Mitarbeiter- noch Portal-Rechte hat)
  let { data: membership } = await supabase
    .from('memberships')
    .select('id')
    .eq('user_id', signInData.user.id)
    .eq('status', 'active')
    .limit(1)
    .maybeSingle();

  // Fallback für Self-Signup, dessen /auth/callback nicht durchgelaufen ist
  // (z. B. weil die Confirm-URL nicht an /auth/callback zurückführt oder
  // das RPC beim ersten Aufruf einen transienten Fehler hatte). Der Helper
  // ist idempotent: hat die Membership zwischenzeitlich existiert, macht
  // er nichts.
  if (!membership) {
    const provisioned = await ensureTenantForUser(signInData.user);
    if (provisioned === 'provisioned' || provisioned === 'existing') {
      const { data: fresh } = await supabase
        .from('memberships')
        .select('id')
        .eq('user_id', signInData.user.id)
        .eq('status', 'active')
        .limit(1)
        .maybeSingle();
      membership = fresh;
    }
  }

  if (membership) {
    redirect(parsed.data.next);
  }

  const { data: resident } = await supabase
    .from('residents')
    .select('id')
    .eq('user_id', signInData.user.id)
    .is('deleted_at', null)
    .limit(1)
    .maybeSingle();
  if (resident) redirect('/portal/dashboard');

  redirect('/no-access');
}
