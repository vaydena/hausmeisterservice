'use server';

import { createHash } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { requireTenantContext } from '@/lib/tenant/current';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseServiceClient } from '@/lib/supabase/service';
import { unwrapMaybeRow } from '@/lib/supabase/unwrap';
import { getEffectivePermissions } from '@/lib/permissions/effective';
import { automationRuleCreateSchema } from '@/lib/schemas/automations';
import { runRule, type RuleRow } from '@/lib/automations/engine';
import { renderAutomationEmail } from '@/lib/email/automation-templates';
import {
  getDefaultFromAddress,
  getDefaultReplyTo,
  getEmailProvider,
} from '@/lib/email/provider';
import { parseTenantInvoiceData } from '@/lib/schemas/tenant';
import { clientEnv } from '@/lib/env';
import { requireFeature } from '@/lib/tenant/features';

/**
 * Sprint 114: Auth UND Tarif-Gate in einem Aufruf — Server Actions laufen
 * nicht durch das Layout, der Routen-Gate greift hier also nicht. Bei den
 * Automatisierungen waere das besonders folgenreich: der Test-Versand
 * verschickt echte E-Mails ueber das Kontingent des Betreibers.
 */
async function requireAutomationAccess() {
  const ctx = await requireTenantContext();
  await requireFeature(ctx.tenantId, 'automations');
  return ctx;
}

export type AutomationFormState = {
  ok: boolean;
  message: string | null;
  fieldErrors: Record<string, string>;
};

const EMPTY: AutomationFormState = { ok: false, message: null, fieldErrors: {} };

function fieldErrorsFromZod(err: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of err.issues) {
    const key = issue.path.join('.') || 'form';
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}

function parseFormData(formData: FormData) {
  const rawUserIds = formData.getAll('action_config.user_ids').map((v) => String(v));
  const daysBeforeRaw = formData.get('trigger_config.days_before');
  const daysBefore =
    typeof daysBeforeRaw === 'string' && daysBeforeRaw.trim().length > 0
      ? Number(daysBeforeRaw)
      : undefined;
  const recipientKindRaw = formData.get('action_config.recipient_kind');
  const recipientKind =
    typeof recipientKindRaw === 'string' && recipientKindRaw.length > 0
      ? recipientKindRaw
      : undefined;
  const addressesRaw = String(formData.get('action_config.addresses') ?? '').trim();
  const addresses =
    addressesRaw.length > 0
      ? addressesRaw
          .split(/[,;\s]+/)
          .map((s) => s.trim())
          .filter(Boolean)
      : undefined;

  return {
    name: String(formData.get('name') ?? ''),
    description: (formData.get('description') ?? undefined) as string | undefined,
    trigger_key: String(formData.get('trigger_key') ?? ''),
    trigger_config: daysBefore !== undefined ? { days_before: daysBefore } : {},
    action_key: String(formData.get('action_key') ?? ''),
    action_config: {
      user_ids: rawUserIds.length > 0 ? rawUserIds : undefined,
      role_key: (formData.get('action_config.role_key') || undefined) as string | undefined,
      recipient_kind: recipientKind,
      addresses,
    },
    enabled: formData.get('enabled') === 'on' || formData.get('enabled') === 'true',
  };
}

export async function createAutomationRuleAction(
  _prev: AutomationFormState,
  formData: FormData,
): Promise<AutomationFormState> {
  const ctx = await requireAutomationAccess();
  const parsed = automationRuleCreateSchema.safeParse(parseFormData(formData));
  if (!parsed.success) {
    return {
      ok: false,
      message: 'Bitte prüfen Sie die Eingaben.',
      fieldErrors: fieldErrorsFromZod(parsed.error),
    };
  }
  const supabase = await createSupabaseServerClient();
  const inserted = await supabase
    .from('automation_rules')
    .insert({
      tenant_id: ctx.tenantId,
      name: parsed.data.name,
      description: parsed.data.description ?? null,
      trigger_key: parsed.data.trigger_key,
      trigger_config: parsed.data.trigger_config as never,
      action_key: parsed.data.action_key,
      action_config: parsed.data.action_config as never,
      enabled: parsed.data.enabled,
      created_by: ctx.userId,
      updated_by: ctx.userId,
    })
    .select('id')
    .single();
  if (inserted.error || !inserted.data) {
    return { ...EMPTY, message: inserted.error?.message ?? 'Speichern fehlgeschlagen.' };
  }
  revalidatePath('/settings/automations');
  redirect(`/settings/automations/${inserted.data.id}`);
}

