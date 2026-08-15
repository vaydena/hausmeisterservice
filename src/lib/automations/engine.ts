import 'server-only';
import { createHash } from 'node:crypto';
import * as Sentry from '@sentry/nextjs';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';
import { unwrapRows, unwrapMaybeRow } from '@/lib/supabase/unwrap';
import { parseActionConfig, parseTriggerConfig } from '@/lib/schemas/automations';
import { sendPushToUser, isPushConfigured } from '@/lib/push/server';
import { renderAutomationEmail } from '@/lib/email/automation-templates';
import {
  getDefaultFromAddress,
  getDefaultReplyTo,
  getEmailProvider,
} from '@/lib/email/provider';
import { clientEnv } from '@/lib/env';
import { parseTenantInvoiceData } from '@/lib/schemas/tenant';
import {
  describeAbortedRun,
  describeDispatchLogFailure,
  technicalMessage,
  type AbortPhase,
} from './run-failures';
import type { ActionKey, TriggerKey } from './registry';

type Client = SupabaseClient<Database>;

export interface TriggerMatch {
  entity_type: string;
  entity_id: string;
  dispatch_key: string;
  subject: string;
  body: string;
  url: string;
  notification_kind: string;
  /** Wenn gesetzt: direkter Empfänger für Aktionen wie `notify_assignee`. */
  target_user_id?: string | null;
}

export interface RuleRow {
  id: string;
  tenant_id: string;
  name: string;
  trigger_key: string;
  trigger_config: unknown;
  action_key: string;
  action_config: unknown;
  created_at: string;
}

export interface RunResult {
  matches: number;
  actionsOk: number;
  actionsFailed: number;
  error: string | null;
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function addDaysISO(base: string, days: number): string {
  const d = new Date(base + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function formatEur(cents: number): string {
  return (cents / 100).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });
}

function formatGermanDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-');
  if (!y || !m || !d) return iso;
  return `${d}.${m}.${y}`;
}

async function evaluateInvoiceOverdue(
  supabase: Client,
  tenantId: string,
): Promise<TriggerMatch[]> {
  const today = todayISO();
  // Sprint 106: Werfen statt `?? []`. Ein Fehler hier hiess bisher "keine
  // ueberfaellige Rechnung" — der Lauf wurde als sauber protokolliert und die
  // Mahnung ist einfach nie rausgegangen.
  const result = await supabase
    .from('invoices')
    .select('id, code, title, due_at, gross_total_cents')
    .eq('tenant_id', tenantId)
    .eq('status', 'sent')
    .not('due_at', 'is', null)
    .lt('due_at', today);
  return unwrapRows(result, 'Automation: überfällige Rechnungen').map((inv) => ({
    entity_type: 'invoice',
    entity_id: inv.id,
    dispatch_key: 'overdue',
    notification_kind: 'billing_overdue',
    subject: `Rechnung ${inv.code} ist überfällig`,
    body: `Fällig war der ${formatGermanDate(inv.due_at)}. Betrag: ${formatEur(inv.gross_total_cents)}.`,
    url: `/billing/invoices/${inv.id}`,
  }));
}

async function evaluateInvoiceDueSoon(
  supabase: Client,
  tenantId: string,
  daysBefore: number,
): Promise<TriggerMatch[]> {
  const today = todayISO();
  const window = addDaysISO(today, daysBefore);
  const result = await supabase
    .from('invoices')
    .select('id, code, title, due_at, gross_total_cents')
    .eq('tenant_id', tenantId)
    .eq('status', 'sent')
    .not('due_at', 'is', null)
    .gte('due_at', today)
    .lte('due_at', window);
  return unwrapRows(result, 'Automation: bald fällige Rechnungen').map((inv) => ({
    entity_type: 'invoice',
    entity_id: inv.id,
    dispatch_key: `due:${inv.due_at}`,
    notification_kind: 'billing_due_soon',
    subject: `Rechnung ${inv.code} wird bald fällig`,
    body: `Zahlungsziel: ${formatGermanDate(inv.due_at)}. Betrag: ${formatEur(inv.gross_total_cents)}.`,
    url: `/billing/invoices/${inv.id}`,
  }));
}

