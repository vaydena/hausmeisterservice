-- =============================================================================
-- Notifications — Kinds + Entity-Types für Billing- & Wartungs-Automations
-- =============================================================================
-- Die Automations-Engine (src/lib/automations/engine.ts) erzeugt Notifications
-- mit den Kinds 'billing_overdue', 'billing_due_soon', 'maintenance_due_soon'
-- und den Entity-Types 'invoice' bzw. 'maintenance_plan'. Die ursprünglichen
-- CHECK-Constraints aus 20260803000200_notifications.sql kannten diese Werte
-- noch nicht, sodass jeder Rule-Run für invoice.overdue / invoice.due_soon /
-- maintenance.due_soon beim INSERT in eine constraint violation lief.
--
-- Fix: bestehende CHECKs droppen und mit erweitertem Wertesatz neu setzen.
-- =============================================================================

alter table public.notifications
  drop constraint if exists notifications_kind_check;

alter table public.notifications
  add constraint notifications_kind_check
  check (kind in (
    'work_order_assigned',
    'work_order_status_changed',
    'defect_report_created',
    'defect_report_status_changed',
    'checklist_run_completed',
    'maintenance_due',
    'maintenance_due_soon',
    'billing_due_soon',
    'billing_overdue',
    'time_entry_needs_review',
    'mention',
    'system'
  ));

alter table public.notifications
  drop constraint if exists notifications_entity_type_check;

alter table public.notifications
  add constraint notifications_entity_type_check
  check (entity_type is null or entity_type in (
    'work_order',
    'defect_report',
    'checklist_run',
    'maintenance_task',
    'maintenance_plan',
    'invoice',
    'time_entry',
    'property',
    'unit'
  ));
