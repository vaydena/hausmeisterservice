import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import sharp from 'sharp';
import {
  stripImageMetadata,
  ImagePipelineUnavailableError,
  ImageUnprocessableError,
} from '@/lib/images/strip-metadata';

const SRC_DIR = join(process.cwd(), 'src');

function walkTs(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const abs = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...walkTs(abs));
    } else if (entry.isFile() && (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx'))) {
      out.push(abs);
    }
  }
  return out;
}

/** Ein Bild mit Urheber- UND GPS-Angabe — beides muss danach weg sein. */
const SECRET_TEXT = 'Wohnung Musterstrasse 1';

async function makeTaggedJpeg(): Promise<Buffer> {
  return sharp({
    create: { width: 16, height: 16, channels: 3, background: { r: 200, g: 100, b: 50 } },
  })
    .withExif({
      IFD0: { Copyright: SECRET_TEXT },
      IFD3: {
        GPSLatitudeRef: 'N',
        GPSLatitude: '50/1 6/1 0/1',
        GPSLongitudeRef: 'E',
        GPSLongitude: '8/1 40/1 0/1',
      },
    })
    .jpeg()
    .toBuffer();
}

function makePlain(format: 'png' | 'webp' | 'jpeg'): Promise<Buffer> {
  const img = sharp({
    create: { width: 8, height: 8, channels: 3, background: { r: 10, g: 20, b: 30 } },
  });
  if (format === 'png') return img.png().toBuffer();
  if (format === 'webp') return img.webp().toBuffer();
  return img.jpeg().toBuffer();
}

describe('stripImageMetadata entfernt, was den Absender verraet', () => {
  it('nimmt Urheber und GPS aus dem Bild', async () => {
    const tagged = await makeTaggedJpeg();

    // Erst der Nachweis, dass die Vorlage die Daten ueberhaupt traegt —
    // sonst wuerde der Test auch bei kaputtem Stripping gruen melden.
    expect(tagged.includes(SECRET_TEXT)).toBe(true);
    expect((await sharp(tagged).metadata()).exif).toBeDefined();

    const stripped = await stripImageMetadata(tagged, 'image/jpeg');

    expect(stripped.buffer.includes(SECRET_TEXT)).toBe(false);
    expect((await sharp(stripped.buffer).metadata()).exif).toBeUndefined();
  });

  it('gibt niemals das unveraenderte Original zurueck', async () => {
    // Der wichtigste Satz der ganzen Datei: ein "dann eben ungefiltert"
    // waere aus einem Ausfall ein Datenleck gemacht.
    const source = await makeTaggedJpeg();
    const stripped = await stripImageMetadata(source, 'image/jpeg');

    expect(stripped.buffer).not.toBe(source);
    expect(stripped.buffer.equals(source)).toBe(false);
  });
});

describe('stripImageMetadata haelt Format und Endung zusammen', () => {
  it('behaelt PNG als PNG', async () => {
    const result = await stripImageMetadata(await makePlain('png'), 'image/png');
    expect(result.mime).toBe('image/png');
    expect(result.extension).toBe('png');
    expect((await sharp(result.buffer).metadata()).format).toBe('png');
  });

  it('behaelt WebP als WebP', async () => {
    const result = await stripImageMetadata(await makePlain('webp'), 'image/webp');
    expect(result.mime).toBe('image/webp');
    expect(result.extension).toBe('webp');
    expect((await sharp(result.buffer).metadata()).format).toBe('webp');
  });

  it('behaelt JPEG als JPEG', async () => {
    const result = await stripImageMetadata(await makePlain('jpeg'), 'image/jpeg');
    expect(result.mime).toBe('image/jpeg');
    expect(result.extension).toBe('jpg');
    expect((await sharp(result.buffer).metadata()).format).toBe('jpeg');
  });

  it('macht aus HEIC ein JPEG — sonst zeigt es kein Browser an', async () => {
    const result = await stripImageMetadata(await makePlain('jpeg'), 'image/heic');
    expect(result.mime).toBe('image/jpeg');
    expect(result.extension).toBe('jpg');
    expect((await sharp(result.buffer).metadata()).format).toBe('jpeg');
  });
});

describe('stripImageMetadata unterscheidet kaputte Datei von kaputtem Server', () => {
  it('meldet eine unlesbare Datei als ImageUnprocessableError', async () => {
    // "Andere Datei versuchen" ist hier der richtige Rat. Bei einem
    // Umgebungsausfall waere er falsch — deshalb zwei Fehlertypen.
    const promise = stripImageMetadata(Buffer.from('das ist ganz sicher kein Bild'), 'image/jpeg');

    await expect(promise).rejects.toBeInstanceOf(ImageUnprocessableError);
    await expect(promise).rejects.not.toBeInstanceOf(ImagePipelineUnavailableError);
  });
});

describe('sharp wird nirgends beim Laden eines Moduls angefasst', () => {
  const files = walkTs(SRC_DIR);

  /**
   * Statischer Top-Level-Import von sharp, Typ-Importe ausgenommen (die sind
   * nach dem Kompilieren weg und koennen zur Laufzeit nichts werfen).
   */
  const STATIC_SHARP_IMPORT_RE = /^\s*import\s+(?!type\s)(?:[^;]*?from\s+)?['"]sharp['"]/m;

  it('findet mindestens eine Datei zum Pruefen', () => {
    expect(files.length).toBeGreaterThan(100);
  });

  it('importiert sharp nirgends statisch', () => {
    // Das ist der ganze Sprint als Test. Ein 'use server'-Modul wird als
    // Ganzes geladen: wirft der Import, sind ALLE Actions der Datei tot,
    // auch die, die mit Bildern nichts zu tun haben. Genau so konnte die
    // Verwaltung ein laengst hochgeladenes Dokument nicht mehr ansehen.
    const offenders = files
      .filter((f) => STATIC_SHARP_IMPORT_RE.test(readFileSync(f, 'utf8')))
      .map((f) => relative(process.cwd(), f));

    expect(offenders).toEqual([]);
  });

  it('spricht nur an einer Stelle mit sharp', () => {
    // Vor Sprint 126 lag dieselbe png/webp/jpeg-Verzweigung dreimal im Code.
    // Dreimal dieselbe Regel heisst: eine Korrektur wird zweimal vergessen.
    const allowed = ['src/lib/images/strip-metadata.ts', 'src/lib/images/probe.ts'];

    const users = files
      .filter((f) => /\bimport\s*\(\s*['"]sharp['"]\s*\)/.test(readFileSync(f, 'utf8')))
      .map((f) => relative(process.cwd(), f).replace(/\\/g, '/'))
      .sort();

    expect(users).toEqual([...allowed].sort());
  });
});
