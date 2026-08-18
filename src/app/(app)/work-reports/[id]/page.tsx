import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireTenantContext } from '@/lib/tenant/current';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { unwrapMaybeRow } from '@/lib/supabase/unwrap';
import { getEffectivePermissions } from '@/lib/permissions/effective';
import { PageHeader } from '@/components/ui/page-header';
import { LinkButton } from '@/components/ui/button';
import { ModuleLink } from '@/components/ui/module-link';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  WORK_REPORT_STATUS_LABEL,
  WORK_REPORT_STATUS_TONE,
  formatWorkedTime,
  type WorkReportStatus,
} from '@/lib/schemas/work-reports';
import { ApproveButton, ReopenButton, DeleteReportButton } from '../report-actions';

export const metadata: Metadata = { title: 'Arbeitsbericht' };

function deDate(iso: string | null): string {
  if (!iso) return '—';
  const datePart = iso.slice(0, 10);
  const [y, m, d] = datePart.split('-');
  return d && m && y ? `${d}.${m}.${y}` : iso;
}

export default async function WorkReportDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireTenantContext();
  const permissions = await getEffectivePermissions(ctx.userId, ctx.tenantId);
  if (!permissions.has('work_reports.view')) notFound();

  const supabase = await createSupabaseServerClient();
  const report = unwrapMaybeRow(
    await supabase
      .from('work_reports')
      .select(
        'id, code, title, property_id, work_order_id, performed_on, description, minutes_worked, material_used, status, signer_name, signature_data, signed_at, approved_at',
      )
      .eq('id', id)
      .is('deleted_at', null)
      .maybeSingle(),
    'Arbeitsbericht',
  );
  if (!report) notFound();

  const [property, workOrder] = await Promise.all([
    supabase
      .from('properties')
      .select('name, code')
      .eq('id', report.property_id)
      .maybeSingle()
      .then((r) => r.data),
    report.work_order_id
      ? supabase
          .from('work_orders')
          .select('id, code, title')
          .eq('id', report.work_order_id)
          .maybeSingle()
          .then((r) => r.data)
      : Promise.resolve(null),
  ]);

  const status = report.status as WorkReportStatus;
  const isDraft = status === 'draft';
  const canEdit = permissions.has('work_reports.edit');
  const canApprove = permissions.has('work_reports.approve');
  const canDownload = permissions.has('work_reports.download');

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <PageHeader
        title={report.title}
        description={report.code ?? undefined}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={WORK_REPORT_STATUS_TONE[status]}>{WORK_REPORT_STATUS_LABEL[status]}</Badge>
            {canDownload && (
              <Link
                href={`/api/work-reports/${report.id}/pdf`}
                target="_blank"
                className="inline-flex h-9 items-center rounded-md border border-[var(--color-border)] px-3 text-sm font-medium hover:bg-[var(--color-muted)]"
              >
                PDF
              </Link>
            )}
            {isDraft && canEdit && (
              <LinkButton href={`/work-reports/${report.id}/edit`} variant="secondary" size="sm">
                Bearbeiten
              </LinkButton>
            )}
          </div>
        }
      />

      <Card>
        <CardBody>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-4 text-sm">
            <div className="flex flex-col gap-0.5">
              <dt className="text-xs uppercase text-[var(--color-muted-foreground)]">Objekt</dt>
              <dd>
                {property
                  ? `${property.code ? property.code + ' · ' : ''}${property.name}`
                  : 'Objekt entfernt'}
              </dd>
            </div>
            <div className="flex flex-col gap-0.5">
              <dt className="text-xs uppercase text-[var(--color-muted-foreground)]">Leistungsdatum</dt>
              <dd>{deDate(report.performed_on)}</dd>
            </div>
            {workOrder && (
              <div className="flex flex-col gap-0.5">
                <dt className="text-xs uppercase text-[var(--color-muted-foreground)]">Auftrag</dt>
                <dd>
                  <ModuleLink
                    href={`/work-orders/${workOrder.id}`}
                    className="underline hover:opacity-80"
                    unavailableClassName="text-[var(--color-muted-foreground)]"
                  >
                    {workOrder.code ? `${workOrder.code} · ${workOrder.title}` : workOrder.title}
                  </ModuleLink>
                </dd>
              </div>
            )}
            <div className="flex flex-col gap-0.5">
              <dt className="text-xs uppercase text-[var(--color-muted-foreground)]">Arbeitszeit</dt>
              <dd>{formatWorkedTime(report.minutes_worked)}</dd>
            </div>
          </dl>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Durchgeführte Arbeiten</CardTitle>
        </CardHeader>
        <CardBody>
          <p className="whitespace-pre-wrap text-sm leading-relaxed">{report.description}</p>
          {report.material_used && (
            <div className="mt-4 border-t border-[var(--color-border)] pt-4">
              <h3 className="text-xs uppercase text-[var(--color-muted-foreground)]">Material</h3>
              <p className="mt-1 whitespace-pre-wrap text-sm">{report.material_used}</p>
            </div>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Bestätigung vor Ort</CardTitle>
        </CardHeader>
        <CardBody>
          {report.signature_data ? (
            <div className="flex flex-col gap-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={report.signature_data}
                alt="Unterschrift"
                className="max-h-40 w-auto self-start rounded-md border border-[var(--color-border)] bg-white p-2"
              />
              <p className="text-sm text-[var(--color-muted-foreground)]">
                {report.signer_name ?? 'Unterschrieben'}
                {report.signed_at ? ` · ${deDate(report.signed_at)}` : ''}
              </p>
            </div>
          ) : (
            <p className="text-sm text-[var(--color-muted-foreground)]">
              Noch keine Unterschrift erfasst.
              {report.signer_name ? ` Vorgesehen: ${report.signer_name}.` : ''}
            </p>
          )}
        </CardBody>
      </Card>

      {(canApprove || (isDraft && canEdit)) && (
        <Card>
          <CardHeader>
            <CardTitle>{isDraft ? 'Freigabe' : 'Freigegeben'}</CardTitle>
          </CardHeader>
          <CardBody>
            {isDraft ? (
              <div className="flex flex-col gap-3">
                <p className="text-sm text-[var(--color-muted-foreground)]">
                  Nach der Freigabe ist der Bericht gesperrt und kann als PDF weitergegeben werden.
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  {canApprove && <ApproveButton reportId={report.id} />}
                  {canEdit && <DeleteReportButton reportId={report.id} code={report.code} />}
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                <p className="text-sm text-[var(--color-muted-foreground)]">
                  Freigegeben am {deDate(report.approved_at)}. Zum Ändern zuerst zurück in den
                  Entwurf holen.
                </p>
                {canApprove && <ReopenButton reportId={report.id} />}
              </div>
            )}
          </CardBody>
        </Card>
      )}
    </div>
  );
}
