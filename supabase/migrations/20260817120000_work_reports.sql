-- =============================================================================
-- Work Reports — Arbeitsberichte mit Unterschrift und Freigabe (property-scoped)
-- =============================================================================
-- Ein Arbeitsbericht dokumentiert eine erbrachte Leistung an einem Objekt
-- (optional zu einem Auftrag): was getan wurde, wie lange, welches Material,
-- plus Unterschrift des Kunden vor Ort. Auto-Code AB-YYYY-NNNN pro Mandant.
--
-- Zwei Zustände: 'draft' (bearbeitbar) und 'approved' (freigegeben, gesperrt).
-- Die Unterschrift (signature_data) ist ein Base64-PNG als Data-URL, direkt aus
-- einem Zeichen-Canvas. Klein genug für eine Textspalte; der CHECK deckelt sie.
--
-- Rechte (alle scopable, Objekt-Scope):
--   view/create/edit/approve/download — siehe permissions/registry.ts.
-- Die UPDATE-Policy lässt edit ODER approve zu; welche Änderung erlaubt ist
-- (Inhalt vs. Freigabe), entscheiden die Server-Actions. RLS kann nicht nach
-- geänderter Spalte unterscheiden.
-- =============================================================================

create table public.work_reports (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  code text,
  property_id uuid not null references public.properties(id) on delete restrict,
  work_order_id uuid references public.work_orders(id) on delete set null,
  title text not null check (length(title) between 1 and 200),
  performed_on date not null default (now() at time zone 'Europe/Berlin')::date,
  description text not null check (length(description) between 1 and 5000),
  minutes_worked integer check (minutes_worked is null or (minutes_worked >= 0 and minutes_worked <= 100000)),
  material_used text check (material_used is null or length(material_used) <= 2000),
  status text not null default 'draft' check (status in ('draft', 'approved')),
  signer_name text check (signer_name is null or length(signer_name) between 1 and 200),
  signature_data text check (signature_data is null or length(signature_data) <= 500000),
  signed_at timestamptz,
  approved_by uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  constraint work_reports_tenant_id_code_key unique (tenant_id, code)
);

create index work_reports_tenant_id_idx on public.work_reports(tenant_id);
create index work_reports_property_idx on public.work_reports(property_id, performed_on desc);
create index work_reports_work_order_idx on public.work_reports(work_order_id) where work_order_id is not null;
create index work_reports_status_idx on public.work_reports(tenant_id, status) where deleted_at is null;
create index work_reports_created_by_idx on public.work_reports(created_by);
create index work_reports_updated_by_idx on public.work_reports(updated_by);
create index work_reports_approved_by_idx on public.work_reports(approved_by) where approved_by is not null;

create trigger work_reports_set_updated_at
  before update on public.work_reports
  for each row execute function app_auth.set_updated_at();

alter table public.work_reports enable row level security;

create policy "work_reports_select" on public.work_reports
  for select to authenticated
  using (
    app_auth.is_tenant_member(tenant_id)
    and app_auth.has_permission('work_reports.view', 'property', property_id)
  );

create policy "work_reports_insert" on public.work_reports
  for insert to authenticated
  with check (
    tenant_id = app_auth.current_tenant_id()
    and app_auth.has_permission('work_reports.create', 'property', property_id)
  );

create policy "work_reports_update" on public.work_reports
  for update to authenticated
  using (
    app_auth.is_tenant_member(tenant_id)
    and (
      app_auth.has_permission('work_reports.edit', 'property', property_id)
      or app_auth.has_permission('work_reports.approve', 'property', property_id)
    )
  )
  with check (
    tenant_id = app_auth.current_tenant_id()
    and (
      app_auth.has_permission('work_reports.edit', 'property', property_id)
      or app_auth.has_permission('work_reports.approve', 'property', property_id)
    )
  );

-- Auto-Code AB-YYYY-NNNN pro Tenant (Vorlage: generate_meter_code)
create or replace function app_auth.generate_work_report_code()
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
    nullif(regexp_replace(code, '^AB-' || v_year || '-', ''), '')::integer
  ), 0) + 1
  into v_seq
  from public.work_reports
  where tenant_id = new.tenant_id
    and code like 'AB-' || v_year || '-%';

  new.code := 'AB-' || v_year || '-' || lpad(v_seq::text, 4, '0');
  return new;
end;
$$;

create trigger work_reports_generate_code
  before insert on public.work_reports
  for each row execute function app_auth.generate_work_report_code();
