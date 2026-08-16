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
 */
export type SharpBinaryReport = {
  /** z. B. '@img/sharp-linux-x64'. */
  expected: string;
  /** Ist das Wrapper-Paket aufloesbar? */
  present: boolean;
  /** Ist das zugehoerige libvips-Paket aufloesbar? sharp braucht beide. */
  libvipsPresent: boolean;
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
 * glibc oder musl?
 *
 * Node fuehrt die glibc-Laufzeitversion im Diagnosebericht; auf musl (Alpine)
 * fehlt das Feld. Genauso erkennt es das uebliche `detect-libc`. Der Bericht
 * wird nur erzeugt, wenn ohnehin schon etwas kaputt ist — er ist nicht
 * billig, und auf dem gruenen Pfad hat er nichts zu suchen.
 */
function detectLinuxLibc(): 'glibc' | 'musl' {
  const report = process.report?.getReport?.() as
    | { header?: { glibcVersionRuntime?: unknown } }
    | undefined;
  return typeof report?.header?.glibcVersionRuntime === 'string' ? 'glibc' : 'musl';
}

/**
 * Baut die beiden Paketnamen, die sharp auf diesem Host braucht.
 *
 * Exportiert und mit expliziten Parametern, damit alle Plattformen testbar
 * sind — auf der Maschine, auf der die Tests laufen, ist ja immer nur eine
 * davon wahr.
 */
export function sharpPackageNames(
  platform: string = process.platform,
  arch: string = process.arch,
  libc: 'glibc' | 'musl' = platform === 'linux' ? detectLinuxLibc() : 'glibc',
): { binary: string; libvips: string } {
  const os = platform === 'linux' && libc === 'musl' ? 'linuxmusl' : platform;
  const binary = `@img/sharp-${os}-${arch}`;
  const libvips = `@img/sharp-libvips-${os}-${arch}`;
  return PACKAGE_SHAPE.test(binary) && PACKAGE_SHAPE.test(libvips)
    ? { binary, libvips }
    : { binary: 'UNKNOWN', libvips: 'UNKNOWN' };
}

/**
 * Laesst sich das Paket aufloesen?
 *
 * Aufloesen, nicht laden: ein natives Modul zu laden hiesse, denselben
 * Absturz noch einmal auszuloesen. Und nur das Ergebnis als Boolean — der
 * aufgeloeste Pfad waere genau die Serverpfad-Auskunft, die dieser Endpunkt
 * nicht gibt.
 *
 * Der Name ist zur Bauzeit unbekannt (er entsteht erst aus process.platform),
 * deshalb fasst der Bundler ihn nicht an und die Aufloesung passiert
 * tatsaechlich im node_modules des Servers.
 */
function resolves(packageName: string): boolean {
  if (packageName === 'UNKNOWN') return false;
  try {
    const requireFromApp = createRequire(join(process.cwd(), 'index.js'));
    requireFromApp.resolve(`${packageName}/package.json`);
    return true;
  } catch {
    return false;
  }
}

function reportSharpBinary(): SharpBinaryReport {
  const names = sharpPackageNames();
  return {
    expected: names.binary,
    present: resolves(names.binary),
    libvipsPresent: resolves(names.libvips),
  };
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
