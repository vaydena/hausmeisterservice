-- =============================================================================
-- Bewohner-Portal (Teil 2): Struktur + RLS
-- =============================================================================
-- Was hier passiert:
--   * residents bekommt user_id (Link zu auth.users) + portal_invited/activated
--   * announcements bekommt target_property_id für gezielte Objekt-Kommunikation
--   * Neue check-Constraint deckt 'residents' und 'property' target_type ab
--   * Helpers is_resident_of_tenant / resident_tenant_id / resident_property_id
--   * current_tenant_id() fällt bei fehlender Membership auf Resident zurück
--   * is_announcement_recipient wird um property_id-Param erweitert (Signatur-Bruch → Policy re-create)
--   * Neue SELECT-Policies für Bewohner auf residents/properties/units/buildings
--   * Neue Policies für Bewohner auf announcements/announcement_receipts/defect_reports/messages
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1) residents: portal-Anbindung
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.residents
  add column if not exists user_id uuid references auth.users(id) on delete set null,
  add column if not exists portal_invited_at timestamptz,
  add column if not exists portal_activated_at timestamptz;

create unique index if not exists residents_user_id_unique_idx
  on public.residents(user_id)
  where user_id is not null and deleted_at is null;

create index if not exists residents_user_id_idx
  on public.residents(user_id)
  where user_id is not null;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2) announcements: target_property_id + neue check-Constraint
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.announcements
  add column if not exists target_property_id uuid references public.properties(id) on delete cascade;

create index if not exists announcements_target_property_idx
  on public.announcements(target_property_id)
  where target_property_id is not null;

alter table public.announcements drop constraint if exists announcements_target_check;
alter table public.announcements add constraint announcements_target_check check (
  (target_type = 'all' and target_role_key is null and target_user_ids is null and target_property_id is null)
  or (target_type = 'role' and target_role_key is not null and target_user_ids is null and target_property_id is null)
  or (target_type = 'users' and target_role_key is null and target_user_ids is not null and array_length(target_user_ids, 1) > 0 and target_property_id is null)
  or (target_type = 'residents' and target_role_key is null and target_user_ids is null and target_property_id is null)
  or (target_type = 'property' and target_role_key is null and target_user_ids is null and target_property_id is not null)
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3) Helpers
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function app_auth.is_resident_of_tenant(p_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.residents r
    where r.tenant_id = p_tenant_id
      and r.user_id = auth.uid()
      and r.deleted_at is null
      and (r.moved_out is null or r.moved_out > current_date)
  );
$$;

comment on function app_auth.is_resident_of_tenant(uuid) is
  'True wenn auth.uid() ein aktiver Bewohner (nicht ausgezogen) im gegebenen Tenant ist.';

create or replace function app_auth.resident_tenant_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select r.tenant_id from public.residents r
  where r.user_id = auth.uid()
    and r.deleted_at is null
  order by r.moved_in desc nulls last
  limit 1;
$$;

create or replace function app_auth.resident_property_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select r.property_id from public.residents r
  where r.user_id = auth.uid()
    and r.deleted_at is null
  order by r.moved_in desc nulls last
  limit 1;
$$;

create or replace function app_auth.resident_unit_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select r.unit_id from public.residents r
  where r.user_id = auth.uid()
    and r.deleted_at is null
  order by r.moved_in desc nulls last
  limit 1;
$$;

create or replace function app_auth.resident_building_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select r.building_id from public.residents r
  where r.user_id = auth.uid()
    and r.deleted_at is null
  order by r.moved_in desc nulls last
  limit 1;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4) current_tenant_id: Resident-Fallback
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function app_auth.current_tenant_id()
returns uuid
language plpgsql
stable
set search_path = ''
as $$
declare
  claim_tenant uuid;
  fallback     uuid;
