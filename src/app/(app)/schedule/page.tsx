import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireTenantContext } from '@/lib/tenant/current';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getEffectivePermissions } from '@/lib/permissions/effective';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardBody } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import {
  SCHEDULE_KIND_LABEL,
  SCHEDULE_KIND_TONE,
  addDays,
  formatDayShort,
  formatTimeShort,
  parseIsoDate,
  startOfWeek,
  toIsoDate,
  type ScheduleKind,
} from '@/lib/schemas/scheduling';

export const metadata: Metadata = { title: 'Einsatzplanung' };

type Cell = {
  scheduleEntries: Array<{
    id: string;
    kind: ScheduleKind;
    title: string;
    start_at: string;
    end_at: string;
    all_day: boolean;
  }>;
  workOrders: Array<{
    id: string;
    code: string | null;
    title: string;
    planned_start: string;
    planned_end: string | null;
    priority: string;
  }>;
};

export default async function SchedulePage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>;
}) {
  const ctx = await requireTenantContext();
  const permissions = await getEffectivePermissions(ctx.userId, ctx.tenantId);
  if (!permissions.has('scheduling.view')) redirect('/dashboard');
  const canEdit = permissions.has('scheduling.edit');

  const params = await searchParams;
  const weekStart = startOfWeek(parseIsoDate(params.week) ?? new Date());
  const weekEnd = addDays(weekStart, 7);
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  const supabase = await createSupabaseServerClient();

  const [employeesRes, scheduleRes, workOrdersRes] = await Promise.all([
    supabase
      .from('employees')
      .select('id, user_id, employment_status')
      .eq('employment_status', 'active')
      .limit(200),
    supabase
      .from('schedule_entries')
      .select('id, employee_id, kind, title, start_at, end_at, all_day')
      .gte('start_at', weekStart.toISOString())
      .lt('start_at', weekEnd.toISOString())
      .order('start_at', { ascending: true })
      .limit(1000),
    supabase
      .from('work_orders')
      .select('id, code, title, assignee_id, planned_start, planned_end, priority')
      .is('deleted_at', null)
      .not('assignee_id', 'is', null)
      .not('planned_start', 'is', null)
      .gte('planned_start', weekStart.toISOString())
      .lt('planned_start', weekEnd.toISOString())
      .order('planned_start', { ascending: true })
      .limit(1000),
  ]);

  const employees = employeesRes.data ?? [];
  const scheduleEntries = scheduleRes.data ?? [];
  const workOrders = workOrdersRes.data ?? [];

  const userIds = [...new Set(employees.map((e) => e.user_id))];
  const usersRes =
    userIds.length > 0
      ? await supabase.from('users').select('id, display_name').in('id', userIds)
      : { data: [] };
  const nameByUserId = new Map((usersRes.data ?? []).map((u) => [u.id, u.display_name]));

  const rows = employees
    .map((e) => ({ id: e.id, name: nameByUserId.get(e.user_id) ?? '(Ohne Namen)' }))
    .sort((a, b) => a.name.localeCompare(b.name, 'de'));

  const cells = new Map<string, Cell>();
  const cellKey = (employeeId: string, dayIdx: number) => `${employeeId}::${dayIdx}`;
  const ensureCell = (key: string): Cell => {
    let c = cells.get(key);
    if (!c) {
      c = { scheduleEntries: [], workOrders: [] };
      cells.set(key, c);
    }
    return c;
  };

  const dayIndexOf = (iso: string): number => {
    const d = new Date(iso);
    const diffMs = d.getTime() - weekStart.getTime();
    return Math.floor(diffMs / (24 * 60 * 60 * 1000));
  };

  for (const e of scheduleEntries) {
    const idx = dayIndexOf(e.start_at);
    if (idx < 0 || idx > 6) continue;
    ensureCell(cellKey(e.employee_id, idx)).scheduleEntries.push({
      id: e.id,
      kind: e.kind as ScheduleKind,
      title: e.title,
      start_at: e.start_at,
      end_at: e.end_at,
      all_day: e.all_day,
    });
  }
  for (const w of workOrders) {
    if (!w.assignee_id || !w.planned_start) continue;
    const idx = dayIndexOf(w.planned_start);
    if (idx < 0 || idx > 6) continue;
    ensureCell(cellKey(w.assignee_id, idx)).workOrders.push({
      id: w.id,
      code: w.code,
      title: w.title,
      planned_start: w.planned_start,
      planned_end: w.planned_end,
      priority: w.priority,
    });
  }

  const prevWeek = toIsoDate(addDays(weekStart, -7));
  const nextWeek = toIsoDate(addDays(weekStart, 7));
  const thisWeek = toIsoDate(startOfWeek(new Date()));
  const isCurrentWeek = toIsoDate(weekStart) === thisWeek;
  const weekLabel = `KW ${getIsoWeek(weekStart)} · ${formatDayShort(weekStart)} – ${formatDayShort(addDays(weekStart, 6))}`;

  return (
    <div className="mx-auto flex max-w-[1400px] flex-col gap-6">
      <PageHeader
        title="Einsatzplanung"
        description={weekLabel}
        action={
          canEdit ? (
            <Link href="/schedule/new">
              <Button>Neuer Termin</Button>
            </Link>
          ) : undefined
        }
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1">
          <Link href={`/schedule?week=${prevWeek}`}>
            <Button variant="secondary" size="sm">
              ← Woche
            </Button>
          </Link>
          <Link href={`/schedule${isCurrentWeek ? '' : `?week=${thisWeek}`}`}>
            <Button variant={isCurrentWeek ? 'ghost' : 'secondary'} size="sm">
              Heute
            </Button>
          </Link>
          <Link href={`/schedule?week=${nextWeek}`}>
            <Button variant="secondary" size="sm">
              Woche →
            </Button>
          </Link>
        </div>
        <p className="text-xs text-[var(--color-muted-foreground)]">
          Blaue Chips = Aufträge · farbige Chips = Termine
        </p>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          title="Keine aktiven Mitarbeiter."
          description="Sobald ein Mitarbeiter aktiv ist, erscheint er im Kalender."
        />
      ) : (
        <Card>
          <CardBody className="!p-0">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-[var(--color-border)] bg-[var(--color-muted)]">
                    <th className="sticky left-0 z-10 min-w-40 bg-[var(--color-muted)] px-3 py-2 text-left font-medium">
                      Mitarbeiter
                    </th>
                    {days.map((d) => (
                      <th
                        key={d.toISOString()}
                        className="min-w-40 px-2 py-2 text-left font-medium"
                      >
                        {formatDayShort(d)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="border-b border-[var(--color-border)]">
                      <td className="sticky left-0 z-10 min-w-40 border-r border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 align-top font-medium">
                        {r.name}
                      </td>
                      {days.map((d, dayIdx) => {
                        const cell = cells.get(cellKey(r.id, dayIdx));
                        return (
                          <td
                            key={dayIdx}
                            className="min-w-40 border-r border-[var(--color-border)] px-2 py-2 align-top last:border-r-0"
                          >
                            {(!cell || (cell.scheduleEntries.length === 0 && cell.workOrders.length === 0)) ? (
                              <span className="text-xs text-[var(--color-muted-foreground)]">–</span>
                            ) : (
                              <div className="flex flex-col gap-1">
                                {cell?.workOrders.map((w) => (
                                  <Link
                                    key={w.id}
                                    href={`/work-orders/${w.id}`}
                                    className="rounded-md border border-[var(--color-border)] bg-[color-mix(in_srgb,var(--color-primary)_8%,transparent)] px-2 py-1 text-xs hover:bg-[color-mix(in_srgb,var(--color-primary)_15%,transparent)]"
                                    title={w.title}
                                  >
                                    <div className="flex items-center gap-1">
                                      <span className="font-mono text-[10px] text-[var(--color-muted-foreground)]">
                                        {formatTimeShort(w.planned_start)}
                                      </span>
                                      {w.priority === 'emergency' && (
                                        <Badge tone="danger">Notfall</Badge>
                                      )}
                                    </div>
                                    <div className="line-clamp-2 font-medium">
                                      {w.code ? `${w.code} · ${w.title}` : w.title}
                                    </div>
                                  </Link>
                                ))}
                                {cell?.scheduleEntries.map((e) => (
                                  <Link
                                    key={e.id}
                                    href={`/schedule/${e.id}/edit`}
                                    className="rounded-md border border-[var(--color-border)] px-2 py-1 text-xs hover:bg-[var(--color-muted)]"
                                    title={e.title}
                                  >
                                    <div className="flex items-center gap-1">
                                      <Badge tone={SCHEDULE_KIND_TONE[e.kind] ?? 'neutral'}>
                                        {SCHEDULE_KIND_LABEL[e.kind] ?? e.kind}
                                      </Badge>
                                    </div>
                                    <div className="mt-0.5 line-clamp-2 font-medium">{e.title}</div>
                                    {!e.all_day && (
                                      <div className="font-mono text-[10px] text-[var(--color-muted-foreground)]">
                                        {formatTimeShort(e.start_at)}–{formatTimeShort(e.end_at)}
                                      </div>
                                    )}
                                  </Link>
                                ))}
                              </div>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardBody>
        </Card>
      )}
    </div>
  );
}

/**
 * ISO-8601 Kalenderwoche (Deutschland: Woche startet Montag, erste Woche mit
 * mindestens 4 Tagen).
 */
function getIsoWeek(date: Date): number {
  const target = new Date(date);
  target.setHours(0, 0, 0, 0);
  target.setDate(target.getDate() + 3 - ((target.getDay() + 6) % 7));
  const firstThursday = new Date(target.getFullYear(), 0, 4);
  const diff = target.getTime() - firstThursday.getTime();
  return 1 + Math.round(diff / (7 * 24 * 60 * 60 * 1000));
}
