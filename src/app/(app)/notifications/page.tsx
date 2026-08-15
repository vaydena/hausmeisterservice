import type { Metadata } from 'next';
import Link from 'next/link';
import { requireTenantContext } from '@/lib/tenant/current';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardBody } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { Button } from '@/components/ui/button';
import {
  NOTIFICATION_KIND_LABEL,
  NOTIFICATION_KIND_TONE,
  formatRelativeGerman,
  notificationHref,
  type NotificationEntityType,
  type NotificationKind,
} from '@/lib/schemas/notifications';
import {
  dismissNotificationAction,
  markAllNotificationsReadAction,
  openNotificationAction,
} from './actions';
import { unwrapRowsWithCount } from '@/lib/supabase/unwrap';

export const metadata: Metadata = { title: 'Benachrichtigungen' };

const PAGE_SIZE = 50;

export default async function NotificationsPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string; page?: string }>;
}) {
  await requireTenantContext();
  const params = await searchParams;
  const onlyUnread = params.filter === 'unread';
  const page = Math.max(1, Number.parseInt(params.page ?? '1', 10) || 1);
  const offset = (page - 1) * PAGE_SIZE;

  const supabase = await createSupabaseServerClient();

  let query = supabase
    .from('notifications')
    .select('id, kind, subject, body, entity_type, entity_id, url, read_at, created_at', {
      count: 'exact',
    })
    .order('created_at', { ascending: false })
    .range(offset, offset + PAGE_SIZE - 1);
  if (onlyUnread) query = query.is('read_at', null);

  const dataRes = await query;
  const { rows: data, count: count } = unwrapRowsWithCount(dataRes, 'Benachrichtigungen');
  const items = data ?? [];
  const total = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const { count: unreadCount } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .is('read_at', null);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <PageHeader
        title="Benachrichtigungen"
        description={
          total === 0
            ? 'Keine Benachrichtigungen.'
            : `${total} Einträge · ${unreadCount ?? 0} ungelesen`
        }
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div
          role="tablist"
          className="inline-flex rounded-md border border-[var(--color-border)] p-0.5"
        >
          <TabLink label="Alle" href="/notifications" active={!onlyUnread} />
          <TabLink
            label={`Ungelesen${unreadCount ? ` (${unreadCount})` : ''}`}
            href="/notifications?filter=unread"
            active={onlyUnread}
          />
        </div>
        {(unreadCount ?? 0) > 0 && (
          <form action={markAllNotificationsReadAction}>
            <Button type="submit" variant="secondary" size="sm">
              Alle als gelesen markieren
            </Button>
          </form>
        )}
      </div>

      {items.length === 0 ? (
        <EmptyState
          title={
            onlyUnread ? 'Keine ungelesenen Benachrichtigungen.' : 'Noch keine Benachrichtigungen.'
          }
          description="Zuweisungen, Meldungen und Wartungserinnerungen erscheinen hier."
        />
      ) : (
        <Card>
          <CardBody className="!p-0">
            <ul className="divide-y divide-[var(--color-border)]">
              {items.map((n) => {
                const kind = n.kind as NotificationKind;
                const href = notificationHref(
                  (n.entity_type as NotificationEntityType | null) ?? null,
                  n.entity_id,
                  n.url,
                );
                const isUnread = n.read_at === null;
                return (
                  <li
                    key={n.id}
                    className={
                      'flex flex-col gap-2 p-4 sm:flex-row sm:items-start sm:justify-between ' +
                      (isUnread
                        ? 'bg-[color-mix(in_srgb,var(--color-primary)_5%,transparent)]'
                        : '')
                    }
                  >
                    <div className="flex-1 min-w-0">
                      <div className="mb-1 flex flex-wrap items-center gap-2">
                        <Badge tone={NOTIFICATION_KIND_TONE[kind] ?? 'neutral'}>
                          {NOTIFICATION_KIND_LABEL[kind] ?? kind}
                        </Badge>
                        {isUnread && (
                          <span
                            aria-hidden
                            className="size-2 rounded-full bg-[var(--color-primary)]"
                          />
                        )}
                        <span className="text-xs text-[var(--color-muted-foreground)]">
                          {formatRelativeGerman(n.created_at)}
                        </span>
                      </div>
                      <form action={openNotificationAction}>
                        <input type="hidden" name="notification_id" value={n.id} />
                        <button
                          type="submit"
                          className="text-left text-sm font-medium hover:underline"
                        >
                          {n.subject}
                        </button>
                      </form>
                      {n.body && (
                        <p className="mt-1 text-sm text-[var(--color-muted-foreground)]">
                          {n.body}
                        </p>
                      )}
                      <div className="mt-2 text-xs text-[var(--color-muted-foreground)]">
                        Ziel:{' '}
                        <Link href={href} className="text-[var(--color-primary)] hover:underline">
                          {href}
                        </Link>
                      </div>
                    </div>
                    <form action={dismissNotificationAction}>
                      <input type="hidden" name="notification_id" value={n.id} />
                      <Button type="submit" variant="ghost" size="sm">
                        Verwerfen
                      </Button>
                    </form>
                  </li>
                );
              })}
            </ul>
          </CardBody>
        </Card>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          {page > 1 ? (
            <Link
              href={`/notifications?${new URLSearchParams({
                ...(onlyUnread ? { filter: 'unread' } : {}),
                page: String(page - 1),
              }).toString()}`}
              className="text-[var(--color-primary)] hover:underline"
            >
              ← Neuere
            </Link>
          ) : (
            <span />
          )}
          <span className="text-[var(--color-muted-foreground)]">
            Seite {page} von {totalPages}
          </span>
          {page < totalPages ? (
            <Link
              href={`/notifications?${new URLSearchParams({
                ...(onlyUnread ? { filter: 'unread' } : {}),
                page: String(page + 1),
              }).toString()}`}
              className="text-[var(--color-primary)] hover:underline"
            >
              Ältere →
            </Link>
          ) : (
            <span />
          )}
        </div>
      )}
    </div>
  );
}

function TabLink({ label, href, active }: { label: string; href: string; active: boolean }) {
  return (
    <Link
      href={href}
      role="tab"
      aria-selected={active}
      className={
        'rounded px-3 py-1 text-sm ' +
        (active
          ? 'bg-[var(--color-muted)] font-medium text-[var(--color-foreground)]'
          : 'text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]')
      }
    >
      {label}
    </Link>
  );
}
