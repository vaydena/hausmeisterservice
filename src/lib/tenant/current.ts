import 'server-only';
import { cache } from 'react';
import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export interface TenantContext {
  userId: string;
  tenantId: string;
  membershipId: string;
  isOwner: boolean;
  displayName: string | null;
  email: string | null;
}

/**
 * Liest den aktuellen User + seine primäre Tenant-Membership.
 * `cache()` sorgt dafür, dass wir das pro Request nur einmal aus der DB holen.
 *
 * Multi-Tenant-Switch (User gehört zu mehreren Tenants) kommt später über
 * einen JWT-Custom-Claim `app_tenant_id`. Bis dahin nehmen wir die erste
 * aktive Membership (gleich wie `app_auth.current_tenant_id()` als Fallback).
 */
export const getTenantContext = cache(async (): Promise<TenantContext | null> => {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: membership } = await supabase
    .from('memberships')
    .select('id, tenant_id, is_owner')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!membership) return null;

  const { data: profile } = await supabase
    .from('users')
    .select('display_name')
    .eq('id', user.id)
    .maybeSingle();

  return {
    userId: user.id,
    tenantId: membership.tenant_id,
    membershipId: membership.id,
    isOwner: membership.is_owner,
    displayName: profile?.display_name ?? null,
    email: user.email ?? null,
  };
});

export async function requireTenantContext(): Promise<TenantContext> {
  const ctx = await getTenantContext();
  if (!ctx) {
    // Kein throw — sonst 500 statt sauberer Redirect. Ein Bewohner ohne
    // Staff-Membership landet über das App-Layout ohnehin im Portal;
    // wer gar nicht eingeloggt ist, wird hier zur Login-Seite geschickt.
    redirect('/login');
  }
  return ctx;
}
