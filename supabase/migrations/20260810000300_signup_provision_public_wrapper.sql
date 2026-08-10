-- Sprint 3 · Self-Signup: Public-Wrapper für app_auth.provision_signup_tenant.
-- PostgREST/Supabase-RPC bedient nur das public-Schema; der Wrapper
-- delegiert 1:1 an die SECURITY-DEFINER-Funktion im app_auth-Schema, damit
-- der /auth/callback-Route-Handler sie via supabase.rpc() aufrufen kann.
--
-- Sichtbarkeit ist auf service_role beschränkt: weder anon noch
-- authenticated dürfen die Provisionierung direkt anstoßen.

create or replace function public.provision_signup_tenant(
  p_user_id            uuid,
  p_slug               text,
  p_company_name       text,
  p_terms_accepted_at  timestamptz
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select app_auth.provision_signup_tenant(p_user_id, p_slug, p_company_name, p_terms_accepted_at);
$$;

revoke all on function public.provision_signup_tenant(uuid, text, text, timestamptz) from public;
revoke all on function public.provision_signup_tenant(uuid, text, text, timestamptz) from anon, authenticated;
grant execute on function public.provision_signup_tenant(uuid, text, text, timestamptz) to service_role;

comment on function public.provision_signup_tenant is
  'Wrapper für app_auth.provision_signup_tenant. Nur service_role darf aufrufen (Self-Signup-Flow).';
