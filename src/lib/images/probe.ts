import 'server-only';
import { createRequire } from 'node:module';
import { join } from 'node:path';

/**
 * Sprint 125: Laeuft die Bildverarbeitung auf DIESEM Server?
 *
 * Anlass: Beim Live-Verify von Sprint 124 kam eine oeffentliche Meldung an,
 * das angehaengte Foto aber nicht. Derselbe Produktions-Build gegen dieselbe
 * Datenbank und denselben Storage speicherte das Foto lokal anstandslos.
 * Datenbank, Storage, RLS und Code waren damit ausgeschlossen — der
 * Unterschied lag allein in der Serverumgebung. Von aussen war das nicht
 * feststellbar: die Anwendung faengt einen kaputten Bildpfad bewusst ab und
 * liefert die Meldung ohne Foto aus. Genau richtig fuer den Melder, aber
 * fuer den Betreiber unsichtbar.
 *
 * Das ist der eigentliche Befund: sharp kann ausfallen, ohne dass irgendwo
 * ein roter Punkt angeht. Betroffen sind alle drei Upload-Pfade, die
 * EXIF-Daten per Re-Encode entfernen — Dokumente, Portal-Fotos und die
 * oeffentliche Meldestrecke. Der Dokumenten-Upload existiert seit Sprint 63
 * und koennte die ganze Zeit tot gewesen sein, ohne dass es auffiel.
 *
 * Deshalb diese Probe: sie macht die Faehigkeit pruefbar, statt sie
 * anzunehmen.
 *
 * ZWEI STUFEN, weil sie unterschiedliche Ursachen haben:
 *   - `load`   Das Modul laesst sich nicht laden. Paket fehlt im
 *              node_modules des Servers, oder das native Binary passt nicht
 *              zur Plattform (glibc/musl, Architektur).
 *   - `encode` Das Modul laedt, das Kodieren scheitert trotzdem — etwa
 *              wenn libvips da ist, aber ein Format-Backend fehlt.
 *
 * Ein blosses `ok: false` haette den Unterschied verschluckt und den
 * Betreiber wieder ins Raten geschickt.
 *
 * SPRINT 127 — WARUM HIER JETZT AUCH `variant` STEHT. Seit diesem Sprint
 * liegt `@img/sharp-wasm32` mit im Paket. sharp probiert von sich aus zuerst
 * das native Binary und faellt dann auf WASM zurueck; der Fallback war immer
 * schon in sharps Loader, ihm fehlte nur das Paket. Damit laufen die Uploads
 * auch dort, wo das native Binary nicht taugt — und genau das ist die neue
 * Gefahr: ein gruenes `ok: true`, unter dem der eigentliche Defekt
 * weiterlebt. Deshalb sagt die Probe jetzt nicht nur OB, sondern WORUEBER.
 *
 * SPRINT 128 — UND JETZT AUCH WARUM. Der erste Live-Abruf mit `loads` und
 * `x64v2` hat den Verdacht aus Sprint 127 widerlegt: `x64v2` kam als `null`
 * zurueck, nicht als `false`. Auf linux-x64 stellt sich diese Frage sehr
 * wohl — dass sie unbeantwortet blieb, heisst, dass das `require` schon
 * vorher geflogen ist. Der x86-64-v2-Gate war es also nicht.
 *
 * Damit stand wieder das alte Bild da: Datei liegt, Datei laedt nicht, Grund
 * steht nur im Serverlog. Das muss nicht sein. Der eigentliche Grund steht in
 * der Fehler*meldung*, und die traegt Serverpfade — aber sie traegt eben auch
 * eine Handvoll wiederkehrender Formulierungen, die der Dynamic Linker selbst
 * erzeugt. Aus denen laesst sich eine KONSTANTE ableiten. Nicht die Meldung
 * geht raus, sondern ihr Befund, und der stammt aus einer geschlossenen
 * Liste. Damit beantwortet der naechste Live-Abruf die Frage, fuer die bisher
 * der Betreiber ins Hoster-Log steigen musste.
 *
 * SPRINT 130 — DIE GROESSE IST DAS INDIZ. Sprint 128 lieferte
 * SHARED_LIBRARY_MISSING, Sprint 129 zeigte, WELCHE fehlt: die von libvips
 * selbst. Gemessen wurde danach am Paket, und dabei kam etwas heraus, das die
 * Ursache eingrenzt, ohne dass jemand auf den Server muss:
 * `@img/sharp-libvips-linux-x64` hat SECHS Dateien, KEIN Install-Script und
 * 18,2 MB entpackt — die `.so` liegt im Tarball, sie wird nicht nachgeladen.
 * Sie kann also nur beim Auspacken oder beim Ausliefern verlorengehen.
 *
 * Daraus wird eine Messung: neben der 18-MB-Datei liegt eine wenige hundert
 * Byte grosse JS-Datei im selben Verzeichnis. Fehlt nur die grosse, hat etwas
 * nach GROESSE aussortiert — Deploy-Pipeline, Kontingent, abgebrochene
 * Uebertragung, alles Sache des Hosters. Fehlen beide, wurde das Paket als
 * Huelle ausgepackt, und ein sauberer Installationslauf behebt es. Wieder
 * nach Handlung geschnitten, nicht nach Neugier.
 */

