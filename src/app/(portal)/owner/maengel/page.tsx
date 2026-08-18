import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getOwnerContext } from '@/lib/owner-portal/current';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { unwrapRows } from '@/lib/supabase/unwrap';
import { PageHeader } from '@/components/ui/page-header';
import { LinkButton } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { formatDate } from '@/lib/utils/format';
import {
  STATUS_LABEL,
  STATUS_TONE,
  REPORTER_KIND_LABEL,
  PRIORITY_LABEL,
} from '@/lib/schemas/defect-reports';

export const metadata: Metadata = { title: 'Mängel · Eigentümer-Portal' };

export default async function OwnerMaengelPage({
  searchParams,
}: {
  searchParams: Promise<{ info?: string }>;
}) {
  const ctx = await getOwnerContext();
  if (!ctx) redirect('/owner/login');
  const { info } = await searchParams;

  const propertyById = new Map(ctx.properties.map((p) => [p.id, p]));
  const propertyLabel = (propertyId: string): string => {
    const p = propertyById.get(propertyId);
    if (!p) return 'Objekt';
    return p.code ? `${p.code} · ${p.name ?? 'Objekt'}` : (p.name ?? 'Objekt');
  };

  const supabase = await createSupabaseServerClient();
  const defects = unwrapRows(
    await supabase
      .from('defect_reports')
      .select('id, property_id, code, title, status, priority, reporter_kind, created_at')
      .order('created_at', { ascending: false }),
    'Eigentümerportal: Mängel',
  );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Mängel"
        description="Gemeldete Mängel an Ihren Objekten."
        action={
          ctx.properties.length > 0 ? (
            <LinkButton href="/owner/maengel/neu">Mangel melden</LinkButton>
          ) : undefined
        }
      />

      {info === 'withdrawn' && (
        <p
          role="status"
          className="rounded-md border border-[var(--color-success)]/40 bg-[var(--color-success)]/5 p-3 text-sm text-[var(--color-success)]"
        >
          Ihre Meldung wurde zurückgezogen.
        </p>
      )}

      {defects.length === 0 ? (
        <EmptyState
          title="Keine Mängel gemeldet"
          description="Hier erscheinen alle Mängel an Ihren Objekten — von Ihnen oder Ihrer Hausverwaltung gemeldet."
          action={
            ctx.properties.length > 0 ? (
              <LinkButton href="/owner/maengel/neu">Mangel melden</LinkButton>
            ) : undefined
          }
        />
      ) : (
        <Card>
          <ul className="divide-y divide-[var(--color-border)]">
            {defects.map((d) => (
              <li key={d.id}>
                <Link
                  href={`/owner/maengel/${d.id}`}
                  className="flex flex-col gap-2 p-4 transition hover:bg-[var(--color-muted)] sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <div className="flex flex-wrap items-center gap-2">
                      {d.code && <Badge tone="muted">{d.code}</Badge>}
                      <span className="truncate font-medium">{d.title}</span>
                    </div>
                    <span className="truncate text-xs text-[var(--color-muted-foreground)]">
                      {propertyLabel(d.property_id)} · gemeldet von{' '}
                      {REPORTER_KIND_LABEL[d.reporter_kind as keyof typeof REPORTER_KIND_LABEL] ??
                        d.reporter_kind}{' '}
                      · {formatDate(d.created_at)}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {d.priority !== 'normal' && (
                      <Badge tone="neutral">
                        {PRIORITY_LABEL[d.priority as keyof typeof PRIORITY_LABEL] ?? d.priority}
                      </Badge>
                    )}
                    <Badge tone={STATUS_TONE[d.status as keyof typeof STATUS_TONE] ?? 'neutral'}>
                      {STATUS_LABEL[d.status as keyof typeof STATUS_LABEL] ?? d.status}
                    </Badge>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
