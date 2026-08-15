import 'server-only';
import { cache } from 'react';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { loadPortalUnreadThreadsSummary } from './unread-messages';
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
      (participationRes.data ?? []).map((p) => [p.thread_id, p.last_read_at]),
    );
    const unreadThreads: PortalBellItem[] = (threadsRes.data ?? [])
      .filter((t) => {
        const lastRead = lastReadMap.get(t.id);
        return !lastRead || (t.last_message_at !== null && lastRead < t.last_message_at);
      })
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
      (receiptsRes.data ?? []).map((r) => [r.announcement_id, r]),
    );
    const unreadAnnouncements: PortalBellItem[] = (announcementsRes.data ?? [])
      .filter((a) => {
        const r = receiptMap.get(a.id);
        return !r?.read_at;
      })
      .slice(0, TOP_N_PER_KIND)
      .map((a) => {
        const r = receiptMap.get(a.id);
        return {
          id: a.id,
          kind: 'announcement',
          title: a.title,
          href: `/portal/announcements/${a.id}`,
          createdAt: a.published_at,
          needsAck: Boolean(a.requires_acknowledgement && !r?.acknowledged_at),
        };
      });

    const items = [...unreadThreads, ...unreadAnnouncements].sort((a, b) => {
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
