import 'server-only';
import { createHash } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';
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
  const { data } = await supabase
    .from('invoices')
    .select('id, code, title, due_at, gross_total_cents')
    .eq('tenant_id', tenantId)
    .eq('status', 'sent')
    .not('due_at', 'is', null)
    .lt('due_at', today);
  return (data ?? []).map((inv) => ({
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
  const { data } = await supabase
    .from('invoices')
    .select('id, code, title, due_at, gross_total_cents')
    .eq('tenant_id', tenantId)
    .eq('status', 'sent')
    .not('due_at', 'is', null)
    .gte('due_at', today)
    .lte('due_at', window);
  return (data ?? []).map((inv) => ({
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
  const { data } = await supabase
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
  return (data ?? []).map((rep) => ({
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
  const { data } = await supabase
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
  return (data ?? []).map((wo) => {
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
  const { data } = await supabase
    .from('work_orders')
    .select('id, code, title, status, priority, assignee_id, updated_at')
    .eq('tenant_id', tenantId)
    .is('deleted_at', null)
    .in('status', WORK_ORDER_STATUS_TRIGGERS as unknown as string[])
    .gte('updated_at', ruleCreatedAt);
  return (data ?? []).map((wo) => {
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
  const { data } = await supabase
    .from('defect_reports')
    .select('id, code, title, status, priority, updated_at')
    .eq('tenant_id', tenantId)
    .in('status', DEFECT_REPORT_STATUS_TRIGGERS as unknown as string[])
    .gte('updated_at', ruleCreatedAt);
  return (data ?? []).map((rep) => {
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
  const { data } = await supabase
    .from('maintenance_plans')
    .select('id, title, next_due_at, property_id')
    .eq('tenant_id', tenantId)
    .eq('active', true)
    .is('deleted_at', null)
    .gte('next_due_at', today)
    .lte('next_due_at', window);
  return (data ?? []).map((plan) => ({
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
 */
async function filterAlreadyDispatched(
  supabase: Client,
  ruleId: string,
  matches: TriggerMatch[],
): Promise<TriggerMatch[]> {
  if (matches.length === 0) return [];
  const { data: existing } = await supabase
    .from('automation_dispatches')
    .select('entity_type, entity_id, dispatch_key')
    .eq('rule_id', ruleId)
    .in(
      'entity_id',
      matches.map((m) => m.entity_id),
    );
  const seen = new Set(
    (existing ?? []).map((e) => `${e.entity_type}|${e.entity_id}|${e.dispatch_key}`),
  );
  return matches.filter(
    (m) => !seen.has(`${m.entity_type}|${m.entity_id}|${m.dispatch_key}`),
  );
}

async function resolveUsersInRole(
  supabase: Client,
  tenantId: string,
  roleKey: string,
): Promise<string[]> {
  const { data: role } = await supabase
    .from('roles')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('key', roleKey)
    .maybeSingle();
  if (!role) return [];
  const { data: assignees } = await supabase
    .from('user_roles')
    .select('user_id')
    .eq('tenant_id', tenantId)
    .eq('role_id', role.id);
  const userIds = [...new Set((assignees ?? []).map((a) => a.user_id))];
  if (userIds.length === 0) return [];
  const { data: active } = await supabase
    .from('memberships')
    .select('user_id')
    .eq('tenant_id', tenantId)
    .eq('status', 'active')
    .in('user_id', userIds);
  return (active ?? []).map((a) => a.user_id);
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
    const { data } = await supabase
      .from('memberships')
      .select('user_id')
      .eq('tenant_id', tenantId)
      .eq('status', 'active')
      .in('user_id', rawIds);
    return (data ?? []).map((m) => m.user_id);
  }
  if (actionKey === 'notify_role') {
    if (!cfg.role_key) return [];
    const { data: role } = await supabase
      .from('roles')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('key', cfg.role_key)
      .maybeSingle();
    if (!role) return [];
    const { data: assignees } = await supabase
      .from('user_roles')
      .select('user_id')
      .eq('tenant_id', tenantId)
      .eq('role_id', role.id);
    const userIds = [...new Set((assignees ?? []).map((a) => a.user_id))];
    if (userIds.length === 0) return [];
    const { data: active } = await supabase
      .from('memberships')
      .select('user_id')
      .eq('tenant_id', tenantId)
      .eq('status', 'active')
      .in('user_id', userIds);
    return (active ?? []).map((a) => a.user_id);
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
    const { data } = await supabase
      .from('memberships')
      .select('user_id')
      .eq('tenant_id', tenantId)
      .eq('status', 'active')
      .in('user_id', userIds);
    userIds = (data ?? []).map((m) => m.user_id);
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

  const { data: tenant } = await supabase
    .from('tenants')
    .select('name, invoice_data')
    .eq('id', rule.tenant_id)
    .maybeSingle();
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
      await supabase
        .from('sent_emails')
        .update({
          status: 'sent',
          provider_message_id: send.messageId,
          sent_at: new Date().toISOString(),
        })
        .eq('id', logId);
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
    const msg = err instanceof Error ? err.message : 'unknown';
    result.error = `evaluate failed: ${msg}`;
    return result;
  }

  const fresh = await filterAlreadyDispatched(supabase, rule.id, matches);
  result.matches = fresh.length;

  // Erfolgreiche Matches werden während der Aktions-Phase gesammelt und erst
  // NACH dem Insert des automation_runs-Rows als Batch mit run_id in
  // automation_dispatches geschrieben. Dadurch verknüpft jeder Dispatch seinen
  // auslösenden Run — Grundlage für die Run-Detail-View.
  const successfulMatches: TriggerMatch[] = [];

  if (fresh.length === 0) {
    await supabase
      .from('automation_rules')
      .update({ last_run_at: new Date().toISOString(), last_error: null })
      .eq('id', rule.id);
    await supabase.from('automation_runs').insert({
      tenant_id: rule.tenant_id,
      rule_id: rule.id,
      trigger_key: rule.trigger_key,
      match_count: 0,
      action_ok_count: 0,
      action_failed_count: 0,
    });
    return result;
  }

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
      const { data: membership } = await supabase
        .from('memberships')
        .select('user_id')
        .eq('tenant_id', rule.tenant_id)
        .eq('user_id', target)
        .eq('status', 'active')
        .maybeSingle();
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

  await supabase
    .from('automation_rules')
    .update({
      last_run_at: new Date().toISOString(),
      last_error: result.actionsFailed > 0 ? `Aktion(en) fehlgeschlagen: ${result.actionsFailed}` : null,
    })
    .eq('id', rule.id);

  const runInsert = await supabase
    .from('automation_runs')
    .insert({
      tenant_id: rule.tenant_id,
      rule_id: rule.id,
      trigger_key: rule.trigger_key,
      match_count: result.matches,
      action_ok_count: result.actionsOk,
      action_failed_count: result.actionsFailed,
    })
    .select('id')
    .single();

  if (successfulMatches.length > 0) {
    await supabase.from('automation_dispatches').insert(
      successfulMatches.map((match) => ({
        rule_id: rule.id,
        entity_type: match.entity_type,
        entity_id: match.entity_id,
        dispatch_key: match.dispatch_key,
        tenant_id: rule.tenant_id,
        run_id: runInsert.data?.id ?? null,
      })),
    );
  }

  return result;
}

export async function runAllEnabledRules(
  supabase: Client,
): Promise<{ ruleId: string; result: RunResult }[]> {
  const { data: rules } = await supabase
    .from('automation_rules')
    .select('id, tenant_id, name, trigger_key, trigger_config, action_key, action_config, created_at')
    .eq('enabled', true);

  const out: { ruleId: string; result: RunResult }[] = [];
  for (const rule of rules ?? []) {
    const result = await runRule(supabase, rule as unknown as RuleRow);
    out.push({ ruleId: rule.id, result });
  }
  return out;
}
