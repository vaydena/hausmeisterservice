import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';
import { PLATFORM_INVOICE_SENDER } from '@/lib/platform/invoice-sender';
import type { BankDetails } from '@/lib/platform/bank-transfer';

export interface PlatformInvoiceData {
  invoiceNumber: string;
  issuedAt: string;
  dueAt: string | null;
  periodStart: string;
  periodEnd: string;
  planName: string;
  planInterval: 'monthly' | 'yearly';
  subtotalCents: number;
  totalCents: number;
  currency: string;
  paymentMethod: 'bank_transfer' | 'stripe';
  paidAt: string | null;
  paymentReference: string | null;
  billTo: {
    name: string;
    address: string | null;
  };
  bank: BankDetails | null;
}

const styles = StyleSheet.create({
  page:     { padding: 40, fontSize: 10, fontFamily: 'Helvetica', color: '#111827' },
  header:   { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20 },
  senderBlock: { fontSize: 9, textAlign: 'right' },
  logoBadge: {
    padding: 6,
    borderRadius: 4,
    backgroundColor: '#111827',
    color: '#ffffff',
    fontSize: 12,
    fontWeight: 700,
  },
  meta:     { marginTop: 30, flexDirection: 'row', justifyContent: 'space-between' },
  metaLabel:{ fontSize: 9, color: '#6b7280' },
  metaValue:{ fontSize: 10 },
  table:    { marginTop: 25, borderTop: '1pt solid #e5e7eb' },
  tr:       { flexDirection: 'row', borderBottom: '1pt solid #f3f4f6', paddingVertical: 6 },
  tdDesc:   { flex: 4 },
  tdAmount: { flex: 1, textAlign: 'right' },
  totals:   { marginTop: 15, alignSelf: 'flex-end', width: '50%' },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 },
  totalLine:{ borderTop: '1pt solid #111827', paddingTop: 4, marginTop: 4, fontWeight: 700 },
  paidStamp: {
    marginTop: 12,
    padding: 6,
    border: '2pt solid #059669',
    color: '#059669',
    textAlign: 'center',
    fontWeight: 700,
    fontSize: 12,
  },
  taxNote:  { marginTop: 20, fontSize: 9, color: '#6b7280', fontStyle: 'italic' },
  bank:     { marginTop: 20, padding: 10, backgroundColor: '#f9fafb', fontSize: 9 },
  footer:   { position: 'absolute', bottom: 30, left: 40, right: 40, fontSize: 8, color: '#6b7280', textAlign: 'center' },
});

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`;
}

function formatEUR(cents: number): string {
  return `${(cents / 100).toFixed(2).replace('.', ',')} €`;
}

export function PlatformInvoiceDocument({ data }: { data: PlatformInvoiceData }) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.logoBadge}>VAYDENA</Text>
          </View>
          <View style={styles.senderBlock}>
            <Text style={{ fontWeight: 700 }}>{PLATFORM_INVOICE_SENDER.name}</Text>
            <Text>{PLATFORM_INVOICE_SENDER.legalRepresentative}</Text>
            <Text>{PLATFORM_INVOICE_SENDER.street}</Text>
            <Text>{PLATFORM_INVOICE_SENDER.zip} {PLATFORM_INVOICE_SENDER.city}</Text>
            <Text style={{ marginTop: 4 }}>{PLATFORM_INVOICE_SENDER.phone}</Text>
            <Text>{PLATFORM_INVOICE_SENDER.email}</Text>
          </View>
        </View>

        {/* Empfänger + Meta */}
        <View style={styles.meta}>
          <View style={{ flex: 1 }}>
            <Text style={styles.metaLabel}>Rechnung an:</Text>
            <Text style={{ marginTop: 3, fontWeight: 700 }}>{data.billTo.name}</Text>
            {data.billTo.address && <Text>{data.billTo.address}</Text>}
          </View>
          <View style={{ flex: 1, alignItems: 'flex-end' }}>
            <Text style={styles.metaLabel}>Rechnungsnummer</Text>
            <Text style={styles.metaValue}>{data.invoiceNumber}</Text>
            <Text style={[styles.metaLabel, { marginTop: 4 }]}>Ausstellungsdatum</Text>
            <Text style={styles.metaValue}>{formatDate(data.issuedAt)}</Text>
            {data.dueAt && (
              <>
                <Text style={[styles.metaLabel, { marginTop: 4 }]}>Fällig am</Text>
                <Text style={styles.metaValue}>{formatDate(data.dueAt)}</Text>
              </>
            )}
          </View>
        </View>

        {/* Positionen */}
        <View style={styles.table}>
          <View style={[styles.tr, { borderBottom: '1pt solid #111827', fontWeight: 700 }]}>
            <Text style={styles.tdDesc}>Leistung</Text>
            <Text style={styles.tdAmount}>Betrag</Text>
          </View>
          <View style={styles.tr}>
            <View style={styles.tdDesc}>
              <Text>Abo &quot;{data.planName}&quot; ({data.planInterval === 'yearly' ? 'jährlich' : 'monatlich'})</Text>
              <Text style={{ fontSize: 8, color: '#6b7280', marginTop: 2 }}>
                Leistungszeitraum: {formatDate(data.periodStart)} bis {formatDate(data.periodEnd)}
              </Text>
            </View>
            <Text style={styles.tdAmount}>{formatEUR(data.subtotalCents)}</Text>
          </View>
        </View>

        {/* Summen */}
        <View style={styles.totals}>
          <View style={styles.totalRow}>
            <Text>Zwischensumme</Text>
            <Text>{formatEUR(data.subtotalCents)}</Text>
          </View>
          <View style={[styles.totalRow, styles.totalLine]}>
            <Text>Gesamtbetrag</Text>
            <Text>{formatEUR(data.totalCents)}</Text>
          </View>
        </View>

        {data.paidAt && (
          <Text style={styles.paidStamp}>BEZAHLT am {formatDate(data.paidAt)}</Text>
        )}

        {/* §19 UStG Hinweis */}
        <Text style={styles.taxNote}>{PLATFORM_INVOICE_SENDER.taxNote}</Text>

        {/* Bankdaten (falls unbezahlt & Überweisung) */}
        {!data.paidAt && data.paymentMethod === 'bank_transfer' && data.bank && (
          <View style={styles.bank}>
            <Text style={{ fontWeight: 700, marginBottom: 4 }}>Bitte überweisen an:</Text>
            <Text>Empfänger: {data.bank.holder}</Text>
            <Text>IBAN: {data.bank.iban}</Text>
            <Text>BIC: {data.bank.bic}</Text>
            <Text style={{ marginTop: 4 }}>Verwendungszweck: {data.invoiceNumber}</Text>
          </View>
        )}

        {/* Footer */}
        <Text style={styles.footer}>
          {PLATFORM_INVOICE_SENDER.name} · {PLATFORM_INVOICE_SENDER.legalRepresentative} · {PLATFORM_INVOICE_SENDER.street}, {PLATFORM_INVOICE_SENDER.zip} {PLATFORM_INVOICE_SENDER.city}
          {'\n'}
          Steuernummer: {PLATFORM_INVOICE_SENDER.taxId ?? 'wird nachgereicht'}
        </Text>
      </Page>
    </Document>
  );
}
