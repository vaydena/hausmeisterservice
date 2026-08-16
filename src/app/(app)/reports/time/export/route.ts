import { NextRequest, NextResponse } from 'next/server';
import { requireTenantContext } from '@/lib/tenant/current';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { unwrapRows } from '@/lib/supabase/unwrap';
import { getEffectivePermissions } from '@/lib/permissions/effective';
import { csvResponse, parsePeriodRange, toCsv } from '@/lib/reports/utils';
import { formatDateTime } from '@/lib/utils/format';

export async function GET(req: NextRequest) {
  const ctx = await requireTenantContext();
  const permissions = await getEffectivePermissions(ctx.userId, ctx.tenantId);
  if (!permissions.has('reporting.download')) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const url = new URL(req.url);
  // Sprint 113: Berliner Kalendertage statt UTC — der Export muss denselben
  // Zeitraum abdecken wie die Seite, sonst weichen Bericht und Lohn-CSV
  // voneinander ab.
  const { from, to, startIso, endIso } = parsePeriodRange(url.searchParams);
  const supabase = await createSupabaseServerClient();

  // Sprint 108: Diese Datei geht in die Lohnabrechnung. Zwei Aenderungen:
  //
  //  1. `const { data: entries }` ohne Fehlerpruefung machte aus einem
  //     Query-Fehler eine CSV mit weniger Zeilen — kein Fehler, keine leere
  //     Datei, nur weniger Stunden. Das faellt bei der Durchsicht niemandem
  //     auf, weil niemand die Soll-Zeilenzahl kennt.
  //  2. Der Filter `.not('end_at','is',null)` ist entfallen. Nicht beendete
  //     Eintraege verschwanden damit spurlos aus dem Export; jetzt stehen sie
  //     mit dem Vermerk NICHT BEENDET und 0 Minuten drin. Die Summe der
  //     Dauer-Spalte aendert sich dadurch nicht — sichtbar wird nur, dass
  //     dort etwas fehlt.
  const list = unwrapRows(
    await supabase
      .from('time_entries')
      .select('user_id, kind, start_at, end_at, property_id, work_order_id, note')
      .gte('start_at', startIso)
      .lt('start_at', endIso)
      .order('start_at', { ascending: true }),
    'Zeitbericht-Export: Zeiten',
  );

  const userIds = [...new Set(list.map((e) => e.user_id))];
  const propertyIds = [...new Set(list.map((e) => e.property_id).filter((v): v is string => Boolean(v)))];

  const [users, properties] = await Promise.all([
    userIds.length > 0
      ? supabase
          .from('users')
          .select('id, display_name')
          .in('id', userIds)
          .then((r) => unwrapRows(r, 'Zeitbericht-Export: Anzeigenamen'))
      : Promise.resolve([] as { id: string; display_name: string | null }[]),
    propertyIds.length > 0
      ? supabase
          .from('properties')
          .select('id, name')
          .in('id', propertyIds)
          .then((r) => unwrapRows(r, 'Zeitbericht-Export: Objektnamen'))
      : Promise.resolve([] as { id: string; name: string }[]),
  ]);

  const userById = new Map(users.map((u) => [u.id, u.display_name]));
  const propById = new Map(properties.map((p) => [p.id, p.name]));

  const csv = toCsv(
    ['Mitarbeiter', 'Art', 'Start', 'Ende', 'Dauer (min)', 'Objekt', 'Auftrag', 'Notiz'],
    list.map((e) => {
      const mins = e.end_at
        ? Math.max(0, Math.round((new Date(e.end_at).getTime() - new Date(e.start_at).getTime()) / 60000))
        : 0;
      return [
        userById.get(e.user_id) ?? '',
        e.kind,
        // Sprint 113: `toLocaleString('de-DE')` ohne Zone hat die Uhrzeit in
        // der Zone des Servers ausgegeben. Auf einem Server in UTC stand in
        // der Lohn-CSV im Sommer 07:00, wo der Mitarbeiter um 09:00 angefangen
        // hat — bei unveraenderter Dauer-Spalte, also ohne dass die Summe
        // widerspricht.
        formatDateTime(e.start_at),
        e.end_at ? formatDateTime(e.end_at) : 'NICHT BEENDET',
        mins,
        propById.get(e.property_id ?? '') ?? '',
        e.work_order_id ?? '',
        e.note ?? '',
      ];
    }),
  );

  return csvResponse(`zeitbericht_${from}_${to}.csv`, csv);
}
