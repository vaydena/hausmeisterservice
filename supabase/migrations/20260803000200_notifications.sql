-- =============================================================================
-- Notifications — Core-Modul (In-App-Benachrichtigungen)
-- =============================================================================
-- Jede Notification gehört einem User (Empfänger). `kind` gibt den Typ vor
-- (Zuweisung, Meldung, Wartungserinnerung...), `subject`/`body` sind fertige
-- deutsche Texte. `entity_type`/`entity_id` erlauben späteres Deep-Linking
-- durch das UI, `url` speichert den fertig zusammengebauten Link.
--
-- Create-Path läuft über die SECURITY DEFINER Funktion
-- `app_auth.enqueue_notification()`, damit ein Server-Action beim Erzeugen
-- fremder Benachrichtigungen (Assignee etc.) nicht an RLS scheitert.
-- SELECT/UPDATE/DELETE laufen normal über RLS und sind auf eigene Zeilen
-- beschränkt.
-- =============================================================================

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null
    check (kind in (
      'work_order_assigned',
      'work_order_status_changed',
      'defect_report_created',
      'defect_report_status_changed',
      'checklist_run_completed',
      'maintenance_due',
      'time_entry_needs_review',
      'mention',
      'system'
    )),
  subject text not null check (length(subject) between 1 and 200),
  body text check (length(body) <= 2000),
  entity_type text
    check (entity_type is null or entity_type in (
      'work_order',
      'defect_report',
      'checklist_run',
      'maintenance_task',
      'time_entry',
      'property',
      'unit'
    )),
  entity_id uuid,
  url text check (url is null or length(url) <= 500),
  read_at timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  constraint notifications_entity_pair_ck
    check ((entity_type is null and entity_id is null) or (entity_type is not null and entity_id is not null))
);

create index notifications_tenant_user_time_idx
  on public.notifications(tenant_id, user_id, created_at desc);
create index notifications_unread_idx
  on public.notifications(user_id, created_at desc) where read_at is null;
create index notifications_entity_idx
  on public.notifications(entity_type, entity_id) where entity_type is not null;

alter table public.notifications enable row level security;

-- Sehen: nur eigene
create policy "notifications_select_own" on public.notifications
  for select to authenticated
  using (
    user_id = auth.uid()
    and app_auth.is_tenant_member(tenant_id)
  );

-- Update: nur eigene (fürs Als-gelesen-Markieren)
create policy "notifications_update_own" on public.notifications
  for update to authenticated
  using (
    user_id = auth.uid()
    and app_auth.is_tenant_member(tenant_id)
  )
  with check (
    user_id = auth.uid()
    and tenant_id = app_auth.current_tenant_id()
  );

-- Löschen: nur eigene
create policy "notifications_delete_own" on public.notifications
  for delete to authenticated
  using (
    user_id = auth.uid()
    and app_auth.is_tenant_member(tenant_id)
  );

-- Kein INSERT-Policy: Alle Inserts laufen über die SECURITY DEFINER Funktion
-- unten. Damit können keine Clients direkt Notifications fälschen.

-- =============================================================================
-- SECURITY DEFINER: Notification erzeugen
-- =============================================================================
create or replace function app_auth.enqueue_notification(
  p_user_id uuid,
  p_kind text,
  p_subject text,
  p_body text default null,
  p_entity_type text default null,
  p_entity_id uuid default null,
  p_url text default null
) returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tenant_id uuid;
  v_new_id uuid;
begin
  -- Der Aufrufer muss in einem Tenant sein und der Empfänger auch.
  v_tenant_id := app_auth.current_tenant_id();
  if v_tenant_id is null then
    raise exception 'no tenant context';
  end if;

  -- Sanity: Empfänger muss Mitglied desselben Tenants sein
  if not exists (
    select 1
    from public.memberships m
    where m.tenant_id = v_tenant_id
      and m.user_id = p_user_id
      and m.status = 'active'
  ) then
    raise exception 'recipient % is not an active member of tenant %', p_user_id, v_tenant_id;
  end if;

  insert into public.notifications (
    tenant_id, user_id, kind, subject, body, entity_type, entity_id, url, created_by
  ) values (
    v_tenant_id, p_user_id, p_kind, p_subject, p_body, p_entity_type, p_entity_id, p_url, auth.uid()
  )
  returning id into v_new_id;

  return v_new_id;
end;
$$;

revoke all on function app_auth.enqueue_notification(uuid, text, text, text, text, uuid, text) from public;
grant execute on function app_auth.enqueue_notification(uuid, text, text, text, text, uuid, text) to authenticated;

comment on function app_auth.enqueue_notification is
  'Erzeugt eine Notification. Läuft als SECURITY DEFINER, prüft aber Tenant-Kontext und Mitgliedschaft des Empfängers.';

-- =============================================================================
-- Convenience-Funktion: "alle als gelesen markieren"
-- =============================================================================
create or replace function public.mark_all_notifications_read()
returns integer
language sql
security invoker
set search_path = public, pg_temp
as $$
  with upd as (
    update public.notifications
       set read_at = now()
     where user_id = auth.uid()
       and read_at is null
     returning 1
  )
  select count(*)::int from upd;
$$;

grant execute on function public.mark_all_notifications_read() to authenticated;
