-- =============================================================================
-- Meters — Zähler + Ablesungen
-- =============================================================================
-- Zwei Tabellen:
--   * meters          — Zählerstamm (property-scoped, Auto-Code ZM-YYYY-NNNN)
--   * meter_readings  — Ablesungen (append-only, immer aufsteigend außer Reset)
--
-- Verbrauch wird nicht denormalisiert — im UI aus zwei aufeinanderfolgenden
-- Ablesungen (LAG) berechnet. Reset-Ablesungen (`is_reset = true`) markieren
-- einen Zählertausch: die vorherige Ablesung liefert dann NICHT den Basiswert.
-- =============================================================================

create table public.meters (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  code text,
  label text not null check (length(label) between 1 and 200),
  meter_number text check (meter_number is null or length(meter_number) between 1 and 100),
  utility_kind text not null default 'electricity'
    check (utility_kind in ('electricity', 'gas', 'water_cold', 'water_hot', 'heating', 'heat_cost_allocator', 'other')),
  unit_of_measure text not null default 'kWh'
    check (length(unit_of_measure) between 1 and 20),
  property_id uuid not null references public.properties(id) on delete restrict,
  building_id uuid references public.buildings(id) on delete set null,
  unit_id uuid references public.units(id) on delete set null,
  location_note text check (location_note is null or length(location_note) <= 200),
  digits_before integer not null default 5 check (digits_before between 1 and 10),
  digits_after integer not null default 0 check (digits_after between 0 and 4),
  installed_at date,
  last_replacement_at date,
  status text not null default 'active'
    check (status in ('active', 'inactive', 'defective', 'replaced')),
  notes text check (notes is null or length(notes) <= 2000),
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  unique (tenant_id, code)
);

create index meters_tenant_id_idx on public.meters(tenant_id);
create index meters_property_id_idx on public.meters(property_id);
create index meters_building_id_idx on public.meters(building_id) where building_id is not null;
create index meters_unit_id_idx on public.meters(unit_id) where unit_id is not null;
create index meters_status_idx on public.meters(tenant_id, status) where deleted_at is null;
create index meters_label_trgm_idx on public.meters using gin (label extensions.gin_trgm_ops);
create index meters_created_by_idx on public.meters(created_by);
create index meters_updated_by_idx on public.meters(updated_by);

create trigger meters_set_updated_at
  before update on public.meters
  for each row execute function app_auth.set_updated_at();

alter table public.meters enable row level security;

create policy "meters_select" on public.meters
  for select to authenticated
  using (
    app_auth.is_tenant_member(tenant_id)
    and app_auth.has_permission('meters.view', 'property', property_id)
  );

create policy "meters_insert" on public.meters
  for insert to authenticated
  with check (
    tenant_id = app_auth.current_tenant_id()
    and app_auth.has_permission('meters.create', 'property', property_id)
  );

create policy "meters_update" on public.meters
  for update to authenticated
  using (
    app_auth.is_tenant_member(tenant_id)
    and app_auth.has_permission('meters.edit', 'property', property_id)
  )
  with check (
    tenant_id = app_auth.current_tenant_id()
    and app_auth.has_permission('meters.edit', 'property', property_id)
  );

-- Auto-Code ZM-YYYY-NNNN pro Tenant
create or replace function app_auth.generate_meter_code()
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
    nullif(regexp_replace(code, '^ZM-' || v_year || '-', ''), '')::integer
  ), 0) + 1
  into v_seq
  from public.meters
  where tenant_id = new.tenant_id
    and code like 'ZM-' || v_year || '-%';

  new.code := 'ZM-' || v_year || '-' || lpad(v_seq::text, 4, '0');
  return new;
end;
$$;

create trigger meters_generate_code
  before insert on public.meters
  for each row execute function app_auth.generate_meter_code();

-- =============================================================================
-- meter_readings
-- =============================================================================

create table public.meter_readings (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  meter_id uuid not null references public.meters(id) on delete cascade,
  property_id uuid not null references public.properties(id) on delete restrict,
  read_at timestamptz not null default now(),
  reading numeric(14, 4) not null check (reading >= 0),
  source text not null default 'manual'
    check (source in ('manual', 'photo', 'estimated', 'gateway')),
  is_reset boolean not null default false,
  reference_work_order_id uuid references public.work_orders(id) on delete set null,
  note text check (note is null or length(note) <= 2000),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  unique (meter_id, read_at)
);

create index meter_readings_tenant_time_idx on public.meter_readings(tenant_id, read_at desc);
create index meter_readings_meter_time_idx on public.meter_readings(meter_id, read_at desc);
create index meter_readings_property_time_idx on public.meter_readings(property_id, read_at desc);
create index meter_readings_ref_wo_idx on public.meter_readings(reference_work_order_id) where reference_work_order_id is not null;
create index meter_readings_created_by_idx on public.meter_readings(created_by);

alter table public.meter_readings enable row level security;

create policy "meter_readings_select" on public.meter_readings
  for select to authenticated
  using (
    app_auth.is_tenant_member(tenant_id)
    and app_auth.has_permission('meters.view', 'property', property_id)
  );

create policy "meter_readings_insert" on public.meter_readings
  for insert to authenticated
  with check (
    tenant_id = app_auth.current_tenant_id()
    and app_auth.has_permission('meters.edit', 'property', property_id)
  );

-- Update/Delete auf Ablesungen bewusst nicht erlaubt (Audit).
