'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireResidentContext } from '@/lib/portal/current';
import { createSupabaseServerClient } from '@/lib/supabase/server';

const postSchema = z.object({
  thread_id: z.string().uuid('Ungültige Thread-ID.'),
  body: z.string().trim().min(1, 'Nachricht darf nicht leer sein.').max(4000),
});

export type PortalMessageFormState = {
  error?: string;
};

export async function postPortalMessageAction(
  _prev: PortalMessageFormState,
  formData: FormData,
): Promise<PortalMessageFormState> {
  const ctx = await requireResidentContext();

  const parsed = postSchema.safeParse({
    thread_id: formData.get('thread_id'),
    body: formData.get('body') ?? '',
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Ungültige Eingaben.' };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from('messages').insert({
    tenant_id: ctx.tenantId,
    thread_id: parsed.data.thread_id,
    author_user_id: ctx.userId,
    body: parsed.data.body,
  });
  if (error) {
    return { error: 'Senden fehlgeschlagen. Bitte erneut versuchen.' };
  }

  revalidatePath(`/portal/messages/${parsed.data.thread_id}`);
  revalidatePath('/portal/messages');
  revalidatePath('/portal/dashboard');
  return {};
}

export async function markPortalThreadReadAction(formData: FormData): Promise<void> {
  const ctx = await requireResidentContext();
  const threadId = formData.get('thread_id');
  if (typeof threadId !== 'string' || threadId.length === 0) return;

  const supabase = await createSupabaseServerClient();
  await supabase
    .from('message_thread_participants')
    .update({ last_read_at: new Date().toISOString() })
    .eq('thread_id', threadId)
    .eq('user_id', ctx.userId);

  revalidatePath('/portal/messages');
  revalidatePath(`/portal/messages/${threadId}`);
}
