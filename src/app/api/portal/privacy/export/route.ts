import { NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { requireResidentContext } from '@/lib/portal/current';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { unwrapRows, unwrapMaybeRow } from '@/lib/supabase/unwrap';
import {
  collectExportFailures,
  describeExportFailures,
  summarizeExportFailures,
} from '@/lib/privacy/export-failures';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Sprint 42 · DSGVO Art. 15 Auskunftsrecht fuer Portal-Residents.
// Analog zum Staff-Export (/api/privacy/export, Sprint 15) — sammelt
// alle personenbezogenen Daten des angemeldeten Bewohners. RLS im
// Server-Client garantiert, dass ausschliesslich eigene Zeilen
// zurueckkommen; zusaetzlich filtern wir explizit auf user_id /
// reporter_user_id / author_user_id, damit der Export sich strikt um
// den User selbst dreht und keine benachbarten Tenant-Rows mitzieht.
//
// Bewusst NICHT enthalten: work_orders, time_entries, audit_log,
// documents — diese Tabellen sind Staff-only und ein Bewohner hat dort
// keine eigenen Zeilen. Ein leeres Array fuer sie waere reines Rauschen
// im Export und wuerde suggerieren, es koenne dort Daten geben.
export async function GET() {
  const ctx = await requireResidentContext();
  const supabase = await createSupabaseServerClient();
  const uid = ctx.userId;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  // Nach requireResidentContext ist user zwangslaeufig gesetzt — Narrowing
  // fuer die auth_user-Felder unten.
  if (!user) {
    return new NextResponse('Nicht angemeldet.', { status: 401 });
  }

  const [
    profile,
    resident,
    defectReports,
    messagesAuthored,
    threadMemberships,
    notifications,
    announcementReceipts,
    pushSubs,
    loginEvents,
  ] = await Promise.all([
    supabase.from('users').select('*').eq('id', uid).maybeSingle(),
    supabase.from('residents').select('*').eq('user_id', uid),
    supabase.from('defect_reports').select('*').eq('reporter_user_id', uid),
    supabase.from('messages').select('*').eq('author_user_id', uid),
    supabase.from('message_thread_participants').select('*').eq('user_id', uid),
    supabase.from('notifications').select('*').eq('user_id', uid),
    supabase.from('announcement_receipts').select('*').eq('user_id', uid),
    supabase.from('push_subscriptions').select('*').eq('user_id', uid),
    supabase
      .from('auth_login_events')
      .select('*')
      .eq('user_id', uid)
      .order('at', { ascending: false }),
  ]);

  // Sprint 105: siehe Staff-Route. Fuer den Bewohner wiegt die stille Luecke
  // eher schwerer als fuer den Mitarbeiter — er hat keinen zweiten Weg an
  // seine Daten und muss dem Dokument glauben, das ihm seine Hausverwaltung
  // ueber diese Software aushaendigt.
  const categories = {
    Profil: profile,
    Bewohnerdaten: resident,
    'Eigene Meldungen': defectReports,
    'Verfasste Nachrichten': messagesAuthored,
    'Teilnahme an Nachrichten-Verlaeufen': threadMemberships,
    'Erhaltene Benachrichtigungen': notifications,
    'Lesebestaetigungen zu Ankuendigungen': announcementReceipts,
    'Push-Benachrichtigungen': pushSubs,
    Anmeldeverlauf: loginEvents,
  };
  const failures = collectExportFailures(categories);

  if (failures.length > 0) {
    // return statt throw, und deshalb explizites captureException — die
    // Begruendung steht ausfuehrlich in der Staff-Route.
    Sentry.captureException(
      new Error(summarizeExportFailures(failures, Object.keys(categories).length)),
      {
        extra: { userId: uid, tenantId: ctx.tenantId, role: 'resident', failures },
      },
    );
    return new NextResponse(describeExportFailures(failures), {
      status: 500,
      headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
    });
  }

  // Ab hier traegt kein Result mehr einen Fehler; die unwrap-Helper stehen
  // fuer die Typisierung und halten den alten `?? []`-Griff draussen.
  const payload = {
    export_meta: {
      version: 1,
      generated_at: new Date().toISOString(),
      subject: {
        user_id: uid,
        email: user.email ?? null,
        role: 'resident',
      },
      legal_basis:
        'DSGVO Art. 15 Auskunftsrecht der betroffenen Person. Enthaelt alle personenbezogenen Daten, die zu Ihrem Bewohner-Konto in dieser Anwendung gespeichert sind.',
      note:
        'Ihr Bewohner-Datensatz (Name, Anschrift, Wohnungszuordnung) wird von Ihrer Hausverwaltung gepflegt und ist Bestandteil eines bestehenden Vertragsverhaeltnisses zwischen Ihnen und der Hausverwaltung. Fuer Berichtigung oder Loeschung dieser Vertragsdaten wenden Sie sich bitte direkt an Ihre Hausverwaltung.',
    },
    auth_user: {
      id: user.id,
      email: user.email ?? null,
      last_sign_in_at: user.last_sign_in_at ?? null,
      created_at: user.created_at ?? null,
      confirmed_at: user.confirmed_at ?? null,
    },
    profile: unwrapMaybeRow(profile, 'Portal-Datenauskunft: Profil'),
    resident_records: unwrapRows(resident, 'Portal-Datenauskunft: Bewohnerdaten'),
    defect_reports_created: unwrapRows(defectReports, 'Portal-Datenauskunft: Eigene Meldungen'),
    messages_authored: unwrapRows(messagesAuthored, 'Portal-Datenauskunft: Verfasste Nachrichten'),
    message_thread_memberships: unwrapRows(
      threadMemberships,
      'Portal-Datenauskunft: Thread-Teilnahmen',
    ),
    notifications_received: unwrapRows(notifications, 'Portal-Datenauskunft: Benachrichtigungen'),
    announcement_receipts: unwrapRows(
      announcementReceipts,
      'Portal-Datenauskunft: Lesebestaetigungen',
    ),
    push_subscriptions: unwrapRows(pushSubs, 'Portal-Datenauskunft: Push-Benachrichtigungen'),
    login_events: unwrapRows(loginEvents, 'Portal-Datenauskunft: Anmeldeverlauf'),
  };

  const body = JSON.stringify(payload, null, 2);
  const dateSlug = new Date().toISOString().slice(0, 10);
  const filename = `hausmeisterservice-portal-datenauskunft-${dateSlug}.json`;

  return new NextResponse(body, {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'private, no-store',
    },
  });
}
