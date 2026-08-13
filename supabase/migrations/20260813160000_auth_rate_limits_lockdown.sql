-- Sprint 21: Advisor-Fix. Die Rate-Limit-Functions aus Sprint 20 sind
-- versehentlich fuer die Rollen `anon` und `authenticated` executable —
-- Supabase vergibt neuen SECURITY DEFINER-Functions im public-Schema
-- automatisch execute-Grants an beide Rollen, das REVOKE FROM public in
-- der Vorgaenger-Migration greift dafuer nicht (anon/authenticated sind
-- eigene Rollen und kein Mitglied von public).
--
-- Konsequenz waere: ein Angreifer koennte via PostgREST-RPC mit dem anon-
-- Key check_and_consume_auth_rate_limit(...) direkt aufrufen und den
-- Rate-Limit-Check komplett umgehen (z.B. p_limit=1000000) oder mit
-- reset_auth_rate_limit(seine_eigene_ip, 'login') seinen Zaehler nach
-- jedem Fehlversuch resetten.
--
-- Fix: EXECUTE explizit von anon + authenticated entziehen. Der App-
-- Layer nutzt ausschliesslich createSupabaseServiceClient() (siehe
-- src/lib/security/rate-limit.ts), also den service_role JWT — der
-- behaelt seine execute-Rechte und der Rate-Limit-Flow bleibt funktional.

revoke execute on function public.check_and_consume_auth_rate_limit(text, text, integer, integer, integer) from anon, authenticated;
revoke execute on function public.reset_auth_rate_limit(text, text) from anon, authenticated;
revoke execute on function public.cleanup_expired_auth_rate_limits() from anon, authenticated;