begin
  begin
    claim_tenant := nullif(current_setting('request.jwt.claims', true)::jsonb->>'app_tenant_id', '')::uuid;
  exception when others then
    claim_tenant := null;
  end;

  if claim_tenant is not null then
    return claim_tenant;
  end if;

  select m.tenant_id into fallback
  from public.memberships m
  where m.user_id = auth.uid() and m.status = 'active'
  order by m.created_at
  limit 1;

  if fallback is not null then
    return fallback;
  end if;

  -- Resident-Fallback
  select r.tenant_id into fallback
  from public.residents r
  where r.user_id = auth.uid() and r.deleted_at is null
  order by r.moved_in desc nulls last
  limit 1;

  return fallback;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5) is_announcement_recipient — Signatur erweitert um target_property_id
-- ─────────────────────────────────────────────────────────────────────────────

-- Alte Policies droppen, die die alte Signatur nutzen (werden gleich neu gebaut)
drop policy if exists "announcements.select" on public.announcements;
drop policy if exists "announcement_receipts.insert" on public.announcement_receipts;

drop function if exists app_auth.is_announcement_recipient(uuid, announcement_target_type, text, uuid[], uuid);

create or replace function app_auth.is_announcement_recipient(
  a_tenant_id uuid,
  a_target_type announcement_target_type,
  a_target_role_key text,
  a_target_user_ids uuid[],
  a_target_property_id uuid,
  uid uuid
) returns boolean
language sql
stable
security definer
set search_path = public, app_auth
as $$
  select case a_target_type
    when 'all' then
      exists (
        select 1 from memberships m
        where m.user_id = uid and m.tenant_id = a_tenant_id and m.status = 'active'
      )
      or exists (
        select 1 from residents r
        where r.user_id = uid and r.tenant_id = a_tenant_id and r.deleted_at is null
      )
    when 'users' then uid = any(a_target_user_ids)
    when 'role' then exists (
      select 1
      from user_roles ur
      join roles r on r.id = ur.role_id
      where ur.user_id = uid
        and ur.tenant_id = a_tenant_id
        and r.key = a_target_role_key
    )
    when 'residents' then exists (
      select 1 from residents r
      where r.user_id = uid and r.tenant_id = a_tenant_id and r.deleted_at is null
    )
    when 'property' then exists (
      select 1 from residents r
      where r.user_id = uid
        and r.tenant_id = a_tenant_id
        and r.property_id = a_target_property_id
        and r.deleted_at is null
    )
  end
$$;

comment on function app_auth.is_announcement_recipient(uuid, announcement_target_type, text, uuid[], uuid, uuid) is
  'Prüft, ob uid Empfänger einer Ankündigung ist. Berücksichtigt Members und Residents.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 6) Announcement-Policies neu aufsetzen
-- ─────────────────────────────────────────────────────────────────────────────

-- SELECT (Members + Ersteller + Publisher + Bewohner-Empfänger)
create policy "announcements.select"
on public.announcements
for select
using (
  (
    app_auth.is_tenant_member(tenant_id)
    and (
      created_by = auth.uid()
      or app_auth.has_permission('announcements.publish')
      or (
        status = 'published'
        and app_auth.is_announcement_recipient(tenant_id, target_type, target_role_key, target_user_ids, target_property_id, auth.uid())
      )
    )
  )
  or (
    status = 'published'
    and app_auth.is_resident_of_tenant(tenant_id)
    and app_auth.is_announcement_recipient(tenant_id, target_type, target_role_key, target_user_ids, target_property_id, auth.uid())
  )
);

-- Receipts INSERT neu mit erweiterter Recipient-Signatur (Members + Residents)
create policy "announcement_receipts.insert"
on public.announcement_receipts
for insert
with check (
  user_id = auth.uid()
  and exists (
    select 1 from public.announcements a
    where a.id = announcement_receipts.announcement_id
      and a.status = 'published'
      and app_auth.is_announcement_recipient(a.tenant_id, a.target_type, a.target_role_key, a.target_user_ids, a.target_property_id, auth.uid())
  )
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 7) Residents-Self-Zugriff (Bewohner sieht sich)
-- ─────────────────────────────────────────────────────────────────────────────

