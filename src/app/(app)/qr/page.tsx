import type { Metadata } from 'next';
import Link from 'next/link';
import { requireTenantContext } from '@/lib/tenant/current';
import { hasPermission } from '@/lib/permissions/effective';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { unwrapRows } from '@/lib/supabase/unwrap';
import { isModuleAvailable } from '@/lib/modules/enabled';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardBody } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { ModuleLink } from '@/components/ui/module-link';
import type { ModuleKey } from '@/lib/modules/registry';
import type { PermissionKey } from '@/lib/permissions/registry';

export const metadata: Metadata = { title: 'QR-Codes' };

/**
 * SPRINT 134 — DAS MODUL HATTE KEINEN EINSTIEG.
 *
 * `qr_codes` liess sich unter Einstellungen -> Mandant ein- und ausschalten,
 * aber es gab keinen Menuepunkt: die Seiten `/qr/print` und `/qr/[type]/[id]`
 * waren ausschliesslich ueber drei Knoepfe auf FREMDEN Listen erreichbar
 * (Objekte, Schluessel, Zaehler). Wer den Schalter umlegte, sah nirgends eine
 * Veraenderung — und wer QR-Codes suchte, fand sie nur zufaellig.
 *
 * Zwei Folgen davon, beide gemessen:
 *   1. Der Sammelbogen kann seit jeher auch Fahrzeuge (`SUPPORTED_TYPES` in
 *      qr/print/page.tsx), aber auf der Fahrzeugliste stand kein Knopf. Eine
 *      fertige Faehigkeit ohne Einstieg ist keine Faehigkeit.
 *   2. Wer Objekte, Schluessel UND Zaehler abgeschaltet hat, kam an die
 *      QR-Codes ueberhaupt nicht mehr heran, obwohl sein Modul an war.
 *
 * Diese Seite ist der Einstieg und macht die Arbeit gleich mit: pro Art ein
 * direkter Sammeldruck, statt nur ein Link auf die Liste, auf der dann der
 * eigentliche Knopf steht.
 *
 * Jede Karte haengt an ZWEI Bedingungen — Modul des Ziels UND Leserecht
 * darauf. Ohne das Leserecht waere die Anzahl allein schon eine Auskunft
 * ("dieser Mandant hat 43 Schluessel"), die diese Rolle sonst nicht bekommt.
 */

/** Muss zu SUPPORTED_TYPES in qr/print/page.tsx passen. */
const SECTIONS: ReadonlyArray<{
  type: 'property' | 'key' | 'meter' | 'vehicle';
  table: 'properties' | 'keys' | 'meters' | 'vehicles';
  module: ModuleKey;
  permission: PermissionKey;
  listHref: string;
  titleDe: string;
  hintDe: string;
}> = [
  {
    type: 'property',
    table: 'properties',
    module: 'properties',
    permission: 'properties.view',
    listHref: '/properties',
    titleDe: 'Objekte',
    hintDe: 'Am Hauseingang oder im Technikraum — der Scan öffnet die Liegenschaft mit Zugangs- und Notfallhinweisen.',
  },
  {
    type: 'key',
    table: 'keys',
    module: 'keys',
    permission: 'keys.view',
    listHref: '/keys',
    titleDe: 'Schlüssel',
    hintDe: 'Am Schlüsselanhänger — der Scan zeigt, wer ihn zuletzt bekommen hat.',
  },
  {
    type: 'meter',
    table: 'meters',
    module: 'meters',
    permission: 'meters.view',
    listHref: '/meters',
    titleDe: 'Zähler',
    hintDe: 'Direkt am Zähler — der Scan führt zur Ablesung, ohne die Nummer abtippen zu müssen.',
  },
  {
    type: 'vehicle',
    table: 'vehicles',
    module: 'vehicles',
    permission: 'vehicles.view',
    listHref: '/vehicles',
    titleDe: 'Fahrzeuge',
    hintDe: 'Im Fahrzeug — der Scan öffnet Fristen und Ereignisse.',
  },
];

/** Muss zu MAX_IDS in qr/print/page.tsx passen. */
const MAX_IDS = 60;

