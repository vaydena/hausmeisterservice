-- Rename der 50 FK-Indizes auf Projekt-Konvention `<shortTable>_<col>_idx`.
--
-- Kontext: 20260810000600_perf_index_foreign_keys.sql wurde ursprünglich mit
-- dem Präfix-Stil `idx_<table>_<col>` geschrieben, den `migration-index-
-- naming-coverage.test.ts` nicht akzeptiert. Die Datei ist inzwischen auf die
-- korrekte Konvention umgestellt — dieser Follow-Up bringt die bereits in der
-- Prod-DB angelegten Indizes auf denselben Stand.
--
-- Bei einem frischen `supabase db reset` matcht `IF EXISTS` nicht (die alten
-- Namen sind dort nie entstanden) und die Statements sind No-Ops. Sicher
-- idempotent.

alter index if exists idx_automation_rules_created_by rename to automation_rules_created_by_idx;
alter index if exists idx_automation_rules_updated_by rename to automation_rules_updated_by_idx;
alter index if exists idx_billing_line_items_tenant_id rename to billing_line_items_tenant_id_idx;
alter index if exists idx_buildings_created_by rename to buildings_created_by_idx;
alter index if exists idx_buildings_updated_by rename to buildings_updated_by_idx;
alter index if exists idx_checklist_run_items_checked_by rename to checklist_run_items_checked_by_idx;
alter index if exists idx_checklist_run_items_template_item_id rename to checklist_run_items_template_item_id_idx;
alter index if exists idx_checklist_runs_completed_by rename to checklist_runs_completed_by_idx;
alter index if exists idx_checklist_runs_started_by rename to checklist_runs_started_by_idx;
alter index if exists idx_checklist_templates_created_by rename to checklist_templates_created_by_idx;
alter index if exists idx_checklist_templates_updated_by rename to checklist_templates_updated_by_idx;
alter index if exists idx_defect_reports_building_id rename to defect_reports_building_id_idx;
alter index if exists idx_defect_reports_converted_work_order_id rename to defect_reports_converted_work_order_id_idx;
alter index if exists idx_defect_reports_created_by rename to defect_reports_created_by_idx;
alter index if exists idx_defect_reports_reviewed_by rename to defect_reports_reviewed_by_idx;
alter index if exists idx_defect_reports_unit_id rename to defect_reports_unit_id_idx;
alter index if exists idx_defect_reports_updated_by rename to defect_reports_updated_by_idx;
alter index if exists idx_employees_created_by rename to employees_created_by_idx;
alter index if exists idx_employees_updated_by rename to employees_updated_by_idx;
alter index if exists idx_invoices_created_by rename to invoices_created_by_idx;
alter index if exists idx_invoices_updated_by rename to invoices_updated_by_idx;
alter index if exists idx_maintenance_plans_building_id rename to maintenance_plans_building_id_idx;
alter index if exists idx_maintenance_plans_created_by rename to maintenance_plans_created_by_idx;
alter index if exists idx_maintenance_plans_unit_id rename to maintenance_plans_unit_id_idx;
alter index if exists idx_maintenance_plans_updated_by rename to maintenance_plans_updated_by_idx;
alter index if exists idx_offers_created_by rename to offers_created_by_idx;
alter index if exists idx_offers_updated_by rename to offers_updated_by_idx;
alter index if exists idx_owners_created_by rename to owners_created_by_idx;
alter index if exists idx_owners_updated_by rename to owners_updated_by_idx;
alter index if exists idx_properties_created_by rename to properties_created_by_idx;
alter index if exists idx_properties_updated_by rename to properties_updated_by_idx;
alter index if exists idx_residents_building_id rename to residents_building_id_idx;
alter index if exists idx_residents_created_by rename to residents_created_by_idx;
alter index if exists idx_residents_updated_by rename to residents_updated_by_idx;
alter index if exists idx_role_permissions_permission_key rename to role_permissions_permission_key_idx;
alter index if exists idx_time_entries_created_by rename to time_entries_created_by_idx;
alter index if exists idx_time_entries_employee_id rename to time_entries_employee_id_idx;
alter index if exists idx_time_entries_updated_by rename to time_entries_updated_by_idx;
alter index if exists idx_units_created_by rename to units_created_by_idx;
alter index if exists idx_units_updated_by rename to units_updated_by_idx;
alter index if exists idx_user_group_members_user_id rename to user_group_members_user_id_idx;
alter index if exists idx_user_roles_created_by rename to user_roles_created_by_idx;
alter index if exists idx_user_roles_role_id rename to user_roles_role_id_idx;
alter index if exists idx_user_roles_tenant_id rename to user_roles_tenant_id_idx;
alter index if exists idx_work_order_events_actor_id rename to work_order_events_actor_id_idx;
alter index if exists idx_work_orders_building_id rename to work_orders_building_id_idx;
alter index if exists idx_work_orders_closed_by rename to work_orders_closed_by_idx;
alter index if exists idx_work_orders_created_by rename to work_orders_created_by_idx;
alter index if exists idx_work_orders_unit_id rename to work_orders_unit_id_idx;
alter index if exists idx_work_orders_updated_by rename to work_orders_updated_by_idx;
