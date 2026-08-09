-- Härtungs-Migration: search_path auf allen app_auth-Funktionen fixieren
-- und pg_trgm aus dem public-Schema in ein extensions-Schema verschieben.
-- Adressiert Supabase-Linter-Warnungen 0011 (function_search_path_mutable)
-- und 0014 (extension_in_public).

-- ----------------------------------------------------------------------------
-- Funktionen mit explizitem, leerem search_path neu definieren.
-- Alle Objektzugriffe sind bereits schema-qualifiziert (public.*, auth.*),
-- daher hat der leere search_path keine funktionalen Auswirkungen.
-- ----------------------------------------------------------------------------
create or replace function app_auth.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function app_auth.current_user_id()
returns uuid
language sql
stable
set search_path = ''
as $$
  select auth.uid();
$$;

create or replace function app_auth.current_tenant_id()
returns uuid
language plpgsql
stable
set search_path = ''
as $$
declare
  claim_tenant uuid;
  fallback     uuid;
begin
  begin
    claim_tenant := nullif(current_setting('request.jwt.claims', true)::jsonb->>'app_tenant_id', '')::uuid;
  exception when others then
    claim_tenant := null;
  end;

  if claim_tenant is not null then
    return claim_tenant;
  end if;

  select m.tenant_id into fallback
  from public.memberships m
  where m.user_id = auth.uid() and m.status = 'active'
  order by m.created_at
  limit 1;

  return fallback;
end;
$$;

create or replace function app_auth.is_tenant_member(p_tenant_id uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (
    select 1 from public.memberships m
    where m.tenant_id = p_tenant_id
      and m.user_id = auth.uid()
      and m.status = 'active'
  );
$$;

create or replace function app_auth.has_permission(
  p_permission_key text,
  p_scope_type     text default null,
  p_scope_id       uuid default null
)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (
    select 1
    from public.user_roles ur
    join public.role_permissions rp on rp.role_id = ur.role_id
    where ur.user_id = auth.uid()
      and ur.tenant_id = app_auth.current_tenant_id()
      and rp.permission_key = p_permission_key
      and (
        ur.scope_type is null
        or (p_scope_type is not null and ur.scope_type = p_scope_type and ur.scope_id = p_scope_id)
      )
  );
$$;

create or replace function app_auth.is_tenant_owner()
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (
    select 1 from public.memberships m
    where m.tenant_id = app_auth.current_tenant_id()
      and m.user_id = auth.uid()
      and m.status = 'active'
      and m.is_owner = true
  );
$$;

-- handle_new_auth_user hat schon einen search_path (public); trotzdem auf ''
-- setzen und Insert schema-qualifizieren, das ist die Best Practice bei
-- SECURITY DEFINER.
create or replace function app_auth.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.users (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', new.email))
  on conflict (id) do nothing;
  return new;
end;
$$;

-- ----------------------------------------------------------------------------
-- pg_trgm aus public in ein dediziertes extensions-Schema verlegen.
-- Es existieren noch keine Indices, die diese Extension nutzen, daher gefahrlos.
-- ----------------------------------------------------------------------------
create schema if not exists extensions;
alter extension pg_trgm set schema extensions;
