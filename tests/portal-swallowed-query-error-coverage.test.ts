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

/**
 * Die DSGVO-Export-Routen (Sprint 105).
 *
 * Wieder eine andere Folge als in den beiden Schichten darueber. Hier wird
 * aus einem verschluckten Fehler kein Leerzustand und keine falsche
 * Berechtigungsantwort, sondern eine unvollstaendige Auskunft, die sich
 * selbst als vollstaendig bezeichnet: `export_meta.legal_basis` behauptet im
 * selben Dokument, es enthalte ALLE zum Konto gespeicherten Daten. Der
 * Betroffene haelt seine Art.-15-Anfrage damit fuer beantwortet.
 *
 * Beide Routen liegen ausserhalb von PORTAL_DIRS — auch die Portal-Variante,
 * die unter src/app/api/portal/ und nicht unter src/app/(portal)/ steht.
 */
const EXPORT_ROUTES = [
  'src/app/api/privacy/export/route.ts',
  'src/app/api/portal/privacy/export/route.ts',
];

/**
 * Die Automations-Oberflaeche (Sprint 106).
 *
 * Die vierte Folge-Klasse und die einzige ohne Zuschauer: die Engine laeuft
 * als Cron. Ein verschluckter Fehler wurde hier nicht zu einem Leerzustand,
 * den jemand sieht, sondern zu einem Lauf, der sich selbst als sauber
 * protokolliert — `match_count: 0`, `last_error: null`. Die Mahnung ging nie
 * raus, und die Lauf-Historie bestaetigt, dass alles funktioniert hat.
 *
 * Zwei Stellen kippen dabei sogar in die andere Richtung: `?? []` auf der
 * Dispatch-Abfrage laesst die Doppel-Versand-Sperre OFFEN ausfallen, und der
 * ungeprueft geschriebene Dispatch-Log erzeugt dieselbe Folge vom anderen
 * Ende. Das ist im ganzen Bogen 103–106 der einzige Fall, in dem ein
 * verschluckter Fehler eine aussenwirksame, nicht ruecknehmbare Aktion
 * ausloest statt einer Unterlassung — versendete E-Mails holt niemand zurueck.
 */
const AUTOMATION_FILES = [
  'src/lib/automations/engine.ts',                    // -> stille Nicht-Ausfuehrung + Doppel-Versand
  'src/app/(app)/settings/automations/actions.ts',    // -> "Regel nicht gefunden" bei Stoerung
];

/**
 * Der Rechnungspfad (Sprint 107).
 *
 * Die fuenfte Folge-Klasse: hier wird aus einem verschluckten Fehler weder
 * ein Leerzustand noch eine Unterlassung, sondern eine FALSCHE ZAHL auf einem
 * rechtsverbindlichen Dokument — und zwar auf einem, das anschliessend das
 * Haus verlaesst.
 *
 *   - `recalcInvoiceTotals` rechnete bei einem Query-Fehler aus einer leeren
 *     Liste und schrieb die Beleg-Summe auf 0. Ein Lesefehler wurde damit zu
 *     einem falschen Wert IN DER DATENBANK.
 *   - `loadBillingDocumentData` nimmt die Summen aus dem Kopfsatz, die
 *     Positionen und die Umsatzsteuerzeile aber aus einer eigenen Query. Fiel
 *     die aus, stand im PDF ein Gesamtbetrag ohne eine einzige Position und
 *     ohne ausgewiesene Steuer — nach §14 Abs. 4 UStG keine gueltige Rechnung.
 *     Der Fallback `tenant?.name ?? 'Ihr Unternehmen'` stellte sie zusaetzlich
 *     unter einem Absender aus, den es nicht gibt.
 *   - `addLineItemAction` liess die Positionsnummerierung bei einem Fehler
 *     wieder bei 1 beginnen.
 *
 * Derselbe Loader haengt das PDF an die ausgehende E-Mail. Wie in Sprint 106
 * ist der Schaden damit nicht mehr einzusammeln — anders als dort ist er aber
 * auch fuer den Empfaenger nicht erkennbar: eine Rechnung ueber den falschen
 * Betrag sieht aus wie eine ueber den richtigen.
 */
const BILLING_FILES = [
  'src/lib/pdf/loader.ts',                      // -> PDF mit Summe ohne Positionen
  'src/app/(app)/billing/actions.ts',           // -> gespeicherte Summe auf 0
  'src/app/(app)/billing/email-actions.ts',     // -> versandte Rechnung bleibt Entwurf
  'src/app/(app)/billing/invoices/[id]/page.tsx',
  'src/app/(app)/billing/offers/[id]/page.tsx',
];

