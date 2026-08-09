-- =============================================================================
-- Scheduling — Einsatzplanung (nicht-WO-Termine)
-- =============================================================================
-- Diese Tabelle speichert Termine, die NICHT direkt einem Work-Order entsprechen
-- (Verfügbarkeit/Nicht-Verfügbarkeit, Meetings, Trainings, sonstige Termine).
-- Work-Orders bleiben ihre eigene Quelle mit `planned_start`/`planned_end` +
-- `assignee_id`; die Kalender-UI kombiniert beide Quellen.
--
-- `user_id` ist für RLS-Speed denormalisiert (identisch mit employees.user_id).
-- Der Kalender ist nur mit `scheduling.view` sichtbar — eigene Termine sieht ein
-- Mitarbeiter jedoch immer, damit er seine eigene Verfügbarkeit pflegen kann.
-- =============================================================================

create table public.schedule_entries (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null default 'other'
    check (kind in ('availability', 'unavailability', 'meeting', 'training', 'standby', 'other')),
  title text not null check (length(title) between 1 and 200),
  note text check (note is null or length(note) <= 2000),
  start_at timestamptz not null,
  end_at timestamptz not null,
  all_day boolean not null default false,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  constraint schedule_entries_end_after_start check (end_at > start_at)
);

create index schedule_entries_tenant_time_idx
  on public.schedule_entries(tenant_id, start_at desc);
create index schedule_entries_employee_time_idx
  on public.schedule_entries(employee_id, start_at desc);
create index schedule_entries_user_time_idx
  on public.schedule_entries(user_id, start_at desc);
create index schedule_entries_created_by_idx
  on public.schedule_entries(created_by);
create index schedule_entries_updated_by_idx
  on public.schedule_entries(updated_by);

create trigger schedule_entries_set_updated_at
  before update on public.schedule_entries
  for each row execute function app_auth.set_updated_at();

alter table public.schedule_entries enable row level security;

-- Sehen: eigene immer, fremde nur mit scheduling.view
create policy "schedule_entries_select_own" on public.schedule_entries
  for select to authenticated
  using (
    user_id = (select auth.uid())
    and app_auth.is_tenant_member(tenant_id)
  );

create policy "schedule_entries_select_others" on public.schedule_entries
  for select to authenticated
  using (
    app_auth.is_tenant_member(tenant_id)
    and app_auth.has_permission('scheduling.view')
  );

-- Anlegen: eigene (create/edit), fremde nur mit scheduling.edit
create policy "schedule_entries_insert_own" on public.schedule_entries
  for insert to authenticated
  with check (
    tenant_id = app_auth.current_tenant_id()
    and user_id = (select auth.uid())
    and app_auth.has_permission('scheduling.view')
  );

create policy "schedule_entries_insert_for_others" on public.schedule_entries
  for insert to authenticated
  with check (
    tenant_id = app_auth.current_tenant_id()
    and user_id <> (select auth.uid())
    and app_auth.has_permission('scheduling.edit')
  );

-- Bearbeiten
create policy "schedule_entries_update_own" on public.schedule_entries
  for update to authenticated
  using (
    user_id = (select auth.uid())
    and app_auth.is_tenant_member(tenant_id)
    and app_auth.has_permission('scheduling.view')
  )
  with check (
    tenant_id = app_auth.current_tenant_id()
    and app_auth.has_permission('scheduling.view')
  );

create policy "schedule_entries_update_others" on public.schedule_entries
  for update to authenticated
  using (
    app_auth.is_tenant_member(tenant_id)
    and app_auth.has_permission('scheduling.edit')
  )
  with check (
    tenant_id = app_auth.current_tenant_id()
    and app_auth.has_permission('scheduling.edit')
  );

-- Löschen: eigene immer (bei scheduling.view), fremde mit scheduling.edit
create policy "schedule_entries_delete_own" on public.schedule_entries
  for delete to authenticated
  using (
    user_id = (select auth.uid())
    and app_auth.is_tenant_member(tenant_id)
    and app_auth.has_permission('scheduling.view')
  );

create policy "schedule_entries_delete_others" on public.schedule_entries
  for delete to authenticated
  using (
    app_auth.is_tenant_member(tenant_id)
    and app_auth.has_permission('scheduling.edit')
  );
