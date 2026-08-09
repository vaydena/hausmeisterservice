-- =============================================================================
-- Domain-Layer: Properties, Buildings, Units, Employees, Work Orders
-- =============================================================================
-- Enthält:
--   properties          — Liegenschaften (Adresse, GPS, Zugangshinweise)
--   buildings           — Gebäude pro Liegenschaft
--   units               — Wohn-/Gewerbeeinheiten pro Gebäude
--   employees           — Mitarbeiter-Profile (1:1 zu users im Tenant)
--   work_orders         — Aufträge inkl. Notfallaufträgen
--   work_order_events   — Timeline (Statuswechsel, Kommentare, Zuweisungen)
--   work_order_photos   — Foto-Anhänge (Storage-Referenzen)
--
-- Alle Tabellen: tenant-scoped, RLS aktiv, Permission-basiert.
-- Property-Scope wird über app_auth.has_permission(<key>, 'property', <id>)
-- ausgewertet, wenn der Kontext ein Property betrifft.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. properties
-- -----------------------------------------------------------------------------

create table public.properties (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  code text,
  name text not null,
  property_type text,
  street text,
  house_number text,
  postal_code text,
  city text,
  country text default 'DE',
  gps_lat numeric(9, 6),
  gps_lng numeric(9, 6),
  notes text,
  access_notes text,
  emergency_notes text,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  unique (tenant_id, code)
);

create index properties_tenant_id_idx on public.properties(tenant_id);
create index properties_name_trgm_idx on public.properties using gin (name extensions.gin_trgm_ops);
create index properties_active_idx on public.properties(tenant_id) where deleted_at is null;

create trigger properties_set_updated_at
  before update on public.properties
  for each row execute function app_auth.set_updated_at();

alter table public.properties enable row level security;

create policy "properties_select" on public.properties
  for select to authenticated
  using (
    deleted_at is null
    and app_auth.is_tenant_member(tenant_id)
    and app_auth.has_permission('properties.view', 'property', id)
  );

create policy "properties_insert" on public.properties
  for insert to authenticated
  with check (
    tenant_id = app_auth.current_tenant_id()
    and app_auth.has_permission('properties.create')
  );

create policy "properties_update" on public.properties
  for update to authenticated
  using (
    app_auth.is_tenant_member(tenant_id)
    and app_auth.has_permission('properties.edit', 'property', id)
  )
  with check (
    tenant_id = app_auth.current_tenant_id()
    and app_auth.has_permission('properties.edit', 'property', id)
  );

create policy "properties_delete" on public.properties
  for delete to authenticated
  using (
    app_auth.is_tenant_member(tenant_id)
    and app_auth.has_permission('properties.delete', 'property', id)
  );

-- -----------------------------------------------------------------------------
-- 2. buildings
-- -----------------------------------------------------------------------------

create table public.buildings (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  property_id uuid not null references public.properties(id) on delete cascade,
  code text,
  name text not null,
  floors smallint,
  year_built smallint,
  notes text,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  unique (property_id, code)
);

create index buildings_tenant_id_idx on public.buildings(tenant_id);
create index buildings_property_id_idx on public.buildings(property_id);

create trigger buildings_set_updated_at
  before update on public.buildings
  for each row execute function app_auth.set_updated_at();

alter table public.buildings enable row level security;

create policy "buildings_select" on public.buildings
  for select to authenticated
  using (
    app_auth.is_tenant_member(tenant_id)
    and app_auth.has_permission('properties.view', 'property', property_id)
  );

create policy "buildings_insert" on public.buildings
  for insert to authenticated
  with check (
    tenant_id = app_auth.current_tenant_id()
    and app_auth.has_permission('properties.create', 'property', property_id)
  );

create policy "buildings_update" on public.buildings
  for update to authenticated
  using (
    app_auth.is_tenant_member(tenant_id)
    and app_auth.has_permission('properties.edit', 'property', property_id)
  )
  with check (
    tenant_id = app_auth.current_tenant_id()
    and app_auth.has_permission('properties.edit', 'property', property_id)
  );

create policy "buildings_delete" on public.buildings
  for delete to authenticated
  using (
    app_auth.is_tenant_member(tenant_id)
    and app_auth.has_permission('properties.delete', 'property', property_id)
  );

-- -----------------------------------------------------------------------------
-- 3. units
-- -----------------------------------------------------------------------------

create table public.units (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  property_id uuid not null references public.properties(id) on delete cascade,
  building_id uuid not null references public.buildings(id) on delete cascade,
  code text not null,
  floor smallint,
  rooms numeric(3, 1),
  size_sqm numeric(8, 2),
  unit_type text,
  notes text,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  unique (building_id, code)
);

