-- Performance-Fix: auth.uid() in RLS-Policies durch (select auth.uid()) ersetzen.
--
-- Warum: PostgreSQL evaluiert Aufrufe wie `auth.uid()` per Zeile neu, wenn sie
-- direkt in einer USING/WITH-CHECK-Expression stehen. Wrapping als Subselect
-- signalisiert dem Planner, dass der Ausdruck konstant ist — er wird pro Query
-- einmal ausgewertet und geinlined statt N-mal. Auf Tabellen mit vielen Zeilen
-- spart das messbar CPU. Semantik bleibt identisch.
--
-- Deckt alle 27 Findings des Supabase-Advisors `auth_rls_initplan` ab.

-- announcements
alter policy "announcements.delete" on public.announcements
  using (app_auth.is_tenant_member(tenant_id) and (created_by = (select auth.uid())) and (status = 'draft'::announcement_status));

alter policy "announcements.insert" on public.announcements
  with check (app_auth.is_tenant_member(tenant_id) and (tenant_id = app_auth.current_tenant_id()) and app_auth.has_permission('announcements.create'::text) and (created_by = (select auth.uid())));

alter policy "announcements.select" on public.announcements
  using ((app_auth.is_tenant_member(tenant_id) and ((created_by = (select auth.uid())) or app_auth.has_permission('announcements.publish'::text) or ((status = 'published'::announcement_status) and app_auth.is_announcement_recipient(tenant_id, target_type, target_role_key, target_user_ids, target_property_id, (select auth.uid()))))) or ((status = 'published'::announcement_status) and app_auth.is_resident_of_tenant(tenant_id) and app_auth.is_announcement_recipient(tenant_id, target_type, target_role_key, target_user_ids, target_property_id, (select auth.uid()))));

alter policy "announcements.update" on public.announcements
  using (app_auth.is_tenant_member(tenant_id) and (((created_by = (select auth.uid())) and (status = 'draft'::announcement_status)) or app_auth.has_permission('announcements.publish'::text) or app_auth.has_permission('announcements.close'::text)));

-- announcement_receipts
alter policy "announcement_receipts.insert" on public.announcement_receipts
  with check ((user_id = (select auth.uid())) and (exists (select 1 from public.announcements a where ((a.id = announcement_receipts.announcement_id) and (a.status = 'published'::announcement_status) and app_auth.is_announcement_recipient(a.tenant_id, a.target_type, a.target_role_key, a.target_user_ids, a.target_property_id, (select auth.uid()))))));

alter policy "announcement_receipts.select" on public.announcement_receipts
  using ((user_id = (select auth.uid())) or (exists (select 1 from public.announcements a where ((a.id = announcement_receipts.announcement_id) and app_auth.is_tenant_member(a.tenant_id) and ((a.created_by = (select auth.uid())) or app_auth.has_permission('announcements.publish'::text))))));

alter policy "announcement_receipts.update" on public.announcement_receipts
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- defect_reports
alter policy defect_reports_insert_resident on public.defect_reports
  with check ((tenant_id = app_auth.current_tenant_id()) and (reporter_kind = 'resident'::text) and (reporter_user_id = (select auth.uid())) and app_auth.is_resident_of_tenant(tenant_id) and (property_id = app_auth.resident_property_id()));

alter policy defect_reports_select_own on public.defect_reports
  using (reporter_user_id = (select auth.uid()));

-- documents
alter policy documents_delete_own on public.documents
  using ((uploaded_by = (select auth.uid())) and app_auth.is_tenant_member(tenant_id));

alter policy documents_select_own on public.documents
  using ((uploaded_by = (select auth.uid())) and app_auth.is_tenant_member(tenant_id));

