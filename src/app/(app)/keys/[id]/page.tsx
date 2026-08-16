import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requireTenantContext } from '@/lib/tenant/current';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { unwrapMaybeRow, unwrapRows } from '@/lib/supabase/unwrap';
import { getEffectivePermissions } from '@/lib/permissions/effective';
import { ModuleGate, ModuleLink } from '@/components/ui/module-link';
import { PageHeader } from '@/components/ui/page-header';
import { LinkButton } from '@/components/ui/button';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatDateTime } from '@/lib/utils/format';
import {
  HANDOVER_KIND_LABEL,
  HOLDER_KIND_LABEL,
  KIND_LABEL,
  STATUS_LABEL,
  STATUS_TONE,
  type HolderKind,
  type KeyKind,
  type KeyStatus,
} from '@/lib/schemas/keys';
import {
  CUSTODY_TONE,
  computeCustody,
  describeCustodyAge,
  describeReturnStatus,
} from '@/lib/keys/custody';
import { IssueForm, ReturnForm, KeyStatusChangeForms } from '../handover-forms';
import { softDeleteKeyAction } from '../actions';

export const metadata: Metadata = { title: 'Schlüssel' };

type HandoverRow = {
  id: string;
  kind: string;
  happened_at: string;
  expected_return_at: string | null;
  holder_kind: string | null;
  holder_user_id: string | null;
  holder_name: string | null;
  holder_contact: string | null;
  issue_handover_id: string | null;
  reference_work_order_id: string | null;
  copies_count: number;
  performed_by: string | null;
  note: string | null;
};