export type ImagePipelineProbe = {
  /** true = ein Bild laesst sich auf diesem Server tatsaechlich kodieren. */
  ok: boolean;
  /** Wo es brach. `null`, wenn nichts brach. */
  stage: 'load' | 'encode' | null;
  /** Node-Fehlercode, z. B. ERR_DLOPEN_FAILED. `null`, wenn nichts brach. */
  code: string | null;
  /**
   * Auf welchem Weg sharp arbeitet. `null`, wenn es gar nicht laedt.
   *
   * WARUM DAS SEIN MUSS. Seit Sprint 127 liegt `@img/sharp-wasm32` mit im
   * Paket; sharp greift von sich aus darauf zurueck, wenn das native Binary
   * nicht taugt. Das ist gewollt — aber ohne diese Auskunft waere es ein
   * stiller Wechsel: `ok: true`, Uploads laufen, und niemand erfaehrt je,
   * dass der Server den langsameren Weg nimmt und das eigentliche Problem
   * noch da ist. Ein Fallback, der sich nicht meldet, ist eine zugedeckte
   * Fehlfunktion.
   */
  variant: 'native' | 'wasm' | null;
  /**
   * Gesetzt, sobald der native Weg NICHT benutzt wird — also bei
   * `stage: 'load'` und bei `variant: 'wasm'`. Auf dem gruenen nativen Pfad
   * waere er nur Rauschen.
   */
  binary?: SharpBinaryReport;
};

/**
 * Welches native Paket dieser Host braucht, und ob es da ist.
 *
 * WOZU. Der erste Live-Lauf der Probe meldete `stage: 'load'` mit
 * `code: 'UNKNOWN'`. Das ist kein Zufall: wenn sharp kein passendes Binary
 * findet, wirft es einen eigenen Fehler ohne `code`-Feld — der Sanitizer
 * verwirft ihn korrekt, und uebrig bleibt eine Auskunft, mit der der
 * Betreiber nichts tun kann. Ein Alarm, der nicht sagt, was zu tun ist,
 * kostet nur Zeit.
 *
 * WAS HIER RAUSGEHT. Ein npm-Paketname und zwei Booleans. Der Paketname ist
 * oeffentlich, er steht in der sharp-Dokumentation. Keine Pfade, keine
 * Versionen, keine Fehlermeldungen — dieselbe Linie wie bei `code`.
 * Betriebssystem und Architektur stecken zwangslaeufig im Paketnamen; das
 * ist der Preis dafuer, dass die Antwort ueberhaupt eine Handlung nahelegt,
 * und ein Linux-x64-Webserver ist kein Geheimnis.
 *
 * WORAN DER ERSTE VERSUCH SCHEITERTE, damit es niemand wiederholt: gemessen
 * wurde vom App-Verzeichnis aus. pnpm legt `@img/sharp-<plattform>` aber
 * nicht dorthin, sondern neben sharp in den .pnpm-Speicher. Die Antwort
 * lautete deshalb `present: false` — auch auf einer Maschine, auf der sharp
 * einwandfrei laeuft. Ein Messwert, der immer dasselbe sagt, ist kein
 * Messwert. Gemessen wird jetzt von sharp aus, und ein Test haelt auf
 * DIESER Maschine dagegen.
 */
