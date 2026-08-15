/**
 * Sprint 101: Die beiden Lesezustands-Praedikate fuer Ankuendigungen als
 * je eine Funktion — das Gegenstueck zu thread-read-state.ts (Sprint 100).
 *
 * "Ungelesen" und "zu quittieren" standen bis hierher an fuenf Stellen
 * handkopiert, zusammen zwoelfmal: lib/portal/unread-announcements.ts
 * (Nav-Badge + Dashboard-Zaehler), lib/portal/notification-bell.ts
 * (Glocke), portal/announcements/page.tsx (Filter, Sortierung, Badges,
 * Button-Sichtbarkeit), portal/announcements/[id]/page.tsx (Ack-Button)
 * und portal/dashboard/page.tsx (Panel-Sortierung + Badges). Jede Stelle
 * fuer sich ist ein Einzeiler; genau deshalb wandert die Regel bei einer
 * Aenderung erfahrungsgemaess nur an vier von fuenf Stellen mit.
 *
 * Eigenes Modul aus demselben Grund wie bei thread-read-state.ts: die
 * beiden lib/portal-Helper haengen ueber @/lib/supabase/server an
 * @/lib/env, und das parst sein Schema schon beim Import — ein Unit-Test
 * koennte die Dateien gar nicht laden.
 *
 * Der Receipt ist als strukturelles Minimum typisiert statt als Row aus
 * database.ts: die Aufrufer selektieren unterschiedliche Spaltensaetze
 * (mal mit announcement_id, mal ohne), und mehr als die beiden
 * Zeitstempel braucht hier niemand.
 */

export interface AnnouncementReceiptLike {
  read_at?: string | null;
  acknowledged_at?: string | null;
}

/**
 * Gilt die Ankuendigung fuer diesen Bewohner als ungelesen?
 *
 * Ungelesen ist sie, solange kein read_at existiert — entweder gibt es
 * gar keine receipt-Zeile oder sie traegt nur eine Quittierung. Anders
 * als bei Message-Threads wird hier kein Zeitpunkt verglichen: eine
 * Ankuendigung aendert sich nach dem Veroeffentlichen nicht mehr, es
 * gibt also nichts, das nach dem Lesen noch dazukommen koennte.
 */
export function isAnnouncementUnread(
  receipt: AnnouncementReceiptLike | null | undefined,
): boolean {
  return !receipt?.read_at;
}

/**
 * Wartet die Ankuendigung noch auf die Kenntnisnahme des Bewohners?
 *
 * Nur relevant, wenn die Ankuendigung ueberhaupt eine Quittierung
 * verlangt; danach zaehlt allein, ob acknowledged_at gesetzt ist. Lesen
 * und Quittieren bleiben strikt getrennt: das Oeffnen der Detailseite
 * setzt seit Sprint 51 read_at implizit, acknowledged_at dagegen nur der
 * ausdrueckliche Button-Klick.
 *
 * Bewusst NICHT enthalten ist der Ablauf-Check. Die Staff-Seite blendet
 * abgelaufene Ankuendigungen aus ihrer "zu quittieren"-Liste aus
 * (app/announcements/page.tsx), das Portal nie — und Sprint 66 hat den
 * Ack-Button auf der Detailseite absichtlich auch nach Ablauf aktiv
 * gelassen: wer einen Aushang erst spaet oeffnet, soll ihn trotzdem
 * quittieren koennen. Diese Funktion haelt das Portal-Verhalten fest.
 * Die beiden Sichten anzugleichen waere eine Produktentscheidung und
 * gehoert nicht als stiller Nebeneffekt in eine Extraktion.
 */
export function needsAcknowledgement(
  requiresAcknowledgement: boolean | null | undefined,
  receipt: AnnouncementReceiptLike | null | undefined,
): boolean {
  if (!requiresAcknowledgement) return false;
  return !receipt?.acknowledged_at;
}

export interface AnnouncementLike {
  id: string;
  requires_acknowledgement?: boolean | null;
}

export interface AnnouncementGroupCounts {
  alle: number;
  ungelesen: number;
  zu_quittieren: number;
}

/**
 * Sprint 102: Zaehlt die Ankuendigungen je Filter-Tab.
 *
 * Nutzt dieselben beiden Praedikate wie der Tab-Filter selbst — die Zahl
 * am Tab ist damit per Konstruktion die Zeilenzahl dahinter und kann
 * nicht davon abdriften.
 *
 * Erwartet genau die Liste, die der Tab-Wechsel spaeter filtert (also die
 * bereits suchgefilterte, aber noch nicht gruppierte). Der Unterschied ist
 * nicht akademisch: der "Alle als gelesen"-Button auf derselben Seite
 * leitete seine Sichtbarkeit bis Sprint 101 aus der gefilterten Liste ab,
 * waehrend die Aktion dahinter ueber alle veroeffentlichten
 * Ankuendigungen lief — Anzeige und Wirkung fielen auseinander, sobald
 * eine Suche aktiv war. Ein Zaehler, der ueber eine andere Menge laeuft
 * als sein Tab, waere derselbe Fehler noch einmal.
 */
export function countAnnouncementGroups(
  announcements: readonly AnnouncementLike[],
  receipts: ReadonlyMap<string, AnnouncementReceiptLike>,
): AnnouncementGroupCounts {
  const counts: AnnouncementGroupCounts = {
    alle: announcements.length,
    ungelesen: 0,
    zu_quittieren: 0,
  };

  for (const announcement of announcements) {
    const receipt = receipts.get(announcement.id);
    if (isAnnouncementUnread(receipt)) counts.ungelesen += 1;
    if (needsAcknowledgement(announcement.requires_acknowledgement, receipt)) {
      counts.zu_quittieren += 1;
    }
  }

  return counts;
}
