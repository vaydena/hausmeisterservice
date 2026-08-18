import { NextResponse } from 'next/server';
import { moduleGate } from '@/lib/modules/api-guard';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { unwrapMaybeRow } from '@/lib/supabase/unwrap';
import { getEffectivePermissions } from '@/lib/permissions/effective';
import { renderWorkReportPdfBuffer, type WorkReportData } from '@/lib/pdf/WorkReportDocument';
import type { WorkReportStatus } from '@/lib/schemas/work-reports';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const blocked = await moduleGate('work_reports');
  if (blocked) return blocked;

  const { id } = await params;
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return textResponse('Nicht angemeldet.', 401);

  // RLS erzwingt die Sicht im Objekt-Scope (work_reports.view). Ein verschluckter
  // Fehler würde sonst als „gibt es nicht" gelesen — unwrapMaybeRow trennt das.
  const report = unwrapMaybeRow(
    await supabase
      .from('work_reports')
      .select(
        'tenant_id, code, title, performed_on, description, minutes_worked, material_used, status, approved_at, signer_name, signature_data, signed_at, property_id, work_order_id',
      )
      .eq('id', id)
      .is('deleted_at', null)
      .maybeSingle(),
    'Arbeitsbericht-PDF: Beleg',
  );
  if (!report) return textResponse('Nicht gefunden.', 404);

  // Herunterladen ist ein eigenes Recht.
  const permissions = await getEffectivePermissions(user.id, report.tenant_id);
  if (!permissions.has('work_reports.download')) {
    return textResponse('Kein Download-Recht.', 403);
  }

  const [property, tenant, workOrder] = await Promise.all([
    supabase.from('properties').select('name, code').eq('id', report.property_id).maybeSingle(),
    supabase.from('tenants').select('name, address').eq('id', report.tenant_id).maybeSingle(),
    report.work_order_id
      ? supabase.from('work_orders').select('code, title').eq('id', report.work_order_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

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
    status: report.status as WorkReportStatus,
    approvedAt: report.approved_at,
    signerName: report.signer_name,
    signatureDataUrl: report.signature_data,
    signedAt: report.signed_at,
    property: { name: property.data?.name ?? 'Objekt', code: property.data?.code ?? null },
    workOrderLabel,
    tenant: {
      name: tenant.data?.name ?? 'Arbeitsbericht',
      address: formatAddress(tenant.data?.address),
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
