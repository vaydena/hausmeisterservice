import { z } from 'zod';

export const NOTIFICATION_KINDS = [
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
  'system',
] as const;
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

export const NOTIFICATION_ENTITY_TYPES = [
  'work_order',
  'defect_report',
  'checklist_run',
  'maintenance_task',
  'maintenance_plan',
  'invoice',
  'time_entry',
  'property',
  'unit',
] as const;
export type NotificationEntityType = (typeof NOTIFICATION_ENTITY_TYPES)[number];

export const NOTIFICATION_KIND_LABEL: Record<NotificationKind, string> = {
  work_order_assigned: 'Auftrag zugewiesen',
  work_order_status_changed: 'Auftragsstatus geändert',
  defect_report_created: 'Neue Mängelmeldung',
  defect_report_status_changed: 'Meldung aktualisiert',
  checklist_run_completed: 'Checkliste abgeschlossen',
  maintenance_due: 'Wartung fällig',
  maintenance_due_soon: 'Wartung wird bald fällig',
  billing_due_soon: 'Rechnung wird bald fällig',
  billing_overdue: 'Rechnung überfällig',
  time_entry_needs_review: 'Zeit prüfen',
  mention: 'Erwähnung',
  system: 'Systemmeldung',
};

export const NOTIFICATION_KIND_TONE: Record<
  NotificationKind,
  'primary' | 'warning' | 'neutral' | 'muted'
> = {
  work_order_assigned: 'primary',
  work_order_status_changed: 'neutral',
  defect_report_created: 'warning',
  defect_report_status_changed: 'neutral',
  checklist_run_completed: 'primary',
  maintenance_due: 'warning',
  maintenance_due_soon: 'warning',
  billing_due_soon: 'warning',
  billing_overdue: 'warning',
  time_entry_needs_review: 'warning',
  mention: 'primary',
  system: 'muted',
};

/**
 * Deep-Link zum Ziel der Notification. Fallback auf `/notifications`, wenn kein
 * Entity gesetzt ist.
 */
export function notificationHref(
  entityType: NotificationEntityType | null,
  entityId: string | null,
  urlOverride: string | null,
): string {
  if (urlOverride) return urlOverride;
  if (!entityType || !entityId) return '/notifications';
  switch (entityType) {
    case 'work_order':
      return `/work-orders/${entityId}`;
    case 'defect_report':
      return `/defect-reports/${entityId}`;
    case 'checklist_run':
      return `/checklist-runs/${entityId}`;
    case 'maintenance_task':
      return `/maintenance/${entityId}`;
    case 'maintenance_plan':
      return `/maintenance/${entityId}`;
    case 'invoice':
      return `/billing/invoices/${entityId}`;
    case 'time_entry':
      return `/time-tracking/${entityId}/edit`;
    case 'property':
      return `/properties/${entityId}`;
    case 'unit':
      return `/properties`;
  }
}

export const markReadSchema = z.object({
  notification_id: z.string().uuid(),
});

export const dismissSchema = z.object({
  notification_id: z.string().uuid(),
});

/**
 * Menschenlesbare "vor X Minuten"-Angabe (Deutsch).
 */
export function formatRelativeGerman(iso: string): string {
  const now = Date.now();
  const then = new Date(iso).getTime();
  const diffSec = Math.round((now - then) / 1000);
  if (diffSec < 60) return 'gerade eben';
  const min = Math.round(diffSec / 60);
  if (min < 60) return `vor ${min} Min.`;
  const h = Math.round(min / 60);
  if (h < 24) return `vor ${h} Std.`;
  const d = Math.round(h / 24);
  if (d < 7) return `vor ${d} Tag${d === 1 ? '' : 'en'}`;
  return new Date(iso).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
}