export type SharpBinaryReport = {
  /** z. B. '@img/sharp-linux-x64'. */
  expected: string;
  /** Ist sharp selbst auffindbar? Trennt "sharp fehlt ganz" von "nur das Binary fehlt". */
  sharpPresent: boolean;
  /** Liegt das native Paket dort, wo sharp danach sucht? */
  present: boolean;
  /**
   * Laedt es auch wirklich — oder liegt es nur da?
   *
   * `present` beantwortet eine Datei-Frage, `loads` eine Betriebssystem-Frage.
   * Der Unterschied ist der ganze Rest des Problems: die Live-Messung meldete
   * ueber Wochen alles als vorhanden, und das Laden scheiterte trotzdem.
   * Genau dort, zwischen "liegt da" und "laesst sich laden", sitzen die
   * Ursachen, die kein Nachinstallieren behebt — ein `noexec`-Mount auf dem
   * node_modules-Verzeichnis, ein Speicherlimit, eine fehlende
   * Systembibliothek.
   */
  loads: boolean;
  /**
   * Warum es nicht laedt — als Konstante. `null`, wenn es laedt.
   *
   * DAS IST DIE AUSKUNFT, DIE BISHER GEFEHLT HAT. `loads: false` sagt, DASS
   * der Kernel das Modul abgewiesen hat, und liess den Betreiber danach mit
   * drei gleich plausiblen Vermutungen stehen. Der Grund selbst steht in der
   * Fehlermeldung des Dynamic Linkers — zusammen mit den Serverpfaden, die
   * hier nicht rausduerfen. Deshalb wird die Meldung gelesen und verworfen;
   * hinaus geht nur der Befund aus einer geschlossenen Liste.
   *
   * `code` ist Nodes eigener Fehlercode und laeuft durch denselben Sanitizer
   * wie oben: ERR_DLOPEN_FAILED trennt "der Kernel hat abgelehnt" von
   * MODULE_NOT_FOUND, "die Datei war gar nicht da".
   */
  loadError: NativeLoadError | null;
  /**
   * Erfuellt die CPU die Mikroarchitektur x86-64-v2?
   *
   * DAS IST DER VERDAECHTIGE, DEN DIE PROBE BISHER UEBERSEHEN HAT. sharp
   * verwirft ein einwandfrei geladenes Linux-x64-Binary wieder, wenn die CPU
   * kein x86-64-v2 kann, und haengt dem Fehler `code: 'Unsupported CPU'` an —
   * mit Leerzeichen und Kleinbuchstaben. Der Sanitizer macht daraus korrekt
   * `UNKNOWN`, und uebrig blieb das Bild, das wir live hatten: jedes Paket
   * vorhanden, jede Version modern, Laden scheitert, Begruendung 'UNKNOWN'.
   *
   * `null` heisst "stellt sich hier nicht" — die Pruefung gilt nur fuer
   * Linux auf x64. Ein `false` waere anderswo eine Falschmeldung, und
   * Falschmeldungen haben diesen Bericht schon einmal wertlos gemacht.
   */
  x64v2: boolean | null;
  /**
   * libvips, die eigentliche Bildbibliothek.
   *
   * `null` heisst NICHT "fehlt", sondern "gibt es auf dieser Plattform nicht
   * einzeln" — unter Windows steckt libvips im Plattform-Paket, unter Linux
   * und macOS ist es ein eigenes. Ein `false` waere dort eine Falschmeldung,
   * und Falschmeldungen sind der Grund, warum dieser Block schon einmal
   * umgebaut werden musste.
   *
   * Warum das ueberhaupt eigens geprueft wird: `@img/sharp-linux-x64` fuehrt
   * `@img/sharp-libvips-linux-x64` als OPTIONALE Abhaengigkeit — eine
   * optionale Abhaengigkeit einer optionalen Abhaengigkeit. Genau so etwas
   * laesst ein Installationslauf aus, ohne mit einem Fehler abzubrechen.
   *
   * SPRINT 129 — `present` ALLEIN WAR WERTLOS, ZUM ZWEITEN MAL. Die
   * libvips-Pakete haben keinen `"."`-Eintrag in ihrer exports-Map. Eine
   * Aufloesung des blossen Paketnamens endet deshalb IMMER in
   * ERR_PACKAGE_PATH_NOT_EXPORTED, und den zaehlt `resolvesFrom` bewusst als
   * gefunden. `present: true` bewies also nur, dass eine package.json
   * erreichbar ist — das `lib/`-Verzeichnis daneben durfte leer sein.
   *
   * Genau dieser Fall stand am 16.08.2026 live da: `present: true` und
   * gleichzeitig `loadError.reason: 'SHARED_LIBRARY_MISSING'`. Kein
   * Widerspruch, sondern ein Messwert, der nicht messen konnte.
   */
  libvips: {
    expected: string;
    /** Paket erreichbar — beweist NUR das, siehe oben. */
    present: boolean;
    /**
     * Die Bibliothek selbst (`lib/libvips-cpp.so.…` bzw. `.dylib`).
     *
     * Das ist die Frage, auf die es ankommt. Die Pakete weisen sie als
     * `./binary` aus; fehlt die Datei, endet die Aufloesung in
     * MODULE_NOT_FOUND statt in ERR_PACKAGE_PATH_NOT_EXPORTED — der
     * Unterschied, der die Messung ueberhaupt erst zu einer macht.
     *
     * `null` heisst wie ueberall hier "die Frage stellt sich nicht" — das
     * Paket weist gar kein `./binary` aus, oder sharp selbst war nicht
     * auffindbar, dann ist von dort auch nichts messbar. Ein `false` waere
     * dort eine Falschmeldung, und Falschmeldungen sind der Grund, warum
     * dieser Block jetzt zum zweiten Mal umgebaut werden musste.
     */
    binary: boolean | null;
    /**
     * Eine kleine Datei aus demselben Verzeichnis (`lib/index.js`, ein paar
     * hundert Byte gegen 18 MB bei der `.so`).
     *
     * SPRINT 130 — DER GROESSENVERGLEICH TRENNT DIE ADRESSATEN. Das Paket
     * hat sechs Dateien und KEIN Install-Script; die `.so` liegt im Tarball
     * und muss nur ausgepackt werden. Wenn sie fehlt, gibt es zwei Faelle,
     * und sie gehen an zwei verschiedene Stellen:
     *
     * - `lib: true`, `binary: false` — die kleinen Dateien sind da, die
     *   grosse nicht. Etwas hat nach Groesse aussortiert: Deploy-Pipeline,
     *   Plattenkontingent, abgebrochene Uebertragung. Sache des Hosters.
     * - `lib: false`, `binary: false` — das Verzeichnis ist leer, das Paket
     *   wurde als Huelle ausgepackt. Sache des Installationslaufs, ein
     *   sauberes Neuinstallieren behebt es.
     *
     * `null` wie ueberall hier: die Frage stellt sich nicht (kein `./lib`
     * in der exports-Map, oder sharp war nicht auffindbar).
     */
    lib: boolean | null;
  } | null;
  /**
   * Die C-Bibliothek des Servers.
   *
   * Kommt dazu, weil der Live-Lauf alle Pakete als vorhanden gemeldet hat und
   * das Laden trotzdem scheiterte. Wenn nichts fehlt, ist das Naechstliegende
   * eine Binary, die zur Umgebung nicht passt — und dafuer ist die
   * glibc-Version die Zahl, an der es haengt. Eine Versionsnummer ist kein
   * Pfad und keine Fehlermeldung; sie faellt unter dieselbe Linie wie `code`.
   */
  libc: { flavour: 'glibc' | 'musl'; version: string | null };
  /**
   * Die Node-Version, unter der der Server wirklich laeuft.
   *
   * Kommt dazu, weil glibc 2.34 gemeldet wurde — modern genug, also auch
   * nicht die Ursache. `@img/sharp-linux-x64` verlangt `node >=20.9.0`, und
   * die nativen Binaries brauchen N-API 9. Laeuft draussen ein aelteres
   * Node, erklaert das den Ausfall vollstaendig — und anders als alles
   * andere waere es eine Einstellung, die der Betreiber im Hoster-Panel
   * selbst umstellen kann, ohne Support.
   *
   * Eine Versionsnummer ist kein Pfad. Dieselbe Schranke wie bei `code`.
   */
  runtime: { node: string | null; napiAbi: string | null };
};

