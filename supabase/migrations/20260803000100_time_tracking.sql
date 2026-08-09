-- =============================================================================
-- Time Tracking — Zeiterfassung (Stempeln + manuelle Einträge)
-- =============================================================================
-- Jeder Eintrag gehört einem Mitarbeiter. `user_id` ist für RLS/auth.uid()-Match
-- denormalisiert (identisch mit employees.user_id).
--
-- Offene Session: end_at IS NULL. Ein UNIQUE PARTIAL INDEX erzwingt, dass ein
-- User nie zwei offene Einträge gleichzeitig hat.
--
-- RLS:
--   select  — eigene Zeiten immer, fremde nur mit time_tracking.view_others
--   insert  — eigene (time_tracking.create), fremde nur mit view_others+create
--   update  — eigene (edit), fremde nur mit view_others+approve
--   delete  — nur eigene (edit)
-- =============================================================================

create table public.time_entries (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null default 'work'
    check (kind in ('work', 'break', 'travel', 'standby')),
  start_at timestamptz not null,
  end_at timestamptz,
  work_order_id uuid references public.work_orders(id) on delete set null,
  property_id uuid references public.properties(id) on delete set null,
  note text,
  source text not null default 'punch'
    check (source in ('punch', 'manual', 'correction')),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  constraint time_entries_end_after_start check (end_at is null or end_at > start_at)
);

create unique index time_entries_one_open_per_user_idx
  on public.time_entries(user_id) where end_at is null;

create index time_entries_tenant_user_time_idx
  on public.time_entries(tenant_id, user_id, start_at desc);
create index time_entries_open_idx
  on public.time_entries(tenant_id, user_id) where end_at is null;
create index time_entries_work_order_idx
  on public.time_entries(work_order_id) where work_order_id is not null;
create index time_entries_property_idx
  on public.time_entries(property_id) where property_id is not null;
create index time_entries_tenant_range_idx
  on public.time_entries(tenant_id, start_at desc);

create trigger time_entries_set_updated_at
  before update on public.time_entries
  for each row execute function app_auth.set_updated_at();

alter table public.time_entries enable row level security;

-- Sehen
create policy "time_entries_select_own" on public.time_entries
  for select to authenticated
  using (
    user_id = auth.uid()
    and app_auth.is_tenant_member(tenant_id)
  );

create policy "time_entries_select_others" on public.time_entries
  for select to authenticated
  using (
    app_auth.is_tenant_member(tenant_id)
    and app_auth.has_permission('time_tracking.view_others')
  );

-- Anlegen
create policy "time_entries_insert_own" on public.time_entries
  for insert to authenticated
  with check (
    tenant_id = app_auth.current_tenant_id()
    and user_id = auth.uid()
    and app_auth.has_permission('time_tracking.create')
  );

create policy "time_entries_insert_for_others" on public.time_entries
  for insert to authenticated
  with check (
    tenant_id = app_auth.current_tenant_id()
    and user_id <> auth.uid()
    and app_auth.has_permission('time_tracking.view_others')
    and app_auth.has_permission('time_tracking.create')
  );

-- Bearbeiten
create policy "time_entries_update_own" on public.time_entries
  for update to authenticated
  using (
    user_id = auth.uid()
    and app_auth.is_tenant_member(tenant_id)
    and app_auth.has_permission('time_tracking.edit')
  )
  with check (
    user_id = auth.uid()
    and tenant_id = app_auth.current_tenant_id()
    and app_auth.has_permission('time_tracking.edit')
  );

create policy "time_entries_update_others" on public.time_entries
  for update to authenticated
  using (
    app_auth.is_tenant_member(tenant_id)
    and app_auth.has_permission('time_tracking.view_others')
    and app_auth.has_permission('time_tracking.approve')
  )
  with check (
    tenant_id = app_auth.current_tenant_id()
    and app_auth.has_permission('time_tracking.approve')
  );

-- Löschen: nur eigene
create policy "time_entries_delete_own" on public.time_entries
  for delete to authenticated
  using (
    user_id = auth.uid()
    and app_auth.is_tenant_member(tenant_id)
    and app_auth.has_permission('time_tracking.edit')
  );
