import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// DSGVO Art. 15 Auskunftsrecht — sammelt alle personenbezogenen Daten des
// angemeldeten Users aus allen relevanten Tabellen und liefert sie als JSON.
// RLS im Server-Client garantiert, dass nur Daten mitkommen, die der User
// laut Policy sehen darf; wir filtern zusaetzlich explizit nach user_id /
// created_by / etc., damit der Export den User selbst umkreist und nicht
// den kompletten Tenant-Scope zieht.
export async function GET() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return new NextResponse('Nicht angemeldet.', { status: 401 });
  }

  const uid = user.id;

  const [
    profile,
    memberships,
    employee,
    resident,
    userRoles,
    userGroupMembers,
    pushSubs,
    timeEntries,
    timeCorrections,
    scheduleEntries,
    myMessages,
    threadMemberships,
    notifications,
    announcementReceipts,
    workOrdersReported,
    workOrdersAssigned,
    workOrdersCreated,
    defectReports,
    documents,
    workOrderEvents,
    auditLog,
  ] = await Promise.all([
    supabase.from('users').select('*').eq('id', uid).maybeSingle(),
    supabase.from('memberships').select('*').eq('user_id', uid),
    supabase.from('employees').select('*').eq('user_id', uid),
    supabase.from('residents').select('*').eq('user_id', uid),
    supabase.from('user_roles').select('*').eq('user_id', uid),
    supabase.from('user_group_members').select('*').eq('user_id', uid),
    supabase.from('push_subscriptions').select('*').eq('user_id', uid),
    supabase.from('time_entries').select('*').eq('user_id', uid),
    supabase
      .from('time_entry_corrections')
      .select('*')
      .or(`requested_by.eq.${uid},decided_by.eq.${uid}`),
    supabase.from('schedule_entries').select('*').eq('user_id', uid),
    supabase.from('messages').select('*').eq('author_user_id', uid),
    supabase.from('message_thread_participants').select('*').eq('user_id', uid),
    supabase.from('notifications').select('*').eq('user_id', uid),
    supabase.from('announcement_receipts').select('*').eq('user_id', uid),
    supabase.from('work_orders').select('*').eq('reporter_id', uid),
    supabase.from('work_orders').select('*').eq('assignee_id', uid),
    supabase.from('work_orders').select('*').eq('created_by', uid),
    supabase.from('defect_reports').select('*').eq('created_by', uid),
    supabase.from('documents').select('*').eq('uploaded_by', uid),
    supabase.from('work_order_events').select('*').eq('actor_id', uid),
    supabase.from('audit_log').select('*').eq('actor_id', uid),
  ]);

  const payload = {
    export_meta: {
      version: 1,
      generated_at: new Date().toISOString(),
      subject: {
        user_id: uid,
        email: user.email ?? null,
      },
      legal_basis:
        'DSGVO Art. 15 Auskunftsrecht der betroffenen Person. Enthaelt alle personenbezogenen Daten, die zu Ihrem Nutzerkonto in dieser Anwendung gespeichert sind.',
      note:
        'Datensaetze, die andere Nutzer betreffen (z. B. Adressen von Bewohnern, die Sie bearbeitet haben), sind nicht Teil dieses Exports; ihre Auskunftsrechte muessen dort ausgeuebt werden.',
    },
    auth_user: {
      id: user.id,
      email: user.email ?? null,
      last_sign_in_at: user.last_sign_in_at ?? null,
      created_at: user.created_at ?? null,
      confirmed_at: user.confirmed_at ?? null,
    },
    profile: profile.data ?? null,
    memberships: memberships.data ?? [],
    employee_profile: employee.data ?? [],
    resident_profile: resident.data ?? [],
    role_assignments: userRoles.data ?? [],
    user_group_memberships: userGroupMembers.data ?? [],
    push_subscriptions: pushSubs.data ?? [],
    time_entries: timeEntries.data ?? [],
    time_corrections: timeCorrections.data ?? [],
    schedule_entries: scheduleEntries.data ?? [],
    messages_authored: myMessages.data ?? [],
    message_thread_memberships: threadMemberships.data ?? [],
    notifications_received: notifications.data ?? [],
    announcement_receipts: announcementReceipts.data ?? [],
    work_orders_as_reporter: workOrdersReported.data ?? [],
    work_orders_as_assignee: workOrdersAssigned.data ?? [],
    work_orders_created: workOrdersCreated.data ?? [],
    defect_reports_created: defectReports.data ?? [],
    documents_uploaded: documents.data ?? [],
    work_order_events_authored: workOrderEvents.data ?? [],
    audit_log_actions: auditLog.data ?? [],
  };

  const body = JSON.stringify(payload, null, 2);
  const dateSlug = new Date().toISOString().slice(0, 10);
  const filename = `hausmeisterservice-datenauskunft-${dateSlug}.json`;

  return new NextResponse(body, {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'private, no-store',
    },
  });
}
