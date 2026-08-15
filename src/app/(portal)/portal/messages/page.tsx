import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Plus } from 'lucide-react';
import { getResidentContext } from '@/lib/portal/current';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const metadata: Metadata = {
  title: 'Nachrichten · Bewohner-Portal',
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

export default async function PortalMessagesPage() {
  const ctx = await getResidentContext();
  if (!ctx) redirect('/portal/login');

  const supabase = await createSupabaseServerClient();
  const { data: threads } = await supabase
    .from('message_threads')
    .select('id, subject, last_message_at')
    .order('last_message_at', { ascending: false });

  const { data: participation } = await supabase
    .from('message_thread_participants')
    .select('thread_id, last_read_at')
    .eq('user_id', ctx.userId);

  const readMap = new Map((participation ?? []).map((p) => [p.thread_id, p.last_read_at]));

  // Sprint 62: Preview-Snippet + Autor-Label je Thread. Fuer den Bewohner
  // sind das i. d. R. wenige Threads (RLS limitiert), daher lohnt sich
  // eine `.in()`-Query gegen messages statt N maybeSingle()-Roundtrips.
  // Client-seitig picken wir pro thread_id die spaeteste Message.
  const threadIds = (threads ?? []).map((t) => t.id);
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

      {(threads ?? []).length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-[var(--color-border)] bg-[var(--color-background)] p-10 text-center">
          <p className="text-sm text-[var(--color-muted-foreground)]">
            Sie haben noch keine Nachrichten.
          </p>
          <Link
            href="/portal/messages/new"
            className="inline-flex h-9 items-center rounded-md border border-[var(--color-border)] px-4 text-sm font-medium hover:bg-[var(--color-muted)]"
          >
            Erste Nachricht schreiben
          </Link>
        </div>
      ) : (
        <ul className="flex flex-col divide-y divide-[var(--color-border)] overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)]">
          {(threads ?? []).map((t) => {
            const lastRead = readMap.get(t.id);
            const isUnread = !lastRead || (t.last_message_at && lastRead < t.last_message_at);
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