/**
 * Warum das native Binary nicht laedt — jeder Wert eine andere Handlung.
 *
 * Die Liste ist bewusst nach HANDLUNG geschnitten, nicht nach Fehlertext. Zwei
 * Meldungen, die dasselbe zu tun geben, gehoeren auf denselben Wert; zwei, die
 * verschiedene Adressaten haben, duerfen nie zusammenfallen. Ein Befund, der
 * den Betreiber nicht weiterbringt, ist so wertlos wie das 'UNKNOWN', das
 * dieser Sprint ersetzt.
 */
export type NativeLoadReason =
  /** Es wurde nichts geladen — sharp selbst war nicht auffindbar. Kein Befund, sondern dessen Abwesenheit. */
  | 'NOT_ATTEMPTED'
  /** Die Datei war nicht da. Installationslauf unvollstaendig. */
  | 'FILE_MISSING'
  /** Eine .so, an der das Binary haengt, fehlt — typischerweise libvips. Paket unvollstaendig ausgepackt. */
  | 'SHARED_LIBRARY_MISSING'
  /** Die glibc des Servers ist aelter als die, gegen die gebaut wurde. Sache des Hosters. */
  | 'GLIBC_TOO_OLD'
  /** Binary und libvips passen nicht zueinander — Versionsmix im node_modules. Neu installieren. */
  | 'SYMBOL_MISSING'
  /** Der Kernel verweigert das Ausfuehren: noexec-Mount, SELinux, fehlendes Ausfuehrrecht. Nur der Hoster kann das. */
  | 'EXEC_NOT_PERMITTED'
  /** Keine ladbare Binaerdatei fuer diese Plattform — falsche Architektur oder beim Deploy beschaedigt. */
  | 'WRONG_BINARY_FORMAT'
  /** Kein Speicher zum Laden. Prozesslimit des Tarifs. */
  | 'OUT_OF_MEMORY'
  /** Gegen eine andere Node-Version gebaut als die laufende. */
  | 'ABI_MISMATCH'
  /** Geladen wurde nicht, und die Meldung passt auf keinen bekannten Fall. Hier hilft nur das Serverlog. */
  | 'UNCLASSIFIED';

export type NativeLoadError = {
  /** Nodes eigener Fehlercode, durch denselben Sanitizer wie `ImagePipelineProbe.code`. */
  code: string;
  reason: NativeLoadReason;
};

/**
 * Fehlercodes sind maschinenlesbare Konstanten (ERR_DLOPEN_FAILED,
 * MODULE_NOT_FOUND, …) — Fehler*meldungen* dagegen enthalten Dateipfade des
 * Servers. Der Endpunkt ist unauthentifiziert, also geht nur der Code
 * hinaus, und auch der nur, wenn er wie ein Code aussieht. Alles andere
 * wird zu 'UNKNOWN'. Lieber eine Auskunft weniger als ein Serverpfad im
 * offenen Netz.
 */
