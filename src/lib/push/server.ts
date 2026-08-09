import 'server-only';
import webpush from 'web-push';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';
import { serverEnv } from '@/lib/env';
import type { PushDispatchResult, PushPayload } from './types';

type Client = SupabaseClient<Database>;

let vapidReady = false;

function ensureVapid(): boolean {
  if (vapidReady) return true;
  const env = serverEnv();
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!publicKey || !env.VAPID_PRIVATE_KEY || !env.VAPID_SUBJECT) return false;
  webpush.setVapidDetails(env.VAPID_SUBJECT, publicKey, env.VAPID_PRIVATE_KEY);
  vapidReady = true;
  return true;
}

export function isPushConfigured(): boolean {
  return ensureVapid();
}

/**
 * Sendet Push an alle Subscriptions eines Users. Löscht Subs mit 404/410
 * (dauerhaft weg) und markiert andere Fehler in `last_error`.
 *
 * Erwartet einen Service-Role-Client, da wir für andere User Subscriptions
 * lesen und löschen müssen.
 */
export async function sendPushToUser(
  supabase: Client,
  userId: string,
  payload: PushPayload,
): Promise<PushDispatchResult> {
  const result: PushDispatchResult = { attempted: 0, succeeded: 0, removed: 0, failed: 0 };
  if (!ensureVapid()) return result;

  const { data: subs, error } = await supabase
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth')
    .eq('user_id', userId);
  if (error || !subs || subs.length === 0) return result;

  const body = JSON.stringify(payload);
  const now = new Date().toISOString();
  const toDelete: string[] = [];
  const toMark: { id: string; error: string }[] = [];

  await Promise.all(
    subs.map(async (sub) => {
      result.attempted += 1;
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          body,
          { TTL: 60 * 60 * 24 },
        );
        result.succeeded += 1;
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode;
        const msg = err instanceof Error ? err.message : 'unknown';
        if (status === 404 || status === 410) {
          toDelete.push(sub.id);
          result.removed += 1;
        } else {
          toMark.push({ id: sub.id, error: `${status ?? '?'}: ${msg}`.slice(0, 400) });
          result.failed += 1;
        }
      }
    }),
  );

  if (toDelete.length > 0) {
    await supabase.from('push_subscriptions').delete().in('id', toDelete);
  }
  if (toMark.length > 0) {
    // Update last_error individuell (Batch-Update mit unterschiedlichen Werten geht nicht)
    await Promise.all(
      toMark.map((m) =>
        supabase
          .from('push_subscriptions')
          .update({ last_error: m.error, last_used_at: now })
          .eq('id', m.id),
      ),
    );
  }
  if (result.succeeded > 0) {
    // Erfolgreiche Subs: last_used_at aktualisieren
    const okIds = subs
      .filter((s) => !toDelete.includes(s.id) && !toMark.some((m) => m.id === s.id))
      .map((s) => s.id);
    if (okIds.length > 0) {
      await supabase
        .from('push_subscriptions')
        .update({ last_used_at: now, last_error: null })
        .in('id', okIds);
    }
  }
  return result;
}
