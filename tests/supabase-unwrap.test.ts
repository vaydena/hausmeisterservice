import { describe, it, expect } from 'vitest';
import {
  SupabaseQueryError,
  unwrapMaybeRow,
  unwrapRows,
  unwrapRowsWithCount,
} from '@/lib/supabase/unwrap';

/**
 * Sprint 103. Die Testfaelle spiegeln die zwei Zustaende, die vorher nicht
 * unterscheidbar waren: "es gibt nichts" und "die Query ist gescheitert".
 * Der wichtigste Test ist deshalb nicht der werfende, sondern der NICHT
 * werfende — wenn eine legitim leere Liste hier eine Fehlerseite ausloest,
 * ist der Helper schlimmer als das Problem, das er loesen soll.
 */

/** Die Fehlerform, mit der der 42P17-Bug tatsaechlich zurueckkam. */
const RECURSION_ERROR = {
  code: '42P17',
  message: 'infinite recursion detected in policy for relation "message_thread_participants"',
  details: null,
  hint: null,
};

describe('unwrapRows', () => {
  it('reicht geladene Zeilen unveraendert durch', () => {
    const rows = [{ id: 'a' }, { id: 'b' }];
    expect(unwrapRows({ data: rows, error: null }, 'Test')).toBe(rows);
  });

  it('behandelt die legitim leere Liste als Erfolg, nicht als Fehler', () => {
    expect(unwrapRows({ data: [], error: null }, 'Test')).toEqual([]);
  });

  it('behandelt data:null ohne error ebenfalls als leer', () => {
    // Kommt bei head-Queries und einigen RPC-Formen vor. Ohne error ist das
    // kein Stoerfall.
    expect(unwrapRows({ data: null, error: null }, 'Test')).toEqual([]);
  });

  it('wirft, wenn die Query gescheitert ist', () => {
    expect(() =>
      unwrapRows({ data: null, error: RECURSION_ERROR }, 'Portal: Nachrichten-Threads'),
    ).toThrow(SupabaseQueryError);
  });

  it('nennt Kontext, Code und Ursache in der Meldung', () => {
    // Das ist der Text, der in Sentry als Issue-Titel landet.
    expect(() =>
      unwrapRows({ data: null, error: RECURSION_ERROR }, 'Portal: Nachrichten-Threads'),
    ).toThrow(
      /Portal: Nachrichten-Threads fehlgeschlagen \[42P17\]: infinite recursion/,
    );
  });

  it('wirft auch dann, wenn zusaetzlich data gesetzt ist', () => {
    // Teilergebnis plus Fehler ist kein brauchbarer Zustand — lieber laut.
    expect(() => unwrapRows({ data: [{ id: 'a' }], error: RECURSION_ERROR }, 'Test')).toThrow(
      SupabaseQueryError,
    );
  });

  it('haengt keine Klammern an, wenn der Fehler keinen Code hat', () => {
    expect(() => unwrapRows({ data: null, error: { message: 'boom' } }, 'Test')).toThrow(
      'Test fehlgeschlagen: boom',
    );
  });

  it('uebernimmt code, details und hint in die Exception', () => {
    try {
      unwrapRows(
        { data: null, error: { code: '42501', message: 'denied', details: 'd', hint: 'h' } },
        'Test',
      );
      expect.unreachable('haette werfen muessen');
    } catch (err) {
      const e = err as SupabaseQueryError;
      expect(e).toBeInstanceOf(SupabaseQueryError);
      expect(e.name).toBe('SupabaseQueryError');
      expect(e.code).toBe('42501');
      expect(e.details).toBe('d');
      expect(e.hint).toBe('h');
    }
  });
});

describe('unwrapRowsWithCount', () => {
  it('liefert Zeilen und Zaehler', () => {
    const res = unwrapRowsWithCount({ data: [{ id: 'a' }], count: 7, error: null }, 'Test');
    expect(res).toEqual({ rows: [{ id: 'a' }], count: 7 });
  });

  it('macht aus count:null eine 0, solange kein Fehler vorliegt', () => {
    expect(unwrapRowsWithCount({ data: [], count: null, error: null }, 'Test')).toEqual({
      rows: [],
      count: 0,
    });
  });

  it('wirft bei Fehler, statt 0 als Kennzahl auszuweisen', () => {
    expect(() =>
      unwrapRowsWithCount({ data: null, count: null, error: RECURSION_ERROR }, 'Test'),
    ).toThrow(SupabaseQueryError);
  });
});

describe('unwrapMaybeRow', () => {
  it('liefert die Zeile', () => {
    expect(unwrapMaybeRow({ data: { id: 'a' }, error: null }, 'Test')).toEqual({ id: 'a' });
  });

  it('liefert null bei maybeSingle() ohne Treffer', () => {
    expect(unwrapMaybeRow({ data: null, error: null }, 'Test')).toBeNull();
  });

  it('liefert null bei single() ohne Treffer (PGRST116)', () => {
    // "Kein Treffer" ist hier ein erwarteter Fall — der Aufrufer macht
    // daraus notFound(). Das darf keine Fehlerseite werden.
    expect(
      unwrapMaybeRow(
        { data: null, error: { code: 'PGRST116', message: 'no rows returned' } },
        'Test',
      ),
    ).toBeNull();
  });

  it('wirft bei jedem anderen Fehler', () => {
    expect(() => unwrapMaybeRow({ data: null, error: RECURSION_ERROR }, 'Test')).toThrow(
      SupabaseQueryError,
    );
  });
});