async function evaluateDefectReportCreated(
  supabase: Client,
  tenantId: string,
  ruleCreatedAt: string,
): Promise<TriggerMatch[]> {
  const result = await supabase
    .from('defect_reports')
    .select('id, code, title, priority, property_id, created_at')
    .eq('tenant_id', tenantId)
    .gte('created_at', ruleCreatedAt);
  const priorityLabel: Record<string, string> = {
    low: 'niedrig',
    normal: 'normal',
    high: 'hoch',
    emergency: 'Notfall',
  };
  return unwrapRows(result, 'Automation: neue Mängelmeldungen').map((rep) => ({
    entity_type: 'defect_report',
    entity_id: rep.id,
    dispatch_key: 'created',
    notification_kind: 'defect_report_created',
    subject: `Neue Mängelmeldung ${rep.code ?? ''}: ${rep.title}`.trim(),
    body: `Priorität: ${priorityLabel[rep.priority] ?? rep.priority}. Eingang: ${formatGermanDate(rep.created_at?.slice(0, 10) ?? null)}.`,
    url: `/defect-reports/${rep.id}`,
  }));
}

async function evaluateWorkOrderAssigned(
  supabase: Client,
  tenantId: string,
  ruleCreatedAt: string,
): Promise<TriggerMatch[]> {
  const result = await supabase
    .from('work_orders')
    .select('id, code, title, priority, assignee_id, updated_at, deadline')
    .eq('tenant_id', tenantId)
    .is('deleted_at', null)
    .not('assignee_id', 'is', null)
    .gte('updated_at', ruleCreatedAt);
  const priorityLabel: Record<string, string> = {
    low: 'niedrig',
    normal: 'normal',
    high: 'hoch',
    emergency: 'Notfall',
  };
  return unwrapRows(result, 'Automation: zugewiesene Aufträge').map((wo) => {
    const codeLabel = wo.code ? `${wo.code} · ` : '';
    const deadlineLine = wo.deadline
      ? ` Frist: ${formatGermanDate(wo.deadline.slice(0, 10))}.`
      : '';
    return {
      entity_type: 'work_order',
      entity_id: wo.id,
      dispatch_key: `assigned:${wo.assignee_id}`,
      notification_kind: 'work_order_assigned',
      subject: `Auftrag ${codeLabel}${wo.title} wurde dir zugewiesen`,
      body: `Priorität: ${priorityLabel[wo.priority] ?? wo.priority}.${deadlineLine}`,
      url: `/work-orders/${wo.id}`,
      target_user_id: wo.assignee_id,
    };
  });
}

const WORK_ORDER_STATUS_TRIGGERS = ['in_progress', 'blocked', 'done', 'cancelled'] as const;
const WORK_ORDER_STATUS_LABEL: Record<string, string> = {
  in_progress: 'In Arbeit',
  blocked: 'Blockiert',
  done: 'Erledigt',
  cancelled: 'Abgebrochen',
};

const DEFECT_REPORT_STATUS_TRIGGERS = ['reviewing', 'converted', 'rejected'] as const;
const DEFECT_REPORT_STATUS_LABEL: Record<string, string> = {
  reviewing: 'In Prüfung',
  converted: 'Umgewandelt',
  rejected: 'Abgelehnt',
};

async function evaluateWorkOrderStatusChanged(
  supabase: Client,
  tenantId: string,
  ruleCreatedAt: string,
): Promise<TriggerMatch[]> {
  const result = await supabase
    .from('work_orders')
    .select('id, code, title, status, priority, assignee_id, updated_at')
    .eq('tenant_id', tenantId)
    .is('deleted_at', null)
    .in('status', WORK_ORDER_STATUS_TRIGGERS as unknown as string[])
    .gte('updated_at', ruleCreatedAt);
  return unwrapRows(result, 'Automation: Auftrags-Statuswechsel').map((wo) => {
    const codeLabel = wo.code ? `${wo.code} · ` : '';
    const statusLabel = WORK_ORDER_STATUS_LABEL[wo.status] ?? wo.status;
    return {
      entity_type: 'work_order',
      entity_id: wo.id,
      dispatch_key: `status:${wo.status}`,
      notification_kind: 'work_order_status_changed',
      subject: `Auftrag ${codeLabel}${wo.title}: ${statusLabel}`,
      body: `Neuer Status: ${statusLabel}.`,
      url: `/work-orders/${wo.id}`,
      target_user_id: wo.assignee_id,
    };
  });
}