create policy "residents_select_self" on public.residents
  for select to authenticated
  using (user_id = auth.uid());

-- ─────────────────────────────────────────────────────────────────────────────
-- 8) Properties/Buildings/Units — Bewohner sieht sein Objekt
-- ─────────────────────────────────────────────────────────────────────────────

create policy "properties_select_resident" on public.properties
  for select to authenticated
  using (
    app_auth.is_resident_of_tenant(tenant_id)
    and id = app_auth.resident_property_id()
  );

create policy "buildings_select_resident" on public.buildings
  for select to authenticated
  using (
    app_auth.is_resident_of_tenant(tenant_id)
    and (
      id = app_auth.resident_building_id()
      or property_id = app_auth.resident_property_id()
    )
  );

create policy "units_select_resident" on public.units
  for select to authenticated
  using (
    app_auth.is_resident_of_tenant(tenant_id)
    and id = app_auth.resident_unit_id()
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 9) Defect Reports — Bewohner darf melden und eigene sehen
-- ─────────────────────────────────────────────────────────────────────────────

-- SELECT: eigene Meldung (reporter=self), unabhängig von Member/Resident
drop policy if exists "defect_reports_select_own" on public.defect_reports;
create policy "defect_reports_select_own" on public.defect_reports
  for select to authenticated
  using (reporter_user_id = auth.uid());

-- INSERT: Resident darf eigene Meldung für sein Objekt einreichen
create policy "defect_reports_insert_resident" on public.defect_reports
  for insert to authenticated
  with check (
    tenant_id = app_auth.current_tenant_id()
    and reporter_kind = 'resident'
    and reporter_user_id = auth.uid()
    and app_auth.is_resident_of_tenant(tenant_id)
    and property_id = app_auth.resident_property_id()
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 10) Messaging — Bewohner als Teilnehmer sieht Threads/Messages/Peers
-- ─────────────────────────────────────────────────────────────────────────────

-- Threads sehen: Resident der Teilnehmer ist
create policy "message_threads_select_resident" on public.message_threads
  for select to authenticated
  using (
    app_auth.is_resident_of_tenant(tenant_id)
    and exists (
      select 1 from public.message_thread_participants p
      where p.thread_id = message_threads.id
        and p.user_id = auth.uid()
    )
  );

-- Participants: Resident sieht seine eigene Zeile + Peers in Threads wo Teilnehmer
create policy "message_thread_participants_select_resident" on public.message_thread_participants
  for select to authenticated
  using (
    app_auth.is_resident_of_tenant(tenant_id)
    and (
      user_id = auth.uid()
      or exists (
        select 1 from public.message_thread_participants me
        where me.thread_id = message_thread_participants.thread_id
          and me.user_id = auth.uid()
      )
    )
  );

-- Sich selbst als „gelesen" markieren (auch für Residents)
create policy "message_thread_participants_update_resident" on public.message_thread_participants
  for update to authenticated
  using (
    user_id = auth.uid()
    and app_auth.is_resident_of_tenant(tenant_id)
  )
  with check (
    user_id = auth.uid()
    and app_auth.is_resident_of_tenant(tenant_id)
  );

-- Messages sehen: Resident der Teilnehmer im Thread ist
create policy "messages_select_resident" on public.messages
  for select to authenticated
  using (
    app_auth.is_resident_of_tenant(tenant_id)
    and exists (
      select 1 from public.message_thread_participants p
      where p.thread_id = messages.thread_id
        and p.user_id = auth.uid()
    )
  );

-- Message posten: Resident darf antworten in Threads wo Teilnehmer
create policy "messages_insert_resident" on public.messages
  for insert to authenticated
  with check (
    tenant_id = app_auth.current_tenant_id()
    and author_user_id = auth.uid()
    and app_auth.is_resident_of_tenant(tenant_id)
    and exists (
      select 1 from public.message_thread_participants p
      where p.thread_id = messages.thread_id
        and p.user_id = auth.uid()
    )
  );
