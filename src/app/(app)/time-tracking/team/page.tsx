import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { requireTenantContext } from '@/lib/tenant/current';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { unwrapRows } from '@/lib/supabase/unwrap';
import { getEffectivePermissions } from '@/lib/permissions/effective';
import { describeUnclosedEntries, summarizeUnclosedEntries } from '@/lib/time-tracking/unclosed';
import { PageHeader } from '@/components/ui/page-header';
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

export const metadata: Metadata = { title: 'Team-Zeiten' };

function startOfWeek(now = new Date()): Date {
  const d = new Date(now);
  const diff = (d.getDay() + 6) % 7;
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - diff);
  return d;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
}

function formatWeekRange(start: Date): string {
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  const fmt = (d: Date) => d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });
  return `${fmt(start)} – ${fmt(end)}`;
}

export default async function TimeTrackingTeamPage({
  searchParams,
}: {
  searchParams: Promise<{ employee?: string }>;
}) {
  const ctx = await requireTenantContext();
  const permissions = await getEffectivePermissions(ctx.userId, ctx.tenantId);
  if (!permissions.has('time_tracking.view_others')) redirect('/time-tracking');

  const supabase = await createSupabaseServerClient();
  const params = await searchParams;
  const selectedEmployeeId = params.employee ?? null;

  const week = startOfWeek();
  const weekEnd = new Date(week);
  weekEnd.setDate(weekEnd.getDate() + 7);

  const [employeesRes, entriesRes] = await Promise.all([
    supabase
      .from('employees')
      .select('id, user_id, employment_status')
      .eq('employment_status', 'active'),
    supabase
      .from('time_entries')
      .select('id, employee_id, kind, start_at, end_at, work_order_id, property_id, note')
      .gte('start_at', week.toISOString())
      .lt('start_at', weekEnd.toISOString())
      .order('start_at', { ascending: false })
      .limit(2000),
  ]);

  // Sprint 108: Ohne Fehlerpruefung wurde aus einer gescheiterten Query eine
  // Team-Uebersicht, in der alle Mitarbeiter mit 0:00 dastehen — fuer eine
  // Fuehrungskraft nicht von "diese Woche hat niemand gearbeitet" zu
  // unterscheiden.
  const employees = unwrapRows(employeesRes, 'Team-Zeiten: aktive Mitarbeiter');
  const entries = unwrapRows(entriesRes, 'Team-Zeiten: Eintraege der Woche');

  const userIds = [...new Set(employees.map((e) => e.user_id))];
  const users =
    userIds.length > 0
      ? unwrapRows(
          await supabase.from('users').select('id, display_name').in('id', userIds),
          'Team-Zeiten: Anzeigenamen',
        )
      : [];
  const displayById = new Map(users.map((u) => [u.id, u.display_name]));
  const employeeById = new Map(
    employees.map((e) => [
      e.id,
      { name: displayById.get(e.user_id) ?? '(Ohne Namen)' },
    ]),
  );

  const byEmployee = new Map<string, typeof entries>();
  for (const e of entries) {
    const arr = byEmployee.get(e.employee_id) ?? [];
    arr.push(e);
    byEmployee.set(e.employee_id, arr);
  }

  const rows = employees
    .map((emp) => {
      const list = byEmployee.get(emp.id) ?? [];
      const work = list
        .filter((e) => e.kind === 'work' && e.end_at)
        .reduce((s, e) => s + minutesBetween(e.start_at, e.end_at), 0);
      const isOpen = list.some((e) => !e.end_at);
      return {
        id: emp.id,
        name: employeeById.get(emp.id)?.name ?? '—',
        work,
        entryCount: list.length,
        isOpen,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  const totalMinutes = rows.reduce((s, r) => s + r.work, 0);
  // Die Gesamtsumme oben zaehlt nur beendete Zeiten. Wer hier steht, kann die
  // fehlenden Enden nachtragen lassen — also gehoert der Hinweis hierher.
  const unclosedNote = describeUnclosedEntries(
    summarizeUnclosedEntries(
      entries.map((e) => ({ start_at: e.start_at, end_at: e.end_at, person_id: e.employee_id })),
      new Date(),
    ),
  );

  const selectedEntries = selectedEmployeeId ? byEmployee.get(selectedEmployeeId) ?? [] : [];
  const selectedName = selectedEmployeeId
    ? employeeById.get(selectedEmployeeId)?.name ?? null
    : null;

  if (selectedEmployeeId && !employees.find((e) => e.id === selectedEmployeeId)) {
    notFound();
  }

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <PageHeader
        title="Team-Zeiten"
        description={`Woche ${formatWeekRange(week)} · gesamt ${formatDurationMinutes(totalMinutes)}`}
      />

      {unclosedNote && (
        <div
          className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 text-sm"
          role="status"
        >
          <p className="font-semibold">Offene Zeiten in dieser Woche</p>
          <p className="mt-1">{unclosedNote}</p>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className={selectedEmployeeId ? 'lg:col-span-1' : 'lg:col-span-3'}>
          <CardHeader>
            <CardTitle>Mitarbeiter</CardTitle>
          </CardHeader>
          <CardBody>
            {rows.length === 0 ? (
              <EmptyState title="Keine aktiven Mitarbeiter." />
            ) : (
              <ul className="flex flex-col divide-y divide-[var(--color-border)]">
                {rows.map((r) => {
                  const active = r.id === selectedEmployeeId;
                  return (
                    <li key={r.id}>
                      <Link
                        href={`/time-tracking/team?employee=${r.id}`}
                        className={
                          'flex items-center justify-between gap-3 py-2 text-sm ' +
                          (active ? 'font-semibold text-[var(--color-primary)]' : '')
                        }
                      >
                        <div className="flex items-center gap-2">
                          <span>{r.name}</span>
                          {r.isOpen && <Badge tone="warning">läuft</Badge>}
                        </div>
                        <span className="font-mono tabular-nums">
                          {formatDurationMinutes(r.work)}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardBody>
        </Card>

        {selectedEmployeeId && (
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>{selectedName ?? 'Zeiten'}</CardTitle>
            </CardHeader>
            <CardBody>
              {selectedEntries.length === 0 ? (
                <EmptyState title="Keine Einträge diese Woche." />
              ) : (
                <ul className="flex flex-col gap-2">
                  {selectedEntries.map((e) => {
                    const kind = e.kind as TimeEntryKind;
                    const dur = e.end_at ? minutesBetween(e.start_at, e.end_at) : null;
                    return (
                      <li
                        key={e.id}
                        className="flex flex-col gap-1 rounded-lg border border-[var(--color-border)] p-3 sm:flex-row sm:items-center sm:justify-between"
                      >
                        <div className="flex flex-col gap-1">
                          <div className="flex flex-wrap items-center gap-2 text-sm">
                            <span className="text-[var(--color-muted-foreground)]">
                              {new Date(e.start_at).toLocaleDateString('de-DE', {
                                weekday: 'short',
                                day: '2-digit',
                                month: '2-digit',
                              })}
                            </span>
                            <span className="font-mono tabular-nums">
                              {formatTime(e.start_at)} –{' '}
                              {e.end_at ? formatTime(e.end_at) : '…'}
                            </span>
                            <Badge tone={ENTRY_KIND_TONE[kind] ?? 'neutral'}>
                              {ENTRY_KIND_LABEL[kind] ?? e.kind}
                            </Badge>
                            {!e.end_at && <Badge tone="warning">läuft</Badge>}
                          </div>
                          {e.note && (
                            <p className="text-xs italic text-[var(--color-muted-foreground)]">
                              „{e.note}"
                            </p>
                          )}
                        </div>
                        <span className="font-mono text-sm tabular-nums">
                          {dur !== null ? formatDurationMinutes(dur) : '—'}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardBody>
          </Card>
        )}
      </div>
    </div>
  );
}
