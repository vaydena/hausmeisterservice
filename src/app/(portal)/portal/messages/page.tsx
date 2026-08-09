import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
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

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">Nachrichten</h1>
        <p className="mt-1 text-sm text-[var(--color-muted-foreground)]">
          Direkter Kontakt mit Ihrer Hausverwaltung.
        </p>
      </div>

      {(threads ?? []).length === 0 ? (
        <p className="rounded-2xl border border-dashed border-[var(--color-border)] bg-[var(--color-background)] p-8 text-center text-sm text-[var(--color-muted-foreground)]">
          Sie haben noch keine Nachrichten. Ihre Hausverwaltung kann neue Konversationen mit Ihnen
          starten.
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-[var(--color-border)] overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)]">
          {(threads ?? []).map((t) => {
            const lastRead = readMap.get(t.id);
            const isUnread = !lastRead || (t.last_message_at && lastRead < t.last_message_at);
            return (
              <li key={t.id}>
                <Link
                  href={`/portal/messages/${t.id}`}
                  className="flex items-center justify-between gap-4 p-4 transition hover:bg-[var(--color-muted)]"
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
                    <p className="mt-0.5 text-xs text-[var(--color-muted-foreground)]">
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
