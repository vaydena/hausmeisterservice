'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { requireTenantContext } from '@/lib/tenant/current';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import {
  markReadSchema,
  participantMutationSchema,
  postMessageSchema,
  threadCreateSchema,
} from '@/lib/schemas/messaging';

export type MessagingFormState = {
  error?: string;
  fieldErrors?: Record<string, string>;
};

function fieldErrorsFromZod(err: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of err.issues) {
    const key = issue.path.join('.');
    if (key && !out[key]) out[key] = issue.message;
  }
  return out;
}

function friendlyDbMessage(msg?: string | null): string {
  if (!msg) return 'Speichern fehlgeschlagen.';
  if (msg.includes('row-level security')) return 'Sie haben keine Berechtigung für diese Aktion.';
  if (msg.includes('violates foreign key')) return 'Verweis ist ungültig.';
  if (msg.includes('message_thread_participants_thread_id_user_id_key'))
    return 'Empfänger ist bereits Teilnehmer.';
  return 'Speichern fehlgeschlagen. Bitte erneut versuchen.';
}

export async function createThreadAction(
  _prev: MessagingFormState,
  formData: FormData,
): Promise<MessagingFormState> {
  const ctx = await requireTenantContext();

  const participantIds = formData
    .getAll('participant_ids')
    .filter((v): v is string => typeof v === 'string' && v.length > 0);

  const parsed = threadCreateSchema.safeParse({
    subject: formData.get('subject') ?? '',
    body: formData.get('body') ?? '',
    participant_ids: participantIds,
    context_type: formData.get('context_type') ?? undefined,
    context_id: formData.get('context_id') ?? undefined,
  });
  if (!parsed.success) {
    return {
      fieldErrors: fieldErrorsFromZod(parsed.error),
      error: 'Bitte prüfen Sie die Eingaben.',
    };
  }

  const supabase = await createSupabaseServerClient();

  const inserted = await supabase
    .from('message_threads')
    .insert({
      tenant_id: ctx.tenantId,
      subject: parsed.data.subject,
      context_type: parsed.data.context_type,
      context_id: parsed.data.context_id,
      created_by: ctx.userId,
      updated_by: ctx.userId,
    })
    .select('id')
    .single();
  if (inserted.error || !inserted.data) {
    return { error: friendlyDbMessage(inserted.error?.message) };
  }
  const threadId = inserted.data.id;

  // Ersteller ist per Trigger schon Teilnehmer. Weitere Teilnehmer adden
  // (Duplikate ignorieren, falls jemand versehentlich sich selbst wählt).
  const extraParticipants = parsed.data.participant_ids.filter((id) => id !== ctx.userId);
  if (extraParticipants.length > 0) {
    const partRes = await supabase.from('message_thread_participants').insert(
      extraParticipants.map((userId) => ({
        tenant_id: ctx.tenantId,
        thread_id: threadId,
        user_id: userId,
        added_by: ctx.userId,
      })),
    );
    if (partRes.error) return { error: friendlyDbMessage(partRes.error.message) };
  }

  const msgRes = await supabase.from('messages').insert({
    tenant_id: ctx.tenantId,
    thread_id: threadId,
    author_user_id: ctx.userId,
    body: parsed.data.body,
  });
  if (msgRes.error) return { error: friendlyDbMessage(msgRes.error.message) };

  // Ersteller hat den Thread eben angelegt — direkt als gelesen markieren.
  await supabase
    .from('message_thread_participants')
    .update({ last_read_at: new Date().toISOString() })
    .eq('thread_id', threadId)
    .eq('user_id', ctx.userId);

  revalidatePath('/messages');
  redirect(`/messages/${threadId}`);
}

export async function postMessageAction(formData: FormData): Promise<void> {
  const ctx = await requireTenantContext();
  const parsed = postMessageSchema.safeParse({
    thread_id: formData.get('thread_id') ?? '',
    body: formData.get('body') ?? '',
  });
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? 'Ungültige Eingabe.');

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from('messages').insert({
    tenant_id: ctx.tenantId,
    thread_id: parsed.data.thread_id,
    author_user_id: ctx.userId,
    body: parsed.data.body,
  });
  if (error) throw new Error(friendlyDbMessage(error.message));

  // Autor eigenen last_read_at hochziehen
  await supabase
    .from('message_thread_participants')
    .update({ last_read_at: new Date().toISOString() })
    .eq('thread_id', parsed.data.thread_id)
    .eq('user_id', ctx.userId);

  revalidatePath('/messages');
  revalidatePath(`/messages/${parsed.data.thread_id}`);
}

export async function markThreadReadAction(formData: FormData): Promise<void> {
  const ctx = await requireTenantContext();
  const parsed = markReadSchema.safeParse({
    thread_id: formData.get('thread_id') ?? '',
  });
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? 'Ungültige Eingabe.');

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from('message_thread_participants')
    .update({ last_read_at: new Date().toISOString() })
    .eq('thread_id', parsed.data.thread_id)
    .eq('user_id', ctx.userId);
  if (error) throw new Error(friendlyDbMessage(error.message));

  revalidatePath('/messages');
  revalidatePath(`/messages/${parsed.data.thread_id}`);
}

export async function addParticipantAction(formData: FormData): Promise<void> {
  const ctx = await requireTenantContext();
  const parsed = participantMutationSchema.safeParse({
    thread_id: formData.get('thread_id') ?? '',
    user_id: formData.get('user_id') ?? '',
  });
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? 'Ungültige Eingabe.');

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from('message_thread_participants').insert({
    tenant_id: ctx.tenantId,
    thread_id: parsed.data.thread_id,
    user_id: parsed.data.user_id,
    added_by: ctx.userId,
  });
  if (error) throw new Error(friendlyDbMessage(error.message));

  revalidatePath(`/messages/${parsed.data.thread_id}`);
}

export async function removeParticipantAction(formData: FormData): Promise<void> {
  await requireTenantContext();
  const parsed = participantMutationSchema.safeParse({
    thread_id: formData.get('thread_id') ?? '',
    user_id: formData.get('user_id') ?? '',
  });
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? 'Ungültige Eingabe.');

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from('message_thread_participants')
    .delete()
    .eq('thread_id', parsed.data.thread_id)
    .eq('user_id', parsed.data.user_id);
  if (error) throw new Error(friendlyDbMessage(error.message));

  revalidatePath(`/messages/${parsed.data.thread_id}`);
}
