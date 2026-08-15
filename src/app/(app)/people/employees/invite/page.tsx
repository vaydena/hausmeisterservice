import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requireTenantContext } from '@/lib/tenant/current';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getEffectivePermissions } from '@/lib/permissions/effective';
import { PageHeader } from '@/components/ui/page-header';
import { InviteForm } from './invite-form';
import { unwrapRows } from '@/lib/supabase/unwrap';

export const metadata: Metadata = { title: 'Mitarbeiter einladen' };

export default async function InviteEmployeePage() {
  const ctx = await requireTenantContext();
  const permissions = await getEffectivePermissions(ctx.userId, ctx.tenantId);
  if (!permissions.has('employees.create') || !permissions.has('core.users_roles.create')) {
    notFound();
  }

  const supabase = await createSupabaseServerClient();
  // Verschluckt war die Rollenliste leer — und ein Mitarbeiter, der ohne
  // Rolle eingeladen wird, meldet sich an und sieht nichts.
  const roles = unwrapRows(
    await supabase
      .from('roles')
      .select('key, name, description')
      .eq('tenant_id', ctx.tenantId)
      .order('name'),
    'Mitarbeiter einladen: Rollen',
  );

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <PageHeader
        title="Mitarbeiter einladen"
        description="Der Mitarbeiter erhält eine E-Mail mit einem Bestätigungslink zum Setzen des Passworts."
      />
      <InviteForm roles={roles} />
    </div>
  );
}