export default async function QrOverviewPage() {
  const ctx = await requireTenantContext();
  const supabase = await createSupabaseServerClient();

  const sections = await Promise.all(
    SECTIONS.map(async (section) => {
      // `isModuleAvailable`, nicht der rohe Schalterzustand: sonst steht hier
      // ein Knopf, der ins 404 fuehrt, sobald der Tarif das Zielmodul sperrt.
      const [moduleOn, allowed] = await Promise.all([
        isModuleAvailable(ctx.tenantId, section.module),
        hasPermission(ctx.userId, ctx.tenantId, section.permission),
      ]);
      if (!moduleOn || !allowed) return null;

      // Nur die IDs, und nur so viele, wie ein Bogen fasst. Die Reihenfolge
      // entspricht der jeweiligen Liste, damit der Ausdruck vorhersagbar ist.
      const rows = unwrapRows(
        await supabase
          .from(section.table)
          .select('id')
          .is('deleted_at', null)
          .order('created_at', { ascending: false })
          .limit(MAX_IDS),
        `QR-Übersicht: ${section.titleDe}`,
      );

      return { ...section, ids: rows.map((r) => r.id) };
    }),
  );

  const visible = sections.filter((s): s is NonNullable<typeof s> => s !== null);

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <PageHeader
        title="QR-Codes"
        description="Aufkleber für Objekte, Schlüssel, Zähler und Fahrzeuge. Ein Scan öffnet den passenden Datensatz in dieser Anwendung — Anmeldung vorausgesetzt."
      />

      {visible.length === 0 ? (
        <EmptyState
          title="Nichts zum Beschriften"
          description="QR-Codes gibt es für Objekte, Schlüssel, Zähler und Fahrzeuge. Von diesen Modulen ist derzeit keines eingeschaltet oder für Sie freigegeben."
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {visible.map((section) => (
            <Card key={section.type}>
              <CardBody className="flex flex-col gap-3">
                <div>
                  <h2 className="font-medium">{section.titleDe}</h2>
                  <p className="mt-1 text-sm text-[var(--color-muted-foreground)]">
                    {section.hintDe}
                  </p>
                </div>

                {section.ids.length === 0 ? (
                  <p className="text-sm text-[var(--color-muted-foreground)]">
                    Noch keine Einträge —{' '}
                    {/*
                      ModuleLink statt Link, obwohl die Karte ohnehin nur bei
                      verfuegbarem Zielmodul gerendert wird: der Sprint-121-
                      Scanner sieht `section.listHref` erst zur Laufzeit und
                      kann diese Zusage nicht nachlesen. Eine Ausnahme mit
                      Begruendung waere hier teurer als der Aufruf — beide
                      lesen dieselbe gecachte Menge.
                    */}
                    <ModuleLink
                      href={section.listHref}
                      className="text-[var(--color-primary)] hover:underline"
                    >
                      zuerst anlegen
                    </ModuleLink>
                    .
                  </p>
                ) : (
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      href={`/qr/print?type=${section.type}&ids=${section.ids.join(',')}`}
                      target="_blank"
                      className="inline-flex h-9 items-center rounded-md bg-[var(--color-primary)] px-3 text-sm font-medium text-[var(--color-primary-foreground)] hover:opacity-90"
                    >
                      Bogen drucken ({section.ids.length})
                    </Link>
                    <ModuleLink
                      href={section.listHref}
                      className="inline-flex h-9 items-center rounded-md border border-[var(--color-border)] px-3 text-sm font-medium hover:bg-[var(--color-muted)]"
                    >
                      Einzeln auswählen
                    </ModuleLink>
                  </div>
                )}
              </CardBody>
            </Card>
          ))}
        </div>
      )}

      <Card>
        <CardBody className="flex flex-col gap-2 text-sm text-[var(--color-muted-foreground)]">
          <p className="font-medium text-[var(--color-foreground)]">Zum Drucken</p>
          <p>
            Der Bogen ist auf A4 mit 15 Aufklebern je Seite ausgelegt. Im
            Druckdialog „Skalierung: keine" wählen, sonst verrutscht das Raster.
            Ein Bogen fasst maximal {MAX_IDS} Einträge; für mehr auf der jeweiligen
            Liste in Abschnitten auswählen.
          </p>
          <p>
            Ein gescannter Code führt niemanden an der Anmeldung vorbei. Wer den
            Aufkleber abfotografiert, ohne Zugang zu dieser Anwendung zu haben,
            landet auf der Login-Seite.
          </p>
        </CardBody>
      </Card>
    </div>
  );
}
