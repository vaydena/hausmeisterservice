import type { Metadata } from 'next';
import Link from 'next/link';
import { requireTenantContext } from '@/lib/tenant/current';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getEffectivePermissions } from '@/lib/permissions/effective';
import { PageHeader } from '@/components/ui/page-header';
import { LinkButton } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Badge } from '@/components/ui/badge';
import { formatMessageTime } from '@/lib/schemas/messaging';
import { unwrapRows } from '@/lib/supabase/unwrap';

export const metadata: Metadata = { title: 'Nachrichten' };

export default async function MessagesPage() {
  const ctx = await requireTenantContext();
  const supabase = await createSupabaseServerClient();
  const permissions = await getEffectivePermissions(ctx.userId, ctx.tenantId);

  // Alle Threads, in denen ich Teilnehmer bin (RLS enforced)
  const myPartsRes = await supabase
    .from('message_thread_participants')
    .select('thread_id, last_read_at')
    .eq('user_id', ctx.userId);
  const myParts = unwrapRows(myPartsRes, 'Nachrichten: eigene Unterhaltungen');

  const threadIds = myParts.map((p) => p.thread_id);
  const lastReadByThread = new Map<string, string | null>(
    myParts.map((p) => [p.thread_id, p.last_read_at]),
  );

  const [threadsRes, allPartsRes, recentMsgsRes] = await Promise.all([
    threadIds.length > 0
      ? supabase
          .from('message_threads')
          .select('id, subject, last_message_at, created_by')
          .in('id', threadIds)
          .order('last_message_at', { ascending: false })
      : Promise.resolve({
          data: [] as {
            id: string;
            subject: string;
            last_message_at: string;
            created_by: string | null;
          }[],
          error: null,
        }),
    threadIds.length > 0
      ? supabase
          .from('message_thread_participants')
          .select('thread_id, user_id')
          .in('thread_id', threadIds)
      : Promise.resolve({
          data: [] as { thread_id: string; user_id: string }[],
          error: null,
        }),
    threadIds.length > 0
      ? supabase
          .from('messages')
          .select('thread_id, body, sent_at, author_user_id')
          .in('thread_id', threadIds)
          .order('sent_at', { ascending: false })
      : Promise.resolve({
          data: [] as {
            thread_id: string;
            body: string;
            sent_at: string;
            author_user_id: string;
          }[],
          error: null,
        }),
  ]);
  const threads = unwrapRows(threadsRes, 'Nachrichten: message_threads');
  const allParts = unwrapRows(allPartsRes, 'Nachrichten: Teilnehmer der Unterhaltungen');
  const recentMsgs = unwrapRows(recentMsgsRes, 'Nachrichten: messages');

  const partsByThread = new Map<string, string[]>();
  for (const p of allParts) {
    const arr = partsByThread.get(p.thread_id) ?? [];
    arr.push(p.user_id);
    partsByThread.set(p.thread_id, arr);
  }

  // Aktuellste Nachricht + Unread-Zählung
  const latestByThread = new Map<
    string,
    { body: string; sent_at: string; author_user_id: string }
  >();
  const unreadByThread = new Map<string, number>();
  for (const m of recentMsgs) {
    if (!latestByThread.has(m.thread_id)) {
      latestByThread.set(m.thread_id, {
        body: m.body,
        sent_at: m.sent_at,
        author_user_id: m.author_user_id,
      });
    }
    const lastRead = lastReadByThread.get(m.thread_id);
    if (
      m.author_user_id !== ctx.userId &&
      (!lastRead || new Date(m.sent_at) > new Date(lastRead))
    ) {
      unreadByThread.set(m.thread_id, (unreadByThread.get(m.thread_id) ?? 0) + 1);
    }
  }

  const allUserIds = [
    ...new Set([
      ...allParts.map((p) => p.user_id),
      ...threads.map((t) => t.created_by).filter((v): v is string => Boolean(v)),
    ]),
  ];
  const usersRes =
    allUserIds.length > 0
      ? await supabase.from('users').select('id, display_name').in('id', allUserIds)
      : { data: [], error: null };
  const users = unwrapRows(usersRes, 'Nachrichten: users');
  const userById = new Map(users.map((u) => [u.id, u.display_name]));

  const canCreate = permissions.has('messaging.create');
  const totalUnread = [...unreadByThread.values()].reduce((sum, n) => sum + n, 0);

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <PageHeader
        title="Nachrichten"
        description={
          threads.length === 0
            ? 'Keine Konversationen.'
            : `${threads.length} Konversation${threads.length === 1 ? '' : 'en'}${
                totalUnread > 0 ? ` · ${totalUnread} ungelesen` : ''
              }`
        }
        action={
          canCreate ? <LinkButton href="/messages/new">Neue Nachricht</LinkButton> : undefined
        }
      />

      {threads.length === 0 ? (
        <EmptyState
          title="Keine Konversationen"
          description="Legen Sie eine neue Nachricht an, um jemanden zu erreichen."
          action={
            canCreate ? <LinkButton href="/messages/new">Neue Nachricht</LinkButton> : undefined
          }
        />
      ) : (
        <Card>
          <ul className="divide-y divide-[var(--color-border)]">
            {threads.map((t) => {
              const parts = (partsByThread.get(t.id) ?? [])
                .filter((uid) => uid !== ctx.userId)
                .map((uid) => userById.get(uid) ?? uid.slice(0, 8));
              const latest = latestByThread.get(t.id);
              const unread = unreadByThread.get(t.id) ?? 0;
              const authorName = latest
                ? latest.author_user_id === ctx.userId
                  ? 'Sie'
                  : (userById.get(latest.author_user_id) ?? '—')
                : null;
              return (
                <li key={t.id}>
                  <Link
                    href={`/messages/${t.id}`}
                    className="flex flex-col gap-1 p-4 transition hover:bg-[var(--color-muted)]"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-2">
                        <span
                          className={`truncate font-medium ${unread > 0 ? 'text-[var(--color-foreground)]' : ''}`}
                        >
                          {t.subject}
                        </span>
                        {unread > 0 && <Badge tone="primary">{unread} neu</Badge>}
                      </div>
                      <span className="text-xs text-[var(--color-muted-foreground)]">
                        {formatMessageTime(t.last_message_at)}
                      </span>
                    </div>
                    <span className="truncate text-xs text-[var(--color-muted-foreground)]">
                      {parts.length > 0 ? parts.join(', ') : '— nur Sie —'}
                    </span>
                    {latest && (
                      <span className="truncate text-sm text-[var(--color-muted-foreground)]">
                        {authorName}: {latest.body}
                      </span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </div>
  );
}
