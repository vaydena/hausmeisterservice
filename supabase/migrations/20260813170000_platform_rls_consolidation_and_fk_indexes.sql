-- Sprint 24: Advisor-Hardening
--
-- Behebt die drei WARN "Multiple Permissive Policies" auf platform.invoices
-- (INSERT + SELECT) und platform.subscription_plans (SELECT), plus die zwei
-- INFO "Unindexed foreign keys" auf platform.invoices.plan_id und
-- public.tenants.subscription_plan_id.
--
-- Vorher hatten platform.invoices und platform.subscription_plans jeweils
-- eine breite "admin_all"-FOR-ALL-Policy nebst spezifischen Tenant-/Public-
-- Policies fuer SELECT bzw. INSERT. Postgres muss RLS-Predikate aller
-- permissiven Policies UND-verknuepft evaluieren; ueberlappende Policies
-- kosten pro Zeile CPU ohne Sicherheitsgewinn.
--
-- Nach der Migration existiert pro (Tabelle, Op) genau eine permissive
-- Policy fuer authenticated/public.

begin;

-- ============================================================================
-- platform.invoices
-- ============================================================================

drop policy if exists invoices_admin_all              on platform.invoices;
drop policy if exists invoices_tenant_insert          on platform.invoices;
drop policy if exists invoices_tenant_or_admin_select on platform.invoices;

-- SELECT: Plattform-Admin ODER Tenant-Owner (aktive Membership) der
-- Rechnung. Selbe Semantik wie vorher invoices_tenant_or_admin_select.
create policy invoices_select on platform.invoices
  for select to authenticated
  using (
    app_auth.is_platform_admin()
    or exists (
      select 1
      from public.memberships m
      where m.tenant_id = invoices.tenant_id
        and m.user_id  = (select auth.uid())
        and m.status   = 'active'
        and m.is_owner = true
    )
  );

-- INSERT: Plattform-Admin ODER Tenant-Owner. Vorher via zwei getrennter
-- Policies (admin_all + tenant_insert), jetzt in einer OR-Bedingung.
create policy invoices_insert on platform.invoices
  for insert to authenticated
  with check (
    app_auth.is_platform_admin()
    or exists (
      select 1
      from public.memberships m
      where m.tenant_id = invoices.tenant_id
        and m.user_id  = (select auth.uid())
        and m.status   = 'active'
        and m.is_owner = true
    )
  );

-- UPDATE: nur Plattform-Admin. Kein Change gegenueber vorher — dort war
-- UPDATE ausschliesslich ueber admin_all abgedeckt.
create policy invoices_update on platform.invoices
  for update to authenticated
  using      (app_auth.is_platform_admin())
  with check (app_auth.is_platform_admin());

-- DELETE: nur Plattform-Admin. Kein Change gegenueber vorher.
create policy invoices_delete on platform.invoices
  for delete to authenticated
  using (app_auth.is_platform_admin());

-- ============================================================================
-- platform.subscription_plans
-- ============================================================================

drop policy if exists plans_admin_all      on platform.subscription_plans;
drop policy if exists plans_public_select  on platform.subscription_plans;

-- SELECT: oeffentliche Plaene sind fuer alle (public) sichtbar, private
-- Plaene nur fuer Plattform-Admin. Public role deckt anon+authenticated
-- ab, damit die Preisseite auch ohne Login funktioniert.
create policy plans_select on platform.subscription_plans
  for select to public
  using (is_public = true or app_auth.is_platform_admin());

-- INSERT/UPDATE/DELETE: nur Plattform-Admin. Vorher via plans_admin_all
-- (FOR ALL) — jetzt als drei explizite Policies, damit
-- rls-policy-explicit-for-op-coverage.test.ts sauber ist.
create policy plans_insert on platform.subscription_plans
  for insert to authenticated
  with check (app_auth.is_platform_admin());

create policy plans_update on platform.subscription_plans
  for update to authenticated
  using      (app_auth.is_platform_admin())
  with check (app_auth.is_platform_admin());

create policy plans_delete on platform.subscription_plans
  for delete to authenticated
  using (app_auth.is_platform_admin());

-- ============================================================================
-- Indexe auf Foreign-Key-Spalten
-- ============================================================================

-- Ohne den Index muss ein ON UPDATE / ON DELETE auf platform.subscription_plans
-- den kompletten platform.invoices-Scan machen, um Kind-Zeilen zu finden.
-- Selber Grund fuer public.tenants.
create index if not exists invoices_plan_id_idx
  on platform.invoices(plan_id);

create index if not exists tenants_subscription_plan_id_idx
  on public.tenants(subscription_plan_id);

commit;
