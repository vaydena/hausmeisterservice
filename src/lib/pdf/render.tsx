import 'server-only';
import { pdf } from '@react-pdf/renderer';
import { BillingDocument, type BillingDocumentData } from './BillingDocument';

/**
 * WHY: Ein einziger Renderer-Einstieg, damit Routes nicht direkt gegen die
 * @react-pdf/renderer-API arbeiten müssen. Retourniert Buffer für Response.
 */
export async function renderBillingPdf(data: BillingDocumentData): Promise<Buffer> {
  const instance = pdf(<BillingDocument data={data} />);
  const blob = await instance.toBlob();
  const arrayBuffer = await blob.arrayBuffer();
  return Buffer.from(arrayBuffer);
}
