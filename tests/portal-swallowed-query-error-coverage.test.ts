import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';

/**
 * Sprint 103: Verhindert die Rueckkehr des Musters, das den 42P17-Bug im
 * Messaging monatelang unsichtbar gehalten hat.
 *
 *     const { data: threads } = await supabase.from('message_threads')...
 *     (threads ?? []).filter(...)
 *
 * supabase-js wirft nicht — es liefert `{ data: null, error }`. Wer nur
 * `data` destrukturiert, verliert den Fehler, und `?? []` macht daraus einen
 * Leerzustand, der exakt wie "es gibt nichts" aussieht. Im Portal ist das
 * besonders teuer: der Bewohner liest "Sie haben keine Nachrichten" und
 * glaubt, seine Verwaltung habe sich nicht gemeldet.
 *
 * Abgedeckt sind das Bewohner-Portal (src/app/(portal), src/lib/portal) und
 * die Guard-Schicht (GUARD_FILES, siehe unten). Der restliche Staff-Bereich
 * nutzt dasselbe Muster an rund 240 Stellen; das in einem Sprint umzustellen
 * waere eine Blindueberholung des halben Codebestands. Die Ausweitung auf
 * (app) ist ein eigener Scope — siehe README/Backlog, nicht ein stiller
 * Anhang an diesen Test.
 *
 * Bekannte Luecke der Detektoren: verschachtelte Destrukturierung der Form
 * `const { data: { user } } = await ...` wird von DESTRUCTURE_STATEMENT
 * nicht erfasst, weil das Muster nicht ueber die innere `}` hinweg matcht.
 * In der Praxis ist das ausschliesslich `supabase.auth.getUser()`, das
 * ohnehin auf der Ausnahmeliste steht — aber es ist eine Luecke und keine
 * Garantie.
 */

const PORTAL_DIRS = [
  join(process.cwd(), 'src', 'app', '(portal)'),
  join(process.cwd(), 'src', 'lib', 'portal'),
];

/**
 * Die Guard-Schicht (Sprint 104).
 *
 * Diese Dateien sind einzeln aufgefuehrt statt ueber ein Verzeichnis
 * eingesammelt, weil sie sich nicht durch ihren Ort auszeichnen, sondern
 * durch ihre Wirkung: sie beantworten keine Datenfrage, sondern eine
 * Berechtigungsfrage. Ein verschluckter Fehler wird hier nicht zu einer
 * leeren Liste, sondern zu einer falschen Antwort — "kein Zugang", "keine
 * Rechte", "Abo gesperrt", "bitte upgraden". Alle scheitern fail-closed und
 * alle schieben die Schuld auf den Kunden statt auf die Stoerung.
 *
 * Die Liste wird unten auf Existenz geprueft: wird eine Datei umbenannt oder
 * verschoben, faellt der Test auf, statt die Abdeckung still zu verlieren.
 */
const GUARD_FILES = [
  'src/lib/tenant/current.ts',            // -> /no-access
  'src/lib/tenant/subscription-guard.ts', // -> /zahlung-erforderlich
  'src/lib/tenant/features.ts',           // -> /settings/subscription?upgrade=
  'src/lib/permissions/effective.ts',     // -> leeres Rechte-Set
  'src/lib/modules/enabled.ts',           // -> Navigation ohne Zusatzmodule
  'src/lib/platform/require-admin.ts',    // -> /no-access
  'src/lib/auth/ensure-tenant.ts',        // -> Tarifwahl geht still verloren
];

function walk(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const abs = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(abs));
    else if (entry.isFile() && /\.tsx?$/.test(entry.name)) out.push(abs);
  }
  return out;
}

interface ScannedFile {
  file: string;
  source: string;
}

const SCANNED_FILES: ScannedFile[] = [
  ...PORTAL_DIRS.flatMap(walk),
  ...GUARD_FILES.map((f) => join(process.cwd(), f)),
]
  .filter((abs) => existsSync(abs))
  .map((abs) => ({
    file: relative(process.cwd(), abs).replace(/\\/g, '/'),
    source: readFileSync(abs, 'utf8'),
  }))
  .sort((a, b) => a.file.localeCompare(b.file));

