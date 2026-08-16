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
 * Sprint 112 stellt diesen Test von handgepflegten Dateilisten auf ein
 * Verzeichnis um: gescannt wird jetzt der GESAMTE (app)-Bereich. Bis 111 war
 * die Abdeckung eine Aufzaehlung, und jede neue Datei im Staff-Bereich kam
 * ungeprueft dazu. Eine Liste, die man erweitern muss, um Abdeckung zu
 * behalten, verliert sie still — dieselbe Fehlerart, gegen die dieser Test
 * antritt, nur eine Ebene hoeher.
 *
 * Bekannte Luecke der Detektoren: verschachtelte Destrukturierung der Form
 * `const { data: { user } } = await ...` wird von DESTRUCTURE_STATEMENT
 * nicht erfasst, weil das Muster nicht ueber die innere `}` hinweg matcht.
 * In der Praxis ist das ausschliesslich `supabase.auth.getUser()`, das
 * ohnehin auf der Ausnahmeliste steht — aber es ist eine Luecke und keine
 * Garantie.
 */

/**
 * Ganze Verzeichnisse. Alles, was hier drunter liegt, ist abgedeckt — ohne
 * dass jemand eine Liste pflegen muss.
 */
const SCANNED_DIRS = [
  join(process.cwd(), 'src', 'app', '(portal)'), // Sprint 103
  join(process.cwd(), 'src', 'lib', 'portal'), //   Sprint 103
  join(process.cwd(), 'src', 'app', '(app)'), //    Sprint 112 — der ganze Staff-Bereich
  join(process.cwd(), 'src', 'app', 'platform'), // Sprint 116 — der Betreiber-Bereich
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
  'src/lib/tenant/current.ts', //            -> /no-access
  'src/lib/tenant/subscription-guard.ts', // -> /zahlung-erforderlich
  'src/lib/tenant/features.ts', //           -> /settings/subscription?upgrade=
  'src/lib/permissions/effective.ts', //     -> leeres Rechte-Set
  'src/lib/modules/enabled.ts', //           -> Navigation ohne Zusatzmodule
  'src/lib/platform/require-admin.ts', //    -> /no-access
  'src/lib/auth/ensure-tenant.ts', //        -> Tarifwahl geht still verloren
];

/**
 * Die DSGVO-Export-Routen (Sprint 105).
 *
 * Hier wird aus einem verschluckten Fehler kein Leerzustand und keine falsche
 * Berechtigungsantwort, sondern eine unvollstaendige Auskunft, die sich
 * selbst als vollstaendig bezeichnet: `export_meta.legal_basis` behauptet im
 * selben Dokument, es enthalte ALLE zum Konto gespeicherten Daten. Der
 * Betroffene haelt seine Art.-15-Anfrage damit fuer beantwortet.
 *
 * Beide Routen liegen unter src/app/api/ und damit ausserhalb der beiden
 * Route-Gruppen — auch die Portal-Variante.
 */
const EXPORT_ROUTES = [
  'src/app/api/privacy/export/route.ts',
  'src/app/api/portal/privacy/export/route.ts',
];

/**
 * Serverseitige Bibliotheken ausserhalb der Route-Gruppen, deren Folgen in
 * frueheren Sprints einzeln nachgewiesen wurden.
 *
 *  - `automations/engine.ts` (Sprint 106) ist die einzige Stelle im ganzen
 *    Bogen ohne Zuschauer: sie laeuft als Cron. Ein verschluckter Fehler
 *    wurde dort nicht zu einem sichtbaren Leerzustand, sondern zu einem Lauf,
 *    der sich selbst als sauber protokolliert (`match_count: 0`,
 *    `last_error: null`). Zwei Stellen kippten sogar in die Gegenrichtung:
 *    `?? []` auf der Dispatch-Abfrage liess die Doppel-Versand-Sperre OFFEN
 *    ausfallen. Das ist der einzige Fall im Bogen, in dem ein verschluckter
 *    Fehler eine aussenwirksame, nicht ruecknehmbare Aktion ausloest statt
 *    einer Unterlassung — versendete E-Mails holt niemand zurueck.
 *
 *  - `pdf/loader.ts` (Sprint 107) nimmt die Summen aus dem Kopfsatz, die
 *    Positionen und die Umsatzsteuerzeile aber aus einer eigenen Query. Fiel
 *    die aus, stand im PDF ein Gesamtbetrag ohne eine einzige Position und
 *    ohne ausgewiesene Steuer — nach §14 Abs. 4 UStG keine gueltige Rechnung.
 *    Derselbe Loader haengt das PDF an die ausgehende E-Mail; anders als bei
 *    106 ist der Schaden fuer den Empfaenger nicht einmal erkennbar, denn
 *    eine Rechnung ueber den falschen Betrag sieht aus wie eine ueber den
 *    richtigen.
 */
const LIB_FILES = ['src/lib/automations/engine.ts', 'src/lib/pdf/loader.ts'];