create index units_tenant_id_idx on public.units(tenant_id);
create index units_building_id_idx on public.units(building_id);
create index units_property_id_idx on public.units(property_id);

create trigger units_set_updated_at
  before update on public.units
  for each row execute function app_auth.set_updated_at();

alter table public.units enable row level security;

create policy "units_select" on public.units
  for select to authenticated
  using (
    app_auth.is_tenant_member(tenant_id)
    and app_auth.has_permission('properties.view', 'property', property_id)
  );

create policy "units_insert" on public.units
  for insert to authenticated
  with check (
    tenant_id = app_auth.current_tenant_id()
    and app_auth.has_permission('properties.create', 'property', property_id)
  );

create policy "units_update" on public.units
  for update to authenticated
  using (
    app_auth.is_tenant_member(tenant_id)
    and app_auth.has_permission('properties.edit', 'property', property_id)
  )
  with check (
    tenant_id = app_auth.current_tenant_id()
    and app_auth.has_permission('properties.edit', 'property', property_id)
  );

create policy "units_delete" on public.units
  for delete to authenticated
  using (
    app_auth.is_tenant_member(tenant_id)
    and app_auth.has_permission('properties.delete', 'property', property_id)
  );

-- -----------------------------------------------------------------------------
-- 4. Konsistenz-Trigger: units.building.property_id muss zu units.property_id passen
-- -----------------------------------------------------------------------------

create or replace function app_auth.check_unit_property_consistency()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_building_property_id uuid;
begin
  select property_id into v_building_property_id
  from public.buildings
  where id = new.building_id;

  if v_building_property_id is null then
    raise exception 'building_id % existiert nicht', new.building_id;
  end if;

  if v_building_property_id <> new.property_id then
    raise exception 'units.property_id (%) muss buildings.property_id (%) entsprechen',
      new.property_id, v_building_property_id;
  end if;

  return new;
end;
$$;

create trigger units_check_property_consistency
  before insert or update of building_id, property_id on public.units
  for each row execute function app_auth.check_unit_property_consistency();

-- -----------------------------------------------------------------------------
-- 5. employees
-- -----------------------------------------------------------------------------

create table public.employees (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  employment_status text not null default 'active'
    check (employment_status in ('active', 'on_leave', 'terminated')),
  hire_date date,
  termination_date date,
  hourly_rate numeric(10, 2),
  skills text[] not null default '{}',
  phone text,
  notes text,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  unique (tenant_id, user_id)
);

create index employees_tenant_id_idx on public.employees(tenant_id);
create index employees_user_id_idx on public.employees(user_id);
create index employees_status_idx on public.employees(tenant_id, employment_status);

create trigger employees_set_updated_at
  before update on public.employees
  for each row execute function app_auth.set_updated_at();

alter table public.employees enable row level security;

-- Jeder Tenant-Member sieht sich selbst (auch ohne employees.view).
create policy "employees_select_self" on public.employees
  for select to authenticated
  using (
    user_id = auth.uid()
    and app_auth.is_tenant_member(tenant_id)
  );

create policy "employees_select_permitted" on public.employees
  for select to authenticated
  using (
    app_auth.is_tenant_member(tenant_id)
    and app_auth.has_permission('employees.view')
  );

create policy "employees_insert" on public.employees
  for insert to authenticated
  with check (
    tenant_id = app_auth.current_tenant_id()
    and app_auth.has_permission('employees.create')
  );

create policy "employees_update" on public.employees
  for update to authenticated
  using (
    app_auth.is_tenant_member(tenant_id)
    and app_auth.has_permission('employees.edit')
  )
  with check (
    tenant_id = app_auth.current_tenant_id()
    and app_auth.has_permission('employees.edit')
  );

create policy "employees_delete" on public.employees
  for delete to authenticated
  using (
    app_auth.is_tenant_member(tenant_id)
    and app_auth.has_permission('employees.delete')
  );

-- -----------------------------------------------------------------------------
-- 6. work_orders
-- -----------------------------------------------------------------------------

