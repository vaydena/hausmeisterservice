-- Billing — Angebote und Rechnungen

create type offer_status as enum ('draft', 'sent', 'accepted', 'declined', 'expired');
create type invoice_status as enum ('draft', 'sent', 'paid', 'cancelled');

-- ============================================================================
-- offers
-- ============================================================================

create table offers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  code text not null,
  status offer_status not null default 'draft',
  title text not null,
  description text,
  property_id uuid references properties(id) on delete set null,
  owner_id uuid references owners(id) on delete set null,
  bill_to_name text not null,
  bill_to_address text,
  issued_at date,
  valid_until date,
  net_total_cents integer not null default 0,
  tax_total_cents integer not null default 0,
  gross_total_cents integer not null default 0,
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint offers_code_tenant_unique unique (tenant_id, code),
  constraint offers_title_not_empty check (length(trim(title)) > 0),
  constraint offers_bill_to_not_empty check (length(trim(bill_to_name)) > 0),
  constraint offers_totals_check check (net_total_cents >= 0 and tax_total_cents >= 0 and gross_total_cents >= 0)
);

create index offers_tenant_status_idx on offers(tenant_id, status);
create index offers_property_idx on offers(property_id);
create index offers_owner_idx on offers(owner_id);
create index offers_issued_idx on offers(tenant_id, issued_at desc);

create trigger offers_set_updated_at
  before update on offers
  for each row execute function app_auth.set_updated_at();

create or replace function app_auth.generate_offer_code()
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
    nullif(regexp_replace(code, '^AN-' || v_year || '-', ''), '')::integer
  ), 0) + 1
  into v_seq
  from public.offers
  where tenant_id = new.tenant_id and code like 'AN-' || v_year || '-%';
  new.code := 'AN-' || v_year || '-' || lpad(v_seq::text, 4, '0');
  return new;
end;
$$;

create trigger offers_generate_code
  before insert on offers
  for each row execute function app_auth.generate_offer_code();

-- ============================================================================
-- invoices
-- ============================================================================

create table invoices (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  code text not null,
  status invoice_status not null default 'draft',
  title text not null,
  description text,
  property_id uuid references properties(id) on delete set null,
  owner_id uuid references owners(id) on delete set null,
  work_order_id uuid references work_orders(id) on delete set null,
  offer_id uuid references offers(id) on delete set null,
  bill_to_name text not null,
  bill_to_address text,
  issued_at date,
  due_at date,
  paid_at date,
  net_total_cents integer not null default 0,
  tax_total_cents integer not null default 0,
  gross_total_cents integer not null default 0,
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint invoices_code_tenant_unique unique (tenant_id, code),
  constraint invoices_title_not_empty check (length(trim(title)) > 0),
  constraint invoices_bill_to_not_empty check (length(trim(bill_to_name)) > 0),
  constraint invoices_totals_check check (net_total_cents >= 0 and tax_total_cents >= 0 and gross_total_cents >= 0),
  constraint invoices_paid_check check ((status = 'paid') = (paid_at is not null))
);

create index invoices_tenant_status_idx on invoices(tenant_id, status);
create index invoices_property_idx on invoices(property_id);
create index invoices_owner_idx on invoices(owner_id);
create index invoices_work_order_idx on invoices(work_order_id);
create index invoices_offer_idx on invoices(offer_id);
create index invoices_issued_idx on invoices(tenant_id, issued_at desc);
create index invoices_due_open_idx on invoices(tenant_id, due_at)
  where status in ('sent', 'draft');

create trigger invoices_set_updated_at
  before update on invoices
  for each row execute function app_auth.set_updated_at();

create or replace function app_auth.generate_invoice_code()
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
    nullif(regexp_replace(code, '^RE-' || v_year || '-', ''), '')::integer
  ), 0) + 1
  into v_seq
  from public.invoices
  where tenant_id = new.tenant_id and code like 'RE-' || v_year || '-%';
  new.code := 'RE-' || v_year || '-' || lpad(v_seq::text, 4, '0');
  return new;
