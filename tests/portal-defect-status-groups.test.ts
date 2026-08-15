import { describe, it, expect } from 'vitest';
import {
  DEFECT_STATUS_GROUPS,
  DEFECT_STATUS_GROUP_KEYS,
  countDefectGroups,
  isDefectStatusGroup,
} from '@/lib/portal/defect-status-groups';

describe('DEFECT_STATUS_GROUPS', () => {
  it('laesst die Gruppe alle ungefiltert', () => {
    // null heisst "kein .in()-Filter" — die Page darf daraus keinen
    // leeren Filter machen, sonst kaeme nie eine Zeile zurueck.
    expect(DEFECT_STATUS_GROUPS.alle).toBeNull();
  });

  it('deckt jeden bekannten defect_reports.status genau einmal ab', () => {
    // Die vier Stati stammen aus der CHECK-Constraint auf defect_reports.
    // Doppelt zugeordnet duerfte keiner sein: die Summe der Gruppen-
    // Zaehler waere sonst groesser als die Zeilenzahl.
    const assigned = DEFECT_STATUS_GROUP_KEYS.flatMap(
      (key) => DEFECT_STATUS_GROUPS[key] ?? [],
    );
    expect([...assigned].sort()).toEqual(['converted', 'new', 'rejected', 'reviewing']);
  });

  it('haelt die Tab-Reihenfolge mit alle vorne', () => {
    expect(DEFECT_STATUS_GROUP_KEYS).toEqual([
      'alle',
      'offen',
      'in_bearbeitung',
      'abgelehnt',
    ]);
  });
});

describe('isDefectStatusGroup', () => {
  it('erkennt jede Gruppe aus der Tabelle', () => {
    for (const key of DEFECT_STATUS_GROUP_KEYS) {
      expect(isDefectStatusGroup(key)).toBe(true);
    }
  });

  it('lehnt einen fehlenden Query-Parameter ab', () => {
    // ?status= fehlt ganz — die Page faellt dann auf 'alle' zurueck.
    expect(isDefectStatusGroup(undefined)).toBe(false);
  });

  it('lehnt einen rohen Status als Gruppenname ab', () => {
    // /portal/defects?status=converted ist kein Gruppenname, auch wenn
    // der Wert in der Tabelle vorkommt.
    expect(isDefectStatusGroup('converted')).toBe(false);
  });

  it('lehnt Unsinn und Leerstring ab', () => {
    expect(isDefectStatusGroup('')).toBe(false);
    expect(isDefectStatusGroup('offen; drop table')).toBe(false);
    expect(isDefectStatusGroup('Offen')).toBe(false);
  });

  it('faellt nicht auf geerbte Object-Eigenschaften herein', () => {
    // Ein `value in DEFECT_STATUS_GROUPS` haette hier true gesagt und die
    // Page mit einer Gruppe 'toString' weiterlaufen lassen.
    expect(isDefectStatusGroup('toString')).toBe(false);
    expect(isDefectStatusGroup('constructor')).toBe(false);
  });
});

describe('countDefectGroups', () => {
  it('zaehlt eine leere Liste als lauter Nullen', () => {
    expect(countDefectGroups([])).toEqual({
      alle: 0,
      offen: 0,
      in_bearbeitung: 0,
      abgelehnt: 0,
    });
  });

  it('fasst new und reviewing zu offen zusammen', () => {
    const counts = countDefectGroups(['new', 'reviewing', 'new']);
    expect(counts.offen).toBe(3);
    expect(counts.alle).toBe(3);
  });

  it('zaehlt jede Gruppe getrennt', () => {
    const counts = countDefectGroups([
      'new',
      'reviewing',
      'converted',
      'converted',
      'rejected',
    ]);
    expect(counts).toEqual({
      alle: 5,
      offen: 2,
      in_bearbeitung: 2,
      abgelehnt: 1,
    });
  });

  it('zaehlt einen unbekannten Status nur bei alle mit', () => {
    // Ein spaeter ergaenzter Status ohne Gruppe ist ueber die Tabs nicht
    // erreichbar. Ihn hilfsweise bei 'offen' mitzuzaehlen wuerde die
    // Zusage brechen, dass die Zahl am Tab der Zeilenzahl entspricht.
    const counts = countDefectGroups(['new', 'archived']);
    expect(counts.alle).toBe(2);
    expect(counts.offen).toBe(1);
    expect(counts.in_bearbeitung).toBe(0);
    expect(counts.abgelehnt).toBe(0);
  });

  it('haelt alle als Summe der uebrigen Gruppen, solange nur bekannte Stati vorkommen', () => {
    // Der eigentliche Punkt der Zaehler: die Tabs teilen die Menge auf,
    // sie ueberlappen sich nicht und verlieren nichts.
    const statuses = ['new', 'new', 'reviewing', 'converted', 'rejected', 'rejected'];
    const counts = countDefectGroups(statuses);
    expect(counts.offen + counts.in_bearbeitung + counts.abgelehnt).toBe(counts.alle);
  });

  it('laesst die uebergebene Liste unangetastet', () => {
    const statuses = ['new', 'converted'];
    countDefectGroups(statuses);
    expect(statuses).toEqual(['new', 'converted']);
  });
});
