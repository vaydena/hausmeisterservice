'use server';

import { revalidatePath } from 'next/cache';
import { requireTenantContext } from '@/lib/tenant/current';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { generateReportToken } from '@/lib/report-links/token';
import { createReportLinkSchema, reportLinkIdSchema } from '@/lib/schemas/report-links';

export type ReportLinkFormState = {
  error?: string;
  fieldErrors?: Record<string, string>;
};

function friendly(msg?: string | null): string {
  if (!msg) return 'Speichern fehlgeschlagen.';
  if (msg.includes('row-level security')) {
    return 'Sie dürfen für dieses Objekt keine Melde-Links anlegen.';
  }
  return 'Speichern fehlgeschlagen. Bitte erneut versuchen.';
}

/**
 * Sprint 124 · Legt einen oeffentlich scannbaren Melde-Link an.
 *
 * Kein Service-Client: die RLS-Policy `property_report_links_insert`
 * verlangt `properties.edit` auf genau diesem Objekt und ist damit die
 * Berechtigungspruefung. Wer sie umgehen wollte, muesste den Service-Client
 * benutzen — genau deshalb steht hier keiner.
 *
 * Der Token entsteht im Anwendungscode und nicht als Spalten-Default in der
 * Datenbank: so ist der Generator (inkl. Alphabet und Bias-Vermeidung) ein
 * getesteter Baustein statt eines SQL-Ausdrucks, den niemand prueft.
 */
export async function createReportLinkAction(
  propertyId: string,
  _prev: ReportLinkFormState,
  formData: FormData,
): Promise<ReportLinkFormState> {
  const ctx = await requireTenantContext();

  const parsed = createReportLinkSchema.safeParse({
    label: formData.get('label') ?? undefined,
    building_id: formData.get('building_id') ?? undefined,
  });
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path.join('.');
      if (key && !fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { fieldErrors, error: 'Bitte prüfen Sie die Eingaben.' };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from('property_report_links').insert({
    tenant_id: ctx.tenantId,
    property_id: propertyId,
    building_id: parsed.data.building_id,
    label: parsed.data.label,
    token: generateReportToken(),
    created_by: ctx.userId,
    updated_by: ctx.userId,
  });

  if (error) {
    return { error: friendly(error.message) };
  }

  revalidatePath(`/properties/${propertyId}/melde-links`);
  return {};
}

/**
 * Schaltet einen Aufkleber ab. Kein DELETE — die Zeile traegt die Herkunft
 * jeder ueber sie eingegangenen Meldung (`defect_reports.report_link_id`).
 * Wer sie loeschen wuerde, naehme rueckwirkend die Antwort auf die Frage
 * mit, woher eine Meldung kam.
 */
export async function revokeReportLinkAction(
  propertyId: string,
  formData: FormData,
): Promise<void> {
  const ctx = await requireTenantContext();
  const parsed = reportLinkIdSchema.safeParse({ id: formData.get('id') });
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? 'Ungültige Melde-Link-ID.');
  }

  const supabase = await createSupabaseServerClient();
  const { error, count } = await supabase
    .from('property_report_links')
    .update(
      {
        active: false,
        revoked_at: new Date().toISOString(),
        revoked_by: ctx.userId,
        updated_by: ctx.userId,
      },
      { count: 'exact' },
    )
    .eq('id', parsed.data.id)
    .eq('property_id', propertyId)
    .eq('active', true);

  if (error) {
    throw new Error('Abschalten fehlgeschlagen. Bitte erneut versuchen.');
  }
  if (!count) {
    throw new Error('Dieser Melde-Link ist bereits abgeschaltet.');
  }

  revalidatePath(`/properties/${propertyId}/melde-links`);
}
