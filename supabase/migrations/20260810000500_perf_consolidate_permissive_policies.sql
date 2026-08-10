-- Performance-Fix: multiple_permissive_policies (55 Findings) konsolidieren.
--
-- Wenn zwei oder mehr PERMISSIVE-Policies für dieselbe (role, action, table)
-- greifen, muss Postgres alle Predikate pro Zeile durchprobieren. Konsolidiert
-- man sie zu einer Policy mit OR, wird nur ein Predikat evaluiert und der
-- Planner kann besser optimieren.
--
-- Behandelt werden drei Muster:
--   1. `<table>_write` FOR ALL kollidiert mit `<table>_select` FOR SELECT.
--      Fix: FOR ALL aufteilen in explizite INSERT + UPDATE + DELETE.
--   2. Staff- und Resident-SELECT-Policies auf derselben Tabelle.
--      Fix: Zu einer Policy mit OR verschmelzen.
--   3. own/others- (bzw. own/permitted-) Split für dieselbe (role, action).
--      Fix: Zu einer Policy mit OR verschmelzen.
--
-- Semantik bleibt in allen Fällen identisch — dieselben Rollen dürfen dieselben
-- Zeilen genau so lesen/schreiben wie vorher. `auth.uid()`-Aufrufe werden
-- zusätzlich als (select auth.uid()) gewrappt (Postgres-Planner-Hint).

------------------------------------------------------------
-- Muster 1: `_write` FOR ALL → drei explizite Policies
------------------------------------------------------------

-- memberships
drop policy if exists memberships_write on public.memberships;
create policy memberships_insert on public.memberships
  for insert to public
  with check (app_auth.is_tenant_member(tenant_id) and app_auth.has_permission('core.users_roles.edit'::text));
create policy memberships_update on public.memberships
  for update to public
  using (app_auth.is_tenant_member(tenant_id) and app_auth.has_permission('core.users_roles.edit'::text))
  with check (app_auth.is_tenant_member(tenant_id) and app_auth.has_permission('core.users_roles.edit'::text));
create policy memberships_delete on public.memberships
  for delete to public
  using (app_auth.is_tenant_member(tenant_id) and app_auth.has_permission('core.users_roles.edit'::text));

-- role_permissions
drop policy if exists role_permissions_write on public.role_permissions;
create policy role_permissions_insert on public.role_permissions
  for insert to public
  with check (exists (select 1 from public.roles r where r.id = role_permissions.role_id and app_auth.is_tenant_member(r.tenant_id) and app_auth.has_permission('core.users_roles.manage'::text)));
create policy role_permissions_update on public.role_permissions
  for update to public
  using (exists (select 1 from public.roles r where r.id = role_permissions.role_id and app_auth.is_tenant_member(r.tenant_id) and app_auth.has_permission('core.users_roles.manage'::text)))
  with check (exists (select 1 from public.roles r where r.id = role_permissions.role_id and app_auth.is_tenant_member(r.tenant_id) and app_auth.has_permission('core.users_roles.manage'::text)));
create policy role_permissions_delete on public.role_permissions
  for delete to public
  using (exists (select 1 from public.roles r where r.id = role_permissions.role_id and app_auth.is_tenant_member(r.tenant_id) and app_auth.has_permission('core.users_roles.manage'::text)));

-- roles
drop policy if exists roles_write on public.roles;
create policy roles_insert on public.roles
  for insert to public
  with check (app_auth.is_tenant_member(tenant_id) and app_auth.has_permission('core.users_roles.manage'::text));
create policy roles_update on public.roles
  for update to public
  using (app_auth.is_tenant_member(tenant_id) and app_auth.has_permission('core.users_roles.manage'::text))
  with check (app_auth.is_tenant_member(tenant_id) and app_auth.has_permission('core.users_roles.manage'::text));
create policy roles_delete on public.roles
  for delete to public
  using (app_auth.is_tenant_member(tenant_id) and app_auth.has_permission('core.users_roles.manage'::text));

-- tenant_modules
drop policy if exists tenant_modules_write on public.tenant_modules;
create policy tenant_modules_insert on public.tenant_modules
  for insert to public
  with check (app_auth.is_tenant_member(tenant_id) and app_auth.has_permission('core.tenants.manage'::text));
