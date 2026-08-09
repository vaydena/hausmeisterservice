-- =============================================================================
-- Audit-Log (Kern-Modul core.audit_log)
-- =============================================================================
-- Protokolliert Änderungen an sicherheitsrelevanten Tabellen:
--   tenants, memberships, roles, role_permissions, user_roles, tenant_modules
--
-- Domänen-Änderungen (work_orders, properties, ...) haben eigene Historien
-- (z. B. work_order_events). Der zentrale audit_log fokussiert auf
-- Berechtigungen, Mitgliedschaften und Modul-Konfiguration.
--
-- Design:
--   - Tabelle immutable (nur SELECT via RLS; INSERT via SECURITY DEFINER-Trigger).
--   - tenant_id per JSONB abgeleitet — funktioniert generisch für alle Tabellen.
--   - `updated_at`/`updated_by` aus dem Diff gefiltert (kein Rauschen).
--   - Bei UPDATE ohne echte Änderung wird kein Eintrag geschrieben.
-- =============================================================================

create table public.audit_log (
  id bigint generated always as identity primary key,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  occurred_at timestamptz not null default now(),
  actor_id uuid references auth.users(id) on delete set null,
  table_name text not null,
  row_id uuid,
  action text not null check (action in ('INSERT', 'UPDATE', 'DELETE')),
  old_data jsonb,
  new_data jsonb,
  changed_columns text[]
);

create index audit_log_tenant_time_idx on public.audit_log(tenant_id, occurred_at desc);
create index audit_log_table_time_idx on public.audit_log(tenant_id, table_name, occurred_at desc);
create index audit_log_actor_time_idx on public.audit_log(actor_id, occurred_at desc);

alter table public.audit_log enable row level security;

create policy "audit_log_select" on public.audit_log
  for select to authenticated
  using (
    app_auth.is_tenant_member(tenant_id)
    and app_auth.has_permission('core.audit_log.view')
  );

-- Kein INSERT/UPDATE/DELETE für Benutzer:innen — Einträge kommen ausschließlich
-- über den Trigger, der als SECURITY DEFINER läuft.

-- -----------------------------------------------------------------------------
-- Trigger-Funktion
-- -----------------------------------------------------------------------------

create or replace function app_auth.log_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_new jsonb := to_jsonb(new);
  v_old jsonb := to_jsonb(old);
  v_data jsonb := coalesce(v_new, v_old);
  v_tenant_id uuid;
  v_row_id uuid;
  v_changed text[];
  v_ignore text[] := array['updated_at', 'updated_by'];
begin
  -- tenant_id je Tabelle bestimmen
  v_tenant_id := case TG_TABLE_NAME
    when 'tenants' then (v_data->>'id')::uuid
    when 'role_permissions' then (
      select r.tenant_id from public.roles r
      where r.id = (v_data->>'role_id')::uuid
    )
    else (v_data->>'tenant_id')::uuid
  end;

  if v_tenant_id is null then
    return null;
  end if;

  if v_data ? 'id' then
    v_row_id := (v_data->>'id')::uuid;
  end if;

  if TG_OP = 'UPDATE' then
    select coalesce(array_agg(k), array[]::text[])
      into v_changed
    from jsonb_object_keys(v_new) k
    where (v_new -> k) is distinct from (v_old -> k)
      and k <> all(v_ignore);

    if v_changed is null or array_length(v_changed, 1) is null then
      return null;
    end if;
  end if;

  insert into public.audit_log
    (tenant_id, occurred_at, actor_id, table_name, row_id, action, old_data, new_data, changed_columns)
  values
    (v_tenant_id, now(), auth.uid(), TG_TABLE_NAME, v_row_id, TG_OP, v_old, v_new, v_changed);

  return null;
end;
$$;

-- -----------------------------------------------------------------------------
-- Trigger auf sensiblen Tabellen
-- -----------------------------------------------------------------------------

create trigger tenants_audit
  after insert or update or delete on public.tenants
  for each row execute function app_auth.log_change();

create trigger memberships_audit
  after insert or update or delete on public.memberships
  for each row execute function app_auth.log_change();

create trigger roles_audit
  after insert or update or delete on public.roles
  for each row execute function app_auth.log_change();

create trigger role_permissions_audit
  after insert or update or delete on public.role_permissions
  for each row execute function app_auth.log_change();

create trigger user_roles_audit
  after insert or update or delete on public.user_roles
  for each row execute function app_auth.log_change();

create trigger tenant_modules_audit
  after insert or update or delete on public.tenant_modules
  for each row execute function app_auth.log_change();
