import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireTenantContext } from '@/lib/tenant/current';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getEffectivePermissions } from '@/lib/permissions/effective';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card';
import { Input, Field } from '@/components/ui/input';
import { formatMinutes, parsePeriod } from '@/lib/reports/utils';

export const metadata: Metadata = { title: 'Zeitbericht' };

export default async function TimeReportPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const ctx = await requireTenantContext();
  const permissions = await getEffectivePermissions(ctx.userId, ctx.tenantId);
  if (!permissions.has('reporting.view')) notFound();

  const { from, to } = parsePeriod(sp);
  const supabase = await createSupabaseServerClient();
  const fromIso = new Date(`${from}T00:00:00Z`).toISOString();
  const toIso = new Date(`${to}T23:59:59Z`).toISOString();

  const { data: entries } = await supabase
    .from('time_entries')
    .select('user_id, kind, start_at, end_at, property_id')
    .gte('start_at', fromIso)
    .lte('start_at', toIso)
    .not('end_at', 'is', null);

  const list = entries ?? [];
  const userIds = [...new Set(list.map((e) => e.user_id))];
  const propertyIds = [...new Set(list.map((e) => e.property_id).filter((v): v is string => Boolean(v)))];

  const [{ data: users }, { data: properties }] = await Promise.all([
    userIds.length > 0
      ? supabase.from('users').select('id, display_name').in('id', userIds)
      : Promise.resolve({ data: [] as { id: string; display_name: string | null }[] }),
    propertyIds.length > 0
      ? supabase.from('properties').select('id, name').in('id', propertyIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
  ]);

  const userById = new Map((users ?? []).map((u) => [u.id, u.display_name]));
  const propById = new Map((properties ?? []).map((p) => [p.id, p.name]));

  type Bucket = { minutes: number; byKind: Record<string, number>; byProperty: Record<string, number> };
  const byUser = new Map<string, Bucket>();
  let totalMinutes = 0;

  for (const e of list) {
    if (!e.end_at) continue;
    const ms = new Date(e.end_at).getTime() - new Date(e.start_at).getTime();
    const mins = Math.max(0, ms / 60_000);
    totalMinutes += mins;
    const bucket = byUser.get(e.user_id) ?? { minutes: 0, byKind: {}, byProperty: {} };
    bucket.minutes += mins;
    bucket.byKind[e.kind] = (bucket.byKind[e.kind] ?? 0) + mins;
    const pKey = e.property_id ?? '__none__';
    bucket.byProperty[pKey] = (bucket.byProperty[pKey] ?? 0) + mins;
    byUser.set(e.user_id, bucket);
  }

  const rows = [...byUser.entries()]
    .map(([userId, b]) => ({
      userId,
      name: userById.get(userId) ?? userId.slice(0, 8),
      minutes: b.minutes,
      byKind: b.byKind,
      byProperty: b.byProperty,
    }))
    .sort((a, b) => b.minutes - a.minutes);

  const canDownload = permissions.has('reporting.download');
  const csvQuery = new URLSearchParams({ from, to }).toString();

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <PageHeader
        title="Zeitbericht"
        description={`${list.length} Einträge · ${byUser.size} Mitarbeiter · Zeitraum ${from} – ${to}`}
        action={
          canDownload ? (
            <Link
              href={`/reports/time/export?${csvQuery}`}
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

      <div className="grid gap-4 md:grid-cols-3">
        <Kpi title="Erfasste Stunden" value={formatMinutes(totalMinutes)} />
        <Kpi title="Mitarbeiter" value={String(byUser.size)} />
        <Kpi
          title="Ø pro Mitarbeiter"
          value={byUser.size > 0 ? formatMinutes(totalMinutes / byUser.size) : '—'}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Stunden je Mitarbeiter</CardTitle>
        </CardHeader>
        <CardBody className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead className="border-b border-[var(--color-border)] text-xs uppercase text-[var(--color-muted-foreground)]">
              <tr>
                <th className="pb-2 pr-4">Mitarbeiter</th>
                <th className="pb-2 pr-4">Stunden gesamt</th>
                <th className="pb-2 pr-4">Aufteilung nach Art</th>
                <th className="pb-2 pr-4">Aufteilung nach Objekt</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {rows.map((r) => (
                <tr key={r.userId}>
                  <td className="py-2 pr-4">{r.name}</td>
                  <td className="py-2 pr-4 tabular-nums font-medium">{formatMinutes(r.minutes)}</td>
                  <td className="py-2 pr-4 text-xs">
                    {Object.entries(r.byKind)
                      .map(([k, m]) => `${k}: ${formatMinutes(m)}`)
                      .join(' · ')}
                  </td>
                  <td className="py-2 pr-4 text-xs">
                    {Object.entries(r.byProperty)
                      .map(([pid, m]) => `${pid === '__none__' ? '(ohne Objekt)' : propById.get(pid) ?? pid.slice(0, 8)}: ${formatMinutes(m)}`)
                      .join(' · ')}
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={4} className="py-4 text-sm text-[var(--color-muted-foreground)]">
                    Keine Einträge im Zeitraum.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </CardBody>
      </Card>
    </div>
  );
}

function Kpi({ title, value }: { title: string; value: string }) {
  return (
    <Card>
      <CardBody>
        <p className="text-xs uppercase tracking-wide text-[var(--color-muted-foreground)]">{title}</p>
        <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
      </CardBody>
    </Card>
  );
}
