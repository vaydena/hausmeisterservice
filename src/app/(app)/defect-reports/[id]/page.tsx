import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ModuleLink } from '@/components/ui/module-link';
import { requireTenantContext } from '@/lib/tenant/current';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getEffectivePermissions } from '@/lib/permissions/effective';
import { PageHeader } from '@/components/ui/page-header';
import { LinkButton } from '@/components/ui/button';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatDateTime } from '@/lib/utils/format';
import {
  STATUS_LABEL,
  STATUS_TONE,
  PRIORITY_LABEL,
  REPORTER_KIND_LABEL,
  type DefectReportStatus,
} from '@/lib/schemas/defect-reports';
import {
  convertDefectReportAction,
  rejectDefectReportAction,
  setDefectReportStatusAction,
} from '../actions';
import { DocumentUploader } from '@/components/documents/document-uploader';
import { DocumentList, type DocumentRow } from '@/components/documents/document-list';
import { unwrapMaybeRow, unwrapRows } from '@/lib/supabase/unwrap';

export const metadata: Metadata = { title: 'Meldung' };

const PRIORITY_TONE: Record<string, 'neutral' | 'warning' | 'danger'> = {
  low: 'neutral',
  normal: 'neutral',
  high: 'warning',
  emergency: 'danger',
};

