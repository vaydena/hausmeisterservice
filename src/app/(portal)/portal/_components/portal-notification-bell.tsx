import { loadPortalNotificationBellFeed } from '@/lib/portal/notification-bell';
import { formatRelativeGerman } from '@/lib/schemas/notifications';
import { PortalNotificationBellDropdown } from './portal-notification-bell-dropdown';

/**
 * Sprint 50: Server Component fuer die Portal-Header-Bell. Aggregiert
 * ungelesene Nachrichten- und Ankuendigungs-Zaehler und liefert die
 * neuesten Top-Items zur Dropdown-Vorschau. Alle DB-Zugriffe laufen
 * ueber den cache()-Aggregator, der die Summary-Helper mit dem
 * Nav-Badge dedupliziert.
 *
 * Anders als die Staff-Bell hat das Portal keine eigene notifications-
 * Tabelle — daher zeigt die Dropdown-Liste direkt die Deep-Links zu
 * den Threads/Ankuendigungen. Ein "als gelesen"-Server-Action ist nicht
 * noetig: das last_read_at bzw. read_at wird beim Aufruf der jeweiligen
 * Detailseite gesetzt (bestehende Message-/Announcement-Flows).
 */
export async function PortalNotificationBell({ userId }: { userId: string }) {
  const { unreadCount, items } = await loadPortalNotificationBellFeed(userId);

  return (
    <PortalNotificationBellDropdown
      unreadCount={unreadCount}
      items={items.map((i) => ({
        id: i.id,
        kind: i.kind,
        title: i.title,
        href: i.href,
        relative: i.createdAt ? formatRelativeGerman(i.createdAt) : '—',
        needsAck: i.needsAck,
      }))}
    />
  );
}
