import type { Metadata } from 'next';
import Link from 'next/link';
import { requireTenantContext } from '@/lib/tenant/current';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { unwrapRows } from '@/lib/supabase/unwrap';
import { getEffectivePermissions } from '@/lib/permissions/effective';
import { PageHeader } from '@/components/ui/page-header';
import { LinkButton } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Badge } from '@/components/ui/badge';
import { KIND_LABEL, STATUS_LABEL, STATUS_TONE, type KeyKind, type KeyStatus } from '@/lib/schemas/keys';
import {
  CUSTODY_TONE,
  EMPTY_CUSTODY,
  custodyByKey,
  describeCustodyTally,
  describeOverdueReturns,
  describeReturnStatus,
  describeUnmonitoredCustody,
  tallyCustody,
  worstCustodyStatus,
} from '@/lib/keys/custody';

export const metadata: Metadata = { title: 'Schlüssel' };

export default async function KeysPage({
  searchParams,
}: {
  searchParams: Promise<{ property_id?: string; status?: string }>;
}) {
  const params = await searchParams;
  const ctx = await requireTenantContext();
  const supabase = await createSupabaseServerClient();
  const permissions = await getEffectivePermissions(ctx.userId, ctx.tenantId);

  const propertiesForFilter = unwrapRows(
    await supabase.from('properties').select('id, name').is('deleted_at', null).order('name'),
    'Schlüssel: Objektfilter',
  );

  let query = supabase
    .from('keys')
    .select('id, code, label, identifier, kind, status, property_id, copies_total, storage_location')
    .is('deleted_at', null)
    .order('label', { ascending: true });

  if (params.property_id) query = query.eq('property_id', params.property_id);
  if (params.status) query = query.eq('status', params.status);

  const items = unwrapRows(await query, 'Schlüsselstamm');

  // Sprint 110: Der ausgegebene Bestand stand vorher in ZWEI Abfragen ohne
  // Fehlerpruefung — Ausgaben und Rueckgaben getrennt. Die kippen in
  // entgegengesetzte Richtungen: faellt die Ausgaben-Abfrage aus, sieht
  // jeder Schluessel vollzaehlig im Kasten aus; faellt die Rueckgaben-
  // Abfrage aus, gilt jede jemals erfolgte Ausgabe wieder als offen. Da
  // keys.status ein Lebenszyklus-Status ist ('active'/'lost'/'retired') und
  // nicht "ausgegeben", ist diese Aggregation die EINZIGE Quelle fuer die
  // Frage, wer gerade einen Schluessel haelt — ein Fehler faellt an keiner
  // zweiten Stelle auf. Jetzt eine Abfrage, ein Fehlerpfad.
  const keyIds = items.map((k) => k.id);
  const handovers =
    keyIds.length > 0
      ? unwrapRows(
          await supabase
            .from('key_handovers')
            .select(
              'id, key_id, kind, copies_count, issue_handover_id, happened_at, expected_return_at, holder_kind',
            )
            .in('key_id', keyIds)
            .in('kind', ['issue', 'return']),
          'Schlüssel: Ausgaben und Rückgaben',
        )
      : [];

  const now = new Date();
  const custodyById = custodyByKey(handovers, now);

  const propertyIds = [...new Set(items.map((k) => k.property_id))];
  const props =
    propertyIds.length > 0
      ? unwrapRows(
          await supabase.from('properties').select('id, name, code').in('id', propertyIds),
          'Schlüssel: Objektnamen',
        )
      : [];
  const propertyById = new Map(props.map((p) => [p.id, p]));

  const canCreate = permissions.has('keys.create');

  const tally = tallyCustody(
    items.map((k) => ({ label: k.label, custody: custodyById.get(k.id) ?? EMPTY_CUSTODY })),
  );
  const custodyNote = describeCustodyTally(tally);
  const overdueNote = describeOverdueReturns(tally);
  const unmonitoredNote = describeUnmonitoredCustody(tally);

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <PageHeader
        title="Schlüssel"
        description={
          custodyNote
            ? `Schlüsselstamm und Ausgabe-/Rückgabe-Historie pro Objekt · ${custodyNote}`
            : 'Schlüsselstamm und Ausgabe-/Rückgabe-Historie pro Objekt.'
        }
        action={
          <div className="flex flex-wrap items-center gap-2">
            {items.length > 0 && (
              <Link
                href={`/qr/print?type=key&ids=${items.slice(0, 60).map((k) => k.id).join(',')}`}
                target="_blank"
                className="inline-flex h-9 items-center rounded-md border border-[var(--color-border)] px-3 text-sm font-medium hover:bg-[var(--color-muted)]"
              >
                QR-Sammel-Druck ({Math.min(items.length, 60)})
              </Link>
            )}
            {canCreate && <LinkButton href="/keys/new">Neuer Schlüssel</LinkButton>}
          </div>
        }
      />

      {propertiesForFilter.length > 0 && (
        <PropertyFilter
          properties={propertiesForFilter}
          currentPropertyId={params.property_id}
          currentStatus={params.status}
        />
      )}

      {/*
        Sprint 110: Ein ueberschrittener Rueckgabetermin faellt sonst nur
        auf, wenn jemand den einzelnen Schluessel oeffnet. Die Liste sortiert
        nach Bezeichnung, nicht nach Faelligkeit.
      */}
      {overdueNote && (
        <div
          className="rounded-lg border border-[var(--color-destructive)]/40 bg-[var(--color-destructive)]/10 p-4 text-sm"
          role="status"
        >
          <p className="font-medium">Überfällige Rückgaben</p>
          <p className="mt-1 text-[var(--color-muted-foreground)]">{overdueNote}</p>
        </div>
      )}

      {/*
        Getrennt vom Panel darueber, weil es der gefaehrlichere Fall ist: eine
        Ausgabe ohne Rueckgabedatum wird nie ueberfaellig und kann deshalb
        auch nie im Panel darueber auftauchen.
      */}
      {unmonitoredNote && (
        <div
          className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 text-sm"
          role="status"
        >
          <p className="font-medium">Ausgaben ohne Rückgabedatum</p>
          <p className="mt-1 text-[var(--color-muted-foreground)]">{unmonitoredNote}</p>
        </div>
      )}

      {items.length === 0 ? (
        <EmptyState
          title="Keine Schlüssel"
          description="Legen Sie den ersten Schlüssel an, um Ausgabe und Rückgabe zu protokollieren."
          action={canCreate ? <LinkButton href="/keys/new">Ersten Schlüssel anlegen</LinkButton> : undefined}
        />
      ) : (
        <Card>
          <ul className="divide-y divide-[var(--color-border)]">
            {items.map((k) => {
              const property = propertyById.get(k.property_id);
              const custody = custodyById.get(k.id) ?? EMPTY_CUSTODY;
              const openOut = custody.outstandingCopies;
              const worst = worstCustodyStatus(custody);
              // Kein Satz aus describeReturnStatus fuer 'open': das Datum
              // steht auf der Detailseite, hier waere es Rauschen.
              const custodyHint =
                worst && worst !== 'open' && worst !== 'standing'
                  ? describeReturnStatus(
                      custody.openIssues.find((i) => i.status === worst) ?? custody.openIssues[0]!,
                    )
                  : null;
              return (
                <li key={k.id}>
                  <Link
                    href={`/keys/${k.id}`}
                    className="flex flex-col gap-2 p-4 transition hover:bg-[var(--color-muted)] sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="flex min-w-0 flex-1 flex-col gap-1">
                      <div className="flex flex-wrap items-center gap-2">
                        {k.code && <Badge tone="muted">{k.code}</Badge>}
                        <span className="truncate font-medium">{k.label}</span>
                        {k.identifier && (
                          <span className="text-xs text-[var(--color-muted-foreground)]">
                            #{k.identifier}
                          </span>
                        )}
                      </div>
                      <span className="truncate text-xs text-[var(--color-muted-foreground)]">
                        {property
                          ? `${property.code ? property.code + ' · ' : ''}${property.name}`
                          : 'Objekt entfernt'}
                        {' · '}
                        {KIND_LABEL[k.kind as KeyKind] ?? k.kind}
                        {k.storage_location ? ` · ${k.storage_location}` : ''}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs text-[var(--color-muted-foreground)]">
                        {Math.max(0, k.copies_total - openOut)}/{k.copies_total} im Bestand
                      </span>
                      {openOut > 0 && (
                        <Badge tone={worst ? CUSTODY_TONE[worst] : 'warning'}>
                          {openOut} ausgegeben
                          {custodyHint ? ` · ${custodyHint}` : ''}
                        </Badge>
                      )}
                      <Badge tone={STATUS_TONE[k.status as KeyStatus] ?? 'neutral'}>
                        {STATUS_LABEL[k.status as KeyStatus] ?? k.status}
                      </Badge>
                    </div>
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

function PropertyFilter({
  properties,
  currentPropertyId,
  currentStatus,
}: {
  properties: { id: string; name: string }[];
  currentPropertyId?: string;
  currentStatus?: string;
}) {
  return (
    <form action="/keys" method="get" className="flex flex-wrap items-center gap-2 text-sm">
      <label htmlFor="property_id" className="text-[var(--color-muted-foreground)]">
        Objekt:
      </label>
      <select
        id="property_id"
        name="property_id"
        defaultValue={currentPropertyId ?? ''}
        className="rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-1.5 text-sm"
      >
        <option value="">Alle</option>
        {properties.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
      <label htmlFor="status" className="text-[var(--color-muted-foreground)]">
        Status:
      </label>
      <select
        id="status"
        name="status"
        defaultValue={currentStatus ?? ''}
        className="rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-1.5 text-sm"
      >
        <option value="">Alle</option>
        <option value="active">Aktiv</option>
        <option value="lost">Verloren</option>
        <option value="retired">Ausgemustert</option>
      </select>
      <button
        type="submit"
        className="inline-flex h-8 items-center rounded-md bg-[var(--color-muted)] px-3 text-xs font-medium hover:opacity-80"
      >
        Anwenden
      </button>
      {(currentPropertyId || currentStatus) && (
        <Link href="/keys" className="text-xs text-[var(--color-muted-foreground)] underline">
          Zurücksetzen
        </Link>
      )}
    </form>
  );
}