const CODE_SHAPE = /^[A-Z][A-Z0-9_]{0,63}$/;

/** Exportiert, weil hier die Schranke gegen Pfad-Leaks sitzt — die gehoert getestet. */
export function sanitizeCode(err: unknown): string {
  const raw = (err as { code?: unknown } | null)?.code;
  if (typeof raw !== 'string') return 'UNKNOWN';
  return CODE_SHAPE.test(raw) ? raw : 'UNKNOWN';
}

/**
 * Die Formulierungen, an denen der Dynamic Linker sich erkennen laesst.
 *
 * DIE REIHENFOLGE IST TEIL DER AUSSAGE, nicht Geschmack. Mehrere Muster
 * treffen auf dieselbe Meldung zu — "cannot enable executable stack as shared
 * object requires: Permission denied" enthaelt beides, ein Ausfuehrverbot und
 * ein 'Permission denied'. Wer hier die allgemeinere Regel zuerst prueft,
 * bekommt einen Befund, der zwar stimmt, aber in die falsche Richtung zeigt.
 * Also erst die spezifische Aussage, dann die allgemeine.
 *
 * Die Muster sind absichtlich eng an den Wortlauten von glibc, musl und Node
 * gehalten. Ein zu weites Muster (etwa blosses /memory/) faengt irgendwann
 * einen Serverpfad ein und meldet mit voller Ueberzeugung den falschen Grund —
 * ein Messwert, der luegt, ist schaedlicher als gar keiner.
 */
const NATIVE_LOAD_PATTERNS: ReadonlyArray<readonly [RegExp, NativeLoadReason]> = [
  [/NODE_MODULE_VERSION|did not self-register/i, 'ABI_MISMATCH'],
  [/GLIBC_\d/i, 'GLIBC_TOO_OLD'],
  [/undefined symbol/i, 'SYMBOL_MISSING'],
  [/invalid ELF header|wrong ELF class|file too short|not a valid Win32 application/i, 'WRONG_BINARY_FORMAT'],
  [/static TLS block|cannot allocate memory|out of memory/i, 'OUT_OF_MEMORY'],
  [/failed to map segment|executable stack|operation not permitted|permission denied/i, 'EXEC_NOT_PERMITTED'],
  [/cannot open shared object file|no such file or directory/i, 'SHARED_LIBRARY_MISSING'],
];

/**
 * Aus der Fehlermeldung wird ein Befund — und die Meldung bleibt hier.
 *
 * Exportiert, weil hier zweierlei zu pruefen ist: dass die Zuordnung stimmt,
 * und dass wirklich nur die Konstante herauskommt. Die Funktion bekommt
 * Serverpfade zu sehen; ihr Rueckgabewert stammt aus einer geschlossenen
 * Liste, und der Test haelt genau darauf.
 */
export function classifyNativeLoadError(err: unknown): NativeLoadReason {
  if ((err as { code?: unknown } | null)?.code === 'MODULE_NOT_FOUND') return 'FILE_MISSING';

  const message = (err as { message?: unknown } | null)?.message;
  if (typeof message !== 'string') return 'UNCLASSIFIED';

  for (const [pattern, reason] of NATIVE_LOAD_PATTERNS) {
    if (pattern.test(message)) return reason;
  }
  return 'UNCLASSIFIED';
}

/** Paketnamen sind kleingeschrieben und bindestrichgetrennt — sonst nichts. */
const PACKAGE_SHAPE = /^@img\/sharp-(libvips-)?[a-z0-9]+-[a-z0-9]+$/;

/**
 * Plattformen, auf denen libvips als EIGENES Paket ausgeliefert wird.
 *
 * Unter Windows steckt es im Plattform-Paket selbst — dort gibt es kein
 * `@img/sharp-libvips-win32-*`, und danach zu suchen hiesse, dauerhaft
 * "fehlt" zu melden, wo nichts fehlt.
 */
const PLATFORMS_WITH_SEPARATE_LIBVIPS = new Set(['linux', 'darwin']);

/**
 * glibc oder musl?
 *
 * Node fuehrt die glibc-Laufzeitversion im Diagnosebericht; auf musl (Alpine)
 * fehlt das Feld. Genauso erkennt es das uebliche `detect-libc`. Der Bericht
 * wird nur erzeugt, wenn ohnehin schon etwas kaputt ist — er ist nicht
 * billig, und auf dem gruenen Pfad hat er nichts zu suchen.
 */
function readGlibcVersion(): string | null {
  const report = process.report?.getReport?.() as
    | { header?: { glibcVersionRuntime?: unknown } }
    | undefined;
  const raw = report?.header?.glibcVersionRuntime;
  // Nur eine Versionsnummer geht raus, nichts anderes — dieselbe Schranke
  // wie bei `code` und beim Paketnamen.
  return typeof raw === 'string' && /^\d+(\.\d+){0,2}$/.test(raw) ? raw : null;
}

