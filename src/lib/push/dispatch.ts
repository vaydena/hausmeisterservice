import 'server-only';
import { createSupabaseServiceClient } from '@/lib/supabase/service';
import { sendPushToUser, isPushConfigured } from './server';
import type { PushPayload } from './types';

/**
 * Best-effort Push an einen User. Fehler werden geloggt, nie geworfen —
 * ein fehlgeschlagener Push darf den auslösenden Business-Flow nicht kaputt
 * machen. Nutzt einen Service-Role-Client, weil Push-Subscriptions anderer
 * User gelesen und ggf. gelöscht werden müssen.
 */
export async function sendPushBestEffort(userId: string, payload: PushPayload): Promise<void> {
  if (!isPushConfigured()) return;
  try {
    const supabase = createSupabaseServiceClient();
    const result = await sendPushToUser(supabase, userId, payload);
    if (result.failed > 0) {
      console.warn('[push] some sends failed', { userId, ...result });
    }
  } catch (err) {
    console.error('[push] send failed', {
      userId,
      message: err instanceof Error ? err.message : String(err),
    });
  }
}
