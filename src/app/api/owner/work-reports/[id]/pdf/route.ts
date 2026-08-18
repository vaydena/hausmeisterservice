import { NextResponse } from 'next/server';
import { getOwnerContext } from '@/lib/owner-portal/current';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseServiceClient } from '@/lib/supabase/service';
import { unwrapMaybeRow } from '@/lib/supabase/unwrap';
import { renderWorkReportPdfBuffer, type WorkReportData } from '@/lib/pdf/WorkReportDocument';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Owner-scoped Arbeitsbericht-PDF. Kein moduleGate (der Eigentuemer ist kein
 * Staff-Nutzer) — die Berechtigung kommt aus getOwnerContext + der RLS-Policy
 * work_reports_select_owner (nur FREIGEGEBENE Berichte eigener Objekte).
 * Absenderdaten des Mandanten liest der Service-Client, nachdem der Zugriff
 * über den Owner-RLS-Read bereits bewiesen ist.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getOwnerContext();
  if (!ctx) return textResponse('Nicht angemeldet.', 401);

  const { id } = await params;
  const supabase = await createSupabaseServerClient();

  const report = unwrapMaybeRow(
    await supabase
      .from('work_reports')
      .select(
        'code, title, performed_on, description, minutes_worked, material_used, status, approved_at, signer_name, signature_data, signed_at, property_id, work_order_id',
      )
      .eq('id', id)
      .eq('status', 'approved')
      .is('deleted_at', null)
      .maybeSingle(),
    'Eigentümerportal: Arbeitsbericht-PDF',
  );
  if (!report) return textResponse('Nicht gefunden.', 404);

  const [property, workOrder] = await Promise.all([
    supabase.from('properties').select('name, code').eq('id', report.property_id).maybeSingle(),
    report.work_order_id
      ? supabase.from('work_orders').select('code, title').eq('id', report.work_order_id).maybeSingle()
      : Promise.resolve({ data: null as { code: string | null; title: string } | null }),
  ]);

  // Absender: Service-Client, gepinnt auf den Mandanten des Eigentümers.
  const admin = createSupabaseServiceClient();
  const { data: tenant } = await admin
    .from('tenants')
    .select('name, address')
    .eq('id', ctx.tenantId)
    .maybeSingle();

  const workOrderLabel = workOrder.data
    ? workOrder.data.code
      ? `${workOrder.data.code} · ${workOrder.data.title}`
      : workOrder.data.title
    : null;

  const data: WorkReportData = {
    code: report.code ?? '—',
    title: report.title,
    performedOn: report.performed_on,
    description: report.description,
    minutesWorked: report.minutes_worked,
    materialUsed: report.material_used,
    status: 'approved',
    approvedAt: report.approved_at,
    signerName: report.signer_name,
    signatureDataUrl: report.signature_data,
    signedAt: report.signed_at,
    property: { name: property.data?.name ?? 'Objekt', code: property.data?.code ?? null },
    workOrderLabel,
    tenant: {
      name: tenant?.name ?? 'Arbeitsbericht',
      address: formatAddress(tenant?.address),
    },
  };

  const buffer = await renderWorkReportPdfBuffer(data);
  return new NextResponse(buffer as unknown as BodyInit, {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${(report.code ?? 'arbeitsbericht').replace(/[^\w.-]/g, '_')}.pdf"`,
      'Cache-Control': 'private, no-store',
    },
  });
}

function textResponse(body: string, status: number): NextResponse {
  return new NextResponse(body, {
    status,
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'private, no-store' },
  });
}

function formatAddress(raw: unknown): string | null {
  if (!raw || typeof raw !== 'object') return null;
  const a = raw as Record<string, unknown>;
  const parts: string[] = [];
  if (typeof a.street === 'string' && a.street) parts.push(a.street);
  const zip = typeof a.zip === 'string' ? a.zip : '';
  const city = typeof a.city === 'string' ? a.city : '';
  const zipCity = `${zip} ${city}`.trim();
  if (zipCity) parts.push(zipCity);
  return parts.join(', ') || null;
}
