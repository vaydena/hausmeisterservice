import { NextResponse } from 'next/server';
import { requireResidentContext } from '@/lib/portal/current';
import { createSupabaseServerClient } from '@/lib/supabase/server';

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
    profile: profile.data ?? null,
    resident_records: resident.data ?? [],
    defect_reports_created: defectReports.data ?? [],
    messages_authored: messagesAuthored.data ?? [],
    message_thread_memberships: threadMemberships.data ?? [],
    notifications_received: notifications.data ?? [],
    announcement_receipts: announcementReceipts.data ?? [],
    push_subscriptions: pushSubs.data ?? [],
    login_events: loginEvents.data ?? [],
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
