import 'server-only';
import { cache } from 'react';
import * as Sentry from '@sentry/nextjs';
import { createSupabaseServiceClient } from '@/lib/supabase/service';
import { isValidReportToken } from './token';

export interface ReportLinkContext {
  linkId: string;
  tenantId: string;
  tenantName: string;
  propertyId: string;
  propertyName: string;
  propertyAddress: string | null;
  buildingId: string | null;
  buildingName: string | null;
  linkLabel: string | null;
}

/**
 * Warum drei Ausgaenge und nicht `ReportLinkContext | null`:
 *
 * "Unbekannt" und "gerade nicht erreichbar" sehen fuer den Melder gleich
 * aus, sind aber gegensaetzliche Auskuenfte. Wer vor einem geplatzten Rohr
 * steht und liest "dieser QR-Code ist ungueltig", geht weg und meldet nicht.
 * Wer liest "gerade nicht erreichbar", versucht es nochmal oder ruft an.
 * Ein verschluckter Query-Fehler wuerde aus dem zweiten Fall lautlos den
 * ersten machen — genau der Fehlertyp, den Sprint 104 aus der Guard-Schicht
 * entfernt hat.
 */
export type ReportLinkResolution =
  | { ok: true; context: ReportLinkContext }
  | { ok: false; reason: 'unknown' }
  | { ok: false; reason: 'unavailable' };

interface JoinedRow {
  id: string;
  tenant_id: string;
  property_id: string;
  building_id: string | null;
  label: string | null;
  properties: {
    name: string;
    deleted_at: string | null;
    street: string | null;
    house_number: string | null;
    postal_code: string | null;
    city: string | null;
  } | null;
  buildings: { name: string } | null;
  tenants: { name: string; status: string } | null;
}

function formatAddress(p: JoinedRow['properties']): string | null {
  if (!p) return null;
  const line1 = [p.street, p.house_number].filter(Boolean).join(' ');
  const line2 = [p.postal_code, p.city].filter(Boolean).join(' ');
  const joined = [line1, line2].filter((s) => s.length > 0).join(', ');
  return joined.length > 0 ? joined : null;
}

/**
 * Sprint 124 · Loest den Token eines oeffentlichen Melde-Links auf.
 *
 * Laeuft ueber den Service-Client, weil der Aufrufer per Definition keine
 * Session hat: `property_report_links` hat bewusst KEINE anon-Policy, sonst
 * koennte jeder die Tokenliste aller Mandanten abziehen. Der Service-Client
 * liest hier ausschliesslich anhand des mitgebrachten Tokens und gibt nur
 * Objektname, Adresse und Firmenname heraus — also genau das, was ohnehin
 * an der Hauswand steht, an der der Aufkleber haengt.
 *
 * Drei Schranken, alle notwendig:
 *   1. Formatpruefung, bevor der Token die Datenbank sieht.
 *   2. `active` — der Widerruf eines abfotografierten Aufklebers.
 *   3. Modul + Mandantenstatus — ein Betrieb, der Maengelmeldungen
 *      abgeschaltet hat oder selbst stillgelegt ist, nimmt auch ueber QR
 *      nichts entgegen. Ohne diese Pruefung waere der oeffentliche Pfad die
 *      einzige Stelle im Produkt, die das Modul-Gate umgeht.
 *   4. `properties.deleted_at` — Objekte werden in diesem Produkt weich
 *      geloescht (properties/actions.ts setzt deleted_at, statt die Zeile zu
 *      entfernen). Der FK-Cascade auf property_report_links greift also nie.
 *      Ohne diese Pruefung wuerde ein geloeschtes Objekt weiter Meldungen
 *      annehmen — und zwar unwiderruflich, weil mit dem Objekt auch die
 *      Melde-Links-Seite verschwindet, ueber die man den Aufkleber
 *      abschalten koennte. Der Aufkleber im Treppenhaus wuerde den Loeschbutton
 *      ueberleben.
 */
export const resolveReportLink = cache(
  async (token: string): Promise<ReportLinkResolution> => {
    if (!isValidReportToken(token)) return { ok: false, reason: 'unknown' };

    const service = createSupabaseServiceClient();

    const { data, error } = await service
      .from('property_report_links')
      .select(
        'id, tenant_id, property_id, building_id, label, ' +
          'properties(name, deleted_at, street, house_number, postal_code, city), ' +
          'buildings(name), tenants(name, status)',
      )
      .eq('token', token)
      .eq('active', true)
      .maybeSingle<JoinedRow>();

    if (error) {
      Sentry.captureException(
        new Error(`Melde-Link konnte nicht aufgeloest werden: ${error.message}`),
        { extra: { code: error.code, hint: error.hint } },
      );
      return { ok: false, reason: 'unavailable' };
    }

    if (!data) return { ok: false, reason: 'unknown' };

    // Ein stillgelegter Mandant ist kein Fehler, aber auch kein Empfaenger.
    if (data.tenants?.status !== 'active') return { ok: false, reason: 'unknown' };

    // Fehlt das Objekt im Join, obwohl der FK es garantiert, ist etwas kaputt.
    // Dann ist "gerade nicht erreichbar" die ehrliche Auskunft — nicht der
    // Objektname 'Objekt' und ein Formular, das ins Blaue schreibt.
    if (!data.properties) {
      Sentry.captureException(
        new Error('Melde-Link: Objekt zum Link nicht lesbar'),
        { extra: { linkId: data.id, propertyId: data.property_id } },
      );
      return { ok: false, reason: 'unavailable' };
    }

    // Weich geloeschtes Objekt: der Aufkleber haengt an einer Wand, die den
    // Mandanten nichts mehr angeht.
    if (data.properties.deleted_at) return { ok: false, reason: 'unknown' };

    const modules = await service
      .from('tenant_modules')
      .select('enabled')
      .eq('tenant_id', data.tenant_id)
      .eq('module_key', 'defect_reports')
      .maybeSingle();

    if (modules.error) {
      Sentry.captureException(
        new Error(
          `Melde-Link: Modulstatus nicht lesbar: ${modules.error.message}`,
        ),
        { extra: { tenantId: data.tenant_id, code: modules.error.code } },
      );
      return { ok: false, reason: 'unavailable' };
    }

    // Fehlende Zeile ist ein AUS (siehe getEnabledModules) — die gleiche
    // Regel wie ueberall sonst, damit der oeffentliche Pfad nicht mehr
    // erlaubt als die App selbst.
    if (!modules.data?.enabled) return { ok: false, reason: 'unknown' };

    return {
      ok: true,
      context: {
        linkId: data.id,
        tenantId: data.tenant_id,
        tenantName: data.tenants?.name ?? 'Ihre Hausverwaltung',
        propertyId: data.property_id,
        propertyName: data.properties.name,
        propertyAddress: formatAddress(data.properties),
        buildingId: data.building_id,
        buildingName: data.buildings?.name ?? null,
        linkLabel: data.label,
      },
    };
  },
);
