-- =============================================================================
-- Materials — Materialbestand + Bewegungen
-- =============================================================================
-- Zwei Tabellen:
--   * materials       — Materialstamm (tenant-weit, Auto-Code MT-YYYY-NNNN,
--                        current_stock denormalisiert für schnelle Anzeige)
--   * stock_movements — Bewegungen (append-only) mit signed quantity:
--       kind='receipt'    → quantity > 0 (Wareneingang)
--       kind='issue'      → quantity < 0 (Entnahme, meist an einen Auftrag/Objekt)
--       kind='write_off'  → quantity < 0 (Abschreibung / Verlust)
--       kind='adjustment' → quantity != 0 (Inventurkorrektur ± )
--
-- Ein Trigger addiert NEW.quantity auf materials.current_stock (signed → einfach).
-- =============================================================================

create table public.materials (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  code text,
  label text not null check (length(label) between 1 and 200),
  sku text check (sku is null or length(sku) between 1 and 100),
  category text not null default 'other'
    check (category in (
      'cleaning', 'hardware', 'safety', 'electric', 'plumbing',
      'paint', 'garden', 'winter', 'office', 'consumable', 'other'
    )),
  unit text not null default 'Stk' check (length(unit) between 1 and 20),
  min_stock numeric(14, 3) not null default 0 check (min_stock >= 0),
  current_stock numeric(14, 3) not null default 0,
  unit_cost numeric(12, 2) check (unit_cost is null or unit_cost >= 0),
  storage_location text check (storage_location is null or length(storage_location) <= 200),
  supplier text check (supplier is null or length(supplier) <= 200),
  status text not null default 'active'
    check (status in ('active', 'inactive')),
  notes text check (notes is null or length(notes) <= 2000),
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  unique (tenant_id, code)
);

create index materials_tenant_id_idx on public.materials(tenant_id);
create index materials_category_idx on public.materials(tenant_id, category) where deleted_at is null;
create index materials_status_idx on public.materials(tenant_id, status) where deleted_at is null;
create index materials_low_stock_idx on public.materials(tenant_id)
  where deleted_at is null and current_stock < min_stock;
create index materials_label_trgm_idx on public.materials using gin (label extensions.gin_trgm_ops);
create index materials_sku_idx on public.materials(tenant_id, sku) where sku is not null;
create index materials_created_by_idx on public.materials(created_by);
create index materials_updated_by_idx on public.materials(updated_by);

create trigger materials_set_updated_at
  before update on public.materials
  for each row execute function app_auth.set_updated_at();

alter table public.materials enable row level security;

create policy "materials_select" on public.materials
  for select to authenticated
  using (
    app_auth.is_tenant_member(tenant_id)
    and app_auth.has_permission('materials.view')
  );

create policy "materials_insert" on public.materials
  for insert to authenticated
  with check (
    tenant_id = app_auth.current_tenant_id()
    and app_auth.has_permission('materials.create')
  );

create policy "materials_update" on public.materials
  for update to authenticated
  using (
    app_auth.is_tenant_member(tenant_id)
    and app_auth.has_permission('materials.edit')
  )
  with check (
    tenant_id = app_auth.current_tenant_id()
    and app_auth.has_permission('materials.edit')
  );

-- Auto-Code MT-YYYY-NNNN pro Tenant
create or replace function app_auth.generate_material_code()
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
    nullif(regexp_replace(code, '^MT-' || v_year || '-', ''), '')::integer
  ), 0) + 1
  into v_seq
  from public.materials
  where tenant_id = new.tenant_id
    and code like 'MT-' || v_year || '-%';

  new.code := 'MT-' || v_year || '-' || lpad(v_seq::text, 4, '0');
  return new;
end;
$$;

create trigger materials_generate_code
  before insert on public.materials
  for each row execute function app_auth.generate_material_code();

-- =============================================================================
-- stock_movements
-- =============================================================================

create table public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  material_id uuid not null references public.materials(id) on delete cascade,
  kind text not null
    check (kind in ('receipt', 'issue', 'adjustment', 'write_off')),
  quantity numeric(14, 3) not null,
  unit_cost_at_time numeric(12, 2) check (unit_cost_at_time is null or unit_cost_at_time >= 0),
  property_id uuid references public.properties(id) on delete set null,
  building_id uuid references public.buildings(id) on delete set null,
  unit_id uuid references public.units(id) on delete set null,
  work_order_id uuid references public.work_orders(id) on delete set null,
  assignee_user_id uuid references auth.users(id) on delete set null,
  occurred_at timestamptz not null default now(),
  note text check (note is null or length(note) <= 2000),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  constraint stock_movements_signed_by_kind check (
    (kind = 'receipt'    and quantity > 0) or
    (kind = 'issue'      and quantity < 0) or
    (kind = 'write_off'  and quantity < 0) or
    (kind = 'adjustment' and quantity <> 0)
  )
);

create index stock_movements_tenant_time_idx on public.stock_movements(tenant_id, occurred_at desc);
create index stock_movements_material_time_idx on public.stock_movements(material_id, occurred_at desc);
create index stock_movements_kind_idx on public.stock_movements(tenant_id, kind);
create index stock_movements_property_idx on public.stock_movements(property_id) where property_id is not null;
create index stock_movements_building_idx on public.stock_movements(building_id) where building_id is not null;
create index stock_movements_unit_idx on public.stock_movements(unit_id) where unit_id is not null;
create index stock_movements_wo_idx on public.stock_movements(work_order_id) where work_order_id is not null;
create index stock_movements_assignee_idx on public.stock_movements(assignee_user_id) where assignee_user_id is not null;
create index stock_movements_created_by_idx on public.stock_movements(created_by);

alter table public.stock_movements enable row level security;

create policy "stock_movements_select" on public.stock_movements
  for select to authenticated
  using (
    app_auth.is_tenant_member(tenant_id)
    and app_auth.has_permission('materials.view')
  );

-- Entnahme (issue) darf jeder Field-Staff mit materials.assign; sonst materials.edit.
create policy "stock_movements_insert" on public.stock_movements
  for insert to authenticated
  with check (
    tenant_id = app_auth.current_tenant_id()
    and (
      (kind = 'issue' and app_auth.has_permission('materials.assign'))
      or (kind <> 'issue' and app_auth.has_permission('materials.edit'))
    )
  );

-- Update/Delete auf Bewegungen bewusst nicht erlaubt (Audit).

-- =============================================================================
-- Trigger: current_stock nachziehen
-- =============================================================================

create or replace function app_auth.apply_stock_movement()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.materials
     set current_stock = current_stock + new.quantity,
         updated_at    = now()
   where id = new.material_id
     and tenant_id = new.tenant_id;
  return new;
end;
$$;

create trigger stock_movements_apply
  after insert on public.stock_movements
  for each row execute function app_auth.apply_stock_movement();
