import { describe, it, expect } from 'vitest';
import {
  describeAbortedRun,
  describeDispatchLogFailure,
  technicalMessage,
} from '@/lib/automations/run-failures';

/**
 * Sprint 106: Diese Texte landen in `automation_rules.last_error` und
 * `automation_runs.error` — den beiden Feldern, die die Automations-Oberfläche
 * anzeigt und die bis zu diesem Sprint immer leer waren.
 *
 * Geprüft wird deshalb nicht die Formulierung, sondern die Aussage: ob der
 * Text sagt, was mit den Aktionen passiert ist. "Es wurde nichts versendet"
 * und "es könnte doppelt versendet werden" führen zu entgegengesetztem
 * Handeln, und ein Betreiber, der das falsche liest, tut das Falsche.
 */

const RECURSION_ERROR = new Error(
  'Automation: bereits ausgelöste Dispatches fehlgeschlagen [42P17]: infinite recursion detected in policy for relation "automation_dispatches"',
);

describe('describeAbortedRun', () => {
  it('nennt die Phase, in der abgebrochen wurde', () => {
    expect(describeAbortedRun('evaluate', RECURSION_ERROR)).toContain('Trigger-Auswertung');
    expect(describeAbortedRun('dispatch-filter', RECURSION_ERROR)).toContain(
      'Doppel-Versand-Prüfung',
    );
    expect(describeAbortedRun('recipients', RECURSION_ERROR)).toContain(
      'Empfänger-/Absender-Ermittlung',
    );
  });

  it('sagt zu, dass nichts versendet wurde, und dass der nächste Lauf es erneut versucht', () => {
    // Ohne beide Halbsätze bleibt die dringlichste Frage offen: muss ich
    // jetzt manuell nacharbeiten oder auf Doppel-Versand achten?
    const text = describeAbortedRun('evaluate', RECURSION_ERROR);
    expect(text).toContain('nichts');
    expect(text).toContain('versendet');
    expect(text).toContain('nächste Lauf');
  });

  it('hängt die technische Meldung an', () => {
    // Anders als bei der DSGVO-Auskunft (Sprint 105) liest das hier ein
    // Mitarbeiter mit automations.manage. Der Unterschied zwischen einer
    // rekursiven Policy und einem Timeout entscheidet, wen er ruft.
    const text = describeAbortedRun('dispatch-filter', RECURSION_ERROR);
    expect(text).toContain('42P17');
    expect(text).toContain('infinite recursion');
  });
});

describe('describeDispatchLogFailure', () => {
  const text = describeDispatchLogFailure(7, RECURSION_ERROR);

  it('stellt die Zahl der bereits ausgeführten Aktionen voran', () => {
    expect(text).toContain('7 Aktion(en)');
    expect(text).toContain('ausgeführt');
  });

  it('warnt ausdrücklich vor dem Doppel-Versand', () => {
    // Der wichtigste Satz des ganzen Sprints: hier ist der Schaden nicht mehr
    // abzuwenden, sondern nur noch einzugrenzen — und nur, wenn der Betreiber
    // es erfährt, bevor der nächste Cron-Zyklus läuft.
    expect(text).toContain('Doppel-Versand');
    expect(text).toContain('nächsten Lauf');
  });

  it('behauptet NICHT, es sei nichts versendet worden', () => {
    // Die Gegenprobe zu describeAbortedRun. Genau diese Verwechslung wäre
    // wieder derselbe Fehler: eine beruhigende Aussage, die nicht stimmt.
    expect(text).not.toContain('es wurde nichts versendet');
    expect(text).not.toContain('abgebrochen');
  });
});

describe('technicalMessage', () => {
  it('reicht kurze Meldungen unverändert durch', () => {
    expect(technicalMessage(new Error('canceling statement due to statement timeout'))).toBe(
      'canceling statement due to statement timeout',
    );
  });

  it('kürzt lange Meldungen, damit last_error als Panel lesbar bleibt', () => {
    const long = `${'x'.repeat(500)}`;
    const out = technicalMessage(new Error(long));
    expect(out).toHaveLength(401);
    expect(out.endsWith('…')).toBe(true);
  });

  it('kommt mit geworfenen Nicht-Errors zurecht', () => {
    // supabase-js wirft nicht, aber die Aktions-Phase ruft fremden Code
    // (E-Mail-Provider, web-push) auf, und der wirft auch schon mal Strings.
    expect(technicalMessage('kaputt')).toBe('kaputt');
    expect(technicalMessage(undefined)).toBe('undefined');
  });
});
