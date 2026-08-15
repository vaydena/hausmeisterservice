import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requireTenantContext } from '@/lib/tenant/current';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getEffectivePermissions } from '@/lib/permissions/effective';
import { PageHeader } from '@/components/ui/page-header';
import { NewThreadForm } from '../new-thread-form';
import { createThreadAction } from '../actions';
import { unwrapRows } from '@/lib/supabase/unwrap';

export const metadata: Metadata = { title: 'Neue Nachricht' };

export default async function NewMessagePage() {
  const ctx = await requireTenantContext();
  const permissions = await getEffectivePermissions(ctx.userId, ctx.tenantId);
  if (!permissions.has('messaging.create')) notFound();

  const supabase = await createSupabaseServerClient();
  // Nur User im aktuellen Tenant, die aktive Membership haben
  const membersRes = await supabase
    .from('memberships')
    .select('user_id')
    .eq('tenant_id', ctx.tenantId)
    .eq('status', 'active');
  const members = unwrapRows(membersRes, 'Nachrichten: memberships');

  const memberIds = members.map((m) => m.user_id);
  const usersRes =
    memberIds.length > 0
      ? await supabase
          .from('users')
          .select('id, display_name')
          .in('id', memberIds)
          .order('display_name')
      : { data: [], error: null };
  const users = unwrapRows(usersRes, 'Nachrichten: users');

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <PageHeader
        title="Neue Nachricht"
        description="Empfänger, Betreff und erste Nachricht festlegen."
      />
      <NewThreadForm
        action={createThreadAction}
        cancelHref="/messages"
        users={users}
        currentUserId={ctx.userId}
      />
    </div>
  );
}
