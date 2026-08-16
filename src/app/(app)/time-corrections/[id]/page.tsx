import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { requireTenantContext } from '@/lib/tenant/current';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { unwrapRows, unwrapMaybeRow } from '@/lib/supabase/unwrap';
import { getEffectivePermissions } from '@/lib/permissions/effective';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  CORRECTION_STATUS_LABEL,
  CORRECTION_STATUS_TONE,
  type CorrectionStatus,
} from '@/lib/schemas/time-corrections';
import { ENTRY_KIND_LABEL } from '@/lib/schemas/time-tracking';
import { DecideForm } from './decide-form';
import { WithdrawForm } from './withdraw-form';
import { formatDateTime } from '@/lib/utils/format';

export const metadata: Metadata = { title: 'Korrekturantrag' };

// Sprint 113: Hier stehen beantragte und erfasste Zeit nebeneinander, und
// genehmigt wird auf dieser Seite Arbeitszeit. Ohne `timeZone` war das die
// Zone des Servers — auf einem in UTC also zwei Stunden neben dem, was der
// Antragsteller im Formular eingetragen hat.
function fmtDateTime(iso: string | null): string {
  if (!iso) return '—';
  return formatDateTime(iso);
}

function labelValue(id: string | null, map: Map<string, string>): string {
  if (id === null) return '—';
  return map.get(id) ?? '(unbekannt)';
}

function labelKind(kind: string | null): string {
  if (kind === null) return '—';
  return ENTRY_KIND_LABEL[kind as keyof typeof ENTRY_KIND_LABEL] ?? kind;
}

