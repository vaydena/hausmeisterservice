'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { requireResidentContext } from '@/lib/portal/current';
import { createSupabaseServerClient } from '@/lib/supabase/server';

const postSchema = z.object({
  thread_id: z.string().uuid('Ungültige Thread-ID.'),
  // Sprint 97: max() brauchte eine eigene Meldung — postPortalMessageAction
  // reicht issues[0].message direkt an die UI durch, und Zods englischer
  // Default waere so im deutschen Portal gelandet.
  body: z
    .string()
    .trim()
    .min(1, 'Nachricht darf nicht leer sein.')
    .max(4000, 'Nachricht darf maximal 4000 Zeichen lang sein.'),
});

const createThreadSchema = z.object({
  subject: z
    .string()
    .trim()
    .min(3, 'Betreff muss mindestens 3 Zeichen lang sein.')
    .max(200, 'Betreff darf maximal 200 Zeichen lang sein.'),
  body: z
    .string()
    .trim()
    .min(1, 'Nachricht darf nicht leer sein.')
    .max(4000, 'Nachricht darf maximal 4000 Zeichen lang sein.'),
});

export type PortalMessageFormState = {
  error?: string;
};

export type PortalCreateThreadFormState = {
  error?: string;
  fieldErrors?: Record<string, string>;
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

/**
 * Sprint 53: Portal-Bewohner startet neuen Message-Thread mit der Hausverwaltung.
 * Die eigentliche Arbeit macht die SECURITY-DEFINER-RPC
 * public.create_portal_message_thread: sie legt den Thread an, fuegt alle
 * aktiven Staff-Members mit messaging.create als Empfaenger hinzu und postet
 * die erste Nachricht — atomar in einer Transaktion, weil sowohl das
 * message_threads.insert (verlangt messaging.create) als auch das
 * message_thread_participants.insert (verlangt Self-Participant-Status) via
 * RLS fuer Bewohner sonst nicht moeglich waeren.
 *
 * Der Empfaenger-Kreis ist bewusst nicht waehlbar: Bewohner sprechen "die
 * Hausverwaltung" an, nicht individuelle Mitarbeiter — die interne
 * Zustaendigkeitsverteilung erfolgt Staff-seitig ueber Add/Remove-Participant.
 */
export async function createPortalThreadAction(
  _prev: PortalCreateThreadFormState,
  formData: FormData,
): Promise<PortalCreateThreadFormState> {
  await requireResidentContext();

  const parsed = createThreadSchema.safeParse({
    subject: formData.get('subject') ?? '',
    body: formData.get('body') ?? '',
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
  const { data, error } = await supabase.rpc('create_portal_message_thread', {
    p_subject: parsed.data.subject,
    p_body: parsed.data.body,
  });

  if (error || !data) {
    return { error: 'Senden fehlgeschlagen. Bitte erneut versuchen.' };
  }

  revalidatePath('/portal/messages');
  revalidatePath('/portal/dashboard');
  redirect(`/portal/messages/${data}`);
}

