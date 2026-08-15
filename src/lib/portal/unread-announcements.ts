import 'server-only';
import { cache } from 'react';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export interface PortalUnreadAnnouncementsSummary {
  totalCount: number;
  unreadCount: number;
  openAckCount: number;
}

/**
 * Sprint 47: Zaehl-Helper fuer Ankuendigungen im Bewohner-Portal.
 *
 * Wird vom Layout (Nav-Badge) und vom Dashboard (SummaryCard) genutzt
 * und ist via React cache() dedupliziert. Anders als die Messages-
 * Variante ermittelt die Funktion zwei getrennte Zaehler:
 *
 * - unreadCount: Ankuendigungen, fuer die der Bewohner noch keinen
 *   read-receipt-Eintrag hat.
 * - openAckCount: Ankuendigungen mit requires_acknowledgement, die noch
 *   keinen acknowledged_at-Zeitstempel besitzen.
 *
 * Der Nav-Badge zeigt bewusst unreadCount (parallel zur Messages-
 * Behandlung). Die "quittieren"-Zaehlung bleibt in der Dashboard-
 * SummaryCard sichtbar (warning-Ton + Hinweis-Text).
 *
 * RLS-Scoping auf announcements sorgt bereits dafuer, dass Bewohner
 * nur ihre eigenen (per target_type gefilterten) Ankuendigungen
 * bekommen — ein zusaetzlicher Filter ist hier nicht noetig.
 */
export const loadPortalUnreadAnnouncementsSummary = cache(
  async (userId: string): Promise<PortalUnreadAnnouncementsSummary> => {
    const supabase = await createSupabaseServerClient();
    const [announcementsRes, receiptsRes] = await Promise.all([
      supabase
        .from('announcements')
        .select('id, requires_acknowledgement')
        .eq('status', 'published'),
      supabase
        .from('announcement_receipts')
        .select('announcement_id, read_at, acknowledged_at')
        .eq('user_id', userId),
    ]);

    const announcements = announcementsRes.data ?? [];
    const receipts = receiptsRes.data ?? [];
    const receiptMap = new Map(receipts.map((r) => [r.announcement_id, r]));

    let unreadCount = 0;
    let openAckCount = 0;
    for (const a of announcements) {
      const r = receiptMap.get(a.id);
      if (!r?.read_at) unreadCount += 1;
      if (a.requires_acknowledgement && !r?.acknowledged_at) openAckCount += 1;
    }

    return {
      totalCount: announcements.length,
      unreadCount,
      openAckCount,
    };
  },
);
