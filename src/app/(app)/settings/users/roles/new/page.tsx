import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requireTenantContext } from '@/lib/tenant/current';
import { getEffectivePermissions } from '@/lib/permissions/effective';
import { PageHeader } from '@/components/ui/page-header';
import { RoleForm } from '../role-form';
import { createRoleAction } from '../../actions';

export const metadata: Metadata = { title: 'Neue Rolle' };

export default async function NewRolePage() {
  const ctx = await requireTenantContext();
  const permissions = await getEffectivePermissions(ctx.userId, ctx.tenantId);
  if (!permissions.has('core.users_roles.manage')) notFound();

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <PageHeader
        title="Neue Rolle"
        description="Bündeln Sie beliebige Rechte zu einer Rolle, die sich Benutzern zuweisen lässt."
      />
      <RoleForm
        action={createRoleAction}
        cancelHref="/settings/users"
        submitLabel="Rolle anlegen"
      />
    </div>
  );
}
