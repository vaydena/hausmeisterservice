import type { Metadata } from 'next';
import { requireTenantContext } from '@/lib/tenant/current';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card';
import { PushSubscriptionsPanel } from './push-panel';

export const metadata: Metadata = { title: 'Benachrichtigungen' };

function formatDateTime(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' });
}

export default async function NotificationsSettingsPage() {
  const ctx = await requireTenantContext();
  const supabase = await createSupabaseServerClient();
  const { data: subs } = await supabase
    .from('push_subscriptions')
    .select('id, endpoint, user_agent, created_at, last_used_at, last_error')
    .eq('user_id', ctx.userId)
    .order('created_at', { ascending: false });

  const configured = Boolean(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <PageHeader
        title="Benachrichtigungen"
        description="Push-Benachrichtigungen auf diesem Gerät aktivieren und angemeldete Geräte verwalten."
      />

      <Card>
        <CardHeader>
          <CardTitle>Push-Benachrichtigungen</CardTitle>
        </CardHeader>
        <CardBody>
          {!configured ? (
            <p className="text-sm text-[var(--color-muted-foreground)]">
              Push-Benachrichtigungen sind derzeit nicht konfiguriert. Bitte VAPID-Keys in der Umgebung setzen.
            </p>
          ) : (
            <PushSubscriptionsPanel />
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Angemeldete Geräte</CardTitle>
        </CardHeader>
        <CardBody>
          {!subs || subs.length === 0 ? (
            <p className="text-sm text-[var(--color-muted-foreground)]">
              Kein Gerät angemeldet. Klicken Sie oben auf „Aktivieren", um dieses Gerät hinzuzufügen.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[500px] text-sm">
                <thead>
                  <tr className="border-b border-[var(--color-border)] text-left text-xs uppercase tracking-wide text-[var(--color-muted-foreground)]">
                    <th className="py-2">Gerät / Browser</th>
                    <th className="py-2">Angemeldet</th>
                    <th className="py-2">Zuletzt zugestellt</th>
                    <th className="py-2">Fehler</th>
                  </tr>
                </thead>
                <tbody>
                  {subs.map((s) => (
                    <tr key={s.id} className="border-b border-[var(--color-border)] last:border-0">
                      <td className="py-2 text-xs">
                        <div className="truncate max-w-[280px]" title={s.user_agent ?? ''}>
                          {s.user_agent ?? '—'}
                        </div>
                      </td>
                      <td className="py-2">{formatDateTime(s.created_at)}</td>
                      <td className="py-2">{formatDateTime(s.last_used_at)}</td>
                      <td className="py-2 text-xs text-[var(--color-destructive)]">{s.last_error ?? '—'}</td>
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
