'use server';

import { revalidatePath } from 'next/cache';
import { requireTenantContext } from '@/lib/tenant/current';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { unwrapMaybeRow } from '@/lib/supabase/unwrap';
import {
  manualEntrySchema,
  punchInSchema,
  updateEntrySchema,
} from '@/lib/schemas/time-tracking';

function friendlyDbMessage(msg?: string | null): string {
  if (!msg) return 'Speichern fehlgeschlagen.';
  if (msg.includes('row-level security')) return 'Sie haben keine Berechtigung für diese Aktion.';
  if (msg.includes('time_entries_one_open_per_user_idx'))
    return 'Es läuft bereits eine offene Zeit. Bitte zuerst beenden.';
  if (msg.includes('time_entries_end_after_start'))
    return 'Ende muss nach dem Start liegen.';
  if (msg.includes('violates foreign key'))
    return 'Verweis auf Objekt oder Auftrag ist ungültig.';
  return 'Speichern fehlgeschlagen. Bitte erneut versuchen.';
}

/**
 * Ermittelt die employee_id zum aktuellen User. Der User muss einen aktiven
 * Employee-Datensatz haben — ohne den geht kein Stempeln.
 *
 * Sprint 108: Vorher stand hier `const { data }` ohne `error`. Eine gescheiterte
 * Query war damit nicht von "es gibt keinen Datensatz" zu unterscheiden, und
 * der Mitarbeiter bekam bei einer Stoerung die Auskunft, sein Personalstammsatz
 * fehle oder sei inaktiv — eine Aussage ueber sein Arbeitsverhaeltnis, die ihn
 * zum Chef schickt statt zum Support. In Sentry landete derselbe Satz und sah
 * dort aus wie eine ganz normale Fehlbedienung.
 */
async function resolveOwnEmployeeId(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  userId: string,
): Promise<string> {
  const result = await supabase
    .from('employees')
    .select('id')
    .eq('user_id', userId)
    .eq('employment_status', 'active')
    .maybeSingle();
  const data = unwrapMaybeRow(result, 'Zeiterfassung: eigener Mitarbeiter-Datensatz');
  if (!data) {
    throw new Error('Kein aktiver Mitarbeiter-Datensatz für Ihren Account.');
  }
  return data.id;
}

export async function punchInAction(formData: FormData): Promise<void> {
  const ctx = await requireTenantContext();
  const parsed = punchInSchema.safeParse({
    kind: formData.get('kind') ?? 'work',
    work_order_id: formData.get('work_order_id') ?? undefined,
    property_id: formData.get('property_id') ?? undefined,
    note: formData.get('note') ?? undefined,
  });
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? 'Ungültige Eingabe.');
  }

  const supabase = await createSupabaseServerClient();
  const employeeId = await resolveOwnEmployeeId(supabase, ctx.userId);

  const { error } = await supabase.from('time_entries').insert({
    tenant_id: ctx.tenantId,
    employee_id: employeeId,
    user_id: ctx.userId,
    kind: parsed.data.kind,
    start_at: new Date().toISOString(),
    end_at: null,
    work_order_id: parsed.data.work_order_id,
    property_id: parsed.data.property_id,
    note: parsed.data.note,
    source: 'punch',
    created_by: ctx.userId,
    updated_by: ctx.userId,
  });

  if (error) throw new Error(friendlyDbMessage(error.message));
  revalidatePath('/time-tracking');
}

