import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requireTenantContext } from '@/lib/tenant/current';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getEffectivePermissions } from '@/lib/permissions/effective';
import { ModuleGate, ModuleLink } from '@/components/ui/module-link';
import { PageHeader } from '@/components/ui/page-header';
import { LinkButton } from '@/components/ui/button';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatDateTime } from '@/lib/utils/format';
import { unwrapMaybeRow, unwrapRows } from '@/lib/supabase/unwrap';
import { isModuleAvailable } from '@/lib/modules/enabled';
import { DocumentList, type DocumentRow } from '@/components/documents/document-list';
import { DocumentUploader } from '@/components/documents/document-uploader';

export const metadata: Metadata = { title: 'Objekt' };

export default async function PropertyDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireTenantContext();
  const supabase = await createSupabaseServerClient();
  const permissions = await getEffectivePermissions(ctx.userId, ctx.tenantId);

  const propertyRes = await supabase
    .from('properties')
    .select(
      'id, code, name, property_type, street, house_number, postal_code, city, country, gps_lat, gps_lng, notes, access_notes, emergency_notes, updated_at',
    )
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle();
  const property = unwrapMaybeRow(propertyRes, 'Objekte: properties');

  if (!property) notFound();

  const [buildingsRes, openOrdersRes] = await Promise.all([
    supabase.from('buildings').select('id, name, code').eq('property_id', id).order('name'),
    supabase
      .from('work_orders')
      .select('id, code, title, status, priority, created_at')
      .eq('property_id', id)
      .is('deleted_at', null)
      .not('status', 'in', '(done,cancelled)')
      .order('created_at', { ascending: false })
      .limit(20),
  ]);

  const canEdit = permissions.has('properties.edit');
  const canCreateOrder = permissions.has('work_orders.create');

  /**
   * SPRINT 135 — DER OBJEKTORDNER, DEN ES NIE GAB.
   *
   * `DOC_ENTITY_TYPES` kennt `property` seit Sprint 63, `resolveTarget` in
   * lib/documents/actions.ts loest es auf und revalidiert `/properties/<id>`,
   * die RLS-Policies decken es ab. Nur einen Uploader dafuer gab es nirgends:
   * `DocumentUploader` stand an genau drei Stellen (Auftrag, Meldung,
   * Pruefpunkt). Ein Dokument entstand also ausschliesslich INNERHALB eines
   * Vorgangs.
   *
   * Was dadurch nicht ablegbar war, ist genau das, was ein Hausmeisterbetrieb
   * dauerhaft am Objekt braucht: Grundriss, Versicherungsschein,
   * Wartungsvertrag, Schliessplan, Heizungsprotokoll. Nichts davon gehoert zu
   * einem einzelnen Auftrag.
   *
   * Sichtbare Folge: der Filter "Gehoert zu: Objekt" auf /documents konnte
   * seit dem ersten Tag keinen einzigen Treffer haben.
   */
  const documentsAvailable = await isModuleAvailable(ctx.tenantId, 'documents');
  const docs = documentsAvailable
    ? unwrapRows(
        await supabase
          .from('documents')
          .select(
            'id, kind, storage_path, original_filename, mime_type, byte_size, caption, created_at, uploaded_by',
          )
          .eq('entity_type', 'property')
          .eq('entity_id', property.id)
          .order('created_at', { ascending: false }),
        'Objekte: Dokumente',
      )
    : [];

  // Sprint 112: openOrders ist die Liste, auf die jemand schaut, BEVOR er den
  // Button "Auftrag anlegen" direkt daneben drueckt. Verschluckt stand dort
  // der Leerzustand — also die Auskunft, an diesem Objekt sei nichts offen.
  // Die Folge ist der Doppelauftrag: zwei Mitarbeiter fahren zur selben
  // Sache. Dieselbe Anzeige beantwortet auch die Frage des Eigentuemers am
  // Telefon, ob sich jemand kuemmert.
  const buildings = unwrapRows(buildingsRes, 'Objekte: Gebaeude');
  const openOrders = unwrapRows(openOrdersRes, 'Objekte: offene Auftraege');

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <PageHeader
        title={property.name}
        description={
          property.code
            ? `${property.code}${property.property_type ? ` · ${property.property_type}` : ''}`
            : (property.property_type ?? undefined)
        }
        action={
          <div className="flex gap-2">
            {canCreateOrder && (
              <ModuleGate href={`/work-orders/new?property_id=${property.id}`}>
                <LinkButton variant="secondary" href={`/work-orders/new?property_id=${property.id}`}>
                  Auftrag anlegen
                </LinkButton>
              </ModuleGate>
            )}
            <ModuleGate href={`/qr/property/${property.id}`}>
              <LinkButton variant="outline" href={`/qr/property/${property.id}`}>
                QR-Code
              </LinkButton>
            </ModuleGate>
            {/*
              Sprint 124: gehoert zum Objekt, nicht zum QR-Modul — der
              Melde-Link ist eine Eigenschaft dieser Liegenschaft (wer darf
              daran melden?) und bleibt deshalb erreichbar, auch wenn der
              Mandant die internen QR-Codes fuer Schluessel und Zaehler
              abgeschaltet hat.
            */}
            <LinkButton variant="outline" href={`/properties/${property.id}/melde-links`}>
              Melde-Links
            </LinkButton>
            {canEdit && (
              <LinkButton variant="outline" href={`/properties/${property.id}/edit`}>
                Bearbeiten
              </LinkButton>
            )}
          </div>
        }
      />

      {property.emergency_notes && (
        <div className="rounded-xl border border-[var(--color-destructive)]/40 bg-[color-mix(in_srgb,var(--color-destructive)_10%,transparent)] p-4">
          <div className="text-xs font-semibold uppercase tracking-wider text-[var(--color-destructive)]">
            Notfallhinweis
          </div>
          <p className="mt-1 whitespace-pre-line text-sm">{property.emergency_notes}</p>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Adresse</CardTitle>
            </CardHeader>
            <CardBody>
              <p className="whitespace-pre-line text-sm">{formatFullAddress(property)}</p>
              {(property.gps_lat !== null || property.gps_lng !== null) && (
                <p className="mt-2 text-xs text-[var(--color-muted-foreground)]">
                  GPS: {property.gps_lat ?? '–'} / {property.gps_lng ?? '–'}
                </p>
              )}
            </CardBody>
          </Card>

          {property.access_notes && (
            <Card>
              <CardHeader>
                <CardTitle>Zugangshinweise</CardTitle>
              </CardHeader>
              <CardBody>
                <p className="whitespace-pre-line text-sm">{property.access_notes}</p>
              </CardBody>
            </Card>
          )}

          {property.notes && (
            <Card>
              <CardHeader>
                <CardTitle>Notizen</CardTitle>
              </CardHeader>
              <CardBody>
                <p className="whitespace-pre-line text-sm">{property.notes}</p>
              </CardBody>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Offene Aufträge</CardTitle>
            </CardHeader>
            <CardBody>
              {openOrders.length === 0 ? (
                <p className="text-sm text-[var(--color-muted-foreground)]">
                  Aktuell keine offenen Aufträge zu diesem Objekt.
                </p>
              ) : (
                <ul className="divide-y divide-[var(--color-border)]">
                  {openOrders.map((wo) => (
                    <li key={wo.id}>
                      <ModuleLink
                        href={`/work-orders/${wo.id}`}
                        className="flex items-center gap-3 py-3 transition hover:opacity-80"
                        unavailableClassName="flex items-center gap-3 py-3"
                      >
                        {wo.code && <Badge tone="muted">{wo.code}</Badge>}
                        <span className="flex-1 truncate text-sm">{wo.title}</span>
                        <StatusBadge status={wo.status} />
                        {wo.priority !== 'normal' && <PriorityBadge priority={wo.priority} />}
                      </ModuleLink>
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>
        </div>

        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Gebäude</CardTitle>
            </CardHeader>
            <CardBody>
              {buildings.length === 0 ? (
                <p className="text-sm text-[var(--color-muted-foreground)]">
                  Noch keine Gebäude angelegt.
                </p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {buildings.map((b) => (
                    <li key={b.id} className="flex items-center gap-2 text-sm">
                      {b.code && <Badge tone="muted">{b.code}</Badge>}
                      <span>{b.name}</span>
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>

          {documentsAvailable && (
            <Card>
              <CardHeader>
                <CardTitle>
                  Objektunterlagen{docs.length > 0 ? ` (${docs.length})` : ''}
                </CardTitle>
              </CardHeader>
              <CardBody className="flex flex-col gap-4">
                <DocumentList
                  documents={docs as DocumentRow[]}
                  canDelete={canEdit || permissions.has('documents.delete')}
                  emptyLabel="Noch keine Unterlagen zu diesem Objekt."
                />
                {permissions.has('documents.create') ? (
                  <div className="flex flex-col gap-2">
                    <DocumentUploader
                      entityType="property"
                      entityId={property.id}
                      label="Unterlage hochladen"
                    />
                    <p className="text-xs text-[var(--color-muted-foreground)]">
                      Für Dauerhaftes am Objekt: Grundriss, Schließplan,
                      Versicherungsschein, Wartungsvertrag. Was zu einem
                      einzelnen Vorgang gehört, wird besser am Auftrag oder an
                      der Meldung abgelegt — dort steht es im Zusammenhang.
                    </p>
                  </div>
                ) : null}
              </CardBody>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Metadaten</CardTitle>
            </CardHeader>
            <CardBody>
              <dl className="grid grid-cols-1 gap-2 text-sm">
                <div className="flex justify-between">
                  <dt className="text-[var(--color-muted-foreground)]">Zuletzt geändert</dt>
                  <dd>{formatDateTime(property.updated_at)}</dd>
                </div>
                {property.code && (
                  <div className="flex justify-between">
                    <dt className="text-[var(--color-muted-foreground)]">Objekt-Nr.</dt>
                    <dd>{property.code}</dd>
                  </div>
                )}
              </dl>
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
}

function formatFullAddress(p: {
  street: string | null;
  house_number: string | null;
  postal_code: string | null;
  city: string | null;
  country: string | null;
}): string {
  const line1 = [p.street, p.house_number].filter(Boolean).join(' ');
  const line2 = [p.postal_code, p.city].filter(Boolean).join(' ');
  const line3 = p.country && p.country !== 'DE' ? p.country : '';
  const lines = [line1, line2, line3].filter((s) => s && s.length > 0);
  return lines.length > 0 ? lines.join('\n') : 'Keine Adresse hinterlegt.';
}

const STATUS_TONE: Record<string, 'neutral' | 'primary' | 'success' | 'warning' | 'danger'> = {
  new: 'primary',
  planned: 'neutral',
  in_progress: 'warning',
  blocked: 'danger',
  done: 'success',
  cancelled: 'muted' as never,
};

const STATUS_LABEL: Record<string, string> = {
  new: 'Neu',
  planned: 'Geplant',
  in_progress: 'In Arbeit',
  blocked: 'Blockiert',
  done: 'Erledigt',
  cancelled: 'Abgebrochen',
};

function StatusBadge({ status }: { status: string }) {
  const tone = STATUS_TONE[status] ?? 'neutral';
  const label = STATUS_LABEL[status] ?? status;
  return <Badge tone={tone}>{label}</Badge>;
}

const PRIORITY_LABEL: Record<string, string> = {
  low: 'Niedrig',
  normal: 'Normal',
  high: 'Hoch',
  emergency: 'Notfall',
};
const PRIORITY_TONE: Record<string, 'neutral' | 'warning' | 'danger'> = {
  high: 'warning',
  emergency: 'danger',
  low: 'neutral',
  normal: 'neutral',
};

function PriorityBadge({ priority }: { priority: string }) {
  const tone = PRIORITY_TONE[priority] ?? 'neutral';
  const label = PRIORITY_LABEL[priority] ?? priority;
  return <Badge tone={tone}>{label}</Badge>;
}
