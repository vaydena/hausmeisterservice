import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requireTenantContext } from '@/lib/tenant/current';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getEffectivePermissions } from '@/lib/permissions/effective';
import { PageHeader } from '@/components/ui/page-header';
import { AnnouncementForm } from '../../announcement-form';
import { updateAnnouncementAction } from '../../actions';
import type { AnnouncementTargetType } from '@/lib/schemas/announcements';
import { unwrapMaybeRow, unwrapRows } from '@/lib/supabase/unwrap';

export const metadata: Metadata = { title: 'Ankündigung bearbeiten' };

export default async function EditAnnouncementPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await requireTenantContext();
  const permissions = await getEffectivePermissions(ctx.userId, ctx.tenantId);
  if (!permissions.has('announcements.create')) notFound();

  const supabase = await createSupabaseServerClient();
  const annRes = await supabase
    .from('announcements')
    .select(
      'id, title, body, status, target_type, target_role_key, target_user_ids, requires_acknowledgement, expires_at, created_by',
    )
    .eq('id', id)
    .maybeSingle();
  const ann = unwrapMaybeRow(annRes, 'Ankuendigungen: announcements');
  if (!ann) notFound();
  if (ann.status !== 'draft' || ann.created_by !== ctx.userId) notFound();

  const [rolesRes, membersRes] = await Promise.all([
    supabase.from('roles').select('key, name').eq('tenant_id', ctx.tenantId).order('name'),
    supabase
      .from('memberships')
      .select('user_id')
      .eq('tenant_id', ctx.tenantId)
      .eq('status', 'active'),
  ]);
  const roles = unwrapRows(rolesRes, 'Ankuendigungen: roles');
  const members = unwrapRows(membersRes, 'Ankuendigungen: memberships');

  const memberIds = members.map((m) => m.user_id);
  const usersRes =
    memberIds.length > 0
      ? await supabase
          .from('users')
          .select('id, display_name')
          .in('id', memberIds)
          .order('display_name')
      : { data: [], error: null };
  const users = unwrapRows(usersRes, 'Ankuendigungen: users');

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <PageHeader
        title="Ankündigung bearbeiten"
        description="Nur Entwürfe können bearbeitet werden."
      />
      <AnnouncementForm
        action={updateAnnouncementAction}
        cancelHref={`/announcements/${ann.id}`}
        submitLabel="Speichern"
        roles={roles}
        users={users}
        initial={{
          id: ann.id,
          title: ann.title,
          body: ann.body,
          target_type: ann.target_type as AnnouncementTargetType,
          target_role_key: ann.target_role_key,
          target_user_ids: ann.target_user_ids,
          requires_acknowledgement: ann.requires_acknowledgement,
          expires_at: ann.expires_at,
        }}
      />
    </div>
  );
}
