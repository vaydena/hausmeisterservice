import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireTenantContext } from '@/lib/tenant/current';
import { createSupabaseServiceClient } from '@/lib/supabase/service';
import { getEffectivePermissions } from '@/lib/permissions/effective';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ModuleLink } from '@/components/ui/module-link';
import { formatDateTime } from '@/lib/utils/format';
import { unwrapMaybeRow } from '@/lib/supabase/unwrap';

export const metadata: Metadata = { title: 'E-Mail-Detail' };

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

function entityLink(entityType: string | null, entityId: string | null): string | null {
  if (!entityType || !entityId) return null;
  if (entityType === 'invoice') return `/billing/invoices/${entityId}`;
  if (entityType === 'offer') return `/billing/offers/${entityId}`;
  return null;
}

export default async function SentEmailDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireTenantContext();
  const permissions = await getEffectivePermissions(ctx.userId, ctx.tenantId);
  if (!permissions.has('billing.view') && !permissions.has('automations.manage')) {
    notFound();
  }

  // Service-Client mit tenant-Guard weiter unten — RLS-Policy sent_emails.select
  // deckt automations.manage nicht ab, aber der Server-Guard oben tut das.
  const service = createSupabaseServiceClient();
  const entryRes = await service
    .from('sent_emails')
    .select(
      'id, tenant_id, created_at, sent_at, status, provider, provider_message_id, entity_type, entity_id, to_addresses, cc_addresses, subject, body_hash, attachment_names, error, sent_by',
    )
    .eq('id', id)
    .maybeSingle();
  const entry = unwrapMaybeRow(entryRes, 'Einstellungen: sent_emails');

  if (!entry || entry.tenant_id !== ctx.tenantId) notFound();

  const senderName = entry.sent_by
    ? ((await service.from('users').select('display_name').eq('id', entry.sent_by).maybeSingle())
        .data?.display_name ?? '(unbekannt)')
    : 'System';

  const link = entityLink(entry.entity_type, entry.entity_id);
  const bereichLabel = entry.entity_type
    ? (ENTITY_LABEL[entry.entity_type] ?? entry.entity_type)
    : 'Automatisierung';

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <PageHeader
        title="E-Mail-Detail"
        description={`Vorgang vom ${formatDateTime(entry.created_at)}`}
        action={
          <div className="flex items-center gap-2">
            <Badge tone={STATUS_TONE[entry.status] ?? 'muted'}>
              {STATUS_LABEL[entry.status] ?? entry.status}
            </Badge>
            <Link
              href="/settings/emails"
              className="inline-flex h-9 items-center rounded-md border border-[var(--color-border)] px-3 text-sm font-medium hover:bg-[var(--color-muted)]"
            >
              Zurück
            </Link>
          </div>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle>Nachricht</CardTitle>
        </CardHeader>
        <CardBody>
          <dl className="grid gap-4 text-sm sm:grid-cols-[max-content_1fr]">
            <dt className="text-xs uppercase tracking-wide text-[var(--color-muted-foreground)]">
              Betreff
            </dt>
            <dd className="font-medium">{entry.subject}</dd>

            <dt className="text-xs uppercase tracking-wide text-[var(--color-muted-foreground)]">
              An
            </dt>
            <dd className="break-all">
              {entry.to_addresses.length === 0 ? (
                '—'
              ) : (
                <ul className="space-y-0.5">
                  {entry.to_addresses.map((addr) => (
                    <li key={addr}>{addr}</li>
                  ))}
                </ul>
              )}
            </dd>

            {entry.cc_addresses && entry.cc_addresses.length > 0 && (
              <>
                <dt className="text-xs uppercase tracking-wide text-[var(--color-muted-foreground)]">
                  CC
                </dt>
                <dd className="break-all">
                  <ul className="space-y-0.5">
                    {entry.cc_addresses.map((addr) => (
                      <li key={addr}>{addr}</li>
                    ))}
                  </ul>
                </dd>
              </>
            )}

            {entry.attachment_names && entry.attachment_names.length > 0 && (
              <>
                <dt className="text-xs uppercase tracking-wide text-[var(--color-muted-foreground)]">
                  Anhänge
                </dt>
                <dd>
                  <ul className="space-y-0.5">
                    {entry.attachment_names.map((name) => (
                      <li key={name} className="font-mono text-xs">
                        {name}
                      </li>
                    ))}
                  </ul>
                </dd>
              </>
            )}

            <dt className="text-xs uppercase tracking-wide text-[var(--color-muted-foreground)]">
              Nachrichteninhalt
            </dt>
            <dd className="text-xs text-[var(--color-muted-foreground)]">
              Aus Datenschutzgründen nicht gespeichert.
              {entry.body_hash && (
                <>
                  {' '}
                  Integritäts-Hash:{' '}
                  <code className="rounded bg-[var(--color-muted)] px-1 py-0.5 font-mono">
                    {entry.body_hash}
                  </code>
                </>
              )}
            </dd>
          </dl>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Zustellung</CardTitle>
        </CardHeader>
        <CardBody>
          <dl className="grid gap-4 text-sm sm:grid-cols-[max-content_1fr]">
            <dt className="text-xs uppercase tracking-wide text-[var(--color-muted-foreground)]">
              Provider
            </dt>
            <dd>{entry.provider}</dd>

            {entry.provider_message_id && (
              <>
                <dt className="text-xs uppercase tracking-wide text-[var(--color-muted-foreground)]">
                  Provider-Message-ID
                </dt>
                <dd className="break-all">
                  <code className="rounded bg-[var(--color-muted)] px-1 py-0.5 font-mono text-xs">
                    {entry.provider_message_id}
                  </code>
                </dd>
              </>
            )}

            <dt className="text-xs uppercase tracking-wide text-[var(--color-muted-foreground)]">
              Eingereiht
            </dt>
            <dd>{formatDateTime(entry.created_at)}</dd>

            <dt className="text-xs uppercase tracking-wide text-[var(--color-muted-foreground)]">
              Versendet
            </dt>
            <dd>{entry.sent_at ? formatDateTime(entry.sent_at) : '—'}</dd>

            {entry.status === 'failed' && entry.error && (
              <>
                <dt className="text-xs uppercase tracking-wide text-[var(--color-destructive)]">
                  Fehler
                </dt>
                <dd>
                  <pre className="whitespace-pre-wrap rounded-md border border-[var(--color-border)] bg-[var(--color-destructive)]/10 p-3 text-xs text-[var(--color-destructive)]">
                    {entry.error}
                  </pre>
                </dd>
              </>
            )}
          </dl>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Kontext</CardTitle>
        </CardHeader>
        <CardBody>
          <dl className="grid gap-4 text-sm sm:grid-cols-[max-content_1fr]">
            <dt className="text-xs uppercase tracking-wide text-[var(--color-muted-foreground)]">
              Bereich
            </dt>
            <dd>
              {link ? (
                // Siehe Liste: Ziel im Abrechnungsmodul, Seite unter /settings.
                // Nur der Bereichsname als Linktext, ohne "öffnen": faellt der
                // Link bei abgeschaltetem Modul weg, bliebe sonst eine
                // Aufforderung stehen, der man nicht nachkommen kann.
                <ModuleLink href={link} className="underline-offset-2 hover:underline">
                  {bereichLabel}
                </ModuleLink>
              ) : (
                <span>{bereichLabel}</span>
              )}
            </dd>

            <dt className="text-xs uppercase tracking-wide text-[var(--color-muted-foreground)]">
              Ausgelöst von
            </dt>
            <dd>{senderName}</dd>

            <dt className="text-xs uppercase tracking-wide text-[var(--color-muted-foreground)]">
              Vorgangs-ID
            </dt>
            <dd>
              <code className="rounded bg-[var(--color-muted)] px-1 py-0.5 font-mono text-xs">
                {entry.id}
              </code>
            </dd>
          </dl>
        </CardBody>
      </Card>
    </div>
  );
}
