import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getResidentContext } from '@/lib/portal/current';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const metadata: Metadata = {
  title: 'Meldung · Bewohner-Portal',
};

const STATUS_LABEL: Record<string, string> = {
  new: 'Neu eingereicht',
  reviewing: 'In Prüfung',
  converted: 'In Bearbeitung',
  rejected: 'Abgelehnt',
};

const PRIORITY_LABEL: Record<string, string> = {
  low: 'niedrig',
  normal: 'normal',
  high: 'hoch',
  emergency: 'Notfall',
};

function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default async function PortalDefectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const ctx = await getResidentContext();
  if (!ctx) redirect('/portal/login');

  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from('defect_reports')
    .select(
      'id, code, title, description, location_details, priority, status, category, created_at, reviewed_at, rejection_reason',
    )
    .eq('id', id)
    .eq('reporter_user_id', ctx.userId)
    .maybeSingle();

  if (!data) notFound();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link
          href="/portal/defects"
          className="text-sm text-[var(--color-muted-foreground)] hover:underline"
        >
          ← zurück zu meinen Meldungen
        </Link>
      </div>

      <article className="flex flex-col gap-4 rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)] p-6">
        <header className="flex flex-col gap-1">
          <div className="flex items-center gap-2 text-xs text-[var(--color-muted-foreground)]">
            <span>{data.code ?? '—'}</span>
            <span>·</span>
            <span>{STATUS_LABEL[data.status] ?? data.status}</span>
            <span>·</span>
            <span>Priorität: {PRIORITY_LABEL[data.priority] ?? data.priority}</span>
          </div>
          <h1 className="text-xl font-semibold">{data.title}</h1>
        </header>

        <dl className="grid gap-3 md:grid-cols-2">
          <Row label="Eingereicht am" value={formatDateTime(data.created_at)} />
          <Row label="In Prüfung seit" value={formatDateTime(data.reviewed_at)} />
          {data.category && <Row label="Kategorie" value={data.category} />}
          {data.location_details && <Row label="Ort" value={data.location_details} />}
        </dl>

        {data.description && (
          <div>
            <p className="text-xs uppercase tracking-wider text-[var(--color-muted-foreground)]">
              Beschreibung
            </p>
            <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed">
              {data.description}
            </p>
          </div>
        )}

        {data.status === 'rejected' && data.rejection_reason && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900 dark:border-red-900 dark:bg-red-950 dark:text-red-100">
            <p className="text-xs font-medium uppercase tracking-wider">Grund der Ablehnung</p>
            <p className="mt-1">{data.rejection_reason}</p>
          </div>
        )}
      </article>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wider text-[var(--color-muted-foreground)]">
        {label}
      </dt>
      <dd className="mt-0.5 text-sm">{value}</dd>
    </div>
  );
}