export async function toggleAutomationRuleAction(formData: FormData): Promise<void> {
  const ctx = await requireAutomationAccess();
  const id = String(formData.get('id') ?? '');
  const nextEnabled = formData.get('enabled') === 'true';
  if (!id) throw new Error('Ungültige ID.');

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from('automation_rules')
    .update({ enabled: nextEnabled, updated_by: ctx.userId })
    .eq('id', id);
  if (error) throw new Error(error.message);
  revalidatePath('/settings/automations');
  revalidatePath(`/settings/automations/${id}`);
}

export async function deleteAutomationRuleAction(formData: FormData): Promise<void> {
  await requireAutomationAccess();
  const id = String(formData.get('id') ?? '');
  if (!id) throw new Error('Ungültige ID.');
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from('automation_rules').delete().eq('id', id);
  if (error) throw new Error(error.message);
  revalidatePath('/settings/automations');
  redirect('/settings/automations');
}

/**
 * Setzt die Dispatch-Historie einer Regel zurück, sodass bereits verarbeitete
 * Matches beim nächsten Lauf wieder auslösen. Nützlich bei Zustands-Zyklen
 * (z. B. `done` → `new` → `done`) oder bei Tests der send_email-Aktion.
 */
export async function resetAutomationRuleDispatchesAction(formData: FormData): Promise<void> {
  const ctx = await requireAutomationAccess();
  const id = String(formData.get('id') ?? '');
  if (!id) throw new Error('Ungültige ID.');

  const permissions = await getEffectivePermissions(ctx.userId, ctx.tenantId);
  if (!permissions.has('automations.manage')) {
    throw new Error('Keine Berechtigung.');
  }

  const supabase = await createSupabaseServerClient();
  const ruleResult = await supabase
    .from('automation_rules')
    .select('id, tenant_id')
    .eq('id', id)
    .maybeSingle();
  const rule = unwrapMaybeRow(ruleResult, 'Automation: Regel für Dispatch-Reset');
  if (!rule) throw new Error('Regel nicht gefunden.');
  if (rule.tenant_id !== ctx.tenantId) throw new Error('Fremder Mandant.');

  // Service-Client, weil automation_dispatches keine DELETE-Policy hat.
  const service = createSupabaseServiceClient();
  const { error } = await service
    .from('automation_dispatches')
    .delete()
    .eq('rule_id', id)
    .eq('tenant_id', ctx.tenantId);
  if (error) throw new Error(error.message);

  revalidatePath(`/settings/automations/${id}`);
}

/**
 * Test-Send: verschickt eine Beispiel-Mail nach dem Layout dieser send_email-Regel
 * an die eigene Auth-Adresse. Bypasst Trigger, Cutoff und automation_dispatches;
 * schreibt aber weiterhin einen sent_emails-Eintrag, damit der Versand nachvollziehbar
 * bleibt (kein automation_runs-Eintrag).
 */
