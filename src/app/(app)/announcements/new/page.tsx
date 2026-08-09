import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requireTenantContext } from '@/lib/tenant/current';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getEffectivePermissions } from '@/lib/permissions/effective';
import { PageHeader } from '@/components/ui/page-header';
import { AnnouncementForm } from '../announcement-form';
import { createAnnouncementAction } from '../actions';

export const metadata: Metadata = { title: 'Neue Ankündigung' };

export default async function NewAnnouncementPage() {
  const ctx = await requireTenantContext();
  const permissions = await getEffectivePermissions(ctx.userId, ctx.tenantId);
  if (!permissions.has('announcements.create')) notFound();

  const supabase = await createSupabaseServerClient();

  const [{ data: roles }, { data: members }] = await Promise.all([
    supabase
      .from('roles')
      .select('key, name')
      .eq('tenant_id', ctx.tenantId)
      .order('name'),
    supabase
      .from('memberships')
      .select('user_id')
      .eq('tenant_id', ctx.tenantId)
      .eq('status', 'active'),
  ]);

  const memberIds = (members ?? []).map((m) => m.user_id);
  const { data: users } =
    memberIds.length > 0
      ? await supabase
          .from('users')
          .select('id, display_name')
          .in('id', memberIds)
          .order('display_name')
      : { data: [] };

  const canPublish = permissions.has('announcements.publish');

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <PageHeader
        title="Neue Ankündigung"
        description="Empfänger, Titel und Text festlegen. Optional als Entwurf speichern oder direkt veröffentlichen."
      />
      <AnnouncementForm
        action={createAnnouncementAction}
        cancelHref="/announcements"
        submitLabel="Speichern"
        roles={roles ?? []}
        users={users ?? []}
        showPublishToggle={canPublish}
      />
    </div>
  );
}
