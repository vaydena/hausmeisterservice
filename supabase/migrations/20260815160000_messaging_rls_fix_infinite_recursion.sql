-- Fix: "infinite recursion detected in policy for relation
-- message_thread_participants" (Postgres 42P17).
--
-- Befund: JEDE Query gegen message_threads, message_thread_participants oder
-- messages lief live in diesen Fehler — fuer Mitarbeiter wie fuer Bewohner.
-- Das Messaging-Modul war damit vollstaendig unbenutzbar. Aufgefallen ist es
-- erst jetzt, weil bis dahin kein Bewohner Threads hatte und supabase-js den
-- Fehler in `data: null` verschluckt: die Portal-Liste zeigte "keine
-- Nachrichten" statt einer Fehlermeldung, was wie ein leerer, aber
-- funktionierender Zustand aussah.
--
-- Ursache: message_thread_participants_select_peers referenziert in seinem
-- eigenen USING-Ausdruck wieder message_thread_participants. Postgres wendet
-- die Policy auf diese innere Referenz erneut an und bricht mit 42P17 ab.
-- Alle uebrigen Policies, die per EXISTS auf die participants-Tabelle
-- schauen (message_threads, messages), erben den Fehler ueber genau diese
-- innere Policy — deshalb sind sieben Policies betroffen, obwohl nur eine
-- tatsaechlich selbstreferenziert.
--
-- Loesung: das Teilnehmer-Praedikat wandert in eine SECURITY DEFINER
-- Funktion. Die liest die Tabelle mit den Rechten des Owners und damit ohne
-- RLS, wodurch die Rekursion abbricht. Das ist dasselbe Muster, das im
-- Projekt bereits fuer is_tenant_member, is_resident_of_tenant und
-- is_announcement_recipient verwendet wird.
--
-- WICHTIG: Diese Migration aendert die Sichtbarkeits-Semantik NICHT. Jede
-- Policy unten ist eine 1:1-Uebersetzung ihrer bisherigen Fassung; ersetzt
-- wird ausschliesslich der rekursive EXISTS durch den Funktionsaufruf. Wo
-- unten `(A or B) and E` steht, hiess es vorher `(A and E) or (B and E)`.

create or replace function app_auth.is_thread_participant(p_thread_id uuid, p_uid uuid)
returns boolean
language sql
stable
security definer
set search_path to ''
as $$
  select exists (
    select 1 from public.message_thread_participants p
    where p.thread_id = p_thread_id
      and p.user_id = p_uid
  );
$$;

comment on function app_auth.is_thread_participant(uuid, uuid) is
  'Nimmt an einem Thread teil? SECURITY DEFINER, damit RLS-Policies auf '
  'message_thread_participants die Tabelle abfragen koennen, ohne sich '
  'selbst erneut auszuloesen (42P17).';

-- ---------------------------------------------------------------- participants

drop policy if exists "message_thread_participants_select_peers" on public.message_thread_participants;
create policy "message_thread_participants_select_peers" on public.message_thread_participants
  for select to authenticated
  using (
    (
      app_auth.is_tenant_member(tenant_id)
      and app_auth.is_thread_participant(thread_id, (select auth.uid()))
    )
    or (
      app_auth.is_resident_of_tenant(tenant_id)
      and (
        user_id = (select auth.uid())
        or app_auth.is_thread_participant(thread_id, (select auth.uid()))
      )
    )
    or (
      user_id = (select auth.uid())
      and app_auth.is_tenant_member(tenant_id)
    )
  );

drop policy if exists "message_thread_participants_insert" on public.message_thread_participants;
create policy "message_thread_participants_insert" on public.message_thread_participants
  for insert to authenticated
  with check (
    tenant_id = app_auth.current_tenant_id()
    and app_auth.has_permission('messaging.create')
    and app_auth.is_thread_participant(thread_id, (select auth.uid()))
  );

drop policy if exists "message_thread_participants_delete" on public.message_thread_participants;
create policy "message_thread_participants_delete" on public.message_thread_participants
  for delete to authenticated
  using (
    app_auth.is_tenant_member(tenant_id)
    and app_auth.has_permission('messaging.create')
    and app_auth.is_thread_participant(thread_id, (select auth.uid()))
  );

-- --------------------------------------------------------------------- threads

drop policy if exists "message_threads_select" on public.message_threads;
create policy "message_threads_select" on public.message_threads
  for select to authenticated
  using (
    (
      app_auth.is_tenant_member(tenant_id)
      or app_auth.is_resident_of_tenant(tenant_id)
    )
    and app_auth.is_thread_participant(id, (select auth.uid()))
  );

drop policy if exists "message_threads_update" on public.message_threads;
create policy "message_threads_update" on public.message_threads
  for update to authenticated
  using (
    app_auth.is_tenant_member(tenant_id)
    and app_auth.is_thread_participant(id, (select auth.uid()))
  )
  with check (
    tenant_id = app_auth.current_tenant_id()
    and app_auth.has_permission('messaging.create')
  );

-- -------------------------------------------------------------------- messages

drop policy if exists "message_select" on public.messages;
drop policy if exists "messages_select" on public.messages;
create policy "messages_select" on public.messages
  for select to authenticated
  using (
    (
      app_auth.is_tenant_member(tenant_id)
      or app_auth.is_resident_of_tenant(tenant_id)
    )
    and app_auth.is_thread_participant(thread_id, (select auth.uid()))
  );

drop policy if exists "messages_insert" on public.messages;
create policy "messages_insert" on public.messages
  for insert to authenticated
  with check (
    -- current_tenant_id() bleibt bewusst Konjunkt ueber beiden Zweigen, wie
    -- bisher: die Funktion hat einen expliziten residents-Fallback und
    -- liefert damit auch fuer Bewohner den richtigen Tenant.
    tenant_id = app_auth.current_tenant_id()
    and author_user_id = (select auth.uid())
    and app_auth.is_thread_participant(thread_id, (select auth.uid()))
    and (
      app_auth.has_permission('messaging.create')
      or app_auth.is_resident_of_tenant(tenant_id)
    )
  );
