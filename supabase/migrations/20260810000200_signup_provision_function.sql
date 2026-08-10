-- Sprint 3 · Self-Signup: transaktionale Tenant-Provisionierung nach
-- E-Mail-Verify. Wird aus dem /auth/callback-Route-Handler mit Service-Role
-- aufgerufen. SECURITY DEFINER + leerer search_path folgen dem Muster aus
-- 20260801000100_harden_functions.sql.
--
-- Verhalten:
-- - idempotent: hat der User schon eine Membership, gibt die Funktion diese
--   zurück und macht keinen Insert (schützt vor Doppelklicks auf den
--   Verify-Link).
-- - Slug-Kollisionshandling: wenn der Wunsch-Slug beim Callback bereits
--   vergeben ist (Race-Condition zwischen Signup und Verify), wird
--   `-2`, `-3` … angehängt bis frei.
-- - legt Admin-Rolle mit allen aktuell registrierten Permissions an; die
--   Rolle ist editierbar (is_system = false), damit der Owner sie später
--   anpassen kann.

create or replace function app_auth.provision_signup_tenant(
  p_user_id            uuid,
  p_slug               text,
  p_company_name       text,
  p_terms_accepted_at  timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tenant_id  uuid;
  v_role_id    uuid;
  v_slug       text := p_slug;
  v_counter    int  := 2;
  v_existing   uuid;
begin
  -- Idempotenz: Membership schon vorhanden?
  select m.tenant_id into v_existing
  from public.memberships m
  where m.user_id = p_user_id
  limit 1;

  if v_existing is not null then
    select t.slug into v_slug from public.tenants t where t.id = v_existing;
    return jsonb_build_object('tenant_id', v_existing, 'slug', v_slug, 'created', false);
  end if;

  -- Slug-Kollisionshandling
  while exists (select 1 from public.tenants t where t.slug = v_slug) loop
    v_slug := p_slug || '-' || v_counter::text;
    v_counter := v_counter + 1;
    if v_counter > 100 then
      raise exception 'Kein freier Slug für "%" gefunden', p_slug;
    end if;
  end loop;

  -- Tenant
  insert into public.tenants (name, slug)
  values (p_company_name, v_slug)
  returning id into v_tenant_id;

  -- Admin-Rolle mit allen Permissions
  insert into public.roles (tenant_id, key, name, description, is_system)
  values (
    v_tenant_id,
    'admin',
    'Administrator',
    'Voller Zugriff auf alle Funktionen des Mandanten.',
    false
  )
  returning id into v_role_id;

  insert into public.role_permissions (role_id, permission_key)
  select v_role_id, p.key from public.permissions p;

  -- Owner-Membership + Rollen-Zuweisung
  insert into public.memberships (user_id, tenant_id, status, is_owner, terms_accepted_at)
  values (p_user_id, v_tenant_id, 'active', true, p_terms_accepted_at);

  insert into public.user_roles (user_id, role_id, tenant_id, created_by)
  values (p_user_id, v_role_id, v_tenant_id, p_user_id);

  return jsonb_build_object('tenant_id', v_tenant_id, 'slug', v_slug, 'created', true);
end;
$$;

-- Absichern: kein Direktaufruf von authenticated / anon. Service-Role
-- ignoriert GRANTs und kann trotzdem ausführen.
revoke all on function app_auth.provision_signup_tenant(uuid, text, text, timestamptz) from public;
revoke all on function app_auth.provision_signup_tenant(uuid, text, text, timestamptz) from anon, authenticated;
