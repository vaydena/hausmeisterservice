import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireTenantContext } from '@/lib/tenant/current';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { unwrapRows } from '@/lib/supabase/unwrap';
import { getEffectivePermissions } from '@/lib/permissions/effective';
import { PageHeader } from '@/components/ui/page-header';
import { LinkButton } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Badge } from '@/components/ui/badge';
import {
  formatDurationHours,
  formatTime,
  shiftCrossesMidnight,
  shiftNetMinutes,
} from '@/lib/schemas/shifts';

export const metadata: Metadata = { title: 'Schichten' };

export default async function ShiftsPage() {
  const ctx = await requireTenantContext();
  const permissions = await getEffectivePermissions(ctx.userId, ctx.tenantId);
  // Es gibt genau ein Recht — wer es nicht hat, hat mit der Schicht-
  // Konfiguration nichts zu tun (und die RLS gäbe ihm ohnehin keine Zeile).
  if (!permissions.has('shifts.manage')) notFound();

  const supabase = await createSupabaseServerClient();
  const items = unwrapRows(
    await supabase
      .from('shifts')
      .select('id, name, short_code, start_time, end_time, break_minutes, color, sort_order, active')
      .is('deleted_at', null)
      .order('sort_order', { ascending: true })
      .order('start_time', { ascending: true }),
    'Schichtmodelle',
  );

  const activeShifts = items.filter((s) => s.active);
  const inactiveShifts = items.filter((s) => !s.active);

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <PageHeader
        title="Schichten"
        description="Schichtmodelle für die Einsatzplanung — Lage, Pausen und Farbe zentral definieren."
        action={<LinkButton href="/shifts/new">Neue Schicht</LinkButton>}
      />

      {items.length === 0 ? (
        <EmptyState
          title="Keine Schichtmodelle"
          description="Legen Sie die erste Schicht an — etwa Früh-, Spät- und Nachtschicht. Danach lassen sie sich in der Planung zuweisen."
          action={<LinkButton href="/shifts/new">Erste Schicht anlegen</LinkButton>}
        />
      ) : (
        <div className="flex flex-col gap-6">
          <ShiftList shifts={activeShifts} />
          {inactiveShifts.length > 0 && (
            <div className="flex flex-col gap-2">
              <h2 className="text-sm font-medium text-[var(--color-muted-foreground)]">
                Nicht in Verwendung
              </h2>
              <ShiftList shifts={inactiveShifts} muted />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

type ShiftRow = {
  id: string;
  name: string;
  short_code: string | null;
  start_time: string;
  end_time: string;
  break_minutes: number;
  color: string;
  sort_order: number;
  active: boolean;
};

function ShiftList({ shifts, muted = false }: { shifts: ShiftRow[]; muted?: boolean }) {
  if (shifts.length === 0) return null;
  return (
    <Card>
      <ul className="divide-y divide-[var(--color-border)]">
        {shifts.map((s) => {
          const net = shiftNetMinutes(s.start_time, s.end_time, s.break_minutes);
          const overnight = shiftCrossesMidnight(s.start_time, s.end_time);
          return (
            <li key={s.id}>
              <Link
                href={`/shifts/${s.id}/edit`}
                className={`flex flex-col gap-2 p-4 transition hover:bg-[var(--color-muted)] sm:flex-row sm:items-center sm:justify-between ${
                  muted ? 'opacity-60' : ''
                }`}
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span
                    className="inline-flex size-9 shrink-0 items-center justify-center rounded-md text-xs font-bold text-white"
                    style={{ backgroundColor: s.color }}
                    aria-hidden
                  >
                    {s.short_code || s.name.slice(0, 2).toUpperCase()}
                  </span>
                  <div className="flex min-w-0 flex-col">
                    <span className="truncate font-medium">{s.name}</span>
                    <span className="text-xs text-[var(--color-muted-foreground)]">
                      {formatTime(s.start_time)}–{formatTime(s.end_time)}
                      {overnight ? ' (Folgetag)' : ''}
                      {s.break_minutes > 0 ? ` · ${s.break_minutes} Min. Pause` : ''}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2 pl-12 sm:pl-0">
                  <Badge tone="muted">{formatDurationHours(net)} netto</Badge>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
