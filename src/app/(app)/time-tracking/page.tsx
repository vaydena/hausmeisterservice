import type { Metadata } from 'next';
import Link from 'next/link';
import { requireTenantContext } from '@/lib/tenant/current';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { unwrapRows, unwrapMaybeRow } from '@/lib/supabase/unwrap';
import { getEffectivePermissions } from '@/lib/permissions/effective';
import { describeOwnOpenEntry } from '@/lib/time-tracking/unclosed';
import { PageHeader } from '@/components/ui/page-header';
import { LinkButton } from '@/components/ui/button';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import {
  ENTRY_KIND_LABEL,
  ENTRY_KIND_TONE,
  formatDurationMinutes,
  minutesBetween,
  type TimeEntryKind,
} from '@/lib/schemas/time-tracking';

export const metadata: Metadata = { title: 'Zeiterfassung' };

const WEEKDAY_LABEL: Record<number, string> = {
  0: 'So',
  1: 'Mo',
  2: 'Di',
  3: 'Mi',
  4: 'Do',
  5: 'Fr',
  6: 'Sa',
};

function startOfWeekBerlin(now = new Date()): Date {
  const d = new Date(now);
  const day = d.getDay();
  const diff = (day + 6) % 7;
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - diff);
  return d;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('de-DE', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default async function TimeTrackingPage() {
  const ctx = await requireTenantContext();
  const supabase = await createSupabaseServerClient();
  const permissions = await getEffectivePermissions(ctx.userId, ctx.tenantId);

  const canCreate = permissions.has('time_tracking.create');
  const canEdit = permissions.has('time_tracking.edit');
  const canViewOthers = permissions.has('time_tracking.view_others');

  const weekStart = startOfWeekBerlin();
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 7);

  const [openRes, entriesRes, propsRes, workOrdersRes] = await Promise.all([
    supabase
      .from('time_entries')
      .select('id, kind, start_at, work_order_id, property_id, note')
      .eq('user_id', ctx.userId)
      .is('end_at', null)
      .order('start_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('time_entries')
      .select(
        'id, kind, start_at, end_at, work_order_id, property_id, note, source',
      )
      .eq('user_id', ctx.userId)
      .gte('start_at', weekStart.toISOString())
      .order('start_at', { ascending: false })
      .limit(200),
    supabase
      .from('properties')
      .select('id, code, name')
      .is('deleted_at', null)
      .order('name'),
    supabase
      .from('work_orders')
      .select('id, code, title, status')
      .is('deleted_at', null)
      .in('status', ['new', 'planned', 'in_progress'])
      .order('planned_start', { ascending: true, nullsFirst: false })
      .limit(50),
  ]);

  // Sprint 108: Die Wochensumme unten wird aus `entries` gerechnet. Mit
  // `?? []` wurde aus einer gescheiterten Query eine glaubhafte "0:00" — der
  // Mitarbeiter haette seine Woche als nicht erfasst gelesen und nachgetragen,
  // was laengst in der Datenbank steht.
  const openEntry = unwrapMaybeRow(openRes, 'Zeiterfassung: laufender Eintrag');
  const entries = unwrapRows(entriesRes, 'Zeiterfassung: eigene Zeiten der Woche');
  const propertyOptions = unwrapRows(propsRes, 'Zeiterfassung: Objektauswahl').map((p) => ({
    id: p.id,
    label: p.code ? `${p.code} · ${p.name}` : p.name,
  }));
  const workOrderOptions = unwrapRows(workOrdersRes, 'Zeiterfassung: Auftragsauswahl').map((w) => ({
    id: w.id,
    label: w.code ? `${w.code} · ${w.title}` : w.title,
  }));

  const propertyById = new Map(propertyOptions.map((p) => [p.id, p.label]));
  const workOrderById = new Map(workOrderOptions.map((w) => [w.id, w.label]));

  const byDay = new Map<string, typeof entries>();
  for (const e of entries) {
    const dayKey = new Date(e.start_at).toISOString().slice(0, 10);
    const arr = byDay.get(dayKey) ?? [];
    arr.push(e);
    byDay.set(dayKey, arr);
  }
  const dayKeysDesc = [...byDay.keys()].sort((a, b) => (a < b ? 1 : -1));

  const weekMinutes = entries
    .filter((e) => e.kind === 'work' && e.end_at)
    .reduce((sum, e) => sum + minutesBetween(e.start_at, e.end_at), 0);
  const weekBreakMinutes = entries
    .filter((e) => e.kind === 'break' && e.end_at)
    .reduce((sum, e) => sum + minutesBetween(e.start_at, e.end_at), 0);

  // Sprint 108: Ein Eintrag ohne end_at zaehlt in keiner der Zahlen unten mit
  // und faellt auch aus Zeitbericht und Lohn-Export heraus. Das Badge "laeuft"
  // in der Liste sagt das nicht — deshalb hier ein Satz, sobald die Zeit
  // laenger laeuft, als ein Arbeitstag plausibel dauert.
  const openWarning = openEntry ? describeOwnOpenEntry(openEntry.start_at, new Date()) : null;

  const { PunchWidget } = await import('./punch-widget');

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <PageHeader
        title="Zeiterfassung"
        description={`Woche vom ${formatDate(weekStart.toISOString())}`}
        action={
          <div className="flex gap-2">
            {canViewOthers && (
              <LinkButton href="/time-tracking/team" variant="outline">
                Team
              </LinkButton>
            )}
            {canCreate && (
              <LinkButton href="/time-tracking/new" variant="outline">
                Manuell erfassen
              </LinkButton>
            )}
          </div>
        }
      />

      {canCreate ? (
        <PunchWidget
          openEntry={openEntry}
          workOrders={workOrderOptions}
          properties={propertyOptions}
        />
      ) : (
        <EmptyState
          title="Keine Berechtigung zum Stempeln"
          description="Bitte kontaktieren Sie einen Administrator."
        />
      )}

      {openWarning && (
        <div
          className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 text-sm"
          role="status"
        >
          <p className="font-semibold">Laufende Zeit ohne Ende</p>
          <p className="mt-1">{openWarning}</p>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <SummaryTile label="Arbeitszeit diese Woche" value={formatDurationMinutes(weekMinutes)} />
        <SummaryTile label="Pausen diese Woche" value={formatDurationMinutes(weekBreakMinutes)} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Meine Zeiten</CardTitle>
        </CardHeader>
        <CardBody className="flex flex-col gap-4">
          {dayKeysDesc.length === 0 ? (
            <EmptyState title="Diese Woche noch keine Einträge." />
          ) : (
            dayKeysDesc.map((day) => {
              const dayEntries = byDay.get(day) ?? [];
              const dayTotal = dayEntries
                .filter((e) => e.kind === 'work' && e.end_at)
                .reduce((sum, e) => sum + minutesBetween(e.start_at, e.end_at), 0);
              const dayDate = new Date(day + 'T00:00:00');
              return (
                <div key={day} className="flex flex-col gap-2">
                  <div className="flex items-baseline justify-between border-b border-[var(--color-border)] pb-1">
                    <h3 className="text-sm font-semibold">
                      {WEEKDAY_LABEL[dayDate.getDay()]}{' '}
                      {dayDate.toLocaleDateString('de-DE', {
                        day: '2-digit',
                        month: '2-digit',
                      })}
                    </h3>
                    <span className="text-xs text-[var(--color-muted-foreground)]">
                      {formatDurationMinutes(dayTotal)}
                    </span>
                  </div>
                  <ul className="flex flex-col gap-1.5">
                    {dayEntries.map((e) => {
                      const kind = e.kind as TimeEntryKind;
                      const isOpen = !e.end_at;
                      const dur = isOpen ? null : minutesBetween(e.start_at, e.end_at);
                      const propLabel = e.property_id
                        ? propertyById.get(e.property_id)
                        : null;
                      const woLabel = e.work_order_id
                        ? workOrderById.get(e.work_order_id)
                        : null;
                      return (
                        <li
                          key={e.id}
                          className="flex flex-col gap-1 rounded-lg border border-[var(--color-border)] p-3 sm:flex-row sm:items-center sm:justify-between"
                        >
                          <div className="flex min-w-0 flex-1 flex-col gap-1">
                            <div className="flex flex-wrap items-center gap-2 text-sm">
                              <span className="font-mono tabular-nums">
                                {formatTime(e.start_at)} –{' '}
                                {e.end_at ? formatTime(e.end_at) : '…'}
                              </span>
                              <Badge tone={ENTRY_KIND_TONE[kind] ?? 'neutral'}>
                                {ENTRY_KIND_LABEL[kind] ?? e.kind}
                              </Badge>
                              {isOpen && <Badge tone="warning">läuft</Badge>}
                              {e.source === 'manual' && <Badge tone="muted">manuell</Badge>}
                            </div>
                            {(propLabel || woLabel || e.note) && (
                              <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-[var(--color-muted-foreground)]">
                                {propLabel && <span>{propLabel}</span>}
                                {woLabel && <span>{woLabel}</span>}
                                {e.note && <span className="italic">„{e.note}"</span>}
                              </div>
                            )}
                          </div>
                          <div className="flex items-center gap-3 text-sm">
                            {dur !== null && (
                              <span className="font-mono tabular-nums">
                                {formatDurationMinutes(dur)}
                              </span>
                            )}
                            {canEdit && !isOpen && (
                              <Link
                                href={`/time-tracking/${e.id}/edit`}
                                className="text-xs text-[var(--color-primary)] hover:underline"
                              >
                                Bearbeiten
                              </Link>
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              );
            })
          )}
        </CardBody>
      </Card>
    </div>
  );
}

function SummaryTile({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardBody className="flex flex-col gap-1">
        <span className="text-xs text-[var(--color-muted-foreground)]">{label}</span>
        <span className="font-mono text-2xl font-semibold tabular-nums">{value}</span>
      </CardBody>
    </Card>
  );
}
