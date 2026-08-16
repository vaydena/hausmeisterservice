import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireTenantContext } from '@/lib/tenant/current';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { unwrapRows } from '@/lib/supabase/unwrap';
import { getEffectivePermissions } from '@/lib/permissions/effective';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardBody } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import {
  CORRECTION_STATUSES,
  CORRECTION_STATUS_LABEL,
  CORRECTION_STATUS_TONE,
  correctionDiff,
  type CorrectionStatus,
} from '@/lib/schemas/time-corrections';
import { formatDate } from '@/lib/utils/format';

export const metadata: Metadata = { title: 'Korrekturanträge' };

const FILTERS = ['pending', 'mine', 'all'] as const;
type Filter = (typeof FILTERS)[number];

const FILTER_LABEL: Record<Filter, string> = {
  pending: 'Offen',
  mine: 'Meine',
  all: 'Alle',
};

// Sprint 113: ohne `timeZone` war das der Kalendertag der Prozess-Zone.
function fmt(iso: string): string {
  return formatDate(iso);
}

export default async function TimeCorrectionsPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const ctx = await requireTenantContext();
  const permissions = await getEffectivePermissions(ctx.userId, ctx.tenantId);
  if (!permissions.has('time_tracking.view')) redirect('/dashboard');

  const canApprove = permissions.has('time_tracking.approve');
  const raw = (await searchParams).filter;
  const filter: Filter = (FILTERS as readonly string[]).includes(raw ?? '')
    ? (raw as Filter)
    : 'pending';

  const supabase = await createSupabaseServerClient();
  let query = supabase
    .from('time_entry_corrections')
    .select(
      'id, status, requested_at, requested_by, entry_user_id, reason, decided_at, decision_note, proposed_kind, proposed_start_at, proposed_end_at, proposed_work_order_id, proposed_property_id, proposed_note',
    )
    .order('requested_at', { ascending: false })
    .limit(200);

  if (filter === 'pending') query = query.eq('status', 'pending');
  if (filter === 'mine') query = query.eq('requested_by', ctx.userId);

  // Sprint 108: Der Filter "Offen" ist die Arbeitsliste der Freigeber. Mit
  // `?? []` sah eine gescheiterte Query aus wie "Keine offenen Antraege." —
  // die Korrekturen blieben liegen, und niemand hatte einen Anlass,
  // nachzusehen.
  const list = unwrapRows(await query, 'Korrekturantraege');

  const userIds = [
    ...new Set(
      list.flatMap((r) => [r.requested_by, r.entry_user_id]).filter((v): v is string => !!v),
    ),
  ];
  const users =
    userIds.length > 0
      ? unwrapRows(
          await supabase.from('users').select('id, display_name').in('id', userIds),
          'Korrekturantraege: Anzeigenamen',
        )
      : [];
  const nameByUserId = new Map(users.map((u) => [u.id, u.display_name]));

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <PageHeader
        title="Korrekturanträge"
        description={
          canApprove
            ? 'Anträge auf Zeit-Korrektur — genehmigen oder ablehnen.'
            : 'Anträge auf Zeit-Korrektur (nur zur Ansicht).'
        }
      />

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => {
          const active = f === filter;
          return (
            <Link
              key={f}
              href={`/time-corrections${f === 'pending' ? '' : `?filter=${f}`}`}
              className={
                'inline-flex items-center rounded-full border px-3 py-1 text-sm ' +
                (active
                  ? 'border-[var(--color-primary)] bg-[var(--color-accent)] text-[var(--color-primary)]'
                  : 'border-[var(--color-border)] text-[var(--color-muted-foreground)] hover:bg-[var(--color-muted)]')
              }
            >
              {FILTER_LABEL[f]}
            </Link>
          );
        })}
      </div>

      {list.length === 0 ? (
        <EmptyState
          title={
            filter === 'pending'
              ? 'Keine offenen Anträge.'
              : filter === 'mine'
                ? 'Sie haben noch keine Anträge gestellt.'
                : 'Keine Anträge im Tenant.'
          }
          description={
            filter === 'pending' && canApprove
              ? 'Sobald ein Mitarbeiter einen Antrag stellt, erscheint er hier.'
              : undefined
          }
        />
      ) : (
        <div className="flex flex-col gap-3">
          {list.map((r) => {
            const status = r.status as CorrectionStatus;
            const diff = correctionDiff(r);
            const requesterName = nameByUserId.get(r.requested_by) ?? '(Unbekannt)';
            const targetName = nameByUserId.get(r.entry_user_id) ?? '(Unbekannt)';
            const isOwnRequest = r.requested_by === ctx.userId;
            return (
              <Card key={r.id}>
                <CardBody className="flex flex-col gap-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone={CORRECTION_STATUS_TONE[status]}>
                        {CORRECTION_STATUS_LABEL[status]}
                      </Badge>
                      <span className="text-sm">
                        <span className="font-medium">{requesterName}</span>
                        {r.requested_by !== r.entry_user_id && (
                          <>
                            {' '}
                            <span className="text-[var(--color-muted-foreground)]">für</span>{' '}
                            <span className="font-medium">{targetName}</span>
                          </>
                        )}
                        {isOwnRequest && (
                          <span className="ml-2 text-xs text-[var(--color-muted-foreground)]">
                            (Ihr Antrag)
                          </span>
                        )}
                      </span>
                    </div>
                    <span className="text-xs text-[var(--color-muted-foreground)]">
                      {fmt(r.requested_at)}
                    </span>
                  </div>

                  {r.reason && (
                    <p className="text-sm italic text-[var(--color-muted-foreground)]">
                      „{r.reason}"
                    </p>
                  )}

                  {diff.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {diff.map((d) => (
                        <Badge key={d.field} tone="neutral">
                          {d.label}
                        </Badge>
                      ))}
                    </div>
                  )}

                  <div className="flex justify-end">
                    <Link
                      href={`/time-corrections/${r.id}`}
                      className="text-sm text-[var(--color-primary)] hover:underline"
                    >
                      Details ansehen →
                    </Link>
                  </div>
                </CardBody>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
