/**
 * Sprint 100: Das Ungelesen-Praedikat fuer Message-Threads als eine Funktion.
 *
 * Bis hierher stand dieselbe Bedingung an drei Stellen handkopiert:
 * lib/portal/unread-messages.ts (Nav-Badge + Dashboard),
 * lib/portal/notification-bell.ts (Glocke im Header) und
 * portal/messages/page.tsx (Liste). Der Kommentar in unread-messages.ts
 * behauptete "bewusst identisch zu portal/messages/page.tsx" —
 * durchgesetzt hat das nichts, und die Fassung in der Liste war denn auch
 * schon abgedriftet: ihr fehlte der explizite null-Check auf
 * last_message_at, sodass sie statt eines booleans auch null liefern
 * konnte. Solange das Ergebnis nur in ein `if` floss, fiel der
 * Unterschied nicht auf; sobald eine der Fassungen einen Listenfilter
 * speist, wird daraus ein sichtbarer.
 *
 * Eigenes Modul statt einer Funktion in unread-messages.ts, weil jenes
 * ueber @/lib/supabase/server an @/lib/env haengt, und das validiert sein
 * Schema beim Import. Ein Unit-Test koennte die Datei damit gar nicht
 * laden. Dieselbe Trennung wie bei lib/utils/search.ts (Sprint 98): das
 * Praedikat ist reine Logik und hat in einem Modul mit DB-Zugriff nichts
 * verloren.
 */

/**
 * Gilt der Thread fuer diesen Bewohner als ungelesen?
 *
 * Ungelesen ist er, wenn (a) kein last_read_at vorliegt — es existiert
 * keine participant-Zeile oder der Bewohner hat ihn nie geoeffnet — ODER
 * (b) die letzte Nachricht neuer ist als der Lesezeitpunkt.
 *
 * Verglichen wird ueber Date.parse statt lexikographisch. Beide Werte
 * kommen zwar aus derselben Datenbank durch denselben Client und haben
 * damit praktisch immer dasselbe Format, aber ein String-Vergleich
 * verlaesst sich genau darauf: '2026-08-15T14:47:03Z' und
 * '2026-08-15T14:47:03.000+00:00' bezeichnen denselben Moment und
 * sortieren als Text trotzdem unterschiedlich, weil 'Z' hinter '.' liegt.
 * Der Zeitvergleich kostet bei diesen Listenlaengen nichts und macht die
 * Funktion vom Serialisierungsformat unabhaengig.
 *
 * Unparsebare Werte fallen bewusst asymmetrisch: ohne lesbaren
 * Nachrichten-Zeitpunkt gibt es nichts, das neuer sein koennte (gelesen);
 * ohne lesbaren Lesezeitpunkt ist nicht belegt, dass der Bewohner den
 * Thread gesehen hat (ungelesen). Im Zweifel lieber ein Punkt zu viel in
 * der Liste als eine uebersehene Nachricht der Hausverwaltung.
 */
export function isThreadUnread(
  lastMessageAt: string | null | undefined,
  lastReadAt: string | null | undefined,
): boolean {
  if (!lastReadAt) return true;
  if (!lastMessageAt) return false;

  const messageTime = Date.parse(lastMessageAt);
  if (Number.isNaN(messageTime)) return false;

  const readTime = Date.parse(lastReadAt);
  if (Number.isNaN(readTime)) return true;

  return readTime < messageTime;
}
