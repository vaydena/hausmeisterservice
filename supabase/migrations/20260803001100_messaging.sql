-- =============================================================================
-- Messaging — Thread-basierte interne Nachrichten
-- =============================================================================
-- Drei Tabellen:
--   * message_threads              — Konversations-Kopfsatz (tenant-weit)
--   * message_thread_participants  — wer nimmt teil (+ last_read_at)
--   * messages                     — die eigentlichen Nachrichten (append-only)
--
-- Kontextbindung optional (context_type/context_id) — z.B. Thread zu einem
-- Work-Order, einer Property oder frei.
--
-- RLS: Nur Teilnehmer sehen Threads/Messages. Beim Insert eines Threads wird
-- der Ersteller automatisch als Teilnehmer eingetragen (SECURITY-DEFINER
-- Trigger) — sonst könnte er die Participant-Policy nicht erfüllen.
--
-- `last_message_at` auf dem Thread wird via Trigger fortgeschrieben, damit
-- die Inbox-Sortierung ohne Join laufen kann.
-- =============================================================================

create table public.message_threads (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  subject text not null check (length(subject) between 1 and 200),
  context_type text check (context_type is null or context_type in ('work_order', 'property', 'defect_report', 'tour', 'other')),
  context_id uuid,
  last_message_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

create index message_threads_tenant_last_msg_idx
  on public.message_threads(tenant_id, last_message_at desc);
create index message_threads_context_idx
  on public.message_threads(tenant_id, context_type, context_id)
  where context_type is not null and context_id is not null;
create index message_threads_created_by_idx on public.message_threads(created_by);
create index message_threads_updated_by_idx on public.message_threads(updated_by);

create trigger message_threads_set_updated_at
  before update on public.message_threads
  for each row execute function app_auth.set_updated_at();

alter table public.message_threads enable row level security;

-- =============================================================================
-- Participants
-- =============================================================================

create table public.message_thread_participants (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  thread_id uuid not null references public.message_threads(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  added_at timestamptz not null default now(),
  added_by uuid references auth.users(id) on delete set null,
  last_read_at timestamptz,
  unique (thread_id, user_id)
);

create index message_thread_participants_user_idx
  on public.message_thread_participants(user_id, thread_id);
create index message_thread_participants_thread_idx
  on public.message_thread_participants(thread_id);
create index message_thread_participants_tenant_idx
  on public.message_thread_participants(tenant_id);
create index message_thread_participants_added_by_idx
  on public.message_thread_participants(added_by);

alter table public.message_thread_participants enable row level security;

-- =============================================================================
-- Messages
-- =============================================================================

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  thread_id uuid not null references public.message_threads(id) on delete cascade,
  author_user_id uuid not null references auth.users(id) on delete cascade,
  body text not null check (length(body) between 1 and 4000),
  sent_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index messages_thread_time_idx on public.messages(thread_id, sent_at asc);
create index messages_tenant_time_idx on public.messages(tenant_id, sent_at desc);
create index messages_author_idx on public.messages(author_user_id, sent_at desc);

alter table public.messages enable row level security;

-- =============================================================================
-- Trigger: Ersteller automatisch als Teilnehmer hinzufügen
-- =============================================================================

create or replace function app_auth.add_thread_creator()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.created_by is not null then
    insert into public.message_thread_participants (tenant_id, thread_id, user_id, added_by)
    values (new.tenant_id, new.id, new.created_by, new.created_by)
    on conflict (thread_id, user_id) do nothing;
  end if;
  return new;
end;
$$;

create trigger message_threads_add_creator
  after insert on public.message_threads
  for each row execute function app_auth.add_thread_creator();

-- =============================================================================
-- Trigger: last_message_at auf Thread nachziehen
-- =============================================================================

create or replace function app_auth.bump_thread_last_message()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.message_threads
     set last_message_at = new.sent_at,
         updated_at = now()
   where id = new.thread_id
     and last_message_at < new.sent_at;
  return new;
end;
$$;

create trigger messages_bump_last_message
  after insert on public.messages
  for each row execute function app_auth.bump_thread_last_message();

-- =============================================================================
-- RLS Policies
-- =============================================================================

-- Threads: sehen nur Teilnehmer
create policy "message_threads_select" on public.message_threads
  for select to authenticated
  using (
    app_auth.is_tenant_member(tenant_id)
    and exists (
      select 1 from public.message_thread_participants p
      where p.thread_id = id
        and p.user_id = (select auth.uid())
    )
  );

-- Threads anlegen: Berechtigung + Ersteller = self (damit Trigger sauber läuft)
create policy "message_threads_insert" on public.message_threads
  for insert to authenticated
  with check (
    tenant_id = app_auth.current_tenant_id()
    and app_auth.has_permission('messaging.create')
    and created_by = (select auth.uid())
  );

-- Threads updaten (z.B. Betreff): Teilnehmer + messaging.create
create policy "message_threads_update" on public.message_threads
  for update to authenticated
  using (
    app_auth.is_tenant_member(tenant_id)
    and exists (
      select 1 from public.message_thread_participants p
      where p.thread_id = id
        and p.user_id = (select auth.uid())
    )
  )
  with check (
    tenant_id = app_auth.current_tenant_id()
    and app_auth.has_permission('messaging.create')
  );

-- Participants: eigene Zeilen + alle Teilnehmer eines Threads, in dem ich Teilnehmer bin
create policy "message_thread_participants_select_self" on public.message_thread_participants
  for select to authenticated
  using (
    user_id = (select auth.uid())
    and app_auth.is_tenant_member(tenant_id)
  );

create policy "message_thread_participants_select_peers" on public.message_thread_participants
  for select to authenticated
  using (
    app_auth.is_tenant_member(tenant_id)
    and exists (
      select 1 from public.message_thread_participants me
      where me.thread_id = thread_id
        and me.user_id = (select auth.uid())
    )
  );

-- Participants adden: nur wer selbst Teilnehmer ist + messaging.create
create policy "message_thread_participants_insert" on public.message_thread_participants
  for insert to authenticated
  with check (
    tenant_id = app_auth.current_tenant_id()
    and app_auth.has_permission('messaging.create')
    and exists (
      select 1 from public.message_thread_participants me
      where me.thread_id = thread_id
        and me.user_id = (select auth.uid())
    )
  );

-- Sich selbst als „gelesen" markieren
create policy "message_thread_participants_update_self" on public.message_thread_participants
  for update to authenticated
  using (
    user_id = (select auth.uid())
    and app_auth.is_tenant_member(tenant_id)
  )
  with check (
    user_id = (select auth.uid())
    and tenant_id = app_auth.current_tenant_id()
  );

-- Teilnehmer wieder entfernen: nur wer messaging.create hat und selbst Teilnehmer ist
create policy "message_thread_participants_delete" on public.message_thread_participants
  for delete to authenticated
  using (
    app_auth.is_tenant_member(tenant_id)
    and app_auth.has_permission('messaging.create')
    and exists (
      select 1 from public.message_thread_participants me
      where me.thread_id = thread_id
        and me.user_id = (select auth.uid())
    )
  );

-- Messages: sehen nur Teilnehmer des Threads
create policy "messages_select" on public.messages
  for select to authenticated
  using (
    app_auth.is_tenant_member(tenant_id)
    and exists (
      select 1 from public.message_thread_participants p
      where p.thread_id = thread_id
        and p.user_id = (select auth.uid())
    )
  );

-- Messages posten: Teilnehmer + author = self + messaging.create
create policy "messages_insert" on public.messages
  for insert to authenticated
  with check (
    tenant_id = app_auth.current_tenant_id()
    and author_user_id = (select auth.uid())
    and app_auth.has_permission('messaging.create')
    and exists (
      select 1 from public.message_thread_participants p
      where p.thread_id = thread_id
        and p.user_id = (select auth.uid())
    )
  );

-- Kein UPDATE/DELETE auf Messages (Audit-Charakter).
