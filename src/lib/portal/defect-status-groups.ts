/**
 * Sprint 102: Die Bewohner-Statusgruppen fuer Meldungen als eine Tabelle.
 *
 * Bis hierher standen die Gruppen nur in portal/defects/page.tsx, wo sie
 * ausschliesslich den Query-Filter (`.in('status', ...)`) gespeist haben.
 * Mit den Tab-Zaehlern gibt es einen zweiten Leser derselben Zuordnung,
 * und genau da faengt der Aerger an: haette der Zaehler die Zuordnung
 * eigenstaendig nachgebildet, koennte ein spaeter ergaenzter
 * defect_reports.status in der einen Fassung landen und in der anderen
 * nicht — der Tab meldete dann eine Zahl, die nach dem Klick nicht mehr
 * stimmt. Query-Filter und Zaehler lesen deshalb dieselbe Konstante.
 *
 * Eigenes Modul statt eines Exports aus der Page, weil Unit-Tests eine
 * Server-Komponente nicht laden koennen (sie haengt ueber
 * @/lib/supabase/server an @/lib/env, das sein Schema schon beim Import
 * parst). Dieselbe Trennung wie bei thread-read-state.ts (Sprint 100) und
 * announcement-read-state.ts (Sprint 101).
 */

export type DefectStatusGroup = 'alle' | 'offen' | 'in_bearbeitung' | 'abgelehnt';

/**
 * Bewohner-orientierte Statusgruppen (seit Sprint 63).
 *
 * 'offen' fasst zusammen, was aus Bewohnersicht auf eine Reaktion wartet,
 * 'in_bearbeitung' entspricht status='converted' (ein Auftrag wurde
 * erstellt), 'abgelehnt' ist rejected. `null` bei 'alle' heisst: kein
 * Status-Filter — nicht "keine Stati".
 *
 * Die Werte sind die rohen defect_reports.status-Werte und gehen so in
 * den PostgREST-`.in()`-Filter.
 */
export const DEFECT_STATUS_GROUPS: Record<DefectStatusGroup, readonly string[] | null> = {
  alle: null,
  offen: ['new', 'reviewing'],
  in_bearbeitung: ['converted'],
  abgelehnt: ['rejected'],
};

/**
 * Reihenfolge der Tabs in der Oberflaeche. Aus den Keys abgeleitet, damit
 * eine neue Gruppe nicht an zwei Stellen eingetragen werden muss —
 * Object.keys haelt die Einfuegereihenfolge fuer String-Keys ein.
 */
export const DEFECT_STATUS_GROUP_KEYS = Object.keys(
  DEFECT_STATUS_GROUPS,
) as DefectStatusGroup[];

/**
 * Ist der Wert aus dem ?status=-Query-Parameter eine bekannte Gruppe?
 *
 * Prueft gegen die Tabelle statt gegen eine handgeschriebene Kette von
 * ===-Vergleichen: sonst waere eine neue Gruppe zwar filterbar, aber
 * ueber die URL nicht erreichbar.
 */
export function isDefectStatusGroup(value: string | undefined): value is DefectStatusGroup {
  return value !== undefined && (DEFECT_STATUS_GROUP_KEYS as string[]).includes(value);
}

export type DefectGroupCounts = Record<DefectStatusGroup, number>;

/**
 * Zaehlt, wie viele Meldungen je Gruppe anfallen.
 *
 * Erwartet die Stati *aller* Meldungen, die die uebrigen Filter (Bewohner,
 * Suchbegriff) passieren — also gerade nicht die bereits nach Status
 * gefilterte Liste. Die zurueckgegebenen Zahlen sagen dem Bewohner
 * voraus, was ihn hinter dem jeweiligen Tab erwartet; sie duerfen deshalb
 * nur ueber genau die Menge laufen, die der Tab-Klick dann auch laedt.
 *
 * Unbekannte Stati zaehlen nur bei 'alle' mit. Das ist gewollt: ein neuer
 * Status ohne Gruppe ist ueber die Tabs nicht erreichbar, und ihn
 * hilfsweise irgendwo mitzuzaehlen wuerde die Zusage brechen, dass die
 * Zahl am Tab der Zeilenzahl dahinter entspricht.
 */
export function countDefectGroups(statuses: readonly string[]): DefectGroupCounts {
  const counts: DefectGroupCounts = {
    alle: statuses.length,
    offen: 0,
    in_bearbeitung: 0,
    abgelehnt: 0,
  };

  for (const status of statuses) {
    for (const group of DEFECT_STATUS_GROUP_KEYS) {
      const members = DEFECT_STATUS_GROUPS[group];
      if (members !== null && members.includes(status)) {
        counts[group] += 1;
      }
    }
  }

  return counts;
}