create policy tenant_modules_update on public.tenant_modules
  for update to public
  using (app_auth.is_tenant_member(tenant_id) and app_auth.has_permission('core.tenants.manage'::text))
  with check (app_auth.is_tenant_member(tenant_id) and app_auth.has_permission('core.tenants.manage'::text));
create policy tenant_modules_delete on public.tenant_modules
  for delete to public
  using (app_auth.is_tenant_member(tenant_id) and app_auth.has_permission('core.tenants.manage'::text));

-- user_group_members
drop policy if exists user_group_members_write on public.user_group_members;
create policy user_group_members_insert on public.user_group_members
  for insert to public
  with check (exists (select 1 from public.user_groups g where g.id = user_group_members.user_group_id and app_auth.is_tenant_member(g.tenant_id) and app_auth.has_permission('core.users_roles.manage'::text)));
create policy user_group_members_update on public.user_group_members
  for update to public
  using (exists (select 1 from public.user_groups g where g.id = user_group_members.user_group_id and app_auth.is_tenant_member(g.tenant_id) and app_auth.has_permission('core.users_roles.manage'::text)))
  with check (exists (select 1 from public.user_groups g where g.id = user_group_members.user_group_id and app_auth.is_tenant_member(g.tenant_id) and app_auth.has_permission('core.users_roles.manage'::text)));
create policy user_group_members_delete on public.user_group_members
  for delete to public
  using (exists (select 1 from public.user_groups g where g.id = user_group_members.user_group_id and app_auth.is_tenant_member(g.tenant_id) and app_auth.has_permission('core.users_roles.manage'::text)));

-- user_groups
drop policy if exists user_groups_write on public.user_groups;
create policy user_groups_insert on public.user_groups
  for insert to public
  with check (app_auth.is_tenant_member(tenant_id) and app_auth.has_permission('core.users_roles.manage'::text));
create policy user_groups_update on public.user_groups
  for update to public
  using (app_auth.is_tenant_member(tenant_id) and app_auth.has_permission('core.users_roles.manage'::text))
  with check (app_auth.is_tenant_member(tenant_id) and app_auth.has_permission('core.users_roles.manage'::text));
create policy user_groups_delete on public.user_groups
  for delete to public
  using (app_auth.is_tenant_member(tenant_id) and app_auth.has_permission('core.users_roles.manage'::text));

-- user_roles
drop policy if exists user_roles_write on public.user_roles;
create policy user_roles_insert on public.user_roles
  for insert to public
  with check (app_auth.is_tenant_member(tenant_id) and app_auth.has_permission('core.users_roles.edit'::text));
create policy user_roles_update on public.user_roles
  for update to public
  using (app_auth.is_tenant_member(tenant_id) and app_auth.has_permission('core.users_roles.edit'::text))
  with check (app_auth.is_tenant_member(tenant_id) and app_auth.has_permission('core.users_roles.edit'::text));
create policy user_roles_delete on public.user_roles
  for delete to public
  using (app_auth.is_tenant_member(tenant_id) and app_auth.has_permission('core.users_roles.edit'::text));

------------------------------------------------------------
-- Muster 2: Staff + Resident SELECT / UPDATE / INSERT verschmelzen
------------------------------------------------------------

-- buildings SELECT
drop policy if exists buildings_select_resident on public.buildings;
alter policy buildings_select on public.buildings
  using (
    (app_auth.is_tenant_member(tenant_id) and app_auth.has_permission('properties.view'::text, 'property'::text, property_id))
    or
    (app_auth.is_resident_of_tenant(tenant_id) and ((id = app_auth.resident_building_id()) or (property_id = app_auth.resident_property_id())))
  );

