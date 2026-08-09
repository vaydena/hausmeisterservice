-- Announcements — Broadcast an Tenant/Rolle/User-Auswahl, optional quittungspflichtig
-- Struktur:
--   announcements — Ankündigung mit Zielgruppen-Definition
--   announcement_receipts — Pro Empfänger: gelesen + (bei requires_ack) quittiert

-- ============================================================================
-- Enums
-- ============================================================================

create type announcement_target_type as enum ('all', 'role', 'users');
create type announcement_status as enum ('draft', 'published', 'closed');

-- ============================================================================
-- Table: announcements
-- ============================================================================

create table announcements (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  title text not null,
  body text not null,
  status announcement_status not null default 'draft',
  target_type announcement_target_type not null,
  target_role_key text,
  target_user_ids uuid[],
  requires_acknowledgement boolean not null default false,
  published_at timestamptz,
  expires_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint announcements_target_check check (
    (target_type = 'all' and target_role_key is null and target_user_ids is null)
    or (target_type = 'role' and target_role_key is not null and target_user_ids is null)
    or (target_type = 'users' and target_role_key is null and target_user_ids is not null and array_length(target_user_ids, 1) > 0)
  ),
  constraint announcements_status_publish_check check (
    (status = 'draft' and published_at is null)
    or (status in ('published', 'closed') and published_at is not null)
  ),
  constraint announcements_expires_check check (
    expires_at is null or published_at is null or expires_at > published_at
  ),
  constraint announcements_title_not_empty check (length(trim(title)) > 0),
  constraint announcements_body_not_empty check (length(trim(body)) > 0)
);

create index announcements_tenant_status_idx on announcements(tenant_id, status);
create index announcements_tenant_published_idx on announcements(tenant_id, published_at desc)
  where status = 'published';
create index announcements_target_users_idx on announcements using gin (target_user_ids);
create index announcements_created_by_idx on announcements(created_by);

create trigger announcements_set_updated_at
  before update on announcements
  for each row execute function app_auth.set_updated_at();

-- ============================================================================
-- Table: announcement_receipts
-- ============================================================================

create table announcement_receipts (
  announcement_id uuid not null references announcements(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  read_at timestamptz,
  acknowledged_at timestamptz,
  primary key (announcement_id, user_id)
);

create index announcement_receipts_user_idx on announcement_receipts(user_id);

-- ============================================================================
-- Helper: Empfänger-Check (SECURITY DEFINER, damit RLS auf roles/user_roles nicht rekursiv triggert)
-- ============================================================================

create or replace function app_auth.is_announcement_recipient(
  a_tenant_id uuid,
  a_target_type announcement_target_type,
  a_target_role_key text,
  a_target_user_ids uuid[],
  uid uuid
) returns boolean
language sql
stable
security definer
set search_path = public, app_auth
as $$
  select case a_target_type
    when 'all' then exists (
      select 1 from memberships m
      where m.user_id = uid and m.tenant_id = a_tenant_id and m.status = 'active'
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
  end
$$;

comment on function app_auth.is_announcement_recipient(uuid, announcement_target_type, text, uuid[], uuid) is
  'Prüft, ob uid Empfänger einer Ankündigung mit gegebener Ziel-Definition ist.';

-- ============================================================================
-- RLS: announcements
-- ============================================================================

alter table announcements enable row level security;

-- SELECT: Ersteller sieht immer, andere nur wenn published + Empfänger
create policy "announcements.select"
on announcements
for select
using (
  app_auth.is_tenant_member(tenant_id)
  and (
    created_by = auth.uid()
    or app_auth.has_permission('announcements.publish')
    or (
      status = 'published'
      and app_auth.is_announcement_recipient(tenant_id, target_type, target_role_key, target_user_ids, auth.uid())
    )
  )
);

-- INSERT: Wer create-Permission hat, im aktuellen Tenant
create policy "announcements.insert"
on announcements
for insert
with check (
  app_auth.is_tenant_member(tenant_id)
  and tenant_id = app_auth.current_tenant_id()
  and app_auth.has_permission('announcements.create')
  and created_by = auth.uid()
);

-- UPDATE: Ersteller (Draft) oder publish-Permission
create policy "announcements.update"
on announcements
for update
using (
  app_auth.is_tenant_member(tenant_id)
  and (
    (created_by = auth.uid() and status = 'draft')
    or app_auth.has_permission('announcements.publish')
    or app_auth.has_permission('announcements.close')
  )
)
with check (
  app_auth.is_tenant_member(tenant_id)
);

-- DELETE: Nur Draft durch Ersteller
create policy "announcements.delete"
on announcements
for delete
using (
  app_auth.is_tenant_member(tenant_id)
  and created_by = auth.uid()
  and status = 'draft'
);

-- ============================================================================
-- RLS: announcement_receipts
-- ============================================================================

alter table announcement_receipts enable row level security;

-- SELECT: Own receipts oder für Ersteller/publish-Permission (Empfänger-Übersicht)
create policy "announcement_receipts.select"
on announcement_receipts
for select
using (
  user_id = auth.uid()
  or exists (
    select 1 from announcements a
    where a.id = announcement_receipts.announcement_id
      and app_auth.is_tenant_member(a.tenant_id)
      and (a.created_by = auth.uid() or app_auth.has_permission('announcements.publish'))
  )
);

-- INSERT: Own receipts, nur für published Ankündigungen bei denen User Empfänger ist
create policy "announcement_receipts.insert"
on announcement_receipts
for insert
with check (
  user_id = auth.uid()
  and exists (
    select 1 from announcements a
    where a.id = announcement_receipts.announcement_id
      and a.status = 'published'
      and app_auth.is_tenant_member(a.tenant_id)
      and app_auth.is_announcement_recipient(a.tenant_id, a.target_type, a.target_role_key, a.target_user_ids, auth.uid())
  )
);

-- UPDATE: Own receipts (read_at / acknowledged_at aktualisieren)
create policy "announcement_receipts.update"
on announcement_receipts
for update
using (user_id = auth.uid())
with check (user_id = auth.uid());

-- Permissions werden über src/lib/permissions/registry.ts gepflegt und via
-- supabase/seed/permissions.ts in die permissions-Tabelle synchronisiert.