/**
 * Der Plattform-Layer (Sprint 116).
 *
 * Anlass ist ein Befund, den dieser Test haette liefern muessen und nicht
 * geliefert hat: das Schema `platform` war in PostgREST nie exponiert, jede
 * Query ueber createPlatformServiceClient() scheiterte live mit PGRST106 —
 * und die oeffentliche Preisseite zeigte daraufhin einfach keine Tarife.
 * Kein Fehler, kein Alarm, nur eine Verkaufsseite ohne Angebot. Der Scan
 * endete bis hier an den Route-Gruppen `(app)` und `(portal)`; /preise,
 * /platform und der Plattform-Rechnungs-PDF liegen ausserhalb und waren
 * damit nie abgedeckt.
 *
 * Warum es hier besonders zaehlt: der Plattform-Layer ist die einzige
 * Schicht, die BEIDE Seiten des Geschaefts traegt. Verschluckt der
 * Betreiber-Bereich einen Fehler, sieht /platform/payments wie "keine
 * offene Ueberweisung" aus und eine eingegangene Zahlung wird nie
 * bestaetigt; verschluckt die Preisseite einen, sieht das Produkt fuer
 * jeden Besucher aus, als gaebe es nichts zu kaufen.
 *
 * `src/lib/platform` steht einzeln statt als Verzeichnis: fuenf Dateien
 * liegen unter der Sanity-Schwelle des Verzeichnis-Scans (>5), und ein
 * Scan, der wegen zu weniger Dateien rot wird, hilft niemandem.
 */
const PLATFORM_FILES = [
  'src/app/preise/page.tsx', //                            oeffentliche Preisseite
  'src/app/api/platform/invoices/[id]/pdf/route.tsx', //    Beleg an den Mandanten
  'src/lib/platform/stats.ts',
  'src/lib/platform/billing.ts',
  'src/lib/platform/invoice-sender.ts',
  'src/lib/platform/bank-transfer.ts',
];

/**
 * Die Folge-Klassen, die der Bogen 103–112 im (app)-Bereich nachgewiesen hat.
 * Bis Sprint 111 stand jede davon als eigene Dateiliste in dieser Datei; seit
 * 112 deckt der Verzeichnis-Scan sie alle ab. Die Begruendungen bleiben, weil
 * sie das Einzige sind, was den Unterschied zwischen "Regex meckert" und
 * "hier haengt etwas dran" festhaelt:
 *
 *  - Automations-UI (106): "Regel nicht gefunden" bei einer Stoerung.
 *  - Rechnungen (107): `recalcInvoiceTotals` rechnete bei einem Query-Fehler
 *    aus einer leeren Liste und schrieb die Beleg-Summe auf 0 — ein
 *    Lesefehler wurde zu einem falschen Wert IN DER DATENBANK.
 *  - Zeiterfassung (108): `punchOutAction` antwortete "Es laeuft aktuell
 *    keine offene Zeit", waehrend sie lief; Wochensumme, Team-Uebersicht und
 *    der CSV-Export fuer die Lohnabrechnung wurden zu WENIGER STUNDEN. Eine
 *    Woche mit 32 statt 38 Stunden sieht aus wie eine kurze Woche.
 *  - Fristen (109): /maintenance meldete "Keine ueberfaelligen Wartungen",
 *    /vehicles zeigte kein TUEV-Badge. Ein verstrichener Prueftermin ist die
 *    einzige Folge im Bogen, die sich nachtraeglich nicht reparieren laesst.
 *    Dazu die erste umgedrehte Schutzregel: der Km-Stand soll nur steigen,
 *    aber bei einem Lesefehler wurde der Vergleichswert 0.
 *  - Schluessel (110): der ausgegebene Bestand existiert nirgends als
 *    gespeicherter Wert, er wird bei jedem Aufruf rekonstruiert. Ohne
 *    Ausgaben sieht jeder Schluessel vollzaehlig im Kasten aus. `totalOut`
 *    steuerte zusaetzlich den Loeschknopf.
 *  - Zaehler (111): die Plausibilitaetsregel `if (last && ...)` wurde bei
 *    einem Lesefehler nicht abgebrochen, sondern uebersprungen — und die
 *    Differenz zweier Zaehlerstaende ist der Verbrauch in der
 *    Betriebskostenabrechnung.
 *
 * Zwei Muster wiederholen sich dabei quer durch alle Module und sind der
 * Grund, warum dieser Test allein nicht reicht: eine Schranke, die NUR im
 * JSX steht (110, 111), und eine Regel, die nur in eine Richtung prueft
 * (109, 111). Beide bleiben gruen, wenn man nur das Fehler-Handling
 * repariert.
 */
const LISTED_FILES = [...GUARD_FILES, ...EXPORT_ROUTES, ...LIB_FILES, ...PLATFORM_FILES];

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
  ...SCANNED_DIRS.flatMap(walk),
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
 * Muster 3 — dasselbe in Tupel-Schreibweise (Sprint 112).
 *
 *     const [{ data: a }, { data: b }] = await Promise.all([...]);
 *
 * Das ist im Projekt die uebliche Form fuer parallele Ladevorgaenge, und sie
 * war bis Sprint 112 vollstaendig ungeprueft: Muster 2 verlangt eine
 * geschweifte Klammer direkt hinter `const` und laeuft an der eckigen vorbei.
 * Der Test war damit fuer die haeufigste Schreibweise des Fehlers blind — 40
 * Fundstellen, quer durch fast jedes Modul. Eine Luecke im Detektor ist
 * teurer als eine Luecke in der Abdeckung: die eine sieht man an einer roten
 * Liste, die andere gar nicht.
 */
