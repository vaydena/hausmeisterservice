import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requireTenantContext } from '@/lib/tenant/current';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getEffectivePermissions } from '@/lib/permissions/effective';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardBody } from '@/components/ui/card';
import { RuleForm } from './rule-form';
import { unwrapRows } from '@/lib/supabase/unwrap';

export const metadata: Metadata = { title: 'Regel anlegen' };

export default async function NewAutomationPage() {
  const ctx = await requireTenantContext();
  const permissions = await getEffectivePermissions(ctx.userId, ctx.tenantId);
  if (!permissions.has('automations.manage')) notFound();

  const supabase = await createSupabaseServerClient();
  // Verschluckt blieben Empfaenger- und Rollenauswahl leer, und die Regel
  // liess sich mit leerem Empfaengerkreis speichern: eine Automatisierung,
  // die zuverlaessig laeuft und niemanden erreicht.
  const memberRows = unwrapRows(
    await supabase
      .from('memberships')
      .select('user_id')
      .eq('tenant_id', ctx.tenantId)
      .eq('status', 'active'),
    'Neue Regel: Mitglieder',
  );
  const userIds = memberRows.map((m) => m.user_id);

  const userRows = userIds.length
    ? unwrapRows(
        await supabase.from('users').select('id, display_name').in('id', userIds),
        'Neue Regel: Namen der Mitglieder',
      )
    : [];

  const memberList = userRows
    .map((u) => ({ id: u.id, label: u.display_name ?? u.id.slice(0, 8) }))
    .sort((a, b) => a.label.localeCompare(b.label, 'de'));

  const roles = unwrapRows(
    await supabase.from('roles').select('key, name').eq('tenant_id', ctx.tenantId).order('name'),
    'Neue Regel: Rollen',
  );
  const roleList = roles.map((r) => ({ key: r.key, label: r.name ?? r.key }));

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <PageHeader
        title="Neue Automatisierungs-Regel"
        description="Trigger und Aktion wählen, Empfänger festlegen."
      />
      <Card>
        <CardBody>
          <RuleForm members={memberList} roles={roleList} />
        </CardBody>
      </Card>
    </div>
  );
}
