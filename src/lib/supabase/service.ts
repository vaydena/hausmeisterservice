import 'server-only';
import { createClient } from '@supabase/supabase-js';
import { clientEnv } from '@/lib/env';
import { serverEnv } from '@/lib/env';
import type { Database } from '@/types/database';

let cached: ReturnType<typeof createClient<Database>> | null = null;

/**
 * Bypasses RLS. Only for privileged server operations (audit-log writes,
 * cron jobs, edge functions, invitation flows). Never expose in a Route Handler
 * that accepts user input without an explicit permission check first.
 */
export function createSupabaseServiceClient() {
  if (cached) return cached;
  const env = serverEnv();
  cached = createClient<Database>(
    clientEnv.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );
  return cached;
}
