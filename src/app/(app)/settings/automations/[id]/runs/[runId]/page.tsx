import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireTenantContext } from '@/lib/tenant/current';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getEffectivePermissions } from '@/lib/permissions/effective';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { formatDateTime } from '@/lib/utils/format';
import { ACTIONS_BY_KEY, TRIGGERS_BY_KEY, type ActionKey, type TriggerKey } from '@/lib/automations/registry';

export const metadata: Metadata = { title: 'Automatisierungs-Lauf' };

const ENTITY_LABEL: Record<string, string> = {
  invoice: 'Rechnung',
  offer: 'Angebot',
  defect_report: 'Mängelmeldung',
  work_order: 'Auftrag',
  maintenance_plan: 'Wartungsplan',
};

function entityLink(entityType: string, entityId: string): string | null {
  switch (entityType) {
    case 'invoice':
      return `/billing/invoices/${entityId}`;
    case 'offer':
      return `/billing/offers/${entityId}`;
    case 'defect_report':
      return `/defect-reports/${entityId}`;
    case 'work_order':
      return `/work-orders/${entityId}`;
    case 'maintenance_plan':
      return `/maintenance/${entityId}`;
    default:
      return null;
  }
}

export default async function AutomationRunDetailPage({
  params,
}: {
  params: Promise<{ id: string; runId: string }>;
}) {
  const { id, runId } = await params;
  const ctx = await requireTenantContext();
  const permissions = await getEffectivePermissions(ctx.userId, ctx.tenantId);
  if (!permissions.has('automations.view')) notFound();

  const supabase = await createSupabaseServerClient();

  const { data: rule } = await supabase
    .from('automation_rules')
    .select('id, name, trigger_key, action_key')
    .eq('id', id)
    .maybeSingle();
  if (!rule) notFound();

  const { data: run } = await supabase
    .from('automation_runs')
    .select('id, rule_id, created_at, trigger_key, match_count, action_ok_count, action_failed_count, error')
    .eq('id', runId)
    .maybeSingle();
  if (!run || run.rule_id !== rule.id) notFound();

  const { data: dispatches } = await supabase
    .from('automation_dispatches')
    .select('entity_type, entity_id, dispatch_key, dispatched_at')
    .eq('run_id', runId)
    .order('dispatched_at', { ascending: true });

  const triggerDef = TRIGGERS_BY_KEY[rule.trigger_key as TriggerKey];
  const actionDef = ACTIONS_BY_KEY[rule.action_key as ActionKey];

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <PageHeader
        title="Automatisierungs-Lauf"
        description={`Regel „${rule.name}" — ${formatDateTime(run.created_at)}`}
        action={
          <Link
            href={`/settings/automations/${rule.id}`}
            className="inline-flex h-9 items-center rounded-md border border-[var(--color-border)] px-3 text-sm font-medium hover:bg-[var(--color-muted)]"
          >
            Zurück zur Regel
          </Link>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle>Ergebnis</CardTitle>
        </CardHeader>
        <CardBody>
          <dl className="grid gap-4 text-sm sm:grid-cols-4">
            <div>
              <dt className="text-xs uppercase tracking-wide text-[var(--color-muted-foreground)]">Trigger</dt>
              <dd className="mt-1">{triggerDef?.labelDe ?? run.trigger_key}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-[var(--color-muted-foreground)]">Aktion</dt>
              <dd className="mt-1">{actionDef?.labelDe ?? rule.action_key}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-[var(--color-muted-foreground)]">Treffer</dt>
              <dd className="mt-1 text-lg font-semibold tabular-nums">{run.match_count}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-[var(--color-muted-foreground)]">
                Aktionen OK / Fehler
              </dt>
              <dd className="mt-1 text-lg font-semibold tabular-nums">
                <span className="text-[var(--color-success)]">{run.action_ok_count}</span>
                <span className="mx-1 text-[var(--color-muted-foreground)]">/</span>
                <span className={run.action_failed_count > 0 ? 'text-[var(--color-destructive)]' : ''}>
                  {run.action_failed_count}
                </span>
              </dd>
            </div>
          </dl>
          {run.error && (
            <p className="mt-4 rounded-md bg-[var(--color-destructive)]/10 px-3 py-2 text-xs text-[var(--color-destructive)]">
              {run.error}
            </p>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Betroffene Vorgänge</CardTitle>
        </CardHeader>
        <CardBody>
          {!dispatches || dispatches.length === 0 ? (
            <EmptyState
              title="Keine Dispatches verknüpft"
              description={
                run.match_count === 0
                  ? 'Der Lauf hat keine passenden Vorgänge gefunden.'
                  : 'Läufe vor dem 10.08.2026 tragen keinen Run-Bezug — die aggregate Statistik oben ist die einzige Datenquelle.'
              }
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[600px] text-sm">
                <thead>
                  <tr className="border-b border-[var(--color-border)] text-left text-xs uppercase tracking-wide text-[var(--color-muted-foreground)]">
                    <th className="py-2 pr-4 font-medium">Vorgang</th>
                    <th className="py-2 pr-4 font-medium">Dispatch-Key</th>
                    <th className="py-2 font-medium">Zeitpunkt</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-border)]">
                  {dispatches.map((d) => {
                    const link = entityLink(d.entity_type, d.entity_id);
                    const label = ENTITY_LABEL[d.entity_type] ?? d.entity_type;
                    return (
                      <tr key={`${d.entity_type}-${d.entity_id}-${d.dispatch_key}`}>
                        <td className="py-2 pr-4">
                          {link ? (
                            <Link
                              href={link}
                              className="underline-offset-2 hover:underline"
                            >
                              {label}
                            </Link>
                          ) : (
                            <span>{label}</span>
                          )}
                          <Badge tone="muted" className="ml-2 text-[10px]">
                            {d.entity_id.slice(0, 8)}
                          </Badge>
                        </td>
                        <td className="py-2 pr-4">
                          <code className="rounded bg-[var(--color-muted)] px-1 py-0.5 font-mono text-xs">
                            {d.dispatch_key}
                          </code>
                        </td>
                        <td className="py-2 text-xs text-[var(--color-muted-foreground)]">
                          {formatDateTime(d.dispatched_at)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
