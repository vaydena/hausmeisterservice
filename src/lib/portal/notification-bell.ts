import 'server-only';
import { cache } from 'react';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { unwrapRows } from '@/lib/supabase/unwrap';
import { loadPortalUnreadThreadsSummary } from './unread-messages';
import { isThreadUnread } from './thread-read-state';
import { isAnnouncementUnread, needsAcknowledgement } from './announcement-read-state';
import { loadPortalUnreadAnnouncementsSummary } from './unread-announcements';

export type PortalBellItemKind = 'message' | 'announcement';

export interface PortalBellItem {
  id: string;
  kind: PortalBellItemKind;
  title: string;
  href: string;
  createdAt: string | null;
  needsAck: boolean;
}

export interface PortalNotificationBellFeed {
  unreadCount: number;
  items: PortalBellItem[];
}

const TOP_N_PER_KIND = 3;

/**
 * Sprint 50: Aggregator fuer die Portal-Bell im Header. Kombiniert die
 * beiden bestehenden Summary-Helper (Sprint 46 fuer Nachrichten,
 * Sprint 47 fuer Ankuendigungen) mit den aktuellsten ungelesenen Items
 * als Deep-Link-Vorschau. React cache() dedupliziert die Summary-Helper
 * mit dem Nav-Badge, sodass auf /portal/dashboard (das beide Helper
 * bereits ruft) keine zusaetzlichen Roundtrips entstehen.
 *
 * Bell-Aggregate ist bewusst konsistent mit den Sidebar-Badges der
 * PortalNav: unread_threads + unread_announcements. Ack-Anforderung
 * wird pro Item als "quittieren"-Chip signalisiert, nicht in die
 * Bell-Count aufgerechnet — sonst wuerde ein Item, das gleichzeitig
 * unread UND ack-required ist, doppelt zaehlen.
 *
 * Die Detail-Queries limitieren auf 20 Zeilen pro Kategorie; da
 * ungelesene Items typischerweise die neuesten sind, reicht das fuer
 * die Top-3-Vorschau. Sollten Tenants mit >20 rasch aufeinander
 * folgenden Ankuendigungen auftauchen, kann der Filter auf Server-
 * Seite (per not exists / subquery) verscharft werden.
 */
export const loadPortalNotificationBellFeed = cache(
  async (userId: string): Promise<PortalNotificationBellFeed> => {
    const supabase = await createSupabaseServerClient();

    const [
      threadsSummary,
      announcementsSummary,
      threadsRes,
      participationRes,
      announcementsRes,
      receiptsRes,
    ] = await Promise.all([
      loadPortalUnreadThreadsSummary(userId),
      loadPortalUnreadAnnouncementsSummary(userId),
      supabase
        .from('message_threads')
        .select('id, subject, last_message_at')
        .order('last_message_at', { ascending: false, nullsFirst: false })
        .limit(20),
      supabase
        .from('message_thread_participants')
        .select('thread_id, last_read_at')
        .eq('user_id', userId),
      supabase
        .from('announcements')
        .select('id, title, published_at, requires_acknowledgement')
        .eq('status', 'published')
        .order('published_at', { ascending: false, nullsFirst: false })
        .limit(20),
      supabase
        .from('announcement_receipts')
        .select('announcement_id, read_at, acknowledged_at')
        .eq('user_id', userId),
    ]);

    const lastReadMap = new Map(
      unwrapRows(participationRes, 'Portal-Glocke: Lesezustand').map((p) => [
        p.thread_id,
        p.last_read_at,
      ]),
    );
    const unreadThreads: PortalBellItem[] = unwrapRows(
      threadsRes,
      'Portal-Glocke: Nachrichten-Threads',
    )
      .filter((t) => isThreadUnread(t.last_message_at, lastReadMap.get(t.id)))
      .slice(0, TOP_N_PER_KIND)
      .map((t) => ({
        id: t.id,
        kind: 'message',
        title: t.subject,
        href: `/portal/messages/${t.id}`,
        createdAt: t.last_message_at,
        needsAck: false,
      }));

    const receiptMap = new Map(
      unwrapRows(receiptsRes, 'Portal-Glocke: Lesebestätigungen').map((r) => [
        r.announcement_id,
        r,
      ]),
    );
    const unreadAnnouncements: PortalBellItem[] = unwrapRows(
      announcementsRes,
      'Portal-Glocke: Ankündigungen',
    )
      .filter((a) => isAnnouncementUnread(receiptMap.get(a.id)))
      .slice(0, TOP_N_PER_KIND)
      .map((a) => ({
        id: a.id,
        kind: 'announcement',
        title: a.title,
        href: `/portal/announcements/${a.id}`,
        createdAt: a.published_at,
        needsAck: needsAcknowledgement(a.requires_acknowledgement, receiptMap.get(a.id)),
      }));

    // Sprint 89: needsAck zuerst (analog Sprint 87 Liste + Sprint 88
    // Dashboard-Panel). Innerhalb der beiden Gruppen bleibt die
    // createdAt-DESC-Reihenfolge erhalten. Damit sieht der Bewohner
    // eine zu-quittierende Ankuendigung im Bell ganz oben — auch wenn
    // spaeter eine neuere Nachricht eingegangen ist, die sonst mit
    // createdAt gewinnen wuerde.
    const items = [...unreadThreads, ...unreadAnnouncements].sort((a, b) => {
      if (a.needsAck !== b.needsAck) return a.needsAck ? -1 : 1;
      const at = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const bt = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return bt - at;
    });

    return {
      unreadCount: threadsSummary.unreadCount + announcementsSummary.unreadCount,
      items,
    };
  },
);
