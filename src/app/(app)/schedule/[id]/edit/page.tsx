import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { requireTenantContext } from '@/lib/tenant/current';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getEffectivePermissions } from '@/lib/permissions/effective';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card';
import { toDateTimeLocalInput, type ScheduleKind } from '@/lib/schemas/scheduling';
import { EntryForm } from '../../entry-form';
import { deleteScheduleEntryAction, updateScheduleEntryAction } from '../../actions';

export const metadata: Metadata = { title: 'Termin bearbeiten' };

export default async function EditScheduleEntryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await requireTenantContext();
  const permissions = await getEffectivePermissions(ctx.userId, ctx.tenantId);
  if (!permissions.has('scheduling.view')) redirect('/dashboard');

  const supabase = await createSupabaseServerClient();
  const { data: entry } = await supabase
    .from('schedule_entries')
    .select('id, employee_id, user_id, kind, title, note, start_at, end_at, all_day')
    .eq('id', id)
    .maybeSingle();

  if (!entry) notFound();

  const canEditOthers = permissions.has('scheduling.edit');
  const canEditThis = entry.user_id === ctx.userId || canEditOthers;
  if (!canEditThis) redirect('/schedule');

  const { data: employees } = await supabase
    .from('employees')
    .select('id, user_id, employment_status')
    .eq('employment_status', 'active');

  const list = employees ?? [];
  const userIds = [...new Set(list.map((e) => e.user_id))];
  const usersRes =
    userIds.length > 0
      ? await supabase.from('users').select('id, display_name').in('id', userIds)
      : { data: [] };
  const nameByUserId = new Map((usersRes.data ?? []).map((u) => [u.id, u.display_name]));

  const options = list
    .filter((e) => canEditOthers || e.user_id === ctx.userId)
    .map((e) => ({
      id: e.id,
      label: nameByUserId.get(e.user_id) ?? '(Ohne Namen)',
    }))
    .sort((a, b) => a.label.localeCompare(b.label, 'de'));

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <PageHeader
        title="Termin bearbeiten"
        description={entry.title}
      />
      <EntryForm
        action={updateScheduleEntryAction}
        mode="edit"
        entryId={entry.id}
        defaults={{
          employee_id: entry.employee_id,
          kind: entry.kind as ScheduleKind,
          title: entry.title,
          note: entry.note ?? '',
          start_at: toDateTimeLocalInput(entry.start_at),
          end_at: toDateTimeLocalInput(entry.end_at),
          all_day: entry.all_day,
        }}
        employees={options}
        onCancelHref="/schedule"
      />

      <Card>
        <CardHeader>
          <CardTitle>Termin löschen</CardTitle>
        </CardHeader>
        <CardBody>
          <p className="mb-3 text-sm text-[var(--color-muted-foreground)]">
            Der Termin wird dauerhaft entfernt. Diese Aktion kann nicht rückgängig gemacht werden.
          </p>
          <form action={deleteScheduleEntryAction}>
            <input type="hidden" name="entry_id" value={entry.id} />
            <Button type="submit" variant="destructive" size="sm">
              Endgültig löschen
            </Button>
          </form>
        </CardBody>
      </Card>
    </div>
  );
}
