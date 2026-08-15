import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getResidentContext } from '@/lib/portal/current';
import {
  countAnnouncementGroups,
  isAnnouncementUnread,
  needsAcknowledgement,
} from '@/lib/portal/announcement-read-state';
import { loadPortalUnreadAnnouncementsSummary } from '@/lib/portal/unread-announcements';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { sanitizeOrFilterTerm } from '@/lib/utils/search';
import { markAllPortalAnnouncementsReadAction } from './actions';

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
  searchParams: Promise<{ status?: string; q?: string }>;
}) {
  const ctx = await getResidentContext();
  if (!ctx) redirect('/portal/login');

  const { status: statusParam, q: qParam } = await searchParams;
  const activeGroup: AnnouncementGroup = isGroup(statusParam) ? statusParam : 'alle';

  // Sprint 73: Text-Suche analog Meldungen-Liste (Sprint 72). Ankuendigungen
  // wachsen ueber Zeit an — nach ein paar Monaten will der Bewohner z. B.
  // die Heizungs-Absprache aus dem Winter wiederfinden. Sprint 98:
  // Entschaerfung ueber lib/utils/search.
  const searchTerm = (qParam ?? '').trim();
  const searchSafe = sanitizeOrFilterTerm(searchTerm);

  const supabase = await createSupabaseServerClient();

  let annQuery = supabase
    .from('announcements')
    .select(
      'id, title, body, published_at, expires_at, requires_acknowledgement, target_type',
    )
    .eq('status', 'published')
    .order('published_at', { ascending: false, nullsFirst: false });
  if (searchSafe.length > 0) {
    annQuery = annQuery.or(`title.ilike.%${searchSafe}%,body.ilike.%${searchSafe}%`);
  }

  const [announcementsRes, receiptsRes, unreadSummary] = await Promise.all([
    annQuery,
    supabase
      .from('announcement_receipts')
      .select('announcement_id, read_at, acknowledged_at')
      .eq('user_id', ctx.userId),
    // Sprint 101: Fuer die Sichtbarkeit des "Alle als gelesen"-Buttons,
    // siehe unten. Kostet hier nichts — das Portal-Layout ruft denselben
    // Helper fuer den Nav-Badge, und React cache() dedupliziert ihn.
    loadPortalUnreadAnnouncementsSummary(ctx.userId),
  ]);

  const announcements = announcementsRes.data ?? [];
  const receipts = receiptsRes.data ?? [];
  const receiptMap = new Map(receipts.map((r) => [r.announcement_id, r]));

  // Sprint 102: Zahlen an den Tabs. Gezaehlt wird ueber `announcements` —
  // also ueber genau die Menge, die der Tab-Wechsel danach filtert, samt
  // aktivem Suchbegriff. Waeren es die globalen Zahlen aus dem
  // Summary-Helper (der den Nav-Badge speist), stuende bei aktiver Suche
  // eine 3 an einem Tab, der dann eine Zeile zeigt.
  const counts = countAnnouncementGroups(announcements, receiptMap);

  const visible = announcements.filter((a) => {
    if (activeGroup === 'alle') return true;
    const r = receiptMap.get(a.id);
    if (activeGroup === 'ungelesen') return isAnnouncementUnread(r);
    if (activeGroup === 'zu_quittieren') {
      return needsAcknowledgement(a.requires_acknowledgement, r);
    }
    return true;
  });

  // Sprint 87: Zu-quittierende Ankuendigungen an den Anfang priorisieren
  // (analog Sprint 68 fuer Notfall-Meldungen im Dashboard). Bewohner
  // sollen keinen wichtigen Aushang uebersehen, nur weil ein neuerer
  // Info-Aushang oben steht. Innerhalb der beiden Gruppen bleibt die
  // Server-Sortierung (published_at desc) erhalten — Array.prototype.sort
  // ist seit ES2019 stabil, also wirkt sich der 0-Return korrekt aus.
  // Im "zu_quittieren"-Tab ist die Priorisierung No-Op; wir wenden sie
  // trotzdem immer an, damit die Logik lokalisiert bleibt.
  const sortedVisible = [...visible].sort((a, b) => {
    const needsAckA = needsAcknowledgement(a.requires_acknowledgement, receiptMap.get(a.id));
    const needsAckB = needsAcknowledgement(b.requires_acknowledgement, receiptMap.get(b.id));
    if (needsAckA === needsAckB) return 0;
    return needsAckA ? -1 : 1;
  });

  // Sprint 71: Button oben nur einblenden, wenn es tatsaechlich noch
  // etwas zu markieren gibt — ein disabled Button ohne Wirkung waere
  // fuer den Bewohner nur Rauschen.
  //
  // Sprint 101: Der Zaehler kommt aus dem Summary-Helper und nicht mehr
  // aus `announcements`. Jene Liste ist suchgefiltert, die Aktion
  // dahinter markiert aber ausnahmslos alle veroeffentlichten
  // Ankuendigungen. Wer nach "Heizung" suchte und dort nur Gelesenes
  // traf, sah den Button verschwinden, waehrend der Nav-Badge daneben
  // weiter Ungelesenes zaehlte. Sichtbarkeit und Wirkung des Buttons
  // haengen jetzt an derselben Zahl.
  const hasUnread = unreadSummary.unreadCount > 0;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Ankündigungen</h1>
          <p className="mt-1 text-sm text-[var(--color-muted-foreground)]">
            Nachrichten der Hausverwaltung an alle Bewohner.
          </p>
        </div>
        {hasUnread && (
          <form action={markAllPortalAnnouncementsReadAction}>
            <button
              type="submit"
              className="inline-flex h-9 items-center rounded-md border border-[var(--color-border)] px-3 text-sm font-medium hover:bg-[var(--color-muted)]"
            >
              Alle als gelesen markieren
            </button>
          </form>
        )}
      </div>

      <form method="get" action="/portal/announcements" className="flex gap-2" role="search">
        <input
          type="search"
          name="q"
          defaultValue={searchTerm}
          placeholder="Nach Titel oder Text suchen"
          aria-label="Ankündigungen durchsuchen"
          className="h-9 flex-1 rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 text-sm outline-none focus:border-[var(--color-primary)]"
        />
        {activeGroup !== 'alle' && (
          <input type="hidden" name="status" value={activeGroup} />
        )}
        <button
          type="submit"
          className="inline-flex h-9 shrink-0 items-center rounded-md border border-[var(--color-border)] px-3 text-sm font-medium hover:bg-[var(--color-muted)]"
        >
          Suchen
        </button>
        {searchTerm.length > 0 && (
          <Link
            href={activeGroup === 'alle' ? '/portal/announcements' : `/portal/announcements?status=${activeGroup}`}
            className="inline-flex h-9 shrink-0 items-center rounded-md border border-[var(--color-border)] px-3 text-sm font-medium hover:bg-[var(--color-muted)]"
          >
            Zurücksetzen
          </Link>
        )}
      </form>

      <nav aria-label="Nach Status filtern" className="flex flex-wrap gap-2">
        {GROUP_TABS.map((tab) => {
          const isActive = tab.key === activeGroup;
          const qParamPart = searchTerm.length > 0 ? `q=${encodeURIComponent(searchTerm)}` : '';
          const statusParamPart = tab.key === 'alle' ? '' : `status=${tab.key}`;
          const queryString = [statusParamPart, qParamPart].filter(Boolean).join('&');
          const href = queryString ? `/portal/announcements?${queryString}` : '/portal/announcements';
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
              <span
                className={`ml-1.5 tabular-nums ${
                  isActive ? 'opacity-70' : 'text-[var(--color-muted-foreground)]'
                }`}
              >
                {counts[tab.key]}
              </span>
            </Link>
          );
        })}
      </nav>

      {sortedVisible.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-[var(--color-border)] bg-[var(--color-background)] p-8 text-center text-sm text-[var(--color-muted-foreground)]">
          {searchTerm.length > 0
            ? `Keine Ankündigungen gefunden für „${searchTerm}“.`
            : EMPTY_STATE_TEXT[activeGroup]}
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {sortedVisible.map((a) => {
            const r = receiptMap.get(a.id);
            const isUnread = isAnnouncementUnread(r);
            const needsAck = needsAcknowledgement(a.requires_acknowledgement, r);
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