function detectLinuxLibc(): 'glibc' | 'musl' {
  const report = process.report?.getReport?.() as
    | { header?: { glibcVersionRuntime?: unknown } }
    | undefined;
  return typeof report?.header?.glibcVersionRuntime === 'string' ? 'glibc' : 'musl';
}

/** Exportiert, weil hier eine Schranke gegen Freitext sitzt — die gehoert getestet. */
export function reportRuntime(): { node: string | null; napiAbi: string | null } {
  const node = process.version;
  const abi = process.versions.modules;
  return {
    node: /^v\d+\.\d+\.\d+$/.test(node) ? node : null,
    napiAbi: typeof abi === 'string' && /^\d{1,4}$/.test(abi) ? abi : null,
  };
}

/** Exportiert, weil hier eine Schranke gegen Freitext sitzt — die gehoert getestet. */
export function reportLibc(platform: string = process.platform): {
  flavour: 'glibc' | 'musl';
  version: string | null;
} {
  if (platform !== 'linux') return { flavour: 'glibc', version: null };
  const flavour = detectLinuxLibc();
  return { flavour, version: flavour === 'glibc' ? readGlibcVersion() : null };
}

/**
 * Der Paketname, den sharp auf diesem Host braucht.
 *
 * Exportiert und mit expliziten Parametern, damit alle Plattformen testbar
 * sind — auf der Maschine, auf der die Tests laufen, ist ja immer nur eine
 * davon wahr.
 */
export function expectedSharpBinary(
  platform: string = process.platform,
  arch: string = process.arch,
  libc: 'glibc' | 'musl' = platform === 'linux' ? detectLinuxLibc() : 'glibc',
): string {
  const os = platform === 'linux' && libc === 'musl' ? 'linuxmusl' : platform;
  const name = `@img/sharp-${os}-${arch}`;
  return PACKAGE_SHAPE.test(name) ? name : 'UNKNOWN';
}

/** `null`, wo libvips nicht als eigenes Paket existiert (Windows). */
export function expectedLibvipsPackage(
  platform: string = process.platform,
  arch: string = process.arch,
  libc: 'glibc' | 'musl' = platform === 'linux' ? detectLinuxLibc() : 'glibc',
): string | null {
  if (!PLATFORMS_WITH_SEPARATE_LIBVIPS.has(platform)) return null;
  const os = platform === 'linux' && libc === 'musl' ? 'linuxmusl' : platform;
  const name = `@img/sharp-libvips-${os}-${arch}`;
  return PACKAGE_SHAPE.test(name) ? name : null;
}

/**
 * Ein `require`, das vom sharp-Paket aus sucht — nicht vom App-Verzeichnis.
 *
 * DAS IST DER GANZE TRICK, und der erste Versuch hatte ihn falsch: pnpm legt
 * `@img/sharp-<plattform>` NICHT ins oberste node_modules, sondern neben
 * sharp in den .pnpm-Speicher. Vom App-Verzeichnis aus meldet die Aufloesung
 * deshalb auch dann "fehlt", wenn alles in Ordnung ist. Gemessen werden muss
 * dort, wo sharp selbst sucht.
 */
function requireFromSharp(): NodeRequire | null {
  try {
    const fromApp = createRequire(join(process.cwd(), 'index.js'));
    return createRequire(fromApp.resolve('sharp'));
  } catch {
    return null;
  }
}

/**
 * Liegt das Paket da?
 *
 * Aufloesen, nicht laden: ein natives Modul zu laden hiesse, denselben
 * Absturz noch einmal auszuloesen. Und nur das Ergebnis als Boolean — der
 * aufgeloeste Pfad waere genau die Serverpfad-Auskunft, die dieser Endpunkt
 * nicht gibt.
 *
 * ERR_PACKAGE_PATH_NOT_EXPORTED zaehlt als GEFUNDEN: die @img-Pakete fuehren
 * keinen Haupteinstieg in ihrem exports-Feld. Wer diesen Fehler bekommt, hat
 * das Verzeichnis erreicht — nur eben keine Datei darin benannt. Wer es
 * nicht hat, bekommt MODULE_NOT_FOUND.
 */
function resolvesFrom(req: NodeRequire, packageName: string): boolean {
  if (packageName === 'UNKNOWN') return false;
  try {
    req.resolve(packageName);
    return true;
  } catch (err) {
    return (err as { code?: unknown } | null)?.code === 'ERR_PACKAGE_PATH_NOT_EXPORTED';
  }
}

