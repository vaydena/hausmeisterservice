import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { requireTenantContext } from '@/lib/tenant/current';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { unwrapMaybeRow, unwrapRows } from '@/lib/supabase/unwrap';
import { getEffectivePermissions } from '@/lib/permissions/effective';
import { isModuleAvailable } from '@/lib/modules/enabled';
import { generateQrSvg } from '@/lib/qr/generate';
import { clientEnv } from '@/lib/env';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatDateTime } from '@/lib/utils/format';
import { CreateReportLinkForm } from './create-form';
import { PrintButton } from './print-button';
import { RevokeReportLinkButton } from './revoke-button';

export const metadata: Metadata = { title: 'Melde-Links' };

export default async function ReportLinksPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await requireTenantContext();
  const supabase = await createSupabaseServerClient();
  const permissions = await getEffectivePermissions(ctx.userId, ctx.tenantId);

  const property = unwrapMaybeRow(
    await supabase
      .from('properties')
      .select('id, name, code')
      .eq('id', id)
      .is('deleted_at', null)
      .maybeSingle(),
    'Melde-Links: Objekt',
  );
  if (!property) notFound();

  // Ein Melde-Link erzeugt Maengelmeldungen. Ist das Modul aus, fuehrt der
  // Aufkleber ins Leere — dann darf hier auch keiner entstehen.
  const defectsAvailable = await isModuleAvailable(ctx.tenantId, 'defect_reports');

  const [buildings, links] = await Promise.all([
    supabase
      .from('buildings')
      .select('id, name')
      .eq('property_id', id)
      .order('name')
      .then((res) => unwrapRows(res, 'Melde-Links: Gebaeude')),
    supabase
      .from('property_report_links')
      .select('id, token, label, active, building_id, created_at, revoked_at')
      .eq('property_id', id)
      .order('active', { ascending: false })
      .order('created_at', { ascending: false })
      .then((res) => unwrapRows(res, 'Melde-Links: Links')),
  ]);

  const canEdit = permissions.has('properties.edit');
  const canSeeReports = permissions.has('defect_reports.view');

  // Zaehler pro Link. Nur wenn der Betrachter Meldungen ueberhaupt sehen darf
  // — sonst liefert RLS null Zeilen und die Seite behauptete "0 Meldungen",
  // wo in Wahrheit "darf ich nicht wissen" steht.
  const reportCounts = new Map<string, number>();
  if (canSeeReports) {
    const rows = unwrapRows(
      await supabase
        .from('defect_reports')
        .select('report_link_id')
        .eq('property_id', id)
        .not('report_link_id', 'is', null),
      'Melde-Links: Meldungen je Link',
    );
    for (const row of rows) {
      if (!row.report_link_id) continue;
      reportCounts.set(row.report_link_id, (reportCounts.get(row.report_link_id) ?? 0) + 1);
    }
  }

  const buildingNames = new Map(buildings.map((b) => [b.id, b.name]));
  const baseUrl = clientEnv.NEXT_PUBLIC_APP_URL.replace(/\/$/, '');

  const cards = await Promise.all(
    links.map(async (link) => ({
      ...link,
      url: `${baseUrl}/melden/${link.token}`,
      svg: link.active ? await generateQrSvg(`${baseUrl}/melden/${link.token}`) : null,
    })),
  );

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <div className="print:hidden">
        <PageHeader
          title="Melde-Links"
          description={`${property.name}${property.code ? ` · ${property.code}` : ''}`}
          action={
            <Link
              href={`/properties/${property.id}`}
              className="text-sm text-[var(--color-muted-foreground)] hover:underline"
            >
              ← zurück zum Objekt
            </Link>
          }
        />
      </div>

      <Card className="print:hidden">
        <CardBody>
          <p className="text-sm text-[var(--color-muted-foreground)]">
            Ein Melde-Link ist ein QR-Code zum Aushängen. Wer ihn scannt, kann
            einen Mangel an diesem Objekt melden — ohne Konto und ohne Passwort.
            Die Meldung landet direkt in Ihrer Liste offener Mängelmeldungen.
          </p>
          <p className="mt-3 text-sm text-[var(--color-muted-foreground)]">
            Gedacht vor allem für Eigentümer, Vermieter und Hausverwaltungen, die
            kein Bewohnerkonto haben. Ein Aushang im Treppenhaus ist öffentlich —
            wenn ein Code missbraucht wird, schalten Sie ihn hier ab und hängen
            einen neuen aus.
          </p>
        </CardBody>
      </Card>

      {!defectsAvailable && (
        <div
          role="alert"
          className="rounded-xl border border-[var(--color-destructive)]/40 bg-[color-mix(in_srgb,var(--color-destructive)_10%,transparent)] p-4 text-sm print:hidden"
        >
          <p className="font-medium">Das Modul „Mängelmeldungen" ist abgeschaltet.</p>
          <p className="mt-1">
            Vorhandene Melde-Links nehmen deshalb nichts entgegen, und neue lassen
            sich nicht anlegen. Sie können das Modul unter Einstellungen → Mandant
            wieder einschalten.
          </p>
        </div>
      )}

      {canEdit && defectsAvailable && (
        <Card className="print:hidden">
          <CardHeader>
            <CardTitle>Neuen Melde-Link anlegen</CardTitle>
          </CardHeader>
          <CardBody>
            <CreateReportLinkForm propertyId={property.id} buildings={buildings} />
          </CardBody>
        </Card>
      )}

      {cards.length === 0 ? (
        <Card>
          <CardBody>
            <p className="text-sm text-[var(--color-muted-foreground)]">
              Für dieses Objekt gibt es noch keinen Melde-Link.
            </p>
          </CardBody>
        </Card>
      ) : (
        <div className="flex flex-col gap-4">
          {cards.map((link) => (
            <Card key={link.id}>
              <CardBody>
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                  {link.svg ? (
                    <div
                      className="mx-auto size-40 shrink-0 rounded-lg bg-white p-2 sm:mx-0"
                      // Der SVG kommt aus generateQrSvg() ueber eine URL, die
                      // hier selbst gebaut wird — kein Fremdinhalt.
                      dangerouslySetInnerHTML={{ __html: link.svg }}
                    />
                  ) : (
                    <div className="mx-auto flex size-40 shrink-0 items-center justify-center rounded-lg border border-dashed border-[var(--color-border)] text-center text-xs text-[var(--color-muted-foreground)] sm:mx-0">
                      abgeschaltet
                    </div>
                  )}

                  <div className="flex min-w-0 flex-1 flex-col gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">
                        {link.label ?? 'Melde-Link'}
                      </span>
                      {link.building_id && buildingNames.has(link.building_id) && (
                        <Badge tone="muted">{buildingNames.get(link.building_id)}</Badge>
                      )}
                      {link.active ? (
                        <Badge tone="success">aktiv</Badge>
                      ) : (
                        <Badge tone="muted">abgeschaltet</Badge>
                      )}
                    </div>

                    <p className="break-all font-mono text-xs text-[var(--color-muted-foreground)]">
                      {link.url}
                    </p>

                    <dl className="grid grid-cols-1 gap-1 text-xs text-[var(--color-muted-foreground)] sm:grid-cols-2">
                      <div>
                        <dt className="inline">Angelegt: </dt>
                        <dd className="inline">{formatDateTime(link.created_at)}</dd>
                      </div>
                      {link.revoked_at && (
                        <div>
                          <dt className="inline">Abgeschaltet: </dt>
                          <dd className="inline">{formatDateTime(link.revoked_at)}</dd>
                        </div>
                      )}
                      {canSeeReports && (
                        <div>
                          <dt className="inline">Meldungen darüber: </dt>
                          <dd className="inline">{reportCounts.get(link.id) ?? 0}</dd>
                        </div>
                      )}
                    </dl>

                    {link.active && (
                      <div className="mt-2 flex flex-wrap gap-2 print:hidden">
                        <PrintButton />
                        {canEdit && (
                          <RevokeReportLinkButton
                            propertyId={property.id}
                            linkId={link.id}
                          />
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </CardBody>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
