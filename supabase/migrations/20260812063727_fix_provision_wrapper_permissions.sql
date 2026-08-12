-- Sprint 9 · Bug-Fix: public.provision_signup_tenant war in
-- 20260810000300_signup_provision_public_wrapper.sql als
-- SECURITY INVOKER angelegt, delegiert intern aber an
-- app_auth.provision_signup_tenant. service_role hat kein USAGE
-- auf schema app_auth → jeder RPC-Aufruf schlug im Prod-Env fehl mit
--
--   ERROR: permission denied for schema app_auth
--
-- Live-Symptom (2026-08-12 06:26:51 und 06:28:04 UTC im Postgres-Log):
--   * /auth/callback exchanged Code für Session → OK
--   * ensureTenantForUser ruft service.rpc('provision_signup_tenant', …)
--     → permission-denied → Membership wird nie angelegt
--   * Analog beim signInAction-Fallback (Sprint 9-PR #2)
--   * User landet ohne Membership → Redirect-Loop bzw. /no-access
--
-- Herkunft dieser Datei:
--   Die Änderung wurde am 2026-08-12 06:37:27 UTC via MCP
--   apply_migration direkt in Prod ausgeführt, um den Live-Ausfall
--   sofort zu beheben. Diese Datei zieht die Änderung ins Repo nach.
--   Der Timestamp im Dateinamen entspricht exakt dem Eintrag in
--   supabase_migrations.schema_migrations, daher wird sie beim nächsten
--   `supabase db push` als "already applied" erkannt.
--
-- Root Cause:
--   Der wrapper darf nicht INVOKER sein, weil PostgREST-Callers
--   (service_role) den umschlossenen Namespace nicht sehen können.
--   Da der wrapper nur eine typisierte Signatur ins public-Schema
--   spiegelt und keine SQL-Interpolation macht, ist SECURITY DEFINER
--   sicher: die vier Argumente werden als typisierte Parameter an die
--   inner function weitergereicht; die inner function ist selbst
--   SECURITY DEFINER + SET search_path = '' + verwendet nur
--   schema-qualifizierte Referenzen. Der REVOKE-/GRANT-Block bleibt
--   unverändert — nur service_role darf ausführen.

create or replace function public.provision_signup_tenant(
  p_user_id            uuid,
  p_slug               text,
  p_company_name       text,
  p_terms_accepted_at  timestamptz
)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select app_auth.provision_signup_tenant(p_user_id, p_slug, p_company_name, p_terms_accepted_at);
$$;

revoke all on function public.provision_signup_tenant(uuid, text, text, timestamptz) from public;
revoke all on function public.provision_signup_tenant(uuid, text, text, timestamptz) from anon, authenticated;
grant execute on function public.provision_signup_tenant(uuid, text, text, timestamptz) to service_role;

comment on function public.provision_signup_tenant is
  'Wrapper für app_auth.provision_signup_tenant. SECURITY DEFINER, weil service_role kein USAGE auf schema app_auth hat. Nur service_role darf aufrufen (Self-Signup-Flow).';
