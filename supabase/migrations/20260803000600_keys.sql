-- =============================================================================
-- Keys — Schlüsselverwaltung
-- =============================================================================
-- Zwei Tabellen:
--   * keys              — Schlüsselstamm (Objekt-scoped, mit copies_total)
--   * key_handovers     — Ausgabe/Rückgabe/Verlust/Verschrottung (append-only)
--
-- „Aktuell rausgegeben" wird nicht denormalisiert, sondern per Query gebildet:
-- ein `issue`-Event gilt als offen, solange kein `return` mit
-- issue_handover_id = <issue.id> existiert (partieller Index bedient das).
--
-- RLS ist property-scoped analog zu defect_reports/work_orders. Handovers
-- erben property_id denormalisiert für RLS-Speed.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- keys
-- -----------------------------------------------------------------------------

create table public.keys (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  code text,
  label text not null check (length(label) between 1 and 200),
  identifier text check (identifier is null or length(identifier) between 1 and 100),
  kind text not null default 'other'
    check (kind in ('main', 'apartment', 'mailbox', 'basement', 'technical', 'gate', 'transponder', 'other')),
  property_id uuid not null references public.properties(id) on delete restrict,
  building_id uuid references public.buildings(id) on delete set null,
  unit_id uuid references public.units(id) on delete set null,
  copies_total integer not null default 1 check (copies_total > 0),
  status text not null default 'active'
    check (status in ('active', 'lost', 'retired')),
  storage_location text check (storage_location is null or length(storage_location) <= 200),
  notes text check (notes is null or length(notes) <= 2000),
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  unique (tenant_id, code)
);

create index keys_tenant_id_idx on public.keys(tenant_id);
create index keys_property_id_idx on public.keys(property_id);
create index keys_building_id_idx on public.keys(building_id) where building_id is not null;
create index keys_unit_id_idx on public.keys(unit_id) where unit_id is not null;
create index keys_status_idx on public.keys(tenant_id, status) where deleted_at is null;
create index keys_label_trgm_idx on public.keys using gin (label extensions.gin_trgm_ops);
create index keys_created_by_idx on public.keys(created_by);
create index keys_updated_by_idx on public.keys(updated_by);

create trigger keys_set_updated_at
  before update on public.keys
  for each row execute function app_auth.set_updated_at();

alter table public.keys enable row level security;

create policy "keys_select" on public.keys
  for select to authenticated
  using (
    app_auth.is_tenant_member(tenant_id)
    and app_auth.has_permission('keys.view', 'property', property_id)
  );

create policy "keys_insert" on public.keys
  for insert to authenticated
  with check (
    tenant_id = app_auth.current_tenant_id()
    and app_auth.has_permission('keys.create', 'property', property_id)
  );

create policy "keys_update" on public.keys
  for update to authenticated
  using (
    app_auth.is_tenant_member(tenant_id)
    and app_auth.has_permission('keys.edit', 'property', property_id)
  )
  with check (
    tenant_id = app_auth.current_tenant_id()
    and app_auth.has_permission('keys.edit', 'property', property_id)
  );

-- Kein DELETE: Historie bleibt. Löschen via `deleted_at` (Soft-Delete) durch Update.

-- -----------------------------------------------------------------------------
-- Auto-Code KE-YYYY-NNNN pro Tenant
-- -----------------------------------------------------------------------------

create or replace function app_auth.generate_key_code()
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
    nullif(regexp_replace(code, '^KE-' || v_year || '-', ''), '')::integer
  ), 0) + 1
  into v_seq
  from public.keys
  where tenant_id = new.tenant_id
    and code like 'KE-' || v_year || '-%';

  new.code := 'KE-' || v_year || '-' || lpad(v_seq::text, 4, '0');
  return new;
end;
$$;

create trigger keys_generate_code
  before insert on public.keys
  for each row execute function app_auth.generate_key_code();

-- -----------------------------------------------------------------------------
-- key_handovers
-- -----------------------------------------------------------------------------

create table public.key_handovers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  key_id uuid not null references public.keys(id) on delete restrict,
  property_id uuid not null references public.properties(id) on delete restrict,
  kind text not null
    check (kind in ('issue', 'return', 'lost', 'retired', 'replaced')),
  happened_at timestamptz not null default now(),
  expected_return_at timestamptz,
  holder_kind text
    check (holder_kind is null or holder_kind in ('employee', 'resident', 'owner', 'external')),
  holder_user_id uuid references auth.users(id) on delete set null,
  holder_name text check (holder_name is null or length(holder_name) between 1 and 200),
  holder_contact text check (holder_contact is null or length(holder_contact) <= 200),
  issue_handover_id uuid references public.key_handovers(id) on delete set null,
  reference_work_order_id uuid references public.work_orders(id) on delete set null,
  copies_count integer not null default 1 check (copies_count > 0),
  performed_by uuid references auth.users(id) on delete set null,
  note text check (note is null or length(note) <= 2000),
  created_at timestamptz not null default now(),

  constraint key_handovers_shape check (
    case kind
      when 'issue' then holder_kind is not null and (holder_user_id is not null or holder_name is not null) and issue_handover_id is null
      when 'return' then issue_handover_id is not null
      when 'lost' then true
      when 'retired' then true
      when 'replaced' then true
      else false
    end
  )
);

create index key_handovers_tenant_time_idx on public.key_handovers(tenant_id, happened_at desc);
create index key_handovers_key_time_idx on public.key_handovers(key_id, happened_at desc);
create index key_handovers_property_time_idx on public.key_handovers(property_id, happened_at desc);
create index key_handovers_holder_user_idx on public.key_handovers(holder_user_id) where holder_user_id is not null;
create index key_handovers_ref_wo_idx on public.key_handovers(reference_work_order_id) where reference_work_order_id is not null;
create index key_handovers_performed_by_idx on public.key_handovers(performed_by);
create index key_handovers_issue_ref_idx on public.key_handovers(issue_handover_id) where issue_handover_id is not null;
create index key_handovers_open_issue_idx on public.key_handovers(key_id, happened_at)
  where kind = 'issue';

alter table public.key_handovers enable row level security;

-- Sehen: Property-scoped, ODER Halter darf eigene Vorgänge immer sehen (auch
-- ohne keys.view auf dem Objekt — Bewohner mit Schlüssel muss Ausgabe/Rückgabe
-- nachvollziehen können).
create policy "key_handovers_select_own_holder" on public.key_handovers
  for select to authenticated
  using (
    holder_user_id = (select auth.uid())
    and app_auth.is_tenant_member(tenant_id)
  );

create policy "key_handovers_select_permitted" on public.key_handovers
  for select to authenticated
  using (
    app_auth.is_tenant_member(tenant_id)
    and app_auth.has_permission('keys.view', 'property', property_id)
  );

-- Anlegen: keys.assign (Ausgabe/Rückgabe) — property-scoped.
create policy "key_handovers_insert" on public.key_handovers
  for insert to authenticated
  with check (
    tenant_id = app_auth.current_tenant_id()
    and app_auth.has_permission('keys.assign', 'property', property_id)
  );

-- Kein UPDATE/DELETE auf handovers — append-only Historie.
