import 'server-only';
import { cache } from 'react';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export interface PortalUnreadThreadsSummary {
  totalCount: number;
  unreadCount: number;
}

/**
 * Sprint 46: Zentraler Helper fuer die Ungelesen-Zaehlung im Portal.
 * Wird vom Layout (Nav-Badge) und vom Dashboard (Nachrichten-Karte)
 * genutzt — dank cache() dedupliziert React die Abfragen innerhalb
 * eines Requests, sodass der Layout-Call auf dem Dashboard-Pfad keine
 * zusaetzlichen Roundtrips ausloest.
 *
 * Die Logik ist bewusst identisch zu portal/messages/page.tsx: ein
 * Thread gilt als ungelesen, wenn (a) keine participant-Zeile existiert
 * bzw. last_read_at null ist ODER (b) last_message_at neuer ist als
 * last_read_at. RLS-Scoping erledigen die Basispolicies auf
 * message_threads / message_thread_participants.
 */
export const loadPortalUnreadThreadsSummary = cache(
  async (userId: string): Promise<PortalUnreadThreadsSummary> => {
    const supabase = await createSupabaseServerClient();
    const [threadsRes, participationRes] = await Promise.all([
      supabase.from('message_threads').select('id, last_message_at'),
      supabase
        .from('message_thread_participants')
        .select('thread_id, last_read_at')
        .eq('user_id', userId),
    ]);

    const threads = threadsRes.data ?? [];
    const participation = participationRes.data ?? [];
    const lastReadMap = new Map(participation.map((p) => [p.thread_id, p.last_read_at]));

    const unreadCount = threads.filter((t) => {
      const lastRead = lastReadMap.get(t.id);
      return !lastRead || (t.last_message_at !== null && lastRead < t.last_message_at);
    }).length;

    return {
      totalCount: threads.length,
      unreadCount,
    };
  },
);
