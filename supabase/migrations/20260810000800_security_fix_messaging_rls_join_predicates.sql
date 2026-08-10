-- Security-Fix: Messaging-RLS-Policies mit gebrochenen JOIN-Predikaten.
--
-- In 20260803001100_messaging.sql (Original) und mitgezogen in
-- 20260810000500_perf_consolidate_permissive_policies.sql (Sprint 4 hat sie
-- verbatim erhalten, um Perf-Scope nicht mit Semantik-Änderungen zu mischen)
-- enthalten vier Predikate Self-Vergleiche, die immer wahr sind. Wirkung:
-- jeder Tenant-Mitarbeiter sieht ALLE Threads und Nachrichten seines
-- Tenants — auch solche, in denen er nie als Participant geführt wurde.
--
-- Bugs im Detail (Sprint-4-Zeilen als Referenz):
--   * message_thread_participants_select_peers (Line 136):
--       exists ... where me.thread_id = me.thread_id  →  immer true
--   * message_threads_select (Line 161):
--       exists ... where p.thread_id = p.id           →  falscher Reference
--   * messages_insert (Line 175, WITH CHECK):
--       exists ... where p.thread_id = p.thread_id   →  immer true
--   * messages_select (Line 186):
--       exists ... where p.thread_id = p.thread_id   →  immer true
--
-- Korrektur: jeweils gegen die outer-row korrelieren
-- (message_thread_participants.thread_id, message_threads.id,
-- messages.thread_id). Die Resident-Zweige waren schon korrekt und werden
-- semantisch nicht angerührt.
--
-- Semantik nach dem Fix:
--   * Staff-User sehen nur Threads, in denen sie selbst Participant sind.
--   * Alle App-Pages und Server-Actions filtern bereits explizit auf den
--     eigenen User (siehe src/app/(app)/messages/{page,actions}.ts) — die
--     UI war nie auf den Tenant-Wide-Access angewiesen.
--   * Neu: Staff kann Threads/Messages, in denen er nicht Participant ist,
--     nicht mehr per Direkt-Link erreichen (Detail-Page → 404). Genau der
--     intendierte Zustand.

alter policy message_thread_participants_select_peers on public.message_thread_participants
  using (
    (
      app_auth.is_tenant_member(tenant_id)
      and exists (
        select 1
        from public.message_thread_participants me
        where me.thread_id = message_thread_participants.thread_id
          and me.user_id = (select auth.uid())
      )
    )
    or
    (
      app_auth.is_resident_of_tenant(tenant_id)
      and (
        (user_id = (select auth.uid()))
        or exists (
          select 1
          from public.message_thread_participants me
          where me.thread_id = message_thread_participants.thread_id
            and me.user_id = (select auth.uid())
        )
      )
    )
    or
    ((user_id = (select auth.uid())) and app_auth.is_tenant_member(tenant_id))
  );

alter policy message_threads_select on public.message_threads
  using (
    (
      app_auth.is_tenant_member(tenant_id)
      and exists (
        select 1
        from public.message_thread_participants p
        where p.thread_id = message_threads.id
          and p.user_id = (select auth.uid())
      )
    )
    or
    (
      app_auth.is_resident_of_tenant(tenant_id)
      and exists (
        select 1
        from public.message_thread_participants p
        where p.thread_id = message_threads.id
          and p.user_id = (select auth.uid())
      )
    )
  );

alter policy messages_insert on public.messages
  with check (
    (tenant_id = app_auth.current_tenant_id())
    and (author_user_id = (select auth.uid()))
    and (
      (
        app_auth.has_permission('messaging.create'::text)
        and exists (
          select 1
          from public.message_thread_participants p
          where p.thread_id = messages.thread_id
            and p.user_id = (select auth.uid())
        )
      )
      or
      (
        app_auth.is_resident_of_tenant(tenant_id)
        and exists (
          select 1
          from public.message_thread_participants p
          where p.thread_id = messages.thread_id
            and p.user_id = (select auth.uid())
        )
      )
    )
  );

alter policy messages_select on public.messages
  using (
    (
      app_auth.is_tenant_member(tenant_id)
      and exists (
        select 1
        from public.message_thread_participants p
        where p.thread_id = messages.thread_id
          and p.user_id = (select auth.uid())
      )
    )
    or
    (
      app_auth.is_resident_of_tenant(tenant_id)
      and exists (
        select 1
        from public.message_thread_participants p
        where p.thread_id = messages.thread_id
          and p.user_id = (select auth.uid())
      )
    )
  );
