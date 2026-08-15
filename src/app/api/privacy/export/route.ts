import { NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { requireTenantContext } from '@/lib/tenant/current';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { unwrapRows, unwrapMaybeRow } from '@/lib/supabase/unwrap';
import {
  collectExportFailures,
  describeExportFailures,
  summarizeExportFailures,
} from '@/lib/privacy/export-failures';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// DSGVO Art. 15 Auskunftsrecht — sammelt alle personenbezogenen Daten des
// angemeldeten Users aus allen relevanten Tabellen und liefert sie als JSON.
// requireTenantContext gated auf einen authentifizierten User mit aktiver
// Mitgliedschaft; RLS im Server-Client garantiert, dass nur Daten mitkommen,
// die der User laut Policy sehen darf; wir filtern zusaetzlich explizit nach
// user_id / created_by / etc., damit der Export den User selbst umkreist und
// nicht den kompletten Tenant-Scope zieht.
export async function GET() {
  const ctx = await requireTenantContext();
  const supabase = await createSupabaseServerClient();
  const uid = ctx.userId;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  // Nach requireTenantContext ist user zwangslaeufig gesetzt — Narrowing
  // fuer die auth_user-Felder unten.
  if (!user) {
    return new NextResponse('Nicht angemeldet.', { status: 401 });
  }

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

  // Sprint 105: Vor dem Zusammenbauen pruefen, ob ueberhaupt alles gelesen
  // werden konnte. Vorher landete jede gescheiterte Query als `?? []` im
  // Export — eine Luecke, die im Dokument wie "dazu ist nichts gespeichert"
  // aussieht, obwohl direkt darunter steht, es seien ALLE Daten enthalten.
  //
  // Die Schluessel sind der Klartext, den der Betroffene zu lesen bekommt,
  // wenn ein Bereich fehlt. Deshalb hier Bereichsnamen und keine
  // Tabellennamen.
  const categories = {
    Profil: profile,
    Mitgliedschaften: memberships,
    Mitarbeiterprofil: employee,
    Bewohnerprofil: resident,
    Rollenzuweisungen: userRoles,
    Gruppenzugehoerigkeiten: userGroupMembers,
    'Push-Benachrichtigungen': pushSubs,
    Arbeitszeiten: timeEntries,
    Zeitkorrekturen: timeCorrections,
    Einsatzplanung: scheduleEntries,
    'Verfasste Nachrichten': myMessages,
    'Teilnahme an Nachrichten-Verlaeufen': threadMemberships,
    'Erhaltene Benachrichtigungen': notifications,
    'Lesebestaetigungen zu Ankuendigungen': announcementReceipts,
    'Auftraege als Melder': workOrdersReported,
    'Auftraege als Zustaendiger': workOrdersAssigned,
    'Selbst angelegte Auftraege': workOrdersCreated,
    'Selbst erstellte Meldungen': defectReports,
    'Hochgeladene Dokumente': documents,
    'Eigene Auftrags-Aktivitaeten': workOrderEvents,
    'Protokollierte Aktionen': auditLog,
  };
  const failures = collectExportFailures(categories);

  if (failures.length > 0) {
    // Bewusst `return` statt `throw`: error.tsx greift nur beim Rendern von
    // Server-Components, nicht in einem Route-Handler. Ein geworfener Fehler
    // wuerde dem Nutzer hier nur einen abgebrochenen Download bescheren, ohne
    // zu sagen warum. Weil damit aber auch onRequestError nicht feuert, muss
    // die Meldung an Sentry explizit passieren.
    Sentry.captureException(
      new Error(summarizeExportFailures(failures, Object.keys(categories).length)),
      {
        extra: { userId: uid, tenantId: ctx.tenantId, failures },
      },
    );
    return new NextResponse(describeExportFailures(failures), {
      status: 500,
      headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
    });
  }

  // Ab hier ist erwiesen, dass kein Result einen Fehler traegt. Die
  // unwrap-Helper koennen also nicht mehr werfen; sie stehen hier fuer die
  // Typisierung (`T[]` statt `T[] | null`) und damit der alte `?? []`-Griff
  // nicht durch die Hintertuer zurueckkommt.
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
    profile: unwrapMaybeRow(profile, 'Datenauskunft: Profil'),
    memberships: unwrapRows(memberships, 'Datenauskunft: Mitgliedschaften'),
    employee_profile: unwrapRows(employee, 'Datenauskunft: Mitarbeiterprofil'),
    resident_profile: unwrapRows(resident, 'Datenauskunft: Bewohnerprofil'),
    role_assignments: unwrapRows(userRoles, 'Datenauskunft: Rollenzuweisungen'),
    user_group_memberships: unwrapRows(userGroupMembers, 'Datenauskunft: Gruppenzugehoerigkeiten'),
    push_subscriptions: unwrapRows(pushSubs, 'Datenauskunft: Push-Benachrichtigungen'),
    time_entries: unwrapRows(timeEntries, 'Datenauskunft: Arbeitszeiten'),
    time_corrections: unwrapRows(timeCorrections, 'Datenauskunft: Zeitkorrekturen'),
    schedule_entries: unwrapRows(scheduleEntries, 'Datenauskunft: Einsatzplanung'),
    messages_authored: unwrapRows(myMessages, 'Datenauskunft: Verfasste Nachrichten'),
    message_thread_memberships: unwrapRows(threadMemberships, 'Datenauskunft: Thread-Teilnahmen'),
    notifications_received: unwrapRows(notifications, 'Datenauskunft: Benachrichtigungen'),
    announcement_receipts: unwrapRows(announcementReceipts, 'Datenauskunft: Lesebestaetigungen'),
    work_orders_as_reporter: unwrapRows(workOrdersReported, 'Datenauskunft: Auftraege als Melder'),
    work_orders_as_assignee: unwrapRows(
      workOrdersAssigned,
      'Datenauskunft: Auftraege als Zustaendiger',
    ),
    work_orders_created: unwrapRows(workOrdersCreated, 'Datenauskunft: Angelegte Auftraege'),
    defect_reports_created: unwrapRows(defectReports, 'Datenauskunft: Erstellte Meldungen'),
    documents_uploaded: unwrapRows(documents, 'Datenauskunft: Hochgeladene Dokumente'),
    work_order_events_authored: unwrapRows(workOrderEvents, 'Datenauskunft: Auftrags-Aktivitaeten'),
    audit_log_actions: unwrapRows(auditLog, 'Datenauskunft: Protokollierte Aktionen'),
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
