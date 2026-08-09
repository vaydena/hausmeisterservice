import type { Metadata } from 'next';
import Link from 'next/link';
import { requireTenantContext } from '@/lib/tenant/current';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getEffectivePermissions } from '@/lib/permissions/effective';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardBody } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Badge } from '@/components/ui/badge';
import { ACTIONS_BY_KEY, TRIGGERS_BY_KEY, type ActionKey, type TriggerKey } from '@/lib/automations/registry';

export const metadata: Metadata = { title: 'Automatisierungen' };

function formatDateTime(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' });
}

export default async function AutomationsPage() {
  const ctx = await requireTenantContext();
  const supabase = await createSupabaseServerClient();
  const permissions = await getEffectivePermissions(ctx.userId, ctx.tenantId);
  const canManage = permissions.has('automations.manage');

  const { data: rules } = await supabase
    .from('automation_rules')
    .select('id, name, description, trigger_key, action_key, enabled, last_run_at, last_error')
    .order('created_at', { ascending: false });

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <PageHeader
        title="Automatisierungen"
        description="Regeln, die auf Ereignisse (überfällige Rechnungen, fällige Wartungen …) automatisch reagieren."
        action={
          canManage ? (
            <Link
              href="/settings/automations/new"
              className="inline-flex h-9 items-center rounded-md bg-[var(--color-primary)] px-4 text-sm font-medium text-[var(--color-primary-foreground)] hover:opacity-90"
            >
              Neue Regel
            </Link>
          ) : null
        }
      />

      {!rules || rules.length === 0 ? (
        <EmptyState
          title="Noch keine Regeln"
          description="Legen Sie eine Regel an, um z. B. Benachrichtigungen für überfällige Rechnungen zu automatisieren."
          action={
            canManage ? (
              <Link
                href="/settings/automations/new"
                className="inline-flex h-9 items-center rounded-md bg-[var(--color-primary)] px-4 text-sm font-medium text-[var(--color-primary-foreground)] hover:opacity-90"
              >
                Erste Regel anlegen
              </Link>
            ) : null
          }
        />
      ) : (
        <div className="flex flex-col gap-3">
          {rules.map((r) => (
            <Card key={r.id}>
              <CardBody>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <Link
                        href={`/settings/automations/${r.id}`}
                        className="text-base font-medium hover:text-[var(--color-primary)]"
                      >
                        {r.name}
                      </Link>
                      <Badge tone={r.enabled ? 'success' : 'muted'}>
                        {r.enabled ? 'Aktiv' : 'Deaktiviert'}
                      </Badge>
                      {r.last_error && <Badge tone="danger">Fehler</Badge>}
                    </div>
                    {r.description && (
                      <p className="mt-1 text-sm text-[var(--color-muted-foreground)]">
                        {r.description}
                      </p>
                    )}
                    <p className="mt-2 text-xs text-[var(--color-muted-foreground)]">
                      Trigger: <strong>{TRIGGERS_BY_KEY[r.trigger_key as TriggerKey]?.labelDe ?? r.trigger_key}</strong>
                      {' '}·{' '}
                      Aktion: <strong>{ACTIONS_BY_KEY[r.action_key as ActionKey]?.labelDe ?? r.action_key}</strong>
                      {' '}· Letzter Lauf: {formatDateTime(r.last_run_at)}
                    </p>
                  </div>
                </div>
              </CardBody>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
