import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

/**
 * SPRINT 132 — DIE PRUEFUNG ZUR AUSNAHME.
 *
 * `eslint.config.mjs` schaltet `react-hooks/purity` fuer `src/app/**\/page.tsx`
 * und `layout.tsx` ab. Die Begruendung ist keine Geschmacksfrage, sondern eine
 * Tatsachenbehauptung: diese Dateien sind Server-Komponenten, laufen einmal
 * pro Request, und ein `Date.now()` darin ist genau richtig.
 *
 * Eine Ausnahme, die auf einer Tatsache beruht, braucht eine Pruefung dieser
 * Tatsache — sonst ist sie ab dem Tag, an dem sich die Tatsache aendert, eine
 * lautlos abgeschaltete Regel. Genau der Fehlertyp, den Sprint 131 und 132
 * aufgeraeumt haben.
 *
 * Wird eine Seite doch einmal zur Client-Komponente, faellt dieser Test und
 * zwingt zur Entscheidung: entweder die Logik in eine eigene Komponente
 * ziehen, oder die Ausnahme in eslint.config.mjs enger fassen.
 */
const APP_DIR = join(process.cwd(), 'src', 'app');

function collect(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      collect(full, out);
    } else if (entry === 'page.tsx' || entry === 'layout.tsx') {
      out.push(full);
    }
  }
  return out;
}

describe('Seiten und Layouts sind Server-Komponenten', () => {
  const files = collect(APP_DIR);

  it('sanity: es wurden ueberhaupt Seiten gefunden', () => {
    // Ohne diese Zeile wuerde ein kaputter Sammler die Pruefung darunter
    // stillschweigend bestehen lassen.
    expect(files.length).toBeGreaterThan(50);
  });

  it('keine page.tsx oder layout.tsx traegt "use client"', () => {
    const clientSide = files
      .filter((f) => /^\s*['"]use client['"]/m.test(readFileSync(f, 'utf8')))
      .map((f) => relative(process.cwd(), f));

    expect(
      clientSide,
      `Diese Seiten/Layouts sind Client-Komponenten geworden: ${clientSide.join(', ')}\n` +
        'Damit stimmt die Begruendung nicht mehr, mit der eslint.config.mjs ' +
        '"react-hooks/purity" fuer page.tsx/layout.tsx abschaltet — in einer ' +
        'Client-Komponente ist ein Date.now() im Render sehr wohl ein Fund. ' +
        'Entweder die Datei wieder zur Server-Komponente machen (Interaktives ' +
        'in eine eigene Client-Komponente ziehen) oder die Ausnahme in ' +
        'eslint.config.mjs enger fassen.',
    ).toEqual([]);
  });
});
