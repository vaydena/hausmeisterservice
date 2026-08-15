import { describe, it, expect, afterEach } from 'vitest';
import {
  getBuildInfo,
  normalizeBuildInfo,
  UNKNOWN_BUILD_VALUE,
} from '@/lib/build-info';

describe('normalizeBuildInfo', () => {
  it('reicht einen Kurz-SHA unveraendert durch', () => {
    expect(normalizeBuildInfo({ sha: '735dddb' }).sha).toBe('735dddb');
  });

  it('kuerzt einen vollen SHA auf die Kurzform', () => {
    const full = '735dddb0c0ffee1234567890abcdef1234567890';
    expect(normalizeBuildInfo({ sha: full }).sha).toBe('735dddb0c0ff');
  });

  it('trimmt den Zeilenumbruch, den `git rev-parse` anhaengt', () => {
    expect(normalizeBuildInfo({ sha: '735dddb0c0ffee12\n' }).sha).toBe('735dddb0c0ff');
  });

  it('laesst ein Versions-Tag statt eines Hashes stehen', () => {
    // Kein Hex-Zwang: ein Deploy darf hier auch ein Release-Tag setzen.
    expect(normalizeBuildInfo({ sha: 'v1.4.0' }).sha).toBe('v1.4.0');
  });

  it('begrenzt auch einen ueberlangen Muellwert auf die Kurzform-Laenge', () => {
    // Der Wert landet in einer unauthentifizierten Antwort — die Kuerzung
    // ist die Schranke, nicht eine Format-Pruefung.
    const noise = 'x'.repeat(5000);
    expect(normalizeBuildInfo({ sha: noise }).sha).toHaveLength(12);
  });

  it('normalisiert den Zeitstempel auf ISO-8601 mit Millisekunden', () => {
    expect(normalizeBuildInfo({ time: '2026-08-15T14:47:03Z' }).time).toBe(
      '2026-08-15T14:47:03.000Z',
    );
  });

  it('reicht einen bereits kanonischen Zeitstempel unveraendert durch', () => {
    const iso = '2026-08-15T14:47:03.148Z';
    expect(normalizeBuildInfo({ time: iso }).time).toBe(iso);
  });

  it('faellt bei unlesbarem Zeitstempel auf den Ersatzwert zurueck', () => {
    expect(normalizeBuildInfo({ time: 'gestern' }).time).toBe(UNKNOWN_BUILD_VALUE);
  });

  it('faellt bei leeren Strings auf den Ersatzwert zurueck', () => {
    expect(normalizeBuildInfo({ sha: '   ', time: '' })).toEqual({
      sha: UNKNOWN_BUILD_VALUE,
      time: UNKNOWN_BUILD_VALUE,
    });
  });

  it('behandelt null und fehlende Felder wie leere Eingabe', () => {
    expect(normalizeBuildInfo({ sha: null, time: null })).toEqual({
      sha: UNKNOWN_BUILD_VALUE,
      time: UNKNOWN_BUILD_VALUE,
    });
    expect(normalizeBuildInfo({})).toEqual({
      sha: UNKNOWN_BUILD_VALUE,
      time: UNKNOWN_BUILD_VALUE,
    });
  });
});

describe('getBuildInfo', () => {
  const ORIGINAL_SHA = process.env.APP_BUILD_SHA;
  const ORIGINAL_TIME = process.env.APP_BUILD_TIME;

  function restore(key: 'APP_BUILD_SHA' | 'APP_BUILD_TIME', value: string | undefined) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }

  afterEach(() => {
    restore('APP_BUILD_SHA', ORIGINAL_SHA);
    restore('APP_BUILD_TIME', ORIGINAL_TIME);
  });

  it('liest die zur Build-Zeit gesetzten Variablen', () => {
    process.env.APP_BUILD_SHA = '735dddb0c0ffee1234';
    process.env.APP_BUILD_TIME = '2026-08-15T14:47:03Z';
    expect(getBuildInfo()).toEqual({
      sha: '735dddb0c0ff',
      time: '2026-08-15T14:47:03.000Z',
    });
  });

  it('liefert den Ersatzwert, wenn die Variablen fehlen', () => {
    // So sieht der Marker aus, wenn next.config.mjs nichts ermitteln konnte
    // — die Antwort bleibt wohlgeformt, nur eben ohne Aussage.
    delete process.env.APP_BUILD_SHA;
    delete process.env.APP_BUILD_TIME;
    expect(getBuildInfo()).toEqual({
      sha: UNKNOWN_BUILD_VALUE,
      time: UNKNOWN_BUILD_VALUE,
    });
  });
});
