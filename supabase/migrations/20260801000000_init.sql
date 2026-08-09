-- Basis-Migration: Auth-Helper, Multi-Tenancy, Users, Roles, Permissions, Module.
-- Diese Migration legt das Fundament der App an. Alle späteren Domänen-Tabellen
-- (properties, work_orders, ...) verweisen auf tenants(id) und nutzen die
-- app_auth-Helper für RLS.

-- ============================================================================
-- Extensions
-- ============================================================================
create extension if not exists "pgcrypto";
create extension if not exists "uuid-ossp";
create extension if not exists "pg_trgm";

-- ============================================================================
-- Schema für interne Helper (nicht direkt aus dem Client aufrufbar)
-- ============================================================================
create schema if not exists app_auth;

-- ============================================================================
-- Reusable Trigger: updated_at automatisch pflegen
-- ============================================================================
create or replace function app_auth.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ============================================================================
-- tenants
-- ============================================================================
create table public.tenants (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  slug          text not null unique,
  logo_url      text,
  address       jsonb,
  invoice_data  jsonb,
  timezone      text not null default 'Europe/Berlin',
  currency      text not null default 'EUR',
  locale        text not null default 'de-DE',
  status        text not null default 'active' check (status in ('active','suspended','archived')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create trigger tenants_set_updated_at
  before update on public.tenants
  for each row execute function app_auth.set_updated_at();

-- ============================================================================
-- tenant_modules — welche Module sind pro Tenant aktiv
-- ============================================================================
create table public.tenant_modules (
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  module_key  text not null,
  enabled     boolean not null default false,
  config      jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now(),
  primary key (tenant_id, module_key)
);

create trigger tenant_modules_set_updated_at
  before update on public.tenant_modules
  for each row execute function app_auth.set_updated_at();

-- ============================================================================
-- users — Profil-Spiegel für auth.users (nicht auth.users selbst)
-- ============================================================================
create table public.users (
  id                  uuid primary key references auth.users(id) on delete cascade,
  display_name        text,
  avatar_url          text,
  phone               text,
  locale              text not null default 'de-DE',
  notification_prefs  jsonb not null default '{}'::jsonb,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create trigger users_set_updated_at
  before update on public.users
  for each row execute function app_auth.set_updated_at();

-- ============================================================================
-- memberships — welcher User gehört zu welchem Tenant
-- ============================================================================
create table public.memberships (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.users(id) on delete cascade,
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  status      text not null default 'active' check (status in ('active','invited','suspended')),
  is_owner    boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (user_id, tenant_id)
);

create index memberships_tenant_id_idx on public.memberships (tenant_id);

create trigger memberships_set_updated_at
  before update on public.memberships
  for each row execute function app_auth.set_updated_at();

-- ============================================================================
-- roles — pro Tenant konfigurierbar
-- ============================================================================
create table public.roles (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references public.tenants(id) on delete cascade,
  key          text not null,
  name         text not null,
  description  text,
  is_system    boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (tenant_id, key)
);

create index roles_tenant_id_idx on public.roles (tenant_id);

create trigger roles_set_updated_at
  before update on public.roles
  for each row execute function app_auth.set_updated_at();

-- ============================================================================
-- permissions — globale Registry (kein tenant_id, kommt aus Code)
-- ============================================================================
create table public.permissions (
  key          text primary key,
  module_key   text not null,
  action       text not null,
  label_de     text not null,
  description  text,
  scopable     boolean not null default true,
  created_at   timestamptz not null default now()
);

-- ============================================================================
-- role_permissions
-- ============================================================================
create table public.role_permissions (
  role_id         uuid not null references public.roles(id) on delete cascade,
  permission_key  text not null references public.permissions(key) on delete cascade,
  primary key (role_id, permission_key)
);

-- ============================================================================
-- user_roles — User erhält Rolle, optional auf Property/Building beschränkt
-- ============================================================================
create table public.user_roles (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.users(id) on delete cascade,
  role_id      uuid not null references public.roles(id) on delete cascade,
  tenant_id    uuid not null references public.tenants(id) on delete cascade,
  scope_type   text check (scope_type in ('property','building')),
  scope_id     uuid,
  created_at   timestamptz not null default now(),
  created_by   uuid references public.users(id),
  unique (user_id, role_id, tenant_id, scope_type, scope_id)
);

create index user_roles_user_tenant_idx on public.user_roles (user_id, tenant_id);
create index user_roles_scope_idx on public.user_roles (scope_type, scope_id);

-- ============================================================================
-- user_groups — optional gruppierbar (freier Layer für Berechtigungen)
-- ============================================================================
create table public.user_groups (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references public.tenants(id) on delete cascade,
  name         text not null,
  description  text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (tenant_id, name)
);

create trigger user_groups_set_updated_at
  before update on public.user_groups
  for each row execute function app_auth.set_updated_at();

create table public.user_group_members (
  user_group_id  uuid not null references public.user_groups(id) on delete cascade,
  user_id        uuid not null references public.users(id) on delete cascade,
  primary key (user_group_id, user_id)
);

-- ============================================================================
-- app_auth Helpers — nutzen den JWT-Claim `app_tenant_id` (per RPC gesetzt)
-- oder greifen sonst auf die erste aktive Membership zu.
-- ============================================================================

-- Aktuelle User-ID aus JWT
create or replace function app_auth.current_user_id()
returns uuid
language sql
stable
as $$
  select auth.uid();
$$;

-- Aktueller Tenant: aus JWT-Claim `app_tenant_id` (Frontend setzt beim Login),
-- Fallback: erste aktive Membership des Users.
create or replace function app_auth.current_tenant_id()
returns uuid
language plpgsql
stable
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

-- Ist der aktuelle User Mitglied im gegebenen Tenant?
create or replace function app_auth.is_tenant_member(p_tenant_id uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1 from public.memberships m
    where m.tenant_id = p_tenant_id
      and m.user_id = auth.uid()
      and m.status = 'active'
  );
$$;

-- Effektive Permissions des aktuellen Users im aktuellen Tenant.
-- Optional gefiltert nach Scope (property/building), so dass nur Rollen
-- greifen, die entweder tenant-weit oder auf dem gegebenen Scope vergeben sind.
create or replace function app_auth.has_permission(
  p_permission_key text,
  p_scope_type     text default null,
  p_scope_id       uuid default null
)
returns boolean
language sql
stable
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

-- Ist der aktuelle User Owner (organisatorischer Admin) im aktuellen Tenant?
create or replace function app_auth.is_tenant_owner()
returns boolean
language sql
stable
as $$
  select exists (
    select 1 from public.memberships m
    where m.tenant_id = app_auth.current_tenant_id()
      and m.user_id = auth.uid()
      and m.status = 'active'
      and m.is_owner = true
  );
$$;

-- ============================================================================
-- Row Level Security
-- ============================================================================

-- tenants: sichtbar nur, wenn Membership existiert. Update/Delete nur für Owner.
alter table public.tenants enable row level security;

create policy tenants_select on public.tenants
  for select using (app_auth.is_tenant_member(id));

create policy tenants_insert on public.tenants
  for insert with check (false); -- Tenant-Anlage nur via Service-Role

create policy tenants_update on public.tenants
  for update using (app_auth.is_tenant_member(id) and app_auth.is_tenant_owner())
  with check (app_auth.is_tenant_member(id) and app_auth.is_tenant_owner());

-- tenant_modules
alter table public.tenant_modules enable row level security;

create policy tenant_modules_select on public.tenant_modules
  for select using (app_auth.is_tenant_member(tenant_id));

create policy tenant_modules_write on public.tenant_modules
  for all using (
    app_auth.is_tenant_member(tenant_id)
    and app_auth.has_permission('core.tenants.manage')
  )
  with check (
    app_auth.is_tenant_member(tenant_id)
    and app_auth.has_permission('core.tenants.manage')
  );

-- users (Profildaten)
alter table public.users enable row level security;

create policy users_select_self on public.users
  for select using (id = auth.uid());

create policy users_update_self on public.users
  for update using (id = auth.uid()) with check (id = auth.uid());

-- Innerhalb eines Tenants darf man andere Profile sehen, wenn man Membership hat
create policy users_select_via_membership on public.users
  for select using (
    exists (
      select 1
      from public.memberships me
      join public.memberships them on them.tenant_id = me.tenant_id
      where me.user_id = auth.uid()
        and me.status = 'active'
        and them.user_id = users.id
        and them.status = 'active'
    )
  );

-- memberships
alter table public.memberships enable row level security;

create policy memberships_select on public.memberships
  for select using (app_auth.is_tenant_member(tenant_id));

create policy memberships_write on public.memberships
  for all using (
    app_auth.is_tenant_member(tenant_id) and app_auth.has_permission('core.users_roles.edit')
  )
  with check (
    app_auth.is_tenant_member(tenant_id) and app_auth.has_permission('core.users_roles.edit')
  );

-- roles
alter table public.roles enable row level security;

create policy roles_select on public.roles
  for select using (app_auth.is_tenant_member(tenant_id));

create policy roles_write on public.roles
  for all using (
    app_auth.is_tenant_member(tenant_id) and app_auth.has_permission('core.users_roles.manage')
  )
  with check (
    app_auth.is_tenant_member(tenant_id) and app_auth.has_permission('core.users_roles.manage')
  );

-- role_permissions
alter table public.role_permissions enable row level security;

create policy role_permissions_select on public.role_permissions
  for select using (
    exists (
      select 1 from public.roles r
      where r.id = role_permissions.role_id
        and app_auth.is_tenant_member(r.tenant_id)
    )
  );

create policy role_permissions_write on public.role_permissions
  for all using (
    exists (
      select 1 from public.roles r
      where r.id = role_permissions.role_id
        and app_auth.is_tenant_member(r.tenant_id)
        and app_auth.has_permission('core.users_roles.manage')
    )
  )
  with check (
    exists (
      select 1 from public.roles r
      where r.id = role_permissions.role_id
        and app_auth.is_tenant_member(r.tenant_id)
        and app_auth.has_permission('core.users_roles.manage')
    )
  );

-- user_roles
alter table public.user_roles enable row level security;

create policy user_roles_select on public.user_roles
  for select using (
    app_auth.is_tenant_member(tenant_id)
    and (user_id = auth.uid() or app_auth.has_permission('core.users_roles.view'))
  );

create policy user_roles_write on public.user_roles
  for all using (
    app_auth.is_tenant_member(tenant_id) and app_auth.has_permission('core.users_roles.edit')
  )
  with check (
    app_auth.is_tenant_member(tenant_id) and app_auth.has_permission('core.users_roles.edit')
  );

-- user_groups
alter table public.user_groups enable row level security;

create policy user_groups_select on public.user_groups
  for select using (app_auth.is_tenant_member(tenant_id));

create policy user_groups_write on public.user_groups
  for all using (
    app_auth.is_tenant_member(tenant_id) and app_auth.has_permission('core.users_roles.manage')
  )
  with check (
    app_auth.is_tenant_member(tenant_id) and app_auth.has_permission('core.users_roles.manage')
  );

-- user_group_members
alter table public.user_group_members enable row level security;

create policy user_group_members_select on public.user_group_members
  for select using (
    exists (
      select 1 from public.user_groups g
      where g.id = user_group_members.user_group_id
        and app_auth.is_tenant_member(g.tenant_id)
    )
  );

create policy user_group_members_write on public.user_group_members
  for all using (
    exists (
      select 1 from public.user_groups g
      where g.id = user_group_members.user_group_id
        and app_auth.is_tenant_member(g.tenant_id)
        and app_auth.has_permission('core.users_roles.manage')
    )
  )
  with check (
    exists (
      select 1 from public.user_groups g
      where g.id = user_group_members.user_group_id
        and app_auth.is_tenant_member(g.tenant_id)
        and app_auth.has_permission('core.users_roles.manage')
    )
  );

-- permissions ist eine Read-Only-Registry für alle authenticated Users
alter table public.permissions enable row level security;
create policy permissions_select on public.permissions
  for select to authenticated using (true);

-- ============================================================================
-- Trigger: Beim Anlegen eines neuen auth.users-Datensatzes automatisch
-- ein leeres Profil in public.users spiegeln.
-- ============================================================================
create or replace function app_auth.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.users (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', new.email))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function app_auth.handle_new_auth_user();

-- ============================================================================
-- Permissions sync — die Registry wird aus dem App-Code beim Deploy gepflegt.
-- Der Seed hier legt nur ein Minimalset an, damit die Migration lokal isoliert
-- lauffähig ist. Der Vollstand wird durch `pnpm tsx supabase/seed/permissions.ts`
-- aus src/lib/permissions/registry.ts synchronisiert.
-- ============================================================================
insert into public.permissions (key, module_key, action, label_de, description, scopable) values
  ('core.tenants.view',        'core.tenants',      'view',   'Mandant ansehen',        null, false),
  ('core.tenants.edit',        'core.tenants',      'edit',   'Mandant bearbeiten',     null, false),
  ('core.tenants.manage',      'core.tenants',      'manage', 'Module verwalten',       null, false),
  ('core.users_roles.view',    'core.users_roles',  'view',   'Benutzer ansehen',       null, false),
  ('core.users_roles.create',  'core.users_roles',  'create', 'Benutzer einladen',      null, false),
  ('core.users_roles.edit',    'core.users_roles',  'edit',   'Benutzer bearbeiten',    null, false),
  ('core.users_roles.delete',  'core.users_roles',  'delete', 'Benutzer entfernen',     null, false),
  ('core.users_roles.manage',  'core.users_roles',  'manage', 'Rollen verwalten',       null, false),
  ('core.audit_log.view',      'core.audit_log',    'view',   'Audit-Log einsehen',     null, false)
on conflict (key) do nothing;
