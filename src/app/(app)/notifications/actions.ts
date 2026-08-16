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
import { unwrapMaybeRow } from '@/lib/supabase/unwrap';
import { hrefAvailable } from '@/lib/modules/href-guard';

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
 *
 * Sprint 121: Das Ziel kann in einem abgeschalteten Modul liegen. Eine
 * Benachrichtigung ueberlebt die Entscheidung, ihr Modul abzuschalten — sie
 * steht schon in der Tabelle, wenn der Schalter faellt, und die Glocke zeigt
 * sie weiter an. Der Klick landete damit auf einer 404, und zwar an der
 * unangenehmsten Stelle: der Nutzer hat nichts falsch gemacht, er hat auf
 * etwas geklickt, das die Anwendung ihm selbst hingelegt hat.
 *
 * Sprint 119 hat diese Sackgassen fuer Links geschlossen. Hier gibt es keinen
 * Link — der Sprung passiert serverseitig per `redirect()`, an `ModuleLink`
 * vorbei. Deshalb dieselbe Pruefung ueber denselben Helfer.
 *
 * Gelesen wird die Meldung trotzdem: dass ihr Ziel nicht mehr erreichbar ist,
 * aendert nichts daran, dass der Nutzer sie zur Kenntnis genommen hat.
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
  const dataRes = await supabase
    .from('notifications')
    .select('entity_type, entity_id, url')
    .eq('id', parsed.data.notification_id)
    .maybeSingle();
  const data = unwrapMaybeRow(dataRes, 'Benachrichtigungen: notifications');

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

  // Nicht stumm auf die Inbox zurueckwerfen: aus der Inbox heraus geklickt
  // sieht das aus, als haette der Knopf nicht funktioniert. Der Hinweis oben
  // auf der Seite sagt, was passiert ist.
  if (!(await hrefAvailable(href))) redirect('/notifications?info=modul-aus');

  redirect(href);
}
