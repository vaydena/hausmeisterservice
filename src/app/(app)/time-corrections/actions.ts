'use server';

import { revalidatePath } from 'next/cache';
import { requireTenantContext } from '@/lib/tenant/current';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { Database } from '@/types/database';
import {
  createCorrectionSchema,
  decideCorrectionSchema,
  withdrawCorrectionSchema,
} from '@/lib/schemas/time-corrections';
import { createNotification, createNotifications } from '@/lib/notifications/create';
import { listUsersWithPermission } from '@/lib/notifications/recipients';

type TimeEntryUpdate = Database['public']['Tables']['time_entries']['Update'];

function friendlyDbMessage(msg?: string | null): string {
  if (!msg) return 'Speichern fehlgeschlagen.';
  if (msg.includes('row-level security')) return 'Sie haben keine Berechtigung für diese Aktion.';
  if (msg.includes('time_corr_end_after_start'))
    return 'Ende muss nach dem Start liegen.';
  if (msg.includes('time_corr_at_least_one_change'))
    return 'Bitte mindestens ein Feld ändern.';
  if (msg.includes('time_corr_decision_shape'))
    return 'Der Antrag ist im falschen Zustand für diese Aktion.';
  if (msg.includes('reason_check') || msg.includes('length(reason)'))
    return 'Begründung fehlt oder ist zu kurz.';
  return 'Speichern fehlgeschlagen. Bitte erneut versuchen.';
}

/**
 * Beantragt eine Korrektur an einem existierenden Zeiteintrag. Sendet
 * anschließend eine Notification an alle User mit `time_tracking.approve`.
 */
export async function requestCorrectionAction(formData: FormData): Promise<void> {
  const ctx = await requireTenantContext();
  const parsed = createCorrectionSchema.safeParse({
    time_entry_id: formData.get('time_entry_id') ?? '',
    reason: formData.get('reason') ?? '',
    proposed_kind: formData.get('proposed_kind') ?? undefined,
    proposed_start_at: formData.get('proposed_start_at') ?? undefined,
    proposed_end_at: formData.get('proposed_end_at') ?? undefined,
    proposed_work_order_id: formData.get('proposed_work_order_id') ?? undefined,
    proposed_property_id: formData.get('proposed_property_id') ?? undefined,
    proposed_note: formData.get('proposed_note') ?? undefined,
    clear_work_order: formData.get('clear_work_order') ?? undefined,
    clear_property: formData.get('clear_property') ?? undefined,
    clear_note: formData.get('clear_note') ?? undefined,
  });
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? 'Ungültige Eingabe.');
  }

  const supabase = await createSupabaseServerClient();

  const { data: entry, error: entryErr } = await supabase
    .from('time_entries')
    .select('id, user_id, tenant_id, start_at, end_at, kind')
    .eq('id', parsed.data.time_entry_id)
    .maybeSingle();
  if (entryErr) throw new Error(friendlyDbMessage(entryErr.message));
  if (!entry) throw new Error('Zeiteintrag nicht gefunden.');

  const { data: created, error } = await supabase
    .from('time_entry_corrections')
    .insert({
      tenant_id: ctx.tenantId,
      time_entry_id: entry.id,
      entry_user_id: entry.user_id,
      requested_by: ctx.userId,
      reason: parsed.data.reason,
      status: 'pending',
      proposed_kind: parsed.data.proposed_kind,
      proposed_start_at: parsed.data.proposed_start_at,
      proposed_end_at: parsed.data.proposed_end_at,
      proposed_work_order_id: parsed.data.proposed_work_order_id,
      proposed_property_id: parsed.data.proposed_property_id,
      proposed_note: parsed.data.proposed_note,
    })
    .select('id')
    .maybeSingle();

  if (error) throw new Error(friendlyDbMessage(error.message));
  if (!created) throw new Error('Antrag konnte nicht angelegt werden.');

  const approverIds = await listUsersWithPermission(ctx.tenantId, 'time_tracking.approve');
  await createNotifications(
    approverIds.filter((u) => u !== ctx.userId),
    {
      kind: 'time_entry_needs_review',
      subject: 'Neuer Korrekturantrag',
      body: parsed.data.reason.slice(0, 200),
      entityType: 'time_entry',
      entityId: entry.id,
      url: `/time-corrections/${created.id}`,
    },
  );

  revalidatePath('/time-tracking');
  revalidatePath(`/time-tracking/${entry.id}/edit`);
  revalidatePath('/time-corrections');
}

/**
 * Approve/Reject in einer Action. Bei approved wird der Ziel-Eintrag geupdated
 * (die Approver-Session hat die update_others-Policy) und der Requester bekommt
 * eine Notification.
 */
