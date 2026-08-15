import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireTenantContext } from '@/lib/tenant/current';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getEffectivePermissions } from '@/lib/permissions/effective';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  ANNOUNCEMENT_STATUS_LABEL,
  ANNOUNCEMENT_STATUS_TONE,
  ANNOUNCEMENT_TARGET_LABEL,
  formatAnnouncementDate,
  isExpired,
} from '@/lib/schemas/announcements';
import {
  AcknowledgeButton,
  CloseButton,
  DeleteDraftButton,
  PublishButton,
} from '../announcement-actions';
import { unwrapMaybeRow, unwrapRows } from '@/lib/supabase/unwrap';

export const metadata: Metadata = { title: 'Ankündigung' };

export default async function AnnouncementDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await requireTenantContext();
  const supabase = await createSupabaseServerClient();
  const permissions = await getEffectivePermissions(ctx.userId, ctx.tenantId);

  const annRes = await supabase
    .from('announcements')
    .select(
      'id, title, body, status, target_type, target_role_key, target_user_ids, requires_acknowledgement, published_at, expires_at, created_by, created_at, updated_at',
    )
    .eq('id', id)
    .maybeSingle();
  const ann = unwrapMaybeRow(annRes, 'Ankuendigungen: announcements');
  if (!ann) notFound();

  const isAuthor = ann.created_by === ctx.userId;
  const canPublish = permissions.has('announcements.publish');
  const canClose = permissions.has('announcements.close') || canPublish;
  const canManage = isAuthor || canPublish;

  // Meine Quittung
  const myReceiptRes = await supabase
    .from('announcement_receipts')
    .select('read_at, acknowledged_at')
    .eq('announcement_id', ann.id)
    .eq('user_id', ctx.userId)
    .maybeSingle();
  const myReceipt = unwrapMaybeRow(myReceiptRes, 'Ankuendigungen: eigene Lesebestaetigung');

  // Als gelesen markieren (falls veröffentlicht und noch nicht gelesen und nicht mein eigener)
  if (ann.status === 'published' && !isAuthor && !myReceipt?.read_at) {
    await supabase.from('announcement_receipts').upsert(
      {
        announcement_id: ann.id,
        user_id: ctx.userId,
        read_at: new Date().toISOString(),
      },
      { onConflict: 'announcement_id,user_id', ignoreDuplicates: false },
    );
  }

  // Empfänger-Übersicht (für Ersteller/Publisher)
  let recipients: Array<{
    userId: string;
    name: string;
    read_at: string | null;
    acknowledged_at: string | null;
  }> = [];
  let totalRecipients = 0;

  if (canManage && ann.status !== 'draft') {
    // Ziel-User berechnen
    let targetUserIds: string[] = [];
    if (ann.target_type === 'users') {
      targetUserIds = ann.target_user_ids ?? [];
    } else if (ann.target_type === 'all') {
      const memsRes = await supabase
        .from('memberships')
        .select('user_id')
        .eq('tenant_id', ctx.tenantId)
        .eq('status', 'active');
      const mems = unwrapRows(memsRes, 'Ankuendigungen: memberships');
      targetUserIds = mems.map((m) => m.user_id);
    } else if (ann.target_type === 'role' && ann.target_role_key) {
      const roleRes = await supabase
        .from('roles')
        .select('id')
        .eq('tenant_id', ctx.tenantId)
        .eq('key', ann.target_role_key)
        .maybeSingle();
      const role = unwrapMaybeRow(roleRes, 'Ankuendigungen: Zielrolle der Ankuendigung');
      if (role) {
        const urRes = await supabase
          .from('user_roles')
          .select('user_id')
          .eq('role_id', role.id)
          .eq('tenant_id', ctx.tenantId);
        const ur = unwrapRows(urRes, 'Ankuendigungen: user_roles');
        targetUserIds = [...new Set(ur.map((r) => r.user_id))];
      }
    }
    totalRecipients = targetUserIds.length;

    if (targetUserIds.length > 0) {
      const [usersRes, receiptsRes] = await Promise.all([
        supabase.from('users').select('id, display_name').in('id', targetUserIds),
        supabase
          .from('announcement_receipts')
          .select('user_id, read_at, acknowledged_at')
          .eq('announcement_id', ann.id)
          .in('user_id', targetUserIds),
      ]);
      const users = unwrapRows(usersRes, 'Ankuendigungen: Namen der Empfaenger');
      const receipts = unwrapRows(receiptsRes, 'Ankuendigungen: Lesebestaetigungen der Empfaenger');
      const userById = new Map(users.map((u) => [u.id, u.display_name]));
      const receiptByUser = new Map(receipts.map((r) => [r.user_id, r]));
      recipients = targetUserIds.map((uid) => {
        const rec = receiptByUser.get(uid);
        return {
          userId: uid,
          name: userById.get(uid) ?? uid.slice(0, 8),
          read_at: rec?.read_at ?? null,
          acknowledged_at: rec?.acknowledged_at ?? null,
        };
      });
    }
  }

  // Author-Name
  const authorRes = ann.created_by
    ? await supabase.from('users').select('display_name').eq('id', ann.created_by).maybeSingle()
    : { data: null, error: null };
  const author = unwrapMaybeRow(authorRes, 'Ankuendigungen: Verfasser');
  const authorName = author?.display_name ?? '—';

  // Role name (falls Zielgruppe = role)
  let roleName: string | null = null;
  if (ann.target_type === 'role' && ann.target_role_key) {
    const rRes = await supabase
      .from('roles')
      .select('name')
      .eq('tenant_id', ctx.tenantId)
      .eq('key', ann.target_role_key)
      .maybeSingle();
    const r = unwrapMaybeRow(rRes, 'Ankuendigungen: Name der Zielrolle');
    roleName = r?.name ?? ann.target_role_key;
  }

  const expired = isExpired(ann.expires_at);
  const readCount = recipients.filter((r) => r.read_at).length;
  const ackCount = recipients.filter((r) => r.acknowledged_at).length;

  const targetLine =
    ann.target_type === 'role'
      ? `Rolle: ${roleName}`
      : ann.target_type === 'users'
        ? `${ann.target_user_ids?.length ?? 0} ausgewählte Personen`
        : 'Alle Mitarbeiter';

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <PageHeader
        title={ann.title}
        description={`${ANNOUNCEMENT_TARGET_LABEL[ann.target_type]} · Angelegt von ${authorName}`}
        action={
          <div className="flex flex-wrap items-center gap-2">
            {ann.status === 'draft' && isAuthor && (
              <Link
                href={`/announcements/${ann.id}/edit`}
                className="inline-flex h-9 items-center rounded-md border border-[var(--color-border)] px-3 text-sm font-medium hover:bg-[var(--color-muted)]"
              >
                Bearbeiten
              </Link>
            )}
            {ann.status === 'draft' && canPublish && <PublishButton id={ann.id} />}
            {ann.status === 'draft' && isAuthor && <DeleteDraftButton id={ann.id} />}
            {ann.status === 'published' && canClose && <CloseButton id={ann.id} />}
          </div>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <span>Text</span>
                <Badge tone={ANNOUNCEMENT_STATUS_TONE[ann.status]}>
                  {ANNOUNCEMENT_STATUS_LABEL[ann.status]}
                </Badge>
                {ann.requires_acknowledgement && <Badge tone="warning">quittungspflichtig</Badge>}
                {expired && <Badge tone="muted">abgelaufen</Badge>}
              </CardTitle>
            </CardHeader>
            <CardBody>
              <p className="whitespace-pre-line text-sm leading-relaxed">{ann.body}</p>
            </CardBody>
          </Card>

          {ann.status === 'published' && !isAuthor && (
            <Card>
              <CardHeader>
                <CardTitle>Ihre Quittung</CardTitle>
              </CardHeader>
              <CardBody>
                <div className="flex flex-col gap-3 text-sm">
                  <div className="flex items-center gap-2">
                    <span className="text-[var(--color-muted-foreground)]">Gelesen:</span>
                    <span>
                      {myReceipt?.read_at ? formatAnnouncementDate(myReceipt.read_at) : '—'}
                    </span>
                  </div>
                  {ann.requires_acknowledgement && (
                    <div className="flex items-center gap-3">
                      <span className="text-[var(--color-muted-foreground)]">Bestätigt:</span>
                      {myReceipt?.acknowledged_at ? (
                        <span>{formatAnnouncementDate(myReceipt.acknowledged_at)}</span>
                      ) : expired ? (
                        <span className="text-[var(--color-muted-foreground)]">
                          — Ankündigung ist abgelaufen —
                        </span>
                      ) : (
                        <AcknowledgeButton
                          id={ann.id}
                          alreadyAcknowledged={Boolean(myReceipt?.acknowledged_at)}
                        />
                      )}
                    </div>
                  )}
                </div>
              </CardBody>
            </Card>
          )}
        </div>

        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Übersicht</CardTitle>
            </CardHeader>
            <CardBody>
              <dl className="space-y-3 text-sm">
                <div>
                  <dt className="text-xs uppercase tracking-wide text-[var(--color-muted-foreground)]">
                    Zielgruppe
                  </dt>
                  <dd>{targetLine}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wide text-[var(--color-muted-foreground)]">
                    Veröffentlicht
                  </dt>
                  <dd>{ann.published_at ? formatAnnouncementDate(ann.published_at) : '—'}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wide text-[var(--color-muted-foreground)]">
                    Ablauf
                  </dt>
                  <dd>{ann.expires_at ? formatAnnouncementDate(ann.expires_at) : 'unbefristet'}</dd>
                </div>
              </dl>
            </CardBody>
          </Card>

          {canManage && ann.status !== 'draft' && (
            <Card>
              <CardHeader>
                <CardTitle>
                  Empfänger ({readCount}/{totalRecipients} gelesen
                  {ann.requires_acknowledgement && ` · ${ackCount}/${totalRecipients} bestätigt`})
                </CardTitle>
              </CardHeader>
              <CardBody>
                {recipients.length === 0 ? (
                  <p className="text-sm text-[var(--color-muted-foreground)]">
                    Keine Empfänger ermittelbar.
                  </p>
                ) : (
                  <ul className="flex flex-col gap-2 text-sm">
                    {recipients.map((r) => (
                      <li key={r.userId} className="flex items-center justify-between gap-2">
                        <span className="truncate">{r.name}</span>
                        <span className="flex items-center gap-1 text-xs text-[var(--color-muted-foreground)]">
                          {r.acknowledged_at ? (
                            <Badge tone="success">Bestätigt</Badge>
                          ) : r.read_at ? (
                            <Badge tone="primary">Gelesen</Badge>
                          ) : (
                            <Badge tone="muted">Ungelesen</Badge>
                          )}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardBody>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