const DESTRUCTURE_TUPLE = /const\s*\[\s*\{\s*data[\s\S]*?\]\s*=\s*await[\s\S]*?;/g;

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
  return (
    [
      ...Array.from(source.matchAll(DESTRUCTURE_STATEMENT)),
      ...Array.from(source.matchAll(DESTRUCTURE_TUPLE)),
    ]
      .map((m) => m[0])
      .filter((stmt) => !isAllowedStatement(stmt))
      // Nur die erste Zeile in die Meldung, damit der Report lesbar bleibt.
      .map((stmt) => (stmt.split('\n')[0] ?? stmt).trim())
  );
}

const FIX_HINT =
  'Nutze die Helper aus @/lib/supabase/unwrap: unwrapRows(result, "Kontext") fuer Listen, ' +
  'unwrapRowsWithCount fuer Queries mit { count: "exact" }, unwrapMaybeRow fuer .maybeSingle(). ' +
  'Sie werfen bei gesetztem error und liefern sonst die Daten — eine legitim leere Liste ' +
  '(data: [], error: null) laeuft unveraendert durch. Wenn an dieser Stelle bewusst NICHT ' +
  'geworfen werden soll (z. B. in einem Login-Formular, wo eine lesbare Meldung besser ist ' +
  'als eine Fehlerseite), destrukturiere `error` explizit und behandle ihn sichtbar.';

describe('Portal + Staff-Bereich + Guards + DSGVO-Export: keine verschluckten Query-Fehler', () => {
  describe('sanity: Scanner findet ueberhaupt Dateien', () => {
    it.each(SCANNED_DIRS.map((d) => relative(process.cwd(), d).replace(/\\/g, '/')))(
      'gescanntes Verzeichnis liefert Dateien: %s',
      (rel) => {
        // Der wunde Punkt eines Verzeichnis-Scans: wird die Route-Gruppe
        // umbenannt oder verschoben, scannt walk() ein leeres Nichts und der
        // Test bleibt gruen. Genau die stille Erfolgsmeldung, gegen die diese
        // Datei antritt — nur eine Ebene hoeher.
        expect(
          walk(join(process.cwd(), rel)).length,
          `${rel} enthaelt keine .ts/.tsx-Dateien. Entweder wurde das Verzeichnis ` +
            `umbenannt/verschoben (dann SCANNED_DIRS korrigieren) oder es ist wirklich ` +
            `leer (dann den Eintrag entfernen). Ein leerer Scan ist keine Abdeckung.`,
        ).toBeGreaterThan(5);
      },
    );

    it('erfasst den gesamten Staff- und Portal-Bereich', () => {
      expect(SCANNED_FILES.length).toBeGreaterThan(150);
    });

    it.each(LISTED_FILES)('einzeln gelistete Datei existiert noch: %s', (listed) => {
      // Ohne diese Pruefung wuerde ein Umbenennen oder Verschieben die
      // Abdeckung dieser Datei still entfernen: SCANNED_FILES filtert
      // nicht-existente Pfade heraus, und ein Test, der nichts scannt,
      // ist gruen. Guard-Schicht und Export-Routen sind genau die Stellen,
      // an denen stiller Erfolg am teuersten ist.
      expect(
        existsSync(join(process.cwd(), listed)),
        `${listed} steht in GUARD_FILES, EXPORT_ROUTES bzw. LIB_FILES, existiert aber ` +
          `nicht (mehr). Pfad in der Liste korrigieren — oder wenn die Datei wirklich ` +
          `weg ist, den Eintrag mitsamt Begruendung entfernen.`,
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
      // Tupel-Form (Sprint 112) — die haeufigste Schreibweise im Projekt:
      expect(
        findBareDestructures(
          'const [{ data: a }, { data: b }] = await Promise.all([\n' +
            "  supabase.from('x').select(),\n" +
            "  supabase.from('y').select(),\n" +
            ']);',
        ),
      ).toHaveLength(1);
    });

    it('laesst die erlaubten Faelle durch', () => {
      expect(findBareDestructures('const { data, error } = await supabase.rpc("x");')).toHaveLength(
        0,
      );
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
      // Tupel mit mitgenommenem error ist in Ordnung:
      expect(
        findBareDestructures(
          "const [{ data: a, error: e }] = await Promise.all([supabase.from('x').select()]);",
        ),
      ).toHaveLength(0);
      // Ein Tupel ohne fuehrendes `data` ist keine Query-Destrukturierung:
      expect(
        findBareDestructures('const [first, second] = await Promise.all([a(), b()]);'),
      ).toHaveLength(0);
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
