import type { EmailMessage, EmailProvider, EmailSendResult } from './types';

/**
 * Log-Provider: Schreibt die E-Mail-Metadaten in die Server-Konsole und
 * generiert eine synthetische message-id. Wird in Dev/Test genutzt, wenn kein
 * RESEND_API_KEY konfiguriert ist. Die E-Mail wird **nicht** versendet.
 */
export class LogEmailProvider implements EmailProvider {
  readonly name = 'log';

  async send(message: EmailMessage): Promise<EmailSendResult> {
    const attachmentSummary = (message.attachments ?? [])
      .map((a) => `${a.filename} (${a.content.length} bytes)`)
      .join(', ');

    console.info('[email:log] Mail wäre versandt worden', {
      from: `${message.from.name ?? ''} <${message.from.address}>`.trim(),
      to: message.to,
      cc: message.cc ?? undefined,
      replyTo: message.replyTo ?? undefined,
      subject: message.subject,
      textLength: message.text.length,
      htmlLength: message.html.length,
      attachments: attachmentSummary || undefined,
    });

    return {
      provider: this.name,
      messageId: `log-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    };
  }
}
