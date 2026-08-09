import type { Metadata } from 'next';
import Link from 'next/link';
import { requireTenantContext } from '@/lib/tenant/current';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getEffectivePermissions } from '@/lib/permissions/effective';
import { PageHeader } from '@/components/ui/page-header';
import { LinkButton } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Badge } from '@/components/ui/badge';

export const metadata: Metadata = { title: 'Mitarbeiter' };

const STATUS_LABEL: Record<string, string> = {
  active: 'Aktiv',
  on_leave: 'Abwesend',
  terminated: 'Beendet',
};
const STATUS_TONE: Record<string, 'success' | 'warning' | 'muted'> = {
  active: 'success',
  on_leave: 'warning',
  terminated: 'muted',
};

type Row = {
  id: string;
  employment_status: string;
  hire_date: string | null;
  user_id: string;
  display_name: string | null;
};

export default async function EmployeesPage() {
  const ctx = await requireTenantContext();
  const supabase = await createSupabaseServerClient();
  const permissions = await getEffectivePermissions(ctx.userId, ctx.tenantId);

  const { data: employees } = await supabase
    .from('employees')
    .select('id, employment_status, hire_date, user_id')
    .eq('tenant_id', ctx.tenantId)
    .order('employment_status');

  // Anzeigenamen aus public.users in einem zweiten Query (RLS-safe)
  const userIds = (employees ?? []).map((e) => e.user_id);
  const { data: users } =
    userIds.length > 0
      ? await supabase.from('users').select('id, display_name').in('id', userIds)
      : { data: [] };
  const nameById = new Map((users ?? []).map((u) => [u.id, u.display_name]));

  const rows: Row[] = (employees ?? []).map((e) => ({
    id: e.id,
    employment_status: e.employment_status,
    hire_date: e.hire_date,
    user_id: e.user_id,
    display_name: nameById.get(e.user_id) ?? null,
  }));

  const canInvite =
    permissions.has('employees.create') && permissions.has('core.users_roles.create');

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <PageHeader
        title="Mitarbeiter"
        description="Alle im Mandanten geführten Mitarbeiter."
        action={
          canInvite ? (
            <LinkButton href="/people/employees/invite">Mitarbeiter einladen</LinkButton>
          ) : undefined
        }
      />

      {rows.length === 0 ? (
        <EmptyState
          title="Noch keine Mitarbeiter"
          description="Laden Sie das erste Team-Mitglied per E-Mail ein. Der Zugang wird per Bestätigungs-Link zugestellt."
          action={
            canInvite ? (
              <LinkButton href="/people/employees/invite">Ersten Mitarbeiter einladen</LinkButton>
            ) : undefined
          }
        />
      ) : (
        <Card>
          <ul className="divide-y divide-[var(--color-border)]">
            {rows.map((row) => (
              <li key={row.id}>
                <Link
                  href={`/people/employees/${row.id}`}
                  className="flex items-center justify-between gap-4 p-4 transition hover:bg-[var(--color-muted)]"
                >
                  <div className="flex flex-col gap-1">
                    <span className="font-medium">
                      {row.display_name ?? '(Ohne Anzeigename)'}
                    </span>
                    <span className="text-xs text-[var(--color-muted-foreground)]">
                      {row.hire_date ? `Eingestellt: ${row.hire_date}` : 'Ohne Einstellungsdatum'}
                    </span>
                  </div>
                  <Badge tone={STATUS_TONE[row.employment_status] ?? 'muted'}>
                    {STATUS_LABEL[row.employment_status] ?? row.employment_status}
                  </Badge>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