export async function decideCorrectionAction(formData: FormData): Promise<void> {
  const ctx = await requireTenantContext();
  const parsed = decideCorrectionSchema.safeParse({
    correction_id: formData.get('correction_id') ?? '',
    status: formData.get('status') ?? '',
    decision_note: formData.get('decision_note') ?? undefined,
  });
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? 'Ungültige Eingabe.');
  }

  const supabase = await createSupabaseServerClient();

  const { data: corr, error: fetchErr } = await supabase
    .from('time_entry_corrections')
    .select(
      'id, tenant_id, time_entry_id, entry_user_id, requested_by, status, proposed_kind, proposed_start_at, proposed_end_at, proposed_work_order_id, proposed_property_id, proposed_note',
    )
    .eq('id', parsed.data.correction_id)
    .maybeSingle();
  if (fetchErr) throw new Error(friendlyDbMessage(fetchErr.message));
  if (!corr) throw new Error('Antrag nicht gefunden.');
  if (corr.status !== 'pending') {
    throw new Error('Antrag ist bereits entschieden.');
  }
  if (corr.requested_by === ctx.userId) {
    throw new Error('Eigene Anträge können nicht selbst entschieden werden.');
  }

  const nowIso = new Date().toISOString();

  const { error: updateCorrErr } = await supabase
    .from('time_entry_corrections')
    .update({
      status: parsed.data.status,
      decided_by: ctx.userId,
      decided_at: nowIso,
      decision_note: parsed.data.decision_note,
    })
    .eq('id', corr.id);
  if (updateCorrErr) throw new Error(friendlyDbMessage(updateCorrErr.message));

  if (parsed.data.status === 'approved') {
    const patch: TimeEntryUpdate = { updated_by: ctx.userId, source: 'correction' };
    if (corr.proposed_kind !== null) patch.kind = corr.proposed_kind;
    if (corr.proposed_start_at !== null) patch.start_at = corr.proposed_start_at;
    if (corr.proposed_end_at !== null) patch.end_at = corr.proposed_end_at;
    if (corr.proposed_work_order_id !== null) patch.work_order_id = corr.proposed_work_order_id;
    if (corr.proposed_property_id !== null) patch.property_id = corr.proposed_property_id;
    if (corr.proposed_note !== null) patch.note = corr.proposed_note;

    const { error: applyErr } = await supabase
      .from('time_entries')
      .update(patch)
      .eq('id', corr.time_entry_id);
    if (applyErr) {
      // Rollback des Antrags, damit UI nicht in inkonsistentem Zustand landet.
      await supabase
        .from('time_entry_corrections')
        .update({ status: 'pending', decided_by: null, decided_at: null, decision_note: null })
        .eq('id', corr.id);
      throw new Error(friendlyDbMessage(applyErr.message));
    }
  }

  await createNotification({
    userId: corr.requested_by,
    kind: 'time_entry_needs_review',
    subject:
      parsed.data.status === 'approved'
        ? 'Korrekturantrag genehmigt'
        : 'Korrekturantrag abgelehnt',
    body: parsed.data.decision_note ?? undefined,
    entityType: 'time_entry',
    entityId: corr.time_entry_id,
    url: `/time-corrections/${corr.id}`,
  });

  revalidatePath('/time-corrections');
  revalidatePath(`/time-corrections/${corr.id}`);
  revalidatePath('/time-tracking');
  revalidatePath(`/time-tracking/${corr.time_entry_id}/edit`);
}

/**
 * Requester zieht seinen eigenen offenen Antrag zurück. Keine Notifications.
 */
export async function withdrawCorrectionAction(formData: FormData): Promise<void> {
  const ctx = await requireTenantContext();
  const parsed = withdrawCorrectionSchema.safeParse({
    correction_id: formData.get('correction_id') ?? '',
  });
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? 'Ungültige Eingabe.');
  }

  const supabase = await createSupabaseServerClient();

  const { data: corr, error: fetchErr } = await supabase
    .from('time_entry_corrections')
    .select('id, requested_by, status')
    .eq('id', parsed.data.correction_id)
    .maybeSingle();
  if (fetchErr) throw new Error(friendlyDbMessage(fetchErr.message));
  if (!corr) throw new Error('Antrag nicht gefunden.');
  if (corr.requested_by !== ctx.userId) {
    throw new Error('Nur der Antragsteller kann zurückziehen.');
  }
  if (corr.status !== 'pending') {
    throw new Error('Nur offene Anträge können zurückgezogen werden.');
  }

  const { error } = await supabase
    .from('time_entry_corrections')
    .update({
      status: 'withdrawn',
      decided_at: new Date().toISOString(),
    })
    .eq('id', corr.id);
  if (error) throw new Error(friendlyDbMessage(error.message));

  revalidatePath('/time-corrections');
  revalidatePath(`/time-corrections/${corr.id}`);
  revalidatePath('/time-tracking');
}
