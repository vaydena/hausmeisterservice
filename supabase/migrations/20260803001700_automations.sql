-- Automations — Regel-Engine für zeit- und ereignisbasierte Trigger.
-- Trigger und Aktionen werden über Text-Keys referenziert, die Registry
-- lebt im Code (src/lib/automations/*). Config ist jsonb.

create table automation_rules (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  name text not null,
  description text,
  trigger_key text not null,
  trigger_config jsonb not null default '{}'::jsonb,
  action_key text not null,
  action_config jsonb not null default '{}'::jsonb,
  enabled boolean not null default true,
  last_run_at timestamptz,
  last_error text,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint automation_rules_name_not_empty check (length(trim(name)) > 0),
  constraint automation_rules_trigger_not_empty check (length(trigger_key) > 0),
  constraint automation_rules_action_not_empty check (length(action_key) > 0)
);

create index automation_rules_tenant_idx on automation_rules(tenant_id, enabled);
create index automation_rules_trigger_idx on automation_rules(trigger_key) where enabled = true;

create trigger automation_rules_set_updated_at
  before update on automation_rules
  for each row execute function app_auth.set_updated_at();

create table automation_runs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  rule_id uuid not null references automation_rules(id) on delete cascade,
  trigger_key text not null,
  match_count integer not null default 0,
  action_ok_count integer not null default 0,
  action_failed_count integer not null default 0,
  error text,
  created_at timestamptz not null default now()
);

create index automation_runs_rule_idx on automation_runs(rule_id, created_at desc);
create index automation_runs_tenant_idx on automation_runs(tenant_id, created_at desc);

create table automation_dispatches (
  rule_id uuid not null references automation_rules(id) on delete cascade,
  entity_type text not null,
  entity_id uuid not null,
  dispatch_key text not null,
  tenant_id uuid not null references tenants(id) on delete cascade,
  dispatched_at timestamptz not null default now(),
  primary key (rule_id, entity_type, entity_id, dispatch_key)
);

create index automation_dispatches_tenant_idx on automation_dispatches(tenant_id, dispatched_at desc);

-- ============================================================================
-- RLS
-- ============================================================================

alter table automation_rules enable row level security;

create policy "automation_rules.select" on automation_rules for select
using (
  app_auth.is_tenant_member(tenant_id)
  and app_auth.has_permission('automations.view')
);

create policy "automation_rules.insert" on automation_rules for insert
with check (
  app_auth.is_tenant_member(tenant_id)
  and tenant_id = app_auth.current_tenant_id()
  and app_auth.has_permission('automations.manage')
);

create policy "automation_rules.update" on automation_rules for update
using (
  app_auth.is_tenant_member(tenant_id)
  and app_auth.has_permission('automations.manage')
)
with check (app_auth.is_tenant_member(tenant_id));

create policy "automation_rules.delete" on automation_rules for delete
using (
  app_auth.is_tenant_member(tenant_id)
  and app_auth.has_permission('automations.manage')
);

alter table automation_runs enable row level security;

create policy "automation_runs.select" on automation_runs for select
using (
  app_auth.is_tenant_member(tenant_id)
  and app_auth.has_permission('automations.view')
);

alter table automation_dispatches enable row level security;

create policy "automation_dispatches.select" on automation_dispatches for select
using (
  app_auth.is_tenant_member(tenant_id)
  and app_auth.has_permission('automations.view')
);
