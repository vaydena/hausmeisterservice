import 'server-only';
import type { EmailMessage, EmailProvider, EmailSendResult } from './types';

interface ResendResponse {
  id?: string;
  message?: string;
  name?: string;
  statusCode?: number;
}

/**
 * Resend-Provider: HTTP-Aufruf gegen die Resend v1-API. Anhänge werden als
 * base64 mitgeschickt. Kein SDK — direkter fetch, damit wir keine weitere
 * Runtime-Abhängigkeit einführen.
 */
export class ResendEmailProvider implements EmailProvider {
  readonly name = 'resend';

  constructor(private readonly apiKey: string) {}

  async send(message: EmailMessage): Promise<EmailSendResult> {
    const from = message.from.name
      ? `${escapeName(message.from.name)} <${message.from.address}>`
      : message.from.address;

    const body: Record<string, unknown> = {
      from,
      to: message.to,
      subject: message.subject,
      html: message.html,
      text: message.text,
    };
    if (message.cc && message.cc.length > 0) body.cc = message.cc;
    if (message.replyTo) body.reply_to = message.replyTo;
    if (message.attachments && message.attachments.length > 0) {
      body.attachments = message.attachments.map((a) => ({
        filename: a.filename,
        content: a.content.toString('base64'),
      }));
    }

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    const raw = (await res.json().catch(() => ({}))) as ResendResponse;
    if (!res.ok || !raw.id) {
      const detail = raw.message ?? raw.name ?? `HTTP ${res.status}`;
      throw new Error(`Resend-API abgelehnt: ${detail}`);
    }

    return { provider: this.name, messageId: raw.id };
  }
}

function escapeName(name: string): string {
  if (/["\\]/.test(name) || name.includes(',')) {
    return `"${name.replace(/["\\]/g, '\\$&')}"`;
  }
  return name;
}
