import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requireTenantContext } from '@/lib/tenant/current';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getEffectivePermissions } from '@/lib/permissions/effective';
import { PageHeader } from '@/components/ui/page-header';
import { LinkButton } from '@/components/ui/button';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatDate } from '@/lib/utils/format';
import { unwrapMaybeRow, unwrapRows } from '@/lib/supabase/unwrap';

export const metadata: Metadata = { title: 'Mitarbeiter' };

const STATUS_LABEL: Record<string, string> = {
  active: 'Aktiv',
  on_leave: 'Abwesend',
  terminated: 'Beendet',
};

export default async function EmployeeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireTenantContext();
  const supabase = await createSupabaseServerClient();
  const permissions = await getEffectivePermissions(ctx.userId, ctx.tenantId);

  const employee = unwrapMaybeRow(
    await supabase
      .from('employees')
      .select(
        'id, user_id, employment_status, hire_date, termination_date, hourly_rate, phone, skills, notes',
      )
      .eq('id', id)
      .maybeSingle(),
    'Mitarbeiter: Datensatz',
  );

  if (!employee) notFound();

  const [profileRes, roleAssignmentsRes] = await Promise.all([
    supabase.from('users').select('display_name').eq('id', employee.user_id).maybeSingle(),
    supabase
      .from('user_roles')
      .select('role_id, scope_type, scope_id')
      .eq('user_id', employee.user_id)
      .eq('tenant_id', ctx.tenantId),
  ]);
  const profile = unwrapMaybeRow(profileRes, 'Personen: users');
  const roleAssignments = unwrapRows(roleAssignmentsRes, 'Personen: user_roles');

  const roleIds = [...new Set(roleAssignments.map((a) => a.role_id))];
  const rolesRes =
    roleIds.length > 0
      ? await supabase.from('roles').select('id, name, key').in('id', roleIds)
      : { data: [], error: null };
  const roles = unwrapRows(rolesRes, 'Personen: roles');

  const canEdit = permissions.has('employees.edit');
  const isSelf = ctx.userId === employee.user_id;

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <PageHeader
        title={profile?.display_name ?? '(Ohne Anzeigename)'}
        description={
          isSelf
            ? 'Ihr Mitarbeiter-Profil'
            : `Status: ${STATUS_LABEL[employee.employment_status] ?? employee.employment_status}`
        }
        action={
          canEdit ? (
            <LinkButton variant="outline" href={`/people/employees/${employee.id}/edit`}>
              Bearbeiten
            </LinkButton>
          ) : undefined
        }
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Anstellung</CardTitle>
          </CardHeader>
          <CardBody>
            <dl className="grid grid-cols-1 gap-2 text-sm">
              <Row label="Status">
                <Badge
                  tone={
                    employee.employment_status === 'active'
                      ? 'success'
                      : employee.employment_status === 'on_leave'
                        ? 'warning'
                        : 'muted'
                  }
                >
                  {STATUS_LABEL[employee.employment_status] ?? employee.employment_status}
                </Badge>
              </Row>
              <Row label="Eingestellt">
                {employee.hire_date ? formatDate(employee.hire_date) : '–'}
              </Row>
              {employee.termination_date && (
                <Row label="Ende">{formatDate(employee.termination_date)}</Row>
              )}
              {employee.hourly_rate !== null && (
                <Row label="Stundensatz">
                  {new Intl.NumberFormat('de-DE', {
                    style: 'currency',
                    currency: 'EUR',
                  }).format(employee.hourly_rate)}
                </Row>
              )}
              {employee.phone && <Row label="Telefon">{employee.phone}</Row>}
            </dl>
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Rollen</CardTitle>
          </CardHeader>
          <CardBody>
            {roles && roles.length > 0 ? (
              <ul className="flex flex-wrap gap-2">
                {roles.map((r) => (
                  <li key={r.id}>
                    <Badge tone="primary">{r.name}</Badge>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-[var(--color-muted-foreground)]">
                Keine Rollen zugewiesen.
              </p>
            )}
          </CardBody>
        </Card>

        {employee.skills.length > 0 && (
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Skills</CardTitle>
            </CardHeader>
            <CardBody>
              <ul className="flex flex-wrap gap-2">
                {employee.skills.map((skill) => (
                  <li key={skill}>
                    <Badge tone="neutral">{skill}</Badge>
                  </li>
                ))}
              </ul>
            </CardBody>
          </Card>
        )}

        {employee.notes && (
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Notizen</CardTitle>
            </CardHeader>
            <CardBody>
              <p className="whitespace-pre-line text-sm">{employee.notes}</p>
            </CardBody>
          </Card>
        )}
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="text-[var(--color-muted-foreground)]">{label}</dt>
      <dd className="text-right">{children}</dd>
    </div>
  );
}
