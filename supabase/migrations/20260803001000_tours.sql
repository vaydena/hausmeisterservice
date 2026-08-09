-- =============================================================================
-- Tours — Multi-Stopp-Tourenplanung
-- =============================================================================
-- Zwei Tabellen:
--   * tours      — Kopfsatz je Tag/Fahrer/Fahrzeug (tenant-weit, Auto-Code
--                  TR-YYYY-NNNN, Status draft/planned/in_progress/completed/cancelled)
--   * tour_stops — Zwischenstopps mit fester Reihenfolge (UNIQUE per tour)
--
-- Stopps können, aber müssen nicht mit einer Property verknüpft sein
-- (z.B. Materiallager, Werkstatt, Tankstopp). `label` ist immer gesetzt.
-- Die tatsächlichen Ankunfts-/Abfahrtszeiten werden pro Stopp geführt.
-- =============================================================================

create table public.tours (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  code text,
  title text not null check (length(title) between 1 and 200),
  planned_date date not null default (now() at time zone 'Europe/Berlin')::date,
  driver_user_id uuid references auth.users(id) on delete set null,
  vehicle_id uuid references public.vehicles(id) on delete set null,
  status text not null default 'draft'
    check (status in ('draft', 'planned', 'in_progress', 'completed', 'cancelled')),
  started_at timestamptz,
  completed_at timestamptz,
  notes text check (notes is null or length(notes) <= 2000),
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  unique (tenant_id, code)
);

create index tours_tenant_date_idx on public.tours(tenant_id, planned_date desc) where deleted_at is null;
create index tours_status_idx on public.tours(tenant_id, status) where deleted_at is null;
create index tours_driver_idx on public.tours(driver_user_id, planned_date desc) where driver_user_id is not null;
create index tours_vehicle_idx on public.tours(vehicle_id) where vehicle_id is not null;
create index tours_created_by_idx on public.tours(created_by);
create index tours_updated_by_idx on public.tours(updated_by);

create trigger tours_set_updated_at
  before update on public.tours
  for each row execute function app_auth.set_updated_at();

alter table public.tours enable row level security;

create policy "tours_select" on public.tours
  for select to authenticated
  using (
    app_auth.is_tenant_member(tenant_id)
    and app_auth.has_permission('tours.view')
  );

create policy "tours_insert" on public.tours
  for insert to authenticated
  with check (
    tenant_id = app_auth.current_tenant_id()
    and app_auth.has_permission('tours.create')
  );

create policy "tours_update" on public.tours
  for update to authenticated
  using (
    app_auth.is_tenant_member(tenant_id)
    and app_auth.has_permission('tours.edit')
  )
  with check (
    tenant_id = app_auth.current_tenant_id()
    and app_auth.has_permission('tours.edit')
  );

create or replace function app_auth.generate_tour_code()
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
    nullif(regexp_replace(code, '^TR-' || v_year || '-', ''), '')::integer
  ), 0) + 1
  into v_seq
  from public.tours
  where tenant_id = new.tenant_id
    and code like 'TR-' || v_year || '-%';

  new.code := 'TR-' || v_year || '-' || lpad(v_seq::text, 4, '0');
  return new;
end;
$$;

create trigger tours_generate_code
  before insert on public.tours
  for each row execute function app_auth.generate_tour_code();

-- =============================================================================
-- tour_stops
-- =============================================================================

create table public.tour_stops (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  tour_id uuid not null references public.tours(id) on delete cascade,
  sequence integer not null check (sequence >= 1),
  property_id uuid references public.properties(id) on delete set null,
  label text not null check (length(label) between 1 and 200),
  planned_arrival_at timestamptz,
  planned_departure_at timestamptz,
  actual_arrival_at timestamptz,
  actual_departure_at timestamptz,
  status text not null default 'pending'
    check (status in ('pending', 'arrived', 'completed', 'skipped')),
  duration_minutes integer check (duration_minutes is null or duration_minutes between 0 and 1440),
  note text check (note is null or length(note) <= 2000),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  unique (tour_id, sequence),
  constraint tour_stops_planned_order check (
    planned_arrival_at is null
    or planned_departure_at is null
    or planned_departure_at >= planned_arrival_at
  ),
  constraint tour_stops_actual_order check (
    actual_arrival_at is null
    or actual_departure_at is null
    or actual_departure_at >= actual_arrival_at
  )
);

create index tour_stops_tour_seq_idx on public.tour_stops(tour_id, sequence);
create index tour_stops_tenant_idx on public.tour_stops(tenant_id);
create index tour_stops_property_idx on public.tour_stops(property_id) where property_id is not null;
create index tour_stops_status_idx on public.tour_stops(tenant_id, status);
create index tour_stops_created_by_idx on public.tour_stops(created_by);
create index tour_stops_updated_by_idx on public.tour_stops(updated_by);

create trigger tour_stops_set_updated_at
  before update on public.tour_stops
  for each row execute function app_auth.set_updated_at();

alter table public.tour_stops enable row level security;

create policy "tour_stops_select" on public.tour_stops
  for select to authenticated
  using (
    app_auth.is_tenant_member(tenant_id)
    and app_auth.has_permission('tours.view')
  );

create policy "tour_stops_insert" on public.tour_stops
  for insert to authenticated
  with check (
    tenant_id = app_auth.current_tenant_id()
    and app_auth.has_permission('tours.edit')
  );

create policy "tour_stops_update" on public.tour_stops
  for update to authenticated
  using (
    app_auth.is_tenant_member(tenant_id)
    and app_auth.has_permission('tours.edit')
  )
  with check (
    tenant_id = app_auth.current_tenant_id()
    and app_auth.has_permission('tours.edit')
  );

create policy "tour_stops_delete" on public.tour_stops
  for delete to authenticated
  using (
    app_auth.is_tenant_member(tenant_id)
    and app_auth.has_permission('tours.edit')
  );
