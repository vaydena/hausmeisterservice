import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { requireTenantContext } from '@/lib/tenant/current';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getEffectivePermissions } from '@/lib/permissions/effective';
import { PageHeader } from '@/components/ui/page-header';
import { LinkButton } from '@/components/ui/button';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatDateTime } from '@/lib/utils/format';
import {
  CATEGORY_LABEL,
  KIND_LABEL,
  KIND_TONE,
  STATUS_LABEL,
  STATUS_TONE,
  type MaterialCategory,
  type MaterialStatus,
  type MovementKind,
} from '@/lib/schemas/materials';
import { MovementForm } from '../movement-forms';
import { softDeleteMaterialAction, setMaterialStatusAction } from '../actions';

export const metadata: Metadata = { title: 'Artikel' };

type MovementRow = {
  id: string;
  kind: string;
  quantity: number;
  occurred_at: string;
  note: string | null;
  property_id: string | null;
  work_order_id: string | null;
  assignee_user_id: string | null;
  created_by: string | null;
  unit_cost_at_time: number | null;
};

export default async function MaterialDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await requireTenantContext();
  const supabase = await createSupabaseServerClient();
  const permissions = await getEffectivePermissions(ctx.userId, ctx.tenantId);

  const { data: material } = await supabase
    .from('materials')
    .select(
      'id, code, label, sku, category, unit, min_stock, current_stock, unit_cost, storage_location, supplier, status, notes, deleted_at, created_at, updated_at',
    )
    .eq('id', id)
    .maybeSingle();

  if (!material) notFound();

  const [
    { data: movementsRaw },
    { data: propertiesForForm },
    { data: workOrdersForForm },
    { data: usersForForm },
  ] = await Promise.all([
    supabase
      .from('stock_movements')
      .select(
        'id, kind, quantity, occurred_at, note, property_id, work_order_id, assignee_user_id, created_by, unit_cost_at_time',
      )
      .eq('material_id', id)
      .order('occurred_at', { ascending: false })
      .limit(200),
    supabase
      .from('properties')
      .select('id, name, code')
      .is('deleted_at', null)
      .order('name'),
    supabase
      .from('work_orders')
      .select('id, title, code')
      .in('status', ['open', 'in_progress'])
      .order('created_at', { ascending: false })
      .limit(50),
    supabase.from('users').select('id, display_name').order('display_name'),
  ]);

  const movements: MovementRow[] = (movementsRaw ?? []).map((m) => ({
    ...m,
    quantity: Number(m.quantity),
    unit_cost_at_time: m.unit_cost_at_time !== null ? Number(m.unit_cost_at_time) : null,
  }));

  const referencedPropIds = [
    ...new Set(movements.map((m) => m.property_id).filter((v): v is string => Boolean(v))),
  ];
  const referencedWoIds = [
    ...new Set(movements.map((m) => m.work_order_id).filter((v): v is string => Boolean(v))),
  ];
  const referencedUserIds = [
    ...new Set(
      [
        ...movements.map((m) => m.assignee_user_id),
        ...movements.map((m) => m.created_by),
      ].filter((v): v is string => Boolean(v)),
    ),
  ];

  const [{ data: propsRefs }, { data: woRefs }, { data: userRefs }] = await Promise.all([
    referencedPropIds.length > 0
      ? supabase.from('properties').select('id, name, code').in('id', referencedPropIds)
      : Promise.resolve({ data: [] as { id: string; name: string; code: string | null }[] }),
    referencedWoIds.length > 0
      ? supabase.from('work_orders').select('id, title, code').in('id', referencedWoIds)
      : Promise.resolve({ data: [] as { id: string; title: string; code: string | null }[] }),
    referencedUserIds.length > 0
      ? supabase.from('users').select('id, display_name').in('id', referencedUserIds)
      : Promise.resolve({ data: [] as { id: string; display_name: string | null }[] }),
  ]);

  const propertyById = new Map((propsRefs ?? []).map((p) => [p.id, p]));
  const woById = new Map((woRefs ?? []).map((w) => [w.id, w]));
  const userById = new Map((userRefs ?? []).map((u) => [u.id, u.display_name]));

  const currentStock = Number(material.current_stock);
  const minStock = Number(material.min_stock);
  const isLow = currentStock < minStock;

  const canEdit = permissions.has('materials.edit');
  const canIssue = permissions.has('materials.assign');
  const canRecordMovement = canEdit || canIssue;
  const isInactive = material.status === 'inactive';

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <PageHeader
        title={material.label}
        description={material.code ?? undefined}
        action={
          canEdit && !material.deleted_at ? (
            <LinkButton variant="outline" href={`/materials/${material.id}/edit`}>
              Bearbeiten
            </LinkButton>
          ) : undefined
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={STATUS_TONE[material.status as MaterialStatus] ?? 'neutral'}>
          {STATUS_LABEL[material.status as MaterialStatus] ?? material.status}
        </Badge>
        <Badge tone="muted">
          {CATEGORY_LABEL[material.category as MaterialCategory] ?? material.category}
        </Badge>
        {material.sku && (
          <span className="text-xs text-[var(--color-muted-foreground)]">SKU {material.sku}</span>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-6 lg:col-span-2">
          <div className="grid gap-6 sm:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Aktueller Bestand</CardTitle>
              </CardHeader>
              <CardBody>
                <div className="flex flex-col gap-1">
                  <span
                    className={`text-3xl font-semibold tabular-nums ${
                      isLow ? 'text-[var(--color-destructive)]' : ''
                    }`}
                  >
                    {currentStock.toLocaleString('de-DE')}{' '}
                    <span className="text-lg font-normal text-[var(--color-muted-foreground)]">
                      {material.unit}
                    </span>
                  </span>
                  <span className="text-xs text-[var(--color-muted-foreground)]">
                    Meldebestand: {minStock.toLocaleString('de-DE')} {material.unit}
                    {isLow && ' — unterschritten'}
                  </span>
                </div>
              </CardBody>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Kosten</CardTitle>
              </CardHeader>
              <CardBody>
                {material.unit_cost !== null ? (
                  <div className="flex flex-col gap-1">
                    <span className="text-3xl font-semibold tabular-nums">
                      {Number(material.unit_cost).toLocaleString('de-DE', {
                        style: 'currency',
                        currency: 'EUR',
                      })}
                    </span>
                    <span className="text-xs text-[var(--color-muted-foreground)]">
                      pro {material.unit} · Bestandswert{' '}
                      {(currentStock * Number(material.unit_cost)).toLocaleString('de-DE', {
                        style: 'currency',
                        currency: 'EUR',
                      })}
                    </span>
                  </div>
                ) : (
                  <p className="text-sm text-[var(--color-muted-foreground)]">
                    Kein Preis hinterlegt.
                  </p>
                )}
              </CardBody>
            </Card>
          </div>

          {canRecordMovement && !isInactive && !material.deleted_at && (
            <Card>
              <CardHeader>
                <CardTitle>Bewegung buchen</CardTitle>
              </CardHeader>
              <MovementForm
                materialId={material.id}
                unit={material.unit}
                currentStock={currentStock}
                properties={propertiesForForm ?? []}
                workOrders={workOrdersForForm ?? []}
                users={usersForForm ?? []}
                defaultKind={canIssue && !canEdit ? 'issue' : 'issue'}
              />
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Bewegungen ({movements.length})</CardTitle>
            </CardHeader>
            <CardBody>
              {movements.length === 0 ? (
                <p className="text-sm text-[var(--color-muted-foreground)]">
                  Noch keine Bewegungen erfasst.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[640px] text-sm">
                    <thead className="border-b border-[var(--color-border)] text-left text-xs uppercase text-[var(--color-muted-foreground)]">
                      <tr>
                        <th className="py-2 pr-3 font-medium">Zeitpunkt</th>
                        <th className="py-2 pr-3 font-medium">Art</th>
                        <th className="py-2 pr-3 text-right font-medium">Menge</th>
                        <th className="py-2 pr-3 font-medium">Verwendung</th>
                        <th className="py-2 font-medium">Notiz</th>
                      </tr>
                    </thead>
                    <tbody>
                      {movements.map((m) => {
                        const property = m.property_id ? propertyById.get(m.property_id) : null;
                        const wo = m.work_order_id ? woById.get(m.work_order_id) : null;
                        const assignee = m.assignee_user_id
                          ? userById.get(m.assignee_user_id)
                          : null;
                        const creator = m.created_by ? userById.get(m.created_by) : null;
                        return (
                          <tr
                            key={m.id}
                            className="border-b border-[var(--color-border)] last:border-b-0 align-top"
                          >
                            <td className="py-2 pr-3">
                              {formatDateTime(m.occurred_at)}
                              {creator && (
                                <div className="text-xs text-[var(--color-muted-foreground)]">
                                  von {creator ?? '(unbekannt)'}
                                </div>
                              )}
                            </td>
                            <td className="py-2 pr-3">
                              <Badge tone={KIND_TONE[m.kind as MovementKind] ?? 'muted'}>
                                {KIND_LABEL[m.kind as MovementKind] ?? m.kind}
                              </Badge>
                            </td>
                            <td className="py-2 pr-3 text-right font-mono tabular-nums">
                              {m.quantity > 0
                                ? `+${m.quantity.toLocaleString('de-DE')}`
                                : m.quantity.toLocaleString('de-DE')}{' '}
                              {material.unit}
                            </td>
                            <td className="py-2 pr-3 text-xs text-[var(--color-muted-foreground)]">
                              {property && (
                                <div>
                                  <Link
                                    href={`/properties/${property.id}`}
                                    className="text-[var(--color-primary)] hover:underline"
                                  >
                                    {property.code ? `${property.code} · ${property.name}` : property.name}
                                  </Link>
                                </div>
                              )}
                              {wo && (
                                <div>
                                  <Link
                                    href={`/work-orders/${wo.id}`}
                                    className="text-[var(--color-primary)] hover:underline"
                                  >
                                    {wo.code ? `${wo.code} · ${wo.title}` : wo.title}
                                  </Link>
                                </div>
                              )}
                              {assignee && <div>an {assignee}</div>}
                            </td>
                            <td className="py-2 text-[var(--color-muted-foreground)]">
                              {m.note ?? ''}
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

        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Lager</CardTitle>
            </CardHeader>
            <CardBody>
              <dl className="grid grid-cols-1 gap-2 text-sm">
                <div className="flex justify-between gap-4">
                  <dt className="text-[var(--color-muted-foreground)]">Einheit</dt>
                  <dd>{material.unit}</dd>
                </div>
                {material.storage_location && (
                  <div className="flex justify-between gap-4">
                    <dt className="text-[var(--color-muted-foreground)]">Lagerplatz</dt>
                    <dd className="text-right">{material.storage_location}</dd>
                  </div>
                )}
                {material.supplier && (
                  <div className="flex justify-between gap-4">
                    <dt className="text-[var(--color-muted-foreground)]">Lieferant</dt>
                    <dd className="text-right">{material.supplier}</dd>
                  </div>
                )}
              </dl>
            </CardBody>
          </Card>

          {material.notes && (
            <Card>
              <CardHeader>
                <CardTitle>Notizen</CardTitle>
              </CardHeader>
              <CardBody>
                <p className="whitespace-pre-line text-sm">{material.notes}</p>
              </CardBody>
            </Card>
          )}

          {canEdit && !material.deleted_at && (
            <Card>
              <CardHeader>
                <CardTitle>Verwaltung</CardTitle>
              </CardHeader>
              <CardBody>
                <div className="flex flex-col gap-3">
                  <form action={setMaterialStatusAction} className="flex flex-col gap-2">
                    <input type="hidden" name="material_id" value={material.id} />
                    <label
                      htmlFor="status"
                      className="text-xs text-[var(--color-muted-foreground)]"
                    >
                      Status ändern
                    </label>
                    <div className="flex gap-2">
                      <select
                        id="status"
                        name="status"
                        defaultValue={material.status}
                        className="flex-1 rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-1.5 text-sm"
                      >
                        <option value="active">Aktiv</option>
                        <option value="inactive">Inaktiv</option>
                      </select>
                      <button
                        type="submit"
                        className="inline-flex h-8 items-center justify-center rounded-md bg-[var(--color-muted)] px-3 text-xs font-medium hover:opacity-80"
                      >
                        Speichern
                      </button>
                    </div>
                  </form>

                  {movements.length === 0 && (
                    <details className="rounded-md border-t border-[var(--color-border)] pt-3">
                      <summary className="cursor-pointer text-sm text-[var(--color-destructive)]">
                        Artikel entfernen
                      </summary>
                      <form action={softDeleteMaterialAction} className="mt-2 flex flex-col gap-2">
                        <p className="text-xs text-[var(--color-muted-foreground)]">
                          Nur möglich, wenn noch keine Bewegungen erfasst wurden.
                        </p>
                        <input type="hidden" name="material_id" value={material.id} />
                        <button
                          type="submit"
                          className="inline-flex h-8 items-center justify-center rounded-md bg-[var(--color-destructive)] px-3 text-xs font-medium text-white hover:opacity-90"
                        >
                          Endgültig entfernen
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