async function evaluateDefectReportStatusChanged(
  supabase: Client,
  tenantId: string,
  ruleCreatedAt: string,
): Promise<TriggerMatch[]> {
  const result = await supabase
    .from('defect_reports')
    .select('id, code, title, status, priority, updated_at')
    .eq('tenant_id', tenantId)
    .in('status', DEFECT_REPORT_STATUS_TRIGGERS as unknown as string[])
    .gte('updated_at', ruleCreatedAt);
  return unwrapRows(result, 'Automation: Statuswechsel an Mängelmeldungen').map((rep) => {
    const codeLabel = rep.code ? `${rep.code} · ` : '';
    const statusLabel = DEFECT_REPORT_STATUS_LABEL[rep.status] ?? rep.status;
    return {
      entity_type: 'defect_report',
      entity_id: rep.id,
      dispatch_key: `status:${rep.status}`,
      notification_kind: 'defect_report_status_changed',
      subject: `Mängelmeldung ${codeLabel}${rep.title}: ${statusLabel}`,
      body: `Neuer Status: ${statusLabel}.`,
      url: `/defect-reports/${rep.id}`,
    };
  });
}

async function evaluateMaintenanceDueSoon(
  supabase: Client,
  tenantId: string,
  daysBefore: number,
): Promise<TriggerMatch[]> {
  const today = todayISO();
  const window = addDaysISO(today, daysBefore);
  const result = await supabase
    .from('maintenance_plans')
    .select('id, title, next_due_at, property_id')
    .eq('tenant_id', tenantId)
    .eq('active', true)
    .is('deleted_at', null)
    .gte('next_due_at', today)
    .lte('next_due_at', window);
  return unwrapRows(result, 'Automation: fällige Wartungen').map((plan) => ({
    entity_type: 'maintenance_plan',
    entity_id: plan.id,
    dispatch_key: `due:${plan.next_due_at}`,
    notification_kind: 'maintenance_due_soon',
    subject: `Wartung „${plan.title}" wird fällig`,
    body: `Nächste Fälligkeit: ${formatGermanDate(plan.next_due_at)}.`,
    url: `/maintenance/${plan.id}`,
  }));
}

export async function evaluateTrigger(
  supabase: Client,
  tenantId: string,
  triggerKey: TriggerKey,
  triggerConfigRaw: unknown,
  ruleCreatedAt: string,
): Promise<TriggerMatch[]> {
  const cfg = parseTriggerConfig(triggerConfigRaw);
  switch (triggerKey) {
    case 'invoice.overdue':
      return evaluateInvoiceOverdue(supabase, tenantId);
    case 'invoice.due_soon':
      return evaluateInvoiceDueSoon(supabase, tenantId, cfg.days_before ?? 3);
    case 'maintenance.due_soon':
      return evaluateMaintenanceDueSoon(supabase, tenantId, cfg.days_before ?? 7);
    case 'defect_report.created':
      return evaluateDefectReportCreated(supabase, tenantId, ruleCreatedAt);
    case 'defect_report.status_changed':
      return evaluateDefectReportStatusChanged(supabase, tenantId, ruleCreatedAt);
    case 'work_order.assigned':
      return evaluateWorkOrderAssigned(supabase, tenantId, ruleCreatedAt);
    case 'work_order.status_changed':
      return evaluateWorkOrderStatusChanged(supabase, tenantId, ruleCreatedAt);
  }
}

/**
 * Filtert Matches, die bereits ausgelöst wurden.
 *
 * Sprint 106: Die einzige Stelle der Engine, an der ein verschluckter Fehler
 * nicht zu einer Unterlassung, sondern zu einer AKTION führte. `existing ?? []`
 * ergibt ein leeres seen-Set, damit gilt jeder bereits benachrichtigte Vorgang
 * wieder als frisch — und dieselben E-Mails gehen erneut raus, in jedem
 * Cron-Zyklus aufs Neue. Ein ausgelassener Lauf ist nachholbar, ein zu Unrecht
 * verschickter Schwung E-Mails nicht. Deshalb wird hier geworfen und der Lauf
 * abgebrochen, bevor irgendetwas versendet wird.
 */
async function filterAlreadyDispatched(
  supabase: Client,
  ruleId: string,
  matches: TriggerMatch[],
): Promise<TriggerMatch[]> {
  if (matches.length === 0) return [];
  const existing = await supabase
    .from('automation_dispatches')
    .select('entity_type, entity_id, dispatch_key')
    .eq('rule_id', ruleId)
    .in(
      'entity_id',
      matches.map((m) => m.entity_id),
    );
  const seen = new Set(
    unwrapRows(existing, 'Automation: bereits ausgelöste Dispatches').map(
      (e) => `${e.entity_type}|${e.entity_id}|${e.dispatch_key}`,
    ),
  );
  return matches.filter(
    (m) => !seen.has(`${m.entity_type}|${m.entity_id}|${m.dispatch_key}`),
  );
}

