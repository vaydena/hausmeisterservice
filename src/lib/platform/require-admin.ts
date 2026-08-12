import 'server-only';
import { cache } from 'react';
import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseServiceClient } from '@/lib/supabase/service';
import { createPlatformServiceClient } from '@/lib/supabase/platform';

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
  const { data: admin } = await createPlatformServiceClient()
    .from('admins')
    .select('user_id')
    .eq('user_id', user.id)
    .maybeSingle();

  if (!admin) return null;

  const { data: profile } = await service
    .from('users')
    .select('display_name')
    .eq('id', user.id)
    .maybeSingle();

  return {
    userId: user.id,
    email: user.email ?? null,
    displayName: profile?.display_name ?? null,
  };
});

export async function requirePlatformAdmin(): Promise<PlatformAdminContext> {
  const ctx = await getPlatformAdminContext();
  if (!ctx) redirect('/no-access');
  return ctx;
}
