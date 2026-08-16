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
 */

export type ImagePipelineProbe = {
  /** true = ein Bild laesst sich auf diesem Server tatsaechlich kodieren. */
  ok: boolean;
  /** Wo es brach. `null`, wenn nichts brach. */
  stage: 'load' | 'encode' | null;
  /** Node-Fehlercode, z. B. ERR_DLOPEN_FAILED. `null`, wenn nichts brach. */
  code: string | null;
  /**
   * Nur bei `stage: 'load'` gesetzt — und nur dann, weil nur dann jemand
   * etwas damit anfangen kann.
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
   */
  libvips: { expected: string; present: boolean } | null;
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

/** Exportiert, damit ein Test auf DIESER Maschine nachweist, dass die Messung stimmt. */
export function reportSharpBinary(): SharpBinaryReport {
  const expected = expectedSharpBinary();
  const libvipsName = expectedLibvipsPackage();
  const req = requireFromSharp();

  return {
    expected,
    sharpPresent: req !== null,
    // Genau der Pfad, den sharp selbst laedt: '<paket>/sharp.node'. Das
    // beweist mehr als der blosse Paketname — es beweist, dass die Datei
    // darin auch da ist.
    present: req !== null && resolvesFrom(req, `${expected}/sharp.node`),
    libvips:
      libvipsName === null
        ? null
        : { expected: libvipsName, present: req !== null && resolvesFrom(req, libvipsName) },
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
    return { ok: false, stage: 'load', code: sanitizeCode(err), binary: reportSharpBinary() };
  }

  try {
    await sharp({
      create: { width: 8, height: 8, channels: 3, background: { r: 0, g: 0, b: 0 } },
    })
      .jpeg()
      .toBuffer();
  } catch (err) {
    return { ok: false, stage: 'encode', code: sanitizeCode(err) };
  }

  return { ok: true, stage: null, code: null };
}