-- message_thread_participants SELECT (3 policies: peers, resident, self)
-- Hinweis: das Staff-Peers-Predikat enthält den bestehenden Vergleich
-- me.thread_id = me.thread_id (immer wahr), der hier unverändert übernommen
-- wird; Fix in separatem Ticket, nicht in dieser Perf-Migration.
drop policy if exists message_thread_participants_select_resident on public.message_thread_participants;
drop policy if exists message_thread_participants_select_self on public.message_thread_participants;
alter policy message_thread_participants_select_peers on public.message_thread_participants
  using (
    (app_auth.is_tenant_member(tenant_id) and (exists (select 1 from public.message_thread_participants me where me.thread_id = me.thread_id and me.user_id = (select auth.uid()))))
    or
    (app_auth.is_resident_of_tenant(tenant_id) and ((user_id = (select auth.uid())) or (exists (select 1 from public.message_thread_participants me where me.thread_id = message_thread_participants.thread_id and me.user_id = (select auth.uid())))))
    or
    ((user_id = (select auth.uid())) and app_auth.is_tenant_member(tenant_id))
  );

-- message_thread_participants UPDATE (2 policies: resident, self)
drop policy if exists message_thread_participants_update_resident on public.message_thread_participants;
alter policy message_thread_participants_update_self on public.message_thread_participants
  using (
    (user_id = (select auth.uid()))
    and (app_auth.is_tenant_member(tenant_id) or app_auth.is_resident_of_tenant(tenant_id))
  )
  with check (
    (user_id = (select auth.uid()))
    and (app_auth.is_resident_of_tenant(tenant_id) or (tenant_id = app_auth.current_tenant_id()))
  );

-- message_threads SELECT (2 policies: select, select_resident)
-- Hinweis: Staff-Predikat enthält p.thread_id = p.id (bestehender Bug in
-- Referenz-Vergleich, unverändert übernommen).
drop policy if exists message_threads_select_resident on public.message_threads;
alter policy message_threads_select on public.message_threads
  using (
    (app_auth.is_tenant_member(tenant_id) and (exists (select 1 from public.message_thread_participants p where p.thread_id = p.id and p.user_id = (select auth.uid()))))
    or
    (app_auth.is_resident_of_tenant(tenant_id) and (exists (select 1 from public.message_thread_participants p where p.thread_id = message_threads.id and p.user_id = (select auth.uid()))))
  );

-- messages INSERT (2 policies: insert, insert_resident)
-- Hinweis: Staff-Predikat enthält p.thread_id = p.thread_id (bestehender
-- Bug — Self-Vergleich immer wahr, unverändert übernommen).
drop policy if exists messages_insert_resident on public.messages;
alter policy messages_insert on public.messages
  with check (
    (tenant_id = app_auth.current_tenant_id())
    and (author_user_id = (select auth.uid()))
    and (
      (app_auth.has_permission('messaging.create'::text) and (exists (select 1 from public.message_thread_participants p where p.thread_id = p.thread_id and p.user_id = (select auth.uid()))))
      or
      (app_auth.is_resident_of_tenant(tenant_id) and (exists (select 1 from public.message_thread_participants p where p.thread_id = messages.thread_id and p.user_id = (select auth.uid()))))
    )
  );

-- messages SELECT (2 policies)
-- Hinweis: Staff-Predikat enthält denselben Self-Vergleich p.thread_id = p.thread_id.
drop policy if exists messages_select_resident on public.messages;
alter policy messages_select on public.messages
  using (
    (app_auth.is_tenant_member(tenant_id) and (exists (select 1 from public.message_thread_participants p where p.thread_id = p.thread_id and p.user_id = (select auth.uid()))))
    or
    (app_auth.is_resident_of_tenant(tenant_id) and (exists (select 1 from public.message_thread_participants p where p.thread_id = messages.thread_id and p.user_id = (select auth.uid()))))
  );

-- properties SELECT
drop policy if exists properties_select_resident on public.properties;
alter policy properties_select on public.properties
  using (
    ((deleted_at is null) and app_auth.is_tenant_member(tenant_id) and app_auth.has_permission('properties.view'::text, 'property'::text, id))
    or
    (app_auth.is_resident_of_tenant(tenant_id) and (id = app_auth.resident_property_id()))
  );

