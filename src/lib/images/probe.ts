import 'server-only';

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
    return { ok: false, stage: 'load', code: sanitizeCode(err) };
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