/**
 * Muster 1 — der Leerlisten-Fallback auf einem Query-Result.
 *
 * `foo.data ?? []`, `res.data ?? 0`, `res.count ?? 0`. Genau hier wird aus
 * einem Fehler ein plausibler Normalzustand. Ein `?? []` auf einer bereits
 * ausgepackten Variable ist dagegen harmlos und wird nicht getroffen, weil
 * das Muster den `.data`/`.count`-Zugriff verlangt.
 */
const EMPTY_FALLBACK = /\.(data|count)\s*\?\?\s*(\[\]|0)/g;

/**
 * Muster 2 — `const { data } = await ...` ohne `error` daneben.
 *
 * Erfasst wird die ganze Anweisung bis zum abschliessenden Semikolon, damit
 * die Ausnahmen unten am vollstaendigen Aufruf geprueft werden koennen und
 * nicht nur an der ersten Zeile.
 */
const DESTRUCTURE_STATEMENT = /const\s*\{\s*data[^}]*\}\s*=\s*await[\s\S]*?;/g;

/**
 * Aufrufe, bei denen `const { data }` in Ordnung ist:
 *
 *  - `.auth.` — die GoTrue-Methoden (getUser, signInWithPassword, mfa.*)
 *    haben eine eigene Fehlersemantik und werden von den Call-Sites bereits
 *    explizit behandelt; unwrapRows passt auf ihre Result-Form nicht.
 *  - `.storage.` — eine fehlgeschlagene Signed URL heisst "keine Vorschau
 *    fuer diesen einen Anhang" und wird als url: null gerendert. Das ist ein
 *    echter Teilausfall, kein Grund die ganze Seite zu werfen.
 *  - `error` im selben Statement — wer den Fehler destrukturiert, hat ihn
 *    nicht verloren; ob er ihn korrekt behandelt, ist eine Review-Frage,
 *    keine, die ein Regex beantwortet.
 */
// \b statt eines nachgestellten Punktes: `supabase.storage` steht oft am
// Zeilenende und der `.from(...)`-Aufruf beginnt erst in der naechsten Zeile.
// Ein `\.storage\.` wuerde diese Schreibweise verfehlen und den Aufruf
// faelschlich als Verstoss melden.
const ALLOWED_IN_STATEMENT = [
  { pattern: /\.auth\b/, name: '.auth.* (eigene Fehlersemantik)' },
  { pattern: /\.storage\b/, name: '.storage.* (Teilausfall ist zulaessig)' },
  { pattern: /\berror\b/, name: 'error wird mitdestrukturiert' },
];

function isAllowedStatement(stmt: string): boolean {
  return ALLOWED_IN_STATEMENT.some((a) => a.pattern.test(stmt));
}

function findEmptyFallbacks(source: string): string[] {
  return Array.from(source.matchAll(EMPTY_FALLBACK)).map((m) => m[0]);
}

function findBareDestructures(source: string): string[] {
  return Array.from(source.matchAll(DESTRUCTURE_STATEMENT))
    .map((m) => m[0])
    .filter((stmt) => !isAllowedStatement(stmt))
    // Nur die erste Zeile in die Meldung, damit der Report lesbar bleibt.
    .map((stmt) => (stmt.split('\n')[0] ?? stmt).trim());
}

const FIX_HINT =
  'Nutze die Helper aus @/lib/supabase/unwrap: unwrapRows(result, "Kontext") fuer Listen, ' +
  'unwrapRowsWithCount fuer Queries mit { count: "exact" }, unwrapMaybeRow fuer .maybeSingle(). ' +
  'Sie werfen bei gesetztem error und liefern sonst die Daten — eine legitim leere Liste ' +
  '(data: [], error: null) laeuft unveraendert durch. Wenn an dieser Stelle bewusst NICHT ' +
  'geworfen werden soll (z. B. in einem Login-Formular, wo eine lesbare Meldung besser ist ' +
  'als eine Fehlerseite), destrukturiere `error` explizit und behandle ihn sichtbar.';

