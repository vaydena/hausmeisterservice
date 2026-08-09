/**
 * WHY: React-PDF-Templates werden zur Laufzeit auf dem Node-Server gerendert.
 * Kein DOM, keine Tailwind-Klassen — nur die Primitiven von @react-pdf/renderer.
 */
import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';
import type { TenantAddress, TenantInvoiceData } from '@/lib/schemas/tenant';
import { formatAddressLines, formatIban } from '@/lib/schemas/tenant';

export type BillingKind = 'invoice' | 'offer';

export interface BillingLine {
  position: number;
  description: string;
  quantity: number;
  unit: string | null;
  unit_price_cents: number;
  tax_rate: number;
  net_cents: number;
  tax_cents: number;
  gross_cents: number;
}

export interface BillingDocumentData {
  kind: BillingKind;
  code: string;
  title: string;
  description: string | null;
  bill_to_name: string;
  bill_to_address: string | null;
  issued_at: string | null;
  due_at: string | null;
  valid_until: string | null;
  net_total_cents: number;
  tax_total_cents: number;
  gross_total_cents: number;
  notes: string | null;
  lines: BillingLine[];
  tenant: {
    name: string;
    address: TenantAddress;
    invoiceData: TenantInvoiceData;
  };
}

const styles = StyleSheet.create({
  page: {
    padding: 40,
    fontSize: 10,
    fontFamily: 'Helvetica',
    color: '#111827',
    lineHeight: 1.4,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 24,
  },
  brandBlock: {
    flexDirection: 'column',
  },
  brandName: {
    fontSize: 14,
    fontFamily: 'Helvetica-Bold',
    marginBottom: 4,
  },
  addressLine: {
    fontSize: 9,
    color: '#374151',
  },
  metaBlock: {
    flexDirection: 'column',
    alignItems: 'flex-end',
    minWidth: 180,
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: 180,
    marginBottom: 2,
  },
  metaLabel: {
    color: '#6b7280',
    fontSize: 9,
  },
  metaValue: {
    fontSize: 9,
    fontFamily: 'Helvetica-Bold',
  },
  recipientBlock: {
    marginBottom: 24,
  },
  recipientLabel: {
    color: '#6b7280',
    fontSize: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 4,
  },
  recipientName: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 11,
    marginBottom: 2,
  },
  recipientLine: {
    fontSize: 10,
    color: '#374151',
  },
  title: {
    fontSize: 18,
    fontFamily: 'Helvetica-Bold',
    marginBottom: 6,
  },
  description: {
    fontSize: 10,
    color: '#374151',
    marginBottom: 16,
  },
  tableHead: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#e5e7eb',
    paddingVertical: 6,
    fontFamily: 'Helvetica-Bold',
    fontSize: 9,
    color: '#6b7280',
    textTransform: 'uppercase',
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderColor: '#f3f4f6',
    paddingVertical: 6,
    fontSize: 10,
  },
  cellPos: { width: '5%' },
  cellDesc: { width: '45%', paddingRight: 8 },
  cellQty: { width: '10%', textAlign: 'right' },
  cellUnit: { width: '8%', textAlign: 'right' },
  cellPrice: { width: '14%', textAlign: 'right' },
  cellTax: { width: '8%', textAlign: 'right' },
  cellTotal: { width: '10%', textAlign: 'right' },
  totalsBlock: {
    marginTop: 16,
    alignSelf: 'flex-end',
    minWidth: 220,
  },
  totalsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 3,
  },
  totalsGross: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
    borderTopWidth: 1,
    borderColor: '#111827',
    marginTop: 4,
  },
  totalsLabel: { color: '#374151' },
  totalsLabelBold: { fontFamily: 'Helvetica-Bold' },
  totalsValue: { fontFamily: 'Helvetica-Bold' },
  notes: {
    marginTop: 24,
    fontSize: 10,
    color: '#374151',
  },
  paymentBlock: {
    marginTop: 20,
    padding: 10,
    backgroundColor: '#f9fafb',
    borderRadius: 4,
    fontSize: 9,
  },
  paymentTitle: {
    fontFamily: 'Helvetica-Bold',
    marginBottom: 4,
  },
  footer: {
    position: 'absolute',
    left: 40,
    right: 40,
    bottom: 24,
    borderTopWidth: 1,
    borderColor: '#e5e7eb',
    paddingTop: 8,
    fontSize: 8,
    color: '#6b7280',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  footerCol: {
    flexDirection: 'column',
    maxWidth: '30%',
  },
  pageNumber: {
    position: 'absolute',
    right: 40,
    bottom: 10,
    fontSize: 8,
    color: '#9ca3af',
  },
});

