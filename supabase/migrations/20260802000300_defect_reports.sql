-- =============================================================================
-- Defect Reports — Mängelmeldungen (Bewohner / Eigentümer / Personal → Auftrag)
-- =============================================================================
-- Eine defect_report ist die Vorstufe eines work_order. Meldungen werden von
-- Bewohnern, Eigentümern oder Personal erfasst; Objektleiter/Disponent prüfen
-- und wandeln sie in einen work_order um (converted_work_order_id).
--
-- RLS:
--   view  — property-scoped, ODER Reporter darf eigene Meldung immer sehen
--   create — property-scoped (Bewohner mit resident-scope sehen nur ihr Objekt)
--   edit  — property-scoped (nur Objektleiter/Disponent bearbeiten & konvertieren)
-- =============================================================================

create table public.defect_reports (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  code text,
  title text not null,
  description text,
  category text,
  priority text not null default 'normal'
    check (priority in ('low', 'normal', 'high', 'emergency')),
  status text not null default 'new'
    check (status in ('new', 'reviewing', 'converted', 'rejected')),
  property_id uuid not null references public.properties(id) on delete restrict,
  building_id uuid references public.buildings(id) on delete set null,
  unit_id uuid references public.units(id) on delete set null,
  location_details text,
  reporter_kind text not null default 'staff'
    check (reporter_kind in ('resident', 'owner', 'staff', 'anonymous')),
  reporter_name text,
  reporter_contact text,
  reporter_user_id uuid references auth.users(id) on delete set null,
  converted_work_order_id uuid references public.work_orders(id) on delete set null,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  rejection_reason text,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  unique (tenant_id, code)
);

create index defect_reports_tenant_id_idx on public.defect_reports(tenant_id);
create index defect_reports_property_id_idx on public.defect_reports(property_id);
create index defect_reports_status_idx on public.defect_reports(tenant_id, status);
create index defect_reports_open_idx on public.defect_reports(tenant_id, priority, created_at desc)
  where status in ('new', 'reviewing');
create index defect_reports_reporter_user_idx on public.defect_reports(reporter_user_id)
  where reporter_user_id is not null;
create index defect_reports_title_trgm_idx on public.defect_reports using gin (title extensions.gin_trgm_ops);

create trigger defect_reports_set_updated_at
  before update on public.defect_reports
  for each row execute function app_auth.set_updated_at();

alter table public.defect_reports enable row level security;

-- Reporter darf seine eigene Meldung immer sehen (auch ohne .view-Permission).
create policy "defect_reports_select_own" on public.defect_reports
  for select to authenticated
  using (
    reporter_user_id = auth.uid()
    and app_auth.is_tenant_member(tenant_id)
  );

create policy "defect_reports_select_permitted" on public.defect_reports
  for select to authenticated
  using (
    app_auth.is_tenant_member(tenant_id)
    and app_auth.has_permission('defect_reports.view', 'property', property_id)
  );

create policy "defect_reports_insert" on public.defect_reports
  for insert to authenticated
  with check (
    tenant_id = app_auth.current_tenant_id()
    and app_auth.has_permission('defect_reports.create', 'property', property_id)
  );

create policy "defect_reports_update" on public.defect_reports
  for update to authenticated
  using (
    app_auth.is_tenant_member(tenant_id)
    and app_auth.has_permission('defect_reports.edit', 'property', property_id)
  )
  with check (
    tenant_id = app_auth.current_tenant_id()
    and app_auth.has_permission('defect_reports.edit', 'property', property_id)
  );

-- Delete bewusst nicht erlaubt: Meldungen bleiben als Historie, werden ggf. abgelehnt.

-- -----------------------------------------------------------------------------
-- Auto-Code-Generierung: DR-YYYY-NNNN pro Tenant
-- -----------------------------------------------------------------------------

create or replace function app_auth.generate_defect_report_code()
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
    nullif(regexp_replace(code, '^DR-' || v_year || '-', ''), '')::integer
  ), 0) + 1
  into v_seq
  from public.defect_reports
  where tenant_id = new.tenant_id
    and code like 'DR-' || v_year || '-%';

  new.code := 'DR-' || v_year || '-' || lpad(v_seq::text, 4, '0');
  return new;
end;
$$;

create trigger defect_reports_generate_code
  before insert on public.defect_reports
  for each row execute function app_auth.generate_defect_report_code();

-- -----------------------------------------------------------------------------
-- Trigger: reviewed_at/reviewed_by automatisch bei Statuswechsel weg von 'new'
-- -----------------------------------------------------------------------------

create or replace function app_auth.mark_defect_report_reviewed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE'
     and new.status is distinct from old.status
     and new.status in ('reviewing', 'converted', 'rejected')
     and new.reviewed_at is null
  then
    new.reviewed_at := now();
    new.reviewed_by := auth.uid();
  end if;
  return new;
end;
$$;

create trigger defect_reports_mark_reviewed
  before update of status on public.defect_reports
  for each row execute function app_auth.mark_defect_report_reviewed();