export async function sendTestEmailFromRuleAction(formData: FormData): Promise<void> {
  const ctx = await requireAutomationAccess();
  const id = String(formData.get('id') ?? '');
  if (!id) throw new Error('Ungültige ID.');

  const permissions = await getEffectivePermissions(ctx.userId, ctx.tenantId);
  if (!permissions.has('automations.manage')) {
    throw new Error('Keine Berechtigung.');
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user?.email) throw new Error('Eigene E-Mail-Adresse nicht ermittelbar.');
  const recipient = user.email.toLowerCase();

  const ruleResult = await supabase
    .from('automation_rules')
    .select('id, tenant_id, name, action_key')
    .eq('id', id)
    .maybeSingle();
  const rule = unwrapMaybeRow(ruleResult, 'Automation: Regel für Testmail');
  if (!rule) throw new Error('Regel nicht gefunden.');
  if (rule.tenant_id !== ctx.tenantId) throw new Error('Fremder Mandant.');
  if (rule.action_key !== 'send_email') {
    throw new Error('Testmail nur für E-Mail-Regeln verfügbar.');
  }

  // Absenderdaten — dieselbe Begruendung wie in der Engine: ein verschluckter
  // Fehler laesst die Mail unter dem generischen Fallback-Absender rausgehen.
  const tenantResult = await supabase
    .from('tenants')
    .select('name, invoice_data')
    .eq('id', ctx.tenantId)
    .maybeSingle();
  const tenant = unwrapMaybeRow(tenantResult, 'Automation: Absenderdaten für Testmail');
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
  const linkUrl = `${baseUrl}/settings/automations/${rule.id}`;
  const subject = `[Testmail] Automatisierung „${rule.name}"`;
  const body =
    'Dies ist eine Testmail für Ihre Automatisierungs-Regel. ' +
    'Sie wurde manuell aus der Regel-Detailseite ausgelöst und umgeht Trigger und Dispatch-Historie. ' +
    'Wenn diese Nachricht ankommt, ist die E-Mail-Zustellung korrekt konfiguriert.';
  const rendered = renderAutomationEmail({
    subject,
    body,
    linkUrl,
    linkLabel: 'Regel öffnen',
    senderName,
    ruleName: rule.name,
  });
  const bodyHash = createHash('sha256').update(rendered.html).digest('hex').slice(0, 32);

  // Service-Client für sent_emails: die Tabelle wird sonst normalerweise nur
  // aus der Engine (Service-Rolle) geschrieben; RLS auf sent_emails ist
  // strikt auf INSERTs beschränkt.
  const service = createSupabaseServiceClient();
  const insertLog = await service
    .from('sent_emails')
    .insert({
      tenant_id: ctx.tenantId,
      entity_type: null,
      entity_id: null,
      provider: provider.name,
      status: 'queued',
      to_addresses: [recipient],
      subject: rendered.subject,
      body_hash: bodyHash,
      sent_by: ctx.userId,
    })
    .select('id')
    .single();
  if (insertLog.error || !insertLog.data) {
    throw new Error(insertLog.error?.message ?? 'sent_emails-Eintrag fehlgeschlagen.');
  }
  const logId = insertLog.data.id;

  try {
    const send = await provider.send({
      from,
      to: [recipient],
      replyTo,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
    });
    await service
      .from('sent_emails')
      .update({
        status: 'sent',
        provider_message_id: send.messageId,
        sent_at: new Date().toISOString(),
      })
      .eq('id', logId);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await service
      .from('sent_emails')
      .update({ status: 'failed', error: message.slice(0, 500) })
      .eq('id', logId);
    throw new Error(`E-Mail-Versand fehlgeschlagen: ${message}`);
  }

  revalidatePath(`/settings/automations/${id}`);
}

/**
 * Testlauf: führt die Regel jetzt einmal für den aktuellen Tenant aus.
 * Achtung: Aktionen (Notifications) werden tatsächlich getriggert — kein Dry-Run.
 * Dispatches verhindern Doppel-Versand.
 */
export async function testRunAutomationRuleAction(formData: FormData): Promise<void> {
  const ctx = await requireAutomationAccess();
  const id = String(formData.get('id') ?? '');
  if (!id) throw new Error('Ungültige ID.');

  const supabase = await createSupabaseServerClient();
  // Sprint 106: Ohne unwrapMaybeRow wurde aus einem Query-Fehler hier "Regel
  // nicht gefunden" — eine Stoerung als Aussage ueber die Daten des Nutzers.
  const ruleResult = await supabase
    .from('automation_rules')
    .select('id, tenant_id, name, trigger_key, trigger_config, action_key, action_config, created_at')
    .eq('id', id)
    .maybeSingle();
  const rule = unwrapMaybeRow(ruleResult, 'Automation: Regel für Testlauf');
  if (!rule) throw new Error('Regel nicht gefunden.');
  if (rule.tenant_id !== ctx.tenantId) throw new Error('Fremder Mandant.');

  const service = createSupabaseServiceClient();
  const result = await runRule(service, rule as unknown as RuleRow);

  // Sprint 106: Das Ergebnis wurde bisher weggeworfen. Wer auf "Testlauf"
  // drueckt, bekam auch dann eine kommentarlos neu geladene Seite, wenn der
  // Lauf abgebrochen ist — der Testlauf konnte also nicht einmal das Kaputte
  // anzeigen, zu dessen Erkennung er da ist. runRule hat den Fehler zu diesem
  // Zeitpunkt bereits an der Regel hinterlegt; das Werfen sorgt dafuer, dass
  // der Ausloeser ihn sofort sieht statt ihn suchen zu muessen.
  if (result.error) throw new Error(result.error);

  revalidatePath(`/settings/automations/${id}`);
}