describe('Portal + Guards: keine verschluckten Query-Fehler', () => {
  describe('sanity: Scanner findet ueberhaupt Dateien', () => {
    it('erfasst die Portal-Verzeichnisse', () => {
      expect(SCANNED_FILES.length).toBeGreaterThan(20);
    });

    it.each(GUARD_FILES)('Guard-Datei existiert noch: %s', (guard) => {
      // Ohne diese Pruefung wuerde ein Umbenennen oder Verschieben die
      // Abdeckung dieser Datei still entfernen: SCANNED_FILES filtert
      // nicht-existente Pfade heraus, und ein Test, der nichts scannt,
      // ist gruen. Die Guard-Schicht ist genau die Stelle, an der
      // stiller Erfolg am teuersten ist.
      expect(
        existsSync(join(process.cwd(), guard)),
        `${guard} steht in GUARD_FILES, existiert aber nicht (mehr). Pfad in der ` +
          `Liste korrigieren — oder wenn der Guard wirklich weg ist, den Eintrag ` +
          `mitsamt Begruendung entfernen.`,
      ).toBe(true);
    });

    it('erkennt beide Fehlmuster in einem Negativbeispiel', () => {
      // Ohne diesen Test wuerde ein kaputtes Regex als "alles sauber"
      // durchgehen — genau die Sorte stiller Erfolg, gegen die dieser
      // Test antritt.
      expect(findEmptyFallbacks('const xs = res.data ?? [];')).toHaveLength(1);
      expect(findEmptyFallbacks('const n = res.count ?? 0;')).toHaveLength(1);
      expect(
        findBareDestructures("const { data: t } = await supabase.from('x').select();"),
      ).toHaveLength(1);
    });

    it('laesst die erlaubten Faelle durch', () => {
      expect(
        findBareDestructures('const { data, error } = await supabase.rpc("x");'),
      ).toHaveLength(0);
      expect(
        findBareDestructures('const { data: u } = await supabase.auth.getUser();'),
      ).toHaveLength(0);
      expect(
        findBareDestructures(
          'const { data: s } = await supabase.storage.from("a").createSignedUrl(p, 60);',
        ),
      ).toHaveLength(0);
      // Auch umgebrochen — genau diese Schreibweise hat die erste Fassung
      // des Regex faelschlich als Verstoss gemeldet:
      expect(
        findBareDestructures(
          'const { data: s } = await supabase.storage\n  .from("a")\n  .createSignedUrl(p, 60);',
        ),
      ).toHaveLength(0);
      expect(
        findBareDestructures('const { data: u } = await supabase.auth\n  .getUser();'),
      ).toHaveLength(0);
      // Bereits ausgepackte Variablen sind kein Query-Result:
      expect(findEmptyFallbacks('const xs = maybeList ?? [];')).toHaveLength(0);
    });
  });

  describe('kein `.data ?? []` / `.count ?? 0` auf einem Query-Result', () => {
    for (const f of SCANNED_FILES) {
      it(`${f.file}`, () => {
        const hits = findEmptyFallbacks(f.source);
        expect(
          hits,
          `${f.file} macht aus einem moeglichen Query-Fehler eine leere Liste bzw. eine 0: ${hits.join(', ')}. ` +
            `Damit ist "die Query ist gescheitert" von "es gibt nichts" nicht mehr unterscheidbar — ` +
            `genau so blieb der 42P17-RLS-Bug im Messaging monatelang unentdeckt. ${FIX_HINT}`,
        ).toEqual([]);
      });
    }
  });

  describe('kein `const { data }` ohne `error`', () => {
    for (const f of SCANNED_FILES) {
      it(`${f.file}`, () => {
        const hits = findBareDestructures(f.source);
        expect(
          hits,
          `${f.file} destrukturiert "data" aus einem Query-Result, ohne den Fehler mitzunehmen: ${hits.join(' | ')}. ` +
            `supabase-js wirft nicht — der Fehler ist damit ersatzlos verloren. ${FIX_HINT}`,
        ).toEqual([]);
      });
    }
  });
});
