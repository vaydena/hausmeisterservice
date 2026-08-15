import { describe, it, expect } from 'vitest';
import { sanitizeLikeTerm, sanitizeOrFilterTerm } from '@/lib/utils/search';

describe('sanitizeLikeTerm', () => {
  it('laesst normale Suchbegriffe unveraendert', () => {
    expect(sanitizeLikeTerm('Wasserhahn tropft')).toBe('Wasserhahn tropft');
  });

  it('behaelt Umlaute und Bindestriche', () => {
    expect(sanitizeLikeTerm('Müller-Straße')).toBe('Müller-Straße');
  });

  it('entfernt LIKE-Wildcards', () => {
    expect(sanitizeLikeTerm('50%')).toBe('50');
    expect(sanitizeLikeTerm('a_b')).toBe('a b');
  });

  it('laesst Komma und Klammern stehen — der Builder kodiert den Wert selbst', () => {
    expect(sanitizeLikeTerm('Meier (Firma), Halle 2')).toBe('Meier (Firma), Halle 2');
  });

  it('trimmt aussen, auch wenn erst das Ersetzen Leerzeichen erzeugt', () => {
    expect(sanitizeLikeTerm('  %Heizung%  ')).toBe('Heizung');
  });

  it('gibt Leerstring zurueck, wenn nur Sonderzeichen uebrig bleiben', () => {
    expect(sanitizeLikeTerm('%%__')).toBe('');
  });

  it('behandelt null und undefined wie leere Eingabe', () => {
    expect(sanitizeLikeTerm(null)).toBe('');
    expect(sanitizeLikeTerm(undefined)).toBe('');
  });
});

describe('sanitizeOrFilterTerm', () => {
  it('laesst normale Suchbegriffe unveraendert', () => {
    expect(sanitizeOrFilterTerm('Heizung kalt')).toBe('Heizung kalt');
  });

  it('entfernt LIKE-Wildcards wie die Builder-Variante', () => {
    expect(sanitizeOrFilterTerm('50%')).toBe('50');
    expect(sanitizeOrFilterTerm('a_b')).toBe('a b');
  });

  it('entfernt zusaetzlich die .or()-Trennzeichen', () => {
    expect(sanitizeOrFilterTerm('Meier (Firma), Halle 2')).toBe('Meier  Firma   Halle 2');
  });

  it('neutralisiert einen angehaengten OR-Zweig', () => {
    // Ohne Filterung wuerde daraus ein zweiter, immer wahrer OR-Zweig im
    // Filterausdruck — die Liste zeigte dann mehr als gefiltert wurde.
    const injected = 'x,tenant_id.not.is.null';
    const safe = sanitizeOrFilterTerm(injected);
    expect(safe).not.toContain(',');
    expect(`title.ilike.%${safe}%`.split(',')).toHaveLength(1);
  });

  it('laesst keine Klammer stehen, die den Ausdruck gruppieren koennte', () => {
    const safe = sanitizeOrFilterTerm('a)or(b');
    expect(safe).not.toContain('(');
    expect(safe).not.toContain(')');
  });

  it('gibt Leerstring zurueck, wenn nur Sonderzeichen uebrig bleiben', () => {
    expect(sanitizeOrFilterTerm('(),%_')).toBe('');
  });

  it('behandelt null und undefined wie leere Eingabe', () => {
    expect(sanitizeOrFilterTerm(null)).toBe('');
    expect(sanitizeOrFilterTerm(undefined)).toBe('');
  });
});
