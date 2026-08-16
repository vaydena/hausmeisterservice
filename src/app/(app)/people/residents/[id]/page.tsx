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
import { formatDate } from '@/lib/utils/format';
import { deleteResidentAction } from '../actions';
import { PortalInviteButton, PortalRevokeButton } from './portal-access-panel';
import { unwrapMaybeRow } from '@/lib/supabase/unwrap';

export const metadata: Metadata = { title: 'Bewohner' };

export default async function ResidentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireTenantContext();
  const supabase = await createSupabaseServerClient();
  const permissions = await getEffectivePermissions(ctx.userId, ctx.tenantId);

  // Sprint 112: Diese Zeile traegt portal_invited_at / portal_activated_at und
  // steuert damit die Portal-Einladung. Verschluckt endete das in einem 404 —
  // fuer eine Bewohnerin, die es gibt.
  const resident = unwrapMaybeRow(
    await supabase
      .from('residents')
      .select(
        'id, first_name, last_name, email, phone, property_id, building_id, unit_id, moved_in, moved_out, notes, created_at, updated_at, user_id, portal_invited_at, portal_activated_at',
      )
      .eq('id', id)
      .is('deleted_at', null)
      .maybeSingle(),
    'Bewohner: Datensatz',
  );

  if (!resident) notFound();

  const [propertyRes, buildingRes, unitRes] = await Promise.all([
    resident.property_id
      ? supabase
          .from('properties')
          .select('id, code, name')
          .eq('id', resident.property_id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    resident.building_id
      ? supabase.from('buildings').select('id, name').eq('id', resident.building_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    resident.unit_id
      ? supabase.from('units').select('id, code').eq('id', resident.unit_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);
  const property = unwrapMaybeRow(propertyRes, 'Personen: properties');
  const building = unwrapMaybeRow(buildingRes, 'Personen: buildings');
  const unit = unwrapMaybeRow(unitRes, 'Personen: units');

  const isMovedOut = resident.moved_out && new Date(resident.moved_out) < new Date();
  const canEdit = permissions.has('residents.edit');
  const canDelete = permissions.has('residents.delete');

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <PageHeader
        title={`${resident.first_name} ${resident.last_name}`}
        description={isMovedOut ? 'Ausgezogen' : 'Aktiver Bewohner'}
        action={
          canEdit ? (
            <LinkButton variant="outline" href={`/people/residents/${resident.id}/edit`}>
              Bearbeiten
            </LinkButton>
          ) : undefined
        }
      />

      {isMovedOut && <Badge tone="muted">Ausgezogen am {formatDate(resident.moved_out!)}</Badge>}

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Kontakt</CardTitle>
          </CardHeader>
          <CardBody>
            <dl className="grid grid-cols-1 gap-2 text-sm">
              <Row label="E-Mail">
                {resident.email ? (
                  <a
                    href={`mailto:${resident.email}`}
                    className="text-[var(--color-primary)] hover:underline"
                  >
                    {resident.email}
                  </a>
                ) : (
                  '–'
                )}
              </Row>
              <Row label="Telefon">
                {resident.phone ? (
                  <a
                    href={`tel:${resident.phone}`}
                    className="text-[var(--color-primary)] hover:underline"
                  >
                    {resident.phone}
                  </a>
                ) : (
                  '–'
                )}
              </Row>
            </dl>
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Wohnort</CardTitle>
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
              {resident.moved_in && <Row label="Einzug">{formatDate(resident.moved_in)}</Row>}
              {resident.moved_out && <Row label="Auszug">{formatDate(resident.moved_out)}</Row>}
            </dl>
          </CardBody>
        </Card>
      </div>

      {resident.notes && (
        <Card>
          <CardHeader>
            <CardTitle>Notizen</CardTitle>
          </CardHeader>
          <CardBody>
            <p className="whitespace-pre-line text-sm">{resident.notes}</p>
          </CardBody>
        </Card>
      )}

      {canEdit && (
        <Card>
          <CardHeader>
            <CardTitle>Bewohner-Portal</CardTitle>
          </CardHeader>
          <CardBody>
            {resident.user_id ? (
              <div className="flex flex-col gap-3 text-sm">
                <div className="flex items-center gap-2">
                  <Badge tone="success">Verknüpft</Badge>
                  {resident.portal_activated_at ? (
                    <span className="text-[var(--color-muted-foreground)]">
                      Portal aktiviert am {formatDate(resident.portal_activated_at)}
                    </span>
                  ) : resident.portal_invited_at ? (
                    <span className="text-[var(--color-muted-foreground)]">
                      Einladung versendet am {formatDate(resident.portal_invited_at)} – noch nicht
                      angemeldet
                    </span>
                  ) : null}
                </div>
                <PortalRevokeButton residentId={resident.id} />
              </div>
            ) : resident.email ? (
              <div className="flex flex-col gap-3">
                <p className="text-sm text-[var(--color-muted-foreground)]">
                  Sendet eine Einladung an <strong>{resident.email}</strong>. Der Bewohner setzt
                  sich anschließend selbst ein Passwort und meldet sich unter
                  <code className="ml-1 rounded bg-[var(--color-muted)] px-1 py-0.5 text-xs">
                    /portal
                  </code>{' '}
                  an.
                </p>
                <PortalInviteButton residentId={resident.id} />
              </div>
            ) : (
              <p className="text-sm text-[var(--color-muted-foreground)]">
                Um eine Einladung zu senden, hinterlegen Sie zuerst eine E-Mail-Adresse.
              </p>
            )}
          </CardBody>
        </Card>
      )}

      {canDelete && (
        <div className="flex justify-end">
          <form action={deleteResidentAction}>
            <input type="hidden" name="resident_id" value={resident.id} />
            <button
              type="submit"
              className="inline-flex h-8 items-center rounded-md border border-[var(--color-destructive)]/40 px-3 text-xs font-medium text-[var(--color-destructive)] hover:bg-[var(--color-destructive)]/10"
            >
              Bewohner entfernen
            </button>
          </form>
        </div>
      )}
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
