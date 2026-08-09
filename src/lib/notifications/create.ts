import 'server-only';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { NotificationEntityType, NotificationKind } from '@/lib/schemas/notifications';
import { notificationHref } from '@/lib/schemas/notifications';
import { sendPushBestEffort } from '@/lib/push/dispatch';

export interface CreateNotificationInput {
  userId: string;
  kind: NotificationKind;
  subject: string;
  body?: string | null;
  entityType?: NotificationEntityType | null;
  entityId?: string | null;
  url?: string | null;
}

/**
 * Erzeugt eine Notification via SECURITY DEFINER-Funktion
 * `app_auth.enqueue_notification`. Wirft nicht — Fehler werden geloggt, damit
 * ein fehlgeschlagener Notification-Path nie den auslösenden Business-Flow
 * (Zuweisung, Erstellung…) blockiert.
 */
export async function createNotification(input: CreateNotificationInput): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const entityType = input.entityType ?? null;
  const entityId = input.entityId ?? null;
  const href = notificationHref(entityType, entityId, input.url ?? null);

  const { error } = await supabase.rpc('enqueue_notification', {
    p_user_id: input.userId,
    p_kind: input.kind,
    p_subject: input.subject.slice(0, 200),
    p_body: input.body ? input.body.slice(0, 2000) : undefined,
    p_entity_type: entityType ?? undefined,
    p_entity_id: entityId ?? undefined,
    p_url: href,
  });

  if (error) {
    console.error('[notifications] enqueue failed', {
      kind: input.kind,
      userId: input.userId,
      message: error.message,
    });
    return;
  }

  await sendPushBestEffort(input.userId, {
    title: input.subject.slice(0, 200),
    body: (input.body ?? '').slice(0, 500),
    url: href,
    tag: entityType && entityId ? `${entityType}:${entityId}` : undefined,
    data: { kind: input.kind, entityType, entityId },
  });
}

/**
 * Wie createNotification, aber für mehrere Empfänger. Deduplicate userIds
 * und schluckt Fehler pro Empfänger einzeln, damit ein einzelner Ausfall die
 * restlichen nicht kaputt macht.
 */
export async function createNotifications(
  userIds: string[],
  common: Omit<CreateNotificationInput, 'userId'>,
): Promise<void> {
  const unique = [...new Set(userIds)].filter(Boolean);
  await Promise.all(unique.map((userId) => createNotification({ ...common, userId })));
}