create table public.work_orders (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  code text,
  title text not null,
  description text,
  category text,
  priority text not null default 'normal'
    check (priority in ('low', 'normal', 'high', 'emergency')),
  status text not null default 'new'
    check (status in ('new', 'planned', 'in_progress', 'blocked', 'done', 'cancelled')),
  property_id uuid not null references public.properties(id) on delete restrict,
  building_id uuid references public.buildings(id) on delete set null,
  unit_id uuid references public.units(id) on delete set null,
  reporter_kind text check (reporter_kind in ('employee', 'resident', 'owner', 'system')),
  reporter_id uuid,
  reporter_note text,
  assignee_id uuid references public.employees(id) on delete set null,
  planned_start timestamptz,
  planned_end timestamptz,
  deadline timestamptz,
  estimated_minutes integer,
  actual_minutes integer,
  is_emergency boolean not null default false,
  closed_at timestamptz,
  closed_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  deleted_at timestamptz,
  unique (tenant_id, code)
);

create index work_orders_tenant_id_idx on public.work_orders(tenant_id);
create index work_orders_property_id_idx on public.work_orders(property_id);
create index work_orders_assignee_id_idx on public.work_orders(assignee_id);
create index work_orders_status_idx on public.work_orders(tenant_id, status) where deleted_at is null;
create index work_orders_open_idx on public.work_orders(tenant_id, priority, created_at desc)
  where deleted_at is null and status not in ('done', 'cancelled');
create index work_orders_title_trgm_idx on public.work_orders using gin (title extensions.gin_trgm_ops);

create trigger work_orders_set_updated_at
  before update on public.work_orders
  for each row execute function app_auth.set_updated_at();

alter table public.work_orders enable row level security;

-- Zuweisungsziel (assignee = eigener User): darf immer sehen.
create policy "work_orders_select_assignee" on public.work_orders
  for select to authenticated
  using (
    deleted_at is null
    and app_auth.is_tenant_member(tenant_id)
    and assignee_id in (select id from public.employees where user_id = auth.uid())
  );

create policy "work_orders_select_permitted" on public.work_orders
  for select to authenticated
  using (
    deleted_at is null
    and app_auth.is_tenant_member(tenant_id)
    and app_auth.has_permission('work_orders.view', 'property', property_id)
  );

create policy "work_orders_insert" on public.work_orders
  for insert to authenticated
  with check (
    tenant_id = app_auth.current_tenant_id()
    and app_auth.has_permission('work_orders.create', 'property', property_id)
  );

-- Bearbeitung: entweder .edit-Permission auf Property oder Zugewiesener mit .close/.edit auf sich.
create policy "work_orders_update" on public.work_orders
  for update to authenticated
  using (
    app_auth.is_tenant_member(tenant_id)
    and (
      app_auth.has_permission('work_orders.edit', 'property', property_id)
      or (
        assignee_id in (select id from public.employees where user_id = auth.uid())
        and app_auth.has_permission('work_orders.edit')
      )
    )
  )
  with check (
    tenant_id = app_auth.current_tenant_id()
    and (
      app_auth.has_permission('work_orders.edit', 'property', property_id)
      or (
        assignee_id in (select id from public.employees where user_id = auth.uid())
        and app_auth.has_permission('work_orders.edit')
      )
    )
  );

create policy "work_orders_delete" on public.work_orders
  for delete to authenticated
  using (
    app_auth.is_tenant_member(tenant_id)
    and app_auth.has_permission('work_orders.delete', 'property', property_id)
  );

-- -----------------------------------------------------------------------------
-- 7. work_order_events (Timeline)
-- -----------------------------------------------------------------------------

create table public.work_order_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  work_order_id uuid not null references public.work_orders(id) on delete cascade,
  event_kind text not null
    check (event_kind in ('status_change', 'assignment', 'comment', 'attachment', 'created')),
  old_value jsonb,
  new_value jsonb,
  comment text,
  actor_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index work_order_events_work_order_id_idx on public.work_order_events(work_order_id, created_at desc);
create index work_order_events_tenant_id_idx on public.work_order_events(tenant_id);

alter table public.work_order_events enable row level security;

-- Sichtbarkeit an work_orders koppeln: wer den Auftrag sehen darf, sieht auch Events.
create policy "work_order_events_select" on public.work_order_events
  for select to authenticated
  using (
    app_auth.is_tenant_member(tenant_id)
    and exists (
      select 1 from public.work_orders wo
      where wo.id = work_order_events.work_order_id
        and wo.deleted_at is null
    )
  );

create policy "work_order_events_insert" on public.work_order_events
  for insert to authenticated
  with check (
    tenant_id = app_auth.current_tenant_id()
    and exists (
      select 1 from public.work_orders wo
      where wo.id = work_order_events.work_order_id
        and wo.tenant_id = work_order_events.tenant_id
    )
  );

-- -----------------------------------------------------------------------------
-- 8. work_order_photos
-- -----------------------------------------------------------------------------

