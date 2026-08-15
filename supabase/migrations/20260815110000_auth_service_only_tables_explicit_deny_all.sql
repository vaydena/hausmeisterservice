-- Sprint 49: Advisor-Signal fuer service-only Tabellen saeubern.
--
-- Sowohl auth_rate_limits (Sprint 20) als auch auth_mfa_recovery_codes
-- (Sprint 26) haben RLS enabled, aber keine expliziten Policies. In
-- Postgres ist "RLS on + no policy" faktisch deny-all — kein Client
-- kann lesen oder schreiben. Der App-Layer greift ohnehin ausschliesslich
-- ueber SECURITY DEFINER-Functions (check_and_consume_auth_rate_limit /
-- reset_auth_rate_limit / cleanup_expired_auth_rate_limits;
-- generate_mfa_recovery_codes_for_user / consume_mfa_recovery_code /
-- count_unused_mfa_recovery_codes) zu, ergaenzt durch service_role, das
-- RLS via bypassrls umgeht.
--
-- Der Supabase-Advisor kann "Absicht" und "vergessen" bei fehlender
-- Policy jedoch nicht unterscheiden und meldet beides als INFO
-- (rls_enabled_no_policy). Die zwei folgenden expliziten Policies
-- aendern das Verhalten kein bisschen, dokumentieren die Absicht aber
-- lesbar im Schema und schalten den Advisor-Hinweis ab.

begin;

-- ============================================================================
-- public.auth_rate_limits
-- ============================================================================

create policy auth_rate_limits_deny_all_client on public.auth_rate_limits
  for all to public
  using (false)
  with check (false);

comment on policy auth_rate_limits_deny_all_client on public.auth_rate_limits is
  'Sprint 49: Explizite deny-all fuer anon/authenticated. Zugriff nur ueber die drei SECURITY DEFINER Functions (Sprint 20/21) und service_role.';

-- ============================================================================
-- public.auth_mfa_recovery_codes
-- ============================================================================

create policy auth_mfa_recovery_codes_deny_all_client on public.auth_mfa_recovery_codes
  for all to public
  using (false)
  with check (false);

comment on policy auth_mfa_recovery_codes_deny_all_client on public.auth_mfa_recovery_codes is
  'Sprint 49: Explizite deny-all fuer anon/authenticated. Zugriff nur ueber die drei SECURITY DEFINER Functions (Sprint 26) und service_role.';

commit;
