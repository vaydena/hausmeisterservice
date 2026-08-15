import { describe, it, expect } from 'vitest';
import {
  collectExportFailures,
  describeExportFailures,
  summarizeExportFailures,
} from '@/lib/privacy/export-failures';

/**
 * Sprint 105: Der Test, auf den es hier ankommt, ist nicht "Fehler werden
 * erkannt", sondern der Gegentest: ein Bewohner ohne Meldungen und ohne
 * Nachrichten muss weiterhin einen Export bekommen. Ein Helper, der jede
 * leere Kategorie fuer einen Ausfall haelt, wuerde genau den Nutzern die
 * Auskunft verweigern, die am wenigsten Daten haben.
 */

const RECURSION_ERROR = {
  code: '42P17',
  message: 'infinite recursion detected in policy for relation "messages"',
  details: null,
  hint: null,
};

const TIMEOUT_ERROR = {
  code: '57014',
  message: 'canceling statement due to statement timeout',
  details: null,
  hint: null,
};

describe('collectExportFailures', () => {
  it('meldet nichts, wenn alle Queries durchgelaufen sind', () => {
    expect(
      collectExportFailures({
        Profil: { error: null },
        Arbeitszeiten: { error: null },
      }),
    ).toEqual([]);
  });

  it('behandelt legitim leere Kategorien nicht als Ausfall', () => {
    // Der wichtigste Fall: PostgREST meldet "keine Treffer" als data: []
    // mit error: null. Ein neuer Bewohner hat in fast jeder Kategorie
    // nichts — er muss trotzdem seine Auskunft bekommen.
    expect(
      collectExportFailures({
        'Eigene Meldungen': { data: [], error: null },
        'Verfasste Nachrichten': { data: [], error: null },
        Profil: { data: null, error: null },
      } as Record<string, { error: null }>),
    ).toEqual([]);
  });

  it('ignoriert PGRST116 — .single() ohne Treffer ist ein Zustand', () => {
    expect(
      collectExportFailures({
        Profil: { error: { code: 'PGRST116', message: 'JSON object requested, 0 rows' } },
      }),
    ).toEqual([]);
  });

  it('meldet eine gescheiterte Kategorie mit Bereichsnamen und Code', () => {
    const failures = collectExportFailures({
      Profil: { error: null },
      'Verfasste Nachrichten': { error: RECURSION_ERROR },
    });
    expect(failures).toEqual([
      {
        category: 'Verfasste Nachrichten',
        code: '42P17',
        message: RECURSION_ERROR.message,
      },
    ]);
  });

  it('sammelt alle Ausfaelle, nicht nur den ersten', () => {
    // Der Grund fuer das Sammeln: eine rekursive Policy zerlegt selten nur
    // eine Tabelle. "Drei Bereiche betroffen" ist ein anderer Befund als
    // "ein Bereich betroffen" — und beim ersten Treffer abzubrechen spart
    // nichts, weil Promise.all ohnehin alles schon ausgefuehrt hat.
    const failures = collectExportFailures({
      Profil: { error: null },
      'Verfasste Nachrichten': { error: RECURSION_ERROR },
      'Teilnahme an Nachrichten-Verlaeufen': { error: RECURSION_ERROR },
      Arbeitszeiten: { error: TIMEOUT_ERROR },
    });
    expect(failures.map((f) => f.category)).toEqual([
      'Verfasste Nachrichten',
      'Teilnahme an Nachrichten-Verlaeufen',
      'Arbeitszeiten',
    ]);
  });

  it('kommt mit einem Fehler ohne Code zurecht', () => {
    const failures = collectExportFailures({
      Anmeldeverlauf: { error: { message: 'network error' } },
    });
    expect(failures[0]?.code).toBeUndefined();
    expect(failures[0]?.message).toBe('network error');
  });
});

describe('describeExportFailures', () => {
  const failures = collectExportFailures({
    'Verfasste Nachrichten': { error: RECURSION_ERROR },
    Arbeitszeiten: { error: TIMEOUT_ERROR },
  });
  const text = describeExportFailures(failures);

  it('nennt die betroffenen Bereiche beim Namen', () => {
    expect(text).toContain('Verfasste Nachrichten');
    expect(text).toContain('Arbeitszeiten');
  });

  it('sagt, dass bewusst nicht ausgeliefert wird', () => {
    // Ohne diese Begruendung liest sich die Meldung wie ein zufaelliger
    // Serverfehler, und der Betroffene versucht es woanders — statt zu
    // verstehen, dass seine Auskunft absichtlich zurueckgehalten wurde.
    expect(text).toContain('nicht vollstaendig');
    expect(text).toContain('bewusst nicht aus');
  });

  it('gibt die PostgREST-Meldung NICHT an den Betroffenen weiter', () => {
    // Tabellen- und Policy-Namen helfen dem Leser nicht und gehoeren nicht
    // in eine Nutzer-Antwort. Die Details stehen in Sentry.
    expect(text).not.toContain('policy for relation');
    expect(text).not.toContain('42P17');
    expect(text).not.toContain('statement timeout');
  });
});

describe('summarizeExportFailures', () => {
  it('stellt das Verhaeltnis voran und haengt die Technik an', () => {
    const failures = collectExportFailures({
      'Verfasste Nachrichten': { error: RECURSION_ERROR },
    });
    const summary = summarizeExportFailures(failures, 21);
    // "1 von 21" trennt die kaputte Einzeltabelle von der kaputten DB —
    // das ist die erste Frage beim Lesen des Sentry-Issues.
    expect(summary).toContain('1 von 21');
    expect(summary).toContain('42P17');
    expect(summary).toContain('Verfasste Nachrichten');
  });
});
