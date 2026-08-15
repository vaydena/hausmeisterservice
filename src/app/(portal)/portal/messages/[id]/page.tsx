import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getResidentContext } from '@/lib/portal/current';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { PortalReplyForm } from './portal-reply-form';

export const metadata: Metadata = {
  title: 'Konversation · Bewohner-Portal',
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

export default async function PortalMessageThreadPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const ctx = await getResidentContext();
  if (!ctx) redirect('/portal/login');

  const { id } = await params;
  const supabase = await createSupabaseServerClient();

  const [threadRes, messagesRes, participantsRes] = await Promise.all([
    supabase
      .from('message_threads')
      .select('id, subject, last_message_at')
      .eq('id', id)
      .maybeSingle(),
    supabase
      .from('messages')
      .select('id, body, author_user_id, sent_at')
      .eq('thread_id', id)
      .order('sent_at', { ascending: true }),
    supabase
      .from('message_thread_participants')
      .select('user_id')
      .eq('thread_id', id),
  ]);

  if (!threadRes.data) notFound();

  const messages = messagesRes.data ?? [];
  const participants = participantsRes.data ?? [];
  const authorIds = Array.from(
    new Set(messages.map((m) => m.author_user_id).concat(participants.map((p) => p.user_id))),
  );

  const { data: users } = authorIds.length
    ? await supabase.from('users').select('id, display_name').in('id', authorIds)
    : { data: [] as { id: string; display_name: string | null }[] };
  const displayNameMap = new Map((users ?? []).map((u) => [u.id, u.display_name ?? '—']));

  // Best-effort: last_read_at hochsetzen (kein blocking, kein revalidate hier – nur State)
  const nowIso = new Date().toISOString();
  await supabase
    .from('message_thread_participants')
    .update({ last_read_at: nowIso })
    .eq('thread_id', id)
    .eq('user_id', ctx.userId);

  // Sprint 54: DSGVO-Transparenz. Bewohner soll sehen, welche Mitarbeitenden
  // seine Nachrichten mitlesen koennen. Der Bewohner selbst wird nicht in
  // der Liste gefuehrt — die aktuelle Datenlage kennt nur 1-Bewohner-je-
  // Thread (Threads werden immer von einem einzelnen Bewohner via RPC
  // eroeffnet), daher ist "alle Participants ausser ctx.userId" ein
  // hinreichender Filter fuer "Empfaenger auf Staff-Seite".
  const staffRecipients = participants
    .map((p) => p.user_id)
    .filter((uid) => uid !== ctx.userId)
    .map((uid) => displayNameMap.get(uid) ?? 'Unbekannt');

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link
          href="/portal/messages"
          className="text-sm text-[var(--color-muted-foreground)] hover:underline"
        >
          ← alle Nachrichten
        </Link>
        <h1 className="mt-2 text-xl font-semibold">{threadRes.data.subject}</h1>
      </div>

      <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)] p-4 text-sm">
        <p className="text-xs uppercase tracking-wider text-[var(--color-muted-foreground)]">
          Sichtbar für
        </p>
        {staffRecipients.length === 0 ? (
          <p className="mt-1 text-[var(--color-muted-foreground)]">
            Zurzeit sind keine Mitarbeitenden Ihrer Hausverwaltung diesem Thread
            zugeordnet. Neue Nachrichten koennen erst gelesen werden, wenn die
            Hausverwaltung jemanden hinzufuegt.
          </p>
        ) : (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {staffRecipients.map((name, i) => (
              <span
                key={`${name}-${i}`}
                className="inline-flex items-center rounded-full border border-[var(--color-border)] bg-[var(--color-muted)] px-2 py-0.5 text-xs"
              >
                {name}
              </span>
            ))}
          </div>
        )}
      </div>

      <ul className="flex flex-col gap-3">
        {messages.length === 0 && (
          <p className="rounded-2xl border border-dashed border-[var(--color-border)] p-4 text-sm text-[var(--color-muted-foreground)]">
            Noch keine Nachrichten in dieser Konversation.
          </p>
        )}
        {messages.map((m) => {
          const isMe = m.author_user_id === ctx.userId;
          return (
            <li
              key={m.id}
              className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm shadow-sm ${
                  isMe
                    ? 'bg-[var(--color-primary)] text-[var(--color-primary-foreground)]'
                    : 'border border-[var(--color-border)] bg-[var(--color-background)]'
                }`}
              >
                <p className="mb-1 text-xs opacity-75">
                  {isMe ? 'Sie' : displayNameMap.get(m.author_user_id) ?? 'Verwaltung'} ·{' '}
                  {formatDateTime(m.sent_at)}
                </p>
                <p className="whitespace-pre-wrap">{m.body}</p>
              </div>
            </li>
          );
        })}
      </ul>

      <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)] p-4">
        <PortalReplyForm threadId={id} />
      </div>
    </div>
  );
}
