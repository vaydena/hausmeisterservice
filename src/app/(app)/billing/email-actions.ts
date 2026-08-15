'use server';

import 'server-only';
import { createHash } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import * as Sentry from '@sentry/nextjs';
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
  /**
   * Sprint 107: Der Versand hat geklappt, die Nachbuchung nicht. Getrennt von
   * `message`, weil der Dialog sich bei `ok` sonst einfach schliesst und die
   * Meldung nie jemand sieht — sie ist aber genau die, auf die jemand
   * reagieren muss.
   */
  warning: string | null;
  fieldErrors: Record<string, string>;
};

const emptyState: SendBillingEmailState = {
  ok: false,
  message: null,
  warning: null,
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
      warning: null,
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

    // Ab hier ist die E-Mail beim Empfaenger. Sprint 107: Keiner der
    // folgenden Schritte darf noch werfen oder den Erfolg zurueckziehen —
    // aber jeder darf auch nicht mehr stillschweigend danebengehen. Was
    // scheitert, sammelt sich in `warnings` und geht mit dem Erfolg zurueck.
    const warnings: string[] = [];

    const logUpdate = await supabase
      .from('sent_emails')
      .update({
        status: 'sent',
        provider_message_id: result.messageId,
        sent_at: new Date().toISOString(),
      })
      .eq('id', logId);
    if (logUpdate.error) {
      // Der Eintrag bleibt auf "queued" stehen. Im E-Mail-Log
      // (/settings/emails) sieht das aus wie ein haengengebliebener Versand —
      // und lockt zum zweiten Senden.
      Sentry.captureException(new Error(logUpdate.error.message), {
        extra: { where: 'sent_emails status update', logId, kind, id },
      });
      warnings.push(
        'Der Eintrag im E-Mail-Log steht weiterhin auf „in Warteschlange", obwohl die ' +
          'E-Mail raus ist — bitte nicht erneut senden.',
      );
    }

    const table = kind === 'invoice' ? 'invoices' : 'offers';
    const label = kind === 'invoice' ? 'Rechnung' : 'Angebot';

    const currentResult = await supabase
      .from(table)
      .select('status, issued_at')
      .eq('id', id)
      .maybeSingle();

    if (currentResult.error) {
      // Vorher: `const { data: current }` — der Fehler verschwand, `current`
      // war null, der Statuswechsel unterblieb wortlos. Folge bei einer
      // Rechnung: sie steht weiter als Entwurf und ist damit BEARBEITBAR,
      // obwohl der Kunde das PDF schon hat. Jede spaetere Aenderung laesst
      // gespeicherte Rechnung und ausgeliefertes Dokument auseinanderlaufen.
      Sentry.captureException(new Error(currentResult.error.message), {
        extra: { where: 'post-send status read', table, id },
      });
      warnings.push(
        `Der Status der ${label} konnte nicht gelesen werden — sie steht möglicherweise ` +
          'weiterhin als Entwurf und ist bearbeitbar. Bitte den Status von Hand setzen.',
      );
    } else if (currentResult.data && currentResult.data.status === 'draft') {
      const statusUpdate = await supabase
        .from(table)
        .update({
          status: 'sent',
          issued_at: currentResult.data.issued_at ?? new Date().toISOString().slice(0, 10),
          updated_by: ctx.userId,
        })
        .eq('id', id);
      if (statusUpdate.error) {
        Sentry.captureException(new Error(statusUpdate.error.message), {
          extra: { where: 'post-send status update', table, id },
        });
        warnings.push(
          `Die ${label} steht weiterhin als Entwurf und ist bearbeitbar, obwohl sie ` +
            'bereits versendet wurde. Bitte den Status von Hand auf „Versendet" setzen.',
        );
      }
    }

    revalidatePath(`/billing/${kind}s/${id}`);
    revalidatePath(`/billing/${kind}s`);

    return {
      ok: true,
      message: 'E-Mail wurde versendet.',
      warning: warnings.length > 0 ? warnings.join(' ') : null,
      fieldErrors: {},
    };
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
