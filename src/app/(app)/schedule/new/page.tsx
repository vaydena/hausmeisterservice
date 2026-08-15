import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { requireTenantContext } from '@/lib/tenant/current';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getEffectivePermissions } from '@/lib/permissions/effective';
import { PageHeader } from '@/components/ui/page-header';
import { toDateTimeLocalInput } from '@/lib/schemas/scheduling';
import { EntryForm } from '../entry-form';
import { createScheduleEntryAction } from '../actions';
import { unwrapRows } from '@/lib/supabase/unwrap';

export const metadata: Metadata = { title: 'Neuer Termin' };

export default async function NewScheduleEntryPage() {
  const ctx = await requireTenantContext();
  const permissions = await getEffectivePermissions(ctx.userId, ctx.tenantId);
  if (!permissions.has('scheduling.view')) redirect('/dashboard');
  const canEditOthers = permissions.has('scheduling.edit');

  const supabase = await createSupabaseServerClient();

  const employeesRes = await supabase
    .from('employees')
    .select('id, user_id, employment_status')
    .eq('employment_status', 'active');
  const list = unwrapRows(employeesRes, 'Einsatzplan: auswaehlbare Mitarbeiter');

  // Sprint 112: Der Fehler faellt hier nicht als leere Auswahl auf, sondern
  // als eine Auswahl aus lauter "(Ohne Namen)". Die IDs stimmen, nur die
  // Beschriftung fehlt — der Planer waehlt also aus optisch identischen
  // Eintraegen und weist den Termin faktisch zufaellig zu. Ein leeres Feld
  // haette gestoppt, ein namenloses nicht.
  const userIds = [...new Set(list.map((e) => e.user_id))];
  const usersRes =
    userIds.length > 0
      ? await supabase.from('users').select('id, display_name').in('id', userIds)
      : {
          data: [] as { id: string; display_name: string | null }[],
          error: null,
        };
  const nameByUserId = new Map(
    unwrapRows(usersRes, 'Einsatzplan: Namen der Mitarbeiter').map((u) => [u.id, u.display_name]),
  );

  const options = list
    .filter((e) => canEditOthers || e.user_id === ctx.userId)
    .map((e) => ({
      id: e.id,
      label: nameByUserId.get(e.user_id) ?? '(Ohne Namen)',
    }))
    .sort((a, b) => a.label.localeCompare(b.label, 'de'));

  const ownEmployee = list.find((e) => e.user_id === ctx.userId);
  const defaultEmployeeId = ownEmployee?.id ?? options[0]?.id ?? '';

  const now = new Date();
  now.setMinutes(0, 0, 0);
  const later = new Date(now);
  later.setHours(later.getHours() + 1);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <PageHeader
        title="Neuer Termin"
        description="Verfügbarkeit, Abwesenheit, Meeting oder sonstiger Kalendereintrag."
      />
      <EntryForm
        action={createScheduleEntryAction}
        mode="create"
        defaults={{
          employee_id: defaultEmployeeId,
          kind: 'meeting',
          title: '',
          note: '',
          start_at: toDateTimeLocalInput(now.toISOString()),
          end_at: toDateTimeLocalInput(later.toISOString()),
          all_day: false,
        }}
        employees={options}
        onCancelHref="/schedule"
      />
    </div>
  );
}