create table public.work_order_photos (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  work_order_id uuid not null references public.work_orders(id) on delete cascade,
  storage_path text not null,
  caption text,
  uploaded_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index work_order_photos_work_order_id_idx on public.work_order_photos(work_order_id);
create index work_order_photos_tenant_id_idx on public.work_order_photos(tenant_id);

alter table public.work_order_photos enable row level security;

create policy "work_order_photos_select" on public.work_order_photos
  for select to authenticated
  using (
    app_auth.is_tenant_member(tenant_id)
    and app_auth.has_permission('photos.view')
    and exists (
      select 1 from public.work_orders wo
      where wo.id = work_order_photos.work_order_id
        and wo.deleted_at is null
    )
  );

create policy "work_order_photos_insert" on public.work_order_photos
  for insert to authenticated
  with check (
    tenant_id = app_auth.current_tenant_id()
    and app_auth.has_permission('photos.create')
    and exists (
      select 1 from public.work_orders wo
      where wo.id = work_order_photos.work_order_id
        and wo.tenant_id = work_order_photos.tenant_id
    )
  );

create policy "work_order_photos_delete" on public.work_order_photos
  for delete to authenticated
  using (
    app_auth.is_tenant_member(tenant_id)
    and app_auth.has_permission('photos.delete')
  );

-- -----------------------------------------------------------------------------
-- 9. Automatisches Event: status_change auf work_orders
-- -----------------------------------------------------------------------------

create or replace function app_auth.log_work_order_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Statuswechsel
  if tg_op = 'UPDATE' and new.status is distinct from old.status then
    insert into public.work_order_events (tenant_id, work_order_id, event_kind, old_value, new_value, actor_id)
    values (new.tenant_id, new.id, 'status_change',
      jsonb_build_object('status', old.status),
      jsonb_build_object('status', new.status),
      auth.uid());
  end if;

  -- Zuweisungsänderung
  if tg_op = 'UPDATE' and new.assignee_id is distinct from old.assignee_id then
    insert into public.work_order_events (tenant_id, work_order_id, event_kind, old_value, new_value, actor_id)
    values (new.tenant_id, new.id, 'assignment',
      jsonb_build_object('assignee_id', old.assignee_id),
      jsonb_build_object('assignee_id', new.assignee_id),
      auth.uid());
  end if;

  -- Neuanlage
  if tg_op = 'INSERT' then
    insert into public.work_order_events (tenant_id, work_order_id, event_kind, new_value, actor_id)
    values (new.tenant_id, new.id, 'created',
      jsonb_build_object('title', new.title, 'priority', new.priority, 'status', new.status),
      auth.uid());
  end if;

  return new;
end;
$$;

create trigger work_orders_log_change
  after insert or update of status, assignee_id on public.work_orders
  for each row execute function app_auth.log_work_order_change();

-- -----------------------------------------------------------------------------
-- 10. Auto-Code-Generierung für work_orders (WO-YYYY-NNNN pro Tenant)
-- -----------------------------------------------------------------------------

create or replace function app_auth.generate_work_order_code()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_year text := to_char(now() at time zone 'Europe/Berlin', 'YYYY');
  v_seq integer;
begin
  if new.code is not null and length(new.code) > 0 then
    return new;
  end if;

  select coalesce(max(
    nullif(regexp_replace(code, '^WO-' || v_year || '-', ''), '')::integer
  ), 0) + 1
  into v_seq
  from public.work_orders
  where tenant_id = new.tenant_id
    and code like 'WO-' || v_year || '-%';

  new.code := 'WO-' || v_year || '-' || lpad(v_seq::text, 4, '0');
  return new;
end;
$$;

create trigger work_orders_generate_code
  before insert on public.work_orders
  for each row execute function app_auth.generate_work_order_code();

-- -----------------------------------------------------------------------------
-- 11. Auto-Code-Generierung für properties (P-NNN pro Tenant, wenn leer)
-- -----------------------------------------------------------------------------

create or replace function app_auth.generate_property_code()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_seq integer;
begin
  if new.code is not null and length(new.code) > 0 then
    return new;
  end if;

  select coalesce(max(
    nullif(regexp_replace(code, '^P-', ''), '')::integer
  ), 0) + 1
  into v_seq
  from public.properties
  where tenant_id = new.tenant_id
    and code ~ '^P-\d+$';

  new.code := 'P-' || lpad(v_seq::text, 3, '0');
  return new;
end;
$$;

create trigger properties_generate_code
  before insert on public.properties
  for each row execute function app_auth.generate_property_code();
