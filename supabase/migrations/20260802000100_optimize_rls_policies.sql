-- =============================================================================
-- Performance-Optimierung der RLS-Policies
-- =============================================================================
-- 1. Zusammengeführte Policies (Multiple Permissive Policies Warning):
--      employees: select_self + select_permitted -> select (OR-Bedingung)
--      work_orders: select_assignee + select_permitted -> select (OR-Bedingung)
-- 2. auth.uid()-Aufrufe in (select auth.uid()) gewrappt (auth_rls_initplan Warning):
--      users: users_select_self, users_select_via_membership, users_update_self
--      user_roles: user_roles_select
--      work_orders: work_orders_update
-- =============================================================================

-- ---- employees: 2 SELECT-Policies zu einer OR-Policy zusammenführen ----
drop policy if exists "employees_select_self" on public.employees;
drop policy if exists "employees_select_permitted" on public.employees;

create policy "employees_select" on public.employees
  for select to authenticated
  using (
    app_auth.is_tenant_member(tenant_id)
    and (
      user_id = (select auth.uid())
      or app_auth.has_permission('employees.view')
    )
  );

-- ---- work_orders: 2 SELECT-Policies zusammenführen ----
drop policy if exists "work_orders_select_assignee" on public.work_orders;
drop policy if exists "work_orders_select_permitted" on public.work_orders;

create policy "work_orders_select" on public.work_orders
  for select to authenticated
  using (
    deleted_at is null
    and app_auth.is_tenant_member(tenant_id)
    and (
      assignee_id in (select id from public.employees where user_id = (select auth.uid()))
      or app_auth.has_permission('work_orders.view', 'property', property_id)
    )
  );

-- ---- work_orders_update: auth.uid() wrappen ----
drop policy if exists "work_orders_update" on public.work_orders;

create policy "work_orders_update" on public.work_orders
  for update to authenticated
  using (
    app_auth.is_tenant_member(tenant_id)
    and (
      app_auth.has_permission('work_orders.edit', 'property', property_id)
      or (
        assignee_id in (select id from public.employees where user_id = (select auth.uid()))
        and app_auth.has_permission('work_orders.edit')
      )
    )
  )
  with check (
    tenant_id = app_auth.current_tenant_id()
    and (
      app_auth.has_permission('work_orders.edit', 'property', property_id)
      or (
        assignee_id in (select id from public.employees where user_id = (select auth.uid()))
        and app_auth.has_permission('work_orders.edit')
      )
    )
  );

-- ---- users: 3 Policies aus init-migration wrappen ----
drop policy if exists "users_select_self" on public.users;
drop policy if exists "users_select_via_membership" on public.users;
drop policy if exists "users_update_self" on public.users;

create policy "users_select" on public.users
  for select to authenticated
  using (
    id = (select auth.uid())
    or exists (
      select 1 from public.memberships m1
      join public.memberships m2 on m2.tenant_id = m1.tenant_id
      where m1.user_id = (select auth.uid())
        and m2.user_id = public.users.id
        and m1.status = 'active'
        and m2.status = 'active'
    )
  );

create policy "users_update_self" on public.users
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- ---- user_roles: Policy aus init-migration wrappen ----
drop policy if exists "user_roles_select" on public.user_roles;

create policy "user_roles_select" on public.user_roles
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or app_auth.is_tenant_member(tenant_id)
  );
