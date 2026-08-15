import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requireTenantContext } from '@/lib/tenant/current';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getEffectivePermissions } from '@/lib/permissions/effective';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card';
import { formatMessageTime } from '@/lib/schemas/messaging';
import { markThreadReadAction } from '../actions';
import { ReplyForm } from '../reply-form';
import { AddParticipant, RemoveParticipantButton } from '../participant-actions';
import { unwrapMaybeRow, unwrapRows } from '@/lib/supabase/unwrap';

export const metadata: Metadata = { title: 'Nachricht' };

export default async function ThreadDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireTenantContext();
  const supabase = await createSupabaseServerClient();
  const permissions = await getEffectivePermissions(ctx.userId, ctx.tenantId);

  const threadRes = await supabase
    .from('message_threads')
    .select('id, subject, created_by, last_message_at, created_at')
    .eq('id', id)
    .maybeSingle();
  const thread = unwrapMaybeRow(threadRes, 'Nachrichten: message_threads');
  if (!thread) notFound();

  const [participantsRes, messagesRes, membershipsRes] = await Promise.all([
    supabase
      .from('message_thread_participants')
      .select('user_id, added_at, last_read_at')
      .eq('thread_id', id),
    supabase
      .from('messages')
      .select('id, body, sent_at, author_user_id')
      .eq('thread_id', id)
      .order('sent_at', { ascending: true }),
    supabase
      .from('memberships')
      .select('user_id')
      .eq('tenant_id', ctx.tenantId)
      .eq('status', 'active'),
  ]);
  const parts = unwrapRows(participantsRes, 'Nachrichten: message_thread_participants');
  const msgs = unwrapRows(messagesRes, 'Nachrichten: messages');
  const memberships = unwrapRows(membershipsRes, 'Nachrichten: memberships');

  const partIds = parts.map((p) => p.user_id);
  const allTenantMemberIds = memberships.map((m) => m.user_id);

  const authorIds = [
    ...new Set([
      ...msgs.map((m) => m.author_user_id),
      ...partIds,
      ...(thread.created_by ? [thread.created_by] : []),
    ]),
  ];
  const usersRes = authorIds.length
    ? await supabase.from('users').select('id, display_name').in('id', authorIds)
    : { data: [], error: null };
  const users = unwrapRows(usersRes, 'Nachrichten: Namen der Verfasser');
  const displayById = new Map(users.map((u) => [u.id, u.display_name ?? u.id.slice(0, 8)]));

  // Als gelesen markieren (falls neue Nachrichten vorhanden)
  const myPart = parts.find((p) => p.user_id === ctx.userId);
  const hasUnread = msgs.some(
    (m) =>
      m.author_user_id !== ctx.userId &&
      (!myPart?.last_read_at || new Date(m.sent_at) > new Date(myPart.last_read_at)),
  );
  if (hasUnread) {
    await supabase
      .from('message_thread_participants')
      .update({ last_read_at: new Date().toISOString() })
      .eq('thread_id', id)
      .eq('user_id', ctx.userId);
  }

  const candidateUsers = users.filter(
    (u) => allTenantMemberIds.includes(u.id) && !partIds.includes(u.id),
  );
  // Für Kandidaten müssen wir auch nicht-teilnehmende Members laden (die noch keinen Display-Namen im obigen Set haben):
  const missingCandidateIds = allTenantMemberIds.filter(
    (mid) => !partIds.includes(mid) && !authorIds.includes(mid),
  );
  const missingUsersRes =
    missingCandidateIds.length > 0
      ? await supabase
          .from('users')
          .select('id, display_name')
          .in('id', missingCandidateIds)
          .order('display_name')
      : { data: [], error: null };
  const missingUsers = unwrapRows(missingUsersRes, 'Nachrichten: Namen fehlender Teilnehmer');
  const candidates = [...candidateUsers, ...missingUsers].map((u) => ({
    id: u.id,
    display_name: u.display_name,
  }));

  const canEdit = permissions.has('messaging.create');

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <PageHeader
        title={thread.subject}
        description={`Angelegt von ${displayById.get(thread.created_by ?? '') ?? '—'} · ${formatMessageTime(thread.created_at)}`}
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Verlauf ({msgs.length})</CardTitle>
            </CardHeader>
            <CardBody>
              {msgs.length === 0 ? (
                <p className="text-sm text-[var(--color-muted-foreground)]">
                  Noch keine Nachrichten.
                </p>
              ) : (
                <ul className="flex flex-col gap-3">
                  {msgs.map((m) => {
                    const mine = m.author_user_id === ctx.userId;
                    return (
                      <li
                        key={m.id}
                        className={`flex flex-col gap-1 rounded-md border p-3 ${
                          mine
                            ? 'ml-8 border-[var(--color-primary)] bg-[color-mix(in_srgb,var(--color-primary)_6%,transparent)]'
                            : 'mr-8 border-[var(--color-border)]'
                        }`}
                      >
                        <div className="flex items-center justify-between text-xs text-[var(--color-muted-foreground)]">
                          <span className="font-medium">
                            {mine ? 'Sie' : (displayById.get(m.author_user_id) ?? '—')}
                          </span>
                          <span>{formatMessageTime(m.sent_at)}</span>
                        </div>
                        <p className="whitespace-pre-line text-sm">{m.body}</p>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardBody>
          </Card>

          {canEdit && (
            <Card>
              <CardHeader>
                <CardTitle>Antworten</CardTitle>
              </CardHeader>
              <CardBody>
                <ReplyForm threadId={thread.id} />
              </CardBody>
            </Card>
          )}
        </div>

        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Teilnehmer ({parts.length})</CardTitle>
            </CardHeader>
            <CardBody>
              <ul className="flex flex-col gap-2">
                {parts.map((p) => {
                  const label = displayById.get(p.user_id) ?? p.user_id.slice(0, 8);
                  const isMe = p.user_id === ctx.userId;
                  return (
                    <li key={p.user_id} className="flex items-center justify-between gap-2 text-sm">
                      <span className={isMe ? 'font-medium' : ''}>
                        {label}
                        {isMe && ' (Sie)'}
                      </span>
                      {canEdit && !isMe && (
                        <RemoveParticipantButton
                          threadId={thread.id}
                          userId={p.user_id}
                          label={label}
                        />
                      )}
                    </li>
                  );
                })}
              </ul>
              {canEdit && (
                <div className="mt-3 border-t border-[var(--color-border)] pt-3">
                  <AddParticipant threadId={thread.id} candidates={candidates} />
                </div>
              )}
            </CardBody>
          </Card>

          {canEdit && hasUnread && (
            <form action={markThreadReadAction}>
              <input type="hidden" name="thread_id" value={thread.id} />
              <button
                type="submit"
                className="w-full rounded-md bg-[var(--color-muted)] px-3 py-1.5 text-xs font-medium hover:opacity-80"
              >
                Als gelesen markieren
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