/**
 * Liegt die DATEI da? — die strengere Schwester von `resolvesFrom`.
 *
 * DER UNTERSCHIED IST DER GANZE SPRINT 129. `resolvesFrom` behandelt
 * ERR_PACKAGE_PATH_NOT_EXPORTED als Erfolg, weil "Verzeichnis erreicht" bei
 * einem Paket ohne Haupteinstieg die bestmoegliche Auskunft ist. Fuer eine
 * Datei ist genau das die falsche Auskunft: die Frage lautet nicht "ist das
 * Paket da", sondern "ist die Bibliothek da", und ein Paket mit leerem
 * lib/-Verzeichnis haette beides Mal `true` gemeldet.
 *
 * Deshalb drei Zustaende statt zwei:
 *   true   Die Datei ist aufloesbar, sie existiert.
 *   false  Der Eintrag existiert in der exports-Map, die Datei nicht
 *          (MODULE_NOT_FOUND). Das ist der Befund.
 *   null   Das Paket weist diesen Eintrag gar nicht aus. Keine Aussage —
 *          und ganz sicher kein `false`.
 */
function resolvesFileFrom(req: NodeRequire, specifier: string): boolean | null {
  try {
    req.resolve(specifier);
    return true;
  } catch (err) {
    return (err as { code?: unknown } | null)?.code === 'ERR_PACKAGE_PATH_NOT_EXPORTED'
      ? null
      : false;
  }
}

/**
 * Nur Linux auf x64 stellt die x86-64-v2-Frage.
 *
 * sharp prueft sie genau fuer 'linux-x64' und 'linuxmusl-x64' — beide haben
 * `process.platform === 'linux'` und `process.arch === 'x64'`, die libc
 * spielt hier keine Rolle.
 */
export function needsX64V2(
  platform: string = process.platform,
  arch: string = process.arch,
): boolean {
  return platform === 'linux' && arch === 'x64';
}

type NativeBinaryProbe = {
  loads: boolean;
  x64v2: boolean | null;
  loadError: NativeLoadError | null;
  /**
   * Der rohe Fehler — bleibt IM PROZESS. Er geht ins Serverlog und nie in die
   * HTTP-Antwort; dafuer ist `loadError` da.
   */
  raw: unknown;
};

/**
 * Einmal pro Prozess.
 *
 * Anders als `resolvesFrom` wird hier wirklich geladen — das ist die Frage,
 * auf die es ankommt, aber es ist auch die teure. Und sie kann sich zwischen
 * zwei Aufrufen nicht aendern: ein Binary, das beim Start nicht lud, laedt
 * auch beim zwoelften Monitor-Aufruf nicht. Ohne diesen Speicher wuerde ein
 * unauthentifizierter Endpunkt bei jedem Aufruf einen fehlschlagenden
 * dlopen ausloesen.
 */
let nativeBinaryProbe: NativeBinaryProbe | undefined;

function probeNativeBinary(): NativeBinaryProbe {
  if (nativeBinaryProbe !== undefined) return nativeBinaryProbe;

  const expected = expectedSharpBinary();
  const req = requireFromSharp();
  // Nichts versucht heisst nichts gemessen — und wird auch so benannt, statt
  // als Ladefehler durchzugehen, den es nie gab.
  nativeBinaryProbe = {
    loads: false,
    x64v2: null,
    loadError: { code: 'UNKNOWN', reason: 'NOT_ATTEMPTED' },
    raw: null,
  };

  if (req !== null && expected !== 'UNKNOWN') {
    try {
      // Derselbe Aufruf, den sharp selbst macht. Dass er hier ein zweites Mal
      // passiert, kostet nichts: geglueckt liegt das Modul im Cache,
      // gescheitert ist es schon beim Import des Prozesses gescheitert.
      const binding = req(`${expected}/sharp.node`) as { _isUsingX64V2?: () => unknown };
      nativeBinaryProbe = {
        loads: true,
        x64v2: needsX64V2() ? binding._isUsingX64V2?.() === true : null,
        loadError: null,
        raw: null,
      };
    } catch (err) {
      nativeBinaryProbe = {
        loads: false,
        x64v2: null,
        loadError: { code: sanitizeCode(err), reason: classifyNativeLoadError(err) },
        raw: err,
      };
    }
  }

  return nativeBinaryProbe;
}

/**
 * Welchen der beiden Wege sharp genommen hat.
 *
 * Nachgebaut, nicht erraten: sharp nimmt das native Binary, wenn es laedt UND
 * die CPU-Pruefung besteht — sonst faellt es auf WASM zurueck. Beides ist hier
 * gemessen, nicht angenommen.
 */
export function detectSharpVariant(): 'native' | 'wasm' {
  const native = probeNativeBinary();
  // `x64v2: null` heisst "Frage stellt sich nicht", also erfuellt.
  return native.loads && (native.x64v2 ?? true) ? 'native' : 'wasm';
}

