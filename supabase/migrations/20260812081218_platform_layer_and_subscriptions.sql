-- Sprint 10.1 · Platform-Layer + Subscription-System
--
-- Führt die Betreiber-Ebene der SaaS ein:
--   * platform.admins           — User mit Cross-Tenant-Vollzugriff (Betreiber der Plattform)
--   * platform.subscription_plans — 3 Pläne (Starter/Business/Enterprise), editierbar via /platform/plans
--   * tenants + Subscription-Spalten (status/plan/interval/trial_ends_at/period_*/payment_method)
--   * platform.invoices          — Betreiber-Rechnungen an Agenturen (nicht mit public.invoices
--                                  verwechseln, das sind Rechnungen die Agenturen selbst an ihre
--                                  Kunden stellen)
--   * app_auth.is_platform_admin() — SECURITY DEFINER Helper
--   * Rechnungs-Sequenz + Number-Generator (HM-YYYY-#####)
--
-- Cross-Tenant-RLS: Platform-Admins bekommen KEINE automatische Sichtbarkeit auf alle
-- Tenant-Daten. Cross-Tenant-Zugriff läuft ausschließlich über Server-Actions mit
-- service_role. Das hält die 47 bestehenden RLS-Policies unverändert und reduziert die
-- Angriffsfläche (kein User-JWT kann versehentlich alles sehen).

-- ============================================================================
-- Schema + Enum
-- ============================================================================

create schema if not exists platform;

create type platform.plan_interval as enum ('monthly', 'yearly');

-- ============================================================================
-- Plattform-Admins
-- ============================================================================

create table platform.admins (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  created_at  timestamptz not null default now()
);

comment on table platform.admins is
  'User mit Cross-Tenant-Zugriff (Betreiber). Nicht mit public.memberships verwechseln — Platform-Admins sind KEIN tenant-scoped Konzept.';

-- ============================================================================
-- Subscription-Plans
-- ============================================================================

create table platform.subscription_plans (
  id                  uuid primary key default gen_random_uuid(),
  code                text not null unique,
  name                text not null,
  description         text,
  monthly_price_cents integer not null check (monthly_price_cents >= 0),
  yearly_price_cents  integer not null check (yearly_price_cents  >= 0),
  max_employees       integer check (max_employees is null or max_employees > 0),
  max_properties      integer check (max_properties is null or max_properties > 0),
  features            jsonb not null default '{}'::jsonb,
  sort_order          integer not null default 0,
  is_public           boolean not null default true,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

comment on column platform.subscription_plans.features is
  'Feature-Flags als jsonb, z.B. {"gps":true,"portal":true,"vehicles":true,"automations":true,"api":true}. Wird vom Feature-Gate assertFeature() gelesen.';

comment on column platform.subscription_plans.max_employees is 'NULL = unlimitiert';
comment on column platform.subscription_plans.max_properties is 'NULL = unlimitiert';

create trigger set_updated_at
  before update on platform.subscription_plans
  for each row execute function app_auth.set_updated_at();

-- ============================================================================
-- tenants erweitern
-- ============================================================================

alter table public.tenants
  add column subscription_plan_id  uuid references platform.subscription_plans(id) on delete restrict,
  add column subscription_interval platform.plan_interval,
  add column subscription_status   text not null default 'trial'
    check (subscription_status in ('trial','active','past_due','suspended','canceled')),
  add column trial_ends_at         timestamptz,
  add column current_period_start  timestamptz,
  add column current_period_end    timestamptz,
  add column payment_method        text not null default 'bank_transfer'
    check (payment_method in ('bank_transfer','stripe'));

create index tenants_subscription_status_idx on public.tenants (subscription_status);
create index tenants_trial_ends_at_idx       on public.tenants (trial_ends_at) where subscription_status = 'trial';

-- Bestehende Tenants (Demo + karbic's Textfirma) starten mit 14-Tage-Trial ab jetzt.
update public.tenants
set trial_ends_at = now() + interval '14 days'
where trial_ends_at is null;

-- ============================================================================
-- Rechnungen (Betreiber → Agentur)
-- ============================================================================

create sequence platform.invoice_number_seq;

create or replace function platform.generate_invoice_number()
returns text
language sql
volatile
security definer
set search_path = ''
as $$
  select 'HM-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('platform.invoice_number_seq')::text, 5, '0');
$$;

grant execute on function platform.generate_invoice_number() to service_role;

create table platform.invoices (
  id                uuid primary key default gen_random_uuid(),
  invoice_number    text not null unique default platform.generate_invoice_number(),
  tenant_id         uuid not null references public.tenants(id) on delete restrict,
  plan_id           uuid not null references platform.subscription_plans(id) on delete restrict,
  plan_interval     platform.plan_interval not null,
  period_start      timestamptz not null,
  period_end        timestamptz not null check (period_end > period_start),
  subtotal_cents    integer not null check (subtotal_cents >= 0),
  total_cents       integer not null check (total_cents >= 0),
  currency          text not null default 'EUR',
  status            text not null default 'open'
    check (status in ('open','paid','canceled','refunded')),
  payment_method    text not null check (payment_method in ('bank_transfer','stripe')),
  paid_at           timestamptz,
  payment_reference text,
  issued_at         timestamptz not null default now(),
  due_at            timestamptz,
  billing_address   jsonb,
  notes             text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

comment on table platform.invoices is
  'Rechnungen vom Plattform-Betreiber an die Agenturen (Tenants). Nicht mit public.invoices verwechseln, das sind Rechnungen die die Agenturen an ihre eigenen Kunden stellen.';

create index platform_invoices_tenant_idx on platform.invoices (tenant_id);
create index platform_invoices_status_idx on platform.invoices (status);
create index platform_invoices_open_idx   on platform.invoices (paid_at) where paid_at is null;

create trigger set_updated_at
  before update on platform.invoices
  for each row execute function app_auth.set_updated_at();

-- ============================================================================
-- Helper: is_platform_admin()
-- ============================================================================

create or replace function app_auth.is_platform_admin(p_user_id uuid default null)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from platform.admins
    where user_id = coalesce(p_user_id, auth.uid())
  );
$$;

comment on function app_auth.is_platform_admin(uuid) is
  'True wenn der übergebene User (oder auth.uid() wenn NULL) ein Plattform-Admin ist. SECURITY DEFINER, damit die Prüfung nicht durch fehlende Schema-Grants blockiert wird.';

grant execute on function app_auth.is_platform_admin(uuid) to anon, authenticated, service_role;

-- ============================================================================
-- RLS
-- ============================================================================

alter table platform.admins             enable row level security;
alter table platform.subscription_plans enable row level security;
alter table platform.invoices           enable row level security;

-- platform.admins: nur Admins selbst sehen die Liste; nur Admins schreiben.
create policy admins_select on platform.admins
  for select to authenticated
  using ( user_id = (select auth.uid()) or app_auth.is_platform_admin() );

create policy admins_insert on platform.admins
  for insert to authenticated
  with check ( app_auth.is_platform_admin() );

create policy admins_delete on platform.admins
  for delete to authenticated
  using ( app_auth.is_platform_admin() );

-- platform.subscription_plans: öffentlich lesbar (für /preise), nur Admins schreiben.
create policy plans_public_select on platform.subscription_plans
  for select
  using ( is_public = true or app_auth.is_platform_admin() );

create policy plans_admin_all on platform.subscription_plans
  for all to authenticated
  using ( app_auth.is_platform_admin() )
  with check ( app_auth.is_platform_admin() );

-- platform.invoices: Tenant-Owner sehen eigene Rechnungen, Plattform-Admins alle.
create policy invoices_tenant_or_admin_select on platform.invoices
  for select to authenticated
  using (
    app_auth.is_platform_admin()
    or exists (
      select 1
      from public.memberships m
      where m.tenant_id = platform.invoices.tenant_id
        and m.user_id   = (select auth.uid())
        and m.status    = 'active'
        and m.is_owner  = true
    )
  );

-- Schreibrechte: Insert kann der Tenant-Owner (Rechnung anfordern), Update nur Admin.
create policy invoices_tenant_insert on platform.invoices
  for insert to authenticated
  with check (
    exists (
      select 1
      from public.memberships m
      where m.tenant_id = platform.invoices.tenant_id
        and m.user_id   = (select auth.uid())
        and m.status    = 'active'
        and m.is_owner  = true
    )
  );

create policy invoices_admin_all on platform.invoices
  for all to authenticated
  using ( app_auth.is_platform_admin() )
  with check ( app_auth.is_platform_admin() );

-- ============================================================================
-- Schema-Grants
-- ============================================================================

grant usage on schema platform to authenticated, anon, service_role;
grant select on platform.subscription_plans to anon, authenticated;
grant select                     on platform.admins   to authenticated;
grant select, insert, update, delete on platform.admins   to service_role;
grant select                     on platform.invoices to authenticated;
grant insert                     on platform.invoices to authenticated;
grant select, insert, update, delete on platform.invoices to service_role;
grant select, insert, update, delete on platform.subscription_plans to service_role;
