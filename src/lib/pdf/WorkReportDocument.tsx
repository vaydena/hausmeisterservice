import { Document, Page, Text, View, Image, StyleSheet, pdf } from '@react-pdf/renderer';
import { formatWorkedTime, WORK_REPORT_STATUS_LABEL, type WorkReportStatus } from '@/lib/schemas/work-reports';

export interface WorkReportData {
  code: string;
  title: string;
  performedOn: string;
  description: string;
  minutesWorked: number | null;
  materialUsed: string | null;
  status: WorkReportStatus;
  approvedAt: string | null;
  signerName: string | null;
  signatureDataUrl: string | null;
  signedAt: string | null;
  property: { name: string; code: string | null };
  workOrderLabel: string | null;
  tenant: { name: string; address: string | null };
}

const styles = StyleSheet.create({
  page: { padding: 40, fontSize: 10, fontFamily: 'Helvetica', color: '#111827' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 },
  company: { fontSize: 13, fontWeight: 700 },
  companyAddr: { fontSize: 9, color: '#6b7280', marginTop: 2 },
  docTitleBlock: { textAlign: 'right' },
  docTitle: { fontSize: 16, fontWeight: 700 },
  docCode: { fontSize: 10, color: '#6b7280', marginTop: 2 },
  meta: { marginTop: 10, flexDirection: 'row', flexWrap: 'wrap', borderTop: '1pt solid #e5e7eb', paddingTop: 12 },
  metaCol: { width: '50%', marginBottom: 8 },
  metaLabel: { fontSize: 8, color: '#6b7280', textTransform: 'uppercase' },
  metaValue: { fontSize: 10, marginTop: 2 },
  sectionTitle: { fontSize: 11, fontWeight: 700, marginTop: 18, marginBottom: 6 },
  body: { fontSize: 10, lineHeight: 1.5 },
  signBox: { marginTop: 24, borderTop: '1pt solid #e5e7eb', paddingTop: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  signCol: { width: '48%' },
  signImage: { height: 70, marginBottom: 4, objectFit: 'contain' },
  signLine: { borderTop: '1pt solid #111827', paddingTop: 4, fontSize: 9, color: '#6b7280' },
  approvedStamp: { marginTop: 16, padding: 6, border: '2pt solid #059669', color: '#059669', textAlign: 'center', fontWeight: 700, fontSize: 11 },
  footer: { position: 'absolute', bottom: 30, left: 40, right: 40, fontSize: 8, color: '#9ca3af', textAlign: 'center' },
});

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`;
}

export function WorkReportDocument({ data }: { data: WorkReportData }) {
  const propertyLine = data.property.code
    ? `${data.property.code} · ${data.property.name}`
    : data.property.name;

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <View>
            <Text style={styles.company}>{data.tenant.name}</Text>
            {data.tenant.address && <Text style={styles.companyAddr}>{data.tenant.address}</Text>}
          </View>
          <View style={styles.docTitleBlock}>
            <Text style={styles.docTitle}>Arbeitsbericht</Text>
            <Text style={styles.docCode}>{data.code}</Text>
          </View>
        </View>

        <View style={styles.meta}>
          <View style={styles.metaCol}>
            <Text style={styles.metaLabel}>Objekt</Text>
            <Text style={styles.metaValue}>{propertyLine}</Text>
          </View>
          <View style={styles.metaCol}>
            <Text style={styles.metaLabel}>Leistungsdatum</Text>
            <Text style={styles.metaValue}>{formatDate(data.performedOn)}</Text>
          </View>
          {data.workOrderLabel && (
            <View style={styles.metaCol}>
              <Text style={styles.metaLabel}>Auftrag</Text>
              <Text style={styles.metaValue}>{data.workOrderLabel}</Text>
            </View>
          )}
          <View style={styles.metaCol}>
            <Text style={styles.metaLabel}>Arbeitszeit</Text>
            <Text style={styles.metaValue}>{formatWorkedTime(data.minutesWorked)}</Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>{data.title}</Text>
        <Text style={styles.body}>{data.description}</Text>

        {data.materialUsed && (
          <>
            <Text style={styles.sectionTitle}>Material</Text>
            <Text style={styles.body}>{data.materialUsed}</Text>
          </>
        )}

        <View style={styles.signBox}>
          <View style={styles.signCol}>
            {data.signatureDataUrl && (
              // eslint-disable-next-line jsx-a11y/alt-text
              <Image src={data.signatureDataUrl} style={styles.signImage} />
            )}
            <Text style={styles.signLine}>
              {data.signerName ? data.signerName : 'Unterschrift'}
              {data.signedAt ? ` · ${formatDate(data.signedAt)}` : ''}
            </Text>
          </View>
          <View style={styles.signCol}>
            <Text style={[styles.signLine, { borderTop: 'none' }]}>
              Status: {WORK_REPORT_STATUS_LABEL[data.status]}
            </Text>
          </View>
        </View>

        {data.status === 'approved' && (
          <Text style={styles.approvedStamp}>FREIGEGEBEN am {formatDate(data.approvedAt)}</Text>
        )}

        <Text style={styles.footer}>
          {data.tenant.name} · Arbeitsbericht {data.code}
        </Text>
      </Page>
    </Document>
  );
}

/**
 * Rendert den Bericht als PDF-Buffer. Das JSX bleibt bewusst hier in der
 * `.tsx`-Datei: die Route-Handler unter `src/app/api` sind `.ts` (der
 * API-Gate-Test erkennt nur `route.ts`), und `pdf()` mit `createElement`
 * statt JSX bekäme einen zu engen Elementtyp.
 */
export function renderWorkReportPdfBuffer(data: WorkReportData): Promise<Buffer> {
  return pdf(<WorkReportDocument data={data} />).toBuffer() as unknown as Promise<Buffer>;
}
