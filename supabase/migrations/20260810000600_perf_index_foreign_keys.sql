-- Performance-Fix: Foreign Keys ohne Covering-Index nachziehen.
--
-- Warum: FKs ohne Index bedeuten (a) Sequential Scans bei JOIN/lookup und
-- (b) einen Full-Table-Scan bei jeder UPDATE/DELETE-Operation der referenzierten
-- Zeile (Postgres muss prüfen, dass die Zeile nicht mehr in irgendeiner FK
-- referenziert wird). Bei users-Tabellen (created_by/updated_by referenzieren
-- auth.users) heißt das: jedes User-Update triggert 30+ Sequential Scans.
--
-- Deckt alle 50 Findings des Supabase-Advisors `unindexed_foreign_keys` ab.
-- Naming-Konvention: `<shortTable>_<col>_idx` (Projekt-Standard, siehe
-- migration-index-naming-coverage.test.ts).

create index if not exists automation_rules_created_by_idx on public.automation_rules (created_by);
create index if not exists automation_rules_updated_by_idx on public.automation_rules (updated_by);
create index if not exists billing_line_items_tenant_id_idx on public.billing_line_items (tenant_id);
create index if not exists buildings_created_by_idx on public.buildings (created_by);
create index if not exists buildings_updated_by_idx on public.buildings (updated_by);
create index if not exists checklist_run_items_checked_by_idx on public.checklist_run_items (checked_by);
create index if not exists checklist_run_items_template_item_id_idx on public.checklist_run_items (template_item_id);
create index if not exists checklist_runs_completed_by_idx on public.checklist_runs (completed_by);
create index if not exists checklist_runs_started_by_idx on public.checklist_runs (started_by);
create index if not exists checklist_templates_created_by_idx on public.checklist_templates (created_by);
create index if not exists checklist_templates_updated_by_idx on public.checklist_templates (updated_by);
create index if not exists defect_reports_building_id_idx on public.defect_reports (building_id);
create index if not exists defect_reports_converted_work_order_id_idx on public.defect_reports (converted_work_order_id);
create index if not exists defect_reports_created_by_idx on public.defect_reports (created_by);
create index if not exists defect_reports_reviewed_by_idx on public.defect_reports (reviewed_by);
create index if not exists defect_reports_unit_id_idx on public.defect_reports (unit_id);
create index if not exists defect_reports_updated_by_idx on public.defect_reports (updated_by);
create index if not exists employees_created_by_idx on public.employees (created_by);
create index if not exists employees_updated_by_idx on public.employees (updated_by);
create index if not exists invoices_created_by_idx on public.invoices (created_by);
create index if not exists invoices_updated_by_idx on public.invoices (updated_by);
create index if not exists maintenance_plans_building_id_idx on public.maintenance_plans (building_id);
create index if not exists maintenance_plans_created_by_idx on public.maintenance_plans (created_by);
create index if not exists maintenance_plans_unit_id_idx on public.maintenance_plans (unit_id);
create index if not exists maintenance_plans_updated_by_idx on public.maintenance_plans (updated_by);
create index if not exists offers_created_by_idx on public.offers (created_by);
create index if not exists offers_updated_by_idx on public.offers (updated_by);
create index if not exists owners_created_by_idx on public.owners (created_by);
create index if not exists owners_updated_by_idx on public.owners (updated_by);
create index if not exists properties_created_by_idx on public.properties (created_by);
create index if not exists properties_updated_by_idx on public.properties (updated_by);
create index if not exists residents_building_id_idx on public.residents (building_id);
create index if not exists residents_created_by_idx on public.residents (created_by);
create index if not exists residents_updated_by_idx on public.residents (updated_by);
create index if not exists role_permissions_permission_key_idx on public.role_permissions (permission_key);
create index if not exists time_entries_created_by_idx on public.time_entries (created_by);
create index if not exists time_entries_employee_id_idx on public.time_entries (employee_id);
create index if not exists time_entries_updated_by_idx on public.time_entries (updated_by);
create index if not exists units_created_by_idx on public.units (created_by);
create index if not exists units_updated_by_idx on public.units (updated_by);
create index if not exists user_group_members_user_id_idx on public.user_group_members (user_id);
create index if not exists user_roles_created_by_idx on public.user_roles (created_by);
create index if not exists user_roles_role_id_idx on public.user_roles (role_id);
create index if not exists user_roles_tenant_id_idx on public.user_roles (tenant_id);
create index if not exists work_order_events_actor_id_idx on public.work_order_events (actor_id);
create index if not exists work_orders_building_id_idx on public.work_orders (building_id);
create index if not exists work_orders_closed_by_idx on public.work_orders (closed_by);
create index if not exists work_orders_created_by_idx on public.work_orders (created_by);
create index if not exists work_orders_unit_id_idx on public.work_orders (unit_id);
create index if not exists work_orders_updated_by_idx on public.work_orders (updated_by);