-- residents SELECT
drop policy if exists residents_select_self on public.residents;
alter policy residents_select on public.residents
  using (
    ((deleted_at is null) and app_auth.is_tenant_member(tenant_id) and (((property_id is null) and app_auth.has_permission('residents.view'::text)) or ((property_id is not null) and app_auth.has_permission('residents.view'::text, 'property'::text, property_id))))
    or
    (user_id = (select auth.uid()))
  );

-- units SELECT
drop policy if exists units_select_resident on public.units;
alter policy units_select on public.units
  using (
    (app_auth.is_tenant_member(tenant_id) and app_auth.has_permission('properties.view'::text, 'property'::text, property_id))
    or
    (app_auth.is_resident_of_tenant(tenant_id) and (id = app_auth.resident_unit_id()))
  );

------------------------------------------------------------
-- Muster 3: own + others/permitted verschmelzen
------------------------------------------------------------

-- defect_reports INSERT
drop policy if exists defect_reports_insert_resident on public.defect_reports;
alter policy defect_reports_insert on public.defect_reports
  with check (
    (tenant_id = app_auth.current_tenant_id())
    and (
      app_auth.has_permission('defect_reports.create'::text, 'property'::text, property_id)
      or
      ((reporter_kind = 'resident'::text) and (reporter_user_id = (select auth.uid())) and app_auth.is_resident_of_tenant(tenant_id) and (property_id = app_auth.resident_property_id()))
    )
  );

-- defect_reports SELECT
drop policy if exists defect_reports_select_own on public.defect_reports;
alter policy defect_reports_select_permitted on public.defect_reports
  using (
    (reporter_user_id = (select auth.uid()))
    or
    (app_auth.is_tenant_member(tenant_id) and app_auth.has_permission('defect_reports.view'::text, 'property'::text, property_id))
  );

-- documents DELETE
drop policy if exists documents_delete_own on public.documents;
alter policy documents_delete_permitted on public.documents
  using (
    app_auth.is_tenant_member(tenant_id)
    and (
      (uploaded_by = (select auth.uid()))
      or (property_id is null)
      or app_auth.has_permission('documents.delete'::text, 'property'::text, property_id)
    )
  );

-- documents SELECT
drop policy if exists documents_select_own on public.documents;
alter policy documents_select_permitted on public.documents
  using (
    app_auth.is_tenant_member(tenant_id)
    and (
      (uploaded_by = (select auth.uid()))
      or (property_id is null)
      or app_auth.has_permission('documents.view'::text, 'property'::text, property_id)
    )
  );

-- key_handovers SELECT
drop policy if exists key_handovers_select_own_holder on public.key_handovers;
alter policy key_handovers_select_permitted on public.key_handovers
  using (
    app_auth.is_tenant_member(tenant_id)
    and (
      (holder_user_id = (select auth.uid()))
      or app_auth.has_permission('keys.view'::text, 'property'::text, property_id)
    )
  );

-- schedule_entries DELETE
drop policy if exists schedule_entries_delete_own on public.schedule_entries;
alter policy schedule_entries_delete_others on public.schedule_entries
  using (
    app_auth.is_tenant_member(tenant_id)
    and (
      app_auth.has_permission('scheduling.edit'::text)
      or
      ((user_id = (select auth.uid())) and app_auth.has_permission('scheduling.view'::text))
    )
  );

-- schedule_entries INSERT
drop policy if exists schedule_entries_insert_own on public.schedule_entries;
alter policy schedule_entries_insert_for_others on public.schedule_entries
  with check (
    (tenant_id = app_auth.current_tenant_id())
    and (
      ((user_id <> (select auth.uid())) and app_auth.has_permission('scheduling.edit'::text))
      or
      ((user_id = (select auth.uid())) and app_auth.has_permission('scheduling.view'::text))
    )
  );

-- schedule_entries SELECT
drop policy if exists schedule_entries_select_own on public.schedule_entries;
alter policy schedule_entries_select_others on public.schedule_entries
  using (
    app_auth.is_tenant_member(tenant_id)
    and (
      app_auth.has_permission('scheduling.view'::text)
      or (user_id = (select auth.uid()))
    )
  );

