'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireTenantContext } from '@/lib/tenant/current';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import {
  dismissSchema,
  markReadSchema,
  notificationHref,
  type NotificationEntityType,
} from '@/lib/schemas/notifications';

export async function markNotificationReadAction(formData: FormData): Promise<void> {
  await requireTenantContext();
  const parsed = markReadSchema.safeParse({
    notification_id: formData.get('notification_id'),
  });
  if (!parsed.success) return;

  const supabase = await createSupabaseServerClient();
  await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('id', parsed.data.notification_id)
    .is('read_at', null);

  revalidatePath('/notifications');
  revalidatePath('/', 'layout');
}

export async function markAllNotificationsReadAction(): Promise<void> {
  await requireTenantContext();
  const supabase = await createSupabaseServerClient();
  await supabase.rpc('mark_all_notifications_read');
  revalidatePath('/notifications');
  revalidatePath('/', 'layout');
}

export async function dismissNotificationAction(formData: FormData): Promise<void> {
  await requireTenantContext();
  const parsed = dismissSchema.safeParse({
    notification_id: formData.get('notification_id'),
  });
  if (!parsed.success) return;

  const supabase = await createSupabaseServerClient();
  await supabase.from('notifications').delete().eq('id', parsed.data.notification_id);

  revalidatePath('/notifications');
  revalidatePath('/', 'layout');
}

/**
 * Markiert die Notification als gelesen und redirected auf ihr Ziel. Wird von
 * Bell-Dropdown und Inbox verwendet, damit Klick = "als gelesen + öffnen" in
 * einem einzigen Server-Roundtrip.
 */
export async function openNotificationAction(formData: FormData): Promise<void> {
  await requireTenantContext();
  const parsed = markReadSchema.safeParse({
    notification_id: formData.get('notification_id'),
  });
  if (!parsed.success) {
    redirect('/notifications');
  }

  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from('notifications')
    .select('entity_type, entity_id, url')
    .eq('id', parsed.data.notification_id)
    .maybeSingle();

  await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('id', parsed.data.notification_id)
    .is('read_at', null);

  revalidatePath('/notifications');
  revalidatePath('/', 'layout');

  const href = data
    ? notificationHref(
        (data.entity_type as NotificationEntityType | null) ?? null,
        data.entity_id,
        data.url,
      )
    : '/notifications';
  redirect(href);
}
