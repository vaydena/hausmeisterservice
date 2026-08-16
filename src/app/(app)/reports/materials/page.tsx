import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireTenantContext } from '@/lib/tenant/current';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getEffectivePermissions } from '@/lib/permissions/effective';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card';
import { Input, Field } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { formatEuro, formatNumber, parsePeriodRange } from '@/lib/reports/utils';
import { unwrapRows } from '@/lib/supabase/unwrap';

export const metadata: Metadata = { title: 'Materialbericht' };

export default async function MaterialsReportPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const ctx = await requireTenantContext();
  const permissions = await getEffectivePermissions(ctx.userId, ctx.tenantId);
  if (!permissions.has('reporting.view')) notFound();

  // Sprint 113: Zeitfenster jetzt Berliner Kalendertage, Ende exklusiv.
  const { from, to, startIso, endIso } = parsePeriodRange(sp);
  const supabase = await createSupabaseServerClient();

  const [materialsRes, movementsRes] = await Promise.all([
    supabase
      .from('materials')
      .select('id, code, label, sku, unit, current_stock, min_stock, unit_cost, storage_location')
      .is('deleted_at', null)
      .order('label'),
    supabase
      .from('stock_movements')
      .select('material_id, kind, quantity, unit_cost_at_time, occurred_at')
      .gte('occurred_at', startIso)
      .lt('occurred_at', endIso),
  ]);
  const mats = unwrapRows(materialsRes, 'Auswertungen: materials');
  const movs = unwrapRows(movementsRes, 'Auswertungen: stock_movements');

  const consumptionByMat = new Map<string, { qty: number; value: number }>();
  const inflowByMat = new Map<string, { qty: number; value: number }>();
  for (const m of movs) {
    const qty = Number(m.quantity ?? 0);
    const val = qty * Number(m.unit_cost_at_time ?? 0);
    const target =
      m.kind === 'issue' ? consumptionByMat : m.kind === 'receipt' ? inflowByMat : null;
    if (!target) continue;
    const prev = target.get(m.material_id) ?? { qty: 0, value: 0 };
    target.set(m.material_id, { qty: prev.qty + qty, value: prev.value + val });
  }

  const stockValue = mats.reduce(
    (sum, m) => sum + Number(m.current_stock ?? 0) * Number(m.unit_cost ?? 0),
    0,
  );
  const totalConsumption = [...consumptionByMat.values()].reduce((s, v) => s + v.value, 0);
  const totalInflow = [...inflowByMat.values()].reduce((s, v) => s + v.value, 0);
  const belowMin = mats.filter((m) => Number(m.current_stock) < Number(m.min_stock)).length;

  const topConsumers = [...mats]
    .map((m) => ({
      ...m,
      consumption: consumptionByMat.get(m.id) ?? { qty: 0, value: 0 },
    }))
    .sort((a, b) => b.consumption.value - a.consumption.value)
    .slice(0, 10);

  const canDownload = permissions.has('reporting.download');
  const csvQuery = new URLSearchParams({ from, to }).toString();

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <PageHeader
        title="Materialbericht"
        description={`${mats.length} Positionen · Zeitraum ${from} – ${to}`}
        action={
          canDownload ? (
            <Link
              href={`/reports/materials/export?${csvQuery}`}
              className="inline-flex h-9 items-center rounded-md bg-[var(--color-primary)] px-3 text-sm font-medium text-white hover:opacity-90"
            >
              CSV-Export
            </Link>
          ) : undefined
        }
      />

      <Card>
        <CardHeader>
          <CardTitle>Filter</CardTitle>
        </CardHeader>
        <CardBody>
          <form className="grid gap-4 md:grid-cols-3" method="get">
            <Field label="Von" htmlFor="from">
              <Input id="from" name="from" type="date" defaultValue={from} />
            </Field>
            <Field label="Bis" htmlFor="to">
              <Input id="to" name="to" type="date" defaultValue={to} />
            </Field>
            <div className="flex items-end">
              <button
                type="submit"
                className="inline-flex h-10 items-center rounded-md bg-[var(--color-primary)] px-4 text-sm font-medium text-white hover:opacity-90"
              >
                Anwenden
              </button>
            </div>
          </form>
        </CardBody>
      </Card>

      <div className="grid gap-4 md:grid-cols-4">
        <Kpi title="Bestandswert" value={formatEuro(stockValue)} />
        <Kpi
          title="Verbrauch"
          value={formatEuro(totalConsumption)}
          sub="Entnahmen zum Zeitpunkt-Preis"
        />
        <Kpi title="Wareneingänge" value={formatEuro(totalInflow)} />
        <Kpi
          title="Unter Mindest"
          value={String(belowMin)}
          accent={belowMin > 0 ? 'warning' : undefined}
          sub={`${mats.length} Positionen`}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Top-10 Verbrauch</CardTitle>
        </CardHeader>
        <CardBody className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead className="border-b border-[var(--color-border)] text-xs uppercase text-[var(--color-muted-foreground)]">
              <tr>
                <th className="pb-2 pr-4">Position</th>
                <th className="pb-2 pr-4">Verbrauch (Menge)</th>
                <th className="pb-2 pr-4">Verbrauch (€)</th>
                <th className="pb-2 pr-4">Bestand</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {topConsumers.map((m) => (
                <tr key={m.id}>
                  <td className="py-2 pr-4">
                    <Link href={`/materials/${m.id}`} className="hover:text-[var(--color-primary)]">
                      {m.label}
                    </Link>
                    {m.sku && (
                      <span className="ml-2 font-mono text-xs text-[var(--color-muted-foreground)]">
                        {m.sku}
                      </span>
                    )}
                  </td>
                  <td className="py-2 pr-4 tabular-nums">
                    {formatNumber(m.consumption.qty, 2)} {m.unit ?? ''}
                  </td>
                  <td className="py-2 pr-4 tabular-nums">{formatEuro(m.consumption.value)}</td>
                  <td className="py-2 pr-4 tabular-nums">
                    {formatNumber(Number(m.current_stock ?? 0), 2)} {m.unit ?? ''}
                    {Number(m.current_stock ?? 0) < Number(m.min_stock ?? 0) && (
                      <Badge tone="warning" className="ml-2">
                        unter Min.
                      </Badge>
                    )}
                  </td>
                </tr>
              ))}
              {topConsumers.length === 0 && (
                <tr>
                  <td colSpan={4} className="py-4 text-sm text-[var(--color-muted-foreground)]">
                    Keine Bewegungen im Zeitraum.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Bestände ({mats.length})</CardTitle>
        </CardHeader>
        <CardBody className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead className="border-b border-[var(--color-border)] text-xs uppercase text-[var(--color-muted-foreground)]">
              <tr>
                <th className="pb-2 pr-4">Position</th>
                <th className="pb-2 pr-4">Aktueller Bestand</th>
                <th className="pb-2 pr-4">Min-Bestand</th>
                <th className="pb-2 pr-4">Wert (€)</th>
                <th className="pb-2 pr-4">Lager</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {mats.map((m) => {
                const stock = Number(m.current_stock ?? 0);
                const min = Number(m.min_stock ?? 0);
                const val = stock * Number(m.unit_cost ?? 0);
                return (
                  <tr key={m.id}>
                    <td className="py-2 pr-4">
                      <Link
                        href={`/materials/${m.id}`}
                        className="hover:text-[var(--color-primary)]"
                      >
                        {m.label}
                      </Link>
                    </td>
                    <td className="py-2 pr-4 tabular-nums">
                      {formatNumber(stock, 2)} {m.unit ?? ''}
                    </td>
                    <td className="py-2 pr-4 tabular-nums">
                      {formatNumber(min, 2)} {m.unit ?? ''}
                    </td>
                    <td className="py-2 pr-4 tabular-nums">{formatEuro(val)}</td>
                    <td className="py-2 pr-4 text-xs">{m.storage_location ?? '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </CardBody>
      </Card>
    </div>
  );
}

function Kpi({
  title,
  value,
  sub,
  accent,
}: {
  title: string;
  value: string;
  sub?: string;
  accent?: 'warning' | 'danger';
}) {
  const accentClass =
    accent === 'warning'
      ? 'text-[var(--color-warning)]'
      : accent === 'danger'
        ? 'text-[var(--color-destructive)]'
        : 'text-[var(--color-foreground)]';
  return (
    <Card>
      <CardBody>
        <p className="text-xs uppercase tracking-wide text-[var(--color-muted-foreground)]">
          {title}
        </p>
        <p className={`mt-1 text-2xl font-semibold tabular-nums ${accentClass}`}>{value}</p>
        {sub && <p className="mt-1 text-xs text-[var(--color-muted-foreground)]">{sub}</p>}
      </CardBody>
    </Card>
  );
}