/**
 * Die Zeiterfassung (Sprint 108).
 *
 * Die sechste Folge-Klasse und die erste, in der die falsche Auskunft den
 * Nutzer ueber SEINEN EIGENEN Zustand betrifft — nachpruefbar falsch in dem
 * Moment, in dem sie erscheint:
 *
 *   - `punchOutAction` antwortete bei einer gescheiterten Query "Es laeuft
 *     aktuell keine offene Zeit." Der Mitarbeiter steht davor, WEIL die Zeit
 *     laeuft. Der Eintrag blieb mit end_at NULL liegen.
 *   - `resolveOwnEmployeeId` antwortete "Kein aktiver Mitarbeiter-Datensatz
 *     fuer Ihren Account." — eine Aussage ueber das Arbeitsverhaeltnis, die
 *     den Mitarbeiter zum Chef schickt statt zum Support.
 *
 * Die zweite Haelfte ist der Rechenweg: Wochensumme, Team-Uebersicht,
 * Zeitbericht und der CSV-Export fuer die Lohnabrechnung filtern alle auf
 * `end_at`. Ein `?? []` wurde dort zu WENIGER STUNDEN — nicht zu einer
 * Fehlermeldung und nicht zu einer leeren Seite, sondern zu einer
 * plausiblen, zu niedrigen Zahl auf einem Nachweis, der Lohngrundlage ist
 * und nach §16 Abs. 2 ArbZG zwei Jahre aufzubewahren ist. Anders als beim
 * Rechnungspfad (107) gibt es hier kein Dokument, dem man den Fehler ansehen
 * koennte: eine Woche mit 32 statt 38 Stunden sieht aus wie eine kurze Woche.
 */
const TIME_TRACKING_FILES = [
  'src/app/(app)/time-tracking/actions.ts',              // -> "keine offene Zeit", waehrend sie laeuft
  'src/app/(app)/time-tracking/page.tsx',                // -> Wochensumme 0:00
  'src/app/(app)/time-tracking/team/page.tsx',           // -> Team-Uebersicht ohne Stunden
  'src/app/(app)/time-tracking/new/page.tsx',
  'src/app/(app)/time-tracking/[id]/edit/page.tsx',
  'src/app/(app)/time-tracking/[id]/correction/page.tsx',
  'src/app/(app)/reports/time/page.tsx',                 // -> zu wenig ausgewiesene Stunden
  'src/app/(app)/reports/time/export/route.ts',          // -> CSV fuer die Lohnabrechnung
  'src/app/(app)/time-corrections/page.tsx',             // -> "keine offenen Antraege" bei Stoerung
  'src/app/(app)/time-corrections/[id]/page.tsx',        // -> Freigabe ohne sichtbaren Ist-Stand
];

/** Alles ausserhalb der Portal-Verzeichnisse, das trotzdem abgedeckt ist. */
const LISTED_FILES = [
  ...GUARD_FILES,
  ...EXPORT_ROUTES,
  ...AUTOMATION_FILES,
  ...BILLING_FILES,
  ...TIME_TRACKING_FILES,
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
  ...LISTED_FILES.map((f) => join(process.cwd(), f)),
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

describe('Portal + Guards + DSGVO-Export + Automations + Billing + Zeiterfassung: keine verschluckten Query-Fehler', () => {
  describe('sanity: Scanner findet ueberhaupt Dateien', () => {
    it('erfasst die Portal-Verzeichnisse', () => {
      expect(SCANNED_FILES.length).toBeGreaterThan(20);
    });

    it.each(LISTED_FILES)('einzeln gelistete Datei existiert noch: %s', (listed) => {
      // Ohne diese Pruefung wuerde ein Umbenennen oder Verschieben die
      // Abdeckung dieser Datei still entfernen: SCANNED_FILES filtert
      // nicht-existente Pfade heraus, und ein Test, der nichts scannt,
      // ist gruen. Guard-Schicht und Export-Routen sind genau die Stellen,
      // an denen stiller Erfolg am teuersten ist.
      expect(
        existsSync(join(process.cwd(), listed)),
        `${listed} steht in GUARD_FILES, EXPORT_ROUTES, AUTOMATION_FILES, BILLING_FILES ` +
          `bzw. TIME_TRACKING_FILES, ` +
          `existiert aber nicht (mehr). Pfad in der Liste korrigieren — oder wenn ` +
          `die Datei wirklich weg ist, den Eintrag mitsamt Begruendung entfernen.`,
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
