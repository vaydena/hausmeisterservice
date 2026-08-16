import 'server-only';
import { cache } from 'react';
import * as Sentry from '@sentry/nextjs';
import { createPlatformServiceClient } from '@/lib/supabase/platform';

/**
 * Sprint 123: Ist dieser User Plattform-Admin? Reine Anzeige-Frage.
 *
 * Warum es diese Funktion neben `getPlatformAdminContext` gibt — und warum
 * sie als einzige Stelle im Projekt einen Query-Fehler verschluckt:
 *
 * `requirePlatformAdmin` entscheidet ueber ZUGANG. Dort ist Werfen richtig:
 * ein verschluckter Fehler wuerde den Betreiber aus seiner eigenen
 * Verwaltung aussperren, und zwar mit einer Begruendung, die nach einem
 * Rechteproblem aussieht statt nach der Stoerung, die es wirklich war
 * (Sprint 104).
 *
 * Hier entscheidet das Ergebnis ueber EINEN MENUEEINTRAG. Der Aufrufer ist
 * das Layout des gesamten Staff-Bereichs — es laeuft bei jedem Kunden, bei
 * jedem Seitenaufruf. Wuerde diese Abfrage werfen, saehe JEDER Kunde eine
 * Fehlerseite statt seiner Anwendung, weil beim Betreiber eine
 * Verwaltungsfunktion nicht erreichbar ist. Das ist die falsche Richtung
 * von Kollateralschaden.
 *
 * Der Fall ist nicht hypothetisch: `platform` muss in Supabase unter
 * "Exposed schemas" freigeschaltet sein, damit PostgREST es ueberhaupt
 * sieht. Ist es das nicht, liefert genau diese Abfrage einen Fehler —
 * waehrend die Staff-Anwendung selbst tadellos funktioniert.
 *
 * Verschluckt heisst nicht unsichtbar: der Fehler geht an Sentry. Nur der
 * Kunde bekommt ihn nicht zu sehen, weil er ihn nichts angeht.
 */
export const isPlatformAdmin = cache(async (userId: string): Promise<boolean> => {
  try {
    const { data, error } = await createPlatformServiceClient()
      .from('admins')
      .select('user_id')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) {
      Sentry.captureException(
        new Error(`Plattform-Admin-Pruefung fehlgeschlagen: ${error.message}`),
        { extra: { userId, code: error.code, hint: error.hint } },
      );
      return false;
    }

    return data !== null;
  } catch (err) {
    Sentry.captureException(err, { extra: { userId, where: 'isPlatformAdmin' } });
    return false;
  }
});
