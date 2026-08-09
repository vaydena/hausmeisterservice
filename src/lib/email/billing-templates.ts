export interface BillingEmailPayload {
  kind: 'invoice' | 'offer';
  code: string;
  title: string;
  recipientName: string;
  greeting?: string | null;
  message: string;
  senderName: string;
  senderReplyTo?: string | null;
  grossTotalCents: number;
  dueDateFormatted?: string | null;
  validUntilFormatted?: string | null;
}

export interface BillingEmailContent {
  subject: string;
  html: string;
  text: string;
}

function formatEur(cents: number): string {
  return (cents / 100).toLocaleString('de-DE', {
    style: 'currency',
    currency: 'EUR',
  });
}

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function nl2br(input: string): string {
  return escapeHtml(input).replace(/\r?\n/g, '<br>');
}

export function renderBillingEmail(payload: BillingEmailPayload): BillingEmailContent {
  const label = payload.kind === 'invoice' ? 'Rechnung' : 'Angebot';
  const subject = `${label} ${payload.code} — ${payload.title}`;
  const greeting = payload.greeting?.trim() || `Sehr geehrte Damen und Herren,`;
  const attachmentLine = `Die ${label.toLowerCase()} finden Sie als PDF im Anhang dieser E-Mail.`;
  const totalLine = `Gesamtbetrag brutto: ${formatEur(payload.grossTotalCents)}`;
  const dueLine =
    payload.kind === 'invoice' && payload.dueDateFormatted
      ? `Zahlungsziel: ${payload.dueDateFormatted}`
      : payload.kind === 'offer' && payload.validUntilFormatted
        ? `Gültig bis: ${payload.validUntilFormatted}`
        : null;

  const bodyText = payload.message.trim();
  const signature = `Mit freundlichen Grüßen\n${payload.senderName}`;

  const text = [
    greeting,
    '',
    bodyText,
    '',
    attachmentLine,
    totalLine,
    dueLine,
    '',
    signature,
  ]
    .filter((line) => line !== null)
    .join('\n');

  const html = `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#111;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:8px;padding:32px;box-shadow:0 1px 3px rgba(0,0,0,0.06);">
          <tr>
            <td style="font-size:14px;line-height:1.5;color:#111;">
              <p style="margin:0 0 12px 0;font-size:12px;color:#666;text-transform:uppercase;letter-spacing:0.5px;">${escapeHtml(label)} ${escapeHtml(payload.code)}</p>
              <h1 style="margin:0 0 20px 0;font-size:20px;font-weight:600;color:#111;">${escapeHtml(payload.title)}</h1>
              <p style="margin:0 0 16px 0;">${escapeHtml(greeting)}</p>
              <p style="margin:0 0 16px 0;">${nl2br(bodyText)}</p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0;border:1px solid #e5e5e5;border-radius:6px;background:#fafafa;">
                <tr>
                  <td style="padding:12px 16px;font-size:13px;color:#333;">
                    <strong>${escapeHtml(attachmentLine)}</strong><br>
                    ${escapeHtml(totalLine)}
                    ${dueLine ? `<br>${escapeHtml(dueLine)}` : ''}
                  </td>
                </tr>
              </table>
              <p style="margin:24px 0 4px 0;">Mit freundlichen Grüßen</p>
              <p style="margin:0;font-weight:600;">${escapeHtml(payload.senderName)}</p>
              ${payload.senderReplyTo ? `<p style="margin:16px 0 0 0;font-size:12px;color:#666;">Bei Rückfragen antworten Sie bitte direkt auf diese E-Mail (${escapeHtml(payload.senderReplyTo)}).</p>` : ''}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return { subject, html, text };
}