function formatEur(cents: number): string {
  return (cents / 100).toLocaleString('de-DE', {
    style: 'currency',
    currency: 'EUR',
  });
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('de-DE');
}

function formatQty(q: number): string {
  return q.toLocaleString('de-DE', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function computeTaxSummary(lines: BillingLine[]): Array<{ rate: number; net: number; tax: number }> {
  const bucket = new Map<number, { net: number; tax: number }>();
  for (const l of lines) {
    const entry = bucket.get(l.tax_rate) ?? { net: 0, tax: 0 };
    entry.net += l.net_cents;
    entry.tax += l.tax_cents;
    bucket.set(l.tax_rate, entry);
  }
  return Array.from(bucket.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([rate, v]) => ({ rate, net: v.net, tax: v.tax }));
}

export function BillingDocument({ data }: { data: BillingDocumentData }) {
  const isInvoice = data.kind === 'invoice';
  const label = isInvoice ? 'Rechnung' : 'Angebot';
  const dueLabel = isInvoice ? 'Fällig am' : 'Gültig bis';
  const dueDate = isInvoice ? data.due_at : data.valid_until;
  const taxSummary = computeTaxSummary(data.lines);
  const senderName = data.tenant.invoiceData.legal_name ?? data.tenant.name;
  const senderAddress = formatAddressLines(data.tenant.address);
  const senderInline = [
    senderName,
    ...senderAddress,
  ]
    .filter(Boolean)
    .join(' · ');
  const recipientLines = (data.bill_to_address ?? '').split('\n').filter((s) => s.trim().length > 0);
  const paymentTermsDays = data.tenant.invoiceData.payment_terms_days ?? 14;

  return (
    <Document
      title={`${label} ${data.code}`}
      author={senderName}
      creator="Hausmeister App"
      producer="Hausmeister App"
    >
      <Page size="A4" style={styles.page}>
        {/* Kopfzeile: Absender links, Meta rechts */}
        <View style={styles.headerRow}>
          <View style={styles.brandBlock}>
            <Text style={styles.brandName}>{senderName}</Text>
            {senderAddress.map((line, i) => (
              <Text key={i} style={styles.addressLine}>
                {line}
              </Text>
            ))}
            {data.tenant.invoiceData.email && (
              <Text style={styles.addressLine}>{data.tenant.invoiceData.email}</Text>
            )}
            {data.tenant.invoiceData.phone && (
              <Text style={styles.addressLine}>Tel. {data.tenant.invoiceData.phone}</Text>
            )}
          </View>
          <View style={styles.metaBlock}>
            <Text style={{ fontSize: 14, fontFamily: 'Helvetica-Bold', marginBottom: 8 }}>
              {label}
            </Text>
            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>Nummer</Text>
              <Text style={styles.metaValue}>{data.code}</Text>
            </View>
            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>Datum</Text>
              <Text style={styles.metaValue}>{formatDate(data.issued_at)}</Text>
            </View>
            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>{dueLabel}</Text>
              <Text style={styles.metaValue}>{formatDate(dueDate)}</Text>
            </View>
          </View>
        </View>

        {/* Kleine Absenderzeile über Empfänger — deutsche DIN-676 Konvention */}
        {senderInline && (
          <Text style={{ fontSize: 7, color: '#9ca3af', marginBottom: 4, textDecoration: 'underline' }}>
            {senderInline}
          </Text>
        )}

        {/* Empfänger */}
        <View style={styles.recipientBlock}>
          <Text style={styles.recipientLabel}>{isInvoice ? 'Rechnungsempfänger' : 'Empfänger'}</Text>
          <Text style={styles.recipientName}>{data.bill_to_name}</Text>
          {recipientLines.map((line, i) => (
            <Text key={i} style={styles.recipientLine}>
              {line}
            </Text>
          ))}
        </View>

        {/* Titel + Beschreibung */}
        <Text style={styles.title}>{data.title}</Text>
        {data.description && <Text style={styles.description}>{data.description}</Text>}

        {/* Positionen */}
        <View style={styles.tableHead}>
          <Text style={styles.cellPos}>Pos.</Text>
          <Text style={styles.cellDesc}>Beschreibung</Text>
          <Text style={styles.cellQty}>Menge</Text>
          <Text style={styles.cellUnit}>Einheit</Text>
          <Text style={styles.cellPrice}>Einzelpreis</Text>
          <Text style={styles.cellTax}>MwSt.</Text>
          <Text style={styles.cellTotal}>Netto</Text>
        </View>

        {data.lines.map((line) => (
          <View key={line.position} style={styles.tableRow} wrap={false}>
            <Text style={styles.cellPos}>{line.position}</Text>
            <Text style={styles.cellDesc}>{line.description}</Text>
            <Text style={styles.cellQty}>{formatQty(line.quantity)}</Text>
            <Text style={styles.cellUnit}>{line.unit ?? '—'}</Text>
            <Text style={styles.cellPrice}>{formatEur(line.unit_price_cents)}</Text>
            <Text style={styles.cellTax}>{line.tax_rate}%</Text>
            <Text style={styles.cellTotal}>{formatEur(line.net_cents)}</Text>
          </View>
        ))}

        {/* Summen */}
        <View style={styles.totalsBlock}>
          <View style={styles.totalsRow}>
            <Text style={styles.totalsLabel}>Zwischensumme (netto)</Text>
            <Text>{formatEur(data.net_total_cents)}</Text>
          </View>
          {taxSummary.map((t) => (
            <View key={t.rate} style={styles.totalsRow}>
              <Text style={styles.totalsLabel}>Umsatzsteuer {t.rate}%</Text>
              <Text>{formatEur(t.tax)}</Text>
            </View>
          ))}
          <View style={styles.totalsGross}>
            <Text style={styles.totalsLabelBold}>Gesamtbetrag</Text>
            <Text style={styles.totalsValue}>{formatEur(data.gross_total_cents)}</Text>
          </View>
        </View>

        {/* Notizen */}
        {data.notes && <Text style={styles.notes}>{data.notes}</Text>}

        {/* Zahlungsbedingungen (nur Rechnung) */}
        {isInvoice && (
          <View style={styles.paymentBlock}>
            <Text style={styles.paymentTitle}>Zahlungshinweis</Text>
            <Text>
              Bitte überweisen Sie den Gesamtbetrag innerhalb von {paymentTermsDays} Tagen ohne Abzug
              unter Angabe der Rechnungsnummer {data.code}
              {data.tenant.invoiceData.iban ? ' auf das unten genannte Konto.' : '.'}
            </Text>
          </View>
        )}

        {/* Fuß mit Firmen-/Steuer-/Bankdaten */}
        <View style={styles.footer} fixed>
          <View style={styles.footerCol}>
            <Text style={{ fontFamily: 'Helvetica-Bold' }}>{senderName}</Text>
            {senderAddress.map((l, i) => (
              <Text key={i}>{l}</Text>
            ))}
            {data.tenant.invoiceData.website && <Text>{data.tenant.invoiceData.website}</Text>}
          </View>
          <View style={styles.footerCol}>
            {data.tenant.invoiceData.tax_id && (
              <Text>Steuernr.: {data.tenant.invoiceData.tax_id}</Text>
            )}
            {data.tenant.invoiceData.vat_id && (
              <Text>USt-IdNr.: {data.tenant.invoiceData.vat_id}</Text>
            )}
            {data.tenant.invoiceData.email && <Text>{data.tenant.invoiceData.email}</Text>}
            {data.tenant.invoiceData.phone && <Text>Tel. {data.tenant.invoiceData.phone}</Text>}
          </View>
          <View style={styles.footerCol}>
            {data.tenant.invoiceData.bank_name && (
              <Text style={{ fontFamily: 'Helvetica-Bold' }}>{data.tenant.invoiceData.bank_name}</Text>
            )}
            {data.tenant.invoiceData.iban && (
              <Text>IBAN: {formatIban(data.tenant.invoiceData.iban)}</Text>
            )}
            {data.tenant.invoiceData.bic && <Text>BIC: {data.tenant.invoiceData.bic}</Text>}
            {data.tenant.invoiceData.footer_note && (
              <Text style={{ marginTop: 4, fontStyle: 'italic' }}>
                {data.tenant.invoiceData.footer_note}
              </Text>
            )}
          </View>
        </View>

        <Text
          style={styles.pageNumber}
          fixed
          render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`}
        />
      </Page>
    </Document>
  );
}
