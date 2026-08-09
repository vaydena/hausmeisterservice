'use server';

import 'server-only';
import { createHash } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireTenantContext } from '@/lib/tenant/current';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { loadBillingDocumentData } from '@/lib/pdf/loader';
import { renderBillingPdf } from '@/lib/pdf/render';
import { renderBillingEmail } from '@/lib/email/billing-templates';
import {
  getDefaultFromAddress,
  getDefaultReplyTo,
  getEmailProvider,
} from '@/lib/email/provider';
import type { BillingKind } from '@/lib/pdf/BillingDocument';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const csvEmails = z
  .string()
  .trim()
  .transform((raw) =>
    raw
      .split(/[,;\s]+/)
      .map((s) => s.trim())
      .filter(Boolean),
  );

const sendBillingEmailSchema = z.object({
  kind: z.enum(['invoice', 'offer']),
  id: z.string().uuid('Ungültige ID.'),
  to: csvEmails
    .pipe(z.array(z.string()).min(1, 'Mindestens ein Empfänger nötig.'))
    .refine(
      (arr) => arr.every((e) => EMAIL_RE.test(e)),
      'Mindestens eine E-Mail-Adresse ist ungültig.',
    ),
  cc: csvEmails
    .pipe(z.array(z.string()))
    .refine(
      (arr) => arr.every((e) => EMAIL_RE.test(e)),
      'CC enthält eine ungültige E-Mail-Adresse.',
    )
    .optional(),
  subject: z
    .string()
    .trim()
    .max(200, 'Betreff zu lang (max. 200 Zeichen).')
    .optional(),
  message: z
    .string()
    .trim()
    .min(1, 'Nachricht darf nicht leer sein.')
    .max(5000, 'Nachricht zu lang (max. 5000 Zeichen).'),
});

export type SendBillingEmailState = {
  ok: boolean;
  message: string | null;
  fieldErrors: Record<string, string>;
};

const emptyState: SendBillingEmailState = {
  ok: false,
  message: null,
  fieldErrors: {},
};

function fieldErrorsFromZod(err: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of err.issues) {
    const key = issue.path.join('.') || 'form';
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}

function formatGermanDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('de-DE');
}

function pdfFilename(kind: BillingKind, code: string): string {
  const label = kind === 'invoice' ? 'Rechnung' : 'Angebot';
  return `${label}-${code.replace(/[^\w.-]+/g, '_')}.pdf`;
}

export async function sendBillingEmailAction(
  _prev: SendBillingEmailState,
  formData: FormData,
): Promise<SendBillingEmailState> {
  const ctx = await requireTenantContext();

  const parsed = sendBillingEmailSchema.safeParse({
    kind: formData.get('kind'),
    id: formData.get('id'),
    to: formData.get('to') ?? '',
    cc: formData.get('cc') ?? '',
    subject: formData.get('subject') ?? undefined,
    message: formData.get('message') ?? '',
  });

  if (!parsed.success) {
    return {
      ok: false,
      message: 'Bitte prüfen Sie die Eingaben.',
      fieldErrors: fieldErrorsFromZod(parsed.error),
    };
  }

  const { kind, id, to, cc, subject, message } = parsed.data;

  const data = await loadBillingDocumentData(kind, id);
  if (!data) {
    return { ...emptyState, message: 'Beleg nicht gefunden.' };
  }

  let pdfBuffer: Buffer;
  try {
    pdfBuffer = await renderBillingPdf(data);
  } catch (err) {
    console.error('[email] PDF-Rendering fehlgeschlagen', err);
    return { ...emptyState, message: 'PDF konnte nicht erzeugt werden.' };
  }

  const senderName = data.tenant.invoiceData.legal_name?.trim() || data.tenant.name;
  const rendered = renderBillingEmail({
    kind,
    code: data.code,
    title: data.title,
    recipientName: data.bill_to_name,
    message,
    senderName,
    senderReplyTo: data.tenant.invoiceData.email ?? getDefaultReplyTo(),
    grossTotalCents: data.gross_total_cents,
    dueDateFormatted: formatGermanDate(data.due_at),
    validUntilFormatted: formatGermanDate(data.valid_until),
  });

  const finalSubject = subject && subject.length > 0 ? subject : rendered.subject;
  const attachmentName = pdfFilename(kind, data.code);
  const bodyHash = createHash('sha256').update(rendered.html).digest('hex').slice(0, 32);
  const provider = getEmailProvider();
  const fromEnv = getDefaultFromAddress();
  const from = {
    address: data.tenant.invoiceData.email ?? fromEnv.address,
    name: senderName || fromEnv.name,
  };
  const replyTo = data.tenant.invoiceData.email ?? getDefaultReplyTo();

  const supabase = await createSupabaseServerClient();
  const insertLog = await supabase
    .from('sent_emails')
    .insert({
      tenant_id: ctx.tenantId,
      entity_type: kind,
      entity_id: id,
      provider: provider.name,
      status: 'queued',
      to_addresses: to,
      cc_addresses: cc && cc.length > 0 ? cc : null,
      subject: finalSubject,
      body_hash: bodyHash,
      attachment_names: [attachmentName],
      sent_by: ctx.userId,
    })
    .select('id')
    .single();

  if (insertLog.error || !insertLog.data) {
    console.error('[email] sent_emails insert failed', insertLog.error);
    return { ...emptyState, message: 'Interner Fehler beim Anlegen des Sende-Logs.' };
  }
  const logId = insertLog.data.id;

  try {
    const result = await provider.send({
      from,
      to,
      cc: cc && cc.length > 0 ? cc : null,
      replyTo,
      subject: finalSubject,
      html: rendered.html,
      text: rendered.text,
      attachments: [
        {
          filename: attachmentName,
          content: pdfBuffer,
          contentType: 'application/pdf',
        },
      ],
    });

    await supabase
      .from('sent_emails')
      .update({
        status: 'sent',
        provider_message_id: result.messageId,
        sent_at: new Date().toISOString(),
      })
      .eq('id', logId);

    if (kind === 'invoice') {
      const { data: current } = await supabase
        .from('invoices')
        .select('status, issued_at')
        .eq('id', id)
        .maybeSingle();
      if (current && current.status === 'draft') {
        await supabase
          .from('invoices')
          .update({
            status: 'sent',
            issued_at: current.issued_at ?? new Date().toISOString().slice(0, 10),
            updated_by: ctx.userId,
          })
          .eq('id', id);
      }
      revalidatePath(`/billing/invoices/${id}`);
      revalidatePath('/billing/invoices');
    } else {
      const { data: current } = await supabase
        .from('offers')
        .select('status, issued_at')
        .eq('id', id)
        .maybeSingle();
      if (current && current.status === 'draft') {
        await supabase
          .from('offers')
          .update({
            status: 'sent',
            issued_at: current.issued_at ?? new Date().toISOString().slice(0, 10),
            updated_by: ctx.userId,
          })
          .eq('id', id);
      }
      revalidatePath(`/billing/offers/${id}`);
      revalidatePath('/billing/offers');
    }

    return { ok: true, message: 'E-Mail wurde versendet.', fieldErrors: {} };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unbekannter Fehler.';
    console.error('[email] provider send failed', err);
    await supabase
      .from('sent_emails')
      .update({ status: 'failed', error: errorMessage.slice(0, 500) })
      .eq('id', logId);
    return {
      ...emptyState,
      message: `Versand fehlgeschlagen: ${errorMessage}`,
    };
  }
}
