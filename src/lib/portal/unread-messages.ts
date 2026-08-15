import 'server-only';
import { cache } from 'react';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { isThreadUnread } from './thread-read-state';

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
 * RLS-Scoping erledigen die Basispolicies auf message_threads /
 * message_thread_participants.
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

    const unreadCount = threads.filter((t) =>
      isThreadUnread(t.last_message_at, lastReadMap.get(t.id)),
    ).length;

    return {
      totalCount: threads.length,
      unreadCount,
    };
  },
);