export default async function DefectReportDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await requireTenantContext();
  const supabase = await createSupabaseServerClient();
  const permissions = await getEffectivePermissions(ctx.userId, ctx.tenantId);

  const reportRes = await supabase
    .from('defect_reports')
    .select(
      'id, code, title, description, category, priority, status, property_id, building_id, unit_id, location_details, reporter_kind, reporter_name, reporter_contact, reporter_user_id, converted_work_order_id, reviewed_by, reviewed_at, rejection_reason, created_at, updated_at',
    )
    .eq('id', id)
    .maybeSingle();
  const report = unwrapMaybeRow(reportRes, 'Maengelmeldungen: defect_reports');

  if (!report) notFound();

  const [propertyRes, buildingRes, unitRes, workOrderRes] = await Promise.all([
    supabase.from('properties').select('id, code, name').eq('id', report.property_id).maybeSingle(),
    report.building_id
      ? supabase.from('buildings').select('id, name').eq('id', report.building_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    report.unit_id
      ? supabase.from('units').select('id, code').eq('id', report.unit_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    report.converted_work_order_id
      ? supabase
          .from('work_orders')
          .select('id, code, title, status')
          .eq('id', report.converted_work_order_id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);
  const property = unwrapMaybeRow(propertyRes, 'Maengelmeldungen: properties');
  const building = unwrapMaybeRow(buildingRes, 'Maengelmeldungen: buildings');
  const unit = unwrapMaybeRow(unitRes, 'Maengelmeldungen: units');

  const docsRes = await supabase
    .from('documents')
    .select(
      'id, kind, storage_path, original_filename, mime_type, byte_size, caption, created_at, uploaded_by',
    )
    .eq('entity_type', 'defect_report')
    .eq('entity_id', report.id)
    .order('created_at', { ascending: false });
  const docs = unwrapRows(docsRes, 'Maengelmeldungen: documents');

  const userIds = [report.reporter_user_id, report.reviewed_by].filter((v): v is string =>
    Boolean(v),
  );
  const uniqueUserIds = [...new Set(userIds)];
  const usersRes =
    uniqueUserIds.length > 0
      ? await supabase.from('users').select('id, display_name').in('id', uniqueUserIds)
      : { data: [], error: null };
  const users = unwrapRows(usersRes, 'Maengelmeldungen: users');
  const displayById = new Map(users.map((u) => [u.id, u.display_name]));

  const canEdit = permissions.has('defect_reports.edit');
  const canConvert = canEdit && permissions.has('work_orders.create');
  const isConverted = report.status === 'converted';
  const isRejected = report.status === 'rejected';

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <PageHeader
        title={report.title}
        description={report.code ? report.code : undefined}
        action={
          canEdit && !isConverted ? (
            <LinkButton variant="outline" href={`/defect-reports/${report.id}/edit`}>
              Bearbeiten
            </LinkButton>
          ) : undefined
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={STATUS_TONE[report.status as DefectReportStatus] ?? 'neutral'}>
          {STATUS_LABEL[report.status as DefectReportStatus] ?? report.status}
        </Badge>
        {report.priority !== 'normal' && (
          <Badge tone={PRIORITY_TONE[report.priority] ?? 'neutral'}>
            {PRIORITY_LABEL[report.priority as keyof typeof PRIORITY_LABEL] ?? report.priority}
          </Badge>
        )}
        {report.category && <Badge tone="muted">{report.category}</Badge>}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-6 lg:col-span-2">
          {report.description && (
            <Card>
              <CardHeader>
                <CardTitle>Beschreibung</CardTitle>
              </CardHeader>
              <CardBody>
                <p className="whitespace-pre-line text-sm">{report.description}</p>
              </CardBody>
            </Card>
          )}

          {isRejected && report.rejection_reason && (
            <Card>
              <CardHeader>
                <CardTitle>Ablehnungsgrund</CardTitle>
              </CardHeader>
              <CardBody>
                <p className="whitespace-pre-line text-sm">{report.rejection_reason}</p>
              </CardBody>
            </Card>
          )}

          {workOrderRes.data && (
            <Card>
              <CardHeader>
                <CardTitle>Übernommener Auftrag</CardTitle>
              </CardHeader>
              <CardBody>
                <ModuleLink
                  href={`/work-orders/${workOrderRes.data.id}`}
                  className="inline-flex items-center gap-2 text-sm font-medium text-[var(--color-primary)] hover:underline"
                  unavailableClassName="inline-flex items-center gap-2 text-sm font-medium"
                >
                  {workOrderRes.data.code ?? '–'} · {workOrderRes.data.title}
                </ModuleLink>
              </CardBody>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Fotos &amp; Anhänge</CardTitle>
            </CardHeader>
            <CardBody className="flex flex-col gap-4">
              <DocumentList
                documents={docs as DocumentRow[]}
                canDelete={canEdit || permissions.has('documents.delete')}
                emptyLabel="Noch keine Fotos zur Meldung."
              />
              {permissions.has('documents.create') && (
                <DocumentUploader
                  entityType="defect_report"
                  entityId={report.id}
                  accept="image/*,application/pdf"
                />
              )}
            </CardBody>
          </Card>
        </div>

        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Ort</CardTitle>
            </CardHeader>
            <CardBody>
              <dl className="grid grid-cols-1 gap-2 text-sm">
                <div className="flex justify-between gap-4">
                  <dt className="text-[var(--color-muted-foreground)]">Objekt</dt>
                  <dd>
                    {property ? (
                      <ModuleLink
                        href={`/properties/${property.id}`}
                        className="text-[var(--color-primary)] hover:underline"
                      >
                        {property.code ? `${property.code} · ${property.name}` : property.name}
                      </ModuleLink>
                    ) : (
                      '–'
                    )}
                  </dd>
                </div>
                {building && (
                  <div className="flex justify-between gap-4">
                    <dt className="text-[var(--color-muted-foreground)]">Gebäude</dt>
                    <dd>{building.name}</dd>
                  </div>
                )}
                {unit && (
                  <div className="flex justify-between gap-4">
                    <dt className="text-[var(--color-muted-foreground)]">Einheit</dt>
                    <dd>{unit.code}</dd>
                  </div>
                )}
                {report.location_details && (
                  <div className="flex justify-between gap-4">
                    <dt className="text-[var(--color-muted-foreground)]">Detail</dt>
                    <dd className="text-right">{report.location_details}</dd>
                  </div>
                )}
              </dl>
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Meldender</CardTitle>
            </CardHeader>
            <CardBody>
              <dl className="grid grid-cols-1 gap-2 text-sm">
                <div className="flex justify-between gap-4">
                  <dt className="text-[var(--color-muted-foreground)]">Rolle</dt>
                  <dd>
                    {REPORTER_KIND_LABEL[
                      report.reporter_kind as keyof typeof REPORTER_KIND_LABEL
                    ] ?? report.reporter_kind}
                  </dd>
                </div>
                {report.reporter_name && (
                  <div className="flex justify-between gap-4">
                    <dt className="text-[var(--color-muted-foreground)]">Name</dt>
                    <dd>{report.reporter_name}</dd>
                  </div>
                )}
                {report.reporter_contact && (
                  <div className="flex justify-between gap-4">
                    <dt className="text-[var(--color-muted-foreground)]">Kontakt</dt>
                    <dd>{report.reporter_contact}</dd>
                  </div>
                )}
                {report.reporter_user_id && (
                  <div className="flex justify-between gap-4">
                    <dt className="text-[var(--color-muted-foreground)]">Benutzer</dt>
                    <dd>{displayById.get(report.reporter_user_id) ?? '(unbekannt)'}</dd>
                  </div>
                )}
              </dl>
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Verlauf</CardTitle>
            </CardHeader>
            <CardBody>
              <dl className="grid grid-cols-1 gap-2 text-sm">
                <div className="flex justify-between gap-4">
                  <dt className="text-[var(--color-muted-foreground)]">Gemeldet</dt>
                  <dd>{formatDateTime(report.created_at)}</dd>
                </div>
                {report.reviewed_at && (
                  <div className="flex justify-between gap-4">
                    <dt className="text-[var(--color-muted-foreground)]">Geprüft</dt>
                    <dd>
                      {formatDateTime(report.reviewed_at)}
                      {report.reviewed_by && (
                        <>
                          {' '}
                          <span className="text-[var(--color-muted-foreground)]">
                            · {displayById.get(report.reviewed_by) ?? 'System'}
                          </span>
                        </>
                      )}
                    </dd>
                  </div>
                )}
              </dl>
            </CardBody>
          </Card>

          {canEdit && !isConverted && (
            <Card>
              <CardHeader>
                <CardTitle>Aktionen</CardTitle>
              </CardHeader>
              <CardBody>
                <div className="flex flex-col gap-2">
                  {report.status === 'new' && (
                    <form action={setDefectReportStatusAction}>
                      <input type="hidden" name="report_id" value={report.id} />
                      <input type="hidden" name="status" value="reviewing" />
                      <button
                        type="submit"
                        className="w-full rounded-md border border-[var(--color-border)] px-3 py-2 text-left text-sm hover:bg-[var(--color-muted)]"
                      >
                        → In Prüfung nehmen
                      </button>
                    </form>
                  )}

                  {canConvert && (
                    <form action={convertDefectReportAction}>
                      <input type="hidden" name="report_id" value={report.id} />
                      <button
                        type="submit"
                        className="w-full rounded-md bg-[var(--color-primary)] px-3 py-2 text-left text-sm font-medium text-[var(--color-primary-foreground)] hover:opacity-90"
                      >
                        → In Auftrag überführen
                      </button>
                    </form>
                  )}

                  {!isRejected && (
                    <details className="rounded-md border border-[var(--color-border)]">
                      <summary className="cursor-pointer px-3 py-2 text-sm text-[var(--color-destructive)]">
                        Meldung ablehnen
                      </summary>
                      <form action={rejectDefectReportAction} className="flex flex-col gap-2 p-3">
                        <input type="hidden" name="report_id" value={report.id} />
                        <textarea
                          name="rejection_reason"
                          rows={3}
                          maxLength={500}
                          placeholder="Grund (optional)"
                          className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm"
                        />
                        <button
                          type="submit"
                          className="inline-flex h-8 items-center justify-center rounded-md bg-[var(--color-destructive)] px-3 text-xs font-medium text-white hover:opacity-90"
                        >
                          Ablehnen bestätigen
                        </button>
                      </form>
                    </details>
                  )}
                </div>
              </CardBody>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