/**
 * Sprint 106: Ein Fehler in einer der drei Queries lieferte bisher eine leere
 * Empfängerliste — ununterscheidbar von "die Rolle hat niemanden". Der Lauf
 * zählte das anschliessend als `actionsFailed`, also als "die Benachrichtigung
 * ist fehlgeschlagen". Tatsächlich war die Empfänger-Ermittlung gescheitert,
 * und das ist ein anderer Defekt mit einer anderen Abhilfe.
 */
async function resolveUsersInRole(
  supabase: Client,
  tenantId: string,
  roleKey: string,
): Promise<string[]> {
  const roleResult = await supabase
    .from('roles')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('key', roleKey)
    .maybeSingle();
  const role = unwrapMaybeRow(roleResult, `Automation: Rolle "${roleKey}"`);
  if (!role) return [];
  const assignees = await supabase
    .from('user_roles')
    .select('user_id')
    .eq('tenant_id', tenantId)
    .eq('role_id', role.id);
  const userIds = [
    ...new Set(
      unwrapRows(assignees, 'Automation: Rollenzuweisungen').map((a) => a.user_id),
    ),
  ];
  if (userIds.length === 0) return [];
  const active = await supabase
    .from('memberships')
    .select('user_id')
    .eq('tenant_id', tenantId)
    .eq('status', 'active')
    .in('user_id', userIds);
  return unwrapRows(active, 'Automation: aktive Mitglieder der Rolle').map((a) => a.user_id);
}

async function resolveRecipients(
  supabase: Client,
  tenantId: string,
  actionKey: ActionKey,
  actionConfigRaw: unknown,
): Promise<string[]> {
  const cfg = parseActionConfig(actionConfigRaw);
  if (actionKey === 'notify_users') {
    const rawIds = cfg.user_ids ?? [];
    if (rawIds.length === 0) return [];
    const active = await supabase
      .from('memberships')
      .select('user_id')
      .eq('tenant_id', tenantId)
      .eq('status', 'active')
      .in('user_id', rawIds);
    return unwrapRows(active, 'Automation: aktive Empfaenger der Benachrichtigung').map(
      (m) => m.user_id,
    );
  }
  if (actionKey === 'notify_role') {
    if (!cfg.role_key) return [];
    // Sprint 106: Hier stand bis eben eine zeichengleiche Kopie von
    // resolveUsersInRole. Statt dieselbe Fehlerbehandlung zweimal zu
    // schreiben (und die beiden Fassungen ab jetzt auseinanderlaufen zu
    // lassen), ruft dieser Zweig den vorhandenen Helper auf.
    return resolveUsersInRole(supabase, tenantId, cfg.role_key);
  }
  return [];
}

