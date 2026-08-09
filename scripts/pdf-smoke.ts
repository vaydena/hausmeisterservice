import React from 'react';
import { pdf } from '@react-pdf/renderer';
import { BillingDocument, type BillingDocumentData } from '../src/lib/pdf/BillingDocument';

const data: BillingDocumentData = {
  kind: 'invoice',
  code: 'RE-2026-9999',
  title: 'Winterdienst Januar 2026',
  description: 'Räumen und Streuen laut Vertrag.',
  bill_to_name: 'WEG Musterstraße 5',
  bill_to_address: 'Musterstraße 5\n10115 Berlin',
  issued_at: '2026-02-01',
  due_at: '2026-02-15',
  valid_until: null,
  net_total_cents: 25000,
  tax_total_cents: 4750,
  gross_total_cents: 29750,
  notes: 'Vielen Dank für Ihren Auftrag.',
  lines: [
    { position: 1, description: 'Winterdienst Objekt A', quantity: 4, unit: 'h', unit_price_cents: 5000, tax_rate: 19, net_cents: 20000, tax_cents: 3800, gross_cents: 23800 },
    { position: 2, description: 'Streugut', quantity: 10, unit: 'kg', unit_price_cents: 500, tax_rate: 19, net_cents: 5000, tax_cents: 950, gross_cents: 5950 },
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
  const blob = await pdf(React.createElement(BillingDocument, { data })).toBlob();
  const buf = Buffer.from(await blob.arrayBuffer());
  console.log('bytes:', buf.length);
  console.log('magic:', buf.subarray(0, 5).toString('utf-8'));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
