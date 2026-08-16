import { describe, expect, it } from 'vitest';
import { normalizeRoutePath, pathHasPrefix } from '@/lib/routing/path-prefix';

/**
 * Sprint 117: Zwei Routen-Gates haengen an diesen zehn Zeilen — das
 * Tarif-Gate (feature-map) und das Modul-Gate (module-map). Wenn hier ein
 * Randfall falsch liegt, liegt er in beiden falsch, und zwar in dieselbe
 * Richtung: eine Route faellt durch, die gesperrt sein sollte.
 */

describe('normalizeRoutePath', () => {
  it('laesst einen gewoehnlichen Pfad unveraendert', () => {
    expect(normalizeRoutePath('/vehicles')).toBe('/vehicles');
    expect(normalizeRoutePath('/people/employees/abc/edit')).toBe('/people/employees/abc/edit');
  });

  it('schneidet Query und Fragment ab', () => {
    expect(normalizeRoutePath('/meters?status=open')).toBe('/meters');
    expect(normalizeRoutePath('/meters#top')).toBe('/meters');
    expect(normalizeRoutePath('/meters?a=1#top')).toBe('/meters');
  });

  it('schneidet den abschliessenden Slash ab — aber nicht den Wurzelpfad', () => {
    expect(normalizeRoutePath('/keys/')).toBe('/keys');
    expect(normalizeRoutePath('/')).toBe('/');
  });

  it('vertraegt Leerraum und den leeren String', () => {
    expect(normalizeRoutePath('  /keys  ')).toBe('/keys');
    expect(normalizeRoutePath('')).toBe('');
  });
});

describe('pathHasPrefix', () => {
  it('trifft den Pfad selbst und alles darunter', () => {
    expect(pathHasPrefix('/vehicles', '/vehicles')).toBe(true);
    expect(pathHasPrefix('/vehicles/neu', '/vehicles')).toBe(true);
    expect(pathHasPrefix('/vehicles/abc/edit', '/vehicles')).toBe(true);
  });

  it('haelt an der Segmentgrenze', () => {
    // Der eigentliche Grund fuer diese Datei: ein blankes startsWith wuerde
    // hier true liefern und eine fremde Route mitsperren.
    expect(pathHasPrefix('/vehicles-export', '/vehicles')).toBe(false);
    expect(pathHasPrefix('/vehiclesomething', '/vehicles')).toBe(false);
    expect(pathHasPrefix('/tourshop', '/tours')).toBe(false);
  });

  it('trifft nicht nach oben', () => {
    expect(pathHasPrefix('/settings', '/settings/automations')).toBe(false);
  });
});