async function dispatchNotification(
  supabase: Client,
  tenantId: string,
  userId: string,
  match: TriggerMatch,
): Promise<boolean> {
  const { error } = await supabase.from('notifications').insert({
    tenant_id: tenantId,
    user_id: userId,
    kind: match.notification_kind,
    subject: match.subject.slice(0, 200),
    body: match.body.slice(0, 2000),
    entity_type: match.entity_type,
    entity_id: match.entity_id,
    url: match.url,
  });
  if (error) {
    console.error('[automations] notification insert failed', {
      userId,
      subject: match.subject,
      message: error.message,
    });
    // Der Lauf zaehlt das als actionsFailed und die Zahl steht ab Sprint 106
    // in last_error. Welche Benachrichtigung an wen verloren ging, steht nur
    // hier.
    Sentry.captureException(
      new Error(`Automation: Benachrichtigung konnte nicht angelegt werden: ${error.message}`),
      { extra: { tenantId, userId, kind: match.notification_kind, entityId: match.entity_id } },
    );
    return false;
  }

  if (isPushConfigured()) {
    try {
      await sendPushToUser(supabase, userId, {
        title: match.subject,
        body: match.body.slice(0, 500),
        url: match.url,
        tag: `${match.entity_type}:${match.entity_id}`,
        data: { kind: match.notification_kind, entityType: match.entity_type, entityId: match.entity_id },
      });
    } catch (err) {
      console.error('[automations] push send failed', {
        userId,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return true;
}

async function resolveEmailRecipients(
  supabase: Client,
  tenantId: string,
  actionConfigRaw: unknown,
): Promise<string[]> {
  const cfg = parseActionConfig(actionConfigRaw);
  const kind = cfg.recipient_kind;
  if (kind === 'addresses') {
    return [...new Set((cfg.addresses ?? []).map((a) => a.trim().toLowerCase()))].filter(Boolean);
  }
  let userIds: string[] = [];
  if (kind === 'users') {
    userIds = cfg.user_ids ?? [];
    if (userIds.length === 0) return [];
    const active = await supabase
      .from('memberships')
      .select('user_id')
      .eq('tenant_id', tenantId)
      .eq('status', 'active')
      .in('user_id', userIds);
    userIds = unwrapRows(active, 'Automation: aktive Empfaenger der E-Mail').map((m) => m.user_id);
  } else if (kind === 'role') {
    if (!cfg.role_key) return [];
    userIds = await resolveUsersInRole(supabase, tenantId, cfg.role_key);
  }
  if (userIds.length === 0) return [];

  // Emails aus auth.users via Admin-API (Service-Role nötig, Engine ist es).
  const emails: string[] = [];
  for (const uid of userIds) {
    const { data, error } = await supabase.auth.admin.getUserById(uid);
    if (error || !data?.user?.email) continue;
    emails.push(data.user.email.toLowerCase());
  }
  return [...new Set(emails)];
}

async function dispatchSendEmailAction(
  supabase: Client,
  rule: RuleRow,
  fresh: TriggerMatch[],
): Promise<{ ok: TriggerMatch[]; failed: number }> {
  const emails = await resolveEmailRecipients(supabase, rule.tenant_id, rule.action_config);
  if (emails.length === 0) {
    console.warn('[automations] send_email: no recipients resolved', { ruleId: rule.id });
    return { ok: [], failed: fresh.length };
  }

  // Sprint 106: Absenderdaten. Ein verschluckter Fehler hiess hier, dass die
  // Mail unter dem generischen Fallback-Namen und der Fallback-Adresse an die
  // Kunden des Mandanten rausgeht — aussenwirksam und nicht ruecknehmbar.
  // Geworfen wird noch vor dem ersten Versand, der Lauf bricht also sauber ab.
  const tenantResult = await supabase
    .from('tenants')
    .select('name, invoice_data')
    .eq('id', rule.tenant_id)
    .maybeSingle();
  const tenant = unwrapMaybeRow(tenantResult, 'Automation: Absenderdaten des Mandanten');
  const invoiceData = parseTenantInvoiceData(tenant?.invoice_data ?? null);
  const senderName = invoiceData.legal_name?.trim() || tenant?.name || 'Hausmeister-Service';
  const fromEnv = getDefaultFromAddress();
  const from = {
    address: invoiceData.email ?? fromEnv.address,
    name: senderName || fromEnv.name,
  };
  const replyTo = invoiceData.email ?? getDefaultReplyTo();
  const provider = getEmailProvider();
  const baseUrl = clientEnv.NEXT_PUBLIC_APP_URL.replace(/\/$/, '');

  const ok: TriggerMatch[] = [];
  let failed = 0;
  for (const match of fresh) {
    const linkUrl = match.url.startsWith('http') ? match.url : `${baseUrl}${match.url}`;
    const rendered = renderAutomationEmail({
      subject: match.subject,
      body: match.body,
      linkUrl,
      linkLabel: 'Zum Vorgang',
      senderName,
      ruleName: rule.name,
    });
    const bodyHash = createHash('sha256').update(rendered.html).digest('hex').slice(0, 32);
    const entityTypeForLog = match.entity_type === 'invoice' ? 'invoice' : null;
    const entityIdForLog = entityTypeForLog ? match.entity_id : null;

    const insertLog = await supabase
      .from('sent_emails')
      .insert({
        tenant_id: rule.tenant_id,
        entity_type: entityTypeForLog,
        entity_id: entityIdForLog,
        provider: provider.name,
        status: 'queued',
        to_addresses: emails,
        subject: rendered.subject,
        body_hash: bodyHash,
        sent_by: null,
      })
      .select('id')
      .single();
    if (insertLog.error || !insertLog.data) {
      console.error('[automations] sent_emails insert failed', insertLog.error);
      // Der Zaehler landet als "Aktion(en) fehlgeschlagen: N" in last_error.
      // Das WARUM steht nur hier — ohne Sentry sieht der Betreiber die Zahl
      // und hat keinen Weg, sie zu erklaeren.
      Sentry.captureException(
        new Error(
          `Automation: Versand-Log konnte nicht angelegt werden: ${insertLog.error?.message ?? 'kein Datensatz zurueckgeliefert'}`,
        ),
        { extra: { ruleId: rule.id, tenantId: rule.tenant_id, subject: rendered.subject } },
      );
      failed += 1;
      continue;
    }
    const logId = insertLog.data.id;

    try {
      const send = await provider.send({
        from,
        to: emails,
        replyTo,
        subject: rendered.subject,
        html: rendered.html,
        text: rendered.text,
      });
      // Bewusst NICHT geworfen: die Mail ist zu diesem Zeitpunkt bereits
      // raus. Ein Abbruch wuerde die restlichen Matches ueberspringen UND
      // die Dispatch-Eintraege der schon versendeten verlieren — also beim
      // naechsten Lauf genau den Doppel-Versand ausloesen, den diese Engine
      // verhindern soll. Der Eintrag im Versand-Log ist dann falsch
      // ("queued" statt "sent"), das ist der kleinere Schaden.
      const markSent = await supabase
        .from('sent_emails')
        .update({
          status: 'sent',
          provider_message_id: send.messageId,
          sent_at: new Date().toISOString(),
        })
        .eq('id', logId);
      if (markSent.error) {
        Sentry.captureException(
          new Error(
            `Automation: Versand-Log konnte nicht auf "sent" gesetzt werden: ${markSent.error.message}`,
          ),
          { extra: { ruleId: rule.id, tenantId: rule.tenant_id, logId } },
        );
      }
      ok.push(match);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('[automations] send_email provider failed', { ruleId: rule.id, message });
      await supabase
        .from('sent_emails')
        .update({ status: 'failed', error: message.slice(0, 500) })
        .eq('id', logId);
      failed += 1;
    }
  }
  return { ok, failed };
}

/**
 * Schreibt das Ergebnis eines Laufs in die beiden Kanäle, die die Oberfläche
 * bereits liest: `automation_rules.last_error` (Badge "Fehler" in der Liste,
 * rotes Panel auf der Detailseite) und `automation_runs.error` (Spalte
 * "Fehlermeldung" in "Letzte Läufe").
 *
 * Sprint 106: Beide gibt es seit Sprint 174, beide standen seither ohne
 * Ausnahme auf null — nicht weil nie etwas schiefging, sondern weil jeder
 * Fehler verschluckt wurde, bevor er sie erreichen konnte. Diese Funktion ist
 * ab jetzt die einzige Stelle, die sie füllt.
 *
 * Die Schreibvorgänge selbst dürfen den Lauf nicht kippen: wenn schon die
 * Protokollierung scheitert, ist die Datenbank in einem Zustand, den ein
 * weiterer geworfener Fehler nicht verbessert. Sie melden nach Sentry und
 * geben auf.
 */
async function recordRun(
  supabase: Client,
  rule: RuleRow,
  result: RunResult,
): Promise<string | null> {
  const ruleUpdate = await supabase
    .from('automation_rules')
    .update({ last_run_at: new Date().toISOString(), last_error: result.error })
    .eq('id', rule.id);
  if (ruleUpdate.error) {
    Sentry.captureException(
      new Error(`Automation: Regel-Status nicht aktualisierbar: ${ruleUpdate.error.message}`),
      { extra: { ruleId: rule.id, tenantId: rule.tenant_id } },
    );
  }

  const runInsert = await supabase
    .from('automation_runs')
    .insert({
      tenant_id: rule.tenant_id,
      rule_id: rule.id,
      trigger_key: rule.trigger_key,
      match_count: result.matches,
      action_ok_count: result.actionsOk,
      action_failed_count: result.actionsFailed,
      error: result.error,
    })
    .select('id')
    .single();
  if (runInsert.error || !runInsert.data) {
    // Ohne run_id werden die Dispatches unten mit run_id: null geschrieben —
    // die Run-Detailseite zeigt den Lauf dann ohne die zugehoerigen Vorgaenge.
    Sentry.captureException(
      new Error(
        `Automation: Lauf nicht protokollierbar: ${runInsert.error?.message ?? 'kein Datensatz zurueckgeliefert'}`,
      ),
      { extra: { ruleId: rule.id, tenantId: rule.tenant_id } },
    );
    return null;
  }
  return runInsert.data.id;
}

/**
 * Bricht einen Lauf ab, bevor irgendetwas nach aussen gegangen ist, und
 * hinterlässt den Grund an der Regel statt ihn zu verschlucken.
 */
async function abortRun(
  supabase: Client,
  rule: RuleRow,
  result: RunResult,
  phase: AbortPhase,
  err: unknown,
): Promise<RunResult> {
  result.error = describeAbortedRun(phase, err);
  Sentry.captureException(err instanceof Error ? err : new Error(technicalMessage(err)), {
    extra: {
      ruleId: rule.id,
      tenantId: rule.tenant_id,
      triggerKey: rule.trigger_key,
      actionKey: rule.action_key,
      phase,
    },
  });
  await recordRun(supabase, rule, result);
  return result;
}

/**
 * Führt eine Regel aus: Trigger evaluieren, Doppel-Dispatches filtern, Aktion
 * pro Match ausführen, dispatches + runs schreiben.
 *
 * Erwartet einen Service-Role-Client (bypass RLS), damit alle Tenants +
 * dispatches + notifications gelesen/geschrieben werden können.
 */
export async function runRule(supabase: Client, rule: RuleRow): Promise<RunResult> {
  const result: RunResult = {
    matches: 0,
    actionsOk: 0,
    actionsFailed: 0,
    error: null,
  };

  let matches: TriggerMatch[];
  try {
    matches = await evaluateTrigger(
      supabase,
      rule.tenant_id,
      rule.trigger_key as TriggerKey,
      rule.trigger_config,
      rule.created_at,
    );
  } catch (err) {
    // Sprint 106: Bisher endete dieser Zweig mit einem blossen `return` —
    // ohne last_error, ohne Lauf-Eintrag. Der Betreiber sah auf der Regel
    // weiterhin den letzten erfolgreichen Lauf und hatte keinen Hinweis
    // darauf, dass seit Tagen nichts mehr ausgewertet wird.
    return abortRun(supabase, rule, result, 'evaluate', err);
  }

  let fresh: TriggerMatch[];
  try {
    fresh = await filterAlreadyDispatched(supabase, rule.id, matches);
  } catch (err) {
    return abortRun(supabase, rule, result, 'dispatch-filter', err);
  }
  result.matches = fresh.length;

  // Erfolgreiche Matches werden während der Aktions-Phase gesammelt und erst
  // NACH dem Insert des automation_runs-Rows als Batch mit run_id in
  // automation_dispatches geschrieben. Dadurch verknüpft jeder Dispatch seinen
  // auslösenden Run — Grundlage für die Run-Detail-View.
  const successfulMatches: TriggerMatch[] = [];

  if (fresh.length === 0) {
    await recordRun(supabase, rule, result);
    return result;
  }

  // Alles, was in dieser Phase wirft, wirft in ihrer VORBEREITUNG —
  // Empfängerlisten und Absenderdaten, also vor der ersten ausgehenden
  // Nachricht. Nur deshalb darf die Abbruch-Meldung "es wurde nichts
  // versendet" behaupten. Die beiden Stellen innerhalb der Schleifen
  // (Membership-Check unten, sent_emails-Update in dispatchSendEmailAction)
  // werfen aus genau diesem Grund bewusst nicht.
  try {
    if (rule.action_key === 'send_email') {
      const { ok, failed } = await dispatchSendEmailAction(supabase, rule, fresh);
      result.actionsOk = ok.length;
      result.actionsFailed = failed;
      successfulMatches.push(...ok);
    } else if (rule.action_key === 'notify_assignee') {
      for (const match of fresh) {
        const target = match.target_user_id;
        if (!target) {
          result.actionsFailed++;
          continue;
        }
        // Membership-Check: nur aktive Mitglieder dieses Tenants.
        //
        // Sprint 106: `error` wird hier explizit destrukturiert statt
        // geworfen. Ein Abbruch mitten in der Schleife wuerde die bereits
        // verschickten Benachrichtigungen ohne Dispatch-Eintrag
        // zuruecklassen — und damit beim naechsten Lauf genau den
        // Doppel-Versand ausloesen, den diese Engine verhindern soll. Der
        // Unterschied zwischen "kein aktives Mitglied" und "Query kaputt"
        // geht trotzdem nicht verloren: er landet in Sentry.
        const { data: membership, error: membershipError } = await supabase
          .from('memberships')
          .select('user_id')
          .eq('tenant_id', rule.tenant_id)
          .eq('user_id', target)
          .eq('status', 'active')
          .maybeSingle();
        if (membershipError) {
          Sentry.captureException(
            new Error(
              `Automation: Mitgliedschaft des Zustaendigen nicht pruefbar: ${membershipError.message}`,
            ),
            { extra: { ruleId: rule.id, tenantId: rule.tenant_id, targetUserId: target } },
          );
          result.actionsFailed++;
          continue;
        }
        if (!membership) {
          result.actionsFailed++;
          continue;
        }
        const ok = await dispatchNotification(supabase, rule.tenant_id, target, match);
        if (ok) {
          result.actionsOk++;
          successfulMatches.push(match);
        } else {
          result.actionsFailed++;
        }
      }
    } else {
      const recipients = await resolveRecipients(
        supabase,
        rule.tenant_id,
        rule.action_key as ActionKey,
        rule.action_config,
      );

      for (const match of fresh) {
        let matchOk = false;
        for (const userId of recipients) {
          const ok = await dispatchNotification(supabase, rule.tenant_id, userId, match);
          if (ok) matchOk = true;
        }
        if (matchOk) {
          result.actionsOk++;
          successfulMatches.push(match);
        } else {
          result.actionsFailed++;
        }
      }
    }
  } catch (err) {
    return abortRun(supabase, rule, result, 'recipients', err);
  }

  if (result.actionsFailed > 0) {
    result.error = `Aktion(en) fehlgeschlagen: ${result.actionsFailed}`;
  }

  const runId = await recordRun(supabase, rule, result);

  if (successfulMatches.length > 0) {
    const dispatchInsert = await supabase.from('automation_dispatches').insert(
      successfulMatches.map((match) => ({
        rule_id: rule.id,
        entity_type: match.entity_type,
        entity_id: match.entity_id,
        dispatch_key: match.dispatch_key,
        tenant_id: rule.tenant_id,
        run_id: runId,
      })),
    );

    if (dispatchInsert.error) {
      // Der einzige Fehler der Engine, der sich nicht mehr abwenden laesst:
      // die Aktionen sind gelaufen, aber der Eintrag, der sie als erledigt
      // markiert, fehlt. Genau diesen Eintrag liest filterAlreadyDispatched —
      // ohne ihn gehen dieselben Mails beim naechsten Zyklus erneut raus.
      result.error = describeDispatchLogFailure(successfulMatches.length, dispatchInsert.error);
      Sentry.captureException(
        new Error(`Automation: Dispatch-Protokoll nicht schreibbar: ${dispatchInsert.error.message}`),
        {
          extra: {
            ruleId: rule.id,
            tenantId: rule.tenant_id,
            dispatched: successfulMatches.length,
            runId,
          },
        },
      );
      // recordRun lief oben bereits mit dem alten Text — beide Anzeigen
      // nachziehen, damit die Warnung dort steht, wo hingeschaut wird.
      await supabase
        .from('automation_rules')
        .update({ last_error: result.error })
        .eq('id', rule.id);
      if (runId) {
        await supabase.from('automation_runs').update({ error: result.error }).eq('id', runId);
      }
    }
  }

  return result;
}

export async function runAllEnabledRules(
  supabase: Client,
): Promise<{ ruleId: string; result: RunResult }[]> {
  // Sprint 106: der folgenschwerste `?? []` dieser Datei. Scheiterte diese
  // Query, lief die Schleife ueber null Regeln — und die Cron-Route antwortete
  // mit HTTP 200 und `total_rules: 0`. Fuer jedes Monitoring nicht von "dieser
  // Mandant hat keine aktiven Regeln" zu unterscheiden. Das gesamte
  // Automations-System konnte stillstehen, ohne irgendwo als Stoerung
  // aufzutauchen. Der geworfene Fehler laeuft in den catch-Block der Route und
  // wird dort zu einer 500 — dem einzigen Signal, das ein Cron-Dienst
  // ueberhaupt auswertet.
  const rulesResult = await supabase
    .from('automation_rules')
    .select('id, tenant_id, name, trigger_key, trigger_config, action_key, action_config, created_at')
    .eq('enabled', true);
  const rules = unwrapRows(rulesResult, 'Automation: aktive Regeln');

  const out: { ruleId: string; result: RunResult }[] = [];
  for (const rule of rules) {
    // runRule faengt seine Phasen selbst ab. Kommt trotzdem etwas
    // Unerwartetes durch, darf es nicht die Regeln aller uebrigen Mandanten
    // mitreissen — ein defekter Trigger bei einem Kunden ist kein Grund, die
    // Automationen aller anderen ausfallen zu lassen.
    try {
      const result = await runRule(supabase, rule as unknown as RuleRow);
      out.push({ ruleId: rule.id, result });
    } catch (err) {
      Sentry.captureException(err instanceof Error ? err : new Error(technicalMessage(err)), {
        extra: { ruleId: rule.id, tenantId: rule.tenant_id, stage: 'runRule' },
      });
      out.push({
        ruleId: rule.id,
        result: {
          matches: 0,
          actionsOk: 0,
          actionsFailed: 0,
          error: `Unerwarteter Fehler: ${technicalMessage(err)}`,
        },
      });
    }
  }
  return out;
}