/** Exportiert, damit ein Test auf DIESER Maschine nachweist, dass die Messung stimmt. */
export function reportSharpBinary(): SharpBinaryReport {
  const expected = expectedSharpBinary();
  const libvipsName = expectedLibvipsPackage();
  const req = requireFromSharp();
  const native = probeNativeBinary();

  return {
    expected,
    sharpPresent: req !== null,
    // Genau der Pfad, den sharp selbst laedt: '<paket>/sharp.node'. Das
    // beweist mehr als der blosse Paketname — es beweist, dass die Datei
    // darin auch da ist.
    present: req !== null && resolvesFrom(req, `${expected}/sharp.node`),
    loads: native.loads,
    loadError: native.loadError,
    x64v2: native.x64v2,
    libvips:
      libvipsName === null
        ? null
        : {
            expected: libvipsName,
            present: req !== null && resolvesFrom(req, libvipsName),
            // Nicht der Paketname, sondern die Bibliothek: die Pakete weisen
            // sie als './binary' aus. Der Paketname allein hat die Frage nie
            // beantwortet — siehe die Begruendung am Typ.
            binary: req === null ? null : resolvesFileFrom(req, `${libvipsName}/binary`),
            // Die kleine Datei aus demselben Verzeichnis. Fehlt nur die
            // grosse daneben, hat jemand nach Groesse aussortiert; fehlen
            // beide, ist das Paket eine Huelle. Zwei Adressaten, ein Wert.
            lib: req === null ? null : resolvesFileFrom(req, `${libvipsName}/lib`),
          },
    libc: reportLibc(),
    runtime: reportRuntime(),
  };
}

/**
 * Einmal pro Prozess — nicht bei jedem Monitor-Aufruf.
 *
 * Die Ursache aendert sich zwischen zwei Aufrufen nicht; im Minutentakt
 * dasselbe zu protokollieren macht das Log unlesbar und verdeckt die
 * Meldung, auf die es ankommt.
 */
let loadFailureLogged = false;

/**
 * Sharps eigene Fehlermeldung ins SERVERLOG — und nur dorthin.
 *
 * Sie nennt den wirklichen Grund im Klartext ("... GLIBC_2.29 not found",
 * "... cannot open shared object file"), und sie ist damit das eine
 * Beweisstueck, das der Betreiber dem Hoster vorlegen kann. Sie enthaelt
 * aber Serverpfade, und deshalb geht sie NICHT in die HTTP-Antwort: der
 * Endpunkt ist unauthentifiziert, das Log ist es nicht.
 *
 * Genau diese Trennung ist der Punkt — die Auskunft verschweigen wollten wir
 * nie, nur nicht ins offene Netz stellen.
 */
function logLoadFailure(err: unknown): void {
  if (loadFailureLogged) return;
  loadFailureLogged = true;
  console.error('[image-pipeline] sharp laesst sich nicht laden:', err);
}

let wasmFallbackLogged = false;

/**
 * Der Fallback darf arbeiten, aber nicht schweigen.
 *
 * Ein Server, der auf WASM ausweicht, funktioniert — und verdeckt damit, dass
 * sein natives Binary kaputt ist. Wer nur auf `ok: true` schaut, wuerde das nie
 * erfahren. Deshalb eine Zeile pro Prozessstart: laut genug, um beim Suchen
 * gefunden zu werden, leise genug, um kein Log zu fluten.
 *
 * SEIT SPRINT 128 HAENGT DER ECHTE FEHLER MIT DRAN. Solange sharp gar nicht
 * lud, schrieb `logLoadFailure` ihn ins Log. Mit dem Rueckfall laedt sharp —
 * und damit war die einzige Stelle weg, an der der Klartextgrund je auftauchte.
 * Der Fallback haette also nicht nur den Defekt verdeckt, sondern auch dessen
 * Begruendung.
 */
function logWasmFallback(err: unknown): void {
  if (wasmFallbackLogged) return;
  wasmFallbackLogged = true;
  console.warn(
    '[image-pipeline] sharp arbeitet ueber die WASM-Variante; das native Binary wurde nicht genommen:',
    err,
  );
}

/**
 * Kodiert ein 8x8-Pixel-Bild aus dem Nichts.
 *
 * Bewusst ohne Eingabedatei: die Probe soll die Faehigkeit des Servers
 * messen, nicht die Lesbarkeit einer Testdatei. Und bewusst winzig, damit
 * ein Monitor sie oft aufrufen darf.
 */
export async function probeImagePipeline(): Promise<ImagePipelineProbe> {
  let sharp: typeof import('sharp').default;
  try {
    ({ default: sharp } = await import('sharp'));
  } catch (err) {
    logLoadFailure(err);
    return {
      ok: false,
      stage: 'load',
      code: sanitizeCode(err),
      variant: null,
      binary: reportSharpBinary(),
    };
  }

  const variant = detectSharpVariant();
  if (variant === 'wasm') logWasmFallback(probeNativeBinary().raw);
  // Auf dem nativen Pfad ist der Bericht Rauschen; sobald er NICHT genommen
  // wurde, ist er die Begruendung.
  const binary = variant === 'wasm' ? { binary: reportSharpBinary() } : {};

  try {
    await sharp({
      create: { width: 8, height: 8, channels: 3, background: { r: 0, g: 0, b: 0 } },
    })
      .jpeg()
      .toBuffer();
  } catch (err) {
    return { ok: false, stage: 'encode', code: sanitizeCode(err), variant, ...binary };
  }

  return { ok: true, stage: null, code: null, variant, ...binary };
}
