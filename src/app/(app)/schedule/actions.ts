'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireTenantContext } from '@/lib/tenant/current';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createNotification } from '@/lib/notifications/create';
import { createEntrySchema, updateEntrySchema } from '@/lib/schemas/scheduling';

function friendlyDbMessage(msg?: string | null): string {
  if (!msg) return 'Speichern fehlgeschlagen.';
  if (msg.includes('row-level security')) return 'Sie haben keine Berechtigung für diese Aktion.';
  if (msg.includes('violates foreign key')) return 'Verweis auf Mitarbeiter ist ungültig.';
  if (msg.includes('schedule_entries_end_after_start')) return 'Ende muss nach dem Start liegen.';
  return 'Speichern fehlgeschlagen. Bitte erneut versuchen.';
}

function parse(schema: typeof createEntrySchema, formData: FormData) {
  const raw: Record<string, unknown> = {};
  for (const [k, v] of formData.entries()) if (typeof v === 'string') raw[k] = v;
  return schema.safeParse(raw);
}

/**
 * Employee → user_id auflösen (nötig, weil user_id in schedule_entries
 * denormalisiert ist für RLS).
 */
async function resolveEmployeeUserId(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  employeeId: string,
): Promise<string> {
  const { data, error } = await supabase
    .from('employees')
    .select('user_id')
    .eq('id', employeeId)
    .maybeSingle();
  if (error || !data) throw new Error('Mitarbeiter nicht gefunden.');
  return data.user_id;
}

export async function createScheduleEntryAction(formData: FormData): Promise<void> {
  const ctx = await requireTenantContext();
  const parsed = parse(createEntrySchema, formData);
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? 'Ungültige Eingabe.');
  }

  const supabase = await createSupabaseServerClient();
  const userId = await resolveEmployeeUserId(supabase, parsed.data.employee_id);

  const { data, error } = await supabase
    .from('schedule_entries')
    .insert({
      tenant_id: ctx.tenantId,
      employee_id: parsed.data.employee_id,
      user_id: userId,
      kind: parsed.data.kind,
      title: parsed.data.title,
      note: parsed.data.note,
      start_at: parsed.data.start_at,
      end_at: parsed.data.end_at,
      all_day: parsed.data.all_day,
      created_by: ctx.userId,
      updated_by: ctx.userId,
    })
    .select('id')
    .single();

  if (error || !data) throw new Error(friendlyDbMessage(error?.message));

  if (userId !== ctx.userId) {
    await createNotification({
      userId,
      kind: 'mention',
      subject: `Neuer Termin: ${parsed.data.title}`,
      body: `${new Date(parsed.data.start_at).toLocaleString('de-DE')} – ${new Date(parsed.data.end_at).toLocaleString('de-DE')}`,
      entityType: null,
      entityId: null,
      url: '/schedule',
    });
  }

  revalidatePath('/schedule');
  redirect('/schedule');
}

export async function updateScheduleEntryAction(formData: FormData): Promise<void> {
  await requireTenantContext();
  const entryId = String(formData.get('entry_id') ?? '');
  if (!entryId) throw new Error('Termin fehlt.');

  const parsed = parse(updateEntrySchema, formData);
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? 'Ungültige Eingabe.');
  }

  const supabase = await createSupabaseServerClient();
  const userId = await resolveEmployeeUserId(supabase, parsed.data.employee_id);

  const ctx = await requireTenantContext();
  const { error } = await supabase
    .from('schedule_entries')
    .update({
      employee_id: parsed.data.employee_id,
      user_id: userId,
      kind: parsed.data.kind,
      title: parsed.data.title,
      note: parsed.data.note,
      start_at: parsed.data.start_at,
      end_at: parsed.data.end_at,
      all_day: parsed.data.all_day,
      updated_by: ctx.userId,
    })
    .eq('id', entryId);

  if (error) throw new Error(friendlyDbMessage(error.message));

  revalidatePath('/schedule');
  redirect('/schedule');
}

export async function deleteScheduleEntryAction(formData: FormData): Promise<void> {
  await requireTenantContext();
  const entryId = String(formData.get('entry_id') ?? '');
  if (!entryId) throw new Error('Termin fehlt.');

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from('schedule_entries').delete().eq('id', entryId);
  if (error) throw new Error(friendlyDbMessage(error.message));

  revalidatePath('/schedule');
  redirect('/schedule');
}
