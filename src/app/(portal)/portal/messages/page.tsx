import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Plus } from 'lucide-react';
import { getResidentContext } from '@/lib/portal/current';
import { countThreadGroups, isThreadUnread } from '@/lib/portal/thread-read-state';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { sanitizeOrFilterTerm } from '@/lib/utils/search';

export const metadata: Metadata = {
  title: 'Nachrichten · Bewohner-Portal',
};

// Sprint 100: Filter analog Sprint 63 (Meldungen) und Sprint 65
// (Ankuendigungen) — die Nachrichten-Liste war die letzte Portal-Liste
// ohne. Der Punkt daran ist der Weg von der Glocke bzw. dem Nav-Badge:
// die sagen "3 ungelesen", die Liste liess den Bewohner die drei Punkte
// dann aber zwischen allen Threads suchen.
//
// Nur zwei Gruppen: bei Nachrichten gibt es ausser gelesen/ungelesen
// keine Zustandsachse, die den Bewohner interessiert. Ein dritter Tab
// waere Dekoration.
type ThreadGroup = 'alle' | 'ungelesen';

const GROUP_TABS: { key: ThreadGroup; label: string }[] = [
  { key: 'alle', label: 'Alle' },
  { key: 'ungelesen', label: 'Ungelesen' },
];

function isGroup(v: string | undefined): v is ThreadGroup {
  return v === 'alle' || v === 'ungelesen';
}

const EMPTY_STATE_TEXT: Record<ThreadGroup, string> = {
  alle: 'Sie haben noch keine Nachrichten.',
  ungelesen: 'Sie haben alle Nachrichten gelesen.',
};

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function truncate(text: string, max: number): string {
  const s = text.replace(/\s+/g, ' ').trim();
  if (s.length <= max) return s;
  return s.slice(0, max - 1).trimEnd() + '…';
}

