import 'server-only';
import { createSupabaseServiceClient } from '@/lib/supabase/service';

export type LoginEndpoint = 'staff-login' | 'portal-login' | 'owner-login';

/**
 * Best-effort: schreibt einen erfolgreichen Login als Zeile in
 * auth_login_events (Sprint 29) — fuer den User-sichtbaren Anmeldeverlauf
 * im Konto-Bereich. Fehler werden bewusst geschluckt: der Login soll
 * gelingen, auch wenn die Log-Zeile mal nicht durchgeht (RPC-Ausfall,
 * Netzwerk, ...). Der User wuerde sonst faelschlich denken "Login klappt
 * nicht", obwohl die Auth-Session bereits sitzt.
 *
 * Warum service_role: die RPC log_login_event ist SECURITY DEFINER mit
 * execute-Grant nur an service_role (Sprint 21 Lockdown-Muster) — anon
 * und authenticated koennen sie nicht aufrufen, damit ein Angreifer keine
 * Fake-Events fuer beliebige User erzeugen kann.
 */
export async function logLoginEvent(params: {
  userId: string;
  ip: string;
  userAgent: string | null;
  endpoint: LoginEndpoint;
}): Promise<void> {
  try {
    const service = createSupabaseServiceClient();
    await service.rpc('log_login_event', {
      p_user_id: params.userId,
      p_ip: params.ip,
      p_user_agent: params.userAgent ?? '',
      p_endpoint: params.endpoint,
    });
  } catch {
    // Silent — Login geht auch ohne Log-Zeile.
  }
}
