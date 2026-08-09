import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireTenantContext } from '@/lib/tenant/current';
import { createSupabaseServiceClient } from '@/lib/supabase/service';
import { getEffectivePermissions } from '@/lib/permissions/effective';
import { PageHeader } from '@/components/ui/page-header';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { formatDateTime } from '@/lib/utils/format';

export const metadata: Metadata = { title: 'E-Mail-Log' };

const STATUS_LABEL: Record<string, string> = {
  queued: 'In Warteschlange',
  sent: 'Versendet',
  failed: 'Fehlgeschlagen',
};

const STATUS_TONE: Record<string, 'muted' | 'success' | 'danger'> = {
  queued: 'muted',
  sent: 'success',
  failed: 'danger',
};

const ENTITY_LABEL: Record<string, string> = {
  invoice: 'Rechnung',
  offer: 'Angebot',
};

const STATUS_FILTERS = [
  { value: '', labelDe: 'Alle Status' },
  { value: 'sent', labelDe: 'Versendet' },
  { value: 'queued', labelDe: 'In Warteschlange' },
  { value: 'failed', labelDe: 'Fehlgeschlagen' },
] as const;

const ENTITY_FILTERS = [
  { value: '', labelDe: 'Alle Bereiche' },
  { value: 'invoice', labelDe: 'Rechnungen' },
  { value: 'offer', labelDe: 'Angebote' },
  { value: 'automation', labelDe: 'Automatisierungen' },
] as const;

function formatRecipients(addresses: string[] | null): string {
  if (!addresses || addresses.length === 0) return '—';
  if (addresses.length <= 2) return addresses.join(', ');
  return `${addresses.slice(0, 2).join(', ')} +${addresses.length - 2}`;
}

function entityLink(entityType: string | null, entityId: string | null): string | null {
  if (!entityType || !entityId) return null;
  if (entityType === 'invoice') return `/billing/invoices/${entityId}`;
  if (entityType === 'offer') return `/billing/offers/${entityId}`;
  return null;
}

function buildHref(currentStatus: string, currentEntity: string, next: { status?: string; entity?: string }): string {
  const params = new URLSearchParams();
  const status = next.status !== undefined ? next.status : currentStatus;
  const entity = next.entity !== undefined ? next.entity : currentEntity;
  if (status) params.set('status', status);
  if (entity) params.set('entity', entity);
  const qs = params.toString();
  return qs ? `/settings/emails?${qs}` : '/settings/emails';
}

