import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { probeImagePipeline, sanitizeCode, sharpPackageNames } from '@/lib/images/probe';

describe('sanitizeCode', () => {
  it('reicht einen echten Node-Fehlercode durch', () => {
    expect(sanitizeCode({ code: 'ERR_DLOPEN_FAILED' })).toBe('ERR_DLOPEN_FAILED');
    expect(sanitizeCode({ code: 'MODULE_NOT_FOUND' })).toBe('MODULE_NOT_FOUND');
  });

  it('verschweigt einen Serverpfad, der als code getarnt kommt', () => {
    // Die Antwort ist unauthentifiziert. Alles, was nicht wie eine Konstante
    // aussieht, verlaesst den Server nicht.
    expect(sanitizeCode({ code: '/home/deploy/app/node_modules/sharp/build' })).toBe('UNKNOWN');
    expect(sanitizeCode({ code: 'Could not load the sharp module' })).toBe('UNKNOWN');
  });

  it('behandelt Fehler ohne code als unbekannt', () => {
    expect(sanitizeCode(new Error('kaputt'))).toBe('UNKNOWN');
    expect(sanitizeCode(null)).toBe('UNKNOWN');
    expect(sanitizeCode(undefined)).toBe('UNKNOWN');
    expect(sanitizeCode({ code: 42 })).toBe('UNKNOWN');
  });

  it('begrenzt die Laenge, damit kein Freitext durchrutscht', () => {
    expect(sanitizeCode({ code: 'A'.repeat(200) })).toBe('UNKNOWN');
  });
});

describe('sharpPackageNames', () => {
  // Der erste Live-Lauf meldete `stage: 'load'` mit `code: 'UNKNOWN'` — eine
  // Auskunft, mit der niemand etwas tun kann. Diese Namen sind die Antwort
  // auf "und was soll ich jetzt installieren?".
  it('nennt fuer Linux mit glibc die glibc-Pakete', () => {
    expect(sharpPackageNames('linux', 'x64', 'glibc')).toEqual({
      binary: '@img/sharp-linux-x64',
      libvips: '@img/sharp-libvips-linux-x64',
    });
  });

  it('nennt fuer Alpine die musl-Pakete', () => {
    // Der haeufigste Grund fuer ein sharp, das lokal laeuft und im Container
    // nicht: dieselbe Architektur, andere libc.
    expect(sharpPackageNames('linux', 'x64', 'musl')).toEqual({
      binary: '@img/sharp-linuxmusl-x64',
      libvips: '@img/sharp-libvips-linuxmusl-x64',
    });
  });

  it('unterscheidet die Architektur', () => {
    expect(sharpPackageNames('linux', 'arm64', 'glibc').binary).toBe('@img/sharp-linux-arm64');
    expect(sharpPackageNames('darwin', 'arm64').binary).toBe('@img/sharp-darwin-arm64');
    expect(sharpPackageNames('win32', 'x64').binary).toBe('@img/sharp-win32-x64');
  });

  it('verwirft alles, was nicht wie ein Paketname aussieht', () => {
    // Die Antwort ist unauthentifiziert — dieselbe Schranke wie bei `code`.
    expect(sharpPackageNames('../../etc', 'x64')).toEqual({
      binary: 'UNKNOWN',
      libvips: 'UNKNOWN',
    });
  });

  it('beschreibt die Maschine, auf der dieser Test laeuft', () => {
    // Ohne Argumente muss die Funktion die echte Umgebung treffen — sonst
    // haette der Betreiber im Ernstfall einen Namen, der nirgends existiert.
    const { binary } = sharpPackageNames();
    expect(binary).toContain(process.arch);
    expect(binary).not.toBe('UNKNOWN');
  });
});

describe('probeImagePipeline', () => {
  // Dieser Test misst absichtlich die AUSFUEHRENDE Maschine, nicht eine
  // Attrappe. Genau das ist der Punkt: Sprint 124 ist daran gescheitert,
  // dass sharp lokal lief und auf dem Server nicht. Ein Mock haette beide
  // Male gruen gemeldet. So schlaegt CI an, bevor deployt wird.
  it('meldet eine arbeitsfaehige Bildverarbeitung', async () => {
    const result = await probeImagePipeline();
    expect(result).toEqual({ ok: true, stage: null, code: null });
  });
});

describe('Deep-Health-Endpunkt gibt keinen Freitext preis', () => {
  const source = readFileSync(
    join(process.cwd(), 'src', 'app', 'api', 'health', 'deep', 'route.ts'),
    'utf8',
  );

  it('serialisiert keine Fehlermeldung in die Antwort', () => {
    // `.message` waere der bequeme Weg und traegt Serverpfade nach draussen.
    expect(source).not.toMatch(/\.message/);
  });

  it('antwortet bei kaputter Probe mit 503, nicht mit 200', () => {
    // Ohne den abweichenden Status muesste ein Monitor JSON parsen, um den
    // Ausfall zu bemerken — und genau das tut in der Praxis keiner.
    expect(source).toContain('503');
  });
});
