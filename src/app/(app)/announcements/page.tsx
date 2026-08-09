import type { Metadata } from 'next';
import Link from 'next/link';
import { requireTenantContext } from '@/lib/tenant/current';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getEffectivePermissions } from '@/lib/permissions/effective';
import { PageHeader } from '@/components/ui/page-header';
import { LinkButton } from '@/components/ui/button';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Badge } from '@/components/ui/badge';
import {
  ANNOUNCEMENT_STATUS_LABEL,
  ANNOUNCEMENT_STATUS_TONE,
  ANNOUNCEMENT_TARGET_LABEL,
  formatAnnouncementDate,
  isExpired,
} from '@/lib/schemas/announcements';

export const metadata: Metadata = { title: 'Ankündigungen' };

export default async function AnnouncementsPage() {
  const ctx = await requireTenantContext();
  const supabase = await createSupabaseServerClient();
  const permissions = await getEffectivePermissions(ctx.userId, ctx.tenantId);

  // RLS filtert bereits: nur veröffentlichte, bei denen ich Empfänger bin, plus eigene Drafts + alles mit publish-Permission
  const { data: allAnnouncements } = await supabase
    .from('announcements')
    .select(
      'id, title, status, target_type, target_role_key, target_user_ids, requires_acknowledgement, published_at, expires_at, created_by, created_at',
    )
    .order('published_at', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false });

  const rows = allAnnouncements ?? [];
  const ids = rows.map((r) => r.id);
  const authorIds = [
    ...new Set(rows.map((r) => r.created_by).filter((v): v is string => Boolean(v))),
  ];

  const [{ data: myReceipts }, { data: authors }] = await Promise.all([
    ids.length > 0
      ? supabase
          .from('announcement_receipts')
          .select('announcement_id, read_at, acknowledged_at')
          .eq('user_id', ctx.userId)
          .in('announcement_id', ids)
      : Promise.resolve({ data: [] as { announcement_id: string; read_at: string | null; acknowledged_at: string | null }[] }),
    authorIds.length > 0
      ? supabase.from('users').select('id, display_name').in('id', authorIds)
      : Promise.resolve({ data: [] as { id: string; display_name: string | null }[] }),
  ]);

  const receiptByAnn = new Map((myReceipts ?? []).map((r) => [r.announcement_id, r]));
  const authorById = new Map((authors ?? []).map((u) => [u.id, u.display_name]));

  const canCreate = permissions.has('announcements.create');
  const canPublish = permissions.has('announcements.publish');

  const published = rows.filter((r) => r.status === 'published');
  const drafts = rows.filter((r) => r.status === 'draft');
  const closed = rows.filter((r) => r.status === 'closed');

  const unreadCount = published.filter((r) => {
    if (r.created_by === ctx.userId) return false;
    const receipt = receiptByAnn.get(r.id);
    return !receipt?.read_at;
  }).length;

  const pendingAckCount = published.filter((r) => {
    if (!r.requires_acknowledgement || r.created_by === ctx.userId) return false;
    const receipt = receiptByAnn.get(r.id);
    return !receipt?.acknowledged_at && !isExpired(r.expires_at);
  }).length;

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <PageHeader
        title="Ankündigungen"
        description={
          rows.length === 0
            ? 'Keine Ankündigungen.'
            : `${published.length} veröffentlicht${
                unreadCount > 0 ? ` · ${unreadCount} ungelesen` : ''
              }${pendingAckCount > 0 ? ` · ${pendingAckCount} zu bestätigen` : ''}`
        }
        action={canCreate ? <LinkButton href="/announcements/new">Neue Ankündigung</LinkButton> : undefined}
      />

      {rows.length === 0 && (
        <EmptyState
          title="Noch keine Ankündigungen"
          description="Legen Sie eine neue Ankündigung an, um Ihr Team zu informieren."
          action={canCreate ? <LinkButton href="/announcements/new">Neue Ankündigung</LinkButton> : undefined}
        />
      )}

      {published.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Veröffentlicht ({published.length})</CardTitle>
          </CardHeader>
          <CardBody>
            <ul className="divide-y divide-[var(--color-border)]">
              {published.map((a) => {
                const receipt = receiptByAnn.get(a.id);
                const mine = a.created_by === ctx.userId;
                const unread = !mine && !receipt?.read_at;
                const needsAck =
                  a.requires_acknowledgement && !mine && !receipt?.acknowledged_at && !isExpired(a.expires_at);
                const expired = isExpired(a.expires_at);
                return (
                  <li key={a.id}>
                    <Link
                      href={`/announcements/${a.id}`}
                      className="flex flex-col gap-1 py-3 transition hover:bg-[var(--color-muted)]"
                    >
                      <div className="flex items-center gap-2">
                        <span
                          className={`truncate ${unread ? 'font-semibold' : 'font-medium'}`}
                        >
                          {a.title}
                        </span>
                        {unread && <Badge tone="primary">neu</Badge>}
                        {needsAck && <Badge tone="warning">bestätigen</Badge>}
                        {expired && <Badge tone="muted">abgelaufen</Badge>}
                      </div>
                      <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--color-muted-foreground)]">
                        <span>{ANNOUNCEMENT_TARGET_LABEL[a.target_type]}</span>
                        <span>·</span>
                        <span>{authorById.get(a.created_by ?? '') ?? '—'}</span>
                        <span>·</span>
                        <span>{formatAnnouncementDate(a.published_at)}</span>
                        {a.expires_at && !expired && (
                          <>
                            <span>·</span>
                            <span>läuft ab {formatAnnouncementDate(a.expires_at)}</span>
                          </>
                        )}
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </CardBody>
        </Card>
      )}

      {(canCreate || canPublish) && drafts.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Entwürfe ({drafts.length})</CardTitle>
          </CardHeader>
          <CardBody>
            <ul className="divide-y divide-[var(--color-border)]">
              {drafts.map((a) => (
                <li key={a.id}>
                  <Link
                    href={`/announcements/${a.id}`}
                    className="flex flex-col gap-1 py-3 transition hover:bg-[var(--color-muted)]"
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{a.title}</span>
                      <Badge tone={ANNOUNCEMENT_STATUS_TONE.draft}>
                        {ANNOUNCEMENT_STATUS_LABEL.draft}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-[var(--color-muted-foreground)]">
                      <span>{ANNOUNCEMENT_TARGET_LABEL[a.target_type]}</span>
                      <span>·</span>
                      <span>Angelegt {formatAnnouncementDate(a.created_at)}</span>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      )}

      {closed.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Geschlossen ({closed.length})</CardTitle>
          </CardHeader>
          <CardBody>
            <ul className="divide-y divide-[var(--color-border)]">
              {closed.map((a) => (
                <li key={a.id}>
                  <Link
                    href={`/announcements/${a.id}`}
                    className="flex items-center justify-between py-2 text-sm text-[var(--color-muted-foreground)] transition hover:bg-[var(--color-muted)]"
                  >
                    <span className="truncate">{a.title}</span>
                    <span className="text-xs">{formatAnnouncementDate(a.published_at)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      )}
    </div>
  );
}