end;
$$;

create trigger invoices_generate_code
  before insert on invoices
  for each row execute function app_auth.generate_invoice_code();

-- ============================================================================
-- line items
-- ============================================================================

create type billing_document_kind as enum ('offer', 'invoice');

create table billing_line_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  document_kind billing_document_kind not null,
  offer_id uuid references offers(id) on delete cascade,
  invoice_id uuid references invoices(id) on delete cascade,
  position integer not null,
  description text not null,
  quantity numeric(10, 2) not null default 1,
  unit text,
  unit_price_cents integer not null default 0,
  tax_rate numeric(4, 2) not null default 19,
  net_cents integer not null default 0,
  tax_cents integer not null default 0,
  gross_cents integer not null default 0,
  created_at timestamptz not null default now(),
  constraint billing_line_kind_target check (
    (document_kind = 'offer' and offer_id is not null and invoice_id is null)
    or (document_kind = 'invoice' and invoice_id is not null and offer_id is null)
  ),
  constraint billing_line_description_not_empty check (length(trim(description)) > 0),
  constraint billing_line_position_positive check (position >= 1),
  constraint billing_line_quantity_positive check (quantity > 0)
);

create index billing_line_offer_idx on billing_line_items(offer_id, position)
  where document_kind = 'offer';
create index billing_line_invoice_idx on billing_line_items(invoice_id, position)
  where document_kind = 'invoice';

-- ============================================================================
-- RLS: offers
-- ============================================================================

alter table offers enable row level security;

create policy "offers.select" on offers for select
using (app_auth.is_tenant_member(tenant_id) and app_auth.has_permission('billing.view'));

create policy "offers.insert" on offers for insert
with check (
  app_auth.is_tenant_member(tenant_id)
  and tenant_id = app_auth.current_tenant_id()
  and app_auth.has_permission('billing.create')
);

create policy "offers.update" on offers for update
using (app_auth.is_tenant_member(tenant_id) and app_auth.has_permission('billing.edit'))
with check (app_auth.is_tenant_member(tenant_id));

create policy "offers.delete" on offers for delete
using (
  app_auth.is_tenant_member(tenant_id)
  and app_auth.has_permission('billing.edit')
  and status = 'draft'
);

-- ============================================================================
-- RLS: invoices
-- ============================================================================

alter table invoices enable row level security;

create policy "invoices.select" on invoices for select
using (app_auth.is_tenant_member(tenant_id) and app_auth.has_permission('billing.view'));

create policy "invoices.insert" on invoices for insert
with check (
  app_auth.is_tenant_member(tenant_id)
  and tenant_id = app_auth.current_tenant_id()
  and app_auth.has_permission('billing.create')
);

create policy "invoices.update" on invoices for update
using (app_auth.is_tenant_member(tenant_id) and app_auth.has_permission('billing.edit'))
with check (app_auth.is_tenant_member(tenant_id));

create policy "invoices.delete" on invoices for delete
using (
  app_auth.is_tenant_member(tenant_id)
  and app_auth.has_permission('billing.edit')
  and status = 'draft'
);

-- ============================================================================
-- RLS: line items
-- ============================================================================

alter table billing_line_items enable row level security;

create policy "billing_line_items.select" on billing_line_items for select
using (app_auth.is_tenant_member(tenant_id) and app_auth.has_permission('billing.view'));

create policy "billing_line_items.insert" on billing_line_items for insert
with check (
  app_auth.is_tenant_member(tenant_id)
  and tenant_id = app_auth.current_tenant_id()
  and app_auth.has_permission('billing.edit')
);

create policy "billing_line_items.update" on billing_line_items for update
using (app_auth.is_tenant_member(tenant_id) and app_auth.has_permission('billing.edit'))
with check (app_auth.is_tenant_member(tenant_id));

create policy "billing_line_items.delete" on billing_line_items for delete
using (app_auth.is_tenant_member(tenant_id) and app_auth.has_permission('billing.edit'));

-- Permissions werden über src/lib/permissions/registry.ts gepflegt.
