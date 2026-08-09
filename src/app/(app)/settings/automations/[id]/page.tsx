import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireTenantContext } from '@/lib/tenant/current';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getEffectivePermissions } from '@/lib/permissions/effective';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ACTIONS_BY_KEY, TRIGGERS_BY_KEY, type ActionKey, type TriggerKey } from '@/lib/automations/registry';
import { parseActionConfig, parseTriggerConfig } from '@/lib/schemas/automations';
import { RuleAdminBar } from './admin-bar';

export const metadata: Metadata = { title: 'Automatisierungs-Regel' };

function fmt(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' });
}

export default async function AutomationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await requireTenantContext();
  const supabase = await createSupabaseServerClient();
  const permissions = await getEffectivePermissions(ctx.userId, ctx.tenantId);
  const canManage = permissions.has('automations.manage');

  const { data: rule } = await supabase
    .from('automation_rules')
    .select('id, name, description, trigger_key, trigger_config, action_key, action_config, enabled, last_run_at, last_error, created_at')
    .eq('id', id)
    .maybeSingle();
  if (!rule) notFound();

  const { data: runs } = await supabase
    .from('automation_runs')
    .select('id, created_at, match_count, action_ok_count, action_failed_count, error')
    .eq('rule_id', rule.id)
    .order('created_at', { ascending: false })
    .limit(20);

  const { count: dispatchCount } = await supabase
    .from('automation_dispatches')
    .select('rule_id', { count: 'exact', head: true })
    .eq('rule_id', rule.id);

  const triggerDef = TRIGGERS_BY_KEY[rule.trigger_key as TriggerKey];
  const actionDef = ACTIONS_BY_KEY[rule.action_key as ActionKey];
  const triggerCfg = parseTriggerConfig(rule.trigger_config);
  const actionCfg = parseActionConfig(rule.action_config);

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <PageHeader
        title={rule.name}
        description={rule.description ?? undefined}
        action={
          <div className="flex items-center gap-2">
            <Badge tone={rule.enabled ? 'success' : 'muted'}>
              {rule.enabled ? 'Aktiv' : 'Deaktiviert'}
            </Badge>
            <Link
              href="/settings/automations"
              className="inline-flex h-9 items-center rounded-md border border-[var(--color-border)] px-3 text-sm font-medium hover:bg-[var(--color-muted)]"
            >
              Zurück
            </Link>
          </div>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle>Regel-Definition</CardTitle>
        </CardHeader>
        <CardBody>
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-xs uppercase tracking-wide text-[var(--color-muted-foreground)]">Trigger</dt>
              <dd className="mt-1">{triggerDef?.labelDe ?? rule.trigger_key}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-[var(--color-muted-foreground)]">Aktion</dt>
              <dd className="mt-1">{actionDef?.labelDe ?? rule.action_key}</dd>
            </div>
            {triggerCfg.days_before !== undefined && (
              <div>
                <dt className="text-xs uppercase tracking-wide text-[var(--color-muted-foreground)]">Tage vorher</dt>
                <dd className="mt-1">{triggerCfg.days_before}</dd>
              </div>
            )}
            {actionCfg.recipient_kind && (
              <div>
                <dt className="text-xs uppercase tracking-wide text-[var(--color-muted-foreground)]">Empfänger-Auswahl</dt>
                <dd className="mt-1">
                  {actionCfg.recipient_kind === 'users' && 'Benutzer'}
                  {actionCfg.recipient_kind === 'role' && 'Rolle'}
                  {actionCfg.recipient_kind === 'addresses' && 'E-Mail-Adressen'}
                </dd>
              </div>
            )}
            {actionCfg.role_key && (
              <div>
                <dt className="text-xs uppercase tracking-wide text-[var(--color-muted-foreground)]">Empfänger-Rolle</dt>
                <dd className="mt-1">{actionCfg.role_key}</dd>
              </div>
            )}
            {actionCfg.user_ids && actionCfg.user_ids.length > 0 && (
              <div className="sm:col-span-2">
                <dt className="text-xs uppercase tracking-wide text-[var(--color-muted-foreground)]">Empfänger (Benutzer)</dt>
                <dd className="mt-1">{actionCfg.user_ids.length} Benutzer</dd>
              </div>
            )}
            {actionCfg.addresses && actionCfg.addresses.length > 0 && (
              <div className="sm:col-span-2">
                <dt className="text-xs uppercase tracking-wide text-[var(--color-muted-foreground)]">E-Mail-Adressen</dt>
                <dd className="mt-1 break-all">{actionCfg.addresses.join(', ')}</dd>
              </div>
            )}
            <div>
              <dt className="text-xs uppercase tracking-wide text-[var(--color-muted-foreground)]">Letzter Lauf</dt>
              <dd className="mt-1">{fmt(rule.last_run_at)}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-[var(--color-muted-foreground)]">Angelegt</dt>
              <dd className="mt-1">{fmt(rule.created_at)}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-[var(--color-muted-foreground)]">Ausgelöste Dispatches</dt>
              <dd className="mt-1 tabular-nums">{dispatchCount ?? 0}</dd>
            </div>
          </dl>
          {rule.last_error && (
            <p className="mt-3 rounded-md bg-[var(--color-destructive)]/10 px-3 py-2 text-xs text-[var(--color-destructive)]">
              {rule.last_error}
            </p>
          )}
        </CardBody>
      </Card>

      {canManage && (
        <RuleAdminBar
          id={rule.id}
          enabled={rule.enabled}
          dispatchCount={dispatchCount ?? 0}
          actionKey={rule.action_key}
        />
      )}

      <Card>
        <CardHeader>
          <CardTitle>Letzte Läufe</CardTitle>
        </CardHeader>
        <CardBody>
          {!runs || runs.length === 0 ? (
            <p className="text-sm text-[var(--color-muted-foreground)]">Noch keine Läufe protokolliert.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[500px] text-sm">
                <thead>
                  <tr className="border-b border-[var(--color-border)] text-left text-xs uppercase tracking-wide text-[var(--color-muted-foreground)]">
                    <th className="py-2">Zeitpunkt</th>
                    <th className="py-2 text-right">Treffer</th>
                    <th className="py-2 text-right">Aktionen OK</th>
                    <th className="py-2 text-right">Fehler</th>
                    <th className="py-2">Fehlermeldung</th>
                  </tr>
                </thead>
                <tbody>
                  {runs.map((r) => (
                    <tr key={r.id} className="border-b border-[var(--color-border)] last:border-0">
                      <td className="py-2">
                        <Link
                          href={`/settings/automations/${rule.id}/runs/${r.id}`}
                          className="underline-offset-2 hover:underline"
                        >
                          {fmt(r.created_at)}
                        </Link>
                      </td>
                      <td className="py-2 text-right tabular-nums">{r.match_count}</td>
                      <td className="py-2 text-right tabular-nums">{r.action_ok_count}</td>
                      <td className="py-2 text-right tabular-nums">{r.action_failed_count}</td>
                      <td className="py-2 text-xs text-[var(--color-muted-foreground)]">{r.error ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
