import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requireTenantContext } from '@/lib/tenant/current';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getEffectivePermissions } from '@/lib/permissions/effective';
import { PageHeader } from '@/components/ui/page-header';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { formatDateTime } from '@/lib/utils/format';

export const metadata: Metadata = { title: 'Audit-Log' };

const TABLE_LABEL: Record<string, string> = {
  tenants: 'Mandant',
  memberships: 'Mitgliedschaft',
  roles: 'Rolle',
  role_permissions: 'Rollen-Recht',
  user_roles: 'Rollen-Zuweisung',
  tenant_modules: 'Modul-Konfiguration',
};

const ACTION_LABEL: Record<string, string> = {
  INSERT: 'Angelegt',
  UPDATE: 'Geändert',
  DELETE: 'Gelöscht',
};

const ACTION_TONE: Record<string, 'primary' | 'warning' | 'danger'> = {
  INSERT: 'primary',
  UPDATE: 'warning',
  DELETE: 'danger',
};

export default async function AuditLogPage() {
  const ctx = await requireTenantContext();
  const permissions = await getEffectivePermissions(ctx.userId, ctx.tenantId);
  if (!permissions.has('core.audit_log.view')) notFound();

  const supabase = await createSupabaseServerClient();
  const { data: entries } = await supabase
    .from('audit_log')
    .select('id, occurred_at, actor_id, table_name, row_id, action, changed_columns')
    .eq('tenant_id', ctx.tenantId)
    .order('occurred_at', { ascending: false })
    .limit(100);

  const actorIds = [
    ...new Set((entries ?? []).map((e) => e.actor_id).filter((v): v is string => Boolean(v))),
  ];
  const { data: actors } =
    actorIds.length > 0
      ? await supabase.from('users').select('id, display_name').in('id', actorIds)
      : { data: [] };
  const nameById = new Map((actors ?? []).map((u) => [u.id, u.display_name]));

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <PageHeader
        title="Audit-Log"
        description="Änderungen an Berechtigungen, Mitgliedschaften und Modulen. Die letzten 100 Einträge."
      />

      {!entries || entries.length === 0 ? (
        <EmptyState
          title="Noch keine Einträge"
          description="Sobald Rollen, Rechte, Mitgliedschaften oder Module geändert werden, erscheinen die Vorgänge hier."
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-[var(--color-border)] bg-[var(--color-background)]">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="border-b border-[var(--color-border)] bg-[var(--color-muted)]/50 text-left text-xs uppercase tracking-wider text-[var(--color-muted-foreground)]">
              <tr>
                <th className="px-4 py-2 font-medium">Zeit</th>
                <th className="px-4 py-2 font-medium">Bereich</th>
                <th className="px-4 py-2 font-medium">Aktion</th>
                <th className="px-4 py-2 font-medium">Akteur</th>
                <th className="px-4 py-2 font-medium">Geänderte Felder</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {entries.map((e) => (
                <tr key={e.id}>
                  <td className="whitespace-nowrap px-4 py-2 text-[var(--color-muted-foreground)]">
                    {formatDateTime(e.occurred_at)}
                  </td>
                  <td className="px-4 py-2">
                    {TABLE_LABEL[e.table_name] ?? e.table_name}
                  </td>
                  <td className="px-4 py-2">
                    <Badge tone={ACTION_TONE[e.action] ?? 'neutral'}>
                      {ACTION_LABEL[e.action] ?? e.action}
                    </Badge>
                  </td>
                  <td className="px-4 py-2">
                    {e.actor_id ? nameById.get(e.actor_id) ?? '(Unbekannt)' : 'System'}
                  </td>
                  <td className="px-4 py-2 text-xs text-[var(--color-muted-foreground)]">
                    {e.changed_columns && e.changed_columns.length > 0
                      ? e.changed_columns.join(', ')
                      : e.action === 'UPDATE'
                        ? '–'
                        : ''}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