export default async function SentEmailsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const rawStatus = typeof params.status === 'string' ? params.status : '';
  const rawEntity = typeof params.entity === 'string' ? params.entity : '';
  const status = ['queued', 'sent', 'failed'].includes(rawStatus) ? rawStatus : '';
  const entity = ['invoice', 'offer', 'automation'].includes(rawEntity) ? rawEntity : '';

  const ctx = await requireTenantContext();
  const permissions = await getEffectivePermissions(ctx.userId, ctx.tenantId);
  // Zugang bekommt, wer Abrechnung sehen darf (klassischer Rechnungs-/Angebots-Weg)
  // oder wer Automatisierungen verwaltet (Testmails, Regel-Mails). Beides sind
  // legitime Beobachtungs-Anlässe für ausgehende Mails.
  if (!permissions.has('billing.view') && !permissions.has('automations.manage')) {
    notFound();
  }

  // Service-Client, weil die sent_emails.select-Policy nur billing.view kennt —
  // ein Automations-Manager ohne billing.view würde sonst leer sehen. Der Guard
  // oben deckt beide Fälle bereits ab.
  const service = createSupabaseServiceClient();
  let query = service
    .from('sent_emails')
    .select(
      'id, created_at, sent_at, status, provider, entity_type, entity_id, to_addresses, subject, error, sent_by',
    )
    .eq('tenant_id', ctx.tenantId)
    .order('created_at', { ascending: false })
    .limit(100);

  if (status) query = query.eq('status', status as 'queued' | 'sent' | 'failed');
  if (entity === 'invoice' || entity === 'offer') {
    query = query.eq('entity_type', entity);
  } else if (entity === 'automation') {
    query = query.is('entity_type', null);
  }

  const { data: entries } = await query;
  const rows = entries ?? [];

  const senderIds = [
    ...new Set(rows.map((r) => r.sent_by).filter((v): v is string => Boolean(v))),
  ];
  const { data: senders } =
    senderIds.length > 0
      ? await service.from('users').select('id, display_name').in('id', senderIds)
      : { data: [] };
  const senderById = new Map((senders ?? []).map((u) => [u.id, u.display_name]));

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <PageHeader
        title="E-Mail-Log"
        description="Ausgehende Transaktions-Mails der letzten 100 Vorgänge (Rechnungen, Angebote, Automatisierungen). Zeigt nur Metadaten und Betreff — der Nachrichteninhalt wird aus Datenschutzgründen nicht gespeichert."
      />

      <div className="flex flex-wrap items-center gap-4 rounded-lg border border-[var(--color-border)] bg-[var(--color-muted)] p-3 text-sm">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium uppercase tracking-wide text-[var(--color-muted-foreground)]">
            Status
          </span>
          {STATUS_FILTERS.map((f) => (
            <Link
              key={f.value || 'all'}
              href={buildHref(status, entity, { status: f.value })}
              className={
                f.value === status
                  ? 'inline-flex h-8 items-center rounded-md bg-[var(--color-foreground)] px-3 text-xs font-medium text-[var(--color-background)]'
                  : 'inline-flex h-8 items-center rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 text-xs font-medium hover:bg-[var(--color-muted)]'
              }
            >
              {f.labelDe}
            </Link>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium uppercase tracking-wide text-[var(--color-muted-foreground)]">
            Bereich
          </span>
          {ENTITY_FILTERS.map((f) => (
            <Link
              key={f.value || 'all'}
              href={buildHref(status, entity, { entity: f.value })}
              className={
                f.value === entity
                  ? 'inline-flex h-8 items-center rounded-md bg-[var(--color-foreground)] px-3 text-xs font-medium text-[var(--color-background)]'
                  : 'inline-flex h-8 items-center rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 text-xs font-medium hover:bg-[var(--color-muted)]'
              }
            >
              {f.labelDe}
            </Link>
          ))}
        </div>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          title="Noch keine E-Mails im Log"
          description="Sobald Rechnungen, Angebote oder Automatisierungen eine E-Mail auslösen, erscheint sie hier — inklusive Zustellstatus und Provider-Message-ID."
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-[var(--color-border)] bg-[var(--color-background)]">
          <table className="w-full min-w-[860px] text-sm">
            <thead className="border-b border-[var(--color-border)] bg-[var(--color-muted)]/50 text-left text-xs uppercase tracking-wider text-[var(--color-muted-foreground)]">
              <tr>
                <th className="px-4 py-2 font-medium">Zeit</th>
                <th className="px-4 py-2 font-medium">Bereich</th>
                <th className="px-4 py-2 font-medium">Empfänger</th>
                <th className="px-4 py-2 font-medium">Betreff</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium">Provider</th>
                <th className="px-4 py-2 font-medium">Ausgelöst von</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {rows.map((row) => {
                const link = entityLink(row.entity_type, row.entity_id);
                const bereichLabel = row.entity_type
                  ? (ENTITY_LABEL[row.entity_type] ?? row.entity_type)
                  : 'Automatisierung';
                return (
                  <tr key={row.id}>
                    <td className="whitespace-nowrap px-4 py-2">
                      <Link
                        href={`/settings/emails/${row.id}`}
                        className="text-[var(--color-muted-foreground)] underline-offset-2 hover:text-[var(--color-foreground)] hover:underline"
                      >
                        {formatDateTime(row.sent_at ?? row.created_at)}
                      </Link>
                    </td>
                    <td className="px-4 py-2">
                      {link ? (
                        <Link href={link} className="underline-offset-2 hover:underline">
                          {bereichLabel}
                        </Link>
                      ) : (
                        <span>{bereichLabel}</span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-xs">
                      {formatRecipients(row.to_addresses)}
                    </td>
                    <td className="px-4 py-2">
                      <span className="line-clamp-1" title={row.subject}>
                        {row.subject}
                      </span>
                    </td>
                    <td className="px-4 py-2">
                      <Badge tone={STATUS_TONE[row.status] ?? 'muted'}>
                        {STATUS_LABEL[row.status] ?? row.status}
                      </Badge>
                      {row.status === 'failed' && row.error && (
                        <p className="mt-1 text-[10px] text-[var(--color-destructive)]" title={row.error}>
                          {row.error.slice(0, 80)}
                          {row.error.length > 80 ? '…' : ''}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-2 text-xs">{row.provider}</td>
                    <td className="px-4 py-2 text-xs">
                      {row.sent_by
                        ? (senderById.get(row.sent_by) ?? '(unbekannt)')
                        : 'System'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
