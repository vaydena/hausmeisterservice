import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getResidentContext } from '@/lib/portal/current';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const metadata: Metadata = {
  title: 'Ankündigungen · Bewohner-Portal',
};

// Sprint 65: Analog zu Sprint 63 (Meldungen-Filter). Bewohnerorientierte
// Gruppen — "ungelesen" ist die einfache Frage, "zu quittieren" das mit
// Handlungsdruck. "alle" ist der Default. Die Filterung ist bewusst
// client-seitig: RLS liefert i. d. R. wenige Ankuendigungen, ein zweiter
// Roundtrip fuer die Receipt-Map lief ohnehin schon vorher.
type AnnouncementGroup = 'alle' | 'ungelesen' | 'zu_quittieren';

const GROUP_TABS: { key: AnnouncementGroup; label: string }[] = [
  { key: 'alle', label: 'Alle' },
  { key: 'ungelesen', label: 'Ungelesen' },
  { key: 'zu_quittieren', label: 'Zu quittieren' },
];

function isGroup(v: string | undefined): v is AnnouncementGroup {
  return v === 'alle' || v === 'ungelesen' || v === 'zu_quittieren';
}

const EMPTY_STATE_TEXT: Record<AnnouncementGroup, string> = {
  alle: 'Es liegen aktuell keine Ankündigungen vor.',
  ungelesen: 'Sie haben alle Ankündigungen gelesen.',
  zu_quittieren: 'Es sind aktuell keine Ankündigungen zu quittieren.',
};

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

export default async function PortalAnnouncementsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const ctx = await getResidentContext();
  if (!ctx) redirect('/portal/login');

  const { status: statusParam } = await searchParams;
  const activeGroup: AnnouncementGroup = isGroup(statusParam) ? statusParam : 'alle';

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

  const visible = announcements.filter((a) => {
    if (activeGroup === 'alle') return true;
    const r = receiptMap.get(a.id);
    if (activeGroup === 'ungelesen') return !r?.read_at;
    if (activeGroup === 'zu_quittieren') {
      return a.requires_acknowledgement && !r?.acknowledged_at;
    }
    return true;
  });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">Ankündigungen</h1>
        <p className="mt-1 text-sm text-[var(--color-muted-foreground)]">
          Nachrichten der Hausverwaltung an alle Bewohner.
        </p>
      </div>

      <nav aria-label="Nach Status filtern" className="flex flex-wrap gap-2">
        {GROUP_TABS.map((tab) => {
          const isActive = tab.key === activeGroup;
          const href =
            tab.key === 'alle' ? '/portal/announcements' : `/portal/announcements?status=${tab.key}`;
          return (
            <Link
              key={tab.key}
              href={href}
              aria-current={isActive ? 'page' : undefined}
              className={`inline-flex h-8 items-center rounded-full border px-3 text-xs font-medium transition ${
                isActive
                  ? 'border-[var(--color-primary)] bg-[var(--color-primary)] text-[var(--color-primary-foreground)]'
                  : 'border-[var(--color-border)] bg-[var(--color-background)] text-[var(--color-foreground)] hover:bg-[var(--color-muted)]'
              }`}
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>

      {visible.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-[var(--color-border)] bg-[var(--color-background)] p-8 text-center text-sm text-[var(--color-muted-foreground)]">
          {EMPTY_STATE_TEXT[activeGroup]}
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {visible.map((a) => {
            const r = receiptMap.get(a.id);
            const isUnread = !r?.read_at;
            const needsAck = a.requires_acknowledgement && !r?.acknowledged_at;
            // Sprint 70: Konsistent mit Sprint 66 (Ablauf-Warnung im
            // Detail). In der Liste reicht ein diskretes Badge — der
            // Bewohner soll die Kachel weiter oeffnen koennen, aber
            // sofort sehen, dass die Meldung nicht mehr aktuell ist.
            const isExpired = a.expires_at ? new Date(a.expires_at).getTime() < Date.now() : false;
            return (
              <li key={a.id}>
                <Link
                  href={`/portal/announcements/${a.id}`}
                  className="flex flex-col gap-2 rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)] p-4 transition hover:border-[var(--color-primary)]/50 md:flex-row md:items-start md:justify-between"
                >
                  <div className="flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      {isUnread && (
                        <span
                          aria-label="ungelesen"
                          className="size-2 rounded-full bg-[var(--color-primary)]"
                        />
                      )}
                      <h2 className="text-sm font-semibold">{a.title}</h2>
                      {isExpired && (
                        <span className="rounded-full bg-[var(--color-muted)] px-2 py-0.5 text-xs font-medium text-[var(--color-muted-foreground)]">
                          abgelaufen
                        </span>
                      )}
                    </div>
                    <p className="mt-1 line-clamp-2 text-sm text-[var(--color-muted-foreground)]">
                      {a.body}
                    </p>
                    <p className="mt-2 text-xs text-[var(--color-muted-foreground)]">
                      Veröffentlicht {formatDate(a.published_at)}
                      {a.expires_at
                        ? isExpired
                          ? ` · war gültig bis ${formatDate(a.expires_at)}`
                          : ` · gültig bis ${formatDate(a.expires_at)}`
                        : ''}
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