export default async function KeyDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await requireTenantContext();
  const supabase = await createSupabaseServerClient();
  const permissions = await getEffectivePermissions(ctx.userId, ctx.tenantId);

  const key = unwrapMaybeRow(
    await supabase
      .from('keys')
      .select(
        'id, code, label, identifier, kind, status, property_id, building_id, unit_id, copies_total, storage_location, notes, deleted_at, created_at, updated_at',
      )
      .eq('id', id)
      .maybeSingle(),
    'Schlüssel-Detail',
  );

  if (!key) notFound();

  // Sprint 110: Diese eine Abfrage traegt drei Entscheidungen auf dieser
  // Seite — ob "Aktuell sind keine Exemplare ausgegeben" dasteht, ob das
  // Ausgabe-Formular erscheint, und ob "Schluessel entfernen" freigegeben
  // wird (dessen eigener Hinweis lautet: "Nur moeglich, wenn keine
  // Exemplare ausgegeben sind"). Ein verschluckter Lesefehler machte
  // historyItems leer und oeffnete damit genau die Schranke, die auf dieser
  // Information sitzt.
  const [property, building, unit, historyItems] = await Promise.all([
    supabase
      .from('properties')
      .select('id, code, name')
      .eq('id', key.property_id)
      .maybeSingle()
      .then((r) => unwrapMaybeRow(r, 'Schlüssel: Objekt')),
    key.building_id
      ? supabase
          .from('buildings')
          .select('id, name')
          .eq('id', key.building_id)
          .maybeSingle()
          .then((r) => unwrapMaybeRow(r, 'Schlüssel: Gebäude'))
      : Promise.resolve(null),
    key.unit_id
      ? supabase
          .from('units')
          .select('id, code')
          .eq('id', key.unit_id)
          .maybeSingle()
          .then((r) => unwrapMaybeRow(r, 'Schlüssel: Einheit'))
      : Promise.resolve(null),
    supabase
      .from('key_handovers')
      .select(
        'id, kind, happened_at, expected_return_at, holder_kind, holder_user_id, holder_name, holder_contact, issue_handover_id, reference_work_order_id, copies_count, performed_by, note',
      )
      .eq('key_id', id)
      .order('happened_at', { ascending: false })
      .then((r) => unwrapRows<HandoverRow>(r, 'Schlüssel: Ausgabe-/Rückgabe-Historie')),
  ]);

  // Sprint 110: Der Bestand wird in Exemplaren gerechnet, nicht in
  // Vorgaengen. Die abgeloeste Fassung galt eine Ausgabe als erledigt,
  // sobald irgendein Rueckgabe-Vorgang auf sie verwies — bei einer
  // Teilrueckgabe verschwanden die restlichen Exemplare damit aus der
  // Anzeige UND aus dem Formular, das sie zurueckgenommen haette.
  const custody = computeCustody(historyItems, new Date());
  const handoverById = new Map(historyItems.map((h) => [h.id, h]));
  const totalOut = custody.outstandingCopies;
  // Nie negativ: bei einer Nachfertigung, die copies_total nicht erhoeht hat
  // (siehe recordKeyReplacedAction), koennen mehr Exemplare draussen sein
  // als der Stamm kennt.
  const totalAvailable = Math.max(0, key.copies_total - totalOut);

  // User-Namen auflösen
  const userIds = [
    ...historyItems.map((h) => h.holder_user_id),
    ...historyItems.map((h) => h.performed_by),
  ].filter((v): v is string => Boolean(v));
  const uniqueUserIds = [...new Set(userIds)];
  const users =
    uniqueUserIds.length > 0
      ? unwrapRows(
          await supabase.from('users').select('id, display_name').in('id', uniqueUserIds),
          'Schlüssel: Namen der Beteiligten',
        )
      : [];
  const displayById = new Map(users.map((u) => [u.id, u.display_name]));

  // Mitarbeiter-User-Liste für Ausgabe-Form
  const employees = unwrapRows(
    await supabase.from('employees').select('user_id, users(id, display_name)').is('deleted_at', null),
    'Schlüssel: Mitarbeiterliste für die Ausgabe',
  );
  const employeeUsers: { id: string; display_name: string | null }[] = employees
    .map((e) => {
      const u = Array.isArray(e.users) ? e.users[0] : e.users;
      return u ? { id: u.id as string, display_name: (u.display_name as string | null) ?? null } : null;
    })
    .filter((v): v is { id: string; display_name: string | null } => v !== null);

  const canEdit = permissions.has('keys.edit');
  const canAssign = permissions.has('keys.assign');
  const canDelete = permissions.has('keys.edit'); // Soft-Delete = Edit
  const isRetired = key.status === 'retired';
  const isLost = key.status === 'lost';

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <PageHeader
        title={key.label}
        description={key.code ?? undefined}
        action={
          <div className="flex gap-2">
            <ModuleGate href={`/qr/key/${key.id}`}>
              <LinkButton variant="outline" href={`/qr/key/${key.id}`}>
                QR-Code
              </LinkButton>
            </ModuleGate>
            {canEdit && !key.deleted_at && (
              <LinkButton variant="outline" href={`/keys/${key.id}/edit`}>
                Bearbeiten
              </LinkButton>
            )}
          </div>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={STATUS_TONE[key.status as KeyStatus] ?? 'neutral'}>
          {STATUS_LABEL[key.status as KeyStatus] ?? key.status}
        </Badge>
        <Badge tone="muted">{KIND_LABEL[key.kind as KeyKind] ?? key.kind}</Badge>
        {key.identifier && (
          <span className="text-xs text-[var(--color-muted-foreground)]">
            #{key.identifier}
          </span>
        )}
        <span className="text-xs text-[var(--color-muted-foreground)]">
          {totalAvailable}/{key.copies_total} im Bestand
          {totalOut > 0 && ` · ${totalOut} ausgegeben`}
        </span>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-6 lg:col-span-2">
          {key.notes && (
            <Card>
              <CardHeader>
                <CardTitle>Notizen</CardTitle>
              </CardHeader>
              <CardBody>
                <p className="whitespace-pre-line text-sm">{key.notes}</p>
              </CardBody>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Aktuelle Ausgaben ({custody.openIssues.length})</CardTitle>
            </CardHeader>
            <CardBody>
              {custody.openIssues.length === 0 ? (
                <p className="text-sm text-[var(--color-muted-foreground)]">
                  Aktuell sind keine Exemplare ausgegeben.
                </p>
              ) : (
                <ul className="flex flex-col gap-4">
                  {custody.openIssues.map((open) => {
                    const h = handoverById.get(open.issueId);
                    if (!h) return null;
                    const returnStatus = describeReturnStatus(open);
                    return (
                      <li
                        key={open.issueId}
                        className="flex flex-col gap-2 rounded-md border border-[var(--color-border)] p-3"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex flex-col gap-0.5">
                            <span className="text-sm font-medium">
                              {holderLabel(h, displayById)}
                            </span>
                            <span className="text-xs text-[var(--color-muted-foreground)]">
                              {describeCustodyAge(open)} · ausgegeben am{' '}
                              {formatDateTime(h.happened_at)}
                              {h.expected_return_at &&
                                ` · Rückgabe bis ${formatDateTime(h.expected_return_at)}`}
                            </span>
                          </div>
                          {returnStatus && (
                            <Badge tone={CUSTODY_TONE[open.status]}>{returnStatus}</Badge>
                          )}
                        </div>
                        {h.note && (
                          <p className="text-xs text-[var(--color-muted-foreground)]">{h.note}</p>
                        )}
                        {/*
                          Sprint 110: maxCopies kommt aus outstandingCopies, nicht
                          mehr aus copies_count. Vorher verschwand dieses Formular
                          nach der ersten Teilrueckgabe komplett — die restlichen
                          Exemplare waren im System nicht mehr zurueckzugeben.
                        */}
                        {canAssign && (
                          <ReturnForm
                            issueHandoverId={open.issueId}
                            maxCopies={open.outstandingCopies}
                          />
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardBody>
          </Card>

          {canAssign && !isRetired && totalAvailable > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Neu ausgeben</CardTitle>
              </CardHeader>
              <IssueForm keyId={key.id} users={employeeUsers} />
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Historie ({historyItems.length})</CardTitle>
            </CardHeader>
            <CardBody>
              {historyItems.length === 0 ? (
                <p className="text-sm text-[var(--color-muted-foreground)]">
                  Noch keine Vorgänge protokolliert.
                </p>
              ) : (
                <ul className="divide-y divide-[var(--color-border)]">
                  {historyItems.map((h) => (
                    <li key={h.id} className="flex flex-col gap-1 py-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge tone={handoverTone(h.kind)}>
                          {HANDOVER_KIND_LABEL[
                            h.kind as keyof typeof HANDOVER_KIND_LABEL
                          ] ?? h.kind}
                        </Badge>
                        <span className="text-sm">
                          {h.copies_count} × · {formatDateTime(h.happened_at)}
                        </span>
                        {(h.kind === 'issue' || h.kind === 'return') && (
                          <span className="text-xs text-[var(--color-muted-foreground)]">
                            {holderLabel(h, displayById)}
                          </span>
                        )}
                      </div>
                      {h.note && (
                        <p className="text-xs text-[var(--color-muted-foreground)]">{h.note}</p>
                      )}
                      {h.performed_by && (
                        <p className="text-xs text-[var(--color-muted-foreground)]">
                          Erfasst durch {displayById.get(h.performed_by) ?? '(System)'}
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>
        </div>

        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Zuordnung</CardTitle>
            </CardHeader>
            <CardBody>
              <dl className="grid grid-cols-1 gap-2 text-sm">
                <div className="flex justify-between gap-4">
                  <dt className="text-[var(--color-muted-foreground)]">Objekt</dt>
                  <dd>
                    {property ? (
                      <ModuleLink
                        href={`/properties/${property.id}`}
                        className="text-[var(--color-primary)] hover:underline"
                      >
                        {property.code ? `${property.code} · ${property.name}` : property.name}
                      </ModuleLink>
                    ) : (
                      '–'
                    )}
                  </dd>
                </div>
                {building && (
                  <div className="flex justify-between gap-4">
                    <dt className="text-[var(--color-muted-foreground)]">Gebäude</dt>
                    <dd>{building.name}</dd>
                  </div>
                )}
                {unit && (
                  <div className="flex justify-between gap-4">
                    <dt className="text-[var(--color-muted-foreground)]">Einheit</dt>
                    <dd>{unit.code}</dd>
                  </div>
                )}
                {key.storage_location && (
                  <div className="flex justify-between gap-4">
                    <dt className="text-[var(--color-muted-foreground)]">Aufbewahrung</dt>
                    <dd className="text-right">{key.storage_location}</dd>
                  </div>
                )}
              </dl>
            </CardBody>
          </Card>

          {canAssign && !isRetired && (
            <Card>
              <CardHeader>
                <CardTitle>Verwaltung</CardTitle>
              </CardHeader>
              <CardBody>
                <KeyStatusChangeForms keyId={key.id} />
              </CardBody>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Metadaten</CardTitle>
            </CardHeader>
            <CardBody>
              <dl className="grid grid-cols-1 gap-2 text-sm">
                <div className="flex justify-between gap-4">
                  <dt className="text-[var(--color-muted-foreground)]">Angelegt</dt>
                  <dd>{formatDateTime(key.created_at)}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-[var(--color-muted-foreground)]">Zuletzt geändert</dt>
                  <dd>{formatDateTime(key.updated_at)}</dd>
                </div>
              </dl>
            </CardBody>
          </Card>

          {canDelete && !key.deleted_at && totalOut === 0 && !isLost && (
            <Card>
              <CardBody>
                <details className="rounded-md">
                  <summary className="cursor-pointer text-sm text-[var(--color-destructive)]">
                    Schlüssel entfernen
                  </summary>
                  <form action={softDeleteKeyAction} className="mt-2 flex flex-col gap-2">
                    <p className="text-xs text-[var(--color-muted-foreground)]">
                      Nur möglich, wenn keine Exemplare ausgegeben sind.
                    </p>
                    <input type="hidden" name="key_id" value={key.id} />
                    <button
                      type="submit"
                      className="inline-flex h-8 items-center justify-center rounded-md bg-[var(--color-destructive)] px-3 text-xs font-medium text-white hover:opacity-90"
                    >
                      Endgültig entfernen
                    </button>
                  </form>
                </details>
              </CardBody>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function holderLabel(h: HandoverRow, displayById: Map<string, string | null>): string {
  const roleLabel = h.holder_kind
    ? HOLDER_KIND_LABEL[h.holder_kind as HolderKind] ?? h.holder_kind
    : '';
  const name = h.holder_user_id
    ? displayById.get(h.holder_user_id) ?? '(Benutzer)'
    : h.holder_name ?? '(unbekannt)';
  return roleLabel ? `${roleLabel}: ${name}` : name;
}

function handoverTone(kind: string): 'primary' | 'success' | 'warning' | 'danger' | 'muted' | 'neutral' {
  switch (kind) {
    case 'issue':
      return 'warning';
    case 'return':
      return 'success';
    case 'lost':
      return 'danger';
    case 'retired':
      return 'muted';
    case 'replaced':
      return 'primary';
    default:
      return 'neutral';
  }
}