export default async function CorrectionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await requireTenantContext();
  const permissions = await getEffectivePermissions(ctx.userId, ctx.tenantId);
  if (!permissions.has('time_tracking.view')) redirect('/dashboard');

  const supabase = await createSupabaseServerClient();
  const corr = unwrapMaybeRow(
    await supabase
      .from('time_entry_corrections')
      .select(
        'id, tenant_id, time_entry_id, entry_user_id, requested_by, requested_at, reason, status, decided_by, decided_at, decision_note, proposed_kind, proposed_start_at, proposed_end_at, proposed_work_order_id, proposed_property_id, proposed_note',
      )
      .eq('id', id)
      .maybeSingle(),
    'Korrekturantrag',
  );

  if (!corr) notFound();

  // Sprint 108: Die Tabelle unten stellt "Aktuell" gegen "Vorschlag". Fiel
  // diese Query aus, stand in der ganzen Aktuell-Spalte "—" — und der
  // Freigeber haette einer Aenderung zugestimmt, ohne zu sehen, was er
  // aendert.
  const entry = unwrapMaybeRow(
    await supabase
      .from('time_entries')
      .select('id, kind, start_at, end_at, work_order_id, property_id, note')
      .eq('id', corr.time_entry_id)
      .maybeSingle(),
    'Korrekturantrag: betroffener Zeiteintrag',
  );

  const proposedWorkOrderIds = [corr.proposed_work_order_id, entry?.work_order_id].filter(
    (v): v is string => !!v,
  );
  const proposedPropertyIds = [corr.proposed_property_id, entry?.property_id].filter(
    (v): v is string => !!v,
  );

  const [works, props, users] = await Promise.all([
    proposedWorkOrderIds.length > 0
      ? supabase
          .from('work_orders')
          .select('id, code, title')
          .in('id', proposedWorkOrderIds)
          .then((r) => unwrapRows(r, 'Korrekturantrag: Auftragsnamen'))
      : Promise.resolve([] as { id: string; code: string | null; title: string }[]),
    proposedPropertyIds.length > 0
      ? supabase
          .from('properties')
          .select('id, code, name')
          .in('id', proposedPropertyIds)
          .then((r) => unwrapRows(r, 'Korrekturantrag: Objektnamen'))
      : Promise.resolve([] as { id: string; code: string | null; name: string }[]),
    supabase
      .from('users')
      .select('id, display_name')
      .in(
        'id',
        [corr.requested_by, corr.entry_user_id, corr.decided_by].filter(
          (v): v is string => !!v,
        ),
      )
      .then((r) => unwrapRows(r, 'Korrekturantrag: Anzeigenamen')),
  ]);

  const woMap = new Map(works.map((w) => [w.id, w.code ? `${w.code} · ${w.title}` : w.title]));
  const propMap = new Map(props.map((p) => [p.id, p.code ? `${p.code} · ${p.name}` : p.name]));
  const nameByUserId = new Map(users.map((u) => [u.id, u.display_name]));

  const status = corr.status as CorrectionStatus;
  const canApprove =
    permissions.has('time_tracking.approve') &&
    status === 'pending' &&
    corr.requested_by !== ctx.userId;
  const canWithdraw = corr.requested_by === ctx.userId && status === 'pending';

  const currentValues = {
    kind: entry ? labelKind(entry.kind) : '—',
    start_at: entry ? fmtDateTime(entry.start_at) : '—',
    end_at: entry ? fmtDateTime(entry.end_at) : '—',
    work_order: entry ? labelValue(entry.work_order_id, woMap) : '—',
    property: entry ? labelValue(entry.property_id, propMap) : '—',
    note: entry?.note ?? '—',
  };
  const proposedValues = {
    kind: corr.proposed_kind !== null ? labelKind(corr.proposed_kind) : '—',
    start_at: corr.proposed_start_at !== null ? fmtDateTime(corr.proposed_start_at) : '—',
    end_at: corr.proposed_end_at !== null ? fmtDateTime(corr.proposed_end_at) : '—',
    work_order:
      corr.proposed_work_order_id !== null ? labelValue(corr.proposed_work_order_id, woMap) : '—',
    property:
      corr.proposed_property_id !== null ? labelValue(corr.proposed_property_id, propMap) : '—',
    note: corr.proposed_note ?? '—',
  };
  const rows: Array<{ label: string; current: string; proposed: string; changed: boolean }> = [
    {
      label: 'Art',
      current: currentValues.kind,
      proposed: proposedValues.kind,
      changed: corr.proposed_kind !== null,
    },
    {
      label: 'Beginn',
      current: currentValues.start_at,
      proposed: proposedValues.start_at,
      changed: corr.proposed_start_at !== null,
    },
    {
      label: 'Ende',
      current: currentValues.end_at,
      proposed: proposedValues.end_at,
      changed: corr.proposed_end_at !== null,
    },
    {
      label: 'Objekt',
      current: currentValues.property,
      proposed: proposedValues.property,
      changed: corr.proposed_property_id !== null,
    },
    {
      label: 'Auftrag',
      current: currentValues.work_order,
      proposed: proposedValues.work_order,
      changed: corr.proposed_work_order_id !== null,
    },
    {
      label: 'Notiz',
      current: currentValues.note,
      proposed: proposedValues.note,
      changed: corr.proposed_note !== null,
    },
  ];

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <PageHeader
        title="Korrekturantrag"
        description={`beantragt am ${fmtDateTime(corr.requested_at)} von ${nameByUserId.get(corr.requested_by) ?? '(Unbekannt)'}`}
      />
      <div>
        <Badge tone={CORRECTION_STATUS_TONE[status]}>{CORRECTION_STATUS_LABEL[status]}</Badge>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Begründung</CardTitle>
        </CardHeader>
        <CardBody>
          <p className="whitespace-pre-line text-sm">{corr.reason}</p>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            <div className="flex items-baseline justify-between">
              <span>Vorher / Nachher</span>
              <Link
                href={`/time-tracking/${corr.time_entry_id}/edit`}
                className="text-xs text-[var(--color-primary)] hover:underline"
              >
                Zeiteintrag ansehen →
              </Link>
            </div>
          </CardTitle>
        </CardHeader>
        <CardBody className="!p-0">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-[var(--color-border)] bg-[var(--color-muted)]">
                  <th className="px-3 py-2 text-left font-medium">Feld</th>
                  <th className="px-3 py-2 text-left font-medium">Aktuell</th>
                  <th className="px-3 py-2 text-left font-medium">Vorschlag</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr
                    key={r.label}
                    className={
                      'border-b border-[var(--color-border)] ' +
                      (r.changed
                        ? 'bg-[color-mix(in_srgb,var(--color-warning)_6%,transparent)]'
                        : '')
                    }
                  >
                    <td className="px-3 py-2 align-top font-medium">{r.label}</td>
                    <td className="px-3 py-2 align-top text-[var(--color-muted-foreground)]">
                      {r.current}
                    </td>
                    <td className="px-3 py-2 align-top">
                      {r.changed ? <span className="font-medium">{r.proposed}</span> : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardBody>
      </Card>

      {(status === 'approved' || status === 'rejected') && (
        <Card>
          <CardHeader>
            <CardTitle>Entscheidung</CardTitle>
          </CardHeader>
          <CardBody className="flex flex-col gap-2 text-sm">
            <p>
              <span className="font-medium">
                {status === 'approved' ? 'Genehmigt' : 'Abgelehnt'}
              </span>{' '}
              von {nameByUserId.get(corr.decided_by ?? '') ?? '(Unbekannt)'} am{' '}
              {fmtDateTime(corr.decided_at)}
            </p>
            {corr.decision_note && (
              <p className="italic text-[var(--color-muted-foreground)]">„{corr.decision_note}"</p>
            )}
          </CardBody>
        </Card>
      )}

      {status === 'withdrawn' && (
        <Card>
          <CardBody className="text-sm text-[var(--color-muted-foreground)]">
            Antrag wurde vom Antragsteller zurückgezogen am {fmtDateTime(corr.decided_at)}.
          </CardBody>
        </Card>
      )}

      {canApprove && <DecideForm correctionId={corr.id} />}

      {canWithdraw && (
        <Card>
          <CardHeader>
            <CardTitle>Antrag zurückziehen</CardTitle>
          </CardHeader>
          <CardBody>
            <p className="mb-3 text-sm text-[var(--color-muted-foreground)]">
              Solange der Antrag offen ist, können Sie ihn selbst zurückziehen.
            </p>
            <WithdrawForm correctionId={corr.id} />
          </CardBody>
        </Card>
      )}
    </div>
  );
}
