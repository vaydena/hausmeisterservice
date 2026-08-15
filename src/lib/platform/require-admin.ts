import 'server-only';
import { cache } from 'react';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseServiceClient } from '@/lib/supabase/service';
import { createPlatformServiceClient } from '@/lib/supabase/platform';
import { unwrapMaybeRow } from '@/lib/supabase/unwrap';

export interface PlatformAdminContext {
  userId: string;
  email: string | null;
  displayName: string | null;
}

export const getPlatformAdminContext = cache(async (): Promise<PlatformAdminContext | null> => {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const service = createSupabaseServiceClient();
  // Sprint 104: `null` bedeutet hier "kein Plattform-Admin" und fuehrt in
  // requirePlatformAdmin() direkt zu /no-access. Bei verschlucktem Fehler
  // war der Betreiber also aus seiner eigenen Verwaltungsoberflaeche
  // ausgesperrt — und zwar mit einer Begruendung, die auf ein
  // Rechteproblem zeigt statt auf die Stoerung, die es wirklich war.
  const admin = unwrapMaybeRow(
    await createPlatformServiceClient()
      .from('admins')
      .select('user_id')
      .eq('user_id', user.id)
      .maybeSingle(),
    'Plattform-Admin: Berechtigung',
  );

  if (!admin) return null;

  const profile = unwrapMaybeRow(
    await service.from('users').select('display_name').eq('id', user.id).maybeSingle(),
    'Plattform-Admin: Anzeigename',
  );

  return {
    userId: user.id,
    email: user.email ?? null,
    displayName: profile?.display_name ?? null,
  };
});

export async function requirePlatformAdmin(): Promise<PlatformAdminContext> {
  const ctx = await getPlatformAdminContext();
  if (!ctx) redirect('/no-access');

  // MFA-Gate (Sprint 25): Platform-Admins sind das sensibelste Konto —
  // sie sehen andere Tenants und koennen deren Abos aendern. Wenn sie
  // MFA aktiviert haben, verlangen wir hier zusaetzlich zum aal1-Login
  // eine aal2-Session. Ohne MFA-Faktor (nextLevel != 'aal2') greift der
  // Check nicht — der Admin kann trotzdem rein, aber die Konto-Seite
  // empfiehlt sichtbar die Aktivierung.
  const supabase = await createSupabaseServerClient();
  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aal?.currentLevel === 'aal1' && aal.nextLevel === 'aal2') {
    const hdrs = await headers();
    const currentPath = hdrs.get('x-pathname') ?? '/platform';
    redirect(`/login/mfa?next=${encodeURIComponent(currentPath)}`);
  }

  return ctx;
}
