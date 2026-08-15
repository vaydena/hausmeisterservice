import { describe, it, expect } from 'vitest';
import {
  isAnnouncementUnread,
  needsAcknowledgement,
  type AnnouncementReceiptLike,
} from '@/lib/portal/announcement-read-state';

const TS = '2026-08-15T10:00:00+00:00';

// Die vier Receipt-Zustaende, die in announcement_receipts real vorkommen.
const NO_RECEIPT = undefined;
const EMPTY: AnnouncementReceiptLike = { read_at: null, acknowledged_at: null };
const READ: AnnouncementReceiptLike = { read_at: TS, acknowledged_at: null };
const READ_AND_ACKED: AnnouncementReceiptLike = { read_at: TS, acknowledged_at: TS };

describe('isAnnouncementUnread', () => {
  it('ist ungelesen ohne receipt-Zeile', () => {
    expect(isAnnouncementUnread(NO_RECEIPT)).toBe(true);
  });

  it('ist ungelesen bei null statt undefined', () => {
    // Map.get() liefert undefined, .maybeSingle() dagegen null — beide
    // Aufrufformen kommen im Portal vor.
    expect(isAnnouncementUnread(null)).toBe(true);
  });

  it('ist ungelesen, solange read_at nicht gesetzt ist', () => {
    expect(isAnnouncementUnread(EMPTY)).toBe(true);
  });

  it('ist gelesen, sobald read_at einen Zeitstempel traegt', () => {
    expect(isAnnouncementUnread(READ)).toBe(false);
  });

  it('behandelt einen Leerstring wie einen fehlenden Zeitstempel', () => {
    expect(isAnnouncementUnread({ read_at: '' })).toBe(true);
  });

  it('ist ungelesen, wenn nur quittiert wurde ohne read_at', () => {
    // Sollte praktisch nicht auftreten — beide Ack-Pfade schreiben read_at
    // mit. Faellt der Fall doch an, ist "ungelesen" die sichere Antwort:
    // der Zaehler geht dann erst beim Oeffnen runter statt nie mehr hoch.
    expect(isAnnouncementUnread({ read_at: null, acknowledged_at: TS })).toBe(true);
  });
});

describe('needsAcknowledgement', () => {
  it('ist nie faellig, wenn die Ankuendigung keine Quittierung verlangt', () => {
    expect(needsAcknowledgement(false, NO_RECEIPT)).toBe(false);
    expect(needsAcknowledgement(false, EMPTY)).toBe(false);
    expect(needsAcknowledgement(false, READ)).toBe(false);
    expect(needsAcknowledgement(false, READ_AND_ACKED)).toBe(false);
  });

  it('ist faellig ohne receipt-Zeile', () => {
    expect(needsAcknowledgement(true, NO_RECEIPT)).toBe(true);
  });

  it('ist faellig, solange acknowledged_at fehlt', () => {
    expect(needsAcknowledgement(true, EMPTY)).toBe(true);
  });

  it('bleibt faellig, wenn der Bewohner nur gelesen hat', () => {
    // Der Kern der Trennung: Sprint 51 setzt read_at beim Oeffnen
    // implizit, die Quittierung verlangt weiter den Button-Klick.
    expect(needsAcknowledgement(true, READ)).toBe(true);
  });

  it('ist erledigt, sobald acknowledged_at gesetzt ist', () => {
    expect(needsAcknowledgement(true, READ_AND_ACKED)).toBe(false);
  });

  it('behandelt einen Leerstring wie eine fehlende Quittierung', () => {
    expect(needsAcknowledgement(true, { acknowledged_at: '' })).toBe(true);
  });

  it('gilt als nicht faellig, wenn requires_acknowledgement fehlt', () => {
    // Die Spalte ist `not null default false`, ueber ein Join-Ergebnis
    // oder einen Teil-Select kann trotzdem undefined ankommen. Dann
    // lieber keinen Handlungsdruck erzeugen, den niemand angefordert hat.
    expect(needsAcknowledgement(null, EMPTY)).toBe(false);
    expect(needsAcknowledgement(undefined, EMPTY)).toBe(false);
  });
});

describe('Zusammenspiel der beiden Praedikate', () => {
  it('haelt gelesen und quittiert auseinander', () => {
    // Genau dieser Zustand traegt die Priorisierung aus Sprint 87/88/89:
    // gelesene, aber noch nicht quittierte Aushaenge rutschen nach oben,
    // ohne dabei den Ungelesen-Badge zu setzen.
    expect(isAnnouncementUnread(READ)).toBe(false);
    expect(needsAcknowledgement(true, READ)).toBe(true);
  });

  it('liefert beides immer als echten boolean', () => {
    // Wichtig fuer die Sortier-Vergleiche in announcements/page.tsx und
    // dashboard/page.tsx: dort wird needsAckA === needsAckB geprueft,
    // und ein null aus `requires_acknowledgement && ...` waere gegen
    // false ungleich — die Reihenfolge zweier gleichrangiger Zeilen
    // wuerde dann willkuerlich kippen.
    const receipts: (AnnouncementReceiptLike | null | undefined)[] = [
      NO_RECEIPT,
      null,
      EMPTY,
      READ,
      READ_AND_ACKED,
      {},
    ];
    for (const receipt of receipts) {
      expect(typeof isAnnouncementUnread(receipt)).toBe('boolean');
      for (const requires of [true, false, null, undefined]) {
        expect(typeof needsAcknowledgement(requires, receipt)).toBe('boolean');
      }
    }
  });
});
