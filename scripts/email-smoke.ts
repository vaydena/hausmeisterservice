import React from 'react';
import { pdf } from '@react-pdf/renderer';
import { BillingDocument, type BillingDocumentData } from '../src/lib/pdf/BillingDocument';
import { renderBillingEmail } from '../src/lib/email/billing-templates';
import { LogEmailProvider } from '../src/lib/email/log-provider';

const doc: BillingDocumentData = {
  kind: 'invoice',
  code: 'RE-2026-SMOKE',
  title: 'Winterdienst Januar 2026',
  description: null,
  bill_to_name: 'WEG Musterstraße 5',
  bill_to_address: 'Musterstraße 5\n10115 Berlin',
  issued_at: '2026-02-01',
  due_at: '2026-02-15',
  valid_until: null,
  net_total_cents: 25000,
  tax_total_cents: 4750,
  gross_total_cents: 29750,
  notes: null,
  lines: [
    {
      position: 1,
      description: 'Winterdienst',
      quantity: 4,
      unit: 'h',
      unit_price_cents: 5000,
      tax_rate: 19,
      net_cents: 20000,
      tax_cents: 3800,
      gross_cents: 23800,
    },
    {
      position: 2,
      description: 'Streugut',
      quantity: 10,
      unit: 'kg',
      unit_price_cents: 500,
      tax_rate: 19,
      net_cents: 5000,
      tax_cents: 950,
      gross_cents: 5950,
    },
  ],
  tenant: {
    name: 'Hausmeisterservice Musterstadt',
    address: { street: 'Musterweg 1', zip: '10115', city: 'Berlin', country: 'Deutschland' },
    invoiceData: {
      legal_name: 'Hausmeisterservice Musterstadt GmbH',
      tax_id: '13/456/78900',
      vat_id: 'DE123456789',
      email: 'buchhaltung@example.de',
      phone: '+49 30 12345678',
      website: 'https://example.de',
      bank_name: 'Sparkasse Berlin',
      iban: 'DE12500105170648489890',
      bic: 'INGDDEFFXXX',
      payment_terms_days: 14,
      footer_note: 'Geschäftsführung: Anna Mustermann · HRB 12345',
    },
  },
};

async function main() {
  const blob = await pdf(React.createElement(BillingDocument, { data: doc })).toBlob();
  const pdfBuf = Buffer.from(await blob.arrayBuffer());
  console.log('pdf bytes:', pdfBuf.length, 'magic:', pdfBuf.subarray(0, 5).toString('utf-8'));

  const email = renderBillingEmail({
    kind: 'invoice',
    code: doc.code,
    title: doc.title,
    recipientName: doc.bill_to_name,
    message: 'anbei senden wir Ihnen die Rechnung. Bei Fragen sind wir gern für Sie da.',
    senderName: doc.tenant.invoiceData.legal_name!,
    senderReplyTo: doc.tenant.invoiceData.email,
    grossTotalCents: doc.gross_total_cents,
    dueDateFormatted: '15.02.2026',
    validUntilFormatted: null,
  });
  console.log('email subject:', email.subject);
  console.log('email html length:', email.html.length);
  console.log('email text length:', email.text.length);

  const provider = new LogEmailProvider();
  const result = await provider.send({
    from: { address: 'buchhaltung@example.de', name: doc.tenant.invoiceData.legal_name },
    to: ['kunde@example.de'],
    cc: null,
    replyTo: 'buchhaltung@example.de',
    subject: email.subject,
    html: email.html,
    text: email.text,
    attachments: [
      { filename: `${doc.code}.pdf`, content: pdfBuf, contentType: 'application/pdf' },
    ],
  });
  console.log('provider result:', result);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
