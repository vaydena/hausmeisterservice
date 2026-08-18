import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requireTenantContext } from '@/lib/tenant/current';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { unwrapMaybeRow } from '@/lib/supabase/unwrap';
import { getEffectivePermissions } from '@/lib/permissions/effective';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card';
import { ShiftForm } from '../../shift-form';
import { updateShiftAction, type ShiftFormState } from '../../actions';
import { DeleteShiftButton } from '../../delete-shift-button';

export const metadata: Metadata = { title: 'Schicht bearbeiten' };

export default async function EditShiftPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireTenantContext();
  const permissions = await getEffectivePermissions(ctx.userId, ctx.tenantId);
  if (!permissions.has('shifts.manage')) notFound();

  const supabase = await createSupabaseServerClient();
  const shift = unwrapMaybeRow(
    await supabase
      .from('shifts')
      .select('id, name, short_code, start_time, end_time, break_minutes, color, sort_order, active, notes')
      .eq('id', id)
      .is('deleted_at', null)
      .maybeSingle(),
    'Schicht bearbeiten',
  );

  if (!shift) notFound();

  const boundAction = updateShiftAction.bind(null, id);
  const wrapped = async (prev: ShiftFormState, form: FormData) => boundAction(prev, form);

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <PageHeader title="Schicht bearbeiten" description={shift.name} />
      <ShiftForm
        action={wrapped}
        cancelHref="/shifts"
        submitLabel="Änderungen speichern"
        initial={shift}
      />

      <Card>
        <CardHeader>
          <CardTitle>Schicht löschen</CardTitle>
        </CardHeader>
        <CardBody>
          <p className="mb-4 text-sm text-[var(--color-muted-foreground)]">
            Entfernt das Modell aus der Auswahl. Der Datensatz bleibt erhalten, damit bereits
            geplante Einsätze ihren Schichtnamen behalten.
          </p>
          <DeleteShiftButton shiftId={shift.id} name={shift.name} />
        </CardBody>
      </Card>
    </div>
  );
}
