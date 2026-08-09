import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getResidentContext } from '@/lib/portal/current';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const metadata: Metadata = {
  title: 'Ankündigungen · Bewohner-Portal',
};

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

export default async function PortalAnnouncementsPage() {
  const ctx = await getResidentContext();
  if (!ctx) redirect('/portal/login');

  const supabase = await createSupabaseServerClient();

  const [announcementsRes, receiptsRes] = await Promise.all([
    supabase
      .from('announcements')
      .select(
        'id, title, body, published_at, expires_at, requires_acknowledgement, target_type',
      )
      .eq('status', 'published')
      .order('published_at', { ascending: false, nullsFirst: false }),
    supabase
      .from('announcement_receipts')
      .select('announcement_id, read_at, acknowledged_at')
      .eq('user_id', ctx.userId),
  ]);

  const announcements = announcementsRes.data ?? [];
  const receipts = receiptsRes.data ?? [];
  const receiptMap = new Map(receipts.map((r) => [r.announcement_id, r]));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">Ankündigungen</h1>
        <p className="mt-1 text-sm text-[var(--color-muted-foreground)]">
          Nachrichten der Hausverwaltung an alle Bewohner.
        </p>
      </div>

      {announcements.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-[var(--color-border)] bg-[var(--color-background)] p-8 text-center text-sm text-[var(--color-muted-foreground)]">
          Es liegen aktuell keine Ankündigungen vor.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {announcements.map((a) => {
            const r = receiptMap.get(a.id);
            const isUnread = !r?.read_at;
            const needsAck = a.requires_acknowledgement && !r?.acknowledged_at;
            return (
              <li key={a.id}>
                <Link
                  href={`/portal/announcements/${a.id}`}
                  className="flex flex-col gap-2 rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)] p-4 transition hover:border-[var(--color-primary)]/50 md:flex-row md:items-start md:justify-between"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      {isUnread && (
                        <span
                          aria-label="ungelesen"
                          className="size-2 rounded-full bg-[var(--color-primary)]"
                        />
                      )}
                      <h2 className="text-sm font-semibold">{a.title}</h2>
                    </div>
                    <p className="mt-1 line-clamp-2 text-sm text-[var(--color-muted-foreground)]">
                      {a.body}
                    </p>
                    <p className="mt-2 text-xs text-[var(--color-muted-foreground)]">
                      Veröffentlicht {formatDate(a.published_at)}
                      {a.expires_at ? ` · gültig bis ${formatDate(a.expires_at)}` : ''}
                    </p>
                  </div>
                  {needsAck && (
                    <span className="self-start rounded-full bg-orange-100 px-2 py-0.5 text-xs font-medium text-orange-700 dark:bg-orange-950 dark:text-orange-300">
                      Kenntnis nehmen
                    </span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