-- schedule_entries UPDATE
drop policy if exists schedule_entries_update_own on public.schedule_entries;
alter policy schedule_entries_update_others on public.schedule_entries
  using (
    app_auth.is_tenant_member(tenant_id)
    and (
      app_auth.has_permission('scheduling.edit'::text)
      or
      ((user_id = (select auth.uid())) and app_auth.has_permission('scheduling.view'::text))
    )
  )
  with check (
    (tenant_id = app_auth.current_tenant_id())
    and (
      app_auth.has_permission('scheduling.edit'::text)
      or app_auth.has_permission('scheduling.view'::text)
    )
  );

-- time_entries INSERT
drop policy if exists time_entries_insert_own on public.time_entries;
alter policy time_entries_insert_for_others on public.time_entries
  with check (
    (tenant_id = app_auth.current_tenant_id())
    and app_auth.has_permission('time_tracking.create'::text)
    and (
      (user_id = (select auth.uid()))
      or
      ((user_id <> (select auth.uid())) and app_auth.has_permission('time_tracking.view_others'::text))
    )
  );

-- time_entries SELECT
drop policy if exists time_entries_select_own on public.time_entries;
alter policy time_entries_select_others on public.time_entries
  using (
    app_auth.is_tenant_member(tenant_id)
    and (
      app_auth.has_permission('time_tracking.view_others'::text)
      or (user_id = (select auth.uid()))
    )
  );

-- time_entries UPDATE
drop policy if exists time_entries_update_own on public.time_entries;
alter policy time_entries_update_others on public.time_entries
  using (
    app_auth.is_tenant_member(tenant_id)
    and (
      (app_auth.has_permission('time_tracking.view_others'::text) and app_auth.has_permission('time_tracking.approve'::text))
      or
      ((user_id = (select auth.uid())) and app_auth.has_permission('time_tracking.edit'::text))
    )
  )
  with check (
    (tenant_id = app_auth.current_tenant_id())
    and (
      app_auth.has_permission('time_tracking.approve'::text)
      or
      ((user_id = (select auth.uid())) and app_auth.has_permission('time_tracking.edit'::text))
    )
  );

-- time_entry_corrections INSERT
drop policy if exists time_corr_insert_own_entry on public.time_entry_corrections;
alter policy time_corr_insert_others_entry on public.time_entry_corrections
  with check (
    (tenant_id = app_auth.current_tenant_id())
    and (requested_by = (select auth.uid()))
    and (status = 'pending'::text)
    and app_auth.has_permission('time_tracking.edit'::text)
    and (
      (entry_user_id = (select auth.uid()))
      or
      ((entry_user_id <> (select auth.uid())) and app_auth.has_permission('time_tracking.view_others'::text))
    )
  );

-- time_entry_corrections SELECT
drop policy if exists time_corr_select_own on public.time_entry_corrections;
alter policy time_corr_select_others on public.time_entry_corrections
  using (
    app_auth.is_tenant_member(tenant_id)
    and (
      app_auth.has_permission('time_tracking.approve'::text)
      or (requested_by = (select auth.uid()))
      or (entry_user_id = (select auth.uid()))
    )
  );

-- time_entry_corrections UPDATE (decide + withdraw_own)
-- WITH-CHECK enthält bewusst redundant den requested_by-Check, damit ein
-- Nutzer mit approve-Berechtigung nicht heimlich seinen eigenen Antrag
-- selbst genehmigen kann — spiegelt exakt das USING-Gating.
drop policy if exists time_corr_withdraw_own on public.time_entry_corrections;
alter policy time_corr_decide on public.time_entry_corrections
  using (
    app_auth.is_tenant_member(tenant_id)
    and (
      ((requested_by <> (select auth.uid())) and app_auth.has_permission('time_tracking.approve'::text))
      or (requested_by = (select auth.uid()))
    )
  )
  with check (
    app_auth.is_tenant_member(tenant_id)
    and (
      ((requested_by <> (select auth.uid())) and app_auth.has_permission('time_tracking.approve'::text) and (status = any (array['approved'::text, 'rejected'::text])))
      or
      ((requested_by = (select auth.uid())) and (status = any (array['pending'::text, 'withdrawn'::text])))
    )
  );
