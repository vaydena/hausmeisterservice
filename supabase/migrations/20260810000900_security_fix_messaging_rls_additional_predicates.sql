-- Security-Fix (Fortsetzung): drei weitere Messaging-Policies mit demselben
-- Bug-Muster, die 20260810000800 nicht abgedeckt hat, weil sie in Sprint 4
-- gar nicht konsolidiert wurden (INSERT/DELETE/UPDATE-Pfade, wo es keine
-- Merge-Kandidaten gab).
--
-- Bugs (Live-Dump aus pg_policies):
--   * message_thread_participants_delete (USING):
--       exists ... where me.thread_id = me.thread_id
--       → Jeder Staff mit messaging.create kann Participants aus ALLEN
--         Threads seines Tenants entfernen — auch aus Threads, in denen
--         er nicht Mitglied ist.
--   * message_thread_participants_insert (WITH CHECK):
--       exists ... where me.thread_id = me.thread_id
--       → Jeder Staff mit messaging.create kann Personen zu ALLEN Threads
--         seines Tenants hinzufügen. Der Trigger, der den Ersteller als
--         ersten Participant setzt, funktioniert weiterhin (SECURITY DEFINER-
--         freier Trigger — wenn nicht, dann gilt die Policy nicht; INSERT
--         seitens der App läuft aber unter dem User).
--   * message_threads_update (USING):
--       exists ... where p.thread_id = p.id
--       → In der aktuellen Form matcht das Predikat nur, wenn zufällig
--         participant.id = participant.thread_id — praktisch nie. Die
--         Policy war also faktisch UNBRAUCHBAR (kein Update möglich).
--         Nach dem Fix: Staff mit messaging.create + Participant-Status
--         kann den Thread aktualisieren.
--
-- Correlation jeweils gegen die outer-row (message_thread_participants
-- bzw. message_threads).

alter policy message_thread_participants_delete on public.message_thread_participants
  using (
    app_auth.is_tenant_member(tenant_id)
    and app_auth.has_permission('messaging.create'::text)
    and exists (
      select 1
      from public.message_thread_participants me
      where me.thread_id = message_thread_participants.thread_id
        and me.user_id = (select auth.uid())
    )
  );

alter policy message_thread_participants_insert on public.message_thread_participants
  with check (
    (tenant_id = app_auth.current_tenant_id())
    and app_auth.has_permission('messaging.create'::text)
    and exists (
      select 1
      from public.message_thread_participants me
      where me.thread_id = message_thread_participants.thread_id
        and me.user_id = (select auth.uid())
    )
  );

alter policy message_threads_update on public.message_threads
  using (
    app_auth.is_tenant_member(tenant_id)
    and exists (
      select 1
      from public.message_thread_participants p
      where p.thread_id = message_threads.id
        and p.user_id = (select auth.uid())
    )
  );
