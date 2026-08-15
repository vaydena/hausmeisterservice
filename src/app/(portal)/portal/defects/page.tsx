import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AlertTriangle, Plus, Tag } from 'lucide-react';
import { getResidentContext } from '@/lib/portal/current';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const metadata: Metadata = {
  title: 'Meldungen · Bewohner-Portal',
};

const STATUS_LABEL: Record<string, string> = {
  new: 'Neu eingereicht',
  reviewing: 'In Prüfung',
  converted: 'In Bearbeitung',
  rejected: 'Abgelehnt',
};

const STATUS_TONE: Record<string, string> = {
  new: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
  reviewing: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
  converted: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
  rejected: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300',
};

const PRIORITY_LABEL: Record<string, string> = {
  low: 'niedrig',
  normal: 'normal',
  high: 'hoch',
  emergency: 'Notfall',
};

export default async function PortalDefectsPage({
  searchParams,
}: {
  searchParams: Promise<{ info?: string }>;
}) {
  const ctx = await getResidentContext();
  if (!ctx) redirect('/portal/login');
  const { info } = await searchParams;

  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from('defect_reports')
    .select('id, code, title, priority, status, category, created_at')
    .eq('reporter_user_id', ctx.userId)
    .order('created_at', { ascending: false });

  const defects = data ?? [];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Meine Meldungen</h1>
          <p className="mt-1 text-sm text-[var(--color-muted-foreground)]">
            Übersicht aller von Ihnen gemeldeten Mängel.
          </p>
        </div>
        <Link
          href="/portal/defects/new"
          className="inline-flex h-10 items-center gap-2 rounded-md bg-[var(--color-primary)] px-4 text-sm font-medium text-[var(--color-primary-foreground)] hover:opacity-90"
        >
          <Plus className="size-4" aria-hidden />
          Neue Meldung
        </Link>
      </div>

      {info === 'withdrawn' && (
        <div
          role="status"
          className="rounded-md border border-[var(--color-success)]/40 bg-[var(--color-success)]/5 p-4 text-sm"
        >
          <p className="font-medium">Meldung zurückgezogen.</p>
          <p className="mt-1 text-[var(--color-muted-foreground)]">
            Die Meldung wurde vollständig entfernt. Falls Sie den Mangel weiterhin
            gemeldet wissen möchten, erstellen Sie bitte eine neue Meldung.
          </p>
        </div>
      )}

      {defects.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-[var(--color-border)] bg-[var(--color-background)] p-10 text-center">
          <p className="text-sm text-[var(--color-muted-foreground)]">
            Sie haben bisher keine Mängel gemeldet.
          </p>
          <Link
            href="/portal/defects/new"
            className="inline-flex h-9 items-center rounded-md border border-[var(--color-border)] px-4 text-sm font-medium hover:bg-[var(--color-muted)]"
          >
            Erste Meldung erstellen
          </Link>
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {defects.map((d) => {
            const isEmergency = d.priority === 'emergency';
            return (
              <li key={d.id}>
                <Link
                  href={`/portal/defects/${d.id}`}
                  className={`flex items-center justify-between gap-4 rounded-2xl border bg-[var(--color-background)] p-4 transition ${
                    isEmergency
                      ? 'border-red-300 hover:border-red-400 dark:border-red-800 dark:hover:border-red-700'
                      : 'border-[var(--color-border)] hover:border-[var(--color-primary)]/50'
                  }`}
                >
                  <div className="flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      {isEmergency && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-800 dark:bg-red-950 dark:text-red-200">
                          <AlertTriangle className="h-3 w-3" aria-hidden />
                          Notfall
                        </span>
                      )}
                      <span className="text-sm font-semibold">{d.title}</span>
                      <span className="text-xs text-[var(--color-muted-foreground)]">
                        {d.code ?? ''}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-[var(--color-muted-foreground)]">
                      Erfasst am{' '}
                      {new Date(d.created_at).toLocaleDateString('de-DE', {
                        day: '2-digit',
                        month: '2-digit',
                        year: 'numeric',
                      })}
                      {!isEmergency && ` · Priorität: ${PRIORITY_LABEL[d.priority] ?? d.priority}`}
                    </p>
                    {d.category && (
                      <div className="mt-2">
                        <span className="inline-flex items-center gap-1 rounded-full border border-[var(--color-border)] bg-[var(--color-muted)] px-2 py-0.5 text-xs text-[var(--color-muted-foreground)]">
                          <Tag className="h-3 w-3" aria-hidden />
                          {d.category}
                        </span>
                      </div>
                    )}
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
                      STATUS_TONE[d.status] ?? 'bg-[var(--color-muted)] text-[var(--color-foreground)]'
                    }`}
                  >
                    {STATUS_LABEL[d.status] ?? d.status}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
