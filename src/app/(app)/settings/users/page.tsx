import type { Metadata } from 'next';
import { requireTenantContext } from '@/lib/tenant/current';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getEffectivePermissions } from '@/lib/permissions/effective';
import { PageHeader } from '@/components/ui/page-header';
import { LinkButton } from '@/components/ui/button';
import { formatDate } from '@/lib/utils/format';
import {
  assignRoleAction,
  deleteRoleAction,
  removeRoleAssignmentAction,
} from './actions';

export const metadata: Metadata = { title: 'Benutzer & Rollen' };

type MembershipRow = {
  id: string;
  user_id: string;
  status: string;
  is_owner: boolean;
  created_at: string;
  users: { display_name: string | null } | null;
};

export default async function UsersRolesPage() {
  const ctx = await requireTenantContext();
  const supabase = await createSupabaseServerClient();

  const [rolesRes, membersRes, permCount, rolePermsRes, userRolesRes] = await Promise.all([
    supabase
      .from('roles')
      .select('id, key, name, description, is_system, created_at')
      .eq('tenant_id', ctx.tenantId)
      .order('is_system', { ascending: false })
      .order('name'),
    supabase
      .from('memberships')
      .select('id, user_id, status, is_owner, created_at, users(display_name)')
      .eq('tenant_id', ctx.tenantId)
      .order('created_at')
      .returns<MembershipRow[]>(),
    supabase.from('permissions').select('key', { count: 'exact', head: true }),
    supabase.from('role_permissions').select('role_id, permission_key'),
    supabase
      .from('user_roles')
      .select('id, user_id, role_id, scope_type')
      .eq('tenant_id', ctx.tenantId)
      .is('scope_type', null),
  ]);

  const permissions = await getEffectivePermissions(ctx.userId, ctx.tenantId);
  const canManage = permissions.has('core.users_roles.manage');
  const canAssign = permissions.has('core.users_roles.edit');

  const roles = rolesRes.data ?? [];
  const members = membersRes.data ?? [];
  const totalPermissions = permCount.count ?? 0;

  const permCountByRole = new Map<string, number>();
  for (const rp of rolePermsRes.data ?? []) {
    permCountByRole.set(rp.role_id, (permCountByRole.get(rp.role_id) ?? 0) + 1);
  }

  const assignedRolesByUser = new Map<string, Array<{ userRoleId: string; roleId: string }>>();
  const assignmentCountByRole = new Map<string, number>();
  for (const ur of userRolesRes.data ?? []) {
    const list = assignedRolesByUser.get(ur.user_id) ?? [];
    list.push({ userRoleId: ur.id, roleId: ur.role_id });
    assignedRolesByUser.set(ur.user_id, list);
    assignmentCountByRole.set(ur.role_id, (assignmentCountByRole.get(ur.role_id) ?? 0) + 1);
  }

  const roleById = new Map(roles.map((r) => [r.id, r]));

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <PageHeader
        title="Benutzer & Rollen"
        description={`Rollen bündeln beliebige Rechte aus einer Registry von ${totalPermissions} Berechtigungen und sind frei konfigurierbar.`}
        action={
          canManage ? (
            <LinkButton href="/settings/users/roles/new">Neue Rolle</LinkButton>
          ) : undefined
        }
      />

      <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--color-muted-foreground)]">
            Rollen
          </h2>
          <span className="text-xs text-[var(--color-muted-foreground)]">
            {roles.length} {roles.length === 1 ? 'Rolle' : 'Rollen'}
          </span>
        </div>
        {roles.length === 0 ? (
          <p className="text-sm text-[var(--color-muted-foreground)]">
            Noch keine Rollen definiert. System-Rollen werden beim Onboarding aus der Vorlage
            angelegt.
          </p>
        ) : (
          <ul className="divide-y divide-[var(--color-border)]">
            {roles.map((r) => {
              const permCountForRole = permCountByRole.get(r.id) ?? 0;
              const assignCountForRole = assignmentCountByRole.get(r.id) ?? 0;
              const isSuperadmin = r.is_system && r.key === 'superadmin';
              return (
                <li key={r.id} className="flex items-start justify-between gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium">{r.name}</span>
                      <code className="rounded bg-[var(--color-muted)] px-1.5 py-0.5 text-xs">
                        {r.key}
                      </code>
                      {r.is_system && (
                        <span className="rounded-full border border-[var(--color-border)] px-2 py-0.5 text-xs text-[var(--color-muted-foreground)]">
                          System
                        </span>
                      )}
                    </div>
                    {r.description && (
                      <p className="mt-0.5 text-xs text-[var(--color-muted-foreground)]">
                        {r.description}
                      </p>
                    )}
                    <p className="mt-1 text-xs text-[var(--color-muted-foreground)]">
                      {permCountForRole} {permCountForRole === 1 ? 'Recht' : 'Rechte'} ·{' '}
                      {assignCountForRole}{' '}
                      {assignCountForRole === 1 ? 'Zuweisung' : 'Zuweisungen'}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {canManage && !isSuperadmin && (
                      <LinkButton
                        variant="outline"
                        size="sm"
                        href={`/settings/users/roles/${r.id}/edit`}
                      >
                        Bearbeiten
                      </LinkButton>
                    )}
                    {canManage && !r.is_system && (
                      <form action={deleteRoleAction}>
                        <input type="hidden" name="role_id" value={r.id} />
                        <button
                          type="submit"
                          className="inline-flex h-8 items-center rounded-md border border-[var(--color-destructive)]/40 px-3 text-xs font-medium text-[var(--color-destructive)] hover:bg-[var(--color-destructive)]/10"
                        >
                          Löschen
                        </button>
                      </form>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--color-muted-foreground)]">
            Mitglieder
          </h2>
          <span className="text-xs text-[var(--color-muted-foreground)]">
            {members.length} {members.length === 1 ? 'Mitglied' : 'Mitglieder'}
          </span>
        </div>
        {members.length === 0 ? (
          <p className="text-sm text-[var(--color-muted-foreground)]">
            Noch keine Mitglieder. Über <em>Mitarbeiter → Einladen</em> lassen sich Benutzer
            hinzufügen.
          </p>
        ) : (
          <ul className="divide-y divide-[var(--color-border)]">
            {members.map((m) => {
              const name = m.users?.display_name;
              const assigned = assignedRolesByUser.get(m.user_id) ?? [];
              const assignedRoleIds = new Set(assigned.map((a) => a.roleId));
              const availableRoles = roles.filter((r) => !assignedRoleIds.has(r.id));

              return (
                <li key={m.id} className="flex flex-col gap-2 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <div className="text-sm font-medium">{name ?? m.user_id}</div>
                      <div className="text-xs text-[var(--color-muted-foreground)]">
                        Beigetreten am {formatDate(m.created_at)}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {m.is_owner && (
                        <span className="rounded-full bg-[var(--color-accent)] px-2 py-0.5 text-xs font-medium text-[var(--color-primary)]">
                          Owner
                        </span>
                      )}
                      <StatusPill status={m.status} />
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {assigned.length === 0 && (
                      <span className="text-xs text-[var(--color-muted-foreground)]">
                        Keine Rollen zugewiesen
                      </span>
                    )}
                    {assigned.map(({ userRoleId, roleId }) => {
                      const role = roleById.get(roleId);
                      if (!role) return null;
                      return (
                        <span
                          key={userRoleId}
                          className="inline-flex items-center gap-1.5 rounded-full bg-[var(--color-muted)] px-2.5 py-1 text-xs"
                        >
                          <span className="font-medium">{role.name}</span>
                          {canAssign && !m.is_owner && (
                            <form action={removeRoleAssignmentAction}>
                              <input type="hidden" name="user_role_id" value={userRoleId} />
                              <button
                                type="submit"
                                aria-label={`${role.name} entfernen`}
                                className="rounded-full text-[var(--color-muted-foreground)] hover:text-[var(--color-destructive)]"
                              >
                                ×
                              </button>
                            </form>
                          )}
                        </span>
                      );
                    })}
                  </div>

                  {canAssign && availableRoles.length > 0 && (
                    <form action={assignRoleAction} className="flex items-center gap-2">
                      <input type="hidden" name="user_id" value={m.user_id} />
                      <select
                        name="role_id"
                        className="h-8 rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-2 text-xs"
                        defaultValue=""
                      >
                        <option value="" disabled>
                          Rolle hinzufügen …
                        </option>
                        {availableRoles.map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.name}
                          </option>
                        ))}
                      </select>
                      <button
                        type="submit"
                        className="inline-flex h-8 items-center rounded-md bg-[var(--color-muted)] px-3 text-xs font-medium hover:opacity-80"
                      >
                        Hinzufügen
                      </button>
                    </form>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, { label: string; className: string }> = {
    active: {
      label: 'Aktiv',
      className: 'bg-[var(--color-success)]/10 text-[var(--color-success)]',
    },
    invited: {
      label: 'Eingeladen',
      className: 'bg-[var(--color-warning)]/10 text-[var(--color-warning)]',
    },
    suspended: {
      label: 'Gesperrt',
      className: 'bg-[var(--color-destructive)]/10 text-[var(--color-destructive)]',
    },
  };
  const cfg =
    map[status] ??
    { label: status, className: 'bg-[var(--color-muted)] text-[var(--color-muted-foreground)]' };
  return (
    <span
      className={`whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium ${cfg.className}`}
    >
      {cfg.label}
    </span>
  );
}
