import { NextRequest, NextResponse } from 'next/server';
import { requireTenantContext } from '@/lib/tenant/current';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getEffectivePermissions } from '@/lib/permissions/effective';
import { csvResponse, parsePeriod, toCsv } from '@/lib/reports/utils';

export async function GET(req: NextRequest) {
  const ctx = await requireTenantContext();
  const permissions = await getEffectivePermissions(ctx.userId, ctx.tenantId);
  if (!permissions.has('reporting.download')) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const url = new URL(req.url);
  const { from, to } = parsePeriod(url.searchParams);
  const supabase = await createSupabaseServerClient();
  const fromIso = new Date(`${from}T00:00:00Z`).toISOString();
  const toIso = new Date(`${to}T23:59:59Z`).toISOString();

  const [{ data: materials }, { data: movements }] = await Promise.all([
    supabase
      .from('materials')
      .select('id, code, label, sku, unit, current_stock, min_stock, unit_cost')
      .is('deleted_at', null)
      .order('label'),
    supabase
      .from('stock_movements')
      .select('material_id, kind, quantity, unit_cost_at_time')
      .gte('occurred_at', fromIso)
      .lte('occurred_at', toIso),
  ]);

  const mats = materials ?? [];
  const consumption = new Map<string, { qty: number; value: number }>();
  const inflow = new Map<string, { qty: number; value: number }>();
  for (const m of movements ?? []) {
    const qty = Number(m.quantity ?? 0);
    const val = qty * Number(m.unit_cost_at_time ?? 0);
    const target = m.kind === 'issue' ? consumption : m.kind === 'receipt' ? inflow : null;
    if (!target) continue;
    const prev = target.get(m.material_id) ?? { qty: 0, value: 0 };
    target.set(m.material_id, { qty: prev.qty + qty, value: prev.value + val });
  }

  const csv = toCsv(
    [
      'Code',
      'Position',
      'SKU',
      'Einheit',
      'Aktueller Bestand',
      'Min-Bestand',
      'Stückpreis (€)',
      'Bestandswert (€)',
      'Verbrauch Menge',
      'Verbrauch (€)',
      'Eingang Menge',
      'Eingang (€)',
    ],
    mats.map((m) => {
      const stock = Number(m.current_stock ?? 0);
      const cost = Number(m.unit_cost ?? 0);
      const c = consumption.get(m.id) ?? { qty: 0, value: 0 };
      const i = inflow.get(m.id) ?? { qty: 0, value: 0 };
      return [
        m.code ?? '',
        m.label,
        m.sku ?? '',
        m.unit ?? '',
        stock.toFixed(2),
        Number(m.min_stock ?? 0).toFixed(2),
        cost.toFixed(2),
        (stock * cost).toFixed(2),
        c.qty.toFixed(2),
        c.value.toFixed(2),
        i.qty.toFixed(2),
        i.value.toFixed(2),
      ];
    }),
  );

  return csvResponse(`materialbericht_${from}_${to}.csv`, csv);
}
