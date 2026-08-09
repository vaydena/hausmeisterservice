import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { requireTenantContext } from '@/lib/tenant/current';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getEffectivePermissions } from '@/lib/permissions/effective';
import { PageHeader } from '@/components/ui/page-header';
import { toDateTimeLocalInput, type TimeEntryKind } from '@/lib/schemas/time-tracking';
import { EntryForm } from '../../entry-form';
import { deleteEntryAction, updateEntryAction } from '../../actions';
import { Button, LinkButton } from '@/components/ui/button';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card';

export const metadata: Metadata = { title: 'Zeit bearbeiten' };

export default async function EditTimeEntryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await requireTenantContext();
  const permissions = await getEffectivePermissions(ctx.userId, ctx.tenantId);
  if (!permissions.has('time_tracking.edit')) redirect('/time-tracking');

  const supabase = await createSupabaseServerClient();
  const { data: entry } = await supabase
    .from('time_entries')
    .select('id, user_id, kind, start_at, end_at, work_order_id, property_id, note')
    .eq('id', id)
    .maybeSingle();

  if (!entry) notFound();

  const [propsRes, workOrdersRes] = await Promise.all([
    supabase.from('properties').select('id, code, name').is('deleted_at', null).order('name'),
    supabase
      .from('work_orders')
      .select('id, code, title')
      .is('deleted_at', null)
      .order('planned_start', { ascending: true, nullsFirst: false })
      .limit(100),
  ]);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <PageHeader
        title="Zeit bearbeiten"
        description={
          entry.end_at
            ? `${new Date(entry.start_at).toLocaleString('de-DE')} – ${new Date(entry.end_at).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}`
            : `${new Date(entry.start_at).toLocaleString('de-DE')} — läuft noch`
        }
      />
      <EntryForm
        action={updateEntryAction}
        mode="edit"
        entryId={entry.id}
        defaults={{
          kind: entry.kind as TimeEntryKind,
          start_at: toDateTimeLocalInput(entry.start_at),
          end_at: entry.end_at ? toDateTimeLocalInput(entry.end_at) : '',
          work_order_id: entry.work_order_id ?? '',
          property_id: entry.property_id ?? '',
          note: entry.note ?? '',
        }}
        workOrders={(workOrdersRes.data ?? []).map((w) => ({
          id: w.id,
          label: w.code ? `${w.code} · ${w.title}` : w.title,
        }))}
        properties={(propsRes.data ?? []).map((p) => ({
          id: p.id,
          label: p.code ? `${p.code} · ${p.name}` : p.name,
        }))}
        onCancelHref="/time-tracking"
        requireEnd={false}
      />

      <Card>
        <CardHeader>
          <CardTitle>Korrektur mit Freigabe beantragen</CardTitle>
        </CardHeader>
        <CardBody>
          <p className="mb-3 text-sm text-[var(--color-muted-foreground)]">
            Alternative zum direkten Bearbeiten: Ein Antrag wird von einer berechtigten Person
            geprüft und bei Genehmigung angewandt — hinterlässt einen nachvollziehbaren
            Freigabe-Verlauf.
          </p>
          <LinkButton href={`/time-tracking/${entry.id}/correction`} variant="secondary" size="sm">
            Korrektur beantragen
          </LinkButton>
        </CardBody>
      </Card>

      {entry.user_id === ctx.userId && (
        <Card>
          <CardHeader>
            <CardTitle>Eintrag löschen</CardTitle>
          </CardHeader>
          <CardBody>
            <p className="mb-3 text-sm text-[var(--color-muted-foreground)]">
              Der Eintrag wird dauerhaft entfernt. Diese Aktion kann nicht rückgängig gemacht werden.
            </p>
            <form action={deleteEntryAction}>
              <input type="hidden" name="entry_id" value={entry.id} />
              <Button type="submit" variant="destructive" size="sm">
                Endgültig löschen
              </Button>
            </form>
          </CardBody>
        </Card>
      )}
    </div>
  );
}
