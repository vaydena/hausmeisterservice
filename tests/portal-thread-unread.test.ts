import { describe, it, expect } from 'vitest';
import { isThreadUnread } from '@/lib/portal/thread-read-state';

// Formate wie PostgREST sie fuer timestamptz zurueckliefert.
const READ = '2026-08-15T10:00:00+00:00';
const BEFORE_READ = '2026-08-15T09:59:59+00:00';
const AFTER_READ = '2026-08-15T10:00:01+00:00';

describe('isThreadUnread', () => {
  describe('ohne Lesezeitpunkt', () => {
    it('ist ungelesen, wenn keine participant-Zeile existiert (undefined)', () => {
      // Map.get() liefert undefined, wenn der Bewohner (noch) nicht als
      // Teilnehmer eingetragen ist — er soll den Thread trotzdem sehen.
      expect(isThreadUnread(READ, undefined)).toBe(true);
    });

    it('ist ungelesen, wenn last_read_at null ist', () => {
      expect(isThreadUnread(READ, null)).toBe(true);
    });

    it('ist ungelesen auch ohne last_message_at', () => {
      // Kein Lesezeitpunkt schlaegt alles andere: der Thread wurde nie
      // geoeffnet, unabhaengig davon ob schon Nachrichten drin sind.
      expect(isThreadUnread(null, null)).toBe(true);
    });
  });

  describe('mit Lesezeitpunkt', () => {
    it('ist ungelesen, wenn die letzte Nachricht neuer ist', () => {
      expect(isThreadUnread(AFTER_READ, READ)).toBe(true);
    });

    it('ist gelesen, wenn die letzte Nachricht aelter ist', () => {
      expect(isThreadUnread(BEFORE_READ, READ)).toBe(false);
    });

    it('ist gelesen bei identischem Zeitstempel', () => {
      // Gleichstand zaehlt als gelesen: beim Oeffnen setzt das Portal
      // last_read_at auf now(), was der letzten Nachricht sehr nahe
      // kommen kann. Ein > statt >= wuerde den gerade gelesenen Thread
      // sofort wieder als ungelesen markieren.
      expect(isThreadUnread(READ, READ)).toBe(false);
    });

    it('ist gelesen, wenn der Thread noch keine Nachricht hat', () => {
      // Entsteht im Fenster zwischen thread-insert und message-insert in
      // create_portal_message_thread, und bei Threads deren Nachrichten
      // geloescht wurden. Ohne Nachricht gibt es nichts Ungelesenes.
      expect(isThreadUnread(null, READ)).toBe(false);
    });
  });

  describe('unterschiedliche Zeitzonen-Schreibweisen', () => {
    it('erkennt denselben Moment als gelesen, wenn die Nachricht in Z-Schreibweise vorliegt', () => {
      // Der Fall, den der String-Vergleich verlor: als Text ist
      // '2026-08-15T10:00:00.000+00:00' < '2026-08-15T10:00:00Z' wahr,
      // weil '.' (0x2E) vor 'Z' (0x5A) liegt. Der Thread haette also als
      // ungelesen gegolten, obwohl beide Werte denselben Moment meinen.
      expect(isThreadUnread('2026-08-15T10:00:00Z', '2026-08-15T10:00:00.000+00:00')).toBe(
        false,
      );
    });

    it('erkennt denselben Moment auch in der umgekehrten Schreibweise als gelesen', () => {
      // Diese Richtung faellt auch lexikographisch richtig aus — sie
      // steht hier, damit die Symmetrie der Funktion festgehalten ist.
      expect(isThreadUnread('2026-08-15T10:00:00.000+00:00', '2026-08-15T10:00:00Z')).toBe(
        false,
      );
    });

    it('vergleicht ueber Offsets hinweg korrekt', () => {
      // 12:00 in +02:00 ist 10:00 UTC — also gleich alt wie der
      // Lesezeitpunkt, damit gelesen. Als Text ist '...T10:00:00Z' <
      // '...T12:00:00+02:00' wahr, der String-Vergleich haette hier
      // ungelesen gemeldet.
      expect(isThreadUnread('2026-08-15T12:00:00+02:00', '2026-08-15T10:00:00Z')).toBe(false);
    });

    it('erkennt eine echte neue Nachricht auch ueber Offsets hinweg', () => {
      // 12:00:01 in +02:00 ist 10:00:01 UTC — eine Sekunde nach dem
      // Lesezeitpunkt.
      expect(isThreadUnread('2026-08-15T12:00:01+02:00', '2026-08-15T10:00:00Z')).toBe(true);
    });
  });

  describe('unlesbare Werte', () => {
    it('gilt als gelesen, wenn der Nachrichten-Zeitpunkt unlesbar ist', () => {
      // Ohne verwertbaren Zeitpunkt gibt es nichts, das neuer sein
      // koennte — sonst haette der Bewohner einen Punkt an der Zeile,
      // den kein Oeffnen je wegbekaeme.
      expect(isThreadUnread('gestern', READ)).toBe(false);
    });

    it('gilt als ungelesen, wenn der Lesezeitpunkt unlesbar ist', () => {
      // Andersherum ist nicht belegt, dass der Thread gesehen wurde.
      expect(isThreadUnread(READ, 'irgendwann')).toBe(true);
    });

    it('gilt als gelesen, wenn beide Werte unlesbar sind', () => {
      // Der Nachrichten-Check greift zuerst: ohne verwertbares
      // last_message_at ist die Frage nach dem Lesezeitpunkt gegenstandslos.
      expect(isThreadUnread('gestern', 'irgendwann')).toBe(false);
    });

    it('behandelt Leerstrings wie fehlende Werte', () => {
      expect(isThreadUnread(READ, '')).toBe(true);
      expect(isThreadUnread('', READ)).toBe(false);
    });
  });

  it('liefert immer einen echten boolean', () => {
    // Die abgeloeste Fassung in portal/messages/page.tsx konnte dank
    // `lastRead || (t.last_message_at && ...)` auch null liefern. In JSX
    // fiel das nicht auf, in einem .filter() waere es ein stiller Bug.
    for (const lastMessageAt of [null, undefined, '', READ, 'gestern']) {
      for (const lastReadAt of [null, undefined, '', READ, 'irgendwann']) {
        expect(typeof isThreadUnread(lastMessageAt, lastReadAt)).toBe('boolean');
      }
    }
  });
});
