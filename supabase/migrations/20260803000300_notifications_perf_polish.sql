-- =============================================================================
-- Notifications — Performance-Polish
-- =============================================================================
-- Wrappt auth.uid() in Subselect (Initplan-Cache) für alle Notification-RLS-
-- Policies und ergänzt den Index auf notifications.created_by (FK-Coverage).
-- =============================================================================

drop policy "notifications_select_own" on public.notifications;
create policy "notifications_select_own" on public.notifications
  for select to authenticated
  using (
    user_id = (select auth.uid())
    and app_auth.is_tenant_member(tenant_id)
  );

drop policy "notifications_update_own" on public.notifications;
create policy "notifications_update_own" on public.notifications
  for update to authenticated
  using (
    user_id = (select auth.uid())
    and app_auth.is_tenant_member(tenant_id)
  )
  with check (
    user_id = (select auth.uid())
    and tenant_id = app_auth.current_tenant_id()
  );

drop policy "notifications_delete_own" on public.notifications;
create policy "notifications_delete_own" on public.notifications
  for delete to authenticated
  using (
    user_id = (select auth.uid())
    and app_auth.is_tenant_member(tenant_id)
  );

create index if not exists notifications_created_by_idx on public.notifications(created_by);