export default async function PortalMessagesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string }>;
}) {
  const ctx = await getResidentContext();
  if (!ctx) redirect('/portal/login');

  // Sprint 84 + 85: Text-Suche in Betreff UND Nachrichten-Body. Erst
  // messages.body per ILIKE durchsuchen (RLS begrenzt auf sichtbare
  // Threads), daraus distinct thread_ids sammeln, dann in der Haupt-Query
  // per .or() sowohl Betreff-ILike als auch matching thread-ids
  // beruecksichtigen. Sprint 98: Entschaerfung ueber lib/utils/search.
  // Auch der reine ilike()-Zweig unten bekommt den sanitisierten Term —
  // sonst wirkte ein getipptes % dort still als Wildcard, waehrend es im
  // or()-Zweig entfernt wird, und dieselbe Suche haette je nach
  // Body-Treffer zwei verschiedene Bedeutungen.
  const { status: statusParam, q: qParam } = await searchParams;
  const activeGroup: ThreadGroup = isGroup(statusParam) ? statusParam : 'alle';
  const searchTerm = (qParam ?? '').trim();
  const searchSafe = sanitizeOrFilterTerm(searchTerm);

  const supabase = await createSupabaseServerClient();

  let bodyThreadIds: string[] = [];
  if (searchSafe.length > 0) {
    const { data: bodyMatches } = await supabase
      .from('messages')
      .select('thread_id')
      .ilike('body', `%${searchSafe}%`);
    bodyThreadIds = Array.from(
      new Set((bodyMatches ?? []).map((m) => m.thread_id)),
    );
  }

  let threadsQuery = supabase
    .from('message_threads')
    .select('id, subject, last_message_at')
    .order('last_message_at', { ascending: false });
  if (searchSafe.length > 0) {
    if (bodyThreadIds.length > 0) {
      threadsQuery = threadsQuery.or(
        `subject.ilike.%${searchSafe}%,id.in.(${bodyThreadIds.join(',')})`,
      );
    } else {
      threadsQuery = threadsQuery.ilike('subject', `%${searchSafe}%`);
    }
  }
  const { data: threads } = await threadsQuery;

  const { data: participation } = await supabase
    .from('message_thread_participants')
    .select('thread_id, last_read_at')
    .eq('user_id', ctx.userId);

  const readMap = new Map((participation ?? []).map((p) => [p.thread_id, p.last_read_at]));

  // Sprint 100: Gruppierung vor den Folge-Queries, nicht erst beim
  // Rendern — so laden Preview-Snippets und Autor-Namen nur fuer die
  // Threads, die auch angezeigt werden. Gefiltert wird in der Server-
  // Komponente statt in der Query, weil das Praedikat zwei Tabellen
  // verbindet (message_threads.last_message_at gegen den eigenen
  // participants-Eintrag) und RLS die Menge ohnehin auf die wenigen
  // Threads des Bewohners begrenzt.
  const visibleThreads = (threads ?? []).filter((t) =>
    activeGroup === 'ungelesen' ? isThreadUnread(t.last_message_at, readMap.get(t.id)) : true,
  );

  // Sprint 102: Zahlen an den Tabs. Gezaehlt wird ueber `threads`, nicht
  // ueber `visibleThreads` — die Zahl soll ja gerade sagen, was hinter
  // dem *anderen* Tab liegt. Der Nav-Badge daneben zaehlt bewusst etwas
  // anderes (alle ungelesenen Threads, ohne Suchbegriff); bei aktiver
  // Suche duerfen die beiden Zahlen deshalb auseinanderliegen.
  const counts = countThreadGroups(threads ?? [], readMap);

  // Sprint 62: Preview-Snippet + Autor-Label je Thread. Fuer den Bewohner
  // sind das i. d. R. wenige Threads (RLS limitiert), daher lohnt sich
  // eine `.in()`-Query gegen messages statt N maybeSingle()-Roundtrips.
  // Client-seitig picken wir pro thread_id die spaeteste Message.
  const threadIds = visibleThreads.map((t) => t.id);
  const { data: allMessages } = threadIds.length
    ? await supabase
        .from('messages')
        .select('thread_id, body, author_user_id, sent_at')
        .in('thread_id', threadIds)
        .order('sent_at', { ascending: false })
    : { data: [] as { thread_id: string; body: string; author_user_id: string; sent_at: string }[] };

  const latestByThread = new Map<
    string,
    { body: string; author_user_id: string; sent_at: string }
  >();
  for (const m of allMessages ?? []) {
    if (!latestByThread.has(m.thread_id)) {
      latestByThread.set(m.thread_id, {
        body: m.body,
        author_user_id: m.author_user_id,
        sent_at: m.sent_at,
      });
    }
  }

  const otherAuthorIds = Array.from(
    new Set(
      Array.from(latestByThread.values())
        .map((m) => m.author_user_id)
        .filter((uid) => uid !== ctx.userId),
    ),
  );
  const { data: authorRows } = otherAuthorIds.length
    ? await supabase.from('users').select('id, display_name').in('id', otherAuthorIds)
    : { data: [] as { id: string; display_name: string | null }[] };
  const authorNameMap = new Map((authorRows ?? []).map((u) => [u.id, u.display_name ?? 'Verwaltung']));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Nachrichten</h1>
          <p className="mt-1 text-sm text-[var(--color-muted-foreground)]">
            Direkter Kontakt mit Ihrer Hausverwaltung.
          </p>
        </div>
        <Link
          href="/portal/messages/new"
          className="inline-flex h-10 items-center gap-2 rounded-md bg-[var(--color-primary)] px-4 text-sm font-medium text-[var(--color-primary-foreground)] hover:opacity-90"
        >
          <Plus className="size-4" aria-hidden />
          Neue Nachricht
        </Link>
      </div>

      <form method="get" action="/portal/messages" className="flex gap-2" role="search">
        <input
          type="search"
          name="q"
          defaultValue={searchTerm}
          placeholder="Betreff oder Nachrichten-Inhalt suchen"
          aria-label="Nachrichten durchsuchen"
          className="h-9 flex-1 rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 text-sm outline-none focus:border-[var(--color-primary)]"
        />
        {/* Haelt den aktiven Tab ueber das Absenden hinweg — ein GET-Form
            schickt sonst nur seine eigenen Felder und wuerfe den Filter weg. */}
        {activeGroup !== 'alle' && <input type="hidden" name="status" value={activeGroup} />}
        <button
          type="submit"
          className="inline-flex h-9 shrink-0 items-center rounded-md border border-[var(--color-border)] px-3 text-sm font-medium hover:bg-[var(--color-muted)]"
        >
          Suchen
        </button>
        {searchTerm.length > 0 && (
          <Link
            href={
              activeGroup === 'alle'
                ? '/portal/messages'
                : `/portal/messages?status=${activeGroup}`
            }
            className="inline-flex h-9 shrink-0 items-center rounded-md border border-[var(--color-border)] px-3 text-sm font-medium hover:bg-[var(--color-muted)]"
          >
            Zurücksetzen
          </Link>
        )}
      </form>

      <nav aria-label="Nach Lesestatus filtern" className="flex flex-wrap gap-2">
        {GROUP_TABS.map((tab) => {
          const isActive = tab.key === activeGroup;
          const qParamPart = searchTerm.length > 0 ? `q=${encodeURIComponent(searchTerm)}` : '';
          const statusParamPart = tab.key === 'alle' ? '' : `status=${tab.key}`;
          const queryString = [statusParamPart, qParamPart].filter(Boolean).join('&');
          const href = queryString ? `/portal/messages?${queryString}` : '/portal/messages';
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

      {visibleThreads.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-[var(--color-border)] bg-[var(--color-background)] p-10 text-center">
          <p className="text-sm text-[var(--color-muted-foreground)]">
            {searchTerm.length > 0
              ? `Keine Nachrichten gefunden für „${searchTerm}“.`
              : EMPTY_STATE_TEXT[activeGroup]}
          </p>
          {/* Nur wenn wirklich nichts da ist. Im Ungelesen-Tab hat der
              Bewohner Nachrichten, er hat sie nur alle gelesen — "Erste
              Nachricht schreiben" waere dort schlicht falsch. */}
          {searchTerm.length === 0 && activeGroup === 'alle' && (
            <Link
              href="/portal/messages/new"
              className="inline-flex h-9 items-center rounded-md border border-[var(--color-border)] px-4 text-sm font-medium hover:bg-[var(--color-muted)]"
            >
              Erste Nachricht schreiben
            </Link>
          )}
        </div>
      ) : (
        <ul className="flex flex-col divide-y divide-[var(--color-border)] overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)]">
          {visibleThreads.map((t) => {
            const isUnread = isThreadUnread(t.last_message_at, readMap.get(t.id));
            const latest = latestByThread.get(t.id);
            const authorLabel = latest
              ? latest.author_user_id === ctx.userId
                ? 'Sie'
                : authorNameMap.get(latest.author_user_id) ?? 'Verwaltung'
              : null;
            const snippet = latest ? truncate(latest.body, 120) : null;
            return (
              <li key={t.id}>
                <Link
                  href={`/portal/messages/${t.id}`}
                  className="flex items-start justify-between gap-4 p-4 transition hover:bg-[var(--color-muted)]"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      {isUnread && (
                        <span
                          aria-label="ungelesen"
                          className="size-2 rounded-full bg-[var(--color-primary)]"
                        />
                      )}
                      <p className={`text-sm ${isUnread ? 'font-semibold' : ''}`}>{t.subject}</p>
                    </div>
                    {snippet && (
                      <p
                        className={`mt-1 text-sm text-[var(--color-muted-foreground)] ${
                          isUnread ? 'font-medium' : ''
                        }`}
                      >
                        <span className="font-medium text-[var(--color-foreground)]">
                          {authorLabel}:
                        </span>{' '}
                        {snippet}
                      </p>
                    )}
                    <p className="mt-1 text-xs text-[var(--color-muted-foreground)]">
                      Zuletzt aktualisiert {formatDate(t.last_message_at)}
                    </p>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
