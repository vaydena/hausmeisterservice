'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { requireTenantContext } from '@/lib/tenant/current';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import {
  announcementCreateSchema,
  announcementIdSchema,
  announcementUpdateSchema,
} from '@/lib/schemas/announcements';

export type AnnouncementFormState = {
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
  if (msg.includes('announcements_target_check')) return 'Ziel-Angabe unvollständig.';
  if (msg.includes('announcements_expires_check')) return 'Ablaufdatum liegt vor dem Veröffentlichungsdatum.';
  return 'Speichern fehlgeschlagen. Bitte erneut versuchen.';
}

function parseFormInput(formData: FormData) {
  const targetUserIds = formData
    .getAll('target_user_ids')
    .filter((v): v is string => typeof v === 'string' && v.length > 0);

  return {
    title: formData.get('title') ?? '',
    body: formData.get('body') ?? '',
    target_type: formData.get('target_type') ?? 'all',
    target_role_key: formData.get('target_role_key') ?? undefined,
    target_user_ids: targetUserIds,
    requires_acknowledgement: formData.get('requires_acknowledgement') ?? undefined,
    expires_at: formData.get('expires_at') ?? undefined,
  };
}

export async function createAnnouncementAction(
  _prev: AnnouncementFormState,
  formData: FormData,
): Promise<AnnouncementFormState> {
  const ctx = await requireTenantContext();

  const parsed = announcementCreateSchema.safeParse(parseFormInput(formData));
  if (!parsed.success) {
    return {
      fieldErrors: fieldErrorsFromZod(parsed.error),
      error: 'Bitte prüfen Sie die Eingaben.',
    };
  }

  const publishNow = formData.get('_publish') === 'on';
  const now = new Date().toISOString();

  const supabase = await createSupabaseServerClient();
  const inserted = await supabase
    .from('announcements')
    .insert({
      tenant_id: ctx.tenantId,
      title: parsed.data.title,
      body: parsed.data.body,
      status: publishNow ? 'published' : 'draft',
      target_type: parsed.data.target_type,
      target_role_key: parsed.data.target_role_key,
      target_user_ids: parsed.data.target_user_ids,
      requires_acknowledgement: parsed.data.requires_acknowledgement,
      published_at: publishNow ? now : null,
      expires_at: parsed.data.expires_at,
      created_by: ctx.userId,
    })
    .select('id')
    .single();
  if (inserted.error || !inserted.data) {
    return { error: friendlyDbMessage(inserted.error?.message) };
  }

  revalidatePath('/announcements');
  redirect(`/announcements/${inserted.data.id}`);
}

export async function updateAnnouncementAction(
  _prev: AnnouncementFormState,
  formData: FormData,
): Promise<AnnouncementFormState> {
  await requireTenantContext();
  const idResult = announcementIdSchema.safeParse({ id: formData.get('id') });
  if (!idResult.success) {
    return { error: 'Ungültige Ankündigungs-ID.' };
  }

  const parsed = announcementUpdateSchema.safeParse(parseFormInput(formData));
  if (!parsed.success) {
    return {
      fieldErrors: fieldErrorsFromZod(parsed.error),
      error: 'Bitte prüfen Sie die Eingaben.',
    };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from('announcements')
    .update({
      title: parsed.data.title,
      body: parsed.data.body,
      target_type: parsed.data.target_type,
      target_role_key: parsed.data.target_role_key,
      target_user_ids: parsed.data.target_user_ids,
      requires_acknowledgement: parsed.data.requires_acknowledgement,
      expires_at: parsed.data.expires_at,
    })
    .eq('id', idResult.data.id)
    .eq('status', 'draft');
  if (error) return { error: friendlyDbMessage(error.message) };

  revalidatePath('/announcements');
  revalidatePath(`/announcements/${idResult.data.id}`);
  redirect(`/announcements/${idResult.data.id}`);
}

export async function publishAnnouncementAction(formData: FormData): Promise<void> {
  await requireTenantContext();
  const idResult = announcementIdSchema.safeParse({ id: formData.get('id') });
  if (!idResult.success) throw new Error('Ungültige Ankündigungs-ID.');

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from('announcements')
    .update({
      status: 'published',
      published_at: new Date().toISOString(),
    })
    .eq('id', idResult.data.id)
    .eq('status', 'draft');
  if (error) throw new Error(friendlyDbMessage(error.message));

  revalidatePath('/announcements');
  revalidatePath(`/announcements/${idResult.data.id}`);
}

export async function closeAnnouncementAction(formData: FormData): Promise<void> {
  await requireTenantContext();
  const idResult = announcementIdSchema.safeParse({ id: formData.get('id') });
  if (!idResult.success) throw new Error('Ungültige Ankündigungs-ID.');

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from('announcements')
    .update({ status: 'closed' })
    .eq('id', idResult.data.id)
    .eq('status', 'published');
  if (error) throw new Error(friendlyDbMessage(error.message));

  revalidatePath('/announcements');
  revalidatePath(`/announcements/${idResult.data.id}`);
}

export async function deleteAnnouncementAction(formData: FormData): Promise<void> {
  await requireTenantContext();
  const idResult = announcementIdSchema.safeParse({ id: formData.get('id') });
  if (!idResult.success) throw new Error('Ungültige Ankündigungs-ID.');

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from('announcements')
    .delete()
    .eq('id', idResult.data.id)
    .eq('status', 'draft');
  if (error) throw new Error(friendlyDbMessage(error.message));

  revalidatePath('/announcements');
  redirect('/announcements');
}

export async function markAnnouncementReadAction(formData: FormData): Promise<void> {
  const ctx = await requireTenantContext();
  const idResult = announcementIdSchema.safeParse({ id: formData.get('id') });
  if (!idResult.success) throw new Error('Ungültige Ankündigungs-ID.');

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from('announcement_receipts')
    .upsert(
      {
        announcement_id: idResult.data.id,
        user_id: ctx.userId,
        read_at: new Date().toISOString(),
      },
      { onConflict: 'announcement_id,user_id', ignoreDuplicates: false },
    );
  if (error) throw new Error(friendlyDbMessage(error.message));

  revalidatePath('/announcements');
  revalidatePath(`/announcements/${idResult.data.id}`);
}

export async function acknowledgeAnnouncementAction(formData: FormData): Promise<void> {
  const ctx = await requireTenantContext();
  const idResult = announcementIdSchema.safeParse({ id: formData.get('id') });
  if (!idResult.success) throw new Error('Ungültige Ankündigungs-ID.');

  const now = new Date().toISOString();
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from('announcement_receipts')
    .upsert(
      {
        announcement_id: idResult.data.id,
        user_id: ctx.userId,
        read_at: now,
        acknowledged_at: now,
      },
      { onConflict: 'announcement_id,user_id', ignoreDuplicates: false },
    );
  if (error) throw new Error(friendlyDbMessage(error.message));

  revalidatePath('/announcements');
  revalidatePath(`/announcements/${idResult.data.id}`);
}