export async function punchOutAction(formData: FormData): Promise<void> {
  const ctx = await requireTenantContext();
  const note = String(formData.get('note') ?? '').trim();

  const supabase = await createSupabaseServerClient();

  // Sprint 108: Die teuerste Stelle des Sprints. Ohne die Fehlerpruefung wurde
  // aus einer gescheiterten Query die Antwort "Es laeuft aktuell keine offene
  // Zeit." — eine Aussage ueber den Zustand des Mitarbeiters, die im selben
  // Moment nachweislich falsch ist: er steht davor, weil die Zeit laeuft. Der
  // Eintrag blieb mit end_at NULL liegen und war ab da in Wochensumme,
  // Zeitbericht und Lohn-Export null Minuten wert (siehe lib/time-tracking/
  // unclosed.ts). Jetzt sind Stoerung und Zustand zwei verschiedene Fehler.
  const openResult = await supabase
    .from('time_entries')
    .select('id, note')
    .eq('user_id', ctx.userId)
    .is('end_at', null)
    .order('start_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  const open = unwrapMaybeRow(openResult, 'Zeiterfassung: laufender Eintrag');

  if (!open) throw new Error('Es läuft aktuell keine offene Zeit.');

  const updateNote = note.length > 0 ? note.slice(0, 1000) : (open.note ?? null);

  const { error } = await supabase
    .from('time_entries')
    .update({
      end_at: new Date().toISOString(),
      note: updateNote,
      updated_by: ctx.userId,
    })
    .eq('id', open.id);

  if (error) throw new Error(friendlyDbMessage(error.message));
  revalidatePath('/time-tracking');
}

export async function createManualEntryAction(formData: FormData): Promise<void> {
  const ctx = await requireTenantContext();
  const parsed = manualEntrySchema.safeParse({
    kind: formData.get('kind') ?? 'work',
    start_at: formData.get('start_at') ?? '',
    end_at: formData.get('end_at') ?? '',
    work_order_id: formData.get('work_order_id') ?? undefined,
    property_id: formData.get('property_id') ?? undefined,
    note: formData.get('note') ?? undefined,
    employee_id: formData.get('employee_id') ?? undefined,
  });
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? 'Ungültige Eingabe.');
  }

  const supabase = await createSupabaseServerClient();

  let employeeId: string;
  let userId: string;
  if (parsed.data.employee_id) {
    const empResult = await supabase
      .from('employees')
      .select('id, user_id')
      .eq('id', parsed.data.employee_id)
      .maybeSingle();
    const emp = unwrapMaybeRow(empResult, 'Zeiterfassung: Mitarbeiter zur Nacherfassung');
    if (!emp) throw new Error('Mitarbeiter nicht gefunden.');
    employeeId = emp.id;
    userId = emp.user_id;
  } else {
    employeeId = await resolveOwnEmployeeId(supabase, ctx.userId);
    userId = ctx.userId;
  }

  const { error } = await supabase.from('time_entries').insert({
    tenant_id: ctx.tenantId,
    employee_id: employeeId,
    user_id: userId,
    kind: parsed.data.kind,
    start_at: parsed.data.start_at,
    end_at: parsed.data.end_at,
    work_order_id: parsed.data.work_order_id,
    property_id: parsed.data.property_id,
    note: parsed.data.note,
    source: 'manual',
    created_by: ctx.userId,
    updated_by: ctx.userId,
  });

  if (error) throw new Error(friendlyDbMessage(error.message));
  revalidatePath('/time-tracking');
}

export async function updateEntryAction(formData: FormData): Promise<void> {
  const ctx = await requireTenantContext();
  const parsed = updateEntrySchema.safeParse({
    entry_id: formData.get('entry_id') ?? '',
    kind: formData.get('kind') ?? 'work',
    start_at: formData.get('start_at') ?? '',
    end_at: formData.get('end_at') ?? undefined,
    work_order_id: formData.get('work_order_id') ?? undefined,
    property_id: formData.get('property_id') ?? undefined,
    note: formData.get('note') ?? undefined,
  });
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? 'Ungültige Eingabe.');
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from('time_entries')
    .update({
      kind: parsed.data.kind,
      start_at: parsed.data.start_at,
      end_at: parsed.data.end_at,
      work_order_id: parsed.data.work_order_id,
      property_id: parsed.data.property_id,
      note: parsed.data.note,
      updated_by: ctx.userId,
    })
    .eq('id', parsed.data.entry_id);

  if (error) throw new Error(friendlyDbMessage(error.message));
  revalidatePath('/time-tracking');
  revalidatePath(`/time-tracking/${parsed.data.entry_id}/edit`);
}

export async function deleteEntryAction(formData: FormData): Promise<void> {
  await requireTenantContext();
  const entryId = String(formData.get('entry_id') ?? '');
  if (!entryId) throw new Error('Eintrag fehlt.');

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from('time_entries').delete().eq('id', entryId);
  if (error) throw new Error(friendlyDbMessage(error.message));
  revalidatePath('/time-tracking');
}
