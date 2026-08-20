import 'server-only';
import nodemailer from 'nodemailer';
import type { EmailMessage, EmailProvider, EmailSendResult } from './types';

type Transporter = ReturnType<typeof nodemailer.createTransport>;

export interface SmtpConfig {
  host: string;
  port: number;
  user: string;
  pass: string;
}

/**
 * SMTP-Provider (nodemailer) für den Versand über ein echtes Postfach — in
 * Produktion das Hostinger-Postfach `noreply@vaydena.de`.
 *
 * Beglaubigter Absender (wichtig): Ein SMTP-Server nimmt nur Mail an, deren
 * Absender zum angemeldeten Postfach passt, und SPF/DKIM/DMARC greifen nur, wenn
 * die **From-Domain** die beglaubigte Domain ist (hier vaydena.de). Eine
 * Fremd-Absenderadresse — etwa die eigene E-Mail eines Mandanten — würde daher
 * abgelehnt oder als Spam einsortiert. Deshalb erzwingt der Provider die
 * From-Adresse = angemeldetes Postfach (`config.user`) und übernimmt aus der
 * Nachricht nur den **Anzeigenamen** (z. B. den Agenturnamen). Die Identität des
 * Mandanten bleibt über Anzeigename + Reply-To erhalten: Kundenantworten gehen
 * weiterhin an den Betrieb, nicht an noreply@.
 *
 * (Der Resend-Provider kann pro Mandant eine eigene, dort verifizierte
 * Absenderdomain nutzen — die From-Adresse der Aufrufer ist also nicht „tot",
 * sondern nur für den SMTP-Weg auf das eine Postfach normalisiert.)
 */
export class SmtpEmailProvider implements EmailProvider {
  readonly name = 'smtp';
  private readonly transport: Transporter;
  private readonly fromAddress: string;

  constructor(config: SmtpConfig) {
    this.fromAddress = config.user;
    this.transport = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      // 465 = implizites TLS; andere Ports (z. B. 587) = STARTTLS-Upgrade.
      secure: config.port === 465,
      auth: { user: config.user, pass: config.pass },
    });
  }

  async send(message: EmailMessage): Promise<EmailSendResult> {
    const info = await this.transport.sendMail({
      // Adresse erzwungen auf das angemeldete Postfach (Deliverability, s. o.),
      // Anzeigename aus der Nachricht. nodemailer leitet Envelope/Return-Path aus
      // dieser Adresse ab → SPF-Alignment auf vaydena.de.
      from: { name: message.from.name ?? '', address: this.fromAddress },
      to: message.to,
      cc: message.cc && message.cc.length > 0 ? message.cc : undefined,
      replyTo: message.replyTo ?? undefined,
      subject: message.subject,
      html: message.html,
      text: message.text,
      attachments: message.attachments?.map((a) => ({
        filename: a.filename,
        content: a.content,
        contentType: a.contentType,
      })),
    });

    return { provider: this.name, messageId: info.messageId };
  }
}
