import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getOwnerContext } from '@/lib/owner-portal/current';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { unwrapMaybeRow } from '@/lib/supabase/unwrap';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatDateTime } from '@/lib/utils/format';
import {
  STATUS_LABEL,
  STATUS_TONE,
  PRIORITY_LABEL,
  REPORTER_KIND_LABEL,
} from '@/lib/schemas/defect-reports';
import { WithdrawDefectButton } from './withdraw-defect-button';

export const metadata: Metadata = { title: 'Meldung · Eigentümer-Portal' };

export default async function OwnerMaengelDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const ctx = await getOwnerContext();
  if (!ctx) redirect('/owner/login');
  const { id } = await params;

  const propertyById = new Map(ctx.properties.map((p) => [p.id, p]));

  const supabase = await createSupabaseServerClient();
  const defect = unwrapMaybeRow(
    await supabase
      .from('defect_reports')
      .select(
        'id, property_id, code, title, description, status, priority, category, location_details, reporter_kind, reporter_user_id, reporter_name, created_at, reviewed_at, rejection_reason',
      )
      .eq('id', id)
      .maybeSingle(),
    'Eigentümerportal: Meldung',
  );
  if (!defect) notFound();

  const property = propertyById.get(defect.property_id);
  const propertyLabel = property
    ? property.code
      ? `${property.code} · ${property.name ?? 'Objekt'}`
      : (property.name ?? 'Objekt')
    : 'Objekt';

  const canWithdraw = defect.reporter_user_id === ctx.userId && defect.status === 'new';

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <div>
        <Link
          href="/owner/maengel"
          className="text-sm text-[var(--color-muted-foreground)] hover:underline"
        >
          ← Zurück zu den Mängeln
        </Link>
      </div>

      <PageHeader
        title={defect.title}
        description={defect.code ? `${defect.code} · ${propertyLabel}` : propertyLabel}
        action={
          <Badge tone={STATUS_TONE[defect.status as keyof typeof STATUS_TONE] ?? 'neutral'}>
            {STATUS_LABEL[defect.status as keyof typeof STATUS_LABEL] ?? defect.status}
          </Badge>
        }
      />

      <Card>
        <CardBody>
          <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
            <Field label="Objekt">{propertyLabel}</Field>
            <Field label="Dringlichkeit">
              {PRIORITY_LABEL[defect.priority as keyof typeof PRIORITY_LABEL] ?? defect.priority}
            </Field>
            <Field label="Gemeldet von">
              {REPORTER_KIND_LABEL[defect.reporter_kind as keyof typeof REPORTER_KIND_LABEL] ??
                defect.reporter_kind}
              {defect.reporter_name ? ` (${defect.reporter_name})` : ''}
            </Field>
            <Field label="Gemeldet am">{formatDateTime(defect.created_at)}</Field>
            {defect.location_details && (
              <Field label="Ort / Lage">{defect.location_details}</Field>
            )}
            {defect.category && <Field label="Kategorie">{defect.category}</Field>}
            {defect.reviewed_at && (
              <Field label="Bearbeitet am">{formatDateTime(defect.reviewed_at)}</Field>
            )}
          </dl>
        </CardBody>
      </Card>

      {defect.description && (
        <Card>
          <CardHeader>
            <CardTitle>Beschreibung</CardTitle>
          </CardHeader>
          <CardBody>
            <p className="whitespace-pre-line text-sm">{defect.description}</p>
          </CardBody>
        </Card>
      )}

      {defect.status === 'rejected' && defect.rejection_reason && (
        <Card>
          <CardHeader>
            <CardTitle>Begründung der Ablehnung</CardTitle>
          </CardHeader>
          <CardBody>
            <p className="whitespace-pre-line text-sm">{defect.rejection_reason}</p>
          </CardBody>
        </Card>
      )}

      {canWithdraw && (
        <div className="flex flex-col gap-2">
          <p className="text-xs text-[var(--color-muted-foreground)]">
            Solange Ihre Hausverwaltung die Meldung noch nicht bearbeitet hat, können Sie sie
            zurückziehen.
          </p>
          <WithdrawDefectButton id={defect.id} />
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs uppercase tracking-wide text-[var(--color-muted-foreground)]">
        {label}
      </dt>
      <dd>{children}</dd>
    </div>
  );
}
