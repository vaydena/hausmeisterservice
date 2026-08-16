import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ModuleLink } from '@/components/ui/module-link';
import { requireTenantContext } from '@/lib/tenant/current';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { unwrapMaybeRow } from '@/lib/supabase/unwrap';
import { getEffectivePermissions } from '@/lib/permissions/effective';
import { PageHeader } from '@/components/ui/page-header';
import { LinkButton } from '@/components/ui/button';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatDate, formatDateTime } from '@/lib/utils/format';
import {
  DUE_LABEL,
  DUE_TONE,
  dueBucket,
  intervalLabel,
  daysUntil,
} from '@/lib/schemas/maintenance';
import { PRIORITY_LABEL } from '@/lib/schemas/work-orders';
import {
  deleteMaintenancePlanAction,
  generateWorkOrderFromPlanAction,
  toggleMaintenancePlanActiveAction,
} from '../actions';

export const metadata: Metadata = { title: 'Wartungsplan' };

const PRIORITY_TONE: Record<string, 'neutral' | 'warning' | 'danger'> = {
  low: 'neutral',
  normal: 'neutral',
  high: 'warning',
  emergency: 'danger',
};

export default async function MaintenancePlanDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await requireTenantContext();
  const supabase = await createSupabaseServerClient();
  const permissions = await getEffectivePermissions(ctx.userId, ctx.tenantId);

  // Sprint 109: Ohne Fehlerpruefung wurde aus einer gescheiterten Query ein
  // notFound() — die Seite behauptete, es gebe diesen Wartungsplan nicht.
  // Bei einem Datensatz, der eine gesetzliche Pruefpflicht traegt, ist das
  // die teuerste Verwechslung von allen.
  const plan = unwrapMaybeRow(
    await supabase
      .from('maintenance_plans')
      .select(
        'id, code, title, description, category, property_id, building_id, unit_id, interval_days, estimated_minutes, priority, assigned_role, next_due_at, last_completed_at, active, notes, created_at, updated_at',
      )
      .eq('id', id)
      .is('deleted_at', null)
      .maybeSingle(),
    'Wartungsplan',
  );

  if (!plan) notFound();

  const [propertyRes, buildingRes, unitRes] = await Promise.all([
    supabase
      .from('properties')
      .select('id, code, name')
      .eq('id', plan.property_id)
      .maybeSingle(),
    plan.building_id
      ? supabase.from('buildings').select('id, name').eq('id', plan.building_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    plan.unit_id
      ? supabase.from('units').select('id, code').eq('id', plan.unit_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);

  const property = unwrapMaybeRow(propertyRes, 'Wartungsplan: Objekt');
  const building = unwrapMaybeRow(buildingRes, 'Wartungsplan: Gebäude');
  const unit = unwrapMaybeRow(unitRes, 'Wartungsplan: Einheit');

  const bucket = dueBucket(plan.next_due_at, plan.active);
  const diff = daysUntil(plan.next_due_at);

  const canEdit = permissions.has('maintenance.edit');
  const canDelete = permissions.has('maintenance.delete');
  const canGenerate = canEdit && permissions.has('work_orders.create');

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <PageHeader
        title={plan.title}
        description={plan.code ?? undefined}
        action={
          canEdit ? (
            <LinkButton variant="outline" href={`/maintenance/${plan.id}/edit`}>
              Bearbeiten
            </LinkButton>
          ) : undefined
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={DUE_TONE[bucket]}>{DUE_LABEL[bucket]}</Badge>
        {plan.priority !== 'normal' && (
          <Badge tone={PRIORITY_TONE[plan.priority] ?? 'neutral'}>
            {PRIORITY_LABEL[plan.priority as keyof typeof PRIORITY_LABEL] ?? plan.priority}
          </Badge>
        )}
        {plan.category && <Badge tone="muted">{plan.category}</Badge>}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-6 lg:col-span-2">
          {plan.description && (
            <Card>
              <CardHeader>
                <CardTitle>Beschreibung</CardTitle>
              </CardHeader>
              <CardBody>
                <p className="whitespace-pre-line text-sm">{plan.description}</p>
              </CardBody>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Wiederholung</CardTitle>
            </CardHeader>
            <CardBody>
              <dl className="grid grid-cols-1 gap-2 text-sm md:grid-cols-2">
                <Row label="Intervall">{intervalLabel(plan.interval_days)}</Row>
                <Row label="Nächste Fälligkeit">
                  {formatDate(plan.next_due_at)}
                  {plan.active && (
                    <span className="text-[var(--color-muted-foreground)]">
                      {bucket === 'overdue'
                        ? ` (${-diff} Tage überfällig)`
                        : bucket === 'due_soon' && diff >= 0
                          ? ` (in ${diff} Tagen)`
                          : ''}
                    </span>
                  )}
                </Row>
                <Row label="Zuletzt erledigt">
                  {plan.last_completed_at ? formatDateTime(plan.last_completed_at) : 'Noch nie'}
                </Row>
                {plan.estimated_minutes !== null && (
                  <Row label="Geschätzt">{plan.estimated_minutes} Min</Row>
                )}
                {plan.assigned_role && <Row label="Zuständig">{plan.assigned_role}</Row>}
              </dl>
            </CardBody>
          </Card>

          {plan.notes && (
            <Card>
              <CardHeader>
                <CardTitle>Notizen</CardTitle>
              </CardHeader>
              <CardBody>
                <p className="whitespace-pre-line text-sm">{plan.notes}</p>
              </CardBody>
            </Card>
          )}
        </div>

        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Ort</CardTitle>
            </CardHeader>
            <CardBody>
              <dl className="grid grid-cols-1 gap-2 text-sm">
                <Row label="Objekt">
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
                </Row>
                {building && <Row label="Gebäude">{building.name}</Row>}
                {unit && <Row label="Einheit">{unit.code}</Row>}
              </dl>
            </CardBody>
          </Card>

          {canEdit && (
            <Card>
              <CardHeader>
                <CardTitle>Aktionen</CardTitle>
              </CardHeader>
              <CardBody>
                <div className="flex flex-col gap-2">
                  {canGenerate && plan.active && (
                    <form action={generateWorkOrderFromPlanAction}>
                      <input type="hidden" name="plan_id" value={plan.id} />
                      <button
                        type="submit"
                        className="w-full rounded-md bg-[var(--color-primary)] px-3 py-2 text-left text-sm font-medium text-[var(--color-primary-foreground)] hover:opacity-90"
                      >
                        → Auftrag jetzt anlegen
                      </button>
                    </form>
                  )}

                  <form action={toggleMaintenancePlanActiveAction}>
                    <input type="hidden" name="plan_id" value={plan.id} />
                    <input type="hidden" name="active" value={plan.active ? 'false' : 'true'} />
                    <button
                      type="submit"
                      className="w-full rounded-md border border-[var(--color-border)] px-3 py-2 text-left text-sm hover:bg-[var(--color-muted)]"
                    >
                      {plan.active ? 'Plan deaktivieren' : 'Plan aktivieren'}
                    </button>
                  </form>

                  {canDelete && (
                    <form action={deleteMaintenancePlanAction}>
                      <input type="hidden" name="plan_id" value={plan.id} />
                      <button
                        type="submit"
                        className="w-full rounded-md border border-[var(--color-destructive)]/40 px-3 py-2 text-left text-sm text-[var(--color-destructive)] hover:bg-[var(--color-destructive)]/10"
                      >
                        Plan löschen
                      </button>
                    </form>
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

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-[var(--color-muted-foreground)]">{label}</dt>
      <dd className="text-right">{children}</dd>
    </div>
  );
}
