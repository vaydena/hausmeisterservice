import 'server-only';

/**
 * Sprint 126: EXIF/GPS entfernen — an einer Stelle, und ohne fremde
 * Funktionen mitzureissen.
 *
 * ANLASS. Die Probe aus Sprint 125 hat auf dem Live-Server `stage: 'load'`
 * gemeldet: sharp laesst sich dort nicht einmal importieren. Ein
 * Top-Level-`import sharp` wirft damit beim Laden des GESAMTEN Moduls — und
 * ein 'use server'-Modul wird als Ganzes geladen. Betroffen war deshalb
 * nicht nur der Bildpfad, sondern jede Server-Action in derselben Datei:
 *
 *   src/lib/documents/actions.ts        uploadDocument, deleteDocument,
 *                                       createSignedDocumentUrl
 *   (portal)/portal/defects/actions.ts  createPortalDefect, withdrawPortal-
 *                                       Defect, uploadPortalDefectDocument
 *
 * Ein Bewohner konnte also gar keine Meldung mehr abgeben, auch ohne Foto,
 * und die Verwaltung konnte ein laengst hochgeladenes Dokument nicht einmal
 * mehr ANSEHEN — createSignedDocumentUrl braucht sharp nie, lag aber in
 * derselben Datei. Ein optionales Feature hat die Pflichtfunktion mit ins
 * Grab gezogen.
 *
 * REGEL, die daraus folgt: eine Faehigkeit, die ausfallen darf, wird dort
 * geladen, wo sie gebraucht wird — nicht oben im Modul.
 *
 * KEIN FALLBACK AUF DAS ORIGINAL. Wenn sharp fehlt, wird nichts
 * hochgeladen. Das Re-Encode ist kein Komfort, sondern der einzige Grund,
 * warum aus einem Wohnungsfoto keine GPS-Koordinate der Wohnung wird. Ein
 * "dann eben ungefiltert" waere aus einem Ausfall ein Datenleck gemacht.
 * Lieber ein ehrlicher Fehler als ein stiller Verrat der Adresse.
 */

/** Was am Ende in den Storage geht. */
export type StrippedImage = {
  buffer: Buffer;
  mime: string;
  extension: string;
};

/**
 * Die Bildverarbeitung steht auf diesem Server nicht zur Verfuegung.
 *
 * Eigener Typ, damit Aufrufer den Umgebungsausfall von einem kaputten
 * Upload unterscheiden koennen: beim einen hilft Nochmal-Versuchen nicht,
 * beim anderen schon.
 */
export class ImagePipelineUnavailableError extends Error {
  constructor(cause?: unknown) {
    super('Bildverarbeitung steht derzeit nicht zur Verfügung.');
    this.name = 'ImagePipelineUnavailableError';
    this.cause = cause;
  }
}

/**
 * Diese eine Datei liess sich nicht verarbeiten.
 *
 * Bewusst getrennt vom Umgebungsausfall: hier ist das Bild das Problem,
 * nicht der Server. Der Unterschied entscheidet, was man dem Nutzer sagt —
 * "andere Datei versuchen" gegen "liegt nicht an Ihnen".
 *
 * Ein fehlendes Format-Backend landet an dieser Stelle ebenfalls, weil man
 * es am Einzelbild nicht von einer kaputten Datei unterscheiden kann. Diese
 * Unterscheidung trifft /api/health/deep: die Probe kodiert ein selbst
 * erzeugtes, garantiert gueltiges Bild — scheitert die, liegt es am Server.
 */
export class ImageUnprocessableError extends Error {
  constructor(cause?: unknown) {
    super('Das Bild konnte nicht verarbeitet werden.');
    this.name = 'ImageUnprocessableError';
    this.cause = cause;
  }
}

/**
 * Entfernt Metadaten durch Re-Encode und liefert Bytes, MIME und Endung.
 *
 * sharp strippt Metadata beim Re-Encode standardmaessig. `.rotate()` ohne
 * Argument wendet die EXIF-Orientation vorher an, damit das Bild richtig
 * herum bleibt, obwohl die Orientation-Angabe danach weg ist.
 *
 * HEIC/HEIF landen als JPEG — sonst zeigt sie kein Browser an.
 *
 * @throws ImagePipelineUnavailableError wenn sharp auf diesem Server nicht
 *         laedt — der Aufrufer kann daran nichts aendern.
 * @throws ImageUnprocessableError wenn genau diese Datei nicht kodierbar
 *         ist — eine andere Datei kann klappen.
 *
 * Gibt in keinem Fall das unveraenderte Original zurueck.
 */
export async function stripImageMetadata(
  source: Buffer,
  mime: string,
): Promise<StrippedImage> {
  let sharp: typeof import('sharp').default;
  try {
    ({ default: sharp } = await import('sharp'));
  } catch (err) {
    throw new ImagePipelineUnavailableError(err);
  }

  try {
    const img = sharp(source, { failOn: 'none' }).rotate();

    if (mime === 'image/png') {
      return { buffer: await img.png().toBuffer(), mime: 'image/png', extension: 'png' };
    }
    if (mime === 'image/webp') {
      return {
        buffer: await img.webp({ quality: 88 }).toBuffer(),
        mime: 'image/webp',
        extension: 'webp',
      };
    }
    return {
      buffer: await img.jpeg({ quality: 88 }).toBuffer(),
      mime: 'image/jpeg',
      extension: 'jpg',
    };
  } catch (err) {
    throw new ImageUnprocessableError(err);
  }
}
