import { createSupabaseServerClient } from '@/lib/supabase/server';
import {
  NOTIFICATION_KIND_LABEL,
  NOTIFICATION_KIND_TONE,
  formatRelativeGerman,
  notificationHref,
  type NotificationEntityType,
  type NotificationKind,
} from '@/lib/schemas/notifications';
import { openNotificationAction } from '@/app/(app)/notifications/actions';
import { NotificationBellDropdown } from './notification-bell-dropdown';

/**
 * Server Component: lädt Bell-Daten (unread count + Top 10) und rendert das
 * Client-Dropdown darüber.
 */
export async function NotificationBell() {
  const supabase = await createSupabaseServerClient();

  const [unreadRes, latestRes] = await Promise.all([
    supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .is('read_at', null),
    supabase
      .from('notifications')
      .select('id, kind, subject, body, entity_type, entity_id, url, read_at, created_at')
      .order('created_at', { ascending: false })
      .limit(10),
  ]);

  const unread = unreadRes.count ?? 0;
  const items = (latestRes.data ?? []).map((n) => ({
    id: n.id,
    kind: n.kind as NotificationKind,
    subject: n.subject,
    body: n.body,
    href: notificationHref(
      (n.entity_type as NotificationEntityType | null) ?? null,
      n.entity_id,
      n.url,
    ),
    isUnread: n.read_at === null,
    relative: formatRelativeGerman(n.created_at),
  }));

  return (
    <NotificationBellDropdown
      unread={unread}
      items={items.map((i) => ({
        ...i,
        label: NOTIFICATION_KIND_LABEL[i.kind] ?? i.kind,
        tone: NOTIFICATION_KIND_TONE[i.kind] ?? 'neutral',
      }))}
      openAction={openNotificationAction}
    />
  );
}
