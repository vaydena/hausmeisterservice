export interface AutomationEmailPayload {
  subject: string;
  body: string;
  linkUrl: string;
  linkLabel: string;
  senderName: string;
  ruleName?: string | null;
}

export interface AutomationEmailContent {
  subject: string;
  html: string;
  text: string;
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

export function renderAutomationEmail(p: AutomationEmailPayload): AutomationEmailContent {
  const subject = p.subject.slice(0, 200);
  const bodyHtml = nl2br(p.body);
  const footer = p.ruleName
    ? `Diese Nachricht wurde automatisch durch die Regel „${escapeHtml(p.ruleName)}" ausgelöst.`
    : 'Diese Nachricht wurde automatisch ausgelöst.';

  const html = `<!doctype html>
<html lang="de"><head><meta charset="utf-8"><title>${escapeHtml(subject)}</title></head>
<body style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#111;line-height:1.5;margin:0;padding:24px;background:#f7f7f7">
  <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:8px;padding:24px;border:1px solid #e5e5e5">
    <h1 style="font-size:18px;margin:0 0 12px 0">${escapeHtml(subject)}</h1>
    <p style="margin:0 0 16px 0">${bodyHtml}</p>
    <p style="margin:24px 0">
      <a href="${escapeHtml(p.linkUrl)}"
         style="display:inline-block;background:#111;color:#fff;text-decoration:none;padding:10px 16px;border-radius:6px;font-weight:500">
        ${escapeHtml(p.linkLabel)}
      </a>
    </p>
    <p style="margin:24px 0 0 0;color:#666;font-size:12px">
      ${footer}<br>
      ${escapeHtml(p.senderName)}
    </p>
  </div>
</body></html>`;

  const text = [
    subject,
    '',
    p.body,
    '',
    `${p.linkLabel}: ${p.linkUrl}`,
    '',
    '—',
    p.senderName,
    p.ruleName ? `Regel: ${p.ruleName}` : 'Automatische Benachrichtigung',
  ].join('\n');

  return { subject, html, text };
}
