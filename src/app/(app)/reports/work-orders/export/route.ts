import { NextRequest, NextResponse } from 'next/server';
import { requireTenantContext } from '@/lib/tenant/current';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getEffectivePermissions } from '@/lib/permissions/effective';
import { csvResponse, formatMinutes, parsePeriod, toCsv } from '@/lib/reports/utils';

export async function GET(req: NextRequest) {
  const ctx = await requireTenantContext();
  const permissions = await getEffectivePermissions(ctx.userId, ctx.tenantId);
  if (!permissions.has('reporting.download')) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const url = new URL(req.url);
  const { from, to } = parsePeriod(url.searchParams);
  const propertyId = url.searchParams.get('property') ?? '';

  const supabase = await createSupabaseServerClient();
  const fromIso = new Date(`${from}T00:00:00Z`).toISOString();
  const toIso = new Date(`${to}T23:59:59Z`).toISOString();

  let q = supabase
    .from('work_orders')
    .select(
      'code, title, status, priority, is_emergency, property_id, created_at, closed_at, actual_minutes, estimated_minutes',
    )
    .is('deleted_at', null)
    .gte('created_at', fromIso)
    .lte('created_at', toIso)
    .order('created_at', { ascending: false });
  if (propertyId) q = q.eq('property_id', propertyId);

  const [{ data: rows }, { data: properties }] = await Promise.all([
    q,
    supabase.from('properties').select('id, name').is('deleted_at', null),
  ]);

  const propById = new Map((properties ?? []).map((p) => [p.id, p.name]));

  const csv = toCsv(
    ['Code', 'Titel', 'Status', 'Priorität', 'Notfall', 'Objekt', 'Erstellt', 'Geschlossen', 'Durchlaufzeit (min)', 'Ist-Minuten', 'Soll-Minuten'],
    (rows ?? []).map((r) => {
      const leadMin =
        r.closed_at ? Math.round((new Date(r.closed_at).getTime() - new Date(r.created_at).getTime()) / 60000) : '';
      return [
        r.code,
        r.title,
        r.status,
        r.priority,
        r.is_emergency ? 'Ja' : 'Nein',
        propById.get(r.property_id ?? '') ?? '',
        new Date(r.created_at).toLocaleString('de-DE'),
        r.closed_at ? new Date(r.closed_at).toLocaleString('de-DE') : '',
        leadMin,
        r.actual_minutes ?? '',
        r.estimated_minutes ?? '',
      ];
    }),
  );

  return csvResponse(`auftragsbericht_${from}_${to}.csv`, csv);
}
