import { describe, it, expect } from 'vitest';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { PLATFORM_NAV_ITEMS } from '../src/components/platform/platform-nav';

const PLATFORM_DIR = join(process.cwd(), 'src', 'app', 'platform');

/**
 * Sprint 137 · Der Betreiber-Bereich hatte sieben Menuepunkte und drei
 * Seiten. /platform/invoices, /platform/plans, /platform/admins und
 * /platform/settings fuehrten seit Sprint 10 ins 404 — jeder zweite Klick.
 *
 * Warum das gerade hier so lange unbemerkt blieb: diesen Bereich sieht
 * ausser dem Plattform-Betreiber niemand. Es gibt keinen Kunden, der es
 * melden koennte, und keinen Test, der ihn je aufgerufen haette. Der
 * Sprint-133-Test deckt genau diese Luecke nicht ab: er prueft die
 * Modul-Navigation der Mandanten-Anwendung, und /platform ist kein Modul.
 *
 * Beide Richtungen, wie in Sprint 133:
 *   1. Jeder Menuepunkt braucht eine Seite  (kein Klick ins Leere)
 *   2. Jede Seite braucht einen Menuepunkt  (nichts Gebautes bleibt
 *      unerreichbar — /platform/invoices war vor diesem Sprint das
 *      umgekehrte Problem in Wartestellung)
 */
function pageFileForHref(href: string): string {
  const segments = href.split('/').filter(Boolean).slice(1); // "platform" abschneiden
  return join(PLATFORM_DIR, ...segments, 'page.tsx');
}

describe('Plattform-Navigation: Menuepunkte und Seiten decken sich', () => {
  it('kennt ueberhaupt Menuepunkte', () => {
    expect(PLATFORM_NAV_ITEMS.length).toBeGreaterThan(0);
  });

  it.each(PLATFORM_NAV_ITEMS.map((item) => [item.href, item.label] as const))(
    'Menuepunkt "%s" (%s) hat eine gebaute Seite',
    (href) => {
      expect(href.startsWith('/platform')).toBe(true);
      const pageFile = pageFileForHref(href);
      expect(
        existsSync(pageFile),
        `Der Sidebar-Eintrag "${href}" zeigt auf ${pageFile}, aber diese Datei gibt es nicht. ` +
          'Entweder die Seite bauen oder den Menuepunkt entfernen — ein Menuepunkt ins 404 ist ' +
          'fuer den Betreiber nicht von einer Stoerung zu unterscheiden.',
      ).toBe(true);
    },
  );

  it('jede gebaute Top-Level-Seite unter /platform steht auch im Menue', () => {
    const navHrefs = new Set(PLATFORM_NAV_ITEMS.map((i) => i.href));

    const builtHrefs: string[] = [];
    if (existsSync(join(PLATFORM_DIR, 'page.tsx'))) builtHrefs.push('/platform');
    for (const entry of readdirSync(PLATFORM_DIR, { withFileTypes: true })) {
      // Dynamische Segmente sind Detailseiten, die aus einer Liste heraus
      // erreicht werden — die gehoeren nicht ins Hauptmenue.
      if (!entry.isDirectory() || entry.name.startsWith('[')) continue;
      if (existsSync(join(PLATFORM_DIR, entry.name, 'page.tsx'))) {
        builtHrefs.push(`/platform/${entry.name}`);
      }
    }

    const unreachable = builtHrefs.filter((href) => !navHrefs.has(href));
    expect(
      unreachable,
      `Diese Seiten existieren, stehen aber in keinem Menuepunkt: ${unreachable.join(', ')}. ` +
        'Gebaut und unerreichbar ist genauso teuer wie verlinkt und ungebaut.',
    ).toEqual([]);
  });
});
