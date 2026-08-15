import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requireTenantContext } from '@/lib/tenant/current';
import { getEffectivePermissions } from '@/lib/permissions/effective';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/ui/page-header';
import { RoleForm } from '../../role-form';
import { updateRoleAction, type RoleFormState } from '../../../actions';
import { unwrapMaybeRow, unwrapRows } from '@/lib/supabase/unwrap';

export const metadata: Metadata = { title: 'Rolle bearbeiten' };

export default async function EditRolePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireTenantContext();
  const permissions = await getEffectivePermissions(ctx.userId, ctx.tenantId);
  if (!permissions.has('core.users_roles.manage')) notFound();

  const supabase = await createSupabaseServerClient();
  const [roleRes, rolePermsRes] = await Promise.all([
    supabase
      .from('roles')
      .select('id, key, name, description, is_system')
      .eq('id', id)
      .eq('tenant_id', ctx.tenantId)
      .maybeSingle(),
    supabase.from('role_permissions').select('permission_key').eq('role_id', id),
  ]);
  const role = unwrapMaybeRow(roleRes, 'Einstellungen: roles');
  const rolePerms = unwrapRows(rolePermsRes, 'Einstellungen: role_permissions');

  if (!role) notFound();
  if (role.is_system && role.key === 'superadmin') notFound();

  // Sprint 112: Diese Liste setzt die Haken im Rechte-Formular. Verschluckt kam
  // sie leer zurueck — das Formular haette dann eine Rolle ohne jedes Recht
  // angezeigt, obwohl in der Datenbank alle Rechte stehen. Wer daraufhin nur
  // den Namen aendert und speichert, schreibt den leeren Stand zurueck und
  // entzieht der Rolle saemtliche Rechte. Der Bildschirm haette dabei die
  // ganze Zeit ausgesehen, als sei das der Ist-Zustand gewesen.
  const initialPermissions = rolePerms.map((r) => r.permission_key);

  const action = async (prev: RoleFormState, form: FormData) => updateRoleAction(id, prev, form);

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <PageHeader
        title={`Rolle bearbeiten: ${role.name}`}
        description={
          role.is_system
            ? 'System-Rolle — Sie können die Rechte anpassen, Name und Kennung bleiben unverändert.'
            : 'Ändern Sie Name, Beschreibung und Rechte dieser Rolle.'
        }
      />
      <RoleForm
        action={action}
        cancelHref="/settings/users"
        submitLabel="Änderungen speichern"
        initial={{
          name: role.name,
          description: role.description,
          permissions: initialPermissions,
        }}
      />
    </div>
  );
}
