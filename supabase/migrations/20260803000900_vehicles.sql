-- =============================================================================
-- Vehicles — Fuhrpark + Ereignis-Historie
-- =============================================================================
-- Zwei Tabellen:
--   * vehicles         — Fahrzeugstamm (tenant-weit, Auto-Code FZ-YYYY-NNNN,
--                         Fristen als direkte Datumsfelder für Sortierung)
--   * vehicle_events   — Historie (append-only): TÜV, Service, Tanken, Reparaturen …
--
-- Fristen (next_tuev_at, next_service_at, insurance_expires_at) sind auf dem
-- Fahrzeug denormalisiert. Beim Erfassen eines Events kann ein `next_due_at`
-- mitgegeben werden — dann aktualisiert der Server-Action das passende Feld
-- (server-seitig, nicht via Trigger, damit die Zuordnung Event→Feld explizit
-- bleibt und der Client sichtbar mitteilen kann, was passiert ist).
-- =============================================================================

create table public.vehicles (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  code text,
  license_plate text not null check (length(license_plate) between 1 and 15),
  make text not null check (length(make) between 1 and 60),
  model text not null check (length(model) between 1 and 60),
  vehicle_type text not null default 'car'
    check (vehicle_type in ('car', 'van', 'truck', 'pickup', 'trailer', 'machinery', 'other')),
  year integer check (year is null or year between 1900 and 2100),
  vin text check (vin is null or length(vin) between 5 and 32),
  fuel_type text not null default 'diesel'
    check (fuel_type in ('petrol', 'diesel', 'electric', 'hybrid', 'lpg', 'other')),
  status text not null default 'active'
    check (status in ('active', 'inactive', 'maintenance', 'retired')),
  mileage_km integer check (mileage_km is null or mileage_km >= 0),
  primary_driver_user_id uuid references auth.users(id) on delete set null,
  next_tuev_at date,
  next_service_at date,
  next_service_due_km integer check (next_service_due_km is null or next_service_due_km >= 0),
  insurance_expires_at date,
  storage_location text check (storage_location is null or length(storage_location) <= 200),
  notes text check (notes is null or length(notes) <= 2000),
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  unique (tenant_id, license_plate),
  unique (tenant_id, code)
);

create index vehicles_tenant_id_idx on public.vehicles(tenant_id);
create index vehicles_status_idx on public.vehicles(tenant_id, status) where deleted_at is null;
create index vehicles_type_idx on public.vehicles(tenant_id, vehicle_type) where deleted_at is null;
create index vehicles_driver_idx on public.vehicles(primary_driver_user_id) where primary_driver_user_id is not null;
create index vehicles_tuev_idx on public.vehicles(tenant_id, next_tuev_at) where deleted_at is null and next_tuev_at is not null;
create index vehicles_service_idx on public.vehicles(tenant_id, next_service_at) where deleted_at is null and next_service_at is not null;
create index vehicles_insurance_idx on public.vehicles(tenant_id, insurance_expires_at) where deleted_at is null and insurance_expires_at is not null;
create index vehicles_created_by_idx on public.vehicles(created_by);
create index vehicles_updated_by_idx on public.vehicles(updated_by);

create trigger vehicles_set_updated_at
  before update on public.vehicles
  for each row execute function app_auth.set_updated_at();

alter table public.vehicles enable row level security;

create policy "vehicles_select" on public.vehicles
  for select to authenticated
  using (
    app_auth.is_tenant_member(tenant_id)
    and app_auth.has_permission('vehicles.view')
  );

create policy "vehicles_insert" on public.vehicles
  for insert to authenticated
  with check (
    tenant_id = app_auth.current_tenant_id()
    and app_auth.has_permission('vehicles.create')
  );

create policy "vehicles_update" on public.vehicles
  for update to authenticated
  using (
    app_auth.is_tenant_member(tenant_id)
    and app_auth.has_permission('vehicles.edit')
  )
  with check (
    tenant_id = app_auth.current_tenant_id()
    and app_auth.has_permission('vehicles.edit')
  );

create or replace function app_auth.generate_vehicle_code()
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
    nullif(regexp_replace(code, '^FZ-' || v_year || '-', ''), '')::integer
  ), 0) + 1
  into v_seq
  from public.vehicles
  where tenant_id = new.tenant_id
    and code like 'FZ-' || v_year || '-%';

  new.code := 'FZ-' || v_year || '-' || lpad(v_seq::text, 4, '0');
  return new;
end;
$$;

create trigger vehicles_generate_code
  before insert on public.vehicles
  for each row execute function app_auth.generate_vehicle_code();

-- =============================================================================
-- vehicle_events
-- =============================================================================

create table public.vehicle_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  vehicle_id uuid not null references public.vehicles(id) on delete cascade,
  kind text not null
    check (kind in ('tuev', 'service', 'tire_change', 'repair', 'refuel', 'mileage_reading', 'insurance_renewal', 'other')),
  event_date date not null default (now() at time zone 'Europe/Berlin')::date,
  mileage_km integer check (mileage_km is null or mileage_km >= 0),
  cost_eur numeric(10, 2) check (cost_eur is null or cost_eur >= 0),
  vendor text check (vendor is null or length(vendor) <= 200),
  next_due_at date,
  note text check (note is null or length(note) <= 2000),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null
);

create index vehicle_events_tenant_time_idx on public.vehicle_events(tenant_id, event_date desc);
create index vehicle_events_vehicle_time_idx on public.vehicle_events(vehicle_id, event_date desc);
create index vehicle_events_kind_idx on public.vehicle_events(tenant_id, kind);
create index vehicle_events_created_by_idx on public.vehicle_events(created_by);

alter table public.vehicle_events enable row level security;

create policy "vehicle_events_select" on public.vehicle_events
  for select to authenticated
  using (
    app_auth.is_tenant_member(tenant_id)
    and app_auth.has_permission('vehicles.view')
  );

create policy "vehicle_events_insert" on public.vehicle_events
  for insert to authenticated
  with check (
    tenant_id = app_auth.current_tenant_id()
    and app_auth.has_permission('vehicles.edit')
  );

-- Update/Delete auf Events bewusst nicht erlaubt (Audit).