alter policy documents_update_caption on public.documents
  using (app_auth.is_tenant_member(tenant_id) and ((uploaded_by = (select auth.uid())) or ((property_id is not null) and app_auth.has_permission('documents.edit'::text, 'property'::text, property_id))))
  with check ((tenant_id = app_auth.current_tenant_id()) and ((uploaded_by = (select auth.uid())) or ((property_id is not null) and app_auth.has_permission('documents.edit'::text, 'property'::text, property_id))));

-- message_thread_participants
alter policy message_thread_participants_select_resident on public.message_thread_participants
  using (app_auth.is_resident_of_tenant(tenant_id) and ((user_id = (select auth.uid())) or (exists (select 1 from public.message_thread_participants me where ((me.thread_id = message_thread_participants.thread_id) and (me.user_id = (select auth.uid())))))));

alter policy message_thread_participants_update_resident on public.message_thread_participants
  using ((user_id = (select auth.uid())) and app_auth.is_resident_of_tenant(tenant_id))
  with check ((user_id = (select auth.uid())) and app_auth.is_resident_of_tenant(tenant_id));

-- message_threads
alter policy message_threads_select_resident on public.message_threads
  using (app_auth.is_resident_of_tenant(tenant_id) and (exists (select 1 from public.message_thread_participants p where ((p.thread_id = message_threads.id) and (p.user_id = (select auth.uid()))))));

-- messages
alter policy messages_insert_resident on public.messages
  with check ((tenant_id = app_auth.current_tenant_id()) and (author_user_id = (select auth.uid())) and app_auth.is_resident_of_tenant(tenant_id) and (exists (select 1 from public.message_thread_participants p where ((p.thread_id = messages.thread_id) and (p.user_id = (select auth.uid()))))));

alter policy messages_select_resident on public.messages
  using (app_auth.is_resident_of_tenant(tenant_id) and (exists (select 1 from public.message_thread_participants p where ((p.thread_id = messages.thread_id) and (p.user_id = (select auth.uid()))))));

-- push_subscriptions
alter policy push_subscriptions_delete_own on public.push_subscriptions
  using ((user_id = (select auth.uid())) and app_auth.is_tenant_member(tenant_id));

alter policy push_subscriptions_insert_own on public.push_subscriptions
  with check ((user_id = (select auth.uid())) and (tenant_id = app_auth.current_tenant_id()));

alter policy push_subscriptions_select_own on public.push_subscriptions
  using ((user_id = (select auth.uid())) and app_auth.is_tenant_member(tenant_id));

-- residents
alter policy residents_select_self on public.residents
  using (user_id = (select auth.uid()));

-- sent_emails
alter policy "sent_emails.update" on public.sent_emails
  using (app_auth.is_tenant_member(tenant_id) and ((sent_by = (select auth.uid())) or app_auth.has_permission('billing.edit'::text)))
  with check (app_auth.is_tenant_member(tenant_id));

-- time_entries
alter policy time_entries_delete_own on public.time_entries
  using ((user_id = (select auth.uid())) and app_auth.is_tenant_member(tenant_id) and app_auth.has_permission('time_tracking.edit'::text));

alter policy time_entries_insert_for_others on public.time_entries
  with check ((tenant_id = app_auth.current_tenant_id()) and (user_id <> (select auth.uid())) and app_auth.has_permission('time_tracking.view_others'::text) and app_auth.has_permission('time_tracking.create'::text));

alter policy time_entries_insert_own on public.time_entries
  with check ((tenant_id = app_auth.current_tenant_id()) and (user_id = (select auth.uid())) and app_auth.has_permission('time_tracking.create'::text));

alter policy time_entries_select_own on public.time_entries
  using ((user_id = (select auth.uid())) and app_auth.is_tenant_member(tenant_id));

alter policy time_entries_update_own on public.time_entries
  using ((user_id = (select auth.uid())) and app_auth.is_tenant_member(tenant_id) and app_auth.has_permission('time_tracking.edit'::text))
  with check ((user_id = (select auth.uid())) and (tenant_id = app_auth.current_tenant_id()) and app_auth.has_permission('time_tracking.edit'::text));
