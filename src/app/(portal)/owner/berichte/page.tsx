import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getOwnerContext } from '@/lib/owner-portal/current';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { unwrapRows } from '@/lib/supabase/unwrap';
import { PageHeader } from '@/components/ui/page-header';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { formatDateOnly } from '@/lib/utils/format';
import { formatWorkedTime } from '@/lib/schemas/work-reports';

export const metadata: Metadata = { title: 'Arbeitsberichte · Eigentümer-Portal' };

export default async function OwnerBerichtePage() {
  const ctx = await getOwnerContext();
  if (!ctx) redirect('/owner/login');

  const propertyById = new Map(ctx.properties.map((p) => [p.id, p]));
  const propertyLabel = (propertyId: string): string => {
    const p = propertyById.get(propertyId);
    if (!p) return 'Objekt';
    return p.code ? `${p.code} · ${p.name ?? 'Objekt'}` : (p.name ?? 'Objekt');
  };

  const supabase = await createSupabaseServerClient();
  // work_reports_select_owner liefert ausschliesslich FREIGEGEBENE Berichte
  // eigener Objekte — Entwürfe bleiben intern.
  const reports = unwrapRows(
    await supabase
      .from('work_reports')
      .select('id, property_id, code, title, performed_on, minutes_worked')
      .order('performed_on', { ascending: false }),
    'Eigentümerportal: Arbeitsberichte',
  );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Arbeitsberichte"
        description="Freigegebene Arbeitsberichte zu Ihren Objekten — als PDF herunterladbar."
      />

      {reports.length === 0 ? (
        <EmptyState
          title="Keine Arbeitsberichte"
          description="Sobald ein Arbeitsbericht für Ihre Objekte freigegeben ist, erscheint er hier."
        />
      ) : (
        <Card>
          <ul className="divide-y divide-[var(--color-border)]">
            {reports.map((r) => (
              <li
                key={r.id}
                className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <div className="flex flex-wrap items-center gap-2">
                    {r.code && <Badge tone="muted">{r.code}</Badge>}
                    <span className="truncate font-medium">{r.title}</span>
                  </div>
                  <span className="truncate text-xs text-[var(--color-muted-foreground)]">
                    {propertyLabel(r.property_id)} · {formatDateOnly(r.performed_on)}
                    {r.minutes_worked !== null ? ` · ${formatWorkedTime(r.minutes_worked)}` : ''}
                  </span>
                </div>
                <a
                  href={`/api/owner/work-reports/${r.id}/pdf`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex h-9 shrink-0 items-center rounded-md border border-[var(--color-border)] px-3 text-sm font-medium hover:bg-[var(--color-muted)]"
                >
                  PDF öffnen
                </a>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
